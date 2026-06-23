import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import Spinner from './Spinner';
import { useToast } from './Toast';
import { formTemplateService, claimCaseService } from '../services/api';
import { buildPartDFlat, renderTemplate, renderPartDPdfBlob } from './partDTemplate';

// Open the browser print dialog for a populated PART_D template, off-screen.
const PARTD_PRINT_IFRAME_ID = 'partd-print-frame';
function printPartDHtml(html) {
  if (!html) return;
  let iframe = document.getElementById(PARTD_PRINT_IFRAME_ID);
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = PARTD_PRINT_IFRAME_ID;
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:none;left:-9999px;';
    document.body.appendChild(iframe);
  }
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  const fire = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  };
  if (doc.readyState === 'complete') fire();
  else iframe.onload = fire;
}

// Part-D authorization letter editor for a single approval round.
//
// On open it GETs /claim-cases/{id}/part-d (scoped to `emailId`) to prefill
// the form — a saved row or a stub (approved_amount + claim_number from the
// claim, is_persisted=false). The provider edits the bill-breakdown /
// authorisation-summary free-text fields, then either:
//   • Save  → PUT JSON (field values only; nothing attached)
//   • Print → render the PDF client-side, PUT multipart (field values + the
//     PDF, so it's attached to the approval email), then open the browser
//     print dialog with the populated letter.
//
// Props: claim (the full claim shape used by buildPartDFlat), claimCaseId,
// emailId (the approval-round email this letter belongs to; optional — the
// backend defaults to the latest approval), onClose, onSaved (called after a
// successful PUT so the parent can refresh).

// Numeric Bill Breakdown lines, mirroring the pre-auth cost estimates.
// [stateKey, apiKey, label, preAuthCostKey, perDay?]
const BILL_FIELDS = [
  ['roomRent', 'bd_room_rent', 'Non ICU Room (per day)', 'room_rent', true],
  ['icuCharges', 'bd_icu_charges', 'ICU Charges (per day)', 'icu_charges', true],
  ['investigationCost', 'bd_investigation_cost', 'Investigation Cost', 'investigation_cost', false],
  ['otCharges', 'bd_ot_charges', 'OT Charges', 'ot_charges', false],
  ['professionalFees', 'bd_professional_fees', 'Professional Fees', 'professional_fees', false],
  ['medicinesCost', 'bd_medicines_cost', 'Medicines Cost', 'medicines_cost', false],
  ['packageCharges', 'bd_package_charges', 'Package Charges', 'package_charges', false],
  ['otherExpenses', 'bd_other_expenses', 'Other Expenses', 'other_expenses', false],
];

// Editable deduction inputs in the Authorisation Summary. [stateKey, apiKey, label]
const DEDUCTION_FIELDS = [
  ['discount', 'as_discount', 'Discount'],
  ['coPay', 'as_co_pay', 'Co-Pay'],
  ['deductibles', 'as_deductibles', 'Deductibles'],
  ['deductions', 'as_deductions', 'Other Deductions'],
];

const EMPTY_BILL = {
  roomRent: '', icuCharges: '', expectedDays: '', icuDays: '',
  investigationCost: '', otCharges: '', professionalFees: '',
  medicinesCost: '', packageCharges: '', otherExpenses: '',
  discount: '', coPay: '', deductibles: '', deductions: '',
};

const _n = (v) => Number(v) || 0;

