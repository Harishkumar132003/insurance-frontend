import { useState, useEffect } from 'react';
import { useToast } from '../components/Toast';
import { emailService } from '../services/api';
import { IconSend, IconRefresh, IconMail } from '../components/icons/Icons';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import './Pages.scss';

export default function Email() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('inbox');
  const [emails, setEmails] = useState([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState(null);

  // Send form state
  const [formDataId, setFormDataId] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  const fetchInbox = async () => {
    setLoadingInbox(true);
    try {
      const res = await emailService.inbox(5);
      setEmails(Array.isArray(res.data) ? res.data : []);
    } catch {
      setEmails([]);
    } finally {
      setLoadingInbox(false);
    }
  };

  useEffect(() => {
    fetchInbox();
  }, []);

  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!formDataId) {
      toast.error('Please enter a Form Data ID');
      return;
    }
    if (!toEmail.trim()) {
      toast.error('Please enter a recipient email');
      return;
    }

    setSending(true);
    setSendResult(null);
    try {
      const fd = new FormData();
      fd.append('claim_case_id', Number(formDataId));
      fd.append('subject', `Pre-Auth Form - Case #${formDataId}`);
      fd.append('content', `Sending form data for case #${formDataId} to ${toEmail.trim()}`);
      const res = await emailService.send(fd);
      setSendResult(res.data);
      toast.success('Email sent successfully');
      setFormDataId('');
      setToEmail('');
    } catch {
      // handled by interceptor
    } finally {
      setSending(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div>
      <div className="page-header">
        <h1>Email</h1>
        <p>Send pre-auth forms and view inbox</p>
      </div>

      <div className="email-tabs">
        <button
          className={`email-tabs__btn ${activeTab === 'inbox' ? 'email-tabs__btn--active' : ''}`}
          onClick={() => setActiveTab('inbox')}
        >
          <IconMail size={16} />
          Inbox
        </button>
        <button
          className={`email-tabs__btn ${activeTab === 'send' ? 'email-tabs__btn--active' : ''}`}
          onClick={() => setActiveTab('send')}
        >
          <IconSend size={16} />
          Send Email
        </button>
      </div>

      {activeTab === 'send' && (
        <div className="email-send">
          <div className="email-send__card">
            <h2 className="email-send__title">Send Pre-Auth Form</h2>
            <p className="email-send__desc">
              Send a submitted form as a formatted email to the insurance provider
            </p>
            <form onSubmit={handleSendEmail} className="email-send__form">
              <div className="form-group">
                <label>Form Data ID</label>
                <input
                  type="number"
                  placeholder="e.g. 1"
                  value={formDataId}
                  onChange={(e) => setFormDataId(e.target.value)}
                  min="1"
                />
              </div>
              <div className="form-group">
                <label>Recipient Email</label>
                <input
                  type="email"
                  placeholder="e.g. insurance@provider.com"
                  value={toEmail}
                  onChange={(e) => setToEmail(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={sending}
              >
                {sending ? <Spinner size={18} /> : <><IconSend size={16} /> Send Email</>}
              </button>
            </form>

            {sendResult && (
              <div className="email-send__result">
                <div className="email-send__result-icon">
                  <IconMail size={24} />
                </div>
                <div className="email-send__result-info">
                  <strong>{sendResult.message}</strong>
                  <span>To: {sendResult.to_email}</span>
                  <span>Subject: {sendResult.subject}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'inbox' && (
        <div className="email-inbox">
          <div className="email-inbox__toolbar">
            <span className="email-inbox__count">
              {emails.length} message{emails.length !== 1 ? 's' : ''}
            </span>
            <button
              className="btn btn--ghost"
              onClick={fetchInbox}
              disabled={loadingInbox}
            >
              {loadingInbox ? <Spinner size={16} /> : <IconRefresh size={16} />}
              Refresh
            </button>
          </div>

          {loadingInbox ? (
            <div className="page-loading"><Spinner /></div>
          ) : emails.length === 0 ? (
            <div className="table-card">
              <EmptyState message="No emails in inbox" />
            </div>
          ) : (
            <div className="email-inbox__list">
              {emails.map((email) => (
                <div
                  key={email.id}
                  className="email-inbox__item"
                  onClick={() => setSelectedEmail(email)}
                >
                  <div className="email-inbox__item-avatar">
                    {email.from_email?.[0]?.toUpperCase() || 'M'}
                  </div>
                  <div className="email-inbox__item-content">
                    <div className="email-inbox__item-header">
                      <span className="email-inbox__item-from">{email.from_email}</span>
                      <span className="email-inbox__item-date">{formatDate(email.date)}</span>
                    </div>
                    <div className="email-inbox__item-subject">{email.subject}</div>
                    <div className="email-inbox__item-preview">
                      {email.body?.replace(/<[^>]*>/g, '').slice(0, 120) || 'No content'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedEmail && (
        <Modal title={selectedEmail.subject || 'Email'} onClose={() => setSelectedEmail(null)}>
          <div className="email-detail">
            <div className="email-detail__meta">
              <div className="email-detail__row">
                <span className="email-detail__label">From</span>
                <span>{selectedEmail.from_email}</span>
              </div>
              <div className="email-detail__row">
                <span className="email-detail__label">Date</span>
                <span>{formatDate(selectedEmail.date)}</span>
              </div>
              <div className="email-detail__row">
                <span className="email-detail__label">Subject</span>
                <span>{selectedEmail.subject}</span>
              </div>
            </div>
            <div className="email-detail__divider" />
            <div
              className="email-detail__body"
              dangerouslySetInnerHTML={{ __html: selectedEmail.body }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
