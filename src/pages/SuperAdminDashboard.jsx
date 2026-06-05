import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dashboardService } from '../services/api';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
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

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

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
    let cancelled = false;
    setLoading(true);
    dashboardService.superAdmin(requestArgs)
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [requestArgs]);

  const choosePreset = (key) => { setPeriod(key); setPickerOpen(false); };
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

  return (
    <div className="dashboard">
      <div className="page-header dashboard__header">
        <div>
          <h1>Platform Dashboard</h1>
          <p>{resolvedRangeLabel || `Welcome back, ${user?.email || 'Admin'}`}</p>
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
          <KPIStrip kpis={data.kpis} adoption={data.adoption} onNavigate={navigate} />
          <div className="dashboard__row dashboard__row--split">
            <FunnelCard steps={data.funnel} />
            <AdoptionCard adoption={data.adoption} onNavigate={navigate} />
          </div>
          <HospitalLeaderboard hospitals={data.hospitals} onNavigate={navigate} />
          <div className="dashboard__row dashboard__row--split">
            <ProvidersCard providers={data.providers} />
            <StatusDistributionCard buckets={data.status_distribution} />
          </div>
          <div className="dashboard__row dashboard__row--split dashboard__row--top">
            <VolumeTrendCard points={data.volume_trend} />
            <ActivityCard items={data.recent_activity} onNavigate={navigate} hint="Across all hospitals" scroll />
          </div>
        </>
      )}
    </div>
  );
}

// ── KPI strip ───────────────────────────────────────────────────────

function KPIStrip({ kpis, adoption, onNavigate }) {
  const onboardedPct = adoption.onboarded_case_share != null
    ? Math.round(adoption.onboarded_case_share * 100)
    : null;
  const cards = [
    {
      key: 'hospitals',
      label: 'Active Hospitals',
      value: adoption.hospitals_active,
      subtitle: `of ${adoption.hospitals_total} onboarded`,
      color: '#6d28d9',
      bg: '#ede9fe',
      onClick: () => onNavigate('/hospitals'),
    },
    {
      key: 'cases',
      label: 'Cases in Period',
      value: kpis.total_cases,
      subtitle: `${kpis.action_needed_count} need action`,
      color: '#0f766e',
      bg: '#ccfbf1',
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
    },
    {
      key: 'approved',
      label: 'Approved',
      value: formatCompactINR(kpis.approved_amount),
      subtitle: kpis.approval_rate != null
        ? `${kpis.approved_cases} cases · ${Math.round(kpis.approval_rate * 100)}% approval`
        : `${kpis.approved_cases} cases`,
      color: '#15803d',
      bg: '#dcfce7',
    },
    {
      key: 'receivables',
      label: 'Outstanding Receivables',
      value: formatCompactINR(kpis.outstanding_receivables_amount),
      subtitle: `Across ${kpis.outstanding_receivables_count} invoice${kpis.outstanding_receivables_count === 1 ? '' : 's'}`,
      color: '#1d4ed8',
      bg: '#dbeafe',
    },
    {
      key: 'adoption',
      label: 'Onboarded Path',
      value: onboardedPct != null ? `${onboardedPct}%` : '—',
      subtitle: `${adoption.onboarded_case_count} of ${adoption.onboarded_case_count + adoption.external_case_count} via app`,
      color: '#be123c',
      bg: '#ffe4e6',
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
          disabled={!c.onClick}
          style={!c.onClick ? { cursor: 'default' } : undefined}
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

// ── Adoption / reach ────────────────────────────────────────────────

function AdoptionCard({ adoption, onNavigate }) {
  const roleEntries = Object.entries(adoption.users_by_role || {});
  const roleLabel = (r) => r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <section className="dashboard-card dashboard-card--extras">
      <header className="dashboard-card__head">
        <h3>Platform Reach</h3>
        <span className="dashboard-card__hint">Current totals</span>
      </header>
      <div className="extras">
        <div className="extras__panel">
          <div className="extras__title">Payers</div>
          <div className="extras__stat">{adoption.providers_total}</div>
          <div className="extras__caption">
            {adoption.providers_onboarded} onboarded · {adoption.providers_external} external
          </div>
        </div>
        <div className="extras__panel">
          <div className="extras__title">Active MOUs</div>
          <div className="extras__stat">{adoption.active_mappings}</div>
          <div className="extras__caption">Hospital ↔ payer mappings</div>
        </div>
        <div className="extras__panel">
          <div className="extras__title">Users ({adoption.users_total})</div>
          {roleEntries.length === 0 ? (
            <div className="extras__empty">—</div>
          ) : (
            <ul className="extras__list">
              {roleEntries.map(([role, n]) => (
                <li key={role}>
                  <span className="extras__list-name">{roleLabel(role)}</span>
                  <span className="extras__list-count">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <button type="button" className="btn btn--ghost btn--sm dashboard-card__cta" onClick={() => onNavigate('/users')}>
        Manage users →
      </button>
    </section>
  );
}

// ── Hospital leaderboard ────────────────────────────────────────────

function HospitalLeaderboard({ hospitals }) {
  return (
    <section className="dashboard-card">
      <header className="dashboard-card__head">
        <h3>Hospital Leaderboard</h3>
        <span className="dashboard-card__hint">By case volume in the selected period</span>
      </header>
      {hospitals.length === 0 ? (
        <div className="dashboard-card__empty">No hospital activity in this period.</div>
      ) : (
        <div className="insurer-table-wrap insurer-table-wrap--scroll">
          <table className="insurer-table">
            <thead>
              <tr>
                <th>Hospital</th>
                <th>Cases</th>
                <th>Approval</th>
                <th>Avg TAT</th>
                <th>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {hospitals.map((h) => (
                <tr key={h.hospital_id}>
                  <td className="insurer-table__name">{h.name}</td>
                  <td>{h.cases}</td>
                  <td><ApprovalPct rate={h.approval_rate} /></td>
                  <td>{formatDuration(h.avg_tat_seconds)}</td>
                  <td>{h.outstanding_amount > 0
                    ? <span className="insurer-table__outstanding">{formatCompactINR(h.outstanding_amount)}</span>
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

// ── Provider performance (platform-wide) ────────────────────────────

function ProvidersCard({ providers }) {
  return (
    <section className="dashboard-card">
      <header className="dashboard-card__head">
        <h3>Payer Performance</h3>
        <span className="dashboard-card__hint">Onboarded vs external, by volume</span>
      </header>
      {providers.length === 0 ? (
        <div className="dashboard-card__empty">No payer activity in this period.</div>
      ) : (
        <div className="insurer-table-wrap insurer-table-wrap--scroll">
          <table className="insurer-table">
            <thead>
              <tr>
                <th>Payer</th>
                <th>Cases</th>
                <th>Approval</th>
                <th>Avg TAT</th>
                <th>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.provider_id}>
                  <td className="insurer-table__name">
                    {p.name}
                    <span className={`onboard-badge ${p.is_onboarded ? 'onboard-badge--on' : 'onboard-badge--off'}`}>
                      {p.is_onboarded ? 'Onboarded' : 'External'}
                    </span>
                  </td>
                  <td>{p.cases}</td>
                  <td><ApprovalPct rate={p.approval_rate} /></td>
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

function ApprovalPct({ rate }) {
  if (rate == null) return '—';
  const cls = rate >= 0.75 ? 'insurer-table__pct--good' : rate >= 0.4 ? 'insurer-table__pct--mid' : 'insurer-table__pct--low';
  return <span className={cls}>{Math.round(rate * 100)}%</span>;
}
