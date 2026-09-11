import { useEffect, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import { pedidosApi } from '../../api/admin.api.js';
import { formatCOP, todayISO } from '../../utils/format.js';

export default function PaymentModal({ pedido, onSaved, onClose }) {
  const [amount, setAmount] = useState(String(pedido.balance));
  const [paidAt, setPaidAt] = useState(todayISO());
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const value = Number(amount);
  const remaining = Math.max(0, pedido.balance - (Number.isFinite(value) ? value : 0));

  const submit = async (e) => {
    e.preventDefault();
    if (!Number.isInteger(value) || value <= 0) return setError('Escribe el monto en pesos, sin decimales');
    if (value > pedido.balance) return setError(`El abono supera lo que falta (${formatCOP(pedido.balance)})`);
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('amount', String(value));
      formData.append('paidAt', paidAt);
      if (note.trim()) formData.append('note', note.trim());
      if (file) formData.append('image', file);
      const { pedido: updated } = await pedidosApi.addPayment(pedido.id, formData);
      onSaved(updated);
    } catch (err) {
      setError(err.details?.[0]?.message ?? err.message ?? 'No se pudo registrar el abono');
      setBusy(false);
    }
  };

  return (
    <Modal title={`Registrar abono · ${pedido.reference}`} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <div className="pay-summary">
          <div>
            <span className="kpi-label">Venta</span>
            <strong>{formatCOP(pedido.sale_value)}</strong>
          </div>
          <div>
            <span className="kpi-label">Abonado</span>
            <strong>{formatCOP(pedido.paid_amount)}</strong>
          </div>
          <div>
            <span className="kpi-label">Falta</span>
            <strong className="money-balance">{formatCOP(pedido.balance)}</strong>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Monto del abono (COP)</label>
            <input type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
            <div className="quick-row">
              <button type="button" className="chip chip-sm" onClick={() => setAmount(String(Math.round(pedido.sale_value / 2)))}>
                50 % de la venta
              </button>
              <button type="button" className="chip chip-sm" onClick={() => setAmount(String(pedido.balance))}>
                Todo lo que falta
              </button>
            </div>
          </div>
          <div className="field">
            <label>Fecha del pago</label>
            <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label>Desprendible (foto o captura)</label>
          <label className="upload-label upload-label-preview">
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {preview ? <img src={preview} alt="Desprendible" /> : '+ Adjuntar desprendible'}
            {file && <span className="upload-name">{file.name}</span>}
          </label>
        </div>
        <div className="field">
          <label>Nota (opcional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nequi, Bancolombia, efectivo…" maxLength={300} />
        </div>
        <p className="muted">
          Después de este abono {remaining > 0 ? <>faltarían <strong>{formatCOP(remaining)}</strong></> : <strong className="form-ok">el pedido queda pagado completo</strong>}.
        </p>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-dark" type="submit" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar abono'}
        </button>
      </form>
    </Modal>
  );
}
