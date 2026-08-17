import { query, queryOne } from '../db/pool.js';

const PRODUCT_FIELDS =
  'id, name, detail, description, category, price, currency, in_stock, featured, active, position, created_at, updated_at';

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

export const ProductModel = {
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
      `INSERT INTO products (id, name, detail, description, category, price, in_stock, featured, active, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
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
         in_stock = $7, featured = $8, active = $9, updated_at = now()
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
