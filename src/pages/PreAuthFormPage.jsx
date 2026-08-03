import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { formDataService, claimCaseService, policyProviderService, documentService, formTemplateService, aiAssistantService, workflowService } from '../services/api';
import { IconArrowLeft } from '../components/icons/Icons';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';
import './Pages.scss';

// Fields that make up one repeatable "treatment". Used for legacy migration
// and for deriving flat fields on save.
const TREATMENT_KEYS = [
  'treatment_details', 'drug_route', 'surgery_icd_code', 'injury_cause',
];

const INVESTIGATION_KEYS = [
  'investigation_category', 'investigation_name', 'investigation_description',
];

// Flatten saved sections to {fieldKey: value}, one level into subgroups — enough
// to compare against the case sheet's flat extraction. Repeatable arrays are
// skipped; their rows aren't scored.
function flattenSections(sections) {
  const flat = {};
  for (const section of Object.values(sections || {})) {
    if (!section || typeof section !== 'object') continue;
    for (const [key, val] of Object.entries(section)) {
      if (Array.isArray(val)) continue;
      if (val && typeof val === 'object') {
        for (const [subKey, subVal] of Object.entries(val)) {
          if (subVal !== null && typeof subVal !== 'object') flat[subKey] = subVal;
        }
      } else {
        flat[key] = val;
      }
    }
  }
  return flat;
}

// Keep a field's confidence only while the saved value is still the one the AI
// extracted. Once a reviewer has corrected a figure, a score and a quote
// describing the original read no longer apply to what's on screen.
function liveFieldMeta(fieldMeta, extracted, sections) {
  if (!fieldMeta || typeof fieldMeta !== 'object') return {};
  const flat = flattenSections(sections);
  const same = (a, b) => String(a ?? '') === String(b ?? '');
  const out = {};
  for (const [key, meta] of Object.entries(fieldMeta)) {
    if (same(flat[key], (extracted || {})[key])) out[key] = meta;
  }
  return out;
}

// How much to trust an AI-filled value, based on how directly the case sheet
// stated it — not on whether it looks clinically plausible.
const CONFIDENCE_LABELS = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
const CONFIDENCE_HINTS = {
  HIGH: 'Copied verbatim from a labelled line in the case sheet.',
  MEDIUM: 'Stated in the case sheet, but reformatted or interpreted.',
  LOW: 'Not stated outright — inferred from the surrounding text. Worth checking.',
};

// Normalise an AI-supplied repeatable group (case sheet extraction) down to the
// group's own field keys, dropping entries that carry nothing — otherwise a
// half-empty row renders as a blank card the user has to delete.
function normaliseGroupEntries(raw, allowedKeys) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const out = {};
      for (const key of allowedKeys) {
        const value = item[key];
        if (value == null || value === '') continue;
        if (Array.isArray(value) && value.length === 0) continue;
        out[key] = value;
      }
      return Object.keys(out).length > 0 ? out : null;
    })
    .filter(Boolean);
}

// Ensure data_json.treating_doctor.treatments exists. Records saved before the
// array was persisted stored these fields flat on treating_doctor — migrate them
// into a single treatment entry so old cases still render in the repeatable UI.
// The empty check matters: those rows come back from the server as `[]` (the
// column is NULL), which would otherwise skip the migration and render a blank
// card as though the data had been lost.
function ensureTreatments(dataJson) {
  const dj = { ...(dataJson || {}) };
  const td = { ...(dj.treating_doctor || {}) };
  if (!Array.isArray(td.treatments) || td.treatments.length === 0) {
    const legacy = {};
    let hasAny = false;
    for (const k of TREATMENT_KEYS) {
      if (td[k] != null && td[k] !== '') { legacy[k] = td[k]; hasAny = true; }
      delete td[k];
    }
    td.treatments = hasAny ? [legacy] : [{}];
  }
  dj.treating_doctor = td;
  return dj;
}

// ── Static form schema ──────────────────────────────────────────────

export const DRUG_ROUTES = [
  { code: 'PO',              route: 'Oral' },
  { code: 'IV',              route: 'Intravenous' },
  { code: 'IM',              route: 'Intramuscular' },
  { code: 'SC',              route: 'Subcutaneous' },
  { code: 'ID',              route: 'Intradermal' },
  { code: 'SL',              route: 'Sublingual' },
  { code: 'BUCCAL',          route: 'Buccal' },
  { code: 'TOP',             route: 'Topical' },
  { code: 'TD',              route: 'Transdermal' },
  { code: 'INH',             route: 'Inhalation' },
  { code: 'NEB',             route: 'Nebulization' },
  { code: 'NASAL',           route: 'Nasal' },
  { code: 'OPH',             route: 'Ophthalmic' },
  { code: 'OTIC',            route: 'Otic' },
  { code: 'RECTAL',          route: 'Rectal' },
  { code: 'VAGINAL',         route: 'Vaginal' },
  { code: 'PR',              route: 'Per Rectal' },
  { code: 'PEG',             route: 'PEG Tube' },
  { code: 'NG',              route: 'Nasogastric' },
  { code: 'INTRA_ART',       route: 'Intra-articular' },
  { code: 'INTRATHECAL',     route: 'Intrathecal' },
  { code: 'EPIDURAL',        route: 'Epidural' },
  { code: 'INTRAPERITONEAL', route: 'Intraperitoneal' },
  { code: 'INTRAVESICAL',    route: 'Intravesical' },
  { code: 'INTRAOCULAR',     route: 'Intraocular' },
];

