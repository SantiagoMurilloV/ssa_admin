import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SHIPPING_CONFIG,
  normalizeCityName,
  normalizeShippingConfig,
  resolveShippingFee
} from '../src/config/shipping-config.js';

test('normalizeCityName ignora acentos, mayúsculas y espacios', () => {
  assert.equal(normalizeCityName('  Bogotá '), 'bogota');
  assert.equal(normalizeCityName('MEDELLÍN'), 'medellin');
  assert.equal(normalizeCityName('Ibagué'), 'ibague');
  assert.equal(normalizeCityName(null), '');
});

test('resolveShippingFee cobra la tarifa de la ciudad listada', () => {
  const config = { defaultFee: 15000, cities: [{ name: 'Bogotá', fee: 10000 }] };
  assert.equal(resolveShippingFee('Bogotá', config), 10000);
  // el comprador escribe sin tilde: debe seguir siendo la misma ciudad
  assert.equal(resolveShippingFee('bogota', config), 10000);
  assert.equal(resolveShippingFee('  BOGOTA  ', config), 10000);
});

test('resolveShippingFee cae a la tarifa por defecto en ciudades no listadas', () => {
  const config = { defaultFee: 15000, cities: [{ name: 'Bogotá', fee: 10000 }] };
  assert.equal(resolveShippingFee('Leticia', config), 15000);
  assert.equal(resolveShippingFee('', config), 15000);
});

test('normalizeShippingConfig descarta entradas inválidas', () => {
  const config = normalizeShippingConfig({
    defaultFee: 12000,
    cities: [
      { name: 'Cali', fee: 9000 },
      { name: '   ', fee: 5000 }, // nombre vacío: fuera
      { name: 'Pasto', fee: -1 }, // tarifa inválida: usa la default
      { name: 'Neiva' } // sin tarifa: usa la default
    ]
  });
  assert.equal(config.defaultFee, 12000);
  assert.deepEqual(config.cities, [
    { name: 'Cali', fee: 9000 },
    { name: 'Pasto', fee: 12000 },
    { name: 'Neiva', fee: 12000 }
  ]);
});

test('normalizeShippingConfig usa los valores por defecto ante basura', () => {
  assert.deepEqual(normalizeShippingConfig(null), {
    defaultFee: DEFAULT_SHIPPING_CONFIG.defaultFee,
    cities: []
  });
  assert.deepEqual(normalizeShippingConfig({ defaultFee: 'gratis', cities: 'ninguna' }), {
    defaultFee: DEFAULT_SHIPPING_CONFIG.defaultFee,
    cities: []
  });
});
