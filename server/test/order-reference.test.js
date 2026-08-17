import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ORDER_REFERENCE_PATTERN,
  generateOrderReference,
  generateReceiptToken,
  receiptTokenMatches
} from '../src/utils/order-reference.js';

test('la referencia siempre tiene el formato SSA-######', () => {
  for (let i = 0; i < 200; i += 1) {
    assert.match(generateOrderReference(), ORDER_REFERENCE_PATTERN);
  }
});

test('el token del comprobante es largo e impredecible', () => {
  const tokens = new Set();
  for (let i = 0; i < 500; i += 1) {
    const token = generateReceiptToken();
    // 24 bytes en base64url = 32 caracteres: no se adivina por fuerza bruta,
    // a diferencia de la referencia de 6 dígitos que sí es pública.
    assert.equal(token.length, 32);
    assert.match(token, /^[A-Za-z0-9_-]+$/);
    tokens.add(token);
  }
  assert.equal(tokens.size, 500, 'los tokens deben ser únicos');
});

test('receiptTokenMatches solo acepta el token exacto', () => {
  const token = generateReceiptToken();
  assert.equal(receiptTokenMatches(token, token), true);
  assert.equal(receiptTokenMatches(token, token.slice(0, -1)), false);
  assert.equal(receiptTokenMatches(token, token + 'x'), false);
  assert.equal(receiptTokenMatches(token, generateReceiptToken()), false);
});

test('receiptTokenMatches rechaza valores que no son texto', () => {
  const token = generateReceiptToken();
  assert.equal(receiptTokenMatches(token, ''), false);
  assert.equal(receiptTokenMatches(token, undefined), false);
  assert.equal(receiptTokenMatches(token, null), false);
  assert.equal(receiptTokenMatches(null, token), false);
  // un pedido sin token no se autoriza por comparación
  assert.equal(receiptTokenMatches(undefined, undefined), false);
});
