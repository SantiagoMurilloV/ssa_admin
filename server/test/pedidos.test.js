import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Igual que stock.test.js: necesitan una base DESECHABLE porque recrean el esquema.
//   STOCK_TEST_DATABASE_URL=postgres://localhost:5432/ssa_stock_test npm test
// Los dos archivos comparten la base, por eso npm test corre con
// --test-concurrency=1: en paralelo se pisarían el esquema.
const testDatabaseUrl = process.env.STOCK_TEST_DATABASE_URL;
const skip = testDatabaseUrl
  ? false
  : 'define STOCK_TEST_DATABASE_URL con una base desechable para correrlos';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, '../src/db/migrations');

let pool;
let query;
let ClientModel;
let PedidoModel;
let TrackingModel;
let OrderModel;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET ??= 'pedidos-test-secret';
  ({ pool, query } = await import('../src/db/pool.js'));
  ({ ClientModel } = await import('../src/models/client.model.js'));
  ({ PedidoModel } = await import('../src/models/pedido.model.js'));
  ({ TrackingModel } = await import('../src/models/tracking.model.js'));
  ({ OrderModel } = await import('../src/models/order.model.js'));

  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) await query(await readFile(path.join(migrationsDir, file), 'utf8'));
});

after(async () => {
  if (pool) await pool.end();
});

const SUBSCRIPTION = {
  endpoint: 'https://push.example.com/sub/1',
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' }
};

test('el mismo teléfono escrito distinto es el mismo cliente', { skip }, async () => {
  const first = await ClientModel.upsertByPhone({ name: 'Valentina Ruiz', phone: '+57 300 555 0101', city: 'Armenia' });
  const again = await ClientModel.upsertByPhone({ name: 'Vale', phone: '3005550101', email: 'vale@example.com' });
  assert.equal(again.id, first.id);
  assert.equal(again.name, 'Valentina Ruiz', 'el nombre guardado no se pisa');
  assert.equal(again.city, 'Armenia');
  assert.equal(again.email, 'vale@example.com', 'los datos que faltaban se completan');
  await assert.rejects(
    ClientModel.create({ name: 'Otra', phone: '300-555-0101' }),
    (error) => error.code === '23505',
    'crear otro cliente con el mismo teléfono viola el UNIQUE'
  );
});

test('un encargo con abono del 50 % queda en pago pendiente y muestra cuánto falta', { skip }, async () => {
  const client = await ClientModel.findByPhone('300 555 0101');
  const pedido = await PedidoModel.create({
    clientId: client.id,
    brand: 'Stanley',
    productRef: 'Quencher 40 oz',
    saleValue: 200000,
    payment: { amount: 100000, note: 'Abono 50 %' }
  });
  assert.match(pedido.reference, /^SSA-\d{6}$/);
  assert.equal(pedido.paid_amount, 100000);
  assert.equal(pedido.balance, 100000);
  assert.equal(pedido.bucket, 'pending');
  assert.equal(pedido.tracking_stage, 'usa');
  assert.equal(pedido.tracking_history.length, 1, 'la creación deja la primera etapa en el historial');
  assert.equal(pedido.payments.length, 1);
  assert.equal(pedido.client_name, 'Valentina Ruiz');

  const paid = await PedidoModel.addPayment(pedido.id, { amount: 100000 });
  assert.equal(paid.balance, 0);
  assert.equal(paid.bucket, 'paid');

  const counts = await PedidoModel.counts();
  assert.equal(counts.paid, 1);
  assert.equal(counts.pending, 0);
});

test('cambiar la etapa deja historial solo si cambió, y entregado mueve la pestaña', { skip }, async () => {
  const [pedido] = await PedidoModel.list();
  const toWarehouse = await PedidoModel.setTrackingStage(pedido.id, { stage: 'warehouse' });
  assert.equal(toWarehouse.previousStage, 'usa');
  assert.equal(toWarehouse.pedido.tracking_history.length, 2);

  const repeat = await PedidoModel.setTrackingStage(pedido.id, { stage: 'warehouse', note: 'otra vez' });
  assert.equal(repeat.previousStage, 'warehouse');
  assert.equal(repeat.pedido.tracking_history.length, 2, 'repetir la misma etapa no duplica');

  const dispatched = await PedidoModel.setTrackingStage(pedido.id, {
    stage: 'dispatched',
    carrier: 'Servientrega',
    trackingNumber: '9900112233'
  });
  assert.equal(dispatched.pedido.tracking_carrier, 'Servientrega');

  const delivered = await PedidoModel.setTrackingStage(pedido.id, { stage: 'delivered' });
  assert.equal(delivered.pedido.bucket, 'delivered');
  assert.equal((await PedidoModel.counts()).delivered, 1);
});

