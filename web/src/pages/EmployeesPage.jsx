import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Badge, Empty, ErrorAlert, Field, FormModal, Loading, PageHeader, Pagination, useAsync, useDebounced, useToast } from '../components/ui';
import { ProjectSelect } from '../components/pickers';
import { OptionSelect } from '../components/OptionSelect';
import { formatDate } from '../format';

const LIMIT = 20;

export function EmployeesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') || '');
  const [creating, setCreating] = useState(false);
  const status = params.get('status') || '';
  const projectId = params.get('projectId') || '';
  const department = params.get('department') || '';
  const designation = params.get('designation') || '';
  const joinedFrom = params.get('joinedFrom') || '';
  const joinedTo = params.get('joinedTo') || '';
  const facets = useAsync(() => api('/employees/facets'), []);
  const filtered = Boolean(status || projectId || department || designation || joinedFrom || joinedTo || search);
  const page = Number(params.get('page') || 1);
  const debouncedSearch = useDebounced(search);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const { data, error, loading, reload } = useAsync(
    () => api('/employees', { query: { page, limit: LIMIT, status, projectId, department, designation, joinedFrom, joinedTo, search: debouncedSearch.trim() } }),
    [page, status, projectId, department, designation, joinedFrom, joinedTo, debouncedSearch],
  );

  return (
    <>
      <PageHeader title="Employees" subtitle="Everyone on payroll. Removing someone from role keeps their history.">
        <button className="btn btn-primary" onClick={() => setCreating(true)}>Add employee</button>
      </PageHeader>

      <div className="toolbar">
        <input
          className="input grow"
          placeholder="Search name, code or email…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (page !== 1) setParam('page', '');
          }}
        />
        <select className="input" value={status} onChange={(e) => setParam('status', e.target.value)}>
          <option value="">All statuses</option>
          <option value="on_role">On role</option>
          <option value="off_role">Off role</option>
        </select>
        <div style={{ minWidth: 200 }}>
          <ProjectSelect value={projectId} onChange={(v) => setParam('projectId', v)} placeholder="All projects" />
        </div>
        <select className="input" value={department} onChange={(e) => setParam('department', e.target.value)} aria-label="Department">
          <option value="">All departments</option>
          {(facets.data?.departments || []).map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="input" value={designation} onChange={(e) => setParam('designation', e.target.value)} aria-label="Designation">
          <option value="">All designations</option>
          {(facets.data?.designations || []).map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <label className="actions small muted" style={{ gap: 6 }}>
          Joined
          <input className="input" type="date" value={joinedFrom} onChange={(e) => setParam('joinedFrom', e.target.value)} aria-label="Joined from" style={{ minWidth: 0, width: 150 }} />
          –
          <input className="input" type="date" value={joinedTo} onChange={(e) => setParam('joinedTo', e.target.value)} aria-label="Joined to" style={{ minWidth: 0, width: 150 }} />
        </label>
        {filtered && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setParams({}, { replace: true }); }}>Clear filters</button>
        )}
      </div>

      <ErrorAlert error={error} />
      <div className="card">
        {loading && !data ? (
          <Loading />
        ) : data?.data.length === 0 ? (
          <Empty>No employees match these filters.</Empty>
        ) : data ? (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Code</th><th>Name</th><th>Designation</th><th>Department</th><th>Joined</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {data.data.map((e) => (
                    <tr key={e.id} className="clickable" onClick={() => navigate(`/employees/${e.id}`)}>
                      <td className="mono nowrap">{e.employeeCode}</td>
                      <td>
                        <div>{e.fullName}</div>
                        {e.email && <div className="muted small">{e.email}</div>}
                      </td>
                      <td>{e.designation || '—'}</td>
                      <td>{e.department || '—'}</td>
                      <td className="nowrap">{formatDate(e.dateOfJoining)}</td>
                      <td>
                        <Badge value={e.employmentStatus} />
                        {e.offRoleDate && <div className="muted small">since {formatDate(e.offRoleDate)}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} limit={LIMIT} total={data.total} onPage={(p) => setParam('page', String(p))} />
          </>
        ) : null}
      </div>

      {creating && (
        <EmployeeFormModal
          onClose={() => setCreating(false)}
          onSaved={(emp) => {
            setCreating(false);
            reload();
            navigate(`/employees/${emp.id}`);
          }}
        />
      )}
    </>
  );
}

export function EmployeeFormModal({ employee, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    fullName: employee?.fullName || '',
    email: employee?.email || '',
    designation: employee?.designation || '',
    department: employee?.department || '',
    dateOfJoining: employee?.dateOfJoining || '',
  });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: typeof e === 'string' ? e : e.target.value }));

  const submit = async () => {
    const body = {};
    for (const [k, v] of Object.entries(form)) {
      const value = (v || '').trim();
      if (value) body[k] = value;
      else if (employee && employee[k]) body[k] = null; // cleared while editing
    }
    const saved = employee
      ? await api(`/employees/${employee.id}`, { method: 'PATCH', body })
      : await api('/employees', { method: 'POST', body });
    toast(employee ? 'Employee updated' : 'Employee added');
    onSaved(saved);
  };

  return (
    <FormModal title={employee ? 'Edit employee' : 'Add employee'} submitLabel={employee ? 'Save changes' : 'Add employee'} onSubmit={submit} onClose={onClose}>
      <div className="form-grid">
        <Field label="Employee ID" hint={employee ? 'Assigned automatically; cannot be changed.' : 'Assigned automatically when you save: the next number (e.g. 05).'}>
          <input className="input mono" value={employee?.employeeCode || 'Auto-generated'} disabled readOnly />
        </Field>
        <Field label="Full name *">
          <input className="input" value={form.fullName} onChange={set('fullName')} required autoFocus />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Date of joining">
          <input className="input" type="date" value={form.dateOfJoining} onChange={set('dateOfJoining')} />
        </Field>
        <Field label="Designation">
          <OptionSelect kind="designation" value={form.designation} onChange={set('designation')} />
        </Field>
        <Field label="Department">
          <input className="input" value={form.department} onChange={set('department')} />
        </Field>
      </div>
    </FormModal>
  );
}
