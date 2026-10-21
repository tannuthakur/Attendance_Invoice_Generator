import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { Badge, Empty, ErrorAlert, Field, FormModal, Loading, PageHeader, useAsync, useToast } from '../components/ui';
import { loadEmployees } from '../components/pickers';
import { DeleteConfirm, plural } from '../components/DeleteConfirm';
import { RecordSwitcher } from '../components/RecordSwitcher';
import { OptionSelect } from '../components/OptionSelect';
import { WEEKDAYS, currentMonth, billingPeriod, formatDate, formatMoney, todayIso } from '../format';

const cycleLabel = (day) => (day === 1 ? 'Calendar month' : `${ordinal(day)} → ${ordinal(day - 1)} of next month`);
const ordinal = (n) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
};
const weekendLabel = (days = []) => (days.length ? [...days].sort().map((d) => WEEKDAYS[d]).join(', ') : 'None');

export function ProjectsPage() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [client, setClient] = useState('');
  const [currency, setCurrency] = useState('');
  const { data = [], error, loading, reload } = useAsync(() => api('/projects'), []);
  const clients = [...new Set(data.map((p) => p.clientName).filter(Boolean))].sort();
  const currencies = [...new Set(data.map((p) => p.currency.trim()))].sort();
  const term = search.trim().toLowerCase();
  const shown = data.filter(
    (p) =>
      (!term || p.name.toLowerCase().includes(term) || (p.clientName || '').toLowerCase().includes(term) || (p.clientContact || '').toLowerCase().includes(term)) &&
      (!client || p.clientName === client) &&
      (!currency || p.currency.trim() === currency),
  );

  return (
    <>
      <PageHeader title="Projects" subtitle="Each project sets its own billing cycle and weekend days.">
        <button className="btn btn-primary" onClick={() => setCreating(true)}>New project</button>
      </PageHeader>
      <div className="toolbar">
        <input className="input grow" placeholder="Search project, client or contact…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input" value={client} onChange={(e) => setClient(e.target.value)} aria-label="Client">
          <option value="">All clients</option>
          {clients.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency">
          <option value="">All currencies</option>
          {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(search || client || currency) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setClient(''); setCurrency(''); }}>Clear filters</button>
        )}
      </div>
      <ErrorAlert error={error} />
      <div className="card">
        {loading && !data.length ? (
          <Loading />
        ) : data.length === 0 ? (
          <Empty>No projects yet. Create one to start assigning employees.</Empty>
        ) : shown.length === 0 ? (
          <Empty>No projects match these filters.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Project</th><th>Client</th><th>Billing cycle</th><th>Weekend</th><th>Currency</th></tr></thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/projects/${p.id}`)}>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.clientName || '—'}</td>
                    <td>{cycleLabel(p.billingCycleStartDay)}</td>
                    <td>{weekendLabel(p.weekendDays)}</td>
                    <td>{p.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {creating && (
        <ProjectFormModal
          onClose={() => setCreating(false)}
          onSaved={(p) => { setCreating(false); reload(); navigate(`/projects/${p.id}`); }}
        />
      )}
    </>
  );
}

function ProjectFormModal({ project, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: project?.name || '',
    clientName: project?.clientName || '',
    clientContact: project?.clientContact || '',
    invoiceTitle: project?.invoiceTitle || '',
    billingCycleStartDay: project?.billingCycleStartDay || 1,
    weekendDays: project?.weekendDays || [0, 6],
    currency: project?.currency?.trim() || 'USD',
  });
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const toggleDay = (d) =>
    set('weekendDays', form.weekendDays.includes(d) ? form.weekendDays.filter((x) => x !== d) : [...form.weekendDays, d].sort());

  const example = billingPeriod(currentMonth(), Number(form.billingCycleStartDay));

  const submit = async () => {
    const body = {
      name: form.name.trim(),
      clientName: form.clientName.trim() || undefined,
      clientContact: form.clientContact.trim() || undefined,
      invoiceTitle: form.invoiceTitle.trim() || undefined,
      billingCycleStartDay: Number(form.billingCycleStartDay),
      weekendDays: form.weekendDays,
      currency: form.currency.trim().toUpperCase(),
    };
    const saved = project
      ? await api(`/projects/${project.id}`, { method: 'PATCH', body })
      : await api('/projects', { method: 'POST', body });
    toast(project ? 'Project updated' : 'Project created');
    onSaved(saved);
  };

  return (
    <FormModal title={project ? 'Edit project' : 'New project'} submitLabel={project ? 'Save changes' : 'Create project'} onSubmit={submit} onClose={onClose}>
      <div className="form-grid">
        <Field label="Project name *">
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required autoFocus />
        </Field>
        <Field label="Client">
          <input className="input" value={form.clientName} onChange={(e) => set('clientName', e.target.value)} />
        </Field>
        <Field label="Billing cycle starts on day" hint={`This month's period: ${formatDate(example.start)} – ${formatDate(example.end)}`}>
          <input className="input" type="number" min="1" max="28" value={form.billingCycleStartDay} onChange={(e) => set('billingCycleStartDay', e.target.value)} required />
        </Field>
        <Field label="Currency">
          <input className="input" maxLength={3} value={form.currency} onChange={(e) => set('currency', e.target.value)} required />
        </Field>
        <Field label="Client contact (invoice “To”)">
          <input className="input" value={form.clientContact} onChange={(e) => set('clientContact', e.target.value)} placeholder="e.g. Mr. Mohammed Al Arouqi" />
        </Field>
        <Field label="Client invoice title" hint={`Printed as “INVOICE- ${(form.invoiceTitle || `Development Work ${form.name || '…'}`).toUpperCase()}”`}>
          <input className="input" value={form.invoiceTitle} onChange={(e) => set('invoiceTitle', e.target.value)} placeholder={`Development Work ${form.name || ''}`} />
        </Field>
        <div className="field full">
          <span>Weekend days</span>
          <div className="checks">
            {WEEKDAYS.map((label, d) => (
              <label key={d} className={`check-pill ${form.weekendDays.includes(d) ? 'on' : ''}`}>
                <input type="checkbox" checked={form.weekendDays.includes(d)} onChange={() => toggleDay(d)} /> {label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </FormModal>
  );
}

export function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [modal, setModal] = useState(null);
  const project = useAsync(() => api(`/projects/${id}`), [id]);
  const assignments = useAsync(() => api(`/projects/${id}/assignments`), [id]);
  const holidays = useAsync(() => api('/holidays', { query: { projectId: id } }), [id]);
  const toast = useToast();
  const allProjects = useAsync(() => api('/projects'), []);
  const [selected, setSelected] = useState(new Set());
  const switchItems = useMemo(
    () => (allProjects.data || []).map((x) => ({ id: x.id, label: x.clientName ? `${x.name} · ${x.clientName}` : x.name })),
    [allProjects.data],
  );
  const switchTo = useCallback((otherId) => navigate(`/projects/${otherId}`), [navigate]);

  const switcher = (
    <RecordSwitcher items={switchItems} currentId={id} onSelect={switchTo} label="project" loading={allProjects.loading} />
  );
  if (project.loading && project.data?.id !== id) return <>{switcher}<Loading /></>;
  if (project.error) return <>{switcher}<ErrorAlert error={project.error} /></>;
  const p = project.data;

  const deleteHoliday = async (h) => {
    if (!window.confirm(`Delete holiday "${h.name}" on ${formatDate(h.date)}?`)) return;
    try {
      await api(`/holidays/${h.id}`, { method: 'DELETE' });
      holidays.reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <>
      {switcher}
      <PageHeader crumbs={<Link to="/projects">Projects</Link>} title={p.name} subtitle={p.clientName}>
        <button className="btn" onClick={() => setModal('edit')}>Edit settings</button>
        <Link className="btn" to={`/attendance?projectId=${p.id}`}>Attendance</Link>
        <button className="btn" onClick={() => setModal('assign')}>Assign employees</button>
        <Link className="btn btn-primary" to={`/project-invoices/new?projectId=${p.id}`}>Generate client invoice</Link>
        <button className="btn btn-danger" onClick={() => setModal('delete')}>Delete</button>
      </PageHeader>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat"><div className="label">Billing cycle</div><div style={{ fontWeight: 600, marginTop: 4 }}>{cycleLabel(p.billingCycleStartDay)}</div></div>
        <div className="card stat"><div className="label">Weekend</div><div style={{ fontWeight: 600, marginTop: 4 }}>{weekendLabel(p.weekendDays)}</div></div>
        <div className="card stat">
          <div className="label">Client invoices</div>
          <div style={{ fontWeight: 600, marginTop: 4 }}>{p.currency} · To {p.clientContact || p.clientName || '—'}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Assigned employees</h2>
            <div className="muted small">The monthly rate is what the client is billed for each person.</div>
          </div>
        </div>
        <ErrorAlert error={assignments.error} />
        {assignments.loading && !assignments.data ? (
          <Loading />
        ) : !assignments.data?.length ? (
          <Empty>Nobody is assigned yet.</Empty>
        ) : (
          <AssignmentsTable
            project={p}
            rows={assignments.data}
            selected={selected}
            setSelected={setSelected}
            onEdit={(a) => setModal({ edit: a })}
            onRelease={(list) => setModal({ release: list })}
            onRemove={async (a) => {
              if (!window.confirm(`Remove ${a.employee?.fullName} from ${p.name} completely?\n\nUse this only for an assignment made by mistake: it erases the assignment instead of ending it. To keep history, use Release.`)) return;
              try {
                await api(`/projects/${p.id}/assignments/${a.id}`, { method: 'DELETE' });
                toast(`${a.employee?.fullName} removed from ${p.name}`);
                assignments.reload();
              } catch (err) {
                toast(err.message, 'error');
              }
            }}
          />
        )}
      </div>

      <ProjectClientInvoices projectId={p.id} />

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Holidays</h2>
            <div className="muted small">Holidays for all projects plus ones specific to {p.name}.</div>
          </div>
          <button className="btn" onClick={() => setModal('holiday')}>Add project holiday</button>
        </div>
        {holidays.loading && !holidays.data ? (
          <Loading />
        ) : !holidays.data?.length ? (
          <Empty>No holidays.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Name</th><th>Applies to</th><th /></tr></thead>
              <tbody>
                {holidays.data.map((h) => (
                  <tr key={h.id}>
                    <td className="nowrap">{formatDate(h.date)} <span className="muted small">{WEEKDAYS[new Date(`${h.date}T00:00:00Z`).getUTCDay()]}</span></td>
                    <td>{h.name}</td>
                    <td>{h.projectId ? 'This project' : <span className="muted">All projects</span>}</td>
                    <td className="right">{h.projectId && <button className="link-btn danger" onClick={() => deleteHoliday(h)}>Delete</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal === 'edit' && <ProjectFormModal project={p} onClose={() => setModal(null)} onSaved={() => { setModal(null); project.reload(); }} />}
      {modal === 'assign' && (
        <BulkAssignModal
          project={p}
          assignments={assignments.data}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); assignments.reload(); }}
        />
      )}
      {modal?.release && (
        <ReleaseModal
          project={p}
          rows={modal.release}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); setSelected(new Set()); assignments.reload(); }}
        />
      )}
      {modal?.edit && (
        <AssignmentModal
          project={p}
          assignment={modal.edit}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); assignments.reload(); }}
        />
      )}
      {modal === 'delete' && (
        <DeleteConfirm
          title="Delete project"
          name={p.name}
          path={`/projects/${p.id}`}
          describe={(u) => [
            plural(u.assignments, 'employee assignment'),
            plural(u.holidays, 'project holiday'),
            plural(u.voidInvoices, 'void invoice'),
          ]}
          onClose={() => setModal(null)}
          onDeleted={() => {
            toast(`${p.name} deleted`);
            navigate('/projects', { replace: true });
          }}
        />
      )}
      {modal === 'holiday' && <HolidayModal projectId={p.id} onClose={() => setModal(null)} onSaved={() => { setModal(null); holidays.reload(); }} />}
    </>
  );
}

