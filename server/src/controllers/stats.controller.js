import { query, queryOne } from '../db/pool.js';
import { eventSchema } from '../schemas/public.schemas.js';
import { asyncHandler } from '../middleware/errors.js';
import { StatsModel } from '../models/stats.model.js';

export const StatsController = {
  recordEvent: asyncHandler(async (req, res) => {
    const { type } = eventSchema.parse(req.body);
    await query('INSERT INTO events (type) VALUES ($1)', [type]);
    res.status(202).json({ ok: true });
  }),

  dashboard: asyncHandler(async (req, res) => {
    const [funnelRows, seriesRows, orderCounts, finance, pedidoCounts, subscribers] = await Promise.all([
      query(
        `SELECT type, COUNT(*)::int AS count FROM events
         WHERE created_at >= now() - INTERVAL '7 days' GROUP BY type`
      ),
      query(
        `SELECT day::date AS day,
                COALESCE(v.views, 0) AS views,
                COALESCE(p.purchases, 0) AS purchases
         FROM generate_series(
                (now() AT TIME ZONE 'America/Bogota')::date - 13,
                (now() AT TIME ZONE 'America/Bogota')::date,
                '1 day') AS day
         LEFT JOIN (
           SELECT (created_at AT TIME ZONE 'America/Bogota')::date AS d, COUNT(*)::int AS views
           FROM events WHERE type = 'page_view' AND created_at >= now() - INTERVAL '15 days'
           GROUP BY 1
         ) v ON v.d = day
         LEFT JOIN (
           SELECT (created_at AT TIME ZONE 'America/Bogota')::date AS d, COUNT(*)::int AS purchases
           FROM events WHERE type = 'purchase' AND created_at >= now() - INTERVAL '15 days'
           GROUP BY 1
         ) p ON p.d = day
         ORDER BY day`
      ),
      query('SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status'),
      // Dinero del mes: tienda + encargos (ventas, abonos, por cobrar)
      StatsModel.finance(),
      StatsModel.pedidoCounts(),
      queryOne('SELECT COUNT(*)::int AS count FROM subscribers')
    ]);

    const funnel = { page_view: 0, product_view: 0, add_to_cart: 0, purchase: 0 };
    for (const row of funnelRows.rows) funnel[row.type] = row.count;

    const counts = { pending: 0, paid: 0, shipped: 0, cancelled: 0 };
    for (const row of orderCounts.rows) counts[row.status] = row.count;

    res.json({
      funnel,
      series: seriesRows.rows.map((row) => ({
        day: row.day,
        views: row.views,
        purchases: row.purchases
      })),
      orders: counts,
      pedidos: pedidoCounts,
      // revenue/orders/units se conservan (tienda) y se suman income y encargos
      month: {
        revenue: finance.month.store.revenue,
        orders: finance.month.store.orders,
        units: finance.month.store.units,
        income: finance.month.income,
        encargos: finance.month.encargos
      },
      receivable: finance.receivable,
      subscribers: subscribers.count
    });
  }),

  subscribers: asyncHandler(async (req, res) => {
    const { rows } = await query(
      'SELECT id, email, created_at FROM subscribers ORDER BY created_at DESC LIMIT 500'
    );
    res.json({ subscribers: rows });
  })
};
