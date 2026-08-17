import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi } from '../api/admin.api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading'); // loading | anonymous | authenticated
  const [user, setUser] = useState(null);

  useEffect(() => {
    authApi
      .me()
      .then(({ user }) => {
        setUser(user);
        setStatus('authenticated');
      })
      .catch(() => setStatus('anonymous'));
  }, []);

  const login = useCallback(async (email, password) => {
    const { user } = await authApi.login(email, password);
    setUser(user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {});
    setUser(null);
    setStatus('anonymous');
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, login, logout }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
