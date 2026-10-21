import { useState } from 'react';
import { useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import {
  Badge, Empty, ErrorAlert, Field, FormModal, Loading, PageHeader, Tabs, useAsync, useToast,
} from '../components/ui';
import { AttendanceCalendar } from '../components/AttendanceCalendar';
import { DeleteConfirm, plural } from '../components/DeleteConfirm';
import { RecordSwitcher } from '../components/RecordSwitcher';
import { loadEmployees } from '../components/pickers';
import { EmployeeFormModal } from './EmployeesPage';
import { currentMonth, formatDate, formatMoney, formatMonth, todayIso } from '../format';

export function EmployeeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const setTab = (t) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true });
  const allEmployees = useAsync(() => loadEmployees(), []);
  const switchItems = useMemo(
    () => (allEmployees.data || []).map((e) => ({
      id: e.id,
      label: `${e.fullName} (${e.employeeCode})${e.employmentStatus === 'off_role' ? ' · off role' : ''}`,
    })),
    [allEmployees.data],
  );
  // Keep the current tab when switching employees.
  const switchTo = useCallback(
    (otherId) => navigate({ pathname: `/employees/${otherId}`, search: params.toString() ? `?${params}` : '' }),
    [navigate, params],
  );
  const [modal, setModal] = useState(null);
  const { data: emp, error, loading, reload } = useAsync(() => api(`/employees/${id}`), [id]);

  const switcher = (
    <RecordSwitcher items={switchItems} currentId={id} onSelect={switchTo} label="employee" loading={allEmployees.loading} />
  );
  if (loading && emp?.id !== id) return <>{switcher}<Loading /></>;
  if (error) return <>{switcher}<ErrorAlert error={error} /></>;

  const offRole = emp.employmentStatus === 'off_role';
  return (
    <>
      {switcher}
      <PageHeader
        crumbs={<Link to="/employees">Employees</Link>}
        title={emp.fullName}
        subtitle={
          <span className="actions" style={{ gap: 8 }}>
            <span className="mono">{emp.employeeCode}</span>
            <Badge value={emp.employmentStatus} />
            {offRole && <span>since {formatDate(emp.offRoleDate)}</span>}
          </span>
        }
      >
        <button className="btn" onClick={() => setModal('edit')}>Edit</button>
        <button className={`btn ${offRole ? '' : 'btn-danger'}`} onClick={() => setModal('status')}>
          {offRole ? 'Put back on role' : 'Remove from role'}
        </button>
        <Link className="btn btn-primary" to={`/invoices/new?employeeId=${emp.id}`}>Generate invoice</Link>
        <button className="btn btn-danger" onClick={() => setModal('delete')}>Delete</button>
      </PageHeader>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[['overview', 'Overview'], ['salary', 'Salary'], ['attendance', 'Attendance'], ['invoices', 'Invoices']]}
      />

      {tab === 'overview' && <Overview emp={emp} />}
      {tab === 'salary' && <SalaryTab employeeId={emp.id} onChange={reload} />}
      {tab === 'attendance' && (
        <div className="card card-body">
          <AttendanceCalendar employeeId={emp.id} initialMonth={currentMonth()} editable />
        </div>
      )}
      {tab === 'invoices' && <EmployeeInvoices employeeId={emp.id} />}

      {modal === 'edit' && (
        <EmployeeFormModal employee={emp} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
      )}
      {modal === 'delete' && (
        <DeleteConfirm
          title="Delete employee"
          name={emp.fullName}
          path={`/employees/${emp.id}`}
          describe={(u) => [
            plural(u.attendance, 'attendance mark'),
            plural(u.salaries, 'salary record'),
            plural(u.assignments, 'project assignment'),
            plural(u.voidInvoices, 'void salary invoice'),
            u.logins ? 'The linked login is unlinked (the account itself stays)' : null,
          ]}
          onClose={() => setModal(null)}
          onDeleted={() => {
            toast(`${emp.fullName} deleted`);
            navigate('/employees', { replace: true });
          }}
        />
      )}
      {modal === 'status' && (
        <StatusModal emp={emp} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
      )}
    </>
  );
}

