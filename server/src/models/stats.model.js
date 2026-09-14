import { query, queryOne } from '../db/pool.js';

// Primer día del mes que se mira: el que pide el panel (AAAA-MM) o, si no
// manda nada, el mes en curso en hora de Colombia como el resto de las
// estadísticas. Va como $1 en todas las consultas de dinero del mes.
const MONTH_START = `COALESCE($1::date, date_trunc('month', (now() AT TIME ZONE 'America/Bogota')::date)::date)`;

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const isMonthKey = (value) => typeof value === 'string' && MONTH_KEY_RE.test(value);

// Dinero del negocio: la tienda cobra completo al confirmar el pago, así que su
// ingreso es el total de los pedidos pagados o enviados; los encargos se pagan
// por abonos, así que lo que entra es la suma de los abonos y lo vendido es el
// valor de venta. Ambos se miran por mes de Colombia y también en acumulado
// histórico (todo lo vendido y recibido desde el primer registro); el saldo por
// cobrar siempre es acumulado (lo que falta de todo encargo abierto).
export const StatsModel = {
  // `monthKey` es 'AAAA-MM' o null para el mes en curso
  async finance(monthKey = null) {
    const m = [isMonthKey(monthKey) ? `${monthKey}-01` : null];
    const [range, store, sold, collected, delivered, receivable, storeTotal, soldTotal, collectedTotal] =
      await Promise.all([
        // Mes elegido, mes en curso y primer mes con movimiento: con eso el panel arma el selector
        queryOne(
          `SELECT to_char(${MONTH_START}, 'YYYY-MM') AS key,
                  to_char(date_trunc('month', (now() AT TIME ZONE 'America/Bogota')::date), 'YYYY-MM') AS current,
                  to_char(LEAST(
                    (SELECT MIN((created_at AT TIME ZONE 'America/Bogota')::date) FROM orders WHERE status IN ('paid', 'shipped')),
                    (SELECT MIN(ordered_at) FROM pedidos WHERE status = 'open'),
                    (SELECT MIN(pp.paid_at) FROM pedido_payments pp JOIN pedidos p ON p.id = pp.pedido_id WHERE p.status = 'open'),
                    (now() AT TIME ZONE 'America/Bogota')::date
                  ), 'YYYY-MM') AS first`,
          m
        ),
        queryOne(
          `SELECT COALESCE(SUM(total), 0)::bigint AS revenue,
                  COUNT(*)::int AS orders,
                  COALESCE(SUM(quantity), 0)::int AS units
           FROM orders
           WHERE status IN ('paid', 'shipped')
             AND date_trunc('month', created_at AT TIME ZONE 'America/Bogota') = ${MONTH_START}`,
          m
        ),
        queryOne(
          `SELECT COUNT(*)::int AS count, COALESCE(SUM(sale_value), 0)::bigint AS sales
           FROM pedidos
           WHERE status = 'open' AND date_trunc('month', ordered_at) = ${MONTH_START}`,
          m
        ),
        queryOne(
          `SELECT COUNT(*)::int AS payments, COALESCE(SUM(pp.amount), 0)::bigint AS amount
           FROM pedido_payments pp
           JOIN pedidos p ON p.id = pp.pedido_id
           WHERE p.status = 'open' AND date_trunc('month', pp.paid_at) = ${MONTH_START}`,
          m
        ),
        // Entregados en el mes: la fecha vive en el historial de la guía
        queryOne(
          `SELECT COUNT(*)::int AS count
           FROM pedidos p
           WHERE p.status = 'open' AND p.tracking_stage = 'delivered'
             AND date_trunc('month', (
                   SELECT MAX((e->>'at')::timestamptz) FROM jsonb_array_elements(p.tracking_history) e
                   WHERE e->>'stage' = 'delivered'
                 ) AT TIME ZONE 'America/Bogota') = ${MONTH_START}`,
          m
        ),
        queryOne(
          `SELECT COUNT(*)::int AS count,
                  COALESCE(SUM(GREATEST(p.sale_value - COALESCE(pay.paid, 0), 0)), 0)::bigint AS balance
           FROM pedidos p
           LEFT JOIN (SELECT pedido_id, SUM(amount) AS paid FROM pedido_payments GROUP BY pedido_id) pay
             ON pay.pedido_id = p.id
           WHERE p.status = 'open' AND COALESCE(pay.paid, 0) < p.sale_value`
        ),
        // Histórico: lo mismo sin filtro de mes
        queryOne(
          `SELECT COALESCE(SUM(total), 0)::bigint AS revenue,
                  COUNT(*)::int AS orders,
                  COALESCE(SUM(quantity), 0)::int AS units
           FROM orders
           WHERE status IN ('paid', 'shipped')`
        ),
        queryOne(
          `SELECT COUNT(*)::int AS count, COALESCE(SUM(sale_value), 0)::bigint AS sales
           FROM pedidos WHERE status = 'open'`
        ),
        queryOne(
          `SELECT COUNT(*)::int AS payments, COALESCE(SUM(pp.amount), 0)::bigint AS amount
           FROM pedido_payments pp
           JOIN pedidos p ON p.id = pp.pedido_id
           WHERE p.status = 'open'`
        )
      ]);

    const storeRevenue = Number(store.revenue);
    const collectedAmount = Number(collected.amount);
    const storeRevenueTotal = Number(storeTotal.revenue);
    const collectedAmountTotal = Number(collectedTotal.amount);
    return {
      month: {
        key: range.key,
        current: range.current,
        first: range.first,
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
      // Acumulado desde el primer registro: tienda + abonos de encargos
      total: {
        income: storeRevenueTotal + collectedAmountTotal,
        store: { revenue: storeRevenueTotal, orders: storeTotal.orders, units: storeTotal.units },
        encargos: {
          count: soldTotal.count,
          sales: Number(soldTotal.sales),
          collected: collectedAmountTotal,
          payments: collectedTotal.payments
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
