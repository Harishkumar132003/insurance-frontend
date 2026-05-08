// Renders the structured form_values an email was submitted with, in a layout
// that mirrors the original hospital-side form (sections + side-by-side fields)
// but read-only. Used by ClaimTimeline when an email's `form_values` is set.

const RECONSIDER_TYPES = [
  'RECONSIDER',
  'RECONSIDER_SUBMITTED',
  'RECONSIDERATION',
  'RECONSIDERATION_REQUEST',
];
const ENHANCE_TYPES = [
  'ENHANCE_SUBMITTED',
  'ENHANCE_REQUEST',
  'ENHANCE',
  'ENHANCEMENT',
];
const ADR_TYPES = ['ADR_SUBMITTED', 'ADDITIONAL_DOC_RESPONSE'];

const LABEL_OVERRIDES = {
  uhid: 'UHID',
  reg: 'Registration No.',
  icd10_code: 'ICD-10 Code',
};

function humanize(key) {
  if (LABEL_OVERRIDES[key]) return LABEL_OVERRIDES[key];
  return String(key)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function fmt(v) {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

// Reuses .portal-form__field / __field-label / __read-field classes (defined
// in Pages.scss at top-level via SCSS `&__` concatenation, so they work
// outside a .portal-form parent).
function ReadField({ label, value, span = 1 }) {
  return (
    <div className="portal-form__field" style={{ gridColumn: `span ${span}` }}>
      {label && <label className="portal-form__field-label">{label}</label>}
      <div className="portal-form__read-field">{fmt(value)}</div>
    </div>
  );
}

function Section({ title, hint, cols = 2, children }) {
  return (
    <div className="portal-form__section">
      <div className="portal-form__section-head">
        <h4>{title}</h4>
        {hint && <span className="portal-form__section-hint">{hint}</span>}
      </div>
      <div
        className="portal-form__section-body"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Reconsider view ─────────────────────────────────────────────────
function ReconsiderView({ formValues }) {
  const phys = isPlainObject(formValues.co_signing_physician)
    ? formValues.co_signing_physician
    : {};
  return (
    <div className="email-form-view">
      <Section title="Patient & claim" cols={2}>
        <ReadField label="Patient name" value={formValues.patient_name} />
        <ReadField label="UHID" value={formValues.uhid} />
        <ReadField label="Claim number" value={formValues.claim_number} />
        <ReadField label="Amount being claimed" value={formValues.amount} />
      </Section>

      <Section title="Insurer's denial" cols={1}>
        <ReadField label="Denial reason" value={formValues.denial_reason} />
      </Section>

      <Section title="Grounds for reconsideration" cols={2}>
        <ReadField label="Grounds" value={formValues.grounds} />
        <ReadField label="Detailed justification" value={formValues.justification} span={2} />
      </Section>

      <Section title="Co-signing physician" cols={2}>
        <ReadField label="Doctor name" value={phys.name} span={2} />
        <ReadField label="Specialty" value={phys.specialty} />
        <ReadField label="Registration No." value={phys.reg} />
        <ReadField label="Remarks" value={phys.remarks} span={2} />
      </Section>
    </div>
  );
}

// ── Enhance view ────────────────────────────────────────────────────
function EnhanceView({ formValues }) {
  return (
    <div className="email-form-view">
      <Section title="Patient & claim" cols={2}>
        <ReadField label="Patient name" value={formValues.patient_name} />
        <ReadField label="UHID" value={formValues.uhid} />
        <ReadField label="Claim number" value={formValues.claim_number} span={2} />
      </Section>

      <Section title="Reason for enhancement" cols={2}>
        <ReadField label="Category" value={formValues.reason_category} />
        <ReadField label="Clinical justification" value={formValues.reason_detail} span={2} />
      </Section>

      <Section title="Amount" cols={3}>
        <ReadField label="Approved already" value={formValues.approved_so_far} />
        <ReadField label="Additional requested" value={formValues.additional_amount} />
        <ReadField label="Revised total" value={formValues.revised_total} />
      </Section>
    </div>
  );
}

// ── ADR view ────────────────────────────────────────────────────────
function ADRView({ formValues }) {
  const items = Array.isArray(formValues.items) ? formValues.items : [];
  const attachedCount = items.filter((it) => it.attached).length;
  return (
    <div className="email-form-view">
      <Section title="Patient & claim" cols={2}>
        <ReadField label="Patient name" value={formValues.patient_name} />
        <ReadField label="UHID" value={formValues.uhid} />
        <ReadField label="Claim number" value={formValues.claim_number} span={2} />
      </Section>

      {items.length > 0 && (
        <div className="portal-form__section">
          <div className="portal-form__section-head">
            <h4>Documents requested</h4>
            <span className="portal-form__section-hint">
              {attachedCount} of {items.length} attached
            </span>
          </div>
          <ul className="email-form-view__adr-list">
            {items.map((it, i) => (
              <li key={i} className="email-form-view__adr-row">
                <span className="email-form-view__adr-label">{it.label}</span>
                {it.attached ? (
                  <span className="email-form-view__chip email-form-view__chip--ok">
                    ✓ {it.filename || 'Attached'}
                  </span>
                ) : (
                  <span className="email-form-view__chip email-form-view__chip--missing">
                    Missing
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {formValues.clarification && (
        <Section title="Clarifications to claims team" cols={1}>
          <ReadField label="" value={formValues.clarification} />
        </Section>
      )}
    </div>
  );
}

// ── Generic fallback (unknown email_type) ──────────────────────────
function GenericRow({ k, v }) {
  const label = humanize(k);
  if (isPlainObject(v)) {
    return (
      <>
        <dt className="email-form-values__group">{label}</dt>
        <dd className="email-form-values__group-value">
          <dl className="email-form-values email-form-values--nested">
            {Object.entries(v).map(([sk, sv]) => (
              <GenericRow key={sk} k={sk} v={sv} />
            ))}
          </dl>
        </dd>
      </>
    );
  }
  if (Array.isArray(v)) {
    return (
      <>
        <dt>{label}</dt>
        <dd>
          {v.length === 0 ? '—' : (
            <ul>
              {v.map((item, i) => (
                <li key={i}>
                  {isPlainObject(item) ? JSON.stringify(item) : String(item)}
                </li>
              ))}
            </ul>
          )}
        </dd>
      </>
    );
  }
  return (
    <>
      <dt>{label}</dt>
      <dd>{fmt(v)}</dd>
    </>
  );
}

function GenericView({ formValues }) {
  return (
    <dl className="email-form-values">
      {Object.entries(formValues).map(([k, v]) => (
        <GenericRow key={k} k={k} v={v} />
      ))}
    </dl>
  );
}

export default function EmailFormValues({ formValues, emailType }) {
  if (!formValues || typeof formValues !== 'object') return null;
  if (RECONSIDER_TYPES.includes(emailType)) return <ReconsiderView formValues={formValues} />;
  if (ENHANCE_TYPES.includes(emailType)) return <EnhanceView formValues={formValues} />;
  if (ADR_TYPES.includes(emailType)) return <ADRView formValues={formValues} />;
  return <GenericView formValues={formValues} />;
}
