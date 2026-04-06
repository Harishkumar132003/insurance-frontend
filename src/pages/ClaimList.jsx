import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { claimCaseService } from '../services/api';
import EmptyState from '../components/EmptyState';
import './Pages.scss';

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'pre_auth', label: 'Pre Auth' },
  { key: 'claim', label: 'Claim' },
  { key: 'settle', label: 'Settle' },
];

const CLAIM_STATUS_TYPE = {
  PRE_AUTH: { label: 'Pre Auth', badge: 'warning', filter: 'pre_auth' },
  CLAIM: { label: 'Claim', badge: 'info', filter: 'claim' },
  SETTLE: { label: 'Settle', badge: 'success', filter: 'settle' },
  APPROVED: { label: 'Claim', badge: 'info', filter: 'claim' },
  PENDING: { label: 'Pre Auth', badge: 'warning', filter: 'pre_auth' },
  UNDER_REVIEW: { label: 'Claim', badge: 'info', filter: 'claim' },
  REJECTED: { label: 'Claim', badge: 'info', filter: 'claim' },
  SETTLED: { label: 'Settle', badge: 'success', filter: 'settle' },
};

const STATUS_BADGE = {
  PENDING: 'warning',
  APPROVED: 'success',
  UNDER_REVIEW: 'info',
  REJECTED: 'danger',
  SETTLED: 'success',
};

export default function ClaimList() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('all');
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    claimCaseService.getAll()
      .then((res) => setClaims(res.data))
      .catch(() => setClaims([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = activeFilter === 'all'
    ? claims
    : claims.filter((c) => (CLAIM_STATUS_TYPE[c.claim_status]?.filter || '') === activeFilter);

  return (
    <div>
      <div className="page-header">
        <h1>Claim List</h1>
        <p>View and track insurance claims</p>
      </div>

      <div className="claim-filters">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            className={`claim-filters__btn ${activeFilter === tab.key ? 'claim-filters__btn--active' : ''}`}
            onClick={() => setActiveFilter(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="page-loading">Loading…</div>
      ) : filtered.length === 0 ? (
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
                <th>Type</th>
                <th>Provider</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((claim, i) => (
                <tr key={claim.claim_case_id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/pre-auth?claim_case_id=${claim.claim_case_id}`)}>
                  <td>{i + 1}</td>
                  <td>{claim.patient_name}</td>
                  <td>{claim.claim_number || '--'}</td>
                  <td>
                    <span className={`badge badge--${CLAIM_STATUS_TYPE[claim.claim_status]?.badge || 'default'}`}>
                      {CLAIM_STATUS_TYPE[claim.claim_status]?.label || claim.claim_status}
                    </span>
                  </td>
                  <td>{claim.provider_name}</td>
                  <td>{claim.amount?.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</td>
                  <td>
                    <span className={`badge badge--${STATUS_BADGE[claim.status] || 'default'}`}>
                      {claim.status?.replace('_', ' ')}
                    </span>
                  </td>
                  <td>{claim.created_at ? new Date(claim.created_at).toLocaleDateString('en-IN') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
