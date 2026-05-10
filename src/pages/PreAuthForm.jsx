import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { claimCaseService, emailTemplateService, emailService, documentService, formTemplateService } from '../services/api';
import { IconSend, IconArrowLeft, IconChevronRight, IconPlus, IconX, IconCheck, IconAlertCircle, IconMail } from '../components/icons/Icons';
import Spinner from '../components/Spinner';
import ClaimTimeline from '../components/ClaimTimeline';
import Modal from '../components/Modal';
import ReadOnlyForm from '../components/ReadOnlyForm';
import './Pages.scss';

const ENHANCE_TYPES = ['ENHANCE', 'ENHANCEMENT', 'ENHANCE_REQUEST', 'ENHANCE_RESPONSE'];
const ADR_TYPES = ['ADR_NMI', 'ADR', 'ADDITIONAL_DOCUMENT_REQUEST', 'ADDITIONAL_DOC_RESPONSE'];
const RECONSIDER_TYPES = ['RECONSIDERATION', 'RECONSIDER', 'RECONSIDERATION_REQUEST', 'RECONSIDERATION_RESPONSE'];

function formatINR(amount) {
  if (amount == null || amount === '') return '—';
  const num = Number(amount);
  if (Number.isNaN(num)) return '—';
  return num.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

function statusBadgeVariant(status) {
  switch (status) {
    case 'APPROVED': return 'success';
    case 'PARTIALLY_APPROVED': return 'info';
    case 'DENIED': return 'danger';
    case 'ADR_NMI': return 'warning';
    case 'SUBMITTED': return 'info';
    case 'DRAFT': return 'default';
    case 'ADR_SUBMITTED':
    case 'ENHANCE_SUBMITTED':
    case 'RECONSIDER':
    case 'RECONSIDER_SUBMITTED':
      return 'info';
    default: return 'default';
  }
}

function statusLabel(status) {
  if (!status) return 'Submitted';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Apply Step (Email Templates) ────────────────────────────────────

function ApplyStep({ submitResult, onSendSuccess, useQueryEndpoint }) {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [claimDocs, setClaimDocs] = useState([]);
  const [docViewUrl, setDocViewUrl] = useState(null);
  const [docViewName, setDocViewName] = useState('');
  const [docViewType, setDocViewType] = useState('');
  const [toEmail, setToEmail] = useState(submitResult.policy_provider_email || '');
  const [ccEmails, setCcEmails] = useState(submitResult.cc_emails || []);
  const [editingTo, setEditingTo] = useState(false);
  const [editingCcIdx, setEditingCcIdx] = useState(null);
  const [showAddCc, setShowAddCc] = useState(false);
  const [newCcValue, setNewCcValue] = useState('');

  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const res = await documentService.list(submitResult.claim_case_id);
        setClaimDocs(Array.isArray(res.data) ? res.data : []);
      } catch {
        // no documents
      }
    };
    fetchDocs();
  }, [submitResult.claim_case_id]);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await emailTemplateService.getAll();
        setTemplates(Array.isArray(res.data) ? res.data : []);
      } catch {
        setTemplates([]);
      } finally {
        setLoadingTemplates(false);
      }
    };
    fetch();
  }, []);

  const handleViewDoc = async (doc) => {
    try {
      const res = await documentService.view(submitResult.claim_case_id, doc.id);
      const contentType = res.headers?.['content-type'] || doc.content_type || '';
      const url = window.URL.createObjectURL(new Blob([res.data], { type: contentType }));
      setDocViewUrl(url);
      setDocViewName(doc.original_filename);
      setDocViewType(contentType);
    } catch {
      // handled
    }
  };

  const closeDocView = () => {
    if (docViewUrl) window.URL.revokeObjectURL(docViewUrl);
    setDocViewUrl(null);
    setDocViewName('');
    setDocViewType('');
  };

  const handleSelectTemplate = async (tpl) => {
    setLoadingDetail(true);
    setSelectedTemplate(null);
    try {
      const res = await emailTemplateService.getById(tpl.id);
      setSelectedTemplate(res.data);
      setSubject(res.data.subject || '');
      setContent(res.data.body_html || res.data.body || '');
    } catch {
      // handled
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    setAttachments((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const removeAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!subject.trim()) {
      toast.error('Please enter a subject');
      return;
    }

    const fd = new FormData();
    fd.append('claim_case_id', submitResult.claim_case_id);
    if (toEmail.trim()) {
      fd.append('to_email', toEmail.trim());
    }
    ccEmails.filter((e) => e.trim()).forEach((cc) => fd.append('cc_emails', cc.trim()));
    fd.append('subject', subject.trim());
    fd.append('content', content);
    attachments.forEach((file) => fd.append('file', file));

    setSending(true);
    try {
      const sendFn = useQueryEndpoint ? emailService.query : emailService.send;
      const res = await sendFn(fd);
      toast.success('Email sent successfully');
      onSendSuccess(res.data);
    } catch {
      // handled
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="apply-step">
      {/* Template selector sidebar + compose area */}
      <div className="apply-step__layout">
        {/* Left: template list */}
        <div className="apply-step__sidebar">
          <h4 className="apply-step__sidebar-title">Templates</h4>
          {loadingTemplates ? (
            <div className="page-loading"><Spinner /></div>
          ) : templates.length === 0 ? (
            <div className="apply-step__sidebar-empty">No templates</div>
          ) : (
            <div className="apply-step__tpl-list">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className={`apply-step__tpl-item ${selectedTemplate?.id === tpl.id ? 'apply-step__tpl-item--active' : ''}`}
                  onClick={() => handleSelectTemplate(tpl)}
                >
                  <div className="apply-step__tpl-name">{tpl.name}</div>
                  {tpl.subject && <div className="apply-step__tpl-subject">{tpl.subject}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: compose area */}
        <div className="apply-step__compose">
          {loadingDetail && (
            <div className="page-loading"><Spinner /></div>
          )}

          {!selectedTemplate && !loadingDetail && (
            <div className="apply-step__compose-empty">
              <IconSend size={32} />
              <p>Select a template from the left to compose your email</p>
            </div>
          )}

          {selectedTemplate && !loadingDetail && (
            <form onSubmit={handleSend} className="apply-step__compose-form">
              {!submitResult.is_onboarded && (
                <>
              {/* To field */}
              <div className="apply-step__field">
                <span className="apply-step__field-label">To</span>
                <div className="apply-step__attach-area">
                  {editingTo ? (
                    <input
                      type="email"
                      value={toEmail}
                      onChange={(e) => setToEmail(e.target.value)}
                      onBlur={() => setEditingTo(false)}
                      onKeyDown={(e) => e.key === 'Enter' && setEditingTo(false)}
                      autoFocus
                      style={{ flex: 1, fontSize: '0.8rem' }}
                    />
                  ) : (
                    <div
                      className="apply-step__attach-chip apply-step__attach-chip--editable"
                      onClick={() => setEditingTo(true)}
                      title="Click to edit"
                    >
                      <span>{toEmail || 'Add email...'}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* CC field */}
              <div className="apply-step__field">
                <span className="apply-step__field-label">CC</span>
                <div className="apply-step__attach-area">
                  {ccEmails.map((ccEmail, idx) => (
                    editingCcIdx === idx ? (
                      <input
                        key={idx}
                        type="email"
                        value={ccEmail}
                        onChange={(e) => {
                          const updated = [...ccEmails];
                          updated[idx] = e.target.value;
                          setCcEmails(updated);
                        }}
                        onBlur={() => setEditingCcIdx(null)}
                        onKeyDown={(e) => e.key === 'Enter' && setEditingCcIdx(null)}
                        autoFocus
                        style={{ fontSize: '0.8rem', width: 200 }}
                      />
                    ) : (
                      <div
                        key={idx}
                        className="apply-step__attach-chip apply-step__attach-chip--editable"
                        onClick={() => setEditingCcIdx(idx)}
                        title="Click to edit"
                      >
                        <span>{ccEmail}</span>
                        <button type="button" onClick={(e) => {
                          e.stopPropagation();
                          setCcEmails((prev) => prev.filter((_, i) => i !== idx));
                        }}>&times;</button>
                      </div>
                    )
                  ))}
                  {showAddCc ? (
                    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <input
                        type="email"
                        placeholder="email@example.com"
                        value={newCcValue}
                        onChange={(e) => setNewCcValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (newCcValue.trim()) {
                              setCcEmails((prev) => [...prev, newCcValue.trim()]);
                              setNewCcValue('');
                              setShowAddCc(false);
                            }
                          }
                          if (e.key === 'Escape') { setNewCcValue(''); setShowAddCc(false); }
                        }}
                        autoFocus
                        style={{ fontSize: '0.8rem', width: 180 }}
                      />
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                        onClick={() => {
                          if (newCcValue.trim()) {
                            setCcEmails((prev) => [...prev, newCcValue.trim()]);
                            setNewCcValue('');
                            setShowAddCc(false);
                          }
                        }}
                      >Add</button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                        onClick={() => { setNewCcValue(''); setShowAddCc(false); }}
                      >&times;</button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="apply-step__attach-btn"
                      onClick={() => setShowAddCc(true)}
                      style={{ fontSize: '0.75rem' }}
                    >
                      + Add CC
                    </button>
                  )}
                </div>
              </div>
                </>
              )}

              {/* Subject field */}
              <div className="apply-step__field">
                <span className="apply-step__field-label">Subject</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>

              {/* Attachments */}
              <div className="apply-step__field">
                <span className="apply-step__field-label">Attach</span>
                <div className="apply-step__attach-area">
                  {claimDocs.map((doc) => (
                    <div key={doc.id} className="apply-step__attach-chip" style={{ cursor: 'pointer' }} onClick={() => handleViewDoc(doc)}>
                      <span>{doc.original_filename}</span>
                    </div>
                  ))}
                  {attachments.map((file, idx) => (
                    <div key={idx} className="apply-step__attach-chip">
                      <span>{file.name}</span>
                      <button type="button" onClick={() => removeAttachment(idx)}>&times;</button>
                    </div>
                  ))}
                  <label className="apply-step__attach-btn">
                    + Add File
                    <input type="file" hidden multiple onChange={handleFileChange} />
                  </label>
                </div>
              </div>

              {/* Email body */}
              <textarea
                className="apply-step__body"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter email content..."
                rows={12}
              />

              {/* Send */}
              <div className="apply-step__compose-actions">
                <button type="submit" className="btn btn--primary" disabled={sending}>
                  {sending ? <Spinner size={18} /> : <><IconSend size={16} /> Send</>}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {docViewUrl && (
        <Modal title={docViewName} onClose={closeDocView} size="lg">
          <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
            {docViewType.startsWith('image/') ? (
              <img src={docViewUrl} alt={docViewName} style={{ maxWidth: '100%', height: 'auto' }} />
            ) : docViewType === 'application/pdf' ? (
              <iframe src={docViewUrl} title={docViewName} style={{ width: '100%', height: '70vh', border: 'none' }} />
            ) : (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <p>Preview not available for this file type.</p>
                <a href={docViewUrl} download={docViewName} className="btn btn--primary" style={{ marginTop: 12 }}>
                  Download
                </a>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Portal-style structured form primitives ─────────────────────────

function PortalShell({ title, subtitle, accent = 'info', onClose, children, footer }) {
  return (
    <div className="portal-form">
      <div className={`portal-form__head portal-form__head--${accent}`}>
        <div className="portal-form__head-text">
          <div className="portal-form__head-title">{title}</div>
          {subtitle && <div className="portal-form__head-sub">{subtitle}</div>}
        </div>
        <button type="button" className="portal-form__close" onClick={onClose} title="Cancel">
          <IconX size={16} />
        </button>
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

function FilesList({ files, onAdd, onRemove, addLabel = 'Add file' }) {
  return (
    <div>
      <div className="portal-form__files">
        {files.map((f, i) => (
          <span key={i} className="apply-step__attach-chip">
            <span>{f.name}</span>
            <button type="button" onClick={() => onRemove(i)}>&times;</button>
          </span>
        ))}
        {files.length === 0 && (
          <span className="portal-form__files-empty">No files attached yet.</span>
        )}
      </div>
      <label className="apply-step__attach-btn portal-form__add-file">
        + {addLabel}
        <input
          type="file"
          hidden
          multiple
          onChange={(e) => {
            const picked = Array.from(e.target.files || []);
            picked.forEach((file) => onAdd(file));
            e.target.value = '';
          }}
        />
      </label>
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

// ── Submit Pre-Auth (initial DRAFT → APPLIED) ───────────────────────

function SubmitPortalForm({ submitResult, onClose, onSubmit, sending, onDocumentsChanged }) {
  const [docViewUrl, setDocViewUrl] = useState(null);
  const [docViewName, setDocViewName] = useState('');
  const [docViewType, setDocViewType] = useState('');

  const closeDocView = () => {
    if (docViewUrl) window.URL.revokeObjectURL(docViewUrl);
    setDocViewUrl(null);
    setDocViewName('');
    setDocViewType('');
  };

  const handleViewDoc = async (doc) => {
    try {
      const res = await documentService.view(submitResult.claim_case_id, doc.id);
      const name = doc.original_filename || doc.name || 'Document';
      // Trust the filename extension over the server's Content-Type since
      // some backends mislabel attachments (matches ClaimSidebar logic).
      const ext = (name.split('.').pop() || '').toLowerCase();
      const extMap = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
        webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
        pdf: 'application/pdf',
      };
      const headerCT = res.headers?.['content-type'] || res.headers?.['Content-Type'] || '';
      const contentType = extMap[ext] || doc.content_type || headerCT || '';
      const url = window.URL.createObjectURL(new Blob([res.data], { type: contentType }));
      setDocViewUrl(url);
      setDocViewName(name);
      setDocViewType(contentType);
    } catch {
      // handled by interceptor
    }
  };

  // The form is now read-only — values are sourced from the saved
  // data_json. The attachments list is an immediate-upload area: each
  // chosen file is POSTed to /claim-cases/:id/documents right away, and
  // each chip can be deleted via DELETE /documents/:id.
  const [localDocs, setLocalDocs] = useState(submitResult.documents || []);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState(null);
  const fileInputRef = useRef(null);
  const [notes, setNotes] = useState('');

  const refreshLocalDocs = async () => {
    try {
      const res = await documentService.list(submitResult.claim_case_id);
      setLocalDocs(Array.isArray(res.data) ? res.data : []);
    } catch {
      // handled by interceptor
    }
  };

  const handleAttachClick = () => fileInputRef.current?.click();

  const handleAttachChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingDoc(true);
    try {
      const fd = new FormData();
      fd.append('files', file);
      await documentService.upload(submitResult.claim_case_id, fd);
      await refreshLocalDocs();
      // Bubble up so the parent can refresh the sidebar's Documents card.
      if (typeof onDocumentsChanged === 'function') onDocumentsChanged();
    } catch {
      // handled by interceptor
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteDoc = async (doc) => {
    setDeletingDocId(doc.id);
    try {
      await documentService.delete(submitResult.claim_case_id, doc.id);
      setLocalDocs((prev) => prev.filter((d) => d.id !== doc.id));
      if (typeof onDocumentsChanged === 'function') onDocumentsChanged();
    } catch {
      // handled by interceptor
    } finally {
      setDeletingDocId(null);
    }
  };

  const canSubmit = !sending;

  const paId = submitResult.pa_number || submitResult.claim_number || submitResult.claim_case_id;
  const dj = submitResult.data_json || {};
  const ti = dj.treating_doctor || {};
  const hosp = dj.hospitalization || {};
  const insured = dj.patient_insured || {};
  const subject = `[${paId}] Cashless Pre-Auth — ${submitResult.patient_name || ''} — ${insured.policy_number || ''}`.trim();
  const body =
    `Dear ${submitResult.insurer_name || 'Claims'} Team,\n\n` +
    `Please find enclosed the cashless pre-authorisation request (Part C) for our patient ${submitResult.patient_name || '—'} ` +
    `(UHID: ${submitResult.uhid || '—'}${insured.policy_number ? `, Policy: ${insured.policy_number}` : ''}).\n\n` +
    `Diagnosis: ${ti.provisional_diagnosis || submitResult.diagnosis || '—'} (ICD-10: ${ti.icd10_code || submitResult.icd10_code || '—'})\n` +
    `Proposed Treatment: ${ti.surgery_name || ti.treatment_details || '—'}\n` +
    `Admission: ${hosp.is_emergency ? 'Emergency' : 'Planned'} — ${hosp.admission_date || '—'}${hosp.admission_time ? ' ' + hosp.admission_time : ''}\n` +
    `Expected Stay: ${hosp.expected_days ?? '—'} day(s)${Number(hosp.icu_days) > 0 ? ' (ICU required)' : ''}\n` +
    `Requested Amount: ${formatINR(Number(hosp.costs?.total_cost) || Number(submitResult.requested_amount) || 0)}\n\n` +
    (notes ? `Clinical notes: ${notes}\n\n` : '') +
    `All supporting documents are attached. Request your earliest review and authorisation.\n\n` +
    `Regards,\nHospital Insurance Desk`;

  const handleSubmit = () => {
    if (!canSubmit) return;
    // Files are already uploaded to the claim's documents endpoint, so
    // we don't re-attach them via the email FormData. Persist a structured
    // formValues so the timeline can render the same submission form
    // read-only on the provider/hospital side instead of the email body.
    const formValues = {
      data_json: submitResult.data_json,
      notes,
      patient_name: submitResult.patient_name || '',
      uhid: submitResult.uhid || '',
      claim_number: submitResult.claim_number || submitResult.pa_number || '',
    };
    onSubmit({ subject, body, files: [], formValues });
  };

  return (
    <PortalShell
      title="Submit Pre-Authorisation"
      subtitle={`To ${submitResult.insurer_name || 'insurer'} · ${paId}`}
      accent="info"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {sending ? <Spinner size={16} /> : <><IconSend size={16} /> Submit to {submitResult.insurer_name || 'insurer'}</>}
          </button>
        </>
      }
    >
      <PortalSection title="Pre-Auth form summary" hint="Read-only — values from the saved form" cols={1}>
        <ReadOnlyForm dataJson={submitResult.data_json} />
      </PortalSection>

      <PortalSection title="Attachments" hint="Mandatory: signed Part C, ID proof, insurance card" cols={1}>
        <Field span={1}>
          <div className="portal-form__files" style={{ marginBottom: 8 }}>
            {localDocs.length === 0 && (
              <span className="portal-form__files-empty">No attachments yet.</span>
            )}
            {localDocs.map((doc) => {
              const name = doc.original_filename || doc.name || 'Document';
              const isDeleting = deletingDocId === doc.id;
              return (
                <span
                  key={doc.id}
                  className="apply-step__attach-chip apply-step__attach-chip--editable"
                  style={{ cursor: 'default' }}
                >
                  <button
                    type="button"
                    onClick={() => handleViewDoc(doc)}
                    title="View"
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      margin: 0,
                      cursor: 'pointer',
                      color: 'inherit',
                      font: 'inherit',
                    }}
                  >
                    {name}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteDoc(doc)}
                    disabled={isDeleting}
                    title="Delete"
                  >
                    {isDeleting ? '…' : '×'}
                  </button>
                </span>
              );
            })}
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={handleAttachClick}
            disabled={uploadingDoc}
            style={{ alignSelf: 'flex-start' }}
          >
            {uploadingDoc ? <Spinner size={14} /> : <><IconPlus size={14} /> Attach document</>}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={handleAttachChange}
          />
        </Field>
      </PortalSection>

      <PortalSection title="Additional clinical notes (optional)" cols={1}>
        <Field span={1}>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any clarifications for the claims team…"
          />
        </Field>
      </PortalSection>

      <EmailPreview
        subject={subject}
        to={submitResult.policy_provider_email}
        cc={submitResult.cc_emails}
        body={body}
      />

      {docViewUrl && (
        <Modal title={docViewName} onClose={closeDocView} size="lg">
          <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
            {docViewType.startsWith('image/') ? (
              <img src={docViewUrl} alt={docViewName} style={{ maxWidth: '100%', height: 'auto' }} />
            ) : docViewType === 'application/pdf' ? (
              <iframe src={docViewUrl} title={docViewName} style={{ width: '100%', height: '70vh', border: 'none' }} />
            ) : (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <p>Preview not available for this file type.</p>
                <a href={docViewUrl} download={docViewName} className="btn btn--primary" style={{ marginTop: 12 }}>
                  Download
                </a>
              </div>
            )}
          </div>
        </Modal>
      )}
    </PortalShell>
  );
}

// ── Enhancement form (PARTIALLY_APPROVED) ───────────────────────────

function EnhancePortalForm({ submitResult, onClose, onSubmit, sending }) {
  const [reasonCat, setReasonCat] = useState('Extended ICU stay');
  const [reasonDetail, setReasonDetail] = useState('');
  const [additional, setAdditional] = useState('');
  const [files, setFiles] = useState([]);

  const additionalNum = Number(additional) || 0;
  const approvedSoFar = Number(submitResult.approved_amount) || 0;
  const revisedTotal = approvedSoFar + additionalNum;

  const canSubmit = additionalNum > 0 && reasonDetail.trim().length > 0 && !sending;

  const paId = submitResult.pa_number || submitResult.claim_number || submitResult.claim_case_id;
  const subject = `[${paId}] Enhancement Request — ${submitResult.patient_name || ''}`.trim();
  const body =
    `Dear ${submitResult.insurer_name || 'Claims'} Team,\n\n` +
    `With reference to the approval received against ${paId} for ${submitResult.patient_name || '—'} ` +
    `(UHID: ${submitResult.uhid || '—'}), we request an enhancement of cover.\n\n` +
    `Reason: ${reasonCat}\n` +
    `Details: ${reasonDetail || '—'}\n` +
    `Approved so far: ${formatINR(submitResult.approved_amount)}\n` +
    `Additional amount requested: ${formatINR(additionalNum)}\n` +
    `Revised total: ${formatINR(revisedTotal)}\n` +
    `\nRevised invoices and clinical notes are attached.\n\n` +
    `Regards,\nHospital Insurance Desk`;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const formValues = {
      claim_number: submitResult.claim_number || submitResult.pa_number || '',
      patient_name: submitResult.patient_name || '',
      uhid: submitResult.uhid || '',
      reason_category: reasonCat,
      reason_detail: reasonDetail,
      additional_amount: additionalNum,
      approved_so_far: approvedSoFar,
      revised_total: revisedTotal,
    };
    onSubmit({ subject, body, files, formValues });
  };

  return (
    <PortalShell
      title="Enhancement Request"
      subtitle={`Additional cover from ${submitResult.insurer_name || 'insurer'}`}
      accent="info"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {sending ? <Spinner size={16} /> : <><IconSend size={16} /> Submit enhancement</>}
          </button>
        </>
      }
    >
      <PortalSection title="Patient & current authorisation" cols={3}>
        <ReadField
          label="Patient"
          value={`${submitResult.patient_name || '—'} · ${submitResult.uhid || '—'}`}
          span={2}
        />
        <ReadField label="Insurer" value={submitResult.insurer_name || '—'} />
        <ReadField label="Originally requested" value={formatINR(submitResult.requested_amount)} />
        <ReadField
          label="Approved so far"
          value={
            <span style={{ color: '#16a34a', fontWeight: 700 }}>
              {formatINR(submitResult.approved_amount)}
            </span>
          }
        />
        <ReadField
          label="Diagnosis"
          value={`${submitResult.diagnosis || '—'}${submitResult.icd10_code ? ` (${submitResult.icd10_code})` : ''}`}
        />
      </PortalSection>

      <PortalSection title="Reason for enhancement" cols={2}>
        <Field label="Category" required>
          <select value={reasonCat} onChange={(e) => setReasonCat(e.target.value)}>
            <option>Extended ICU stay</option>
            <option>Additional procedure performed</option>
            <option>Higher-end implant / consumable used</option>
            <option>Treatment escalation (e.g. surgical from medical)</option>
            <option>Length of stay extended</option>
            <option>Complication / new diagnosis</option>
            <option>Other</option>
          </select>
        </Field>
        <Field
          label="Clinical justification"
          required
          hint="Cite progress notes, vital trends, ICU days, etc."
          span={2}
        >
          <textarea
            rows={4}
            value={reasonDetail}
            onChange={(e) => setReasonDetail(e.target.value)}
            placeholder="e.g. Patient continued in ICU on day 4 post-op due to sustained tachycardia and low EF (32%); cardiology advised 48h further monitoring…"
          />
        </Field>
      </PortalSection>

      <PortalSection
        title="Amount"
        hint="Enter only the additional amount over what's already approved"
        cols={3}
      >
        <ReadField label="Approved already" value={formatINR(submitResult.approved_amount)} />
        <Field label="Additional requested (₹)" required>
          <input
            type="number"
            value={additional}
            onChange={(e) => setAdditional(e.target.value)}
            placeholder="e.g. 70000"
            min="0"
          />
        </Field>
        <ReadField
          label="Revised total"
          value={
            <span style={{ color: '#4f46e5', fontWeight: 700 }}>{formatINR(revisedTotal)}</span>
          }
        />
      </PortalSection>

      <PortalSection
        title="Supporting documents"
        hint="Revised invoices, ICU notes, lab reports"
        cols={1}
      >
        <Field span={1}>
          <FilesList
            files={files}
            onAdd={(f) => setFiles((prev) => [...prev, f])}
            onRemove={(i) => setFiles((prev) => prev.filter((_, ix) => ix !== i))}
            addLabel="Attach Supporting Document"
          />
        </Field>
      </PortalSection>

      <EmailPreview
        subject={subject}
        to={submitResult.policy_provider_email}
        cc={submitResult.cc_emails}
        body={body}
      />
    </PortalShell>
  );
}

// ── ADR submission form (ADR_NMI) ───────────────────────────────────

const DEFAULT_ADR_CHECKLIST = [
  'LMP / EDD certificate',
  'First-consultation papers',
  'ID / address proof',
  'Treating doctor clarification note',
];

function ADRPortalForm({ submitResult, adrEmails, onClose, onSubmit, sending }) {
  // Prefer the latest OPEN ADR query log (structured data with documents_list)
  // and fall back to the most recent ADR query if none are open.
  const latestAdrQuery = useMemo(() => {
    const logs = Array.isArray(submitResult.query_logs) ? submitResult.query_logs : [];
    const adrQueries = logs.filter((q) => q.query_type === 'ADR_NMI');
    if (adrQueries.length === 0) return null;
    const open = adrQueries.filter((q) => q.status === 'OPEN');
    const pool = open.length > 0 ? open : adrQueries;
    return [...pool].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
  }, [submitResult.query_logs]);

  const latestAdrEmail = useMemo(() => {
    if (!Array.isArray(adrEmails) || adrEmails.length === 0) return null;
    return [...adrEmails]
      .sort((a, b) => new Date(b.email_date || 0) - new Date(a.email_date || 0))[0];
  }, [adrEmails]);

  // Seed checklist from the latest ADR query: documents_list (array) > documents_requested (comma-split) > hardcoded default.
  const initialItems = useMemo(() => {
    if (Array.isArray(latestAdrQuery?.documents_list) && latestAdrQuery.documents_list.length > 0) {
      return latestAdrQuery.documents_list.map((label) => ({ label, attached: false, file: null }));
    }
    if (typeof latestAdrQuery?.documents_requested === 'string' && latestAdrQuery.documents_requested.trim()) {
      const labels = latestAdrQuery.documents_requested
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (labels.length > 0) {
        return labels.map((label) => ({ label, attached: false, file: null }));
      }
    }
    return DEFAULT_ADR_CHECKLIST.map((label) => ({ label, attached: false, file: null }));
  }, [latestAdrQuery]);

  const [items, setItems] = useState(initialItems);
  const [extraFiles, setExtraFiles] = useState([]);
  const [clarification, setClarification] = useState('');

  const setItem = (idx, patch) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const attachedCount = items.filter((it) => it.attached).length;
  const allMandatoryDone = items.every((it) => it.attached);
  const canSubmit = (items.some((it) => it.attached) || extraFiles.length > 0) && !sending;

  const paId = submitResult.pa_number || submitResult.claim_number || submitResult.claim_case_id;
  const subject = `[${paId}] ADR Response — ${submitResult.patient_name || ''}`.trim();

  const attachedFilesForEmail = items.filter((it) => it.attached && it.file).map((it) => it.file);
  const allFiles = [...attachedFilesForEmail, ...extraFiles];

  const checklistLines = items
    .filter((it) => it.attached)
    .map((it) => `• ${it.label}${it.file ? ` — ${it.file.name}` : ''}`)
    .join('\n');
  const extraLines = extraFiles.length
    ? `\nAdditional documents:\n${extraFiles.map((f) => `• ${f.name}`).join('\n')}\n`
    : '';

  const body =
    `Dear ${submitResult.insurer_name || 'Claims'} Team,\n\n` +
    `In response to your additional document request for ${submitResult.patient_name || '—'} ` +
    `(${paId}, UHID: ${submitResult.uhid || '—'}), please find the requested documents:\n\n` +
    `${checklistLines || '(none yet)'}\n` +
    extraLines +
    (clarification ? `\nClarifications: ${clarification}\n` : '') +
    `\nKindly process at the earliest.\n\n` +
    `Regards,\nHospital Insurance Desk`;

  // Labels of the checked checklist rows — sent as `documents_list` so the
  // backend can record exactly which insurer-requested items the hospital is
  // responding to (separate from filename-only attachments).
  const documentsList = items.filter((it) => it.attached).map((it) => it.label);

  const handleSubmit = () => {
    if (!canSubmit) return;
    const formValues = {
      claim_number: submitResult.claim_number || submitResult.pa_number || '',
      patient_name: submitResult.patient_name || '',
      uhid: submitResult.uhid || '',
      items: items.map((it) => ({
        label: it.label,
        attached: !!it.attached,
        filename: it.file ? it.file.name : null,
      })),
      documents_list: documentsList,
      clarification,
    };
    onSubmit({ subject, body, files: allFiles, documentsList, formValues });
  };

  const insurerQuoteText =
    latestAdrQuery?.query_details ||
    latestAdrQuery?.documents_requested ||
    latestAdrEmail?.subject ||
    latestAdrEmail?.content ||
    'Additional documents requested.';
  const quoteTimestamp = latestAdrQuery?.created_at || latestAdrEmail?.email_date || null;
  const insurerQuoteMeta = quoteTimestamp
    ? `${submitResult.insurer_name || 'Insurer'} Claims · ${new Date(quoteTimestamp).toLocaleString('en-IN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).replace(',', '')}`
    : `${submitResult.insurer_name || 'Insurer'} Claims`;

  return (
    <PortalShell
      title="Submit Additional Documents (ADR Response)"
      subtitle={`Replying to ${submitResult.insurer_name || 'insurer'}`}
      accent="warning"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {sending ? <Spinner size={16} /> : <><IconSend size={16} /> Submit response ({attachedCount + extraFiles.length} files)</>}
          </button>
        </>
      }
    >
      <div className="portal-form__quote portal-form__quote--warning">
        <div className="portal-form__quote-label">Insurer's request</div>
        <div className="portal-form__quote-text">"{insurerQuoteText}"</div>
        <div className="portal-form__quote-meta">{insurerQuoteMeta}</div>
      </div>

      <PortalSection
        title="Documents requested"
        hint={`${attachedCount} of ${items.length} attached`}
        cols={1}
      >
        <div className="portal-form__adr-list">
          {items.map((it, i) => (
            <div key={i} className="portal-form__adr-row">
              <label className="portal-form__adr-check">
                <input
                  type="checkbox"
                  checked={it.attached}
                  onChange={(e) => setItem(i, { attached: e.target.checked, file: e.target.checked ? it.file : null })}
                />
                <span className="portal-form__adr-label">{it.label}</span>
                {!it.attached ? (
                  <span className="portal-form__adr-tag">Required</span>
                ) : (
                  <span className="portal-form__adr-tag portal-form__adr-tag--done">
                    <IconCheck size={12} /> Attached
                  </span>
                )}
              </label>
              {it.attached && (
                <div className="portal-form__adr-file">
                  {it.file ? (
                    <span className="apply-step__attach-chip">
                      <span>{it.file.name}</span>
                      <button type="button" onClick={() => setItem(i, { file: null })}>&times;</button>
                    </span>
                  ) : (
                    <label className="apply-step__attach-btn">
                      + Upload file
                      <input
                        type="file"
                        hidden
                        onChange={(e) => {
                          const picked = e.target.files?.[0];
                          if (picked) setItem(i, { file: picked });
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>
              )}
            </div>
          ))}
          <button
            type="button"
            className="apply-step__attach-btn portal-form__adr-add"
            onClick={() => {
              const label = window.prompt('Document the insurer asked for:');
              if (label && label.trim()) {
                setItems((prev) => [...prev, { label: label.trim(), attached: false, file: null }]);
              }
            }}
          >
            <IconPlus size={12} /> Add another requested item
          </button>
        </div>
      </PortalSection>

      <PortalSection title="Additional documents (optional)" cols={1}>
        <Field span={1}>
          <FilesList
            files={extraFiles}
            onAdd={(f) => setExtraFiles((prev) => [...prev, f])}
            onRemove={(i) => setExtraFiles((prev) => prev.filter((_, ix) => ix !== i))}
            addLabel="Attach supporting document"
          />
        </Field>
      </PortalSection>

      <PortalSection title="Clarifications to claims team (optional)" cols={1}>
        <Field span={1}>
          <textarea
            rows={3}
            value={clarification}
            onChange={(e) => setClarification(e.target.value)}
            placeholder="e.g. The address mismatch is because the patient relocated 3 months ago; updated address proof attached…"
          />
        </Field>
      </PortalSection>

      {!allMandatoryDone && (
        <div className="portal-form__notice">
          <IconAlertCircle size={16} />
          <div>
            <strong>{items.length - attachedCount} requested item(s) still not attached.</strong>{' '}
            You can submit a partial response, but insurer may raise another ADR.
          </div>
        </div>
      )}

      <EmailPreview
        subject={subject}
        to={submitResult.policy_provider_email}
        cc={submitResult.cc_emails}
        body={body}
      />
    </PortalShell>
  );
}

// ── Reconsideration form (DENIED) ───────────────────────────────────

const RECONSIDER_GROUNDS = [
  'Medical necessity',
  'Pre-existing disease — clarification',
  'Policy interpretation / sub-limit',
  'Documentation already provided',
  'Treatment within policy scope',
  'Emergency override',
  'Other',
];

function ReconsiderPortalForm({ submitResult, onClose, onSubmit, sending }) {
  const denialEntry = useMemo(() => {
    const history = submitResult.status_history || [];
    return [...history].reverse().find((e) => e.status === 'DENIED') || null;
  }, [submitResult.status_history]);

  const [grounds, setGrounds] = useState(RECONSIDER_GROUNDS[0]);
  const [justification, setJustification] = useState('');
  const [requestedAmount, setRequestedAmount] = useState(submitResult.requested_amount || '');
  const [doctorName, setDoctorName] = useState('');
  const [doctorQualification, setDoctorQualification] = useState('');
  const [doctorRegistration, setDoctorRegistration] = useState('');
  const [doctorContact, setDoctorContact] = useState('');
  const [files, setFiles] = useState([]);
  const [escalate, setEscalate] = useState(false);

  const canSubmit = justification.trim().length > 0 && !sending;

  const denialNote = denialEntry?.remarks || 'Pre-auth denied.';
  const paId = submitResult.pa_number || submitResult.claim_number || submitResult.claim_case_id;
  const subject = `[${paId}] Reconsideration Request — ${submitResult.patient_name || ''}`.trim();
  const doctorLine = doctorName
    ? `Co-signing physician: ${doctorName}${doctorQualification ? ` (${doctorQualification}` : ''}${doctorRegistration ? `${doctorQualification ? ', ' : ' ('}Reg. ${doctorRegistration}` : ''}${doctorQualification || doctorRegistration ? ')' : ''}${doctorContact ? ` · ${doctorContact}` : ''}\n`
    : '';
  const body =
    `Dear ${submitResult.insurer_name || 'Claims'} Team,\n\n` +
    `We respectfully request reconsideration of the denial against ${paId} for ${submitResult.patient_name || '—'} ` +
    `(UHID: ${submitResult.uhid || '—'}).\n\n` +
    `Denial reason cited: ${denialNote}\n\n` +
    `Grounds for reconsideration: ${grounds}\n` +
    `Detailed justification: ${justification || '—'}\n` +
    `Amount being claimed: ${formatINR(Number(requestedAmount) || 0)}\n` +
    doctorLine +
    (escalate ? `\nThis case is being escalated to your medical review board for second opinion.\n` : '') +
    `\nSupporting clinical documentation is attached.\n\n` +
    `Regards,\nHospital Insurance Desk`;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const formValues = {
      claim_number: submitResult.claim_number || submitResult.pa_number || '',
      patient_name: submitResult.patient_name || '',
      uhid: submitResult.uhid || '',
      denial_reason: denialEntry?.remarks || '',
      grounds,
      justification,
      amount: Number(requestedAmount) || 0,
      co_signing_physician: {
        name: doctorName,
        specialty: doctorQualification,
        reg: doctorRegistration,
        remarks: doctorContact,
      },
      escalate,
    };
    onSubmit({ subject, body, files, formValues });
  };

  const denialMeta = denialEntry?.created_at
    ? `${submitResult.insurer_name || 'Insurer'} Claims · ${new Date(denialEntry.created_at).toLocaleString('en-IN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).replace(',', '')}`
    : `${submitResult.insurer_name || 'Insurer'} Claims`;

  return (
    <PortalShell
      title="Reconsideration Request"
      subtitle={`Appeal denial from ${submitResult.insurer_name || 'insurer'}`}
      accent="danger"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {sending ? <Spinner size={16} /> : <><IconSend size={16} /> Submit reconsideration</>}
          </button>
        </>
      }
    >
      <div className="portal-form__quote portal-form__quote--danger">
        <div className="portal-form__quote-label">Insurer's denial reason</div>
        <div className="portal-form__quote-text">"{denialNote}"</div>
        <div className="portal-form__quote-meta">{denialMeta}</div>
      </div>

      <PortalSection title="Grounds for reconsideration" cols={2}>
        <Field label="Grounds" required>
          <select value={grounds} onChange={(e) => setGrounds(e.target.value)}>
            {RECONSIDER_GROUNDS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Amount being claimed (₹)" required>
          <input
            type="number"
            value={requestedAmount}
            onChange={(e) => setRequestedAmount(e.target.value)}
            min="0"
          />
        </Field>
        <Field
          label="Detailed clinical & policy justification"
          required
          hint="Reference clinical guidelines, policy clauses, prior consultation history"
          span={2}
        >
          <textarea
            rows={5}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="e.g. Patient has documented HTN since 2019 (prior to policy inception); the claim of PED non-disclosure is incorrect — see attached medical records from 2020 onwards…"
          />
        </Field>
      </PortalSection>

      <PortalSection title="Co-signing physician" hint="Senior physician supporting the appeal" cols={2}>
        <Field label="Doctor name" span={2}>
          <input
            type="text"
            value={doctorName}
            onChange={(e) => setDoctorName(e.target.value)}
            placeholder="e.g. Dr. Anjali Rao"
          />
        </Field>
        <Field label="Qualification">
          <input
            type="text"
            value={doctorQualification}
            onChange={(e) => setDoctorQualification(e.target.value)}
            placeholder="e.g. MD, DM (Cardiology)"
          />
        </Field>
        <Field label="Registration No.">
          <input
            type="text"
            value={doctorRegistration}
            onChange={(e) => setDoctorRegistration(e.target.value)}
            placeholder="e.g. MCI-12345"
          />
        </Field>
        <Field label="Contact" span={2}>
          <input
            type="text"
            value={doctorContact}
            onChange={(e) => setDoctorContact(e.target.value)}
            placeholder="Phone or email"
          />
        </Field>
      </PortalSection>

      <PortalSection
        title="Supporting documents"
        hint="Prior consultation records, lab reports, clinical guidelines"
        cols={1}
      >
        <Field span={1}>
          <FilesList
            files={files}
            onAdd={(f) => setFiles((prev) => [...prev, f])}
            onRemove={(i) => setFiles((prev) => prev.filter((_, ix) => ix !== i))}
            addLabel="Attach supporting document"
          />
        </Field>
      </PortalSection>

      <PortalSection title="Escalation" cols={1}>
        <Field span={1}>
          <label className="portal-form__toggle">
            <input
              type="checkbox"
              checked={escalate}
              onChange={(e) => setEscalate(e.target.checked)}
            />
            <span>Escalate to insurer's medical review board for second opinion</span>
          </label>
        </Field>
      </PortalSection>

      <EmailPreview
        subject={subject}
        to={submitResult.policy_provider_email}
        cc={submitResult.cc_emails}
        body={body}
      />
    </PortalShell>
  );
}

// ── Main component ──────────────────────────────────────────────────

export default function PreAuthForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const backPath = location.state?.from || '/claim-list';
  const { claimCaseId: routeClaimCaseId } = useParams();
  const [loadingCase, setLoadingCase] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [claimEmails, setClaimEmails] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showUnreadPopup, setShowUnreadPopup] = useState(false);

  // Timeline reply compose state
  const [showReplyCompose, setShowReplyCompose] = useState(false);
  const [replyEmailType, setReplyEmailType] = useState(null);
  const [portalSending, setPortalSending] = useState(false);

  // Status-timeline → "View Email" modal state
  const [viewedEmail, setViewedEmail] = useState(null);
  const [loadingViewedEmail, setLoadingViewedEmail] = useState(false);
  // Attachment preview within the email modal
  const [emailAttView, setEmailAttView] = useState(null); // { url, filename, contentType }

  const handleViewStatusEmail = async (emailId) => {
    if (!emailId || !routeClaimCaseId) return;
    setLoadingViewedEmail(true);
    setViewedEmail({ loading: true });
    try {
      const res = await claimCaseService.getEmailDetail(routeClaimCaseId, emailId);
      setViewedEmail(res.data);
    } catch {
      setViewedEmail(null);
    } finally {
      setLoadingViewedEmail(false);
    }
  };

  const closeViewedEmail = () => {
    setViewedEmail(null);
    if (emailAttView?.url) window.URL.revokeObjectURL(emailAttView.url);
    setEmailAttView(null);
  };

  const viewEmailAttachment = async (att) => {
    if (!viewedEmail?.id) return;
    try {
      const res = await claimCaseService.viewAttachment(
        routeClaimCaseId, viewedEmail.id, att.id,
      );
      const contentType = res.headers?.['content-type'] || att.content_type || '';
      const url = window.URL.createObjectURL(new Blob([res.data], { type: contentType }));
      setEmailAttView({
        url,
        filename: att.original_filename || 'attachment',
        contentType,
      });
    } catch {
      // handled by interceptor
    }
  };

  const closeEmailAttView = () => {
    if (emailAttView?.url) window.URL.revokeObjectURL(emailAttView.url);
    setEmailAttView(null);
  };

  // Load claim case + emails
  const loadClaimData = async (showLoader = true) => {
    if (!routeClaimCaseId) return;
    if (showLoader) setLoadingCase(true);
    try {
      const [caseRes, emailsRes, docsRes] = await Promise.all([
        claimCaseService.getById(routeClaimCaseId),
        claimCaseService.getAllEmails(routeClaimCaseId, { is_read: true }).catch(() => ({ data: [] })),
        documentService.list(routeClaimCaseId).catch(() => ({ data: [] })),
      ]);
      const cc = caseRes.data;
      const latestForm = Array.isArray(cc.form_data) && cc.form_data.length > 0
        ? cc.form_data[cc.form_data.length - 1]
        : null;

      const summary = cc.summary || {};
      const dj = latestForm?.data_json || {};
      const insured = dj.patient_insured || {};
      const doctor = dj.treating_doctor || {};
      const hospitalization = dj.hospitalization || {};
      setSubmitResult({
        claim_case_id: cc.id,
        form_data_id: latestForm?.id,
        status: cc.status,
        claim_status: cc.claim_status,
        claim_number: cc.claim_number || '',
        approved_amount: cc.approved_amount ?? '',
        query_logs: cc.query_logs || [],
        policy_provider_email: cc.policy_provider_email || '',
        cc_emails: Array.isArray(cc.cc_emails) ? cc.cc_emails : [],
        is_onboarded: cc.is_onboarded === true,
        status_history: cc.status_history || [],
        // from cc.summary
        pa_number: cc.pa_number || cc.claim_number,
        patient_name: summary.patient_name,
        uhid: summary.uhid,
        insurer_name: summary.provider_name,
        requested_amount: summary.requested_amount,
        diagnosis: summary.diagnosis,
        icd10_code: summary.icd_10,
        submitted_at: latestForm?.created_at || cc.created_at || null,
        // from latestForm.data_json — for sidebar cards
        policy_number: insured.policy_number || '',
        corporate_name: insured.corporate_name || '',
        insured_card_id: insured.insured_card_id || '',
        doctor_name: doctor.doctor_name || '',
        doctor_qualification: doctor.qualification || doctor.doctor_qualification || '',
        doctor_registration: doctor.registration || doctor.registration_number || doctor.doctor_registration || '',
        doctor_contact: doctor.contact || doctor.contact_number || doctor.doctor_contact || '',
        // Hospitalization / treatment — for the SubmitPortalForm prefill
        treatment: doctor.surgery_name || doctor.treatment_details || doctor.treatment_plan || '',
        admission_mode: hospitalization.is_emergency ? 'Emergency' : 'Planned',
        admission_date: hospitalization.admission_date || '',
        admission_time: hospitalization.admission_time || '',
        expected_stay: hospitalization.expected_days ?? '',
        icu_required: Number(hospitalization.icu_days) > 0,
        // Raw data_json — needed by the inline Print-to-PDF flow so it can
        // populate every template field, not just the ones surfaced above.
        data_json: dj,
        // Top-level header_info on the claim case (sibling of form_data),
        // used by the print template's header section. Falls back to the
        // form_data section name some backends use (tpa_insurer_hospital)
        // if header_info isn't present at the top level.
        header_info:
          cc.header_info
          || dj.tpa_insurer_hospital
          || dj.header_info
          || {},
        // Merge: form docs (from GET /documents) + top-level cc.documents
        documents: Array.isArray(docsRes.data) && docsRes.data.length > 0
          ? docsRes.data
          : (Array.isArray(cc.documents) ? cc.documents : []),
      });
      const count = cc.unread_count || 0;
      setUnreadCount(count);
      if (count > 0) setShowUnreadPopup(true);
      setClaimEmails(Array.isArray(emailsRes.data) ? emailsRes.data : []);
    } catch {
      // handled by interceptor
    } finally {
      if (showLoader) setLoadingCase(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (routeClaimCaseId && !cancelled) loadClaimData();
    return () => { cancelled = true; };
  }, [routeClaimCaseId]);

  const handleRefresh = () => loadClaimData(false);

  const handleTimelineReplySuccess = async () => {
    setShowReplyCompose(false);
    setReplyEmailType(null);
    await handleRefresh();
  };

  const raiseActionByStatus = {
    APPROVED:           { label: 'Enhance Submit', emailType: 'ENHANCE_SUBMITTED' },
    PARTIALLY_APPROVED: { label: 'Enhance Submit', emailType: 'ENHANCE_SUBMITTED' },
    DENIED:             { label: 'Reconsider',     emailType: 'RECONSIDER' },
    ADR_NMI:            { label: 'ADR Submit',     emailType: 'ADR_SUBMITTED' },
  };
  const raiseAction = raiseActionByStatus[submitResult?.claim_status] || { label: 'Raise Enhance', emailType: 'ENHANCE_SUBMITTED' };

  const handleRaiseEnhance = () => {
    setShowReplyCompose(true);
    setReplyEmailType(raiseAction.emailType);
  };

  // Partition emails into category buckets (both directions)
  const { enhanceEmails, adrEmails, reconsiderEmails } = useMemo(() => {
    const inBucket = (email, types) => types.includes(email.email_type);
    return {
      enhanceEmails: claimEmails.filter((e) => inBucket(e, ENHANCE_TYPES)),
      adrEmails: claimEmails.filter((e) => inBucket(e, ADR_TYPES)),
      reconsiderEmails: claimEmails.filter((e) => inBucket(e, RECONSIDER_TYPES)),
    };
  }, [claimEmails]);

  // Hide the raise button when the last status_history entry is a _SUBMITTED state.
  const SUBMITTED_STAGE_STATUSES = ['ADR_SUBMITTED', 'ENHANCE_SUBMITTED', 'RECONSIDER', 'RECONSIDER_SUBMITTED'];
  const statusHistory = submitResult?.status_history || submitResult?.query_logs || [];
  // The API returns status_history newest → oldest, so we can't just take the
  // tail element — pick the one with the latest created_at to be safe
  // regardless of API ordering.
  const latestEntry = statusHistory.length > 0
    ? statusHistory.reduce((acc, e) => (
        !acc || new Date(e.created_at || 0) > new Date(acc.created_at || 0) ? e : acc
      ), null)
    : null;
  const latestStageStatus = latestEntry?.status || null;
  const alreadyRaised = SUBMITTED_STAGE_STATUSES.includes(latestStageStatus);
  // Claim is still a draft (initial pre-auth email hasn't been sent).
  const isDraft = latestStageStatus === 'DRAFT' || statusHistory.length === 0;
  const showRaiseBtn = !isDraft && Boolean(raiseActionByStatus[submitResult?.claim_status]) && !alreadyRaised;

  const handleSubmitPreAuth = () => {
    setShowReplyCompose(true);
    setReplyEmailType('APPLIED');
  };

  // Print Part C — fetches the form template, populates fields with the
  // claim's data_json, writes into a hidden iframe, then triggers the
  // browser's native print dialog (where the user can pick "Save as PDF").
  // No navigation; no html2pdf — pixel-perfect to what the browser renders.
  const [printingPartC, setPrintingPartC] = useState(false);
  const handlePrintPartC = async () => {
    if (!submitResult) return;
    setPrintingPartC(true);
    try {
      const listRes = await formTemplateService.getAll();
      const templates = Array.isArray(listRes?.data) ? listRes.data : [];
      const first = templates[0];
      if (!first?.id) {
        toast.error('No form template available for this claim');
        return;
      }
      const tplRes = await formTemplateService.getById(first.id);
      const html = tplRes?.data?.html_content || '';
      if (!html) {
        toast.error('Template has no content');
        return;
      }

      // Flatten data_json the same way PreAuthFormPage / PreAuthPrint do.
      const flattenDataJson = (dj) => {
        const flat = {};
        for (const [, sectionData] of Object.entries(dj || {})) {
          if (!sectionData || typeof sectionData !== 'object' || Array.isArray(sectionData)) continue;
          for (const [k, v] of Object.entries(sectionData)) {
            if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
              for (const [sk, sv] of Object.entries(v)) flat[sk] = sv;
            } else {
              flat[k] = v;
            }
          }
        }
        const decl = dj?.declaration || {};
        if (decl.doctor_name) flat.decl_doctor_name = decl.doctor_name;
        const pd = dj?.patient_declaration || {};
        if (pd.patient_name) flat.pd_patient_name = pd.patient_name;
        if (pd.contact_number) flat.pd_contact_number = pd.contact_number;
        if (pd.email) flat.pd_email = pd.email;
        if (pd.date) flat.pd_date = pd.date;
        if (pd.time) flat.pd_time = pd.time;
        return flat;
      };
      const flat = flattenDataJson(submitResult.data_json || {});

      // Layer claim-case-level fields on top so template keys like
      // {uhid, pa_number, claim_number, insurer_name, requested_amount,
      // approved_amount, patient_name, diagnosis, icd_10} also fill in,
      // even when they live on the claim case rather than data_json.
      // submitResult-level values win over data_json values where they overlap.
      const overlay = {
        uhid: submitResult.uhid,
        pa_number: submitResult.pa_number,
        claim_number: submitResult.claim_number,
        insurer_name: submitResult.insurer_name,
        provider_name: submitResult.insurer_name,
        policy_provider_name: submitResult.insurer_name,
        policy_provider_email: submitResult.policy_provider_email,
        patient_name: submitResult.patient_name,
        diagnosis: submitResult.diagnosis,
        icd_10: submitResult.icd10_code,
        icd10_code: submitResult.icd10_code,
        requested_amount: submitResult.requested_amount,
        approved_amount: submitResult.approved_amount,
      };
      // Derived helpers a template may expect.
      if (flat.is_emergency !== undefined) {
        overlay.admission_mode = flat.is_emergency ? 'Emergency' : 'Planned';
      }
      Object.entries(overlay).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') flat[k] = v;
      });

      // Header / hospital identity fields — the template's data-field keys
      // are the full names (tpa_name, hospital_name, etc.) sourced from
      // cc.header_info (top-level on the claim case).
      const headerInfo = submitResult.header_info || {};
      const headerMap = {
        tpa_name: headerInfo.tpa_name,
        tpa_toll_free_phone: headerInfo.tpa_toll_free_phone,
        tpa_toll_free_fax: headerInfo.tpa_toll_free_fax,
        hospital_name: headerInfo.hospital_name,
        hospital_address: headerInfo.hospital_address,
        hospital_rohini_id: headerInfo.hospital_rohini_id,
        hospital_email: headerInfo.hospital_email,
      };
      Object.entries(headerMap).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') flat[k] = v;
      });

      // Doctor / declaration fields the template uses with slightly different
      // names than what we extract.
      const doctorMap = {
        doctor_qualification: submitResult.doctor_qualification,
        doctor_registration_number: submitResult.doctor_registration,
        doctor_contact: submitResult.doctor_contact,
      };
      Object.entries(doctorMap).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') flat[k] = v;
      });

      // The template has paired checkbox/radio data-fields for booleans —
      // e.g. data-field="is_emergency_yes" and data-field="is_emergency_no".
      // Derive those paired keys from the underlying boolean so our
      // populate's checkbox branch can tick the right one.
      const truthy = (v) => v === true || v === 'true' || v === 'Yes' || v === 'yes';
      const falsy = (v) => v === false || v === 'false' || v === 'No' || v === 'no';
      const boolPairs = [
        'is_emergency',
        'has_other_insurance',
        'has_family_physician',
        'is_rta',
        'reported_to_police',
        'substance_abuse',
        'test_conducted',
      ];
      boolPairs.forEach((k) => {
        const v = flat[k];
        if (truthy(v)) flat[`${k}_yes`] = true;
        else if (falsy(v)) flat[`${k}_no`] = true;
      });

      // Gender splits into three checkboxes: gender_male / gender_female / gender_third.
      const gender = String(flat.gender || '').toLowerCase().trim();
      if (gender === 'male' || gender === 'm') flat.gender_male = true;
      else if (gender === 'female' || gender === 'f') flat.gender_female = true;
      else if (gender === 'third' || gender === 'other' || gender === 'transgender') flat.gender_third = true;

      // Reuse / create the off-screen iframe — same pattern as
      // PreAuthFormPage.populateAndPrint.
      let iframe = document.getElementById('print-frame');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'print-frame';
        iframe.style.cssText = 'position:fixed;width:0;height:0;border:none;left:-9999px;';
        document.body.appendChild(iframe);
      }

      const populate = () => {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return 0;
        let populated = 0;
        const missingFields = [];
        doc.querySelectorAll('[data-field]').forEach((el) => {
          const field = el.getAttribute('data-field');
          const value = flat[field];
          if (value === undefined || value === null || value === '') {
            missingFields.push(field);
            return;
          }
          const tag = el.tagName.toLowerCase();
          if (el.type === 'radio') {
            if (el.value === String(value)) el.checked = true;
          } else if (el.type === 'checkbox') {
            el.checked = !!value;
          } else if (tag === 'input' || tag === 'textarea') {
            el.value = value;
            // Set the attribute too so static print serialisation picks it up
            // even when browsers print from the source HTML rather than DOM.
            el.setAttribute('value', String(value));
          } else if (tag === 'select') {
            el.value = value;
            el.querySelectorAll('option').forEach((opt) => {
              if (opt.value === String(value)) opt.setAttribute('selected', 'selected');
            });
          } else {
            // span / div / td / u / etc. — text-only elements need textContent.
            el.textContent = String(value);
          }
          populated += 1;
        });
        console.info('[Print Part C] populated', populated, 'fields; missing:', [...new Set(missingFields)], 'flat keys:', Object.keys(flat));
        return populated;
      };

      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();
      // The "Save as PDF" filename comes from the document title. Browsers
      // diverge on which title they use — Chrome on Linux/Windows uses the
      // PARENT page's title, others use the iframe's. Set both, restoring
      // the parent's afterwards so the app's normal title isn't left
      // mutated.
      const printTitle = submitResult?.claim_case_id || 'pre-auth-form';
      const originalParentTitle = document.title;
      doc.title = printTitle;
      document.title = printTitle;

      // Print only after onload, so the doc is fully parsed and all fields
      // exist before the print dialog opens. Populating synchronously first
      // is harmless (sets values on whatever's already parsed); the
      // onload-time call covers any nodes that were still being parsed.
      populate();
      iframe.onload = () => {
        populate();
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        // Restore the parent title once the dialog is dismissed (or after
        // a brief delay if the print call is async on this browser).
        setTimeout(() => { document.title = originalParentTitle; }, 1000);
      };
    } catch {
      // axios interceptor surfaces the toast on API errors
    } finally {
      setPrintingPartC(false);
    }
  };

  // Submit a structured portal form via the existing /email/query flow.
  // The form auto-composes subject + body from its fields and hands us
  // { subject, body, files }; we package those into the same FormData
  // shape the legacy ApplyStep uses so the backend behaves identically.
  const handlePortalFormSubmit = async ({ subject, body, files, documentsList, formValues }) => {
    if (!subject || !body) {
      toast.error('Could not compose email — missing subject or body');
      return;
    }
    const fd = new FormData();
    fd.append('claim_case_id', submitResult.claim_case_id);
    if (submitResult.policy_provider_email) {
      fd.append('to_email', submitResult.policy_provider_email);
    }
    (submitResult.cc_emails || [])
      .filter((e) => e && e.trim())
      .forEach((cc) => fd.append('cc_emails', cc.trim()));
    fd.append('subject', subject.trim());
    fd.append('content', body);
    (files || []).forEach((file) => fd.append('file', file));
    // Send checked ADR checklist labels as documents_list (array of strings).
    // Backend may receive these as repeated form fields or, if it expects a
    // single JSON string, parse the matching key.
    if (Array.isArray(documentsList) && documentsList.length > 0) {
      documentsList.forEach((label) => fd.append('documents_list', label));
    }
    // Structured form fields (currently only Reconsider sends this) — backend
    // persists alongside the email so providers can render a readable view.
    if (formValues && typeof formValues === 'object') {
      fd.append('form_values', JSON.stringify(formValues));
    }

    setPortalSending(true);
    try {
      // The DRAFT → APPLIED initial submission goes through /email/send;
      // every follow-up (Enhance / ADR / Reconsider) uses /email/query so the
      // backend categorises it as a query against an existing claim.
      const sendFn = replyEmailType === 'APPLIED' ? emailService.send : emailService.query;
      await sendFn(fd);
      toast.success('Email sent successfully');
      await handleTimelineReplySuccess();
    } catch {
      // axios interceptor surfaces the error toast
    } finally {
      setPortalSending(false);
    }
  };

  const closeReplyCompose = () => {
    setShowReplyCompose(false);
    setReplyEmailType(null);
  };

  // Build status-timeline events from the full status_history if available,
  // otherwise fall back to a minimal derivation from claim state + emails.
  const statusEvents = useMemo(() => {
    if (!submitResult) return [];

    if (Array.isArray(statusHistory) && statusHistory.length > 0) {
      const APPROVAL_STATES = new Set(['APPROVED', 'PARTIALLY_APPROVED']);
      // Sort oldest → newest so the timeline reads top-to-bottom chronologically.
      const sorted = [...statusHistory]
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      return sorted.map((entry) => ({
        status: statusLabel(entry.status),
        variant: statusBadgeVariant(entry.status),
        description: entry.remarks || statusLabel(entry.status),
        timestamp: entry.created_at || null,
        // Use the per-round approved_amount on the history entry so each
        // PARTIALLY_APPROVED / APPROVED row shows what *that* round approved,
        // not the latest cumulative figure.
        amount: APPROVAL_STATES.has(entry.status)
          ? (entry.approved_amount ?? submitResult.approved_amount)
          : undefined,
        // Each status entry may link to the email that triggered/recorded
        // the transition. The View Email button only renders when this is
        // present.
        emailId: entry.email_id ?? null,
      }));
    }

    // Fallback when status_history is missing
    const events = [{
      status: 'Submitted',
      variant: 'info',
      description: 'Pre-auth submitted',
      timestamp: submitResult.submitted_at || claimEmails[claimEmails.length - 1]?.email_date || null,
    }];
    const terminal = claimEmails
      .filter((e) => ['APPROVAL', 'PARTIAL_APPROVAL', 'DENIAL', 'APPROVED', 'PARTIALLY_APPROVED', 'DENIED'].includes(e.email_type))
      .sort((a, b) => new Date(b.email_date) - new Date(a.email_date))[0];
    if (submitResult.claim_status) {
      const isPartial = submitResult.claim_status === 'PARTIALLY_APPROVED';
      events.push({
        status: statusLabel(submitResult.claim_status),
        variant: statusBadgeVariant(submitResult.claim_status),
        amount: submitResult.approved_amount,
        description: terminal?.subject || (isPartial ? 'Partially approved' : statusLabel(submitResult.claim_status)),
        timestamp: terminal?.email_date || null,
      });
    }
    return events;
  }, [submitResult, claimEmails, statusHistory]);

  if (loadingCase || !submitResult) {
    return (
      <div>
        <button className="gv-page__back" onClick={() => navigate(backPath)}>
          <IconArrowLeft size={18} />
          <span>{backPath === '/query-management' ? 'Back to Query Management' : 'Back to Claim List'}</span>
        </button>
        <div className="page-loading"><Spinner /></div>
      </div>
    );
  }

  const patientName = submitResult.patient_name || '—';
  const uhid = submitResult.uhid || '—';
  const insurerName = submitResult.insurer_name || '—';
  const requestedAmount = submitResult.requested_amount ?? null;
  const diagnosis = submitResult.diagnosis || '—';
  const icd10Code = submitResult.icd10_code || '—';
  const approvedDisplay = submitResult.approved_amount !== '' && submitResult.approved_amount != null
    ? submitResult.approved_amount
    : null;

  return (
    <div className="claim-detail">
      {/* Header row */}
      <div className="claim-detail__header">
        <button className="claim-detail__back" onClick={() => navigate(backPath)}>
          <IconArrowLeft size={16} />
          <span>Back</span>
        </button>
        <div className="claim-detail__title-block">
          {/* <h1 className="claim-detail__title">{paNumber}</h1> */}
          <p className="claim-detail__subtitle">
            {patientName} — {uhid} — {insurerName}
          </p>
        </div>
        <span className={`claim-detail__status-pill claim-detail__status-pill--${statusBadgeVariant(submitResult.claim_status)}`}>
          <span className="claim-detail__status-dot" />
          {statusLabel(submitResult.claim_status)}
        </span>
      </div>

      {/* Stat cards */}
      <div className="claim-detail__stats">
        <div className="claim-detail__stat">
          <div className="claim-detail__stat-label">REQUESTED</div>
          <div className="claim-detail__stat-value">{formatINR(requestedAmount)}</div>
        </div>
        <div className="claim-detail__stat">
          <div className="claim-detail__stat-label">APPROVED</div>
          <div className="claim-detail__stat-value claim-detail__stat-value--approved">
            {formatINR(approvedDisplay)}
          </div>
        </div>
        <div className="claim-detail__stat">
          <div className="claim-detail__stat-label">DIAGNOSIS</div>
          <div className="claim-detail__stat-value">{diagnosis}</div>
        </div>
        <div className="claim-detail__stat">
          <div className="claim-detail__stat-label">ICD-10</div>
          <div className="claim-detail__stat-value claim-detail__stat-value--icd">{icd10Code}</div>
        </div>
      </div>

      {/* DRAFT action bar — Print Part C (signed-copy upload) + Submit Pre-Auth */}
      {!showReplyCompose && isDraft && (
        <div className="actionbar actionbar--info">
          <div className="actionbar__msg">
            <div className="actionbar__icon"><IconSend size={18} /></div>
            <div className="actionbar__text">
              <strong>Ready to submit to insurer</strong>
              <span>Print Part C, get patient + doctor signatures, then submit.</span>
            </div>
          </div>
          <div className="actionbar__actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handlePrintPartC}
              disabled={printingPartC}
            >
              {printingPartC ? <Spinner size={16} /> : 'Print Part C'}
            </button>
            <button type="button" className="btn btn--primary" onClick={handleSubmitPreAuth}>
              <IconSend size={16} /> Submit Pre-Auth
            </button>
          </div>
        </div>
      )}

      {/* Raise Enhance / Reconsider / ADR Submit (label varies by claim_status) */}
      {!showReplyCompose && showRaiseBtn && (
        <button className="claim-detail__enhance-btn" onClick={handleRaiseEnhance}>
          <IconPlus size={16} /> {raiseAction.label}
        </button>
      )}

      {/* Inline reply compose — branches between structured portal forms
          (APPLIED → Submit, APPROVED / PARTIALLY_APPROVED → Enhance,
          ADR_NMI → ADR, DENIED → Reconsider). The legacy email-template
          ApplyStep is now only a fallback for unexpected combinations. */}
      {showReplyCompose && (() => {
        const useSubmitForm = replyEmailType === 'APPLIED';
        const useEnhanceForm =
          replyEmailType === 'ENHANCE_SUBMITTED' &&
          (submitResult.claim_status === 'APPROVED' ||
            submitResult.claim_status === 'PARTIALLY_APPROVED');
        const useAdrForm = replyEmailType === 'ADR_SUBMITTED';
        const useReconsiderForm =
          replyEmailType === 'RECONSIDER' &&
          submitResult.claim_status === 'DENIED';

        if (useSubmitForm) {
          return (
            <SubmitPortalForm
              submitResult={submitResult}
              onClose={closeReplyCompose}
              onSubmit={handlePortalFormSubmit}
              sending={portalSending}
              onDocumentsChanged={handleRefresh}
            />
          );
        }
        if (useEnhanceForm) {
          return (
            <EnhancePortalForm
              submitResult={submitResult}
              onClose={closeReplyCompose}
              onSubmit={handlePortalFormSubmit}
              sending={portalSending}
            />
          );
        }
        if (useAdrForm) {
          return (
            <ADRPortalForm
              submitResult={submitResult}
              adrEmails={adrEmails}
              onClose={closeReplyCompose}
              onSubmit={handlePortalFormSubmit}
              sending={portalSending}
            />
          );
        }
        if (useReconsiderForm) {
          return (
            <ReconsiderPortalForm
              submitResult={submitResult}
              onClose={closeReplyCompose}
              onSubmit={handlePortalFormSubmit}
              sending={portalSending}
            />
          );
        }
        return (
          <div className="claim-detail__compose-wrap">
            <div className="claim-detail__compose-header">
              <h3>
                {replyEmailType === 'APPLIED' ? 'Submit Pre-Auth'
                  : replyEmailType === 'ENHANCE_SUBMITTED' ? 'Enhance Submit'
                  : replyEmailType === 'RECONSIDER' ? 'Reconsider'
                  : replyEmailType === 'ADR_SUBMITTED' ? 'ADR Submit'
                  : 'Reply'}
              </h3>
              <button className="btn btn--ghost btn--sm" onClick={closeReplyCompose}>
                Cancel
              </button>
            </div>
            <ApplyStep
              submitResult={submitResult}
              onSendSuccess={handleTimelineReplySuccess}
              useQueryEndpoint={replyEmailType !== 'APPLIED'}
            />
          </div>
        );
      })()}

      {/* Two-column layout: accordions on the left, info cards on the right */}
      <div className="claim-detail__layout">
        <div className="claim-detail__accordions">
          <Accordion number={1} title="Status Timeline" defaultOpen>
            <StatusTimeline events={statusEvents} onViewEmail={handleViewStatusEmail} />
          </Accordion>
          <Accordion number={2} title={`Enhance Requests (${enhanceEmails.length})`}>
            <CategoryEmails
              emails={enhanceEmails}
              claimCaseId={submitResult.claim_case_id}
              claim={submitResult}
              emptyText="No enhance requests yet"
            />
          </Accordion>
          <Accordion number={3} title={`Additional Document Requests (${adrEmails.length})`}>
            <CategoryEmails
              emails={adrEmails}
              claimCaseId={submitResult.claim_case_id}
              claim={submitResult}
              emptyText="No additional document requests"
            />
          </Accordion>
          <Accordion number={4} title={`Reconsideration Requests (${reconsiderEmails.length})`}>
            <CategoryEmails
              emails={reconsiderEmails}
              claimCaseId={submitResult.claim_case_id}
              claim={submitResult}
              emptyText="No reconsideration requests"
            />
          </Accordion>
        </div>

        <ClaimSidebar submitResult={submitResult} />
      </div>

      {viewedEmail && (
        <Modal
          title={viewedEmail.subject || 'Email'}
          onClose={closeViewedEmail}
          size="lg"
        >
          {loadingViewedEmail ? (
            <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
              <Spinner />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                className="claim-timeline__card-meta"
                style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13, color: '#6b7280', paddingBottom: 8, borderBottom: '1px solid #e5e7eb' }}
              >
                <span>From: {viewedEmail.from_email}</span>
                <span>To: {viewedEmail.to_email}</span>
                {viewedEmail.direction && (
                  <span className={`badge badge--${viewedEmail.direction === 'SENT' ? 'success' : 'info'} badge--sm`}>
                    {viewedEmail.direction}
                  </span>
                )}
                {viewedEmail.email_date && (
                  <span>
                    {new Date(viewedEmail.email_date).toLocaleString('en-IN', {
                      year: 'numeric', month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit', hour12: false,
                    }).replace(',', '')}
                  </span>
                )}
              </div>
              <div style={{ maxHeight: '50vh', overflow: 'auto', background: '#f9fafb', padding: 12, borderRadius: 6 }}>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                  {viewedEmail.body || '(no body)'}
                </pre>
              </div>
              {Array.isArray(viewedEmail.attachments) && viewedEmail.attachments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    Attachments ({viewedEmail.attachments.length})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {viewedEmail.attachments.map((att) => (
                      <button
                        key={att.id}
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => viewEmailAttachment(att)}
                      >
                        {att.original_filename}
                        {typeof att.file_size === 'number' && (
                          <> ({(att.file_size / 1024).toFixed(1)} KB)</>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      {emailAttView && (
        <Modal title={emailAttView.filename} onClose={closeEmailAttView} size="lg">
          <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
            {emailAttView.contentType.startsWith('image/') ? (
              <img src={emailAttView.url} alt={emailAttView.filename} style={{ maxWidth: '100%', height: 'auto' }} />
            ) : emailAttView.contentType === 'application/pdf' ? (
              <iframe src={emailAttView.url} title={emailAttView.filename} style={{ width: '100%', height: '70vh', border: 'none' }} />
            ) : (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <p>Preview not available for this file type.</p>
                <a href={emailAttView.url} download={emailAttView.filename} className="btn btn--primary" style={{ marginTop: 12 }}>
                  Download
                </a>
              </div>
            )}
          </div>
        </Modal>
      )}

      {showUnreadPopup && (
        <Modal title="Uncategorized Emails" onClose={() => setShowUnreadPopup(false)}>
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <p style={{ fontSize: '1rem', marginBottom: 24 }}>
              You have <strong>{unreadCount}</strong> uncategorized email{unreadCount !== 1 ? 's' : ''} for this claim
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="btn btn--ghost" onClick={() => setShowUnreadPopup(false)}>
                Dismiss
              </button>
              <button
                className="btn btn--primary"
                onClick={() => navigate(`/query-management?id=${routeClaimCaseId}`)}
              >
                View Emails
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Accordion ───────────────────────────────────────────────────────

function Accordion({ number, title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`claim-accordion ${open ? 'claim-accordion--open' : ''}`}>
      <button className="claim-accordion__head" onClick={() => setOpen((o) => !o)}>
        <span className="claim-accordion__num">{number}</span>
        <span className="claim-accordion__title">{title}</span>
        <span className="claim-accordion__chev">
          <IconChevronRight size={18} />
        </span>
      </button>
      {open && <div className="claim-accordion__body">{children}</div>}
    </div>
  );
}

// ── Status Timeline ─────────────────────────────────────────────────

function StatusTimeline({ events, onViewEmail }) {
  if (!events || events.length === 0) {
    return <div className="claim-status-timeline__empty">No timeline events</div>;
  }
  return (
    <div className="claim-status-timeline">
      {events.map((ev, idx) => (
        <div key={idx} className={`claim-status-timeline__row claim-status-timeline__row--${ev.variant || 'default'}`}>
          <div className="claim-status-timeline__track">
            <div className="claim-status-timeline__dot" />
            {idx < events.length - 1 && <div className="claim-status-timeline__line" />}
          </div>
          <div className="claim-status-timeline__content">
            <div className="claim-status-timeline__row-head">
              <span className={`claim-status-timeline__pill claim-status-timeline__pill--${ev.variant || 'default'}`}>
                <span className="claim-status-timeline__pill-dot" />
                {ev.status}
              </span>
              {ev.amount != null && ev.amount !== '' && (
                <span className="claim-status-timeline__amount">{formatINR(ev.amount)}</span>
              )}
              {ev.emailId && onViewEmail && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm claim-status-timeline__view-email"
                  onClick={() => onViewEmail(ev.emailId)}
                  title="View the email associated with this status change"
                >
                  <IconMail size={12} /> View Email
                </button>
              )}
            </div>
            {ev.description && <div className="claim-status-timeline__desc">{ev.description}</div>}
            {ev.timestamp && (
              <div className="claim-status-timeline__time">
                <span className="claim-status-timeline__time-ico">⏱</span>
                {new Date(ev.timestamp).toLocaleString('en-IN', {
                  year: 'numeric', month: '2-digit', day: '2-digit',
                  hour: '2-digit', minute: '2-digit', hour12: false,
                }).replace(',', '')}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Category email list (filtered timeline) ─────────────────────────

function CategoryEmails({ emails, claimCaseId, claim, onReplyClick, emptyText }) {
  if (!emails || emails.length === 0) {
    return <div className="claim-category__empty">{emptyText}</div>;
  }
  return (
    <ClaimTimeline
      claimEmails={emails}
      claimCaseId={claimCaseId}
      claim={claim}
      onReplyClick={onReplyClick}
    />
  );
}

// ── Sidebar (Insurer & Policy / Treating Doctor / Documents) ────────

function KV({ label, value }) {
  const display = value === null || value === undefined || value === '' ? '—' : value;
  return (
    <div className="info-card__kv">
      <span className="info-card__kv-label">{label}</span>
      <span className="info-card__kv-value">{display}</span>
    </div>
  );
}

function InfoCard({ title, headerRight, children }) {
  return (
    <div className="info-card">
      <div className="info-card__head">
        <h3 className="info-card__title">{title}</h3>
        {headerRight && <span className="info-card__head-right">{headerRight}</span>}
      </div>
      <div className="info-card__body">{children}</div>
    </div>
  );
}

function ClaimSidebar({ submitResult }) {
  return (
    <aside className="claim-detail__sidebar">
      <InfoCard title="Insurer & Policy">
        <KV label="Insurer" value={submitResult.insurer_name} />
        <KV label="Policy No." value={submitResult.policy_number} />
        {submitResult.corporate_name && <KV label="Corporate" value={submitResult.corporate_name} />}
        <KV label="Insured Card ID" value={submitResult.insured_card_id} />
        <KV label="Claims Email" value={submitResult.policy_provider_email} />
      </InfoCard>

      <InfoCard title="Treating Doctor">
        <KV label="Name" value={submitResult.doctor_name} />
        <KV label="Qualification" value={submitResult.doctor_qualification} />
        <KV label="Reg. No." value={submitResult.doctor_registration} />
        <KV label="Contact" value={submitResult.doctor_contact} />
      </InfoCard>
    </aside>
  );
}
