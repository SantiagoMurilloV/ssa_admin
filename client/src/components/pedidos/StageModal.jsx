import { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import { stageInfo } from '../../config/tracking.js';
import StageIcon from '../tracking/StageIcon.jsx';

// Al despachar al cliente se pide la transportadora y la guía (opcional): el
// cliente las ve en su página de seguimiento. Las demás etapas cambian directo.
export default function StageModal({ reference, stage, current, onConfirm, onClose }) {
  const [carrier, setCarrier] = useState(current?.tracking_carrier ?? '');
  const [trackingNumber, setTrackingNumber] = useState(current?.tracking_number ?? '');
  const [trackingUrl, setTrackingUrl] = useState(current?.tracking_url ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const info = stageInfo(stage);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = { stage };
    if (note.trim()) payload.note = note.trim();
    if (carrier.trim()) payload.carrier = carrier.trim();
    if (trackingNumber.trim()) payload.trackingNumber = trackingNumber.trim();
    if (trackingUrl.trim()) payload.trackingUrl = trackingUrl.trim();
    try {
      await onConfirm(payload);
    } catch (err) {
      setError(err.details?.[0]?.message ?? err.message ?? 'No se pudo cambiar la etapa');
      setBusy(false);
    }
  };

  return (
    <Modal title={`${info?.label ?? 'Cambiar etapa'} · ${reference}`} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <p className="muted stage-modal-lead">
          <span className="stage-modal-icon">
            <StageIcon stage={stage} size={16} />
          </span>
          {info?.description} Quien siga este código recibe el aviso al confirmar.
        </p>
        <div className="field-row">
          <div className="field">
            <label>Transportadora</label>
            <input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Servientrega, Interrapidísimo…" />
          </div>
          <div className="field">
            <label>Número de guía de la transportadora</label>
            <input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Link de rastreo de la transportadora (opcional)</label>
          <input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div className="field">
          <label>Nota para el cliente (opcional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Llega entre mañana y el jueves" maxLength={300} />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-dark" type="submit" disabled={busy}>
          {busy ? 'Guardando…' : 'Confirmar envío al cliente'}
        </button>
      </form>
    </Modal>
  );
}
