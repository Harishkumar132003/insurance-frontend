import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { claimCaseService, claimService, documentService } from '../services/api';
import { CLAIM_DOCUMENT_TYPES } from '../constants/claimDocuments';
import { IconArrowLeft, IconChevronRight, IconCheck, IconAlertCircle, IconX, IconFormEdit } from '../components/icons/Icons';
import Spinner from '../components/Spinner';
import ClaimTimeline from '../components/ClaimTimeline';
import Modal from '../components/Modal';
import PartDPrintModal from '../components/PartDPrintModal';
import EmailFormValues from '../components/EmailFormValues';
import './Pages.scss';

// Group email attachments by their document_type, ordered by the canonical
// claim-document categories, with anything untagged falling under "Other".
function groupAttachmentsByType(attachments) {
  const byKey = new Map();
  for (const att of attachments) {
    const key = att.document_type || 'OTHER';
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(att);
  }
  const ordered = [];
  for (const c of CLAIM_DOCUMENT_TYPES) {
    if (byKey.has(c.key)) ordered.push({ label: c.label, items: byKey.get(c.key) });
  }
  if (byKey.has('OTHER')) ordered.push({ label: 'Other', items: byKey.get('OTHER') });
  return ordered;
}

const SUBMITTED_TYPES = ['SUBMITTED', 'APPLIED'];
const ENHANCE_SUBMITTED_TYPES = ['ENHANCE_SUBMITTED', 'ENHANCE_REQUEST', 'ENHANCE', 'ENHANCEMENT'];
const RECONSIDER_TYPES = ['RECONSIDER', 'RECONSIDER_SUBMITTED', 'RECONSIDERATION', 'RECONSIDERATION_REQUEST'];
const ADR_SUBMITTED_TYPES = ['ADR_SUBMITTED', 'ADDITIONAL_DOC_RESPONSE'];

const AWAITING_PROVIDER_STATUSES = new Set([
  'SUBMITTED',
  'ENHANCE_SUBMITTED',
  'RECONSIDER',
  'RECONSIDER_SUBMITTED',
  'ADR_SUBMITTED',
  'CLAIM_SUBMITTED',
  'CLAIM_ADR_SUBMITTED',
  'CLAIM_RECONSIDER',
]);

