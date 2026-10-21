import { Link, useNavigate } from 'react-router-dom';
import { api, fetchAllPages } from '../api';
import { useAuth } from '../auth';
import { Badge, Empty, ErrorAlert, Loading, PageHeader, useAsync } from '../components/ui';
import { formatDate, formatMoney } from '../format';

async function loadDashboard() {
  const [onRole, offRole, projects, unpaid, recent] = await Promise.all([
    api('/employees', { query: { status: 'on_role', limit: 1 } }),
    api('/employees', { query: { status: 'off_role', limit: 1 } }),
    api('/projects'),
    fetchAllPages('/project-invoices', { status: 'issued' }),
    api('/invoices', { query: { limit: 6 } }),
  ]);
  return {
    onRole: onRole.total,
    offRole: offRole.total,
    projects: projects.length,
    unpaidCount: unpaid.length,
    // Totals per currency, e.g. "USD 13217.00".
    unpaidTotals: Object.entries(
      unpaid.reduce((acc, i) => ({ ...acc, [i.currency.trim()]: (acc[i.currency.trim()] || 0) + Math.round(Number(i.totalAmount) * 100) }), {}),
    ).map(([cur, cents]) => formatMoney(cents / 100, cur)),
    recent: recent.data,
  };
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading } = useAsync(loadDashboard, []);

  return (
    <>
      <PageHeader title={`Welcome${user.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}`} subtitle="Here's where payroll stands.">
        <Link className="btn" to="/attendance">Mark attendance</Link>
        <Link className="btn" to="/invoices/new">Salary invoice</Link>
        <Link className="btn btn-primary" to="/project-invoices/new">New client invoice</Link>
      </PageHeader>
      <ErrorAlert error={error} />
      {loading && !data ? (
        <Loading />
      ) : data ? (
        <div className="stack">
          <div className="grid-4">
            <Stat label="Employees on role" value={data.onRole} to="/employees" />
            <Stat label="Off role" value={data.offRole} to="/employees?status=off_role" />
            <Stat label="Projects" value={data.projects} to="/projects" />
            <Stat
              label="Unpaid client invoices"
              value={data.unpaidCount}
              sub={data.unpaidTotals.join(' · ') || 'Nothing outstanding'}
              to="/project-invoices?status=issued"
            />
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Recent invoices</h2>
              <Link to="/invoices" className="small">View all</Link>
            </div>
            {data.recent.length === 0 ? (
              <Empty>
                No invoices yet. <Link to="/invoices/new">Generate the first one</Link>.
              </Empty>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Invoice</th><th>Employee</th><th>Project</th><th>Period</th><th className="right">Net</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {data.recent.map((inv) => (
                      <tr key={inv.id} className="clickable" onClick={() => navigate(`/invoices/${inv.id}`)}>
                        <td className="mono nowrap">{inv.invoiceNumber}</td>
                        <td>{inv.employee?.fullName}</td>
                        <td>{inv.project?.name}</td>
                        <td className="nowrap">{formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}</td>
                        <td className="right mono nowrap">{formatMoney(inv.netAmount, inv.currency)}</td>
                        <td><Badge value={inv.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function Stat({ label, value, sub, to }) {
  return (
    <Link to={to} className="card stat" style={{ color: 'inherit', textDecoration: 'none' }}>
      <div className="label">{label}</div>
      <div className="value">{value ?? '—'}</div>
      {sub && <div className="muted small mono">{sub}</div>}
    </Link>
  );
}
