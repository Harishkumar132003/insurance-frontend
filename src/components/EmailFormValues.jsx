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
  // Claim-stage reconsideration uses the same form shape as pre-auth's.
  'CLAIM_RECONSIDER',
];
const ENHANCE_TYPES = [
  'ENHANCE_SUBMITTED',
  'ENHANCE_REQUEST',
  'ENHANCE',
  'ENHANCEMENT',
];
const ADR_TYPES = [
  'ADR_SUBMITTED',
  'ADDITIONAL_DOC_RESPONSE',
  // Claim-stage ADR submission uses the same form shape (items checklist +
  // extra docs + clarification) as pre-auth's ADR_SUBMITTED.
  'CLAIM_ADR_SUBMITTED',
];
const CLAIM_SUBMIT_TYPES = ['CLAIM_SUBMITTED'];

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
  // The claim object on PreAuthForm exposes the latest pre-auth FormData as
  // either `data_json` (canonical) or `form_data_json` (older alias). Read
  // both so old emails with NULL form_values still render via fallback.
  const dataJson = formValues.data_json || c.data_json || c.form_data_json || null;
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
function ADRView({ formValues, claim, onOpenAttachment }) {
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
                  it.attachment_id && typeof onOpenAttachment === 'function' ? (
                    <button
                      type="button"
                      className="email-form-view__chip email-form-view__chip--ok"
                      onClick={() => onOpenAttachment(it.attachment_id)}
                      title="Open file"
                      style={{ cursor: 'pointer', border: 'none' }}
                    >
                      ✓ {it.filename || 'Attached'}
                    </button>
                  ) : (
                    <span className="email-form-view__chip email-form-view__chip--ok">
                      ✓ {it.filename || 'Attached'}
                    </span>
                  )
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

// ── Provider decision view ─────────────────────────────────────────
// Renders the form the insurer/provider filled in when deciding on a claim
// (Approve / Partially approve / Deny / Enhancement-deny / ADR request).
// Identified by `formValues.decision` being present.
const DECISION_LABEL = {
  APPROVED: 'Approved',
  PARTIALLY_APPROVED: 'Partially Approved',
  ENHANCEMENT_APPROVED: 'Enhancement Approved',
  DENIED: 'Denied',
  ENHANCEMENT_DENIED: 'Enhancement Denied',
  ADR_NMI: 'Additional Documents Requested',
};
const DECISION_ACCENT = {
  APPROVED: 'info',
  PARTIALLY_APPROVED: 'info',
  ENHANCEMENT_APPROVED: 'info',
  DENIED: 'danger',
  ENHANCEMENT_DENIED: 'danger',
  ADR_NMI: 'warning',
};

function ProviderDecisionView({ formValues, claim }) {
  const c = claim || {};
  const decision = formValues.decision || '';
  const isApproval = decision === 'APPROVED' || decision === 'PARTIALLY_APPROVED' || decision === 'ENHANCEMENT_APPROVED';
  const isAdr = decision === 'ADR_NMI';
  const docs = Array.isArray(formValues.documents_list) ? formValues.documents_list : [];
  const paId = paIdFrom(formValues, claim);
  const insurer = c.insurer_name || '';

  return (
    <Shell
      title="Provider Decision"
      subtitle={`${insurer || 'Insurer'}${paId ? ` · ${paId}` : ''}`}
      accent={DECISION_ACCENT[decision] || 'info'}
    >
      <Section title="Decision" cols={2}>
        <ReadField label="Outcome" value={DECISION_LABEL[decision] || (decision || '—').replace(/_/g, ' ')} />
        <ReadField label="Claim / authorisation number" value={formValues.claim_number} />
        {isApproval && (
          <ReadField
            label="Approved (this round)"
            value={
              <span style={{ color: '#16a34a', fontWeight: 700 }}>
                {formatINR(formValues.approved_amount)}
              </span>
            }
          />
        )}
        {isApproval && formValues.cumulative_approved_amount != null && (
          <ReadField label="Total approved (cumulative)" value={formatINR(formValues.cumulative_approved_amount)} />
        )}
      </Section>

      {isAdr && (
        <Section title="Documents requested" hint={`${docs.length} item${docs.length === 1 ? '' : 's'}`} cols={1}>
          <div style={{ gridColumn: 'span 1' }}>
            {docs.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
                {docs.map((d, i) => <li key={`${d}-${i}`} style={{ fontSize: 14 }}>{d}</li>)}
              </ul>
            ) : (
              <ReadField label="" value={formValues.documents_requested || ''} />
            )}
          </div>
        </Section>
      )}

      {Array.isArray(formValues.approved_breakdown) && formValues.approved_breakdown.length > 0 && (
        <Section title="Approved breakdown" cols={1}>
          <div style={{ gridColumn: 'span 1' }}>
            <table className="claim-review__table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Line item</th>
                  <th style={{ textAlign: 'right' }}>Claimed</th>
                  <th style={{ textAlign: 'right' }}>Approved</th>
                </tr>
              </thead>
              <tbody>
                {formValues.approved_breakdown.map((ln, idx) => (
                  <tr key={idx}>
                    <td>{ln?.label || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{formatINR(ln?.claimed)}</td>
                    <td style={{ textAlign: 'right' }}>{formatINR(ln?.approved)}</td>
                  </tr>
                ))}
                <tr className="claim-review__total-row">
                  <td><strong>Total</strong></td>
                  <td style={{ textAlign: 'right' }}>
                    <strong>{formatINR(formValues.approved_breakdown.reduce((s, l) => s + (Number(l?.claimed) || 0), 0))}</strong>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <strong>{formatINR(formValues.approved_breakdown.reduce((s, l) => s + (Number(l?.approved) || 0), 0))}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {(formValues.remarks || formValues.query_details) && (
        <Section title={isAdr ? 'Query details / remarks' : 'Remarks'} cols={1}>
          <ReadField label="" value={formValues.remarks || formValues.query_details} />
        </Section>
      )}
    </Shell>
  );
}

// ── Claim raise view (CLAIM_SUBMITTED) ──────────────────────────────
function ClaimSubmitView({ formValues, claim }) {
  const c = claim || {};
  const items = Array.isArray(formValues.bill_breakdown) ? formValues.bill_breakdown : [];
  const claimedAmount = formValues.claimed_amount != null && formValues.claimed_amount !== ''
    ? formValues.claimed_amount
    : items.reduce((sum, it) => sum + (Number(it?.amount) || 0), 0);
  const paId = c.pa_number || c.claim_number || c.claim_case_id || '';
  return (
    <Shell
      title="Claim Raised"
      subtitle={paId ? `Reference ${paId}` : undefined}
      accent="info"
    >
      <Section title="Bill breakdown" hint="Itemized hospital bill submitted with the claim" cols={1}>
        {items.length === 0 ? (
          <ReadField label="" value="—" />
        ) : (
          <table className="claim-review__table" style={{ gridColumn: 'span 1' }}>
            <thead>
              <tr>
                <th>Line item</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td>{it?.label || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{formatINR(it?.amount)}</td>
                </tr>
              ))}
              <tr className="claim-review__total-row">
                <td><strong>Total claim</strong></td>
                <td style={{ textAlign: 'right' }}><strong>{formatINR(claimedAmount)}</strong></td>
              </tr>
            </tbody>
          </table>
        )}
      </Section>

      {formValues.remarks && (
        <Section title="Hospital remarks" cols={1}>
          <ReadField label="" value={formValues.remarks} />
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

export default function EmailFormValues({ formValues, emailType, claim, onOpenAttachment }) {
  if (!formValues || typeof formValues !== 'object') return null;
  // Provider-decision forms (Approve / Deny / ADR request) are tagged with a
  // `decision` field — they take precedence over the email_type routing.
  if (formValues.decision) return <ProviderDecisionView formValues={formValues} claim={claim} />;
  if (CLAIM_SUBMIT_TYPES.includes(emailType)) return <ClaimSubmitView formValues={formValues} claim={claim} />;
  if (SUBMITTED_TYPES.includes(emailType)) return <SubmitView formValues={formValues} claim={claim} />;
  if (RECONSIDER_TYPES.includes(emailType)) return <ReconsiderView formValues={formValues} claim={claim} />;
  if (ENHANCE_TYPES.includes(emailType)) return <EnhanceView formValues={formValues} claim={claim} />;
  if (ADR_TYPES.includes(emailType)) return <ADRView formValues={formValues} claim={claim} onOpenAttachment={onOpenAttachment} />;
  return <GenericView formValues={formValues} />;
}
