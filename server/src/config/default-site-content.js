// Documento de contenido del sitio. Se guarda como JSON en settings['site_content'];
// el admin edita secciones sueltas y mergeSiteContent completa lo que falte con estos defaults.
// ESPEJO de ssa_store/server/src/config/default-site-content.js — si cambias uno, cambia el otro.
export const LAYOUT_SECTION_KEYS = ['quienesSomos', 'destacados', 'encargos', 'newsletter'];
export const IMAGE_SECTIONS = ['quienesSomos'];

export const DEFAULT_SITE_CONTENT = {
  hero: {
    badge: 'EE. UU. → Colombia',
    titleLines: ['Tus favoritos de EE. UU.', 'más cerca de ti'],
    lead: 'Compramos por ti en EE. UU. y te lo entregamos en tu puerta: original y sin vueltas.',
    ctaPrimary: 'Ver catálogo',
    ctaSecondary: 'Quiénes somos'
  },
  quienesSomos: {
    eyebrow: 'Quiénes somos',
    title: 'Compramos directo',
    highlight: 'en EE. UU.',
    body1:
      'Compramos directo en tiendas oficiales de Estados Unidos: lanzamientos, básicos de farmacia y esas referencias que aquí llegan al doble. Todo original, con factura.',
    body2: 'Cada referencia tiene pocas unidades: si algo te gusta, apártalo.',
    photoLabel: 'foto editorial · bodega SSA, Miami'
  },
  destacados: {
    title: 'Destacados',
    subtitle: 'de la semana',
    ctaCatalogo: 'Ver todo el catálogo →'
  },
  catalogo: {
    title: 'Catálogo',
    lead: 'Productos originales comprados en EE. UU. Lo que está en stock sale de inmediato; la preventa llega en máximo 15 días hábiles.'
  },
  encargos: {
    eyebrow: 'Encargos a pedido',
    titleLine1: '¿No lo ves en el catálogo?',
    titleLine2: 'Escríbenos qué quieres traer.',
    body: 'Cuéntanos qué quieres y te lo hacemos llegar a tu puerta. Así funciona:',
    pasos: [
      'Nos envías la referencia del producto con tus datos.',
      'Te cotizamos por WhatsApp en menos de 24 horas: precio final, sin sorpresas.',
      'Confirmas y te llega en máximo 15 días hábiles.'
    ],
    footnote: 'EE. UU. → COLOMBIA · COTIZACIÓN EN MENOS DE 24 H',
    success: 'Recibido. Te cotizamos por WhatsApp en menos de 24 horas.'
  },
  newsletter: {
    title: 'Entérate de lo nuevo antes que nadie',
    body: 'Déjanos tu correo y te avisamos cuando lleguen productos nuevos.',
    success: 'Listo. Te escribimos cuando llegue lo nuevo.'
  },
  checkout: {
    transferTitle: 'Paga por transferencia',
    transferInstructions:
      'Transfiere el total a uno de estos canales y sube la foto del comprobante. Verificamos tu pago y confirmamos tu pedido.',
    receiptNote: 'Si no puedes subir el comprobante ahora, envíanoslo por WhatsApp con tu referencia.',
    preventaNote: 'Preventa llega en máximo 15 días hábiles',
    thanksTitle: '¡Gracias por tu pedido!',
    thanksBody:
      'Estamos verificando tu pago. Te confirmamos por WhatsApp apenas quede listo y te avisamos cuando salga el envío.'
  },
  footer: {
    description: 'Curaduría de productos importados directo de EE. UU. Bogotá, Colombia.',
    legalLine: '© 2026 SSA Import',
    paymentsNote: 'Pagos: transferencia · Nequi · Bancolombia',
    instagram: '',
    tiktok: '',
    whatsapp: ''
  },
  layout: {
    sections: LAYOUT_SECTION_KEYS.map((key) => ({ key, visible: true }))
  },
  images: {
    quienesSomos: []
  }
};

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const deepMergeContent = (base, patch) => {
  if (!isPlainObject(patch)) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(base?.[key])) {
      out[key] = deepMergeContent(base[key], value);
    } else if (value !== undefined) {
      // arrays y primitivos se reemplazan enteros
      out[key] = value;
    }
  }
  return out;
};

export const normalizeLayout = (layout) => {
  const incoming = Array.isArray(layout?.sections) ? layout.sections : [];
  const seen = new Set();
  const sections = [];
  for (const entry of incoming) {
    const key = entry?.key;
    if (!LAYOUT_SECTION_KEYS.includes(key) || seen.has(key)) continue;
    seen.add(key);
    sections.push({ key, visible: entry.visible !== false });
  }
  for (const key of LAYOUT_SECTION_KEYS) {
    if (!seen.has(key)) sections.push({ key, visible: true });
  }
  return { sections };
};

export const mergeSiteContent = (stored) => {
  const merged = deepMergeContent(DEFAULT_SITE_CONTENT, stored ?? {});
  merged.layout = normalizeLayout(merged.layout);
  const images = {};
  for (const section of IMAGE_SECTIONS) {
    const list = stored?.images?.[section];
    images[section] = Array.isArray(list)
      ? list.filter((img) => img && typeof img.url === 'string')
      : [];
  }
  merged.images = images;
  return merged;
};
