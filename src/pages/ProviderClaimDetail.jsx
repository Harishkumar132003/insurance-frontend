import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { claimCaseService } from '../services/api';
import { IconArrowLeft, IconChevronRight, IconCheck, IconAlertCircle, IconX, IconFormEdit } from '../components/icons/Icons';
import Spinner from '../components/Spinner';
import ClaimTimeline from '../components/ClaimTimeline';
import Modal from '../components/Modal';
import ProviderApproveModal from '../components/ProviderApproveModal';
import PartDPrintModal from '../components/PartDPrintModal';
import './Pages.scss';

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
]);

function formatINR(amount) {
  if (amount == null || amount === '') return '—';
  const num = Number(amount);
  if (Number.isNaN(num)) return '—';
  return num.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

function statusBadgeVariant(status) {
  switch (status) {
    case 'APPROVED': return 'success';
    case 'PARTIALLY_APPROVED': return 'info';
    case 'DENIED': return 'danger';
    case 'ADR_NMI': return 'warning';
    case 'SUBMITTED': return 'info';
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
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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

  // Per-action modal state. Approve has its own component; Deny / NMI are inline.
  const [approveOpen, setApproveOpen] = useState(false);
  const [partDOpen, setPartDOpen] = useState(false);

  const [denyOpen, setDenyOpen] = useState(false);
  const [denyRemarks, setDenyRemarks] = useState('');
  const [denySaving, setDenySaving] = useState(false);

  const [nmiOpen, setNmiOpen] = useState(false);
  const [nmiRemarks, setNmiRemarks] = useState('');
  const [nmiDocs, setNmiDocs] = useState([]);
  const [nmiNewDoc, setNmiNewDoc] = useState('');
  const [nmiSaving, setNmiSaving] = useState(false);

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
      });
      setClaimEmails(Array.isArray(emailsRes.data) ? emailsRes.data : []);
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
      const APPROVAL_STATES = new Set(['APPROVED', 'PARTIALLY_APPROVED']);
      const sorted = [...statusHistory]
        .filter((entry) => entry.status !== 'DRAFT')
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      return sorted.map((entry) => ({
        status: statusLabel(entry.status),
        variant: statusBadgeVariant(entry.status),
        description: entry.remarks || statusLabel(entry.status),
        timestamp: entry.created_at || null,
        amount: APPROVAL_STATES.has(entry.status) ? claim.approved_amount : undefined,
      }));
    }
    return [{
      status: statusLabel(claim.claim_status) || 'Submitted',
      variant: statusBadgeVariant(claim.claim_status),
      description: 'Pre-auth submitted',
      timestamp: claim.submitted_at,
    }];
  }, [claim, statusHistory]);

  const closeApprove = () => setApproveOpen(false);

  const handleApproveSubmitted = async () => {
    setApproveOpen(false);
    await loadClaimData(false);
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
      await claimCaseService.providerAction(claim.claim_case_id, {
        status: 'DENIED',
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
    setNmiSaving(true);
    try {
      await claimCaseService.providerAction(claim.claim_case_id, {
        status: 'ADR_NMI',
        remarks: nmiRemarks.trim(),
        documents_list: nmiDocs,
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
        <span className={`claim-detail__status-pill claim-detail__status-pill--${statusBadgeVariant(claim.claim_status)}`}>
          <span className="claim-detail__status-dot" />
          {statusLabel(claim.claim_status)}
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

      {canRespond && (
        <div className="claim-detail__actions">
          <button className="btn btn--success" onClick={() => setApproveOpen(true)}>
            <IconCheck size={16} /> Approve
          </button>
          <button className="btn btn--ghost" onClick={() => setNmiOpen(true)}>
            <IconAlertCircle size={16} /> NMI
          </button>
          <button className="btn btn--danger" onClick={() => setDenyOpen(true)}>
            <IconX size={16} /> Denied
          </button>
          <button className="btn btn--ghost" onClick={() => setPartDOpen(true)}>
            <IconFormEdit size={16} /> Part D
          </button>
        </div>
      )}

      <div className="claim-detail__accordions">
        <Accordion number={1} title="Status Timeline" defaultOpen>
          <StatusTimeline events={statusEvents} />
        </Accordion>
        <Accordion number={2} title={`Submitted (${submittedEmails.length})`}>
          <CategoryEmails
            emails={submittedEmails}
            claimCaseId={claim.claim_case_id}
            emptyText="No submitted emails"
          />
        </Accordion>
        <Accordion number={3} title={`Enhance Submitted (${enhanceSubmittedEmails.length})`}>
          <CategoryEmails
            emails={enhanceSubmittedEmails}
            claimCaseId={claim.claim_case_id}
            emptyText="No enhance submissions"
          />
        </Accordion>
        <Accordion number={4} title={`Reconsider (${reconsiderEmails.length})`}>
          <CategoryEmails
            emails={reconsiderEmails}
            claimCaseId={claim.claim_case_id}
            emptyText="No reconsideration submissions"
          />
        </Accordion>
        <Accordion number={5} title={`ADR Submitted (${adrSubmittedEmails.length})`}>
          <CategoryEmails
            emails={adrSubmittedEmails}
            claimCaseId={claim.claim_case_id}
            emptyText="No ADR submissions"
          />
        </Accordion>
      </div>

      {approveOpen && (
        <ProviderApproveModal
          claim={claim}
          onClose={closeApprove}
          onSubmitted={handleApproveSubmitted}
        />
      )}

      {partDOpen && (
        <PartDPrintModal claim={claim} onClose={() => setPartDOpen(false)} />
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
        <Modal title="NMI" onClose={closeNmi}>
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
    </div>
  );
}

// ── Accordion ───────────────────────────────────────────────────────
function Accordion({ number, title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`claim-accordion ${open ? 'claim-accordion--open' : ''}`}>
      <button className="claim-accordion__head" onClick={() => setOpen((o) => !o)}>
        <span className="claim-accordion__num">{number}</span>
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
function StatusTimeline({ events }) {
  if (!events || events.length === 0) {
    return <div className="claim-status-timeline__empty">No timeline events</div>;
  }
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
function CategoryEmails({ emails, claimCaseId, emptyText }) {
  if (!emails || emails.length === 0) {
    return <div className="claim-category__empty">{emptyText}</div>;
  }
  return <ClaimTimeline claimEmails={emails} claimCaseId={claimCaseId} />;
}
