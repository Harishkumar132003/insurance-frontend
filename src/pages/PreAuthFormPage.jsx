import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { formDataService, claimCaseService, policyProviderService, documentService, formTemplateService } from '../services/api';
import { IconArrowLeft } from '../components/icons/Icons';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';
import './Pages.scss';

// ── Static form schema ──────────────────────────────────────────────

// Common surgeries with their ICD-10-PCS codes. The pair is bidirectionally
// linked in the form — picking a surgery_name autofills surgery_icd_code,
// and vice versa (see setValue's cross-field sync).
export const SURGERY_OPTIONS = [
  { surgery_name: 'Appendectomy',                          icd_10_pcs_code: '0DTJ0ZZ' },
  { surgery_name: 'Coronary Artery Bypass Graft (CABG)',   icd_10_pcs_code: '02100Z9' },
  { surgery_name: 'Knee Replacement',                      icd_10_pcs_code: '0SRC0J9' },
  { surgery_name: 'Hip Replacement',                       icd_10_pcs_code: '0SR90J9' },
  { surgery_name: 'Cesarean Section',                      icd_10_pcs_code: '10D00Z1' },
  { surgery_name: 'Cholecystectomy',                       icd_10_pcs_code: '0FT40ZZ' },
  { surgery_name: 'Hysterectomy',                          icd_10_pcs_code: '0UT90ZZ' },
  { surgery_name: 'Mastectomy',                            icd_10_pcs_code: '0HTT0ZZ' },
  { surgery_name: 'Tonsillectomy',                         icd_10_pcs_code: '0CTPXZZ' },
  { surgery_name: 'Cataract Surgery',                      icd_10_pcs_code: '08RJ3JZ' },
];

const SURGERY_NAME_OPTIONS = SURGERY_OPTIONS.map((s) => ({
  value: s.surgery_name,
  label: s.surgery_name,
}));
const SURGERY_ICD_OPTIONS = SURGERY_OPTIONS.map((s) => ({
  value: s.icd_10_pcs_code,
  label: `${s.icd_10_pcs_code} — ${s.surgery_name}`,
}));

