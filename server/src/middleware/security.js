import helmet from 'helmet';
import cors from 'cors';
import { env } from '../config/env.js';

export const securityHeaders = helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
});

// Solo el panel admin entra por CORS con credenciales. La tienda NO va aquí:
// sus funciones serverless llaman /api/public/* server-to-server (sin cookie).
export const corsPolicy = cors({
  origin(origin, callback) {
    if (!origin || env.clientOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Origin not allowed'));
  },
  credentials: true
});
