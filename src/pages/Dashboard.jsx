import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, ROLES } from '../context/AuthContext';
import { dashboardService } from '../services/api';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import SuperAdminDashboard from './SuperAdminDashboard';
import {
  daysAgoISO,
  todayISO,
  formatRangeLabel,
  formatCompactINR,
  formatDuration,
} from './dashboardFormat';
import {
  RangePicker,
  FunnelCard,
  ActivityCard,
  StatusDistributionCard,
  VolumeTrendCard,
} from './dashboardShared';
import './Dashboard.scss';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isHospitalAdmin = user?.role === ROLES.HOSPITAL_ADMIN;

  // Super admins get the platform-wide rollup (separate endpoint + widgets).
  if (user?.role === ROLES.SUPER_ADMIN) {
    return <SuperAdminDashboard />;
  }

  return <HospitalAdminDashboard user={user} navigate={navigate} isHospitalAdmin={isHospitalAdmin} />;
}

function HospitalAdminDashboard({ user, navigate, isHospitalAdmin }) {
  // `period` drives the chip selection; when 'custom', start/end define the
  // exact window. Picking a preset clears any custom values.
  const [period, setPeriod] = useState('30d');
  const [customStart, setCustomStart] = useState(daysAgoISO(30));
  const [customEnd, setCustomEnd] = useState(todayISO());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const requestArgs = useMemo(() => (
    period === 'custom'
      ? { period: 'custom', start: customStart, end: customEnd }
      : { period }
  ), [period, customStart, customEnd]);

  useEffect(() => {
    if (!isHospitalAdmin) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    dashboardService.hospitalAdmin(requestArgs)
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [requestArgs, isHospitalAdmin]);

  const choosePreset = (key) => {
    setPeriod(key);
    setPickerOpen(false);
  };
  const applyCustom = () => {
    if (!customStart || !customEnd) return;
    if (customEnd < customStart) return;
    setPeriod('custom');
    setPickerOpen(false);
  };
  const resolvedRangeLabel = data
    ? formatRangeLabel(
        data.period_start ? data.period_start.slice(0, 10) : null,
        data.period_end   ? data.period_end.slice(0, 10)   : null,
      )
    : '';

  if (!isHospitalAdmin) {
    return (
      <div className="dashboard">
        <div className="page-header">
          <h1>Dashboard</h1>
          <p>Welcome back, {user?.email || 'User'}</p>
        </div>
        <div className="table-card">
          <EmptyState message="The detailed dashboard is available to hospital admins." />
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="page-header dashboard__header">
        <div>
          <h1>Dashboard</h1>
          <p>{resolvedRangeLabel || `Welcome back, ${user?.email || 'User'}`}</p>
        </div>
        <RangePicker
          period={period}
          customStart={customStart}
          customEnd={customEnd}
          pickerOpen={pickerOpen}
          onChoosePreset={choosePreset}
          onTogglePicker={() => setPickerOpen((o) => !o)}
          onChangeStart={setCustomStart}
          onChangeEnd={setCustomEnd}
          onApply={applyCustom}
          onClose={() => setPickerOpen(false)}
        />
      </div>

      {loading && !data ? (
        <div className="page-loading"><Spinner /></div>
      ) : !data ? (
        <div className="table-card"><EmptyState message="No data available." /></div>
      ) : (
        <>
          <KPIStrip kpis={data.kpis} onNavigate={navigate} />
          <div className="dashboard__row dashboard__row--funnel-activity">
            <FunnelCard steps={data.funnel} />
            <ActivityCard items={data.recent_activity} onNavigate={navigate} />
          </div>
          <div className="dashboard__row dashboard__row--insurers-status">
            <InsurersCard insurers={data.insurers} />
            <StatusDistributionCard buckets={data.status_distribution} />
          </div>
          <div className="dashboard__row dashboard__row--trend-extras">
            <VolumeTrendCard points={data.volume_trend} />
            <ExtrasCard
              diagnoses={data.top_diagnoses}
              cancellations={data.cancellation_reasons}
              adrDays={data.adr_resolution_days}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ── KPI strip ───────────────────────────────────────────────────────

function KPIStrip({ kpis, onNavigate }) {
  const cards = [
    {
      key: 'action',
      label: 'Action Needed',
      value: kpis.action_needed_count,
      subtitle: 'Denied / ADR / Draft',
      color: '#b91c1c',
      bg: '#fee2e2',
      onClick: () => onNavigate('/claim-list'),
    },
    {
      key: 'awaiting',
      label: 'Awaiting Insurer',
      value: kpis.awaiting_insurer_count,
      subtitle: kpis.awaiting_insurer_avg_wait_seconds != null
        ? `Avg wait ${formatDuration(kpis.awaiting_insurer_avg_wait_seconds)}`
        : 'No pending decisions',
      color: '#b45309',
      bg: '#fef3c7',
      onClick: () => onNavigate('/claim-list'),
    },
    {
      key: 'receivables',
      label: 'Outstanding Receivables',
      value: formatCompactINR(kpis.outstanding_receivables_amount),
      subtitle: `Across ${kpis.outstanding_receivables_count} invoice${kpis.outstanding_receivables_count === 1 ? '' : 's'}`,
      color: '#1d4ed8',
      bg: '#dbeafe',
      onClick: () => onNavigate('/invoices'),
    },
    {
      key: 'approved',
      label: 'Approved',
      value: formatCompactINR(kpis.approved_this_month_amount),
      subtitle: `${kpis.approved_this_month_count} case${kpis.approved_this_month_count === 1 ? '' : 's'} in period`,
      color: '#15803d',
      bg: '#dcfce7',
      onClick: () => onNavigate('/claims'),
    },
  ];

  return (
    <div className="dashboard__kpis">
      {cards.map((c) => (
        <button
          key={c.key}
          type="button"
          className="kpi-card"
          onClick={c.onClick}
        >
          <div className="kpi-card__label">{c.label}</div>
          <div className="kpi-card__value" style={{ color: c.color }}>{c.value}</div>
          <div className="kpi-card__subtitle">{c.subtitle}</div>
          <div className="kpi-card__accent" style={{ background: c.bg }} />
        </button>
      ))}
    </div>
  );
}

// ── Insurer performance ─────────────────────────────────────────────

function InsurersCard({ insurers }) {
  return (
    <section className="dashboard-card">
      <header className="dashboard-card__head">
        <h3>Insurer Performance</h3>
        <span className="dashboard-card__hint">By volume in the selected period</span>
      </header>
      {insurers.length === 0 ? (
        <div className="dashboard-card__empty">No insurer activity in this period.</div>
      ) : (
        <div className="insurer-table-wrap">
          <table className="insurer-table">
            <thead>
              <tr>
                <th>Insurer</th>
                <th>Cases</th>
                <th>Approval</th>
                <th>Avg TAT</th>
                <th>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {insurers.map((p) => (
                <tr key={p.provider_id}>
                  <td className="insurer-table__name">{p.name}</td>
                  <td>{p.cases}</td>
                  <td>
                    {p.approval_rate != null ? (
                      <span className={p.approval_rate >= 0.75 ? 'insurer-table__pct--good' : p.approval_rate >= 0.4 ? 'insurer-table__pct--mid' : 'insurer-table__pct--low'}>
                        {Math.round(p.approval_rate * 100)}%
                      </span>
                    ) : '—'}
                  </td>
                  <td>{formatDuration(p.avg_tat_seconds)}</td>
                  <td>{p.outstanding_amount > 0
                    ? <span className="insurer-table__outstanding">{formatCompactINR(p.outstanding_amount)}</span>
                    : <span className="insurer-table__zero">₹0</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Extras (diagnoses + ADR + cancellation reasons) ─────────────────

function ExtrasCard({ diagnoses, cancellations, adrDays }) {
  return (
    <section className="dashboard-card dashboard-card--extras">
      <header className="dashboard-card__head">
        <h3>Operational Insights</h3>
      </header>
      <div className="extras">
        <div className="extras__panel">
          <div className="extras__title">Top Diagnoses</div>
          {diagnoses.length === 0 ? (
            <div className="extras__empty">—</div>
          ) : (
            <ul className="extras__list">
              {diagnoses.map((d, i) => (
                <li key={`${d.diagnosis}-${i}`}>
                  <span className="extras__list-name">{d.diagnosis}</span>
                  <span className="extras__list-count">{d.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="extras__panel">
          <div className="extras__title">ADR Resolution</div>
          <div className="extras__stat">
            {adrDays != null ? `${adrDays.toFixed(1)} days` : '—'}
          </div>
          <div className="extras__caption">Average time to resolve ADR queries</div>
        </div>
        <div className="extras__panel">
          <div className="extras__title">Cancellation Reasons</div>
          {cancellations.length === 0 ? (
            <div className="extras__empty">No cancellations in this period.</div>
          ) : (
            <ul className="extras__list">
              {cancellations.map((c, i) => (
                <li key={i}>
                  <span className="extras__list-name extras__list-name--truncate">{c.reason}</span>
                  <span className="extras__list-count">{c.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
