'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave, encodeSave, decodeSave, migrate, loadSave, storeSave, SAVE_KEY } from '../src/core/save.js';
import { SAVE_VERSION } from '../src/core/constants.js';

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test('save roundtrip', () => {
  const store = memStorage();
  const save = defaultSave();
  save.journeyUnlocked = 7;
  save.journeyBest['journey-3'] = 1234;
  save.settings.reducedMotion = true;
  assert.ok(storeSave(save, store));
  const loaded = loadSave(store);
  assert.equal(loaded.journeyUnlocked, 7);
  assert.equal(loaded.journeyBest['journey-3'], 1234);
  assert.equal(loaded.settings.reducedMotion, true);
  assert.equal(loaded.version, SAVE_VERSION);
});

test('corrupt checksum falls back to defaults', () => {
  const store = memStorage();
  storeSave(defaultSave(), store);
  const raw = JSON.parse(store.getItem(SAVE_KEY));
  raw.journeyUnlocked = 99; // tamper without fixing checksum
  store.setItem(SAVE_KEY, JSON.stringify(raw));
  const loaded = loadSave(store);
  assert.equal(loaded.journeyUnlocked, 1);
});

test('garbage in storage falls back to defaults', () => {
  const store = memStorage();
  store.setItem(SAVE_KEY, 'not json {{{');
  assert.deepEqual(loadSave(store), defaultSave());
});

test('migration fills missing fields from older payloads', () => {
  const old = { version: 0, journeyUnlocked: 4, settings: { muted: true } };
  const migrated = migrate(old);
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.journeyUnlocked, 4);
  assert.equal(migrated.settings.muted, true);
  assert.equal(migrated.settings.graphicsTier, 'high'); // new default preserved
  assert.ok(migrated.journeyBest && typeof migrated.journeyBest === 'object');
});

test('encode/decode are inverse', () => {
  const save = defaultSave();
  save.dailyBest['2026-08-30'] = 777;
  const decoded = decodeSave(encodeSave(save));
  assert.equal(decoded.dailyBest['2026-08-30'], 777);
});
