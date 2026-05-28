import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { claimCaseService } from '../services/api';
import { useAuth, ROLES } from '../context/AuthContext';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { IconPlus, IconMail } from '../components/icons/Icons';
import './Pages.scss';

const PRE_AUTH_FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'submitted', label: 'Submitted', match: (c) => c.status === 'SUBMITTED' },
  { key: 'approved', label: 'Approved', match: (c) => c.status === 'APPROVED' || c.status === 'PARTIALLY_APPROVED' || c.status === 'ENHANCEMENT_APPROVED' },
  { key: 'adr', label: 'ADR Pending', match: (c) => c.status === 'ADR_NMI' },
  { key: 'denied', label: 'Denied', match: (c) => c.status === 'DENIED' || c.status === 'ENHANCEMENT_DENIED' },
];

const STATUS_PILL = {
  DRAFT:               { label: 'Draft',               variant: 'default' },
  SUBMITTED:           { label: 'Submitted',           variant: 'info' },
  ENHANCE_SUBMITTED:   { label: 'Enhance Requested',   variant: 'info' },
  RECONSIDER:          { label: 'Reconsider Requested', variant: 'info' },
  RECONSIDER_SUBMITTED:{ label: 'Reconsider Requested', variant: 'info' },
  ADR_SUBMITTED:       { label: 'ADR Submitted',       variant: 'info' },
  CLAIM_SUBMITTED:           { label: 'Claim Submitted',           variant: 'info' },
  CLAIM_APPROVED:            { label: 'Claim Approved',            variant: 'success' },
  CLAIM_PARTIALLY_APPROVED:  { label: 'Claim Partially Approved',  variant: 'purple' },
  CLAIM_DENIED:              { label: 'Claim Denied',              variant: 'danger' },
  CLAIM_ADR_NMI:             { label: 'Claim ADR Pending',         variant: 'warning' },
  CLAIM_ADR_SUBMITTED:       { label: 'Claim ADR Submitted',       variant: 'info' },
  CLAIM_RECONSIDER:          { label: 'Claim Reconsider Requested', variant: 'info' },
  APPROVED:            { label: 'Approved',            variant: 'success' },
  PARTIALLY_APPROVED:  { label: 'Partially Approved',  variant: 'purple' },
  ENHANCEMENT_APPROVED:{ label: 'Enhancement Approved', variant: 'success' },
  ADR_NMI:             { label: 'ADR Pending',         variant: 'warning' },
  DENIED:              { label: 'Denied',              variant: 'danger' },
  ENHANCEMENT_DENIED:  { label: 'Enhancement Denied',  variant: 'danger' },
  CANCELLED:           { label: 'Cancelled',           variant: 'default' },
};

