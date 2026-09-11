// Etapas de la guía: la fuente de verdad vive en el server (y su espejo en la
// tienda). El panel las importa directo para no tener una tercera copia.
export {
  TRACKING_STAGES,
  TRACKING_STAGE_KEYS,
  DEFAULT_TRACKING_STAGE,
  FINAL_TRACKING_STAGE,
  stageIndex,
  stageInfo,
  nextStage
} from '../../../server/src/config/tracking-stages.js';
export { whatsappNumber, phoneDigits } from '../../../server/src/utils/phone.js';

// Dónde vive la tienda, para armar el enlace de la guía que se le manda al cliente
export const STORE_URL = (
  import.meta.env.VITE_STORE_URL ?? (import.meta.env.DEV ? 'http://localhost:5173' : 'https://ssaimport.com')
).replace(/\/+$/, '');

export const trackingUrl = (reference) => `${STORE_URL}/envios/${reference}`;
