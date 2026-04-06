import { useState, useEffect } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { formDataService, claimCaseService, policyProviderService, emailTemplateService, emailService } from '../services/api';
import { IconCheck, IconSend, IconArrowLeft } from '../components/icons/Icons';
import Spinner from '../components/Spinner';
import './Pages.scss';

// ── Step definitions ────────────────────────────────────────────────

const STEPS = [
  { key: 'form', label: 'Form' },
  { key: 'apply', label: 'Apply' },
];

// ── Static form schema ──────────────────────────────────────────────

const FORM_SECTIONS = [
  {
    name: 'tpa_insurer_hospital',
    label: 'TPA / Insurer / Hospital Details',
    fields: [
      { key: 'tpa_name', label: 'TPA Name', type: 'text' },
      { key: 'tpa_toll_free_phone', label: 'TPA Toll Free Phone', type: 'text' },
      { key: 'tpa_toll_free_fax', label: 'TPA Toll Free Fax', type: 'text' },
      { key: 'hospital_name', label: 'Hospital Name', type: 'text' },
      { key: 'hospital_address', label: 'Hospital Address', type: 'text' },
      { key: 'hospital_rohini_id', label: 'Hospital Rohini ID', type: 'text' },
      { key: 'hospital_email', label: 'Hospital Email', type: 'text' },
    ],
  },
  {
    name: 'patient_insured',
    label: 'Patient / Insured Details',
    fields: [
      { key: 'patient_name', label: 'Patient Name', type: 'text' },
      { key: 'gender', label: 'Gender', type: 'radio', options: ['Male', 'Female', 'Third Gender'] },
      { key: 'age_years', label: 'Age (Years)', type: 'number' },
      { key: 'age_months', label: 'Age (Months)', type: 'number' },
      { key: 'date_of_birth', label: 'Date of Birth', type: 'date' },
      { key: 'contact_number', label: 'Contact Number', type: 'text' },
      { key: 'relative_contact_number', label: 'Relative Contact Number', type: 'text' },
      { key: 'insured_card_id', label: 'Insured Card ID', type: 'text' },
      { key: 'policy_number', label: 'Policy Number', type: 'text' },
      { key: 'corporate_name', label: 'Corporate Name', type: 'text' },
      { key: 'employee_id', label: 'Employee ID', type: 'text' },
      { key: 'has_other_insurance', label: 'Has Other Insurance?', type: 'boolean' },
      { key: 'other_insurance_company', label: 'Other Insurance Company', type: 'text', showWhen: 'has_other_insurance' },
      { key: 'other_insurance_details', label: 'Other Insurance Details', type: 'text', showWhen: 'has_other_insurance' },
      { key: 'has_family_physician', label: 'Has Family Physician?', type: 'boolean' },
      { key: 'family_physician_name', label: 'Family Physician Name', type: 'text', showWhen: 'has_family_physician' },
      { key: 'family_physician_contact', label: 'Family Physician Contact', type: 'text', showWhen: 'has_family_physician' },
      { key: 'address', label: 'Address', type: 'textarea' },
      { key: 'occupation', label: 'Occupation', type: 'text' },
    ],
  },
  {
    name: 'treating_doctor',
    label: 'Treating Doctor / Hospital Details',
    fields: [
      { key: 'doctor_name', label: 'Doctor Name', type: 'text' },
      { key: 'doctor_contact', label: 'Doctor Contact', type: 'text' },
      { key: 'illness_description', label: 'Illness Description', type: 'textarea' },
      { key: 'critical_findings', label: 'Critical Findings', type: 'textarea' },
      { key: 'duration_days', label: 'Duration (Days)', type: 'number' },
      { key: 'first_consultation_date', label: 'First Consultation Date', type: 'date' },
      { key: 'past_history', label: 'Past History', type: 'textarea' },
      { key: 'provisional_diagnosis', label: 'Provisional Diagnosis', type: 'text' },
      { key: 'icd10_code', label: 'ICD-10 Code', type: 'text' },
    ],
    subgroups: [
      {
        key: 'treatment_plan',
        label: 'Treatment Plan',
        fields: [
          { key: 'medical_management', label: 'Medical Management', type: 'boolean' },
          { key: 'surgical_management', label: 'Surgical Management', type: 'boolean' },
          { key: 'intensive_care', label: 'Intensive Care', type: 'boolean' },
          { key: 'investigation', label: 'Investigation', type: 'boolean' },
          { key: 'non_allopathic', label: 'Non-Allopathic', type: 'boolean' },
        ],
      },
    ],
    fieldsAfterSubgroups: [
      { key: 'treatment_details', label: 'Treatment Details', type: 'textarea' },
      { key: 'drug_route', label: 'Drug Route', type: 'text' },
      { key: 'surgery_name', label: 'Surgery Name', type: 'text' },
      { key: 'surgery_icd_code', label: 'Surgery ICD Code', type: 'text' },
      { key: 'other_treatment', label: 'Other Treatment', type: 'text' },
      { key: 'injury_cause', label: 'Injury Cause', type: 'text' },
    ],
    additionalSubgroups: [
      {
        key: 'accident_details',
        label: 'Accident Details',
        fields: [
          { key: 'is_rta', label: 'Is RTA?', type: 'boolean' },
          { key: 'injury_date', label: 'Injury Date', type: 'date' },
          { key: 'reported_to_police', label: 'Reported to Police?', type: 'boolean' },
          { key: 'fir_number', label: 'FIR Number', type: 'text' },
          { key: 'substance_abuse', label: 'Substance Abuse?', type: 'boolean' },
          { key: 'test_conducted', label: 'Test Conducted?', type: 'boolean' },
        ],
      },
      {
        key: 'maternity',
        label: 'Maternity',
        fields: [
          { key: 'expected_delivery_date', label: 'Expected Delivery Date', type: 'date' },
        ],
      },
    ],
  },
  {
    name: 'hospitalization',
    label: 'Hospitalization Details',
    fields: [
      { key: 'admission_date', label: 'Admission Date', type: 'date' },
      { key: 'admission_time', label: 'Admission Time', type: 'time' },
      { key: 'is_emergency', label: 'Is Emergency?', type: 'boolean' },
    ],
    subgroups: [
      {
        key: 'chronic_conditions',
        label: 'Chronic Conditions',
        fields: [
          { key: 'diabetes', label: 'Diabetes', type: 'text' },
          { key: 'heart_disease', label: 'Heart Disease', type: 'text' },
          { key: 'hypertension', label: 'Hypertension', type: 'text' },
          { key: 'hyperlipidemia', label: 'Hyperlipidemia', type: 'text' },
          { key: 'osteoarthritis', label: 'Osteoarthritis', type: 'text' },
          { key: 'asthma_copd', label: 'Asthma / COPD', type: 'text' },
          { key: 'cancer', label: 'Cancer', type: 'text' },
          { key: 'alcohol_drug_abuse', label: 'Alcohol / Drug Abuse', type: 'text' },
          { key: 'hiv_std', label: 'HIV / STD', type: 'text' },
          { key: 'other', label: 'Other', type: 'text' },
        ],
      },
    ],
    fieldsAfterSubgroups: [
      { key: 'expected_days', label: 'Expected Stay (Days)', type: 'number' },
      { key: 'icu_days', label: 'ICU Days', type: 'number' },
      { key: 'room_type', label: 'Room Type', type: 'text' },
    ],
    additionalSubgroups: [
      {
        key: 'costs',
        label: 'Cost Estimates',
        fields: [
          { key: 'room_rent', label: 'Room Rent', type: 'number' },
          { key: 'investigation_cost', label: 'Investigation Cost', type: 'number' },
          { key: 'icu_charges', label: 'ICU Charges', type: 'number' },
          { key: 'ot_charges', label: 'OT Charges', type: 'number' },
          { key: 'professional_fees', label: 'Professional Fees', type: 'number' },
          { key: 'medicines_cost', label: 'Medicines Cost', type: 'number' },
          { key: 'other_expenses', label: 'Other Expenses', type: 'number' },
          { key: 'package_charges', label: 'Package Charges', type: 'number' },
          { key: 'total_cost', label: 'Total Cost', type: 'number' },
        ],
      },
    ],
  },
  {
    name: 'declaration',
    label: 'Declaration',
    fields: [
      { key: 'doctor_name', label: 'Doctor Name', type: 'text' },
      { key: 'doctor_qualification', label: 'Doctor Qualification', type: 'text' },
      { key: 'doctor_registration_number', label: 'Doctor Registration Number', type: 'text' },
      { key: 'hospital_seal', label: 'Hospital Seal', type: 'file' },
      { key: 'patient_signature', label: 'Patient Signature', type: 'file' },
    ],
  },
  {
    name: 'patient_declaration',
    label: 'Patient Declaration',
    fields: [
      { key: 'patient_name', label: 'Patient Name', type: 'text' },
      { key: 'contact_number', label: 'Contact Number', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'signature', label: 'Signature', type: 'file' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'time', label: 'Time', type: 'time' },
    ],
  },
  {
    name: 'cashless_authorization',
    label: 'Cashless Authorization (Part D)',
    fields: [
      { key: 'claim_number', label: 'Claim Number', type: 'text' },
      { key: 'authorization_valid_till', label: 'Authorization Valid Till', type: 'date' },
      { key: 'insurance_company', label: 'Insurance Company', type: 'text' },
      { key: 'tpa_name', label: 'TPA Name', type: 'text' },
      { key: 'proposer_name', label: 'Proposer Name', type: 'text' },
      { key: 'patient_member_id', label: 'Patient Member ID', type: 'text' },
      { key: 'relation_with_proposer', label: 'Relation with Proposer', type: 'text' },
    ],
    subgroups: [
      {
        key: 'patient_details',
        label: 'Patient Details',
        fields: [
          { key: 'name', label: 'Name', type: 'text' },
          { key: 'age', label: 'Age', type: 'number' },
          { key: 'gender', label: 'Gender', type: 'text' },
        ],
      },
      {
        key: 'policy_details',
        label: 'Policy Details',
        fields: [
          { key: 'policy_number', label: 'Policy Number', type: 'text' },
          { key: 'policy_period', label: 'Policy Period', type: 'text' },
          { key: 'admission_date', label: 'Admission Date', type: 'date' },
          { key: 'discharge_date', label: 'Discharge Date', type: 'date' },
        ],
      },
    ],
    fieldsAfterSubgroups: [
      { key: 'room_category', label: 'Room Category', type: 'text' },
      { key: 'estimated_stay', label: 'Estimated Stay (Days)', type: 'number' },
      { key: 'diagnosis', label: 'Diagnosis', type: 'text' },
      { key: 'treatment', label: 'Treatment', type: 'text' },
      { key: 'authorization_amount', label: 'Authorization Amount', type: 'number' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
];

// ── Field renderer ──────────────────────────────────────────────────

function FieldInput({ field, value, onChange }) {
  const { key, type, options } = field;

  if (type === 'boolean') {
    return (
      <label className="preauth-toggle">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(key, e.target.checked)}
        />
        <span className="preauth-toggle__slider" />
        <span className="preauth-toggle__label">{value ? 'Yes' : 'No'}</span>
      </label>
    );
  }

  if (type === 'radio') {
    return (
      <div className="preauth-radio-group">
        {(options || []).map((opt) => (
          <label key={opt} className="preauth-radio">
            <input
              type="radio"
              name={key}
              value={opt}
              checked={value === opt}
              onChange={(e) => onChange(key, e.target.value)}
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    );
  }

  if (type === 'textarea') {
    return (
      <textarea
        placeholder={field.label}
        value={value || ''}
        onChange={(e) => onChange(key, e.target.value)}
      />
    );
  }

  if (type === 'file') {
    return (
      <input
        type="file"
        onChange={(e) => onChange(key, e.target.files[0] || null)}
      />
    );
  }

  return (
    <input
      type={type === 'number' ? 'number' : type === 'date' ? 'date' : type === 'time' ? 'time' : 'text'}
      placeholder={field.label}
      value={value || ''}
      onChange={(e) => onChange(key, e.target.value)}
    />
  );
}

// ── Step Tracker ────────────────────────────────────────────────────

function StepTracker({ steps, currentStep, completedSteps, onStepClick }) {
  return (
    <div className="step-tracker">
      {steps.map((step, idx) => {
        const isCompleted = completedSteps.includes(step.key);
        const isCurrent = step.key === currentStep;
        const isClickable = isCompleted || isCurrent;
        let cls = 'step-tracker__step';
        if (isCompleted) cls += ' step-tracker__step--done';
        else if (isCurrent) cls += ' step-tracker__step--active';
        if (isClickable) cls += ' step-tracker__step--clickable';

        return (
          <div
            key={step.key}
            className={cls}
            onClick={() => isClickable && onStepClick(step.key)}
          >
            <div className="step-tracker__circle">
              {isCompleted ? <IconCheck size={14} /> : idx + 1}
            </div>
            <span className="step-tracker__label">{step.label}</span>
            {idx < steps.length - 1 && <div className="step-tracker__line" />}
          </div>
        );
      })}
    </div>
  );
}

// ── Apply Step (Email Templates) ────────────────────────────────────

function ApplyStep({ submitResult, onSendSuccess, useQueryEndpoint }) {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await emailTemplateService.getAll();
        setTemplates(Array.isArray(res.data) ? res.data : []);
      } catch {
        setTemplates([]);
      } finally {
        setLoadingTemplates(false);
      }
    };
    fetch();
  }, []);

  const handleSelectTemplate = async (tpl) => {
    setLoadingDetail(true);
    setSelectedTemplate(null);
    try {
      const res = await emailTemplateService.getById(tpl.id);
      setSelectedTemplate(res.data);
      setSubject(res.data.subject || '');
      setContent(res.data.body_html || res.data.body || '');
    } catch {
      // handled
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    setAttachments((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const removeAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!subject.trim()) {
      toast.error('Please enter a subject');
      return;
    }

    const fd = new FormData();
    fd.append('claim_case_id', submitResult.claim_case_id);
    fd.append('subject', subject.trim());
    fd.append('content', content);
    attachments.forEach((file) => fd.append('file', file));

    setSending(true);
    try {
      const sendFn = useQueryEndpoint ? emailService.query : emailService.send;
      const res = await sendFn(fd);
      toast.success('Email sent successfully');
      onSendSuccess(res.data);
    } catch {
      // handled
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="apply-step">
      {/* Template selector sidebar + compose area */}
      <div className="apply-step__layout">
        {/* Left: template list */}
        <div className="apply-step__sidebar">
          <h4 className="apply-step__sidebar-title">Templates</h4>
          {loadingTemplates ? (
            <div className="page-loading"><Spinner /></div>
          ) : templates.length === 0 ? (
            <div className="apply-step__sidebar-empty">No templates</div>
          ) : (
            <div className="apply-step__tpl-list">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className={`apply-step__tpl-item ${selectedTemplate?.id === tpl.id ? 'apply-step__tpl-item--active' : ''}`}
                  onClick={() => handleSelectTemplate(tpl)}
                >
                  <div className="apply-step__tpl-name">{tpl.name}</div>
                  {tpl.subject && <div className="apply-step__tpl-subject">{tpl.subject}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: compose area */}
        <div className="apply-step__compose">
          {loadingDetail && (
            <div className="page-loading"><Spinner /></div>
          )}

          {!selectedTemplate && !loadingDetail && (
            <div className="apply-step__compose-empty">
              <IconSend size={32} />
              <p>Select a template from the left to compose your email</p>
            </div>
          )}

          {selectedTemplate && !loadingDetail && (
            <form onSubmit={handleSend} className="apply-step__compose-form">
              {/* Subject field */}
              <div className="apply-step__field">
                <span className="apply-step__field-label">Subject</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>

              {/* Attachments */}
              <div className="apply-step__field">
                <span className="apply-step__field-label">Attach</span>
                <div className="apply-step__attach-area">
                  {attachments.map((file, idx) => (
                    <div key={idx} className="apply-step__attach-chip">
                      <span>{file.name}</span>
                      <button type="button" onClick={() => removeAttachment(idx)}>&times;</button>
                    </div>
                  ))}
                  <label className="apply-step__attach-btn">
                    + Add File
                    <input type="file" hidden multiple onChange={handleFileChange} />
                  </label>
                </div>
              </div>

              {/* Email body */}
              <textarea
                className="apply-step__body"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter email content..."
                rows={12}
              />

              {/* Send */}
              <div className="apply-step__compose-actions">
                <button type="submit" className="btn btn--primary" disabled={sending}>
                  {sending ? <Spinner size={18} /> : <><IconSend size={16} /> Send</>}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Status Step ─────────────────────────────────────────────────────

function StatusStep({ submitResult, emailResult, onReapply }) {
  const claimStatus = submitResult.claim_status;
  const isQueryStatus = claimStatus === 'ADR' || claimStatus === 'QUERY';
  const queryLogs = submitResult.query_logs || [];
  const latestQuery = isQueryStatus && queryLogs.length > 0 ? queryLogs[queryLogs.length - 1] : null;

  return (
    <div className="status-step">
      <div className="status-step__icon">
        <IconCheck size={32} />
      </div>
      <h3 className="status-step__title">Pre-Auth Submitted Successfully</h3>
      <p className="status-step__desc">Your pre-authorization request has been submitted and sent to the insurance provider.</p>

      <div className="status-step__details">
        <div className="status-step__row">
          <span>Claim Case ID</span>
          <strong>#{submitResult.claim_case_id}</strong>
        </div>
        <div className="status-step__row">
          <span>Form Data ID</span>
          <strong>#{submitResult.form_data_id}</strong>
        </div>
        <div className="status-step__row">
          <span>Claim Status</span>
          <span className={`badge ${isQueryStatus ? 'badge--info' : 'badge--warning'}`}>{claimStatus}</span>
        </div>
        {emailResult && (
          <>
            <div className="status-step__divider" />
            <div className="status-step__row">
              <span>Email Sent To</span>
              <strong>{emailResult.to_email}</strong>
            </div>
            <div className="status-step__row">
              <span>Email Subject</span>
              <strong>{emailResult.subject}</strong>
            </div>
          </>
        )}
        {latestQuery && (
          <>
            <div className="status-step__divider" />
            <div className="status-step__row">
              <span>Query Type</span>
              <span className="badge badge--info">{latestQuery.query_type}</span>
            </div>
            <div className="status-step__row">
              <span>Query Status</span>
              <span className={`badge ${latestQuery.status === 'OPEN' ? 'badge--warning' : 'badge--info'}`}>{latestQuery.status}</span>
            </div>
            <div className="status-step__query-detail">
              <span className="status-step__query-label">Query Details</span>
              <p>{latestQuery.query_details}</p>
            </div>
            {latestQuery.documents_requested && (
              <div className="status-step__query-detail">
                <span className="status-step__query-label">Documents Requested</span>
                <p>{latestQuery.documents_requested}</p>
              </div>
            )}
          </>
        )}
      </div>
      {isQueryStatus && onReapply && (
        <div className="status-step__actions">
          <button type="button" className="btn btn--primary" onClick={onReapply}>
            <IconSend size={16} /> Respond to Query
          </button>
        </div>
      )}
    </div>
  );
}

// ── Email Step View (dynamic email_type steps) ────────────────────

function EmailStepView({ emails, claimCaseId, onReplyClick }) {
  const handleDownload = async (emailId, attId, filename) => {
    try {
      const res = await claimCaseService.downloadAttachment(claimCaseId, emailId, attId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'attachment';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      // handled by interceptor
    }
  };

  const lastEmail = emails.length > 0 ? emails[emails.length - 1] : null;
  const showReplyBtn = lastEmail?.direction === 'RECEIVED' && onReplyClick;

  return (
    <div>
      {emails.map((email) => (
        <div key={email.id} className="preauth-section">
          <h3 className="preauth-section__title">{email.subject}</h3>
          <div className="email-detail">
            <div className="email-detail__meta">
              <div className="email-detail__row">
                <span className="email-detail__label">From</span>
                <span>{email.from_email}</span>
              </div>
              <div className="email-detail__row">
                <span className="email-detail__label">To</span>
                <span>{email.to_email}</span>
              </div>
              <div className="email-detail__row">
                <span className="email-detail__label">Date</span>
                <span>{new Date(email.email_date).toLocaleString('en-IN')}</span>
              </div>
              <div className="email-detail__row">
                <span className="email-detail__label">Direction</span>
                <span className={`badge badge--${email.direction === 'SENT' ? 'success' : 'info'}`}>
                  {email.direction}
                </span>
              </div>
            </div>
            <div className="email-detail__divider" />
            <div className="email-detail__body">
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
                {email.body}
              </pre>
            </div>
            {email.attachments?.length > 0 && (
              <div className="query-attachments">
                <h4>Attachments</h4>
                {email.attachments.map((att) => (
                  <button
                    key={att.id}
                    className="btn btn--ghost btn--sm"
                    onClick={() => handleDownload(email.id, att.id, att.original_filename)}
                  >
                    {att.original_filename} ({(att.file_size / 1024).toFixed(1)} KB)
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {showReplyBtn && (
        <div className="preauth-form__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={onReplyClick}
          >
            <IconSend size={16} /> Reply
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

export default function PreAuthForm() {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { claimCaseId: routeClaimCaseId } = useParams();
  const [currentStep, setCurrentStep] = useState('form');
  const [completedSteps, setCompletedSteps] = useState([]);

  // Form step state
  const [uhid, setUhid] = useState('');
  const [providers, setProviders] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({});
  const [loadingCase, setLoadingCase] = useState(false);

  // Apply / Status state
  const [submitResult, setSubmitResult] = useState(null);
  const [emailResult, setEmailResult] = useState(null);
  const [showReapply, setShowReapply] = useState(false);

  // Dynamic email-type steps
  const [claimEmails, setClaimEmails] = useState([]);
  const [showQueryResponse, setShowQueryResponse] = useState(false);

  const appliedEmails = claimEmails.filter((e) => e.email_type === 'APPLIED');

  const emailTypeSteps = claimEmails.reduce((acc, email) => {
    // APPLIED emails are shown in the Apply step, not as a separate step
    if (email.email_type && email.email_type !== 'APPLIED' && !acc.find((s) => s.key === email.email_type)) {
      acc.push({ key: email.email_type, label: email.email_type.replace(/_/g, ' ') });
    }
    return acc;
  }, []);

  const steps = claimEmails.length > 0
    ? [
        { key: 'form', label: 'Form' },
        { key: 'apply', label: 'Apply' },
        ...emailTypeSteps,
        ...(showQueryResponse ? [{ key: 'QUERY_RESPONSE', label: 'Query Response' }] : []),
      ]
    : STEPS;

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const res = await policyProviderService.getAll();
        const list = Array.isArray(res.data) ? res.data : [];
        setProviders(list);
        if (list.length > 0) setSelectedProviderId(list[0].id);
      } catch {
        setProviders([]);
      } finally {
        setLoadingProviders(false);
      }
    };
    fetchProviders();
  }, []);

  // Load claim case from URL if claim_case_id is present
  useEffect(() => {
    const claimCaseId = routeClaimCaseId || searchParams.get('claim_case_id');
    if (!claimCaseId) return;

    const loadClaimCase = async () => {
      setLoadingCase(true);
      try {
        const res = await claimCaseService.getById(claimCaseId);
        const cc = res.data;

        // Populate top-level fields
        setUhid(cc.uhid || '');
        if (cc.policy_provider_id) setSelectedProviderId(cc.policy_provider_id);

        // Populate form data from the latest form_data entry
        const latestForm = Array.isArray(cc.form_data) && cc.form_data.length > 0
          ? cc.form_data[cc.form_data.length - 1]
          : null;

        if (latestForm?.data_json) {
          setFormData(latestForm.data_json);
        }

        // Build submitResult so Apply/Status steps work
        setSubmitResult({
          claim_case_id: cc.id,
          form_data_id: latestForm?.id,
          status: cc.status,
          claim_status: cc.claim_status,
          query_logs: cc.query_logs || [],
        });

        // Fetch all emails for this claim case
        let emailsList = [];
        try {
          const emailsRes = await claimCaseService.getAllEmails(claimCaseId);
          emailsList = Array.isArray(emailsRes.data) ? emailsRes.data : [];
          setClaimEmails(emailsList);
        } catch {
          // no emails
        }

        // Set steps based on emails
        if (emailsList.length > 0) {
          const emailStepKeys = [...new Set(emailsList.map((e) => e.email_type).filter((t) => t && t !== 'APPLIED'))];
          setCompletedSteps(['form', 'apply', ...emailStepKeys]);
          setCurrentStep(emailStepKeys[emailStepKeys.length - 1] || 'apply');
        } else if (cc.status === 'DRAFT') {
          setCompletedSteps(['form']);
          setCurrentStep('apply');
        } else {
          setCompletedSteps(['form', 'apply']);
          setCurrentStep('status');
        }
      } catch {
        // handled by interceptor
      } finally {
        setLoadingCase(false);
      }
    };
    loadClaimCase();
  }, [routeClaimCaseId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Form helpers ──

  const getValue = (sectionName, key, subgroupKey) => {
    const section = formData[sectionName] || {};
    if (subgroupKey) return (section[subgroupKey] || {})[key] ?? '';
    return section[key] ?? '';
  };

  const setValue = (sectionName, key, value, subgroupKey) => {
    setFormData((prev) => {
      const section = { ...(prev[sectionName] || {}) };
      if (subgroupKey) {
        section[subgroupKey] = { ...(section[subgroupKey] || {}), [key]: value };
      } else {
        section[key] = value;
      }
      return { ...prev, [sectionName]: section };
    });
  };

  const shouldShow = (field, sectionName) => {
    if (!field.showWhen) return true;
    return !!getValue(sectionName, field.showWhen);
  };

  const buildPayload = () => {
    const dataJson = {};
    for (const section of FORM_SECTIONS) {
      const sd = formData[section.name] || {};
      const cleaned = { ...sd };

      const convertNumbers = (fields, obj) => {
        for (const f of fields) {
          if (f.type === 'number' && obj[f.key] !== undefined && obj[f.key] !== '') {
            obj[f.key] = Number(obj[f.key]);
          }
        }
      };

      convertNumbers(section.fields, cleaned);
      if (section.fieldsAfterSubgroups) convertNumbers(section.fieldsAfterSubgroups, cleaned);

      const allSubgroups = [...(section.subgroups || []), ...(section.additionalSubgroups || [])];
      for (const sg of allSubgroups) {
        if (cleaned[sg.key]) {
          cleaned[sg.key] = { ...cleaned[sg.key] };
          convertNumbers(sg.fields, cleaned[sg.key]);
        }
      }
      dataJson[section.name] = cleaned;
    }
    return dataJson;
  };

  // ── Save & Proceed ──

  const handleSaveAndProceed = async (e) => {
    e.preventDefault();
    if (!uhid.trim()) { toast.error('Please enter a UHID'); return; }
    if (!selectedProviderId) { toast.error('Please select a service provider'); return; }

    setSaving(true);
    try {
      const payload = buildPayload();

      if (submitResult?.form_data_id) {
        // Update existing form
        await formDataService.update(submitResult.form_data_id, { data_json: payload });
        toast.success('Form updated successfully');
      } else {
        // Create new form
        const res = await formDataService.submit({
          uhid: uhid.trim(),
          policy_provider_id: selectedProviderId,
          data_json: payload,
        });
        setSubmitResult(res.data);
        toast.success(`Form saved — Claim Case #${res.data.claim_case_id}`);

        // On /pre-auth, navigate to claim detail page
        if (!routeClaimCaseId) {
          navigate(`/claim-list/${res.data.claim_case_id}`);
          return;
        }
      }

      setCompletedSteps((prev) => prev.includes('form') ? prev : [...prev, 'form']);
      setCurrentStep('apply');
    } catch {
      // handled
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => window.print();

  const isDraft = !submitResult || submitResult.status === 'DRAFT';

  const handleStepClick = (stepKey) => {
    // Allow clicking email-type steps and QUERY_RESPONSE always; form/apply/status only when draft
    const isEmailStep = emailTypeSteps.some((s) => s.key === stepKey) || stepKey === 'QUERY_RESPONSE';
    if (!isEmailStep && !isDraft) return;
    setCurrentStep(stepKey);
  };

  const handleSendSuccess = (result) => {
    setEmailResult(result);
    setCompletedSteps((prev) => [...prev, 'apply']);
    setCurrentStep('status');
  };

  const handleReapplySuccess = (result) => {
    setEmailResult(result);
    setShowReapply(false);
  };

  const handleReplyClick = () => {
    setShowQueryResponse(true);
    setCompletedSteps((prev) => prev.includes('QUERY_RESPONSE') ? prev : [...prev, 'QUERY_RESPONSE']);
    setCurrentStep('QUERY_RESPONSE');
  };

  const handleQueryResponseSuccess = async (result) => {
    setEmailResult(result);
    // Refresh emails to include the newly sent reply
    const claimCaseId = submitResult?.claim_case_id;
    if (claimCaseId) {
      try {
        const emailsRes = await claimCaseService.getAllEmails(claimCaseId);
        const emailsList = Array.isArray(emailsRes.data) ? emailsRes.data : [];
        setClaimEmails(emailsList);
        setShowQueryResponse(false);
        // Navigate to the latest email type step
        const latestType = emailsList.map((e) => e.email_type).filter((t) => t && t !== 'APPLIED').pop();
        if (latestType) setCurrentStep(latestType);
      } catch {
        // handled
      }
    }
  };

  // ── Render helpers ──

  const renderFields = (fields, sectionName, subgroupKey) =>
    fields.filter((f) => shouldShow(f, sectionName)).map((field) => (
      <div key={field.key} className={`form-group ${field.type === 'textarea' ? 'form-group--wide' : ''}`}>
        <label>{field.label}</label>
        <FieldInput
          field={field}
          value={getValue(sectionName, field.key, subgroupKey)}
          onChange={(key, val) => setValue(sectionName, key, val, subgroupKey)}
        />
      </div>
    ));

  const renderSubgroups = (subgroups, sectionName) =>
    (subgroups || []).map((sg) => (
      <div key={sg.key} className="preauth-subgroup">
        <h4 className="preauth-subgroup__title">{sg.label}</h4>
        <div className="preauth-section__fields">
          {renderFields(sg.fields, sectionName, sg.key)}
        </div>
      </div>
    ));

  return (
    <div>
      {routeClaimCaseId && (
        <button className="gv-page__back" onClick={() => navigate('/claim-list')}>
          <IconArrowLeft size={18} />
          <span>Back to Claim List</span>
        </button>
      )}
      <div className="page-header">
        <h1>{routeClaimCaseId ? 'Claim Detail' : 'Pre Auth Form'}</h1>
        <p>{routeClaimCaseId ? `Claim Case #${routeClaimCaseId}` : 'Fill and submit insurance pre-authorization form'}</p>
      </div>

      {routeClaimCaseId && (
        <StepTracker steps={steps} currentStep={currentStep} completedSteps={completedSteps} onStepClick={handleStepClick} />
      )}

      {loadingCase && (
        <div className="page-loading"><Spinner /></div>
      )}

      {/* ─── STEP 1: Form ─── */}
      {currentStep === 'form' && (
        <>
          <div className="preauth-lookup">
            <div className="preauth-lookup__form">
              <div className="form-group">
                <label>Service Provider</label>
                {loadingProviders ? (
                  <div className="workflow__select-loading">
                    <Spinner size={16} />
                    <span>Loading providers...</span>
                  </div>
                ) : providers.length === 0 ? (
                  <div className="workflow__select-empty">No providers configured</div>
                ) : (
                  <select
                    value={selectedProviderId}
                    onChange={(e) => setSelectedProviderId(e.target.value)}
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="form-group">
                <label>Patient UHID</label>
                <input
                  type="text"
                  placeholder="e.g. UH001"
                  value={uhid}
                  onChange={(e) => setUhid(e.target.value)}
                />
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveAndProceed} className="preauth-form">
            {FORM_SECTIONS.map((section, idx) => (
              <div key={section.name} className="preauth-section">
                <h3 className="preauth-section__title">
                  <span className="preauth-section__number">{idx + 1}</span>
                  {section.label}
                </h3>
                <div className="preauth-section__fields">
                  {renderFields(section.fields, section.name)}
                </div>
                {renderSubgroups(section.subgroups, section.name)}
                {section.fieldsAfterSubgroups && (
                  <div className="preauth-section__fields preauth-section__fields--after">
                    {renderFields(section.fieldsAfterSubgroups, section.name)}
                  </div>
                )}
                {renderSubgroups(section.additionalSubgroups, section.name)}
              </div>
            ))}

            <div className="preauth-form__actions">
              <button type="button" className="btn btn--ghost" onClick={handlePrint}>
                Print Form
              </button>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? <Spinner size={18} /> : 'Save & Proceed'}
              </button>
            </div>
          </form>
        </>
      )}

      {/* ─── STEP 2: Apply ─── */}
      {currentStep === 'apply' && submitResult && (
        appliedEmails.length > 0 ? (
          <EmailStepView
            emails={appliedEmails}
            claimCaseId={submitResult.claim_case_id}
          />
        ) : (
          <ApplyStep submitResult={submitResult} onSendSuccess={handleSendSuccess} />
        )
      )}

      {/* ─── STEP 3: Status (fallback when no emails) ─── */}
      {currentStep === 'status' && submitResult && (
        <>
          <StatusStep submitResult={submitResult} emailResult={emailResult} onReapply={() => setShowReapply(true)} />
          {showReapply && (
            <ApplyStep submitResult={submitResult} onSendSuccess={handleReapplySuccess} />
          )}
        </>
      )}

      {/* ─── Dynamic email-type steps ─── */}
      {emailTypeSteps.some((s) => s.key === currentStep) && (
        <EmailStepView
          emails={claimEmails.filter((e) => e.email_type === currentStep)}
          claimCaseId={submitResult?.claim_case_id}
          onReplyClick={handleReplyClick}
        />
      )}

      {/* ─── QUERY_RESPONSE step ─── */}
      {currentStep === 'QUERY_RESPONSE' && submitResult && (
        <ApplyStep submitResult={submitResult} onSendSuccess={handleQueryResponseSuccess} useQueryEndpoint />
      )}
    </div>
  );
}
