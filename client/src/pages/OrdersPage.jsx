import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PedidosBoard from '../components/pedidos/PedidosBoard.jsx';
import StoreOrdersBoard from '../components/orders/StoreOrdersBoard.jsx';

const SOURCE_KEY = 'ssa-admin-orders-source';

// Dos orígenes de pedidos bajo la misma pestaña: los encargos que crea el
// admin (con cliente, abonos y guía) y los que llegan del checkout de la tienda.
export default function OrdersPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [source, setSource] = useState(() => localStorage.getItem(SOURCE_KEY) ?? 'encargos');
  // Prellenado que manda la página de Encargos con "Crear pedido"
  const [initialNew, setInitialNew] = useState(() => location.state?.newPedido ?? null);

  useEffect(() => {
    if (location.state?.newPedido) {
      setInitialNew(location.state.newPedido);
      setSource('encargos');
      // Se limpia el state para que un refresh no vuelva a abrir el formulario
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  const changeSource = (next) => {
    setSource(next);
    localStorage.setItem(SOURCE_KEY, next);
  };

  const consumed = useCallback(() => setInitialNew(null), []);

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">
          Pedidos <em>{source === 'encargos' ? 'encargos con guía' : 'checkout de la tienda'}</em>
        </h1>
        <div className="segmented" role="tablist" aria-label="Origen de los pedidos">
          <button role="tab" aria-selected={source === 'encargos'} className={source === 'encargos' ? 'active' : ''} onClick={() => changeSource('encargos')}>
            Encargos
          </button>
          <button role="tab" aria-selected={source === 'tienda'} className={source === 'tienda' ? 'active' : ''} onClick={() => changeSource('tienda')}>
            Tienda
          </button>
        </div>
      </div>
      {source === 'encargos' ? (
        <PedidosBoard initialNew={initialNew} onConsumedInitial={consumed} />
      ) : (
        <StoreOrdersBoard />
      )}
    </>
  );
}
