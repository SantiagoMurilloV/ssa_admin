import { PedidoModel, PEDIDO_BUCKETS } from '../models/pedido.model.js';
import { ClientModel } from '../models/client.model.js';
import {
  createPedidoSchema,
  updatePedidoSchema,
  pedidoPaymentSchema,
  pedidoStatusSchema,
  trackingStageSchema
} from '../schemas/admin.schemas.js';
import { asyncHandler, HttpError, parseId } from '../middleware/errors.js';
import { storageEnabled, uploadImage, deleteImage } from '../config/storage.js';
import { notifyTrackingStage } from '../services/push.service.js';
import { compactBody } from './clients.controller.js';

const PHOTO_FOLDER = 'pedidos';
const RECEIPT_FOLDER = 'pedido-receipts';

const uploadOrNull = async (file, folder) => {
  if (!file) return null;
  if (!storageEnabled) throw new HttpError(503, 'La subida de archivos no está disponible');
  return uploadImage(file.buffer, { folder, mimetype: file.mimetype });
};

const discard = (uploaded) =>
  uploaded?.publicId ? deleteImage(uploaded.publicId).catch(() => {}) : Promise.resolve();

// El cliente del encargo: uno existente por id, o el que se escribió en el
// formulario (reutilizando a la persona si el teléfono ya estaba registrado).
const resolveClient = async (payload) => {
  if (payload.clientId) {
    const client = await ClientModel.findById(payload.clientId);
    if (!client) throw new HttpError(404, 'Cliente no encontrado');
    return client;
  }
  return ClientModel.upsertByPhone({
    name: payload.clientName,
    phone: payload.clientPhone,
    email: payload.clientEmail,
    city: payload.clientCity
  });
};

export const PedidosController = {
  list: asyncHandler(async (req, res) => {
    const bucket = PEDIDO_BUCKETS.includes(req.query.status) ? req.query.status : undefined;
    const [pedidos, counts] = await Promise.all([PedidoModel.list(bucket), PedidoModel.counts()]);
    res.json({ pedidos, counts });
  }),

  // multipart: campos de texto + photo (producto) + receipt (desprendible)
  create: asyncHandler(async (req, res) => {
    const payload = createPedidoSchema.parse(compactBody(req.body));
    const client = await resolveClient(payload);

    const photoFile = req.files?.photo?.[0];
    const receiptFile = req.files?.receipt?.[0];
    if (receiptFile && !(payload.paidAmount > 0)) {
      throw new HttpError(422, 'Adjuntaste un desprendible pero no escribiste cuánto abonó');
    }
    const photo = await uploadOrNull(photoFile, PHOTO_FOLDER);
    let receipt = null;
    try {
      receipt = await uploadOrNull(receiptFile, RECEIPT_FOLDER);
      const pedido = await PedidoModel.create({
        clientId: client.id,
        brand: payload.brand,
        productRef: payload.productRef,
        photo,
        orderedAt: payload.orderedAt,
        saleValue: payload.saleValue,
        notes: payload.notes,
        payment:
          payload.paidAmount > 0
            ? {
                amount: payload.paidAmount,
                paidAt: payload.paidAt ?? payload.orderedAt,
                note: payload.paymentNote,
                receipt
              }
            : null
      });
      res.status(201).json({ pedido });
    } catch (error) {
      // Nada quedó en la base: los archivos ya subidos no deben quedar huérfanos
      await Promise.all([discard(photo), discard(receipt)]);
      throw error;
    }
  }),

  update: asyncHandler(async (req, res) => {
    const payload = updatePedidoSchema.parse(compactBody(req.body));
    if (payload.clientId && !(await ClientModel.findById(payload.clientId))) {
      throw new HttpError(404, 'Cliente no encontrado');
    }
    const pedido = await PedidoModel.update(parseId(req.params.id), payload);
    if (!pedido) throw new HttpError(404, 'Encargo no encontrado');
    res.json({ pedido });
  }),

  setPhoto: asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Falta la imagen (campo image)');
    const id = parseId(req.params.id);
    if (!(await PedidoModel.findById(id))) throw new HttpError(404, 'Encargo no encontrado');
    const uploaded = await uploadOrNull(req.file, PHOTO_FOLDER);
    const result = await PedidoModel.setPhoto(id, uploaded);
    if (!result) {
      await discard(uploaded);
      throw new HttpError(404, 'Encargo no encontrado');
    }
    if (result.previousPhotoPublicId) await deleteImage(result.previousPhotoPublicId).catch(() => {});
    res.json({ pedido: result.pedido });
  }),

  removePhoto: asyncHandler(async (req, res) => {
    const result = await PedidoModel.setPhoto(parseId(req.params.id), null);
    if (!result) throw new HttpError(404, 'Encargo no encontrado');
    if (storageEnabled && result.previousPhotoPublicId) {
      await deleteImage(result.previousPhotoPublicId).catch(() => {});
    }
    res.json({ pedido: result.pedido });
  }),

  // multipart opcional: amount, paidAt, note + image (desprendible)
  addPayment: asyncHandler(async (req, res) => {
    const payload = pedidoPaymentSchema.parse(compactBody(req.body));
    const id = parseId(req.params.id);
    const current = await PedidoModel.findById(id);
    if (!current) throw new HttpError(404, 'Encargo no encontrado');
    if (current.status === 'cancelled') throw new HttpError(409, 'El encargo está cancelado');
    if (payload.amount > current.balance) {
      throw new HttpError(422, `El abono supera lo que falta por pagar (${current.balance})`);
    }
    const receipt = await uploadOrNull(req.file, RECEIPT_FOLDER);
    try {
      const pedido = await PedidoModel.addPayment(id, { ...payload, receipt });
      if (!pedido) throw new HttpError(404, 'Encargo no encontrado');
      res.status(201).json({ pedido });
    } catch (error) {
      await discard(receipt);
      throw error;
    }
  }),

  removePayment: asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const paymentId = parseId(req.params.paymentId);
    const payment = await PedidoModel.findPayment(id, paymentId);
    if (!payment) throw new HttpError(404, 'Abono no encontrado');
    const pedido = await PedidoModel.removePayment(id, paymentId);
    if (storageEnabled && payment.receipt_public_id) {
      await deleteImage(payment.receipt_public_id).catch(() => {});
    }
    res.json({ pedido });
  }),

  // Cambiar la etapa de la guía: se avisa por push a quien siga ese código,
  // pero solo cuando la etapa realmente cambió.
  updateTracking: asyncHandler(async (req, res) => {
    const payload = trackingStageSchema.parse(compactBody(req.body));
    const result = await PedidoModel.setTrackingStage(parseId(req.params.id), payload);
    if (!result) throw new HttpError(404, 'Encargo no encontrado');
    if (result.previousStage !== payload.stage) {
      notifyTrackingStage(result.pedido.reference, payload.stage);
    }
    res.json({ pedido: result.pedido });
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const { status } = pedidoStatusSchema.parse(req.body);
    const pedido = await PedidoModel.setStatus(parseId(req.params.id), status);
    if (!pedido) throw new HttpError(404, 'Encargo no encontrado');
    res.json({ pedido });
  }),

  remove: asyncHandler(async (req, res) => {
    const removed = await PedidoModel.remove(parseId(req.params.id));
    if (!removed) throw new HttpError(404, 'Encargo no encontrado');
    if (storageEnabled) {
      await Promise.allSettled(
        [removed.photoPublicId, ...removed.receiptPublicIds]
          .filter(Boolean)
          .map((publicId) => deleteImage(publicId))
      );
    }
    res.json({ ok: true });
  })
};
