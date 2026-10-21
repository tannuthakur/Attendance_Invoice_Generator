import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { STATUS_LABELS } from '../format';

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
/** Runs `fn` when deps change. Returns { data, error, loading, reload, setData }. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true });
  const seq = useRef(0);

  const run = useCallback(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    return Promise.resolve()
      .then(fn)
      .then(
        (data) => id === seq.current && setState({ data, error: null, loading: false }),
        (error) => id === seq.current && setState((s) => ({ ...s, error, loading: false })),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
  return { ...state, reload: run, setData };
}

export function useDebounced(value, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'info') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------
export function PageHeader({ title, subtitle, crumbs, children }) {
  return (
    <div className="page-head">
      <div>
        {crumbs && <div className="crumbs muted">{crumbs}</div>}
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="loading">
      <span className="spinner" /> {label}
    </div>
  );
}

export function ErrorAlert({ error }) {
  if (!error) return null;
  return <div className="alert error">{error.message || String(error)}</div>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

const BADGE_COLORS = {
  on_role: 'green', off_role: 'red', issued: 'blue', paid: 'green', void: 'red', admin: 'blue', user: '',
  present: 'green', half_day: 'amber', paid_leave: 'blue', absent: 'red',
};

export function Badge({ value, children, color }) {
  return <span className={`badge ${color ?? BADGE_COLORS[value] ?? ''}`}>{children ?? STATUS_LABELS[value] ?? value}</span>;
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

export function Modal({ title, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * Modal containing a form. `onSubmit` may throw; the error is shown inline.
 * Children receive nothing special; use controlled inputs in the parent.
 */
export function FormModal({ title, submitLabel = 'Save', onSubmit, onClose, children, wide, danger }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      wide={wide}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="modal-form" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>
            {busy ? 'Saving…' : submitLabel}
          </button>
        </>
      }
    >
      <form id="modal-form" onSubmit={submit} className="stack">
        {children}
        <ErrorAlert error={error} />
      </form>
    </Modal>
  );
}

export function Pagination({ page, limit, total, onPage }) {
  const pages = Math.max(1, Math.ceil((total || 0) / limit));
  const from = total ? (page - 1) * limit + 1 : 0;
  const to = Math.min(page * limit, total || 0);
  return (
    <div className="pagination">
      <span className="muted small">{total ? `${from}–${to} of ${total}` : 'No results'}</span>
      <div className="actions">
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span className="small muted">Page {page} of {pages}</span>
        <button className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([key, label]) => (
        <button key={key} role="tab" aria-selected={value === key} className={value === key ? 'on' : ''} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}
