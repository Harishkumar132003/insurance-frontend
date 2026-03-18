import CollapsibleCard from './CollapsibleCard';
import KeyValueInput from './KeyValueInput';
import './ConfigComponents.scss';

const AUTH_TYPES = ['token', 'api_key', 'basic'];
const METHODS = ['GET', 'POST'];

// Convert object to [{key, value}] array
export function objToKV(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj).map(([key, value]) => ({ key, value: String(value) }));
}

// Convert [{key, value}] array to object (keeps only non-empty keys)
export function kvToObj(arr) {
  const obj = {};
  if (!Array.isArray(arr)) return obj;
  arr.forEach(({ key, value }) => {
    if (key.trim()) obj[key.trim()] = value;
  });
  return obj;
}

export default function AuthSection({ auth, onChange }) {
  const update = (field, value) => {
    onChange({ ...auth, [field]: value });
  };

  const handleTypeChange = (type) => {
    onChange({
      type,
      url: auth?.url || '',
      method: auth?.method || 'POST',
      headers: auth?.headers || [],
      body: auth?.body || [],
      response_mapping: auth?.response_mapping || [],
    });
  };

  const handleClear = () => {
    onChange(null);
  };

  const isEnabled = auth !== null && auth !== undefined;

  return (
    <CollapsibleCard
      title="Authentication"
      actions={
        <button
          type="button"
          className={`toggle-btn ${isEnabled ? 'toggle-btn--on' : ''}`}
          onClick={isEnabled ? handleClear : () => handleTypeChange('token')}
        >
          {isEnabled ? 'Enabled' : 'Disabled'}
        </button>
      }
    >
      {!isEnabled ? (
        <p className="section-hint">Authentication is disabled. Click "Disabled" to enable.</p>
      ) : (
        <div className="auth-section">
          <div className="form-row">
            <div className="form-group">
              <label>Auth Type</label>
              <select value={auth.type || ''} onChange={(e) => handleTypeChange(e.target.value)}>
                {AUTH_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Method</label>
              <select value={auth.method || 'POST'} onChange={(e) => update('method', e.target.value)}>
                {METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>URL</label>
            <input
              type="text"
              placeholder="https://api.example.com/auth/token"
              value={auth.url || ''}
              onChange={(e) => update('url', e.target.value)}
            />
          </div>

          <KeyValueInput
            label="Headers"
            items={auth.headers || []}
            onChange={(items) => update('headers', items)}
            keyPlaceholder="Header name"
            valuePlaceholder="Header value"
          />

          <KeyValueInput
            label="Body"
            items={auth.body || []}
            onChange={(items) => update('body', items)}
            keyPlaceholder="Field name"
            valuePlaceholder="Field value"
          />

          <KeyValueInput
            label="Response Mapping"
            items={auth.response_mapping || []}
            onChange={(items) => update('response_mapping', items)}
            keyPlaceholder="e.g. access_token"
            valuePlaceholder="e.g. data.token"
          />
        </div>
      )}
    </CollapsibleCard>
  );
}
