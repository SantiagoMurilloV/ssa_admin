import { useState } from 'react';
import { ordersApi } from '../api/admin.api.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { formatCOP, formatDate } from '../utils/format.js';
import Modal from '../components/ui/Modal.jsx';

const STATUS_LABEL = { pending: 'Pendiente', paid: 'Pago verificado', shipped: 'Enviado' };
const PAYMENT_LABEL = {
  awaiting_receipt: 'Sin comprobante',
  in_review: 'Comprobante por revisar',
  verified: 'Pago verificado'
};

function ReceiptModal({ order, onClose }) {
  return (
    <Modal title={`Comprobante · ${order.reference}`} onClose={onClose}>
      {order.receipt_url ? (
        <>
          <img className="receipt-img" src={order.receipt_url} alt={`Comprobante de ${order.reference}`} />
          <div className="spacer" />
          <a className="btn btn-ghost" href={order.receipt_url} target="_blank" rel="noreferrer">
            Abrir en pestaña nueva
          </a>
        </>
      ) : (
        <p className="muted">Este pedido aún no tiene comprobante subido.</p>
      )}
    </Modal>
  );
}

function ShipModal({ order, onConfirm, onClose }) {
  const [type, setType] = useState('carrier');
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const shipping = { type };
      if (type === 'carrier') {
        if (carrier.trim()) shipping.carrier = carrier.trim();
        if (trackingNumber.trim()) shipping.trackingNumber = trackingNumber.trim();
        if (trackingUrl.trim()) shipping.trackingUrl = trackingUrl.trim();
      }
      await onConfirm(shipping);
    } catch (err) {
      setError(err.message ?? 'No se pudo marcar el envío');
      setBusy(false);
    }
  };

  return (
    <Modal title={`Marcar enviado · ${order.reference}`} onClose={onClose}>
      <div className="form-stack">
        <div className="field">
          <label>Tipo de envío</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="carrier">Transportadora</option>
            <option value="local">Domicilio local</option>
          </select>
        </div>
        {type === 'carrier' && (
          <>
            <div className="field-row">
              <div className="field">
                <label>Transportadora</label>
                <input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Servientrega, Coordinadora…" />
              </div>
              <div className="field">
                <label>Número de guía</label>
                <input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Link de rastreo (opcional)</label>
              <input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="https://…" />
            </div>
          </>
        )}
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-dark" onClick={submit} disabled={busy}>
          {busy ? 'Guardando…' : 'Confirmar envío'}
        </button>
      </div>
    </Modal>
  );
}

function OrderCard({ order, onVerify, onShip, onRevert, onViewReceipt }) {
  return (
    <article className="row-card">
      <div className="row-main">
        <div className="row-title">
          {order.reference} · {order.customer_name}
        </div>
        <div className="row-sub">
          {formatDate(order.created_at)} · {order.city}, {order.department} · {order.phone}
        </div>
        <div className="row-sub">
          {order.items.map((item) => `${item.quantity}× ${item.product_name}`).join(' · ')}
        </div>
        <div className="row-sub">
          Subtotal {formatCOP(order.subtotal)} + envío {formatCOP(order.shipping_fee)} ={' '}
          <strong>{formatCOP(order.total)}</strong>
          {order.payment_channel ? ` · ${order.payment_channel}` : ''}
        </div>
        {order.notes && <div className="row-sub">Nota: {order.notes}</div>}
        {order.tracking_number && (
          <div className="row-sub">
            Guía {order.tracking_carrier ?? ''} {order.tracking_number}
          </div>
        )}
      </div>
      <div className="row-actions">
        <span className={`badge badge-${order.status}`}>{STATUS_LABEL[order.status]}</span>
        {order.status === 'pending' && (
          <span className={`badge ${order.receipt_url ? 'badge-paid' : 'badge-off'}`}>
            {PAYMENT_LABEL[order.payment_status]}
          </span>
        )}
        {order.receipt_url && (
          <button className="btn btn-ghost btn-sm" onClick={() => onViewReceipt(order)}>
            Ver comprobante
          </button>
        )}
        {order.status === 'pending' && (
          <button className="btn btn-dark btn-sm" onClick={() => onVerify(order)}>
            Confirmar pago
          </button>
        )}
        {order.status === 'paid' && (
          <button className="btn btn-dark btn-sm" onClick={() => onShip(order)}>
            Marcar enviado
          </button>
        )}
        {order.status !== 'pending' && (
          <button className="btn btn-ghost btn-sm" onClick={() => onRevert(order)}>
            Volver a pendiente
          </button>
        )}
      </div>
    </article>
  );
}

export default function OrdersPage() {
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [shipOrder, setShipOrder] = useState(null);
  const [actionError, setActionError] = useState(null);
  const { data, status, reload } = useApiResource(
    () => ordersApi.list(filter === 'all' ? undefined : filter),
    { pollMs: 15000 }
  );

  // Si falla, hay que decirlo: en silencio el admin creería que confirmó un
  // pago que en realidad no se guardó.
  const verify = async (order) => {
    setActionError(null);
    try {
      await ordersApi.updateStatus(order.id, { status: 'paid' });
      reload({ silent: true });
    } catch (err) {
      setActionError(`No se pudo confirmar el pago de ${order.reference}: ${err.message}`);
    }
  };

  const revert = async (order) => {
    setActionError(null);
    try {
      await ordersApi.updateStatus(order.id, { status: 'pending' });
      reload({ silent: true });
    } catch (err) {
      setActionError(`No se pudo devolver ${order.reference} a pendiente: ${err.message}`);
    }
  };

  const ship = async (order, shipping) => {
    await ordersApi.updateStatus(order.id, { status: 'shipped', shipping });
    setShipOrder(null);
    reload({ silent: true });
  };

  const counts = data?.counts ?? { pending: 0, paid: 0, shipped: 0 };
  const filters = [
    ['pending', `Pendientes (${counts.pending})`],
    ['paid', `Pagados (${counts.paid})`],
    ['shipped', `Enviados (${counts.shipped})`],
    ['all', 'Todos']
  ];

  const orders = (data?.orders ?? []).filter((order) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      order.reference.toLowerCase().includes(q) || order.customer_name.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <h1 className="page-title">Pedidos</h1>
      <div className="filter-row">
        {filters.map(([key, label]) => (
          <button
            key={key}
            className={`chip ${filter === key ? 'active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
        <input
          style={{ maxWidth: 240, marginLeft: 'auto' }}
          placeholder="Buscar por nombre o referencia"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {actionError && (
        <p className="form-error" style={{ marginBottom: 12 }}>{actionError}</p>
      )}
      {status === 'loading' && <p className="muted">Cargando pedidos…</p>}
      {status === 'ready' && orders.length === 0 && <p className="muted">No hay pedidos aquí.</p>}
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          onVerify={verify}
          onShip={setShipOrder}
          onRevert={revert}
          onViewReceipt={setReceiptOrder}
        />
      ))}

      {receiptOrder && <ReceiptModal order={receiptOrder} onClose={() => setReceiptOrder(null)} />}
      {shipOrder && (
        <ShipModal
          order={shipOrder}
          onClose={() => setShipOrder(null)}
          onConfirm={(shipping) => ship(shipOrder, shipping)}
        />
      )}
    </>
  );
}
