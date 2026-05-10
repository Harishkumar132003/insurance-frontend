import { FORM_SECTIONS } from '../pages/PreAuthFormPage';

// Format a single field value for read-only display: booleans → Yes/No,
// select/radio with object options → option label, empty → em-dash.
export function formatReadValue(value, field) {
  if (value === null || value === undefined || value === '') return '—';
  if (field?.type === 'boolean') return value === true ? 'Yes' : value === false ? 'No' : String(value);
  if (field?.type === 'select' || field?.type === 'radio') {
    const match = (field.options || []).find((opt) => {
      if (opt !== null && typeof opt === 'object') return opt.value === value;
      return String(opt) === String(value);
    });
    if (match) return typeof match === 'object' ? match.label : String(match);
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

// Subgroup-level visibility (read-only mirror of PreAuthFormPage's
// shouldShowSubgroup): supports both same-section ('has_accident') and
// cross-section ({ section, key, equals }) showWhen specs.
function shouldShowSubgroup(sg, sectionData, dj) {
  if (!sg.showWhen) return true;
  if (typeof sg.showWhen === 'string') {
    return !!sectionData?.[sg.showWhen];
  }
  if (typeof sg.showWhen === 'object') {
    const { section, key, equals } = sg.showWhen;
    const v = (dj?.[section] || {})[key];
    return equals === undefined ? !!v : v === equals;
  }
  return true;
}

// Read-only renderer that mirrors the Pre-Auth form structure (sections,
// subgroups, fields) using FORM_SECTIONS as the schema. Pulls values from
// data_json so what the user sees here is exactly what was saved.
export default function ReadOnlyForm({ dataJson }) {
  const dj = dataJson || {};

  const renderFieldList = (fields, sectionData, subgroupKey) => {
    if (!fields || fields.length === 0) return null;
    const source = subgroupKey ? (sectionData?.[subgroupKey] || {}) : (sectionData || {});
    return fields.map((field) => (
      <div key={field.key} className="info-card__kv">
        <span className="info-card__kv-label">{field.label}</span>
        <span className="info-card__kv-value">{formatReadValue(source[field.key], field)}</span>
      </div>
    ));
  };

  return (
    <div className="portal-form__readonly">
      {FORM_SECTIONS.map((section) => {
        const sectionData = dj[section.name] || {};
        return (
          <div key={section.name} className="portal-form__readonly-section">
            <div className="portal-form__readonly-title">{section.label}</div>
            {section.fields && section.fields.length > 0 && (
              <div className="portal-form__readonly-grid">
                {renderFieldList(section.fields, sectionData)}
              </div>
            )}
            {(section.subgroups || [])
              .filter((sg) => shouldShowSubgroup(sg, sectionData, dj))
              .map((sg) => (
                <div key={sg.key} className="portal-form__readonly-subgroup">
                  <div className="portal-form__readonly-subtitle">{sg.label}</div>
                  <div className="portal-form__readonly-grid">
                    {renderFieldList(sg.fields, sectionData, sg.key)}
                  </div>
                </div>
              ))}
            {section.fieldsAfterSubgroups && section.fieldsAfterSubgroups.length > 0 && (
              <div className="portal-form__readonly-grid">
                {renderFieldList(section.fieldsAfterSubgroups, sectionData)}
              </div>
            )}
            {(section.additionalSubgroups || [])
              .filter((sg) => shouldShowSubgroup(sg, sectionData, dj))
              .map((sg) => (
                <div key={sg.key} className="portal-form__readonly-subgroup">
                  <div className="portal-form__readonly-subtitle">{sg.label}</div>
                  <div className="portal-form__readonly-grid">
                    {renderFieldList(sg.fields, sectionData, sg.key)}
                  </div>
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}
