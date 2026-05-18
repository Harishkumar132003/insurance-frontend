import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import Spinner from './Spinner';
import { useToast } from './Toast';
import { formTemplateService, claimCaseService } from '../services/api';
import { renderPartDPdfBlob } from './partDTemplate';

export default function ProviderApproveModal({ claim, onClose, onSubmitted }) {
  const toast = useToast();

  // approveAmount + claimNumber are sourced exclusively from the Part-D form
  // (draft pre-approval, or the bound letter post-approval) — never edited
  // here. The Approve modal displays them read-only.
  const [approveAmount, setApproveAmount] = useState('');
  const [claimNumber, setClaimNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(true);
  const [loadingPartD, setLoadingPartD] = useState(true);
  const htmlRef = useRef('');

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
        if (!cancelled) setLoadingTemplate(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Approved amount + claim number come from the Part-D form (draft or
  // approval-bound). The Approve modal only displays them — the provider edits
  // them inside the Part-D modal. Load-blocking so we can show a clear
  // "fill Part-D first" warning when nothing has been saved yet.
  useEffect(() => {
    if (!claim?.claim_case_id) {
      setLoadingPartD(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await claimCaseService.getPartD(claim.claim_case_id);
        if (cancelled || !res?.data) return;
        const d = res.data;
        if (d.approved_amount != null) setApproveAmount(String(d.approved_amount));
        if (d.claim_number != null && d.claim_number !== '') setClaimNumber(d.claim_number);
      } catch {
        // silentStatuses on getPartD already suppresses toasts for 400/404.
        // We don't seed any fallback — leaving fields empty triggers the
        // "fill Part-D first" warning in the UI.
      } finally {
        if (!cancelled) setLoadingPartD(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claim?.claim_case_id]);

  const handleSubmit = async () => {
    if (!claim) return;
    if (approveAmount === '' || Number.isNaN(Number(approveAmount))) {
      toast.error('Approved amount is required');
      return;
    }
    // If the user didn't attach a file, we fall back to generating one from
    // the PART_D template — so the template must be loaded in that case.
    if (!uploadedFile && !htmlRef.current) {
      toast.error('Attach a file or wait for the PART_D template to load');
      return;
    }

    setSaving(true);
    try {
      let fileToSend;
      if (uploadedFile) {
        fileToSend = uploadedFile;
      } else {
        const blob = await renderPartDPdfBlob({
          htmlTemplate: htmlRef.current,
          claim,
          approveAmount,
          claimNumber,
          remarks,
        });
        const filename = `part-d-${claim.claim_number || claim.claim_case_id}.pdf`;
        fileToSend = new File([blob], filename, { type: 'application/pdf' });
      }

      const requested = Number(claim.requested_amount) || 0;
      const approved = Number(approveAmount);
      const status = (requested > 0 && approved < requested) ? 'PARTIALLY_APPROVED' : 'APPROVED';

      const fd = new FormData();
      fd.append('status', status);
      fd.append('approved_amount', String(approved));
      if (claimNumber.trim()) fd.append('claim_number', claimNumber.trim());
      if (remarks.trim()) fd.append('remarks', remarks.trim());
      fd.append('file', fileToSend);

      await claimCaseService.providerAction(claim.claim_case_id, fd);
      toast.success('Response submitted');
      onSubmitted();
    } catch {
      // axios interceptor surfaces toast
    } finally {
      setSaving(false);
    }
  };

  const formatINR = (val) => {
    if (val === '' || val == null) return '—';
    const num = Number(val);
    if (Number.isNaN(num)) return String(val);
    return num.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  };
  const requestedAmt = Number(claim?.requested_amount) || 0;
  const approvedAmtNum = Number(approveAmount);
  const isPartial = approveAmount !== '' && Number.isFinite(approvedAmtNum)
    && requestedAmt > 0 && approvedAmtNum < requestedAmt;
  const partDMissing = !loadingPartD
    && (approveAmount === '' || Number.isNaN(approvedAmtNum) || approvedAmtNum <= 0);

  return (
    <Modal title="Approve" onClose={onClose}>
      <div className="modal-form">
        <div className="form-group">
          <label>Patient</label>
          <div>{claim?.patient_name || '—'} — {claim?.uhid || '—'}</div>
        </div>

        <div className="form-group">
          <label>Approved Amount <span style={{ color: '#b91c1c' }}>*</span></label>
          <div>
            {loadingPartD ? <Spinner size={14} /> : formatINR(approveAmount)}
            {!loadingPartD && isPartial && (
              <span className="provider-approve__file-hint" style={{ marginLeft: 8 }}>
                (partial — below requested {formatINR(claim?.requested_amount)})
              </span>
            )}
          </div>
          <p className="provider-approve__file-hint">
            Set this in the Part-D form. Read-only here.
          </p>
        </div>

        <div className="form-group">
          <label>Claim Number</label>
          <div>{loadingPartD ? <Spinner size={14} /> : (claimNumber || '—')}</div>
          <p className="provider-approve__file-hint">
            Set this in the Part-D form. Read-only here.
          </p>
        </div>

        {partDMissing && (
          <div className="form-group">
            <p
              className="provider-approve__file-hint"
              style={{
                background: '#fef3c7',
                color: '#92400e',
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid #fde68a',
              }}
            >
              Set the approved amount + claim number in the Part-D form first.
            </p>
          </div>
        )}

        <div className="form-group">
          <label>Remarks</label>
          <textarea
            rows={3}
            placeholder="Optional notes"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Attach Signed PDF (optional)</label>
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
          />
          {uploadedFile ? (
            <p className="provider-approve__file-hint">
              <strong>{uploadedFile.name}</strong>
              {' '}({Math.round(uploadedFile.size / 1024)} KB)
              <button
                type="button"
                className="provider-approve__file-clear"
                onClick={() => setUploadedFile(null)}
              >
                Remove
              </button>
            </p>
          ) : (
            <p className="provider-approve__file-hint">
              Leave empty to auto-generate a populated PART_D PDF on submit.
            </p>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleSubmit}
            disabled={saving || loadingPartD || partDMissing || (!uploadedFile && loadingTemplate)}
          >
            {saving ? <Spinner size={16} /> : 'Submit'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
