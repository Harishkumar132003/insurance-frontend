import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { workflowService, policyProviderService } from '../services/api';
import Spinner from '../components/Spinner';
import './Pages.scss';

function PatientSummaryForm() {
  const { user } = useAuth();
  const toast = useToast();
  const [uhid, setUhid] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

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
      toast.success('Patient summary fetched');
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
        <p className="workflow__card-desc">Fetch patient summary using their UHID</p>
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
          <button
            type="submit"
            className="btn btn--primary btn--full"
            disabled={loading}
          >
            {loading ? <Spinner size={18} /> : 'Get Summary'}
          </button>
        </form>
      </div>

      {result && (
        <div className="workflow__results">
          {result.summary && (
            <div className="workflow__section">
              <h3>Summary</h3>
              <div className="workflow__summary">{result.summary}</div>
            </div>
          )}
          <div className="workflow__section">
            <h3>Patient Details</h3>
            <pre className="workflow__json">{JSON.stringify(result, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function PolicyDetailForm() {
  const toast = useToast();
  const [providers, setProviders] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [providerId, setProviderId] = useState('');
  const [policyId, setPolicyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const res = await policyProviderService.getAll();
        const list = Array.isArray(res.data) ? res.data : [];
        setProviders(list);
        if (list.length > 0) {
          setProviderId(list[0].provider_id || list[0].id);
        }
      } catch {
        setProviders([]);
      } finally {
        setLoadingProviders(false);
      }
    };
    fetchProviders();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!providerId) {
      toast.error('Please select a policy provider');
      return;
    }
    if (!policyId.trim()) {
      toast.error('Please enter a Policy ID');
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const res = await policyProviderService.runPolicy(providerId, policyId.trim());
      setResult(res.data);
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
        <p className="workflow__card-desc">Look up policy information by provider and policy ID</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
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
                onChange={(e) => setProviderId(e.target.value)}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.provider_id || p.id}>
                    {p.name}{p.provider_id ? ` (${p.provider_id})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="form-group">
            <label>Policy ID</label>
            <input
              type="text"
              placeholder="e.g. POL-12345"
              value={policyId}
              onChange={(e) => setPolicyId(e.target.value)}
            />
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

      {result && (
        <div className="workflow__results">
          {result.summary && (
            <div className="workflow__section">
              <h3>Summary</h3>
              <div className="workflow__summary">{result.summary}</div>
            </div>
          )}
          <div className="workflow__section">
            <h3>Policy Details</h3>
            <pre className="workflow__json">{JSON.stringify(result, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RunWorkflow() {
  return (
    <div>
      <div className="page-header">
        <h1>Patient Lookup</h1>
        <p>Fetch patient and policy details</p>
      </div>

      <div className="workflow workflow--split">
        <PatientSummaryForm />
        <PolicyDetailForm />
      </div>
    </div>
  );
}
