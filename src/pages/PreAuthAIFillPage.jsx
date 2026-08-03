import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { workflowService, policyProviderService } from '../services/api';
import { IconArrowLeft, IconInfo } from '../components/icons/Icons';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';
import './Pages.scss';

function renderInlineMarkdown(text, keyPrefix = 'md') {
  const parts = [];
  const pattern = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={`${keyPrefix}-b-${index}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(<em key={`${keyPrefix}-i-${index}`}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(<code key={`${keyPrefix}-c-${index}`}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        parts.push(
          <a key={`${keyPrefix}-a-${index}`} href={linkMatch[2]} target="_blank" rel="noreferrer">
            {linkMatch[1]}
          </a>
        );
      } else {
        parts.push(token);
      }
    } else {
      parts.push(token);
    }
    lastIndex = pattern.lastIndex;
    index += 1;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

function MarkdownSummary({ text, className = '' }) {
  if (!text) return null;

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const codeLines = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(
        <pre key={`block-${key}`}><code>{codeLines.join('\n')}</code></pre>
      );
      key += 1;
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      const level = Math.min(6, trimmed.match(/^#+/)[0].length);
      const content = trimmed.replace(/^#{1,6}\s+/, '');
      const Tag = `h${level}`;
      blocks.push(<Tag key={`block-${key}`}>{renderInlineMarkdown(content, `h-${key}`)}</Tag>);
      key += 1;
      i += 1;
      continue;
    }

    if (/^>\s+/.test(trimmed)) {
      blocks.push(
        <blockquote key={`block-${key}`}>
          {renderInlineMarkdown(trimmed.replace(/^>\s+/, ''), `q-${key}`)}
        </blockquote>
      );
      key += 1;
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`block-${key}`}>
          {items.map((item, idx) => (
            <li key={`li-${key}-${idx}`}>{renderInlineMarkdown(item, `li-${key}-${idx}`)}</li>
          ))}
        </ul>
      );
      key += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={`block-${key}`}>
          {items.map((item, idx) => (
            <li key={`ol-${key}-${idx}`}>{renderInlineMarkdown(item, `ol-${key}-${idx}`)}</li>
          ))}
        </ol>
      );
      key += 1;
      continue;
    }

    const paragraphLines = [trimmed];
    i += 1;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (
        !next ||
        /^#{1,6}\s+/.test(next) ||
        /^>\s+/.test(next) ||
        /^[-*]\s+/.test(next) ||
        /^\d+\.\s+/.test(next) ||
        next.startsWith('```')
      ) {
        break;
      }
      paragraphLines.push(next);
      i += 1;
    }
    blocks.push(
      <p key={`block-${key}`}>
        {renderInlineMarkdown(paragraphLines.join(' '), `p-${key}`)}
      </p>
    );
    key += 1;
  }

  return <div className={`workflow__summary workflow__summary-md ${className}`.trim()}>{blocks}</div>;
}

function extractSummary(result) {
  if (!result) return '';
  if (typeof result.summary === 'string') return result.summary;
  if (typeof result.data?.summary === 'string') return result.data.summary;
  return '';
}

function extractChronicConditions(result) {
  if (!result) return null;
  return result.chronic_conditions || result.data?.chronic_conditions || null;
}

function extractCostEstimates(result) {
  if (!result) return null;
  return result.cost_estimates || result.data?.cost_estimates || null;
}

