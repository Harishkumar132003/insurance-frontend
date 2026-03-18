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
      name: '',
      auth: null,
      steps: [{ ...EMPTY_STEP }],
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

  const parsedSteps =
    Array.isArray(provider.steps) && provider.steps.length > 0
      ? provider.steps.map((s) => ({
          step: s.step || '',
          url: s.url || '',
          method: s.method || 'GET',
          headers: objToKV(s.headers),
          body_template: objToKV(s.body_template),
          response_mapping: objToKV(s.response_mapping),
        }))
      : [{ ...EMPTY_STEP }];

  return {
    name: provider.name || '',
    auth: parsedAuth,
    steps: parsedSteps,
    requiredFields: Array.isArray(provider.required_fields) ? provider.required_fields : [],
  };
}

function buildPayload(name, auth, steps, requiredFields) {
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
    name,
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
  const [name, setName] = useState(parsed.name);
  const [auth, setAuth] = useState(parsed.auth);
  const [steps, setSteps] = useState(parsed.steps);
  const [requiredFields, setRequiredFields] = useState(parsed.requiredFields);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const isEdit = !!provider;

  // Drag state
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const canDrag = useRef(false);

  const addStep = () => setSteps([...steps, { ...EMPTY_STEP }]);

  const removeStep = (index) => {
    if (steps.length === 1) {
      toast.error('At least one step is required');
      return;
    }
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

  const jsonOutput = buildPayload(name, auth, steps, requiredFields);

  const validate = () => {
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
    const payload = buildPayload(name, auth, steps, requiredFields);
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
    setName(p.name);
    setAuth(p.auth);
    setSteps(p.steps);
    setRequiredFields(p.requiredFields);
  }, [provider]);

  return (
    <div className="config-builder">
      <div className="config-builder__form">
        {/* Provider Name */}
        <div className="pp-name-card">
          <div className="form-group">
            <label>Provider Name</label>
            <input
              type="text"
              placeholder="e.g. Star Health"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus={!isEdit}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="config-builder__section">
          <div className="config-builder__section-header">
            <h2>API Steps</h2>
            <button type="button" className="btn btn--primary btn--sm" onClick={addStep}>
              <IconPlus size={14} /> Add Step
            </button>
          </div>
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
      <div className="config-builder__preview">
        <JSONPreview data={jsonOutput} />
      </div>
    </div>
  );
}
