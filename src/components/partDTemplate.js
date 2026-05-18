// Shared helpers for fetching, populating, and rendering the PART_D form
// template. Used by both ProviderApproveModal (capture PDF on submit) and
// PartDPrintModal (preview + print + save).

import html2pdf from 'html2pdf.js';

const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPE[c]);
}

// Replace `{{key}}` / `{{ key }}` placeholders in the template HTML with
// values from the flat map. Missing / empty values render as empty strings.
export function renderTemplate(html, flat) {
  if (!html) return '';
  return html.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key) => {
    const value = flat[key];
    if (value === undefined || value === null || value === '') return '';
    return escapeHtml(value);
  });
}

// Walk nested data_json (sections → optional subgroup objects → fields) into
// a flat { key: value } map. Mirrors PreAuthPrint.flattenDataJson.
export function flattenDataJson(dataJson) {
  const flat = {};
  for (const [, sectionData] of Object.entries(dataJson || {})) {
    if (!sectionData || typeof sectionData !== 'object' || Array.isArray(sectionData)) continue;
    for (const [key, val] of Object.entries(sectionData)) {
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        for (const [subKey, subVal] of Object.entries(val)) {
          flat[subKey] = subVal;
        }
      } else {
        flat[key] = val;
      }
    }
  }
  return flat;
}

export function formatDateDMY(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB');
}

// Build the full flat map of PART_D `{{key}}` values from the claim shape
// plus the approver's inputs. Line-item / summary inputs are optional —
// the simplified Approve modal omits them (PDF renders blank for those
// keys) while the Part D fill-and-print modal supplies them.
export function buildPartDFlat({
  claim,
  approveAmount,
  claimNumber,
  remarks,
  // Hospital agreed tariff (page 2)
  roomRentPerDay,
  icuRentPerDay,
  nursingChargesPerDay,
  consultantVisitChargesPerDay,
  surgeonAnesthetistFee,
  others,
  // Authorization summary (page 2)
  totalBillAmount,
  deductionsDetail,
  discount,
  coPay,
  deductibles,
  totalAuthorisedAmount,
  amountToBePaidByInsured,
} = {}) {
  const fd = flattenDataJson(claim?.form_data_json);
  const flat = { ...fd };

  // ── Header block ────────────────────────────────────
  flat.claim_number = claimNumber || claim?.claim_number || flat.claim_number || '';
  flat.date = new Date().toLocaleDateString('en-GB');
  flat.hospital_name = claim?.hospital_name || flat.hospital_name || '';
  flat.hospital_address = claim?.hospital_address || flat.hospital_address || '';
  flat.rohini_id = claim?.hospital_rohini_id || flat.rohini_id || '';
  flat.insurance_company = claim?.insurer_name || flat.insurance_company || '';
  flat.tpa_name = claim?.tpa_name || flat.tpa_name || '';
  flat.proposer_name = flat.proposer_name || flat.patient_name || claim?.patient_name || '';
  flat.patient_member_id = flat.patient_member_id || flat.insured_card_id || '';
  flat.relation_with_proposer = flat.relation_with_proposer || '';

  // ── Letter body ─────────────────────────────────────
  flat.preauth_request_date =
    formatDateDMY(claim?.submitted_at) || flat.preauth_request_date || '';

  // ── Patient / policy block ──────────────────────────
  flat.patient_name = claim?.patient_name || flat.patient_name || '';
  flat.patient_age = flat.patient_age || (flat.age_years ? `${flat.age_years} Years` : '');
  flat.patient_gender = flat.patient_gender || flat.gender || '';
  flat.policy_number = flat.policy_number || '';
  flat.policy_period_from = formatDateDMY(flat.policy_period_from) || '';
  flat.policy_period_to = formatDateDMY(flat.policy_period_to) || '';
  flat.room_category = flat.room_category || flat.room_type || '';
  flat.eligible_room_category = flat.eligible_room_category || '';
  flat.estimated_length_of_stay =
    flat.estimated_length_of_stay || flat.expected_days || flat.duration_days || '';
  flat.expected_admission_date =
    formatDateDMY(flat.expected_admission_date) || formatDateDMY(flat.admission_date) || '';
  if (!flat.expected_discharge_date && flat.admission_date && flat.expected_days) {
    const ad = new Date(flat.admission_date);
    const days = Number(flat.expected_days);
    if (!Number.isNaN(ad.getTime()) && Number.isFinite(days)) {
      const dd = new Date(ad);
      dd.setDate(dd.getDate() + days);
      flat.expected_discharge_date = dd.toLocaleDateString('en-GB');
    }
  } else {
    flat.expected_discharge_date = formatDateDMY(flat.expected_discharge_date) || '';
  }
  flat.provisional_diagnosis = flat.provisional_diagnosis || claim?.diagnosis || '';
  flat.proposed_line_of_treatment =
    flat.proposed_line_of_treatment ||
    flat.medical_management ||
    flat.surgical_management ||
    '';

  // ── Authorization (single-row synth — array iteration not yet wired) ──
  flat.authorization_date_time = new Date().toLocaleString('en-GB');
  flat.authorization_reference = claimNumber || claim?.claim_number || '';
  flat.authorization_amount = approveAmount;
  {
    const requested = Number(claim?.requested_amount) || 0;
    const approved = Number(approveAmount);
    flat.authorization_status =
      requested > 0 && approved < requested ? 'PARTIALLY_APPROVED' : 'APPROVED';
  }

  // ── Authorization totals & remarks ──────────────────
  flat.total_authorized_amount_in_words = '';
  flat.authorization_remarks = remarks || '';
  flat.approved_amount = approveAmount;

  // ── Hospital agreed tariff (page 2) ─────────────────
  flat.room_rent_per_day = roomRentPerDay || '';
  flat.icu_rent_per_day = icuRentPerDay || '';
  flat.nursing_charges_per_day = nursingChargesPerDay || '';
  flat.consultant_visit_charges_per_day = consultantVisitChargesPerDay || '';
  flat.surgeon_fee_ot_anesthetist = surgeonAnesthetistFee || '';
  flat.others_specify = others || '';

  // ── Authorization summary (page 2) ──────────────────
  flat.total_bill_amount = totalBillAmount || '';
  flat.deductions_detail = deductionsDetail || '';
  flat.discount = discount || '';
  flat.co_pay = coPay || '';
  flat.deductibles = deductibles || '';
  // Prefer explicit input; fall back to approveAmount so the form still
  // has a sensible value when only Approve modal data is supplied.
  flat.total_authorised_amount = totalAuthorisedAmount || approveAmount || '';
  flat.amount_to_be_paid_by_insured = amountToBePaidByInsured || '';

  // ── Footer ──────────────────────────────────────────
  flat.product_name = flat.product_name || '';
  flat.product_uin = flat.product_uin || '';
  flat.policy_terms_summary = flat.policy_terms_summary || '';
  flat.authorized_signatory = flat.authorized_signatory || '';
  flat.insurer_or_tpa = claim?.tpa_name || claim?.insurer_name || '';
  flat.insurer_address = claim?.insurer_address || flat.insurer_address || '';
  flat.insurer_phone = claim?.insurer_phone || flat.insurer_phone || '';
  flat.insurer_fax = claim?.insurer_fax || flat.insurer_fax || '';

  return flat;
}

