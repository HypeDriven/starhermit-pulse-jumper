'use strict';

// Versioned level content: deterministic generation + offline validation.

import { CONTENT_VERSION, STEP_SECONDS } from './constants.js';
import { mulberry32 } from './prng.js';
import { createRun, applyCommand, scoreOf } from './rules.js';

export const THEMES = ['neon-grid', 'sunset-wire', 'void-pulse', 'mono-chrome', 'aurora'];

function round2(v) { return Math.round(v * 100) / 100; }

// Build a level from a seeded stream and a difficulty recipe.
function buildLevel({ id, seed, speed, length, count, gateProb, gemProb, mastery, theme, tutorialFlags }) {
  const rng = mulberry32(seed >>> 0);
  const obstacles = [];
  const gems = [];
  // Safe spacing so the greedy solver can always land and re-jump.
  const minGap = Math.ceil(speed * 1.2) + 4;
  let x = 15;
  for (let i = 0; i < count && x < length - 20; i++) {
    const kind = rng() < gateProb ? 'gate' : 'low';
    obstacles.push({ x: round2(x), kind });
    if (kind === 'low' && rng() < gemProb) gems.push({ x: round2(x), y: 2.0 });
    else if (kind === 'gate' && rng() < gemProb * 0.6) gems.push({ x: round2(x), y: 1.0 });
    x += minGap + Math.floor(rng() * minGap * (mastery ? 0.5 : 1.2));
  }
  // Ground gems between obstacles.
  for (let g = 25; g < length - 10; g += 25) {
    if (rng() < 0.5 && !obstacles.some((o) => Math.abs(o.x - g) < 3)) {
      gems.push({ x: round2(g), y: 1.0 });
    }
  }
  gems.sort((a, b) => a.x - b.x);
  const checkpoints = [];
  for (let c = 30; c < length - 5; c += 30) checkpoints.push(c);
  return {
    id, version: CONTENT_VERSION, seed: seed >>> 0,
    speed: round2(speed), length: Math.round(length),
    theme, par: Math.round((length / speed) * 1.05),
    tutorialFlags: tutorialFlags || null,
    mastery: !!mastery,
    obstacles, gems, checkpoints,
  };
}

// 40 journey stages, mastery stage every 8th.
export function journeyLevel(index) { // index: 1..40
  const i = Math.min(Math.max(1, index | 0), 40);
  const mastery = i % 8 === 0;
  const speed = Math.min(10 + (i - 1) * 0.15, 16);
  let length = 150 + i * 5;
  let count = 4 + Math.floor(i * 0.8);
  if (mastery) { length *= 1.3; count += 4; }
  const gateProb = i < 6 ? 0 : Math.min(0.12 + i * 0.01, 0.45);
  const gemProb = Math.min(0.4 + i * 0.01, 0.8);
  return buildLevel({
    id: 'journey-' + i, seed: 1000 + i * 77,
    speed, length, count, gateProb, gemProb, mastery,
    theme: THEMES[(i - 1) % THEMES.length],
  });
}

export function journeyCount() { return 40; }

