import { PromotionModel } from '../models/promotion.model.js';
import { promotionSchema } from '../schemas/admin.schemas.js';
import { asyncHandler, HttpError, parseId } from '../middleware/errors.js';

export const PromotionsController = {
  list: asyncHandler(async (req, res) => {
    res.json({ promotions: await PromotionModel.list() });
  }),

  create: asyncHandler(async (req, res) => {
    const payload = promotionSchema.parse(req.body);
    if (payload.endsAt < payload.startsAt) throw new HttpError(422, 'La fecha final es anterior a la inicial');
    res.status(201).json({ promotion: await PromotionModel.create(payload) });
  }),

  update: asyncHandler(async (req, res) => {
    const payload = promotionSchema.parse(req.body);
    if (payload.endsAt < payload.startsAt) throw new HttpError(422, 'La fecha final es anterior a la inicial');
    const promotion = await PromotionModel.update(parseId(req.params.id), payload);
    if (!promotion) throw new HttpError(404, 'Promoción no encontrada');
    res.json({ promotion });
  }),

  remove: asyncHandler(async (req, res) => {
    const removed = await PromotionModel.remove(parseId(req.params.id));
    if (!removed) throw new HttpError(404, 'Promoción no encontrada');
    res.json({ ok: true });
  })
};
