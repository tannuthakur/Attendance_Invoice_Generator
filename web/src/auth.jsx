import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getSession, setSession, onSessionEnd } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getSession()));

  useEffect(() => onSessionEnd(() => setUser(null)), []);

  useEffect(() => {
    if (!getSession()) return;
    api('/auth/me')
      .then(setUser)
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api('/auth/login', { method: 'POST', body: { email, password }, auth: false });
    setSession(res);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => setSession(null), []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
