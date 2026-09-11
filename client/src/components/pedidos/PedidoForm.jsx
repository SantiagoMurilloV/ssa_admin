import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import { pedidosApi, clientsApi } from '../../api/admin.api.js';
import { formatCOP, todayISO } from '../../utils/format.js';
import { phoneDigits } from '../../config/tracking.js';

const EMPTY = {
  brand: '',
  productRef: '',
  clientName: '',
  clientPhone: '',
  clientCity: '',
  clientEmail: '',
  orderedAt: todayISO(),
  saleValue: '',
  paidAmount: '',
  paidAt: todayISO(),
  paymentNote: '',
  notes: ''
};

const useObjectUrl = (file) => {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
};

// Busca clientes ya registrados mientras se escribe (nombre o teléfono)
function ClientPicker({ selected, onSelect, onClear, initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (selected) return undefined;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return undefined;
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      clientsApi
        .list(q)
        .then(({ clients }) => {
          setResults(clients.slice(0, 6));
          setOpen(true);
        })
        .catch(() => setResults([]));
    }, 220);
    return () => clearTimeout(timer.current);
  }, [query, selected]);

  if (selected) {
    return (
      <div className="client-selected">
        <span className="avatar avatar-sm" data-hue={selected.id % 3}>
          {selected.name.slice(0, 1).toUpperCase()}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row-title">{selected.name}</div>
          <div className="row-sub">
            {selected.phone}
            {selected.city ? ` · ${selected.city}` : ''}
            {selected.pedidos_count > 0 ? ` · ${selected.pedidos_count} encargo${selected.pedidos_count === 1 ? '' : 's'}` : ' · cliente nuevo en encargos'}
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="client-picker">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Busca un cliente por nombre o teléfono…"
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="client-picker-list" role="listbox">
          {results.map((client) => (
            <li key={client.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onSelect(client); setOpen(false); }}>
                <span className="avatar avatar-sm" data-hue={client.id % 3}>{client.name.slice(0, 1).toUpperCase()}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="row-title">{client.name}</span>
                  <span className="row-sub">
                    {client.phone}
                    {client.city ? ` · ${client.city}` : ''}
                  </span>
                </span>
                <span className="row-sub">{client.pedidos_count} enc.</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Crear un encargo (multipart con foto y desprendible) o editar uno existente
// (solo los datos; la foto y los abonos se manejan desde la tarjeta).
export default function PedidoForm({ pedido, initial, onSaved, onClose }) {
  const editing = Boolean(pedido);
  const [form, setForm] = useState(() =>
    pedido
      ? {
          ...EMPTY,
          brand: pedido.brand ?? '',
          productRef: pedido.product_ref ?? '',
          orderedAt: pedido.ordered_at ?? todayISO(),
          saleValue: String(pedido.sale_value ?? ''),
          notes: pedido.notes ?? ''
        }
      : { ...EMPTY, ...(initial ?? {}) }
  );
  const [client, setClient] = useState(null); // cliente existente elegido
  const [newClient, setNewClient] = useState(!pedido && Boolean(initial?.clientPhone));
  const [photo, setPhoto] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [hasPayment, setHasPayment] = useState(true);
  const [phoneHint, setPhoneHint] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const photoUrl = useObjectUrl(photo);
  const receiptUrl = useObjectUrl(receipt);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const saleValue = Number(form.saleValue);
  const paidAmount = hasPayment && form.paidAmount !== '' ? Number(form.paidAmount) : 0;
  const validSale = Number.isInteger(saleValue) && saleValue >= 0 && form.saleValue !== '';
  const balance = validSale ? Math.max(0, saleValue - (Number.isFinite(paidAmount) ? paidAmount : 0)) : null;
  const pct = validSale && saleValue > 0 ? Math.min(100, Math.round((paidAmount / saleValue) * 100)) : 0;
  const bucketPreview = !validSale ? null : balance > 0 ? 'Pago pendiente' : 'Pagados';

  // Si el teléfono escrito ya es de alguien, se avisa: el server lo reutiliza
  const checkPhone = async () => {
    const digits = phoneDigits(form.clientPhone);
    if (digits.length < 7) return setPhoneHint(null);
    try {
      const { clients } = await clientsApi.list(digits);
      const match = clients.find((c) => c.phone_digits === digits);
      setPhoneHint(match ? match : null);
    } catch {
      setPhoneHint(null);
    }
  };

  const clientLabel = useMemo(() => {
    if (client) return client.name;
    if (form.clientName.trim()) return form.clientName.trim();
    return null;
  }, [client, form.clientName]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.productRef.trim()) return setError('Escribe la referencia del producto');
    if (!validSale) return setError('El valor de la venta debe ser un entero en pesos');
    if (!editing) {
      if (!client && (!form.clientName.trim() || phoneDigits(form.clientPhone).length < 7)) {
        return setError('Elige un cliente existente o escribe nombre y teléfono del nuevo');
      }
      if (hasPayment && form.paidAmount !== '') {
        if (!Number.isInteger(paidAmount) || paidAmount < 0) return setError('El abono debe ser un entero en pesos');
        if (paidAmount > saleValue) return setError('El abono no puede ser mayor que el valor de la venta');
      }
      if (receipt && !(paidAmount > 0)) return setError('Adjuntaste un desprendible: escribe cuánto abonó');
    }
    setBusy(true);
    try {
      if (editing) {
        const payload = {
          brand: form.brand.trim(),
          productRef: form.productRef.trim(),
          orderedAt: form.orderedAt,
          saleValue,
          ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
          ...(client ? { clientId: client.id } : {})
        };
        const { pedido: saved } = await pedidosApi.update(pedido.id, payload);
        onSaved(saved);
        return;
      }
      const formData = new FormData();
      formData.append('brand', form.brand.trim());
      formData.append('productRef', form.productRef.trim());
      formData.append('orderedAt', form.orderedAt);
      formData.append('saleValue', String(saleValue));
      if (form.notes.trim()) formData.append('notes', form.notes.trim());
      if (client) formData.append('clientId', String(client.id));
      else {
        formData.append('clientName', form.clientName.trim());
        formData.append('clientPhone', form.clientPhone.trim());
        if (form.clientCity.trim()) formData.append('clientCity', form.clientCity.trim());
        if (form.clientEmail.trim()) formData.append('clientEmail', form.clientEmail.trim());
      }
      if (hasPayment && paidAmount > 0) {
        formData.append('paidAmount', String(paidAmount));
        formData.append('paidAt', form.paidAt || form.orderedAt);
        if (form.paymentNote.trim()) formData.append('paymentNote', form.paymentNote.trim());
        if (receipt) formData.append('receipt', receipt);
      }
      if (photo) formData.append('photo', photo);
      const { pedido: created } = await pedidosApi.create(formData);
      onSaved(created);
    } catch (err) {
      setError(err.details?.[0]?.message ?? err.message ?? 'No se pudo guardar el encargo');
      setBusy(false);
    }
  };

  return (
    <Modal title={editing ? `Editar · ${pedido.reference}` : 'Nuevo pedido'} onClose={onClose} wide>
      <form className="pedido-form" onSubmit={submit}>
        <div className="pedido-form-main form-stack">
          <fieldset className="form-section">
            <legend>Producto</legend>
            <div className="field-row">
              <div className="field">
                <label>Marca</label>
                <input value={form.brand} onChange={set('brand')} placeholder="Stanley, Apple, Nike…" maxLength={80} />
              </div>
              <div className="field">
                <label>Fecha del pedido</label>
                <input type="date" value={form.orderedAt} onChange={set('orderedAt')} required />
              </div>
            </div>
            <div className="field">
              <label>Referencia del producto</label>
              <textarea
                value={form.productRef}
                onChange={set('productRef')}
                placeholder="Modelo, color, talla, link…"
                rows={2}
                required
                minLength={2}
                maxLength={300}
                style={{ minHeight: 56 }}
              />
            </div>
            {!editing && (
              <div className="field">
                <label>Foto del producto</label>
                <label className="upload-label upload-label-preview">
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                  {photoUrl ? <img src={photoUrl} alt="Producto" /> : '+ Subir foto (se ve en la guía del cliente)'}
                  {photo && <span className="upload-name">{photo.name}</span>}
                </label>
              </div>
            )}
          </fieldset>

          <fieldset className="form-section">
            <legend>Cliente</legend>
            {editing ? (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  Actual: <strong>{pedido.client_name}</strong> · {pedido.client_phone}. Elige otro solo si el encargo quedó a nombre equivocado.
                </p>
                <ClientPicker selected={client} onSelect={setClient} onClear={() => setClient(null)} />
              </>
            ) : newClient ? (
              <>
                <div className="field-row">
                  <div className="field">
                    <label>Nombre</label>
                    <input value={form.clientName} onChange={set('clientName')} placeholder="Nombre y apellido" required minLength={2} />
                  </div>
                  <div className="field">
                    <label>WhatsApp</label>
                    <input type="tel" value={form.clientPhone} onChange={set('clientPhone')} onBlur={checkPhone} placeholder="300 123 4567" required />
                  </div>
                </div>
                {phoneHint && (
                  <p className="form-hint">
                    Ese teléfono ya es de <strong>{phoneHint.name}</strong>: el encargo quedará a su nombre.{' '}
                    <button type="button" className="link-btn" onClick={() => { setClient(phoneHint); setNewClient(false); }}>
                      Usar ese cliente
                    </button>
                  </p>
                )}
                <div className="field-row">
                  <div className="field">
                    <label>Ciudad (opcional)</label>
                    <input value={form.clientCity} onChange={set('clientCity')} placeholder="Armenia" />
                  </div>
                  <div className="field">
                    <label>Correo (opcional)</label>
                    <input type="email" value={form.clientEmail} onChange={set('clientEmail')} />
                  </div>
                </div>
                <button type="button" className="link-btn" onClick={() => setNewClient(false)}>
                  ← Buscar uno ya registrado
                </button>
              </>
            ) : (
              <>
                <ClientPicker selected={client} onSelect={setClient} onClear={() => setClient(null)} initialQuery={initial?.clientName ?? ''} />
                {!client && (
                  <button type="button" className="link-btn" onClick={() => setNewClient(true)}>
                    + Registrar un cliente nuevo
                  </button>
                )}
              </>
            )}
          </fieldset>

          <fieldset className="form-section">
            <legend>Venta y pago</legend>
            <div className="field">
              <label>Valor de la venta (COP)</label>
              <input type="number" min="0" step="1" value={form.saleValue} onChange={set('saleValue')} required placeholder="0" />
            </div>
            {!editing && (
              <>
                <label className="check-row">
                  <input type="checkbox" checked={hasPayment} onChange={(e) => setHasPayment(e.target.checked)} />
                  Ya abonó algo
                </label>
                {hasPayment && (
                  <div className="form-stack pay-block">
                    <div className="field-row">
                      <div className="field">
                        <label>Cuánto abonó (COP)</label>
                        <input type="number" min="0" step="1" value={form.paidAmount} onChange={set('paidAmount')} placeholder="0" />
                        <div className="quick-row">
                          <button
                            type="button"
                            className="chip chip-sm"
                            disabled={!validSale}
                            onClick={() => setForm((f) => ({ ...f, paidAmount: String(Math.round(saleValue / 2)) }))}
                          >
                            50 %
                          </button>
                          <button
                            type="button"
                            className="chip chip-sm"
                            disabled={!validSale}
                            onClick={() => setForm((f) => ({ ...f, paidAmount: String(saleValue) }))}
                          >
                            Pago completo
                          </button>
                        </div>
                      </div>
                      <div className="field">
                        <label>Fecha del abono</label>
                        <input type="date" value={form.paidAt} onChange={set('paidAt')} />
                      </div>
                    </div>
                    <div className="field">
                      <label>Desprendible del abono</label>
                      <label className="upload-label upload-label-preview">
                        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
                        {receiptUrl ? <img src={receiptUrl} alt="Desprendible" /> : '+ Adjuntar desprendible'}
                        {receipt && <span className="upload-name">{receipt.name}</span>}
                      </label>
                    </div>
                    <div className="field">
                      <label>Nota del pago (opcional)</label>
                      <input value={form.paymentNote} onChange={set('paymentNote')} placeholder="Nequi, Bancolombia, efectivo…" maxLength={300} />
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="field">
              <label>Notas internas (opcional)</label>
              <textarea value={form.notes} onChange={set('notes')} rows={2} style={{ minHeight: 56 }} maxLength={1000} />
            </div>
          </fieldset>

          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-dark" type="submit" disabled={busy}>
            {busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear pedido'}
          </button>
        </div>

        <aside className="pedido-form-side">
          <div className="pedido-preview">
            <div className={`pedido-preview-photo ${photoUrl || pedido?.photo_url ? '' : 'is-empty'}`}>
              {photoUrl || pedido?.photo_url ? (
                <img src={photoUrl ?? pedido.photo_url} alt="" />
              ) : (
                <span>{(form.brand || form.productRef || '?').slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className="pedido-preview-body">
              <span className="kpi-label">{editing ? pedido.reference : 'Resumen'}</span>
              <div className="pedido-preview-title">
                {form.brand.trim() && <span className="pedido-brand">{form.brand.trim()}</span>}
                {form.productRef.trim() || 'Producto por definir'}
              </div>
              <div className="row-sub">{clientLabel ?? 'Sin cliente todavía'}</div>
              <div className="money-bar" style={{ marginTop: 14 }}>
                <div className={`money-fill ${pct >= 100 ? 'is-full' : ''}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="pedido-preview-money">
                <div>
                  <span>Venta</span>
                  <strong>{validSale ? formatCOP(saleValue) : '—'}</strong>
                </div>
                <div>
                  <span>Abonado</span>
                  <strong>{validSale ? formatCOP(Number.isFinite(paidAmount) ? paidAmount : 0) : '—'}</strong>
                </div>
                <div>
                  <span>Falta</span>
                  <strong className={balance > 0 ? 'money-balance' : 'money-ok'}>
                    {balance === null ? '—' : balance > 0 ? formatCOP(balance) : 'Nada ✓'}
                  </strong>
                </div>
              </div>
              {!editing && bucketPreview && (
                <p className="muted pedido-preview-note">
                  Se creará en <strong>{bucketPreview}</strong>, con la guía en <strong>En Estados Unidos</strong>.
                </p>
              )}
            </div>
          </div>
        </aside>
      </form>
    </Modal>
  );
}
