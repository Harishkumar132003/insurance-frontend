import { useState, useCallback, useRef } from 'react';
import AuthSection from '../components/config/AuthSection';
import StepCard from '../components/config/StepCard';
import TagInput from '../components/config/TagInput';
import JSONPreview from '../components/config/JSONPreview';
import { IconPlus } from '../components/icons/Icons';
import { objToKV, kvToObj } from '../components/config/AuthSection';
import { useToast } from '../components/Toast';
import { policyProviderService } from '../services/api';
import Spinner from '../components/Spinner';
import '../components/config/ConfigComponents.scss';

const EMPTY_STEP = {
  step: '',
  url: '',
  method: 'GET',
  headers: [],
  body_template: [],
  response_mapping: [],
};

// Backend returns { id, name, config: { auth, steps, required_fields } }
// Normalize so auth/steps/required_fields are at the top level
function normalize(provider) {
  if (!provider) return null;
  const cfg = provider.config || {};
  return {
    ...provider,
    auth: provider.auth ?? cfg.auth ?? null,
    steps: provider.steps ?? cfg.steps ?? [],
    required_fields: provider.required_fields ?? cfg.required_fields ?? [],
  };
}

function parseProvider(rawProvider) {
  const provider = normalize(rawProvider);
  if (!provider) {
    return {
      provider_id: '',
      name: '',
      auth: null,
      steps: [],
      requiredFields: [],
    };
  }

  const parsedAuth = provider.auth
    ? {
        type: provider.auth.type || 'token',
        url: provider.auth.url || '',
        method: provider.auth.method || 'POST',
        headers: objToKV(provider.auth.headers),
        body: objToKV(provider.auth.body),
        response_mapping: objToKV(provider.auth.response_mapping),
      }
    : null;

  const parsedSteps = Array.isArray(provider.steps)
    ? provider.steps.map((s) => ({
        step: s.step || '',
        url: s.url || '',
        method: s.method || 'GET',
        headers: objToKV(s.headers),
        body_template: objToKV(s.body_template),
        response_mapping: objToKV(s.response_mapping),
      }))
    : [];

  return {
    provider_id: provider.provider_id || '',
    name: provider.name || '',
    email: provider.email || '',
    tpa_name: provider.tpa_name || '',
    tpa_toll_free_phone: provider.tpa_toll_free_phone || '',
    tpa_toll_free_fax: provider.tpa_toll_free_fax || '',
    auth: parsedAuth,
    steps: parsedSteps,
    requiredFields: Array.isArray(provider.required_fields) ? provider.required_fields : [],
  };
}

function buildPayload(providerId, name, email, tpaName, tpaPhone, tpaFax, auth, steps, requiredFields) {
  const builtAuth = auth
    ? {
        type: auth.type,
        url: auth.url,
        method: auth.method,
        headers: kvToObj(auth.headers || []),
        body: kvToObj(auth.body || []),
        response_mapping: kvToObj(auth.response_mapping || []),
      }
    : null;

  return {
    provider_id: providerId,
    name,
    email,
    tpa_name: tpaName,
    tpa_toll_free_phone: tpaPhone,
    tpa_toll_free_fax: tpaFax,
    auth: builtAuth,
    steps: steps.map((s) => ({
      step: s.step,
      url: s.url,
      method: s.method,
      headers: kvToObj(s.headers || []),
      body_template: kvToObj(s.body_template || []),
      response_mapping: kvToObj(s.response_mapping || []),
    })),
    required_fields: requiredFields || [],
  };
}

