import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

const LINKS = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/pedidos', label: 'Pedidos', badge: true },
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
      <button className="logout-btn" onClick={logout}>Salir</button>
    </header>
  );
}
