import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePaymentChannels,
  publicPaymentChannels
} from '../src/config/payment-channels.js';

test('normalizePaymentChannels asigna id a los canales nuevos', () => {
  const [channel] = normalizePaymentChannels([
    { type: 'Nequi', label: 'Nequi', account: '3001112233', active: true }
  ]);
  assert.ok(channel.id.length > 0);
  assert.equal(channel.type, 'Nequi');
  assert.equal(channel.account, '3001112233');
});

test('normalizePaymentChannels conserva el id existente', () => {
  const [channel] = normalizePaymentChannels([
    { id: 'nequi-fijo', type: 'Nequi', account: '3001112233', active: true }
  ]);
  assert.equal(channel.id, 'nequi-fijo');
  // sin label explícito, cae al tipo
  assert.equal(channel.label, 'Nequi');
});

test('publicPaymentChannels oculta los inactivos y los sin cuenta', () => {
  const channels = normalizePaymentChannels([
    { id: 'a', type: 'Nequi', account: '3001112233', active: true },
    { id: 'b', type: 'Bancolombia', account: '123-456', active: false },
    { id: 'c', type: 'Davivienda', account: '', active: true }
  ]);
  const visible = publicPaymentChannels(channels);
  assert.deepEqual(
    visible.map((c) => c.id),
    ['a']
  );
});

test('publicPaymentChannels no filtra datos internos al comprador', () => {
  const channels = normalizePaymentChannels([
    { id: 'a', type: 'Nequi', account: '3001112233', holder: 'SSA', active: true }
  ]);
  const [visible] = publicPaymentChannels(channels);
  assert.deepEqual(Object.keys(visible).sort(), [
    'account',
    'holder',
    'id',
    'instructions',
    'label',
    'type'
  ]);
  assert.equal('active' in visible, false);
});

test('normalizePaymentChannels tolera basura y limita la cantidad', () => {
  assert.ok(Array.isArray(normalizePaymentChannels(null)));
  const many = Array.from({ length: 30 }, (_, i) => ({
    type: 'Nequi',
    account: String(i),
    active: true
  }));
  assert.equal(normalizePaymentChannels(many).length, 12);
});
