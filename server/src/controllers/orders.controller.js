import { OrderModel } from '../models/order.model.js';
import { orderStatusSchema } from '../schemas/admin.schemas.js';
import { asyncHandler, HttpError, parseId } from '../middleware/errors.js';

export const OrdersController = {
  list: asyncHandler(async (req, res) => {
    const status = ['pending', 'paid', 'shipped'].includes(req.query.status)
      ? req.query.status
      : undefined;
    const [orders, counts] = await Promise.all([OrderModel.list(status), OrderModel.counts()]);
    res.json({ orders, counts });
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const payload = orderStatusSchema.parse(req.body);
    const order = await OrderModel.updateStatus(parseId(req.params.id), payload);
    if (!order) throw new HttpError(404, 'Pedido no encontrado');
    res.json({ order });
  })
};
