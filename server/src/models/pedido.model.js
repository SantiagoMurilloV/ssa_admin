import { pool, query, queryOne } from '../db/pool.js';
import { generateOrderReference } from '../utils/order-reference.js';
import { DEFAULT_TRACKING_STAGE } from '../config/tracking-stages.js';

// ordered_at y paid_at son DATE: se devuelven como texto AAAA-MM-DD para que el
// panel no los corra un día al interpretarlos en la zona horaria del navegador.
const FIELDS = `
  p.id, p.reference, p.client_id, p.brand, p.product_ref, p.photo_public_id, p.photo_url,
  to_char(p.ordered_at, 'YYYY-MM-DD') AS ordered_at,
  p.sale_value, p.notes, p.status,
  p.tracking_stage, p.tracking_history, p.tracking_carrier, p.tracking_number, p.tracking_url,
  p.created_at, p.updated_at,
  c.name AS client_name, c.phone AS client_phone, c.city AS client_city, c.email AS client_email,
  COALESCE(pay.paid, 0)::int AS paid_amount,
  CASE
    WHEN p.status = 'cancelled' THEN 'cancelled'
    WHEN p.tracking_stage = 'delivered' THEN 'delivered'
    WHEN COALESCE(pay.paid, 0) >= p.sale_value THEN 'paid'
    ELSE 'pending'
  END AS bucket
`;

const FROM = `
  FROM pedidos p
  JOIN clients c ON c.id = p.client_id
  LEFT JOIN (SELECT pedido_id, SUM(amount) AS paid FROM pedido_payments GROUP BY pedido_id) pay
    ON pay.pedido_id = p.id
`;

// Las pestañas del panel: pago pendiente, pagados (esperando llegar), entregados
// y cancelados. Cada encargo cae en exactamente una.
export const PEDIDO_BUCKETS = ['pending', 'paid', 'delivered', 'cancelled'];

const PAYMENT_FIELDS = `
  id, pedido_id, amount, to_char(paid_at, 'YYYY-MM-DD') AS paid_at, note,
  receipt_public_id, receipt_url, created_at
`;

const attachPayments = async (pedidos) => {
  if (pedidos.length === 0) return pedidos;
  const ids = pedidos.map((p) => p.id);
  const { rows } = await query(
    `SELECT ${PAYMENT_FIELDS} FROM pedido_payments WHERE pedido_id = ANY($1) ORDER BY paid_at, id`,
    [ids]
  );
  const byPedido = new Map(pedidos.map((p) => [p.id, []]));
  for (const payment of rows) byPedido.get(payment.pedido_id)?.push(payment);
  return pedidos.map((p) => ({
    ...p,
    payments: byPedido.get(p.id) ?? [],
    balance: Math.max(0, p.sale_value - p.paid_amount)
  }));
};

const findOne = async (id) => {
  const row = await queryOne(`SELECT ${FIELDS} ${FROM} WHERE p.id = $1`, [id]);
  if (!row) return null;
  const [full] = await attachPayments([row]);
  return full;
};

