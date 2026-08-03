import CollapsibleCard from './CollapsibleCard';
import KeyValueInput from './KeyValueInput';
import { IconX } from '../icons/Icons';
import './ConfigComponents.scss';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export const RESPONSE_MAPPING_KEYS = [
  // Patient / Insured
  { value: 'patient_name', label: 'Patient Name' },
  { value: 'gender', label: 'Gender' },
  { value: 'age_years', label: 'Age' },
  { value: 'date_of_birth', label: 'Date of Birth' },
  { value: 'contact_number', label: 'Contact Number' },
  { value: 'relative_contact_number', label: 'Relative Contact Number' },
  { value: 'policy_number', label: 'Policy Number' },
  { value: 'insured_card_id', label: 'Insured Card ID' },
  { value: 'corporate_name', label: 'Corporate Name' },
  { value: 'employee_id', label: 'Employee ID' },
  { value: 'has_other_insurance', label: 'Has Other Insurance' },
  { value: 'other_insurance_company', label: 'Other Insurance Company' },
  { value: 'other_insurance_details', label: 'Other Insurance Details' },
  { value: 'has_family_physician', label: 'Has Family Physician' },
  { value: 'family_physician_name', label: 'Family Physician Name' },
  { value: 'family_physician_contact', label: 'Family Physician Contact' },
  { value: 'address', label: 'Patient Address' },
  { value: 'occupation', label: 'Occupation' },
  // Treating Doctor
  { value: 'doctor_name', label: 'Doctor Name' },
  { value: 'doctor_contact', label: 'Doctor Contact' },
  { value: 'illness_description', label: 'Illness Description' },
  { value: 'critical_findings', label: 'Critical Findings' },
  { value: 'duration_days', label: 'Duration' },
  { value: 'first_consultation_date', label: 'First Consultation' },
  { value: 'past_history', label: 'Past History' },
  { value: 'provisional_diagnosis', label: 'Provisional Diagnosis' },
  { value: 'icd10_code', label: 'ICD-10 Code' },
  // Treatment Plan
  { value: 'medical_management', label: 'Medical Management' },
  { value: 'surgical_management', label: 'Surgical Management' },
  { value: 'intensive_care', label: 'Intensive Care' },
  { value: 'investigation', label: 'Investigation' },
  { value: 'non_allopathic', label: 'Non-Allopathic' },
  // Treatment Details
  { value: 'treatment_details', label: 'Treatment Details' },
  { value: 'drug_route', label: 'Drug Route' },
  { value: 'surgery_icd_code', label: 'ICD Code' },
  { value: 'injury_cause', label: 'Injury Cause' },
  // Accident Details
  { value: 'is_rta', label: 'Is RTA' },
  { value: 'injury_date', label: 'Injury Date' },
  { value: 'reported_to_police', label: 'Reported to Police' },
  { value: 'fir_number', label: 'FIR Number' },
  { value: 'substance_abuse', label: 'Substance Abuse' },
  { value: 'test_conducted', label: 'Test Conducted' },
  // Maternity
  { value: 'expected_delivery_date', label: 'Expected Delivery Date' },
  // Hospitalization
  { value: 'admission_date', label: 'Admission Date' },
  { value: 'admission_time', label: 'Admission Time' },
  { value: 'is_emergency', label: 'Is Emergency' },
  { value: 'expected_days', label: 'Expected Days' },
  { value: 'icu_days', label: 'ICU Days' },
  { value: 'room_type', label: 'Room Type' },
  // Chronic Conditions
  { value: 'diabetes', label: 'Diabetes' },
  { value: 'heart_disease', label: 'Heart Disease' },
  { value: 'hypertension', label: 'Hypertension' },
  { value: 'hyperlipidemia', label: 'Hyperlipidemia' },
  { value: 'osteoarthritis', label: 'Osteoarthritis' },
  { value: 'asthma_copd', label: 'Asthma / COPD' },
  { value: 'cancer', label: 'Cancer' },
  { value: 'alcohol_drug_abuse', label: 'Alcohol / Drug Abuse' },
  { value: 'hiv_std', label: 'HIV / STD' },
  { value: 'other', label: 'Other' },
  // Cost Estimates
  { value: 'room_rent', label: 'Room Rent' },
  { value: 'investigation_cost', label: 'Investigation Cost' },
  { value: 'icu_charges', label: 'ICU Charges' },
  { value: 'ot_charges', label: 'OT Charges' },
  { value: 'professional_fees', label: 'Professional Fees' },
  { value: 'medicines_cost', label: 'Medicines Cost' },
  { value: 'other_expenses', label: 'Other Expenses' },
  { value: 'package_charges', label: 'Package Charges' },
  { value: 'total_cost', label: 'Total Cost' },
];

export default function StepCard({ step, index, onChange, onRemove }) {
  const update = (field, value) => {
    onChange({ ...step, [field]: value });
  };

  return (
    <div className="step-card">
      <CollapsibleCard
        title={`Step ${index + 1}${step.step ? `: ${step.step}` : ''}`}
        defaultOpen={true}
        actions={
          <button type="button" className="step-card__delete" onClick={onRemove}>
            <IconX size={14} /> Remove
          </button>
        }
      >
        <div className="step-card__body">
          <div className="form-group">
            <label>Step Name</label>
            <input
              type="text"
              placeholder="e.g. fetch_patient_data"
              value={step.step || ''}
              onChange={(e) => update('step', e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Method</label>
              <select value={step.method || 'GET'} onChange={(e) => update('method', e.target.value)}>
                {METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="form-group form-group--grow">
              <label>URL</label>
              <input
                type="text"
                placeholder="https://api.example.com/patients/{{patient_id}}"
                value={step.url || ''}
                onChange={(e) => update('url', e.target.value)}
              />
            </div>
          </div>

          <KeyValueInput
            label="Headers"
            items={step.headers || []}
            onChange={(items) => update('headers', items)}
            keyPlaceholder="Header name"
            valuePlaceholder="Header value"
          />

          <div className="form-group">
            <label>Body Template</label>
            <textarea
              className="step-card__body-textarea"
              placeholder='{"clientid": "{{clientid}}"}'
              value={step.body_template || ''}
              onChange={(e) => update('body_template', e.target.value)}
              rows={4}
              spellCheck={false}
            />
          </div>

          <KeyValueInput
            label="Response Mapping"
            items={step.response_mapping || []}
            onChange={(items) => update('response_mapping', items)}
            keyOptions={RESPONSE_MAPPING_KEYS}
            valuePlaceholder="e.g. data.result.id"
          />

          <KeyValueInput
            label="Custom Mapping"
            items={step.custom_mapping || []}
            onChange={(items) => update('custom_mapping', items)}
            keyPlaceholder="Custom key"
            valuePlaceholder="e.g. data.custom_field"
          />
        </div>
      </CollapsibleCard>
    </div>
  );
}
