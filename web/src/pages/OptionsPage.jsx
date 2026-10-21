import { useState } from 'react';
import { api } from '../api';
import { Empty, ErrorAlert, Loading, PageHeader, useAsync, useToast } from '../components/ui';
import { invalidateOptions } from '../components/OptionSelect';

const SECTIONS = [
  {
    kind: 'role',
    title: 'Project roles',
    help: 'Picked when assigning someone to a project. Printed on client invoices, e.g. “Payment for Backend Developer Er. Sachin”.',
    noun: 'assignment',
  },
  {
    kind: 'designation',
    title: 'Designations',
    help: 'An employee’s job title, shown on their profile and salary invoices.',
    noun: 'employee',
  },
];

export function OptionsPage() {
  return (
    <>
      <PageHeader title="Roles & designations" subtitle="The choices offered in employee and assignment forms." />
      <div className="grid-2" style={{ alignItems: 'start' }}>
        {SECTIONS.map((s) => <OptionList key={s.kind} {...s} />)}
      </div>
    </>
  );
}

function OptionList({ kind, title, help, noun }) {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api('/options', { query: { kind } }), [kind]);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null); // { id, name }
  const [busy, setBusy] = useState(false);

  const changed = async (message) => {
    invalidateOptions(kind);
    toast(message);
    await reload();
  };

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api('/options', { method: 'POST', body: { kind, name: name.trim() } });
      setName('');
      await changed(`Added “${name.trim()}”`);
    } catch (err) {
      toast(err.status === 409 ? `“${name.trim()}” already exists` : err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const rename = async (option) => {
    const next = editing.name.trim();
    if (!next || next === option.name) return setEditing(null);
    setBusy(true);
    try {
      const res = await api(`/options/${option.id}`, { method: 'PATCH', body: { name: next, applyToExisting: true } });
      setEditing(null);
      await changed(res.renamed ? `Renamed; ${res.renamed} ${noun}${res.renamed === 1 ? '' : 's'} updated` : 'Renamed');
    } catch (err) {
      toast(err.status === 409 ? `“${next}” already exists` : err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (option) => {
    const note = option.usedBy
      ? `\n\n${option.usedBy} ${noun}${option.usedBy === 1 ? '' : 's'} keep “${option.name}” as text; it just won't be offered for new ones.`
      : '';
    if (!window.confirm(`Delete “${option.name}”?${note}`)) return;
    try {
      await api(`/options/${option.id}`, { method: 'DELETE' });
      await changed(`Deleted “${option.name}”`);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          <div className="muted small">{help}</div>
        </div>
      </div>
      <form className="card-body actions" style={{ flexWrap: 'nowrap', borderBottom: '1px solid var(--border)' }} onSubmit={add}>
        <input className="input" placeholder={`New ${kind === 'role' ? 'role' : 'designation'}…`} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" disabled={busy || !name.trim()}>Add</button>
      </form>
      <ErrorAlert error={error} />
      {loading && !data ? (
        <Loading />
      ) : !data?.length ? (
        <Empty>Nothing yet. Add the first one above.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {data.map((o) => (
                <tr key={o.id}>
                  <td>
                    {editing?.id === o.id ? (
                      <input
                        className="input"
                        autoFocus
                        value={editing.name}
                        onChange={(e) => setEditing({ id: o.id, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') rename(o);
                          if (e.key === 'Escape') setEditing(null);
                        }}
                        aria-label={`Rename ${o.name}`}
                      />
                    ) : (
                      o.name
                    )}
                  </td>
                  <td className="muted small nowrap">{o.usedBy ? `${o.usedBy} ${noun}${o.usedBy === 1 ? '' : 's'}` : 'Not used'}</td>
                  <td className="right nowrap">
                    {editing?.id === o.id ? (
                      <>
                        <button className="link-btn" disabled={busy} onClick={() => rename(o)}>Save</button>
                        {' · '}
                        <button className="link-btn" onClick={() => setEditing(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="link-btn" onClick={() => setEditing({ id: o.id, name: o.name })}>Rename</button>
                        {' · '}
                        <button className="link-btn danger" onClick={() => remove(o)}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
