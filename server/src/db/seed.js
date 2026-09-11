import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { query, queryOne } from './pool.js';
import { SettingsModel, SETTINGS_KEYS } from '../models/settings.model.js';
import { DEFAULT_SHIPPING_CONFIG } from '../config/shipping-config.js';
import { DEFAULT_PAYMENT_CHANNELS } from '../config/payment-channels.js';

// Productos demo: los mismos del diseño SSA Tienda v6
const DEMO_PRODUCTS = [
  ['termo-stanley-quencher', 'Termo Stanley Quencher 1.18 L', 'Color Rose Quartz · original', 'Hogar', 219000, true, true],
  ['airpods-pro-2', 'AirPods Pro 2 (USB-C)', 'Sellados, garantía Apple', 'Tecnología', 949000, false, true],
  ['kindle-paperwhite-16gb', 'Kindle Paperwhite 16 GB', 'Última generación, sin publicidad', 'Tecnología', 748000, false, false],
  ['bruma-sol-de-janeiro-62', 'Bruma Sol de Janeiro 62', '240 ml · Sephora USA', 'Belleza', 168000, true, true],
  ['limpiador-cerave-473', 'Limpiador CeraVe 473 ml', 'Piel normal a seca · farmacia USA', 'Belleza', 92000, true, false],
  ['tenis-new-balance-530', 'Tenis New Balance 530', 'Blanco / plata · tallas 6–10 US', 'Moda', 619000, false, false],
  ['botella-owala-freesip', 'Botella Owala FreeSip 740 ml', 'Anti-derrames · varios colores', 'Hogar', 149000, true, false],
  ['lego-orquidea-botanical', 'LEGO Orquídea Botanical', '608 piezas · edición adultos', 'Hogar', 389000, true, false],
  ['apple-watch-se-2-40mm', 'Apple Watch SE 2 · 40 mm', 'GPS · correa deportiva', 'Tecnología', 1180000, false, false]
];

