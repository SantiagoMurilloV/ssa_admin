import { useState } from 'react';
import { productsApi } from '../api/admin.api.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { formatCOP } from '../utils/format.js';
import Modal from '../components/ui/Modal.jsx';

const EMPTY_FORM = {
  name: '',
  detail: '',
  description: '',
  category: 'General',
  price: '',
  stock: '',
  inStock: true,
  featured: false,
  active: true
};

function ProductForm({ product, onSaved, onClose }) {
  const [form, setForm] = useState(
    product
      ? {
          name: product.name,
          detail: product.detail,
          description: product.description,
          category: product.category,
          price: String(product.price),
          stock: product.stock === null ? '' : String(product.stock),
          inStock: product.in_stock,
          featured: product.featured,
          active: product.active
        }
      : EMPTY_FORM
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      detail: form.detail.trim(),
      description: form.description.trim(),
      category: form.category.trim() || 'General',
      price: Number(form.price),
      // vacío = sin límite de unidades
      stock: form.stock.trim() === '' ? null : Number(form.stock),
      inStock: form.inStock,
      featured: form.featured,
      active: form.active
    };
    try {
      if (!Number.isInteger(payload.price) || payload.price < 0) {
        throw new Error('El precio debe ser un número entero en pesos');
      }
      if (payload.stock !== null && (!Number.isInteger(payload.stock) || payload.stock < 0)) {
        throw new Error('Las unidades deben ser un número entero (o vacío para ilimitado)');
      }
      if (product) await productsApi.update(product.id, payload);
      else await productsApi.create(payload);
      onSaved();
    } catch (err) {
      setError(err.details?.[0]?.message ?? err.message ?? 'No se pudo guardar');
      setBusy(false);
    }
  };

  return (
    <Modal title={product ? `Editar · ${product.name}` : 'Nuevo producto'} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <div className="field">
          <label>Nombre</label>
          <input value={form.name} onChange={set('name')} required minLength={2} />
        </div>
        <div className="field">
          <label>Detalle corto (se ve en la tarjeta)</label>
          <input value={form.detail} onChange={set('detail')} placeholder="Color, tamaño, origen…" />
        </div>
        <div className="field">
          <label>Descripción</label>
          <textarea value={form.description} onChange={set('description')} />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Categoría</label>
            <input value={form.category} onChange={set('category')} placeholder="Tecnología, Belleza…" />
          </div>
          <div className="field">
            <label>Precio (COP)</label>
            <input type="number" min="0" step="1" value={form.price} onChange={set('price')} required />
          </div>
        </div>
        <div className="field">
          <label>Unidades disponibles</label>
          <input
            type="number"
            min="0"
            step="1"
            value={form.stock}
            onChange={set('stock')}
            placeholder="Vacío = sin límite"
          />
          <small className="muted">
            Se descuenta al crear cada pedido. En 0 el producto desaparece de la tienda; cancelar un
            pedido devuelve sus unidades.
          </small>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={form.inStock} onChange={set('inStock')} />
          En stock (si no: preventa · 15 días hábiles)
        </label>
        <label className="check-row">
          <input type="checkbox" checked={form.featured} onChange={set('featured')} />
          Destacado de la semana (aparece en el home)
        </label>
        <label className="check-row">
          <input type="checkbox" checked={form.active} onChange={set('active')} />
          Visible en la tienda
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-dark" type="submit" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar producto'}
        </button>
      </form>
    </Modal>
  );
}

function PhotoManager({ product, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Se avisa antes de subir: un archivo enorme fallaría con un error opaco de
  // plataforma en vez del mensaje del API.
  const MAX_IMAGE_MB = 5;
  const MAX_VIDEO_MB = 20;

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const limitMb = isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB;
    if (file.size > limitMb * 1024 * 1024) {
      setError(
        `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. ` +
          `El máximo para ${isVideo ? 'videos' : 'imágenes'} es ${limitMb} MB.`
      );
      return;
    }
    setBusy(true);
    setError(null);
    const formData = new FormData();
    formData.append('image', file);
    try {
      await productsApi.addPhoto(product.id, formData);
      onChanged();
    } catch (err) {
      setError(err.message ?? 'No se pudo subir');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (photoId) => {
    await productsApi.removePhoto(product.id, photoId).catch(() => {});
    onChanged();
  };

  return (
    <div style={{ width: '100%' }}>
      <div className="photo-grid">
        {product.photos.map((photo) => (
          <div className="photo-thumb" key={photo.id}>
            {photo.media_type === 'video' ? (
              <video src={photo.url} muted playsInline preload="metadata" />
            ) : (
              <img src={photo.url} alt={photo.label ?? product.name} />
            )}
            <button onClick={() => remove(photo.id)} aria-label="Eliminar foto">×</button>
          </div>
        ))}
        <label className="upload-label" style={{ height: 106 }}>
          <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" onChange={upload} />
          {busy ? 'Subiendo…' : '+ Foto / video'}
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

export default function ProductsPage() {
  const { data, status, reload } = useApiResource(() => productsApi.list());
  const [editing, setEditing] = useState(null); // null | 'new' | product
  const [expanded, setExpanded] = useState(null);
  const [actionError, setActionError] = useState(null);

  const remove = async (product) => {
    if (!window.confirm(`¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`)) return;
    setActionError(null);
    try {
      await productsApi.remove(product.id);
      reload({ silent: true });
    } catch (err) {
      setActionError(`No se pudo eliminar "${product.name}": ${err.message}`);
    }
  };

  const products = data?.products ?? [];

  return (
    <>
      <h1 className="page-title">Productos <em>{products.length} referencias</em></h1>
      <div className="filter-row">
        <button className="btn btn-dark" onClick={() => setEditing('new')}>+ Nuevo producto</button>
      </div>

      {actionError && <p className="form-error" style={{ marginBottom: 12 }}>{actionError}</p>}
      {status === 'loading' && <p className="muted">Cargando productos…</p>}
      {products.map((product) => (
        <article className="row-card" key={product.id}>
          {product.photos[0] && product.photos[0].media_type === 'image' && (
            <img
              src={product.photos[0].url}
              alt=""
              style={{ width: 54, height: 66, objectFit: 'cover', borderRadius: 10 }}
            />
          )}
          <div className="row-main">
            <div className="row-title">{product.name}</div>
            <div className="row-sub">
              {product.category} · {formatCOP(product.price)} ·{' '}
              {product.stock === null
                ? 'unidades sin límite'
                : `${product.stock} ${product.stock === 1 ? 'unidad' : 'unidades'}`}{' '}
              · {product.detail || 'sin detalle'}
            </div>
          </div>
          <div className="row-actions">
            <span className={`badge ${product.in_stock ? 'badge-stock' : 'badge-preventa'}`}>
              {product.in_stock ? 'En stock' : 'Preventa'}
            </span>
            {product.stock === 0 && <span className="badge badge-off">Agotado</span>}
            {product.featured && <span className="badge badge-pending">Destacado</span>}
            {!product.active && <span className="badge badge-off">Oculto</span>}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setExpanded(expanded === product.id ? null : product.id)}
            >
              Fotos ({product.photos.length})
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(product)}>Editar</button>
            <button className="btn btn-danger btn-sm" onClick={() => remove(product)}>Eliminar</button>
          </div>
          {expanded === product.id && (
            <PhotoManager product={product} onChanged={() => reload({ silent: true })} />
          )}
        </article>
      ))}

      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload({ silent: true });
          }}
        />
      )}
    </>
  );
}
