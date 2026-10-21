import { useState } from 'react';
import { api } from '../api';
import { ErrorAlert, Field, Loading, Modal, useAsync } from './ui';

/**
 * Permanent-delete dialog. Loads `${path}/usage` to list what will be removed,
 * refuses when the API says it is blocked, and asks the user to type `name` to confirm.
 *
 * @param {{ title: string, name: string, path: string, describe: (usage) => string[], onDeleted: () => void, onClose: () => void }} props
 */
export function DeleteConfirm({ title, name, path, describe, onDeleted, onClose }) {
  const usage = useAsync(() => api(`${path}/usage`), [path]);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const confirmText = name.trim();
  const matches = typed.trim().toLowerCase() === confirmText.toLowerCase();

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: 'DELETE' });
      onDeleted();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  const items = usage.data ? describe(usage.data).filter(Boolean) : [];

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" style={{ borderColor: 'var(--danger)' }} disabled={!usage.data?.canDelete || !matches || busy} onClick={remove}>
            {busy ? 'Deleting…' : 'Delete permanently'}
          </button>
        </>
      }
    >
      {usage.loading && !usage.data ? (
        <Loading label="Checking what will be removed…" />
      ) : usage.error ? (
        <ErrorAlert error={usage.error} />
      ) : !usage.data.canDelete ? (
        <div className="alert error">{usage.data.blockedReason}</div>
      ) : (
        <div className="stack">
          <p style={{ margin: 0 }}>
            This permanently deletes <strong>{name}</strong> and can't be undone.
          </p>
          {items.length > 0 ? (
            <div>
              <div className="muted small" style={{ marginBottom: 4 }}>Also removed:</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Nothing else is linked to it.</p>
          )}
          <Field label={<>Type <strong>{confirmText}</strong> to confirm</>}>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </Field>
          <ErrorAlert error={error} />
        </div>
      )}
    </Modal>
  );
}

export const plural = (n, word) => (n ? `${n} ${word}${n === 1 ? '' : 's'}` : null);

/** Permanently deletes an invoice (record + stored PDF) after the user types its number. */
export function DeleteInvoiceConfirm({ invoice, path, onDeleted, onClose }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const number = invoice.invoiceNumber;
  const matches = typed.trim().toLowerCase() === number.toLowerCase();

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: 'DELETE' });
      onDeleted();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Delete invoice ${number}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" style={{ borderColor: 'var(--danger)' }} disabled={!matches || busy} onClick={remove}>
            {busy ? 'Deleting…' : 'Delete permanently'}
          </button>
        </>
      }
    >
      <div className="stack">
        {invoice.status === 'paid' ? (
          <div className="alert warning">
            This invoice is <strong>paid</strong>. Deleting it also deletes the payment record.
          </div>
        ) : invoice.status === 'issued' ? (
          <div className="alert warning">
            This invoice is <strong>issued</strong>. If it has been sent to the client, consider <strong>Void</strong> instead; voiding keeps a record.
          </div>
        ) : null}
        <p style={{ margin: 0 }}>
          This permanently deletes <strong>{number}</strong> and removes its PDF from storage. It can't be undone.
        </p>
        <Field label={<>Type <strong>{number}</strong> to confirm</>}>
          <input className="input mono" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
        </Field>
        <ErrorAlert error={error} />
      </div>
    </Modal>
  );
}
