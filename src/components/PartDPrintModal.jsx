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

// [stateKey, apiKey, label] — all free-text strings ("Rs.5,000/day", "N/A", "").
const PARTD_TEXT_FIELDS = [
  ['roomRentPerDay', 'room_rent_per_day', 'Room Rent / Day'],
  ['icuRentPerDay', 'icu_rent_per_day', 'ICU Rent / Day'],
  ['nursingChargesPerDay', 'nursing_charges_per_day', 'Nursing Charges / Day'],
  ['consultantVisitChargesPerDay', 'consultant_visit_charges_per_day', 'Consultant Visit Charges / Day'],
  ['surgeonAnesthetistFee', 'surgeon_anesthetist_fee', 'Surgeon Fee / OT / Anesthetist'],
  ['others', 'others', 'Others'],
  ['totalBillAmount', 'total_bill_amount', 'Total Bill Amount'],
  ['deductionsDetail', 'deductions_detail', 'Deductions Detail'],
  ['discount', 'discount', 'Discount'],
  ['coPay', 'co_pay', 'Co-Pay'],
  ['deductibles', 'deductibles', 'Deductibles'],
  ['totalAuthorisedAmount', 'total_authorised_amount', 'Total Authorised Amount'],
  ['amountToBePaidByInsured', 'amount_to_be_paid_by_insured', 'Amount to be paid by Insured'],
];

