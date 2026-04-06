import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { claimCaseService, policyProviderService } from '../services/api';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { IconSend, IconMail } from '../components/icons/Icons';
import './Pages.scss';

const STATUS_BADGE = {
  PENDING: 'warning',
  APPROVED: 'success',
  UNDER_REVIEW: 'info',
  REJECTED: 'danger',
  SETTLED: 'success',
};

export default function QueryManagement() {
  const navigate = useNavigate();

  // Provider filter
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('');

  // Claims table
  const [claims, setClaims] = useState([]);
  const [loadingClaims, setLoadingClaims] = useState(true);

  // Emails modal (level 1)
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [emailDirection, setEmailDirection] = useState('SENT');
  const [emails, setEmails] = useState([]);
  const [loadingEmails, setLoadingEmails] = useState(false);

  // Email detail modal (level 2)
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [loadingEmailDetail, setLoadingEmailDetail] = useState(false);

  // Fetch providers on mount
  useEffect(() => {
    policyProviderService.getAll()
      .then((res) => setProviders(Array.isArray(res.data) ? res.data : []))
      .catch(() => setProviders([]));
  }, []);

  // Fetch claims when provider changes
  useEffect(() => {
    setLoadingClaims(true);
    const params = { exclude_draft: true };
    if (selectedProvider) params.provider_id = selectedProvider;
    claimCaseService.getAll(params)
      .then((res) => setClaims(Array.isArray(res.data) ? res.data : []))
      .catch(() => setClaims([]))
      .finally(() => setLoadingClaims(false));
  }, [selectedProvider]);

  // Fetch emails when claim or direction changes
  useEffect(() => {
    if (!selectedClaim) return;
    setLoadingEmails(true);
    claimCaseService.getEmails(selectedClaim.claim_case_id, emailDirection)
      .then((res) => setEmails(Array.isArray(res.data) ? res.data : []))
      .catch(() => setEmails([]))
      .finally(() => setLoadingEmails(false));
  }, [selectedClaim, emailDirection]);

  const handleViewQuery = (claim) => {
    setSelectedClaim(claim);
    setEmailDirection('SENT');
    setSelectedEmail(null);
    setEmails([]);
  };

  const handleCloseEmails = () => {
    setSelectedClaim(null);
    setEmails([]);
    setSelectedEmail(null);
  };

  const handleEmailClick = async (emailId) => {
    setLoadingEmailDetail(true);
    try {
      const res = await claimCaseService.getEmailDetail(selectedClaim.claim_case_id, emailId);
      setSelectedEmail(res.data);
    } catch {
      setSelectedEmail(null);
    } finally {
      setLoadingEmailDetail(false);
    }
  };

  const handleDownload = async (emailId, attId, filename) => {
    try {
      const res = await claimCaseService.downloadAttachment(
        selectedClaim.claim_case_id,
        emailId,
        attId,
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'attachment';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      // error handled by interceptor
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Query Management</h1>
        <p>View and manage email queries for claim cases</p>
      </div>

      {/* Provider filter */}
      <div className="page-toolbar">
        <div className="page-toolbar__filter">
          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
          >
            <option value="">All Providers</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Claims table */}
      {loadingClaims ? (
        <div className="page-loading"><Spinner /></div>
      ) : claims.length === 0 ? (
        <div className="table-card">
          <EmptyState message="No claims found" />
        </div>
      ) : (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Patient Name</th>
                <th>Claim Number</th>
                <th>Provider</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((claim, i) => (
                <tr key={claim.claim_case_id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/claim-list/${claim.claim_case_id}`)}>
                  <td>{i + 1}</td>
                  <td>{claim.patient_name}</td>
                  <td>{claim.claim_number}</td>
                  <td>{claim.provider_name}</td>
                  <td>
                    {claim.amount?.toLocaleString('en-IN', {
                      style: 'currency',
                      currency: 'INR',
                      maximumFractionDigits: 0,
                    })}
                  </td>
                  <td>
                    <span className={`badge badge--${STATUS_BADGE[claim.status] || 'default'}`}>
                      {claim.status?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td>
                    {claim.created_at
                      ? new Date(claim.created_at).toLocaleDateString('en-IN')
                      : '\u2014'}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => handleViewQuery(claim)}
                    >
                      <IconMail size={14} /> View Query
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Emails modal — level 1 */}
      {selectedClaim && (
        <Modal
          title={`Emails \u2014 ${selectedClaim.patient_name} (${selectedClaim.claim_number})`}
          onClose={handleCloseEmails}
        >
          <div className="email-tabs" style={{ marginBottom: 16 }}>
            <button
              className={`email-tabs__btn ${emailDirection === 'SENT' ? 'email-tabs__btn--active' : ''}`}
              onClick={() => setEmailDirection('SENT')}
            >
              <IconSend size={16} /> Sent
            </button>
            <button
              className={`email-tabs__btn ${emailDirection === 'RECEIVED' ? 'email-tabs__btn--active' : ''}`}
              onClick={() => setEmailDirection('RECEIVED')}
            >
              <IconMail size={16} /> Received
            </button>
          </div>

          {loadingEmails ? (
            <div className="page-loading"><Spinner /></div>
          ) : emails.length === 0 ? (
            <EmptyState message={`No ${emailDirection.toLowerCase()} emails`} />
          ) : (
            <div className="email-inbox__list">
              {emails.map((email) => (
                <div
                  key={email.id}
                  className="email-inbox__item"
                  onClick={() => handleEmailClick(email.id)}
                >
                  <div className="email-inbox__item-avatar">
                    {(email.from_email || email.to_email || '?')[0].toUpperCase()}
                  </div>
                  <div className="email-inbox__item-content">
                    <div className="email-inbox__item-header">
                      <span className="email-inbox__item-from">
                        {email.from_email || email.to_email}
                      </span>
                      <span className="email-inbox__item-date">
                        {email.email_date
                          ? new Date(email.email_date).toLocaleDateString('en-IN')
                          : ''}
                      </span>
                    </div>
                    <div className="email-inbox__item-subject">{email.subject}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* Email detail modal — level 2 */}
      {(selectedEmail || loadingEmailDetail) && (
        <Modal
          title={selectedEmail?.subject || 'Email Detail'}
          onClose={() => setSelectedEmail(null)}
        >
          {loadingEmailDetail ? (
            <div className="page-loading"><Spinner /></div>
          ) : (
          <div className="email-detail">
            <div className="email-detail__meta">
              <div className="email-detail__row">
                <span className="email-detail__label">From</span>
                <span>{selectedEmail.from_email}</span>
              </div>
              {selectedEmail.to_email && (
                <div className="email-detail__row">
                  <span className="email-detail__label">To</span>
                  <span>{selectedEmail.to_email}</span>
                </div>
              )}
              <div className="email-detail__row">
                <span className="email-detail__label">Date</span>
                <span>
                  {selectedEmail.email_date
                    ? new Date(selectedEmail.email_date).toLocaleString('en-IN')
                    : '\u2014'}
                </span>
              </div>
            </div>

            <div className="email-detail__divider" />

            <div className="email-detail__body">
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
                {selectedEmail.body}
              </pre>
            </div>

            {selectedEmail.attachments?.length > 0 && (
              <div className="query-attachments">
                <h4>Attachments</h4>
                {selectedEmail.attachments.map((att) => (
                  <button
                    key={att.id}
                    className="btn btn--ghost btn--sm"
                    onClick={() => handleDownload(selectedEmail.id, att.id, att.original_filename)}
                  >
                    {att.original_filename} ({(att.file_size / 1024).toFixed(1)} KB)
                  </button>
                ))}
              </div>
            )}
          </div>
          )}
        </Modal>
      )}
    </div>
  );
}
