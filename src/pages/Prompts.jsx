import { useState, useEffect } from 'react';
import { useToast } from '../components/Toast';
import { promptService, hospitalService } from '../services/api';
import { IconPlus, IconEdit, IconTrash } from '../components/icons/Icons';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import './Prompts.scss';

const EMPTY_FORM = { name: '', prompt_text: '' };

export default function Prompts() {
  const [hospitals, setHospitals] = useState([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState('');
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(null); // null = create, object = edit
  const [form, setForm] = useState({ ...EMPTY_FORM });

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Expanded prompt for preview
  const [expandedId, setExpandedId] = useState(null);

  const toast = useToast();

  useEffect(() => {
    loadHospitals();
  }, []);

  const loadHospitals = async () => {
    try {
      const res = await hospitalService.getAll();
      const list = Array.isArray(res.data) ? res.data : [];
      setHospitals(list);
      if (list.length > 0) {
        setSelectedHospitalId(list[0].id);
        await loadPrompts(list[0].id);
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  };

  const loadPrompts = async (hospitalId) => {
    if (!hospitalId) return;
    setLoading(true);
    try {
      const res = await promptService.getAll(hospitalId);
      setPrompts(Array.isArray(res.data) ? res.data : []);
    } catch {
      setPrompts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleHospitalChange = (e) => {
    const id = e.target.value;
    setSelectedHospitalId(id);
    setExpandedId(null);
    loadPrompts(id);
  };

  // Open create modal
  const openCreate = () => {
    setEditingPrompt(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  };

  // Open edit modal
  const openEdit = (prompt) => {
    setEditingPrompt(prompt);
    setForm({ name: prompt.name, prompt_text: prompt.prompt_text });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingPrompt(null);
    setForm({ ...EMPTY_FORM });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Prompt name is required');
      return;
    }
    if (!form.prompt_text.trim()) {
      toast.error('Prompt text is required');
      return;
    }

    setSaving(true);
    try {
      if (editingPrompt) {
        await promptService.update(selectedHospitalId, editingPrompt.id, form);
        toast.success('Prompt updated');
      } else {
        await promptService.create(selectedHospitalId, form);
        toast.success('Prompt created');
      }
      closeModal();
      loadPrompts(selectedHospitalId);
    } catch {
      // handled
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await promptService.delete(selectedHospitalId, deleteTarget.id);
      toast.success('Prompt deleted');
      setDeleteTarget(null);
      if (expandedId === deleteTarget.id) setExpandedId(null);
      loadPrompts(selectedHospitalId);
    } catch {
      // handled
    }
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Highlight {{variables}} in prompt text
  const renderPromptText = (text) => {
    if (!text) return null;
    const parts = text.split(/(\{\{[^}]+\}\})/g);
    return parts.map((part, i) =>
      part.startsWith('{{') ? (
        <span key={i} className="prompt-var">{part}</span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  return (
    <div className="prompts-page">
      <div className="page-header">
        <h1>Prompts</h1>
        <p>Configure prompt templates per hospital</p>
      </div>

      {/* Toolbar */}
      <div className="prompts-toolbar">
        <div className="prompts-toolbar__left">
          <div className="form-group">
            <label>Hospital</label>
            <select value={selectedHospitalId} onChange={handleHospitalChange}>
              {hospitals.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
        </div>
        <button className="btn btn--primary" onClick={openCreate} disabled={!selectedHospitalId}>
          <IconPlus size={16} /> New Prompt
        </button>
      </div>

      {/* Prompt List */}
      {loading ? (
        <div className="page-loading"><Spinner /></div>
      ) : prompts.length === 0 ? (
        <div className="prompts-empty">
          <EmptyState message="No prompts configured for this hospital" />
        </div>
      ) : (
        <div className="prompts-list">
          {prompts.map((p) => (
            <div
              key={p.id}
              className={`prompt-card ${expandedId === p.id ? 'prompt-card--expanded' : ''}`}
            >
              <div className="prompt-card__header" onClick={() => toggleExpand(p.id)}>
                <div className="prompt-card__info">
                  <span className="prompt-card__name">{p.name}</span>
                  <span className="prompt-card__preview">
                    {p.prompt_text?.length > 80
                      ? p.prompt_text.slice(0, 80) + '...'
                      : p.prompt_text}
                  </span>
                </div>
                <div className="prompt-card__actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="prompt-card__btn prompt-card__btn--edit"
                    title="Edit"
                    onClick={() => openEdit(p)}
                  >
                    <IconEdit size={15} />
                  </button>
                  <button
                    className="prompt-card__btn prompt-card__btn--delete"
                    title="Delete"
                    onClick={() => setDeleteTarget(p)}
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              </div>

              {expandedId === p.id && (
                <div className="prompt-card__body">
                  <div className="prompt-card__text">
                    {renderPromptText(p.prompt_text)}
                  </div>
                  {p.created_at && (
                    <div className="prompt-card__meta">
                      Created {new Date(p.created_at).toLocaleDateString()}
                      {p.updated_at && ` · Updated ${new Date(p.updated_at).toLocaleDateString()}`}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <Modal
          title={editingPrompt ? 'Edit Prompt' : 'New Prompt'}
          onClose={closeModal}
        >
          <form onSubmit={handleSave} className="prompt-form">
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                placeholder="e.g. patient_greeting"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
              <span className="form-hint">A unique identifier for this prompt</span>
            </div>
            <div className="form-group">
              <label>Prompt Text</label>
              <textarea
                placeholder="Hello {{patient_name}}, welcome to our hospital."
                value={form.prompt_text}
                onChange={(e) => setForm({ ...form, prompt_text: e.target.value })}
                rows={8}
              />
              <span className="form-hint">
                Use {'{{variable_name}}'} for dynamic values
              </span>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn--ghost" onClick={closeModal}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? <Spinner size={18} /> : editingPrompt ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <Modal title="Delete Prompt" onClose={() => setDeleteTarget(null)}>
          <div className="delete-confirm">
            <p>
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>?
              This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="btn btn--ghost" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="btn btn--danger" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
