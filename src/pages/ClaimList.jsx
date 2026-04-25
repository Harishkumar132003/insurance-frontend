import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { claimCaseService } from '../services/api';
import { useAuth, ROLES } from '../context/AuthContext';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import './Pages.scss';

const FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'approved', label: 'Approved', match: (c) => c.status === 'APPROVED' || c.status === 'PARTIALLY_APPROVED' },
  { key: 'adr', label: 'ADR Pending', match: (c) => c.status === 'ADR_NMI' },
  { key: 'denied', label: 'Denied', match: (c) => c.status === 'DENIED' },
];

const STATUS_PILL = {
  APPROVED: { label: 'Approved', variant: 'success' },
  PARTIALLY_APPROVED: { label: 'Partially Approved', variant: 'info' },
  ADR_NMI: { label: 'ADR Pending', variant: 'warning' },
  DENIED: { label: 'Denied', variant: 'danger' },
};

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
  return d.toISOString().slice(0, 10);
}

export default function ClaimList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isInsuranceProvider = user?.role === ROLES.INSURANCE_PROVIDER;
  const [activeFilter, setActiveFilter] = useState('all');
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    claimCaseService.getAll()
      .then((res) => { if (!cancelled) setClaims(Array.isArray(res.data) ? res.data : []); })
      .catch(() => { if (!cancelled) setClaims([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => {
    const map = {};
    FILTERS.forEach((f) => { map[f.key] = claims.filter(f.match).length; });
    return map;
  }, [claims]);

  const filtered = useMemo(() => {
    const filter = FILTERS.find((f) => f.key === activeFilter) || FILTERS[0];
    return claims.filter(filter.match);
  }, [claims, activeFilter]);

  return (
    <div className="preauth-tracker">
      <div className="preauth-tracker__header">
        <h1 className="preauth-tracker__title">Pre-Auth Tracker</h1>
        <p className="preauth-tracker__subtitle">Track, enhance, and manage all pre-authorization requests</p>
      </div>

      <div className="preauth-tracker__filters">
        {FILTERS.map((tab) => (
          <button
            key={tab.key}
            className={`preauth-tracker__filter ${activeFilter === tab.key ? 'preauth-tracker__filter--active' : ''}`}
            onClick={() => setActiveFilter(tab.key)}
          >
            {tab.label} ({counts[tab.key] || 0})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="page-loading"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="table-card"><EmptyState message="No claims found" /></div>
      ) : (
        <div className="preauth-tracker__list">
          {filtered.map((claim) => {
            const id = claim.claim_case_id || claim.id;
            const uhid = claim.summary?.uhid || claim.uhid || '';
            const paNumber =   uhid || id;
            const patientName = claim.summary?.patient_name || claim.patient_name || '—';
            const insurer = claim.summary?.provider_name || claim.provider_name || '—';
            const diagnosis = claim.summary?.diagnosis || claim.diagnosis || '';
            const requested = claim.summary?.requested_amount ?? claim.requested_amount ?? claim.amount;
            const date = formatDate(claim.created_at);
            const status = claim.status;
            const pill = STATUS_PILL[status] || { label: (status || '—').replace(/_/g, ' '), variant: 'default' };
            const adrOverdue = claim.adr_overdue === true || claim.is_adr_overdue === true;

            return (
              <div
                key={id}
                className={`preauth-card ${adrOverdue ? 'preauth-card--overdue' : ''}`}
                onClick={() => navigate(
                  isInsuranceProvider ? `/provider-queue/${id}` : `/claim-list/${id}`,
                  { state: { from: '/claim-list' } }
                )}
              >
                <div className="preauth-card__row preauth-card__row--head">
                  <div className="preauth-card__title-wrap">
                    <span className="preauth-card__pa">{paNumber}</span>
                    {adrOverdue && <span className="preauth-card__overdue">ADR OVERDUE</span>}
                  </div>
                  <span className={`preauth-card__status preauth-card__status--${pill.variant}`}>
                    <span className="preauth-card__status-dot" />
                    {pill.label}
                  </span>
                </div>

                <div className="preauth-card__row preauth-card__patient">
                  {patientName}{uhid ? ` — ${uhid}` : ''}
                </div>

                <div className="preauth-card__row preauth-card__meta">
                  <span className="preauth-card__insurer">{insurer}</span>
                  {diagnosis && <span className="preauth-card__diag">{diagnosis}</span>}
                  <span className="preauth-card__amount">{formatINR(requested)}</span>
                  <span className="preauth-card__date">{date}</span>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
