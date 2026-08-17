import webPush from 'web-push';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';

export const pushEnabled = Boolean(env.vapid.publicKey && env.vapid.privateKey);

if (pushEnabled) {
  webPush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey);
}

async function broadcast(payload) {
  if (!pushEnabled) return;
  const { rows } = await query('SELECT id, endpoint, p256dh, auth FROM push_subscriptions');
  await Promise.allSettled(
    rows.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
        }
      }
    })
  );
}

export const notifyNewOrder = (order) =>
  broadcast({
    title: `🛍 Nuevo pedido ${order.reference}`,
    body: `${order.customer_name} · $${Number(order.total).toLocaleString('es-CO')}`,
    url: '/pedidos'
  }).catch((error) => console.error('[push] broadcast failed', error));

export const notifyNewEncargo = (encargo) =>
  broadcast({
    title: '📦 Nuevo encargo',
    body: `${encargo.nombre}: ${encargo.producto}`.slice(0, 120),
    url: '/encargos'
  }).catch((error) => console.error('[push] broadcast failed', error));
