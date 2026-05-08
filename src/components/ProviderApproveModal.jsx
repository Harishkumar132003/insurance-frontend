import { useEffect, useRef, useState } from 'react';
import html2pdf from 'html2pdf.js';
import Modal from './Modal';
import Spinner from './Spinner';
import { useToast } from './Toast';
import { formTemplateService, claimCaseService } from '../services/api';
import { buildPartDFlat, renderTemplate } from './partDTemplate';

// Bake computed styles into inline `style` attributes so html2pdf's clone (which
// drops the iframe's stylesheets) still renders correctly. Mirrors the trick in
// PreAuthPrint.handleUploadSignedCopy.
function inlineComputedStyles(root, win) {
  const nodes = [root, ...root.querySelectorAll('*')];
  nodes.forEach((el) => {
    if (!(el instanceof win.HTMLElement) && !(el instanceof win.SVGElement)) return;
    const computed = win.getComputedStyle(el);
    let cssText = '';
    for (let i = 0; i < computed.length; i += 1) {
      const prop = computed[i];
      cssText += `${prop}:${computed.getPropertyValue(prop)};`;
    }
    el.setAttribute('style', cssText);
  });
}

const IFRAME_ID = 'provider-approve-print-frame';

function ensureHiddenIframe() {
  let iframe = document.getElementById(IFRAME_ID);
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = IFRAME_ID;
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:none;left:-9999px;';
    document.body.appendChild(iframe);
  }
  return iframe;
}

export default function ProviderApproveModal({ claim, onClose, onSubmitted }) {
  const toast = useToast();

  const [approveAmount, setApproveAmount] = useState(
    claim?.approved_amount || claim?.requested_amount || ''
  );
  const [claimNumber, setClaimNumber] = useState(claim?.claim_number || '');
  const [remarks, setRemarks] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(true);
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

  const writeAndPopulate = (iframe, onReady) => {
    const flat = buildPartDFlat({ claim, approveAmount, claimNumber, remarks });
    const html = renderTemplate(htmlRef.current, flat);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    const apply = () => onReady(doc);
    if (doc.readyState === 'complete') apply();
    else iframe.onload = apply;
  };

  const capturePdfBlob = async (iframe) => {
    const iframeDoc = iframe.contentDocument;
    const iframeWin = iframe.contentWindow;
    if (!iframeDoc?.body || !iframeWin) throw new Error('Template not ready');

    inlineComputedStyles(iframeDoc.body, iframeWin);
    const contentWidth = Math.max(
      iframeDoc.body.scrollWidth,
      iframeDoc.documentElement.scrollWidth,
      794,
    );
    const wrapper = document.createElement('div');
    wrapper.style.cssText = [
      'position:fixed', 'left:0', 'top:0', `width:${contentWidth}px`,
      'background:#fff', 'color:#000', 'opacity:0', 'pointer-events:none',
      'z-index:-1', 'margin:0', 'padding:0',
    ].join(';');
    const bodyStyle = iframeDoc.body.getAttribute('style') || '';
    wrapper.setAttribute('style', `${bodyStyle};${wrapper.getAttribute('style')}`);
    Array.from(iframeDoc.body.children).forEach((child) => {
      wrapper.appendChild(child.cloneNode(true));
    });
    document.body.appendChild(wrapper);
    try {
      const blob = await html2pdf()
        .set({
          margin: 10,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            windowWidth: contentWidth,
            width: contentWidth,
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] },
        })
        .from(wrapper)
        .outputPdf('blob');
      return blob;
    } finally {
      if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    }
  };

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
        const iframe = ensureHiddenIframe();
        const ready = new Promise((resolve) => writeAndPopulate(iframe, resolve));
        await ready;
        const blob = await capturePdfBlob(iframe);
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

  return (
    <Modal title="Approve" onClose={onClose}>
      <div className="modal-form">
        <div className="form-group">
          <label>Patient</label>
          <div>{claim?.patient_name || '—'} — {claim?.uhid || '—'}</div>
        </div>

        <div className="form-group">
          <label>Approved Amount <span style={{ color: '#b91c1c' }}>*</span></label>
          <input
            type="number"
            placeholder="e.g. 50000"
            value={approveAmount}
            onChange={(e) => setApproveAmount(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label>Claim Number</label>
          <input
            type="text"
            placeholder="e.g. CLM-2026-1234"
            value={claimNumber}
            onChange={(e) => setClaimNumber(e.target.value)}
          />
        </div>

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
            disabled={saving || (!uploadedFile && loadingTemplate)}
          >
            {saving ? <Spinner size={16} /> : 'Submit'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
