import { FORM_SECTIONS } from '../pages/PreAuthFormPage';

// Format a single field value for read-only display: booleans → Yes/No,
// select/radio with object options → option label, empty → em-dash.
export function formatReadValue(value, field) {
  if (value === null || value === undefined || value === '') return '—';
  // Multi-value fields (e.g. Drug Route) arrive as an array of option values.
  // Resolve each to its label so the reader sees "IV — Intravenous, PO — Oral"
  // rather than the raw codes. Checked before the single-value branches because
  // an array would otherwise fall through to String() and join with commas and
  // no labels — and an empty array would render as a blank instead of an em-dash.
  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    return value.map((v) => formatReadValue(v, field)).join(', ');
  }
  if (field?.type === 'boolean') return value === true ? 'Yes' : value === false ? 'No' : String(value);
  if (field?.type === 'select' || field?.type === 'radio' || field?.type === 'multiselect') {
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

// Group-level visibility (read-only mirror of PreAuthFormPage's
// shouldShowSubgroup): supports same-section ('has_accident') and
// { section, subgroup, key, equals } showWhen specs, where section and subgroup
// are both optional — section defaults to the current one, and subgroup reaches
// into a nested group (e.g. treatment_plan.investigation).
function shouldShowSubgroup(sg, sectionData, dj) {
  if (!sg.showWhen) return true;
  if (typeof sg.showWhen === 'string') {
    return !!sectionData?.[sg.showWhen];
  }
  if (typeof sg.showWhen === 'object') {
    const { section, subgroup, key, equals } = sg.showWhen;
    const base = section ? (dj?.[section] || {}) : (sectionData || {});
    const scope = subgroup ? (base[subgroup] || {}) : base;
    const v = scope[key];
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

  // Repeatable groups (e.g. Treatment Plan → Investigations) — one titled block
  // per saved entry. The array always lives at section level, whether the group
  // is declared on the section or nested in a subgroup. Groups with no entries
  // render nothing rather than a row of em-dashes.
  const renderRepeatables = (groups, sectionData) =>
    (groups || [])
      .filter((group) => shouldShowSubgroup(group, sectionData, dj))
      .flatMap((group) => {
        const entries = (Array.isArray(sectionData?.[group.key]) ? sectionData[group.key] : [])
          .filter((it) => it && Object.values(it).some((v) => v != null && v !== ''));
        return entries.map((entry, index) => (
          <div key={`${group.key}-${index}`} className="portal-form__readonly-subgroup">
            <div className="portal-form__readonly-subtitle">
              {group.itemLabel} {index + 1}
            </div>
            <div className="portal-form__readonly-grid">
              {renderFieldList(group.fields, entry)}
            </div>
          </div>
        ));
      });

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
                  {renderRepeatables(sg.repeatableGroups, sectionData)}
                </div>
              ))}
            {renderRepeatables(section.repeatableGroups, sectionData)}
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
