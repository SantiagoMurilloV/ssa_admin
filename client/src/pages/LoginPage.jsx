import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message ?? 'No se pudo iniciar sesión');
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <svg width="52" height="27" viewBox="0 0 92 42" aria-hidden="true">
          <path d="M10 30 Q46 4 78 26" fill="none" stroke="#968ABE" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="0.5 7" />
          <circle cx="10" cy="30" r="4.5" fill="#968ABE" />
          <circle cx="78" cy="26" r="4" fill="#7E9A88" />
          <circle cx="78" cy="26" r="8" fill="none" stroke="#7E9A88" strokeWidth="1.4" opacity=".55" />
        </svg>
        <h1>SSA Import</h1>
        <p>Panel de administración</p>
        <div className="form-stack">
          <div className="field">
            <label htmlFor="email">Correo</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-dark" type="submit" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </div>
      </form>
    </div>
  );
}
