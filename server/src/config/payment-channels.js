// Canales de pago por transferencia, en settings['payment_channels'].
// El comprador transfiere a uno de estos y sube la foto del comprobante.
import { randomUUID } from 'node:crypto';

export const DEFAULT_PAYMENT_CHANNELS = [
  {
    id: 'nequi',
    type: 'Nequi',
    label: 'Nequi',
    account: '',
    holder: 'SSA Import',
    instructions: '',
    active: false
  },
  {
    id: 'bancolombia',
    type: 'Bancolombia',
    label: 'Bancolombia · Cuenta de ahorros',
    account: '',
    holder: 'SSA Import',
    instructions: '',
    active: false
  }
];

const cleanText = (value, max) => String(value ?? '').trim().slice(0, max);

export const normalizePaymentChannels = (raw) => {
  if (!Array.isArray(raw)) return DEFAULT_PAYMENT_CHANNELS;
  return raw
    .filter((ch) => ch && typeof ch === 'object')
    .map((ch) => ({
      id: cleanText(ch.id, 60) || randomUUID(),
      type: cleanText(ch.type, 40) || 'Otro',
      label: cleanText(ch.label, 80) || cleanText(ch.type, 40) || 'Canal de pago',
      account: cleanText(ch.account, 80),
      holder: cleanText(ch.holder, 80),
      instructions: cleanText(ch.instructions, 300),
      active: ch.active !== false
    }))
    .slice(0, 12);
};

export const publicPaymentChannels = (channels) =>
  channels
    .filter((ch) => ch.active && ch.account !== '')
    .map(({ id, type, label, account, holder, instructions }) => ({
      id,
      type,
      label,
      account,
      holder,
      instructions
    }));
