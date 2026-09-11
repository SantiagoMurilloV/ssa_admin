// Etapas del viaje de un pedido: EE. UU. → Colombia → bodega en Armenia → cliente.
// phrase completa "Tu pedido está …" en la guía pública, con las mayúsculas de
// los nombres propios intactas (el label en minúscula rompía "Armenia, Quindío").
// Las comparten los encargos creados en el panel (pedidos) y los pedidos de la
// tienda (orders): la guía pública muestra las mismas etapas para ambos.
// ESPEJO de ssa_store/server/src/config/tracking-stages.js — si cambias uno, cambia el otro.
export const TRACKING_STAGES = [
  {
    key: 'usa',
    phrase: 'en Estados Unidos, listo para viajar',
    label: 'En Estados Unidos',
    short: 'EE. UU.',
    place: 'Miami, FL',
    description: 'Tu pedido está con nosotros en EE. UU., listo para emprender el viaje.'
  },
  {
    key: 'transit',
    phrase: 'en camino a Colombia',
    label: 'En camino a Colombia',
    short: 'En vuelo',
    place: 'Sobre el Caribe',
    description: 'Ya salió de EE. UU. y viene volando hacia Colombia.'
  },
  {
    key: 'colombia',
    phrase: 'en Colombia, pasando aduana',
    label: 'Llegó a Colombia',
    short: 'Colombia',
    place: 'Bogotá',
    description: 'Aterrizó en Colombia y está pasando los trámites de aduana.'
  },
  {
    key: 'warehouse',
    phrase: 'en nuestra bodega de Armenia, Quindío',
    label: 'En bodega · Armenia, Quindío',
    short: 'Bodega',
    place: 'Armenia, Quindío',
    description: 'Ya está en nuestra bodega en Armenia. Lo revisamos y lo preparamos para enviártelo.'
  },
  {
    key: 'dispatched',
    phrase: 'en camino a tu dirección',
    label: 'Enviado a tu dirección',
    short: 'Enviado',
    place: 'Rumbo a tu puerta',
    description: 'Salió de la bodega y va camino a tu dirección.'
  },
  {
    key: 'delivered',
    phrase: 'entregado',
    label: 'Entregado',
    short: 'Entregado',
    place: 'En tus manos',
    description: '¡Llegó! Esperamos que lo disfrutes.'
  }
];

export const TRACKING_STAGE_KEYS = TRACKING_STAGES.map((stage) => stage.key);
export const DEFAULT_TRACKING_STAGE = 'usa';
export const FINAL_TRACKING_STAGE = 'delivered';

export const isTrackingStage = (key) => TRACKING_STAGE_KEYS.includes(key);
export const stageIndex = (key) => TRACKING_STAGE_KEYS.indexOf(key);
export const stageInfo = (key) => TRACKING_STAGES.find((stage) => stage.key === key) ?? null;
export const nextStage = (key) => TRACKING_STAGE_KEYS[stageIndex(key) + 1] ?? null;

// Texto del aviso push que recibe el cliente cuando su pedido cambia de etapa
export const stageNotification = (reference, key) => {
  const BODY = {
    usa: `Tu pedido ${reference} ya está con nosotros en EE. UU. 🇺🇸`,
    transit: `¡Despegó! Tu pedido ${reference} va en camino a Colombia ✈️`,
    colombia: `Tu pedido ${reference} llegó a Colombia 🇨🇴`,
    warehouse: `Tu pedido ${reference} ya está en nuestra bodega en Armenia, Quindío 📦`,
    dispatched: `Tu pedido ${reference} salió rumbo a tu dirección 🚚`,
    delivered: `Tu pedido ${reference} fue entregado. ¡Disfrútalo! 🎉`
  };
  return {
    title: `SSA Import · ${stageInfo(key)?.label ?? 'Actualización'}`,
    body: BODY[key] ?? `Tu pedido ${reference} tiene una novedad.`
  };
};
