import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { claimCaseService } from '../services/api';
import { useAuth, ROLES } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import { IconRefresh } from '../components/icons/Icons';
import { useToast } from '../components/Toast';
import './Pages.scss';

const CLAIM_STATUS_OPTIONS = ['APPROVED', 'PARTIALLY_APPROVED', 'DENIED', 'ENHANCEMENT_DENIED', 'ADR_NMI'];
const EMAIL_TYPE_OPTIONS = ['APPROVAL', 'PARTIAL_APPROVAL', 'DENIAL', 'ENHANCEMENT_DENIAL', 'ADR_NMI'];

export default function QueryManagement() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const isInsuranceProvider = user?.role === ROLES.INSURANCE_PROVIDER;
  const [searchParams, setSearchParams] = useSearchParams();
  const filterClaimId = searchParams.get('id');
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEmails, setTotalEmails] = useState(0);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [emailType, setEmailType] = useState('');
  const [claimStatus, setClaimStatus] = useState('');
  const [claimNumber, setClaimNumber] = useState('');
  const [approvedAmount, setApprovedAmount] = useState('');
  // ADR-only: editable list of insurer-requested documents (chips). Seeded
  // from the email's ai_documents_list; sent back as documents_list.
  const [documentsList, setDocumentsList] = useState([]);
  const [newDocLabel, setNewDocLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [viewUrl, setViewUrl] = useState(null);
  const [viewFilename, setViewFilename] = useState('');
  const [viewContentType, setViewContentType] = useState('');

  const fetchEmails = (p = page) => {
    setLoading(true);
    const params = { page: p, page_size: pageSize };
    if (filterClaimId) params.claim_case_id = filterClaimId;
    claimCaseService.getAllEmailsPaginated(params)
      .then((res) => {
        const data = res.data;
        setEmails(Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : []);
        setTotalPages(data.total_pages || Math.ceil((data.total || 0) / pageSize) || 1);
        setTotalEmails(data.total || (Array.isArray(data) ? data.length : 0));
      })
      .catch(() => {
        setEmails([]);
        setTotalPages(1);
        setTotalEmails(0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchEmails(page);
  }, [page, pageSize, filterClaimId]);

  const isEmailRead = (email) =>
    isInsuranceProvider ? !!email.provider_read : !!email.is_read;

  const handleEmailClick = async (email) => {
    if (isInsuranceProvider) {
      if (!email.provider_read) {
        try {
          await claimCaseService.markEmailRead(email.claim_case_id, email.id);
        } catch {
          // non-blocking — still navigate
        }
      }
      navigate(`/provider-queue/${email.claim_case_id}`, { state: { from: '/query-management' } });
      return;
    }
    if (email.is_onboard_claim) {
      if (!email.is_read) {
        try {
          await claimCaseService.markEmailRead(email.claim_case_id, email.id);
        } catch {
          // non-blocking — still navigate
        }
      }
      navigate(`/claim-list/${email.claim_case_id}`, { state: { from: '/query-management' } });
      return;
    }
    if (!email.is_read) {
      setSelectedEmail(email);
      setEmailType(email.email_type || EMAIL_TYPE_OPTIONS[0]);
      setClaimStatus(email.ai_suggested_status || CLAIM_STATUS_OPTIONS[0]);
      // Prefer the human-saved value, fall back to the AI suggestion.
      setClaimNumber(email.claim_number || email.ai_suggested_claim_number || '');
      setApprovedAmount(email.approved_amount ?? email.ai_suggested_amount ?? '');
      setDocumentsList(Array.isArray(email.ai_documents_list) ? [...email.ai_documents_list] : []);
      setNewDocLabel('');
    } else {
      navigate(`/claim-list/${email.claim_case_id}`, { state: { from: '/query-management' } });
    }
  };

  const handleViewAttachment = async (email, attId, filename) => {
    try {
      const res = await claimCaseService.viewAttachment(email.claim_case_id, email.id, attId);
      const contentType = res.headers?.['content-type'] || '';
      const url = window.URL.createObjectURL(new Blob([res.data], { type: contentType }));
      setViewUrl(url);
      setViewFilename(filename || 'attachment');
      setViewContentType(contentType);
    } catch {
      // handled by interceptor
    }
  };

  const closeAttachmentView = () => {
    if (viewUrl) window.URL.revokeObjectURL(viewUrl);
    setViewUrl(null);
    setViewFilename('');
    setViewContentType('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        email_type: emailType,
      };
      if (selectedEmail.is_latest) {
        payload.claim_status = claimStatus;
        payload.claim_number = claimNumber || undefined;
        payload.approved_amount = (claimStatus === 'APPROVED' || claimStatus === 'PARTIALLY_APPROVED') && approvedAmount !== '' ? Number(approvedAmount) : null;
        // ADR-only: send the edited insurer-requested documents.
        if (claimStatus === 'ADR_NMI' || emailType === 'ADR_NMI') {
          payload.documents_list = documentsList
            .map((d) => String(d).trim())
            .filter(Boolean);
        }
      }
      await claimCaseService.updateExtractedData(selectedEmail.claim_case_id, selectedEmail.id, payload);
      toast.success('Extracted data updated');
      setSelectedEmail(null);
      fetchEmails(page);
    } catch {
      // handled by interceptor
    } finally {
      setSaving(false);
    }
  };

  const addDocument = () => {
    const label = newDocLabel.trim();
    if (!label) return;
    setDocumentsList((prev) => (prev.includes(label) ? prev : [...prev, label]));
    setNewDocLabel('');
  };

  const removeDocument = (idx) => {
    setDocumentsList((prev) => prev.filter((_, i) => i !== idx));
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div>
      <div className="page-header">
        <h1>Query Management</h1>
        <p>View all email queries across claim cases</p>
      </div>

      {filterClaimId && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: 8,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.875rem',
            color: '#1e40af',
          }}
        >
          <span>
            Filtered by Claim Case: <strong>{filterClaimId}</strong>
          </span>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setSearchParams({})}
            style={{ color: '#1e40af' }}
          >
            &times; Clear Filter
          </button>
        </div>
      )}

      <div className="email-inbox">
        <div className="email-inbox__toolbar">
          <span className="email-inbox__count">
            {totalEmails} email{totalEmails !== 1 ? 's' : ''}
            {totalPages > 1 && ` — Page ${page} of ${totalPages}`}
          </span>
          <button
            className="btn btn--ghost"
            onClick={() => fetchEmails(page)}
            disabled={loading}
          >
            {loading ? <Spinner size={16} /> : <IconRefresh size={16} />}
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="page-loading"><Spinner /></div>
        ) : emails.length === 0 ? (
          <div className="table-card">
            <EmptyState message="No emails found" />
          </div>
        ) : (
          <>
            <div className="email-inbox__list">
              {emails.map((email) => {
                const read = isEmailRead(email);
                return (
                <div
                  key={email.id}
                  className={`email-inbox__item ${read ? 'email-inbox__item--read' : 'email-inbox__item--unread'}`}
                  onClick={() => handleEmailClick(email)}
                >
                  {!read && <span className="email-inbox__unread-dot" />}
                  <div className="email-inbox__item-avatar">
                    {(email.from_email || email.to_email || '?')[0].toUpperCase()}
                  </div>
                  <div className="email-inbox__item-content">
                    <div className="email-inbox__item-header">
                      <span className="email-inbox__item-from">
                        {email.from_email || email.to_email}
                      </span>
                      <span className="email-inbox__item-date">
                        {formatDate(email.email_date || email.date)}
                      </span>
                    </div>
                    <div className="email-inbox__item-subject">{email.subject}</div>
                    <div className="email-inbox__item-preview">
                      {email.body?.replace(/<[^>]*>/g, '').slice(0, 120) || email.preview || 'No content'}
                    </div>
                  </div>
                  {email.claim_number && (
                    <span className="badge badge--info" style={{ flexShrink: 0, alignSelf: 'center' }}>
                      {email.claim_number}
                    </span>
                  )}
                </div>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="email-pagination">
              <span className="email-pagination__info">
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalEmails)} of {totalEmails}
              </span>
              <select
                className="email-pagination__size"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
              </select>
              <button
                className="btn btn--ghost btn--sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                &lsaquo;
              </button>
              <button
                className="btn btn--ghost btn--sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                &rsaquo;
              </button>
            </div>
          </>
        )}
      </div>

      {/* Unread email detail modal */}
      {selectedEmail && (
        <Modal title={selectedEmail.subject || 'Email'} onClose={() => setSelectedEmail(null)} size="lg">
          <div className="email-detail">
            <div className="email-detail__meta">
              <div className="email-detail__row">
                <span className="email-detail__label">From</span>
                <span>{selectedEmail.from_email || selectedEmail.to_email}</span>
              </div>
              <div className="email-detail__row">
                <span className="email-detail__label">Date</span>
                <span>{formatDate(selectedEmail.email_date || selectedEmail.date)}</span>
              </div>
              <div className="email-detail__row">
                <span className="email-detail__label">Subject</span>
                <span>{selectedEmail.subject}</span>
              </div>
              <div className="email-detail__row">
                <span className="email-detail__label">Email Type</span>
                <span className="badge badge--info">{selectedEmail.email_type || '—'}</span>
              </div>
              <div className="email-detail__row">
                <span className="email-detail__label">AI Status</span>
                <span className="badge badge--warning">{selectedEmail.ai_suggested_status || '—'}</span>
              </div>
            </div>

            <div className="email-detail__divider" />

            <div
              className="email-detail__body"
              dangerouslySetInnerHTML={{ __html: selectedEmail.body || '<p>No content</p>' }}
            />

            {selectedEmail.attachments?.length > 0 && (
              <>
                <div className="email-detail__divider" />
                <div className="claim-timeline__attachments">
                  {selectedEmail.attachments.map((att) => (
                    <button
                      key={att.id}
                      className="btn btn--ghost btn--sm"
                      onClick={() => handleViewAttachment(selectedEmail, att.id, att.original_filename)}
                    >
                      {att.original_filename} ({(att.file_size / 1024).toFixed(1)} KB)
                    </button>
                  ))}
                </div>
              </>
            )}

            {viewUrl && (
              <Modal title={viewFilename} onClose={closeAttachmentView} size="lg">
                <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
                  {viewContentType.startsWith('image/') ? (
                    <img src={viewUrl} alt={viewFilename} style={{ maxWidth: '100%', height: 'auto' }} />
                  ) : viewContentType === 'application/pdf' ? (
                    <iframe src={viewUrl} title={viewFilename} style={{ width: '100%', height: '70vh', border: 'none' }} />
                  ) : (
                    <div style={{ textAlign: 'center', padding: 24 }}>
                      <p>Preview not available for this file type.</p>
                      <a href={viewUrl} download={viewFilename} className="btn btn--primary" style={{ marginTop: 12 }}>
                        Download
                      </a>
                    </div>
                  )}
                </div>
              </Modal>
            )}

            <div className="email-detail__divider" />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label>Email Type</label>
                <select value={emailType} onChange={(e) => setEmailType(e.target.value)}>
                  {EMAIL_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              {selectedEmail.is_latest && (
                <>
                  <div className="form-group">
                    <label>Claim Status</label>
                    <select value={claimStatus} onChange={(e) => setClaimStatus(e.target.value)}>
                      {CLAIM_STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Claim Number</label>
                    <input
                      type="text"
                      placeholder="e.g. CLM-2026-1234"
                      value={claimNumber}
                      onChange={(e) => setClaimNumber(e.target.value)}
                    />
                    {selectedEmail.ai_suggested_claim_number && (
                      <small className="policy-suggestion">
                        AI suggested: {selectedEmail.ai_suggested_claim_number}
                      </small>
                    )}
                  </div>
                  {(claimStatus === 'APPROVED' || claimStatus === 'PARTIALLY_APPROVED') && (
                    <div className="form-group">
                      <label>Approved Amount</label>
                      <input
                        type="number"
                        placeholder="e.g. 50000"
                        value={approvedAmount}
                        onChange={(e) => setApprovedAmount(e.target.value)}
                      />
                      {selectedEmail.ai_suggested_amount != null && (
                        <small className="policy-suggestion">
                          AI suggested: {selectedEmail.ai_suggested_amount}
                        </small>
                      )}
                    </div>
                  )}
                  {(claimStatus === 'ADR_NMI' || emailType === 'ADR_NMI') && (
                    <div className="form-group">
                      <label>Documents Requested</label>
                      <div className="apply-step__attach-area" style={{ marginBottom: 8 }}>
                        {documentsList.length === 0 ? (
                          <span style={{ color: '#6b7280', fontSize: 13 }}>
                            No documents added yet
                          </span>
                        ) : (
                          documentsList.map((doc, idx) => (
                            <span key={`${doc}-${idx}`} className="apply-step__attach-chip apply-step__attach-chip--editable">
                              <span>{doc}</span>
                              <button
                                type="button"
                                onClick={() => removeDocument(idx)}
                                title="Remove"
                              >
                                &times;
                              </button>
                            </span>
                          ))
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="text"
                          placeholder="Add document (e.g. Aadhar card)"
                          value={newDocLabel}
                          onChange={(e) => setNewDocLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addDocument();
                            }
                          }}
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={addDocument}
                          disabled={!newDocLabel.trim()}
                        >
                          Add
                        </button>
                      </div>
                      {Array.isArray(selectedEmail.ai_documents_list) && selectedEmail.ai_documents_list.length > 0 && (
                        <small className="policy-suggestion">
                          AI suggested: {selectedEmail.ai_documents_list.join(', ')}
                        </small>
                      )}
                    </div>
                  )}
                </>
              )}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="btn btn--ghost" onClick={() => setSelectedEmail(null)}>Cancel</button>
                <button className="btn btn--primary" disabled={saving} onClick={handleSave}>
                  {saving ? <Spinner size={16} /> : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
