'use strict';

// Pulse Jumper rules engine — pure, deterministic, no DOM/Node dependencies.
// Shared by the browser client, the offline validator, and the server-side
// score validator.

import {
  STEP_SECONDS, GRAVITY, JUMP_VELOCITY, GROUND_Y, PLAYER_RADIUS, START_X,
  OBSTACLE_HALF_WIDTH, GEM_RADIUS,
  FORM_PULSE, FORM_NOVA,
  SCORE_PER_CHECKPOINT, SCORE_PER_GEM, SCORE_FINISH_BONUS,
  SCORE_ATTEMPT_PENALTY, MAX_ATTEMPT_PENALTY, CONTENT_VERSION,
} from './constants.js';
import { fnv1a } from './prng.js';

export const ACTIONS = Object.freeze(['none', 'jump', 'form']);

export function isValidAction(type) {
  return type === 'none' || type === 'jump' || type === 'form';
}

// A level is plain versioned data:
// { id, version, seed, speed, length, theme, par, tutorialFlags,
//   obstacles: [{x, kind:'low'|'gate'}], gems: [{x}], checkpoints: [x,...] }
export function checkLevelShape(level) {
  if (!level || typeof level !== 'object') return 'level-not-object';
  if (typeof level.seed !== 'number' || !Number.isFinite(level.seed)) return 'bad-seed';
  if (typeof level.speed !== 'number' || !(level.speed > 0) || level.speed > 40) return 'bad-speed';
  if (typeof level.length !== 'number' || !(level.length > 0) || level.length > 10000) return 'bad-length';
  if (!Array.isArray(level.obstacles) || !Array.isArray(level.gems) || !Array.isArray(level.checkpoints)) return 'bad-arrays';
  if (level.obstacles.length > 2000 || level.gems.length > 2000) return 'too-many-items';
  for (const o of level.obstacles) {
    if (typeof o.x !== 'number' || !Number.isFinite(o.x)) return 'bad-obstacle-x';
    if (o.kind !== 'low' && o.kind !== 'gate') return 'bad-obstacle-kind';
  }
  return null;
}

// Create the initial run state for a level. `attempts` is the number of prior
// failed attempts on this level in this session (drives the score penalty).
export function createRun(level, attempts = 0) {
  const err = checkLevelShape(level);
  if (err) throw new Error('invalid level: ' + err);
  return {
    version: CONTENT_VERSION,
    seed: level.seed >>> 0,
    levelId: String(level.id),
    tick: 0,
    phase: 'active', // 'active' | 'dead' | 'won'
    terminalReason: null,
    x: START_X,
    y: GROUND_Y + PLAYER_RADIUS,
    vy: 0,
    grounded: true,
    form: FORM_PULSE,
    speed: level.speed,
    length: level.length,
    attempts: Math.max(0, attempts | 0),
    checkpointsPassed: 0,
    gemsCollected: 0,
    jumpsUsed: 0,
    formsUsed: 0,
    obstacleIndex: 0, // next obstacle to test (sorted by x)
    gemIndex: 0,
    elapsed: 0,
  };
}

// Legal-action query. Returns descriptors with a reason when illegal.
export function legalActions(state) {
  if (state.phase !== 'active') {
    return [
      { type: 'jump', legal: false, reason: 'run-over' },
      { type: 'form', legal: false, reason: 'run-over' },
    ];
  }
  return [
    { type: 'jump', legal: state.grounded, reason: state.grounded ? null : 'airborne' },
    { type: 'form', legal: true, reason: null },
  ];
}

export function isLegal(state, type) {
  if (type === 'none') return true;
  const a = legalActions(state).find((d) => d.type === type);
  return !!a && a.legal;
}

export function isTerminal(state) {
  return state.phase !== 'active';
}

function circleRect(px, py, r, x0, x1, y0, y1) {
  const dx = px - Math.min(Math.max(px, x0), x1);
  const dy = py - Math.min(Math.max(py, y0), y1);
  return dx * dx + dy * dy <= r * r;
}

