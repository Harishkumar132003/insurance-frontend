import { useState } from 'react';
import { IconSend } from './icons/Icons';
import { claimCaseService } from '../services/api';
import Modal from './Modal';

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function getTypeLabel(emailType) {
  if (emailType === 'APPLIED') return 'Pre Auth Applied';
  return (emailType || '').replace(/_/g, ' ');
}

function getTypeModifier(emailType) {
  switch (emailType) {
    case 'APPLIED': return 'applied';
    case 'ADR': return 'adr';
    case 'QUERY': return 'query';
    default: return 'default';
  }
}

function TimelineEntry({ email, claimCaseId, onReplyClick, isLast }) {
  const [expanded, setExpanded] = useState(false);
  const [viewUrl, setViewUrl] = useState(null);
  const [viewFilename, setViewFilename] = useState('');
  const [viewContentType, setViewContentType] = useState('');

  const handleView = async (emailId, attId, filename) => {
    try {
      const res = await claimCaseService.viewAttachment(claimCaseId, emailId, attId);
      const contentType = res.headers?.['content-type'] || '';
      const url = window.URL.createObjectURL(new Blob([res.data], { type: contentType }));
      setViewUrl(url);
      setViewFilename(filename || 'attachment');
      setViewContentType(contentType);
    } catch {
      // handled by interceptor
    }
  };

  const closeView = () => {
    if (viewUrl) window.URL.revokeObjectURL(viewUrl);
    setViewUrl(null);
    setViewFilename('');
    setViewContentType('');
  };

  const modifier = getTypeModifier(email.email_type);
  const showReply = email.direction === 'RECEIVED' && onReplyClick;

  return (
    <div className={`claim-timeline__entry claim-timeline__entry--${modifier} ${isLast ? 'claim-timeline__entry--last' : ''}`}>
      {/* Date */}
      <div className="claim-timeline__date-row">
        <span className="claim-timeline__date">{formatDate(email.email_date)}</span>
        <span className="claim-timeline__time">{formatTime(email.email_date)}</span>
      </div>

      {/* Dot + status + content in a row */}
      <div className="claim-timeline__row">
        <div className="claim-timeline__track">
          <div className="claim-timeline__dot" />
          <div className="claim-timeline__line" />
        </div>
        <div className="claim-timeline__content">
          <div className={`claim-timeline__status claim-timeline__status--${modifier}`}>
            {getTypeLabel(email.email_type)}
          </div>
          <div className="claim-timeline__card">
        <div className="claim-timeline__card-subject">{email.subject}</div>
        <div className="claim-timeline__card-meta">
          <span>From: {email.from_email}</span>
          <span>To: {email.to_email}</span>
          <span className={`badge badge--${email.direction === 'SENT' ? 'success' : 'info'} badge--sm`}>
            {email.direction}
          </span>
        </div>
        <div className={`claim-timeline__card-body ${expanded ? 'claim-timeline__card-body--expanded' : ''}`}>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
            {email.body}
          </pre>
        </div>
        {email.body && email.body.length > 300 && (
          <button className="claim-timeline__expand-btn" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
        {email.attachments?.length > 0 && (
          <div className="claim-timeline__attachments">
            {email.attachments.map((att) => (
              <button
                key={att.id}
                className="btn btn--ghost btn--sm"
                onClick={() => handleView(email.id, att.id, att.original_filename)}
              >
                {att.original_filename} ({(att.file_size / 1024).toFixed(1)} KB)
              </button>
            ))}
          </div>
        )}
        {viewUrl && (
          <Modal title={viewFilename} onClose={closeView} size="lg">
            <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
              {viewContentType.startsWith('image/') ? (
                <img src={viewUrl} alt={viewFilename} style={{ maxWidth: '100%', height: 'auto' }} />
              ) : viewContentType === 'application/pdf' ? (
                <iframe src={viewUrl} title={viewFilename} style={{ width: '100%', height: '70vh', border: 'none' }} />
              ) : (
                <div style={{ textAlign: 'center', padding: 24 }}>
                  <p>Preview not available for this file type.</p>
                  <a href={viewUrl} download={viewFilename} className="btn btn--primary" style={{ marginTop: 12 }}>
                    Download
                  </a>
                </div>
              )}
            </div>
          </Modal>
        )}
        {showReply && (
          <button
            className="btn btn--primary btn--sm claim-timeline__reply-btn"
            onClick={() => onReplyClick(email.email_type)}
          >
            <IconSend size={14} /> Reply
          </button>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClaimTimeline({ claimEmails, claimCaseId, onReplyClick }) {
  const sorted = [...claimEmails].sort(
    (a, b) => new Date(b.email_date) - new Date(a.email_date)
  );

  const showReplyOnLatest = sorted.length > 0 && sorted[0].direction === 'RECEIVED';

  return (
    <div className="claim-timeline">
      {sorted.map((email, idx) => (
        <TimelineEntry
          key={email.id}
          email={email}
          claimCaseId={claimCaseId}
          onReplyClick={idx === 0 && showReplyOnLatest ? onReplyClick : undefined}
          isLast={idx === sorted.length - 1}
        />
      ))}
    </div>
  );
}
