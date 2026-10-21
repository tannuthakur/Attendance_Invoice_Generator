import { useEffect } from 'react';

/**
 * Dropdown with previous/next buttons for jumping between records on a detail page.
 * Alt + ← / → also step through the list.
 *
 * @param {{ items: {id: string, label: string}[], currentId: string, onSelect: (id: string) => void, label: string, loading?: boolean }} props
 */
export function RecordSwitcher({ items, currentId, onSelect, label, loading = false }) {
  const index = items.findIndex((i) => i.id === currentId);
  const prev = index > 0 ? items[index - 1] : null;
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null;

  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (e.key === 'ArrowLeft' && prev) onSelect(prev.id);
      if (e.key === 'ArrowRight' && next) onSelect(next.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, onSelect]);

  return (
    <div className="switcher">
      <button className="btn btn-sm" disabled={!prev} onClick={() => prev && onSelect(prev.id)} title={prev ? `Previous: ${prev.label} (Alt+←)` : undefined} aria-label={`Previous ${label}`}>‹</button>
      <select className="input" value={index >= 0 ? currentId : ''} onChange={(e) => e.target.value && onSelect(e.target.value)} disabled={loading} aria-label={`Switch ${label}`}>
        {index < 0 && <option value="">{loading ? 'Loading…' : `Switch ${label}…`}</option>}
        {items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
      </select>
      <button className="btn btn-sm" disabled={!next} onClick={() => next && onSelect(next.id)} title={next ? `Next: ${next.label} (Alt+→)` : undefined} aria-label={`Next ${label}`}>›</button>
      {index >= 0 && <span className="muted small nowrap">{index + 1} of {items.length}</span>}
    </div>
  );
}
