import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { usePushNotifications } from '../../hooks/usePushNotifications.js';

const BELL_LABEL = {
  loading: 'Notificaciones…',
  unsupported: 'Este navegador no admite notificaciones',
  unavailable: 'Notificaciones no configuradas en el servidor',
  denied: 'Notificaciones bloqueadas en el navegador',
  off: 'Activar notificaciones de pedidos y encargos',
  on: 'Notificaciones activas · clic para desactivar'
};

function NotificationsToggle() {
  const { state, error, busy, enable, disable } = usePushNotifications();
  if (state === 'unsupported') return null;

  const inactive = state === 'loading' || state === 'unavailable' || state === 'denied';
  return (
    <button
      className={`bell-btn ${state === 'on' ? 'is-on' : ''}`}
      title={error ?? BELL_LABEL[state]}
      aria-label={error ?? BELL_LABEL[state]}
      disabled={busy || inactive}
      onClick={() => (state === 'on' ? disable() : enable())}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10.3 19a2 2 0 0 0 3.4 0" strokeLinecap="round" />
        {state !== 'on' && <path d="M4 4l16 16" strokeLinecap="round" />}
      </svg>
    </button>
  );
}

const LINKS = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/pedidos', label: 'Pedidos', badge: true },
  { to: '/clientes', label: 'Clientes' },
  { to: '/productos', label: 'Productos' },
  { to: '/contenido', label: 'Contenido' },
  { to: '/encargos', label: 'Encargos' },
  { to: '/configuracion', label: 'Configuración' }
];

export default function AdminHeader({ pendingCount }) {
  const { logout } = useAuth();
  return (
    <header className="admin-header">
      <div className="brand">
        <svg width="40" height="21" viewBox="0 0 92 42" aria-hidden="true">
          <path d="M10 30 Q46 4 78 26" fill="none" stroke="#968ABE" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="0.5 7" />
          <circle cx="10" cy="30" r="4.5" fill="#968ABE" />
          <circle cx="78" cy="26" r="4" fill="#7E9A88" />
          <circle cx="78" cy="26" r="8" fill="none" stroke="#7E9A88" strokeWidth="1.4" opacity=".55" />
        </svg>
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span className="brand-name">SSA</span>
          <span className="brand-sub">ADMIN</span>
        </span>
      </div>
      <nav className="admin-nav">
        {LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end}>
            {link.label}
            {link.badge && pendingCount > 0 && <span className="nav-badge">{pendingCount}</span>}
          </NavLink>
        ))}
      </nav>
      <NotificationsToggle />
      <button className="logout-btn" onClick={logout}>Salir</button>
    </header>
  );
}
