import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { IconPlus } from '../components/icons/Icons';
import { userService } from '../services/api';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import './Pages.scss';

export default function ManageUsers() {
  const { user } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [featureList, setFeatureList] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });
  const [formAccess, setFormAccess] = useState(null); // null = full
  const [accessEditUser, setAccessEditUser] = useState(null);
  const [accessDraft, setAccessDraft] = useState(null);
  const [accessSaving, setAccessSaving] = useState(false);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const fRes = await userService.getFeatures().catch(() => ({ data: { features: [] } }));
      const raw = Array.isArray(fRes.data?.features) ? fRes.data.features : Array.isArray(fRes.data) ? fRes.data : [];
      const list = raw.map((f) => (
        typeof f === 'string'
          ? { key: f, label: f.replace(/_/g, ' ') }
          : { key: f.key, label: f.label || f.key?.replace(/_/g, ' ') }
      )).filter((f) => f.key);
      setFeatureList(list);
      await fetchUsers();
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = user?.hospital_id ? { hospital_id: user.hospital_id } : undefined;
      const res = await userService.getAll(params);
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleFormAccess = (key) => {
    setFormAccess((prev) => {
      const current = Array.isArray(prev) ? prev : featureList.map((f) => f.key);
      return current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) return;
    if (!user?.hospital_id) {
      toast.error('No hospital associated with your account');
      return;
    }
    const accessForPayload =
      Array.isArray(formAccess) && featureList.length > 0 && featureList.every((f) => formAccess.includes(f.key))
        ? null
        : formAccess;
    setSaving(true);
    try {
      await userService.create({
        email: form.email,
        password: form.password,
        role: 'HOSPITAL_ADMIN',
        hospital_id: user.hospital_id,
        access: accessForPayload,
      });
      toast.success('User created');
      setShowCreate(false);
      setForm({ email: '', password: '' });
      setFormAccess(null);
      fetchUsers();
    } catch {
      // handled
    } finally {
      setSaving(false);
    }
  };

  const openAccessEditor = (u) => {
    setAccessEditUser(u);
    setAccessDraft(Array.isArray(u.access) ? [...u.access] : null);
  };

  const closeAccessEditor = () => {
    setAccessEditUser(null);
    setAccessDraft(null);
  };

  const toggleFeature = (key) => {
    setAccessDraft((prev) => {
      const current = Array.isArray(prev) ? prev : featureList.map((f) => f.key);
      return current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    });
  };

  const restoreFullAccess = () => setAccessDraft(null);

  const saveAccess = async () => {
    if (!accessEditUser) return;
    const payload = Array.isArray(accessDraft) && featureList.length > 0 && featureList.every((f) => accessDraft.includes(f.key))
      ? null
      : accessDraft;
    setAccessSaving(true);
    try {
      await userService.updateAccess(accessEditUser.id, payload);
      toast.success('Access updated');
      closeAccessEditor();
      fetchUsers();
    } catch {
      // handled
    } finally {
      setAccessSaving(false);
    }
  };

  const isFullAccess = (u) => {
    if (!Array.isArray(u.access)) return true;
    const total = featureList.length;
    return total > 0 && u.access.length >= total;
  };

  const accessSummary = (u) => {
    if (isFullAccess(u)) return 'Full access';
    const total = featureList.length || u.access.length;
    return `${u.access.length}/${total} features`;
  };

  return (
    <div>
      <div className="page-header">
        <h1>Manage Users</h1>
        <p>Create and manage users within your hospital</p>
      </div>

      <div className="page-toolbar">
        <button className="btn btn--primary" onClick={() => setShowCreate(true)}>
          <IconPlus size={18} /> Create User
        </button>
      </div>

      {loading ? (
        <div className="page-loading"><Spinner /></div>
      ) : users.length === 0 ? (
        <div className="table-card"><EmptyState message="No users in your hospital yet" /></div>
      ) : (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Email</th>
                <th>Role</th>
                <th>Access</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id || i}>
                  <td>{i + 1}</td>
                  <td>{u.email}</td>
                  <td><span className={`badge badge--${u.role?.toLowerCase()}`}>{u.role?.replace('_', ' ')}</span></td>
                  <td>
                    <span className={`badge badge--${isFullAccess(u) ? 'success' : 'warning'}`}>
                      {accessSummary(u)}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn--ghost btn--sm" onClick={() => openAccessEditor(u)}>
                      Edit Access
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <Modal title="Create User" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="modal-form">
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                name="email"
                placeholder="user@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                name="password"
                placeholder="Min. 6 characters"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Access</label>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 8px' }}>
                {formAccess === null
                  ? 'Full access will be granted. Uncheck features to restrict.'
                  : 'Only the checked features will be accessible.'}
              </p>
              {featureList.length === 0 ? (
                <small style={{ color: '#b91c1c' }}>No feature list loaded.</small>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {featureList.map((feat) => {
                    const enabled = formAccess === null || formAccess.includes(feat.key);
                    return (
                      <label key={feat.key} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}>
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => toggleFormAccess(feat.key)}
                        />
                        <span>{feat.label}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? <Spinner size={18} /> : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {accessEditUser && (
        <Modal title={`Access for ${accessEditUser.email}`} onClose={closeAccessEditor}>
          <div className="modal-form">
            <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: 12 }}>
              {accessDraft === null
                ? 'This user currently has full access. Uncheck features to restrict.'
                : 'Toggle the features this user can access.'}
            </p>
            {featureList.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: '#b91c1c' }}>No feature list loaded.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {featureList.map((feat) => {
                  const enabled = accessDraft === null || accessDraft.includes(feat.key);
                  return (
                    <label key={feat.key} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => toggleFeature(feat.key)}
                      />
                      <span>{feat.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn--ghost" onClick={restoreFullAccess}>
                Restore Full Access
              </button>
              <div style={{ flex: 1 }} />
              <button type="button" className="btn btn--ghost" onClick={closeAccessEditor}>
                Cancel
              </button>
              <button type="button" className="btn btn--primary" disabled={accessSaving} onClick={saveAccess}>
                {accessSaving ? <Spinner size={18} /> : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
