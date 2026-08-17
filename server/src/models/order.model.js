import { pool, query, queryOne } from '../db/pool.js';
import { generateOrderReference, generateReceiptToken } from '../utils/order-reference.js';
import { ProductModel, InsufficientStockError } from './product.model.js';

// receipt_token queda fuera: es una credencial y nunca debe viajar al panel
// ni a los listados. Solo se lee explícitamente en findTokenByReference.
const ORDER_FIELDS = `
  id, reference, customer_name, phone, email, department, city, address, notes,
  payment_method, payment_channel, payment_status, quantity, subtotal, shipping_fee, total,
  status, receipt_url, receipt_public_id,
  shipping_type, tracking_carrier, tracking_number, tracking_url,
  paid_at, created_at
`;

const attachItems = async (orders) => {
  if (orders.length === 0) return orders;
  const ids = orders.map((o) => o.id);
  const { rows: items } = await query(
    `SELECT id, order_id, product_id, product_name, unit_price, quantity
     FROM order_items WHERE order_id = ANY($1) ORDER BY id`,
    [ids]
  );
  const byOrder = new Map(orders.map((o) => [o.id, []]));
  for (const item of items) byOrder.get(item.order_id)?.push(item);
  return orders.map((o) => ({ ...o, items: byOrder.get(o.id) ?? [] }));
};

export const OrderModel = {
  async create(order, items) {
    const client = await pool.connect();
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const reference = generateOrderReference();
        const receiptToken = generateReceiptToken();
        await client.query('BEGIN');
        try {
          const { rows } = await client.query(
            `INSERT INTO orders (
               reference, customer_name, phone, email, department, city, address, notes,
               payment_method, payment_channel, quantity, subtotal, shipping_fee, total,
               receipt_token
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'transfer',$9,$10,$11,$12,$13,$14)
             RETURNING ${ORDER_FIELDS}`,
            [
              reference,
              order.customerName,
              order.phone,
              order.email,
              order.department,
              order.city,
              order.address,
              order.notes ?? null,
              order.paymentChannel ?? null,
              order.quantity,
              order.subtotal,
              order.shippingFee,
              order.total,
              receiptToken
            ]
          );
          const created = { ...rows[0], receiptToken };
          for (const item of items) {
            await client.query(
              `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
               VALUES ($1, $2, $3, $4, $5)`,
              [created.id, item.productId, item.productName, item.unitPrice, item.quantity]
            );
          }
          // El inventario se retiene en la misma transacción que el pedido: si
          // no alcanza, no queda ni pedido a medias ni stock descontado.
          await ProductModel.takeStockForItems(client, items);
          await client.query('COMMIT');
          const [withItems] = await attachItems([created]);
          return withItems;
        } catch (error) {
          await client.query('ROLLBACK');
          // 23505 = referencia duplicada: reintenta con otra
          if (error.code !== '23505') throw error;
        }
      }
      throw new Error('Could not allocate a unique order reference');
    } finally {
      client.release();
    }
  },

  async list(status) {
    const where = status ? 'WHERE status = $1' : '';
    const params = status ? [status] : [];
    const { rows } = await query(
      `SELECT ${ORDER_FIELDS} FROM orders ${where} ORDER BY created_at DESC LIMIT 300`,
      params
    );
    return attachItems(rows);
  },

  async counts() {
    const { rows } = await query('SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status');
    const counts = { pending: 0, paid: 0, shipped: 0, cancelled: 0 };
    for (const row of rows) counts[row.status] = row.count;
    return counts;
  },

  async findById(id) {
    const row = await queryOne(`SELECT ${ORDER_FIELDS} FROM orders WHERE id = $1`, [id]);
    if (!row) return null;
    const [withItems] = await attachItems([row]);
    return withItems;
  },

  async findByReference(reference) {
    const row = await queryOne(`SELECT ${ORDER_FIELDS} FROM orders WHERE reference = $1`, [reference]);
    if (!row) return null;
    const [withItems] = await attachItems([row]);
    return withItems;
  },

  // Único punto que lee la credencial, para compararla en el servidor.
  async findAuthByReference(reference) {
    return queryOne(
      'SELECT id, receipt_token, receipt_public_id, payment_status FROM orders WHERE reference = $1',
      [reference]
    );
  },

  async updateStatus(id, { status, shipping }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // FOR UPDATE serializa dos cambios de estado sobre el mismo pedido: sin
      // esto, cancelar dos veces devolvería el inventario dos veces.
      const before = await client.query('SELECT status FROM orders WHERE id = $1 FOR UPDATE', [id]);
      if (before.rowCount === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      const previous = before.rows[0].status;

      // Solo el cruce de la frontera 'cancelled' mueve inventario, y solo una vez
      if (status === 'cancelled' && previous !== 'cancelled') {
        await ProductModel.releaseStockForOrder(client, id);
      } else if (status !== 'cancelled' && previous === 'cancelled') {
        // Puede lanzar InsufficientStockError: reactivar un pedido cuyas
        // unidades ya se vendieron a otro no debe sobrevender.
        await ProductModel.takeStockForOrder(client, id);
      }

      // Volver a 'pending' debe deshacer también la verificación del pago: si no,
      // el pedido queda "pendiente pero verificado" y el cliente ya no puede
      // volver a subir su comprobante (recibiría 409 para siempre).
      // 'cancelled' no toca el pago: el pedido está muerto, no verificado.
      const { rows } = await client.query(
        `UPDATE orders SET
           status = $2,
           payment_status = CASE
             WHEN $2 = 'cancelled' THEN payment_status
             WHEN $2 = 'pending' THEN
               CASE WHEN receipt_url IS NOT NULL THEN 'in_review' ELSE 'awaiting_receipt' END
             ELSE 'verified'
           END,
           paid_at = CASE
             WHEN $2 = 'cancelled' THEN paid_at
             WHEN $2 = 'pending' THEN NULL
             WHEN paid_at IS NULL THEN now()
             ELSE paid_at
           END,
           shipping_type = CASE WHEN $2 = 'pending' THEN NULL ELSE COALESCE($3, shipping_type) END,
           tracking_carrier = CASE WHEN $2 = 'pending' THEN NULL ELSE COALESCE($4, tracking_carrier) END,
           tracking_number = CASE WHEN $2 = 'pending' THEN NULL ELSE COALESCE($5, tracking_number) END,
           tracking_url = CASE WHEN $2 = 'pending' THEN NULL ELSE COALESCE($6, tracking_url) END
         WHERE id = $1
         RETURNING ${ORDER_FIELDS}`,
        [
          id,
          status,
          shipping?.type ?? null,
          shipping?.carrier ?? null,
          shipping?.trackingNumber ?? null,
          shipping?.trackingUrl ?? null
        ]
      );
      await client.query('COMMIT');
      const [withItems] = await attachItems([rows[0]]);
      return withItems;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  },

  // Adjunta el comprobante solo si el pedido sigue esperándolo. La condición
  // va en el WHERE para que dos subidas simultáneas no dejen assets huérfanos:
  // la segunda no encuentra fila y su archivo se borra en el controlador.
  async attachReceipt(id, { publicId, url }) {
    const row = await queryOne(
      `UPDATE orders SET
         receipt_public_id = $2,
         receipt_url = $3,
         payment_status = 'in_review'
       WHERE id = $1 AND payment_status <> 'verified'
       RETURNING ${ORDER_FIELDS}`,
      [id, publicId, url]
    );
    if (!row) return null;
    const [withItems] = await attachItems([row]);
    return withItems;
  }
};