function formatINR(amount) {
  if (amount == null || amount === '') return '—';
  const num = Number(amount);
  if (Number.isNaN(num)) return '—';
  return num.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

function statusBadgeVariant(status) {
  switch (status) {
    case 'APPROVED':
    case 'ENHANCEMENT_APPROVED':
    case 'CLAIM_APPROVED':
      return 'success';
    case 'PARTIALLY_APPROVED':
    case 'CLAIM_PARTIALLY_APPROVED':
      return 'info';
    case 'DENIED':
    case 'ENHANCEMENT_DENIED':
    case 'CLAIM_DENIED':
      return 'danger';
    case 'ADR_NMI':
    case 'CLAIM_ADR_NMI':
      return 'warning';
    case 'SUBMITTED':
    case 'CLAIM_SUBMITTED':
    case 'CLAIM_ADR_SUBMITTED':
    case 'CLAIM_RECONSIDER':
      return 'info';
    case 'DRAFT': return 'default';
    case 'ADR_SUBMITTED':
    case 'ENHANCE_SUBMITTED':
    case 'RECONSIDER':
    case 'RECONSIDER_SUBMITTED':
      return 'info';
    default: return 'default';
  }
}

function statusLabel(status) {
  if (!status) return 'Submitted';
  // Display override: the bare enum reads as "ADR NMI" through the generic
  // title-case path below, but the intended on-screen label is just "ADR".
  // Other ADR_* statuses (CLAIM_ADR_NMI, ADR_SUBMITTED, …) fall through.
  if (status === 'ADR_NMI') return 'ADR';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatProviderTat(ms) {
  if (ms == null || Number.isNaN(ms) || ms < 0) return null;
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return '<1m';
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins && !days) parts.push(`${mins}m`);
  if (!parts.length) parts.push('0m');
  return parts.join(' ');
}

export default function ProviderClaimDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { claimCaseId: routeClaimCaseId } = useParams();
  const backPath = location.state?.from || '/claim-list';
  const backLabel = backPath === '/query-management'
    ? 'Back to Query Management'
    : backPath === '/provider-queue'
      ? 'Back to Provider Queue'
      : 'Back to Pre Auth';
  const [loadingCase, setLoadingCase] = useState(false);
  const [claim, setClaim] = useState(null);
  const [claimEmails, setClaimEmails] = useState([]);
  // Claim-stage data: bill_breakdown + docs grouped by category. Populated only
  // when current_stage === 'CLAIM'.
  const [claimData, setClaimData] = useState(null);

  // Per-action modal state. Pre-auth approval is the unified Part-D modal
  // (fill → save → print → submit) opened via the `partD` state; claim stage
  // uses an itemized approve modal opened via claimApproveOpen.
  const [claimApproveOpen, setClaimApproveOpen] = useState(false);
  // Array of { label, claimed: number, approved: string } mirroring the
  // hospital's bill_breakdown. Empty array → fallback single-amount UI.
  const [claimApprovedLines, setClaimApprovedLines] = useState([]);
  const [claimApproveAmountFallback, setClaimApproveAmountFallback] = useState('');
  const [claimApproveRemarks, setClaimApproveRemarks] = useState('');
  const [claimApproveFile, setClaimApproveFile] = useState(null);
  const [claimApproveSaving, setClaimApproveSaving] = useState(false);
  const [partD, setPartD] = useState({ open: false, emailId: null });

  const [denyOpen, setDenyOpen] = useState(false);
  const [denyRemarks, setDenyRemarks] = useState('');
  const [denySaving, setDenySaving] = useState(false);

  const [nmiOpen, setNmiOpen] = useState(false);
  const [nmiRemarks, setNmiRemarks] = useState('');
  const [nmiDocs, setNmiDocs] = useState([]);
  const [nmiNewDoc, setNmiNewDoc] = useState('');
  const [nmiSaving, setNmiSaving] = useState(false);

  // Status-timeline action modal — same pattern as PreAuthForm.jsx, supports
  // viewMode = 'form' | 'requested-docs' | 'submitted-docs'. Provider users
  // are always onboarded, so we don't expose the "View Email" mode here.
  const [viewedEmail, setViewedEmail] = useState(null);
  const [viewMode, setViewMode] = useState('form');
  const [loadingViewedEmail, setLoadingViewedEmail] = useState(false);
  // Tracks which row+button is currently fetching, so the StatusTimeline
  // can show an inline spinner on that exact button while the modal data
  // loads (and disable the rest to prevent double-clicks).
  const [pendingAction, setPendingAction] = useState(null); // { emailId, mode }
  const [emailAttView, setEmailAttView] = useState(null);
  // Attachment id currently being fetched, so the clicked chip can show
  // an inline spinner while waiting for the blob to arrive.
  const [loadingAttachmentId, setLoadingAttachmentId] = useState(null);

  const handleStatusAction = async (mode, emailId) => {
    if (!emailId || !claim?.claim_case_id) return;
    setViewMode(mode);
    setPendingAction({ emailId, mode });
    setLoadingViewedEmail(true);
    setViewedEmail({ loading: true });
    try {
      const res = await claimCaseService.getEmailDetail(claim.claim_case_id, emailId);
      setViewedEmail(res.data);
    } catch {
      setViewedEmail(null);
    } finally {
      setLoadingViewedEmail(false);
      setPendingAction(null);
    }
  };

  const closeViewedEmail = () => {
    setViewedEmail(null);
    if (emailAttView?.url) window.URL.revokeObjectURL(emailAttView.url);
    setEmailAttView(null);
  };

  const viewEmailAttachment = async (att) => {
    if (!viewedEmail?.id || !claim?.claim_case_id) return;
    setLoadingAttachmentId(att.id);
    try {
      const res = await claimCaseService.viewAttachment(
        claim.claim_case_id, viewedEmail.id, att.id,
      );
      const contentType = res.headers?.['content-type'] || att.content_type || '';
      const url = window.URL.createObjectURL(new Blob([res.data], { type: contentType }));
      setEmailAttView({
        url,
        filename: att.original_filename || 'attachment',
        contentType,
      });
    } catch {
      // handled by interceptor
    } finally {
      setLoadingAttachmentId(null);
    }
  };

  const closeEmailAttView = () => {
    if (emailAttView?.url) window.URL.revokeObjectURL(emailAttView.url);
    setEmailAttView(null);
  };

  const loadClaimData = async (showLoader = true) => {
    if (!routeClaimCaseId) return;
    if (showLoader) setLoadingCase(true);
    try {
      const [caseRes, emailsRes] = await Promise.all([
        claimCaseService.getById(routeClaimCaseId),
        claimCaseService.getAllEmails(routeClaimCaseId, { is_read: true }).catch(() => ({ data: [] })),
      ]);
      const cc = caseRes.data;
      const summary = cc.summary || {};
      const header = cc.header_info || {};
      const latestForm = Array.isArray(cc.form_data) && cc.form_data.length > 0
        ? cc.form_data[cc.form_data.length - 1]
        : null;
      setClaim({
        claim_case_id: cc.id,
        status: cc.status,
        claim_status: cc.claim_status,
        current_stage: cc.current_stage,
        main_status: cc.main_status ?? null,
        claim_number: cc.claim_number || '',
        approved_amount: cc.approved_amount ?? '',
        query_logs: cc.query_logs || [],
        status_history: cc.status_history || [],
        patient_name: summary.patient_name,
        uhid: summary.uhid,
        insurer_name: summary.provider_name,
        hospital_name: header.hospital_name || '',
        hospital_address: header.hospital_address || '',
        hospital_rohini_id: header.hospital_rohini_id || '',
        tpa_name: header.tpa_name || '',
        insurer_phone: header.tpa_toll_free_phone || '',
        insurer_fax: header.tpa_toll_free_fax || '',
        insurer_email: cc.policy_provider_email || header.hospital_email || '',
        requested_amount: summary.requested_amount,
        diagnosis: summary.diagnosis,
        icd10_code: summary.icd_10,
        submitted_at: cc.created_at || null,
        form_data_json: latestForm?.data_json || null,
        is_onboarded: cc.is_onboarded === true,
      });
      setClaimEmails(Array.isArray(emailsRes.data) ? emailsRes.data : []);

      // Claim-stage data — fetched lazily; not all claim_cases are claim-stage.
      if (cc.has_claim || cc.current_stage === 'CLAIM') {
        try {
          const claimPayload = await claimService.get(routeClaimCaseId);
          setClaimData(claimPayload);
        } catch {
          setClaimData(null);
        }
      } else {
        setClaimData(null);
      }
    } catch {
      // handled by interceptor
    } finally {
      if (showLoader) setLoadingCase(false);
    }
  };

  useEffect(() => {
    loadClaimData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeClaimCaseId]);

  const { submittedEmails, enhanceSubmittedEmails, reconsiderEmails, adrSubmittedEmails } = useMemo(() => {
    const inBucket = (email, types) => types.includes(email.email_type);
    return {
      submittedEmails: claimEmails.filter((e) => inBucket(e, SUBMITTED_TYPES)),
      enhanceSubmittedEmails: claimEmails.filter((e) => inBucket(e, ENHANCE_SUBMITTED_TYPES)),
      reconsiderEmails: claimEmails.filter((e) => inBucket(e, RECONSIDER_TYPES)),
      adrSubmittedEmails: claimEmails.filter((e) => inBucket(e, ADR_SUBMITTED_TYPES)),
    };
  }, [claimEmails]);

  const statusHistory = claim?.status_history || [];

  const statusEvents = useMemo(() => {
    if (!claim) return [];
    if (Array.isArray(statusHistory) && statusHistory.length > 0) {
      const APPROVAL_STATES = new Set(['APPROVED', 'PARTIALLY_APPROVED', 'ENHANCEMENT_APPROVED']);
      // Insurer-side outcomes (RECEIVED emails). Used to gate the
      // "Attachments" button — only APPROVED / PARTIALLY_APPROVED /
      // ENHANCEMENT_APPROVED carry docs worth viewing there.
      const RECEIVED_SIDE = new Set(['APPROVED', 'PARTIALLY_APPROVED', 'ENHANCEMENT_APPROVED', 'DENIED', 'ENHANCEMENT_DENIED', 'ADR_NMI']);
      // Sort oldest → newest first so the ADR_NMI → ADR_SUBMITTED look-ahead
      // works chronologically; reversed afterwards so the timeline reads
      // newest-first (latest at top).
      const sorted = [...statusHistory]
        .filter((entry) => entry.status !== 'DRAFT')
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      // Per-step TAT: elapsed time from the immediately preceding step. Uses
      // the email timestamp when the row links to an email, else created_at.
      const emailDateById = new Map();
      for (const e of claimEmails) {
        if (e.id != null && e.email_date) emailDateById.set(e.id, e.email_date);
      }
      const ownAtByIndex = sorted.map((entry) =>
        (entry.email_id != null && emailDateById.get(entry.email_id)) || entry.created_at,
      );
      const stepTatByIndex = sorted.map((entry, i) => {
        if (i === 0) return null;
        const cur = ownAtByIndex[i];
        const prev = ownAtByIndex[i - 1];
        if (!cur || !prev) return null;
        const delta = new Date(cur) - new Date(prev);
        return Number.isFinite(delta) && delta >= 0 ? delta : null;
      });
      return sorted.map((entry, i) => {
        // For ADR_NMI rows, locate the next ADR_SUBMITTED so we can offer a
        // "Response Documents" shortcut alongside "Requested Documents".
        let submittedEmailId = null;
        if (entry.status === 'ADR_NMI') {
          const nextSubmitted = sorted
            .slice(i + 1)
            .find((e) => e.status === 'ADR_SUBMITTED');
          submittedEmailId = nextSubmitted?.email_id ?? null;
        }
        // Distinguish claim-stage transitions in the label so a SUBMITTED row
        // reads "Claim Raised" rather than the bare "Submitted".
        const isClaimStageEntry = entry.stage === 'CLAIM';
        const CLAIM_STAGE_LABEL = {
          SUBMITTED:           'Claim Raised',
          APPROVED:            'Claim Approved',
          PARTIALLY_APPROVED:  'Claim Partially Approved',
          DENIED:              'Claim Denied',
          ADR_NMI:             'Claim ADR Requested',
          ADR_SUBMITTED:       'Claim ADR Submitted',
          RECONSIDER:          'Claim Reconsider Requested',
        };
        const displayLabel = isClaimStageEntry
          ? (CLAIM_STAGE_LABEL[entry.status] || statusLabel(entry.status))
          : statusLabel(entry.status);
        return {
          status: displayLabel,
          variant: statusBadgeVariant(entry.status),
          description: entry.remarks || displayLabel,
          timestamp: entry.created_at || null,
          // Per-round approved amount on the history entry so each
          // PARTIALLY_APPROVED / APPROVED / ENHANCEMENT_APPROVED row shows
          // what *that* round approved, not the latest cumulative figure.
          amount: APPROVAL_STATES.has(entry.status)
            ? (entry.approved_amount ?? claim.approved_amount)
            : undefined,
          emailId: entry.email_id ?? null,
          rawStatus: entry.status,
          submittedEmailId,
          isReceivedSide: RECEIVED_SIDE.has(entry.status),
          stepTatMs: stepTatByIndex[i],
        };
      }).reverse();
    }
    return [{
      status: statusLabel(claim.claim_status) || 'Submitted',
      variant: statusBadgeVariant(claim.claim_status),
      description: 'Pre-auth submitted',
      timestamp: claim.submitted_at,
    }];
  }, [claim, statusHistory]);

  const openClaimApprove = () => {
    const items = Array.isArray(claimData?.bill_breakdown) ? claimData.bill_breakdown : [];
    setClaimApprovedLines(items.map((it) => ({
      label: it.label,
      claimed: Number(it.amount) || 0,
      approved: String(Number(it.amount) || 0), // default = full approval
    })));
    setClaimApproveAmountFallback(
      items.length === 0 && claimData?.claimed_amount != null
        ? String(claimData.claimed_amount) : ''
    );
    setClaimApproveRemarks('');
    setClaimApproveFile(null);
    setClaimApproveOpen(true);
  };

  const closeClaimApprove = () => {
    setClaimApproveOpen(false);
  };

  const updateApprovedLine = (idx, value) => {
    setClaimApprovedLines((prev) =>
      prev.map((ln, i) => {
        if (i !== idx) return ln;
        // Approved per line can't exceed what was claimed for that line.
        const cap = Number(ln.claimed) || 0;
        const n = Number(value);
        const capped = value !== '' && Number.isFinite(n) && n > cap ? String(cap) : value;
        return { ...ln, approved: capped };
      }),
    );
  };

  const claimTotalClaimed = claimApprovedLines.reduce(
    (s, ln) => s + (Number(ln.claimed) || 0), 0,
  );
  const claimTotalApproved = claimApprovedLines.reduce(
    (s, ln) => s + (Number(ln.approved) || 0), 0,
  );

  const handleClaimApproveSubmit = async () => {
    if (!claim) return;
    // Validate every per-line approved amount.
    for (const ln of claimApprovedLines) {
      const n = Number(ln.approved);
      if (!Number.isFinite(n) || n < 0) {
        toast.error(`"${ln.label}" needs a non-negative number`);
        return;
      }
      const cap = Number(ln.claimed) || 0;
      if (n > cap) {
        toast.error(`"${ln.label}" approved cannot exceed claimed (${formatINR(cap)})`);
        return;
      }
    }
    const itemized = claimApprovedLines.length > 0;
    const amt = itemized ? claimTotalApproved : Number(claimApproveAmountFallback);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Approved amount must be greater than zero');
      return;
    }
    const claimedTotal = itemized
      ? claimTotalClaimed
      : (Number(claimData?.claimed_amount) || 0);
    const decision = claimedTotal > 0 && amt < claimedTotal
      ? 'PARTIALLY_APPROVED' : 'APPROVED';
    setClaimApproveSaving(true);
    try {
      const fd = new FormData();
      fd.append('status', decision);
      fd.append('approved_amount', String(amt));
      if (itemized) {
        fd.append('approved_breakdown', JSON.stringify(
          claimApprovedLines.map((ln) => ({
            label: ln.label,
            claimed: ln.claimed,
            approved: Number(ln.approved) || 0,
          })),
        ));
      }
      if (claimApproveRemarks.trim()) fd.append('remarks', claimApproveRemarks.trim());
      if (claimApproveFile) fd.append('file', claimApproveFile);
      await claimCaseService.providerAction(claim.claim_case_id, fd);
      toast.success('Response submitted');
      closeClaimApprove();
      await loadClaimData(false);
    } catch {
      // interceptor handles
    } finally {
      setClaimApproveSaving(false);
    }
  };

  const viewClaimDoc = async (doc) => {
    if (!doc?.id || !claim?.claim_case_id) return;
    try {
      const res = await documentService.view(claim.claim_case_id, doc.id);
      const contentType = res.headers?.['content-type'] || doc.content_type || '';
      const url = URL.createObjectURL(new Blob([res.data], { type: contentType }));
      setEmailAttView({
        url,
        filename: doc.original_filename || 'document',
        contentType,
      });
    } catch {
      // interceptor handles
    }
  };

  const closeDeny = () => {
    setDenyOpen(false);
    setDenyRemarks('');
  };

  const handleDenySubmit = async () => {
    if (!claim) return;
    if (!denyRemarks.trim()) {
      toast.error('Remarks (denial reason) are required');
      return;
    }
    setDenySaving(true);
    try {
      // Pre-auth: denying an enhancement submission goes to ENHANCEMENT_DENIED
      // so the hospital can re-file. Claim stage: always plain DENIED — there's
      // no enhancement loop on a claim. First-round submissions also use DENIED.
      const isClaimStage = claim.current_stage === 'CLAIM';
      const denyStatus = (!isClaimStage && claim.status === 'ENHANCE_SUBMITTED')
        ? 'ENHANCEMENT_DENIED'
        : 'DENIED';
      await claimCaseService.providerAction(claim.claim_case_id, {
        status: denyStatus,
        remarks: denyRemarks.trim(),
      });
      toast.success('Response submitted');
      closeDeny();
      await loadClaimData(false);
    } catch {
      // handled by interceptor
    } finally {
      setDenySaving(false);
    }
  };

  const closeNmi = () => {
    setNmiOpen(false);
    setNmiRemarks('');
    setNmiDocs([]);
    setNmiNewDoc('');
  };

  const handleNmiSubmit = async () => {
    if (!claim) return;
    if (!nmiRemarks.trim()) {
      toast.error('Remarks are required');
      return;
    }
    // Include whatever's still sitting in the "Required Documents" input
    // even if the user didn't press "+ Add" before submitting.
    const pendingDoc = nmiNewDoc.trim();
    const documentsList = pendingDoc && !nmiDocs.includes(pendingDoc)
      ? [...nmiDocs, pendingDoc]
      : nmiDocs;
    setNmiSaving(true);
    try {
      await claimCaseService.providerAction(claim.claim_case_id, {
        status: 'ADR_NMI',
        remarks: nmiRemarks.trim(),
        documents_list: documentsList,
      });
      toast.success('Response submitted');
      closeNmi();
      await loadClaimData(false);
    } catch {
      // handled by interceptor
    } finally {
      setNmiSaving(false);
    }
  };

  if (loadingCase || !claim) {
    return (
      <div>
        <button className="gv-page__back" onClick={() => navigate(backPath)}>
          <IconArrowLeft size={18} />
          <span>{backLabel}</span>
        </button>
        <div className="page-loading"><Spinner /></div>
      </div>
    );
  }

  const patientName = claim.patient_name || '—';
  const uhid = claim.uhid || '—';
  const insurerName = claim.insurer_name || '—';
  const requestedAmount = claim.requested_amount ?? null;
  const diagnosis = claim.diagnosis || '—';
  const icd10Code = claim.icd10_code || '—';
  const approvedDisplay = claim.approved_amount !== '' && claim.approved_amount != null
    ? claim.approved_amount
    : null;

  const latestStageStatus = statusHistory.length > 0
    ? [...statusHistory]
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .at(-1)?.status
    : claim.status;
  const canRespond = AWAITING_PROVIDER_STATUSES.has(latestStageStatus);
  // The claim has at least one approval round → a Part-D letter exists/can be
  // created. The "Part D" button in the action bar opens it (latest approval).
  const hasApproval = statusHistory.some((e) =>
    ['APPROVED', 'PARTIALLY_APPROVED', 'ENHANCEMENT_APPROVED'].includes(e.status));
  // Cumulative approved amount has reached (or exceeded) the requested amount
  // → nothing more to authorise, so hide the action bar to prevent further
  // approve / enhance / deny actions.
  const reqNum = Number(requestedAmount);
  const apprNum = Number(approvedDisplay);
  const fullyApproved =
    Number.isFinite(reqNum) && reqNum > 0 &&
    Number.isFinite(apprNum) && apprNum >= reqNum;

  return (
    <div className="claim-detail">
      <div className="claim-detail__header">
        <button className="claim-detail__back" onClick={() => navigate(backPath)}>
          <IconArrowLeft size={16} />
          <span>Back</span>
        </button>
        <div className="claim-detail__title-block">
          <p className="claim-detail__subtitle">
            {patientName} — {uhid} — {insurerName}
          </p>
        </div>
        <span className={`claim-detail__status-pill claim-detail__status-pill--${statusBadgeVariant(claim.main_status || claim.claim_status)}`}>
          <span className="claim-detail__status-dot" />
          {statusLabel(claim.main_status || claim.claim_status)}
        </span>
      </div>

      <div className="claim-detail__stats">
        <div className="claim-detail__stat">
          <div className="claim-detail__stat-label">REQUESTED</div>
          <div className="claim-detail__stat-value">{formatINR(requestedAmount)}</div>
        </div>
        <div className="claim-detail__stat">
          <div className="claim-detail__stat-label">APPROVED</div>
          <div className="claim-detail__stat-value claim-detail__stat-value--approved">
            {formatINR(approvedDisplay)}
          </div>
        </div>
        <div className="claim-detail__stat">
          <div className="claim-detail__stat-label">DIAGNOSIS</div>
          <div className="claim-detail__stat-value">{diagnosis}</div>
        </div>
        <div className="claim-detail__stat">
          <div className="claim-detail__stat-label">ICD-10</div>
          <div className="claim-detail__stat-value claim-detail__stat-value--icd">{icd10Code}</div>
        </div>
      </div>

      {(() => {
        const isClaimStage = claim.current_stage === 'CLAIM';
        // On claim stage we don't gate on fullyApproved (that's a pre-auth
        // concept — claim is judged against bill, not against requested cover).
        const gateOk = isClaimStage ? canRespond : (canRespond && !fullyApproved);
        if (!gateOk) return null;
        return (
          <div className="claim-detail__actions">
            <button
              className="btn btn--outline"
              onClick={() => isClaimStage ? openClaimApprove() : setPartD({ open: true, emailId: null })}
            >
              <IconCheck size={16} /> {isClaimStage ? 'Claim Approve' : 'Review & Approve'}
            </button>
            <button className="btn btn--outline" onClick={() => setNmiOpen(true)}>
              <IconAlertCircle size={16} /> {isClaimStage ? 'Claim ADR' : 'Request Additional Documents'}
            </button>
            <button className="btn btn--outline" onClick={() => setDenyOpen(true)}>
              <IconX size={16} /> {isClaimStage ? 'Claim Deny' : 'Deny'}
            </button>
          </div>
        );
      })()}

      {/* Claim review — bill breakdown + categorized docs. Only rendered when
          the case is in CLAIM stage (i.e. the hospital has raised a claim). */}
      {claim.current_stage === 'CLAIM' && claimData && (
        <div className="claim-detail__accordions">
          <Accordion title="Claim Review" defaultOpen>
            <div className="claim-review">
              <div className="claim-review__stats">
                <div className="claim-review__stat">
                  <div className="claim-review__stat-label">CLAIMED</div>
                  <div className="claim-review__stat-value">{formatINR(claimData.claimed_amount)}</div>
                </div>
                <div className="claim-review__stat">
                  <div className="claim-review__stat-label">CLAIM APPROVED</div>
                  <div className="claim-review__stat-value claim-detail__stat-value--approved">
                    {formatINR(claimData.approved_amount)}
                  </div>
                </div>
                <div className="claim-review__stat">
                  <div className="claim-review__stat-label">CLAIM STATUS</div>
                  <div className="claim-review__stat-value">{statusLabel(claimData.status)}</div>
                </div>
              </div>

              <h4 className="claim-review__heading">Bill breakdown</h4>
              {Array.isArray(claimData.bill_breakdown) && claimData.bill_breakdown.length > 0 ? (
                <table className="claim-review__table">
                  <thead>
                    <tr>
                      <th>Line item</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claimData.bill_breakdown.map((it, idx) => (
                      <tr key={idx}>
                        <td>{it.label}</td>
                        <td style={{ textAlign: 'right' }}>{formatINR(it.amount)}</td>
                      </tr>
                    ))}
                    <tr className="claim-review__total-row">
                      <td><strong>Total claim</strong></td>
                      <td style={{ textAlign: 'right' }}><strong>{formatINR(claimData.claimed_amount)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p className="claim-review__empty">No bill breakdown provided.</p>
              )}

              {claimData.remarks && (
                <>
                  <h4 className="claim-review__heading">Hospital remarks</h4>
                  <p className="claim-review__remarks">{claimData.remarks}</p>
                </>
              )}

              <h4 className="claim-review__heading">Supporting documents</h4>
              <div className="claim-doc-grid">
                {CLAIM_DOCUMENT_TYPES.map((cat) => {
                  const group = (claimData.documents_by_type || []).find((g) => g.document_type === cat.key);
                  const files = group?.documents || [];
                  return (
                    <div key={cat.key} className="claim-doc-card">
                      <div className="claim-doc-card__head">
                        <div className="claim-doc-card__title">{cat.label}</div>
                        <div className="claim-doc-card__count">{files.length} file{files.length === 1 ? '' : 's'}</div>
                      </div>
                      <div className="claim-doc-card__files">
                        {files.length === 0 && (
                          <span className="portal-form__files-empty">No files submitted.</span>
                        )}
                        {files.map((doc) => (
                          <span key={doc.id} className="apply-step__attach-chip">
                            <button
                              type="button"
                              className="claim-doc-card__view"
                              onClick={() => viewClaimDoc(doc)}
                              title="View"
                            >
                              {doc.original_filename}
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Accordion>
        </div>
      )}

      <div className="claim-detail__accordions">
        <Accordion title="Status Timeline" defaultOpen>
          <StatusTimeline
            events={statusEvents}
            onAction={handleStatusAction}
            pendingAction={pendingAction}
            // Provider-queue claims are always onboarded; hide
            // "Submitted Documents" on insurer-side outcomes that aren't
            // an approval.
            claimOnboarded={claim?.is_onboarded !== false}
          />
        </Accordion>
      </div>

      {claimApproveOpen && (() => {
        const itemized = claimApprovedLines.length > 0;
        const decisionLabel = itemized
          ? (claimTotalApproved < claimTotalClaimed && claimTotalApproved > 0
              ? 'Partial approval'
              : claimTotalApproved === claimTotalClaimed
                ? 'Full approval'
                : claimTotalApproved === 0 ? '—' : 'Over-approval')
          : null;
        return (
          <Modal title="Approve Claim" onClose={closeClaimApprove}>
            <div className="modal-form">
              <div className="form-group">
                <label>Patient</label>
                <div>{patientName} — {uhid}</div>
              </div>

              {itemized ? (
                <div className="form-group">
                  <label>Approved Breakdown <span style={{ color: '#b91c1c' }}>*</span></label>
                  <table className="claim-review__table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Line item</th>
                        <th style={{ textAlign: 'right' }}>Claimed</th>
                        <th style={{ textAlign: 'right' }}>Approved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {claimApprovedLines.map((ln, idx) => (
                        <tr key={idx}>
                          <td>{ln.label || '—'}</td>
                          <td style={{ textAlign: 'right' }}>{formatINR(ln.claimed)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <input
                              type="number"
                              value={ln.approved}
                              onChange={(e) => updateApprovedLine(idx, e.target.value)}
                              onWheel={(e) => e.currentTarget.blur()}
                              min="0"
                              max={ln.claimed}
                              style={{ width: 120, textAlign: 'right' }}
                            />
                          </td>
                        </tr>
                      ))}
                      <tr className="claim-review__total-row">
                        <td><strong>Total</strong></td>
                        <td style={{ textAlign: 'right' }}><strong>{formatINR(claimTotalClaimed)}</strong></td>
                        <td style={{ textAlign: 'right' }}><strong>{formatINR(claimTotalApproved)}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                  {decisionLabel && (
                    <p className="provider-approve__file-hint" style={{ marginTop: 6 }}>
                      Decision on submit: <strong>{decisionLabel}</strong>
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label>Claimed Amount</label>
                    <div>{formatINR(claimData?.claimed_amount)}</div>
                  </div>
                  <div className="form-group">
                    <label>Approved Amount <span style={{ color: '#b91c1c' }}>*</span></label>
                    <input
                      type="number"
                      value={claimApproveAmountFallback}
                      onChange={(e) => setClaimApproveAmountFallback(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="e.g. 150000"
                      min="0"
                    />
                    <p className="provider-approve__file-hint">
                      Hospital didn't submit a bill breakdown; enter the total approved amount.
                    </p>
                  </div>
                </>
              )}

              <div className="form-group">
                <label>Remarks</label>
                <textarea
                  rows={3}
                  placeholder="Optional notes"
                  value={claimApproveRemarks}
                  onChange={(e) => setClaimApproveRemarks(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Attach Approval Letter (optional)</label>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setClaimApproveFile(e.target.files?.[0] || null)}
                />
                {claimApproveFile && (
                  <p className="provider-approve__file-hint">
                    <strong>{claimApproveFile.name}</strong>
                    {' '}({Math.round(claimApproveFile.size / 1024)} KB)
                  </p>
                )}
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn--ghost" onClick={closeClaimApprove} disabled={claimApproveSaving}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleClaimApproveSubmit}
                  disabled={claimApproveSaving}
                >
                  {claimApproveSaving ? <Spinner size={16} /> : 'Submit'}
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {partD.open && (
        <PartDPrintModal
          claim={claim}
          claimCaseId={claim.claim_case_id}
          emailId={partD.emailId}
          onClose={() => setPartD({ open: false, emailId: null })}
          onSaved={() => loadClaimData(false)}
          onApproved={async () => {
            setPartD({ open: false, emailId: null });
            await loadClaimData(false);
          }}
        />
      )}

      {denyOpen && (
        <Modal title="Denied" onClose={closeDeny}>
          <div className="modal-form">
            <div className="form-group">
              <label>Patient</label>
              <div>{patientName} — {uhid}</div>
            </div>
            <div className="form-group">
              <label>Remarks <span style={{ color: '#b91c1c' }}>*</span></label>
              <textarea
                rows={4}
                placeholder="Denial reason"
                value={denyRemarks}
                onChange={(e) => setDenyRemarks(e.target.value)}
                required
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn--ghost" onClick={closeDeny}>Cancel</button>
              <button type="button" className="btn btn--danger" disabled={denySaving} onClick={handleDenySubmit}>
                {denySaving ? <Spinner size={16} /> : 'Submit'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {nmiOpen && (
        <Modal title="Request Additional Documents" onClose={closeNmi}>
          <div className="modal-form">
            <div className="form-group">
              <label>Patient</label>
              <div>{patientName} — {uhid}</div>
            </div>
            <div className="form-group">
              <label>Remarks <span style={{ color: '#b91c1c' }}>*</span></label>
              <textarea
                rows={4}
                placeholder="What clarification or documents are being requested"
                value={nmiRemarks}
                onChange={(e) => setNmiRemarks(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Required Documents</label>
              {nmiDocs.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {nmiDocs.map((doc, idx) => (
                    <span key={idx} className="apply-step__attach-chip">
                      <span>{doc}</span>
                      <button
                        type="button"
                        onClick={() => setNmiDocs((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="e.g. LMP / EDD certificate"
                  value={nmiNewDoc}
                  onChange={(e) => setNmiNewDoc(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const v = nmiNewDoc.trim();
                      if (v) {
                        setNmiDocs((prev) => [...prev, v]);
                        setNmiNewDoc('');
                      }
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    const v = nmiNewDoc.trim();
                    if (v) {
                      setNmiDocs((prev) => [...prev, v]);
                      setNmiNewDoc('');
                    }
                  }}
                  disabled={!nmiNewDoc.trim()}
                >
                  + Add
                </button>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn--ghost" onClick={closeNmi}>Cancel</button>
              <button type="button" className="btn btn--primary" disabled={nmiSaving} onClick={handleNmiSubmit}>
                {nmiSaving ? <Spinner size={16} /> : 'Submit'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {viewedEmail && (() => {
        const modalTitle = (() => {
          if (viewMode === 'form') return 'Submitted Form';
          if (viewMode === 'requested-docs') return 'Documents Requested by Insurer';
          if (viewMode === 'submitted-docs') return 'Documents Submitted to Insurer';
          return viewedEmail.subject || 'Email';
        })();
        const requestedDocs = (() => {
          const fv = viewedEmail.form_values;
          if (fv && Array.isArray(fv.documents_list) && fv.documents_list.length) {
            return fv.documents_list;
          }
          if (Array.isArray(viewedEmail.ai_documents_list)) {
            return viewedEmail.ai_documents_list;
          }
          return [];
        })();
        const submittedItems = Array.isArray(viewedEmail?.form_values?.items)
          ? viewedEmail.form_values.items
          : [];
        return (
          <Modal title={modalTitle} onClose={closeViewedEmail} size="lg">
            {loadingViewedEmail ? (
              <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
                <Spinner />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* From/To/direction/date is only relevant in the raw-email
                    view; the form / documents views hide it. (The provider
                    page never opens 'email' mode, so this is effectively
                    always hidden here — kept for parity.) */}
                {viewMode === 'email' && (
                  <div
                    style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13, color: '#6b7280', paddingBottom: 8, borderBottom: '1px solid #e5e7eb' }}
                  >
                    <span>From: {viewedEmail.from_email}</span>
                    <span>To: {viewedEmail.to_email}</span>
                    {viewedEmail.direction && (
                      <span className={`badge badge--${viewedEmail.direction === 'SENT' ? 'success' : 'info'} badge--sm`}>
                        {viewedEmail.direction}
                      </span>
                    )}
                    {viewedEmail.email_date && (
                      <span>
                        {new Date(viewedEmail.email_date).toLocaleString('en-IN', {
                          year: 'numeric', month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit', hour12: false,
                        }).replace(',', '')}
                      </span>
                    )}
                  </div>
                )}

                {viewMode === 'form' && (
                  viewedEmail.form_values ? (
                    <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
                      <EmailFormValues
                        formValues={viewedEmail.form_values}
                        emailType={viewedEmail.email_type}
                        claim={claim}
                        onOpenAttachment={(attachmentId) => {
                          const att = viewedEmail.attachments?.find((a) => a.id === attachmentId)
                            || { id: attachmentId };
                          viewEmailAttachment(att);
                        }}
                      />
                    </div>
                  ) : (
                    <div style={{ padding: 24, textAlign: 'center', color: '#6b7280', background: '#f9fafb', borderRadius: 6 }}>
                      No structured form data was saved for this entry.
                    </div>
                  )
                )}

                {viewMode === 'requested-docs' && (
                  requestedDocs.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                        Insurer requested ({requestedDocs.length})
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
                        {requestedDocs.map((doc, i) => (
                          <li key={`${doc}-${i}`} style={{ fontSize: 14 }}>{doc}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div style={{ padding: 24, textAlign: 'center', color: '#6b7280', background: '#f9fafb', borderRadius: 6 }}>
                      No requested-document list captured for this entry.
                    </div>
                  )
                )}

                {viewMode === 'submitted-docs' && (
                  (submittedItems.length > 0 || viewedEmail.form_values?.clarification) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {submittedItems.length > 0 && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                            Checklist ({submittedItems.filter((it) => it.attached).length} of {submittedItems.length} attached)
                          </div>
                          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {submittedItems.map((it, i) => (
                              <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#f9fafb', borderRadius: 6 }}>
                                <span style={{ fontSize: 14, color: '#111827' }}>{it.label}</span>
                                {it.attached ? (
                                  <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                                    ✓ {it.filename || 'Attached'}
                                  </span>
                                ) : (
                                  <span style={{ fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>
                                    Missing
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {viewedEmail.form_values?.clarification && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
                            Clarification
                          </div>
                          <div style={{ fontSize: 14, padding: 10, background: '#f9fafb', borderRadius: 6 }}>
                            {viewedEmail.form_values.clarification}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                )}

                {Array.isArray(viewedEmail.attachments) && viewedEmail.attachments.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      Attachments ({viewedEmail.attachments.length})
                    </div>
                    {groupAttachmentsByType(viewedEmail.attachments).map((group) => (
                      <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
                          {group.label} ({group.items.length})
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {group.items.map((att) => {
                            const isLoading = loadingAttachmentId === att.id;
                            return (
                              <button
                                key={att.id}
                                type="button"
                                className="btn btn--ghost btn--sm"
                                onClick={() => viewEmailAttachment(att)}
                                disabled={loadingAttachmentId !== null}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                              >
                                {isLoading && <Spinner size={12} />}
                                {att.original_filename}
                                {typeof att.file_size === 'number' && (
                                  <> ({(att.file_size / 1024).toFixed(1)} KB)</>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Modal>
        );
      })()}

      {emailAttView && (
        <Modal title={emailAttView.filename} onClose={closeEmailAttView} size="lg">
          <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
            {emailAttView.contentType.startsWith('image/') ? (
              <img src={emailAttView.url} alt={emailAttView.filename} style={{ maxWidth: '100%', height: 'auto' }} />
            ) : emailAttView.contentType === 'application/pdf' ? (
              <iframe src={emailAttView.url} title={emailAttView.filename} style={{ width: '100%', height: '70vh', border: 'none' }} />
            ) : (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <p>Preview not available for this file type.</p>
                <a href={emailAttView.url} download={emailAttView.filename} className="btn btn--primary" style={{ marginTop: 12 }}>
                  Download
                </a>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Accordion ───────────────────────────────────────────────────────
function Accordion({ number, title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`claim-accordion ${open ? 'claim-accordion--open' : ''}`}>
      <button className="claim-accordion__head" onClick={() => setOpen((o) => !o)}>
        {number != null && <span className="claim-accordion__num">{number}</span>}
        <span className="claim-accordion__title">{title}</span>
        <span className="claim-accordion__chev">
          <IconChevronRight size={18} />
        </span>
      </button>
      {open && <div className="claim-accordion__body">{children}</div>}
    </div>
  );
}

// ── Status Timeline ─────────────────────────────────────────────────
function StatusTimeline({ events, onAction, pendingAction, claimOnboarded }) {
  if (!events || events.length === 0) {
    return <div className="claim-status-timeline__empty">No timeline events</div>;
  }
  const isPending = (emailId, mode) =>
    !!pendingAction && pendingAction.emailId === emailId && pendingAction.mode === mode;
  const anyPending = !!pendingAction;
  const APPROVAL_OUTCOMES = new Set(['APPROVED', 'PARTIALLY_APPROVED', 'ENHANCEMENT_APPROVED']);
  // For onboarded claims, hide "Submitted Documents" on insurer-side
  // (RECEIVED) outcomes unless the outcome is an approval.
  const showSubmittedDocs = (ev) =>
    !!ev.emailId && !!onAction &&
    !(claimOnboarded && ev.isReceivedSide && !APPROVAL_OUTCOMES.has(ev.rawStatus));
  // "View Form" — only the hospital's own submission rows (SUBMITTED,
  // ENHANCE_SUBMITTED, RECONSIDER, ADR_SUBMITTED) carry a structured form.
  // RECEIVED-side rows (insurer/provider decisions) never show it.
  const showViewForm = (ev) =>
    !!ev.emailId && !!onAction && !ev.isReceivedSide;
  return (
    <div className="claim-status-timeline">
      {events.map((ev, idx) => (
        <div key={idx} className={`claim-status-timeline__row claim-status-timeline__row--${ev.variant || 'default'}`}>
          <div className="claim-status-timeline__track">
            <div className="claim-status-timeline__dot" />
            {idx < events.length - 1 && <div className="claim-status-timeline__line" />}
          </div>
          <div className="claim-status-timeline__content">
            <div className="claim-status-timeline__row-head">
              <span className={`claim-status-timeline__pill claim-status-timeline__pill--${ev.variant || 'default'}`}>
                <span className="claim-status-timeline__pill-dot" />
                {ev.status}
              </span>
              {ev.amount != null && ev.amount !== '' && (
                <span className="claim-status-timeline__amount">{formatINR(ev.amount)}</span>
              )}
              {formatProviderTat(ev.stepTatMs) && (
                <span
                  className="claim-status-timeline__tat"
                  title="Time elapsed since the previous step"
                >
                  TAT: {formatProviderTat(ev.stepTatMs)}
                </span>
              )}
              <div className="claim-status-timeline__row-actions">
                {showViewForm(ev) && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => onAction('form', ev.emailId)}
                    title="View the form for this entry"
                    disabled={anyPending}
                  >
                    {isPending(ev.emailId, 'form') ? <Spinner size={12} /> : <IconFormEdit size={12} />} View Form
                  </button>
                )}
                {showSubmittedDocs(ev) && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => onAction('submitted-docs', ev.emailId)}
                    title="View documents associated with this entry"
                    disabled={anyPending}
                  >
                    {isPending(ev.emailId, 'submitted-docs') && <Spinner size={12} />}
                    {ev.rawStatus === 'ADR_SUBMITTED' ? ' Response Documents' : ' Attachments'}
                  </button>
                )}
                {ev.rawStatus === 'ADR_NMI' && ev.emailId && onAction && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => onAction('requested-docs', ev.emailId)}
                    title="View the documents the insurer requested"
                    disabled={anyPending}
                  >
                    {isPending(ev.emailId, 'requested-docs') && <Spinner size={12} />} Requested Documents
                  </button>
                )}
              </div>
            </div>
            {ev.description && <div className="claim-status-timeline__desc">{ev.description}</div>}
            {ev.timestamp && (
              <div className="claim-status-timeline__time">
                <span className="claim-status-timeline__time-ico">⏱</span>
                {new Date(ev.timestamp).toLocaleString('en-IN', {
                  year: 'numeric', month: '2-digit', day: '2-digit',
                  hour: '2-digit', minute: '2-digit', hour12: false,
                }).replace(',', '')}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Category email list ─────────────────────────────────────────────
function CategoryEmails({ emails, claimCaseId, claim, emptyText }) {
  if (!emails || emails.length === 0) {
    return <div className="claim-category__empty">{emptyText}</div>;
  }
  return <ClaimTimeline claimEmails={emails} claimCaseId={claimCaseId} claim={claim} />;
}
