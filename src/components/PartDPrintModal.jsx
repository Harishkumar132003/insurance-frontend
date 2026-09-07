import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import Spinner from './Spinner';
import { useToast } from './Toast';
import { IconX } from './icons/Icons';
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
// Drives three things: the enhancement round's fixed form, synthesising rows
// from the scalar columns for letters/pre-auths saved before the itemised
// breakdown existed, and the cost-key → bd_* column mirror.
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

const EMPTY_BILL = {
  roomRent: '', icuCharges: '', expectedDays: '', icuDays: '',
  investigationCost: '', otCharges: '', professionalFees: '',
  medicinesCost: '', packageCharges: '', otherExpenses: '',
  discount: '', coPay: '', deductibles: '', deductions: '',
};

const _n = (v) => Number(v) || 0;

// Rows carrying a named investigation all fold into the one bd_investigation_cost
// column, matching how the pre-auth folds them into investigation_cost.
const INVESTIGATION_KEY = 'investigation';

// Always present on an enhancement round and never removable, mirroring the
// hospital's Cost Estimates section.
const CONSTANT_ROW_KEYS = ['room_rent', 'icu_charges'];

// Offered by "+ Add expense", once each. Labels come from BILL_FIELDS so the
// menu, the row label and the bd_* column can never drift apart.
const ADDABLE_ROWS = BILL_FIELDS
  .filter(([, , , costKey]) => !CONSTANT_ROW_KEYS.includes(costKey)
    && costKey !== 'investigation_cost')
  .map(([, , label, costKey]) => ({ key: costKey, label }));

// pre-auth cost key → part_d_letters column, from BILL_FIELDS.
const BD_COLUMN_BY_KEY = Object.fromEntries(
  BILL_FIELDS.map(([, apiKey, , costKey]) => [costKey, apiKey]),
);

// One Cost Estimates row as the provider reviews it. `claimed` freezes the
// hospital's ask so a reduced approval stays legible; `amount` is editable;
// `reason` explains a cut. `claimed` is an explicit argument rather than a copy
// of `amount` — deriving it meant a reloaded row lost the original ask, which
// hid the "Claimed" hint and disabled the disallowance requirement.
// `claimedDays` freezes the day count behind a per-day row (room / ICU) for the
// same reason `claimed` freezes the rate: after a save, bd_expected_days holds
// the APPROVED days, so without a frozen baseline a day cut becomes invisible on
// reload. Null on flat rows, which bill at one unit.
const toBillItem = (key, label, description, amount, claimed, reason, claimedDays) => ({
  key,
  label,
  description: description || '',
  // Legacy rows persisted before `claimed` existed fall back to the amount.
  claimed: claimed === undefined || claimed === null ? (amount ?? '') : claimed,
  amount: amount ?? '',
  reason: reason || '',
  claimedDays: claimedDays === undefined ? null : claimedDays,
});

// Days the hospital asked for on this row. Legacy rows carry no baseline, so
// they fall back to what the row bills at now — no phantom day reduction.
const claimedDaysOf = (it, approvedDays) => (
  it?.claimedDays === null || it?.claimedDays === undefined || it?.claimedDays === ''
    ? approvedDays : _n(it.claimedDays)
);

// A line is "reduced" when the provider cut the per-day RATE, or cut the LINE
// TOTAL (rate x days) — the second is what catches a day-count cut on the room
// and ICU rows, where the rate can stay untouched while the line halves.
// Both tests are strict less-than: approving more than asked is not a
// disallowance. `approvedDays` is 1 for flat rows, which collapses this to the
// plain rate comparison those rows have always used.
const isReducedLine = (it, approvedDays = 1) => {
  if (!it) return false;
  if (it.claimed === '' || it.claimed === null || it.claimed === undefined) return false;
  if (_n(it.amount) < _n(it.claimed)) return true;
  return _n(it.amount) * approvedDays < _n(it.claimed) * claimedDaysOf(it, approvedDays);
};

