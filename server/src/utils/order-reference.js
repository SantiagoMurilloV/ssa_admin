import { randomInt, randomBytes, timingSafeEqual } from 'node:crypto';

export const ORDER_REFERENCE_PATTERN = /^SSA-\d{6}$/;

export const generateOrderReference = () =>
  `SSA-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;

// La referencia es corta y visible: no autoriza nada por sí sola. Este token
// es lo que permite adjuntar el comprobante de un pedido concreto.
export const generateReceiptToken = () => randomBytes(24).toString('base64url');

export const RECEIPT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export const receiptTokenMatches = (expected, provided) => {
  if (typeof expected !== 'string' || typeof provided !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
};
