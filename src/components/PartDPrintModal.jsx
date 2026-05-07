import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import Spinner from './Spinner';
import { useToast } from './Toast';
import { formTemplateService } from '../services/api';
import { buildPartDFlat, renderTemplate } from './partDTemplate';

// Fill-and-print Part D form. The provider edits the line-item / summary
// values that aren't already on the claim or hospital form, and prints the
// fully-populated template. Auto-fillable values (patient, hospital, TPA,
// dates, diagnosis, etc.) are pulled in via buildPartDFlat → no UI needed.
export default function PartDPrintModal({ claim, onClose }) {
  const toast = useToast();
  const iframeRef = useRef(null);
  const htmlRef = useRef('');
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  const [approveAmount, setApproveAmount] = useState(
    claim?.approved_amount || claim?.requested_amount || ''
  );
  const [claimNumber, setClaimNumber] = useState(claim?.claim_number || '');
  const [remarks, setRemarks] = useState('');

  const [roomRentPerDay, setRoomRentPerDay] = useState('');
  const [icuRentPerDay, setIcuRentPerDay] = useState('');
  const [nursingChargesPerDay, setNursingChargesPerDay] = useState('');
  const [consultantVisitChargesPerDay, setConsultantVisitChargesPerDay] = useState('');
  const [surgeonAnesthetistFee, setSurgeonAnesthetistFee] = useState('');
  const [others, setOthers] = useState('');

  const [totalBillAmount, setTotalBillAmount] = useState('');
  const [deductionsDetail, setDeductionsDetail] = useState('');
  const [discount, setDiscount] = useState('');
  const [coPay, setCoPay] = useState('');
  const [deductibles, setDeductibles] = useState('');
  const [totalAuthorisedAmount, setTotalAuthorisedAmount] = useState('');
  const [amountToBePaidByInsured, setAmountToBePaidByInsured] = useState('');

  // Fetch template once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await formTemplateService.getFirstByType('PART_D');
        if (cancelled) return;
        const html = res?.data?.html_content || '';
        htmlRef.current = html;
        if (!html) toast.error('PART_D template not available');
      } catch {
        // axios interceptor surfaces toast
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render the iframe preview whenever any input changes. Debounced so
  // typing stays smooth, and scroll position is preserved across rewrites.
  useEffect(() => {
    if (loading) return;
    const iframe = iframeRef.current;
    const html = htmlRef.current;
    if (!iframe || !html) return;

    const timer = setTimeout(() => {
      const flat = buildPartDFlat({
        claim,
        approveAmount, claimNumber, remarks,
        roomRentPerDay, icuRentPerDay, nursingChargesPerDay,
        consultantVisitChargesPerDay, surgeonAnesthetistFee, others,
        totalBillAmount, deductionsDetail, discount, coPay,
        deductibles, totalAuthorisedAmount, amountToBePaidByInsured,
      });
      const rendered = renderTemplate(html, flat);
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      const prevScroll = iframe.contentWindow?.scrollY || 0;
      doc.open();
      doc.write(rendered);
      doc.close();
      const apply = () => {
        setReady(true);
        try { iframe.contentWindow?.scrollTo(0, prevScroll); } catch {
          // cross-origin or detached frame — ignore
        }
      };
      if (doc.readyState === 'complete') apply();
      else iframe.onload = apply;
    }, 250);

    return () => clearTimeout(timer);
  }, [
    loading, claim,
    approveAmount, claimNumber, remarks,
    roomRentPerDay, icuRentPerDay, nursingChargesPerDay,
    consultantVisitChargesPerDay, surgeonAnesthetistFee, others,
    totalBillAmount, deductionsDetail, discount, coPay,
    deductibles, totalAuthorisedAmount, amountToBePaidByInsured,
  ]);

  const handlePrint = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  };

  return (
    <Modal title="Part D" onClose={onClose} size="lg">
      <div className="part-d-fill">
        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <Spinner />
          </div>
        ) : !htmlRef.current ? (
          <p>No PART_D template available.</p>
        ) : (
          <>
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
                  <input type="number" value={roomRentPerDay}
                    onChange={(e) => setRoomRentPerDay(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>ICU Rent / Day</label>
                  <input type="number" value={icuRentPerDay}
                    onChange={(e) => setIcuRentPerDay(e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Nursing Charges / Day</label>
                  <input type="number" value={nursingChargesPerDay}
                    onChange={(e) => setNursingChargesPerDay(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Consultant Visit Charges / Day</label>
                  <input type="number" value={consultantVisitChargesPerDay}
                    onChange={(e) => setConsultantVisitChargesPerDay(e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Surgeon Fee / OT / Anesthetist</label>
                  <input type="number" value={surgeonAnesthetistFee}
                    onChange={(e) => setSurgeonAnesthetistFee(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Others</label>
                  <input type="number" value={others}
                    onChange={(e) => setOthers(e.target.value)} />
                </div>
              </div>

              <h4 className="part-d-fill__group-title">Authorisation Summary (INR)</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Total Bill Amount</label>
                  <input type="number" value={totalBillAmount}
                    onChange={(e) => setTotalBillAmount(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Deductions Detail</label>
                  <input type="number" value={deductionsDetail}
                    onChange={(e) => setDeductionsDetail(e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Discount</label>
                  <input type="number" value={discount}
                    onChange={(e) => setDiscount(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Co-Pay</label>
                  <input type="number" value={coPay}
                    onChange={(e) => setCoPay(e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Deductibles</label>
                  <input type="number" value={deductibles}
                    onChange={(e) => setDeductibles(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Total Authorised Amount</label>
                  <input type="number" value={totalAuthorisedAmount}
                    onChange={(e) => setTotalAuthorisedAmount(e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Amount to be paid by Insured</label>
                <input type="number" value={amountToBePaidByInsured}
                  onChange={(e) => setAmountToBePaidByInsured(e.target.value)} />
              </div>

              <div className="form-group">
                <label>Remarks</label>
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>
            </div>

            <iframe
              ref={iframeRef}
              title="PART_D form"
              className="part-d-fill__frame"
            />
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Close</button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handlePrint}
            disabled={!ready}
          >
            Print
          </button>
        </div>
      </div>
    </Modal>
  );
}
