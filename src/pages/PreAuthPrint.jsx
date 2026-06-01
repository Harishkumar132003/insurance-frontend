import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import html2pdf from 'html2pdf.js';
import { claimCaseService, formTemplateService, documentService } from '../services/api';
import { useToast } from '../components/Toast';
import { IconArrowLeft } from '../components/icons/Icons';
import Spinner from '../components/Spinner';
import './Pages.scss';

// Flatten data_json the same way PreAuthFormPage.getFlatFormData does so the
// same templates work in both the inline-print flow and this preview page.
function flattenDataJson(dataJson) {
  const flat = {};
  for (const [, sectionData] of Object.entries(dataJson || {})) {
    if (!sectionData || typeof sectionData !== 'object' || Array.isArray(sectionData)) continue;
    for (const [key, val] of Object.entries(sectionData)) {
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        for (const [subKey, subVal] of Object.entries(val)) {
          flat[subKey] = subVal;
        }
      } else if (Array.isArray(val)) {
        // Primitive arrays print as a joined string; object arrays (e.g. the
        // `treatments` group) are skipped — flat fields are derived on save.
        flat[key] = val.filter((s) => s != null && typeof s !== 'object' && String(s).trim()).join('; ');
      } else {
        flat[key] = val;
      }
    }
  }
  const decl = dataJson?.declaration || {};
  if (decl.doctor_name) flat.decl_doctor_name = decl.doctor_name;
  const pd = dataJson?.patient_declaration || {};
  if (pd.patient_name) flat.pd_patient_name = pd.patient_name;
  if (pd.contact_number) flat.pd_contact_number = pd.contact_number;
  if (pd.email) flat.pd_email = pd.email;
  if (pd.date) flat.pd_date = pd.date;
  if (pd.time) flat.pd_time = pd.time;
  return flat;
}

// Populate the iframe doc's [data-field] elements with values. Mirrors the
// exact logic in PreAuthFormPage.populateAndPrint so the templates render
// identically — `el.value` / `el.checked` on real DOM elements (not just
// attribute baking), so textareas / selects / checkboxes work correctly.
function populateIframe(iframeDoc, flat) {
  iframeDoc.querySelectorAll('[data-field]').forEach((el) => {
    const field = el.getAttribute('data-field');
    const value = flat[field];
    if (value === undefined || value === null || value === '') return;
    if (el.type === 'radio') {
      if (el.value === String(value)) el.checked = true;
    } else if (el.type === 'checkbox') {
      el.checked = !!value;
    } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      el.value = value;
    } else {
      el.textContent = String(value);
    }
  });
}