// Show the plain route name ("Oral"); the code stays the stored value.
const DRUG_ROUTE_OPTIONS = DRUG_ROUTES.map((r) => ({
  value: r.code,
  label: r.route,
}));

// Investigations the hospital can request, mirroring the backend
// InvestigationCategory / Investigation enums. The stored value is always the
// enum name (CBC, MP_SMEAR); labels only exist for display.
export const INVESTIGATION_CATEGORIES = [
  { value: 'HEMATOLOGY', label: 'Hematology' },
  { value: 'BIOCHEMISTRY', label: 'Biochemistry' },
  { value: 'MICROBIOLOGY', label: 'Microbiology' },
  { value: 'SEROLOGY_IMMUNOLOGY', label: 'Serology / Immunology' },
  { value: 'URINE_ANALYSIS', label: 'Urine Analysis' },
  { value: 'RADIOLOGY_IMAGING', label: 'Radiology / Imaging' },
  { value: 'CARDIOLOGY', label: 'Cardiology' },
  { value: 'NEUROLOGY', label: 'Neurology' },
  { value: 'HISTOPATHOLOGY', label: 'Histopathology' },
  { value: 'OTHERS', label: 'Others' },
];

// Category → its investigations. Drives the cascading Investigation dropdown:
// picking a category narrows the list to that category's tests.
export const INVESTIGATIONS_BY_CATEGORY = {
  HEMATOLOGY: [
    { value: 'CBC', label: 'CBC — Complete Blood Count' },
    { value: 'HEMOGLOBIN', label: 'Hemoglobin' },
    { value: 'TOTAL_WBC_COUNT', label: 'Total WBC Count' },
    { value: 'DIFFERENTIAL_COUNT', label: 'Differential Count' },
    { value: 'PLATELET_COUNT', label: 'Platelet Count' },
    { value: 'ESR', label: 'ESR' },
    { value: 'PERIPHERAL_SMEAR', label: 'Peripheral Smear' },
    { value: 'MP_SMEAR', label: 'MP Smear — Malaria Parasite' },
    { value: 'PT_INR', label: 'PT / INR' },
    { value: 'APTT', label: 'APTT' },
  ],
  BIOCHEMISTRY: [
    { value: 'RBS', label: 'RBS — Random Blood Sugar' },
    { value: 'FBS', label: 'FBS — Fasting Blood Sugar' },
    { value: 'PPBS', label: 'PPBS — Post Prandial Blood Sugar' },
    { value: 'HBA1C', label: 'HbA1c' },
    { value: 'SERUM_ELECTROLYTES', label: 'Serum Electrolytes' },
    { value: 'SERUM_CREATININE', label: 'Serum Creatinine' },
    { value: 'BLOOD_UREA', label: 'Blood Urea' },
    { value: 'LFT', label: 'LFT — Liver Function Test' },
    { value: 'RFT', label: 'RFT — Renal Function Test' },
    { value: 'LIPID_PROFILE', label: 'Lipid Profile' },
    { value: 'SERUM_CALCIUM', label: 'Serum Calcium' },
    { value: 'CRP', label: 'CRP — C-Reactive Protein' },
    { value: 'PROCALCITONIN', label: 'Procalcitonin' },
    { value: 'ABG', label: 'ABG — Arterial Blood Gas' },
  ],
  MICROBIOLOGY: [
    { value: 'BLOOD_CULTURE_SENSITIVITY', label: 'Blood Culture & Sensitivity' },
    { value: 'URINE_CULTURE_SENSITIVITY', label: 'Urine Culture & Sensitivity' },
    { value: 'SPUTUM_CULTURE', label: 'Sputum Culture' },
    { value: 'CSF_ANALYSIS', label: 'CSF Analysis' },
    { value: 'STOOL_ROUTINE_CULTURE', label: 'Stool Routine & Culture' },
    { value: 'WOUND_SWAB_CULTURE', label: 'Wound Swab Culture' },
  ],
  SEROLOGY_IMMUNOLOGY: [
    { value: 'DENGUE_NS1_IGM', label: 'Dengue NS1 / IgM' },
    { value: 'WIDAL_TYPHIDOT', label: 'Widal / Typhidot' },
    { value: 'HIV', label: 'HIV' },
    { value: 'HBSAG', label: 'HBsAg' },
    { value: 'ANTI_HCV', label: 'Anti-HCV' },
    { value: 'COVID_RTPCR', label: 'COVID RT-PCR' },
  ],
  URINE_ANALYSIS: [
    { value: 'URINE_ROUTINE', label: 'Urine Routine' },
    { value: 'URINE_KETONES', label: 'Urine Ketones' },
  ],
  RADIOLOGY_IMAGING: [
    { value: 'XRAY_CHEST', label: 'X-Ray Chest' },
    { value: 'XRAY_ABDOMEN', label: 'X-Ray Abdomen' },
    { value: 'XRAY_LIMB', label: 'X-Ray Limb' },
    { value: 'USG_ABDOMEN', label: 'USG Abdomen' },
    { value: 'USG_KUB', label: 'USG KUB' },
    { value: 'CT_BRAIN', label: 'CT Brain' },
    { value: 'CT_ABDOMEN', label: 'CT Abdomen' },
    { value: 'CT_CHEST', label: 'CT Chest' },
    { value: 'MRI_BRAIN', label: 'MRI Brain' },
    { value: 'MRI_SPINE', label: 'MRI Spine' },
  ],
  CARDIOLOGY: [
    { value: 'ECG', label: 'ECG' },
    { value: 'ECHO', label: 'Echo' },
    { value: 'TMT', label: 'TMT — Treadmill Test' },
    { value: 'TROPONIN_I', label: 'Troponin I' },
  ],
  NEUROLOGY: [
    { value: 'EEG', label: 'EEG' },
    { value: 'NCS_EMG', label: 'NCS / EMG' },
  ],
  HISTOPATHOLOGY: [
    { value: 'BIOPSY_HPE', label: 'Biopsy / HPE' },
    { value: 'FNAC', label: 'FNAC' },
  ],
  OTHERS: [
    { value: 'OTHERS', label: 'Others' },
  ],
};

