import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { workflowService } from '../services/api';
import Spinner from '../components/Spinner';
import './Pages.scss';

export default function RunWorkflow() {
  const { user } = useAuth();
  const [uhid, setUhid] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const toast = useToast();

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
      toast.success('Patient details fetched');
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Patient Lookup</h1>
        <p>Fetch patient details using their UHID</p>
      </div>

      <div className="workflow">
        <div className="workflow__form-card">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Patient ID (UHID)</label>
              <input
                type="text"
                placeholder="e.g. PAT123"
                value={uhid}
                onChange={(e) => setUhid(e.target.value)}
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn--primary btn--full" disabled={loading}>
              {loading ? <Spinner size={18} /> : 'Fetch Details'}
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
    </div>
  );
}
