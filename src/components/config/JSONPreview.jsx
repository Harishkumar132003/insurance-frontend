import { useState } from 'react';
import './ConfigComponents.scss';

export default function JSONPreview({ data }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
    }
  };

  return (
    <div className="json-preview">
      <div className="json-preview__header">
        <h3>JSON Preview</h3>
        <button type="button" className="json-preview__copy" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="json-preview__code">{json}</pre>
    </div>
  );
}
