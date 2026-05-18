import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { claimCaseService, claimService, documentService } from '../services/api';
import { IconArrowLeft, IconChevronRight, IconSend, IconX, IconMail } from '../components/icons/Icons';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';
import { CLAIM_DOCUMENT_TYPES } from '../constants/claimDocuments';

const APPROVAL_EMAIL_TYPES = new Set(['APPROVAL', 'PARTIAL_APPROVAL', 'ENHANCEMENT_APPROVAL']);
import './Pages.scss';

function formatINR(amount) {
  if (amount == null || amount === '') return '—';
  const num = Number(amount);
  if (Number.isNaN(num)) return '—';
  return num.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

const DEFAULT_LINE_ITEMS = [
  { label: 'Room rent', amount: '' },
  { label: 'Surgery charges', amount: '' },
  { label: 'Pharmacy', amount: '' },
  { label: 'Investigations', amount: '' },
  { label: 'Consultation', amount: '' },
  { label: 'Implants / Consumables', amount: '' },
  { label: 'Other', amount: '' },
];

const hasApprovedAmount = (cc) => {
  const n = Number(cc?.approved_amount);
  return Number.isFinite(n) && n > 0;
};

function PortalShell({ title, subtitle, accent = 'info', onClose, children, footer }) {
  return (
    <div className="portal-form">
      <div className={`portal-form__head portal-form__head--${accent}`}>
        <div className="portal-form__head-text">
          <div className="portal-form__head-title">{title}</div>
          {subtitle && <div className="portal-form__head-sub">{subtitle}</div>}
        </div>
        {onClose && (
          <button type="button" className="portal-form__close" onClick={onClose} title="Cancel">
            <IconX size={16} />
          </button>
        )}
      </div>
      <div className="portal-form__body">{children}</div>
      {footer && <div className="portal-form__footer">{footer}</div>}
    </div>
  );
}

function PortalSection({ title, hint, cols = 2, children }) {
  return (
    <div className="portal-form__section">
      <div className="portal-form__section-head">
        <h4>{title}</h4>
        {hint && <span className="portal-form__section-hint">{hint}</span>}
      </div>
      <div
        className="portal-form__section-body"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, hint, span = 1, children }) {
  return (
    <div className="portal-form__field" style={{ gridColumn: `span ${span}` }}>
      {label && (
        <label className="portal-form__field-label">
          {label}
          {required && <span className="portal-form__req"> *</span>}
        </label>
      )}
      {children}
      {hint && <div className="portal-form__field-hint">{hint}</div>}
    </div>
  );
}

function ReadField({ label, value, span = 1 }) {
  return (
    <div className="portal-form__field" style={{ gridColumn: `span ${span}` }}>
      <label className="portal-form__field-label">{label}</label>
      <div className="portal-form__read-field">{value}</div>
    </div>
  );
}

function EmailPreview({ subject, to, cc, body }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="portal-form__preview">
      <button
        type="button"
        className="portal-form__preview-toggle"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{open ? 'Hide' : 'Preview'} email that will be sent</span>
        <span className={`portal-form__preview-chev ${open ? 'portal-form__preview-chev--open' : ''}`}>
          <IconChevronRight size={14} />
        </span>
      </button>
      {open && (
        <div className="portal-form__preview-body">
          <div className="portal-form__preview-row"><span>To</span><code>{to || '—'}</code></div>
          {cc && cc.length > 0 && (
            <div className="portal-form__preview-row"><span>Cc</span><code>{cc.join(', ')}</code></div>
          )}
          <div className="portal-form__preview-row"><span>Subject</span><code>{subject}</code></div>
          <pre className="portal-form__preview-text">{body}</pre>
        </div>
      )}
    </div>
  );
}

