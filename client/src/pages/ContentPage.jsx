import { useEffect, useState } from 'react';
import { contentApi } from '../api/admin.api.js';

// Descripción declarativa de las secciones editables del sitio.
// type: text | textarea | string-list (una por línea)
const SECTIONS = [
  {
    key: 'hero',
    title: 'Hero (portada)',
    fields: [
      { path: 'badge', label: 'Insignia', type: 'text' },
      { path: 'titleLines', label: 'Título (una línea por renglón)', type: 'string-list' },
      { path: 'lead', label: 'Texto de apoyo', type: 'textarea' },
      { path: 'ctaPrimary', label: 'Botón principal', type: 'text' },
      { path: 'ctaSecondary', label: 'Botón secundario', type: 'text' }
    ]
  },
  {
    key: 'quienesSomos',
    title: 'Quiénes somos',
    images: true,
    fields: [
      { path: 'eyebrow', label: 'Antetítulo', type: 'text' },
      { path: 'title', label: 'Título', type: 'text' },
      { path: 'highlight', label: 'Resaltado en cursiva', type: 'text' },
      { path: 'body1', label: 'Párrafo 1', type: 'textarea' },
      { path: 'body2', label: 'Párrafo 2', type: 'textarea' },
      { path: 'photoLabel', label: 'Etiqueta del placeholder de foto', type: 'text' }
    ]
  },
  {
    key: 'destacados',
    title: 'Destacados',
    fields: [
      { path: 'title', label: 'Título', type: 'text' },
      { path: 'subtitle', label: 'Subtítulo en cursiva', type: 'text' },
      { path: 'ctaCatalogo', label: 'Link al catálogo', type: 'text' }
    ]
  },
  {
    key: 'catalogo',
    title: 'Página de catálogo',
    fields: [
      { path: 'title', label: 'Título', type: 'text' },
      { path: 'lead', label: 'Texto de apoyo', type: 'textarea' }
    ]
  },
  {
    key: 'encargos',
    title: 'Encargos',
    fields: [
      { path: 'eyebrow', label: 'Antetítulo', type: 'text' },
      { path: 'titleLine1', label: 'Título línea 1', type: 'text' },
      { path: 'titleLine2', label: 'Título línea 2 (cursiva)', type: 'text' },
      { path: 'body', label: 'Texto', type: 'textarea' },
      { path: 'pasos', label: 'Pasos (uno por línea)', type: 'string-list' },
      { path: 'footnote', label: 'Nota inferior', type: 'text' },
      { path: 'success', label: 'Mensaje al enviar', type: 'text' }
    ]
  },
  {
    key: 'newsletter',
    title: 'Newsletter',
    fields: [
      { path: 'title', label: 'Título', type: 'text' },
      { path: 'body', label: 'Texto', type: 'textarea' },
      { path: 'success', label: 'Mensaje al suscribirse', type: 'text' }
    ]
  },
  {
    key: 'checkout',
    title: 'Checkout y gracias',
    fields: [
      { path: 'transferTitle', label: 'Título del paso de pago', type: 'text' },
      { path: 'transferInstructions', label: 'Instrucciones de transferencia', type: 'textarea' },
      { path: 'receiptNote', label: 'Nota sobre el comprobante', type: 'textarea' },
      { path: 'preventaNote', label: 'Nota de preventa (carrito)', type: 'text' },
      { path: 'thanksTitle', label: 'Título de la página de gracias', type: 'text' },
      { path: 'thanksBody', label: 'Texto de la página de gracias', type: 'textarea' }
    ]
  },
  {
    key: 'footer',
    title: 'Footer y contacto',
    fields: [
      { path: 'description', label: 'Descripción de la marca', type: 'textarea' },
      { path: 'legalLine', label: 'Línea legal', type: 'text' },
      { path: 'paymentsNote', label: 'Nota de pagos', type: 'text' },
      { path: 'instagram', label: 'URL Instagram', type: 'text' },
      { path: 'tiktok', label: 'URL TikTok', type: 'text' },
      { path: 'whatsapp', label: 'WhatsApp (ej: 573001234567)', type: 'text' }
    ]
  }
];

const LAYOUT_LABELS = {
  quienesSomos: 'Quiénes somos',
  destacados: 'Destacados',
  encargos: 'Encargos',
  newsletter: 'Newsletter'
};