const EMPTY_TEXT_STATE = PARTD_TEXT_FIELDS.reduce((acc, [k]) => { acc[k] = ''; return acc; }, {});

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
  const [approveAmount, setApproveAmount] = useState('');
  const [claimNumber, setClaimNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [textFields, setTextFields] = useState(EMPTY_TEXT_STATE);
  // Saved stage → "Proceed" reveals the finalize panel (file upload + amount +
  // claim number + Approve). Optional signed-letter upload lives there.
  const [showApprovePanel, setShowApprovePanel] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);

  const setTextField = (key, value) => setTextFields((prev) => ({ ...prev, [key]: value }));

  // The Approved Amount field represents this round's approval increment
  // (the backend ADDS it to claim_case.approved_amount). So the cap is what
  // the hospital just asked for in this round:
  //   • Enhancement / reconsider → `additional_amount` (e.g. ₹10K)
  //   • Original pre-auth → `claim.requested_amount` (the full ask)
  const requestedCap = Number(pendingRequest?.additional_amount) || Number(claim?.requested_amount) || 0;
  const exceedsRequested = requestedCap > 0 && Number(approveAmount) > requestedCap;
  const fmtCap = (n) => Number(n).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

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
    // Only hydrate the Approved Amount from a *persisted* Part-D row. The
    // backend's stub response (is_persisted=false) returns the cumulative
    // claim_case.approved_amount, which would mislead the provider into
    // approving the wrong increment.
    if (data.is_persisted) {
      setApproveAmount(data.approved_amount != null ? String(data.approved_amount) : '');
    } else {
      setApproveAmount('');
    }
    setClaimNumber(data.claim_number ?? '');
    setRemarks(data.remarks ?? '');
    setTextFields(
      PARTD_TEXT_FIELDS.reduce((acc, [stateKey, apiKey]) => {
        acc[stateKey] = data[apiKey] ?? '';
        return acc;
      }, {}),
    );
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
            // Leave Approved Amount blank — the provider must explicitly type
            // the amount they're approving this round. The "Hospital's request"
            // banner above the field shows them the relevant numbers.
            setApproveAmount('');
            setClaimNumber(claim?.claim_number || '');
          }
        } else if (sc === 404 && emailId == null) {
          // GET returned 404 (no part-d row and no approval). Same as above:
          // open the editor and let Save/Print create the approval inline.
          if (!cancelled) {
            setApproveAmount('');
            setClaimNumber(claim?.claim_number || '');
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

  const buildFlatArgs = () => ({
    claim,
    approveAmount,
    claimNumber,
    remarks,
    roomRentPerDay: textFields.roomRentPerDay,
    icuRentPerDay: textFields.icuRentPerDay,
    nursingChargesPerDay: textFields.nursingChargesPerDay,
    consultantVisitChargesPerDay: textFields.consultantVisitChargesPerDay,
    surgeonAnesthetistFee: textFields.surgeonAnesthetistFee,
    others: textFields.others,
    totalBillAmount: textFields.totalBillAmount,
    deductionsDetail: textFields.deductionsDetail,
    discount: textFields.discount,
    coPay: textFields.coPay,
    deductibles: textFields.deductibles,
    totalAuthorisedAmount: textFields.totalAuthorisedAmount,
    amountToBePaidByInsured: textFields.amountToBePaidByInsured,
  });

  // Build the field-value payload (snake_case) used by both Save and Generate.
  const fieldPayload = () => {
    const out = {};
    // approved_amount is the only numeric field; '' clears it.
    out.approved_amount = approveAmount === '' || approveAmount == null
      ? ''
      : Number(approveAmount);
    out.claim_number = claimNumber ?? '';
    out.remarks = remarks ?? '';
    PARTD_TEXT_FIELDS.forEach(([stateKey, apiKey]) => {
      out[apiKey] = textFields[stateKey] ?? '';
    });
    return out;
  };

  const afterSave = (data) => {
    hydrate(data);
    if (typeof onSaved === 'function') onSaved(data);
  };

  // Save draft = pure data persist. No approval trigger. Pre-approval saves go
  // as a draft (no email_id in payload); the backend creates a draft Part-D row
  // with claim_case_email_id IS NULL, and links it to the approval email later
  // when the provider hits "Submit approval".
  const handleSave = async () => {
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
    if (approveAmount === '' || Number.isNaN(Number(approveAmount))) {
      toast.error('Approved amount is required');
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

      // 2. Use the uploaded signed letter if provided, else render the PDF
      //    from the filled template. Send the approval decision with it.
      let fileToSend;
      if (uploadedFile) {
        fileToSend = uploadedFile;
      } else {
        const blob = await renderPartDPdfBlob({ htmlTemplate: htmlRef.current, ...buildFlatArgs() });
        const filename = `PartD_${claimNumber || claim?.claim_number || claimCaseId}.pdf`;
        fileToSend = new File([blob], filename, { type: 'application/pdf' });
      }
      // Compare against THIS round's ask (additional_amount for enhancements,
      // claim.requested_amount for the original PA). The backend coerces the
      // bare status to ENHANCEMENT_APPROVED / PARTIALLY_APPROVED based on prior
      // approvals — we just need to send the right "fully vs partially" hint
      // for this round.
      const requested = Number(pendingRequest?.additional_amount) || Number(claim?.requested_amount) || 0;
      const approved = Number(approveAmount);
      const status = (requested > 0 && approved < requested) ? 'PARTIALLY_APPROVED' : 'APPROVED';

      const fd = new FormData();
      fd.append('status', status);
      fd.append('approved_amount', String(approved));
      if (claimNumber.trim()) fd.append('claim_number', claimNumber.trim());
      if (remarks.trim()) fd.append('remarks', remarks.trim());
      fd.append('file', fileToSend);

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
                  <input
                    type="number"
                    value={approveAmount}
                    onChange={(e) => setApproveAmount(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    min="0"
                    max={requestedCap || undefined}
                    placeholder={requestedCap > 0 ? `Up to ${fmtCap(requestedCap)}` : ''}
                  />
                  {exceedsRequested && (
                    <small style={{ color: '#b91c1c' }}>
                      Cannot exceed requested {fmtCap(requestedCap)}
                    </small>
                  )}
                </div>
                <div className="form-group">
                  <label>Claim Number</label>
                  <input
                    type="text"
                    value={claimNumber}
                    onChange={(e) => setClaimNumber(e.target.value)}
                  />
                </div>
              </div>

              <h4 className="part-d-fill__group-title">Bill Breakdown</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Room Rent / Day</label>
                  <input type="text" placeholder="e.g. Rs.5,000/day" value={textFields.roomRentPerDay}
                    onChange={(e) => setTextField('roomRentPerDay', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>ICU Rent / Day</label>
                  <input type="text" placeholder="e.g. Rs.12,000/day" value={textFields.icuRentPerDay}
                    onChange={(e) => setTextField('icuRentPerDay', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Nursing Charges / Day</label>
                  <input type="text" value={textFields.nursingChargesPerDay}
                    onChange={(e) => setTextField('nursingChargesPerDay', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Consultant Visit Charges / Day</label>
                  <input type="text" value={textFields.consultantVisitChargesPerDay}
                    onChange={(e) => setTextField('consultantVisitChargesPerDay', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Surgeon Fee / OT / Anesthetist</label>
                  <input type="text" value={textFields.surgeonAnesthetistFee}
                    onChange={(e) => setTextField('surgeonAnesthetistFee', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Others</label>
                  <input type="text" placeholder="e.g. Package / N/A" value={textFields.others}
                    onChange={(e) => setTextField('others', e.target.value)} />
                </div>
              </div>

              <h4 className="part-d-fill__group-title">Authorisation Summary</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Total Bill Amount</label>
                  <input type="text" value={textFields.totalBillAmount}
                    onChange={(e) => setTextField('totalBillAmount', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Deductions Detail</label>
                  <input type="text" value={textFields.deductionsDetail}
                    onChange={(e) => setTextField('deductionsDetail', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Discount</label>
                  <input type="text" value={textFields.discount}
                    onChange={(e) => setTextField('discount', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Co-Pay</label>
                  <input type="text" value={textFields.coPay}
                    onChange={(e) => setTextField('coPay', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Deductibles</label>
                  <input type="text" value={textFields.deductibles}
                    onChange={(e) => setTextField('deductibles', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Total Authorised Amount</label>
                  <input type="text" value={textFields.totalAuthorisedAmount}
                    onChange={(e) => setTextField('totalAuthorisedAmount', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Amount to be paid by Insured</label>
                <input type="text" value={textFields.amountToBePaidByInsured}
                  onChange={(e) => setTextField('amountToBePaidByInsured', e.target.value)} />
              </div>

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
                    <div className="part-d-fill__readonly">{fmtCap(Number(approveAmount) || 0)}</div>
                  </div>
                  <div className="form-group">
                    <label>Claim Number</label>
                    <div className="part-d-fill__readonly">{claimNumber || '—'}</div>
                  </div>
                </div>
                <div className="form-group">
                  <label>Authorization Letter (optional)</label>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                  />
                  <small style={{ color: '#6b7280' }}>
                    {uploadedFile
                      ? `Attached: ${uploadedFile.name}`
                      : 'Leave empty to auto-generate the letter from the template.'}
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
                <button type="button" className="btn btn--primary" onClick={handleSubmitApproval} disabled={saving}>
                  {saving ? <Spinner size={16} /> : 'Approve'}
                </button>
              </>
            ) : currentStep === 0 ? (
              // Draft: save first.
              <button type="button" className="btn btn--primary" onClick={handleSave} disabled={saving}>
                {saving ? <Spinner size={16} /> : 'Save'}
              </button>
            ) : (
              // Saved: update edits, or proceed to the finalize panel.
              <>
                <button type="button" className="btn btn--ghost" onClick={handleSave} disabled={saving}>
                  {saving ? <Spinner size={16} /> : 'Update'}
                </button>
                <button type="button" className="btn btn--primary" onClick={() => setShowApprovePanel(true)} disabled={saving}>
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
