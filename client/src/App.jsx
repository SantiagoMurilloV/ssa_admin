import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { ordersApi } from './api/admin.api.js';
import AdminHeader from './components/layout/AdminHeader.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import OrdersPage from './pages/OrdersPage.jsx';
import ProductsPage from './pages/ProductsPage.jsx';
import ContentPage from './pages/ContentPage.jsx';
import EncargosPage from './pages/EncargosPage.jsx';
import ConfigPage from './pages/ConfigPage.jsx';
import ClientsPage from './pages/ClientsPage.jsx';

export default function App() {
  const { status } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (status !== 'authenticated') return undefined;
    const load = () =>
      ordersApi
        .list('pending')
        .then(({ counts }) => setPendingCount(counts.pending ?? 0))
        .catch(() => {});
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [status]);

  if (status === 'loading') {
    return <div className="login-wrap"><p className="muted">Cargando…</p></div>;
  }
  if (status === 'anonymous') return <LoginPage />;

  return (
    <div className="app-shell">
      <AdminHeader pendingCount={pendingCount} />
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/pedidos" element={<OrdersPage />} />
        <Route path="/clientes" element={<ClientsPage />} />
        <Route path="/productos" element={<ProductsPage />} />
        <Route path="/contenido" element={<ContentPage />} />
        <Route path="/encargos" element={<EncargosPage />} />
        <Route path="/configuracion" element={<ConfigPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