function PatientSummaryForm({ onResult }) {
  const { user } = useAuth();
  const toast = useToast();
  const [uhid, setUhid] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  // Two alternative sources for the same patient data: the hospital's UHID
  // workflow, or an uploaded case sheet. Only one runs.
  const [mode, setMode] = useState('uhid');
  const [caseSheet, setCaseSheet] = useState([]);
  const [fieldCount, setFieldCount] = useState(0);
  const summary = extractSummary(result);

  // Switching source clears the previous result so the two can never be
  // silently combined — the Proceed button always reflects one source.
  const switchMode = (next) => {
    if (next === mode) return;
    setMode(next);
    setResult(null);
    setFieldCount(0);
    setCaseSheet([]);
    onResult(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!uhid.trim()) {
      toast.error('Please enter a Patient ID');
      return;
    }
    if (!user?.hospital_id) {
      toast.error('No hospital assigned to your account');
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const res = await workflowService.run(user.hospital_id, { uhid: uhid.trim() });
      setResult(res.data);
      onResult({ uhid: uhid.trim(), data: res.data });
      toast.success('Patient summary fetched');
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  // Case sheet path. The endpoint returns the same {summary, data} envelope the
  // UHID workflow does, so everything downstream — the summary card, onResult,
  // handleProceed — works unchanged.
  // Mirror the server's limits so an oversized upload is caught before it's sent.
  const MAX_CASE_SHEET_FILES = 10;
  const MAX_CASE_SHEET_MB = 10;

  const handleCaseSheetChange = (e) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length > MAX_CASE_SHEET_FILES) {
      toast.error(`Up to ${MAX_CASE_SHEET_FILES} pages per case sheet`);
      return;
    }
    const tooBig = picked.find((f) => f.size > MAX_CASE_SHEET_MB * 1024 * 1024);
    if (tooBig) {
      toast.error(`${tooBig.name} is over ${MAX_CASE_SHEET_MB} MB`);
      return;
    }
    setCaseSheet(picked);
  };

  const handleCaseSheetSubmit = async (e) => {
    e.preventDefault();
    if (!caseSheet?.length) {
      toast.error('Choose the case sheet pages first');
      return;
    }

    setLoading(true);
    setResult(null);
    setFieldCount(0);
    try {
      const res = await workflowService.extractCaseSheet(caseSheet);
      const data = res.data || {};
      const count = Object.keys(data.data || {}).length;
      setResult(data);
      setFieldCount(count);
      if (data.data?.uhid) setUhid(data.data.uhid);
      onResult({ uhid: data.data?.uhid || '', data });
      if (count === 0) {
        toast.error('Nothing could be read from those pages — fill the form manually');
      } else {
        toast.success(`Extracted ${count} field${count > 1 ? 's' : ''} from the case sheet`);
      }
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="workflow__panel">
      <div className="workflow__form-card">
        <h2 className="workflow__card-title">Patient Summary</h2>
        <p className="workflow__card-desc">
          {mode === 'uhid'
            ? 'Fetch patient summary using their UHID'
            : 'Upload the case sheet and let AI read it'}
        </p>

        <div className="workflow__mode">
          <label className={mode === 'uhid' ? 'is-active' : ''}>
            <input
              type="radio"
              name="patient-source"
              checked={mode === 'uhid'}
              onChange={() => switchMode('uhid')}
            />
            <span>By UHID</span>
          </label>
          <label className={mode === 'case_sheet' ? 'is-active' : ''}>
            <input
              type="radio"
              name="patient-source"
              checked={mode === 'case_sheet'}
              onChange={() => switchMode('case_sheet')}
            />
            <span>By Case Sheet</span>
          </label>
        </div>

        {mode === 'uhid' ? (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Patient ID (UHID)</label>
              <input
                type="text"
                placeholder="e.g. 260029370955"
                value={uhid}
                onChange={(e) => setUhid(e.target.value)}
                autoFocus
              />
            </div>
            <div className="workflow__tip">
              <IconInfo size={16} className="workflow__tip-icon" />
              <span>
                <strong>Tip:</strong> The UHID is the unique hospital identifier assigned
                to the patient at registration. AI will fetch demographics, diagnosis,
                and treatment history automatically.
              </span>
            </div>
            <button
              type="submit"
              className="btn btn--primary btn--full"
              disabled={loading}
            >
              {loading ? <Spinner size={18} /> : 'Get Summary'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCaseSheetSubmit}>
            <div className="form-group">
              <label>Case Sheet (PDF or photos)</label>
              <input
                type="file"
                multiple
                accept=".pdf,image/jpeg,image/png,image/webp"
                onChange={handleCaseSheetChange}
              />
              {caseSheet?.length > 0 && (
                <small className="workflow__provider-hint">
                  {caseSheet.length} page{caseSheet.length > 1 ? 's' : ''}:{' '}
                  {caseSheet.map((f) => f.name).join(', ')}
                </small>
              )}
            </div>
            <div className="workflow__tip">
              <IconInfo size={16} className="workflow__tip-icon" />
              <span>
                <strong>Tip:</strong> Upload the whole case sheet — a PDF, or a photo of
                each page (up to {MAX_CASE_SHEET_FILES}). AI reads them together for
                demographics, diagnosis, findings, treatment and investigations. You review
                and edit everything on the form.
              </span>
            </div>
            <button
              type="submit"
              className="btn btn--primary btn--full"
              disabled={loading || !caseSheet?.length}
            >
              {loading ? <Spinner size={18} /> : 'Extract Case Sheet'}
            </button>
          </form>
        )}
      </div>

      {fieldCount > 0 && (
        <p className="workflow__provider-hint" style={{ marginTop: 12 }}>
          Extracted <strong>{fieldCount}</strong> field{fieldCount > 1 ? 's' : ''}
          {caseSheet?.length ? ` from ${caseSheet.length} page${caseSheet.length > 1 ? 's' : ''}` : ''}
        </p>
      )}

      {summary && (
        <div className="workflow__section" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <h3 style={{ marginBottom: 0 }}>Summary</h3>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setShowSummaryModal(true)}
            >
              View in Popup
            </button>
          </div>
          <MarkdownSummary text={summary} />

        </div>
      )}

      {showSummaryModal && summary && (
        <Modal title="Patient Summary" onClose={() => setShowSummaryModal(false)} size="lg">
          <MarkdownSummary text={summary} />
        </Modal>
      )}
    </div>
  );
}

