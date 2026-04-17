import { useNavigate } from 'react-router-dom';
import './Pages.scss';

export default function PreAuthChoicePage() {
  const navigate = useNavigate();

  return (
    <div>
      <div className="page-header">
        <h1>Pre Auth Form</h1>
        <p>Choose how you want to fill the pre-authorization form</p>
      </div>

      <div className="preauth-choice">
        <button
          className="preauth-choice__card"
          onClick={() => navigate('/pre-auth/ai')}
        >
          <div className="preauth-choice__icon preauth-choice__icon--ai">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a4 4 0 0 1 4 4v1a3 3 0 0 1 3 3v1a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-1a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3H5a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2v-1a3 3 0 0 1 3-3V6a4 4 0 0 1 4-4z" />
              <circle cx="9" cy="13" r="1" fill="currentColor" />
              <circle cx="15" cy="13" r="1" fill="currentColor" />
              <path d="M10 17h4" />
            </svg>
          </div>
          <h3 className="preauth-choice__title">Fill with AI</h3>
          <p className="preauth-choice__desc">
            Fetch patient summary and policy details using UHID, then auto-fill the pre-auth form
          </p>
        </button>

        <button
          className="preauth-choice__card"
          onClick={() => navigate('/pre-auth/manual', { state: { from: '/pre-auth' } })}
        >
          <div className="preauth-choice__icon preauth-choice__icon--manual">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <h3 className="preauth-choice__title">Fill Manually</h3>
          <p className="preauth-choice__desc">
            Fill the pre-authorization form manually with all patient and insurance details
          </p>
        </button>
      </div>
    </div>
  );
}
