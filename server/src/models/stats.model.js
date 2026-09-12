import { query, queryOne } from '../db/pool.js';

// Mes en curso en hora de Colombia, como el resto de las estadísticas
const THIS_MONTH_DATE = `date_trunc('month', (now() AT TIME ZONE 'America/Bogota')::date)`;
const THIS_MONTH_TS = `date_trunc('month', now() AT TIME ZONE 'America/Bogota')`;

// Dinero del negocio: la tienda cobra completo al confirmar el pago, así que su
// ingreso es el total de los pedidos pagados o enviados; los encargos se pagan
// por abonos, así que lo que entra es la suma de los abonos y lo vendido es el
// valor de venta. Ambos se miran por mes de Colombia; el saldo por cobrar es
// acumulado (lo que falta de todo encargo abierto, sin importar el mes).
export const StatsModel = {
  async finance() {
    const [store, sold, collected, delivered, receivable] = await Promise.all([
      queryOne(
        `SELECT COALESCE(SUM(total), 0)::bigint AS revenue,
                COUNT(*)::int AS orders,
                COALESCE(SUM(quantity), 0)::int AS units
         FROM orders
         WHERE status IN ('paid', 'shipped')
           AND date_trunc('month', created_at AT TIME ZONE 'America/Bogota') = ${THIS_MONTH_TS}`
      ),
      queryOne(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(sale_value), 0)::bigint AS sales
         FROM pedidos
         WHERE status = 'open' AND date_trunc('month', ordered_at) = ${THIS_MONTH_DATE}`
      ),
      queryOne(
        `SELECT COUNT(*)::int AS payments, COALESCE(SUM(pp.amount), 0)::bigint AS amount
         FROM pedido_payments pp
         JOIN pedidos p ON p.id = pp.pedido_id
         WHERE p.status = 'open' AND date_trunc('month', pp.paid_at) = ${THIS_MONTH_DATE}`
      ),
      // Entregados este mes: la fecha vive en el historial de la guía
      queryOne(
        `SELECT COUNT(*)::int AS count
         FROM pedidos p
         WHERE p.status = 'open' AND p.tracking_stage = 'delivered'
           AND date_trunc('month', (
                 SELECT MAX((e->>'at')::timestamptz) FROM jsonb_array_elements(p.tracking_history) e
                 WHERE e->>'stage' = 'delivered'
               ) AT TIME ZONE 'America/Bogota') = ${THIS_MONTH_TS}`
      ),
      queryOne(
        `SELECT COUNT(*)::int AS count,
                COALESCE(SUM(GREATEST(p.sale_value - COALESCE(pay.paid, 0), 0)), 0)::bigint AS balance
         FROM pedidos p
         LEFT JOIN (SELECT pedido_id, SUM(amount) AS paid FROM pedido_payments GROUP BY pedido_id) pay
           ON pay.pedido_id = p.id
         WHERE p.status = 'open' AND COALESCE(pay.paid, 0) < p.sale_value`
      )
    ]);

    const storeRevenue = Number(store.revenue);
    const collectedAmount = Number(collected.amount);
    return {
      month: {
        // Lo que entró en el mes: tienda + abonos de encargos
        income: storeRevenue + collectedAmount,
        store: { revenue: storeRevenue, orders: store.orders, units: store.units },
        encargos: {
          count: sold.count,
          sales: Number(sold.sales),
          collected: collectedAmount,
          payments: collected.payments,
          delivered: delivered.count
        }
      },
      receivable: { count: receivable.count, balance: Number(receivable.balance) }
    };
  },

  async pedidoCounts() {
    const { rows } = await query(
      `SELECT CASE
                WHEN p.status = 'cancelled' THEN 'cancelled'
                WHEN p.tracking_stage = 'delivered' THEN 'delivered'
                WHEN COALESCE(pay.paid, 0) >= p.sale_value THEN 'paid'
                ELSE 'pending'
              END AS bucket,
              COUNT(*)::int AS count
       FROM pedidos p
       LEFT JOIN (SELECT pedido_id, SUM(amount) AS paid FROM pedido_payments GROUP BY pedido_id) pay
         ON pay.pedido_id = p.id
       GROUP BY 1`
    );
    const counts = { pending: 0, paid: 0, delivered: 0, cancelled: 0 };
    for (const row of rows) counts[row.bucket] = row.count;
    return counts;
  }
};