export default function ProviderConfigForm({ provider, onSaved }) {
  const parsed = parseProvider(provider);
  const [providerId, setProviderId] = useState(parsed.provider_id);
  const [name, setName] = useState(parsed.name);
  const [email, setEmail] = useState(parsed.email);
  const [tpaName, setTpaName] = useState(parsed.tpa_name);
  const [tpaPhone, setTpaPhone] = useState(parsed.tpa_toll_free_phone);
  const [tpaFax, setTpaFax] = useState(parsed.tpa_toll_free_fax);
  const [auth, setAuth] = useState(parsed.auth);
  const [steps, setSteps] = useState(parsed.steps);
  const [requiredFields, setRequiredFields] = useState(parsed.requiredFields);
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const isEdit = !!provider;

  // Drag state
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const canDrag = useRef(false);

  const addStep = () => setSteps([...steps, { ...EMPTY_STEP }]);

  const removeStep = (index) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const updateStep = (index, updated) => {
    setSteps(steps.map((s, i) => (i === index ? updated : s)));
  };

  const handleDragStart = (index) => { dragItem.current = index; };
  const handleDragEnter = (index) => { dragOverItem.current = index; };
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const reordered = [...steps];
    const [removed] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOverItem.current, 0, removed);
    setSteps(reordered);
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const jsonOutput = buildPayload(providerId, name, email, tpaName, tpaPhone, tpaFax, auth, steps, requiredFields);

  const validate = () => {
    if (!providerId.trim()) {
      toast.error('Provider ID is required');
      return false;
    }
    if (!name.trim()) {
      toast.error('Provider name is required');
      return false;
    }
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i].step?.trim()) { toast.error(`Step ${i + 1}: Name is required`); return false; }
      if (!steps[i].url?.trim()) { toast.error(`Step ${i + 1}: URL is required`); return false; }
    }
    if (auth && !auth.url?.trim()) {
      toast.error('Auth: URL is required');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    const payload = buildPayload(providerId, name, email, tpaName, tpaPhone, tpaFax, auth, steps, requiredFields);
    setSaving(true);
    try {
      if (isEdit) {
        await policyProviderService.update(provider.id, payload);
        toast.success('Provider updated');
      } else {
        await policyProviderService.create(payload);
        toast.success('Provider created');
      }
      onSaved();
    } catch {
      // handled
    } finally {
      setSaving(false);
    }
  };

  const handleReset = useCallback(() => {
    const p = parseProvider(provider);
    setProviderId(p.provider_id);
    setName(p.name);
    setEmail(p.email);
    setTpaName(p.tpa_name);
    setTpaPhone(p.tpa_toll_free_phone);
    setTpaFax(p.tpa_toll_free_fax);
    setAuth(p.auth);
    setSteps(p.steps);
    setRequiredFields(p.requiredFields);
  }, [provider]);

  return (
    <div className={`config-builder ${showJsonPreview ? '' : 'config-builder--no-preview'}`}>
      <div className="config-builder__form">
        <div className="config-builder__preview-toggle">
          <label className="config-preview-switch">
            <input
              type="checkbox"
              checked={showJsonPreview}
              onChange={(e) => setShowJsonPreview(e.target.checked)}
            />
            <span>Show JSON Preview</span>
          </label>
        </div>

        {/* Provider ID & Name */}
        <div className="pp-name-card">
          <div className="form-row">
            <div className="form-group">
              <label>Provider ID</label>
              <input
                type="text"
                placeholder="e.g. STAR_HEALTH_001"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                autoFocus={!isEdit}
              />
            </div>
            <div className="form-group">
              <label>Provider Name</label>
              <input
                type="text"
                placeholder="e.g. Star Health"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                placeholder="e.g. admin@starhealth.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>TPA Name</label>
              <input
                type="text"
                placeholder="e.g. Medi Assist"
                value={tpaName}
                onChange={(e) => setTpaName(e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>TPA Toll Free Phone</label>
              <input
                type="text"
                placeholder="e.g. 1-800-0042182"
                value={tpaPhone}
                onChange={(e) => setTpaPhone(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>TPA Toll Free Fax</label>
              <input
                type="text"
                placeholder="e.g. 1-800-7506452"
                value={tpaFax}
                onChange={(e) => setTpaFax(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="config-builder__section">
          <div className="config-builder__section-header">
            <h2>API Steps <span className="config-builder__optional">(Optional)</span></h2>
            <button type="button" className="btn btn--primary btn--sm" onClick={addStep}>
              <IconPlus size={14} /> Add Step
            </button>
          </div>
          {steps.length === 0 ? (
            <p className="section-hint">No API steps configured. Add a step to define provider API calls, or leave empty.</p>
          ) : (
            <div className="config-builder__steps">
              {steps.map((step, i) => (
                <div
                  key={i}
                  draggable={canDrag.current}
                  onDragStart={(e) => {
                    if (!canDrag.current) { e.preventDefault(); return; }
                    handleDragStart(i);
                  }}
                  onDragEnter={() => handleDragEnter(i)}
                  onDragEnd={() => { handleDragEnd(); canDrag.current = false; }}
                  onDragOver={(e) => e.preventDefault()}
                  className="config-builder__step-wrapper"
                >
                  <div
                    className="config-builder__drag-handle"
                    title="Drag to reorder"
                    onMouseDown={() => { canDrag.current = true; }}
                    onMouseUp={() => { canDrag.current = false; }}
                  >⠿</div>
                  <div className="config-builder__step-content">
                    <StepCard
                      step={step}
                      index={i}
                      onChange={(updated) => updateStep(i, updated)}
                      onRemove={() => removeStep(i)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Required Fields */}
        <div className="config-builder__section">
          <TagInput
            label="Required Fields"
            tags={requiredFields}
            onChange={setRequiredFields}
            placeholder="e.g. policy_id, member_id"
          />
        </div>

        {/* Actions */}
        <div className="config-builder__actions">
          <button type="button" className="btn btn--ghost" onClick={handleReset}>Reset</button>
          <button type="button" className="btn btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size={18} /> : isEdit ? 'Update Provider' : 'Create Provider'}
          </button>
        </div>
      </div>

      {/* JSON Preview */}
      {showJsonPreview && (
        <div className="config-builder__preview">
          <JSONPreview data={jsonOutput} />
        </div>
      )}
    </div>
  );
}
