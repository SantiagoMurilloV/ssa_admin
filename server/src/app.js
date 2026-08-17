import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { securityHeaders, corsPolicy } from './middleware/security.js';
import { apiLimiter } from './middleware/rate-limiters.js';
import { router } from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errors.js';
import { localStorageFallback, UPLOADS_DIR } from './config/storage.js';

export const app = express();

app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(corsPolicy);
app.use(express.json({ limit: '30kb' }));
app.use(cookieParser());

// Solo en desarrollo sin Cloudinary: sirve los archivos guardados en disco
if (localStorageFallback) {
  app.use('/uploads', cors(), express.static(UPLOADS_DIR));
}

app.use('/api', apiLimiter, router);

// Deploy mono-host opcional: si el cliente está compilado al lado, se sirve
const clientDist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(notFoundHandler);
app.use(errorHandler);
