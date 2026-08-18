import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Estos tests borran productos y pedidos, así que NO corren contra la base de
// desarrollo: hay que apuntarlos a una base desechable a propósito.
//
//   createdb ssa_stock_test
//   STOCK_TEST_DATABASE_URL=postgres://localhost:5432/ssa_stock_test npm test
//
// El inventario es la única parte del server cuya lógica vive en SQL (row locks,
// CHECK, transacciones), y es donde una regresión silenciosa cuesta plata:
// sobrevender la última unidad o perder stock en un pedido cancelado.
const testDatabaseUrl = process.env.STOCK_TEST_DATABASE_URL;
const skip = testDatabaseUrl
  ? false
  : 'define STOCK_TEST_DATABASE_URL con una base desechable para correrlos';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, '../src/db/migrations');

let pool;
let query;
let ProductModel;
let InsufficientStockError;
let OrderModel;

const BASE_ORDER = {
  customerName: 'Test',
  phone: '+57 3000000000',
  email: 'test@example.com',
  department: 'Cundinamarca',
  city: 'Bogotá',
  address: 'Calle 1 # 2-3',
  notes: null,
  paymentChannel: 'Nequi',
  quantity: 1,
  subtotal: 1000,
  shippingFee: 0,
  total: 1000
};

const item = (productId, quantity) => [
  { productId, productName: productId, unitPrice: 1000, quantity }
];

const stockOf = async (id) =>
  (await query('SELECT stock FROM products WHERE id = $1', [id])).rows[0].stock;

const countOrders = async () =>
  (await query('SELECT COUNT(*)::int AS n FROM orders')).rows[0].n;

const makeProduct = (id, stock) =>
  ProductModel.create({
    id,
    name: id,
    detail: '',
    description: '',
    category: 'Test',
    price: 1000,
    inStock: true,
    stock,
    featured: false,
    active: true
  });

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET ??= 'stock-test-secret';
  ({ pool, query } = await import('../src/db/pool.js'));
  ({ ProductModel, InsufficientStockError } = await import('../src/models/product.model.js'));
  ({ OrderModel } = await import('../src/models/order.model.js'));

  // Esquema desde cero: así el test también comprueba que las migraciones
  // aplican en orden sobre una base vacía.
  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  for (const file of [
    '001_init.sql',
    '002_receipt_token.sql',
    '003_product_stock.sql',
    '004_product_variants.sql'
  ]) {
    await query(await readFile(path.join(migrationsDir, file), 'utf8'));
  }
});

after(async () => {
  if (!skip) await pool.end();
});

const reset = async () => {
  await query('DELETE FROM orders'); // order_items cae por ON DELETE CASCADE
  await query('DELETE FROM products');
};

test('crear el pedido descuenta el inventario', { skip }, async () => {
  await reset();
  await makeProduct('limitado', 2);
  await OrderModel.create(BASE_ORDER, item('limitado', 1));
  assert.equal(await stockOf('limitado'), 1);
});

test('stock NULL es sin límite y no se descuenta', { skip }, async () => {
  await reset();
  await makeProduct('ilimitado', null);
  await OrderModel.create(BASE_ORDER, item('ilimitado', 5));
  assert.equal(await stockOf('ilimitado'), null);
});

test('pedir más de lo que hay no deja pedido a medias ni descuenta', { skip }, async () => {
  await reset();
  await makeProduct('limitado', 1);
  const before = await countOrders();
  await assert.rejects(
    () => OrderModel.create(BASE_ORDER, item('limitado', 5)),
    (error) => {
      assert.ok(error instanceof InsufficientStockError);
      assert.equal(error.shortages[0].available, 1);
      assert.equal(error.shortages[0].requested, 5);
      return true;
    }
  );
  assert.equal(await countOrders(), before);
  assert.equal(await stockOf('limitado'), 1);
});

test('cancelar devuelve las unidades, y solo una vez', { skip }, async () => {
  await reset();
  await makeProduct('limitado', 2);
  const order = await OrderModel.create(BASE_ORDER, item('limitado', 1));
  assert.equal(await stockOf('limitado'), 1);

  await OrderModel.updateStatus(order.id, { status: 'cancelled' });
  assert.equal(await stockOf('limitado'), 2);

  // Cancelar un pedido ya cancelado no puede inventar inventario
  await OrderModel.updateStatus(order.id, { status: 'cancelled' });
  assert.equal(await stockOf('limitado'), 2);
});

test('cancelar no marca el pago como verificado', { skip }, async () => {
  await reset();
  await makeProduct('limitado', 1);
  const order = await OrderModel.create(BASE_ORDER, item('limitado', 1));
  const cancelled = await OrderModel.updateStatus(order.id, { status: 'cancelled' });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.payment_status, 'awaiting_receipt');
  assert.equal(cancelled.paid_at, null);
});

test('reactivar un pedido cancelado vuelve a retener el inventario', { skip }, async () => {
  await reset();
  await makeProduct('limitado', 2);
  const order = await OrderModel.create(BASE_ORDER, item('limitado', 1));
  await OrderModel.updateStatus(order.id, { status: 'cancelled' });
  await OrderModel.updateStatus(order.id, { status: 'pending' });
  assert.equal(await stockOf('limitado'), 1);
});

