import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { icons } from './icons';

const ADMIN_NAV = [
  ['/', 'Dashboard', 'dashboard'],
  ['/employees', 'Employees', 'employees'],
  ['/projects', 'Projects', 'projects'],
  ['/attendance', 'Attendance', 'attendance'],
  ['/holidays', 'Holidays', 'holidays'],
  ['/project-invoices', 'Client invoices', 'invoices'],
  ['/invoices', 'Salary invoices', 'invoices'],
  ['/users', 'Users', 'users'],
  ['/settings/options', 'Roles & designations', 'options'],
];
const USER_NAV = [['/me', 'My profile', 'profile']];

const initials = (name = '') =>
  name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

export function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  const nav = isAdmin ? ADMIN_NAV : USER_NAV;
  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">P</span> Payroll
        </div>
        <nav className="nav">
          {nav.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              {icons[icon]} {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="avatar">{initials(user.fullName || user.email)}</span>
          <div className="who">
            <div>{user.fullName || user.email}</div>
            <div className="muted small">{isAdmin ? 'Admin' : 'User'}</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={logout} title="Sign out" aria-label="Sign out">
            <span style={{ width: 18, height: 18, display: 'inline-flex' }}>{icons.logout}</span>
          </button>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <div className="main">
        <div className="topbar">
          <button className="btn btn-ghost btn-icon" onClick={() => setOpen(true)} aria-label="Open menu">
            <span style={{ width: 20, height: 20, display: 'inline-flex' }}>{icons.menu}</span>
          </button>
          <strong>Payroll</strong>
        </div>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
