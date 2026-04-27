import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { claimCaseService } from '../services/api';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { IconRefresh } from '../components/icons/Icons';
import './Pages.scss';

function formatINR(amount) {
  if (amount == null || amount === '') return '—';
  const num = Number(amount);
  if (Number.isNaN(num)) return '—';
  return num.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ProviderQueue() {
  const navigate = useNavigate();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const fetchQueue = (p = page) => {
    setLoading(true);
    claimCaseService.getProviderQueue({ page: p, page_size: pageSize })
      .then((res) => {
        const data = res.data;
        const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
        setClaims(items);
        setTotalPages(data.total_pages || Math.ceil((data.total || 0) / pageSize) || 1);
        setTotalItems(data.total || items.length);
      })
      .catch(() => {
        setClaims([]);
        setTotalPages(1);
        setTotalItems(0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchQueue(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  return (
    <div>
      <div className="page-header">
        <h1>Provider Queue</h1>
        <p>Claims awaiting your decision</p>
      </div>

      <div className="email-inbox">
        <div className="email-inbox__toolbar">
          <span className="email-inbox__count">
            {totalItems} claim{totalItems !== 1 ? 's' : ''}
            {totalPages > 1 && ` — Page ${page} of ${totalPages}`}
          </span>
          <button
            className="btn btn--ghost"
            onClick={() => fetchQueue(page)}
            disabled={loading}
          >
            {loading ? <Spinner size={16} /> : <IconRefresh size={16} />}
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="page-loading"><Spinner /></div>
        ) : claims.length === 0 ? (
          <div className="table-card">
            <EmptyState message="No claims awaiting action" />
          </div>
        ) : (
          <>
            <div className="preauth-tracker__list">
              {claims.map((claim) => {
                const id = claim.claim_case_id || claim.id;
                const uhid = claim.summary?.uhid || claim.uhid || '';
                const patientName = claim.summary?.patient_name || claim.patient_name || '—';
                const hospital = claim.hospital?.name || claim.hospital_name || '—';
                const diagnosis = claim.summary?.diagnosis || claim.diagnosis || '';
                const requested = claim.summary?.requested_amount ?? claim.requested_amount;
                const submittedAt = formatDate(claim.submitted_at || claim.created_at);

                return (
                  <div
                    key={id}
                    className="preauth-card"
                    onClick={() => navigate(`/provider-queue/${id}`)}
                  >
                    <div className="preauth-card__row preauth-card__row--head">
                      <div className="preauth-card__title-wrap">
                        <span className="preauth-card__pa">{uhid || id}</span>
                      </div>
                      <span className="preauth-card__status preauth-card__status--warning">
                        <span className="preauth-card__status-dot" />
                        Pending
                      </span>
                    </div>
                    <div className="preauth-card__row preauth-card__patient">
                      {patientName}{uhid ? ` — ${uhid}` : ''}
                    </div>
                    <div className="preauth-card__row preauth-card__meta">
                      <span className="preauth-card__insurer">{hospital}</span>
                      {diagnosis && <span className="preauth-card__diag">{diagnosis}</span>}
                      <span className="preauth-card__amount">{formatINR(requested)}</span>
                      <span className="preauth-card__date">{submittedAt}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="email-pagination">
              <span className="email-pagination__info">
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalItems)} of {totalItems}
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
