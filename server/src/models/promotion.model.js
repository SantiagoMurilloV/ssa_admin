import { query, queryOne } from '../db/pool.js';

const FIELDS = 'id, name, discount_pct, starts_at, ends_at, active, created_at';

export const PromotionModel = {
  async list() {
    const { rows } = await query(`SELECT ${FIELDS} FROM promotions ORDER BY starts_at DESC`);
    return rows;
  },

  // Promoción vigente hoy en hora de Colombia
  async findActive() {
    return queryOne(
      `SELECT ${FIELDS} FROM promotions
       WHERE active = TRUE
         AND (now() AT TIME ZONE 'America/Bogota')::date BETWEEN starts_at AND ends_at
       ORDER BY discount_pct DESC LIMIT 1`
    );
  },

  async create({ name, discountPct, startsAt, endsAt, active }) {
    return queryOne(
      `INSERT INTO promotions (name, discount_pct, starts_at, ends_at, active)
       VALUES ($1,$2,$3,$4,$5) RETURNING ${FIELDS}`,
      [name, discountPct, startsAt, endsAt, active]
    );
  },

  async update(id, { name, discountPct, startsAt, endsAt, active }) {
    return queryOne(
      `UPDATE promotions SET name=$2, discount_pct=$3, starts_at=$4, ends_at=$5, active=$6
       WHERE id=$1 RETURNING ${FIELDS}`,
      [id, name, discountPct, startsAt, endsAt, active]
    );
  },

  async remove(id) {
    const { rowCount } = await query('DELETE FROM promotions WHERE id = $1', [id]);
    return rowCount > 0;
  }
};

export const discountedPrice = (price, promotion) =>
  promotion ? Math.round(price * (1 - promotion.discount_pct / 100)) : price;
