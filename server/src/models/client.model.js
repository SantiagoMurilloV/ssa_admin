import { query, queryOne } from '../db/pool.js';
import { phoneDigits } from '../utils/phone.js';

const FIELDS =
  'c.id, c.name, c.phone, c.phone_digits, c.email, c.city, c.department, c.address, c.notes, c.created_at, c.updated_at';

// Misma normalización que phoneDigits() pero en SQL, para cruzar los pedidos de
// la tienda (que guardan el teléfono como lo escribió el comprador) con el
// cliente del panel.
const ORDER_PHONE_DIGITS = `
  CASE
    WHEN length(regexp_replace(o.phone, '\\D', '', 'g')) = 12
     AND regexp_replace(o.phone, '\\D', '', 'g') LIKE '57%'
    THEN substr(regexp_replace(o.phone, '\\D', '', 'g'), 3)
    ELSE regexp_replace(o.phone, '\\D', '', 'g')
  END`;

// Totales por cliente: cuántos encargos, cuánto suman, cuánto han abonado y la
// última vez que compró (en el panel o en la tienda).
const WITH_STATS = `
  SELECT ${FIELDS},
         COALESCE(s.pedidos, 0)::int AS pedidos_count,
         COALESCE(s.total, 0)::int AS pedidos_total,
         COALESCE(s.paid, 0)::int AS pedidos_paid,
         COALESCE(s.pending, 0)::int AS pedidos_pending,
         COALESCE(st.orders, 0)::int AS orders_count,
         COALESCE(st.total, 0)::int AS orders_total,
         GREATEST(s.last_at, st.last_at) AS last_purchase_at
  FROM clients c
  LEFT JOIN (
    SELECT p.client_id,
           COUNT(*) AS pedidos,
           SUM(CASE WHEN p.status = 'open' THEN p.sale_value ELSE 0 END) AS total,
           SUM(CASE WHEN p.status = 'open' THEN LEAST(COALESCE(pay.paid, 0), p.sale_value) ELSE 0 END) AS paid,
           SUM(CASE WHEN p.status = 'open' AND COALESCE(pay.paid, 0) < p.sale_value THEN 1 ELSE 0 END) AS pending,
           MAX(p.created_at) AS last_at
    FROM pedidos p
    LEFT JOIN (SELECT pedido_id, SUM(amount) AS paid FROM pedido_payments GROUP BY pedido_id) pay
      ON pay.pedido_id = p.id
    GROUP BY p.client_id
  ) s ON s.client_id = c.id
  LEFT JOIN (
    SELECT ${ORDER_PHONE_DIGITS} AS digits,
           COUNT(*) AS orders,
           SUM(CASE WHEN o.status IN ('paid', 'shipped') THEN o.total ELSE 0 END) AS total,
           MAX(o.created_at) AS last_at
    FROM orders o
    GROUP BY 1
  ) st ON st.digits = c.phone_digits
`;

const clean = (value, max) => {
  const text = String(value ?? '').trim();
  return text === '' ? null : text.slice(0, max);
};

export const ClientModel = {
  async list(search = '') {
    const q = String(search ?? '').trim();
    const digits = phoneDigits(q);
    const { rows } = await query(
      `${WITH_STATS}
       WHERE $1 = ''
          OR c.name ILIKE '%' || $1 || '%'
          OR COALESCE(c.email, '') ILIKE '%' || $1 || '%'
          OR COALESCE(c.city, '') ILIKE '%' || $1 || '%'
          OR ($2 <> '' AND c.phone_digits LIKE '%' || $2 || '%')
       ORDER BY GREATEST(s.last_at, st.last_at, c.created_at) DESC
       LIMIT 300`,
      [q, digits]
    );
    return rows;
  },

  async findById(id) {
    return queryOne(`${WITH_STATS} WHERE c.id = $1`, [id]);
  },

  async findByPhone(phone) {
    const digits = phoneDigits(phone);
    if (!digits) return null;
    return queryOne(`${WITH_STATS} WHERE c.phone_digits = $1`, [digits]);
  },

  async create(data) {
    const digits = phoneDigits(data.phone);
    const row = await queryOne(
      `INSERT INTO clients (name, phone, phone_digits, email, city, department, address, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        String(data.name).trim(),
        String(data.phone).trim(),
        digits,
        clean(data.email, 160),
        clean(data.city, 80),
        clean(data.department, 80),
        clean(data.address, 200),
        clean(data.notes, 1000)
      ]
    );
    return this.findById(row.id);
  },

  async update(id, data) {
    const row = await queryOne(
      `UPDATE clients SET
         name = $2, phone = $3, phone_digits = $4, email = $5, city = $6,
         department = $7, address = $8, notes = $9, updated_at = now()
       WHERE id = $1 RETURNING id`,
      [
        id,
        String(data.name).trim(),
        String(data.phone).trim(),
        phoneDigits(data.phone),
        clean(data.email, 160),
        clean(data.city, 80),
        clean(data.department, 80),
        clean(data.address, 200),
        clean(data.notes, 1000)
      ]
    );
    return row ? this.findById(row.id) : null;
  },

  // Al crear un encargo se escribe nombre y teléfono: si el teléfono ya es de
  // alguien, es esa persona (no se duplica). Solo se completan los datos que
  // el cliente aún no tenía; el nombre ya guardado no se pisa.
  async upsertByPhone(data) {
    const existing = await this.findByPhone(data.phone);
    if (!existing) return this.create(data);
    const patch = {
      name: existing.name,
      phone: existing.phone,
      email: existing.email ?? clean(data.email, 160),
      city: existing.city ?? clean(data.city, 80),
      department: existing.department ?? clean(data.department, 80),
      address: existing.address ?? clean(data.address, 200),
      notes: existing.notes
    };
    const changed =
      patch.email !== existing.email ||
      patch.city !== existing.city ||
      patch.department !== existing.department ||
      patch.address !== existing.address;
    return changed ? this.update(existing.id, patch) : existing;
  },

  // Borrar falla con 23503 si el cliente tiene encargos: el controlador lo
  // traduce a 409. El historial de compras no se pierde por limpiar la agenda.
  async remove(id) {
    const { rowCount } = await query('DELETE FROM clients WHERE id = $1', [id]);
    return rowCount > 0;
  },

  // Compras en la tienda de esta persona, cruzadas por teléfono. Solo lectura:
  // el pedido de la tienda sigue viviendo en `orders`.
  async storeOrders(phoneDigitsValue) {
    if (!phoneDigitsValue) return [];
    const { rows } = await query(
      `SELECT o.id, o.reference, o.status, o.payment_status, o.tracking_stage, o.total,
              o.city, o.department, o.created_at,
              COALESCE((
                SELECT json_agg(json_build_object(
                         'name', oi.product_name,
                         'quantity', oi.quantity,
                         'variantLabel', oi.variant_label
                       ) ORDER BY oi.id)
                FROM order_items oi WHERE oi.order_id = o.id
              ), '[]'::json) AS items
       FROM orders o
       WHERE ${ORDER_PHONE_DIGITS} = $1
       ORDER BY o.created_at DESC
       LIMIT 100`,
      [phoneDigitsValue]
    );
    return rows;
  }
};
