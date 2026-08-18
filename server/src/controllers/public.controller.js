import { ProductModel, InsufficientStockError } from '../models/product.model.js';
import { OrderModel } from '../models/order.model.js';
import { EncargoModel } from '../models/encargo.model.js';
import { PromotionModel, discountedPrice } from '../models/promotion.model.js';
import { SettingsModel, SETTINGS_KEYS } from '../models/settings.model.js';
import { normalizeShippingConfig, resolveShippingFee } from '../config/shipping-config.js';
import { normalizePaymentChannels, publicPaymentChannels } from '../config/payment-channels.js';
import { createOrderSchema, createEncargoSchema, subscribeSchema } from '../schemas/public.schemas.js';
import { storageEnabled, uploadImage, deleteImage } from '../config/storage.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { notifyNewOrder, notifyNewEncargo } from '../services/push.service.js';
import { sendReceiptReceived } from '../services/email.service.js';
import { receiptTokenMatches } from '../utils/order-reference.js';
import { query } from '../db/pool.js';

const publicPhoto = (photo) => ({
  id: photo.id,
  url: photo.url,
  label: photo.label,
  mediaType: photo.media_type
});

const publicProduct = (product, promotion) => ({
  id: product.id,
  name: product.name,
  detail: product.detail,
  description: product.description,
  category: product.category,
  currency: product.currency,
  inStock: product.in_stock,
  featured: product.featured,
  // null = sin límite. Se expone para poder avisar "últimas N unidades".
  stock: product.stock,
  basePrice: product.price,
  price: discountedPrice(product.price, promotion),
  photos: product.photos.map(publicPhoto),
  options: (product.options ?? []).map((option) => ({
    name: option.name,
    values: option.option_values
  })),
  // Solo variantes activas y con stock: si un aroma se agotó, la tienda no debe
  // ni ofrecerlo en el selector.
  variants: (product.variants ?? [])
    .filter((variant) => variant.active && !isVariantSoldOut(variant))
    .map((variant) => ({
      id: variant.id,
      options: variant.options,
      label: variant.label,
      stock: variant.stock,
      photoId: variant.photo_id,
      // price null hereda el del producto, con el descuento vigente aplicado
      basePrice: variant.price ?? product.price,
      price: discountedPrice(variant.price ?? product.price, promotion)
    }))
});

const isVariantSoldOut = (variant) => variant.stock !== null && variant.stock <= 0;

// Agotado: el producto sigue existiendo en el admin pero la tienda no lo ofrece.
// Si tiene opciones configuradas manda el inventario de las variantes, y como
// publicProduct ya descartó las agotadas, quedarse sin ninguna significa que no
// hay nada que vender. Se mira options y no variants porque la lista filtrada
// llega vacía tanto si nunca tuvo variantes como si todas se agotaron.
const isSoldOut = (product) =>
  product.options.length > 0
    ? product.variants.length === 0
    : product.stock !== null && product.stock <= 0;

const loadShippingConfig = async () =>
  normalizeShippingConfig(await SettingsModel.getJson(SETTINGS_KEYS.shippingConfig));

const loadPaymentChannels = async () =>
  normalizePaymentChannels(await SettingsModel.getJson(SETTINGS_KEYS.paymentChannels));