// Rebuild rows from the flat scalar columns — used for a pre-auth or a saved
// letter that predates the itemised breakdown, so neither opens empty.
const itemsFromScalars = (src, get) => BILL_FIELDS
  .map(([, , label, costKey]) => [costKey, label, get(src, costKey)])
  .filter(([, , amount]) => amount != null && amount !== '')
  .map(([costKey, label, amount]) => toBillItem(costKey, label.replace(' (per day)', ''), '', amount));

// The flat bd_* mirror every existing reader depends on — the printed letter,
// buildFlatArgs() and the legacy template placeholders all read these, not the
// rows. Investigation rows are summed; unused heads go to 0 as before.
const deriveBdScalars = (items) => {
  const out = {};
  for (const [, apiKey] of BILL_FIELDS) out[apiKey] = 0;
  let investigationTotal = 0;
  for (const it of items || []) {
    if (!it || !it.key) continue;
    if (it.key === INVESTIGATION_KEY || it.key === 'investigation_cost') {
      investigationTotal += _n(it.amount);
    } else if (BD_COLUMN_BY_KEY[it.key]) {
      out[BD_COLUMN_BY_KEY[it.key]] = _n(it.amount);
    }
  }
  out.bd_investigation_cost = investigationTotal;
  return out;
};

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
  // The itemised breakdown (non-enhancement rounds). `bill` still holds the day
  // counts and the deduction lines; enhancement rounds keep using it entirely.
  const [items, setItems] = useState([]);
  // Saved stage → "Proceed" reveals the finalize panel (file upload + amount +
  // claim number + Approve). Optional signed-letter upload lives there.
  const [showApprovePanel, setShowApprovePanel] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);

  const setBillField = (key, value) => setBill((prev) => ({ ...prev, [key]: value }));
  const setItemField = (index, key, value) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [key]: value } : it)));

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

  // Days a row currently bills at. Flat rows bill once, so every caller can
  // multiply unconditionally.
  const rowDays = (it) => {
    if (isEnhancement) return 1;
    if (it?.key === 'room_rent') return nonIcuDays;
    if (it?.key === 'icu_charges') return _n(bill.icuDays);
    return 1;
  };

  // One line's contribution: the two room heads are per-day rates × their day
  // count, everything else is flat — the same arithmetic the fixed form used,
  // so identical inputs still produce an identical total.
  const itemLineTotal = (it) => _n(it?.amount) * rowDays(it);

  // Reduction test bound to this round's day counts. Every caller goes through
  // it so the render, the Approve gate and the persisted flag can never
  // disagree about whether a line was cut.
  const isReduced = (it) => isReducedLine(it, rowDays(it));
  const itemsTotal = items.reduce((sum, it) => sum + itemLineTotal(it), 0);

  // Heads not yet on the breakdown, plus each investigation the hospital named
  // on the pre-auth — the same menu the pre-auth form and Raise Claim offer.
  const usedItemKeys = new Set(items.map((it) => it.key));
  const usedInvestigationLabels = new Set(
    items.filter((it) => it.key === INVESTIGATION_KEY).map((it) => it.label),
  );
  const addItemOptions = [
    ...ADDABLE_ROWS.filter((r) => !usedItemKeys.has(r.key)),
    ...(claim?.form_data_json?.hospitalization?.cost_items || [])
      .filter((it) => it && it.key === INVESTIGATION_KEY && String(it.label || '').trim())
      .map((it) => it.label.trim())
      .filter((label, i, arr) => arr.indexOf(label) === i)
      .filter((label) => !usedInvestigationLabels.has(label))
      .map((label) => ({ key: INVESTIGATION_KEY, label })),
  ];
  const addItem = (opt) =>
    setItems((prev) => [...prev, toBillItem(opt.key, opt.label, '', '')]);
  const removeItem = (index) => setItems((prev) => prev.filter((_, i) => i !== index));

  const totalBill = itemsTotal;
  const totalDeductions = _n(bill.discount) + _n(bill.coPay) + _n(bill.deductibles) + _n(bill.deductions);
  const totalAuthorised = Math.max(0, totalBill - totalDeductions);

  // The cap is what the hospital asked for this round (enhancement increment or
  // the original requested amount). Approved Amount == Total Authorised.
  const requestedCap = Number(pendingRequest?.additional_amount) || Number(claim?.requested_amount) || 0;
  const exceedsRequested = requestedCap > 0 && totalAuthorised > requestedCap;

  // Amount the Insured must pay = the shortfall when less is authorised than
  // requested (Requested − Total Authorised), never negative.
  const amountByInsured = Math.max(0, requestedCap - totalAuthorised);

  // A line approved below the hospital's ask must say why. Drives both the
  // Approve guard and the button's disabled state.
  const missingReasonLines = items
    .filter((it) => isReduced(it) && !(it.reason || '').trim())
    .map((it) => it.label);

  // Bill Breakdown defaults pulled from the pre-auth cost estimates (already in
  // the claim payload — no extra fetch needed). Enhancement rounds start blank.
  // The rows the hospital actually claimed. Falls back to the flat scalars for
  // a pre-auth saved before Cost Estimates became a table, so old cases still
  // render a breakdown instead of nothing.
  const preauthItems = () => {
    // An enhancement is a top-up, not a restatement of the original estimate,
    // so it starts with just the two constants for the provider to fill in.
    if (isEnhancement) {
      return CONSTANT_ROW_KEYS.map((key) => {
        const row = BILL_FIELDS.find(([, , , costKey]) => costKey === key);
        return toBillItem(key, row[2].replace(' (per day)', ''), '', '');
      });
    }
    const h = claim?.form_data_json?.hospitalization || {};
    // Freeze the hospital's day counts alongside its rates, so a later cut to
    // Expected Stay / ICU Days is still measurable against the original ask.
    // Ward days are derived the same way the live total derives them.
    const claimedIcu = _n(h.icu_days);
    const claimedDaysFor = (key) => {
      if (key === 'room_rent') return Math.max(0, _n(h.expected_days) - claimedIcu);
      if (key === 'icu_charges') return claimedIcu;
      return null;
    };
    const costItems = Array.isArray(h.cost_items) ? h.cost_items : [];
    if (costItems.length > 0) {
      return costItems
        .filter((it) => it && it.key)
        .map((it) => toBillItem(
          it.key, it.label || it.key, it.description, it.amount,
          undefined, undefined, claimedDaysFor(it.key),
        ));
    }
    return itemsFromScalars(h.costs || {}, (src, costKey) => src[costKey]);
  };

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
    // bd_items first: without it a saved itemised breakdown fails the scalar
    // probe below and gets silently overwritten by the pre-auth prefill.
    const savedItems = Array.isArray(data.bd_items) ? data.bd_items : null;
    const hasNumeric = data.bd_room_rent != null
      || data.bd_investigation_cost != null
      || data.as_total_bill_amount != null;
    if (data.is_persisted && savedItems && savedItems.length > 0) {
      setItems(savedItems.map(
        (it) => toBillItem(
          it.key, it.label, it.description, it.amount,
          it.claimed, it.reason, it.claimedDays,
        ),
      ));
    } else if (data.is_persisted && hasNumeric) {
      // A letter saved before the itemised breakdown — rebuild rows from its
      // own scalars so the provider's earlier edits survive.
      setItems(itemsFromScalars(data, (src, costKey) => src[BD_COLUMN_BY_KEY[costKey]]));
    } else {
      setItems(preauthItems());
    }
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
            setItems(preauthItems());
          }
        } else if (sc === 404 && emailId == null) {
          // GET returned 404 (no part-d row and no approval). Same as above:
          // open the editor and let Save/Print create the approval inline.
          if (!cancelled) {
            setClaimNumber(claim?.claim_number || '');
            setBill(preauthBill());
            setItems(preauthItems());
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
  const buildFlatArgs = () => {
    // Read the flat mirror, not `bill` — on an itemised round the bill.* heads
    // are no longer the source of truth, so taking them here would print an
    // empty tariff block. `others` still lists the named investigations by name
    // rather than one lumped figure.
    const bd = deriveBdScalars(items);
    const namedOthers = items
      .filter((it) => it.key === INVESTIGATION_KEY && _n(it.amount) > 0)
      .map((it) => `${it.label} ${rs(it.amount)}`);
    return {
    claim,
    approveAmount: totalAuthorised,
    claimNumber,
    remarks,
    roomRentPerDay: bd.bd_room_rent ? `${rs(bd.bd_room_rent)}/day` : '',
    icuRentPerDay: bd.bd_icu_charges ? `${rs(bd.bd_icu_charges)}/day` : '',
    nursingChargesPerDay: '',
    consultantVisitChargesPerDay: '',
    surgeonAnesthetistFee: bd.bd_ot_charges ? rs(bd.bd_ot_charges) : '',
    others: [
      ...(namedOthers.length
        ? namedOthers
        : [bd.bd_investigation_cost ? `Investigation ${rs(bd.bd_investigation_cost)}` : '']),
      bd.bd_professional_fees ? `Professional ${rs(bd.bd_professional_fees)}` : '',
      bd.bd_medicines_cost ? `Medicines ${rs(bd.bd_medicines_cost)}` : '',
      bd.bd_package_charges ? `Package ${rs(bd.bd_package_charges)}` : '',
      bd.bd_other_expenses ? `Other ${rs(bd.bd_other_expenses)}` : '',
    ].filter(Boolean).join(', '),
    totalBillAmount: rs(totalBill),
    deductionsDetail: '',
    discount: bill.discount !== '' ? rs(bill.discount) : '',
    coPay: bill.coPay !== '' ? rs(bill.coPay) : '',
    deductibles: bill.deductibles !== '' ? rs(bill.deductibles) : '',
    totalAuthorisedAmount: rs(totalAuthorised),
    amountToBePaidByInsured: rs(amountByInsured),
    };
  };

  // Build the field-value payload (snake_case) sent on Save / Approve.
  const fieldPayload = () => ({
    approved_amount: totalAuthorised,
    claim_number: claimNumber ?? '',
    remarks: remarks ?? '',
    // The scalar bd_* columns stay the flat mirror the printed letter reads. On
    // a normal round they are derived from the rows (investigations summed); an
    // enhancement round has no rows and keeps writing its own fixed fields.
    ...deriveBdScalars(items),
    bd_items: items.map((it) => ({
      key: it.key,
      label: it.label ?? '',
      description: it.description ?? '',
      claimed: it.claimed === '' || it.claimed == null ? null : Number(it.claimed),
      amount: _n(it.amount),
      // The frozen day baseline rides along so a reopened letter can still tell
      // an approved day count from the one the hospital asked for.
      claimedDays: it.claimedDays == null || it.claimedDays === ''
        ? null : Number(it.claimedDays),
      // Only meaningful on a reduced line; blank elsewhere.
      reason: isReduced(it) ? (it.reason || '').trim() : '',
    })),
    bd_expected_days: _n(bill.expectedDays),
    bd_icu_days: _n(bill.icuDays),
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
        Object.entries(fieldPayload()).forEach(([k, v]) => {
          // Arrays (bd_items) must go as JSON; the route parses them back.
          if (Array.isArray(v)) fd.append(k, JSON.stringify(v));
          else fd.append(k, v == null ? '' : String(v));
        });
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
    if (missingReasonLines.length > 0) {
      toast.error(`Give a disallowance reason for: ${missingReasonLines.join(', ')}`);
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
      // Itemised decision for the hospital's timeline. `approved_breakdown` is
      // already parsed by the provider-action route and rendered by
      // EmailFormValues' "Approved breakdown" table, so this needs no new UI.
      if (items.length > 0) {
        fd.append('approved_breakdown', JSON.stringify(items.map((it) => ({
          label: it.label ?? '',
          claimed: it.claimed === '' || it.claimed == null ? null : Number(it.claimed),
          approved: _n(it.amount),
          reason: isReduced(it) ? (it.reason || '').trim() : '',
        }))));
      }
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
              {items.length === 0 ? (
                <p className="part-d-fill__bill-empty">
                  The hospital&rsquo;s pre-auth has no cost estimate lines.
                </p>
              ) : (
                <div className="part-d-fill__bill-wrap">
                  <table className="part-d-fill__bill">
                    <thead>
                      <tr>
                        <th>Expense Category</th>
                        <th>Description</th>
                        <th className="part-d-fill__bill-amount-col">Approved (₹)</th>
                        <th className="part-d-fill__bill-reason-col">Disallowance Reason</th>
                        <th className="part-d-fill__bill-remove" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => {
                        // An enhancement is a flat top-up: no rate x days.
                        const perDay = !isEnhancement
                          && (it.key === 'room_rent' || it.key === 'icu_charges');
                        const days = it.key === 'icu_charges' ? _n(bill.icuDays) : nonIcuDays;
                        const isConstant = CONSTANT_ROW_KEYS.includes(it.key);
                        const reduced = isReduced(it);
                        const claimedDays = claimedDaysOf(it, days);
                        return (
                          <tr key={`${it.key}-${idx}`}>
                            <td>
                              <span className="part-d-fill__bill-cat">{it.label}</span>
                              {perDay && (
                                <span className="part-d-fill__bill-perday">per day</span>
                              )}
                            </td>
                            <td className="part-d-fill__bill-desc">{it.description || '—'}</td>
                            <td className="part-d-fill__bill-amount">
                              <input
                                type="number"
                                min="0"
                                value={it.amount}
                                onWheel={(e) => e.currentTarget.blur()}
                                onChange={(e) => setItemField(idx, 'amount', e.target.value)}
                              />
                              {perDay && _n(it.amount) > 0 && days > 0 && (
                                <small className="part-d-fill__bill-hint">
                                  {`× ${days} day${days > 1 ? 's' : ''} = ${fmtCap(itemLineTotal(it))}`}
                                </small>
                              )}
                              {/* What the hospital asked, when the provider has
                                  cut it. A per-day row spells out the original
                                  days too — otherwise a day-only cut reads as
                                  "Claimed ₹5,000" beside an approved ₹5,000. */}
                              {reduced && (
                                <small className="part-d-fill__bill-claimed">
                                  {perDay && claimedDays > 0
                                    ? `Claimed ${fmtCap(it.claimed)} × ${claimedDays} day${claimedDays > 1 ? 's' : ''} = ${fmtCap(_n(it.claimed) * claimedDays)}`
                                    : `Claimed ${fmtCap(it.claimed)}`}
                                </small>
                              )}
                            </td>
                            <td className="part-d-fill__bill-reason">
                              {/* Only a reduced line needs explaining — a line
                                  approved in full has nothing to disallow. */}
                              {reduced ? (
                                <input
                                  type="text"
                                  value={it.reason || ''}
                                  placeholder="Why was this reduced?"
                                  aria-label={`Disallowance reason for ${it.label}`}
                                  className={(it.reason || '').trim()
                                    ? '' : 'part-d-fill__bill-reason--missing'}
                                  onChange={(e) => setItemField(idx, 'reason', e.target.value)}
                                />
                              ) : (
                                <span className="part-d-fill__bill-na">N/A</span>
                              )}
                            </td>
                            <td className="part-d-fill__bill-remove">
                              {/* The two constants are always billable heads. */}
                              {!isConstant && (
                                <button
                                  type="button"
                                  className="btn btn--ghost btn--sm"
                                  title={`Remove ${it.label}`}
                                  onClick={() => removeItem(idx)}
                                >
                                  <IconX size={14} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {addItemOptions.length > 0 && (
                <div>
                  <select
                    className="cost-table__add"
                    value=""
                    onChange={(e) => {
                      const opt = addItemOptions.find(
                        (o) => `${o.key}|${o.label}` === e.target.value,
                      );
                      if (opt) addItem(opt);
                    }}
                  >
                    <option value="">+ Add expense…</option>
                    {addItemOptions.map((o) => (
                      <option key={`${o.key}|${o.label}`} value={`${o.key}|${o.label}`}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
              <div className="form-row">
                {renderCalcField('Amount to be paid by Insured', amountByInsured)}
                {/* Spacer keeps the derived figure in the left column rather
                    than stretching it across both. */}
                <div className="form-group" aria-hidden="true" />
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
                <button type="button" className="btn btn--primary" onClick={handleSubmitApproval} disabled={saving || !uploadedFile || missingReasonLines.length > 0}>
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