export const FORM_SECTIONS = [
  // {
  //   name: 'tpa_insurer_hospital',
  //   label: 'TPA / Insurer / Hospital Details',
  //   fields: [
  //     { key: 'tpa_name', label: 'TPA Name', type: 'text' },
  //     { key: 'tpa_toll_free_phone', label: 'TPA Toll Free Phone', type: 'text' },
  //     { key: 'tpa_toll_free_fax', label: 'TPA Toll Free Fax', type: 'text' },
  //     { key: 'hospital_name', label: 'Hospital Name', type: 'text' },
  //     { key: 'hospital_address', label: 'Hospital Address', type: 'text' },
  //     { key: 'hospital_rohini_id', label: 'Hospital Rohini ID', type: 'text' },
  //     { key: 'hospital_email', label: 'Hospital Email', type: 'text' },
  //   ],
  // },
  {
    name: 'patient_insured',
    label: 'Patient / Insured Details',
    fields: [
      { key: 'patient_name', label: 'Patient Name', type: 'text' },
      { key: 'gender', label: 'Gender', type: 'radio', options: ['Male', 'Female', 'Third Gender'] },
      { key: 'age_years', label: 'Age', type: 'number' },
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
      { key: 'surgery_name', label: 'Surgery Name', type: 'select', options: SURGERY_NAME_OPTIONS },
      { key: 'surgery_icd_code', label: 'Surgery ICD Code', type: 'select', options: SURGERY_ICD_OPTIONS },
      { key: 'other_treatment', label: 'Other Treatment', type: 'text' },
      { key: 'injury_cause', label: 'Injury Cause', type: 'text' },
      // Toggle that gates the Accident Details subgroup below.
      { key: 'has_accident', label: 'Was this an accident?', type: 'boolean' },
    ],
    additionalSubgroups: [
      {
        key: 'accident_details',
        label: 'Accident Details',
        // Only render when the sibling has_accident toggle is on.
        showWhen: 'has_accident',
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
        // Only render when the patient's gender is Female (lives in another section).
        showWhen: { section: 'patient_insured', key: 'gender', equals: 'Female' },
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
        fields: (() => {
          const BOOL_OPTIONS = [
            { value: true, label: 'Yes' },
            { value: false, label: 'No' },
          ];
          return [
            { key: 'diabetes', label: 'Diabetes', type: 'radio', options: BOOL_OPTIONS },
            { key: 'heart_disease', label: 'Heart Disease', type: 'radio', options: BOOL_OPTIONS },
            { key: 'hypertension', label: 'Hypertension', type: 'radio', options: BOOL_OPTIONS },
            { key: 'hyperlipidemia', label: 'Hyperlipidemia', type: 'radio', options: BOOL_OPTIONS },
            { key: 'osteoarthritis', label: 'Osteoarthritis', type: 'radio', options: BOOL_OPTIONS },
            { key: 'asthma_copd', label: 'Asthma / COPD', type: 'radio', options: BOOL_OPTIONS },
            { key: 'cancer', label: 'Cancer', type: 'radio', options: BOOL_OPTIONS },
            { key: 'alcohol_drug_abuse', label: 'Alcohol / Drug Abuse', type: 'radio', options: BOOL_OPTIONS },
            { key: 'hiv_std', label: 'HIV / STD', type: 'radio', options: BOOL_OPTIONS },
            { key: 'other', label: 'Other', type: 'text' },
          ];
        })(),
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
          { key: 'total_cost', label: 'Total Cost', type: 'number', readOnly: true },
        ],
      },
    ],
  },
  // {
  //   name: 'declaration',
  //   label: 'Declaration',
  //   fields: [
  //     { key: 'doctor_name', label: 'Doctor Name', type: 'text' },
  //     { key: 'doctor_qualification', label: 'Doctor Qualification', type: 'text' },
  //     { key: 'doctor_registration_number', label: 'Doctor Registration Number', type: 'text' },
  //     { key: 'hospital_seal', label: 'Hospital Seal', type: 'file' },
  //     { key: 'patient_signature', label: 'Patient Signature', type: 'file' },
  //   ],
  // },
  // {
  //   name: 'patient_declaration',
  //   label: 'Patient Declaration',
  //   fields: [
  //     { key: 'patient_name', label: 'Patient Name', type: 'text' },
  //     { key: 'contact_number', label: 'Contact Number', type: 'text' },
  //     { key: 'email', label: 'Email', type: 'text' },
  //     { key: 'signature', label: 'Signature', type: 'file' },
  //     { key: 'date', label: 'Date', type: 'date' },
  //     { key: 'time', label: 'Time', type: 'time' },
  //   ],
  // },
  // {
  //   name: 'cashless_authorization',
  //   label: 'Cashless Authorization (Part D)',
  //   fields: [
  //     { key: 'claim_number', label: 'Claim Number', type: 'text' },
  //     { key: 'authorization_valid_till', label: 'Authorization Valid Till', type: 'date' },
  //     { key: 'insurance_company', label: 'Insurance Company', type: 'text' },
  //     { key: 'tpa_name', label: 'TPA Name', type: 'text' },
  //     { key: 'proposer_name', label: 'Proposer Name', type: 'text' },
  //     { key: 'patient_member_id', label: 'Patient Member ID', type: 'text' },
  //     { key: 'relation_with_proposer', label: 'Relation with Proposer', type: 'text' },
  //   ],
  //   subgroups: [
  //     {
  //       key: 'patient_details',
  //       label: 'Patient Details',
  //       fields: [
  //         { key: 'name', label: 'Name', type: 'text' },
  //         { key: 'age', label: 'Age', type: 'number' },
  //         { key: 'gender', label: 'Gender', type: 'text' },
  //       ],
  //     },
  //     {
  //       key: 'policy_details',
  //       label: 'Policy Details',
  //       fields: [
  //         { key: 'policy_number', label: 'Policy Number', type: 'text' },
  //         { key: 'policy_period', label: 'Policy Period', type: 'text' },
  //         { key: 'admission_date', label: 'Admission Date', type: 'date' },
  //         { key: 'discharge_date', label: 'Discharge Date', type: 'date' },
  //       ],
  //     },
  //   ],
  //   fieldsAfterSubgroups: [
  //     { key: 'room_category', label: 'Room Category', type: 'text' },
  //     { key: 'estimated_stay', label: 'Estimated Stay (Days)', type: 'number' },
  //     { key: 'diagnosis', label: 'Diagnosis', type: 'text' },
  //     { key: 'treatment', label: 'Treatment', type: 'text' },
  //     { key: 'authorization_amount', label: 'Authorization Amount', type: 'number' },
  //     { key: 'remarks', label: 'Remarks', type: 'textarea' },
  //   ],
  // },
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

  if (type === 'select') {
    // Detect legacy boolean Yes/No selects (options carry boolean values) vs
    // plain string selects so booleans round-trip correctly while string
    // options can also be used (e.g. surgery list).
    const isBoolOptions = (options || []).some(
      (opt) => opt && typeof opt === 'object' && typeof opt.value === 'boolean',
    );
    if (isBoolOptions) {
      const selected = value === true ? 'true' : value === false ? 'false' : '';
      return (
        <select
          value={selected}
          onChange={(e) => {
            const v = e.target.value;
            onChange(key, v === 'true' ? true : v === 'false' ? false : null);
          }}
        >
          <option value="">Select…</option>
          {(options || []).map((opt) => (
            <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
          ))}
        </select>
      );
    }
    const currentValue = value == null ? '' : String(value);
    // If the saved value isn't in the options (e.g. a draft saved when this
    // field was a free-text input), preserve it as a stand-in option so the
    // user doesn't silently lose their data.
    const optionValues = (options || []).map((opt) =>
      String(typeof opt === 'object' ? opt.value : opt),
    );
    const showCustomOption = currentValue && !optionValues.includes(currentValue);
    return (
      <select
        value={currentValue}
        onChange={(e) => onChange(key, e.target.value || '')}
      >
        <option value="">Select…</option>
        {(options || []).map((opt) => {
          const optValue = typeof opt === 'object' ? opt.value : opt;
          const optLabel = typeof opt === 'object' ? opt.label : opt;
          return (
            <option key={String(optValue)} value={String(optValue)}>{optLabel}</option>
          );
        })}
        {showCustomOption && (
          <option value={currentValue}>{currentValue} (custom)</option>
        )}
      </select>
    );
  }

  if (type === 'radio') {
    // Support both string options and { value, label } object options.
    // Object options are coerced to strings for the input element and
    // converted back on change so booleans (true/false) round-trip correctly.
    const isObjectOption = (opt) => opt !== null && typeof opt === 'object';
    return (
      <div className="preauth-radio-group">
        {(options || []).map((opt) => {
          const optValue = isObjectOption(opt) ? opt.value : opt;
          const optLabel = isObjectOption(opt) ? opt.label : opt;
          const optKey = String(optValue);
          return (
            <label key={optKey} className="preauth-radio">
              <input
                type="radio"
                name={key}
                value={optKey}
                checked={value === optValue}
                onChange={() => onChange(key, optValue)}
              />
              <span>{optLabel}</span>
            </label>
          );
        })}
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
      value={value === 0 ? 0 : (value || '')}
      readOnly={!!field.readOnly}
      onChange={(e) => onChange(key, e.target.value)}
    />
  );
}

