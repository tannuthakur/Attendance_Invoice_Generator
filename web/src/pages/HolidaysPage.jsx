import { useState } from 'react';
import { api } from '../api';
import { Empty, ErrorAlert, Loading, PageHeader, useAsync, useToast } from '../components/ui';
import { loadProjects } from '../components/pickers';
import { HolidayModal } from './ProjectsPage';
import { WEEKDAYS, dayOfWeek, formatDate } from '../format';

export function HolidaysPage() {
  const toast = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [adding, setAdding] = useState(false);
  const [scope, setScope] = useState('');
  const [search, setSearch] = useState('');
  const projects = useAsync(loadProjects, []);
  const { data = [], error, loading, reload } = useAsync(
    () => api('/holidays', { query: { from: `${year}-01-01`, to: `${year}-12-31` } }),
    [year],
  );
  const projectName = (id) => projects.data?.find((p) => p.id === id)?.name || 'Project';
  const shown = data.filter(
    (h) =>
      (!search.trim() || h.name.toLowerCase().includes(search.trim().toLowerCase())) &&
      (!scope || (scope === 'all' ? !h.projectId : h.projectId === scope)),
  );

  const remove = async (h) => {
    if (!window.confirm(`Delete "${h.name}" on ${formatDate(h.date)}?`)) return;
    try {
      await api(`/holidays/${h.id}`, { method: 'DELETE' });
      toast('Holiday deleted');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <>
      <PageHeader title="Holidays" subtitle="Holidays are excluded from working days when pay is calculated.">
        <div className="actions">
          <button className="btn btn-sm" onClick={() => setYear(year - 1)} aria-label="Previous year">‹</button>
          <strong>{year}</strong>
          <button className="btn btn-sm" onClick={() => setYear(year + 1)} aria-label="Next year">›</button>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>Add holiday</button>
      </PageHeader>
      <div className="toolbar">
        <input className="input grow" placeholder="Search holiday name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Applies to">
          <option value="">Any scope</option>
          <option value="all">All projects only</option>
          {(projects.data || []).map((p) => <option key={p.id} value={p.id}>{p.name} only</option>)}
        </select>
      </div>
      <ErrorAlert error={error} />
      <div className="card">
        {loading && !data.length ? (
          <Loading />
        ) : data.length === 0 ? (
          <Empty>No holidays in {year}.</Empty>
        ) : shown.length === 0 ? (
          <Empty>No holidays match these filters.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Day</th><th>Name</th><th>Applies to</th><th /></tr></thead>
              <tbody>
                {shown.map((h) => (
                  <tr key={h.id}>
                    <td className="nowrap">{formatDate(h.date)}</td>
                    <td className="muted">{WEEKDAYS[dayOfWeek(h.date)]}</td>
                    <td>{h.name}</td>
                    <td>{h.projectId ? projectName(h.projectId) : <span className="muted">All projects</span>}</td>
                    <td className="right"><button className="link-btn danger" onClick={() => remove(h)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {adding && (
        <HolidayModal projects={projects.data || []} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />
      )}
    </>
  );
}
