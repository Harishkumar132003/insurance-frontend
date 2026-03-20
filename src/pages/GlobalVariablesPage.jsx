import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { variablesService, hospitalService } from '../services/api';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { IconPlus, IconEdit, IconTrash, IconCheck, IconX, IconArrowLeft } from '../components/icons/Icons';
import './Pages.scss';
import './GlobalVariablesPage.scss';

export default function GlobalVariablesPage() {
  const { hospitalId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [hospitalName, setHospitalName] = useState('');
  const [variables, setVariables] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const editInputRef = useRef(null);

  useEffect(() => {
    loadData();
  }, [hospitalId]);

  useEffect(() => {
    if (editingKey && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingKey]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [varsRes, hospRes] = await Promise.all([
        variablesService.getAll(hospitalId).catch((err) => {
          if (err.response?.status === 404) return { data: {} };
          throw err;
        }),
        hospitalService.getAll(),
      ]);

      const data = varsRes.data?.global_variables ?? {};
      setVariables(typeof data === 'object' && !Array.isArray(data) ? data : {});

      const hospitals = Array.isArray(hospRes.data) ? hospRes.data : [];
      const match = hospitals.find((h) => h.id === hospitalId);
      setHospitalName(match?.name || hospitalId);
    } catch {
      setVariables({});
    } finally {
      setLoading(false);
    }
  };

  const sortedEntries = Object.entries(variables).sort(([a], [b]) => a.localeCompare(b));

  // --- Add ---
  const handleAdd = async (e) => {
    e.preventDefault();
    const key = newKey.trim();
    const value = newValue.trim();

    if (!key) {
      toast.error('Variable key is required');
      return;
    }
    if (key in variables) {
      toast.error(`Variable "${key}" already exists`);
      return;
    }

    setSaving(true);
    try {
      const updated = { ...variables, [key]: value };
      await variablesService.save(hospitalId, updated);
      setVariables(updated);
      toast.success(`Variable "${key}" added`);
      setShowAddModal(false);
      setNewKey('');
      setNewValue('');
    } catch {
      // handled by interceptor
    } finally {
      setSaving(false);
    }
  };

  // --- Edit ---
  const startEdit = (key) => {
    setEditingKey(key);
    const val = variables[key];
    setEditValue(typeof val === 'string' ? val : JSON.stringify(val) ?? '');
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditValue('');
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const updated = { ...variables, [editingKey]: editValue };
      await variablesService.save(hospitalId, updated);
      setVariables(updated);
      toast.success(`Variable "${editingKey}" updated`);
      setEditingKey(null);
      setEditValue('');
    } catch {
      // handled by interceptor
    } finally {
      setSaving(false);
    }
  };

  // --- Delete ---
  const handleDelete = async (key) => {
    if (!window.confirm(`Delete variable "${key}"?`)) return;

    setSaving(true);
    try {
      await variablesService.delete(hospitalId, key);
      const updated = { ...variables };
      delete updated[key];
      setVariables(updated);
      toast.success(`Variable "${key}" deleted`);
      if (editingKey === key) cancelEdit();
    } catch {
      // handled by interceptor
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="gv-page">
      <button className="gv-page__back" onClick={() => navigate('/configurations')}>
        <IconArrowLeft size={18} />
        <span>Back to Configurations</span>
      </button>

      <div className="page-header">
        <h1>Global Variables</h1>
        <p>{hospitalName}</p>
      </div>

      {loading ? (
        <div className="page-loading"><Spinner /></div>
      ) : (
        <>
          <div className="gv-page__toolbar">
            <div className="gv-page__count">
              {sortedEntries.length} variable{sortedEntries.length !== 1 ? 's' : ''}
            </div>
            <button className="btn btn--primary" onClick={() => setShowAddModal(true)}>
              <IconPlus size={18} /> Add Variable
            </button>
          </div>

          {sortedEntries.length === 0 ? (
            <div className="table-card">
              <EmptyState message="No global variables defined yet" />
            </div>
          ) : (
            <div className="table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '30%' }}>Key</th>
                    <th>Value</th>
                    <th style={{ width: 100 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEntries.map(([key, value]) => (
                    <tr key={key}>
                      <td className="gv-page__key-cell">{key}</td>
                      <td className="gv-page__value-cell">
                        {editingKey === key ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            className="gv-page__input"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit();
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            disabled={saving}
                          />
                        ) : (
                          <span className="gv-page__value-text">
                            {(typeof value === 'string' ? value : JSON.stringify(value)) || (
                              <span className="gv-page__empty">empty</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="gv-page__actions">
                          {editingKey === key ? (
                            <>
                              <button
                                className="gv-page__icon-btn gv-page__icon-btn--save"
                                onClick={saveEdit}
                                disabled={saving}
                                title="Save"
                              >
                                <IconCheck size={16} />
                              </button>
                              <button
                                className="gv-page__icon-btn"
                                onClick={cancelEdit}
                                disabled={saving}
                                title="Cancel"
                              >
                                <IconX size={16} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="gv-page__icon-btn"
                                onClick={() => startEdit(key)}
                                disabled={saving}
                                title="Edit value"
                              >
                                <IconEdit size={16} />
                              </button>
                              <button
                                className="gv-page__icon-btn gv-page__icon-btn--danger"
                                onClick={() => handleDelete(key)}
                                disabled={saving}
                                title="Delete variable"
                              >
                                <IconTrash size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showAddModal && (
        <Modal title="Add Variable" onClose={() => setShowAddModal(false)}>
          <form onSubmit={handleAdd} className="modal-form">
            <div className="form-group">
              <label>Key</label>
              <input
                type="text"
                placeholder="e.g. clientid"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Value</label>
              <input
                type="text"
                placeholder="e.g. abc123"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? <Spinner size={18} /> : 'Add Variable'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
