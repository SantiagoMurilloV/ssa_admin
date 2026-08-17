import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const AUTH_COOKIE = 'ssa_admin_token';
const SESSION_TTL_SECONDS = 12 * 60 * 60;

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: env.isProduction ? 'none' : 'lax',
  secure: env.isProduction,
  maxAge: SESSION_TTL_SECONDS * 1000,
  path: '/'
});

export const issueSession = (res, user) => {
  const token = jwt.sign({ sub: user.id, email: user.email }, env.jwtSecret, {
    expiresIn: SESSION_TTL_SECONDS
  });
  res.cookie(AUTH_COOKIE, token, cookieOptions());
};

export const clearSession = (res) => {
  res.clearCookie(AUTH_COOKIE, { ...cookieOptions(), maxAge: undefined });
};

export const requireAuth = (req, res, next) => {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    clearSession(res);
    res.status(401).json({ error: 'Session expired' });
  }
};
