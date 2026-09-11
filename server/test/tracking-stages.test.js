import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACKING_STAGES,
  TRACKING_STAGE_KEYS,
  DEFAULT_TRACKING_STAGE,
  FINAL_TRACKING_STAGE,
  isTrackingStage,
  nextStage,
  stageIndex,
  stageNotification
} from '../src/config/tracking-stages.js';
import { phoneDigits, whatsappNumber } from '../src/utils/phone.js';
import { normalizeReference } from '../src/controllers/tracking.controller.js';

test('las etapas van de EE. UU. a entregado, sin repetirse', () => {
  assert.deepEqual(TRACKING_STAGE_KEYS, ['usa', 'transit', 'colombia', 'warehouse', 'dispatched', 'delivered']);
  assert.equal(new Set(TRACKING_STAGE_KEYS).size, TRACKING_STAGE_KEYS.length);
  assert.equal(TRACKING_STAGE_KEYS[0], DEFAULT_TRACKING_STAGE);
  assert.equal(TRACKING_STAGE_KEYS.at(-1), FINAL_TRACKING_STAGE);
  for (const stage of TRACKING_STAGES) {
    assert.ok(
      stage.label && stage.short && stage.description && stage.place && stage.phrase,
      `${stage.key} incompleta`
    );
  }
});

test('la bodega es la de Armenia, Quindío', () => {
  const warehouse = TRACKING_STAGES.find((s) => s.key === 'warehouse');
  assert.match(warehouse.label, /Armenia, Quindío/);
});

test('nextStage recorre el orden y termina en null', () => {
  assert.equal(nextStage('usa'), 'transit');
  assert.equal(nextStage('dispatched'), 'delivered');
  assert.equal(nextStage('delivered'), null);
  assert.equal(stageIndex('colombia'), 2);
  assert.equal(isTrackingStage('warehouse'), true);
  assert.equal(isTrackingStage('shipped'), false);
});

test('el aviso push lleva la referencia y una etapa por texto', () => {
  for (const key of TRACKING_STAGE_KEYS) {
    const { title, body } = stageNotification('SSA-123456', key);
    assert.match(body, /SSA-123456/);
    assert.ok(title.startsWith('SSA Import'));
  }
});

test('phoneDigits deja solo dígitos y quita el 57 de Colombia', () => {
  assert.equal(phoneDigits('+57 300 123 4567'), '3001234567');
  assert.equal(phoneDigits('300-123-4567'), '3001234567');
  assert.equal(phoneDigits('573001234567'), '3001234567');
  assert.equal(phoneDigits('(1) 555 0100'), '15550100');
  assert.equal(whatsappNumber('300 123 4567'), '573001234567');
  assert.equal(whatsappNumber('+57 300 123 4567'), '573001234567');
});

test('normalizeReference acepta el código como lo escribe la gente', () => {
  assert.equal(normalizeReference('SSA-482913'), 'SSA-482913');
  assert.equal(normalizeReference('ssa 482913'), 'SSA-482913');
  assert.equal(normalizeReference('ssa482913'), 'SSA-482913');
  assert.equal(normalizeReference('482913'), 'SSA-482913');
  assert.equal(normalizeReference('SSA-48291'), null);
  assert.equal(normalizeReference('ABC-482913'), null);
  assert.equal(normalizeReference(''), null);
});