const isActive = (a, today) => !a.endDate || a.endDate >= today;

function AssignmentsTable({ project, rows, selected, setSelected, onEdit, onRelease, onRemove }) {
  const today = todayIso();
  const sorted = [...rows].sort(
    (a, b) => Number(isActive(b, today)) - Number(isActive(a, today)) || (a.employee?.fullName || '').localeCompare(b.employee?.fullName || ''),
  );
  const activeRows = sorted.filter((a) => isActive(a, today));
  const picked = activeRows.filter((a) => selected.has(a.id));
  const toggle = (id) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allPicked = activeRows.length > 0 && picked.length === activeRows.length;

  return (
    <>
      {picked.length > 0 && (
        <div className="card-body actions" style={{ borderBottom: '1px solid var(--border)', justifyContent: 'space-between' }}>
          <span>{picked.length} selected</span>
          <div className="actions">
            <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>Clear</button>
            <button className="btn btn-sm btn-danger" onClick={() => onRelease(picked)}>Release selected</button>
          </div>
        </div>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={allPicked}
                  disabled={!activeRows.length}
                  onChange={() => setSelected(allPicked ? new Set() : new Set(activeRows.map((a) => a.id)))}
                  aria-label="Select everyone on the project"
                />
              </th>
              <th>Employee</th><th>Role</th><th className="right">Monthly rate</th><th>From</th><th>To</th><th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => {
              const active = isActive(a, today);
              return (
                <tr key={a.id} style={active ? undefined : { opacity: 0.6 }}>
                  <td>
                    {active && <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} aria-label={`Select ${a.employee?.fullName}`} />}
                  </td>
                  <td>
                    <Link to={`/employees/${a.employeeId}`}>{a.employee?.fullName}</Link>
                    <div className="muted small mono">{a.employee?.employeeCode}</div>
                  </td>
                  <td>{a.roleTitle || '—'}</td>
                  <td className="right mono nowrap">
                    {a.monthlyRate !== null && a.monthlyRate !== undefined ? formatMoney(a.monthlyRate, project.currency.trim()) : <span className="badge amber">No rate</span>}
                  </td>
                  <td className="nowrap">{formatDate(a.startDate)}</td>
                  <td className="nowrap">
                    {!a.endDate ? (
                      <span className="muted">Ongoing</span>
                    ) : active ? (
                      <><span className="badge amber">Leaving</span> {formatDate(a.endDate)}</>
                    ) : (
                      <><span className="badge">Released</span> {formatDate(a.endDate)}</>
                    )}
                  </td>
                  <td className="right nowrap">
                    <button className="link-btn" onClick={() => onEdit(a)}>Edit</button>
                    {active && (
                      <>
                        {' · '}
                        <button className="link-btn danger" onClick={() => onRelease([a])}>Release</button>
                      </>
                    )}
                    {' · '}
                    <button className="link-btn danger" onClick={() => onRemove(a)} title="Delete this assignment (for mistakes)">Remove</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Ends one or more assignments on a chosen last day. */
function ReleaseModal({ project, rows, onClose, onSaved }) {
  const toast = useToast();
  const latestStart = rows.reduce((max, a) => (a.startDate > max ? a.startDate : max), rows[0].startDate);
  const [endDate, setEndDate] = useState(todayIso() < latestStart ? latestStart : todayIso());
  const names = rows.map((a) => a.employee?.fullName);

  const submit = async () => {
    const res = await api(`/projects/${project.id}/assignments/release`, {
      method: 'POST',
      body: { assignmentIds: rows.map((a) => a.id), endDate },
    });
    toast(`${res.count === 1 ? names[0] : `${res.count} employees`} released from ${project.name}`);
    onSaved();
  };

  return (
    <FormModal
      title={rows.length === 1 ? `Release ${names[0]} from ${project.name}` : `Release ${rows.length} employees from ${project.name}`}
      submitLabel="Release"
      danger
      onSubmit={submit}
      onClose={onClose}
    >
      {rows.length > 1 && <p style={{ margin: 0 }}>{names.join(', ')}</p>}
      <Field label="Last day on the project" hint="Days up to and including this date are still billed; nothing after it. The history is kept, and they can be assigned again later.">
        <input className="input" type="date" min={latestStart} value={endDate} onChange={(e) => setEndDate(e.target.value)} required autoFocus />
      </Field>
    </FormModal>
  );
}

/** Edit one existing assignment (role, rate, dates). */
function AssignmentModal({ project, assignment, onClose, onSaved }) {
  const toast = useToast();
  const [startDate, setStartDate] = useState(assignment.startDate);
  const [endDate, setEndDate] = useState(assignment.endDate || '');
  const [roleTitle, setRoleTitle] = useState(assignment.roleTitle || '');
  const [monthlyRate, setMonthlyRate] = useState(assignment.monthlyRate ?? '');

  const submit = async () => {
    await api(`/projects/${project.id}/assignments/${assignment.id}`, {
      method: 'PATCH',
      body: {
        startDate,
        endDate: endDate || null,
        roleTitle: roleTitle.trim() || undefined,
        monthlyRate: monthlyRate === '' ? null : Number(monthlyRate),
      },
    });
    toast('Assignment updated');
    onSaved();
  };

  return (
    <FormModal title={`Edit assignment: ${assignment.employee?.fullName}`} submitLabel="Save changes" onSubmit={submit} onClose={onClose}>
      <div className="form-grid">
        <Field label="Role on project" hint="Printed on client invoices, e.g. “Backend Developer”.">
          <OptionSelect kind="role" value={roleTitle} onChange={setRoleTitle} placeholder="Select role…" />
        </Field>
        <Field label={`Monthly rate (${project.currency.trim()})`} hint="Billed to the client for a full period.">
          <input className="input" type="number" min="0" step="0.01" value={monthlyRate} onChange={(e) => setMonthlyRate(e.target.value)} placeholder="e.g. 2500" />
        </Field>
        <Field label="Start date">
          <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </Field>
        <Field label="End date" hint="Leave empty if ongoing. Days after it are not billed.">
          <input className="input" type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>
    </FormModal>
  );
}

/**
 * Assign several employees at once. Employees already on the project (ongoing assignment)
 * are listed ticked and locked; new picks get their own role and rate.
 */
function BulkAssignModal({ project, assignments, onClose, onSaved }) {
  const toast = useToast();
  const currency = project.currency.trim();
  const employees = useAsync(() => loadEmployees({ status: 'on_role' }), []);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState({}); // employeeId → { roleTitle, monthlyRate }
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState('');
  const [allRole, setAllRole] = useState('');
  const [allRate, setAllRate] = useState('');

  // Currently assigned = an assignment that hasn't ended before today.
  const today = todayIso();
  const assigned = new Map(
    (assignments || []).filter((a) => !a.endDate || a.endDate >= today).map((a) => [a.employeeId, a]),
  );

  const term = search.trim().toLowerCase();
  const list = (employees.data || []).filter(
    (e) => !term || `${e.fullName} ${e.employeeCode} ${e.designation || ''}`.toLowerCase().includes(term),
  );
  const selectable = list.filter((e) => !assigned.has(e.id));
  const selectedIds = Object.keys(rows);
  const nameOf = (id) => employees.data?.find((e) => e.id === id)?.fullName || '';

  const toggle = (emp) =>
    setRows((r) => {
      const next = { ...r };
      if (next[emp.id]) delete next[emp.id];
      // New picks start with the "same for everyone" values.
      else next[emp.id] = { roleTitle: allRole || '', monthlyRate: allRate };
      return next;
    });
  const selectAllVisible = () =>
    setRows((r) => {
      const next = { ...r };
      for (const e of selectable) next[e.id] ??= { roleTitle: allRole || '', monthlyRate: allRate };
      return next;
    });
  const update = (id, patch) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  const applyToAll = (patch) => setRows((r) => Object.fromEntries(Object.entries(r).map(([id, v]) => [id, { ...v, ...patch }])));

  const submit = async () => {
    if (!selectedIds.length) throw new Error('Tick at least one employee to assign.');
    const res = await api(`/projects/${project.id}/assignments/bulk`, {
      method: 'POST',
      body: {
        assignments: selectedIds.map((employeeId) => ({
          employeeId,
          startDate,
          endDate: endDate || undefined,
          roleTitle: rows[employeeId].roleTitle?.trim() || undefined,
          monthlyRate: rows[employeeId].monthlyRate === '' ? undefined : Number(rows[employeeId].monthlyRate),
        })),
      },
    });
    toast(`${res.count} employee${res.count === 1 ? '' : 's'} assigned to ${project.name}`);
    onSaved();
  };

  return (
    <FormModal title={`Assign employees to ${project.name}`} submitLabel={`Assign ${selectedIds.length || ''}`.trim()} onSubmit={submit} onClose={onClose} wide>
      <div className="form-grid">
        <Field label="Start date">
          <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </Field>
        <Field label="End date" hint="Leave empty if ongoing.">
          <input className="input" type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>

      <div className="field">
        <span>Employees</span>
        <div className="actions" style={{ flexWrap: 'nowrap' }}>
          <input className="input" placeholder="Search name, code or designation…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="button" className="btn btn-sm" onClick={selectAllVisible} disabled={!selectable.length}>Select all</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRows({})} disabled={!selectedIds.length}>Clear</button>
        </div>
        <div className="pick-list">
          {employees.loading && !employees.data ? (
            <Loading />
          ) : !list.length ? (
            <div className="muted small" style={{ padding: 10 }}>No employees match.</div>
          ) : (
            list.map((e) => {
              const already = assigned.get(e.id);
              const checked = Boolean(already) || Boolean(rows[e.id]);
              return (
                <label key={e.id} className={`pick-row ${already ? 'locked' : ''} ${checked ? 'on' : ''}`}>
                  <input type="checkbox" checked={checked} disabled={Boolean(already)} onChange={() => toggle(e)} />
                  <span className="grow">
                    {e.fullName} <span className="muted mono small">{e.employeeCode}</span>
                    {e.designation && <span className="muted small"> · {e.designation}</span>}
                  </span>
                  {already && (
                    <span className="badge green" title={`Since ${formatDate(already.startDate)}`}>
                      Already assigned{already.roleTitle ? ` · ${already.roleTitle}` : ''}
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>
        <small className="hint">
          {assigned.size} already on this project · {selectedIds.length} new selected
        </small>
      </div>

      {selectedIds.length > 0 && (
        <div className="field">
          <span>Role and monthly rate ({currency}) for each new assignment</span>
          <div className="assign-grid head">
            <span className="muted small">Same for everyone</span>
            <OptionSelect kind="role" value={allRole} onChange={(v) => { setAllRole(v); applyToAll({ roleTitle: v }); }} placeholder="Role…" />
            <input className="input" type="number" min="0" step="0.01" placeholder="Rate…" value={allRate} onChange={(e) => { setAllRate(e.target.value); applyToAll({ monthlyRate: e.target.value }); }} aria-label="Rate for everyone" />
          </div>
          {selectedIds.map((id) => (
            <div key={id} className="assign-grid">
              <span>{nameOf(id)}</span>
              <OptionSelect kind="role" value={rows[id].roleTitle} onChange={(v) => update(id, { roleTitle: v })} placeholder="Role…" />
              <input className="input" type="number" min="0" step="0.01" placeholder="Rate" value={rows[id].monthlyRate} onChange={(e) => update(id, { monthlyRate: e.target.value })} aria-label={`Monthly rate for ${nameOf(id)}`} />
            </div>
          ))}
          <small className="hint">Rate can be left empty and set later; people without a rate are skipped on client invoices.</small>
        </div>
      )}
    </FormModal>
  );
}

function ProjectClientInvoices({ projectId }) {
  const navigate = useNavigate();
  const { data, loading } = useAsync(() => api('/project-invoices', { query: { projectId, limit: 10 } }), [projectId]);
  return (
    <div className="card">
      <div className="card-head">
        <h2>Client invoices</h2>
        <Link to={`/project-invoices?projectId=${projectId}`} className="small">View all</Link>
      </div>
      {loading && !data ? (
        <Loading />
      ) : !data?.data.length ? (
        <Empty>No client invoices yet.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Invoice</th><th>Period</th><th>Issued</th><th className="right">Total</th><th>Status</th></tr></thead>
            <tbody>
              {data.data.map((inv) => (
                <tr key={inv.id} className="clickable" onClick={() => navigate(`/project-invoices/${inv.id}`)}>
                  <td className="mono">{inv.invoiceNumber}</td>
                  <td className="nowrap">{formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}</td>
                  <td className="nowrap">{formatDate(inv.issueDate)}</td>
                  <td className="right mono nowrap">{formatMoney(inv.totalAmount, inv.currency.trim())}</td>
                  <td><Badge value={inv.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function HolidayModal({ projectId, projects, onClose, onSaved }) {
  const toast = useToast();
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [scope, setScope] = useState(projectId || '');

  const submit = async () => {
    await api('/holidays', { method: 'POST', body: { date, name: name.trim(), projectId: scope || undefined } });
    toast('Holiday added');
    onSaved();
  };

  return (
    <FormModal title="Add holiday" submitLabel="Add holiday" onSubmit={submit} onClose={onClose}>
      <div className="form-grid">
        <Field label="Date">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required autoFocus />
        </Field>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Diwali" />
        </Field>
        {projects && (
          <Field label="Applies to" className="full">
            <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        )}
      </div>
    </FormModal>
  );
}
