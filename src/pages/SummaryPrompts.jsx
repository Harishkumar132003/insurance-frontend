import { useState, useEffect } from 'react';
import { useToast } from '../components/Toast';
import { summaryPromptService } from '../services/api';
import { IconEdit, IconRefresh } from '../components/icons/Icons';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import './Prompts.scss';

export default function SummaryPrompts() {
  const toast = useToast();
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [formPromptText, setFormPromptText] = useState('');
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPrompts();
  }, []);

  const loadPrompts = async () => {
    setLoading(true);
    try {
      const res = await summaryPromptService.getAll();
      setPrompts(Array.isArray(res.data) ? res.data : []);
    } catch {
      setPrompts([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (key) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  };

  const openEdit = async (prompt) => {
    setEditingPrompt(prompt);
    setFormPromptText(prompt.prompt_text || '');
    setShowModal(true);
    setLoadingPrompt(true);
    try {
      const res = await summaryPromptService.getByKey(prompt.key);
      const fresh = res.data || {};
      setEditingPrompt((prev) => ({ ...prev, ...fresh }));
      setFormPromptText(fresh.prompt_text || '');
    } catch {
      // handled by interceptor
    } finally {
      setLoadingPrompt(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingPrompt(null);
    setFormPromptText('');
    setLoadingPrompt(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!editingPrompt?.key) {
      toast.error('Prompt key is missing');
      return;
    }
    if (!formPromptText.trim()) {
      toast.error('Prompt text is required');
      return;
    }

    setSaving(true);
    try {
      await summaryPromptService.updateByKey(editingPrompt.key, {
        prompt_text: formPromptText,
      });
      toast.success('Summary prompt updated');
      closeModal();
      loadPrompts();
    } catch {
      // handled by interceptor
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="prompts-page">
      <div className="page-header">
        <h1>Summary Prompts</h1>
        <p>Manage global summary prompt templates</p>
      </div>

      <div className="prompts-toolbar">
        <div className="prompts-toolbar__left" />
        <button className="btn btn--ghost" onClick={loadPrompts} disabled={loading}>
          <IconRefresh size={16} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="page-loading"><Spinner /></div>
      ) : prompts.length === 0 ? (
        <div className="prompts-empty">
          <EmptyState message="No summary prompts found" />
        </div>
      ) : (
        <div className="prompts-list">
          {prompts.map((p) => (
            <div
              key={p.id || p.key}
              className={`prompt-card ${expandedKey === p.key ? 'prompt-card--expanded' : ''}`}
            >
              <div className="prompt-card__header" onClick={() => toggleExpand(p.key)}>
                <div className="prompt-card__info">
                  <span className="prompt-card__name">{p.key}</span>
                  <span className="prompt-card__preview">
                    {p.prompt_text?.length > 100 ? `${p.prompt_text.slice(0, 100)}...` : p.prompt_text}
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
                </div>
              </div>

              {expandedKey === p.key && (
                <div className="prompt-card__body">
                  <div className="prompt-card__text">{p.prompt_text}</div>
                  <div className="prompt-card__meta">
                    {p.created_at ? `Created ${new Date(p.created_at).toLocaleString()}` : 'Created -'}
                    {p.updated_at ? ` · Updated ${new Date(p.updated_at).toLocaleString()}` : ''}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title="Update Summary Prompt" onClose={closeModal} size="lg">
          {loadingPrompt ? (
            <div className="page-loading"><Spinner /></div>
          ) : (
            <form onSubmit={handleSave} className="prompt-form">
              <div className="form-group">
                <label>Key</label>
                <div className="prompt-form__preview-text">{editingPrompt?.key || ''}</div>
                <span className="form-hint">Key cannot be edited</span>
              </div>

              <div className="form-group">
                <label>Prompt Text</label>
                <textarea
                  value={formPromptText}
                  onChange={(e) => setFormPromptText(e.target.value)}
                  rows={10}
                  autoFocus
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn--ghost" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" disabled={saving}>
                  {saving ? <Spinner size={18} /> : 'Update'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