function DocCategoryCard({ category, files, picked = [], onPick, onRemove, onRemovePicked, onPickFromEmails, onView, readOnly }) {
  // In raise mode `files` is an array of File objects (local, not yet uploaded);
  // in read-only mode it's an array of server documents. `picked` is the list
  // of email attachments selected via the "Pick from emails" picker — these
  // get materialised server-side at submit time and only apply to the Auth
  // Letters card.
  const totalCount = files.length + picked.length;
  return (
    <div className="claim-doc-card">
      <div className="claim-doc-card__head">
        <div className="claim-doc-card__title">{category.label}</div>
        <div className="claim-doc-card__count">{totalCount} file{totalCount === 1 ? '' : 's'}</div>
      </div>
      <div className="claim-doc-card__files">
        {totalCount === 0 && (
          <span className="portal-form__files-empty">No files attached yet.</span>
        )}
        {files.map((file, idx) => {
          const name = file.original_filename || file.name;
          const canView = !!file.id && typeof onView === 'function';
          return (
            <span key={file.id ?? `${name}-${idx}`} className="apply-step__attach-chip">
              {canView ? (
                <button
                  type="button"
                  className="claim-doc-card__view"
                  onClick={() => onView(file)}
                  title="View"
                >
                  {name}
                </button>
              ) : (
                <span>{name}</span>
              )}
              {!readOnly && (
                <button type="button" onClick={() => onRemove(idx)} title="Remove">&times;</button>
              )}
            </span>
          );
        })}
        {picked.map((att, idx) => (
          <span
            key={`picked-${att.attachment_id}`}
            className="apply-step__attach-chip"
            title={`From email: ${att.email_subject || '—'}`}
          >
            <IconMail size={12} />
            <span style={{ marginLeft: 4 }}>{att.original_filename}</span>
            {!readOnly && (
              <button type="button" onClick={() => onRemovePicked(idx)} title="Remove">&times;</button>
            )}
          </span>
        ))}
      </div>
      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label className="apply-step__attach-btn portal-form__add-file">
            + Add files
            <input
              type="file"
              hidden
              multiple
              onChange={(e) => {
                const newFiles = Array.from(e.target.files || []);
                if (newFiles.length) onPick(newFiles);
                e.target.value = '';
              }}
            />
          </label>
          {typeof onPickFromEmails === 'function' && (
            <button
              type="button"
              className="apply-step__attach-btn"
              onClick={onPickFromEmails}
            >
              <IconMail size={14} /> Pick from emails
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ClaimRaisePage() {
  const { claimCaseId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [claimCase, setClaimCase] = useState(null);
  const [existingClaim, setExistingClaim] = useState(null);
  const [items, setItems] = useState(DEFAULT_LINE_ITEMS);
  const [remarks, setRemarks] = useState('');
  const emptyPending = () => Object.fromEntries(CLAIM_DOCUMENT_TYPES.map((c) => [c.key, []]));
  // Raise mode: File[] per category, in browser memory until Submit.
  const [pendingFiles, setPendingFiles] = useState(emptyPending);
  // Read-only mode: server documents grouped by category (only populated when
  // a claim has already been raised on this case).
  const [savedDocsByType, setSavedDocsByType] = useState(emptyPending);
  const [submitting, setSubmitting] = useState(false);
  // "Pick from emails" picker for Authorization Letters: list of selected
  // approval-email attachments to materialise server-side at submit time.
  const [pickedAttachments, setPickedAttachments] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [approvalEmails, setApprovalEmails] = useState(null); // null = not yet fetched
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSelection, setPickerSelection] = useState(new Set());
  // Inline preview state for the picker's "View" button.
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewFilename, setPreviewFilename] = useState('');
  const [previewContentType, setPreviewContentType] = useState('');

  const readOnly = !!existingClaim;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ccRes = await claimCaseService.getById(claimCaseId);
        if (cancelled) return;
        setClaimCase(ccRes.data);

        // Only hit /claim + /documents when a claim has already been raised.
        // Until Submit, the raise form is purely client-side state.
        if (ccRes.data?.has_claim) {
          const [claim, docsRes] = await Promise.all([
            claimService.get(claimCaseId),
            documentService.list(claimCaseId),
          ]);
          if (cancelled) return;
          setExistingClaim(claim);
          if (Array.isArray(claim.bill_breakdown) && claim.bill_breakdown.length) {
            setItems(claim.bill_breakdown.map((i) => ({ label: i.label, amount: String(i.amount ?? '') })));
          }
          setRemarks(claim.remarks || '');
          const grouped = emptyPending();
          (docsRes.data || []).forEach((d) => {
            if (d.document_type && grouped[d.document_type]) grouped[d.document_type].push(d);
          });
          setSavedDocsByType(grouped);
        }
      } catch {
        // Toast already fired by the response interceptor.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [claimCaseId]);

  const docsByType = readOnly ? savedDocsByType : pendingFiles;

  const claimedAmount = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0),
    [items],
  );

  const summary = claimCase?.summary || {};
  const patientName = summary.patient_name || '—';
  const insurerName = summary.provider_name || 'insurer';
  const paId = claimCase?.claim_number || claimCase?.id || claimCaseId;
  const subject = `[${paId}] Claim Submission — ${summary.patient_name || ''}`.trim();
  const body = useMemo(() => {
    const lines = [
      `Dear ${insurerName} Team,`,
      ``,
      `Please find below the claim submission for ${patientName} ` +
        `(UHID: ${claimCase?.uhid || '—'}), with reference to approval ${paId}.`,
      ``,
      `Bill breakdown:`,
      ...items
        .filter((i) => Number(i.amount) > 0)
        .map((i) => `  • ${i.label}: ${formatINR(i.amount)}`),
      `Total claimed: ${formatINR(claimedAmount)}`,
      ``,
      `Supporting documents attached:`,
      ...CLAIM_DOCUMENT_TYPES.map((c) => {
        const count = (docsByType[c.key]?.length || 0)
          + (c.key === 'AUTHORIZATION_LETTERS' ? pickedAttachments.length : 0);
        return `  • ${c.label}: ${count} file(s)`;
      }),
      ``,
      remarks ? `Remarks: ${remarks}\n` : '',
      `Regards,`,
      `Hospital Insurance Desk`,
    ];
    return lines.filter((l) => l !== '').join('\n');
  }, [claimCase, claimedAmount, items, docsByType, remarks, paId, patientName, insurerName, pickedAttachments]);

  const updateItem = (idx, key, value) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [key]: value } : it)));
  };
  const addLine = () => setItems((prev) => [...prev, { label: '', amount: '' }]);
  const removeLine = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleAddFiles = (categoryKey, files) => {
    setPendingFiles((prev) => ({
      ...prev,
      [categoryKey]: [...(prev[categoryKey] || []), ...files],
    }));
  };

  const handleRemovePending = (categoryKey, idx) => {
    setPendingFiles((prev) => ({
      ...prev,
      [categoryKey]: (prev[categoryKey] || []).filter((_, i) => i !== idx),
    }));
  };

  const handleViewSaved = async (doc) => {
    try {
      const res = await documentService.view(claimCaseId, doc.id);
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank', 'noopener');
    } catch { /* interceptor handles */ }
  };

  const handleRemovePicked = (idx) => {
    setPickedAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const openEmailPicker = async () => {
    setPickerSelection(new Set(pickedAttachments.map((a) => a.attachment_id)));
    setPickerOpen(true);
    if (approvalEmails !== null) return;
    setPickerLoading(true);
    try {
      const res = await claimCaseService.getAllEmails(claimCaseId);
      const all = Array.isArray(res.data) ? res.data : [];
      const filtered = all
        .filter((e) => APPROVAL_EMAIL_TYPES.has(e.email_type) && Array.isArray(e.attachments) && e.attachments.length > 0)
        .sort((a, b) => new Date(b.email_date || 0) - new Date(a.email_date || 0));
      setApprovalEmails(filtered);
    } catch {
      setApprovalEmails([]);
    } finally {
      setPickerLoading(false);
    }
  };

  const toggleAttachmentSelection = (attachmentId) => {
    setPickerSelection((prev) => {
      const next = new Set(prev);
      if (next.has(attachmentId)) next.delete(attachmentId);
      else next.add(attachmentId);
      return next;
    });
  };

  const viewAttachmentInPicker = async (emailId, attachmentId, filename) => {
    try {
      const res = await claimCaseService.viewAttachment(claimCaseId, emailId, attachmentId);
      const contentType = res.headers?.['content-type'] || res.data?.type || 'application/octet-stream';
      const url = URL.createObjectURL(new Blob([res.data], { type: contentType }));
      setPreviewUrl(url);
      setPreviewFilename(filename || 'attachment');
      setPreviewContentType(contentType);
    } catch { /* interceptor handles */ }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewFilename('');
    setPreviewContentType('');
  };

  const confirmEmailPicker = () => {
    const flat = [];
    (approvalEmails || []).forEach((email) => {
      (email.attachments || []).forEach((att) => {
        if (pickerSelection.has(att.id)) {
          flat.push({
            attachment_id: att.id,
            email_id: email.id,
            email_subject: email.subject,
            email_date: email.email_date,
            original_filename: att.original_filename,
          });
        }
      });
    });
    setPickedAttachments(flat);
    setPickerOpen(false);
  };

  const handleSubmit = async () => {
    const validItems = items.filter((i) => i.label.trim() && Number(i.amount) > 0);
    if (validItems.length === 0) {
      toast.error('Add at least one bill line item');
      return;
    }
    if (claimedAmount <= 0) {
      toast.error('Total claimed amount must be greater than zero');
      return;
    }

    const missingCategories = CLAIM_DOCUMENT_TYPES.filter((c) => {
      const uploaded = (docsByType[c.key] || []).length;
      const picked = c.key === 'AUTHORIZATION_LETTERS' ? pickedAttachments.length : 0;
      return uploaded + picked === 0;
    });
    if (missingCategories.length > 0) {
      const ok = window.confirm(
        `${missingCategories.length} document categor${missingCategories.length === 1 ? 'y has' : 'ies have'} no files ` +
        `(${missingCategories.map((c) => c.label).join(', ')}). Submit anyway?`,
      );
      if (!ok) return;
    }

    setSubmitting(true);
    try {
      // Upload pending files one category at a time (each call carries the
      // shared document_type for the whole batch). Run sequentially so a
      // mid-flight failure doesn't leave half-tagged docs behind.
      for (const cat of CLAIM_DOCUMENT_TYPES) {
        const filesForCat = pendingFiles[cat.key] || [];
        if (filesForCat.length === 0) continue;
        const fd = new FormData();
        filesForCat.forEach((f) => fd.append('files', f));
        fd.append('document_type', cat.key);
        await documentService.upload(claimCaseId, fd);
      }

      // Materialise picked-from-email attachments into ClaimCaseDocument rows
      // server-side. The raise endpoint then picks them up alongside uploads.
      if (pickedAttachments.length > 0) {
        await documentService.fromEmail(claimCaseId, {
          attachment_ids: pickedAttachments.map((a) => a.attachment_id),
        });
      }

      const result = await claimService.raise(claimCaseId, {
        bill_breakdown: validItems.map((i) => ({ label: i.label.trim(), amount: Number(i.amount) })),
        claimed_amount: Number(claimedAmount.toFixed(2)),
        remarks: remarks.trim() || null,
        email_subject: subject,
        email_body: body,
      });
      toast.success(result.is_onboarded ? 'Submitted successfully' : 'Email sent successfully');
      navigate(`/claim-list/${claimCaseId}`);
    } catch {
      // interceptor handles
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="claim-detail" style={{ padding: 24 }}>
        <Spinner />
      </div>
    );
  }
  if (!claimCase) {
    return (
      <div className="claim-detail" style={{ padding: 24 }}>
        <p>Claim case not found.</p>
        <button className="btn btn--ghost" onClick={() => navigate('/claim-list')}>
          <IconArrowLeft size={14} /> Back to list
        </button>
      </div>
    );
  }

  const canRaise = readOnly || hasApprovedAmount(claimCase);

  return (
    <div className="claim-detail" style={{ padding: '16px 24px' }}>
      <div style={{ marginBottom: 12 }}>
        <button className="btn btn--ghost btn--sm" onClick={() => navigate(`/claim-list/${claimCaseId}`)}>
          <IconArrowLeft size={14} /> Back to claim
        </button>
      </div>

      <PortalShell
        title={readOnly ? 'Claim Submitted' : 'Raise Claim'}
        subtitle={`${patientName} · UHID ${claimCase.uhid || '—'} · ${insurerName}`}
        accent="info"
        footer={readOnly ? (
          <button className="btn btn--ghost" onClick={() => navigate(`/claim-list/${claimCaseId}`)}>Close</button>
        ) : (
          <>
            <button className="btn btn--ghost" onClick={() => navigate(`/claim-list/${claimCaseId}`)}>Cancel</button>
            <button
              className="btn btn--primary"
              disabled={!canRaise || submitting}
              onClick={handleSubmit}
            >
              {submitting ? <Spinner size={16} /> : <><IconSend size={16} /> Submit Claim</>}
            </button>
          </>
        )}
      >
        {!readOnly && !canRaise && (
          <div className="portal-form__section">
            <div className="claim-detail__warning">
              A claim can only be raised after some amount has been approved on the pre-auth.
            </div>
          </div>
        )}

        <PortalSection title="Pre-auth summary" cols={3}>
          <ReadField label="Patient" value={`${patientName} · ${claimCase.uhid || '—'}`} span={2} />
          <ReadField label="Insurer" value={insurerName} />
          <ReadField label="Approved amount" value={
            <span style={{ color: '#16a34a', fontWeight: 700 }}>{formatINR(claimCase.approved_amount)}</span>
          } />
          <ReadField label="Pre-auth status" value={claimCase.claim_status || claimCase.status || '—'} />
          <ReadField label="PA / Claim number" value={paId} />
        </PortalSection>

        <PortalSection
          title="Bill breakdown"
          hint="Itemize the final bill. Total auto-sums into Claimed amount."
          cols={6}
        >
          {items.map((it, idx) => (
            <div key={idx} style={{ gridColumn: 'span 6', display: 'grid', gridTemplateColumns: '3fr 2fr auto', gap: 8, alignItems: 'end' }}>
              <Field label={idx === 0 ? 'Line item' : undefined}>
                <input
                  type="text"
                  value={it.label}
                  disabled={readOnly}
                  onChange={(e) => updateItem(idx, 'label', e.target.value)}
                  placeholder="e.g. Surgery charges"
                />
              </Field>
              <Field label={idx === 0 ? 'Amount (₹)' : undefined}>
                <input
                  type="number"
                  value={it.amount}
                  disabled={readOnly}
                  onChange={(e) => updateItem(idx, 'amount', e.target.value)}
                  placeholder="0"
                  min="0"
                />
              </Field>
              {!readOnly && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => removeLine(idx)}
                  disabled={items.length <= 1}
                  title="Remove line"
                  style={{ marginBottom: 2 }}
                >
                  <IconX size={14} />
                </button>
              )}
            </div>
          ))}
          {!readOnly && (
            <div style={{ gridColumn: 'span 6' }}>
              <button type="button" className="btn btn--ghost btn--sm" onClick={addLine}>+ Add line</button>
            </div>
          )}
          <ReadField
            label="Total claimed"
            value={<span style={{ color: '#4f46e5', fontWeight: 700 }}>{formatINR(claimedAmount)}</span>}
            span={6}
          />
        </PortalSection>

        <PortalSection title="Supporting documents" hint="Upload files under each category" cols={1}>
          <div className="claim-doc-grid" style={{ gridColumn: 'span 1' }}>
            {CLAIM_DOCUMENT_TYPES.map((c) => (
              <DocCategoryCard
                key={c.key}
                category={c}
                files={docsByType[c.key] || []}
                picked={c.key === 'AUTHORIZATION_LETTERS' && !readOnly ? pickedAttachments : []}
                onPick={(files) => handleAddFiles(c.key, files)}
                onRemove={(idx) => handleRemovePending(c.key, idx)}
                onRemovePicked={handleRemovePicked}
                onPickFromEmails={c.key === 'AUTHORIZATION_LETTERS' && !readOnly ? openEmailPicker : undefined}
                onView={readOnly ? handleViewSaved : undefined}
                readOnly={readOnly}
              />
            ))}
          </div>
        </PortalSection>

        <PortalSection title="Remarks" cols={1}>
          <Field span={1}>
            <textarea
              rows={3}
              value={remarks}
              disabled={readOnly}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Any notes for the insurer (optional)"
            />
          </Field>
        </PortalSection>

        <EmailPreview
          subject={subject}
          to={claimCase.policy_provider_email}
          cc={claimCase.cc_emails}
          body={body}
        />
      </PortalShell>

      {pickerOpen && (
        <Modal
          title="Pick Authorization Letters from received emails"
          onClose={() => setPickerOpen(false)}
          size="lg"
        >
          <div style={{ minHeight: 200 }}>
            {pickerLoading && <Spinner />}
            {!pickerLoading && (approvalEmails || []).length === 0 && (
              <p className="portal-form__files-empty" style={{ padding: 16 }}>
                No approval emails with attachments found on this case.
              </p>
            )}
            {!pickerLoading && (approvalEmails || []).map((email) => (
              <div key={email.id} style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <div style={{ fontWeight: 600 }}>{email.subject || '(no subject)'}</div>
                  <small style={{ color: '#6b7280' }}>
                    {email.email_type} · {email.email_date ? new Date(email.email_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </small>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(email.attachments || []).map((att) => (
                    <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={pickerSelection.has(att.id)}
                          onChange={() => toggleAttachmentSelection(att.id)}
                        />
                        <span>{att.original_filename}</span>
                        <small style={{ color: '#9ca3af' }}>
                          ({((att.file_size || 0) / 1024).toFixed(1)} KB)
                        </small>
                      </label>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => viewAttachmentInPicker(email.id, att.id, att.original_filename)}
                        title="View"
                      >
                        View
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" className="btn btn--ghost" onClick={() => setPickerOpen(false)}>Cancel</button>
            <button type="button" className="btn btn--primary" onClick={confirmEmailPicker}>
              Add {pickerSelection.size} file{pickerSelection.size === 1 ? '' : 's'}
            </button>
          </div>

          {previewUrl && (
            <Modal title={previewFilename} onClose={closePreview} size="lg">
              <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
                {previewContentType.startsWith('image/') ? (
                  <img src={previewUrl} alt={previewFilename} style={{ maxWidth: '100%', height: 'auto' }} />
                ) : previewContentType === 'application/pdf' ? (
                  <iframe src={previewUrl} title={previewFilename} style={{ width: '100%', height: '70vh', border: 'none' }} />
                ) : (
                  <div style={{ textAlign: 'center', padding: 24 }}>
                    <p>Preview not available for this file type.</p>
                    <a href={previewUrl} download={previewFilename} className="btn btn--primary" style={{ marginTop: 12 }}>
                      Download
                    </a>
                  </div>
                )}
              </div>
            </Modal>
          )}
        </Modal>
      )}
    </div>
  );
}
