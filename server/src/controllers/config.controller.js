import { SettingsModel, SETTINGS_KEYS } from '../models/settings.model.js';
import { normalizeShippingConfig } from '../config/shipping-config.js';
import { normalizePaymentChannels } from '../config/payment-channels.js';
import { shippingConfigSchema, paymentChannelsSchema } from '../schemas/admin.schemas.js';
import { asyncHandler } from '../middleware/errors.js';

export const ConfigController = {
  getShipping: asyncHandler(async (req, res) => {
    const config = normalizeShippingConfig(
      await SettingsModel.getJson(SETTINGS_KEYS.shippingConfig)
    );
    res.json({ shipping: config });
  }),

  updateShipping: asyncHandler(async (req, res) => {
    const payload = shippingConfigSchema.parse(req.body);
    const config = normalizeShippingConfig(payload);
    await SettingsModel.setJson(SETTINGS_KEYS.shippingConfig, config);
    res.json({ shipping: config });
  }),

  getPaymentChannels: asyncHandler(async (req, res) => {
    const channels = normalizePaymentChannels(
      await SettingsModel.getJson(SETTINGS_KEYS.paymentChannels)
    );
    res.json({ channels });
  }),

  updatePaymentChannels: asyncHandler(async (req, res) => {
    const payload = paymentChannelsSchema.parse(req.body);
    const channels = normalizePaymentChannels(payload.channels);
    await SettingsModel.setJson(SETTINGS_KEYS.paymentChannels, channels);
    res.json({ channels });
  })
};
