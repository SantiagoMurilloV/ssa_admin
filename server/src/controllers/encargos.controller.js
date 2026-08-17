import { EncargoModel } from '../models/encargo.model.js';
import { encargoStatusSchema } from '../schemas/admin.schemas.js';
import { asyncHandler, HttpError, parseId } from '../middleware/errors.js';

export const EncargosController = {
  list: asyncHandler(async (req, res) => {
    const status = ['nuevo', 'contactado', 'cerrado'].includes(req.query.status)
      ? req.query.status
      : undefined;
    const [encargos, counts] = await Promise.all([EncargoModel.list(status), EncargoModel.counts()]);
    res.json({ encargos, counts });
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const { status } = encargoStatusSchema.parse(req.body);
    const encargo = await EncargoModel.updateStatus(parseId(req.params.id), status);
    if (!encargo) throw new HttpError(404, 'Encargo no encontrado');
    res.json({ encargo });
  })
};
