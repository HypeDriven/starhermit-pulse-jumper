'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { journeyLevel, solveLevel } from '../src/core/levels.js';
import { buildEnvelope, verifyReplay, runCommands } from '../src/core/session.js';
import { hashState } from '../src/core/rules.js';

test('deterministic replay: same seed + commands → identical hashes', () => {
  const level = journeyLevel(12);
  const { commands } = solveLevel(level);
  const a = runCommands(level, commands);
  const b = runCommands(level, commands);
  assert.equal(a.hashes.length, b.hashes.length);
  for (let i = 0; i < a.hashes.length; i++) {
    assert.equal(a.hashes[i].hash, b.hashes[i].hash);
    assert.equal(a.hashes[i].tick, b.hashes[i].tick);
  }
  assert.equal(hashState(a.state), hashState(b.state));
});

test('different seeds produce different runs', () => {
  const l1 = journeyLevel(1);
  const l2 = journeyLevel(2);
  assert.notEqual(l1.seed, l2.seed);
  const h1 = runCommands(l1, Array(120).fill('none')).hashes;
  const h2 = runCommands(l2, Array(120).fill('none')).hashes;
  assert.notEqual(h1[h1.length - 1].hash, h2[h2.length - 1].hash);
});

test('envelope roundtrip verifies', () => {
  const level = journeyLevel(20);
  const { commands } = solveLevel(level);
  const env = buildEnvelope(level, commands);
  assert.equal(env.result.phase, 'won');
  const v = verifyReplay(level, env);
  assert.equal(v.ok, true, v.reason);
});

test('envelope tampering is detected', () => {
  const level = journeyLevel(5);
  const { commands } = solveLevel(level);
  const env = buildEnvelope(level, commands);

  const bad1 = { ...env, commands: env.commands.slice(0, -5) };
  assert.equal(verifyReplay(level, bad1).ok, false);

  const bad2 = JSON.parse(JSON.stringify(env));
  bad2.hashes[1].hash = 'deadbeef';
  assert.equal(verifyReplay(level, bad2).ok, false);

  const bad3 = { ...env, seed: env.seed + 1 };
  assert.equal(verifyReplay(level, bad3).ok, false);
  assert.equal(verifyReplay(level, bad3).reason, 'seed-mismatch');

  const bad4 = { ...env, contentVersion: 999 };
  assert.equal(verifyReplay(level, bad4).reason, 'stale-content-version');
});
