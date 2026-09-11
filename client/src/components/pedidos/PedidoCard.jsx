import { useState } from 'react';
import { pedidosApi } from '../../api/admin.api.js';
import { formatCOP, formatDateOnly, relativeTime } from '../../utils/format.js';
import { stageInfo, trackingUrl, whatsappNumber } from '../../config/tracking.js';
import TrackingStepper from '../tracking/TrackingStepper.jsx';
import StageIcon from '../tracking/StageIcon.jsx';

export const BUCKET_LABEL = {
  pending: 'Pago pendiente',
  paid: 'Pagado',
  delivered: 'Entregado',
  cancelled: 'Cancelado'
};
const BUCKET_BADGE = {
  pending: 'badge-pending',
  paid: 'badge-paid',
  delivered: 'badge-shipped',
  cancelled: 'badge-cancelled'
};

const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] ?? '';

// Mensaje listo para WhatsApp con el código y el enlace de la guía
export const shareMessage = (pedido) =>
  `Hola ${firstName(pedido.client_name)} 👋 Tu pedido ${[pedido.brand, pedido.product_ref].filter(Boolean).join(' ')} quedó registrado con el código *${pedido.reference}*.\n\nSíguelo en vivo aquí: ${trackingUrl(pedido.reference)}\n\nAhí mismo puedes activar avisos y te llega una notificación en cada etapa: EE. UU. → Colombia → bodega en Armenia → tu puerta ✈️📦`;

function Photo({ pedido, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError('Máximo 5 MB');
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('image', file);
      await pedidosApi.setPhoto(pedido.id, formData);
      onChanged();
    } catch (err) {
      setError(err.message ?? 'No se pudo subir');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`pedido-photo ${pedido.photo_url ? '' : 'is-empty'}`}>
      {pedido.photo_url ? (
        <img src={pedido.photo_url} alt={pedido.product_ref} />
      ) : (
        <span className="pedido-photo-letter">{(pedido.brand || pedido.product_ref).slice(0, 1).toUpperCase()}</span>
      )}
      <label className="pedido-photo-change" title={pedido.photo_url ? 'Cambiar foto' : 'Subir foto del producto'}>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={busy} />
        {busy ? '…' : pedido.photo_url ? 'Cambiar' : '+ Foto'}
      </label>
      {error && <span className="pedido-photo-error">{error}</span>}
    </div>
  );
}

function PaymentChips({ pedido, onRemove, onViewReceipt }) {
  if (pedido.payments.length === 0) {
    return <span className="pay-chip pay-chip-empty">Sin abonos todavía</span>;
  }
  return pedido.payments.map((payment) => (
    <span className="pay-chip" key={payment.id} title={payment.note ?? ''}>
      <strong>{formatCOP(payment.amount)}</strong>
      <span className="pay-chip-date">{formatDateOnly(payment.paid_at)}</span>
      {payment.receipt_url ? (
        <button type="button" className="pay-chip-link" onClick={() => onViewReceipt(payment)}>
          desprendible
        </button>
      ) : (
        <span className="pay-chip-muted">sin desprendible</span>
      )}
      {pedido.status !== 'cancelled' && (
        <button type="button" className="pay-chip-x" aria-label="Quitar abono" onClick={() => onRemove(payment)}>
          ×
        </button>
      )}
    </span>
  ));
}

export default function PedidoCard({
  pedido,
  onChanged,
  onAddPayment,
  onEdit,
  onStage,
  onViewReceipt,
  onCancelToggle,
  onRemove,
  onRemovePayment,
  busyStage
}) {
  const [copied, setCopied] = useState(false);
  const pct = pedido.sale_value > 0 ? Math.min(100, Math.round((pedido.paid_amount / pedido.sale_value) * 100)) : 100;
  const cancelled = pedido.status === 'cancelled';
  const stage = stageInfo(pedido.tracking_stage);
  const lastChange = pedido.tracking_history?.at?.(-1)?.at ?? pedido.updated_at;
  const wa = whatsappNumber(pedido.client_phone);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(trackingUrl(pedido.reference));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* sin portapapeles */
    }
  };

  return (
    <article className={`pedido-card is-${pedido.bucket}`}>
      <Photo pedido={pedido} onChanged={onChanged} />

      <div className="pedido-main">
        <div className="pedido-head">
          <span className="pedido-ref">{pedido.reference}</span>
          <span className={`badge ${BUCKET_BADGE[pedido.bucket]}`}>{BUCKET_LABEL[pedido.bucket]}</span>
          {!cancelled && (
            <span className="badge badge-stage">
              <StageIcon stage={pedido.tracking_stage} size={12} /> {stage?.short}
            </span>
          )}
        </div>
        <h3 className="pedido-title">
          {pedido.brand && <span className="pedido-brand">{pedido.brand}</span>}
          {pedido.product_ref}
        </h3>
        <div className="row-sub pedido-meta">
          <strong>{pedido.client_name}</strong>
          {wa && (
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
              {pedido.client_phone}
            </a>
          )}
          {pedido.client_city && <span>{pedido.client_city}</span>}
          <span>Pedido {formatDateOnly(pedido.ordered_at)}</span>
        </div>

        <div className="pedido-money">
          <div className="money-row">
            <span className="money-label">Valor venta</span>
            <strong className="money-total">{formatCOP(pedido.sale_value)}</strong>
          </div>
          <div className="money-bar" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
            <div className={`money-fill ${pct >= 100 ? 'is-full' : ''}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="money-row money-row-sub">
            <span>
              Abonado <strong>{formatCOP(pedido.paid_amount)}</strong> · {pct} %
            </span>
            {pedido.balance > 0 ? (
              <span className="money-balance">Faltan {formatCOP(pedido.balance)}</span>
            ) : (
              <span className="money-ok">Pagado completo ✓</span>
            )}
          </div>
          <div className="pay-chips">
            <PaymentChips pedido={pedido} onRemove={onRemovePayment} onViewReceipt={onViewReceipt} />
          </div>
        </div>

        {!cancelled && (
          <div className="pedido-tracking">
            <TrackingStepper stage={pedido.tracking_stage} onChange={(key) => onStage(pedido, key)} busy={busyStage} />
            <div className="row-sub pedido-tracking-meta">
              {stage?.label}
              {pedido.tracking_carrier || pedido.tracking_number
                ? ` · ${[pedido.tracking_carrier, pedido.tracking_number].filter(Boolean).join(' ')}`
                : ''}
              {lastChange ? ` · actualizado ${relativeTime(lastChange)}` : ''}
            </div>
          </div>
        )}

        {pedido.notes && <div className="row-sub pedido-notes">Nota: {pedido.notes}</div>}
      </div>

      <div className="pedido-actions">
        {!cancelled && pedido.balance > 0 && (
          <button className="btn btn-dark btn-sm" onClick={() => onAddPayment(pedido)}>
            Registrar abono
          </button>
        )}
        <a
          className="btn btn-ghost btn-sm"
          href={wa ? `https://wa.me/${wa}?text=${encodeURIComponent(shareMessage(pedido))}` : undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!wa}
        >
          Enviar guía por WhatsApp
        </a>
        <button className="btn btn-ghost btn-sm" onClick={copyLink}>
          {copied ? 'Enlace copiado ✓' : 'Copiar enlace de la guía'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onEdit(pedido)}>
          Editar
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onCancelToggle(pedido)}>
          {cancelled ? 'Reactivar' : 'Cancelar'}
        </button>
        <button className="btn btn-danger btn-sm" onClick={() => onRemove(pedido)}>
          Eliminar
        </button>
      </div>
    </article>
  );
}
