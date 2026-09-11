import webPush from 'web-push';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { TrackingModel } from '../models/tracking.model.js';
import { stageNotification } from '../config/tracking-stages.js';

export const pushEnabled = Boolean(env.vapid.publicKey && env.vapid.privateKey);

if (pushEnabled) {
  webPush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey);
}

// Entrega a una lista de suscripciones. Un endpoint que responde 404/410 ya no
// existe (el usuario revocó el permiso o desinstaló): se borra con onGone para
// no seguir intentando contra él.
async function deliver(subscriptions, payload, onGone) {
  if (!pushEnabled) return;
  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) await onGone(sub);
      }
    })
  );
}

// ── Avisos al admin (todas las suscripciones del panel) ──
async function broadcast(payload) {
  if (!pushEnabled) return;
  const { rows } = await query('SELECT id, endpoint, p256dh, auth FROM push_subscriptions');
  await deliver(rows, payload, (sub) =>
    query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id])
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

// ── Avisos al comprador (solo quienes se suscribieron a ESA referencia) ──
// La URL es relativa: el service worker que la abre vive en la tienda, así que
// resuelve contra ssaimport.com y no contra el API.
export const notifyTrackingStage = (reference, stage) =>
  (async () => {
    if (!pushEnabled) return;
    const subscriptions = await TrackingModel.subscriptions(reference);
    if (subscriptions.length === 0) return;
    const { title, body } = stageNotification(reference, stage);
    await deliver(subscriptions, { title, body, url: `/envios/${reference}` }, (sub) =>
      TrackingModel.removeSubscription(sub.id)
    );
  })().catch((error) => console.error('[push] tracking notify failed', error));