function Field({ field, value, onChange }) {
  if (field.type === 'textarea') {
    return <textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
  if (field.type === 'string-list') {
    return (
      <textarea
        value={(value ?? []).join('\n')}
        onChange={(e) => onChange(e.target.value.split('\n'))}
      />
    );
  }
  return <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
}

function SectionImages({ section, images, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    const formData = new FormData();
    formData.append('image', file);
    try {
      await contentApi.addImage(section, formData);
      onChanged();
    } catch (err) {
      setError(err.message ?? 'No se pudo subir la imagen');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (publicId) => {
    await contentApi.removeImage(section, publicId).catch(() => {});
    onChanged();
  };

  return (
    <div className="field">
      <label>Imágenes de la sección</label>
      <div className="photo-grid">
        {(images ?? []).map((img) => (
          <div className="photo-thumb" key={img.publicId}>
            <img src={img.url} alt={img.label ?? ''} />
            <button onClick={() => remove(img.publicId)} aria-label="Eliminar imagen">×</button>
          </div>
        ))}
        <label className="upload-label" style={{ height: 106 }}>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} />
          {busy ? 'Subiendo…' : '+ Imagen'}
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

export default function ContentPage() {
  const [content, setContent] = useState(null);
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    contentApi
      .get()
      .then(({ content }) => setContent(content))
      .catch(() => setLoadError('No se pudo cargar el contenido'));
  }, []);

  // Tras subir o borrar una imagen solo se refresca el mapa de imágenes: el
  // resto del formulario puede tener texto sin guardar.
  const reloadImages = () =>
    contentApi
      .get()
      .then(({ content: fresh }) => setContent((current) => ({ ...current, images: fresh.images })))
      .catch(() => setError('No se pudieron recargar las imágenes'));

  if (loadError) return <p className="form-error">{loadError}</p>;
  if (!content) return <p className="muted">Cargando contenido…</p>;

  const setSectionField = (sectionKey, path, value) =>
    setContent((c) => ({ ...c, [sectionKey]: { ...c[sectionKey], [path]: value } }));

  // Solo se refresca la parte que se acaba de guardar. Reemplazar todo el
  // documento con la respuesta borraría lo que el admin tenga a medio escribir
  // en otras secciones del formulario.
  const saveSection = async (sectionKey) => {
    setSaving(sectionKey);
    setSaved(null);
    setError(null);
    try {
      const { content: next } = await contentApi.update({ [sectionKey]: content[sectionKey] });
      setContent((current) => ({ ...current, [sectionKey]: next[sectionKey] }));
      setSaved(sectionKey);
      setTimeout(() => setSaved(null), 2500);
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar');
    } finally {
      setSaving(null);
    }
  };

  const saveLayout = async (sections) => {
    setError(null);
    try {
      const { content: next } = await contentApi.update({ layout: { sections } });
      setContent((current) => ({ ...current, layout: next.layout }));
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar el orden de las secciones');
    }
  };

  const toggleLayout = (key) =>
    saveLayout(
      content.layout.sections.map((s) => (s.key === key ? { ...s, visible: !s.visible } : s))
    );

  const moveLayout = (index, dir) => {
    const sections = [...content.layout.sections];
    const target = index + dir;
    if (target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    return saveLayout(sections);
  };

  return (
    <>
      <h1 className="page-title">Contenido del sitio</h1>
      {error && <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>}

      <section className="panel">
        <h2>Orden y visibilidad de secciones</h2>
        <p className="muted">El hero siempre va primero. Los cambios se ven en la tienda en ~10 segundos.</p>
        <div className="spacer" />
        {content.layout.sections.map((section, index) => (
          <div className="row-card" key={section.key}>
            <div className="row-main">
              <span className="row-title">{LAYOUT_LABELS[section.key] ?? section.key}</span>
            </div>
            <div className="row-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => moveLayout(index, -1)} disabled={index === 0}>↑</button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => moveLayout(index, 1)}
                disabled={index === content.layout.sections.length - 1}
              >
                ↓
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => toggleLayout(section.key)}>
                {section.visible ? 'Ocultar' : 'Mostrar'}
              </button>
              {!section.visible && <span className="badge badge-off">Oculta</span>}
            </div>
          </div>
        ))}
      </section>

      {SECTIONS.map((section) => (
        <section className="panel" key={section.key}>
          <h2>{section.title}</h2>
          <div className="form-stack">
            {section.fields.map((field) => (
              <div className="field" key={field.path}>
                <label>{field.label}</label>
                <Field
                  field={field}
                  value={content[section.key]?.[field.path]}
                  onChange={(value) => setSectionField(section.key, field.path, value)}
                />
              </div>
            ))}
            {section.images && (
              <SectionImages
                section={section.key}
                images={content.images?.[section.key]}
                onChanged={reloadImages}
              />
            )}
            <div className="row-actions">
              <button
                className="btn btn-dark btn-sm"
                onClick={() => saveSection(section.key)}
                disabled={saving === section.key}
              >
                {saving === section.key ? 'Guardando…' : 'Guardar sección'}
              </button>
              {saved === section.key && <span className="form-ok">Guardado ✓</span>}
            </div>
          </div>
        </section>
      ))}
    </>
  );
}
