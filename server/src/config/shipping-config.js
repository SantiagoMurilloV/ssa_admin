// Config de envíos en settings['shipping_config'].
// Mantener resolveShippingFee/normalizeCityName en espejo con
// ssa_store/client/src/utils/shipping.js
export const DEFAULT_SHIPPING_CONFIG = {
  defaultFee: 15000,
  cities: [{ name: 'Bogotá', fee: 10000 }]
};

export const normalizeCityName = (name) =>
  String(name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const normalizeShippingConfig = (raw) => {
  const defaultFee = Number.isInteger(raw?.defaultFee) && raw.defaultFee >= 0
    ? raw.defaultFee
    : DEFAULT_SHIPPING_CONFIG.defaultFee;
  const cities = Array.isArray(raw?.cities)
    ? raw.cities
        .filter((c) => c && typeof c.name === 'string' && c.name.trim() !== '')
        .map((c) => ({
          name: c.name.trim(),
          fee: Number.isInteger(c.fee) && c.fee >= 0 ? c.fee : defaultFee
        }))
    : [];
  return { defaultFee, cities };
};

export const resolveShippingFee = (city, config) => {
  const normalized = normalizeCityName(city);
  const match = config.cities.find((c) => normalizeCityName(c.name) === normalized);
  return match ? match.fee : config.defaultFee;
};
