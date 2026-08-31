'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  journeyLevel, journeyCount, dailyLevel, tutorialLevel,
  practiceLevel, challengeLevel, validateLevel,
} from '../src/core/levels.js';
import { STEP_SECONDS } from '../src/core/constants.js';

test('all 40 journey stages are completable with bounded duration', () => {
  for (let i = 1; i <= journeyCount(); i++) {
    const level = journeyLevel(i);
    const v = validateLevel(level);
    assert.ok(v.ok, `journey ${i}: ${v.reason}`);
    const bound = Math.ceil(level.length / level.speed / STEP_SECONDS) + 120;
    assert.ok(v.ticks <= bound, `journey ${i}: unbounded`);
  }
});

test('tutorial lessons are completable', () => {
  for (const l of [1, 2, 3]) {
    assert.ok(validateLevel(tutorialLevel(l)).ok, `lesson ${l}`);
  }
});

test('practice difficulties are completable', () => {
  for (let d = 1; d <= 5; d++) {
    assert.ok(validateLevel(practiceLevel(d)).ok, `practice ${d}`);
  }
});

test('challenge variants are completable', () => {
  assert.ok(validateLevel(challengeLevel('moves')).ok);
  assert.ok(validateLevel(challengeLevel('speed')).ok);
});

test('daily seeds across several UTC days are completable', () => {
  for (const day of ['2026-08-30', '2026-08-31', '2026-01-01', '2026-02-28', '2027-12-31']) {
    const level = dailyLevel(day);
    const v = validateLevel(level);
    assert.ok(v.ok, `daily ${day}: ${v.reason}`);
  }
});

test('daily levels are deterministic per day and distinct across days', () => {
  const a1 = dailyLevel('2026-08-30');
  const a2 = dailyLevel('2026-08-30');
  const b = dailyLevel('2026-08-31');
  assert.deepEqual(a1, a2);
  assert.notEqual(a1.seed, b.seed);
});

test('validator rejects an impossible level (soft lock)', () => {
  const impossible = {
    id: 'bad', version: 1, seed: 1, speed: 10, length: 100,
    theme: 'neon-grid', par: 10, tutorialFlags: null,
    // Two low slabs 2 m apart: the solver cannot land and re-jump in time.
    obstacles: [{ x: 30, kind: 'low' }, { x: 32, kind: 'low' }],
    gems: [], checkpoints: [50],
  };
  const v = validateLevel(impossible);
  assert.equal(v.ok, false);
});

test('journey difficulty increases monotonically in speed', () => {
  let prev = 0;
  for (let i = 1; i <= 40; i += 5) {
    const s = journeyLevel(i).speed;
    assert.ok(s >= prev);
    prev = s;
  }
  assert.ok(journeyLevel(40).speed > journeyLevel(1).speed);
});
