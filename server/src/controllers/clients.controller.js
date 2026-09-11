import { ClientModel } from '../models/client.model.js';
import { PedidoModel } from '../models/pedido.model.js';
import { clientSchema } from '../schemas/admin.schemas.js';
import { asyncHandler, HttpError, parseId } from '../middleware/errors.js';
import { phoneDigits } from '../utils/phone.js';

// Los campos vacíos del formulario llegan como '' y el schema los quiere
// ausentes: así "sin correo" no falla la validación de email.
export const compactBody = (body) =>
  Object.fromEntries(
    Object.entries(body ?? {}).filter(([, value]) => value !== '' && value !== null)
  );

const duplicatePhone = (error) =>
  error?.code === '23505' ? new HttpError(409, 'Ya hay un cliente con ese teléfono') : error;

export const ClientsController = {
  list: asyncHandler(async (req, res) => {
    const clients = await ClientModel.list(typeof req.query.q === 'string' ? req.query.q : '');
    res.json({ clients });
  }),

  // Ficha completa: datos + historial de encargos del panel y compras en la
  // tienda (cruzadas por teléfono).
  get: asyncHandler(async (req, res) => {
    const client = await ClientModel.findById(parseId(req.params.id));
    if (!client) throw new HttpError(404, 'Cliente no encontrado');
    const [pedidos, orders] = await Promise.all([
      PedidoModel.listByClient(client.id),
      ClientModel.storeOrders(client.phone_digits)
    ]);
    res.json({ client, pedidos, orders });
  }),

  create: asyncHandler(async (req, res) => {
    const payload = clientSchema.parse(compactBody(req.body));
    if (!phoneDigits(payload.phone)) throw new HttpError(422, 'El teléfono debe tener números');
    try {
      res.status(201).json({ client: await ClientModel.create(payload) });
    } catch (error) {
      throw duplicatePhone(error);
    }
  }),

  update: asyncHandler(async (req, res) => {
    const payload = clientSchema.parse(compactBody(req.body));
    if (!phoneDigits(payload.phone)) throw new HttpError(422, 'El teléfono debe tener números');
    try {
      const client = await ClientModel.update(parseId(req.params.id), payload);
      if (!client) throw new HttpError(404, 'Cliente no encontrado');
      res.json({ client });
    } catch (error) {
      throw duplicatePhone(error);
    }
  }),

  remove: asyncHandler(async (req, res) => {
    try {
      const removed = await ClientModel.remove(parseId(req.params.id));
      if (!removed) throw new HttpError(404, 'Cliente no encontrado');
      res.json({ ok: true });
    } catch (error) {
      // 23503 = tiene encargos: se conserva para no perder el historial
      if (error?.code === '23503') {
        throw new HttpError(409, 'Este cliente tiene encargos. Cancélalos o elimínalos antes de borrarlo.');
      }
      throw error;
    }
  })
};
