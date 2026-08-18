import { ProductModel } from '../models/product.model.js';
import {
  productSchema,
  productOptionsSchema,
  productVariantSchema
} from '../schemas/admin.schemas.js';
import { asyncHandler, HttpError, parseId } from '../middleware/errors.js';
import {
  storageEnabled,
  uploadImage,
  uploadVideo,
  deleteImage,
  deleteVideo
} from '../config/storage.js';
import { isVideoMime } from '../middleware/upload.js';

const MAX_VIDEO_SECONDS = 30;

const slugify = (name) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'producto';

// Una variante solo puede apuntar a una foto del mismo producto: con un id ajeno
// la tienda mostraría la foto de otro producto al elegir la variante.
const assertPhotoBelongs = async (product, photoId) => {
  if (photoId === null || photoId === undefined) return;
  if (!product.photos.some((photo) => photo.id === photoId)) {
    throw new HttpError(422, 'La foto no pertenece a este producto');
  }
};

export const ProductsController = {
  list: asyncHandler(async (req, res) => {
    res.json({ products: await ProductModel.listAll() });
  }),

  create: asyncHandler(async (req, res) => {
    const payload = productSchema.parse(req.body);
    let id = payload.id ?? slugify(payload.name);
    if (await ProductModel.findById(id)) {
      id = `${id}-${Date.now().toString(36).slice(-4)}`;
    }
    const product = await ProductModel.create({
      id,
      name: payload.name,
      detail: payload.detail,
      description: payload.description,
      category: payload.category,
      price: payload.price,
      inStock: payload.inStock,
      stock: payload.stock,
      featured: payload.featured,
      active: payload.active
    });
    res.status(201).json({ product });
  }),

  update: asyncHandler(async (req, res) => {
    const payload = productSchema.parse(req.body);
    const product = await ProductModel.update(req.params.id, {
      name: payload.name,
      detail: payload.detail,
      description: payload.description,
      category: payload.category,
      price: payload.price,
      inStock: payload.inStock,
      stock: payload.stock,
      featured: payload.featured,
      active: payload.active
    });
    if (!product) throw new HttpError(404, 'Producto no encontrado');
    res.json({ product });
  }),

  remove: asyncHandler(async (req, res) => {
    const product = await ProductModel.findById(req.params.id);
    if (!product) throw new HttpError(404, 'Producto no encontrado');
    await ProductModel.remove(product.id);
    if (storageEnabled) {
      await Promise.allSettled(
        product.photos.map((photo) =>
          photo.media_type === 'video' ? deleteVideo(photo.public_id) : deleteImage(photo.public_id)
        )
      );
    }
    res.json({ ok: true });
  }),

  // ── Opciones y variantes ──────────────────────────────────────────────────
  setOptions: asyncHandler(async (req, res) => {
    const { options } = productOptionsSchema.parse(req.body);
    const product = await ProductModel.findById(req.params.id);
    if (!product) throw new HttpError(404, 'Producto no encontrado');
    // Dos opciones con el mismo nombre romperían la clave de la combinación
    const names = options.map((o) => o.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      throw new HttpError(422, 'No puede haber dos opciones con el mismo nombre');
    }
    const saved = await ProductModel.replaceOptions(product.id, options);
    res.json({ options: saved });
  }),

  listVariants: asyncHandler(async (req, res) => {
    const product = await ProductModel.findById(req.params.id);
    if (!product) throw new HttpError(404, 'Producto no encontrado');
    res.json({ variants: await ProductModel.listVariants(product.id) });
  }),

  addVariant: asyncHandler(async (req, res) => {
    const payload = productVariantSchema.parse(req.body);
    const product = await ProductModel.findById(req.params.id);
    if (!product) throw new HttpError(404, 'Producto no encontrado');
    await assertPhotoBelongs(product, payload.photoId);
    try {
      const variant = await ProductModel.addVariant(product.id, payload);
      res.status(201).json({ variant });
    } catch (error) {
      // 23505 = índice único de la combinación
      if (error.code === '23505') {
        throw new HttpError(409, 'Ya existe una variante con esa combinación');
      }
      throw error;
    }
  }),

  updateVariant: asyncHandler(async (req, res) => {
    const payload = productVariantSchema.parse(req.body);
    const product = await ProductModel.findById(req.params.id);
    if (!product) throw new HttpError(404, 'Producto no encontrado');
    await assertPhotoBelongs(product, payload.photoId);
    try {
      const variant = await ProductModel.updateVariant(
        product.id,
        parseId(req.params.variantId),
        payload
      );
      if (!variant) throw new HttpError(404, 'Variante no encontrada');
      res.json({ variant });
    } catch (error) {
      if (error.code === '23505') {
        throw new HttpError(409, 'Ya existe una variante con esa combinación');
      }
      throw error;
    }
  }),

  removeVariant: asyncHandler(async (req, res) => {
    const removed = await ProductModel.removeVariant(
      req.params.id,
      parseId(req.params.variantId)
    );
    if (!removed) throw new HttpError(404, 'Variante no encontrada');
    res.json({ ok: true });
  }),

  addPhoto: asyncHandler(async (req, res) => {
    if (!storageEnabled) throw new HttpError(503, 'La subida de archivos no está disponible');
    if (!req.file) throw new HttpError(400, 'Falta el archivo (campo image)');
    const product = await ProductModel.findById(req.params.id);
    if (!product) throw new HttpError(404, 'Producto no encontrado');

    let uploaded;
    let mediaType = 'image';
    if (isVideoMime(req.file.mimetype)) {
      uploaded = await uploadVideo(req.file.buffer, {
        folder: 'product',
        mimetype: req.file.mimetype
      });
      mediaType = 'video';
      if (uploaded.duration > MAX_VIDEO_SECONDS) {
        await deleteVideo(uploaded.publicId).catch(() => {});
        throw new HttpError(400, `El video no puede durar más de ${MAX_VIDEO_SECONDS} segundos`);
      }
    } else {
      uploaded = await uploadImage(req.file.buffer, {
        folder: 'product',
        mimetype: req.file.mimetype
      });
    }

    const photo = await ProductModel.addPhoto(product.id, {
      publicId: uploaded.publicId,
      url: uploaded.url,
      label: req.body?.label,
      mediaType
    });
    res.status(201).json({ photo });
  }),

  removePhoto: asyncHandler(async (req, res) => {
    const photo = await ProductModel.findPhoto(req.params.id, parseId(req.params.photoId));
    if (!photo) throw new HttpError(404, 'Foto no encontrada');
    await ProductModel.removePhoto(req.params.id, photo.id);
    if (storageEnabled) {
      const destroy = photo.media_type === 'video' ? deleteVideo : deleteImage;
      await destroy(photo.public_id).catch(() => {});
    }
    res.json({ ok: true });
  })
};
