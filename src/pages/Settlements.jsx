import { useEffect, useState } from 'react';
import { settlementService, policyProviderService } from '../services/api';
import { toast } from '../components/Toast';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import { IconPlus, IconTrash, IconRefresh, IconCheck, IconX, IconArrowLeft, IconUpload, IconSparkles } from '../components/icons/Icons';
import './Settlements.scss';

const HEADER_FIELDS = [
  { key: 'tpa_insurer', label: 'TPA / Insurer', type: 'text' },
  { key: 'total_settlement_amount', label: 'Total Settlement Amount', type: 'number' },
  { key: 'payment_mode', label: 'Payment Mode', type: 'text' },
  { key: 'payment_batch', label: 'Payment Batch', type: 'text' },
  { key: 'utr_number', label: 'UTR Number', type: 'text' },
  { key: 'settlement_number', label: 'Settlement Number', type: 'text' },
  { key: 'settlement_date', label: 'Settlement Date', type: 'date' },
  { key: 'hospital_account_number', label: 'Hospital Account Number', type: 'text' },
];

const EMPTY_ITEM = {
  claim_number: '', settled_amount: '', claim_raised_amount: '',
  disallowance: '', disallowance_reason: '',
};

function emptyHeader() {
  return HEADER_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: '' }), { policy_provider_id: '' });
}