function formatINR(amount) {
  if (amount == null || amount === '') return '—';
  const num = Number(amount);
  if (Number.isNaN(num)) return '—';
  return num.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

// "Submitted 2d ago" for recent dates, falls back to "21 Apr 2026" for older.
function formatSubmittedAgo(str) {
  if (!str) return null;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays <= 0) return 'Submitted today';
  if (diffDays === 1) return 'Submitted 1d ago';
  if (diffDays < 30) return `Submitted ${diffDays}d ago`;
  return `Submitted ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6.25" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function ClaimList({ approvedOnly }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isInsuranceProvider = user?.role === ROLES.INSURANCE_PROVIDER;
  // The approved-cases view (/claims) is a flat list with no status sub-filter
  // chips — it mixes pre-auth and claim-stage statuses, so a single "All" list
  // is clearest. The pre-auth tracker keeps its status chips.
  const FILTERS = PRE_AUTH_FILTERS;
  const title = approvedOnly ? 'Claim Tracker' : 'Pre-Auth Tracker';
  const subtitle = approvedOnly
    ? 'All cases with an approved amount.'
    : 'Track, enhance, and manage all pre-authorisation requests sent to insurers and TPAs.';
  const [activeFilter, setActiveFilter] = useState('all');
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  // Search state — debounced so we don't fire a request on every keystroke.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  // Stage toggle — default OFF means pre-auth-only. Persisted in the URL so
  // reloads and back-navigation keep the choice.
  const [searchParams, setSearchParams] = useSearchParams();
  const allStages = searchParams.get('all_stages') === '1';
  const toggleAllStages = () => {
    const next = new URLSearchParams(searchParams);
    if (allStages) next.delete('all_stages');
    else next.set('all_stages', '1');
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = {
      ...(search ? { q: search } : {}),
      ...(approvedOnly ? { approved_only: true } : {}),
      // /claim-list defaults to pre-auth only; toggle ON drops the filter
      // so claim-stage cases show too. /claims (approvedOnly) is unaffected.
      ...(!approvedOnly && !allStages ? { stage: 'PRE_AUTH' } : {}),
    };
    claimCaseService.getAll(Object.keys(params).length ? params : undefined)
      .then((res) => { if (!cancelled) setClaims(Array.isArray(res.data) ? res.data : []); })
      .catch(() => { if (!cancelled) setClaims([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [search, approvedOnly, allStages]);

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
        <div className="preauth-tracker__header-text">
          <h1 className="preauth-tracker__title">{title}</h1>
          <p className="preauth-tracker__subtitle">{subtitle}</p>
        </div>
        {!isInsuranceProvider && (
          <div className="preauth-tracker__header-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => navigate('/pre-auth')}
            >
              <IconPlus size={16} /> New Pre-Auth
            </button>
          </div>
        )}
      </div>

      <div className="preauth-tracker__search">
        <span className="preauth-tracker__search-ico"><SearchIcon /></span>
        <input
          type="search"
          className="preauth-tracker__search-input"
          placeholder="Search by PA number, patient, UHID, insurer, diagnosis…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        {searchInput && (
          <button
            type="button"
            className="preauth-tracker__search-clear"
            onClick={() => setSearchInput('')}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {!approvedOnly && (
        <div
          className="preauth-tracker__filters"
          style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}
        >
          {FILTERS.map((tab) => (
            <button
              key={tab.key}
              className={`preauth-tracker__filter ${activeFilter === tab.key ? 'preauth-tracker__filter--active' : ''}`}
              onClick={() => setActiveFilter(tab.key)}
            >
              {tab.label}
              <span className="preauth-tracker__filter-count">{counts[tab.key] || 0}</span>
            </button>
          ))}
          <label
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: '#374151',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <span>All stages</span>
            <span
              role="switch"
              aria-checked={allStages}
              tabIndex={0}
              onClick={toggleAllStages}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAllStages(); } }}
              style={{
                position: 'relative',
                display: 'inline-block',
                width: 36,
                height: 20,
                background: allStages ? '#4f46e5' : '#d1d5db',
                borderRadius: 999,
                transition: 'background 0.15s',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: allStages ? 18 : 2,
                  width: 16,
                  height: 16,
                  background: '#fff',
                  borderRadius: '50%',
                  transition: 'left 0.15s',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                }}
              />
            </span>
          </label>
        </div>
      )}

      {loading ? (
        <div className="page-loading"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="table-card"><EmptyState message="No claims found" /></div>
      ) : (
        <div className="preauth-tracker__list">
          {filtered.map((claim) => {
            const id = claim.claim_case_id || claim.id;
            const uhid = claim.uhid || claim.summary?.uhid || '';
            const paNumber = claim.claim_number || claim.pa_number || uhid || id;
            const patientName = claim.patient_name || claim.summary?.patient_name || '—';
            const age = claim.age ?? claim.summary?.age ?? null;
            const gender = claim.gender || claim.summary?.gender || null;
            const insurer = claim.provider_name || claim.summary?.provider_name || '—';
            const diagnosis = claim.diagnosis || claim.summary?.diagnosis || '';
            const icd10 = claim.icd_10 || claim.summary?.icd_10 || '';
            const requested = claim.amount ?? claim.requested_amount ?? claim.summary?.requested_amount;
            const approved = claim.approved_amount;
            const submittedAgo = formatSubmittedAgo(claim.created_at || claim.submitted_at);
            const status = claim.status;
            const pill = STATUS_PILL[status] || { label: (status || '—').replace(/_/g, ' '), variant: 'default' };
            const adrOverdue = claim.adr_overdue === true || claim.is_adr_overdue === true;
            const unread = claim.unread_count || 0;
            const showApproved = (approved != null && approved !== '') &&
              (status === 'APPROVED' || status === 'PARTIALLY_APPROVED' || status === 'ENHANCEMENT_APPROVED' || status === 'ENHANCE_SUBMITTED' || status === 'ENHANCEMENT_DENIED');

            return (
              <div
                key={id}
                className={`preauth-card ${adrOverdue ? 'preauth-card--overdue' : ''}`}
                onClick={() => navigate(
                  isInsuranceProvider
                    ? `/provider-queue/${id}`
                    : `${approvedOnly ? '/claims' : '/claim-list'}/${id}`,
                  { state: { from: location.pathname } }
                )}
              >
                {/* Left: identity */}
                <div className="preauth-card__col preauth-card__col--id">
                  <div className="preauth-card__idline">
                    <span className="preauth-card__pa">{paNumber}</span>
                    {uhid && String(uhid) !== String(paNumber) && (
                      <span className="preauth-card__uhid">· UHID-{uhid}</span>
                    )}
                  </div>
                  <div className="preauth-card__name">{patientName}</div>
                  <div className="preauth-card__id-meta">
                    {(age != null || gender) && (
                      <span className="preauth-card__chip">
                        {age != null ? `${age}y` : ''}{age != null && gender ? ' · ' : ''}{gender || ''}
                      </span>
                    )}
                    <span className="preauth-card__insurer">{insurer}</span>
                  </div>
                </div>

                {/* Middle: diagnosis */}
                <div className="preauth-card__col preauth-card__col--diag">
                  {diagnosis && <div className="preauth-card__diag">{diagnosis}</div>}
                  {icd10 && <div className="preauth-card__icd">ICD-10: {icd10}</div>}
                </div>

                {/* Right: amounts + status */}
                <div className="preauth-card__col preauth-card__col--right">
                  {approvedOnly ? (
                    <>
                      <div className="preauth-card__amount">
                        <span className="preauth-card__amount-label">Claim Raised:</span>{' '}
                        {claim.claim_raised_amount != null
                          ? formatINR(claim.claim_raised_amount)
                          : <span style={{ color: '#9ca3af', fontWeight: 400 }}>—</span>}
                      </div>
                      <div className="preauth-card__approved">
                        Claim Approved:{' '}
                        {claim.claim_approved_amount != null
                          ? formatINR(claim.claim_approved_amount)
                          : <span style={{ color: '#9ca3af' }}>
                              {claim.claim_raised_amount != null ? 'Pending' : '—'}
                            </span>}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="preauth-card__amount">
                        <span className="preauth-card__amount-label">Requested:</span> {formatINR(requested)}
                      </div>
                      {showApproved && (
                        <div className="preauth-card__approved">Approved: {formatINR(approved)}</div>
                      )}
                    </>
                  )}
                  {submittedAgo && <div className="preauth-card__ago">{submittedAgo}</div>}
                  <div className="preauth-card__badges">
                    {isInsuranceProvider && claim.awaiting_provider_action && (
                      <span
                        title="This case is waiting for your decision"
                        style={{
                          background: '#ef4444',
                          color: '#fff',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 0.5,
                          padding: '3px 8px',
                          borderRadius: 999,
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Action Needed
                      </span>
                    )}
                    {adrOverdue && <span className="preauth-card__overdue">ADR OVERDUE</span>}
                    <span className={`preauth-card__status preauth-card__status--${pill.variant}`}>
                      <span className="preauth-card__status-dot" />
                      {pill.label}
                    </span>
                    {unread > 0 && (
                      <span className="preauth-card__unread">
                        <IconMail size={12} /> {unread} new
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
