import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, Empty, ErrorAlert, Loading, PageHeader, useAsync } from '../components/ui';
import { formatDate, formatMoney, formatMonth } from '../format';

export function MyProfilePage() {
  const { user } = useAuth();
  const { data: emp, error, loading } = useAsync(
    () => (user.employeeId ? api(`/employees/${user.employeeId}`) : null),
    [user.employeeId],
  );

  return (
    <>
      <PageHeader title="My profile" subtitle={user.email} />
      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h2>Account</h2></div>
          <div className="card-body">
            <dl className="kv">
              <dt>Name</dt><dd>{user.fullName || '—'}</dd>
              <dt>Email</dt><dd>{user.email}</dd>
              <dt>Role</dt><dd><Badge value={user.role} /></dd>
            </dl>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Employee record</h2></div>
          <ErrorAlert error={error} />
          {!user.employeeId ? (
            <Empty>Your account isn't linked to an employee record yet. Ask an admin to link it.</Empty>
          ) : loading && !emp ? (
            <Loading />
          ) : emp ? (
            <div className="card-body">
              <dl className="kv">
                <dt>Employee ID</dt><dd className="mono">{emp.employeeCode}</dd>
                <dt>Name</dt><dd>{emp.fullName}</dd>
                <dt>Designation</dt><dd>{emp.designation || '—'}</dd>
                <dt>Department</dt><dd>{emp.department || '—'}</dd>
                <dt>Date of joining</dt><dd>{formatDate(emp.dateOfJoining)}</dd>
                <dt>Status</dt><dd><Badge value={emp.employmentStatus} /></dd>
                <dt>Monthly salary</dt>
                <dd>
                  {emp.currentSalary ? (
                    <>
                      {formatMoney(emp.currentSalary.monthlyAmount, emp.currentSalary.currency)}{' '}
                      <span className="muted small">from {formatMonth(emp.currentSalary.effectiveMonth.slice(0, 7))}</span>
                    </>
                  ) : '—'}
                </dd>
                <dt>Projects</dt>
                <dd>
                  {emp.assignments?.length
                    ? emp.assignments.map((a) => (
                        <div key={a.id}>
                          {a.project?.name} <span className="muted small">{formatDate(a.startDate)} – {a.endDate ? formatDate(a.endDate) : 'ongoing'}</span>
                        </div>
                      ))
                    : '—'}
                </dd>
              </dl>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
