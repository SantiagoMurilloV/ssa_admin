import { TrackingModel } from '../models/tracking.model.js';
import { trackingSubscribeSchema, trackingUnsubscribeSchema } from '../schemas/public.schemas.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { ORDER_REFERENCE_PATTERN } from '../utils/order-reference.js';
import { pushEnabled } from '../services/push.service.js';
import { env } from '../config/env.js';

// La guía pública. Acepta el código como lo escribe la gente ("ssa 482913",
// "SSA482913") y lo normaliza al formato SSA-######.
export const normalizeReference = (raw) => {
  const compact = String(raw ?? '').toUpperCase().replace(/[\s_-]/g, '');
  const digits = compact.startsWith('SSA') ? compact.slice(3) : compact;
  return /^\d{6}$/.test(digits) ? `SSA-${digits}` : null;
};

const referenceParam = (req) => {
  const reference = normalizeReference(req.params.reference);
  if (!reference || !ORDER_REFERENCE_PATTERN.test(reference)) {
    throw new HttpError(422, 'El código debe tener el formato SSA-123456');
  }
  return reference;
};

export const TrackingController = {
  lookup: asyncHandler(async (req, res) => {
    const reference = referenceParam(req);
    const tracking = await TrackingModel.findByReference(reference);
    if (!tracking) throw new HttpError(404, 'No encontramos un pedido con ese código');
    res.json({
      tracking: {
        ...tracking,
        // Para que la tienda pueda suscribir al comprador sin otra ida y vuelta
        push: { enabled: pushEnabled, publicKey: pushEnabled ? env.vapid.publicKey : '' }
      }
    });
  }),

  subscribe: asyncHandler(async (req, res) => {
    const reference = referenceParam(req);
    if (!pushEnabled) throw new HttpError(503, 'Las notificaciones no están disponibles');
    const payload = trackingSubscribeSchema.parse(req.body);
    if (!(await TrackingModel.referenceExists(reference))) {
      throw new HttpError(404, 'No encontramos un pedido con ese código');
    }
    await TrackingModel.subscribe(reference, payload);
    res.status(201).json({ ok: true, reference });
  }),

  unsubscribe: asyncHandler(async (req, res) => {
    const reference = referenceParam(req);
    const { endpoint } = trackingUnsubscribeSchema.parse(req.body);
    await TrackingModel.unsubscribe(reference, endpoint);
    res.json({ ok: true });
  })
};