// ── PDF rendering (off-screen) ──────────────────────────────────────
// Renders the populated PART_D template into a PDF Blob without showing
// anything on screen. Shared by ProviderApproveModal (on Approve) and
// PartDPrintModal (Generate & Attach). `htmlTemplate` is the raw template
// HTML the caller already fetched; remaining keys are the same field values
// `buildPartDFlat` accepts.

const PARTD_PDF_IFRAME_ID = 'partd-pdf-render-frame';

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

function ensureHiddenPdfIframe() {
  let iframe = document.getElementById(PARTD_PDF_IFRAME_ID);
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = PARTD_PDF_IFRAME_ID;
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:none;left:-9999px;';
    document.body.appendChild(iframe);
  }
  return iframe;
}

export async function renderPartDPdfBlob({ htmlTemplate, ...rest }) {
  if (!htmlTemplate) throw new Error('PART_D template not loaded');
  const flat = buildPartDFlat(rest);
  const html = renderTemplate(htmlTemplate, flat);

  const iframe = ensureHiddenPdfIframe();
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  await new Promise((resolve) => {
    if (doc.readyState === 'complete') resolve();
    else iframe.onload = () => resolve();
  });

  const iframeDoc = iframe.contentDocument;
  const iframeWin = iframe.contentWindow;
  if (!iframeDoc?.body || !iframeWin) throw new Error('PART_D template not ready');
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
    return await html2pdf()
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
  } finally {
    if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
  }
}