export const PedidoModel = {
  async list(bucket) {
    const { rows } = await query(
      `SELECT * FROM (SELECT ${FIELDS} ${FROM}) t
       WHERE $1::text IS NULL OR t.bucket = $1
       ORDER BY t.created_at DESC
       LIMIT 300`,
      [bucket ?? null]
    );
    return attachPayments(rows);
  },

  async listByClient(clientId) {
    const { rows } = await query(
      `SELECT ${FIELDS} ${FROM} WHERE p.client_id = $1 ORDER BY p.created_at DESC LIMIT 200`,
      [clientId]
    );
    return attachPayments(rows);
  },

  async counts() {
    const { rows } = await query(
      `SELECT bucket, COUNT(*)::int AS count FROM (SELECT ${FIELDS} ${FROM}) t GROUP BY bucket`
    );
    const counts = { pending: 0, paid: 0, delivered: 0, cancelled: 0 };
    for (const row of rows) counts[row.bucket] = row.count;
    return counts;
  },

  findById: findOne,

  async findByReference(reference) {
    const row = await queryOne(`SELECT ${FIELDS} ${FROM} WHERE p.reference = $1`, [reference]);
    if (!row) return null;
    const [full] = await attachPayments([row]);
    return full;
  },

  // Crea el encargo y, si el cliente ya abonó algo, el primer pago con su
  // desprendible, todo en una transacción. La referencia SSA-###### tiene que
  // ser única también frente a los pedidos de la tienda, porque la guía pública
  // la busca en ambas tablas.
  async create(data) {
    const client = await pool.connect();
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const reference = generateOrderReference();
        await client.query('BEGIN');
        try {
          const taken = await client.query('SELECT 1 FROM orders WHERE reference = $1', [reference]);
          if (taken.rowCount > 0) throw Object.assign(new Error('reference taken'), { code: '23505' });
          const { rows } = await client.query(
            `INSERT INTO pedidos (
               reference, client_id, brand, product_ref, photo_public_id, photo_url,
               ordered_at, sale_value, notes, tracking_stage, tracking_history
             ) VALUES (
               $1, $2, $3, $4, $5, $6, COALESCE($7::date, CURRENT_DATE), $8, $9, $10,
               jsonb_build_array(jsonb_build_object('stage', $10::text, 'at', now(), 'note', NULL))
             ) RETURNING id`,
            [
              reference,
              data.clientId,
              data.brand ?? '',
              data.productRef,
              data.photo?.publicId ?? null,
              data.photo?.url ?? null,
              data.orderedAt ?? null,
              data.saleValue,
              data.notes ?? null,
              DEFAULT_TRACKING_STAGE
            ]
          );
          const id = rows[0].id;
          if (data.payment && data.payment.amount > 0) {
            await client.query(
              `INSERT INTO pedido_payments (pedido_id, amount, paid_at, note, receipt_public_id, receipt_url)
               VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5, $6)`,
              [
                id,
                data.payment.amount,
                data.payment.paidAt ?? null,
                data.payment.note ?? null,
                data.payment.receipt?.publicId ?? null,
                data.payment.receipt?.url ?? null
              ]
            );
          }
          await client.query('COMMIT');
          return findOne(id);
        } catch (error) {
          await client.query('ROLLBACK');
          if (error.code !== '23505') throw error;
        }
      }
      throw new Error('Could not allocate a unique pedido reference');
    } finally {
      client.release();
    }
  },

  async update(id, data) {
    const row = await queryOne(
      `UPDATE pedidos SET
         client_id = COALESCE($2, client_id),
         brand = $3, product_ref = $4,
         ordered_at = COALESCE($5::date, ordered_at),
         sale_value = $6, notes = $7, updated_at = now()
       WHERE id = $1 RETURNING id`,
      [
        id,
        data.clientId ?? null,
        data.brand ?? '',
        data.productRef,
        data.orderedAt ?? null,
        data.saleValue,
        data.notes ?? null
      ]
    );
    return row ? findOne(row.id) : null;
  },

  // Devuelve el public_id anterior para que el controlador borre el archivo viejo
  async setPhoto(id, photo) {
    const row = await queryOne(
      `WITH before AS (SELECT photo_public_id AS previous_photo FROM pedidos WHERE id = $1)
       UPDATE pedidos p SET photo_public_id = $2, photo_url = $3, updated_at = now()
       FROM before WHERE p.id = $1
       RETURNING p.id, before.previous_photo`,
      [id, photo?.publicId ?? null, photo?.url ?? null]
    );
    if (!row) return null;
    return { pedido: await findOne(row.id), previousPhotoPublicId: row.previous_photo };
  },

  async addPayment(pedidoId, payment) {
    const row = await queryOne(
      `INSERT INTO pedido_payments (pedido_id, amount, paid_at, note, receipt_public_id, receipt_url)
       SELECT $1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5, $6
       WHERE EXISTS (SELECT 1 FROM pedidos WHERE id = $1)
       RETURNING id`,
      [
        pedidoId,
        payment.amount,
        payment.paidAt ?? null,
        payment.note ?? null,
        payment.receipt?.publicId ?? null,
        payment.receipt?.url ?? null
      ]
    );
    if (!row) return null;
    await query('UPDATE pedidos SET updated_at = now() WHERE id = $1', [pedidoId]);
    return findOne(pedidoId);
  },

  async findPayment(pedidoId, paymentId) {
    return queryOne(
      `SELECT ${PAYMENT_FIELDS} FROM pedido_payments WHERE id = $1 AND pedido_id = $2`,
      [paymentId, pedidoId]
    );
  },

  async removePayment(pedidoId, paymentId) {
    const { rowCount } = await query(
      'DELETE FROM pedido_payments WHERE id = $1 AND pedido_id = $2',
      [paymentId, pedidoId]
    );
    if (rowCount === 0) return null;
    await query('UPDATE pedidos SET updated_at = now() WHERE id = $1', [pedidoId]);
    return findOne(pedidoId);
  },

  // Cambia la etapa de la guía. El historial solo crece cuando la etapa de
  // verdad cambia (volver a marcar la misma no duplica la entrada) y la CTE
  // devuelve la etapa anterior para que el controlador avise al cliente solo
  // si hubo cambio. Los datos de transportadora se conservan si no llegan.
  async setTrackingStage(id, { stage, note, carrier, trackingNumber, trackingUrl }) {
    const row = await queryOne(
      `WITH before AS (SELECT tracking_stage AS previous_stage FROM pedidos WHERE id = $1)
       UPDATE pedidos p SET
         tracking_history = CASE
           WHEN p.tracking_stage = $2 THEN p.tracking_history
           ELSE p.tracking_history || jsonb_build_array(
                  jsonb_build_object('stage', $2::text, 'at', now(), 'note', $3::text))
         END,
         tracking_stage = $2,
         tracking_carrier = COALESCE($4, p.tracking_carrier),
         tracking_number = COALESCE($5, p.tracking_number),
         tracking_url = COALESCE($6, p.tracking_url),
         updated_at = now()
       FROM before
       WHERE p.id = $1
       RETURNING p.id, before.previous_stage`,
      [id, stage, note ?? null, carrier ?? null, trackingNumber ?? null, trackingUrl ?? null]
    );
    if (!row) return null;
    return { pedido: await findOne(row.id), previousStage: row.previous_stage };
  },

  async setStatus(id, status) {
    const row = await queryOne(
      'UPDATE pedidos SET status = $2, updated_at = now() WHERE id = $1 RETURNING id',
      [id, status]
    );
    return row ? findOne(row.id) : null;
  },

  // Devuelve lo borrado (foto y desprendibles) para limpiar el storage. Las
  // suscripciones push de esa referencia también se van: ya no hay nada que avisar.
  async remove(id) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: payments } = await client.query(
        'SELECT receipt_public_id FROM pedido_payments WHERE pedido_id = $1',
        [id]
      );
      const { rows } = await client.query(
        'DELETE FROM pedidos WHERE id = $1 RETURNING reference, photo_public_id',
        [id]
      );
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      await client.query('DELETE FROM tracking_subscriptions WHERE reference = $1', [
        rows[0].reference
      ]);
      await client.query('COMMIT');
      return {
        reference: rows[0].reference,
        photoPublicId: rows[0].photo_public_id,
        receiptPublicIds: payments.map((p) => p.receipt_public_id).filter(Boolean)
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
};