// Advance the simulation by exactly one fixed step with the given input.
// Unknown actions are treated as 'none'; illegal actions are ignored (the
// command is still recorded so replays stay aligned).
export function applyCommand(state, level, type) {
  if (state.phase !== 'active') return state;
  if (!isValidAction(type)) type = 'none';

  const s = { ...state };
  const dt = STEP_SECONDS;

  // Input.
  if (type === 'jump' && s.grounded) {
    s.vy = JUMP_VELOCITY;
    s.grounded = false;
    s.jumpsUsed += 1;
  } else if (type === 'form') {
    s.form = s.form === FORM_PULSE ? FORM_NOVA : FORM_PULSE;
    s.formsUsed += 1;
  }

  // Integrate.
  s.x += s.speed * dt;
  if (!s.grounded) {
    s.vy += GRAVITY * dt;
    s.y += s.vy * dt;
    if (s.y <= GROUND_Y + PLAYER_RADIUS) {
      s.y = GROUND_Y + PLAYER_RADIUS;
      s.vy = 0;
      s.grounded = true;
    }
  }

  // Obstacle collisions (each obstacle tested exactly once, when passed).
  while (s.obstacleIndex < level.obstacles.length) {
    const o = level.obstacles[s.obstacleIndex];
    if (s.x < o.x - OBSTACLE_HALF_WIDTH - PLAYER_RADIUS) break;
    const x0 = o.x - OBSTACLE_HALF_WIDTH, x1 = o.x + OBSTACLE_HALF_WIDTH;
    const h = o.kind === 'gate' ? 6 : 1.5;
    if (circleRect(s.x, s.y, PLAYER_RADIUS, x0, x1, GROUND_Y, GROUND_Y + h)) {
      const phased = o.kind === 'gate' && s.form === FORM_NOVA;
      if (!phased) {
        s.phase = 'dead';
        s.terminalReason = o.kind === 'gate' ? 'hit-gate' : 'hit-low';
        s.tick += 1;
        s.elapsed = s.tick * STEP_SECONDS;
        return s;
      }
    }
    if (s.x > o.x + OBSTACLE_HALF_WIDTH + PLAYER_RADIUS) s.obstacleIndex += 1;
    else break;
  }

  // Gems.
  while (s.gemIndex < level.gems.length) {
    const g = level.gems[s.gemIndex];
    const gy = typeof g.y === 'number' ? g.y : 1.6;
    if (g.x < s.x - GEM_RADIUS - PLAYER_RADIUS) { s.gemIndex += 1; continue; }
    if (g.x > s.x + GEM_RADIUS + PLAYER_RADIUS) break;
    const dx = s.x - g.x, dy = s.y - gy;
    if (dx * dx + dy * dy <= GEM_RADIUS * GEM_RADIUS) {
      s.gemsCollected += 1;
      s.gemIndex += 1;
    } else if (s.x > g.x + GEM_RADIUS + PLAYER_RADIUS) {
      s.gemIndex += 1;
    } else break;
  }

  // Checkpoints.
  while (s.checkpointsPassed < level.checkpoints.length &&
         s.x >= level.checkpoints[s.checkpointsPassed]) {
    s.checkpointsPassed += 1;
  }

  // Finish.
  if (s.x >= s.length) {
    s.phase = 'won';
    s.terminalReason = 'finished';
  }

  s.tick += 1;
  s.elapsed = s.tick * STEP_SECONDS;
  return s;
}

// Integer score with named components.
export function scoreOf(state) {
  const checkpoints = state.checkpointsPassed * SCORE_PER_CHECKPOINT;
  const gems = state.gemsCollected * SCORE_PER_GEM;
  const finish = state.phase === 'won' ? SCORE_FINISH_BONUS : 0;
  const penalties = -Math.min(state.attempts * SCORE_ATTEMPT_PENALTY, MAX_ATTEMPT_PENALTY);
  const total = checkpoints + gems + finish + penalties;
  return { total, checkpoints, gems, finish, penalties };
}

// Canonical serialization (stable key order) used for hashing and snapshots.
export function serializeState(state) {
  return [
    state.version, state.seed, state.levelId, state.tick, state.phase,
    state.terminalReason || '', state.x.toFixed(6), state.y.toFixed(6),
    state.vy.toFixed(6), state.grounded ? 1 : 0, state.form,
    state.speed, state.length, state.attempts, state.checkpointsPassed,
    state.gemsCollected, state.jumpsUsed, state.formsUsed,
    state.obstacleIndex, state.gemIndex,
  ].join('|');
}

export function hashState(state) {
  return fnv1a(serializeState(state));
}
