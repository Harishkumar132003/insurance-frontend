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
  const [form, setForm] = useState({
    email: '',
    password: '',
    role: 'HOSPITAL_ADMIN',
    hospital_id: '',
  });
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
      await fetchUsers();
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async (hospitalId) => {
    setLoading(true);
    try {
      const params = hospitalId ? { hospital_id: hospitalId } : undefined;
      const res = await userService.getAll(params);
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
    fetchUsers(id || undefined);
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) return;

    const payload = {
      email: form.email,
      password: form.password,
      role: form.role,
      hospital_id: form.hospital_id || null,
    };

    setSaving(true);
    try {
      await userService.create(payload);
      toast.success('User created');
      setShowModal(false);
      setForm({ email: '', password: '', role: 'HOSPITAL_ADMIN', hospital_id: '' });
      fetchUsers(filterHospitalId || undefined);
    } catch {
      // handled
    } finally {
      setSaving(false);
    }
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
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id || i}>
                  <td>{i + 1}</td>
                  <td>{u.email}</td>
                  <td><span className={`badge badge--${u.role?.toLowerCase()}`}>{u.role?.replace('_', ' ')}</span></td>
                  <td>{hospitalMap[u.hospital_id] || u.hospital_id || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