// Daily level: one immutable seed per UTC day.
export function dailySeedFor(dateString) { // 'YYYY-MM-DD'
  let h = 2166136261 >>> 0;
  const s = 'pulse-daily|' + dateString;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function dailyLevel(dateString) {
  const seed = dailySeedFor(dateString);
  const rng = mulberry32(seed);
  const speed = 11 + rng() * 3;
  return buildLevel({
    id: 'daily-' + dateString, seed,
    speed, length: 260 + Math.floor(rng() * 60), count: 18 + Math.floor(rng() * 8),
    gateProb: 0.25 + rng() * 0.15, gemProb: 0.6, mastery: false,
    theme: THEMES[Math.floor(rng() * THEMES.length)],
  });
}

export function practiceLevel(difficulty) { // 1..5
  const d = Math.min(Math.max(1, difficulty | 0), 5);
  return buildLevel({
    id: 'practice-' + d, seed: 9000 + d * 131,
    speed: 9 + d, length: 140 + d * 40, count: 5 + d * 4,
    gateProb: d < 2 ? 0 : 0.1 + d * 0.06, gemProb: 0.6, mastery: false,
    theme: THEMES[d % THEMES.length],
  });
}

// Challenge variants: 'move-limit' (fewest actions target) and 'speed' (fast).
export function challengeLevel(kind) {
  if (kind === 'speed') {
    const l = buildLevel({
      id: 'challenge-speed', seed: 4242, speed: 16, length: 300, count: 26,
      gateProb: 0.3, gemProb: 0.5, mastery: true, theme: 'void-pulse',
    });
    l.challenge = { kind: 'speed', target: Math.ceil(300 / 16) };
    return l;
  }
  const l = buildLevel({
    id: 'challenge-moves', seed: 1717, speed: 11, length: 220, count: 16,
    gateProb: 0.3, gemProb: 0.5, mastery: false, theme: 'mono-chrome',
  });
  l.challenge = { kind: 'move-limit', maxActions: 24 };
  return l;
}

// Learn-mode tutorial lessons; completion requires performing the taught action.
export function tutorialLevel(lesson) { // 1..3
  if (lesson === 1) {
    return {
      id: 'learn-1', version: CONTENT_VERSION, seed: 11, speed: 8, length: 70,
      theme: 'neon-grid', par: 10, mastery: false,
      tutorialFlags: { requireJumps: 2, requireForms: 0, lesson: 1 },
      obstacles: [{ x: 20, kind: 'low' }, { x: 40, kind: 'low' }],
      gems: [{ x: 20, y: 2.0 }, { x: 40, y: 2.0 }],
      checkpoints: [30, 60],
    };
  }
  if (lesson === 2) {
    return {
      id: 'learn-2', version: CONTENT_VERSION, seed: 22, speed: 8, length: 80,
      theme: 'sunset-wire', par: 11, mastery: false,
      tutorialFlags: { requireJumps: 0, requireForms: 1, lesson: 2 },
      obstacles: [{ x: 25, kind: 'gate' }, { x: 50, kind: 'gate' }],
      gems: [{ x: 25, y: 1.0 }, { x: 50, y: 1.0 }],
      checkpoints: [30, 60],
    };
  }
  return {
    id: 'learn-3', version: CONTENT_VERSION, seed: 33, speed: 9, length: 110,
    theme: 'void-pulse', par: 13, mastery: false,
    tutorialFlags: { requireJumps: 2, requireForms: 1, lesson: 3 },
    obstacles: [
      { x: 20, kind: 'low' }, { x: 45, kind: 'gate' },
      { x: 70, kind: 'low' }, { x: 92, kind: 'gate' },
    ],
    gems: [{ x: 20, y: 2.0 }, { x: 45, y: 1.0 }, { x: 70, y: 2.0 }],
    checkpoints: [30, 60, 90],
  };
}

// --- Offline validator -----------------------------------------------------

// Greedy deterministic solver: jump low obstacles, phase through gates.
export function solveLevel(level, maxTicks) {
  let state = createRun(level);
  const bound = maxTicks || Math.ceil(level.length / level.speed / STEP_SECONDS) + 120;
  const commands = [];
  while (state.phase === 'active' && state.tick < bound) {
    let cmd = 'none';
    const next = level.obstacles[state.obstacleIndex];
    if (next) {
      const gap = next.x - state.x;
      if (next.kind === 'gate' && gap < 0.6 * state.speed && state.form !== 2) {
        cmd = 'form';
      } else if (next.kind === 'low' && state.grounded && gap <= 0.37 * state.speed && gap > 0) {
        cmd = 'jump';
      }
    }
    commands.push(cmd);
    state = applyCommand(state, level, cmd);
    if (!Number.isFinite(state.x) || !Number.isFinite(state.y) || !Number.isFinite(state.vy)) {
      return { state, commands, reason: 'nan-physics' };
    }
  }
  return { state, commands, reason: null };
}

// Prove a level is completable with bounded duration and no soft locks.
export function validateLevel(level) {
  const bound = Math.ceil(level.length / level.speed / STEP_SECONDS) + 120;
  const { state, reason } = solveLevel(level, bound);
  if (reason) return { ok: false, reason };
  if (state.phase !== 'won') {
    return { ok: false, reason: state.phase === 'dead' ? 'solver-died:' + state.terminalReason : 'timeout' };
  }
  if (state.tick > bound) return { ok: false, reason: 'unbounded-duration' };
  const score = scoreOf(state);
  if (!Number.isInteger(score.total)) return { ok: false, reason: 'non-integer-score' };
  return { ok: true, ticks: state.tick, gems: state.gemsCollected, score };
}
