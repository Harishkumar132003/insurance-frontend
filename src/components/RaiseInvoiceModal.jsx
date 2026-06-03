import { useMemo, useState } from 'react';
import Modal from './Modal';
import Spinner from './Spinner';
import { IconPlus, IconX, IconCheck } from './icons/Icons';
import { useToast } from './Toast';
import { invoiceService } from '../services/api';
import './RaiseInvoiceModal.scss';

function formatINR(amount) {
  if (amount == null || amount === '') return '—';
  const num = Number(amount);
  if (Number.isNaN(num)) return '—';
  return num.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function RaiseInvoiceModal({
  claimCaseId,
  claimApprovedAmount,
  onClose,
  onRaised,
}) {
  const toast = useToast();
  const [insurerInvoiceId, setInsurerInvoiceId] = useState('');
  const [insurerAmount, setInsurerAmount] = useState(
    claimApprovedAmount != null ? String(Number(claimApprovedAmount)) : ''
  );
  const [referenceId, setReferenceId] = useState('');
  const [payments, setPayments] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const insurerNum = Number(insurerAmount) || 0;
  const paymentsTotal = useMemo(
    () => payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    [payments],
  );
  const overpaid = paymentsTotal > insurerNum && insurerNum > 0;
  const matchesApproved =
    claimApprovedAmount != null &&
    insurerNum > 0 &&
    Math.abs(insurerNum - Number(claimApprovedAmount)) < 0.01;

  const setPayment = (idx, patch) =>
    setPayments((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  const removePayment = (idx) =>
    setPayments((prev) => prev.filter((_, i) => i !== idx));
  const addPayment = () =>
    setPayments((prev) => [...prev, { payment_date: todayISO(), amount: '', note: '' }]);

  const canSubmit =
    insurerInvoiceId.trim() &&
    insurerNum > 0 &&
    !overpaid &&
    !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    const cleanedPayments = payments
      .filter((p) => Number(p.amount) > 0)
      .map((p) => ({
        payment_date: p.payment_date || todayISO(),
        amount: Number(p.amount),
        note: p.note?.trim() || null,
      }));
    setSubmitting(true);
    try {
      const invoice = await invoiceService.raise(claimCaseId, {
        insurer_invoice_id: insurerInvoiceId.trim(),
        insurer_amount: insurerNum,
        reference_id: referenceId.trim() || null,
        payments: cleanedPayments,
      });
      toast.success('Invoice raised');
      if (onRaised) onRaised(invoice);
    } catch {
      // handled by interceptor
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Raise Invoice" onClose={onClose} size="lg">
      <form className="raise-invoice" onSubmit={handleSubmit}>
        {/* Summary bar — quick-glance context for the user */}
        <div className="raise-invoice__summary">
          <div className="raise-invoice__summary-item">
            <span className="raise-invoice__summary-label">Claim Approved</span>
            <span className="raise-invoice__summary-value">
              {formatINR(claimApprovedAmount)}
            </span>
          </div>
          <div className="raise-invoice__summary-divider" />
          <div className="raise-invoice__summary-item">
            <span className="raise-invoice__summary-label">Invoice Amount</span>
            <span className={`raise-invoice__summary-value ${insurerNum > 0 ? 'raise-invoice__summary-value--accent' : ''}`}>
              {insurerNum > 0 ? formatINR(insurerNum) : '—'}
            </span>
          </div>
          <div className="raise-invoice__summary-divider" />
          <div className="raise-invoice__summary-item">
            <span className="raise-invoice__summary-label">Payments</span>
            <span className={`raise-invoice__summary-value ${overpaid ? 'raise-invoice__summary-value--danger' : ''}`}>
              {paymentsTotal > 0 ? formatINR(paymentsTotal) : '—'}
            </span>
          </div>
        </div>

        {/* Invoice details */}
        <section className="raise-invoice__section">
          <header className="raise-invoice__section-head">
            <h4>Invoice details</h4>
            {matchesApproved && (
              <span className="raise-invoice__hint raise-invoice__hint--ok">
                <IconCheck size={12} /> Matches the approved amount
              </span>
            )}
          </header>
          <div className="raise-invoice__grid raise-invoice__grid--2">
            <Field label="Insurer Invoice ID" required>
              <input
                type="text"
                value={insurerInvoiceId}
                onChange={(e) => setInsurerInvoiceId(e.target.value)}
                placeholder="e.g. INV-2026-001234"
                required
              />
            </Field>
            <Field label="Insurer Amount (₹)" required>
              <input
                type="number"
                min="0"
                step="0.01"
                value={insurerAmount}
                onChange={(e) => setInsurerAmount(e.target.value)}
                placeholder="0"
                required
              />
            </Field>
            <Field
              label="Reference ID"
              hint="Optional cross-reference (UTR, settlement ID, etc.)"
              span={2}
            >
              <input
                type="text"
                value={referenceId}
                onChange={(e) => setReferenceId(e.target.value)}
                placeholder="e.g. UTR123456789"
              />
            </Field>
          </div>
        </section>

        {/* Payments */}
        <section className="raise-invoice__section">
          <header className="raise-invoice__section-head">
            <h4>Payments</h4>
            <span className="raise-invoice__hint">
              Optional — payments can also be added later from the case page.
            </span>
          </header>

          {payments.length === 0 ? (
            <button
              type="button"
              className="raise-invoice__empty"
              onClick={addPayment}
            >
              <IconPlus size={14} />
              <span>Add a payment received against this invoice</span>
            </button>
          ) : (
            <div className="raise-invoice__payments">
              <div className="raise-invoice__payments-head">
                <span>Date</span>
                <span>Amount (₹)</span>
                <span>Note</span>
                <span />
              </div>
              {payments.map((p, idx) => (
                <div key={idx} className="raise-invoice__payment-row">
                  <input
                    type="date"
                    value={p.payment_date}
                    onChange={(e) => setPayment(idx, { payment_date: e.target.value })}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={p.amount}
                    onChange={(e) => setPayment(idx, { amount: e.target.value })}
                    placeholder="0"
                  />
                  <input
                    type="text"
                    value={p.note}
                    onChange={(e) => setPayment(idx, { note: e.target.value })}
                    placeholder="UTR / mode / remarks"
                  />
                  <button
                    type="button"
                    className="raise-invoice__row-remove"
                    onClick={() => removePayment(idx)}
                    title="Remove this payment"
                    aria-label="Remove payment"
                  >
                    <IconX size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="raise-invoice__add-row"
                onClick={addPayment}
              >
                <IconPlus size={14} /> Add another payment
              </button>

              <div
                className={`raise-invoice__payments-total ${overpaid ? 'raise-invoice__payments-total--danger' : ''}`}
              >
                <span>
                  {payments.length} payment{payments.length === 1 ? '' : 's'} · Total{' '}
                  <strong>{formatINR(paymentsTotal)}</strong>
                </span>
                <span>
                  {overpaid
                    ? `Exceeds invoice by ${formatINR(paymentsTotal - insurerNum)}`
                    : insurerNum > 0
                      ? `Outstanding ${formatINR(Math.max(insurerNum - paymentsTotal, 0))}`
                      : ''}
                </span>
              </div>
            </div>
          )}
        </section>

        <footer className="raise-invoice__footer">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
            {submitting ? <Spinner size={16} /> : 'Raise Invoice'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function Field({ label, required, hint, span = 1, children }) {
  return (
    <div className="raise-invoice__field" style={{ gridColumn: `span ${span}` }}>
      <label className="raise-invoice__field-label">
        {label}
        {required && <span className="raise-invoice__req">*</span>}
      </label>
      {children}
      {hint && <span className="raise-invoice__field-hint">{hint}</span>}
    </div>
  );
}
