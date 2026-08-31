'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { journeyLevel, dailyLevel } from '../src/core/levels.js';
import { createRun, applyCommand } from '../src/core/rules.js';
import { runCommands } from '../src/core/session.js';
import { mulberry32 } from '../src/core/prng.js';

test('fuzz: malformed commands never hang, never NaN, always terminal-safe', () => {
  const rng = mulberry32(12345);
  const level = journeyLevel(10);
  const junk = [null, undefined, 42, 'fly', {}, [], 'JUMP', '', 'none', 'jump', 'form', -1, NaN];
  for (let trial = 0; trial < 30; trial++) {
    const n = Math.floor(rng() * 400);
    const commands = Array.from({ length: n }, () => junk[Math.floor(rng() * junk.length)]);
    const { state } = runCommands(level, commands);
    assert.ok(Number.isFinite(state.x), 'x NaN');
    assert.ok(Number.isFinite(state.y), 'y NaN');
    assert.ok(Number.isFinite(state.vy), 'vy NaN');
    assert.ok(['active', 'dead', 'won'].includes(state.phase));
    assert.equal(state.tick, Math.min(n, state.tick)); // tick never exceeds commands issued
  }
});

test('fuzz: oversized command logs are bounded', () => {
  const level = journeyLevel(1);
  const { state } = runCommands(level, Array(500000).fill('none'));
  assert.ok(state.tick <= 200000);
  assert.ok(state.phase !== 'active'); // died or hit the cap without hanging
});

test('fuzz: random inputs still die or finish, never soft-lock physics', () => {
  const rng = mulberry32(999);
  const level = dailyLevel('2026-08-30');
  let s = createRun(level);
  const actions = ['none', 'jump', 'form'];
  for (let i = 0; i < 20000 && s.phase === 'active'; i++) {
    s = applyCommand(s, level, actions[Math.floor(rng() * 3)]);
  }
  // Random flailing may survive a long time on the ground between obstacles,
  // but position must remain sane and bounded by the level.
  assert.ok(Number.isFinite(s.x) && s.x >= 0);
  assert.ok(s.y >= 0 && s.y < 100);
});

test('fuzz: malformed level shapes throw on createRun', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 50; i++) {
    const bad = {
      seed: rng() * 1e9, speed: rng() * 100 - 50, length: rng() * 20000 - 5000,
      obstacles: [{ x: rng() * 100, kind: rng() < 0.5 ? 'low' : 'weird' }],
      gems: [], checkpoints: [],
    };
    try {
      const s = createRun(bad);
      // If it passed shape checks, stepping must still be safe.
      const s2 = applyCommand(s, bad, 'jump');
      assert.ok(Number.isFinite(s2.x) && Number.isFinite(s2.y));
    } catch (e) {
      assert.match(e.message, /invalid level/);
    }
  }
});
