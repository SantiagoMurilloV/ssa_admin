import { useEffect, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import { clientsApi } from '../../api/admin.api.js';
import { formatCOP, formatDate, formatDateOnly } from '../../utils/format.js';
import { stageInfo } from '../../config/tracking.js';
import StageIcon from '../tracking/StageIcon.jsx';
import { BUCKET_LABEL } from '../pedidos/PedidoCard.jsx';

const ORDER_STATUS = { pending: 'Pendiente', paid: 'Pago verificado', shipped: 'Enviado', cancelled: 'Cancelado' };
const BUCKET_BADGE = { pending: 'badge-pending', paid: 'badge-paid', delivered: 'badge-shipped', cancelled: 'badge-cancelled' };

// Historial de compras: encargos del panel + pedidos de la tienda con el mismo teléfono
export default function ClientHistoryModal({ client, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('pedidos');

  useEffect(() => {
    clientsApi
      .get(client.id)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [client.id]);

  const pedidos = data?.pedidos ?? [];
  const orders = data?.orders ?? [];
  const spent =
    pedidos.filter((p) => p.status === 'open').reduce((sum, p) => sum + Math.min(p.paid_amount, p.sale_value), 0) +
    orders.filter((o) => ['paid', 'shipped'].includes(o.status)).reduce((sum, o) => sum + o.total, 0);

  return (
    <Modal title={`Historial · ${client.name}`} onClose={onClose} wide>
      {error && <p className="form-error">{error}</p>}
      {!data && !error && <p className="muted">Cargando historial…</p>}
      {data && (
        <>
          <div className="history-kpis">
            <div>
              <span className="kpi-label">Encargos</span>
              <strong>{pedidos.length}</strong>
            </div>
            <div>
              <span className="kpi-label">Compras en tienda</span>
              <strong>{orders.length}</strong>
            </div>
            <div>
              <span className="kpi-label">Total pagado</span>
              <strong>{formatCOP(spent)}</strong>
            </div>
            <div>
              <span className="kpi-label">Saldo pendiente</span>
              <strong className={pedidos.some((p) => p.status === 'open' && p.balance > 0) ? 'money-balance' : ''}>
                {formatCOP(pedidos.filter((p) => p.status === 'open').reduce((sum, p) => sum + p.balance, 0))}
              </strong>
            </div>
          </div>
          <div className="filter-row" style={{ marginTop: 16 }}>
            <button className={`chip ${tab === 'pedidos' ? 'active' : ''}`} onClick={() => setTab('pedidos')}>
              Encargos ({pedidos.length})
            </button>
            <button className={`chip ${tab === 'tienda' ? 'active' : ''}`} onClick={() => setTab('tienda')}>
              Tienda ({orders.length})
            </button>
          </div>

          {tab === 'pedidos' && pedidos.length === 0 && <p className="muted">Sin encargos todavía.</p>}
          {tab === 'pedidos' &&
            pedidos.map((p) => (
              <div className="row-card history-row" key={p.id}>
                <div className={`history-thumb ${p.photo_url ? '' : 'is-empty'}`}>
                  {p.photo_url ? <img src={p.photo_url} alt="" /> : (p.brand || p.product_ref).slice(0, 1).toUpperCase()}
                </div>
                <div className="row-main">
                  <div className="row-title">
                    <span className="pedido-ref pedido-ref-sm">{p.reference}</span> {p.brand ? `${p.brand} · ` : ''}
                    {p.product_ref}
                  </div>
                  <div className="row-sub">
                    Pedido {formatDateOnly(p.ordered_at)} · {formatCOP(p.sale_value)} · abonado {formatCOP(p.paid_amount)}
                    {p.balance > 0 ? ` · faltan ${formatCOP(p.balance)}` : ''}
                  </div>
                </div>
                <div className="row-actions">
                  <span className={`badge ${BUCKET_BADGE[p.bucket]}`}>{BUCKET_LABEL[p.bucket]}</span>
                  {p.status !== 'cancelled' && (
                    <span className="badge badge-stage">
                      <StageIcon stage={p.tracking_stage} size={12} /> {stageInfo(p.tracking_stage)?.short}
                    </span>
                  )}
                </div>
              </div>
            ))}

          {tab === 'tienda' && orders.length === 0 && (
            <p className="muted">Sin compras en la tienda con este teléfono.</p>
          )}
          {tab === 'tienda' &&
            orders.map((o) => (
              <div className="row-card history-row" key={o.id}>
                <div className="row-main">
                  <div className="row-title">
                    <span className="pedido-ref pedido-ref-sm">{o.reference}</span>{' '}
                    {o.items.map((i) => `${i.quantity}× ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ''}`).join(' · ')}
                  </div>
                  <div className="row-sub">
                    {formatDate(o.created_at)} · {o.city} · {formatCOP(o.total)}
                  </div>
                </div>
                <div className="row-actions">
                  <span className={`badge badge-${o.status}`}>{ORDER_STATUS[o.status]}</span>
                  {o.status !== 'cancelled' && (
                    <span className="badge badge-stage">
                      <StageIcon stage={o.tracking_stage} size={12} /> {stageInfo(o.tracking_stage)?.short}
                    </span>
                  )}
                </div>
              </div>
            ))}
        </>
      )}
    </Modal>
  );
}
