'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRun, applyCommand, legalActions, isLegal, isTerminal,
  scoreOf, hashState, serializeState, checkLevelShape, isValidAction,
} from '../src/core/rules.js';
import { tutorialLevel } from '../src/core/levels.js';
import { FORM_PULSE, FORM_NOVA } from '../src/core/constants.js';

const level = tutorialLevel(1); // speed 8, lows at x=20,40

test('createRun produces a valid initial state', () => {
  const s = createRun(level);
  assert.equal(s.phase, 'active');
  assert.equal(s.tick, 0);
  assert.equal(s.form, FORM_PULSE);
  assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y));
});

test('legal actions: jump legal on ground, illegal airborne with reason', () => {
  let s = createRun(level);
  const a0 = legalActions(s);
  assert.equal(a0.find((a) => a.type === 'jump').legal, true);
  assert.equal(a0.find((a) => a.type === 'form').legal, true);
  s = applyCommand(s, level, 'jump');
  const a1 = legalActions(s);
  const jump = a1.find((a) => a.type === 'jump');
  assert.equal(jump.legal, false);
  assert.equal(jump.reason, 'airborne');
});

test('legal actions: none after terminal, reason run-over', () => {
  let s = createRun(level);
  // run into the first slab without jumping
  while (s.phase === 'active') s = applyCommand(s, level, 'none');
  assert.equal(s.phase, 'dead');
  assert.equal(s.terminalReason, 'hit-low');
  for (const a of legalActions(s)) {
    assert.equal(a.legal, false);
    assert.equal(a.reason, 'run-over');
  }
  assert.equal(isTerminal(s), true);
});

test('isValidAction and isLegal', () => {
  const s = createRun(level);
  assert.ok(isValidAction('jump') && isValidAction('form') && isValidAction('none'));
  assert.ok(!isValidAction('fly'));
  assert.ok(isLegal(s, 'jump'));
  assert.ok(!isLegal(applyCommand(s, level, 'jump'), 'jump'));
});

test('form change toggles form', () => {
  let s = createRun(level);
  s = applyCommand(s, level, 'form');
  assert.equal(s.form, FORM_NOVA);
  s = applyCommand(s, level, 'form');
  assert.equal(s.form, FORM_PULSE);
  assert.equal(s.formsUsed, 2);
});

test('gate kills in PULSE form, passed in NOVA form', () => {
  const gateLevel = tutorialLevel(2); // gates at x=25,50
  let s = createRun(gateLevel);
  while (s.phase === 'active') s = applyCommand(s, gateLevel, 'none');
  assert.equal(s.phase, 'dead');
  assert.equal(s.terminalReason, 'hit-gate');

  s = createRun(gateLevel);
  while (s.phase === 'active') {
    const next = gateLevel.obstacles[s.obstacleIndex];
    let cmd = 'none';
    if (next && next.x - s.x < 0.6 * s.speed && s.form !== FORM_NOVA) cmd = 'form';
    s = applyCommand(s, gateLevel, cmd);
  }
  assert.equal(s.phase, 'won');
});

test('scoring components and integer total', () => {
  let s = createRun(level, 2);
  // jump both slabs, collect both airborne gems, finish
  while (s.phase === 'active') {
    const next = level.obstacles[s.obstacleIndex];
    let cmd = 'none';
    if (next && s.grounded && next.x - s.x <= 0.37 * s.speed && next.x - s.x > 0) cmd = 'jump';
    s = applyCommand(s, level, cmd);
  }
  assert.equal(s.phase, 'won');
  const score = scoreOf(s);
  assert.equal(score.checkpoints, s.checkpointsPassed * 50);
  assert.equal(score.gems, s.gemsCollected * 25);
  assert.equal(score.finish, 500);
  assert.equal(score.penalties, -20);
  assert.equal(score.total, score.checkpoints + score.gems + score.finish + score.penalties);
  assert.ok(Number.isInteger(score.total));
});

test('attempt penalty is capped', () => {
  const s = createRun(level, 50);
  assert.equal(scoreOf(s).penalties, -100);
});

test('finish bonus absent on death', () => {
  let s = createRun(level);
  while (s.phase === 'active') s = applyCommand(s, level, 'none');
  assert.equal(scoreOf(s).finish, 0);
});

test('tick increases monotonically', () => {
  let s = createRun(level);
  let prev = 0;
  for (let i = 0; i < 50; i++) {
    s = applyCommand(s, level, 'none');
    assert.ok(s.tick > prev);
    prev = s.tick;
  }
});

test('serialization and hashing are stable', () => {
  let s = createRun(level);
  for (let i = 0; i < 30; i++) s = applyCommand(s, level, i === 3 ? 'jump' : 'none');
  assert.equal(serializeState(s), serializeState({ ...s }));
  assert.equal(hashState(s), hashState({ ...s }));
  const s2 = applyCommand(s, level, 'form');
  assert.notEqual(hashState(s), hashState(s2));
});

test('terminal state is sticky', () => {
  let s = createRun(level);
  while (s.phase === 'active') s = applyCommand(s, level, 'none');
  const dead = s;
  s = applyCommand(s, level, 'jump');
  assert.equal(s, dead);
});

test('checkLevelShape rejects malformed levels', () => {
  assert.equal(checkLevelShape(null), 'level-not-object');
  assert.equal(checkLevelShape({ seed: 1, speed: 10, length: 100, obstacles: [], gems: [], checkpoints: [] }), null);
  assert.equal(checkLevelShape({ seed: 1, speed: 0, length: 100, obstacles: [], gems: [], checkpoints: [] }), 'bad-speed');
  assert.equal(checkLevelShape({ seed: 1, speed: 10, length: 100, obstacles: [{ x: 5, kind: 'tall' }], gems: [], checkpoints: [] }), 'bad-obstacle-kind');
  assert.throws(() => createRun({ seed: 1, speed: 0, length: 1, obstacles: [], gems: [], checkpoints: [] }));
});
