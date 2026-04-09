import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { formDataService, claimCaseService, policyProviderService, documentService } from '../services/api';
import { IconArrowLeft } from '../components/icons/Icons';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';
import './Pages.scss';

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

// ── Main component ──────────────────────────────────────────────────

export default function PreAuthFormPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { claimCaseId: routeClaimCaseId } = useParams();

  const [uhid, setUhid] = useState('');
  const [providers, setProviders] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({});
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

  // Load claim case for editing
  useEffect(() => {
    if (!routeClaimCaseId) return;

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
  }, [routeClaimCaseId]);

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

      if (formDataId) {
        await formDataService.update(formDataId, { data_json: payload });
        // Upload files via documents endpoint for existing claims
        if (files.length > 0) {
          const fd = new FormData();
          files.forEach((file) => fd.append('files', file));
          await documentService.upload(routeClaimCaseId, fd);
        }
        toast.success('Form updated successfully');
        navigate(`/claim-list/${routeClaimCaseId}`);
      } else {
        const fd = new FormData();
        fd.append('uhid', uhid.trim());
        fd.append('policy_provider_id', selectedProviderId);
        fd.append('data_json', JSON.stringify(payload));
        files.forEach((file) => fd.append('files', file));

        const res = await formDataService.submit(fd);
        toast.success(`Form saved — Claim Case #${res.data.claim_case_id}`);
        navigate(`/claim-list/${res.data.claim_case_id}`);
      }
    } catch {
      // handled
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => window.print();

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

  const closeDocView = () => {
    if (docViewUrl) window.URL.revokeObjectURL(docViewUrl);
    setDocViewUrl(null);
    setDocViewName('');
    setDocViewType('');
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
      {isEdit && (
        <button className="gv-page__back" onClick={() => navigate(`/claim-list/${routeClaimCaseId}`)}>
          <IconArrowLeft size={18} />
          <span>Back to Claim Detail</span>
        </button>
      )}
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

            <div className={`preauth-section ${openSections['documents'] ? '' : 'preauth-section--collapsed'}`}>
              <h3 className="preauth-section__title" onClick={() => toggleSection('documents')}>
                <span className="preauth-section__number">{FORM_SECTIONS.length + 1}</span>
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
                          <span>{file.name}</span>
                          <button type="button" onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}>&times;</button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

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
    </div>
  );
}
