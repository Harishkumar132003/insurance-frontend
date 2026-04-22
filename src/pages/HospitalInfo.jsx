import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { hospitalService } from '../services/api';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import './Pages.scss';

// Fields rendered via the explicit editable UI — excluded from the read-only grid.
const EDITABLE_KEYS = new Set(['email', 'app_password']);

// Keys we never want to show in the read-only grid (internal / handled separately).
const HIDDEN_KEYS = new Set(['id', 'hospital_id', 'has_app_password']);

function formatKey(k) {
  return k
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(v) {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  // Detect ISO timestamps and render locally
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  }
  return String(v);
}

export default function HospitalInfo() {
  const { user } = useAuth();
  const toast = useToast();
  const [hospital, setHospital] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.hospital_id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    hospitalService.getById(user.hospital_id)
      .then((res) => {
        if (cancelled) return;
        setHospital(res.data);
        setEmail(res.data?.email || '');
      })
      .catch(() => {
        if (!cancelled) setHospital(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.hospital_id]);

  const emailChanged = email !== (hospital?.email || '');
  const passwordProvided = appPassword.trim().length > 0;
  const canSave = emailChanged || passwordProvided;

  const handleSave = async (e) => {
    e.preventDefault();
    if (!hospital?.id || !canSave) return;
    const payload = { ...hospital, email };
    if (passwordProvided) {
      payload.app_password = appPassword;
    }
    setSaving(true);
    try {
      const res = await hospitalService.update(hospital.id, payload);
      const nextHospital = res.data || {
        ...hospital,
        email,
        has_app_password: passwordProvided ? true : hospital.has_app_password,
      };
      setHospital(nextHospital);
      setAppPassword('');
      toast.success('Hospital info updated');
    } catch {
      // handled
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="page-loading"><Spinner /></div>;
  }

  if (!user?.hospital_id) {
    return (
      <div>
        <div className="page-header">
          <h1>Hospital Info</h1>
        </div>
        <div className="table-card">
          <EmptyState message="No hospital associated with your account" />
        </div>
      </div>
    );
  }

  if (!hospital) {
    return (
      <div>
        <div className="page-header">
          <h1>Hospital Info</h1>
        </div>
        <div className="table-card">
          <EmptyState message="Unable to load hospital details" />
        </div>
      </div>
    );
  }

  const readOnlyEntries = Object.entries(hospital)
    .filter(([k]) => !EDITABLE_KEYS.has(k) && !HIDDEN_KEYS.has(k));

  return (
    <div>
      <div className="page-header">
        <h1>Hospital Info</h1>
        <p>View hospital details and update the contact email</p>
      </div>

      <form onSubmit={handleSave} className="hospital-info">
        <div className="hospital-info__grid">
          {readOnlyEntries.map(([k, v]) => (
            <div key={k} className="hospital-info__field">
              <label className="hospital-info__label">{formatKey(k)}</label>
              <div className="hospital-info__value">{formatValue(v)}</div>
            </div>
          ))}
          <div className="hospital-info__field hospital-info__field--editable">
            <label className="hospital-info__label" htmlFor="hospital-email">Email</label>
            <input
              id="hospital-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@hospital.com"
              required
            />
          </div>

          <div className="hospital-info__field hospital-info__field--editable">
            <label className="hospital-info__label" htmlFor="hospital-app-password">
              App Password
              <span className={`hospital-info__pw-status hospital-info__pw-status--${hospital.has_app_password ? 'set' : 'missing'}`}>
                {hospital.has_app_password ? 'Set' : 'Not set'}
              </span>
            </label>
            <input
              id="hospital-app-password"
              type="password"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              placeholder={hospital.has_app_password ? '•••••••• (enter a new password to change)' : 'Set an app password'}
              autoComplete="new-password"
            />
          </div>
        </div>

        <div className="hospital-info__actions">
          <button type="submit" className="btn btn--primary" disabled={saving || !canSave}>
            {saving ? <Spinner size={18} /> : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
