import { query, queryOne } from '../db/pool.js';

const PRODUCT_FIELDS =
  'id, name, detail, description, category, price, currency, in_stock, stock, featured, active, position, created_at, updated_at';

const PHOTO_FIELDS = 'id, product_id, public_id, url, label, media_type, position';

const OPTION_FIELDS = 'id, product_id, name, option_values, position';
const VARIANT_FIELDS =
  'id, product_id, options, label, sku, price, stock, photo_id, active, position';

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

// Carga opciones y variantes por lote, como las fotos: un producto sin opciones
// simplemente queda con los dos arreglos vacíos y se comporta como siempre.
const attachVariants = async (products) => {
  if (products.length === 0) return products;
  const ids = products.map((p) => p.id);
  const [{ rows: options }, { rows: variants }] = await Promise.all([
    query(
      `SELECT ${OPTION_FIELDS} FROM product_options WHERE product_id = ANY($1) ORDER BY position, id`,
      [ids]
    ),
    query(
      `SELECT ${VARIANT_FIELDS} FROM product_variants WHERE product_id = ANY($1) ORDER BY position, id`,
      [ids]
    )
  ]);
  const optionsBy = new Map(products.map((p) => [p.id, []]));
  const variantsBy = new Map(products.map((p) => [p.id, []]));
  for (const row of options) optionsBy.get(row.product_id)?.push(row);
  for (const row of variants) variantsBy.get(row.product_id)?.push(row);
  return products.map((p) => ({
    ...p,
    options: optionsBy.get(p.id) ?? [],
    variants: variantsBy.get(p.id) ?? []
  }));
};

const withRelations = async (rows) => attachVariants(await attachPhotos(rows));

// No alcanzaban las unidades: el pedido no se crea. Lleva el detalle por línea
// para poder decirle al comprador cuántas quedan de cada cosa.
export class InsufficientStockError extends Error {
  constructor(shortages) {
    super('Sin stock suficiente');
    this.name = 'InsufficientStockError';
    this.shortages = shortages;
  }
}

// El descuento va en el mismo UPDATE que la condición, así que dos pedidos
// simultáneos por la última unidad se serializan en el row lock: uno gana y el
// otro no encuentra fila. stock NULL = sin límite, no se toca.
//
// Con variante el inventario sale de product_variants, no de products: si
// quedan 2 de un aroma y 0 de otro, descontar del total del producto
// despacharía algo que no existe.
const takeStock = async (client, { productId, variantId, quantity }) => {
  const { rows } = variantId
    ? await client.query(
        `UPDATE product_variants SET
           stock = CASE WHEN stock IS NULL THEN NULL ELSE stock - $3 END
         WHERE id = $1 AND product_id = $2 AND (stock IS NULL OR stock >= $3)
         RETURNING stock`,
        [variantId, productId, quantity]
      )
    : await client.query(
        `UPDATE products SET
           stock = CASE WHEN stock IS NULL THEN NULL ELSE stock - $2 END,
           updated_at = now()
         WHERE id = $1 AND (stock IS NULL OR stock >= $2)
         RETURNING stock`,
        [productId, quantity]
      );
  return rows.length > 0;
};

const availableStock = async (client, { productId, variantId }) => {
  const { rows } = variantId
    ? await client.query('SELECT stock FROM product_variants WHERE id = $1', [variantId])
    : await client.query('SELECT stock FROM products WHERE id = $1', [productId]);
  return rows[0]?.stock ?? 0;
};

