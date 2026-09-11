import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clientsApi } from '../api/admin.api.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { formatCOP, initials, relativeTime } from '../utils/format.js';
import { whatsappNumber } from '../config/tracking.js';
import ClientForm from '../components/clients/ClientForm.jsx';
import ClientHistoryModal from '../components/clients/ClientHistoryModal.jsx';

export default function ClientsPage() {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | client
  const [history, setHistory] = useState(null);
  const [actionError, setActionError] = useState(null);
  const navigate = useNavigate();
  const { data, status, error, reload } = useApiResource(() => clientsApi.list(search.trim()), {
    pollMs: 30000,
    key: search.trim()
  });

  const remove = async (client) => {
    if (!window.confirm(`¿Eliminar a ${client.name} de la agenda?`)) return;
    setActionError(null);
    try {
      await clientsApi.remove(client.id);
      reload({ silent: true });
    } catch (err) {
      setActionError(err.message);
    }
  };

  // Nuevo pedido con este cliente ya elegido
  const newPedido = (client) =>
    navigate('/pedidos', {
      state: { newPedido: { clientName: client.name, clientPhone: client.phone, clientCity: client.city ?? '' } }
    });

  const clients = data?.clients ?? [];

  return (
    <>
      <h1 className="page-title">
        Clientes <em>{clients.length} en la agenda</em>
      </h1>
      <div className="filter-row">
        <button className="btn btn-dark" onClick={() => setEditing('new')}>
          + Nuevo cliente
        </button>
        <input
          className="filter-search"
          placeholder="Buscar por nombre, teléfono, ciudad o correo"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {actionError && <p className="form-error" style={{ marginBottom: 12 }}>{actionError}</p>}
      {status === 'loading' && <p className="muted">Cargando clientes…</p>}
      {status === 'error' && <p className="form-error">No se pudieron cargar los clientes: {error?.message}</p>}
      {status === 'ready' && clients.length === 0 && (
        <div className="empty-state">
          <p className="muted">
            {search.trim()
              ? 'Ningún cliente coincide con la búsqueda.'
              : 'Aún no hay clientes. Se crean solos al registrar un pedido, o aquí con “+ Nuevo cliente”.'}
          </p>
        </div>
      )}

      {status === 'ready' && (
        <div className="client-grid">
          {clients.map((client) => {
            const wa = whatsappNumber(client.phone);
            const pending = client.pedidos_total - client.pedidos_paid;
            return (
              <article className="client-card" key={client.id}>
                <div className="client-card-head">
                  <span className="avatar" data-hue={client.id % 3}>
                    {initials(client.name)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row-title client-name">{client.name}</div>
                    <div className="row-sub">
                      {wa ? (
                        <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
                          {client.phone}
                        </a>
                      ) : (
                        client.phone
                      )}
                      {client.city ? ` · ${client.city}` : ''}
                    </div>
                  </div>
                </div>
                <div className="client-stats">
                  <div>
                    <span className="kpi-label">Encargos</span>
                    <strong>{client.pedidos_count}</strong>
                  </div>
                  <div>
                    <span className="kpi-label">Tienda</span>
                    <strong>{client.orders_count}</strong>
                  </div>
                  <div>
                    <span className="kpi-label">Comprado</span>
                    <strong>{formatCOP(client.pedidos_total + client.orders_total)}</strong>
                  </div>
                  <div>
                    <span className="kpi-label">Debe</span>
                    <strong className={pending > 0 ? 'money-balance' : 'money-ok'}>{pending > 0 ? formatCOP(pending) : '—'}</strong>
                  </div>
                </div>
                <div className="row-sub client-last">
                  {client.last_purchase_at ? `Última compra ${relativeTime(client.last_purchase_at)}` : 'Sin compras todavía'}
                  {client.pedidos_pending > 0 ? ` · ${client.pedidos_pending} con saldo pendiente` : ''}
                </div>
                <div className="row-actions client-actions">
                  <button className="btn btn-dark btn-sm" onClick={() => setHistory(client)}>
                    Historial
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => newPedido(client)}>
                    Nuevo pedido
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(client)}>
                    Editar
                  </button>
                  {client.pedidos_count === 0 && (
                    <button className="btn btn-danger btn-sm" onClick={() => remove(client)}>
                      Eliminar
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <ClientForm
          client={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload({ silent: true });
          }}
        />
      )}
      {history && <ClientHistoryModal client={history} onClose={() => setHistory(null)} />}
    </>
  );
}
