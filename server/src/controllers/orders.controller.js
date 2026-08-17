import { OrderModel } from '../models/order.model.js';
import { InsufficientStockError } from '../models/product.model.js';
import { orderStatusSchema } from '../schemas/admin.schemas.js';
import { asyncHandler, HttpError, parseId } from '../middleware/errors.js';

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
    res.json({ order });
  })
};
