import { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import { clientsApi } from '../../api/admin.api.js';

const EMPTY = { name: '', phone: '', email: '', city: '', department: '', address: '', notes: '' };

export default function ClientForm({ client, onSaved, onClose }) {
  const [form, setForm] = useState(() =>
    client
      ? {
          name: client.name ?? '',
          phone: client.phone ?? '',
          email: client.email ?? '',
          city: client.city ?? '',
          department: client.department ?? '',
          address: client.address ?? '',
          notes: client.notes ?? ''
        }
      : EMPTY
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = Object.fromEntries(
      Object.entries(form)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value !== '')
    );
    try {
      const { client: saved } = client ? await clientsApi.update(client.id, payload) : await clientsApi.create(payload);
      onSaved(saved);
    } catch (err) {
      setError(err.details?.[0]?.message ?? err.message ?? 'No se pudo guardar');
      setBusy(false);
    }
  };

  return (
    <Modal title={client ? `Editar · ${client.name}` : 'Nuevo cliente'} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <div className="field-row">
          <div className="field">
            <label>Nombre</label>
            <input value={form.name} onChange={set('name')} required minLength={2} maxLength={120} autoFocus />
          </div>
          <div className="field">
            <label>WhatsApp</label>
            <input type="tel" value={form.phone} onChange={set('phone')} required placeholder="300 123 4567" />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Ciudad</label>
            <input value={form.city} onChange={set('city')} placeholder="Armenia" />
          </div>
          <div className="field">
            <label>Departamento</label>
            <input value={form.department} onChange={set('department')} placeholder="Quindío" />
          </div>
        </div>
        <div className="field">
          <label>Dirección de entrega</label>
          <input value={form.address} onChange={set('address')} maxLength={200} />
        </div>
        <div className="field">
          <label>Correo</label>
          <input type="email" value={form.email} onChange={set('email')} />
        </div>
        <div className="field">
          <label>Notas</label>
          <textarea value={form.notes} onChange={set('notes')} rows={2} style={{ minHeight: 56 }} placeholder="Prefiere entregas en la tarde, referido por…" />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-dark" type="submit" disabled={busy}>
          {busy ? 'Guardando…' : client ? 'Guardar cambios' : 'Crear cliente'}
        </button>
      </form>
    </Modal>
  );
}
