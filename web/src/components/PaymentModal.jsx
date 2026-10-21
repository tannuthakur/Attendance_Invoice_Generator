import { useState } from 'react';
import { api } from '../api';
import { Field, FormModal, useToast } from './ui';
import { formatDate, formatMoney, todayIso } from '../format';

/** Records that an invoice has been paid (date, optional reference and note). */
export function MarkPaidModal({ invoice, path, amount, currency, onClose, onSaved }) {
  const toast = useToast();
  const [paidOn, setPaidOn] = useState(todayIso());
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  const submit = async () => {
    const updated = await api(`${path}/pay`, {
      method: 'POST',
      body: { paidOn, reference: reference.trim() || undefined, note: note.trim() || undefined },
    });
    toast(`${invoice.invoiceNumber} marked as paid`);
    onSaved(updated);
  };

  return (
    <FormModal title={`Mark ${invoice.invoiceNumber} as paid`} submitLabel="Mark as paid" onSubmit={submit} onClose={onClose}>
      {amount !== undefined && (
        <p style={{ margin: 0 }}>
          Amount: <strong className="mono">{formatMoney(amount, currency)}</strong>
        </p>
      )}
      <div className="form-grid">
        <Field label="Payment received on">
          <input className="input" type="date" value={paidOn} max={todayIso()} onChange={(e) => setPaidOn(e.target.value)} required autoFocus />
        </Field>
        <Field label="Reference" hint="Bank / transaction reference (optional).">
          <input className="input" value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} placeholder="e.g. UTR / SWIFT ref" />
        </Field>
        <Field label="Note" className="full">
          <textarea className="input" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
    </FormModal>
  );
}

/** Banner on a paid invoice, with an undo. */
export function PaidBanner({ invoice, path, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const undo = async () => {
    if (!window.confirm(`Mark ${invoice.invoiceNumber} as unpaid? The payment details will be cleared.`)) return;
    setBusy(true);
    try {
      await api(`${path}/unpay`, { method: 'POST' });
      toast(`${invoice.invoiceNumber} marked as unpaid`);
      onChanged();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="alert success actions" style={{ marginBottom: 16, justifyContent: 'space-between' }}>
      <span>
        <strong>Paid</strong> on {formatDate(invoice.paidAt)}
        {invoice.paymentReference && <> · Ref <span className="mono">{invoice.paymentReference}</span></>}
        {invoice.paymentNote && <> · {invoice.paymentNote}</>}
      </span>
      <button className="btn btn-sm" disabled={busy} onClick={undo}>Mark as unpaid</button>
    </div>
  );
}
