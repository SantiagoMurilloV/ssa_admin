import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const notFoundHandler = (req, res) => {
  res.status(404).json({ error: 'Not found' });
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (error, req, res, next) => {
  if (error instanceof ZodError) {
    return res.status(422).json({
      error: 'Validation failed',
      details: error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message
      }))
    });
  }
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message, details: error.details });
  }
  if (error?.name === 'MulterError') {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'File too large' : error.message;
    return res.status(400).json({ error: message });
  }
  if (error?.message === 'Unsupported image type' || error?.message === 'Unsupported media type') {
    return res.status(400).json({ error: error.message });
  }
  if (error?.message === 'Origin not allowed') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  console.error('[error]', error);
  res.status(500).json({ error: 'Internal server error' });
};

// Un id no numérico llegaría a Postgres como 'NaN' y explotaría con un 500;
// para el cliente es simplemente un recurso que no existe.
export const parseId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(404, 'Recurso no encontrado');
  return id;
};

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
