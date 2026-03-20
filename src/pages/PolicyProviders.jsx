import { useState, useEffect } from 'react';
import { useToast } from '../components/Toast';
import { policyProviderService } from '../services/api';
import { IconPlus, IconEdit, IconTrash, IconArrowLeft, IconShield } from '../components/icons/Icons';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import ProviderConfigForm from './ProviderConfigForm';
import './PolicyProviders.scss';

// Backend returns { id, name, config: { auth, steps, required_fields } }
// Flatten config to top level for easy access
function normalize(p) {
  if (!p) return p;
  const cfg = p.config || {};
  return {
    ...p,
    auth: p.auth ?? cfg.auth ?? null,
    steps: p.steps ?? cfg.steps ?? [],
    required_fields: p.required_fields ?? cfg.required_fields ?? [],
  };
}

export default function PolicyProviders() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeProvider, setActiveProvider] = useState(null); // null = list view
  const [deleteTarget, setDeleteTarget] = useState(null);

  const toast = useToast();

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    setLoading(true);
    try {
      const res = await policyProviderService.getAll();
      const list = Array.isArray(res.data) ? res.data : [];
      setProviders(list.map(normalize));
    } catch {
      setProviders([]);
    } finally {
      setLoading(false);
    }
  };

  // Open config form for create
  const openCreate = () => {
    setActiveProvider({ _isNew: true });
  };

  // Open config form for edit
  const openEdit = async (provider) => {
    try {
      const res = await policyProviderService.getById(provider.id);
      setActiveProvider(normalize(res.data));
    } catch {
      setActiveProvider(provider);
    }
  };

  const handleBack = () => {
    setActiveProvider(null);
    fetchProviders();
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await policyProviderService.delete(deleteTarget.id);
      toast.success('Provider deleted');
      setDeleteTarget(null);
      fetchProviders();
    } catch {
      // handled
    }
  };

  // ─── Detail View (Create / Edit) ───────────────────────
  if (activeProvider) {
    return (
      <div className="pp-page">
        <button className="pp-back" onClick={handleBack}>
          <IconArrowLeft size={16} /> Back to Providers
        </button>
        <div className="page-header">
          <h1>{activeProvider._isNew ? 'New Provider' : `Edit: ${activeProvider.name}`}</h1>
          <p>{activeProvider._isNew ? 'Configure a new policy provider' : 'Update provider configuration'}</p>
        </div>
        <ProviderConfigForm
          provider={activeProvider._isNew ? null : activeProvider}
          onSaved={handleBack}
        />
      </div>
    );
  }

  // ─── List View ─────────────────────────────────────────
  return (
    <div className="pp-page">
      <div className="page-header">
        <h1>Policy Providers</h1>
        <p>Manage insurance / policy API providers and their configurations</p>
      </div>

      <div className="pp-toolbar">
        <button className="btn btn--primary" onClick={openCreate}>
          <IconPlus size={16} /> New Provider
        </button>
      </div>

      {loading ? (
        <div className="page-loading"><Spinner /></div>
      ) : providers.length === 0 ? (
        <div className="pp-empty">
          <EmptyState message="No policy providers configured yet" />
        </div>
      ) : (
        <div className="pp-grid">
          {providers.map((p) => (
            <div className="pp-card" key={p.id}>
              <div className="pp-card__header">
                <div className="pp-card__icon">
                  <IconShield size={20} />
                </div>
                <div className="pp-card__title">
                  <h3>{p.name}</h3>
                  {p.provider_id && <span className="pp-card__provider-id">{p.provider_id}</span>}
                </div>
              </div>

              <div className="pp-card__meta">
                <div className="pp-card__stat">
                  <span className="pp-card__stat-val">{p.steps?.length || 0}</span>
                  <span className="pp-card__stat-label">Steps</span>
                </div>
                <div className="pp-card__stat">
                  <span className="pp-card__stat-val">{p.required_fields?.length || 0}</span>
                  <span className="pp-card__stat-label">Fields</span>
                </div>
                <div className={`pp-card__auth-badge ${p.auth ? 'pp-card__auth-badge--active' : ''}`}>
                  {p.auth ? 'Auth' : 'No Auth'}
                </div>
              </div>

              <div className="pp-card__actions">
                <button className="btn btn--ghost btn--sm" onClick={() => openEdit(p)}>
                  <IconEdit size={14} /> Edit
                </button>
                <button className="btn btn--ghost btn--sm pp-card__delete-btn" onClick={() => setDeleteTarget(p)}>
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <Modal title="Delete Provider" onClose={() => setDeleteTarget(null)}>
          <div className="delete-confirm">
            <p>
              Delete <strong>{deleteTarget.name}</strong>? This cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="btn btn--ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn--danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
