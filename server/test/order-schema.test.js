import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createOrderSchema,
  createEncargoSchema,
  subscribeSchema,
  eventSchema
} from '../src/schemas/public.schemas.js';

const validOrder = {
  customer: { fullName: 'Ana Pérez', phone: '+57 3001112233', email: 'ana@ejemplo.co' },
  shipping: { department: 'Cundinamarca', city: 'Bogotá', address: 'Calle 1 # 2-33' },
  payment: 'transfer',
  items: [{ productId: 'termo-stanley', quantity: 2 }],
  website: ''
};

test('acepta un pedido válido', () => {
  assert.equal(createOrderSchema.safeParse(validOrder).success, true);
});

test('rechaza precios enviados por el cliente', () => {
  const attack = {
    ...validOrder,
    items: [{ productId: 'termo-stanley', quantity: 1, unitPrice: 1 }]
  };
  assert.equal(createOrderSchema.safeParse(attack).success, false);
});

test('rechaza totales enviados por el cliente', () => {
  assert.equal(createOrderSchema.safeParse({ ...validOrder, total: 1 }).success, false);
});

test('el honeypot lleno delata al bot', () => {
  assert.equal(createOrderSchema.safeParse({ ...validOrder, website: 'spam' }).success, false);
});

test('exige el honeypot presente', () => {
  const { website, ...sinHoneypot } = validOrder;
  assert.equal(createOrderSchema.safeParse(sinHoneypot).success, false);
});

test('solo acepta pago por transferencia', () => {
  assert.equal(createOrderSchema.safeParse({ ...validOrder, payment: 'gateway' }).success, false);
});

test('limita la cantidad por ítem y el número de ítems', () => {
  assert.equal(
    createOrderSchema.safeParse({
      ...validOrder,
      items: [{ productId: 'x', quantity: 11 }]
    }).success,
    false
  );
  assert.equal(
    createOrderSchema.safeParse({
      ...validOrder,
      items: [{ productId: 'x', quantity: 0 }]
    }).success,
    false
  );
  assert.equal(createOrderSchema.safeParse({ ...validOrder, items: [] }).success, false);
});

test('valida teléfono, correo y dirección', () => {
  const bad = (patch) =>
    createOrderSchema.safeParse({ ...validOrder, ...patch }).success === false;
  assert.ok(bad({ customer: { ...validOrder.customer, phone: '123' } }));
  assert.ok(bad({ customer: { ...validOrder.customer, email: 'no-es-correo' } }));
  assert.ok(bad({ shipping: { ...validOrder.shipping, address: 'x' } }));
  assert.ok(bad({ shipping: { ...validOrder.shipping, city: '' } }));
});

test('las notas son opcionales pero acotadas', () => {
  assert.equal(
    createOrderSchema.safeParse({
      ...validOrder,
      shipping: { ...validOrder.shipping, notes: 'Dejar en portería' }
    }).success,
    true
  );
  assert.equal(
    createOrderSchema.safeParse({
      ...validOrder,
      shipping: { ...validOrder.shipping, notes: 'x'.repeat(501) }
    }).success,
    false
  );
});

test('el evento purchase no se puede falsificar desde el navegador', () => {
  assert.equal(eventSchema.safeParse({ type: 'page_view' }).success, true);
  assert.equal(eventSchema.safeParse({ type: 'add_to_cart' }).success, true);
  assert.equal(eventSchema.safeParse({ type: 'purchase' }).success, false);
});

test('el encargo también exige el honeypot vacío', () => {
  const valid = {
    producto: 'Dyson Airwrap',
    nombre: 'Ana Pérez',
    contacto: '3001112233',
    website: ''
  };
  assert.equal(createEncargoSchema.safeParse(valid).success, true);
  assert.equal(createEncargoSchema.safeParse({ ...valid, website: 'spam' }).success, false);
  const { website, ...sinHoneypot } = valid;
  assert.equal(createEncargoSchema.safeParse(sinHoneypot).success, false);
});

test('la suscripción también exige el honeypot vacío', () => {
  assert.equal(subscribeSchema.safeParse({ email: 'a@b.co', website: '' }).success, true);
  assert.equal(subscribeSchema.safeParse({ email: 'a@b.co', website: 'spam' }).success, false);
  assert.equal(subscribeSchema.safeParse({ email: 'a@b.co' }).success, false);
});
