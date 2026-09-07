import { useState } from 'react';
import { encargosApi, statsApi } from '../api/admin.api.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { formatDate } from '../utils/format.js';
import Modal from '../components/ui/Modal.jsx';

const STATUS_LABEL = { nuevo: 'Nuevo', contactado: 'Contactado', cerrado: 'Cerrado' };
const NEXT_STATUS = { nuevo: 'contactado', contactado: 'cerrado' };
const NEXT_LABEL = { nuevo: 'Marcar contactado', contactado: 'Cerrar encargo' };

export default function EncargosPage() {
  const [filter, setFilter] = useState('nuevo');
  const [photo, setPhoto] = useState(null);
  const [showSubscribers, setShowSubscribers] = useState(false);
  const { data, status, reload } = useApiResource(
    () => encargosApi.list(filter === 'all' ? undefined : filter),
    { pollMs: 30000, key: filter }
  );
  const subscribers = useApiResource(() => statsApi.subscribers());

  const [actionError, setActionError] = useState(null);

  const advance = async (encargo) => {
    setActionError(null);
    try {
      await encargosApi.updateStatus(encargo.id, NEXT_STATUS[encargo.status]);
      reload({ silent: true });
    } catch (err) {
      setActionError(`No se pudo actualizar el encargo: ${err.message}`);
    }
  };

  const counts = data?.counts ?? { nuevo: 0, contactado: 0, cerrado: 0 };
  const filters = [
    ['nuevo', `Nuevos (${counts.nuevo})`],
    ['contactado', `Contactados (${counts.contactado})`],
    ['cerrado', `Cerrados (${counts.cerrado})`],
    ['all', 'Todos']
  ];

  return (
    <>
      <h1 className="page-title">Encargos <em>cotizaciones a pedido</em></h1>
      <div className="filter-row">
        {filters.map(([key, label]) => (
          <button key={key} className={`chip ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
        <button
          className="chip"
          style={{ marginLeft: 'auto' }}
          onClick={() => setShowSubscribers(true)}
        >
          Suscriptores ({subscribers.data?.subscribers?.length ?? 0})
        </button>
      </div>

      {actionError && <p className="form-error" style={{ marginBottom: 12 }}>{actionError}</p>}
      {status === 'loading' && <p className="muted">Cargando encargos…</p>}
      {status === 'ready' && (data?.encargos ?? []).length === 0 && (
        <p className="muted">No hay encargos aquí.</p>
      )}
      {status === 'ready' && (data?.encargos ?? []).map((encargo) => (
        <article className="row-card" key={encargo.id}>
          {encargo.photo_url && (
            <img
              src={encargo.photo_url}
              alt="Referencia"
              style={{ width: 54, height: 66, objectFit: 'cover', borderRadius: 10, cursor: 'pointer' }}
              onClick={() => setPhoto(encargo)}
            />
          )}
          <div className="row-main">
            <div className="row-title">{encargo.producto}</div>
            <div className="row-sub">
              {[encargo.marca, encargo.color, encargo.talla].filter(Boolean).join(' · ') || 'Sin especificaciones'}
            </div>
            <div className="row-sub">
              {encargo.nombre} · {encargo.contacto} · {formatDate(encargo.created_at)}
            </div>
          </div>
          <div className="row-actions">
            <span className={`badge ${encargo.status === 'nuevo' ? 'badge-pending' : encargo.status === 'contactado' ? 'badge-paid' : 'badge-off'}`}>
              {STATUS_LABEL[encargo.status]}
            </span>
            <a
              className="btn btn-ghost btn-sm"
              href={`https://wa.me/${encargo.contacto.replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
            {NEXT_STATUS[encargo.status] && (
              <button className="btn btn-dark btn-sm" onClick={() => advance(encargo)}>
                {NEXT_LABEL[encargo.status]}
              </button>
            )}
          </div>
        </article>
      ))}

      {photo && (
        <Modal title={`Referencia · ${photo.producto}`} onClose={() => setPhoto(null)}>
          <img className="receipt-img" src={photo.photo_url} alt="Foto de referencia" />
        </Modal>
      )}
      {showSubscribers && (
        <Modal title="Suscriptores del newsletter" onClose={() => setShowSubscribers(false)}>
          {(subscribers.data?.subscribers ?? []).length === 0 && (
            <p className="muted">Aún no hay suscriptores.</p>
          )}
          {(subscribers.data?.subscribers ?? []).map((sub) => (
            <div className="row-card" key={sub.id}>
              <div className="row-main">
                <span className="row-title">{sub.email}</span>
                <div className="row-sub">{formatDate(sub.created_at)}</div>
              </div>
            </div>
          ))}
        </Modal>
      )}
    </>
  );
}
