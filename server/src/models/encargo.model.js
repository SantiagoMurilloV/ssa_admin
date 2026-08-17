import { query, queryOne } from '../db/pool.js';

const FIELDS = 'id, producto, marca, color, talla, nombre, contacto, photo_url, photo_public_id, status, created_at';

export const EncargoModel = {
  async create(encargo) {
    return queryOne(
      `INSERT INTO encargos (producto, marca, color, talla, nombre, contacto, photo_public_id, photo_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${FIELDS}`,
      [
        encargo.producto,
        encargo.marca ?? null,
        encargo.color ?? null,
        encargo.talla ?? null,
        encargo.nombre,
        encargo.contacto,
        encargo.photoPublicId ?? null,
        encargo.photoUrl ?? null
      ]
    );
  },

  async list(status) {
    const where = status ? 'WHERE status = $1' : '';
    const params = status ? [status] : [];
    const { rows } = await query(
      `SELECT ${FIELDS} FROM encargos ${where} ORDER BY created_at DESC LIMIT 300`,
      params
    );
    return rows;
  },

  async counts() {
    const { rows } = await query('SELECT status, COUNT(*)::int AS count FROM encargos GROUP BY status');
    const counts = { nuevo: 0, contactado: 0, cerrado: 0 };
    for (const row of rows) counts[row.status] = row.count;
    return counts;
  },

  async updateStatus(id, status) {
    return queryOne(`UPDATE encargos SET status = $2 WHERE id = $1 RETURNING ${FIELDS}`, [id, status]);
  }
};
