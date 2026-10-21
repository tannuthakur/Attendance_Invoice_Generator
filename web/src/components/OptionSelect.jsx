import { useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from './ui';

// One request per kind, shared by every dropdown on the page; cleared when options change.
const cache = {};
export const loadOptions = (kind) => (cache[kind] ??= api('/options', { query: { kind } }).catch((err) => {
  delete cache[kind];
  throw err;
}));
export const invalidateOptions = (kind) => {
  if (kind) delete cache[kind];
  else Object.keys(cache).forEach((k) => delete cache[k]);
};

const ADD_NEW = '__add_new__';
const LABELS = { designation: 'designation', role: 'role' };

/**
 * Dropdown of managed designations or project roles, with "+ Add new…" inline.
 * A current value that is no longer in the list is still shown, so editing never loses it.
 */
export function OptionSelect({ kind, value, onChange, placeholder = 'None', id }) {
  const toast = useToast();
  const [options, setOptions] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    loadOptions(kind).then((list) => live && setOptions(list), () => live && setOptions([]));
    return () => {
      live = false;
    };
  }, [kind]);

  const names = (options || []).map((o) => o.name);
  const missing = value && !names.some((n) => n.toLowerCase() === value.toLowerCase());

  const add = async () => {
    const name = draft.trim();
    if (!name) return;
    setSaving(true);
    try {
      const existing = names.find((n) => n.toLowerCase() === name.toLowerCase());
      if (!existing) {
        await api('/options', { method: 'POST', body: { kind, name } });
        invalidateOptions(kind);
        setOptions(await loadOptions(kind));
        toast(`Added ${LABELS[kind]} “${name}”`);
      }
      onChange(existing || name);
      setAdding(false);
      setDraft('');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (adding) {
    return (
      <div className="actions" style={{ flexWrap: 'nowrap' }}>
        <input
          className="input"
          autoFocus
          placeholder={`New ${LABELS[kind]}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
            if (e.key === 'Escape') setAdding(false);
          }}
        />
        <button type="button" className="btn btn-primary btn-sm" disabled={saving || !draft.trim()} onClick={add}>{saving ? '…' : 'Add'}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button>
      </div>
    );
  }

  return (
    <select
      id={id}
      className="input"
      value={value || ''}
      disabled={!options}
      onChange={(e) => (e.target.value === ADD_NEW ? setAdding(true) : onChange(e.target.value))}
    >
      <option value="">{options ? placeholder : 'Loading…'}</option>
      {missing && <option value={value}>{value}</option>}
      {names.map((n) => <option key={n} value={n}>{n}</option>)}
      <option value={ADD_NEW}>+ Add new {LABELS[kind]}…</option>
    </select>
  );
}
