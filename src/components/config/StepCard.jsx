import CollapsibleCard from './CollapsibleCard';
import KeyValueInput from './KeyValueInput';
import { IconX } from '../icons/Icons';
import './ConfigComponents.scss';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export default function StepCard({ step, index, onChange, onRemove }) {
  const update = (field, value) => {
    onChange({ ...step, [field]: value });
  };

  return (
    <div className="step-card">
      <CollapsibleCard
        title={`Step ${index + 1}${step.step ? `: ${step.step}` : ''}`}
        defaultOpen={true}
        actions={
          <button type="button" className="step-card__delete" onClick={onRemove}>
            <IconX size={14} /> Remove
          </button>
        }
      >
        <div className="step-card__body">
          <div className="form-group">
            <label>Step Name</label>
            <input
              type="text"
              placeholder="e.g. fetch_patient_data"
              value={step.step || ''}
              onChange={(e) => update('step', e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Method</label>
              <select value={step.method || 'GET'} onChange={(e) => update('method', e.target.value)}>
                {METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="form-group form-group--grow">
              <label>URL</label>
              <input
                type="text"
                placeholder="https://api.example.com/patients/{{patient_id}}"
                value={step.url || ''}
                onChange={(e) => update('url', e.target.value)}
              />
            </div>
          </div>

          <KeyValueInput
            label="Headers"
            items={step.headers || []}
            onChange={(items) => update('headers', items)}
            keyPlaceholder="Header name"
            valuePlaceholder="Header value"
          />

          <div className="form-group">
            <label>Body Template</label>
            <textarea
              className="step-card__body-textarea"
              placeholder='{"clientid": "{{clientid}}"}'
              value={step.body_template || ''}
              onChange={(e) => update('body_template', e.target.value)}
              rows={4}
              spellCheck={false}
            />
          </div>

          <KeyValueInput
            label="Response Mapping"
            items={step.response_mapping || []}
            onChange={(items) => update('response_mapping', items)}
            keyPlaceholder="Variable name"
            valuePlaceholder="e.g. data.result.id"
          />
        </div>
      </CollapsibleCard>
    </div>
  );
}