// Flat union of every investigation. Used as the schema-level `options` so the
// read-only mirror can resolve a saved value to its label without knowing which
// category was picked; the form narrows this per row via `optionsBy`.
const ALL_INVESTIGATION_OPTIONS = Object.values(INVESTIGATIONS_BY_CATEGORY).flat();

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
        // Rendered inside this subgroup's card, directly under the toggles, so
        // the investigations sit with the switch that reveals them. The values
        // still live at section level (treating_doctor.investigations) — only the
        // placement is nested.
        repeatableGroups: [
          {
            key: 'investigations',
            itemLabel: 'Investigation',
            showWhen: { subgroup: 'treatment_plan', key: 'investigation' },
            // Description is free-text colour — don't let a blank one block "+ Add".
            requiredKeys: ['investigation_category', 'investigation_name'],
            fields: [
              {
                key: 'investigation_category',
                label: 'Investigation Category',
                type: 'select',
                options: INVESTIGATION_CATEGORIES,
              },
              {
                key: 'investigation_name',
                label: 'Investigation',
                type: 'select',
                options: ALL_INVESTIGATION_OPTIONS,
                optionsBy: { key: 'investigation_category', map: INVESTIGATIONS_BY_CATEGORY },
              },
              { key: 'investigation_description', label: 'Description', type: 'textarea' },
            ],
          },
        ],
      },
    ],
    // Each "treatment" is a repeatable bundle of these fields. Stored as an
    // array at treating_doctor.treatments. On save, the first treatment's
    // values are also flattened onto treating_doctor (with treatment_details
    // joined across all entries) so the Part-C print + cover email keep
    // reading single fields. See buildPayload.
    repeatableGroups: [
      {
        key: 'treatments',
        itemLabel: 'Treatment',
        // Mirror entry #1 onto the section on save (see buildPayload).
        flattenFirst: true,
        fields: [
          // Order matters for the 2-column grid: the wide textarea first, then
          // the two half-width fields pair up on one row, then the wide ICD
          // block last so its suggestion cards get the full width.
          { key: 'treatment_details', label: 'Treatment Details', type: 'textarea' },
          // One treatment often uses several routes — stored as an array of codes.
          { key: 'drug_route', label: 'Drug Route', type: 'multiselect', options: DRUG_ROUTE_OPTIONS },
          { key: 'injury_cause', label: 'Injury Cause', type: 'text' },
          // Free text plus a "Suggest ICD" button: the AI proposes three
          // ICD-10-PCS candidates from this row's clinical context and the user
          // picks one. Typing a code by hand still works.
          // Labelled just "ICD Code": the suggestions cover any procedure, not
          // only surgery. The key stays surgery_icd_code — it's the column name,
          // the print template's data-field and a provider response-mapping key.
          { key: 'surgery_icd_code', label: 'ICD Code', type: 'text', suggestIcd: true },
        ],
      },
    ],
    fieldsAfterSubgroups: [
      // Stored at section level (treating_doctor.has_accident) so the
      // accident_details showWhen linkage keeps working. `fullWidth` drops it
      // onto its own row.
      { key: 'has_accident', label: 'Was this an accident?', type: 'boolean', fullWidth: true },
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
          { key: 'room_rent', label: 'Non ICU Room (per day)', type: 'number', narrow: true },
          { key: 'icu_charges', label: 'ICU Charges (per day)', type: 'number', narrow: true },
          { key: 'investigation_cost', label: 'Investigation Cost', type: 'number' },
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

  if (type === 'multiselect') {
    // Value is an array of option values. A bare string is tolerated so a draft
    // saved while this field was single-select (or a provider payload sending a
    // scalar) still renders instead of vanishing.
    const selected = Array.isArray(value) ? value : (value ? [value] : []);
    const labelFor = (val) => {
      const match = (options || []).find(
        (opt) => String(typeof opt === 'object' ? opt.value : opt) === String(val),
      );
      if (!match) return String(val); // unrecognised value — show it verbatim
      return typeof match === 'object' ? match.label : String(match);
    };
    // Offer only what isn't already picked, so the dropdown shrinks as you go.
    const remaining = (options || []).filter(
      (opt) => !selected.some(
        (v) => String(v) === String(typeof opt === 'object' ? opt.value : opt),
      ),
    );
    // The picker comes first so it lines up with the plain inputs beside it in
    // the two-column grid; the chips grow downwards where they can't push a
    // neighbouring field out of alignment.
    return (
      <div className="preauth-multi">
        {remaining.length > 0 ? (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onChange(key, [...selected, e.target.value]);
            }}
          >
            <option value="">+ Add {(field.label || 'item').toLowerCase()}…</option>
            {remaining.map((opt) => {
              const optValue = typeof opt === 'object' ? opt.value : opt;
              const optLabel = typeof opt === 'object' ? opt.label : opt;
              return (
                <option key={String(optValue)} value={String(optValue)}>{optLabel}</option>
              );
            })}
          </select>
        ) : (
          // Everything is selected — keep the row height so the field beside
          // this one doesn't jump up.
          <span className="preauth-multi__all-picked">All options selected</span>
        )}
        {selected.length > 0 && (
          <div className="preauth-multi__chips">
            {selected.map((val) => (
              <span key={String(val)} className="preauth-multi__chip">
                <span>{labelFor(val)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${labelFor(val)}`}
                  onClick={() => onChange(key, selected.filter((v) => v !== val))}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
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
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [existingDocs, setExistingDocs] = useState([]);
  const [docViewUrl, setDocViewUrl] = useState(null);
  const [docViewName, setDocViewName] = useState('');
  const [docViewType, setDocViewType] = useState('');
  // ICD-10-PCS suggestions per treatment row: { [rowIndex]: [{code, description,
  // rationale}] } plus a parallel in-flight map, so each row's button and card
  // list are independent. Not persisted — they vanish on reload by design.
  const [icdSuggestions, setIcdSuggestions] = useState({});
  const [icdLoading, setIcdLoading] = useState({});
  // Case-sheet provenance: { [fieldKey]: { confidence, source } }. Session-only —
  // an entry is dropped the moment the user edits that field, because a score
  // describing the AI's read no longer applies to a value they typed.
  const [fieldMeta, setFieldMeta] = useState({});
  const [caseSheetId, setCaseSheetId] = useState(null);
  // The source pages behind this form, each viewable. Set on load for a saved
  // case, or carried through from the AI-fill page for a new one.
  const [caseSheetFiles, setCaseSheetFiles] = useState([]);

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
        const res = await policyProviderService.getForHospital();
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

        if (latestForm?.sections) {
          setFormData(ensureTreatments(latestForm.sections));
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

        // If this case was pre-filled from a case sheet, bring back its
        // confidence chips and the source document reference.
        try {
          const csRes = await workflowService.caseSheetForClaim(routeClaimCaseId);
          const cs = csRes.data;
          if (cs?.case_sheet_id) {
            setCaseSheetId(cs.case_sheet_id);
            setCaseSheetFiles(cs.files || []);
            setFieldMeta(liveFieldMeta(cs.field_meta, cs.extracted, latestForm?.sections));
          }
        } catch {
          // no case sheet behind this claim
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
    // Repeatable groups arrive separately (see handleProceed on the AI page) —
    // the flat keyToSection mapping below doesn't cover repeatableGroups.
    const aiTreatments = normaliseGroupEntries(location.state?.aiTreatments, TREATMENT_KEYS);
    const aiInvestigations = normaliseGroupEntries(location.state?.aiInvestigations, INVESTIGATION_KEYS);
    const hasScalars = aiData && typeof aiData === 'object' && Object.keys(aiData).length > 0;
    if (!hasScalars && aiTreatments.length === 0 && aiInvestigations.length === 0) return;
    aiAppliedRef.current = true;

    // Confidence + provenance for the fields we're about to fill.
    const meta = location.state?.aiFieldMeta;
    if (meta && typeof meta === 'object') setFieldMeta(meta);
    if (location.state?.aiCaseSheetId) {
      setCaseSheetId(location.state.aiCaseSheetId);
      setCaseSheetFiles(location.state.aiCaseSheetFiles || []);
    }

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
    for (const [key, rawValue] of Object.entries(aiData || {})) {
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
        // Drop AI keys that don't map to a form field — we never surface an
        // "Additional Details" catch-all section.
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

    // Seed the repeatable groups. ensureTreatments only fills `treatments` when
    // it isn't already an array, so a seeded list passes through untouched.
    if (aiTreatments.length > 0 || aiInvestigations.length > 0) {
      const td = { ...(prefilled.treating_doctor || {}) };
      if (aiTreatments.length > 0) td.treatments = aiTreatments;
      if (aiInvestigations.length > 0) {
        td.investigations = aiInvestigations;
        // The Investigations block is gated behind this toggle — without it the
        // extracted rows would be saved but invisible.
        td.treatment_plan = { ...(td.treatment_plan || {}), investigation: true };
      }
      prefilled.treating_doctor = td;
    }

    if (Object.keys(prefilled).length > 0) {
      setFormData((prev) => {
        const merged = { ...prev };
        for (const [section, fields] of Object.entries(prefilled)) {
          merged[section] = { ...(merged[section] || {}), ...fields };
        }
        // AI returns the treatment fields flat → fold them into a single
        // treatment entry so the repeatable UI renders them.
        return ensureTreatments(merged);
      });
      setOpenSections((prev) => {
        const updated = { ...prev };
        for (const sectionName of Object.keys(prefilled)) {
          updated[sectionName] = true;
        }
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

  // room_rent and icu_charges are PER-DAY rates: room_rent applies to non-ICU
  // days (expected_days - icu_days), icu_charges to icu_days. The remaining
  // cost fields are flat amounts. Total Cost = room rate*non-ICU days +
  // ICU rate*ICU days + sum(flat costs).
  const COST_PER_DAY_KEYS = ['room_rent', 'icu_charges'];
  const COST_FLAT_KEYS = [
    'investigation_cost',
    'ot_charges',
    'professional_fees',
    'medicines_cost',
    'other_expenses',
    'package_charges',
  ];

  // Compute Total Cost from a `hospitalization` section (reads expected_days /
  // icu_days at section level and the line items in its `costs` subgroup).
  const computeTotalCost = (section) => {
    const costs = section.costs || {};
    const icuDays = Number(section.icu_days) || 0;
    const nonIcuDays = Math.max(0, (Number(section.expected_days) || 0) - icuDays);
    const roomTotal = (Number(costs.room_rent) || 0) * nonIcuDays;
    const icuTotal = (Number(costs.icu_charges) || 0) * icuDays;
    const flatTotal = COST_FLAT_KEYS.reduce((acc, k) => acc + (Number(costs[k]) || 0), 0);
    return roomTotal + icuTotal + flatTotal;
  };

  // Drop a field's AI provenance once the user touches it — the confidence and
  // the quoted source describe the extracted value, not their edit.
  const clearFieldMeta = (key) => {
    setFieldMeta((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const setValue = (sectionName, key, value, subgroupKey) => {
    clearFieldMeta(key);
    setFormData((prev) => {
      const section = { ...(prev[sectionName] || {}) };
      if (subgroupKey) {
        const subgroup = { ...(section[subgroupKey] || {}), [key]: value };
        section[subgroupKey] = subgroup;
        // Recompute total_cost whenever a line-item cost changes.
        if (subgroupKey === 'costs'
          && (COST_PER_DAY_KEYS.includes(key) || COST_FLAT_KEYS.includes(key))) {
          subgroup.total_cost = computeTotalCost(section);
        }
      } else {
        section[key] = value;
        // Expected Stay / ICU Days multiply the per-day room rates, so changing
        // them must recompute Total Cost too.
        if (sectionName === 'hospitalization' && (key === 'expected_days' || key === 'icu_days')) {
          section.costs = { ...(section.costs || {}) };
          section.costs.total_cost = computeTotalCost(section);
        }
      }
      return { ...prev, [sectionName]: section };
    });
  };

  const shouldShow = (field, sectionName) => {
    if (!field.showWhen) return true;
    return !!getValue(sectionName, field.showWhen);
  };

  // Ask the AI for ICD-10-PCS candidates for one treatment row. Sends the
  // section-level clinical picture plus that row's own treatment fields, so two
  // rows describing different procedures get different suggestions.
  const requestIcdSuggestions = async (index, item) => {
    const num = (v) => (v === '' || v == null ? undefined : Number(v));
    const payload = {
      provisional_diagnosis: getValue('treating_doctor', 'provisional_diagnosis') || undefined,
      illness_description: getValue('treating_doctor', 'illness_description') || undefined,
      critical_findings: getValue('treating_doctor', 'critical_findings') || undefined,
      past_history: getValue('treating_doctor', 'past_history') || undefined,
      duration_days: num(getValue('treating_doctor', 'duration_days')),
      treatment_details: (item || {}).treatment_details || undefined,
      // An empty array is truthy, so `|| undefined` wouldn't drop it — check length.
      drug_route: (item || {}).drug_route?.length ? item.drug_route : undefined,
      injury_cause: (item || {}).injury_cause || undefined,
      age_years: num(getValue('patient_insured', 'age_years')),
      gender: getValue('patient_insured', 'gender') || undefined,
    };
    if (Object.values(payload).every((v) => v === undefined)) {
      toast.error('Fill in the diagnosis or treatment details first');
      return;
    }

    setIcdLoading((prev) => ({ ...prev, [index]: true }));
    try {
      const res = await aiAssistantService.suggestIcd(payload);
      const suggestions = res?.suggestions || [];
      setIcdSuggestions((prev) => ({ ...prev, [index]: suggestions }));
      if (suggestions.length === 0) toast.error('No ICD codes could be suggested');
    } catch {
      // axios interceptor surfaces the toast
    } finally {
      setIcdLoading((prev) => ({ ...prev, [index]: false }));
    }
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

      // Repeatable groups: always send the array. Groups marked `flattenFirst`
      // additionally mirror the first entry onto the section so the Part-C
      // print + cover email keep reading single fields — treatment_details is
      // joined across all entries (Q1: first treatment drives the form fields,
      // remaining details are appended). Groups with their own table (e.g.
      // investigations) skip the mirroring.
      // Repeatable groups may be declared on the section or nested in one of its
      // subgroups (Treatment Plan → Investigations). Either way the array itself
      // lives at section level.
      const repeatableGroups = [
        ...(section.repeatableGroups || []),
        ...allSubgroups.flatMap((sg) => sg.repeatableGroups || []),
      ];
      for (const group of repeatableGroups) {
        const list = (Array.isArray(cleaned[group.key]) ? cleaned[group.key] : [])
          .filter((it) => it && Object.values(it).some((v) => v != null && v !== ''));
        cleaned[group.key] = list;
        if (!group.flattenFirst) continue;
        const first = list[0] || {};
        for (const f of group.fields) {
          if (f.key === 'treatment_details') {
            cleaned[f.key] = list
              .map((it) => it.treatment_details)
              .filter((s) => s && String(s).trim())
              .join('; ');
          } else {
            cleaned[f.key] = first[f.key] ?? '';
          }
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
        await formDataService.update(formDataId, { sections: payload });
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
        fd.append('sections', JSON.stringify(payload));
        // Links the stored case sheet + its extraction audit to this new case.
        if (caseSheetId) fd.append('case_sheet_id', caseSheetId);
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
      const res = await formTemplateService.getAll('PRE_AUTH');
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
        } else if (Array.isArray(val)) {
          // Primitive arrays print as a joined string. Object arrays (e.g. the
          // `treatments` group) are skipped — their flat fields are derived
          // separately in buildPayload.
          flat[key] = val.filter((s) => s != null && typeof s !== 'object' && String(s).trim()).join('; ');
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

  const handleUploadFiles = async (pickedFiles) => {
    if (!pickedFiles || pickedFiles.length === 0) return;

    if (isEdit) {
      // Edit mode: upload immediately via documents API
      setUploadingDocs(true);
      try {
        const fd = new FormData();
        pickedFiles.forEach((file) => fd.append('files', file));
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
      setFiles((prev) => [...prev, ...pickedFiles]);
    }
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

  // Open one source page in the same viewer the claim documents use — it already
  // renders both images and PDFs.
  const handleViewCaseSheet = async (file) => {
    if (!caseSheetId) return;
    try {
      const res = await workflowService.viewCaseSheetPage(caseSheetId, file.index);
      const contentType = res.headers?.['content-type'] || file.content_type || 'application/pdf';
      setDocViewUrl(window.URL.createObjectURL(new Blob([res.data], { type: contentType })));
      setDocViewName(file.original_filename || 'Case sheet');
      setDocViewType(contentType);
    } catch {
      // handled by the interceptor
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

  // Room Type options come from the selected provider's MOU room charges.
  const selectedProvider = providers.find((p) => p.id === selectedProviderId);
  const roomTypeOptions = (selectedProvider?.room_charges?.room_type || [])
    .filter((r) => r && r.room)
    .map((r) => ({
      value: r.room,
      label: r.room,
    }));

  // MOU coverage hint shown under cost-estimate fields (Room Rent / ICU / OT).
  const mouCoverageHint = (fieldKey, sectionName) => {
    const rc = selectedProvider?.room_charges;
    if (!rc) return '';
    if (fieldKey === 'icu_charges' && rc.icu != null) return `Insurance covers ₹${rc.icu} per day`;
    if (fieldKey === 'ot_charges' && rc.ot_charge != null) return `Insurance covers ₹${rc.ot_charge}`;
    if (fieldKey === 'room_rent') {
      const room = getValue(sectionName, 'room_type');
      const match = (rc.room_type || []).find((r) => r.room === room);
      if (match && match.per_day_rent != null) return `Insurance covers ₹${match.per_day_rent} per day`;
    }
    return '';
  };

  const renderFields = (fields, sectionName, subgroupKey) =>
    fields.filter((f) => shouldShow(f, sectionName)).map((rawField) => {
      const field =
        rawField.key === 'room_type'
          ? { ...rawField, type: 'select', options: roomTypeOptions }
          : rawField;
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
          : '';
      } else {
        showSuggestion = typeof suggestion === 'string' && suggestion.trim().length > 0;
      }
      // Per-day math hint for the room-rate fields: rate × days = line total.
      let perDayHint = '';
      if (subgroupKey === 'costs' && COST_PER_DAY_KEYS.includes(field.key)) {
        const rate = Number(fieldValue) || 0;
        const icuDays = Number(getValue(sectionName, 'icu_days')) || 0;
        const days = field.key === 'icu_charges'
          ? icuDays
          : Math.max(0, (Number(getValue(sectionName, 'expected_days')) || 0) - icuDays);
        const costLabel = field.key === 'icu_charges' ? 'ICU room cost' : 'Non ICU room cost';
        if (rate > 0 && days > 0) {
          perDayHint = `× ${costLabel} (${days} day${days > 1 ? 's' : ''}) = ₹${(rate * days).toLocaleString('en-IN')}`;
        }
      }
      // Case-sheet provenance for this field, if it was AI-filled and untouched.
      const meta = fieldMeta[field.key];
      return (
        <div key={field.key} className={`form-group ${(field.type === 'textarea' || field.fullWidth) ? 'form-group--wide' : ''} ${field.narrow ? 'form-group--narrow' : ''}`}>
          <label>
            {field.label}
            {meta?.confidence && (
              <span
                className={`field-confidence field-confidence--${meta.confidence.toLowerCase()}`}
                title={CONFIDENCE_HINTS[meta.confidence]}
              >
                {CONFIDENCE_LABELS[meta.confidence] || meta.confidence}
              </span>
            )}
          </label>
          {field.narrow ? (
            // Per-day rate field: keep the input inside field-inline ALWAYS so
            // toggling the "rate × days = total" hint never remounts it (which
            // would drop focus mid-typing). Only the hint appears/disappears.
            <div className="field-inline">
              <FieldInput
                field={field}
                value={fieldValue}
                onChange={(key, val) => setValue(sectionName, key, val, subgroupKey)}
              />
              {perDayHint && <small className="policy-suggestion field-inline__hint">{perDayHint}</small>}
            </div>
          ) : (
            <FieldInput
              field={field}
              value={fieldValue}
              onChange={(key, val) => setValue(sectionName, key, val, subgroupKey)}
            />
          )}
          {meta?.source && (
            <small className="field-source" title={meta.source}>
              from: “{meta.source}”
            </small>
          )}
          {showSuggestion && (
            <small className="policy-suggestion">{suggestionText}</small>
          )}
          {subgroupKey === 'costs' && mouCoverageHint(field.key, sectionName) && (
            <small className="mou-coverage-hint">{mouCoverageHint(field.key, sectionName)}</small>
          )}
        </div>
      );
    });

  // Group-level visibility, used by both subgroups and repeatable groups.
  // `showWhen` may be either a string (refers to a sibling field in the same
  // section, truthy check) or an object `{ section, subgroup, key, equals }`.
  // Both `section` and `subgroup` are optional — omit `section` for a condition
  // in the current section, and give `subgroup` when the driving field lives
  // inside one (e.g. treatment_plan.investigation).
  const shouldShowSubgroup = (sg, sectionName) => {
    if (!sg.showWhen) return true;
    if (typeof sg.showWhen === 'string') {
      return !!getValue(sectionName, sg.showWhen);
    }
    if (typeof sg.showWhen === 'object') {
      const { section, subgroup, key, equals } = sg.showWhen;
      const v = getValue(section || sectionName, key, subgroup);
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
          {/* A subgroup may host its own repeatable groups (e.g. Treatment
              Plan → Investigations) so they render inside its card. Their
              values still live at section level, hence sectionName. */}
          {renderRepeatableGroups(sg.repeatableGroups, sectionName)}
        </div>
      ));

  // Update one field inside one entry of a repeatable group array, applying any
  // cross-field rules scoped to that entry.
  const setRepeatableValue = (sectionName, groupKey, index, key, value) => {
    setFormData((prev) => {
      const section = { ...(prev[sectionName] || {}) };
      const list = Array.isArray(section[groupKey]) ? [...section[groupKey]] : [];
      const item = { ...(list[index] || {}), [key]: value };
      if (key === 'investigation_category') {
        // Switching category invalidates an investigation from the old one —
        // clear it rather than letting FieldInput keep it as a "(custom)" option.
        const allowed = INVESTIGATIONS_BY_CATEGORY[value] || [];
        if (item.investigation_name
          && !allowed.some((opt) => opt.value === item.investigation_name)) {
          item.investigation_name = '';
        }
      }
      list[index] = item;
      section[groupKey] = list;
      return { ...prev, [sectionName]: section };
    });
  };

  const addRepeatableItem = (sectionName, groupKey) => {
    setFormData((prev) => {
      const section = { ...(prev[sectionName] || {}) };
      const list = Array.isArray(section[groupKey]) ? [...section[groupKey]] : [];
      section[groupKey] = [...list, {}];
      return { ...prev, [sectionName]: section };
    });
  };

  const removeRepeatableItem = (sectionName, groupKey, index) => {
    setFormData((prev) => {
      const section = { ...(prev[sectionName] || {}) };
      const list = Array.isArray(section[groupKey]) ? [...section[groupKey]] : [];
      section[groupKey] = list.filter((_, i) => i !== index);
      return { ...prev, [sectionName]: section };
    });
  };

  const renderRepeatableGroups = (groups, sectionName) =>
    (groups || [])
      // Same visibility rules as subgroups — e.g. investigations only appear
      // once the Treatment Plan `investigation` toggle is on.
      .filter((group) => shouldShowSubgroup(group, sectionName))
      .map((group) => {
      const rawList = (formData[sectionName] || {})[group.key];
      const list = Array.isArray(rawList) && rawList.length ? rawList : [{}];
      // Only allow adding another entry once every *required* field of every
      // existing entry is filled in. Defaults to all fields.
      const requiredKeys = group.requiredKeys || group.fields.map((f) => f.key);
      const allFilled = list.every((item) =>
        requiredKeys.every((key) => {
          const v = (item || {})[key];
          return v != null && String(v).trim() !== '';
        }),
      );
      return (
        <div key={group.key} className="preauth-repeat">
          {list.map((item, index) => (
            <div key={index} className="preauth-repeat__item">
              <div className="preauth-repeat__item-head">
                <span className="preauth-repeat__item-title">
                  {group.itemLabel} {index + 1}
                </span>
                {list.length > 1 && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => removeRepeatableItem(sectionName, group.key, index)}
                  >
                    &times; Remove
                  </button>
                )}
              </div>
              <div className="preauth-section__fields">
                {group.fields.map((rawField) => {
                  // `optionsBy` narrows a select from a sibling field's value
                  // *within this row* — so each investigation row's list follows
                  // its own category. Until a category is picked the list is
                  // empty: offering all 57 investigations would let the user pick
                  // one that contradicts the category they choose next.
                  let field = rawField;
                  if (rawField.optionsBy) {
                    const parent = (item || {})[rawField.optionsBy.key];
                    field = { ...rawField, options: rawField.optionsBy.map[parent] || [] };
                  }
                  const fieldValue = (item || {})[field.key] ?? '';
                  const input = (
                    <FieldInput
                      field={field}
                      value={fieldValue}
                      onChange={(key, val) => setRepeatableValue(sectionName, group.key, index, key, val)}
                    />
                  );
                  if (!field.suggestIcd) {
                    return (
                      <div
                        key={field.key}
                        className={`form-group ${field.type === 'textarea' ? 'form-group--wide' : ''}`}
                      >
                        <label>{field.label}</label>
                        {input}
                      </div>
                    );
                  }
                  // Free-text code + "Suggest ICD", with this row's candidates
                  // listed below. Clicking a card writes its code into the field.
                  const loading = !!icdLoading[index];
                  const suggestions = icdSuggestions[index] || [];
                  return (
                    <div key={field.key} className="form-group form-group--wide">
                      <label>{field.label}</label>
                      <div className="icd-suggest">
                        <div className="icd-suggest__row">
                          {input}
                          <button
                            type="button"
                            className="btn btn--outline btn--sm icd-suggest__btn"
                            onClick={() => requestIcdSuggestions(index, item)}
                            disabled={loading}
                          >
                            {loading ? <Spinner size={14} /> : '✨'}
                            <span>{loading ? 'Suggesting…' : 'Suggest ICD'}</span>
                          </button>
                        </div>
                        {suggestions.length > 0 && (
                          <div className="icd-suggest__list">
                            {suggestions.map((s) => (
                              <button
                                type="button"
                                key={s.code}
                                className={`icd-suggest__card ${s.code === fieldValue ? 'icd-suggest__card--selected' : ''}`}
                                onClick={() => setRepeatableValue(sectionName, group.key, index, field.key, s.code)}
                              >
                                <span className="icd-suggest__code">{s.code}</span>
                                <span className="icd-suggest__desc">{s.description}</span>
                                {s.rationale && (
                                  <span className="icd-suggest__why">{s.rationale}</span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn btn--ghost btn--sm preauth-repeat__add"
            onClick={() => addRepeatableItem(sectionName, group.key)}
            disabled={!allFilled}
            title={allFilled ? undefined : `Fill the required fields in the current ${group.itemLabel.toLowerCase()}(s) first`}
          >
            + Add {group.itemLabel}
          </button>
        </div>
      );
    });

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

      {caseSheetFiles.length > 0 && (
        <div className="case-sheet-ref">
          <span>
            Pre-filled from case sheet
            {caseSheetFiles.length > 1 && ` (${caseSheetFiles.length} pages)`}:
          </span>
          <span className="case-sheet-ref__files">
            {caseSheetFiles.map((f) => (
              <button
                key={f.index}
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => handleViewCaseSheet(f)}
                title={`Open ${f.original_filename || 'page ' + (f.index + 1)}`}
              >
                {f.original_filename || `Page ${f.index + 1}`}
              </button>
            ))}
          </span>
        </div>
      )}

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
                    {renderRepeatableGroups(section.repeatableGroups, section.name)}
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
                  <label
                    className="btn btn--primary"
                    style={{
                      cursor: uploadingDocs ? 'wait' : 'pointer',
                      pointerEvents: uploadingDocs ? 'none' : 'auto',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {uploadingDocs ? <Spinner size={16} /> : 'Upload Documents'}
                    <input
                      type="file"
                      hidden
                      multiple
                      disabled={uploadingDocs}
                      onChange={(e) => {
                        const picked = Array.from(e.target.files || []);
                        if (picked.length) handleUploadFiles(picked);
                        e.target.value = '';
                      }}
                    />
                  </label>
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
