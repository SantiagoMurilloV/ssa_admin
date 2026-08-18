import { useState } from 'react';
import { productsApi } from '../../api/admin.api.js';
import { formatCOP } from '../../utils/format.js';

const MAX_OPTIONS = 3;

// "Bombshell · M": lo que ve el comprador y lo que queda congelado en el pedido
const labelFor = (combo) => Object.values(combo).join(' · ');

// Producto cartesiano de los valores: 2 aromas × 3 tallas = 6 variantes
const buildCombos = (options) =>
  options.reduce(
    (acc, option) =>
      acc.flatMap((combo) => option.values.map((value) => ({ ...combo, [option.name]: value }))),
    [{}]
  );

const comboKey = (combo) =>
  Object.keys(combo)
    .sort()
    .map((k) => `${k}=${combo[k]}`)
    .join('|');

export default function VariantsManager({ product, onChanged }) {
  // Los valores se editan como texto separado por comas: es como se piensan
  // ("S, M, L") y evita una UI de chips para algo que se escribe de una vez.
  const [draft, setDraft] = useState(() =>
    (product.options ?? []).map((option) => ({
      name: option.name,
      raw: (option.option_values ?? []).join(', ')
    }))
  );
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const variants = product.variants ?? [];
  const parsed = draft
    .map((row) => ({
      name: row.name.trim(),
      values: [...new Set(row.raw.split(',').map((v) => v.trim()).filter(Boolean))]
    }))
    .filter((row) => row.name && row.values.length > 0);

  const run = async (key, fn) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err.details?.[0]?.message ?? err.message ?? 'No se pudo guardar');
    } finally {
      setBusy(null);
    }
  };

  const saveOptions = () =>
    run('options', async () => {
      await productsApi.setOptions(product.id, parsed);
    });

  // Crea las combinaciones que falten y deja intactas las que ya existen, para
  // no perder el stock ya cargado al agregar un valor nuevo.
  const generate = () =>
    run('generate', async () => {
      await productsApi.setOptions(product.id, parsed);
      const existing = new Set(variants.map((v) => comboKey(v.options)));
      const missing = buildCombos(parsed).filter((combo) => !existing.has(comboKey(combo)));
      for (const combo of missing) {
        await productsApi.addVariant(product.id, {
          options: combo,
          label: labelFor(combo),
          stock: 0
        });
      }
      if (missing.length === 0) setError('No hay combinaciones nuevas por crear.');
    });

  const patchVariant = (variant, changes) =>
    run(`v${variant.id}`, async () => {
      await productsApi.updateVariant(product.id, variant.id, {
        options: variant.options,
        label: variant.label || labelFor(variant.options),
        sku: variant.sku,
        price: variant.price,
        stock: variant.stock,
        photoId: variant.photo_id,
        active: variant.active,
        ...changes
      });
    });

  const removeVariant = (variant) =>
    run(`v${variant.id}`, async () => {
      await productsApi.removeVariant(product.id, variant.id);
    });

  const totalStock = variants.reduce(
    (sum, v) => (v.stock === null ? sum : sum + v.stock),
    0
  );

  return (
    <div className="variants-box">
      <div className="variants-head">
        <strong>Opciones y variantes</strong>
        <span className="muted">
          {variants.length === 0
            ? 'sin variantes · el stock se lleva en el producto'
            : `${variants.length} variantes · ${totalStock} unidades en total`}
        </span>
      </div>

      <div className="option-rows">
        {draft.map((row, i) => (
          <div className="option-row" key={i}>
            <input
              placeholder="Aroma, Talla, Color…"
              value={row.name}
              onChange={(e) =>
                setDraft((d) => d.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))
              }
            />
            <input
              placeholder="Bombshell, Tease, Love (separados por coma)"
              value={row.raw}
              onChange={(e) =>
                setDraft((d) => d.map((r, j) => (j === i ? { ...r, raw: e.target.value } : r)))
              }
            />
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}
              aria-label="Quitar opción"
            >
              ×
            </button>
          </div>
        ))}
        {draft.length < MAX_OPTIONS && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setDraft((d) => [...d, { name: '', raw: '' }])}
          >
            + Agregar opción
          </button>
        )}
      </div>

      <div className="variants-actions">
        <button className="btn btn-dark btn-sm" onClick={generate} disabled={busy || parsed.length === 0}>
          {busy === 'generate' ? 'Generando…' : 'Generar variantes'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={saveOptions} disabled={busy}>
          {busy === 'options' ? 'Guardando…' : 'Guardar solo las opciones'}
        </button>
        {parsed.length > 0 && (
          <span className="muted">
            {buildCombos(parsed).length} combinaciones posibles
          </span>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {variants.length > 0 && (
        <div className="variant-table">
          <div className="variant-row variant-row-head">
            <span>Variante</span>
            <span>Unidades</span>
            <span>Precio</span>
            <span>Foto</span>
            <span />
          </div>
          {variants.map((variant) => (
            <div className={`variant-row ${variant.active ? '' : 'is-off'}`} key={variant.id}>
              <span className="variant-label">
                {variant.label || labelFor(variant.options)}
                {!variant.active && <em> · oculta</em>}
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={variant.stock ?? ''}
                placeholder="∞"
                disabled={busy === `v${variant.id}`}
                onChange={(e) =>
                  patchVariant(variant, {
                    stock: e.target.value === '' ? null : Number(e.target.value)
                  })
                }
              />
              <input
                type="number"
                min="0"
                step="1"
                value={variant.price ?? ''}
                placeholder={formatCOP(product.price)}
                disabled={busy === `v${variant.id}`}
                onChange={(e) =>
                  patchVariant(variant, {
                    price: e.target.value === '' ? null : Number(e.target.value)
                  })
                }
              />
              <select
                value={variant.photo_id ?? ''}
                disabled={busy === `v${variant.id}` || product.photos.length === 0}
                onChange={(e) =>
                  patchVariant(variant, {
                    photoId: e.target.value === '' ? null : Number(e.target.value)
                  })
                }
              >
                <option value="">—</option>
                {product.photos.map((photo, i) => (
                  <option key={photo.id} value={photo.id}>
                    {photo.media_type === 'video' ? 'Video' : 'Foto'} {i + 1}
                  </option>
                ))}
              </select>
              <span className="variant-row-actions">
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busy === `v${variant.id}`}
                  onClick={() => patchVariant(variant, { active: !variant.active })}
                >
                  {variant.active ? 'Ocultar' : 'Mostrar'}
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  disabled={busy === `v${variant.id}`}
                  onClick={() => removeVariant(variant)}
                >
                  Borrar
                </button>
              </span>
            </div>
          ))}
          <p className="muted" style={{ marginTop: 10 }}>
            Unidades vacío = sin límite. Precio vacío = usa el del producto
            ({formatCOP(product.price)}). Una variante en 0 desaparece de la tienda.
          </p>
        </div>
      )}
    </div>
  );
}
