import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { pushEnabled } from '../services/push.service.js';
import { pushSubscriptionSchema } from '../schemas/admin.schemas.js';
import { asyncHandler } from '../middleware/errors.js';

export const PushController = {
  config(req, res) {
    res.json({ enabled: pushEnabled, publicKey: env.vapid.publicKey });
  },

  subscribe: asyncHandler(async (req, res) => {
    const payload = pushSubscriptionSchema.parse(req.body);
    await query(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES ($1, $2, $3)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [payload.endpoint, payload.keys.p256dh, payload.keys.auth]
    );
    res.status(201).json({ ok: true });
  }),

  unsubscribe: asyncHandler(async (req, res) => {
    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
    await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
    res.json({ ok: true });
  })
};