export default function PartDPrintModal({ claim, claimCaseId, emailId, pendingRequest, onClose, onSaved, onApproved }) {
  const toast = useToast();
  const htmlRef = useRef('');

  const [loadingTemplate, setLoadingTemplate] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unavailable, setUnavailable] = useState(false); // GET 404 → no approval email yet

  // Server metadata for the loaded round.
  const [meta, setMeta] = useState(null); // { id, is_persisted, attachment_id, claim_case_email_id }
  const [resolvedEmailId, setResolvedEmailId] = useState(emailId ?? null);

  // Editable form state.
  const [claimNumber, setClaimNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [bill, setBill] = useState(EMPTY_BILL);
  // Saved stage → "Proceed" reveals the finalize panel (file upload + amount +
  // claim number + Approve). Optional signed-letter upload lives there.
  const [showApprovePanel, setShowApprovePanel] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);

  const setBillField = (key, value) => setBill((prev) => ({ ...prev, [key]: value }));

  const fmtCap = (n) => Number(n).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

  // Enhancement / reconsider rounds (incremental ask) — the pre-auth estimate
  // describes the original stay, not this top-up, so we DON'T prefill from it,
  // and every bill line (incl. room / ICU) is a FLAT amount so whatever the
  // insurer enters sums straight into the total (no per-day day-count needed).
  const isEnhancement = !!(pendingRequest && (
    pendingRequest.additional_amount != null
    || pendingRequest.revised_total != null
    || pendingRequest.approved_so_far != null
  ));

  // ── Derived totals ──
  // Original pre-auth: room_rent / icu_charges are per-day rates × day counts.
  // Enhancement: room / ICU are flat amounts (no day multiplication).
  const nonIcuDays = Math.max(0, _n(bill.expectedDays) - _n(bill.icuDays));
  const roomRentTotal = isEnhancement ? _n(bill.roomRent) : _n(bill.roomRent) * nonIcuDays;
  const icuChargesTotal = isEnhancement ? _n(bill.icuCharges) : _n(bill.icuCharges) * _n(bill.icuDays);
  const flatTotal = _n(bill.investigationCost) + _n(bill.otCharges) + _n(bill.professionalFees)
    + _n(bill.medicinesCost) + _n(bill.packageCharges) + _n(bill.otherExpenses);
  const totalBill = roomRentTotal + icuChargesTotal + flatTotal;
  const totalDeductions = _n(bill.discount) + _n(bill.coPay) + _n(bill.deductibles) + _n(bill.deductions);
  const totalAuthorised = Math.max(0, totalBill - totalDeductions);

  // The cap is what the hospital asked for this round (enhancement increment or
  // the original requested amount). Approved Amount == Total Authorised.
  const requestedCap = Number(pendingRequest?.additional_amount) || Number(claim?.requested_amount) || 0;
  const exceedsRequested = requestedCap > 0 && totalAuthorised > requestedCap;

  // Amount the Insured must pay = the shortfall when less is authorised than
  // requested (Requested − Total Authorised), never negative.
  const amountByInsured = Math.max(0, requestedCap - totalAuthorised);

  // Bill Breakdown defaults pulled from the pre-auth cost estimates (already in
  // the claim payload — no extra fetch needed). Enhancement rounds start blank.
  const preauthBill = () => {
    if (isEnhancement) return { ...EMPTY_BILL };
    const h = claim?.form_data_json?.hospitalization || {};
    const c = h.costs || {};
    return {
      ...EMPTY_BILL,
      roomRent: c.room_rent ?? '',
      icuCharges: c.icu_charges ?? '',
      expectedDays: h.expected_days ?? '',
      icuDays: h.icu_days ?? '',
      investigationCost: c.investigation_cost ?? '',
      otCharges: c.ot_charges ?? '',
      professionalFees: c.professional_fees ?? '',
      medicinesCost: c.medicines_cost ?? '',
      packageCharges: c.package_charges ?? '',
      otherExpenses: c.other_expenses ?? '',
    };
  };

  // Re-hydrate all state from a PartDLetterResponse.
  const hydrate = (data) => {
    if (!data) return;
    setMeta({
      id: data.id ?? null,
      is_persisted: !!data.is_persisted,
      attachment_id: data.attachment_id ?? null,
      claim_case_email_id: data.claim_case_email_id ?? null,
    });
    if (data.claim_case_email_id != null) setResolvedEmailId(data.claim_case_email_id);
    setClaimNumber(data.claim_number ?? '');
    setRemarks(data.remarks ?? '');
    // A persisted row with numeric breakdown → load it. Otherwise (stub, or an
    // older row saved before the numeric fields existed) → prefill from the
    // pre-auth cost estimates.
    const hasNumeric = data.bd_room_rent != null
      || data.bd_investigation_cost != null
      || data.as_total_bill_amount != null;
    if (data.is_persisted && hasNumeric) {
      setBill({
        roomRent: data.bd_room_rent ?? '',
        icuCharges: data.bd_icu_charges ?? '',
        expectedDays: data.bd_expected_days ?? '',
        icuDays: data.bd_icu_days ?? '',
        investigationCost: data.bd_investigation_cost ?? '',
        otCharges: data.bd_ot_charges ?? '',
        professionalFees: data.bd_professional_fees ?? '',
        medicinesCost: data.bd_medicines_cost ?? '',
        packageCharges: data.bd_package_charges ?? '',
        otherExpenses: data.bd_other_expenses ?? '',
        discount: data.as_discount ?? '',
        coPay: data.as_co_pay ?? '',
        deductibles: data.as_deductibles ?? '',
        deductions: data.as_deductions ?? '',
      });
    } else {
      setBill(preauthBill());
    }
  };

  // Fetch template + Part-D data on open.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await formTemplateService.getFirstByType('PART_D');
        if (!cancelled) {
          htmlRef.current = res?.data?.html_content || '';
          if (!htmlRef.current) toast.error('PART_D template not available');
        }
      } catch {
        // axios interceptor surfaces toast
      } finally {
        if (!cancelled) setLoadingTemplate(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await claimCaseService.getPartD(claimCaseId, emailId);
        if (!cancelled) hydrate(res.data);
      } catch (e) {
        const sc = e?.response?.status;
        const detail = e?.response?.data?.detail || '';
        // 400 "no approval email yet" — Part-D acts as the auth gate here.
        // Seed amount/claim-number from the claim, leave the bill-breakdown
        // fields empty for the user to fill, defer the actual record bind
        // to Save/Print which calls providerAction first.
        if (sc === 400 && /no approval email/i.test(detail)) {
          if (!cancelled) {
            // No approval email yet — open the editor with the Bill Breakdown
            // prefilled from the pre-auth cost estimates.
            setClaimNumber(claim?.claim_number || '');
            setBill(preauthBill());
          }
        } else if (sc === 404 && emailId == null) {
          // GET returned 404 (no part-d row and no approval). Same as above:
          // open the editor and let Save/Print create the approval inline.
          if (!cancelled) {
            setClaimNumber(claim?.claim_number || '');
            setBill(preauthBill());
          }
        } else if (sc === 404) {
          if (!cancelled) setUnavailable(true);
        } else if (sc === 400 && /not an approval email/i.test(detail) && emailId != null) {
          // Passed an email_id that isn't an approval row — fall back to the
          // latest approval.
          try {
            const res2 = await claimCaseService.getPartD(claimCaseId, undefined);
            if (!cancelled) hydrate(res2.data);
          } catch {
            if (!cancelled) setUnavailable(true);
          }
        }
        // other errors: axios interceptor already toasted
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimCaseId, emailId]);

  // Args for the printed/PDF letter. The DB-stored PART_D template still uses
  // the legacy placeholders, so map the numeric breakdown onto them (formatted)
  // until the template is updated to show the per-line pre-auth fields.
  const rs = (n) => `Rs.${_n(n).toLocaleString('en-IN')}`;
  const buildFlatArgs = () => ({
    claim,
    approveAmount: totalAuthorised,
    claimNumber,
    remarks,
    roomRentPerDay: bill.roomRent !== '' ? `${rs(bill.roomRent)}/day` : '',
    icuRentPerDay: bill.icuCharges !== '' ? `${rs(bill.icuCharges)}/day` : '',
    nursingChargesPerDay: '',
    consultantVisitChargesPerDay: '',
    surgeonAnesthetistFee: bill.otCharges !== '' ? rs(bill.otCharges) : '',
    others: [
      bill.investigationCost !== '' ? `Investigation ${rs(bill.investigationCost)}` : '',
      bill.professionalFees !== '' ? `Professional ${rs(bill.professionalFees)}` : '',
      bill.medicinesCost !== '' ? `Medicines ${rs(bill.medicinesCost)}` : '',
      bill.packageCharges !== '' ? `Package ${rs(bill.packageCharges)}` : '',
      bill.otherExpenses !== '' ? `Other ${rs(bill.otherExpenses)}` : '',
    ].filter(Boolean).join(', '),
    totalBillAmount: rs(totalBill),
    deductionsDetail: '',
    discount: bill.discount !== '' ? rs(bill.discount) : '',
    coPay: bill.coPay !== '' ? rs(bill.coPay) : '',
    deductibles: bill.deductibles !== '' ? rs(bill.deductibles) : '',
    totalAuthorisedAmount: rs(totalAuthorised),
    amountToBePaidByInsured: rs(amountByInsured),
  });

  // Build the field-value payload (snake_case) sent on Save / Approve.
  const fieldPayload = () => ({
    approved_amount: totalAuthorised,
    claim_number: claimNumber ?? '',
    remarks: remarks ?? '',
    bd_room_rent: _n(bill.roomRent),
    bd_icu_charges: _n(bill.icuCharges),
    bd_expected_days: _n(bill.expectedDays),
    bd_icu_days: _n(bill.icuDays),
    bd_investigation_cost: _n(bill.investigationCost),
    bd_ot_charges: _n(bill.otCharges),
    bd_professional_fees: _n(bill.professionalFees),
    bd_medicines_cost: _n(bill.medicinesCost),
    bd_package_charges: _n(bill.packageCharges),
    bd_other_expenses: _n(bill.otherExpenses),
    as_total_bill_amount: totalBill,
    as_discount: _n(bill.discount),
    as_co_pay: _n(bill.coPay),
    as_deductibles: _n(bill.deductibles),
    as_deductions: _n(bill.deductions),
    as_amount_to_be_paid_by_insured: amountByInsured,
  });

  const afterSave = (data) => {
    hydrate(data);
    if (typeof onSaved === 'function') onSaved(data);
  };

  // Save draft = pure data persist. No approval trigger. Pre-approval saves go
  // as a draft (no email_id in payload); the backend creates a draft Part-D row
  // with claim_case_email_id IS NULL, and links it to the approval email later
  // when the provider hits "Submit approval".
  const handleSave = async () => {
    if (!claimNumber.trim()) {
      toast.error('Claim Number is required');
      return;
    }
    if (exceedsRequested) {
      toast.error(`Approved amount cannot exceed the requested amount (${fmtCap(requestedCap)})`);
      return;
    }
    setSaving(true);
    try {
      const payload = { ...fieldPayload() };
      if (resolvedEmailId != null) payload.email_id = resolvedEmailId;
      const res = await claimCaseService.putPartD(claimCaseId, payload);
      afterSave(res.data);
      toast.success('Part-D saved');
    } catch {
      // interceptor toasted
    } finally {
      setSaving(false);
    }
  };

  // Print = persist field values (so the user doesn't lose their work) + open
  // the browser print dialog with the populated PDF (for a wet signature).
  // Print does NOT submit the approval — use "Submit approval" for that.
  const handlePrint = async () => {
    if (!htmlRef.current) {
      toast.error('PART_D template not loaded');
      return;
    }
    if (exceedsRequested) {
      toast.error(`Approved amount cannot exceed the requested amount (${fmtCap(requestedCap)})`);
      return;
    }
    setSaving(true);
    try {
      const flatArgs = buildFlatArgs();
      // Post-approval: a PDF blob can be attached to the approval email so
      // the saved letter is part of the audit trail. Pre-approval: we skip
      // the file upload (no email to bind it to) and just persist field
      // values; the same PDF still opens in the print dialog for download.
      const fd = new FormData();
      if (resolvedEmailId != null) {
        const blob = await renderPartDPdfBlob({ htmlTemplate: htmlRef.current, ...flatArgs });
        const filename = `PartD_${claimNumber || claim?.claim_number || claimCaseId}.pdf`;
        fd.append('email_id', String(resolvedEmailId));
        Object.entries(fieldPayload()).forEach(([k, v]) => fd.append(k, v == null ? '' : String(v)));
        fd.append('file', blob, filename);
        const res = await claimCaseService.putPartD(claimCaseId, fd);
        afterSave(res.data);
      } else {
        // Draft path: JSON PUT (no file), then render the PDF locally for printing.
        const payload = { ...fieldPayload() };
        const res = await claimCaseService.putPartD(claimCaseId, payload);
        afterSave(res.data);
      }
      printPartDHtml(renderTemplate(htmlRef.current, buildPartDFlat(flatArgs)));
      toast.success('Part-D saved');
    } catch {
      // interceptor toasted
    } finally {
      setSaving(false);
    }
  };

  // Submit approval = the final step of the unified flow. Persists the Part-D
  // field values, renders the PDF from the filled template, then sends the
  // provider decision (APPROVED / PARTIALLY_APPROVED) with that PDF attached.
  // This replaces the old separate Approve modal — no re-entry, no manual PDF
  // handoff.
  const handleSubmitApproval = async () => {
    if (!htmlRef.current) {
      toast.error('PART_D template not loaded');
      return;
    }
    if (!claimNumber.trim()) {
      toast.error('Claim Number is required');
      return;
    }
    if (!(totalAuthorised > 0)) {
      toast.error('Total Authorised Amount must be greater than 0');
      return;
    }
    if (!uploadedFile) {
      toast.error('Please attach the signed authorization letter');
      return;
    }
    if (exceedsRequested) {
      toast.error(`Approved amount cannot exceed the requested amount (${fmtCap(requestedCap)})`);
      return;
    }
    setSaving(true);
    try {
      // 1. Persist field values (draft pre-approval) so the bill breakdown is
      //    saved on the Part-D row; the backend links this row to the approval
      //    email created in step 2.
      const savePayload = { ...fieldPayload() };
      if (resolvedEmailId != null) savePayload.email_id = resolvedEmailId;
      await claimCaseService.putPartD(claimCaseId, savePayload);

      // 2. Send the approval decision with the user-uploaded signed letter.
      //    A file is mandatory — we no longer auto-generate one here.
      // Compare against THIS round's ask (additional_amount for enhancements,
      // claim.requested_amount for the original PA). The backend coerces the
      // bare status to ENHANCEMENT_APPROVED / PARTIALLY_APPROVED based on prior
      // approvals — we just need to send the right "fully vs partially" hint
      // for this round.
      const requested = Number(pendingRequest?.additional_amount) || Number(claim?.requested_amount) || 0;
      const approved = totalAuthorised;
      const status = (requested > 0 && approved < requested) ? 'PARTIALLY_APPROVED' : 'APPROVED';

      const fd = new FormData();
      fd.append('status', status);
      fd.append('approved_amount', String(approved));
      if (claimNumber.trim()) fd.append('claim_number', claimNumber.trim());
      if (remarks.trim()) fd.append('remarks', remarks.trim());
      fd.append('file', uploadedFile);

      await claimCaseService.providerAction(claimCaseId, fd);
      toast.success('Approval submitted');
      if (typeof onApproved === 'function') onApproved();
      else onClose();
    } catch {
      // interceptor toasted
    } finally {
      setSaving(false);
    }
  };

  const loading = loadingTemplate || loadingData;

  // Stepper: Draft → Saved → Approved. Fill + Save, then Proceed to finalize
  // (upload signed letter / amount / claim number) and Approve.
  const STEPS = ['Draft', 'Saved', 'Approved'];
  // currentStep: 0 = Draft (not saved), 1 = Saved (finalizing / awaiting
  // approval). The Approved node lights up only after Approve completes.
  const currentStep = !meta?.is_persisted ? 0 : 1;

  // Editable numeric input (one Bill-Breakdown / deduction line).
  const renderNumField = (stateKey, label, hint) => (
    <div className="form-group">
      <label>{label}</label>
      <div className={hint ? 'field-inline' : ''}>
        <input
          type="number"
          min="0"
          value={bill[stateKey]}
          onWheel={(e) => e.currentTarget.blur()}
          onChange={(e) => setBillField(stateKey, e.target.value)}
        />
        {hint && <small className="policy-suggestion field-inline__hint">{hint}</small>}
      </div>
    </div>
  );

  // Read-only computed amount (Total Bill / Total Authorised / Insured).
  const renderCalcField = (label, value) => (
    <div className="form-group">
      <label>{label}</label>
      <div className="part-d-fill__readonly">{fmtCap(value)}</div>
    </div>
  );

  return (
    <Modal title="Review & Approve" onClose={onClose} size="lg">
      <div className="part-d-fill">
        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center' }}><Spinner /></div>
        ) : unavailable ? (
          <p style={{ padding: '24px 0', color: '#6b7280' }}>
            Part-D is available after the claim is approved.
          </p>
        ) : !htmlRef.current ? (
          <p>No PART_D template available.</p>
        ) : (
          <>
            <div className="partd-stepper">
              {STEPS.map((label, i) => (
                <div
                  key={label}
                  className={`partd-stepper__step ${
                    i < currentStep ? 'partd-stepper__step--done'
                    : i === currentStep ? 'partd-stepper__step--active'
                    : ''
                  }`}
                >
                  <span className="partd-stepper__dot">{i < currentStep ? '✓' : i + 1}</span>
                  <span className="partd-stepper__label">{label}</span>
                  {i < STEPS.length - 1 && <span className="partd-stepper__line" />}
                </div>
              ))}
            </div>

            {!showApprovePanel && (
            <div className="part-d-fill__inputs">
              {(() => {
                if (!pendingRequest) return null;
                const isIncremental = pendingRequest.additional_amount != null
                  || pendingRequest.revised_total != null
                  || pendingRequest.approved_so_far != null;
                const fallbackRequested = !isIncremental && Number(claim?.requested_amount) > 0
                  ? Number(claim.requested_amount)
                  : null;
                if (!isIncremental && fallbackRequested == null
                    && !pendingRequest.reason_category && !pendingRequest.reason_detail) {
                  return null;
                }
                return (
                  <div
                    style={{
                      marginBottom: 16,
                      padding: '12px 14px',
                      background: 'rgba(79, 70, 229, 0.06)',
                      border: '1px solid rgba(79, 70, 229, 0.25)',
                      borderRadius: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                        color: '#4338ca',
                        marginBottom: 8,
                      }}
                    >
                      Hospital&apos;s request
                    </div>
                    {isIncremental ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>Additional amount</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#4338ca' }}>
                            {pendingRequest.additional_amount != null ? fmtCap(pendingRequest.additional_amount) : '—'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>Already approved</div>
                          <div style={{ fontSize: 16, fontWeight: 600, color: '#374151' }}>
                            {pendingRequest.approved_so_far != null ? fmtCap(pendingRequest.approved_so_far) : '—'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>New total if approved</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>
                            {pendingRequest.revised_total != null ? fmtCap(pendingRequest.revised_total) : '—'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      fallbackRequested != null && (
                        <div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>Requested amount</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#4338ca' }}>
                            {fmtCap(fallbackRequested)}
                          </div>
                        </div>
                      )
                    )}
                    {(pendingRequest.reason_category || pendingRequest.reason_detail) && (
                      <div style={{ marginTop: 10, fontSize: 13, color: '#374151' }}>
                        {pendingRequest.reason_category && (
                          <strong>{pendingRequest.reason_category}</strong>
                        )}
                        {pendingRequest.reason_category && pendingRequest.reason_detail && ' — '}
                        {pendingRequest.reason_detail}
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="form-row">
                <div className="form-group">
                  <label>Approved Amount</label>
                  <div className="part-d-fill__readonly">{fmtCap(totalAuthorised)}</div>
                  {exceedsRequested && (
                    <small style={{ color: '#b91c1c' }}>
                      Exceeds requested {fmtCap(requestedCap)}
                    </small>
                  )}
                </div>
                <div className="form-group">
                  <label>Claim Number <span style={{ color: '#b91c1c' }}>*</span></label>
                  <input
                    type="text"
                    value={claimNumber}
                    onChange={(e) => setClaimNumber(e.target.value)}
                  />
                </div>
              </div>

              <h4 className="part-d-fill__group-title">Bill Breakdown</h4>
              <p style={{ color: '#6b7280', fontSize: 13, marginTop: -4 }}>
                {isEnhancement
                  ? 'Enter the bill amounts for this enhancement — they add up directly.'
                  : 'Prefilled from the hospital’s pre-auth estimate — edit if needed.'}
              </p>
              {!isEnhancement && (
                <div className="form-row">
                  {renderNumField('expectedDays', 'Expected Stay (Days)')}
                  {renderNumField('icuDays', 'ICU Days')}
                </div>
              )}
              <div className="form-row">
                {renderNumField('roomRent', isEnhancement ? 'Non ICU Room' : 'Non ICU Room (per day)',
                  (!isEnhancement && bill.roomRent !== '' && nonIcuDays > 0)
                    ? `× ${nonIcuDays} day${nonIcuDays > 1 ? 's' : ''} = ${fmtCap(roomRentTotal)}` : '')}
                {renderNumField('icuCharges', isEnhancement ? 'ICU Charges' : 'ICU Charges (per day)',
                  (!isEnhancement && bill.icuCharges !== '' && _n(bill.icuDays) > 0)
                    ? `× ${_n(bill.icuDays)} day${_n(bill.icuDays) > 1 ? 's' : ''} = ${fmtCap(icuChargesTotal)}` : '')}
              </div>
              <div className="form-row">
                {renderNumField('investigationCost', 'Investigation Cost')}
                {renderNumField('otCharges', 'OT Charges')}
              </div>
              <div className="form-row">
                {renderNumField('professionalFees', 'Professional Fees')}
                {renderNumField('medicinesCost', 'Medicines Cost')}
              </div>
              <div className="form-row">
                {renderNumField('packageCharges', 'Package Charges')}
                {renderNumField('otherExpenses', 'Other Expenses')}
              </div>

              <h4 className="part-d-fill__group-title">Authorisation Summary</h4>
              <div className="form-row">
                {renderCalcField('Total Bill Amount', totalBill)}
                {renderNumField('discount', 'Discount')}
              </div>
              <div className="form-row">
                {renderNumField('coPay', 'Co-Pay')}
                {renderNumField('deductibles', 'Deductibles')}
              </div>
              <div className="form-row">
                {renderNumField('deductions', 'Other Deductions')}
                {renderCalcField('Total Authorised Amount', totalAuthorised)}
              </div>
              {renderCalcField('Amount to be paid by Insured', amountByInsured)}

              <div className="form-group">
                <label>Remarks</label>
                <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </div>
            </div>
            )}

            {showApprovePanel && (
              <div className="part-d-fill__inputs">
                <h4 className="part-d-fill__group-title">Finalize Approval</h4>
                <p style={{ color: '#6b7280', fontSize: 13, marginTop: -4 }}>
                  Review the saved values below. To change them, go Back and edit the form.
                </p>
                <div className="form-row">
                  <div className="form-group">
                    <label>Approved Amount</label>
                    <div className="part-d-fill__readonly">{fmtCap(totalAuthorised)}</div>
                  </div>
                  <div className="form-group">
                    <label>Claim Number</label>
                    <div className="part-d-fill__readonly">{claimNumber || '—'}</div>
                  </div>
                </div>
                <div className="form-group">
                  <label>Authorization Letter <span style={{ color: '#b91c1c' }}>*</span></label>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                  />
                  <small style={{ color: '#6b7280' }}>
                    {uploadedFile
                      ? `Attached: ${uploadedFile.name}`
                      : 'Required — upload the signed authorization letter to approve. Use “Print letter” to generate one to sign.'}
                  </small>
                </div>
                <div className="form-group">
                  <label>Remarks</label>
                  <div className="part-d-fill__readonly">{remarks || '—'}</div>
                </div>
              </div>
            )}
          </>
        )}

        <div className="modal-actions">
          {!showApprovePanel && (
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
              Close
            </button>
          )}
          {!loading && !unavailable && htmlRef.current && (
            showApprovePanel ? (
              // Finalize panel: go back, print the letter to sign, or approve.
              <>
                <button type="button" className="btn btn--ghost" onClick={() => setShowApprovePanel(false)} disabled={saving}>
                  Back
                </button>
                <button type="button" className="btn btn--ghost" onClick={handlePrint} disabled={saving}>
                  {saving ? <Spinner size={16} /> : 'Print letter'}
                </button>
                <button type="button" className="btn btn--primary" onClick={handleSubmitApproval} disabled={saving || !uploadedFile}>
                  {saving ? <Spinner size={16} /> : 'Approve'}
                </button>
              </>
            ) : currentStep === 0 ? (
              // Draft: save first. Blocked while over the cap or claim number is blank.
              <button type="button" className="btn btn--primary" onClick={handleSave} disabled={saving || exceedsRequested || !claimNumber.trim()}>
                {saving ? <Spinner size={16} /> : 'Save'}
              </button>
            ) : (
              // Saved: update edits, or proceed to the finalize panel. Both
              // blocked while over the cap or claim number is blank.
              <>
                <button type="button" className="btn btn--ghost" onClick={handleSave} disabled={saving || exceedsRequested || !claimNumber.trim()}>
                  {saving ? <Spinner size={16} /> : 'Update'}
                </button>
                <button type="button" className="btn btn--primary" onClick={() => setShowApprovePanel(true)} disabled={saving || exceedsRequested || !claimNumber.trim()}>
                  Proceed
                </button>
              </>
            )
          )}
        </div>
      </div>
    </Modal>
  );
}