test('la guía pública encuentra encargos y pedidos de la tienda y no filtra datos privados', { skip }, async () => {
  const [pedido] = await PedidoModel.list();
  const tracking = await TrackingModel.findByReference(pedido.reference);
  assert.equal(tracking.kind, 'pedido');
  assert.equal(tracking.stage, 'delivered');
  assert.equal(tracking.product.brand, 'Stanley');
  assert.equal(tracking.customerFirstName, 'Valentina');
  assert.equal(tracking.carrier, 'Servientrega');
  for (const key of Object.keys(tracking)) {
    assert.ok(!/phone|email|address|amount|value|balance/i.test(key), `${key} no debe salir en la guía`);
  }

  await query(
    `INSERT INTO products (id, name, price) VALUES ('termo', 'Termo', 1000)`
  );
  const order = await OrderModel.create(
    {
      customerName: 'Laura Gómez', phone: '+57 3000000000', email: 'l@example.com',
      department: 'Quindío', city: 'Armenia', address: 'Calle 1', notes: null,
      paymentChannel: 'Nequi', quantity: 1, subtotal: 1000, shippingFee: 0, total: 1000
    },
    [{ productId: 'termo', productName: 'Termo', unitPrice: 1000, quantity: 1 }]
  );
  const orderTracking = await TrackingModel.findByReference(order.reference);
  assert.equal(orderTracking.kind, 'order');
  assert.equal(orderTracking.stage, 'usa');
  assert.equal(orderTracking.items[0].name, 'Termo');
  assert.equal(orderTracking.customerFirstName, 'Laura');

  // Marcar enviado en la tienda avanza la guía a 'dispatched' y avisa
  const shipped = await OrderModel.updateStatus(order.id, {
    status: 'shipped',
    shipping: { type: 'carrier', carrier: 'Coordinadora', trackingNumber: '123' }
  });
  assert.equal(shipped.previousTrackingStage, 'usa');
  assert.equal(shipped.tracking_stage, 'dispatched');
  assert.equal(shipped.tracking_history.at(-1).stage, 'dispatched');

  assert.equal(await TrackingModel.findByReference('SSA-000000'), null);
});

test('la suscripción push es por referencia y muere con el encargo', { skip }, async () => {
  const [pedido] = await PedidoModel.list();
  await TrackingModel.subscribe(pedido.reference, SUBSCRIPTION);
  await TrackingModel.subscribe(pedido.reference, SUBSCRIPTION); // idempotente
  assert.equal((await TrackingModel.subscriptions(pedido.reference)).length, 1);
  assert.equal((await TrackingModel.subscriptions('SSA-000000')).length, 0);

  const removed = await PedidoModel.remove(pedido.id);
  assert.equal(removed.reference, pedido.reference);
  assert.equal((await TrackingModel.subscriptions(pedido.reference)).length, 0);
  assert.equal(await PedidoModel.findById(pedido.id), null);
});

test('un cliente con encargos no se puede borrar; sin ellos sí', { skip }, async () => {
  const client = await ClientModel.findByPhone('300 555 0101');
  await PedidoModel.create({ clientId: client.id, brand: '', productRef: 'Algo', saleValue: 1000, payment: null });
  await assert.rejects(ClientModel.remove(client.id), (error) => error.code === '23503');

  const loner = await ClientModel.create({ name: 'Sin compras', phone: '319 000 0000' });
  assert.equal(await ClientModel.remove(loner.id), true);

  // El historial cruza las compras de la tienda por teléfono
  const laura = await ClientModel.upsertByPhone({ name: 'Laura Gómez', phone: '300 000 0000' });
  const orders = await ClientModel.storeOrders(laura.phone_digits);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].items[0].name, 'Termo');
  assert.equal(laura.orders_count, 1);
});

test('el dashboard suma los encargos: ventas, abonos del mes y saldo por cobrar', { skip }, async () => {
  const { StatsModel } = await import('../src/models/stats.model.js');
  const before = await StatsModel.finance();

  const client = await ClientModel.upsertByPhone({ name: 'Finanzas Test', phone: '317 000 0001' });
  const pedido = await PedidoModel.create({
    clientId: client.id,
    brand: 'Dyson',
    productRef: 'Airwrap',
    saleValue: 1_000_000,
    payment: { amount: 400_000 }
  });
  const after = await StatsModel.finance();
  assert.equal(after.month.encargos.sales - before.month.encargos.sales, 1_000_000, 'la venta cuenta en el mes');
  assert.equal(after.month.encargos.collected - before.month.encargos.collected, 400_000, 'el abono entra como ingreso');
  assert.equal(after.month.income - before.month.income, 400_000, 'el ingreso total suma tienda + abonos');
  assert.equal(after.receivable.balance - before.receivable.balance, 600_000, 'lo que falta queda por cobrar');
  assert.equal(after.receivable.count - before.receivable.count, 1);

  await PedidoModel.addPayment(pedido.id, { amount: 600_000 });
  const paid = await StatsModel.finance();
  assert.equal(paid.receivable.balance, before.receivable.balance, 'pagado completo ya no se cobra');
  assert.equal(paid.month.encargos.collected - before.month.encargos.collected, 1_000_000);

  // Cancelar saca el encargo de ventas, abonos y saldo
  await PedidoModel.setStatus(pedido.id, 'cancelled');
  const cancelled = await StatsModel.finance();
  assert.equal(cancelled.month.encargos.sales, before.month.encargos.sales);
  assert.equal(cancelled.month.encargos.collected, before.month.encargos.collected);
  assert.equal(cancelled.month.income, before.month.income);

  const counts = await StatsModel.pedidoCounts();
  assert.equal(counts.cancelled >= 1, true);
});
