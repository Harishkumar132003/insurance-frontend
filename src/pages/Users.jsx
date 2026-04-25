import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { IconPlus } from '../components/icons/Icons';
import { userService, hospitalService } from '../services/api';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import './Pages.scss';

export default function Users() {
  const { isSuperAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterHospitalId, setFilterHospitalId] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [form, setForm] = useState({
    email: '',
    password: '',
    role: 'HOSPITAL_ADMIN',
    hospital_id: '',
  });
  const [formAccess, setFormAccess] = useState(null); // null = full access
  const [featureList, setFeatureList] = useState([]);
  const [accessEditUser, setAccessEditUser] = useState(null);
  const [accessDraft, setAccessDraft] = useState(null); // null = full access, [] = restricted
  const [accessSaving, setAccessSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      // Load hospitals list for Super Admin filter & create form
      let hospitalList = [];
      if (isSuperAdmin) {
        const hRes = await hospitalService.getAll();
        hospitalList = Array.isArray(hRes.data) ? hRes.data : [];
        setHospitals(hospitalList);
      }
      // Load canonical feature list (used by the access modal)
      try {
        const fRes = await userService.getFeatures();
        const raw = Array.isArray(fRes.data?.features) ? fRes.data.features : Array.isArray(fRes.data) ? fRes.data : [];
        // Normalize to { key, label } — backend may return strings or objects
        const list = raw.map((f) => (
          typeof f === 'string'
            ? { key: f, label: f.replace(/_/g, ' ') }
            : { key: f.key, label: f.label || f.key?.replace(/_/g, ' ') }
        )).filter((f) => f.key);
        setFeatureList(list);
      } catch {
        setFeatureList([]);
      }
      await fetchUsers();
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async (hospitalId, role) => {
    setLoading(true);
    try {
      const params = {};
      if (hospitalId) params.hospital_id = hospitalId;
      if (role) params.role = role;
      const res = await userService.getAll(Object.keys(params).length ? params : undefined);
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const id = e.target.value;
    setFilterHospitalId(id);
    fetchUsers(id || undefined, filterRole || undefined);
  };

  const handleRoleFilterChange = (e) => {
    const role = e.target.value;
    setFilterRole(role);
    fetchUsers(filterHospitalId || undefined, role || undefined);
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) return;

    // Collapse fully-checked access list to null (= full access) to match backend NULL semantics.
    const accessForPayload =
      Array.isArray(formAccess) && featureList.length > 0 && featureList.every((f) => formAccess.includes(f.key))
        ? null
        : formAccess;

    const payload = {
      email: form.email,
      password: form.password,
      role: form.role,
      hospital_id: form.hospital_id || null,
      access: accessForPayload,
    };

    setSaving(true);
    try {
      await userService.create(payload);
      toast.success('User created');
      setShowModal(false);
      setForm({ email: '', password: '', role: 'HOSPITAL_ADMIN', hospital_id: '' });
      setFormAccess(null);
      fetchUsers(filterHospitalId || undefined, filterRole || undefined);
    } catch {
      // handled
    } finally {
      setSaving(false);
    }
  };

  const toggleFormAccess = (key) => {
    setFormAccess((prev) => {
      const current = Array.isArray(prev) ? prev : featureList.map((f) => f.key);
      return current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    });
  };

  const openAccessEditor = (user) => {
    setAccessEditUser(user);
    setAccessDraft(Array.isArray(user.access) ? [...user.access] : null);
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
    // If every known feature is selected, collapse to null (= full access) to match backend semantics.
    const payload = Array.isArray(accessDraft) && featureList.length > 0 && featureList.every((f) => accessDraft.includes(f.key))
      ? null
      : accessDraft;
    setAccessSaving(true);
    try {
      await userService.updateAccess(accessEditUser.id, payload);
      toast.success('Access updated');
      closeAccessEditor();
      fetchUsers(filterHospitalId || undefined, filterRole || undefined);
    } catch {
      // handled
    } finally {
      setAccessSaving(false);
    }
  };

  const isFullAccess = (user) => {
    if (!Array.isArray(user.access)) return true;
    const total = featureList.length;
    return total > 0 && user.access.length >= total;
  };

  const accessSummary = (user) => {
    if (isFullAccess(user)) return 'Full access';
    const total = featureList.length || user.access.length;
    return `${user.access.length}/${total} features`;
  };

  // Hospital id → name lookup
  const hospitalMap = {};
  hospitals.forEach((h) => { hospitalMap[h.id] = h.name; });

  return (
    <div>
      <div className="page-header">
        <h1>Users</h1>
        <p>Manage user accounts</p>
      </div>

      <div className="page-toolbar">
        {/* Hospital filter for Super Admin */}
        {isSuperAdmin && hospitals.length > 0 && (
          <div className="page-toolbar__filter">
            <select value={filterHospitalId} onChange={handleFilterChange}>
              <option value="">All Hospitals</option>
              {hospitals.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
        )}
        {isSuperAdmin && (
          <div className="page-toolbar__filter">
            <select value={filterRole} onChange={handleRoleFilterChange}>
              <option value="">All Roles</option>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="HOSPITAL_ADMIN">Hospital Admin</option>
              <option value="INSURANCE_PROVIDER">Insurance Provider</option>
            </select>
          </div>
        )}
        <button className="btn btn--primary" onClick={() => setShowModal(true)}>
          <IconPlus size={18} /> Create User
        </button>
      </div>

      {loading ? (
        <div className="page-loading"><Spinner /></div>
      ) : users.length === 0 ? (
        <div className="table-card">
          <EmptyState message="No users found" />
        </div>
      ) : (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Email</th>
                <th>Role</th>
                <th>Hospital</th>
                <th>Provider</th>
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
                  <td>{hospitalMap[u.hospital_id] || u.hospital_id || '—'}</td>
                  <td>{u.policy_provider?.name || '—'}</td>
                  <td>
                    <span className={`badge badge--${isFullAccess(u) ? 'success' : 'warning'}`}>
                      {accessSummary(u)}
                    </span>
                  </td>
                  <td>
                    {u.role !== 'INSURANCE_PROVIDER' && (
                      <button className="btn btn--ghost btn--sm" onClick={() => openAccessEditor(u)}>
                        Edit Access
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
              <p style={{ fontSize: '0.85rem', color: '#b91c1c' }}>
                No feature list loaded from backend.
              </p>
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

      {showModal && (
        <Modal title="Create User" onClose={() => setShowModal(false)}>
          <form onSubmit={handleCreate} className="modal-form">
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                name="email"
                placeholder="user@example.com"
                value={form.email}
                onChange={handleChange}
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
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select name="role" value={form.role} onChange={handleChange}>
                <option value="HOSPITAL_ADMIN">Hospital Admin</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </div>
            <div className="form-group">
              <label>Hospital</label>
              <select name="hospital_id" value={form.hospital_id} onChange={handleChange}>
                <option value="">Select hospital (optional for Super Admin)</option>
                {hospitals.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
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
              <button type="button" className="btn btn--ghost" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? <Spinner size={18} /> : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
