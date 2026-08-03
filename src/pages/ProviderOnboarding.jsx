import { useState, useEffect } from 'react';
import { useToast } from '../components/Toast';
import { hospitalProviderService } from '../services/api';
import { IconPlus, IconEdit, IconTrash, IconShield, IconArrowLeft } from '../components/icons/Icons';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import './ProviderOnboarding.scss';

const EMPTY_FORM = {
  provider_name: '',
  provider_external_id: '',
  email: '',
  tpa_name: '',
  tpa_toll_free_phone: '',
  tpa_toll_free_fax: '',
};

function chargesSummary(rc) {
  if (!rc) return '—';
  const rooms = Array.isArray(rc.room_type) ? rc.room_type.length : 0;
  const bits = [];
  if (rooms) bits.push(`${rooms} room type${rooms > 1 ? 's' : ''}`);
  if (rc.icu != null) bits.push(`ICU ₹${rc.icu}`);
  if (rc.ot_charge != null) bits.push(`OT ₹${rc.ot_charge}`);
  return bits.length ? bits.join(' · ') : '—';
}

export default function ProviderOnboarding() {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // mapping being edited
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [mouView, setMouView] = useState(null); // { url, name }

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await hospitalProviderService.getAll();
      setList(Array.isArray(res.data) ? res.data : []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const handleViewMou = async (m) => {
    try {
      const res = await hospitalProviderService.viewMou(m.id);
      const type = res.data?.type || res.headers?.['content-type'] || 'application/pdf';
      const url = URL.createObjectURL(new Blob([res.data], { type }));
      setMouView({ url, name: m.mou_original_filename || 'MOU' });
    } catch {
      toast.error('Could not open MOU');
    }
  };

  const closeMouView = () => {
    if (mouView?.url) URL.revokeObjectURL(mouView.url);
    setMouView(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await hospitalProviderService.delete(deleteTarget.id);
      toast.success('Provider unassigned');
      setDeleteTarget(null);
      fetchList();
    } catch {
      /* handled by interceptor */
    }
  };

  return (
    <div className="po-page">
      <div className="page-header">
        <h1>Provider Onboarding</h1>
        <p>Onboard insurers to your hospital with MOU tariffs and TPA details</p>
      </div>

      <div className="po-toolbar">
        <button className="btn btn--primary" onClick={() => { setEditTarget(null); setShowForm(true); }}>
          <IconPlus size={16} /> Add Provider
        </button>
      </div>

      {loading ? (
        <div className="page-loading"><Spinner /></div>
      ) : list.length === 0 ? (
        <div className="po-empty">
          <EmptyState message="No providers onboarded to this hospital yet" />
        </div>
      ) : (
        <div className="po-grid">
          {list.map((m) => (
            <div className="po-card" key={m.id}>
              <div className="po-card__header">
                <div className="po-card__icon"><IconShield size={20} /></div>
                <div className="po-card__title">
                  <h3>{m.provider_name}</h3>
                  {m.provider_external_id && <span>{m.provider_external_id}</span>}
                </div>
              </div>
              <div className="po-card__body">
                {m.tpa_name && <div><strong>TPA:</strong> {m.tpa_name}</div>}
                {m.tpa_toll_free_phone && <div><strong>Toll-Free:</strong> {m.tpa_toll_free_phone}</div>}
                {m.email && <div><strong>Email:</strong> {m.email}</div>}
                <div><strong>Charges:</strong> {chargesSummary(m.room_charges)}</div>
              </div>
              <div className="po-card__actions">
                {m.mou_original_filename && (
                  <button className="btn btn--ghost btn--sm" onClick={() => handleViewMou(m)}>
                    MOU
                  </button>
                )}
                <button className="btn btn--ghost btn--sm" onClick={() => { setEditTarget(m); setShowForm(true); }}>
                  <IconEdit size={14} /> Edit
                </button>
                <button className="btn btn--ghost btn--sm po-card__delete" onClick={() => setDeleteTarget(m)}>
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ProviderForm
          mapping={editTarget}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); fetchList(); }}
        />
      )}

      {mouView && (
        <Modal title={mouView.name} onClose={closeMouView} size="lg">
          <iframe className="po-mou-frame" src={mouView.url} title="MOU document" />
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Unassign Provider" onClose={() => setDeleteTarget(null)}>
          <div className="delete-confirm">
            <p>Unassign <strong>{deleteTarget.provider_name}</strong> from this hospital?</p>
            <div className="modal-actions">
              <button className="btn btn--ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn--danger" onClick={handleDelete}>Unassign</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ProviderForm({ mapping, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!mapping;

  const [form, setForm] = useState(
    isEdit
      ? {
          provider_name: mapping.provider_name || '',
          provider_external_id: mapping.provider_external_id || '',
          email: mapping.email || '',
          tpa_name: mapping.tpa_name || '',
          tpa_toll_free_phone: mapping.tpa_toll_free_phone || '',
          tpa_toll_free_fax: mapping.tpa_toll_free_fax || '',
        }
      : { ...EMPTY_FORM }
  );
  const rc = mapping?.room_charges || {};
  const [roomTypes, setRoomTypes] = useState(
    Array.isArray(rc.room_type) ? rc.room_type : []
  );
  const [icu, setIcu] = useState(rc.icu ?? '');
  const [otCharge, setOtCharge] = useState(rc.ot_charge ?? '');
  const [mouFile, setMouFile] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  // Raw AI extraction, kept so create can persist it alongside the reviewed
  // charges (the backend stores it in extracted_data for audit / re-edit).
  const [rawExtract, setRawExtract] = useState(null);
  // Filename of the MOU currently on file. Local state because a re-upload
  // replaces it mid-edit, before the list is refetched.
  const [currentMou, setCurrentMou] = useState(mapping?.mou_original_filename || null);
  // Set when a re-extract would overwrite charges that are already filled in —
  // renders an inline confirm instead of acting straight away.
  const [pendingReplace, setPendingReplace] = useState(false);
  const [mouUrl, setMouUrl] = useState(null);

  // 'existing' = attach an already-onboarded provider; 'new' = type fresh details.
  const [mode, setMode] = useState('new');
  const [available, setAvailable] = useState([]);
  const [selectedExistingId, setSelectedExistingId] = useState('');

  useEffect(() => {
    if (isEdit) return;
    hospitalProviderService
      .getAvailable()
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setAvailable(list);
        if (list.length > 0) {
          setMode('existing');
          setSelectedExistingId(list[0].id);
        }
      })
      .catch(() => setAvailable([]));
  }, [isEdit]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleMouChange = (e) => {
    setMouFile(e.target.files?.[0] || null);
    setPendingReplace(false);
  };

  // Charges the admin would lose if an extraction overwrote them.
  const hasCharges = roomTypes.length > 0 || icu !== '' || otCharge !== '';
  // A document is already on file, so this is a replacement, not a first upload.
  const hasMou = isEdit && !!currentMou;
  const extractLabel = !isEdit
    ? 'Extract Tariff'
    : hasMou
      ? 'Re-upload & Extract'
      : 'Upload & Extract';

  const applyExtracted = (data) => {
    setRawExtract(data);
    setRoomTypes(Array.isArray(data.room_type) ? data.room_type : []);
    setIcu(data.icu ?? '');
    setOtCharge(data.ot_charge ?? '');
  };

  // Create: extraction is a pure preview and the file rides along with the save.
  // Edit: the file is attached/replaced server-side straight away (there's a
  // mapping to attach it to), and only the charges wait for Save.
  const runExtract = async () => {
    setPendingReplace(false);
    setExtracting(true);
    try {
      if (isEdit) {
        const res = await hospitalProviderService.uploadMou(mapping.id, mouFile);
        const { mapping: updated, extracted } = res.data || {};
        applyExtracted(extracted || {});
        const replaced = hasMou;
        if (updated?.mou_original_filename) setCurrentMou(updated.mou_original_filename);
        setMouFile(null);
        toast.success(
          replaced
            ? 'MOU replaced — review the tariffs and save'
            : 'MOU uploaded — review the tariffs and save'
        );
      } else {
        const res = await hospitalProviderService.extractMou(mouFile);
        applyExtracted(res.data || {});
        toast.success('MOU tariffs extracted — review and edit before saving');
      }
    } catch {
      toast.error('Could not extract MOU; fill the charges manually');
    } finally {
      setExtracting(false);
    }
  };

  const handleExtract = () => {
    if (!mouFile) {
      toast.error('Choose an MOU file first');
      return;
    }
    // Ask BEFORE uploading: in edit mode the file is replaced by the same call
    // that extracts, so confirming afterwards would leave a new PDF sitting next
    // to charges the user chose not to overwrite. Confirm whenever something
    // would be destroyed — the stored document, the reviewed charges, or both.
    if (hasCharges || hasMou) {
      setPendingReplace(true);
      return;
    }
    runExtract();
  };

  // Previewed inline rather than in a nested Modal: this form already sits in one
  // with closeOnOverlayClick disabled to protect unsaved edits, and a second
  // Modal's Esc handler would close the form along with the preview.
  const handleToggleMouPreview = async () => {
    if (mouUrl) {
      URL.revokeObjectURL(mouUrl);
      setMouUrl(null);
      return;
    }
    try {
      const res = await hospitalProviderService.viewMou(mapping.id);
      setMouUrl(URL.createObjectURL(res.data));
    } catch {
      toast.error('Could not open the MOU');
    }
  };

  // Release the blob when the form closes.
  useEffect(() => () => { if (mouUrl) URL.revokeObjectURL(mouUrl); }, [mouUrl]);

  const addRoom = () => setRoomTypes((r) => [...r, { room: '', per_day_rent: '' }]);
  const setRoom = (i, key, val) =>
    setRoomTypes((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));
  const removeRoom = (i) => setRoomTypes((r) => r.filter((_, idx) => idx !== i));

  const buildRoomCharges = () => ({
    room_type: roomTypes
      .filter((r) => String(r.room || '').trim())
      .map((r) => ({
        room: r.room.trim(),
        per_day_rent: r.per_day_rent === '' || r.per_day_rent == null ? null : Number(r.per_day_rent),
      })),
    icu: icu === '' || icu == null ? null : Number(icu),
    ot_charge: otCharge === '' || otCharge == null ? null : Number(otCharge),
  });

  const isExisting = !isEdit && mode === 'existing';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isExisting && !selectedExistingId) {
      toast.error('Select a provider');
      return;
    }
    if (!isExisting && !form.provider_name.trim()) {
      toast.error('Provider name is required');
      return;
    }
    setSaving(true);
    try {
      const room_charges = buildRoomCharges();
      if (isEdit) {
        await hospitalProviderService.update(mapping.id, { ...form, room_charges });
        toast.success('Provider updated');
      } else {
        // Send the raw extraction too, so the backend can keep it for audit
        // instead of storing a copy of the reviewed charges.
        const extracted_data = rawExtract ? JSON.stringify(rawExtract) : undefined;
        const identity = isExisting
          ? { policy_provider_id: selectedExistingId }
          : { ...form };
        await hospitalProviderService.create(
          { ...identity, room_charges: JSON.stringify(room_charges), extracted_data },
          mouFile
        );
        toast.success('Provider onboarded');
      }
      onSaved();
    } catch {
      /* handled by interceptor */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={isEdit ? `Edit: ${mapping.provider_name}` : 'Onboard Provider'} onClose={onClose} size="lg" closeOnOverlayClick={false}>
      <form className="po-form modal-form" onSubmit={handleSubmit}>
        {!isEdit && available.length > 0 && (
          <div className="po-form__mode">
            <label className={mode === 'existing' ? 'is-active' : ''}>
              <input
                type="radio"
                name="po-mode"
                checked={mode === 'existing'}
                onChange={() => setMode('existing')}
              />
              Select onboarded provider
            </label>
            <label className={mode === 'new' ? 'is-active' : ''}>
              <input
                type="radio"
                name="po-mode"
                checked={mode === 'new'}
                onChange={() => setMode('new')}
              />
              Add new provider
            </label>
          </div>
        )}

        {isExisting ? (
          <div className="form-group">
            <label>Provider *</label>
            <select value={selectedExistingId} onChange={(e) => setSelectedExistingId(e.target.value)}>
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.provider_id ? ` (${p.provider_id})` : ''}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="po-form__grid">
            <div className="form-group">
              <label>Provider Name *</label>
              <input value={form.provider_name} onChange={(e) => setField('provider_name', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Provider ID</label>
              <input value={form.provider_external_id} onChange={(e) => setField('provider_external_id', e.target.value)} placeholder="Auto-generated if blank" disabled={isEdit} />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} />
            </div>
            <div className="form-group">
              <label>TPA Name</label>
              <input value={form.tpa_name} onChange={(e) => setField('tpa_name', e.target.value)} />
            </div>
            <div className="form-group">
              <label>TPA Toll-Free Number</label>
              <input value={form.tpa_toll_free_phone} onChange={(e) => setField('tpa_toll_free_phone', e.target.value)} />
            </div>
            <div className="form-group">
              <label>TPA Fax</label>
              <input value={form.tpa_toll_free_fax} onChange={(e) => setField('tpa_toll_free_fax', e.target.value)} />
            </div>
          </div>
        )}

        <div className="form-group">
          <label>MOU Document{hasMou ? ' — re-upload' : ''}</label>
          {isEdit && (
            <p className="po-form__hint">
              {currentMou ? (
                <>
                  On file: <strong>{currentMou}</strong>{' '}
                  <button type="button" className="btn btn--ghost btn--sm" onClick={handleToggleMouPreview}>
                    {mouUrl ? 'Hide' : 'View'}
                  </button>
                </>
              ) : (
                'No MOU on file yet — upload one below to extract its tariffs.'
              )}
            </p>
          )}
          {mouUrl && <iframe className="po-mou-frame" src={mouUrl} title="Current MOU" />}
          <div className="po-form__mou">
            <input type="file" accept=".pdf" onChange={handleMouChange} />
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={handleExtract}
              disabled={!mouFile || extracting || pendingReplace}
            >
              {extracting ? <Spinner size={14} /> : extractLabel}
            </button>
          </div>
          {hasMou && !mouFile && !extracting && (
            <span className="po-form__hint">
              Choosing a file will replace the MOU on file and re-extract its tariffs.
            </span>
          )}
          {mouFile && !extracting && !pendingReplace && (
            <span className="po-form__hint">
              {hasMou ? 'Replacing with: ' : 'Selected: '}{mouFile.name}
            </span>
          )}
          {extracting && <span className="po-form__hint">Extracting tariffs…</span>}
          {pendingReplace && (
            // Inline rather than a nested Modal — this form is already inside one.
            <div className="po-form__confirm">
              <p>
                {hasMou && (
                  <>
                    Replace <strong>{currentMou}</strong> with <strong>{mouFile?.name}</strong>?
                    {' '}The old document is removed.
                  </>
                )}
                {hasCharges && (
                  <>
                    {hasMou ? ' ' : `Use the tariffs from ${mouFile?.name}? `}
                    The current charges
                    {roomTypes.length > 0 && ` (${roomTypes.length} room type${roomTypes.length > 1 ? 's' : ''})`}
                    {' '}will be overwritten with the values extracted from it.
                  </>
                )}
              </p>
              <div className="po-form__confirm-actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPendingReplace(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn--danger btn--sm" onClick={runExtract}>
                  {hasMou ? 'Re-upload' : 'Replace'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="po-form__charges">
          <div className="po-form__charges-head">
            <h4>Room Charges</h4>
            <button type="button" className="btn btn--ghost btn--sm" onClick={addRoom}>
              <IconPlus size={14} /> Add room type
            </button>
          </div>
          {roomTypes.length === 0 && <p className="po-form__hint">No room types yet. Upload an MOU or add manually.</p>}
          {roomTypes.map((row, i) => (
            <div className="po-form__room-row" key={i}>
              <input
                placeholder="Room type (e.g. NICU)"
                value={row.room}
                onChange={(e) => setRoom(i, 'room', e.target.value)}
              />
              <input
                type="number"
                placeholder="Per-day rent"
                value={row.per_day_rent ?? ''}
                onChange={(e) => setRoom(i, 'per_day_rent', e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
              />
              <button type="button" className="btn btn--ghost btn--sm po-card__delete" onClick={() => removeRoom(i)}>
                <IconTrash size={14} />
              </button>
            </div>
          ))}

          <div className="po-form__grid">
            <div className="form-group">
              <label>ICU Charge (per day)</label>
              <input type="number" value={icu} onChange={(e) => setIcu(e.target.value)} onWheel={(e) => e.currentTarget.blur()} />
            </div>
            <div className="form-group">
              <label>OT Charge</label>
              <input type="number" value={otCharge} onChange={(e) => setOtCharge(e.target.value)} onWheel={(e) => e.currentTarget.blur()} />
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            <IconArrowLeft size={14} /> Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving || extracting}>
            {saving ? <Spinner size={18} /> : isEdit ? 'Save' : 'Onboard'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
