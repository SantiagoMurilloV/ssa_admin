import { timingSafeEqual } from 'node:crypto';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';

// Los endpoints públicos se keyean por la IP real del comprador que reenvía el
// proxy serverless de la tienda (X-Store-Client-IP); sin esto todos los
// compradores compartirían la IP de egress de Vercel.
//
// Ese header solo se respeta si la petición trae el secreto compartido: de lo
// contrario cualquiera lo falsificaría con un valor distinto por request y los
// límites no se dispararían nunca.
const fromTrustedProxy = (req) => {
  if (env.storeProxySecret === '') return false;
  const provided = req.get('x-store-proxy-secret') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(env.storeProxySecret);
  return a.length === b.length && timingSafeEqual(a, b);
};

const storeClientKey = (req) => {
  if (fromTrustedProxy(req)) {
    const forwarded = req.get('x-store-client-ip')?.split(',')[0]?.trim();
    if (forwarded) return `store:${forwarded}`;
  }
  return ipKeyGenerator(req.ip);
};

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/public') || req.path.startsWith('/events')
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, retry later' }
});

export const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: storeClientKey
});

export const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: storeClientKey,
  message: { error: 'Too many orders from this address, retry later' }
});
