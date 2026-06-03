import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { invoiceService } from '../services/api';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import './Pages.scss';

const TABS = [
  { key: 'to_invoice', label: 'Ready to Raise' },
  { key: 'invoiced', label: 'Raised' },
];

const INVOICE_STATUS_PILL = {
  INVOICE_RAISED: { label: 'Invoice Raised', variant: 'info' },
  PAID: { label: 'Paid', variant: 'success' },
  UNPAID: { label: 'Unpaid', variant: 'danger' },
};

function formatINR(amount) {
  if (amount == null || amount === '') return '—';
  const num = Number(amount);
  if (Number.isNaN(num)) return '—';
  return num.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

function formatAgo(str) {
  if (!str) return null;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return '1d ago';
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function InvoiceList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('to_invoice');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    invoiceService
      .list(activeTab)
      .then((res) => {
        if (!cancelled) setRows(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  return (
    <div className="preauth-tracker">
      <div className="preauth-tracker__header">
        <div className="preauth-tracker__header-text">
          <h1 className="preauth-tracker__title">Raise Invoice</h1>
          <p className="preauth-tracker__subtitle">
            Track approved claims and invoices raised against insurers.
          </p>
        </div>
      </div>

      <div
        className="preauth-tracker__filters"
        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`preauth-tracker__filter ${activeTab === tab.key ? 'preauth-tracker__filter--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="page-loading">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <div className="table-card">
          <EmptyState
            message={
              activeTab === 'to_invoice'
                ? 'No claim-approved cases ready to raise'
                : 'No invoices raised yet'
            }
          />
        </div>
      ) : (
        <div className="preauth-tracker__list">
          {rows.map((row) => {
            const id = row.claim_case_id;
            const pill = INVOICE_STATUS_PILL[row.invoice_status] || null;
            return (
              <div
                key={id}
                className="preauth-card"
                onClick={() =>
                  navigate(`/claims/${id}`, { state: { from: location.pathname } })
                }
              >
                <div className="preauth-card__col preauth-card__col--id">
                  <div className="preauth-card__idline">
                    <span className="preauth-card__pa">
                      {row.claim_number || row.uhid || id}
                    </span>
                    {row.uhid && row.uhid !== row.claim_number && (
                      <span className="preauth-card__uhid">· UHID-{row.uhid}</span>
                    )}
                  </div>
                  <div className="preauth-card__name">{row.patient_name || '—'}</div>
                  <div className="preauth-card__id-meta">
                    <span className="preauth-card__insurer">{row.provider_name || '—'}</span>
                  </div>
                </div>

                <div className="preauth-card__col preauth-card__col--diag">
                  {row.insurer_invoice_id && (
                    <div className="preauth-card__diag">
                      Invoice #{row.insurer_invoice_id}
                    </div>
                  )}
                  {row.invoice_created_at && (
                    <div className="preauth-card__icd">
                      Raised {formatAgo(row.invoice_created_at)}
                    </div>
                  )}
                </div>

                <div className="preauth-card__col preauth-card__col--right">
                  <div className="preauth-card__amount">
                    <span className="preauth-card__amount-label">Claim Approved:</span>{' '}
                    {formatINR(row.claim_approved_amount)}
                  </div>
                  {row.insurer_amount != null && (
                    <div className="preauth-card__approved">
                      Invoice: {formatINR(row.insurer_amount)}
                      {row.paid_total != null && row.paid_total > 0 && (
                        <> · Paid {formatINR(row.paid_total)}</>
                      )}
                    </div>
                  )}
                  <div className="preauth-card__badges">
                    {pill ? (
                      <span
                        className={`preauth-card__status preauth-card__status--${pill.variant}`}
                      >
                        <span className="preauth-card__status-dot" />
                        {pill.label}
                      </span>
                    ) : (
                      <span
                        className="preauth-card__status preauth-card__status--warning"
                        title="No invoice has been raised yet"
                      >
                        <span className="preauth-card__status-dot" />
                        Ready to invoice
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
