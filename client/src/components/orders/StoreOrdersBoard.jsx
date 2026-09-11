import { useState } from 'react';
import { ordersApi } from '../../api/admin.api.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { formatCOP, formatDate } from '../../utils/format.js';
import Modal from '../ui/Modal.jsx';
import TrackingStepper from '../tracking/TrackingStepper.jsx';

const STATUS_LABEL = {
  pending: 'Pendiente',
  paid: 'Pago verificado',
  shipped: 'Enviado',
  cancelled: 'Cancelado'
};
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

function OrderCard({ order, onVerify, onShip, onRevert, onCancel, onRemove, onViewReceipt, onStage, busyStage }) {
  return (
    <article className="row-card row-card-order">
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
        {/* La guía pública (EE. UU. → bodega → cliente) también vale para los
            pedidos de la tienda: el comprador la sigue con su referencia. */}
        {order.status !== 'cancelled' && (
          <div className="order-tracking">
            <TrackingStepper
              stage={order.tracking_stage}
              compact
              busy={busyStage}
              onChange={(stage) => onStage(order, stage)}
            />
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
        {order.status !== 'cancelled' && (
          <button className="btn btn-danger btn-sm" onClick={() => onCancel(order)}>
            Cancelar
          </button>
        )}
        <button className="btn btn-danger btn-sm" onClick={() => onRemove(order)}>
          Eliminar
        </button>
      </div>
    </article>
  );
}

export default function StoreOrdersBoard() {
  const [filter, setFilter] = useState('pending');
  const [busyStage, setBusyStage] = useState(null);
  const [search, setSearch] = useState('');
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [shipOrder, setShipOrder] = useState(null);
  const [actionError, setActionError] = useState(null);
  // `key: filter` hace que cambiar de pestaña vuelva a pedir la lista; antes
  // solo se cargaba una vez y la pestaña nueva mostraba los pedidos de la anterior.
  const { data, status, error, reload } = useApiResource(
    () => ordersApi.list(filter === 'all' ? undefined : filter),
    { pollMs: 15000, key: filter }
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

  // Cancelar devuelve al inventario las unidades que este pedido retenía
  const cancel = async (order) => {
    const units = order.items.map((i) => `${i.quantity}× ${i.product_name}`).join(', ');
    if (
      !window.confirm(
        `¿Cancelar ${order.reference}? Se devuelven al inventario: ${units}.`
      )
    ) {
      return;
    }
    setActionError(null);
    try {
      await ordersApi.updateStatus(order.id, { status: 'cancelled' });
      reload({ silent: true });
    } catch (err) {
      setActionError(`No se pudo cancelar ${order.reference}: ${err.message}`);
    }
  };

  // Eliminar borra el pedido de verdad (cancelar lo conserva como historial).
  // El mensaje dice qué pasa con el inventario según el estado, porque no es lo
  // mismo borrar un pedido que aún retiene unidades que uno que ya se envió.
  const remove = async (order) => {
    const units = order.items.map((i) => `${i.quantity}× ${i.product_name}`).join(', ');
    const stockNote =
      order.status === 'shipped'
        ? 'El pedido ya fue enviado, así que el inventario no cambia.'
        : order.status === 'cancelled'
          ? 'El inventario ya se devolvió al cancelarlo.'
          : `Se devuelven al inventario: ${units}.`;
    if (
      !window.confirm(
        `¿Eliminar ${order.reference} definitivamente? ${stockNote} Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setActionError(null);
    try {
      await ordersApi.remove(order.id);
      reload({ silent: true });
    } catch (err) {
      setActionError(`No se pudo eliminar ${order.reference}: ${err.message}`);
    }
  };

  const changeStage = async (order, stage) => {
    setActionError(null);
    setBusyStage(order.id);
    try {
      await ordersApi.updateTracking(order.id, { stage });
      reload({ silent: true });
    } catch (err) {
      setActionError(`No se pudo cambiar la etapa de ${order.reference}: ${err.message}`);
    } finally {
      setBusyStage(null);
    }
  };

  const ship = async (order, shipping) => {
    await ordersApi.updateStatus(order.id, { status: 'shipped', shipping });
    setShipOrder(null);
    reload({ silent: true });
  };

  const counts = data?.counts ?? { pending: 0, paid: 0, shipped: 0, cancelled: 0 };
  const total = counts.pending + counts.paid + counts.shipped + counts.cancelled;
  const filters = [
    ['pending', `Pendientes (${counts.pending})`],
    ['paid', `Pagados (${counts.paid})`],
    ['shipped', `Enviados (${counts.shipped})`],
    ['cancelled', `Cancelados (${counts.cancelled})`],
    ['all', `Todos (${total})`]
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
          className="filter-search"
          placeholder="Buscar por nombre o referencia"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {actionError && (
        <p className="form-error" style={{ marginBottom: 12 }}>{actionError}</p>
      )}
      {status === 'loading' && <p className="muted">Cargando pedidos…</p>}
      {status === 'error' && (
        <p className="form-error">No se pudieron cargar los pedidos: {error?.message}</p>
      )}
      {status === 'ready' && orders.length === 0 && <p className="muted">No hay pedidos aquí.</p>}
      {/* Mientras carga otra pestaña no se pintan los pedidos de la anterior */}
      {status === 'ready' &&
        orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            onVerify={verify}
            onShip={setShipOrder}
            onRevert={revert}
            onCancel={cancel}
            onRemove={remove}
            onViewReceipt={setReceiptOrder}
            onStage={changeStage}
            busyStage={busyStage === order.id}
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
