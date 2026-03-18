import { useState, useEffect } from 'react';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { configService, hospitalService } from '../services/api';
import ConfigBuilder from '../components/config/ConfigBuilder';
import Spinner from '../components/Spinner';
import './Pages.scss';

const EMPTY_CONFIG = { auth: null, steps: [], required_fields: [] };

export default function Configurations() {
  const { user, isSuperAdmin } = useAuth();
  const [configData, setConfigData] = useState(null);
  const [rawJson, setRawJson] = useState(JSON.stringify(EMPTY_CONFIG, null, 2));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState('form'); // 'form' | 'raw'
  const [hospitals, setHospitals] = useState([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState('');
  const [configLoaded, setConfigLoaded] = useState(false);
  const toast = useToast();

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      if (isSuperAdmin) {
        const res = await hospitalService.getAll();
        const list = Array.isArray(res.data) ? res.data : [];
        setHospitals(list);
        if (list.length > 0) {
          setSelectedHospitalId(list[0].id);
          await loadConfig(list[0].id);
        } else {
          setLoading(false);
        }
      } else if (user?.hospital_id) {
        setSelectedHospitalId(user.hospital_id);
        await loadConfig(user.hospital_id);
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  };

  const loadConfig = async (hospitalId) => {
    if (!hospitalId) return;
    setLoading(true);
    setConfigLoaded(false);
    try {
      const res = await configService.get(hospitalId);
      const data = res.data?.config ?? res.data;
      setConfigData(data);
      setRawJson(JSON.stringify(data, null, 2));
      setConfigLoaded(true);
    } catch {
      setConfigData(null);
      setRawJson(JSON.stringify(EMPTY_CONFIG, null, 2));
      setConfigLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  const handleHospitalChange = (e) => {
    const id = e.target.value;
    setSelectedHospitalId(id);
    loadConfig(id);
  };

  // Save from form builder
  const handleFormSave = async (json) => {
    if (!selectedHospitalId) {
      toast.error('No hospital selected');
      return;
    }
    setSaving(true);
    try {
      await configService.save(selectedHospitalId, json);
      toast.success('Configuration saved');
      setConfigData(json);
      setRawJson(JSON.stringify(json, null, 2));
    } catch {
      // handled
    } finally {
      setSaving(false);
    }
  };

  // Save from raw JSON
  const handleRawSave = async () => {
    if (!selectedHospitalId) {
      toast.error('No hospital selected');
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      toast.error('Invalid JSON format');
      return;
    }
    if (!Array.isArray(parsed.steps)) {
      toast.error('Config must include a "steps" array');
      return;
    }
    if (!Array.isArray(parsed.required_fields)) {
      toast.error('Config must include a "required_fields" array');
      return;
    }
    setSaving(true);
    try {
      await configService.save(selectedHospitalId, parsed);
      toast.success('Configuration saved');
      setConfigData(parsed);
    } catch {
      // handled
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Configurations</h1>
        <p>Manage hospital workflow configuration</p>
      </div>

      {/* Hospital selector + view toggle */}
      <div className="config-toolbar">
        <div className="config-toolbar__left">
          {isSuperAdmin && hospitals.length > 0 ? (
            <div className="form-group">
              <label>Hospital</label>
              <select value={selectedHospitalId} onChange={handleHospitalChange}>
                {hospitals.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="form-group">
              <label>Hospital ID</label>
              <input
                type="text"
                value={selectedHospitalId}
                readOnly
                className="input--readonly"
              />
            </div>
          )}
        </div>

        <div className="view-toggle">
          <button
            type="button"
            className={`view-toggle__btn ${view === 'form' ? 'view-toggle__btn--active' : ''}`}
            onClick={() => setView('form')}
          >
            Form View
          </button>
          <button
            type="button"
            className={`view-toggle__btn ${view === 'raw' ? 'view-toggle__btn--active' : ''}`}
            onClick={() => setView('raw')}
          >
            Raw JSON
          </button>
        </div>
      </div>

      {loading ? (
        <div className="page-loading"><Spinner /></div>
      ) : view === 'form' ? (
        <ConfigBuilder
          key={`${selectedHospitalId}-${configLoaded}`}
          initialConfig={configData}
          onSave={handleFormSave}
          saving={saving}
        />
      ) : (
        <div className="config-editor">
          <div className="config-editor__card">
            <textarea
              className="config-editor__textarea"
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="config-editor__actions">
            <button className="btn btn--ghost" onClick={() => loadConfig(selectedHospitalId)}>
              Reset
            </button>
            <button
              className="btn btn--primary"
              onClick={handleRawSave}
              disabled={saving || !selectedHospitalId}
            >
              {saving ? <Spinner size={18} /> : 'Save Configuration'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