// Unidades de un pedido agregadas por producto+variante, por si la misma
// combinación apareciera en más de una línea.
const orderQuantities = async (client, orderId) => {
  const { rows } = await client.query(
    `SELECT product_id, variant_id, product_name, variant_label, SUM(quantity)::int AS quantity
     FROM order_items WHERE order_id = $1
     GROUP BY product_id, variant_id, product_name, variant_label`,
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
      if (await takeStock(client, item)) continue;
      shortages.push({
        productId: item.productId,
        variantId: item.variantId ?? null,
        productName: item.variantLabel
          ? `${item.productName} (${item.variantLabel})`
          : item.productName,
        requested: item.quantity,
        available: await availableStock(client, item)
      });
    }
    if (shortages.length > 0) throw new InsufficientStockError(shortages);
  },

  // Devuelve al inventario lo retenido: a la variante si la línea la tenía, y al
  // producto si no.
  async releaseStockForOrder(client, orderId) {
    await client.query(
      `UPDATE product_variants v SET stock = v.stock + agg.quantity
       FROM (
         SELECT variant_id, SUM(quantity)::int AS quantity
         FROM order_items WHERE order_id = $1 AND variant_id IS NOT NULL
         GROUP BY variant_id
       ) agg
       WHERE v.id = agg.variant_id AND v.stock IS NOT NULL`,
      [orderId]
    );
    await client.query(
      `UPDATE products p SET stock = p.stock + agg.quantity, updated_at = now()
       FROM (
         SELECT product_id, SUM(quantity)::int AS quantity
         FROM order_items WHERE order_id = $1 AND variant_id IS NULL
         GROUP BY product_id
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
        variantId: row.variant_id,
        productName: row.product_name,
        variantLabel: row.variant_label,
        quantity: row.quantity
      }))
    );
  },

  async listAll() {
    const { rows } = await query(`SELECT ${PRODUCT_FIELDS} FROM products ORDER BY position, created_at`);
    return withRelations(rows);
  },

  async listActive() {
    const { rows } = await query(
      `SELECT ${PRODUCT_FIELDS} FROM products WHERE active = TRUE ORDER BY position, created_at`
    );
    return withRelations(rows);
  },

  async findById(id) {
    const row = await queryOne(`SELECT ${PRODUCT_FIELDS} FROM products WHERE id = $1`, [id]);
    if (!row) return null;
    const [full] = await withRelations([row]);
    return full;
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
    return { ...row, photos: [], options: [], variants: [] };
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
    const [full] = await withRelations([row]);
    return full;
  },

  async remove(id) {
    const { rowCount } = await query('DELETE FROM products WHERE id = $1', [id]);
    return rowCount > 0;
  },

  // ── Opciones y variantes ──────────────────────────────────────────────────
  // Las opciones se reemplazan enteras: son una lista corta y editarlas fila por
  // fila desde el panel obligaría a un diff que no aporta nada.
  async replaceOptions(productId, options) {
    await query('DELETE FROM product_options WHERE product_id = $1', [productId]);
    for (const [i, option] of options.entries()) {
      await query(
        `INSERT INTO product_options (product_id, name, option_values, position)
         VALUES ($1, $2, $3, $4)`,
        [productId, option.name, option.values, i]
      );
    }
    const { rows } = await query(
      `SELECT ${OPTION_FIELDS} FROM product_options WHERE product_id = $1 ORDER BY position, id`,
      [productId]
    );
    return rows;
  },

  async listVariants(productId) {
    const { rows } = await query(
      `SELECT ${VARIANT_FIELDS} FROM product_variants WHERE product_id = $1 ORDER BY position, id`,
      [productId]
    );
    return rows;
  },

  async findVariant(productId, variantId) {
    return queryOne(
      `SELECT ${VARIANT_FIELDS} FROM product_variants WHERE id = $1 AND product_id = $2`,
      [variantId, productId]
    );
  },

  async addVariant(productId, variant) {
    return queryOne(
      `INSERT INTO product_variants
         (product_id, options, label, sku, price, stock, photo_id, active, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               COALESCE((SELECT MAX(position) + 1 FROM product_variants WHERE product_id = $1), 0))
       RETURNING ${VARIANT_FIELDS}`,
      [
        productId,
        JSON.stringify(variant.options ?? {}),
        variant.label ?? '',
        variant.sku ?? null,
        variant.price ?? null,
        variant.stock ?? null,
        variant.photoId ?? null,
        variant.active ?? true
      ]
    );
  },

  async updateVariant(productId, variantId, variant) {
    return queryOne(
      `UPDATE product_variants SET
         options = $3, label = $4, sku = $5, price = $6, stock = $7,
         photo_id = $8, active = $9
       WHERE id = $1 AND product_id = $2
       RETURNING ${VARIANT_FIELDS}`,
      [
        variantId,
        productId,
        JSON.stringify(variant.options ?? {}),
        variant.label ?? '',
        variant.sku ?? null,
        variant.price ?? null,
        variant.stock ?? null,
        variant.photoId ?? null,
        variant.active ?? true
      ]
    );
  },

  async removeVariant(productId, variantId) {
    const { rowCount } = await query(
      'DELETE FROM product_variants WHERE id = $1 AND product_id = $2',
      [variantId, productId]
    );
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
