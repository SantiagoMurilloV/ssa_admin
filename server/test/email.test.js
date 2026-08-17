import { test } from 'node:test';
import assert from 'node:assert/strict';
import { receiptReceivedEmail, paymentConfirmedEmail } from '../src/services/email.service.js';

const ORDER = {
  reference: 'SSA-123456',
  customer_name: 'María José Pérez',
  email: 'maria@example.com',
  address: 'Calle 1 # 2-3',
  city: 'Bogotá',
  total: 234000,
  items: [
    { product_name: 'Termo Stanley', unit_price: 100000, quantity: 2 },
    { product_name: 'Bruma 62', unit_price: 34000, quantity: 1 }
  ]
};

test('el correo de comprobante dice que el pago está por confirmar', () => {
  const mail = receiptReceivedEmail(ORDER);
  assert.match(mail.subject, /SSA-123456/);
  assert.match(mail.html, /pendiente por confirmar/i);
  assert.match(mail.text, /pendiente por confirmar/i);
  // saluda por el primer nombre, no por el nombre completo
  assert.match(mail.html, /Hola María/);
  assert.doesNotMatch(mail.html, /Hola María José Pérez/);
});

test('el correo de pago confirmado dice que el pedido está en proceso', () => {
  const mail = paymentConfirmedEmail(ORDER);
  assert.match(mail.subject, /Pago confirmado/);
  assert.match(mail.html, /ya está en proceso/i);
  assert.match(mail.text, /ya está en proceso/i);
  // lleva la dirección de envío
  assert.match(mail.html, /Calle 1 # 2-3/);
});

test('los dos correos listan los ítems y el total en pesos', () => {
  for (const mail of [receiptReceivedEmail(ORDER), paymentConfirmedEmail(ORDER)]) {
    assert.match(mail.html, /Termo Stanley/);
    assert.match(mail.html, /2×/);
    // 2 × 100.000 = 200.000 de línea, y el total del pedido
    assert.match(mail.html, /\$ 200\.000/);
    assert.match(mail.html, /\$ 234\.000/);
    assert.match(mail.text, /\$ 234\.000/);
  }
});

test('escapa el HTML que viene del comprador', () => {
  // El nombre y la dirección los escribe el comprador: sin escapar, podría
  // inyectar markup en el correo que le llega a él y a cualquiera que lo reenvíe.
  const hostile = {
    ...ORDER,
    customer_name: '<script>alert(1)</script>',
    address: '<img src=x onerror=alert(1)>',
    items: [{ product_name: '<b>Producto</b>', unit_price: 1000, quantity: 1 }]
  };
  const mail = paymentConfirmedEmail(hostile);
  // Lo que importa es que no quede ninguna etiqueta viva: el texto "onerror="
  // sobrevive escapado dentro de &lt;img …&gt;, y así es inerte.
  assert.doesNotMatch(mail.html, /<script/);
  assert.doesNotMatch(mail.html, /<img(?![^>]*cid:)/);
  assert.doesNotMatch(mail.html, /<b>Producto<\/b>/);
  assert.match(mail.html, /&lt;script&gt;/);
  assert.match(mail.html, /&lt;img src=x onerror=/);
  assert.match(mail.html, /&lt;b&gt;Producto/);
});

test('funciona sin nombre y sin ítems', () => {
  const bare = { reference: 'SSA-000001', total: 0, items: [], address: 'x', city: 'y' };
  for (const mail of [receiptReceivedEmail(bare), paymentConfirmedEmail(bare)]) {
    assert.match(mail.html, /SSA-000001/);
    assert.doesNotMatch(mail.html, /Hola ,/);
    assert.doesNotMatch(mail.html, /undefined/);
  }
});
