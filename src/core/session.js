'use strict';

// Session + replay: ordered command logs, periodic state hashes, envelopes.

import { SCHEMA_VERSION, CONTENT_VERSION, HASH_INTERVAL_TICKS } from './constants.js';
import { createRun, applyCommand, hashState, scoreOf, isValidAction } from './rules.js';

// Replay a command log over a level. Malformed commands are coerced to 'none'.
export function runCommands(level, commands, attempts = 0) {
  let state = createRun(level, attempts);
  const hashes = [{ tick: 0, hash: hashState(state) }];
  const max = Math.min(commands.length, 200000); // hard bound against abuse
  for (let i = 0; i < max; i++) {
    const cmd = isValidAction(commands[i]) ? commands[i] : 'none';
    state = applyCommand(state, level, cmd);
    if (state.tick % HASH_INTERVAL_TICKS === 0 || state.phase !== 'active') {
      hashes.push({ tick: state.tick, hash: hashState(state) });
    }
    if (state.phase !== 'active') break;
  }
  return { state, hashes };
}

// Build a replay envelope for a finished (or in-progress) run.
export function buildEnvelope(level, commands, attempts = 0) {
  const { state, hashes } = runCommands(level, commands, attempts);
  return {
    schemaVersion: SCHEMA_VERSION,
    contentVersion: CONTENT_VERSION,
    seed: level.seed >>> 0,
    levelId: String(level.id),
    initialHash: hashes[0].hash,
    commands: commands.slice(),
    hashes,
    result: {
      phase: state.phase,
      reason: state.terminalReason,
      ticks: state.tick,
      score: scoreOf(state),
    },
  };
}

// Verify an envelope by full re-simulation. Returns { ok, reason, state }.
export function verifyReplay(level, envelope) {
  if (!envelope || typeof envelope !== 'object') return { ok: false, reason: 'bad-envelope' };
  if (envelope.schemaVersion !== SCHEMA_VERSION) return { ok: false, reason: 'bad-schema-version' };
  if (envelope.contentVersion !== CONTENT_VERSION) return { ok: false, reason: 'stale-content-version' };
  if ((envelope.seed >>> 0) !== (level.seed >>> 0)) return { ok: false, reason: 'seed-mismatch' };
  if (!Array.isArray(envelope.commands)) return { ok: false, reason: 'bad-commands' };
  const { state, hashes } = runCommands(level, envelope.commands, 0);
  if (envelope.initialHash !== hashes[0].hash) return { ok: false, reason: 'initial-hash-mismatch', state };
  const expected = envelope.hashes || [];
  if (expected.length !== hashes.length) return { ok: false, reason: 'hash-count-mismatch', state };
  for (let i = 0; i < hashes.length; i++) {
    if (expected[i].tick !== hashes[i].tick || expected[i].hash !== hashes[i].hash) {
      return { ok: false, reason: 'hash-mismatch@' + hashes[i].tick, state };
    }
  }
  return { ok: true, reason: null, state };
}