function Overview({ emp }) {
  const salary = emp.currentSalary;
  return (
    <div className="grid-2">
      <div className="card">
        <div className="card-head"><h2>Details</h2></div>
        <div className="card-body">
          <dl className="kv">
            <dt>Employee ID</dt><dd className="mono">{emp.employeeCode}</dd>
            <dt>Email</dt><dd>{emp.email || '—'}</dd>
            <dt>Designation</dt><dd>{emp.designation || '—'}</dd>
            <dt>Department</dt><dd>{emp.department || '—'}</dd>
            <dt>Date of joining</dt><dd>{formatDate(emp.dateOfJoining)}</dd>
            <dt>Status</dt><dd><Badge value={emp.employmentStatus} /></dd>
          </dl>
        </div>
      </div>
      <div className="stack">
        <div className="card stat">
          <div className="label">Current monthly salary</div>
          <div className="value">{salary ? formatMoney(salary.monthlyAmount, salary.currency) : '—'}</div>
          <div className="muted small">
            {salary ? `Effective from ${formatMonth(salary.effectiveMonth.slice(0, 7))}` : 'No salary added yet. Use the Salary tab.'}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Projects</h2></div>
          {emp.assignments?.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Project</th><th>Role</th><th>From</th><th>To</th></tr></thead>
                <tbody>
                  {emp.assignments.map((a) => (
                    <tr key={a.id}>
                      <td><Link to={`/projects/${a.projectId}`}>{a.project?.name}</Link></td>
                      <td>{a.roleTitle || '—'}</td>
                      <td className="nowrap">{formatDate(a.startDate)}</td>
                      <td className="nowrap">{a.endDate ? formatDate(a.endDate) : <span className="muted">Ongoing</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Not assigned to any project. Assign from a project's page.</Empty>
          )}
        </div>
      </div>
    </div>
  );
}

function SalaryTab({ employeeId, onChange }) {
  const [adding, setAdding] = useState(false);
  const { data = [], error, loading, reload } = useAsync(() => api('/salaries', { query: { employeeId } }), [employeeId]);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Salary history</h2>
          <div className="muted small">The latest month on or before a day applies, so a raise takes effect from its month.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>Add salary</button>
      </div>
      <ErrorAlert error={error} />
      {loading && !data.length ? (
        <Loading />
      ) : data.length === 0 ? (
        <Empty>No salary records yet.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Effective from</th><th className="right">Monthly amount</th><th>Added</th></tr></thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td>{formatMonth(s.effectiveMonth.slice(0, 7))}</td>
                  <td className="right mono">{formatMoney(s.monthlyAmount, s.currency)}</td>
                  <td className="muted small">{formatDate(s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && (
        <SalaryModal
          employeeId={employeeId}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); reload(); onChange(); }}
        />
      )}
    </div>
  );
}

function SalaryModal({ employeeId, onClose, onSaved }) {
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');

  const submit = async () => {
    await api('/salaries', {
      method: 'POST',
      body: { employeeId, month, monthlyAmount: Number(amount), currency: currency.toUpperCase() },
    });
    toast('Salary saved');
    onSaved();
  };

  return (
    <FormModal title="Add monthly salary" onSubmit={submit} onClose={onClose}>
      <div className="form-grid">
        <Field label="Effective from" hint="Applies from the 1st of this month. Saving the same month again replaces it.">
          <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} required />
        </Field>
        <Field label="Currency">
          <input className="input" value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value)} required />
        </Field>
        <Field label="Monthly amount" className="full">
          <input className="input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </Field>
      </div>
    </FormModal>
  );
}

function StatusModal({ emp, onClose, onSaved }) {
  const toast = useToast();
  const removing = emp.employmentStatus === 'on_role';
  const [date, setDate] = useState(removing ? todayIso() : '');

  const submit = async () => {
    const body = { status: removing ? 'off_role' : 'on_role' };
    if (date) body.effectiveDate = date;
    await api(`/employees/${emp.id}/status`, { method: 'PATCH', body });
    toast(removing ? `${emp.fullName} removed from role` : `${emp.fullName} is back on role`);
    onSaved();
  };

  return (
    <FormModal
      title={removing ? 'Remove from role' : 'Put back on role'}
      submitLabel={removing ? 'Remove from role' : 'Put on role'}
      danger={removing}
      onSubmit={submit}
      onClose={onClose}
    >
      {removing ? (
        <>
          <p style={{ margin: 0 }}>
            {emp.fullName} stays in the system with their history. Days after the last working day are not paid on invoices.
          </p>
          <Field label="Last working day">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
        </>
      ) : (
        <Field label="Re-joining date (optional)" hint="Leave empty to keep the original joining date.">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      )}
    </FormModal>
  );
}

function EmployeeInvoices({ employeeId }) {
  const navigate = useNavigate();
  const { data, error, loading } = useAsync(() => api('/invoices', { query: { employeeId, limit: 50 } }), [employeeId]);
  return (
    <div className="card">
      <ErrorAlert error={error} />
      {loading && !data ? (
        <Loading />
      ) : data?.data.length === 0 ? (
        <Empty>
          No invoices yet. <Link to={`/invoices/new?employeeId=${employeeId}`}>Generate one</Link>.
        </Empty>
      ) : data ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Invoice</th><th>Project</th><th>Period</th><th className="right">Net</th><th>Status</th></tr></thead>
            <tbody>
              {data.data.map((inv) => (
                <tr key={inv.id} className="clickable" onClick={() => navigate(`/invoices/${inv.id}`)}>
                  <td className="mono nowrap">{inv.invoiceNumber}</td>
                  <td>{inv.project?.name}</td>
                  <td className="nowrap">{formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}</td>
                  <td className="right mono nowrap">{formatMoney(inv.netAmount, inv.currency)}</td>
                  <td><Badge value={inv.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
