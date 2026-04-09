import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { claimCaseService } from '../services/api';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { IconRefresh } from '../components/icons/Icons';
import './Pages.scss';

export default function QueryManagement() {
  const navigate = useNavigate();
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEmails, setTotalEmails] = useState(0);

  const fetchEmails = (p = page) => {
    setLoading(true);
    claimCaseService.getAllEmailsPaginated({ page: p, page_size: pageSize })
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
  }, [page, pageSize]);

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
              {emails.map((email) => (
                <div
                  key={email.id}
                  className="email-inbox__item"
                  onClick={() => navigate(`/claim-list/${email.claim_case_id}`, { state: { from: '/query-management' } })}
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
              ))}
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
    </div>
  );
}
