import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, Empty, ErrorAlert, Field, FormModal, Loading, PageHeader, Pagination, useAsync, useDebounced, useToast } from '../components/ui';
import { EmployeeSelect } from '../components/pickers';
import { formatDate } from '../format';

const LIMIT = 20;

export function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const debouncedSearch = useDebounced(search);
  const { data, error, loading, reload } = useAsync(
    () => api('/users', { query: { page, limit: LIMIT, role, search: debouncedSearch.trim() } }),
    [page, role, debouncedSearch],
  );

  const changeRole = async (u, role) => {
    if (!window.confirm(`Make ${u.email} ${role === 'admin' ? 'an admin (full access)' : 'a normal user'}?`)) return;
    try {
      await api(`/users/${u.id}/role`, { method: 'PATCH', body: { role } });
      toast('Role updated');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <>
      <PageHeader title="Users" subtitle="People who can sign in. Normal users can only see their own employee record.">
        <button className="btn btn-primary" onClick={() => setCreating(true)}>Add user</button>
      </PageHeader>
      <div className="toolbar">
        <input className="input grow" placeholder="Search name or email…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select className="input" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} aria-label="Role">
          <option value="">All roles</option>
          <option value="admin">Admins</option>
          <option value="user">Normal users</option>
        </select>
      </div>
      <ErrorAlert error={error} />
      <div className="card">
        {loading && !data ? (
          <Loading />
        ) : data?.data.length === 0 ? (
          <Empty>{search || role ? 'No users match these filters.' : 'No users.'}</Empty>
        ) : data ? (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>User</th><th>Role</th><th>Linked employee</th><th>Added</th><th /></tr></thead>
                <tbody>
                  {data.data.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div>{u.fullName || '—'}</div>
                        <div className="muted small">{u.email}</div>
                      </td>
                      <td><Badge value={u.role} /></td>
                      <td>
                        {u.employee ? (
                          <Link to={`/employees/${u.employeeId}`}>{u.employee.fullName} <span className="muted mono small">{u.employee.employeeCode}</span></Link>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="muted small nowrap">{formatDate(u.createdAt)}</td>
                      <td className="right nowrap">
                        {u.id !== me.id && (
                          <button className="link-btn" onClick={() => changeRole(u, u.role === 'admin' ? 'user' : 'admin')}>
                            {u.role === 'admin' ? 'Make normal user' : 'Make admin'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} limit={LIMIT} total={data.total} onPage={setPage} />
          </>
        ) : null}
      </div>
      {creating && <UserModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
    </>
  );
}

function UserModal({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ email: '', fullName: '', role: 'user', employeeId: '', password: '' });
  const [mode, setMode] = useState('invite');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: typeof e === 'string' ? e : e.target.value }));

  const submit = async () => {
    const body = { email: form.email.trim(), role: form.role };
    if (form.fullName.trim()) body.fullName = form.fullName.trim();
    if (form.employeeId) body.employeeId = form.employeeId;
    if (mode === 'password') body.password = form.password;
    await api('/users', { method: 'POST', body });
    toast(mode === 'invite' ? `Invite sent to ${body.email}` : `User ${body.email} created`);
    onSaved();
  };

  return (
    <FormModal title="Add user" submitLabel={mode === 'invite' ? 'Send invite' : 'Create user'} onSubmit={submit} onClose={onClose}>
      <div className="form-grid">
        <Field label="Email">
          <input className="input" type="email" value={form.email} onChange={set('email')} required autoFocus />
        </Field>
        <Field label="Full name">
          <input className="input" value={form.fullName} onChange={set('fullName')} />
        </Field>
        <Field label="Role">
          <select className="input" value={form.role} onChange={set('role')}>
            <option value="user">Normal user (own profile only)</option>
            <option value="admin">Admin (full access)</option>
          </select>
        </Field>
        <Field label="Linked employee" hint="Lets a normal user see this employee record.">
          <EmployeeSelect value={form.employeeId} onChange={set('employeeId')} placeholder="None" />
        </Field>
        <div className="field full">
          <span>How they sign in</span>
          <div className="segmented">
            <button type="button" className={mode === 'invite' ? 'on' : ''} onClick={() => setMode('invite')}>Email an invite</button>
            <button type="button" className={mode === 'password' ? 'on' : ''} onClick={() => setMode('password')}>Set a password</button>
          </div>
        </div>
        {mode === 'password' && (
          <Field label="Password" hint="At least 8 characters. Share it with them securely." className="full">
            <input className="input" type="text" minLength={8} value={form.password} onChange={set('password')} required />
          </Field>
        )}
      </div>
    </FormModal>
  );
}
