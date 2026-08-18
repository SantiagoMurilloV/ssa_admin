import { useState } from 'react';
import { productsApi } from '../api/admin.api.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { formatCOP } from '../utils/format.js';
import Modal from '../components/ui/Modal.jsx';
import VariantsManager from '../components/products/VariantsManager.jsx';

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
  const [progress, setProgress] = useState(null); // { done, total }
  const [error, setError] = useState(null);
  const busy = progress !== null;

  // Se avisa antes de subir: un archivo enorme fallaría con un error opaco de
  // plataforma en vez del mensaje del API.
  const MAX_IMAGE_MB = 5;
  const MAX_VIDEO_MB = 20;

  // Se suben de a uno: el API recibe un archivo por request, y en serie el
  // orden de llegada es el orden en que quedan en la galería.
  const upload = async (e) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    const tooBig = files.filter((file) => {
      const limit = file.type.startsWith('video/') ? MAX_VIDEO_MB : MAX_IMAGE_MB;
      return file.size > limit * 1024 * 1024;
    });
    const ok = files.filter((file) => !tooBig.includes(file));

    setError(
      tooBig.length === 0
        ? null
        : `Se omitieron ${tooBig.length} archivo(s) por tamaño: ${tooBig
            .map((f) => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`)
            .join(', ')}. Máximo ${MAX_IMAGE_MB} MB en imágenes y ${MAX_VIDEO_MB} MB en videos.`
    );
    if (ok.length === 0) return;

    setProgress({ done: 0, total: ok.length });
    const failed = [];
    for (const [i, file] of ok.entries()) {
      const formData = new FormData();
      formData.append('image', file);
      try {
        await productsApi.addPhoto(product.id, formData);
      } catch (err) {
        failed.push(`${file.name}: ${err.message ?? 'error'}`);
      }
      setProgress({ done: i + 1, total: ok.length });
    }
    setProgress(null);
    // Un recargo al final, no uno por archivo
    onChanged();
    if (failed.length > 0) {
      setError((prev) => [prev, `No se pudieron subir: ${failed.join(' · ')}`].filter(Boolean).join(' '));
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
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
            onChange={upload}
            disabled={busy}
          />
          {busy ? `Subiendo ${progress.done}/${progress.total}…` : '+ Fotos / videos'}
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

// Con opciones manda el inventario de las variantes; sin ellas, el del producto
const isSoldOut = (product) => {
  const variants = product.variants ?? [];
  if (variants.length > 0) {
    return variants.every((v) => v.active === false || (v.stock !== null && v.stock <= 0));
  }
  return product.stock === 0;
};

function ProductBadges({ product }) {
  return (
    <>
      <span className={`badge ${product.in_stock ? 'badge-stock' : 'badge-preventa'}`}>
        {product.in_stock ? 'En stock' : 'Preventa'}
      </span>
      {isSoldOut(product) && <span className="badge badge-off">Agotado</span>}
      {product.featured && <span className="badge badge-pending">Destacado</span>}
      {!product.active && <span className="badge badge-off">Oculto</span>}
    </>
  );
}

function ProductActions({ product, expanded, onTogglePhotos, onEdit, onRemove }) {
  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={onTogglePhotos}>
        {expanded ? 'Cerrar' : 'Medios y variantes'} ({product.photos.length}
        {(product.variants ?? []).length > 0 ? ` · ${product.variants.length}v` : ''})
      </button>
      <button className="btn btn-ghost btn-sm" onClick={onEdit}>Editar</button>
      <button className="btn btn-danger btn-sm" onClick={onRemove}>Eliminar</button>
    </>
  );
}

const stockLabel = (product) => {
  const variants = product.variants ?? [];
  // Con variantes el inventario del producto no se usa: manda la suma de ellas
  if (variants.length > 0) {
    const total = variants.reduce((sum, v) => (v.stock === null ? sum : sum + v.stock), 0);
    return `${variants.length} variantes · ${total} unidades`;
  }
  return product.stock === null
    ? 'unidades sin límite'
    : `${product.stock} ${product.stock === 1 ? 'unidad' : 'unidades'}`;
};

const productMeta = (product) =>
  [product.category, formatCOP(product.price), stockLabel(product)].join(' · ');

function ProductThumb({ product, className }) {
  const media = product.photos[0];
  if (!media) return <div className={`${className} is-empty`}>sin medios</div>;
  return media.media_type === 'video' ? (
    <video className={className} src={media.url} muted playsInline preload="metadata" />
  ) : (
    <img className={className} src={media.url} alt="" />
  );
}

const VIEW_KEY = 'ssa-admin-products-view';

export default function ProductsPage() {
  const { data, status, reload } = useApiResource(() => productsApi.list());
  const [editing, setEditing] = useState(null); // null | 'new' | product
  const [expanded, setExpanded] = useState(null);
  const [actionError, setActionError] = useState(null);
  // La preferencia sobrevive al reload: si elegiste tarjetas, no vuelve a lista
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) ?? 'list');

  const changeView = (next) => {
    setView(next);
    localStorage.setItem(VIEW_KEY, next);
  };

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
        <div className="view-toggle" role="group" aria-label="Forma de ver los productos">
          <button
            className={view === 'list' ? 'active' : ''}
            onClick={() => changeView('list')}
            aria-pressed={view === 'list'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
            Lista
          </button>
          <button
            className={view === 'grid' ? 'active' : ''}
            onClick={() => changeView('grid')}
            aria-pressed={view === 'grid'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
              <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
              <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
              <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
            </svg>
            Tarjetas
          </button>
        </div>
      </div>

      {actionError && <p className="form-error" style={{ marginBottom: 12 }}>{actionError}</p>}
      {status === 'loading' && <p className="muted">Cargando productos…</p>}
      {status === 'ready' && products.length === 0 && (
        <p className="muted">Todavía no hay productos. Crea el primero con “+ Nuevo producto”.</p>
      )}

      {view === 'list' &&
        products.map((product) => (
          <article className="row-card" key={product.id}>
            <ProductThumb product={product} className="row-thumb" />
            <div className="row-main">
              <div className="row-title">{product.name}</div>
              <div className="row-sub">
                {productMeta(product)} · {product.detail || 'sin detalle'}
              </div>
            </div>
            <div className="row-actions">
              <ProductBadges product={product} />
              <ProductActions
                product={product}
                expanded={expanded === product.id}
                onTogglePhotos={() => setExpanded(expanded === product.id ? null : product.id)}
                onEdit={() => setEditing(product)}
                onRemove={() => remove(product)}
              />
            </div>
            {expanded === product.id && (
              <div className="expanded-panel">
                <PhotoManager product={product} onChanged={() => reload({ silent: true })} />
                <VariantsManager product={product} onChanged={() => reload({ silent: true })} />
              </div>
            )}
          </article>
        ))}

      {view === 'grid' && (
        <div className="product-grid">
          {products.map((product) => (
            <article className="product-card" key={product.id}>
              <div className="product-card-media">
                <ProductThumb product={product} className="product-card-thumb" />
                {product.photos.length > 1 && (
                  <span className="media-count">{product.photos.length}</span>
                )}
              </div>
              <div className="product-card-body">
                <div className="product-card-badges">
                  <ProductBadges product={product} />
                </div>
                <div className="row-title">{product.name}</div>
                <div className="row-sub">{productMeta(product)}</div>
                {product.detail && <div className="row-sub">{product.detail}</div>}
                <div className="product-card-actions">
                  <ProductActions
                    product={product}
                    expanded={expanded === product.id}
                    onTogglePhotos={() => setExpanded(expanded === product.id ? null : product.id)}
                    onEdit={() => setEditing(product)}
                    onRemove={() => remove(product)}
                  />
                </div>
                {expanded === product.id && (
                  <div className="expanded-panel">
                    <PhotoManager product={product} onChanged={() => reload({ silent: true })} />
                    <VariantsManager product={product} onChanged={() => reload({ silent: true })} />
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

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