test('reactivar sin stock falla y el pedido sigue cancelado', { skip }, async () => {
  await reset();
  await makeProduct('limitado', 1);
  const order = await OrderModel.create(BASE_ORDER, item('limitado', 1));
  await OrderModel.updateStatus(order.id, { status: 'cancelled' }); // stock 1
  await OrderModel.create(BASE_ORDER, item('limitado', 1)); // otro se lo lleva: stock 0

  await assert.rejects(
    () => OrderModel.updateStatus(order.id, { status: 'pending' }),
    (error) => error instanceof InsufficientStockError
  );
  const { rows } = await query('SELECT status FROM orders WHERE id = $1', [order.id]);
  assert.equal(rows[0].status, 'cancelled');
  assert.equal(await stockOf('limitado'), 0);
});

test('dos pedidos simultáneos por la última unidad: solo uno gana', { skip }, async () => {
  await reset();
  await makeProduct('limitado', 1);
  const results = await Promise.allSettled([
    OrderModel.create(BASE_ORDER, item('limitado', 1)),
    OrderModel.create(BASE_ORDER, item('limitado', 1))
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.find((r) => r.status === 'rejected');
  assert.ok(rejected.reason instanceof InsufficientStockError);
  assert.equal(await stockOf('limitado'), 0);
});

test('la base rechaza stock negativo aunque se escriba a mano', { skip }, async () => {
  await reset();
  await makeProduct('limitado', 0);
  await assert.rejects(() => query('UPDATE products SET stock = -1 WHERE id = $1', ['limitado']));
});

// ── Variantes ───────────────────────────────────────────────────────────────
// El inventario por variante es el punto del diseño: con stock a nivel producto
// se podría despachar un aroma agotado porque "al producto le quedan unidades".

const makeVariant = (productId, options, stock) =>
  ProductModel.addVariant(productId, {
    options,
    label: Object.values(options).join(' · '),
    stock
  });

const variantItem = (productId, variant, quantity) => [
  {
    productId,
    variantId: variant.id,
    productName: productId,
    variantLabel: variant.label,
    unitPrice: 1000,
    quantity
  }
];

test('comprar una variante no toca el stock de las otras', { skip }, async () => {
  await reset();
  await makeProduct('perfume', null);
  const a = await makeVariant('perfume', { Aroma: 'Bombshell' }, 2);
  const b = await makeVariant('perfume', { Aroma: 'Tease' }, 2);

  await OrderModel.create(BASE_ORDER, variantItem('perfume', a, 1));

  const after = await ProductModel.listVariants('perfume');
  assert.equal(after.find((v) => v.id === a.id).stock, 1);
  assert.equal(after.find((v) => v.id === b.id).stock, 2, 'la otra variante no se toca');
});

test('una variante agotada no se puede vender aunque otras tengan stock', { skip }, async () => {
  await reset();
  await makeProduct('perfume', null);
  const agotada = await makeVariant('perfume', { Aroma: 'Tease' }, 0);
  await makeVariant('perfume', { Aroma: 'Bombshell' }, 10);

  await assert.rejects(
    () => OrderModel.create(BASE_ORDER, variantItem('perfume', agotada, 1)),
    (error) => {
      assert.ok(error instanceof InsufficientStockError);
      assert.equal(error.shortages[0].available, 0);
      // el mensaje identifica la variante, no solo el producto
      assert.match(error.shortages[0].productName, /Tease/);
      return true;
    }
  );
});

test('cancelar devuelve las unidades a la variante correcta', { skip }, async () => {
  await reset();
  await makeProduct('perfume', null);
  const a = await makeVariant('perfume', { Aroma: 'Bombshell' }, 1);
  const b = await makeVariant('perfume', { Aroma: 'Tease' }, 1);
  const order = await OrderModel.create(BASE_ORDER, variantItem('perfume', a, 1));

  let now = await ProductModel.listVariants('perfume');
  assert.equal(now.find((v) => v.id === a.id).stock, 0);

  await OrderModel.updateStatus(order.id, { status: 'cancelled' });
  now = await ProductModel.listVariants('perfume');
  assert.equal(now.find((v) => v.id === a.id).stock, 1, 'vuelve a la que se vendió');
  assert.equal(now.find((v) => v.id === b.id).stock, 1, 'la otra queda igual');
});

test('la carrera por la última unidad de una variante la gana uno solo', { skip }, async () => {
  await reset();
  await makeProduct('perfume', null);
  const v = await makeVariant('perfume', { Aroma: 'Bombshell' }, 1);
  const results = await Promise.allSettled([
    OrderModel.create(BASE_ORDER, variantItem('perfume', v, 1)),
    OrderModel.create(BASE_ORDER, variantItem('perfume', v, 1))
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const [after] = await ProductModel.listVariants('perfume');
  assert.equal(after.stock, 0);
});

test('un producto sin variantes sigue descontando de products.stock', { skip }, async () => {
  await reset();
  await makeProduct('simple', 3);
  await OrderModel.create(BASE_ORDER, item('simple', 2));
  assert.equal(await stockOf('simple'), 1);
});

test('no puede haber dos variantes con la misma combinación', { skip }, async () => {
  await reset();
  await makeProduct('perfume', null);
  await makeVariant('perfume', { Aroma: 'Tease' }, 1);
  await assert.rejects(() => makeVariant('perfume', { Aroma: 'Tease' }, 5));
});

test('borrar el producto se lleva sus opciones y variantes', { skip }, async () => {
  await reset();
  await makeProduct('perfume', null);
  await ProductModel.replaceOptions('perfume', [{ name: 'Aroma', values: ['Tease', 'Bombshell'] }]);
  await makeVariant('perfume', { Aroma: 'Tease' }, 1);
  await ProductModel.remove('perfume');
  assert.equal((await ProductModel.listVariants('perfume')).length, 0);
  const { rows } = await query('SELECT 1 FROM product_options WHERE product_id = $1', ['perfume']);
  assert.equal(rows.length, 0);
});
