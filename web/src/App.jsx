import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { LoginPage, ForgotPasswordPage, ResetPasswordPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { EmployeeDetailPage } from './pages/EmployeeDetailPage';
import { ProjectsPage, ProjectDetailPage } from './pages/ProjectsPage';
import { AttendancePage } from './pages/AttendancePage';
import { HolidaysPage } from './pages/HolidaysPage';
import { InvoicesPage, InvoiceNewPage, InvoiceDetailPage } from './pages/InvoicesPage';
import { UsersPage } from './pages/UsersPage';
import { ProjectInvoicesPage, ProjectInvoiceNewPage, ProjectInvoiceDetailPage } from './pages/ProjectInvoicesPage';
import { MyProfilePage } from './pages/MyProfilePage';
import { OptionsPage } from './pages/OptionsPage';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

function AdminOnly({ children }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/me" replace />;
}

const admin = (el) => <AdminOnly>{el}</AdminOnly>;

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={admin(<DashboardPage />)} />
        <Route path="employees" element={admin(<EmployeesPage />)} />
        <Route path="employees/:id" element={admin(<EmployeeDetailPage />)} />
        <Route path="projects" element={admin(<ProjectsPage />)} />
        <Route path="projects/:id" element={admin(<ProjectDetailPage />)} />
        <Route path="attendance" element={admin(<AttendancePage />)} />
        <Route path="holidays" element={admin(<HolidaysPage />)} />
        <Route path="invoices" element={admin(<InvoicesPage />)} />
        <Route path="invoices/new" element={admin(<InvoiceNewPage />)} />
        <Route path="invoices/:id" element={admin(<InvoiceDetailPage />)} />
        <Route path="project-invoices" element={admin(<ProjectInvoicesPage />)} />
        <Route path="project-invoices/new" element={admin(<ProjectInvoiceNewPage />)} />
        <Route path="project-invoices/:id" element={admin(<ProjectInvoiceDetailPage />)} />
        <Route path="users" element={admin(<UsersPage />)} />
        <Route path="settings/options" element={admin(<OptionsPage />)} />
        <Route path="me" element={<MyProfilePage />} />
        <Route path="*" element={<div className="empty">Page not found.</div>} />
      </Route>
    </Routes>
  );
}
