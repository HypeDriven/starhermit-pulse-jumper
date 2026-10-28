// The progress this client saves (src/progress.js): normalizing stored and
// old documents, merging two devices' copies, reading the browser build's
// cloud slot (its whole save document as JSON text, settings included), the
// per-player settings keys it wrote, and the Daily streak.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, normalize, merge, same, readForeign, pickOptions, isLegacyKey, dailyStreak } from '../src/progress.js';
import { defaultSave, encodeSave } from '../src/core/save.js';

test('a new player and broken input give the blank progress', () => {
  const b = blank();
  assert.deepEqual(b, { version: 1, journeyUnlocked: 1, journeyBest: {}, dailyBest: {}, tutorialDone: {}, achievements: {} });
  for (const bad of [null, undefined, 3, 'x', [], { journeyUnlocked: 'many', journeyBest: { a: 'NaN' } }]) assert.deepEqual(normalize(bad), b);
});

test('progress keeps only well-typed fields and no settings', () => {
  const p = normalize({ journeyUnlocked: 7.6, journeyBest: { 'journey-1': 800, 'journey-2': 'x' }, dailyBest: { '2026-10-27': 1100 },
    tutorialDone: { 1: true, 2: 'yes' }, achievements: { oof: true }, settings: { leftHanded: true } });
  assert.equal(p.journeyUnlocked, 7);
  assert.deepEqual(p.journeyBest, { 'journey-1': 800 });
  assert.deepEqual(p.tutorialDone, { 1: true });
  assert.equal('settings' in p, false);
  assert.equal(normalize({ journeyUnlocked: 99 }).journeyUnlocked, 40);
});

test('two copies merge without losing either side (mergeSaves)', () => {
  const a = { journeyUnlocked: 5, journeyBest: { 'journey-1': 700, 'journey-4': 900 }, dailyBest: { d1: 300 }, tutorialDone: { 1: true }, achievements: { 'first-clear': true } };
  const b = { journeyUnlocked: 3, journeyBest: { 'journey-1': 800 }, dailyBest: { d1: 200, d2: 500 }, tutorialDone: { 2: true }, achievements: { oof: true } };
  const m = merge(a, b);
  assert.equal(m.journeyUnlocked, 5);
  assert.deepEqual(m.journeyBest, { 'journey-1': 800, 'journey-4': 900 });
  assert.deepEqual(m.dailyBest, { d1: 300, d2: 500 });
  assert.deepEqual(m.tutorialDone, { 1: true, 2: true });
  assert.deepEqual(m.achievements, { 'first-clear': true, oof: true });
  assert.ok(same(merge(a, b), merge(b, a)));
  assert.ok(same(m, merge(m, a)));
  assert.ok(!same(a, b));
});

test('the browser build\'s cloud slot: its save document with the two game options', () => {
  const old = defaultSave();
  old.journeyUnlocked = 12;
  old.journeyBest['journey-11'] = 1234;
  old.achievements['streak-7'] = true;
  old.settings.leftHanded = true;
  old.settings.musicVolume = 0.2;
  const r = readForeign(JSON.stringify(old));
  assert.equal(r.progress.journeyUnlocked, 12);
  assert.equal(r.progress.journeyBest['journey-11'], 1234);
  assert.deepEqual(r.options, { leftHanded: true, timingAssist: false });
  // the checksummed local copy (encodeSave) reads too: the checksum is dropped
  assert.equal(readForeign(encodeSave(old)).progress.journeyUnlocked, 12);
  for (const bad of [null, '', 'not json', '[]', '7']) assert.equal(readForeign(bad), null);
});

test('options and the old settings keys', () => {
  assert.deepEqual(pickOptions({ leftHanded: 'yes', timingAssist: true, muted: true }), { timingAssist: true });
  for (const k of ['musicVolume', 'graphics', 'leftHanded', 'ui.language', 'audio.options', 'graphics.gpu.amd-radeon']) assert.ok(isLegacyKey(k), k);
  assert.ok(!isLegacyKey('something-else'));
});

test('the Daily streak counts consecutive cleared UTC days ending today or yesterday', () => {
  const best = { '2026-10-21': 1, '2026-10-22': 1, '2026-10-23': 1, '2026-10-25': 1, '2026-10-26': 1, '2026-10-27': 1 };
  assert.equal(dailyStreak(best, '2026-10-27'), 3);
  assert.equal(dailyStreak(best, '2026-10-28'), 3);
  assert.equal(dailyStreak(best, '2026-10-29'), 0);
  assert.equal(dailyStreak({}, '2026-10-29'), 0);
});
