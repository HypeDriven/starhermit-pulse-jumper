'use strict';

// Golden sessions: representative easy and hard runs with pinned terminal
// hashes and scores. Regenerate expectations only when rules change on
// purpose (bump CONTENT_VERSION when doing so).

import test from 'node:test';
import assert from 'node:assert/strict';
import { journeyLevel, tutorialLevel, solveLevel } from '../src/core/levels.js';
import { scoreOf, hashState } from '../src/core/rules.js';

// Captured from the verified deterministic engine (CONTENT_VERSION 1).
const GOLDEN = {
  easy: { phase: 'won', score: 650, checkpoints: 2, gems: 2 },
  hard: { phase: 'won', score: 1550, checkpoints: 14, gems: 14 },
};

test('golden easy run: tutorial lesson 1', () => {
  const level = tutorialLevel(1);
  const { state, commands } = solveLevel(level);
  assert.equal(state.phase, GOLDEN.easy.phase);
  assert.ok(commands.includes('jump'), 'solver must actually jump');
  const score = scoreOf(state);
  assert.equal(score.total, GOLDEN.easy.score);
  assert.equal(state.checkpointsPassed, GOLDEN.easy.checkpoints);
  assert.equal(state.gemsCollected, GOLDEN.easy.gems);
});

test('golden hard run: journey stage 40 (mastery)', () => {
  const level = journeyLevel(40);
  assert.equal(level.mastery, true);
  const { state } = solveLevel(level);
  assert.equal(state.phase, GOLDEN.hard.phase);
  const score = scoreOf(state);
  assert.equal(score.total, GOLDEN.hard.score);
  assert.equal(state.checkpointsPassed, GOLDEN.hard.checkpoints);
  assert.equal(state.gemsCollected, GOLDEN.hard.gems);
});

test('golden: interrupted run hashes are stable across replays', () => {
  const level = journeyLevel(15);
  const { commands } = solveLevel(level);
  const partial = commands.slice(0, Math.floor(commands.length / 2));
  const runs = [0, 1].map(() => {
    // resume: replay the same partial log twice, hashes must match
    return import('../src/core/session.js').then(({ runCommands }) => runCommands(level, partial));
  });
  return Promise.all(runs).then(([a, b]) => {
    assert.equal(hashState(a.state), hashState(b.state));
    assert.equal(a.state.phase, 'active'); // genuinely mid-run (interrupted)
  });
});
