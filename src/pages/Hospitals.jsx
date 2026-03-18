import { useState, useEffect } from 'react';
import { useToast } from '../components/Toast';
import { IconPlus } from '../components/icons/Icons';
import { hospitalService } from '../services/api';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import './Pages.scss';

export default function Hospitals() {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetchHospitals();
  }, []);

  const fetchHospitals = async () => {
    try {
      const res = await hospitalService.getAll();
      setHospitals(Array.isArray(res.data) ? res.data : []);
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await hospitalService.create({ name });
      toast.success('Hospital created');
      setShowModal(false);
      setName('');
      fetchHospitals();
    } catch {
      // handled by interceptor
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Hospitals</h1>
        <p>Manage hospital organizations</p>
      </div>

      <div className="page-toolbar">
        <button className="btn btn--primary" onClick={() => setShowModal(true)}>
          <IconPlus size={18} /> Create Hospital
        </button>
      </div>

      {loading ? (
        <div className="page-loading"><Spinner /></div>
      ) : hospitals.length === 0 ? (
        <div className="table-card">
          <EmptyState message="No hospitals found" />
        </div>
      ) : (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Hospital Name</th>
                <th>ID</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {hospitals.map((h, i) => (
                <tr key={h.id || i}>
                  <td>{i + 1}</td>
                  <td>{h.name}</td>
                  <td className="td-truncate">{h.id}</td>
                  <td>{h.created_at ? new Date(h.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title="Create Hospital" onClose={() => setShowModal(false)}>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label>Hospital Name</label>
              <input
                type="text"
                placeholder="Enter hospital name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
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
