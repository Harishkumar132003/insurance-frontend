// Pure formatting helpers + constants shared across the hospital-admin and
// super-admin dashboards. Kept separate from the card components so React
// Fast Refresh stays happy (a module should export only components or only
// non-components).

export const PERIODS = [
  { key: '7d',         label: '7 days',  shortLabel: '7d' },
  { key: '30d',        label: '30 days', shortLabel: '30d' },
  { key: '90d',        label: '90 days', shortLabel: '90d' },
  { key: 'this_month', label: 'This month', shortLabel: 'MTD' },
  { key: 'this_year',  label: 'This year',  shortLabel: 'YTD' },
];

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const daysAgoISO = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export function formatRangeLabel(startISO, endISO) {
  if (!startISO || !endISO) return '';
  const s = new Date(startISO);
  const e = new Date(endISO);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '';
  const opts = { day: 'numeric', month: 'short', year: 'numeric' };
  const sameYear = s.getFullYear() === e.getFullYear();
  const sStr = sameYear
    ? s.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : s.toLocaleDateString('en-IN', opts);
  const eStr = e.toLocaleDateString('en-IN', opts);
  const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
  return `${sStr} – ${eStr} · ${days} day${days === 1 ? '' : 's'}`;
}

export function formatINR(amount) {
  if (amount == null || amount === '') return '—';
  const num = Number(amount);
  if (Number.isNaN(num)) return '—';
  return num.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

export function formatCompactINR(amount) {
  const num = Number(amount) || 0;
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(num >= 100000000 ? 0 : 1)}Cr`;
  if (num >= 100000)   return `₹${(num / 100000).toFixed(num >= 1000000 ? 0 : 1)}L`;
  if (num >= 1000)     return `₹${(num / 1000).toFixed(num >= 10000 ? 0 : 1)}k`;
  return `₹${num.toFixed(0)}`;
}

export function formatDuration(seconds) {
  if (seconds == null) return '—';
  const s = Math.max(0, Number(seconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatRelative(str) {
  if (!str) return '';
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export const STATUS_VARIANT = {
  APPROVED:             'success',
  PARTIALLY_APPROVED:   'success',
  ENHANCEMENT_APPROVED: 'success',
  CLAIM_APPROVED:       'success',
  CLAIM_PARTIALLY_APPROVED: 'success',
  DENIED:               'danger',
  ENHANCEMENT_DENIED:   'danger',
  CLAIM_DENIED:         'danger',
  ADR_NMI:              'warning',
  CLAIM_ADR_NMI:        'warning',
  SUBMITTED:            'info',
  ENHANCE_SUBMITTED:    'info',
  ADR_SUBMITTED:        'info',
  RECONSIDER:           'info',
  CLAIM_SUBMITTED:      'info',
  CLAIM_ADR_SUBMITTED:  'info',
  CLAIM_RECONSIDER:     'info',
  CANCELLED:            'default',
  DRAFT:                'default',
};

export function statusLabel(s) {
  if (!s) return '—';
  if (s === 'ADR_NMI') return 'ADR';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