export default function PreAuthPrint() {
  const navigate = useNavigate();
  const toast = useToast();
  const { claimCaseId } = useParams();
  const [loading, setLoading] = useState(true);
  const [claim, setClaim] = useState(null);
  const [templateReady, setTemplateReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const iframeRef = useRef(null);
  // Cache the latest values so the iframe load handler can populate without
  // recomputing or hitting state setters mid-load.
  const flatRef = useRef({});
  const htmlRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // Always fetch the PRE_AUTH template — never let a PART_D one win by
        // sort order. `/first?form_type=PRE_AUTH` returns the full template
        // including html_content, so we don't need a follow-up getById.
        const [claimRes, tplRes] = await Promise.all([
          claimCaseService.getById(claimCaseId),
          formTemplateService.getFirstByType('PRE_AUTH').catch(() => null),
        ]);
        if (cancelled) return;
        const cc = claimRes.data;
        const html = tplRes?.data?.html_content || '';
        const latestForm = Array.isArray(cc.form_data) && cc.form_data.length > 0
          ? cc.form_data[cc.form_data.length - 1]
          : null;
        flatRef.current = flattenDataJson(latestForm?.sections || {});
        htmlRef.current = html;
        setClaim(cc);
        if (!html) {
          toast.error('No form template available for this claim');
        }
      } catch {
        // axios interceptor surfaces the toast
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimCaseId]);

  // After the iframe mounts and the html is ready, write the template into it
  // and populate fields. This mirrors the existing PreAuthFormPage approach.
  useEffect(() => {
    if (loading) return;
    const iframe = iframeRef.current;
    const html = htmlRef.current;
    if (!iframe || !html) {
      setTemplateReady(false);
      return;
    }
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    const apply = () => {
      populateIframe(doc, flatRef.current);
      setTemplateReady(true);
    };
    if (doc.readyState === 'complete') {
      apply();
    } else {
      iframe.onload = apply;
    }
  }, [loading]);

  const paLabel = useMemo(() => {
    if (!claim) return '';
    const pa = claim.pa_number || claim.claim_number || '';
    return pa ? `Pre-Authorisation Form (Part C) · ${pa}` : 'Pre-Authorisation Form (Part C)';
  }, [claim]);

  const handlePrint = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  };

  // Capture the rendered Part C template (from inside the iframe) as a PDF
  // and upload it to the claim's documents endpoint — same endpoint that
  // powers the sidebar's Documents card → "Submission" group.
  //
  // html2pdf clones the target node into a temp container in the host
  // document, but doesn't carry over the iframe's <head> stylesheets — so
  // captures looked unstyled. Workaround: build a hidden host-document
  // wrapper that includes the iframe's <style>/<link> tags + body content,
  // capture that, then remove it.
  const handleUploadSignedCopy = async () => {
    const iframe = iframeRef.current;
    const iframeDoc = iframe?.contentDocument;
    const iframeWin = iframe?.contentWindow;
    if (!iframeDoc?.body || !iframeWin) {
      toast.error('Template not ready');
      return;
    }
    const pa = claim?.pa_number || claim?.claim_number || claimCaseId;
    const filename = `part-c-${pa}.pdf`;

    // Walk every element in the iframe's body and bake its computed styles
    // into an inline `style` attribute. The iframe's stylesheet rules don't
    // travel when we clone to the host document, but inline styles do — so
    // freezing them here makes the clone self-contained.
    const inlineComputedStyles = (root, win) => {
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
    };

    setUploading(true);
    let wrapper = null;
    try {
      // 1. Freeze styles inside the iframe (won't disturb the on-screen iframe
      //    visibly because all the same styles are still applied).
      inlineComputedStyles(iframeDoc.body, iframeWin);

      // 2. Measure the real content width so the wrapper doesn't clip a
      //    template that's wider than A4 — html2pdf will scale it down to
      //    fit the page on capture.
      const contentWidth = Math.max(
        iframeDoc.body.scrollWidth,
        iframeDoc.documentElement.scrollWidth,
        794,
      );

      // 3. Clone the body into a host-document wrapper that's on-screen but
      //    invisible. html2canvas needs the node in the live viewport with
      //    real dimensions; opacity:0 keeps it measurable.
      wrapper = document.createElement('div');
      wrapper.style.cssText = [
        'position:fixed',
        'left:0',
        'top:0',
        `width:${contentWidth}px`,
        'background:#fff',
        'color:#000',
        'opacity:0',
        'pointer-events:none',
        'z-index:-1',
        'margin:0',
        'padding:0',
      ].join(';');
      // Copy body inline style so background/colour cascade onto children,
      // but force our positioning rules to win by appending them last.
      const bodyStyle = iframeDoc.body.getAttribute('style') || '';
      wrapper.setAttribute(
        'style',
        `${bodyStyle};${wrapper.getAttribute('style')}`,
      );
      Array.from(iframeDoc.body.children).forEach((child) => {
        wrapper.appendChild(child.cloneNode(true));
      });
      document.body.appendChild(wrapper);

      // 4. Capture. windowWidth must match the wrapper so html2canvas lays
      //    things out at the right size; html2pdf then fits to A4.
      const blob = await html2pdf()
        .set({
          margin: 10,
          filename,
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

      const fd = new FormData();
      fd.append('files', new File([blob], filename, { type: 'application/pdf' }));
      await documentService.upload(claimCaseId, fd);
      toast.success('Signed copy uploaded');
    } catch {
      // axios interceptor surfaces the toast on API errors
    } finally {
      if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
      setUploading(false);
    }
  };

  const showIframe = !loading && !!htmlRef.current;

  return (
    <div className="preauth-print">
      <div className="preauth-print__topbar no-print">
        <button className="btn btn--ghost btn--sm" onClick={() => navigate(-1)}>
          <IconArrowLeft size={14} /> Back
        </button>
        <div className="preauth-print__title">{paLabel}</div>
        <div className="preauth-print__topbar-actions">
          <button
            className="btn btn--ghost"
            onClick={handlePrint}
            disabled={loading || !templateReady}
          >
            Print
          </button>
          <button
            className="btn btn--primary"
            onClick={handleUploadSignedCopy}
            disabled={uploading || loading || !templateReady}
          >
            {uploading ? <Spinner size={16} /> : <>Upload signed copy</>}
          </button>
        </div>
      </div>

      {loading && <div className="page-loading"><Spinner /></div>}
      {!loading && !htmlRef.current && (
        <div className="preauth-print__body">
          <div className="preauth-print__empty">No template available.</div>
        </div>
      )}
      {showIframe && (
        <div className="preauth-print__body">
          <iframe
            ref={iframeRef}
            title="Pre-Authorisation Form (Part C)"
            className="preauth-print__frame"
          />
        </div>
      )}
    </div>
  );
}
