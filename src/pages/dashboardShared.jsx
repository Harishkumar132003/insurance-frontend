// Presentational dashboard cards shared by the hospital-admin and super-admin
// dashboards (money funnel, activity feed, open-pipeline bars, weekly volume),
// plus the date RangePicker. Pure formatters live in ./dashboardFormat.
import { useEffect, useRef } from 'react';
import {
  PERIODS,
  todayISO,
  formatRangeLabel,
  formatINR,
  formatCompactINR,
  STATUS_VARIANT,
  statusLabel,
  formatRelative,
} from './dashboardFormat';

// ── Range picker (presets + custom) ─────────────────────────────────

export function RangePicker({
  period, customStart, customEnd, pickerOpen,
  onChoosePreset, onTogglePicker, onChangeStart, onChangeEnd, onApply, onClose,
}) {
  const popoverRef = useRef(null);

  // Close the popover on outside click / Esc.
  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onDoc = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen, onClose]);

  const customLabel = period === 'custom'
    ? formatRangeLabel(customStart, customEnd) || 'Custom'
    : 'Custom';

  const canApply = !!customStart && !!customEnd && customEnd >= customStart;

  return (
    <div className="dashboard__period" ref={popoverRef}>
      {PERIODS.map((p) => (
        <button
          key={p.key}
          type="button"
          className={`dashboard__period-btn ${period === p.key ? 'dashboard__period-btn--active' : ''}`}
          onClick={() => onChoosePreset(p.key)}
        >
          {p.label}
        </button>
      ))}
      <button
        type="button"
        className={`dashboard__period-btn dashboard__period-btn--custom ${period === 'custom' ? 'dashboard__period-btn--active' : ''}`}
        onClick={onTogglePicker}
        aria-expanded={pickerOpen}
      >
        <CalendarIcon /> {customLabel}
      </button>

      {pickerOpen && (
        <div className="dashboard__range-pop" role="dialog">
          <div className="dashboard__range-row">
            <label className="dashboard__range-field">
              <span>From</span>
              <input
                type="date"
                value={customStart}
                max={customEnd || undefined}
                onChange={(e) => onChangeStart(e.target.value)}
              />
            </label>
            <label className="dashboard__range-field">
              <span>To</span>
              <input
                type="date"
                value={customEnd}
                min={customStart || undefined}
                max={todayISO()}
                onChange={(e) => onChangeEnd(e.target.value)}
              />
            </label>
          </div>
          <div className="dashboard__range-actions">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={onApply}
              disabled={!canApply}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  );
}

// ── Money funnel ────────────────────────────────────────────────────

export function FunnelCard({ steps }) {
  const max = Math.max(1, ...steps.map((s) => Number(s.amount) || 0));
  return (
    <section className="dashboard-card">
      <header className="dashboard-card__head">
        <h3>Money Funnel</h3>
        <span className="dashboard-card__hint">From submission through settlement</span>
      </header>
      <div className="funnel">
        {steps.map((s, i) => {
          const pct = max > 0 ? Math.max(4, ((Number(s.amount) || 0) / max) * 100) : 4;
          const prevAmount = i > 0 ? Number(steps[i - 1].amount) || 0 : null;
          const conv = prevAmount && prevAmount > 0
            ? Math.round(((Number(s.amount) || 0) / prevAmount) * 100)
            : null;
          return (
            <div key={s.key} className="funnel__row">
              <div className="funnel__label">
                <span className="funnel__label-name">{s.label}</span>
                <span className="funnel__label-count">{s.count} case{s.count === 1 ? '' : 's'}</span>
              </div>
              <div className="funnel__bar-wrap">
                <div className="funnel__bar" style={{ width: `${pct}%` }}>
                  <span className="funnel__bar-amount">{formatCompactINR(s.amount)}</span>
                </div>
                {conv != null && (
                  <span className={`funnel__conv ${conv >= 90 ? 'funnel__conv--good' : conv >= 60 ? 'funnel__conv--mid' : 'funnel__conv--low'}`}>
                    {conv}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Activity feed ───────────────────────────────────────────────────

export function ActivityCard({ items, onNavigate, title = 'Recent Activity', hint = 'Latest status updates', scroll = false }) {
  return (
    <section className="dashboard-card">
      <header className="dashboard-card__head">
        <h3>{title}</h3>
        <span className="dashboard-card__hint">{hint}</span>
      </header>
      {items.length === 0 ? (
        <div className="dashboard-card__empty">No activity yet.</div>
      ) : (
        <ul className={`activity ${scroll ? 'activity--scroll' : ''}`}>
          {items.map((it, i) => {
            const target = it.stage === 'CLAIM'
              ? `/claims/${it.claim_case_id}`
              : `/claim-list/${it.claim_case_id}`;
            const v = STATUS_VARIANT[it.status] || 'default';
            // Cross-hospital feeds (super admin) prefix the hospital name; the
            // hospital dashboard leaves hospital_name null and shows provider.
            const subParts = [it.hospital_name, it.provider_name].filter(Boolean);
            return (
              <li key={`${it.claim_case_id}-${i}`} className="activity__row" onClick={() => onNavigate(target)}>
                <span className={`activity__pill activity__pill--${v}`}>
                  <span className="activity__pill-dot" />
                  {statusLabel(it.status)}
                </span>
                <div className="activity__body">
                  <div className="activity__title">
                    {it.patient_name || it.uhid || it.claim_case_id.slice(0, 8)}
                    {subParts.length > 0 && <span className="activity__sub"> · {subParts.join(' · ')}</span>}
                  </div>
                  {it.remarks && <div className="activity__remarks">{it.remarks}</div>}
                </div>
                <div className="activity__right">
                  {it.amount != null && (
                    <div className="activity__amount">{formatINR(it.amount)}</div>
                  )}
                  <div className="activity__time">{formatRelative(it.created_at)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── Status distribution (horizontal bars) ───────────────────────────

const STATUS_COLOR = {
  pre_auth_submitted: '#3b82f6',
  pre_auth_approved:  '#10b981',
  claim_submitted:    '#6366f1',
  claim_approved:     '#0e7490',
  invoice_open:       '#f59e0b',
};

export function StatusDistributionCard({ buckets }) {
  const total = buckets.reduce((s, b) => s + (b.count || 0), 0);
  return (
    <section className="dashboard-card">
      <header className="dashboard-card__head">
        <h3>Open Pipeline</h3>
        <span className="dashboard-card__hint">{total} open case{total === 1 ? '' : 's'}</span>
      </header>
      {total === 0 ? (
        <div className="dashboard-card__empty">No open cases.</div>
      ) : (
        <div className="status-dist">
          {buckets.map((b) => {
            const pct = total > 0 ? (b.count / total) * 100 : 0;
            return (
              <div key={b.key} className="status-dist__row">
                <div className="status-dist__label">
                  <span className="status-dist__name">{b.label}</span>
                  <span className="status-dist__count">{b.count}</span>
                </div>
                <div className="status-dist__bar-wrap">
                  <div
                    className="status-dist__bar"
                    style={{
                      width: `${Math.max(2, pct)}%`,
                      background: STATUS_COLOR[b.key] || '#9ca3af',
                    }}
                  />
                  <span className="status-dist__pct">{Math.round(pct)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── Volume trend ────────────────────────────────────────────────────

export function VolumeTrendCard({ points }) {
  const max = Math.max(1, ...points.flatMap((p) => [p.submitted, p.settled]));
  return (
    <section className="dashboard-card">
      <header className="dashboard-card__head">
        <h3>Weekly Volume</h3>
        <span className="dashboard-card__hint">Submitted vs Settled</span>
      </header>
      {points.length === 0 ? (
        <div className="dashboard-card__empty">No data.</div>
      ) : (
        <>
          <div className="trend-legend">
            <span className="trend-legend__item">
              <span className="trend-legend__swatch trend-legend__swatch--submitted" /> Submitted
            </span>
            <span className="trend-legend__item">
              <span className="trend-legend__swatch trend-legend__swatch--settled" /> Settled
            </span>
          </div>
          <div className="trend">
            {points.map((p) => {
              const subPct = (p.submitted / max) * 100;
              const setPct = (p.settled / max) * 100;
              return (
                <div key={p.week_start} className="trend__col" title={`Week of ${p.week_start}\nSubmitted ${p.submitted} · Settled ${p.settled}`}>
                  <div className="trend__bars">
                    <div className="trend__bar trend__bar--submitted" style={{ height: `${subPct}%` }} />
                    <div className="trend__bar trend__bar--settled" style={{ height: `${setPct}%` }} />
                  </div>
                  <div className="trend__label">{new Date(p.week_start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
