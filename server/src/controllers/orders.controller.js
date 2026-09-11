import { OrderModel } from '../models/order.model.js';
import { InsufficientStockError } from '../models/product.model.js';
import { orderStatusSchema, trackingStageSchema } from '../schemas/admin.schemas.js';
import { notifyTrackingStage } from '../services/push.service.js';
import { sendPaymentConfirmed } from '../services/email.service.js';
import { asyncHandler, HttpError, parseId } from '../middleware/errors.js';
import { storageEnabled, deleteImage } from '../config/storage.js';

export const OrdersController = {
  list: asyncHandler(async (req, res) => {
    const status = ['pending', 'paid', 'shipped', 'cancelled'].includes(req.query.status)
      ? req.query.status
      : undefined;
    const [orders, counts] = await Promise.all([OrderModel.list(status), OrderModel.counts()]);
    res.json({ orders, counts });
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const payload = orderStatusSchema.parse(req.body);
    let order;
    try {
      order = await OrderModel.updateStatus(parseId(req.params.id), payload);
    } catch (error) {
      // Reactivar un pedido cancelado cuyas unidades ya se vendieron a otro
      if (error instanceof InsufficientStockError) {
        const detail = error.shortages
          .map((s) => `${s.productName}: quedan ${s.available}, el pedido pide ${s.requested}`)
          .join('; ');
        throw new HttpError(409, `No hay stock para reactivar este pedido (${detail})`);
      }
      throw error;
    }
    if (!order) throw new HttpError(404, 'Pedido no encontrado');

    // "Pago confirmado, tu pedido está en proceso". Solo al entrar a paid: si el
    // admin lo devuelve a pendiente y lo vuelve a confirmar, no se duplica el
    // correo. Fire-and-forget para no dejar colgado el panel si Resend tarda.
    const { previousStatus, previousTrackingStage, ...clean } = order;
    if (payload.status === 'paid' && previousStatus !== 'paid') sendPaymentConfirmed(order);
    // Marcar enviado avanza la guía a 'dispatched': quien siga el código se entera
    if (previousTrackingStage !== clean.tracking_stage) {
      notifyTrackingStage(clean.reference, clean.tracking_stage);
    }

    res.json({ order: clean });
  }),

  // Etapa de la guía pública del pedido de la tienda (EE. UU. → bodega → cliente)
  updateTracking: asyncHandler(async (req, res) => {
    const payload = trackingStageSchema.parse(req.body);
    const order = await OrderModel.setTrackingStage(parseId(req.params.id), payload);
    if (!order) throw new HttpError(404, 'Pedido no encontrado');
    const { previousTrackingStage, ...clean } = order;
    if (previousTrackingStage !== payload.stage) notifyTrackingStage(clean.reference, payload.stage);
    res.json({ order: clean });
  }),

  remove: asyncHandler(async (req, res) => {
    const order = await OrderModel.remove(parseId(req.params.id));
    if (!order) throw new HttpError(404, 'Pedido no encontrado');
    // Sin pedido nadie va a volver a mirar el comprobante: se borra del storage
    // para no acumular archivos huérfanos. Best-effort, como con las fotos.
    if (storageEnabled && order.receipt_public_id) {
      await deleteImage(order.receipt_public_id).catch(() => {});
    }
    res.json({ ok: true });
  })
};
