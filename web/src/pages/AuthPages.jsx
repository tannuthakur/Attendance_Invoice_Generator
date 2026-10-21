import { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ErrorAlert, Field } from '../components/ui';

function AuthCard({ title, subtitle, children }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-mark">P</span> Payroll
        </div>
        <div className="card card-body">
          <h1 style={{ fontSize: 19 }}>{title}</h1>
          {subtitle && <p className="muted" style={{ margin: '6px 0 18px' }}>{subtitle}</p>}
          {!subtitle && <div style={{ height: 16 }} />}
          {children}
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (user) return <Navigate to={user.role === 'admin' ? '/' : '/me'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await login(email.trim(), password);
      navigate(location.state?.from || (me.role === 'admin' ? '/' : '/me'), { replace: true });
    } catch (err) {
      setError(err.status === 429 ? new Error('Too many attempts. Wait a minute and try again.') : err);
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Sign in" subtitle="Use the email and password your admin set up for you.">
      <form onSubmit={submit}>
        <Field label="Email">
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        <Field label="Password">
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <ErrorAlert error={error} />
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <Link to="/forgot-password" className="small" style={{ textAlign: 'center' }}>Forgot your password?</Link>
      </form>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email: email.trim() }, auth: false });
      setSent(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a link to choose a new password.">
      {sent ? (
        <div className="stack">
          <div className="alert success">If an account exists for {email}, a reset link is on its way.</div>
          <Link to="/login">Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit}>
          <Field label="Email">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>
          <ErrorAlert error={error} />
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
          <Link to="/login" className="small" style={{ textAlign: 'center' }}>Back to sign in</Link>
        </form>
      )}
    </AuthCard>
  );
}

/** Landing page for the Supabase recovery link (token in the URL hash, or token_hash in the query). */
export function ResetPasswordPage() {
  const tokens = useMemo(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    return {
      accessToken: hash.get('access_token'),
      tokenHash: query.get('token_hash'),
      linkError: hash.get('error_description') || query.get('error_description'),
    };
  }, []);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const hasToken = tokens.accessToken || tokens.tokenHash;

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setError(new Error('Passwords do not match.'));
    setBusy(true);
    setError(null);
    try {
      const body = { newPassword: password };
      if (tokens.tokenHash) body.tokenHash = tokens.tokenHash;
      else body.accessToken = tokens.accessToken;
      await api('/auth/reset-password', { method: 'POST', body, auth: false });
      window.history.replaceState(null, '', window.location.pathname);
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Choose a new password">
      {done ? (
        <div className="stack">
          <div className="alert success">Password updated. You can sign in with your new password.</div>
          <Link to="/login" className="btn btn-primary">Go to sign in</Link>
        </div>
      ) : !hasToken ? (
        <div className="stack">
          <div className="alert error">{tokens.linkError || 'This reset link is invalid or has expired.'}</div>
          <Link to="/forgot-password">Request a new link</Link>
        </div>
      ) : (
        <form onSubmit={submit}>
          <Field label="New password" hint="At least 8 characters.">
            <input className="input" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
          </Field>
          <Field label="Confirm password">
            <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </Field>
          <ErrorAlert error={error} />
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
        </form>
      )}
    </AuthCard>
  );
}
