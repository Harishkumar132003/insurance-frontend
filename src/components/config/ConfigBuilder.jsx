import { useState, useCallback, useRef } from 'react';
import AuthSection from './AuthSection';
import StepCard from './StepCard';
import TagInput from './TagInput';
import JSONPreview from './JSONPreview';
import { IconPlus } from '../icons/Icons';
import { objToKV, kvToObj } from './AuthSection';
import { useToast } from '../Toast';
import './ConfigComponents.scss';

const EMPTY_STEP = {
  step: '',
  url: '',
  method: 'GET',
  headers: [],
  body_template: [],
  response_mapping: [],
};

// Convert form state (KV arrays) → JSON output (objects)
function buildJSON(auth, steps, requiredFields) {
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

// Convert loaded JSON config (objects) → form state (KV arrays)
export function parseConfigToForm(config) {
  if (!config) {
    return { auth: null, steps: [{ ...EMPTY_STEP }], requiredFields: [] };
  }

  const parsedAuth = config.auth
    ? {
        type: config.auth.type || 'token',
        url: config.auth.url || '',
        method: config.auth.method || 'POST',
        headers: objToKV(config.auth.headers),
        body: objToKV(config.auth.body),
        response_mapping: objToKV(config.auth.response_mapping),
      }
    : null;

  const parsedSteps =
    Array.isArray(config.steps) && config.steps.length > 0
      ? config.steps.map((s) => ({
          step: s.step || '',
          url: s.url || '',
          method: s.method || 'GET',
          headers: objToKV(s.headers),
          body_template: objToKV(s.body_template),
          response_mapping: objToKV(s.response_mapping),
        }))
      : [{ ...EMPTY_STEP }];

  return {
    auth: parsedAuth,
    steps: parsedSteps,
    requiredFields: Array.isArray(config.required_fields) ? config.required_fields : [],
  };
}

export default function ConfigBuilder({ initialConfig, onSave, saving }) {
  const parsed = parseConfigToForm(initialConfig);
  const [auth, setAuth] = useState(parsed.auth);
  const [steps, setSteps] = useState(parsed.steps);
  const [requiredFields, setRequiredFields] = useState(parsed.requiredFields);
  const toast = useToast();

  // Drag state
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const canDrag = useRef(false);

  const addStep = () => {
    setSteps([...steps, { ...EMPTY_STEP }]);
  };

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

  // Drag reorder
  const handleDragStart = (index) => {
    dragItem.current = index;
  };

  const handleDragEnter = (index) => {
    dragOverItem.current = index;
  };

  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const reordered = [...steps];
    const [removed] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOverItem.current, 0, removed);
    setSteps(reordered);
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const jsonOutput = buildJSON(auth, steps, requiredFields);

  const validate = () => {
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i].step?.trim()) {
        toast.error(`Step ${i + 1}: Name is required`);
        return false;
      }
      if (!steps[i].url?.trim()) {
        toast.error(`Step ${i + 1}: URL is required`);
        return false;
      }
      if (!steps[i].method) {
        toast.error(`Step ${i + 1}: Method is required`);
        return false;
      }
    }
    if (auth) {
      if (!auth.url?.trim()) {
        toast.error('Auth: URL is required');
        return false;
      }
    }
    return true;
  };

  const handleSave = () => {
    if (!validate()) return;
    // Build fresh to avoid stale closure
    onSave(buildJSON(auth, steps, requiredFields));
  };

  const handleReset = useCallback(() => {
    const p = parseConfigToForm(initialConfig);
    setAuth(p.auth);
    setSteps(p.steps);
    setRequiredFields(p.requiredFields);
  }, [initialConfig]);

  return (
    <div className="config-builder">
      <div className="config-builder__form">
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
                >
                  ⠿
                </div>
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
            label="Prompt Required Fields"
            tags={requiredFields}
            onChange={setRequiredFields}
            placeholder="e.g. patient_id, name, diagnosis"
          />
        </div>

        {/* Actions */}
        <div className="config-builder__actions">
          <button type="button" className="btn btn--ghost" onClick={handleReset}>
            Reset
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Configuration'}
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
