import { useEffect, useState } from 'react';
import { pedidosApi } from '../../api/admin.api.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import Modal from '../ui/Modal.jsx';
import PedidoCard, { BUCKET_LABEL } from './PedidoCard.jsx';
import PedidoForm from './PedidoForm.jsx';
import PaymentModal from './PaymentModal.jsx';
import StageModal from './StageModal.jsx';

const FILTERS = ['pending', 'paid', 'delivered', 'cancelled', 'all'];

// Encargos creados desde el panel. Cada tarjeta cae en una pestaña según su
// pago y su etapa: la creación con abono parcial aparece en "Pago pendiente".
export default function PedidosBoard({ initialNew, onConsumedInitial }) {
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // null | { initial } | { pedido }
  const [paying, setPaying] = useState(null);
  const [staging, setStaging] = useState(null); // { pedido, stage }
  const [receipt, setReceipt] = useState(null);
  const [busyStage, setBusyStage] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [flash, setFlash] = useState(null);

  const { data, status, error, reload } = useApiResource(
    () => pedidosApi.list(filter === 'all' ? undefined : filter),
    { pollMs: 20000, key: filter }
  );

  // Llegó desde Encargos con "Crear pedido": se abre el formulario prellenado
  useEffect(() => {
    if (!initialNew) return;
    setEditing({ initial: initialNew });
    onConsumedInitial?.();
  }, [initialNew, onConsumedInitial]);

  const run = async (label, fn) => {
    setActionError(null);
    try {
      await fn();
      reload({ silent: true });
    } catch (err) {
      setActionError(`${label}: ${err.details?.[0]?.message ?? err.message}`);
    }
  };

  const changeStage = (pedido, stage) => {
    // Al despachar se piden transportadora y guía; el resto cambia directo
    if (stage === 'dispatched') return setStaging({ pedido, stage });
    setBusyStage(pedido.id);
    run(`No se pudo cambiar la etapa de ${pedido.reference}`, () =>
      pedidosApi.updateTracking(pedido.id, { stage })
    ).finally(() => setBusyStage(null));
  };

  const confirmStage = async (payload) => {
    await pedidosApi.updateTracking(staging.pedido.id, payload);
    setStaging(null);
    reload({ silent: true });
  };

  const toggleCancel = (pedido) => {
    const cancelling = pedido.status !== 'cancelled';
    if (cancelling && !window.confirm(`¿Cancelar el encargo ${pedido.reference}? Se conserva en Cancelados.`)) return;
    run(`No se pudo ${cancelling ? 'cancelar' : 'reactivar'} ${pedido.reference}`, () =>
      pedidosApi.updateStatus(pedido.id, cancelling ? 'cancelled' : 'open')
    );
  };

  const remove = (pedido) => {
    if (!window.confirm(`¿Eliminar ${pedido.reference} definitivamente? Se borran sus abonos y su guía deja de funcionar.`)) return;
    run(`No se pudo eliminar ${pedido.reference}`, () => pedidosApi.remove(pedido.id));
  };

  const removePayment = (pedido, payment) => {
    if (!window.confirm(`¿Quitar el abono de ${payment.amount.toLocaleString('es-CO')} de ${pedido.reference}?`)) return;
    run('No se pudo quitar el abono', () => pedidosApi.removePayment(pedido.id, payment.id));
  };

  const saved = (pedido, message) => {
    setEditing(null);
    setPaying(null);
    setFlash(message ?? `${pedido.reference} guardado`);
    setTimeout(() => setFlash(null), 3500);
    // La tarjeta nueva va a la pestaña que le corresponde
    if (filter !== 'all' && pedido.bucket !== filter) setFilter(pedido.bucket);
    else reload({ silent: true });
  };

  const counts = data?.counts ?? { pending: 0, paid: 0, delivered: 0, cancelled: 0 };
  const total = counts.pending + counts.paid + counts.delivered + counts.cancelled;
  const q = search.trim().toLowerCase();
  const pedidos = (data?.pedidos ?? []).filter(
    (p) =>
      !q ||
      p.reference.toLowerCase().includes(q) ||
      p.client_name.toLowerCase().includes(q) ||
      p.product_ref.toLowerCase().includes(q) ||
      (p.brand ?? '').toLowerCase().includes(q) ||
      (p.client_phone ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '∅')
  );

  return (
    <>
      <div className="filter-row">
        <button className="btn btn-dark" onClick={() => setEditing({ initial: null })}>
          + Nuevo pedido
        </button>
        {FILTERS.map((key) => (
          <button key={key} className={`chip ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>
            {key === 'all' ? `Todos (${total})` : `${BUCKET_LABEL[key]} (${counts[key]})`}
          </button>
        ))}
        <input
          className="filter-search"
          placeholder="Buscar por código, cliente, producto o teléfono"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {flash && <p className="form-ok flash">{flash}</p>}
      {actionError && <p className="form-error" style={{ marginBottom: 12 }}>{actionError}</p>}
      {status === 'loading' && <p className="muted">Cargando encargos…</p>}
      {status === 'error' && <p className="form-error">No se pudieron cargar los encargos: {error?.message}</p>}
      {status === 'ready' && pedidos.length === 0 && (
        <div className="empty-state">
          <p className="muted">
            {total === 0
              ? 'Todavía no hay encargos. Crea el primero con “+ Nuevo pedido”: el sistema le asigna un código SSA-###### que el cliente usa en la tienda para seguir su envío.'
              : 'No hay encargos en esta pestaña.'}
          </p>
        </div>
      )}
      {status === 'ready' && (
        <div className="pedido-list">
          {pedidos.map((pedido) => (
            <PedidoCard
              key={pedido.id}
              pedido={pedido}
              busyStage={busyStage === pedido.id}
              onChanged={() => reload({ silent: true })}
              onAddPayment={setPaying}
              onEdit={(p) => setEditing({ pedido: p })}
              onStage={changeStage}
              onViewReceipt={(payment) => setReceipt({ pedido, payment })}
              onCancelToggle={toggleCancel}
              onRemove={remove}
              onRemovePayment={(payment) => removePayment(pedido, payment)}
            />
          ))}
        </div>
      )}

      {editing && (
        <PedidoForm
          pedido={editing.pedido ?? null}
          initial={editing.initial ?? null}
          onClose={() => setEditing(null)}
          onSaved={(pedido) =>
            saved(pedido, editing.pedido ? `${pedido.reference} actualizado` : `Pedido ${pedido.reference} creado en “${BUCKET_LABEL[pedido.bucket]}”`)
          }
        />
      )}
      {paying && (
        <PaymentModal
          pedido={paying}
          onClose={() => setPaying(null)}
          onSaved={(pedido) => saved(pedido, pedido.balance > 0 ? `Abono registrado · faltan ${pedido.balance.toLocaleString('es-CO')}` : `${pedido.reference} quedó pagado completo ✓`)}
        />
      )}
      {staging && (
        <StageModal
          reference={staging.pedido.reference}
          stage={staging.stage}
          current={staging.pedido}
          onClose={() => setStaging(null)}
          onConfirm={confirmStage}
        />
      )}
      {receipt && (
        <Modal title={`Desprendible · ${receipt.pedido.reference}`} onClose={() => setReceipt(null)}>
          <img className="receipt-img" src={receipt.payment.receipt_url} alt="Desprendible" />
          <div className="spacer" />
          <div className="row-actions">
            <span className="muted">
              {receipt.payment.amount.toLocaleString('es-CO')} · {receipt.payment.paid_at}
              {receipt.payment.note ? ` · ${receipt.payment.note}` : ''}
            </span>
            <a className="btn btn-ghost btn-sm" href={receipt.payment.receipt_url} target="_blank" rel="noreferrer">
              Abrir en pestaña nueva
            </a>
          </div>
        </Modal>
      )}
    </>
  );
}
