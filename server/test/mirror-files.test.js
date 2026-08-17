import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// La tienda vive en su propio repo y duplica a mano algunos archivos de aquí.
// Si se desincronizan, el comprador ve un precio o un envío distinto al que
// cobra el server. Estos tests avisan antes de que eso pase.
// Se omiten si el repo de la tienda no está al lado (por ejemplo, en CI del admin solo).
const here = path.dirname(fileURLToPath(import.meta.url));
const STORE_ROOT = path.resolve(here, '../../../ssa_store');
const storePresent = existsSync(STORE_ROOT);

const readBoth = async (adminRelative, storeRelative) => [
  await readFile(path.resolve(here, '..', adminRelative), 'utf8'),
  await readFile(path.join(STORE_ROOT, storeRelative), 'utf8')
];

test('default-site-content.js está sincronizado con la tienda', { skip: !storePresent }, async () => {
  const [admin, store] = await readBoth(
    'src/config/default-site-content.js',
    'server/src/config/default-site-content.js'
  );
  // el encabezado del comentario apunta al otro repo en cada copia: se ignora
  const body = (source) => source.slice(source.indexOf('export const LAYOUT_SECTION_KEYS'));
  assert.equal(
    body(admin),
    body(store),
    'default-site-content.js difiere entre ssa_admin y ssa_store'
  );
});

test('el schema del pedido es el mismo en ambos lados', { skip: !storePresent }, async () => {
  const [admin, store] = await readBoth(
    'src/schemas/public.schemas.js',
    'server/src/schemas/order.schema.js'
  );
  const extractOrderSchema = (source) => {
    const start = source.indexOf('export const createOrderSchema');
    assert.notEqual(start, -1, 'no se encontró createOrderSchema');
    const end = source.indexOf('export const', start + 1);
    return source
      .slice(start, end === -1 ? undefined : end)
      .replace(/\/\/.*$/gm, '') // los comentarios sí pueden diferir
      .replace(/\s+/g, ' ')
      .trim();
  };
  assert.equal(
    extractOrderSchema(admin),
    extractOrderSchema(store),
    'createOrderSchema difiere: la tienda validaría distinto al server'
  );
});

test('la regla de envío es idéntica en la tienda', { skip: !storePresent }, async () => {
  const [, store] = await readBoth(
    'src/config/shipping-config.js',
    'client/src/utils/shipping.js'
  );
  const { normalizeCityName, resolveShippingFee } = await import(
    '../src/config/shipping-config.js'
  );
  // el cliente reimplementa la regla: comprobamos que el archivo la conserva
  assert.match(store, /normalize\('NFD'\)/);
  assert.match(store, /\\u0300-\\u036f/);
  assert.match(store, /config\.defaultFee/);

  // y que ambas implementaciones coincidan en los casos que importan
  const config = { defaultFee: 15000, cities: [{ name: 'Bogotá', fee: 10000 }] };
  const storeModule = await import(path.join(STORE_ROOT, 'client/src/utils/shipping.js'));
  for (const city of ['Bogotá', 'bogota', ' BOGOTA ', 'Leticia', 'Medellín', '']) {
    assert.equal(
      storeModule.resolveShippingFee(city, config),
      resolveShippingFee(city, config),
      `la tarifa de "${city}" difiere entre tienda y server`
    );
    assert.equal(storeModule.normalizeCityName(city), normalizeCityName(city));
  }
});

test('el prefijo de referencia coincide con el que valida la tienda', { skip: !storePresent }, async () => {
  const { ORDER_REFERENCE_PATTERN, generateOrderReference } = await import(
    '../src/utils/order-reference.js'
  );
  const reference = generateOrderReference();
  assert.match(reference, ORDER_REFERENCE_PATTERN);

  const receipt = await readFile(path.join(STORE_ROOT, 'api/receipt.js'), 'utf8');
  const pattern = receipt.match(/REFERENCE_PATTERN = (\/.+\/)/)?.[1];
  assert.equal(pattern, String(ORDER_REFERENCE_PATTERN), 'el patrón de referencia difiere');
  assert.match(reference, new RegExp(pattern.slice(1, -1)));
});
