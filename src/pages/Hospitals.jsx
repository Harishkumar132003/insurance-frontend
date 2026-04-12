import { useState, useEffect } from 'react';
import { useToast } from '../components/Toast';
import { IconPlus, IconMail, IconEdit, IconTrash, IconX } from '../components/icons/Icons';
import { hospitalService, ccEmailService, policyProviderService } from '../services/api';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import './Pages.scss';

export default function Hospitals() {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [rohiniId, setRohiniId] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // Manage Mail state
  const [mailTarget, setMailTarget] = useState(null);
  const [ccEmails, setCcEmails] = useState([]);
  const [loadingCc, setLoadingCc] = useState(false);
  const [providers, setProviders] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [newCcEmail, setNewCcEmail] = useState('');
  const [newCcProviderId, setNewCcProviderId] = useState('');
  const [addingCc, setAddingCc] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editEmail, setEditEmail] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

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
      await hospitalService.create({ name, address, rohini_id: rohiniId, email });
      toast.success('Hospital created');
      setShowModal(false);
      setName('');
      setAddress('');
      setRohiniId('');
      setEmail('');
      fetchHospitals();
    } catch {
      // handled by interceptor
    } finally {
      setSaving(false);
    }
  };

  // ── Manage Mail ──

  const openManageMail = async (hospital) => {
    setMailTarget(hospital);
    setLoadingCc(true);
    setLoadingProviders(true);
    setCcEmails([]);
    setProviders([]);
    setNewCcEmail('');
    setNewCcProviderId('');
    setEditingId(null);

    try {
      const res = await ccEmailService.getByHospital(hospital.id);
      setCcEmails(Array.isArray(res.data) ? res.data : []);
    } catch {
      setCcEmails([]);
    } finally {
      setLoadingCc(false);
    }

    try {
      const res = await policyProviderService.getAll();
      const list = Array.isArray(res.data) ? res.data : [];
      setProviders(list);
      if (list.length > 0) setNewCcProviderId(list[0].id);
    } catch {
      setProviders([]);
    } finally {
      setLoadingProviders(false);
    }
  };

  const closeManageMail = () => {
    setMailTarget(null);
    setCcEmails([]);
    setEditingId(null);
  };

  const handleAddCcEmail = async () => {
    if (!newCcEmail.trim()) { toast.error('Please enter an email'); return; }
    if (!newCcProviderId) { toast.error('Please select a provider'); return; }
    setAddingCc(true);
    try {
      await ccEmailService.create({
        email: newCcEmail.trim(),
        hospital_id: mailTarget.id,
        policy_provider_id: newCcProviderId,
      });
      toast.success('CC email added');
      setNewCcEmail('');
      const res = await ccEmailService.getByHospital(mailTarget.id);
      setCcEmails(Array.isArray(res.data) ? res.data : []);
    } catch {
      // handled
    } finally {
      setAddingCc(false);
    }
  };

  const handleUpdateCcEmail = async (id) => {
    if (!editEmail.trim()) { toast.error('Email cannot be empty'); return; }
    setSavingEdit(true);
    try {
      await ccEmailService.update(id, { email: editEmail.trim() });
      toast.success('CC email updated');
      setEditingId(null);
      const res = await ccEmailService.getByHospital(mailTarget.id);
      setCcEmails(Array.isArray(res.data) ? res.data : []);
    } catch {
      // handled
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteCcEmail = async (id) => {
    try {
      await ccEmailService.delete(id);
      toast.success('CC email removed');
      setCcEmails((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // handled
    }
  };

  const getProviderName = (providerId) => {
    const p = providers.find((pr) => pr.id === providerId);
    return p ? p.name : providerId || '—';
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
                <th>Address</th>
                <th>Rohini ID</th>
                <th>Email</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {hospitals.map((h, i) => (
                <tr key={h.id || i}>
                  <td>{i + 1}</td>
                  <td>{h.name}</td>
                  <td>{h.address || '—'}</td>
                  <td>{h.rohini_id || '—'}</td>
                  <td>{h.email || '—'}</td>
                  <td>{h.created_at ? new Date(h.created_at).toLocaleDateString() : '—'}</td>
                  <td>
                    <button className="btn btn--ghost btn--sm" onClick={() => openManageMail(h)}>
                      <IconMail size={14} /> Manage Mail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Hospital Modal */}
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
            <div className="form-group">
              <label>Address</label>
              <input
                type="text"
                placeholder="Enter address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Rohini ID</label>
              <input
                type="text"
                placeholder="e.g. ROH-520051"
                value={rohiniId}
                onChange={(e) => setRohiniId(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                placeholder="hospital@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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

      {/* Manage Mail Modal */}
      {mailTarget && (
        <Modal title={`Manage CC Emails — ${mailTarget.name}`} onClose={closeManageMail} size="lg">
          {loadingCc || loadingProviders ? (
            <div className="page-loading"><Spinner /></div>
          ) : (
            <>
              {/* Existing CC Emails */}
              {ccEmails.length === 0 ? (
                <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: 16 }}>No CC emails configured yet.</p>
              ) : (
                <table className="data-table" style={{ marginBottom: 20 }}>
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Policy Provider</th>
                      <th style={{ width: 120 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ccEmails.map((cc) => (
                      <tr key={cc.id}>
                        <td>
                          {editingId === cc.id ? (
                            <input
                              type="email"
                              value={editEmail}
                              onChange={(e) => setEditEmail(e.target.value)}
                              style={{ width: '100%' }}
                              autoFocus
                            />
                          ) : (
                            cc.email
                          )}
                        </td>
                        <td>{getProviderName(cc.policy_provider_id)}</td>
                        <td>
                          {editingId === cc.id ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                type="button"
                                className="btn btn--primary btn--sm"
                                disabled={savingEdit}
                                onClick={() => handleUpdateCcEmail(cc.id)}
                              >
                                {savingEdit ? <Spinner size={12} /> : 'Save'}
                              </button>
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                onClick={() => setEditingId(null)}
                              >
                                <IconX size={12} />
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                onClick={() => { setEditingId(cc.id); setEditEmail(cc.email); }}
                              >
                                <IconEdit size={12} />
                              </button>
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                style={{ color: '#ef4444' }}
                                onClick={() => handleDeleteCcEmail(cc.id)}
                              >
                                <IconTrash size={12} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Add New CC Email */}
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: 12 }}>Add CC Email</h4>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Email</label>
                    <input
                      type="email"
                      placeholder="cc@example.com"
                      value={newCcEmail}
                      onChange={(e) => setNewCcEmail(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Policy Provider</label>
                    {providers.length === 0 ? (
                      <div style={{ fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic' }}>No providers</div>
                    ) : (
                      <select value={newCcProviderId} onChange={(e) => setNewCcProviderId(e.target.value)}>
                        {providers.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={addingCc || !newCcProviderId}
                    onClick={handleAddCcEmail}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {addingCc ? <Spinner size={16} /> : 'Add'}
                  </button>
                </div>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
