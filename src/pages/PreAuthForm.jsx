import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { claimCaseService, emailTemplateService, emailService, documentService } from '../services/api';
import { IconSend, IconArrowLeft, IconChevronRight, IconPlus } from '../components/icons/Icons';
import Spinner from '../components/Spinner';
import ClaimTimeline from '../components/ClaimTimeline';
import Modal from '../components/Modal';
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

// ── Main component ──────────────────────────────────────────────────

export default function PreAuthForm() {
  const navigate = useNavigate();
  const location = useLocation();
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

  // Load claim case + emails
  const loadClaimData = async (showLoader = true) => {
    if (!routeClaimCaseId) return;
    if (showLoader) setLoadingCase(true);
    try {
      const [caseRes, emailsRes] = await Promise.all([
        claimCaseService.getById(routeClaimCaseId),
        claimCaseService.getAllEmails(routeClaimCaseId, { is_read: true }).catch(() => ({ data: [] })),
      ]);
      const cc = caseRes.data;
      const latestForm = Array.isArray(cc.form_data) && cc.form_data.length > 0
        ? cc.form_data[cc.form_data.length - 1]
        : null;

      const summary = cc.summary || {};
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
  const latestStageStatus = statusHistory.length > 0
    ? statusHistory[statusHistory.length - 1]?.status
    : null;
  const alreadyRaised = SUBMITTED_STAGE_STATUSES.includes(latestStageStatus);
  const showRaiseBtn = Boolean(raiseActionByStatus[submitResult?.claim_status]) && !alreadyRaised;

  // Build status-timeline events from the full status_history if available,
  // otherwise fall back to a minimal derivation from claim state + emails.
  const statusEvents = useMemo(() => {
    if (!submitResult) return [];

    if (Array.isArray(statusHistory) && statusHistory.length > 0) {
      const APPROVAL_STATES = new Set(['APPROVED', 'PARTIALLY_APPROVED']);
      // Sort oldest → newest so the timeline reads top-to-bottom chronologically.
      const sorted = [...statusHistory]
        .filter((entry) => entry.status !== 'DRAFT')
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      return sorted.map((entry) => ({
        status: statusLabel(entry.status),
        variant: statusBadgeVariant(entry.status),
        description: entry.remarks || statusLabel(entry.status),
        timestamp: entry.created_at || null,
        amount: APPROVAL_STATES.has(entry.status) ? submitResult.approved_amount : undefined,
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

      {/* Raise Enhance / Reconsider / ADR Submit (label varies by claim_status) */}
      {!showReplyCompose && showRaiseBtn && (
        <button className="claim-detail__enhance-btn" onClick={handleRaiseEnhance}>
          <IconPlus size={16} /> {raiseAction.label}
        </button>
      )}

      {/* Inline reply compose (reuses ApplyStep) */}
      {showReplyCompose && (
        <div className="claim-detail__compose-wrap">
          <div className="claim-detail__compose-header">
            <h3>
              {replyEmailType === 'ENHANCE_SUBMITTED' ? 'Enhance Submit'
                : replyEmailType === 'RECONSIDER' ? 'Reconsider'
                : replyEmailType === 'ADR_SUBMITTED' ? 'ADR Submit'
                : 'Reply'}
            </h3>
            <button className="btn btn--ghost btn--sm" onClick={() => { setShowReplyCompose(false); setReplyEmailType(null); }}>
              Cancel
            </button>
          </div>
          <ApplyStep
            submitResult={submitResult}
            onSendSuccess={handleTimelineReplySuccess}
            useQueryEndpoint
          />
        </div>
      )}

      {/* Accordions */}
      <div className="claim-detail__accordions">
        <Accordion number={1} title="Status Timeline" defaultOpen>
          <StatusTimeline events={statusEvents} />
        </Accordion>
        <Accordion number={2} title={`Enhance Requests (${enhanceEmails.length})`}>
          <CategoryEmails
            emails={enhanceEmails}
            claimCaseId={submitResult.claim_case_id}
            emptyText="No enhance requests yet"
          />
        </Accordion>
        <Accordion number={3} title={`Additional Document Requests (${adrEmails.length})`}>
          <CategoryEmails
            emails={adrEmails}
            claimCaseId={submitResult.claim_case_id}
            emptyText="No additional document requests"
          />
        </Accordion>
        <Accordion number={4} title={`Reconsideration Requests (${reconsiderEmails.length})`}>
          <CategoryEmails
            emails={reconsiderEmails}
            claimCaseId={submitResult.claim_case_id}
            emptyText="No reconsideration requests"
          />
        </Accordion>
      </div>

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

function StatusTimeline({ events }) {
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

function CategoryEmails({ emails, claimCaseId, onReplyClick, emptyText }) {
  if (!emails || emails.length === 0) {
    return <div className="claim-category__empty">{emptyText}</div>;
  }
  return (
    <ClaimTimeline
      claimEmails={emails}
      claimCaseId={claimCaseId}
      onReplyClick={onReplyClick}
    />
  );
}
