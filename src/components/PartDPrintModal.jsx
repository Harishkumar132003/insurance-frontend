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

function statusBadge(meta) {
  if (!meta) return null;
  if (!meta.is_persisted) return { label: 'Part-D not started', cls: 'default' };
  if (meta.attachment_id == null) return { label: 'Saved (not yet printed)', cls: 'info' };
  return { label: 'Part-D generated', cls: 'success' };
}

export default function PartDPrintModal({ claim, claimCaseId, emailId, onClose, onSaved }) {
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

  const setTextField = (key, value) => setTextFields((prev) => ({ ...prev, [key]: value }));

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
    setApproveAmount(data.approved_amount != null ? String(data.approved_amount) : '');
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
        if (sc === 404) {
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

  const handleSave = async () => {
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

  // Print: persist the field values + the rendered PDF (so the letter is
  // attached to the approval email), then open the browser print dialog with
  // the populated Part-D.
  const handlePrint = async () => {
    if (!htmlRef.current) {
      toast.error('PART_D template not loaded');
      return;
    }
    setSaving(true);
    try {
      const flatArgs = buildFlatArgs();
      const blob = await renderPartDPdfBlob({ htmlTemplate: htmlRef.current, ...flatArgs });
      const filename = `PartD_${claimNumber || claim?.claim_number || claimCaseId}.pdf`;
      const fd = new FormData();
      if (resolvedEmailId != null) fd.append('email_id', String(resolvedEmailId));
      Object.entries(fieldPayload()).forEach(([k, v]) => fd.append(k, v == null ? '' : String(v)));
      fd.append('file', blob, filename);
      const res = await claimCaseService.putPartD(claimCaseId, fd);
      afterSave(res.data);
      printPartDHtml(renderTemplate(htmlRef.current, buildPartDFlat(flatArgs)));
      toast.success('Part-D saved');
    } catch {
      // interceptor toasted
    } finally {
      setSaving(false);
    }
  };

  const loading = loadingTemplate || loadingData;
  const badge = statusBadge(meta);

  return (
    <Modal title="Part D" onClose={onClose} size="lg">
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
            {badge && (
              <div style={{ marginBottom: 12 }}>
                <span className={`badge badge--${badge.cls}`}>{badge.label}</span>
              </div>
            )}

            <div className="part-d-fill__inputs">
              <div className="form-row">
                <div className="form-group">
                  <label>Approved Amount</label>
                  <input
                    type="number"
                    value={approveAmount}
                    onChange={(e) => setApproveAmount(e.target.value)}
                  />
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
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Close
          </button>
          {!loading && !unavailable && htmlRef.current && (
            <>
              <button type="button" className="btn btn--ghost" onClick={handleSave} disabled={saving}>
                {saving ? <Spinner size={16} /> : 'Save'}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handlePrint}
                disabled={saving}
              >
                {saving ? <Spinner size={16} /> : 'Print'}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
