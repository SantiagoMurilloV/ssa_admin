import { query, queryOne } from '../db/pool.js';

// Lo que ve cualquiera con el código: producto, etapa y ciudad de destino.
// Nada de dirección, teléfono, correo ni montos: la referencia es corta y se
// comparte por WhatsApp, así que no puede abrir datos sensibles.
const firstName = (fullName) => String(fullName ?? '').trim().split(/\s+/)[0] || '';

const lastHistoryAt = (history, fallback) => {
  const entries = Array.isArray(history) ? history : [];
  return entries.length > 0 ? entries[entries.length - 1].at : fallback;
};

const shape = ({
  kind,
  row,
  product,
  items,
  customerName,
  city,
  cancelled
}) => ({
  kind,
  reference: row.reference,
  cancelled,
  stage: row.tracking_stage,
  history: Array.isArray(row.tracking_history) ? row.tracking_history : [],
  carrier: row.tracking_carrier ?? null,
  trackingNumber: row.tracking_number ?? null,
  trackingUrl: row.tracking_url ?? null,
  product,
  items,
  customerFirstName: firstName(customerName),
  city: city ?? null,
  createdAt: row.created_at,
  updatedAt: lastHistoryAt(row.tracking_history, row.updated_at ?? row.created_at)
});

export const TrackingModel = {
  async findByReference(reference) {
    const pedido = await queryOne(
      `SELECT p.reference, p.brand, p.product_ref, p.photo_url, p.status,
              p.tracking_stage, p.tracking_history, p.tracking_carrier, p.tracking_number,
              p.tracking_url, p.created_at, p.updated_at,
              c.name AS client_name, c.city AS client_city
       FROM pedidos p JOIN clients c ON c.id = p.client_id
       WHERE p.reference = $1`,
      [reference]
    );
    if (pedido) {
      const product = {
        name: pedido.product_ref,
        brand: pedido.brand || null,
        photoUrl: pedido.photo_url ?? null
      };
      return shape({
        kind: 'pedido',
        row: pedido,
        product,
        items: [{ ...product, quantity: 1 }],
        customerName: pedido.client_name,
        city: pedido.client_city,
        cancelled: pedido.status === 'cancelled'
      });
    }

    const order = await queryOne(
      `SELECT id, reference, customer_name, city, status, tracking_stage, tracking_history,
              tracking_carrier, tracking_number, tracking_url, created_at
       FROM orders WHERE reference = $1`,
      [reference]
    );
    if (!order) return null;
    const { rows: items } = await query(
      `SELECT oi.product_name, oi.variant_label, oi.quantity,
              (SELECT ph.url FROM product_photos ph
                WHERE ph.product_id = oi.product_id AND ph.media_type = 'image'
                ORDER BY ph.position, ph.id LIMIT 1) AS photo_url
       FROM order_items oi WHERE oi.order_id = $1 ORDER BY oi.id`,
      [order.id]
    );
    const shaped = items.map((item) => ({
      name: item.variant_label ? `${item.product_name} · ${item.variant_label}` : item.product_name,
      brand: null,
      quantity: item.quantity,
      photoUrl: item.photo_url ?? null
    }));
    const first = shaped[0] ?? { name: 'Tu pedido', brand: null, photoUrl: null };
    return shape({
      kind: 'order',
      row: order,
      product: {
        name: shaped.length > 1 ? `${shaped.length} productos` : first.name,
        brand: null,
        photoUrl: first.photoUrl
      },
      items: shaped,
      customerName: order.customer_name,
      city: order.city,
      cancelled: order.status === 'cancelled'
    });
  },

  async referenceExists(reference) {
    const row = await queryOne(
      `SELECT 1 FROM pedidos WHERE reference = $1
       UNION ALL
       SELECT 1 FROM orders WHERE reference = $1
       LIMIT 1`,
      [reference]
    );
    return Boolean(row);
  },

  async subscribe(reference, { endpoint, keys }) {
    await query(
      `INSERT INTO tracking_subscriptions (reference, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (reference, endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [reference, endpoint, keys.p256dh, keys.auth]
    );
  },

  async unsubscribe(reference, endpoint) {
    const { rowCount } = await query(
      'DELETE FROM tracking_subscriptions WHERE reference = $1 AND endpoint = $2',
      [reference, endpoint]
    );
    return rowCount > 0;
  },

  async subscriptions(reference) {
    const { rows } = await query(
      'SELECT id, endpoint, p256dh, auth FROM tracking_subscriptions WHERE reference = $1',
      [reference]
    );
    return rows;
  },

  removeSubscription: (id) => query('DELETE FROM tracking_subscriptions WHERE id = $1', [id])
};