export default function Settlements() {
  const [view, setView] = useState('list'); // 'list' | 'edit' | 'detail'
  const [batches, setBatches] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  const [file, setFile] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [header, setHeader] = useState(emptyHeader());
  const [items, setItems] = useState([]);
  const [fileRef, setFileRef] = useState(null); // server-stored file from extract
  const [editingId, setEditingId] = useState(null); // set when editing an existing batch

  // Detail view + in-app file viewer
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [fileView, setFileView] = useState(null); // { url, name, isPdf }
  const [rechecking, setRechecking] = useState(false);

  const [providers, setProviders] = useState([]);
  useEffect(() => {
    policyProviderService.getForHospital()
      .then((res) => setProviders(Array.isArray(res.data) ? res.data : []))
      .catch(() => setProviders([]));
  }, []);

  const loadList = async () => {
    setLoadingList(true);
    try {
      setBatches(await settlementService.list());
    } catch {
      // global toast handles it
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => { loadList(); }, []);

  const startNew = () => {
    setFile(null);
    setFileRef(null);
    setHeader(emptyHeader());
    setItems([]);
    setExtracted(false);
    setEditingId(null);
    setView('edit');
  };

  const startEdit = () => {
    if (!detail) return;
    setFile(null);
    setFileRef(null);           // editing keeps the existing file server-side
    setHeader({ ...emptyHeader(), ...cleanHeader(detail.header) });
    setItems((detail.items || []).map((it) => ({ ...EMPTY_ITEM, ...cleanItem(it) })));
    setExtracted(true);          // skip the upload step when editing
    setEditingId(detail.id);
    setView('edit');
  };

  const openDetail = async (id) => {
    setView('detail');
    setDetail(null);
    setLoadingDetail(true);
    try {
      setDetail(await settlementService.get(id));
    } catch {
      toast.error('Could not load settlement');
      setView('list');
    } finally {
      setLoadingDetail(false);
    }
  };

  const openFile = async (batch) => {
    if (!batch.source_original_filename) { toast.error('No file stored for this settlement'); return; }
    try {
      const res = await settlementService.viewFile(batch.id);
      const url = URL.createObjectURL(res.data);
      const name = batch.source_original_filename || 'settlement';
      setFileView({ url, name, isPdf: /\.pdf$/i.test(name) || res.data.type === 'application/pdf' });
    } catch {
      toast.error('Could not open file');
    }
  };

  const closeFile = () => {
    if (fileView?.url) URL.revokeObjectURL(fileView.url);
    setFileView(null);
  };

  const onExtract = async () => {
    if (!file) { toast.error('Choose a settlement file first'); return; }
    setExtracting(true);
    try {
      const res = await settlementService.extract(file);
      setHeader({ ...emptyHeader(), ...cleanHeader(res.header) });
      setItems((res.items || []).map((it) => ({ ...EMPTY_ITEM, ...cleanItem(it), is_matched: !!it.is_matched })));
      setFileRef(res.source || null);
      setExtracted(true);
      toast.success(`Extracted — ${res.matched_count} of ${res.items?.length || 0} claims matched`);
    } catch {
      toast.error('Could not extract; you can fill in the details manually');
    } finally {
      setExtracting(false);
    }
  };

  const onSave = async () => {
    if (!header.policy_provider_id) { toast.error('Select a provider first'); return; }
    if (items.length === 0) { toast.error('Add at least one claim row'); return; }
    setSaving(true);
    try {
      const payload = {
        header: serializeHeader(header),
        items: items.map(serializeItem),
      };
      const saved = editingId
        ? await settlementService.update(editingId, payload)
        : await settlementService.save({ ...payload, source: fileRef });
      toast.success(`Saved — ${saved.matched_count} matched, ${saved.unmatched_count} unmatched`);
      setEditingId(null);
      setView('list');
      loadList();
    } catch {
      toast.error('Could not save the settlement');
    } finally {
      setSaving(false);
    }
  };

  const updateItem = (i, key, value) => {
    setItems((prev) => prev.map((it, idx) => {
      if (idx !== i) return it;
      // Editing the claim number invalidates its match until re-checked.
      return key === 'claim_number' ? { ...it, [key]: value, is_matched: false } : { ...it, [key]: value };
    }));
  };
  const addItem = () => setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  const removeItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  // Re-check all claim numbers against existing cases (called on blur of a
  // claim-number cell). One request; updates every row's badge + the summary.
  const recheckMatches = async () => {
    const numbers = items.map((it) => (it.claim_number || '').trim()).filter(Boolean);
    if (numbers.length === 0) return;
    setRechecking(true);
    try {
      const results = await settlementService.matchClaims(numbers);
      const matched = new Set(results.filter((r) => r.is_matched).map((r) => r.claim_number));
      setItems((prev) => prev.map((it) => ({
        ...it,
        is_matched: !!(it.claim_number || '').trim() && matched.has((it.claim_number || '').trim()),
      })));
    } catch {
      // silent — non-critical; save will re-resolve authoritatively
    } finally {
      setRechecking(false);
    }
  };

  const matchedCount = items.filter((it) => it.is_matched).length;
  const claimRows = items.filter((it) => (it.claim_number || '').trim()).length;

  if (view === 'edit') {
    return (
      <div className="settlements">
        {extracting && (
          <div className="settlements__overlay" role="alertdialog" aria-busy="true" aria-label="Extracting">
            <div className="settlements__overlay-box">
              <Spinner size={40} />
              <p className="settlements__overlay-title">Reading your settlement document…</p>
              <p className="settlements__overlay-hint">The AI is extracting the details. This can take a few seconds.</p>
            </div>
          </div>
        )}
        <div className="settlements__header">
          <div>
            <h1>{editingId ? 'Edit Settlement' : 'New Settlement'}</h1>
            <p>{editingId
              ? 'Update the settlement details and claims.'
              : 'Upload a settlement document, then review the extracted details.'}</p>
          </div>
          <button className="settlements__btn-ghost" onClick={() => { setEditingId(null); setView('list'); }}>Cancel</button>
        </div>

        {!editingId && !extracted && (
        <div className="settlements__card settlements__upload-card">
          <label className={`settlements__dropzone ${file ? 'has-file' : ''}`}>
            <input
              type="file"
              accept=".pdf,.xlsx,.xls,.csv,application/pdf,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <span className="settlements__dropzone-icon"><IconUpload size={26} /></span>
            <span className="settlements__dropzone-title">
              {file ? file.name : 'Click to upload a settlement document'}
            </span>
            <span className="settlements__dropzone-hint">
              {file ? 'Click to choose a different file' : 'PDF, Excel or CSV — the AI will read it for you'}
            </span>
          </label>
          <button className="settlements__btn settlements__extract-btn" onClick={onExtract} disabled={!file || extracting}>
            <IconSparkles size={16} />
            {extracting ? 'Extracting…' : 'Extract with AI'}
          </button>
        </div>
        )}

        {extracted && (
        <>
        <div className="settlements__card">
          <h2>Settlement Details</h2>
          <div className="settlements__grid">
            <div className="settlements__field">
              <label>Provider {header.policy_provider_id ? <span title="AI-suggested" style={{ color: '#4f46e5' }}>· suggested</span> : null}</label>
              <select
                value={header.policy_provider_id ?? ''}
                onChange={(e) => {
                  const pid = e.target.value || null;
                  const prov = providers.find((p) => p.id === pid);
                  setHeader((h) => ({ ...h, policy_provider_id: pid, tpa_insurer: prov ? prov.name : h.tpa_insurer }));
                }}
              >
                <option value="">— Select provider —</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            {HEADER_FIELDS.map((f) => (
              <div key={f.key} className="settlements__field">
                <label>{f.label}</label>
                <input
                  type={f.type}
                  value={header[f.key] ?? ''}
                  readOnly={f.key === 'tpa_insurer'}
                  onChange={(e) => setHeader((h) => ({ ...h, [f.key]: e.target.value }))}
                  style={f.key === 'tpa_insurer' ? { background: '#f3f4f6', cursor: 'default' } : undefined}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="settlements__card">
          <div className="settlements__card-head">
            <h2>Claims ({items.length})</h2>
            <button className="settlements__btn-ghost" onClick={addItem}><IconPlus size={14} /> Add row</button>
          </div>

          {claimRows > 0 && (
            <div className={`settlements__match-summary ${matchedCount === claimRows ? 'is-ok' : 'is-warn'}`}>
              {matchedCount === claimRows ? <IconCheck size={16} /> : <IconX size={16} />}
              <span>
                <strong>{matchedCount} of {claimRows}</strong> claim{claimRows === 1 ? '' : 's'} matched to existing cases
                {matchedCount < claimRows && ` · ${claimRows - matchedCount} need a valid claim number`}
              </span>
              {rechecking && <span className="settlements__rechecking">checking…</span>}
            </div>
          )}

          <div className="settlements__table-wrap">
            <table className="settlements__table">
              <thead>
                <tr>
                  <th>Claim Number</th>
                  <th>Match</th>
                  <th>Settled</th>
                  <th>Claim Raised</th>
                  <th>Disallowance</th>
                  <th>Disallowance Reason</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr><td colSpan={7} className="settlements__empty">No claim rows yet — extract a file or add a row.</td></tr>
                )}
                {items.map((it, i) => {
                  const hasCn = !!(it.claim_number || '').trim();
                  return (
                  <tr key={i} className={hasCn && !it.is_matched ? 'settlements__row--unmatched' : ''}>
                    <td><input value={it.claim_number ?? ''} onChange={(e) => updateItem(i, 'claim_number', e.target.value)} onBlur={recheckMatches} /></td>
                    <td>
                      {hasCn ? (
                        <span className={`settlements__badge ${it.is_matched ? 'is-ok' : 'is-warn'}`}>
                          {it.is_matched ? <IconCheck size={12} /> : <IconX size={12} />}
                          {it.is_matched ? 'Matched' : 'Unmatched'}
                        </span>
                      ) : <span className="settlements__muted">—</span>}
                    </td>
                    <td><input type="number" value={it.settled_amount ?? ''} onChange={(e) => updateItem(i, 'settled_amount', e.target.value)} /></td>
                    <td><input type="number" value={it.claim_raised_amount ?? ''} onChange={(e) => updateItem(i, 'claim_raised_amount', e.target.value)} /></td>
                    <td><input type="number" value={it.disallowance ?? ''} onChange={(e) => updateItem(i, 'disallowance', e.target.value)} /></td>
                    <td><input value={it.disallowance_reason ?? ''} onChange={(e) => updateItem(i, 'disallowance_reason', e.target.value)} /></td>
                    <td><button className="settlements__icon-btn" onClick={() => removeItem(i)} aria-label="Remove"><IconTrash size={15} /></button></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="settlements__actions">
          <button className="settlements__btn-ghost" onClick={() => setView('list')}>Cancel</button>
          <button className="settlements__btn" onClick={onSave} disabled={saving || items.length === 0 || !header.policy_provider_id}>
            {saving ? 'Saving…' : 'Save Settlement'}
          </button>
        </div>
        </>
        )}
      </div>
    );
  }

  if (view === 'detail') {
    const h = detail?.header || {};
    return (
      <div className="settlements">
        <div className="settlements__header">
          <div className="settlements__title-row">
            <button className="settlements__btn-ghost" onClick={() => setView('list')}><IconArrowLeft size={16} /> Back</button>
            <div>
              <h1>Settlement Detail</h1>
              <p>{h.tpa_insurer || '—'} · {h.settlement_number || '—'}</p>
            </div>
          </div>
          <div className="settlements__head-actions">
            {detail?.source_original_filename && (
              <button className="settlements__btn-ghost" onClick={() => openFile({ id: detail.id, source_original_filename: detail.source_original_filename })}>
                View File
              </button>
            )}
            {detail && (
              <button className="settlements__btn" onClick={startEdit}>Edit</button>
            )}
          </div>
        </div>

        {loadingDetail && <div className="settlements__card"><div className="settlements__empty">Loading…</div></div>}

        {!loadingDetail && detail && (
          <>
            <div className="settlements__card">
              <h2>Settlement Details</h2>
              <div className="settlements__grid">
                {HEADER_FIELDS.map((f) => (
                  <div key={f.key} className="settlements__field">
                    <label>{f.label}</label>
                    <div className="settlements__readonly">
                      {f.key === 'total_settlement_amount' && h[f.key] != null
                        ? `₹${Number(h[f.key]).toLocaleString('en-IN')}`
                        : (h[f.key] ?? '—') || '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="settlements__card">
              <div className="settlements__card-head">
                <h2>Claims ({detail.items.length})</h2>
                <span className={`settlements__badge ${detail.unmatched_count === 0 ? 'is-ok' : 'is-warn'}`}>
                  {detail.matched_count}/{detail.items.length} matched
                </span>
              </div>
              <div className="settlements__table-wrap">
                <table className="settlements__table">
                  <thead>
                    <tr>
                      <th>Claim Number</th>
                      <th>Settled</th>
                      <th>Claim Raised</th>
                      <th>Disallowance</th>
                      <th>Disallowance Reason</th>
                      <th>Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.length === 0 && (
                      <tr><td colSpan={6} className="settlements__empty">No claims in this settlement.</td></tr>
                    )}
                    {detail.items.map((it) => (
                      <tr key={it.id}>
                        <td>{it.claim_number || '—'}</td>
                        <td>{fmtAmt(it.settled_amount)}</td>
                        <td>{fmtAmt(it.claim_raised_amount)}</td>
                        <td>{fmtAmt(it.disallowance)}</td>
                        <td>{it.disallowance_reason || '—'}</td>
                        <td>
                          <span className={`settlements__badge ${it.is_matched ? 'is-ok' : 'is-warn'}`}>
                            {it.is_matched ? <IconCheck size={12} /> : <IconX size={12} />}
                            {it.is_matched ? 'Matched' : 'Unmatched'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {fileView && (
          <Modal title={fileView.name} onClose={closeFile} size="lg">
            {fileView.isPdf
              ? <iframe className="settlements__file-frame" src={fileView.url} title="Settlement file" />
              : (
                <div className="settlements__file-fallback">
                  <p>This file type can’t be previewed here.</p>
                  <a className="settlements__btn" href={fileView.url} download={fileView.name}>Download {fileView.name}</a>
                </div>
              )}
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div className="settlements">
      <div className="settlements__header">
        <div>
          <h1>Settlements</h1>
          <p>Upload insurer remittance advices and reconcile them against your claims.</p>
        </div>
        <div className="settlements__head-actions">
          <button className="settlements__btn-ghost" onClick={loadList} title="Refresh"><IconRefresh size={16} /></button>
          <button className="settlements__btn" onClick={startNew}><IconPlus size={15} /> New Settlement</button>
        </div>
      </div>

      <div className="settlements__card">
        <div className="settlements__table-wrap">
          <table className="settlements__table">
            <thead>
              <tr>
                <th>TPA / Insurer</th>
                <th>Settlement #</th>
                <th>Date</th>
                <th>Total</th>
                <th>Claims</th>
                <th>Matched</th>
                <th>File</th>
              </tr>
            </thead>
            <tbody>
              {loadingList && <tr><td colSpan={7} className="settlements__empty">Loading…</td></tr>}
              {!loadingList && batches.length === 0 && (
                <tr><td colSpan={7} className="settlements__empty">No settlements yet. Click “New Settlement” to add one.</td></tr>
              )}
              {batches.map((b) => (
                <tr key={b.id} className="settlements__row" onClick={() => openDetail(b.id)}>
                  <td>{b.tpa_insurer || '—'}</td>
                  <td>{b.settlement_number || '—'}</td>
                  <td>{b.settlement_date || '—'}</td>
                  <td>{b.total_settlement_amount != null ? `₹${Number(b.total_settlement_amount).toLocaleString('en-IN')}` : '—'}</td>
                  <td>{b.item_count}</td>
                  <td>
                    <span className={`settlements__badge ${b.matched_count === b.item_count ? 'is-ok' : 'is-warn'}`}>
                      {b.matched_count === b.item_count ? <IconCheck size={12} /> : <IconX size={12} />}
                      {b.matched_count}/{b.item_count}
                    </span>
                  </td>
                  <td>
                    {b.source_original_filename
                      ? <button className="settlements__link-btn" onClick={(e) => { e.stopPropagation(); openFile(b); }}>View</button>
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {fileView && (
        <Modal title={fileView.name} onClose={closeFile} size="lg">
          {fileView.isPdf
            ? <iframe className="settlements__file-frame" src={fileView.url} title="Settlement file" />
            : (
              <div className="settlements__file-fallback">
                <p>This file type can’t be previewed here.</p>
                <a className="settlements__btn" href={fileView.url} download={fileView.name}>Download {fileView.name}</a>
              </div>
            )}
        </Modal>
      )}
    </div>
  );
}

const fmtAmt = (v) => (v == null ? '—' : `₹${Number(v).toLocaleString('en-IN')}`);

// --- helpers: blank out nulls for inputs / strip blanks on save ---
function cleanHeader(h = {}) {
  const out = {};
  Object.entries(h).forEach(([k, v]) => { out[k] = v == null ? '' : v; });
  return out;
}
function cleanItem(it = {}) {
  const out = {};
  Object.entries(it).forEach(([k, v]) => { out[k] = v == null ? '' : v; });
  return out;
}
function serializeHeader(h) {
  return {
    policy_provider_id: emptyToNull(h.policy_provider_id),
    tpa_insurer: emptyToNull(h.tpa_insurer),
    total_settlement_amount: numOrNull(h.total_settlement_amount),
    payment_mode: emptyToNull(h.payment_mode),
    payment_batch: emptyToNull(h.payment_batch),
    utr_number: emptyToNull(h.utr_number),
    settlement_number: emptyToNull(h.settlement_number),
    settlement_date: emptyToNull(h.settlement_date),
    hospital_account_number: emptyToNull(h.hospital_account_number),
  };
}
function serializeItem(it) {
  return {
    claim_number: emptyToNull(it.claim_number),
    settled_amount: numOrNull(it.settled_amount),
    claim_raised_amount: numOrNull(it.claim_raised_amount),
    disallowance: numOrNull(it.disallowance),
    disallowance_reason: emptyToNull(it.disallowance_reason),
  };
}
const emptyToNull = (v) => (v === '' || v == null ? null : v);
const numOrNull = (v) => (v === '' || v == null ? null : Number(v));