// ── Main component ──────────────────────────────────────────────────

export default function PreAuthFormPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { claimCaseId: routeClaimCaseId } = useParams();

  const [uhid, setUhid] = useState('');
  const [providers, setProviders] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({});
  const [customFields, setCustomFields] = useState([]);
  const [loadingCase, setLoadingCase] = useState(false);
  const [formDataId, setFormDataId] = useState(null);
  const [files, setFiles] = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [modalFiles, setModalFiles] = useState([]);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [existingDocs, setExistingDocs] = useState([]);
  const [docViewUrl, setDocViewUrl] = useState(null);
  const [docViewName, setDocViewName] = useState('');
  const [docViewType, setDocViewType] = useState('');

  const aiAppliedRef = useRef(false);

  // Accordion state — only first section open by default
  const [openSections, setOpenSections] = useState(() => {
    const initial = {};
    FORM_SECTIONS.forEach((s, i) => { initial[s.name] = i === 0; });
    initial['documents'] = false;
    return initial;
  });

  const toggleSection = (name) => {
    setOpenSections((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const isEdit = !!routeClaimCaseId;
  const fromPath = location.state?.from;
  const backPath = fromPath || (isEdit ? `/claim-list/${routeClaimCaseId}` : '/pre-auth');
  const backLabel = backPath === '/pre-auth/ai'
    ? 'Back to AI Fill'
    : backPath === '/pre-auth'
      ? 'Back to Options'
      : backPath === '/query-management'
        ? 'Back to Query Management'
        : isEdit
          ? 'Back to Claim Detail'
          : 'Back';

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const res = await policyProviderService.getAll();
        const list = Array.isArray(res.data) ? res.data : [];
        setProviders(list);
        // Don't set default provider if AI data will handle it
        if (!location.state?.aiData && list.length > 0) {
          setSelectedProviderId(list[0].id);
        }
      } catch {
        setProviders([]);
      } finally {
        setLoadingProviders(false);
      }
    };
    fetchProviders();
  }, []);

  // Auto-fill TPA fields when provider changes
  useEffect(() => {
    if (!selectedProviderId || providers.length === 0) return;
    const provider = providers.find((p) => p.id === selectedProviderId);
    if (!provider) return;

    let hospital = {};
    try { hospital = JSON.parse(localStorage.getItem('hospital')) || {}; } catch { /* ignore */ }

    setFormData((prev) => {
      const existing = prev.tpa_insurer_hospital || {};
      return {
        ...prev,
        tpa_insurer_hospital: {
          ...existing,
          tpa_name: existing.tpa_name || provider.tpa_name || '',
          tpa_toll_free_phone: existing.tpa_toll_free_phone || provider.tpa_toll_free_phone || '',
          tpa_toll_free_fax: existing.tpa_toll_free_fax || provider.tpa_toll_free_fax || '',
          hospital_name: existing.hospital_name || hospital.name || '',
          hospital_address: existing.hospital_address || hospital.address || '',
          hospital_rohini_id: existing.hospital_rohini_id || hospital.rohini_id || '',
          hospital_email: existing.hospital_email || hospital.email || '',
        },
      };
    });
  }, [selectedProviderId, providers]);

  // Load claim case for editing
  useEffect(() => {
    if (!routeClaimCaseId) return;
    // Skip the round-trip when we just saved a draft and switched the URL via
    // navigate(replace) — formDataId is already set and form state is current.
    if (formDataId) return;

    const loadClaimCase = async () => {
      setLoadingCase(true);
      try {
        const res = await claimCaseService.getById(routeClaimCaseId);
        const cc = res.data;

        setUhid(cc.uhid || '');
        if (cc.policy_provider_id) setSelectedProviderId(cc.policy_provider_id);

        const latestForm = Array.isArray(cc.form_data) && cc.form_data.length > 0
          ? cc.form_data[cc.form_data.length - 1]
          : null;

        if (latestForm?.data_json) {
          setFormData(latestForm.data_json);
        }
        if (latestForm?.id) {
          setFormDataId(latestForm.id);
        }

        // Fetch existing documents
        try {
          const docsRes = await documentService.list(routeClaimCaseId);
          setExistingDocs(Array.isArray(docsRes.data) ? docsRes.data : []);
        } catch {
          // no documents
        }
      } catch {
        // handled by interceptor
      } finally {
        setLoadingCase(false);
      }
    };
    loadClaimCase();
    // formDataId is read inside but intentionally omitted: we only want to
    // load when the route changes, not when a draft save populates formDataId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeClaimCaseId]);

  // Pre-fill from AI data passed via navigation state
  // Waits for providers to load so we can match provider ID and avoid race conditions
  useEffect(() => {
    if (routeClaimCaseId || aiAppliedRef.current) return;
    if (providers.length === 0) return; // wait for providers to load

    // Provider / UHID carry over from the AI page even when no full
    // extracted data was returned — apply them first.
    if (location.state?.aiUhid) setUhid(location.state.aiUhid);
    const aiPid = location.state?.aiProviderId;
    let providerSetViaAi = false;
    if (aiPid) {
      // Tolerant match: case-insensitive + trimmed, against id, provider_id,
      // and name (so the AI returning a human-readable name still works).
      const norm = (v) => String(v ?? '').toLowerCase().trim();
      const aiKey = norm(aiPid);
      const match = providers.find((p) =>
        norm(p.id) === aiKey
        || norm(p.provider_id) === aiKey
        || norm(p.name) === aiKey
      );
      if (match) {
        setSelectedProviderId(match.id);
        providerSetViaAi = true;
      }
    }

    const aiData = location.state?.aiData;
    if (!aiData || typeof aiData !== 'object' || Object.keys(aiData).length === 0) return;
    aiAppliedRef.current = true;

    // Only fall back to the first provider if the AI didn't already pick one.
    // Reading `selectedProviderId` here is unsafe — its state update from the
    // match above is queued, not yet visible — so use the local flag instead.
    if (!providerSetViaAi && !selectedProviderId && providers.length > 0) {
      setSelectedProviderId(providers[0].id);
    }

    // Build a lookup: field key → { section name, field type }
    // Keep first match only (primary section) since some keys like patient_name appear in multiple sections
    // Build a lookup: field key → { section, type, subgroup? }
    const keyToSection = {};
    for (const section of FORM_SECTIONS) {
      for (const f of section.fields) {
        if (!keyToSection[f.key]) keyToSection[f.key] = { section: section.name, type: f.type };
      }
      for (const sg of [...(section.subgroups || []), ...(section.additionalSubgroups || [])]) {
        for (const f of sg.fields) {
          if (!keyToSection[f.key]) keyToSection[f.key] = { section: section.name, type: f.type, subgroup: sg.key };
        }
      }
      for (const f of (section.fieldsAfterSubgroups || [])) {
        if (!keyToSection[f.key]) keyToSection[f.key] = { section: section.name, type: f.type };
      }
    }

    const SKIP_KEYS = new Set(['token', 'baseurl', 'clientId', 'provider_id', 'uhid', 'summary']);
    const prefilled = {};
    const custom = [];
    for (const [key, rawValue] of Object.entries(aiData)) {
      if (rawValue === null || rawValue === undefined || rawValue === '' || SKIP_KEYS.has(key)) continue;
      const mapping = keyToSection[key];

      let value = rawValue;
      if (typeof value === 'string') value = value.trim();
      // Convert date strings to YYYY-MM-DD for date inputs
      if (mapping?.type === 'date' && typeof value === 'string') {
        if (value.includes('T')) {
          value = value.split('T')[0];
        } else if (/^\d{2}-\d{2}-\d{4}/.test(value)) {
          const [dd, mm, yyyy] = value.split(/[-\s]/);
          value = `${yyyy}-${mm}-${dd}`;
        }
      }

      if (!mapping) {
        custom.push({ key, value: String(value) });
        continue;
      }

      prefilled[mapping.section] = prefilled[mapping.section] || {};
      if (mapping.subgroup) {
        prefilled[mapping.section][mapping.subgroup] = prefilled[mapping.section][mapping.subgroup] || {};
        prefilled[mapping.section][mapping.subgroup][key] = value;
      } else {
        prefilled[mapping.section][key] = value;
      }
    }

    if (custom.length > 0) setCustomFields(custom);

    if (Object.keys(prefilled).length > 0) {
      setFormData((prev) => {
        const merged = { ...prev };
        for (const [section, fields] of Object.entries(prefilled)) {
          merged[section] = { ...(merged[section] || {}), ...fields };
        }
        return merged;
      });
      setOpenSections((prev) => {
        const updated = { ...prev };
        for (const sectionName of Object.keys(prefilled)) {
          updated[sectionName] = true;
        }
        if (custom.length > 0) updated['custom_fields'] = true;
        return updated;
      });
      toast.success('Form pre-filled with AI data');
    }
  }, [providers]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Form helpers ──

  const getValue = (sectionName, key, subgroupKey) => {
    const section = formData[sectionName] || {};
    if (subgroupKey) return (section[subgroupKey] || {})[key] ?? '';
    return section[key] ?? '';
  };

  // Cost-estimate fields whose sum drives total_cost. Editing any of these
  // recomputes total_cost so the user can't fall out of sync with the line items.
  const COST_LINE_KEYS = [
    'room_rent',
    'investigation_cost',
    'icu_charges',
    'ot_charges',
    'professional_fees',
    'medicines_cost',
    'other_expenses',
    'package_charges',
  ];

  const setValue = (sectionName, key, value, subgroupKey) => {
    setFormData((prev) => {
      const section = { ...(prev[sectionName] || {}) };
      if (subgroupKey) {
        const subgroup = { ...(section[subgroupKey] || {}), [key]: value };
        // Recompute total_cost whenever a line-item cost changes.
        if (subgroupKey === 'costs' && COST_LINE_KEYS.includes(key)) {
          const sum = COST_LINE_KEYS.reduce((acc, k) => acc + (Number(subgroup[k]) || 0), 0);
          subgroup.total_cost = sum;
        }
        section[subgroupKey] = subgroup;
      } else {
        section[key] = value;
        // Two-way link: surgery_name ↔ surgery_icd_code in treating_doctor.
        if (sectionName === 'treating_doctor') {
          if (key === 'surgery_name' && value) {
            const match = SURGERY_OPTIONS.find((s) => s.surgery_name === value);
            if (match) section.surgery_icd_code = match.icd_10_pcs_code;
          } else if (key === 'surgery_icd_code' && value) {
            const match = SURGERY_OPTIONS.find((s) => s.icd_10_pcs_code === value);
            if (match) section.surgery_name = match.surgery_name;
          }
        }
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

  // ── Save handlers (Save as Draft / Save & Proceed) ──
  // Both call the same endpoints; "Save as Draft" stays on the form so the
  // user can keep editing, while "Save & Proceed" navigates to the claim
  // detail page where the email composer lives.

  const saveForm = async ({ asDraft }) => {
    if (!uhid.trim()) { toast.error('Please enter a UHID'); return; }
    if (!selectedProviderId) { toast.error('Please select a service provider'); return; }

    setSaving(true);
    try {
      const payload = buildPayload();

      if (formDataId) {
        // Edit mode — same PATCH for both buttons
        await formDataService.update(formDataId, { data_json: payload });
        if (files.length > 0) {
          const fd = new FormData();
          files.forEach((file) => fd.append('files', file));
          await documentService.upload(routeClaimCaseId, fd);
          setFiles([]);
        }
        toast.success(asDraft ? 'Draft saved' : 'Form updated successfully');
        if (!asDraft) navigate(`/claim-list/${routeClaimCaseId}`);
      } else {
        // Create mode
        const fd = new FormData();
        fd.append('uhid', uhid.trim());
        fd.append('policy_provider_id', selectedProviderId);
        fd.append('data_json', JSON.stringify(payload));
        files.forEach((file) => fd.append('files', file));

        const res = await formDataService.submit(fd);
        const newClaimId = res.data.claim_case_id;
        const newFormId = res.data.form_data_id;

        if (asDraft) {
          // Stay on the form — switch local state to edit mode so subsequent
          // clicks PATCH the same record instead of creating duplicates.
          setFormDataId(newFormId);
          setFiles([]);
          // Update URL so refresh keeps the user on the same draft. `replace`
          // avoids a back-history entry. The loader effect is gated against
          // re-fetching when formDataId is already set.
          navigate(`/pre-auth/${newClaimId}`, { replace: true });
          toast.success('Draft saved');
        } else {
          toast.success(`Form saved — Claim Case #${newClaimId}`);
          navigate(`/claim-list/${newClaimId}`);
        }
      }
    } catch {
      // handled
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndProceed = (e) => { e.preventDefault(); saveForm({ asDraft: false }); };
  const handleSaveAsDraft = (e) => { e.preventDefault(); saveForm({ asDraft: true }); };

  const [printing, setPrinting] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateList, setTemplateList] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [previewHtml, setPreviewHtml] = useState(null);
  const [previewName, setPreviewName] = useState('');

  const handlePrint = async () => {
    setShowTemplateModal(true);
    setLoadingTemplates(true);
    try {
      const res = await formTemplateService.getAll();
      setTemplateList(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error('Failed to load templates');
      setShowTemplateModal(false);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const getFlatFormData = () => {
    const flat = {};
    for (const [, sectionData] of Object.entries(formData)) {
      for (const [key, val] of Object.entries(sectionData || {})) {
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          for (const [subKey, subVal] of Object.entries(val)) {
            flat[subKey] = subVal;
          }
        } else {
          flat[key] = val;
        }
      }
    }
    const declSection = formData.declaration || {};
    if (declSection.doctor_name) flat.decl_doctor_name = declSection.doctor_name;
    const pdSection = formData.patient_declaration || {};
    if (pdSection.patient_name) flat.pd_patient_name = pdSection.patient_name;
    if (pdSection.contact_number) flat.pd_contact_number = pdSection.contact_number;
    if (pdSection.email) flat.pd_email = pdSection.email;
    if (pdSection.date) flat.pd_date = pdSection.date;
    if (pdSection.time) flat.pd_time = pdSection.time;
    for (const cf of customFields) {
      if (cf.key && cf.value) flat[cf.key] = cf.value;
    }
    return flat;
  };

  const populateAndPrint = (htmlContent) => {
    const flat = getFlatFormData();
    let iframe = document.getElementById('print-frame');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'print-frame';
      iframe.style.cssText = 'position:fixed;width:0;height:0;border:none;left:-9999px;';
      document.body.appendChild(iframe);
    }
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(htmlContent);
    iframeDoc.close();
    // The "Save as PDF" filename comes from the document title. Browsers
    // diverge on which title they use — Chrome on Linux/Windows uses the
    // PARENT page's title, others use the iframe's. Set both, restoring
    // the parent's afterwards.
    const printTitle = routeClaimCaseId || 'pre-auth-form';
    const originalParentTitle = document.title;
    iframeDoc.title = printTitle;
    document.title = printTitle;
    iframe.onload = () => {
      iframeDoc.querySelectorAll('[data-field]').forEach((el) => {
        const field = el.getAttribute('data-field');
        const value = flat[field];
        if (value === undefined || value === null || value === '') return;
        if (el.type === 'radio') {
          if (el.value === String(value)) el.checked = true;
        } else if (el.type === 'checkbox') {
          el.checked = !!value;
        } else {
          el.value = value;
        }
      });
      iframe.contentWindow.print();
      setTimeout(() => { document.title = originalParentTitle; }, 1000);
    };
  };

  const handleSelectTemplate = async (tpl) => {
    setPrinting(true);
    try {
      const res = await formTemplateService.getById(tpl.id);
      const htmlContent = res.data?.html_content;
      if (!htmlContent) {
        toast.error('Template has no content');
        return;
      }
      setShowTemplateModal(false);
      populateAndPrint(htmlContent);
    } catch {
      toast.error('Failed to load template');
    } finally {
      setPrinting(false);
    }
  };

  const handlePreviewTemplate = async (tpl) => {
    try {
      const res = await formTemplateService.getById(tpl.id);
      const htmlContent = res.data?.html_content;
      if (!htmlContent) {
        toast.error('Template has no content');
        return;
      }
      setPreviewHtml(htmlContent);
      setPreviewName(tpl.name || `Template #${tpl.id}`);
    } catch {
      toast.error('Failed to load template');
    }
  };

  const handleModalUpload = async () => {
    if (modalFiles.length === 0) return;

    if (isEdit) {
      // Edit mode: upload immediately via documents API
      setUploadingDocs(true);
      try {
        const fd = new FormData();
        modalFiles.forEach((file) => fd.append('files', file));
        await documentService.upload(routeClaimCaseId, fd);
        const docsRes = await documentService.list(routeClaimCaseId);
        setExistingDocs(Array.isArray(docsRes.data) ? docsRes.data : []);
        toast.success('Documents uploaded');
      } catch {
        // handled
      } finally {
        setUploadingDocs(false);
      }
    } else {
      // New mode: collect files to send with form submit
      setFiles((prev) => [...prev, ...modalFiles]);
    }
    setModalFiles([]);
    setShowUploadModal(false);
  };

  const handleDeleteDoc = async (docId) => {
    try {
      await documentService.delete(routeClaimCaseId, docId);
      setExistingDocs((prev) => prev.filter((d) => d.id !== docId));
      toast.success('Document removed');
    } catch {
      // handled
    }
  };

  const handleViewDoc = async (doc) => {
    try {
      const res = await documentService.view(routeClaimCaseId, doc.id);
      const contentType = res.headers?.['content-type'] || doc.content_type || '';
      const url = window.URL.createObjectURL(new Blob([res.data], { type: contentType }));
      setDocViewUrl(url);
      setDocViewName(doc.original_filename);
      setDocViewType(contentType);
    } catch {
      // handled
    }
  };

  const handleViewLocalFile = (file) => {
    const extMap = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
      webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
      pdf: 'application/pdf',
    };
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const contentType = file.type || extMap[ext] || '';
    const url = window.URL.createObjectURL(file);
    setDocViewUrl(url);
    setDocViewName(file.name);
    setDocViewType(contentType);
  };

  const closeDocView = () => {
    if (docViewUrl) window.URL.revokeObjectURL(docViewUrl);
    setDocViewUrl(null);
    setDocViewName('');
    setDocViewType('');
  };

  // ── Render helpers ──

  const policyChronicConditions = location.state?.policyChronicConditions || null;
  const policyCostEstimates = location.state?.policyCostEstimates || null;

  const getPolicySuggestion = (subgroupKey, fieldKey) => {
    if (subgroupKey === 'chronic_conditions' && policyChronicConditions) {
      return policyChronicConditions[fieldKey];
    }
    if (subgroupKey === 'costs' && policyCostEstimates) {
      return policyCostEstimates[fieldKey];
    }
    return undefined;
  };

  const renderFields = (fields, sectionName, subgroupKey) =>
    fields.filter((f) => shouldShow(f, sectionName)).map((field) => {
      const suggestion = getPolicySuggestion(subgroupKey, field.key);
      const fieldValue = getValue(sectionName, field.key, subgroupKey);
      // Chronic-conditions: only show the suggestion when the user has
      // selected "Yes" for that specific condition. No fallback — if they
      // select No, hide the policy hint even if the policy returned text.
      // Other subgroups (costs, etc.) keep the always-on string suggestion.
      let showSuggestion = false;
      let suggestionText = suggestion;
      if (subgroupKey === 'chronic_conditions') {
        showSuggestion = fieldValue === true;
        suggestionText = (typeof suggestion === 'string' && suggestion.trim())
          ? suggestion
          : 'Suggested by policy';
      } else {
        showSuggestion = typeof suggestion === 'string' && suggestion.trim().length > 0;
      }
      return (
        <div key={field.key} className={`form-group ${field.type === 'textarea' ? 'form-group--wide' : ''}`}>
          <label>{field.label}</label>
          <FieldInput
            field={field}
            value={fieldValue}
            onChange={(key, val) => setValue(sectionName, key, val, subgroupKey)}
          />
          {showSuggestion && (
            <small className="policy-suggestion">{suggestionText}</small>
          )}
        </div>
      );
    });

  // Subgroup-level visibility: `showWhen` may be either a string (refers to a
  // sibling field in the same section, truthy check) or an object
  // `{ section, key, equals }` for cross-section conditions.
  const shouldShowSubgroup = (sg, sectionName) => {
    if (!sg.showWhen) return true;
    if (typeof sg.showWhen === 'string') {
      return !!getValue(sectionName, sg.showWhen);
    }
    if (typeof sg.showWhen === 'object') {
      const { section, key, equals } = sg.showWhen;
      const v = getValue(section || sectionName, key);
      return equals === undefined ? !!v : v === equals;
    }
    return true;
  };

  const renderSubgroups = (subgroups, sectionName) =>
    (subgroups || [])
      .filter((sg) => shouldShowSubgroup(sg, sectionName))
      .map((sg) => (
        <div key={sg.key} className="preauth-subgroup">
          <h4 className="preauth-subgroup__title">{sg.label}</h4>
          <div className="preauth-section__fields">
            {renderFields(sg.fields, sectionName, sg.key)}
          </div>
        </div>
      ));

  return (
    <div>
      <button className="gv-page__back" onClick={() => navigate(backPath)}>
        <IconArrowLeft size={18} />
        <span>{backLabel}</span>
      </button>
      <div className="page-header">
        <h1>{isEdit ? 'Edit Pre Auth Form' : 'Pre Auth Form'}</h1>
        <p>{isEdit ? `Editing Claim Case #${routeClaimCaseId}` : 'Fill and submit insurance pre-authorization form'}</p>
      </div>

      {loadingCase ? (
        <div className="page-loading"><Spinner /></div>
      ) : (
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
              <div key={section.name} className={`preauth-section ${openSections[section.name] ? '' : 'preauth-section--collapsed'}`}>
                <h3 className="preauth-section__title" onClick={() => toggleSection(section.name)}>
                  <span className="preauth-section__number">{idx + 1}</span>
                  {section.label}
                  <span className={`preauth-section__chevron ${openSections[section.name] ? 'preauth-section__chevron--open' : ''}`}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                </h3>
                {openSections[section.name] && (
                  <>
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
                  </>
                )}
              </div>
            ))}

            {customFields.length > 0 && (
              <div className={`preauth-section ${openSections['custom_fields'] ? '' : 'preauth-section--collapsed'}`}>
                <h3 className="preauth-section__title" onClick={() => toggleSection('custom_fields')}>
                  <span className="preauth-section__number">{FORM_SECTIONS.length + 1}</span>
                  Additional Details
                  <span className={`preauth-section__chevron ${openSections['custom_fields'] ? 'preauth-section__chevron--open' : ''}`}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                </h3>
                {openSections['custom_fields'] && (
                  <div className="preauth-section__fields">
                    {customFields.map((cf) => (
                      <div key={cf.key} className="form-group">
                        <label>{cf.key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</label>
                        <input
                          type="text"
                          value={cf.value}
                          onChange={(e) => {
                            setCustomFields((prev) =>
                              prev.map((f) => f.key === cf.key ? { ...f, value: e.target.value } : f)
                            );
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className={`preauth-section ${openSections['documents'] ? '' : 'preauth-section--collapsed'}`}>
              <h3 className="preauth-section__title" onClick={() => toggleSection('documents')}>
                <span className="preauth-section__number">{FORM_SECTIONS.length + (customFields.length > 0 ? 2 : 1)}</span>
                Documents
                <span className={`preauth-section__chevron ${openSections['documents'] ? 'preauth-section__chevron--open' : ''}`}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
              </h3>
              {openSections['documents'] && (
                <>
                  <button type="button" className="btn btn--primary" onClick={() => setShowUploadModal(true)}>
                    Upload Documents
                  </button>
                  {isEdit && existingDocs.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      {existingDocs.map((doc) => (
                        <div key={doc.id} className="apply-step__attach-chip" style={{ marginBottom: 6 }}>
                          <span style={{ cursor: 'pointer' }} onClick={() => handleViewDoc(doc)}>
                            {doc.original_filename} ({(doc.file_size / 1024).toFixed(1)} KB)
                          </span>
                          <button type="button" onClick={() => handleDeleteDoc(doc.id)}>&times;</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {files.length > 0 && (
                    <div className="apply-step__attach-area" style={{ marginTop: 12 }}>
                      {files.map((file, idx) => (
                        <div key={idx} className="apply-step__attach-chip">
                          <span style={{ cursor: 'pointer' }} onClick={() => handleViewLocalFile(file)}>{file.name}</span>
                          <button type="button" onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}>&times;</button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="preauth-form__actions">
              <button type="button" className="btn btn--ghost" onClick={handlePrint} disabled={printing}>
                {printing ? <Spinner size={18} /> : 'Print Form'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={handleSaveAsDraft} disabled={saving}>
                {saving ? <Spinner size={18} /> : 'Save as Draft'}
              </button>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? <Spinner size={18} /> : 'Save & Proceed'}
              </button>
            </div>
          </form>
        </>
      )}

      {showUploadModal && (
        <Modal title="Upload Documents" onClose={() => { setShowUploadModal(false); setModalFiles([]); }}>
          <div className="form-group">
            <label>Click to select files</label>
            <input
              type="file"
              multiple
              onChange={(e) => {
                setModalFiles(Array.from(e.target.files));
                e.target.value = '';
              }}
            />
          </div>
          {modalFiles.length > 0 && (
            <div className="apply-step__attach-area" style={{ marginTop: 8, marginBottom: 16 }}>
              {modalFiles.map((file, idx) => (
                <div key={idx} className="apply-step__attach-chip">
                  <span>{file.name}</span>
                  <button type="button" onClick={() => setModalFiles((prev) => prev.filter((_, i) => i !== idx))}>&times;</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn--ghost" onClick={() => { setShowUploadModal(false); setModalFiles([]); }}>
              Cancel
            </button>
            <button className="btn btn--primary" disabled={modalFiles.length === 0 || uploadingDocs} onClick={handleModalUpload}>
              {uploadingDocs ? <Spinner size={16} /> : 'Upload'}
            </button>
          </div>
        </Modal>
      )}

      {docViewUrl && (
        <Modal title={docViewName} onClose={closeDocView} size="lg">
          <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
            {docViewType.startsWith('image/') ? (
              <img src={docViewUrl} alt={docViewName} style={{ maxWidth: '100%', height: 'auto' }} />
            ) : docViewType === 'application/pdf' ? (
              <iframe src={docViewUrl} title={docViewName} style={{ width: '100%', height: '70vh', border: 'none' }} />
            ) : (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <p>Preview not available for this file type.</p>
                <a href={docViewUrl} download={docViewName} className="btn btn--primary" style={{ marginTop: 12 }}>
                  Download
                </a>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Template Picker Modal */}
      {showTemplateModal && (
        <Modal title="Select Print Template" onClose={() => setShowTemplateModal(false)}>
          {loadingTemplates ? (
            <div className="page-loading"><Spinner /></div>
          ) : templateList.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>No templates available.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {templateList.map((tpl) => (
                <div
                  key={tpl.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    background: '#fff',
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{tpl.name || `Template #${tpl.id}`}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => handlePreviewTemplate(tpl)}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      disabled={printing}
                      onClick={() => handleSelectTemplate(tpl)}
                    >
                      {printing ? <Spinner size={14} /> : 'Select & Print'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* Template Preview Modal */}
      {previewHtml && (
        <Modal title={previewName} onClose={() => { setPreviewHtml(null); setPreviewName(''); }} size="lg">
          <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
            <iframe
              srcDoc={previewHtml}
              title={previewName}
              style={{ width: '100%', height: '70vh', border: 'none' }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
