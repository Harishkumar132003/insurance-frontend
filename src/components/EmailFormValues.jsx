// Renders the structured form_values an email was submitted with, in a layout
// that mirrors the original hospital-side form (sections + side-by-side fields)
// but read-only. Used by ClaimTimeline when an email's `form_values` is set.

import ReadOnlyForm from './ReadOnlyForm';

const SUBMITTED_TYPES = ['SUBMITTED', 'APPLIED'];
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

function formatINR(amount) {
  if (amount === null || amount === undefined || amount === '') return '—';
  const num = Number(amount);
  if (Number.isNaN(num)) return '—';
  return num.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

function paIdFrom(formValues, claim) {
  const c = claim || {};
  return (
    formValues.claim_number ||
    c.pa_number ||
    c.claim_number ||
    c.claim_case_id ||
    ''
  );
}

function formatTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(',', '');
}

// Reuses .portal-form__field / __field-label / __read-field classes (defined
// in Pages.scss at top-level via SCSS `&__` concatenation, so they work
// outside a .portal-form parent).
function ReadField({ label, value, span = 1 }) {
  // Pass React nodes through unchanged; only stringify primitive values.
  const display =
    value === null || value === undefined || value === ''
      ? '—'
      : value;
  return (
    <div className="portal-form__field" style={{ gridColumn: `span ${span}` }}>
      {label && <label className="portal-form__field-label">{label}</label>}
      <div className="portal-form__read-field">{display}</div>
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

// Shared portal-form shell — gives each read-only view the same chrome the
// live form has (title bar with accent + body padding) without the close
// button / footer buttons that only make sense in the modal entry path.
function Shell({ title, subtitle, accent = 'info', children }) {
  return (
    <div className="portal-form portal-form--readonly">
      <div className={`portal-form__head portal-form__head--${accent}`}>
        <div className="portal-form__head-text">
          <div className="portal-form__head-title">{title}</div>
          {subtitle && <div className="portal-form__head-sub">{subtitle}</div>}
        </div>
      </div>
      <div className="portal-form__body">{children}</div>
    </div>
  );
}

// ── Submit view (PreAuth submission) ────────────────────────────────
// Mirrors SubmitPortalForm: read-only Pre-Auth summary via ReadOnlyForm,
// attachments rendered by ClaimTimeline below, optional clinical notes.
function SubmitView({ formValues, claim }) {
  const c = claim || {};
  const insurer = c.insurer_name || '';
  const paId = paIdFrom(formValues, claim);
  const dataJson = formValues.data_json || c.form_data_json || null;
  const notes = formValues.notes || '';

  return (
    <Shell
      title="Submit Pre-Authorisation"
      subtitle={`To ${insurer || 'insurer'}${paId ? ` · ${paId}` : ''}`}
      accent="info"
    >
      <Section
        title="Pre-Auth form summary"
        hint="Read-only — values from the saved form"
        cols={1}
      >
        <div style={{ gridColumn: 'span 1' }}>
          <ReadOnlyForm dataJson={dataJson} />
        </div>
      </Section>

      {notes && (
        <Section title="Additional clinical notes" cols={1}>
          <ReadField label="" value={notes} />
        </Section>
      )}
    </Shell>
  );
}

// ── Enhance view ────────────────────────────────────────────────────
// Strict visual parity with EnhancePortalForm (PreAuthForm.jsx): same
// portal-form shell with the indigo info-accent header, the same three
// sections, same field labels/cols/hints, same green/blue amount accents.
// `claim` provides insurer / originally-requested / diagnosis (not preserved
// in form_values); falls back to '—' if absent.
function EnhanceView({ formValues, claim }) {
  const c = claim || {};
  const patientName = formValues.patient_name || c.patient_name || '';
  const uhid = formValues.uhid || c.uhid || '';
  const insurer = c.insurer_name || '';
  const requested = c.requested_amount;
  const diagnosis = c.diagnosis || '';
  const icd = c.icd10_code || '';
  const paId = paIdFrom(formValues, claim);

  return (
    <Shell
      title="Enhancement Request"
      subtitle={`Additional cover from ${insurer || 'insurer'}${paId ? ` · ${paId}` : ''}`}
      accent="info"
    >
      <Section title="Patient & current authorisation" cols={3}>
        <ReadField
          label="Patient"
          value={`${patientName || '—'} · ${uhid || '—'}`}
          span={2}
        />
        <ReadField label="Insurer" value={insurer} />
        <ReadField label="Originally requested" value={formatINR(requested)} />
        <ReadField
          label="Approved so far"
          value={
            <span style={{ color: '#16a34a', fontWeight: 700 }}>
              {formatINR(formValues.approved_so_far)}
            </span>
          }
        />
        <ReadField
          label="Diagnosis"
          value={diagnosis ? `${diagnosis}${icd ? ` (${icd})` : ''}` : ''}
        />
      </Section>

      <Section title="Reason for enhancement" cols={2}>
        <ReadField label="Category" value={formValues.reason_category} />
        <ReadField
          label="Clinical justification"
          value={formValues.reason_detail}
          span={2}
        />
      </Section>

      <Section
        title="Amount"
        hint="Total approved including this enhancement request"
        cols={3}
      >
        <ReadField
          label="Approved already"
          value={formatINR(formValues.approved_so_far)}
        />
        <ReadField
          label="Additional requested (₹)"
          value={formatINR(formValues.additional_amount)}
        />
        <ReadField
          label="Revised total"
          value={
            <span style={{ color: '#4f46e5', fontWeight: 700 }}>
              {formatINR(formValues.revised_total)}
            </span>
          }
        />
      </Section>
    </Shell>
  );
}

// ── Reconsider view ─────────────────────────────────────────────────
// Mirrors ReconsiderPortalForm: danger-accent shell, denial quote at top,
// then Grounds / Co-signing physician / Escalation sections.
function ReconsiderView({ formValues, claim }) {
  const c = claim || {};
  const insurer = c.insurer_name || '';
  const paId = paIdFrom(formValues, claim);
  const phys = isPlainObject(formValues.co_signing_physician)
    ? formValues.co_signing_physician
    : {};

  // Find timestamp for the denial reason from claim.status_history.
  const denialEntry = (() => {
    const sh = Array.isArray(c.status_history) ? c.status_history : [];
    const denials = sh
      .filter((e) => e.status === 'DENIED')
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return denials[0] || null;
  })();
  const denialMeta = denialEntry?.created_at
    ? `${insurer || 'Insurer'} Claims · ${formatTimestamp(denialEntry.created_at)}`
    : (insurer ? `${insurer} Claims` : '');

  return (
    <Shell
      title="Reconsideration Request"
      subtitle={`Appeal denial from ${insurer || 'insurer'}${paId ? ` · ${paId}` : ''}`}
      accent="danger"
    >
      {formValues.denial_reason && (
        <blockquote className="portal-form__quote">
          {formValues.denial_reason}
          {denialMeta && (
            <span className="portal-form__quote-meta">— {denialMeta}</span>
          )}
        </blockquote>
      )}

      <Section title="Grounds for reconsideration" cols={2}>
        <ReadField label="Grounds" value={formValues.grounds} />
        <ReadField
          label="Amount being claimed (₹)"
          value={formatINR(formValues.amount)}
        />
        <ReadField
          label="Detailed clinical & policy justification"
          value={formValues.justification}
          span={2}
        />
      </Section>

      <Section
        title="Co-signing physician"
        hint="Senior physician supporting the appeal"
        cols={2}
      >
        <ReadField label="Doctor name" value={phys.name} span={2} />
        <ReadField label="Specialty" value={phys.specialty} />
        <ReadField label="Registration No." value={phys.reg ? `Reg. ${phys.reg}` : ''} />
        <ReadField label="Contact / remarks" value={phys.remarks} span={2} />
      </Section>

      {formValues.escalate && (
        <Section title="Escalation" cols={1}>
          <ReadField
            label=""
            value={
              <span style={{ color: '#4f46e5', fontWeight: 600 }}>
                ✓ Escalated to insurer's medical review board for second opinion
              </span>
            }
          />
        </Section>
      )}
    </Shell>
  );
}

// ── ADR view ────────────────────────────────────────────────────────
// Mirrors ADRPortalForm: warning-accent shell, insurer's request quote,
// requested-documents checklist, optional clarifications block.
function ADRView({ formValues, claim }) {
  const c = claim || {};
  const insurer = c.insurer_name || '';
  const paId = paIdFrom(formValues, claim);
  const items = Array.isArray(formValues.items) ? formValues.items : [];
  const attachedCount = items.filter((it) => it.attached).length;

  // Latest ADR query (open preferred) from claim.query_logs to render
  // the insurer's original request in a quote block.
  const adrQuery = (() => {
    const logs = Array.isArray(c.query_logs) ? c.query_logs : [];
    const adr = logs.filter((q) => q.query_type === 'ADR_NMI');
    if (adr.length === 0) return null;
    const open = adr.filter((q) => q.status === 'OPEN');
    const pool = open.length > 0 ? open : adr;
    return [...pool].sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
    )[0] || null;
  })();
  const adrText =
    adrQuery?.query_details ||
    adrQuery?.documents_requested ||
    '';
  const adrMeta = adrQuery?.created_at
    ? `${insurer || 'Insurer'} Claims · ${formatTimestamp(adrQuery.created_at)}`
    : (insurer ? `${insurer} Claims` : '');

  return (
    <Shell
      title="Submit Additional Documents (ADR Response)"
      subtitle={`Replying to ${insurer || 'insurer'}${paId ? ` · ${paId}` : ''}`}
      accent="warning"
    >
      {adrText && (
        <blockquote className="portal-form__quote">
          {adrText}
          {adrMeta && (
            <span className="portal-form__quote-meta">— {adrMeta}</span>
          )}
        </blockquote>
      )}

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
    </Shell>
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

export default function EmailFormValues({ formValues, emailType, claim }) {
  if (!formValues || typeof formValues !== 'object') return null;
  if (SUBMITTED_TYPES.includes(emailType)) return <SubmitView formValues={formValues} claim={claim} />;
  if (RECONSIDER_TYPES.includes(emailType)) return <ReconsiderView formValues={formValues} claim={claim} />;
  if (ENHANCE_TYPES.includes(emailType)) return <EnhanceView formValues={formValues} claim={claim} />;
  if (ADR_TYPES.includes(emailType)) return <ADRView formValues={formValues} claim={claim} />;
  return <GenericView formValues={formValues} />;
}