function PolicyDetailForm({ onResult, onProviderChange }) {
  const toast = useToast();
  const [providers, setProviders] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [providerId, setProviderId] = useState('');
  const [policyId, setPolicyId] = useState('');
  const [policyFile, setPolicyFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const summary = extractSummary(result);

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const res = await policyProviderService.getForHospital();
        const list = Array.isArray(res.data) ? res.data : [];
        setProviders(list);
        if (list.length > 0) {
          const initial = list[0].provider_id || list[0].id;
          setProviderId(initial);
          if (typeof onProviderChange === 'function') onProviderChange(initial);
        }
      } catch {
        setProviders([]);
      } finally {
        setLoadingProviders(false);
      }
    };
    fetchProviders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedPolicyId = policyId.trim();
    if (!providerId) {
      toast.error('Please select a policy provider');
      return;
    }
    if (!trimmedPolicyId && !policyFile) {
      toast.error('Please enter a Policy ID or upload a Policy Document');
      return;
    }
    if (trimmedPolicyId && policyFile) {
      toast.error('Please provide either Policy ID or Policy Document, not both');
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const res = await policyProviderService.runPolicy(providerId, trimmedPolicyId, policyFile);
      setResult(res.data);
      onResult({ providerId, policyId: trimmedPolicyId, file: policyFile, data: res.data });
      toast.success('Policy details fetched');
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="workflow__panel">
      <div className="workflow__form-card">
        <h2 className="workflow__card-title">Policy Details</h2>
        <p className="workflow__card-desc">Provide Policy ID or upload Policy Document to fetch policy details</p>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Policy Provider</label>
              {loadingProviders ? (
                <div className="workflow__select-loading">
                  <Spinner size={16} />
                  <span>Loading providers...</span>
                </div>
              ) : providers.length === 0 ? (
                <div className="workflow__select-empty">No providers configured</div>
              ) : (
                <select
                  value={providerId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setProviderId(v);
                    if (typeof onProviderChange === 'function') onProviderChange(v);
                  }}
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.provider_id || p.id}>
                      {p.name}{p.provider_id ? ` (${p.provider_id})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Policy ID</label>
              <input
                type="text"
                placeholder="e.g. POL-12345"
                value={policyId}
                onChange={(e) => setPolicyId(e.target.value)}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Policy Document</label>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
              onChange={(e) => setPolicyFile(e.target.files?.[0] || null)}
            />
            {policyFile && (
              <small className="workflow__provider-hint">Selected: {policyFile.name}</small>
            )}
          </div>
          <button
            type="submit"
            className="btn btn--primary btn--full"
            disabled={loading || !providerId}
          >
            {loading ? <Spinner size={18} /> : 'Get Policy Details'}
          </button>
        </form>
      </div>

      {summary && (
        <div className="workflow__section" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <h3 style={{ marginBottom: 0 }}>Summary</h3>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setShowSummaryModal(true)}
            >
              View in Popup
            </button>
          </div>
          <MarkdownSummary text={summary} />
        </div>
      )}

      {showSummaryModal && summary && (
        <Modal title="Policy Summary" onClose={() => setShowSummaryModal(false)} size="lg">
          <MarkdownSummary text={summary} />
        </Modal>
      )}
    </div>
  );
}

export default function PreAuthAIFillPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [patientResult, setPatientResult] = useState(null);
  const [policyResult, setPolicyResult] = useState(null);
  // Tracks the AI page's policy-provider dropdown selection even before the
  // user runs the policy AI step, so we can carry it over to the form.
  const [pickedProviderId, setPickedProviderId] = useState('');
  const [claimCheckLoading, setClaimCheckLoading] = useState(false);
  const [claimCheckResult, setClaimCheckResult] = useState(null);

  const patientSummary = extractSummary(patientResult?.data);
  const policySummary = extractSummary(policyResult?.data);
  const hasPatientSummary = Boolean(patientSummary);
  const hasBothSummaries = Boolean(patientSummary && policySummary);
  const claimCheckSummary = extractSummary(claimCheckResult);

  const handleProceed = () => {
    // Merge extracted data from both results into a flat key-value map
    const merged = {
      ...(patientResult?.data?.data || patientResult?.data || {}),
      ...(policyResult?.data?.data || policyResult?.data || {}),
    };
    // The /run-policy endpoint exposes policy_number at the response root
    // (sibling of `data`). Surface it here so the form's
    // patient_insured.policy_number field auto-fills.
    const topLevelPolicyNumber =
      policyResult?.data?.policy_number || policyResult?.policy_number;
    if (topLevelPolicyNumber && !merged.policy_number) {
      merged.policy_number = topLevelPolicyNumber;
    }
    // Patient lookup may also return a policy_number — fall back if the
    // policy step didn't run.
    const patientPolicyNumber =
      patientResult?.data?.policy_number || patientResult?.policy_number;
    if (patientPolicyNumber && !merged.policy_number) {
      merged.policy_number = patientPolicyNumber;
    }
    const aiProviderId =
      pickedProviderId
      || policyResult?.providerId
      || policyResult?.data?.provider_id
      || '';
    navigate('/pre-auth/manual', {
      state: {
        from: '/pre-auth/ai',
        aiData: merged,
        aiUhid: patientResult?.uhid || '',
        aiProviderId,
        policyChronicConditions: extractChronicConditions(policyResult?.data),
        policyCostEstimates: extractCostEstimates(policyResult?.data),
        // Repeatable groups can't ride in aiData — the form's flat key mapping
        // doesn't cover repeatableGroups — so they travel on their own keys.
        aiTreatments: patientResult?.data?.treatments,
        aiInvestigations: patientResult?.data?.investigations,
        // Per-field confidence + provenance from a case sheet, keyed the same way
        // as aiData, plus the stored extraction to link on save.
        aiFieldMeta: patientResult?.data?.field_meta,
        aiCaseSheetId: patientResult?.data?.case_sheet_id,
        aiCaseSheetFiles: patientResult?.data?.files,
      },
    });
  };

  const handleCheckClaimApplicability = async () => {
    if (!hasBothSummaries) return;

    const patientData = {
      ...(patientResult?.data?.data || patientResult?.data || {}),
      summary: patientSummary,
    };

    if (patientResult?.uhid) {
      patientData.uhid = patientResult.uhid;
    }

    const policyData = {
      ...(policyResult?.data?.data || policyResult?.data || {}),
      summary: policySummary,
    };

    if (policyResult?.providerId) {
      policyData.provider_id = policyResult.providerId;
    }
    if (policyResult?.policyId) {
      policyData.policy_id = policyResult.policyId;
    }

    setClaimCheckLoading(true);
    setClaimCheckResult(null);
    try {
      const res = await workflowService.summarizeContext({
        patient: patientData,
        policy: policyData,
      });
      setClaimCheckResult(res.data);
      toast.success('Claim applicability checked');
    } catch {
      // handled by interceptor
    } finally {
      setClaimCheckLoading(false);
    }
  };

  return (
    <div>
      <button className="gv-page__back" onClick={() => navigate('/pre-auth')}>
        <IconArrowLeft size={18} />
        <span>Back to Options</span>
      </button>

      <div className="page-header">
        <h1>Fill with AI</h1>
        <p>Fetch patient and policy details, then auto-fill the pre-auth form</p>
      </div>

      <div className="workflow workflow--split">
        <PatientSummaryForm onResult={setPatientResult} />
        <PolicyDetailForm onResult={setPolicyResult} onProviderChange={setPickedProviderId} />
      </div>

      {hasBothSummaries && (
        <div className="preauth-ai-check">
          <button
            className="btn btn--primary btn--lg preauth-ai-proceed__check-btn"
            onClick={handleCheckClaimApplicability}
            disabled={claimCheckLoading}
          >
            {claimCheckLoading ? <Spinner size={18} /> : 'Check Claim Applicability'}
          </button>
        </div>
      )}

      {hasPatientSummary && (
        <div className="preauth-ai-proceed">
          {claimCheckSummary && (
            <div className="workflow__section preauth-ai-proceed__summary">
              <h3>Claim Applicability Summary</h3>
              <MarkdownSummary text={claimCheckSummary} className="preauth-ai-proceed__summary-text" />
            </div>
          )}
          <div className="preauth-ai-proceed__actions">
            <button
              className="btn btn--primary btn--lg preauth-ai-proceed__proceed-btn"
              onClick={handleProceed}
            >
              Proceed to Pre-Auth Form
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
