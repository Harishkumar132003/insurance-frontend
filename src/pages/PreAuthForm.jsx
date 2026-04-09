import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { claimCaseService, emailTemplateService, emailService, documentService } from '../services/api';
import { IconSend, IconArrowLeft } from '../components/icons/Icons';
import Spinner from '../components/Spinner';
import ClaimTimeline from '../components/ClaimTimeline';
import Modal from '../components/Modal';
import './Pages.scss';

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

      setSubmitResult({
        claim_case_id: cc.id,
        form_data_id: latestForm?.id,
        status: cc.status,
        claim_status: cc.claim_status,
        claim_number: cc.claim_number || '',
        approved_amount: cc.approved_amount ?? '',
        query_logs: cc.query_logs || [],
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

  const handleTimelineReplyClick = (emailType) => {
    setShowReplyCompose(true);
    setReplyEmailType(emailType);
  };

  const handleTimelineReplySuccess = async () => {
    setShowReplyCompose(false);
    setReplyEmailType(null);
    await handleRefresh();
  };

  return (
    <div>
      <button className="gv-page__back" onClick={() => navigate(backPath)}>
        <IconArrowLeft size={18} />
        <span>{backPath === '/query-management' ? 'Back to Query Management' : 'Back to Claim List'}</span>
      </button>
      <div className="page-header">
        <h1>Claim Detail</h1>
        <p>Claim Case #{routeClaimCaseId}</p>
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

      {claimEmails.length === 0 && !loadingCase && (
        <button className="btn btn--ghost" style={{ marginBottom: 16 }} onClick={() => navigate(`/pre-auth/${routeClaimCaseId}`)}>
          Edit Form
        </button>
      )}

      {loadingCase && (
        <div className="page-loading"><Spinner /></div>
      )}

      {/* ─── Timeline view: when emails exist ─── */}
      {claimEmails.length > 0 && !loadingCase && (
        <>
          {showReplyCompose && submitResult && (
            <ApplyStep
              submitResult={submitResult}
              onSendSuccess={handleTimelineReplySuccess}
              useQueryEndpoint={replyEmailType === 'QUERY' || replyEmailType === 'ADR'}
            />
          )}
          <ClaimTimeline
            claimEmails={claimEmails}
            claimCaseId={submitResult?.claim_case_id}
            onReplyClick={handleTimelineReplyClick}
          />
        </>
      )}

      {/* ─── Not yet applied: show Apply directly ─── */}
      {claimEmails.length === 0 && !loadingCase && submitResult && (
        <ApplyStep submitResult={submitResult} onSendSuccess={handleRefresh} />
      )}

    </div>
  );
}
