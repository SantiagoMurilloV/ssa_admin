import { query, queryOne } from '../db/pool.js';

export const SettingsModel = {
  async getJson(key, fallback = null) {
    const row = await queryOne('SELECT value FROM settings WHERE key = $1', [key]);
    if (!row) return fallback;
    try {
      return JSON.parse(row.value);
    } catch {
      return fallback;
    }
  },

  async setJson(key, value) {
    await query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, JSON.stringify(value)]
    );
  }
};

export const SETTINGS_KEYS = {
  siteContent: 'site_content',
  shippingConfig: 'shipping_config',
  paymentChannels: 'payment_channels'
};