export async function seed() {
  // El panel tiene una sola cuenta y no hay pantalla para cambiarle la clave, así
  // que SEED_ADMIN_USER / SEED_ADMIN_PASSWORD son la fuente de verdad y se
  // reconcilian en cada arranque: cambiar la variable y redeployar rota la clave.
  //
  // Se borra cualquier otra cuenta porque antes solo se creaba si faltaba: al
  // cambiar el usuario quedaba la cuenta anterior viva, con su clave vieja
  // todavía sirviendo para entrar.
  const adminUser = env.seedAdminUser.toLowerCase();
  const hash = await bcrypt.hash(env.seedAdminPassword, 12);
  const { rowCount: removed } = await query('DELETE FROM admin_users WHERE email <> $1', [
    adminUser
  ]);
  const existingAdmin = await queryOne('SELECT id FROM admin_users WHERE email = $1', [adminUser]);
  await query(
    `INSERT INTO admin_users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [adminUser, hash, 'SSA Import']
  );
  if (removed > 0) console.log(`[seed] removed ${removed} stale admin account(s)`);
  console.log(`[seed] admin ${existingAdmin ? 'credentials reconciled' : 'created'}: ${adminUser}`);

  if (!(await SettingsModel.getJson(SETTINGS_KEYS.shippingConfig))) {
    await SettingsModel.setJson(SETTINGS_KEYS.shippingConfig, DEFAULT_SHIPPING_CONFIG);
  }
  if (!(await SettingsModel.getJson(SETTINGS_KEYS.paymentChannels))) {
    await SettingsModel.setJson(SETTINGS_KEYS.paymentChannels, DEFAULT_PAYMENT_CHANNELS);
  }

  const withDemoData = !env.isProduction;
  if (!withDemoData) return;

  const { rows: [{ count }] } = await query('SELECT COUNT(*)::int AS count FROM products');
  if (count === 0) {
    for (const [i, [id, name, detail, category, price, inStock, featured]] of DEMO_PRODUCTS.entries()) {
      await query(
        `INSERT INTO products (id, name, detail, category, price, in_stock, featured, active, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8)`,
        [id, name, detail, category, price, inStock, featured, i]
      );
    }
    console.log(`[seed] ${DEMO_PRODUCTS.length} demo products created`);
  }

  const { rows: [{ count: orderCount }] } = await query('SELECT COUNT(*)::int AS count FROM orders');
  if (orderCount === 0) {
    const demoOrders = [
      ['Laura Gómez', 'Bogotá', 'Cundinamarca', 'termo-stanley-quencher', 1, 'pending'],
      ['Andrés Ríos', 'Medellín', 'Antioquia', 'bruma-sol-de-janeiro-62', 2, 'paid'],
      ['Camila Torres', 'Cali', 'Valle del Cauca', 'airpods-pro-2', 1, 'shipped']
    ];
    for (const [customer, city, department, productId, qty, status] of demoOrders) {
      const product = await queryOne('SELECT id, name, price FROM products WHERE id = $1', [productId]);
      if (!product) continue;
      const subtotal = product.price * qty;
      const shippingFee = 10000;
      const reference = `SSA-${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;
      const order = await queryOne(
        `INSERT INTO orders (reference, customer_name, phone, email, department, city, address,
                             payment_method, quantity, subtotal, shipping_fee, total, status,
                             payment_status, paid_at)
         VALUES ($1,$2,'+57 3001234567','demo@ssaimport.co',$3,$4,'Calle 123 #45-67',
                 'transfer',$5,$6,$7,$8,$9,$10, CASE WHEN $9 = 'pending' THEN NULL ELSE now() END)
         RETURNING id`,
        [
          reference, customer, department, city, qty, subtotal, shippingFee,
          subtotal + shippingFee, status,
          status === 'pending' ? 'awaiting_receipt' : 'verified'
        ]
      );
      await query(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
         VALUES ($1,$2,$3,$4,$5)`,
        [order.id, product.id, product.name, product.price, qty]
      );
    }
    console.log('[seed] demo orders created');

    for (let day = 13; day >= 0; day -= 1) {
      const views = 20 + Math.floor(Math.random() * 40);
      for (let i = 0; i < views; i += 1) {
        await query(
          `INSERT INTO events (type, created_at)
           VALUES ($1, now() - make_interval(days => $2, mins => $3))`,
          [
            i % 9 === 0 ? 'add_to_cart' : i % 3 === 0 ? 'product_view' : 'page_view',
            day,
            Math.floor(Math.random() * 600)
          ]
        );
      }
    }
    console.log('[seed] demo events created');
  }

  // Encargos del panel de muestra, en distintas etapas de la guía, para poder
  // probar el seguimiento público y la página de clientes sin cargar nada.
  const { rows: [{ count: pedidoCount }] } = await query('SELECT COUNT(*)::int AS count FROM pedidos');
  if (pedidoCount === 0) {
    const { PedidoModel } = await import('../models/pedido.model.js');
    const { ClientModel } = await import('../models/client.model.js');
    const { TRACKING_STAGE_KEYS } = await import('../config/tracking-stages.js');
    const demo = [
      ['Valentina Ruiz', '300 555 0101', 'Armenia', 'Stanley', 'Quencher H2.0 40 oz · Rose Quartz', 219000, 110000, 'warehouse'],
      ['Mateo Castaño', '311 555 0202', 'Pereira', 'Apple', 'AirPods Pro 2 (USB-C)', 949000, 949000, 'transit'],
      ['Valentina Ruiz', '300 555 0101', 'Armenia', 'Sol de Janeiro', 'Bruma 62 · 240 ml', 168000, 168000, 'delivered'],
      ['Juliana Ospina', '315 555 0303', 'Manizales', 'New Balance', 'Tenis 530 · talla 7.5 US · blanco/plata', 619000, 300000, 'usa']
    ];
    for (const [name, phone, city, brand, productRef, saleValue, paid, stage] of demo) {
      const client = await ClientModel.upsertByPhone({ name, phone, city });
      const pedido = await PedidoModel.create({
        clientId: client.id,
        brand,
        productRef,
        saleValue,
        notes: null,
        payment: paid > 0 ? { amount: paid, note: paid < saleValue ? 'Abono del 50 %' : 'Pago completo' } : null
      });
      // Recorre las etapas hasta la indicada para que el historial tenga fechas
      for (const key of TRACKING_STAGE_KEYS.slice(1, TRACKING_STAGE_KEYS.indexOf(stage) + 1)) {
        await PedidoModel.setTrackingStage(pedido.id, { stage: key });
      }
    }
    console.log(`[seed] ${demo.length} demo pedidos created`);
  }
}
