import { query, queryOne } from '../db/pool.js';

const PRODUCT_FIELDS =
  'id, name, detail, description, category, price, currency, in_stock, stock, featured, active, position, created_at, updated_at';

const PHOTO_FIELDS = 'id, product_id, public_id, url, label, media_type, position';

const attachPhotos = async (products) => {
  if (products.length === 0) return products;
  const ids = products.map((p) => p.id);
  const { rows: photos } = await query(
    `SELECT ${PHOTO_FIELDS} FROM product_photos
     WHERE product_id = ANY($1) ORDER BY position, id`,
    [ids]
  );
  const byProduct = new Map(products.map((p) => [p.id, []]));
  for (const photo of photos) byProduct.get(photo.product_id)?.push(photo);
  return products.map((p) => ({ ...p, photos: byProduct.get(p.id) ?? [] }));
};

// No alcanzaban las unidades: el pedido no se crea. Lleva el detalle por
// producto para poder decirle al comprador cuántas quedan.
export class InsufficientStockError extends Error {
  constructor(shortages) {
    super('Sin stock suficiente');
    this.name = 'InsufficientStockError';
    this.shortages = shortages;
  }
}

// Retiene unidades dentro de una transacción ya abierta. El descuento va en el
// mismo UPDATE que la condición, así que dos pedidos simultáneos por la última
// unidad se serializan en el row lock: uno gana y el otro no encuentra fila.
// stock NULL = sin límite, no se toca.
const takeStock = async (client, productId, quantity) => {
  const { rows } = await client.query(
    `UPDATE products SET
       stock = CASE WHEN stock IS NULL THEN NULL ELSE stock - $2 END,
       updated_at = now()
     WHERE id = $1 AND (stock IS NULL OR stock >= $2)
     RETURNING stock`,
    [productId, quantity]
  );
  return rows.length > 0;
};

// Unidades por producto de un pedido, agregadas por si un producto apareciera
// en más de una línea.
const orderQuantities = async (client, orderId) => {
  const { rows } = await client.query(
    `SELECT product_id, product_name, SUM(quantity)::int AS quantity
     FROM order_items WHERE order_id = $1 GROUP BY product_id, product_name`,
    [orderId]
  );
  return rows;
};

export const ProductModel = {
  // Retiene el inventario de un pedido entero o lanza InsufficientStockError.
  // Se llama dentro de la transacción que crea (o reactiva) el pedido.
  async takeStockForItems(client, items) {
    const shortages = [];
    for (const item of items) {
      const ok = await takeStock(client, item.productId, item.quantity);
      if (!ok) {
        const { rows } = await client.query('SELECT stock FROM products WHERE id = $1', [
          item.productId
        ]);
        shortages.push({
          productId: item.productId,
          productName: item.productName,
          requested: item.quantity,
          available: rows[0]?.stock ?? 0
        });
      }
    }
    if (shortages.length > 0) throw new InsufficientStockError(shortages);
  },

  // Devuelve al inventario lo que el pedido tenía retenido.
  async releaseStockForOrder(client, orderId) {
    await client.query(
      `UPDATE products p SET stock = p.stock + agg.quantity, updated_at = now()
       FROM (
         SELECT product_id, SUM(quantity)::int AS quantity
         FROM order_items WHERE order_id = $1 GROUP BY product_id
       ) agg
       WHERE p.id = agg.product_id AND p.stock IS NOT NULL`,
      [orderId]
    );
  },

  // Vuelve a retener el inventario de un pedido que se saca de 'cancelled'.
  async takeStockForOrder(client, orderId) {
    const items = await orderQuantities(client, orderId);
    await this.takeStockForItems(
      client,
      items.map((row) => ({
        productId: row.product_id,
        productName: row.product_name,
        quantity: row.quantity
      }))
    );
  },

  async listAll() {
    const { rows } = await query(`SELECT ${PRODUCT_FIELDS} FROM products ORDER BY position, created_at`);
    return attachPhotos(rows);
  },

  async listActive() {
    const { rows } = await query(
      `SELECT ${PRODUCT_FIELDS} FROM products WHERE active = TRUE ORDER BY position, created_at`
    );
    return attachPhotos(rows);
  },

  async findById(id) {
    const row = await queryOne(`SELECT ${PRODUCT_FIELDS} FROM products WHERE id = $1`, [id]);
    if (!row) return null;
    const [withPhotos] = await attachPhotos([row]);
    return withPhotos;
  },

  async create(product) {
    const row = await queryOne(
      `INSERT INTO products (id, name, detail, description, category, price, in_stock, stock, featured, active, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               COALESCE((SELECT MAX(position) + 1 FROM products), 0))
       RETURNING ${PRODUCT_FIELDS}`,
      [
        product.id,
        product.name,
        product.detail,
        product.description,
        product.category,
        product.price,
        product.inStock,
        product.stock ?? null,
        product.featured,
        product.active
      ]
    );
    return { ...row, photos: [] };
  },

  async update(id, product) {
    const row = await queryOne(
      `UPDATE products SET
         name = $2, detail = $3, description = $4, category = $5, price = $6,
         in_stock = $7, stock = $8, featured = $9, active = $10, updated_at = now()
       WHERE id = $1
       RETURNING ${PRODUCT_FIELDS}`,
      [
        id,
        product.name,
        product.detail,
        product.description,
        product.category,
        product.price,
        product.inStock,
        product.stock ?? null,
        product.featured,
        product.active
      ]
    );
    if (!row) return null;
    const [withPhotos] = await attachPhotos([row]);
    return withPhotos;
  },

  async remove(id) {
    const { rowCount } = await query('DELETE FROM products WHERE id = $1', [id]);
    return rowCount > 0;
  },

  async addPhoto(productId, { publicId, url, label, mediaType }) {
    return queryOne(
      `INSERT INTO product_photos (product_id, public_id, url, label, media_type, position)
       VALUES ($1, $2, $3, $4, $5,
               COALESCE((SELECT MAX(position) + 1 FROM product_photos WHERE product_id = $1), 0))
       RETURNING ${PHOTO_FIELDS}`,
      [productId, publicId, url, label ?? null, mediaType ?? 'image']
    );
  },

  async findPhoto(productId, photoId) {
    return queryOne(
      `SELECT ${PHOTO_FIELDS} FROM product_photos WHERE id = $1 AND product_id = $2`,
      [photoId, productId]
    );
  },

  async removePhoto(productId, photoId) {
    const { rowCount } = await query(
      'DELETE FROM product_photos WHERE id = $1 AND product_id = $2',
      [photoId, productId]
    );
    return rowCount > 0;
  }
};
