import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SITE_CONTENT,
  LAYOUT_SECTION_KEYS,
  deepMergeContent,
  mergeSiteContent,
  normalizeLayout
} from '../src/config/default-site-content.js';

test('mergeSiteContent completa lo que falta con los defaults', () => {
  const merged = mergeSiteContent({ hero: { badge: 'Nuevo badge' } });
  assert.equal(merged.hero.badge, 'Nuevo badge');
  // el resto del hero sobrevive
  assert.deepEqual(merged.hero.titleLines, DEFAULT_SITE_CONTENT.hero.titleLines);
  // y las otras secciones también
  assert.equal(merged.newsletter.title, DEFAULT_SITE_CONTENT.newsletter.title);
});

test('mergeSiteContent reemplaza arrays enteros, no los fusiona', () => {
  const merged = mergeSiteContent({ hero: { titleLines: ['Una sola línea'] } });
  assert.deepEqual(merged.hero.titleLines, ['Una sola línea']);
});

test('guardar una sección no borra otra', () => {
  const stored = { hero: { badge: 'A' }, newsletter: { title: 'B' } };
  const merged = mergeSiteContent(stored);
  assert.equal(merged.hero.badge, 'A');
  assert.equal(merged.newsletter.title, 'B');
});

test('normalizeLayout descarta claves desconocidas y deduplica', () => {
  const layout = normalizeLayout({
    sections: [
      { key: 'encargos', visible: false },
      { key: 'encargos', visible: true }, // duplicado: se ignora
      { key: 'seccion-inventada', visible: true } // desconocida: fuera
    ]
  });
  assert.equal(layout.sections[0].key, 'encargos');
  assert.equal(layout.sections[0].visible, false);
  // las que faltan se agregan visibles al final
  assert.equal(layout.sections.length, LAYOUT_SECTION_KEYS.length);
  assert.deepEqual(
    [...layout.sections.map((s) => s.key)].sort(),
    [...LAYOUT_SECTION_KEYS].sort()
  );
});

test('normalizeLayout preserva el orden elegido en el admin', () => {
  const layout = normalizeLayout({
    sections: [{ key: 'newsletter' }, { key: 'destacados' }]
  });
  assert.equal(layout.sections[0].key, 'newsletter');
  assert.equal(layout.sections[1].key, 'destacados');
});

test('mergeSiteContent solo acepta imágenes con url', () => {
  const merged = mergeSiteContent({
    images: {
      quienesSomos: [
        { publicId: 'a', url: 'https://x/a.jpg' },
        { publicId: 'b' }, // sin url: fuera
        null
      ],
      seccionInventada: [{ publicId: 'z', url: 'https://x/z.jpg' }]
    }
  });
  assert.equal(merged.images.quienesSomos.length, 1);
  assert.equal(merged.images.quienesSomos[0].publicId, 'a');
  assert.equal('seccionInventada' in merged.images, false);
});

test('mergeSiteContent nunca deja el layout sin normalizar', () => {
  const merged = mergeSiteContent({ layout: 'basura' });
  assert.equal(merged.layout.sections.length, LAYOUT_SECTION_KEYS.length);
});

test('deepMergeContent conserva los campos que el patch no menciona', () => {
  // Este es el caso que antes revertía textos a los defaults: guardar un solo
  // campo de una sección no debe borrar el resto de lo que el admin escribió.
  const stored = { hero: { badge: 'A', titleLines: ['Mío'], lead: 'Mi lead' } };
  const merged = deepMergeContent(stored, { hero: { badge: 'B' } });
  assert.equal(merged.hero.badge, 'B');
  assert.deepEqual(merged.hero.titleLines, ['Mío']);
  assert.equal(merged.hero.lead, 'Mi lead');
});

test('deepMergeContent no fusiona arrays', () => {
  const merged = deepMergeContent({ a: [1, 2, 3] }, { a: [9] });
  assert.deepEqual(merged.a, [9]);
});

test('deepMergeContent ignora un patch que no es objeto', () => {
  const stored = { hero: { badge: 'A' } };
  assert.deepEqual(deepMergeContent(stored, null), stored);
  assert.deepEqual(deepMergeContent(stored, 'basura'), stored);
});