export const PublicController = {
  catalog: asyncHandler(async (req, res) => {
    const [products, promotion, shipping, channels] = await Promise.all([
      ProductModel.listActive(),
      PromotionModel.findActive(),
      loadShippingConfig(),
      loadPaymentChannels()
    ]);
    const publicProducts = products
      .map((p) => publicProduct(p, promotion))
      .filter((p) => !isSoldOut(p));
    const categories = [...new Set(publicProducts.map((p) => p.category))];
    res.json({
      products: publicProducts,
      categories,
      shipping,
      promotion: promotion
        ? {
            id: promotion.id,
            name: promotion.name,
            discountPct: promotion.discount_pct,
            endsAt: promotion.ends_at
          }
        : null,
      paymentChannels: publicPaymentChannels(channels)
    });
  }),

  createOrder: asyncHandler(async (req, res) => {
    const payload = createOrderSchema.parse(req.body);
    const [products, promotion, shippingConfig, channels] = await Promise.all([
      ProductModel.listActive(),
      PromotionModel.findActive(),
      loadShippingConfig(),
      loadPaymentChannels()
    ]);
    const byId = new Map(products.map((p) => [p.id, p]));

    // El precio SIEMPRE se recalcula server-side: el cliente solo dicta qué,
    // cuál variante y cuántas unidades.
    const items = payload.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) {
        throw new HttpError(422, 'Producto no disponible', [
          { field: 'items', message: `Producto no disponible: ${item.productId}` }
        ]);
      }
      const variants = product.variants ?? [];
      const variant = item.variantId
        ? variants.find((v) => v.id === item.variantId && v.active)
        : null;
      if (item.variantId && !variant) {
        throw new HttpError(422, 'Opción no disponible', [
          { field: 'items', message: `Esa opción de ${product.name} ya no está disponible` }
        ]);
      }
      // Con opciones configuradas hay que elegir una: sin variante no sabríamos
      // qué talla o aroma despachar.
      if (!variant && variants.length > 0) {
        throw new HttpError(422, 'Falta elegir una opción', [
          { field: 'items', message: `Elige una opción de ${product.name}` }
        ]);
      }
      return {
        productId: product.id,
        productName: product.name,
        variantId: variant?.id ?? null,
        variantLabel: variant?.label ?? null,
        unitPrice: discountedPrice(variant?.price ?? product.price, promotion),
        quantity: item.quantity
      };
    });

    const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const shippingFee = resolveShippingFee(payload.shipping.city, shippingConfig);
    const total = subtotal + shippingFee;

    const activeChannels = publicPaymentChannels(channels);
    const channel = activeChannels.find((ch) => ch.id === payload.paymentChannelId) ?? null;

    let order;
    try {
      order = await OrderModel.create(
        {
          customerName: payload.customer.fullName,
          phone: payload.customer.phone,
          email: payload.customer.email,
          department: payload.shipping.department,
          city: payload.shipping.city,
          address: payload.shipping.address,
          notes: payload.shipping.notes,
          paymentChannel: channel ? channel.label : null,
          quantity,
          subtotal,
          shippingFee,
          total
        },
        items
      );
    } catch (error) {
      // Otro comprador se llevó las unidades mientras este llenaba el checkout.
      // 409 con el detalle por producto para que la tienda pueda decir cuántas
      // quedan y el comprador ajuste su carrito.
      if (error instanceof InsufficientStockError) {
        throw new HttpError(
          409,
          'Se agotaron unidades mientras completabas el pedido',
          error.shortages.map((s) => ({
            field: 'items',
            productId: s.productId,
            available: s.available,
            message:
              s.available === 0
                ? `${s.productName} se agotó`
                : `De ${s.productName} solo ${s.available === 1 ? 'queda 1 unidad' : `quedan ${s.available} unidades`}`
          }))
        );
      }
      throw error;
    }

    // El pedido por transferencia cuenta como purchase al crearse
    await query('INSERT INTO events (type) VALUES ($1)', ['purchase']);
    notifyNewOrder(order);

    res.status(201).json({
      order: {
        reference: order.reference,
        subtotal: order.subtotal,
        shippingFee: order.shipping_fee,
        total: order.total,
        status: order.status,
        paymentStatus: order.payment_status,
        // Credencial para adjuntar el comprobante de este pedido.
        // Solo se entrega aquí, al comprador que acaba de crearlo.
        receiptToken: order.receiptToken
      },
      paymentChannels: activeChannels
    });
  }),

  uploadReceipt: asyncHandler(async (req, res) => {
    if (!storageEnabled) throw new HttpError(503, 'La subida de archivos no está disponible');
    if (!req.file) throw new HttpError(400, 'Falta la imagen del comprobante');

    const auth = await OrderModel.findAuthByReference(req.params.reference);
    // Mismo error para "no existe" y "token equivocado": si distinguiéramos,
    // recorrer las referencias revelaría qué pedidos existen y en qué estado.
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const authorized =
      auth &&
      (auth.receipt_token === null // pedidos creados antes del token
        ? true
        : receiptTokenMatches(auth.receipt_token, token));
    if (!authorized) throw new HttpError(404, 'Pedido no encontrado');
    if (auth.payment_status === 'verified') {
      throw new HttpError(409, 'El pago de este pedido ya fue verificado');
    }

    const uploaded = await uploadImage(req.file.buffer, {
      folder: 'receipts',
      mimetype: req.file.mimetype
    });
    const previousPublicId = auth.receipt_public_id;
    const updated = await OrderModel.attachReceipt(auth.id, uploaded);
    if (!updated) {
      // Otra subida ganó la carrera (o el admin verificó en medio): no dejamos
      // el archivo recién subido colgando en el storage.
      await deleteImage(uploaded.publicId).catch(() => {});
      throw new HttpError(409, 'El pago de este pedido ya fue verificado');
    }
    // El comprobante viejo ya no se puede consultar: se borra para no acumular
    // archivos que nadie va a mirar.
    if (previousPublicId && previousPublicId !== uploaded.publicId) {
      await deleteImage(previousPublicId).catch(() => {});
    }

    // "Gracias por tu pedido, tu pago está pendiente por confirmar". Solo en la
    // primera subida: si el comprador reemplaza el comprobante no le llega otra
    // vez el mismo correo. Fire-and-forget para no retrasarle la respuesta.
    if (auth.payment_status === 'awaiting_receipt') sendReceiptReceived(updated);

    res.json({
      ok: true,
      order: {
        reference: updated.reference,
        paymentStatus: updated.payment_status,
        receiptUrl: updated.receipt_url
      }
    });
  }),

  createEncargo: asyncHandler(async (req, res) => {
    const payload = createEncargoSchema.parse(
      req.file ? { ...req.body } : req.body ?? {}
    );
    let photo = {};
    if (req.file) {
      if (!storageEnabled) throw new HttpError(503, 'La subida de archivos no está disponible');
      const uploaded = await uploadImage(req.file.buffer, {
        folder: 'encargos',
        mimetype: req.file.mimetype
      });
      photo = { photoPublicId: uploaded.publicId, photoUrl: uploaded.url };
    }
    let encargo;
    try {
      encargo = await EncargoModel.create({ ...payload, ...photo });
    } catch (error) {
      // La foto ya está en el storage pero el encargo no existe: la borramos
      if (photo.photoPublicId) await deleteImage(photo.photoPublicId).catch(() => {});
      throw error;
    }
    notifyNewEncargo(encargo);
    res.status(201).json({ ok: true, encargo: { id: encargo.id, status: encargo.status } });
  }),

  subscribe: asyncHandler(async (req, res) => {
    const { email } = subscribeSchema.parse(req.body);
    await query(
      'INSERT INTO subscribers (email) VALUES ($1) ON CONFLICT (email) DO NOTHING',
      [email.toLowerCase()]
    );
    res.status(201).json({ ok: true });
  })
};
