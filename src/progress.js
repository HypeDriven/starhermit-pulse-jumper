'use strict';

// The progress this client stores as the engine save, and what it reads from
// the browser build: pure, shared by native/platform.ts and the node tests.
// - The engine save is the browser build's save document (src/core/save.js)
//   without its settings: the highest unlocked Journey stage, the best score
//   per Journey stage and per Daily date, the finished lessons and the
//   achievements. Two copies merge as the browser build's cloud conflicts did
//   (mergeSaves: the higher unlock, the better score per stage and day, the
//   union of lessons and achievements).
// - The browser build mirrored its whole save document (settings included) to
//   the cloud slot game:<slug> as JSON text (StarHermit.saveJSON). The engine
//   shows that slot as foreign: readForeign() turns it into progress plus the
//   two options this game still owns.
// - Of the old settings, left-handed touch controls and the timing assist stay
//   the game's options (engine settings); volumes, mute, graphics, reduced
//   motion, high contrast, larger text and language are the runtime's Options.
//   isLegacyKey() names every per-player settings key the browser build (its
//   settings mirror, sh-language.js and game-options.js) wrote, to remove once
//   read.

import { migrate, mergeSaves } from './core/save.js';

export const OPTION_KEYS = ['leftHanded', 'timingAssist'];
const SETTINGS_KEYS = ['musicVolume', 'effectsVolume', 'muted', 'graphicsTier', 'graphics', 'reducedMotion', 'highContrast',
  'largerText', 'leftHanded', 'timingAssist'];

function strip(doc) {
  return {
    version: doc.version,
    journeyUnlocked: Math.min(40, Math.max(1, Math.floor(Number(doc.journeyUnlocked) || 1))),
    journeyBest: cleanScores(doc.journeyBest),
    dailyBest: cleanScores(doc.dailyBest),
    tutorialDone: cleanFlags(doc.tutorialDone),
    achievements: cleanFlags(doc.achievements),
  };
}
function cleanScores(m) {
  const out = {};
  for (const [k, v] of Object.entries(m || {})) if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v);
  return out;
}
function cleanFlags(m) {
  const out = {};
  for (const [k, v] of Object.entries(m || {})) if (v === true) out[k] = true;
  return out;
}

/** A new player's progress. */
export function blank() { return normalize(null); }

/** Any stored or old document → progress (unknown or broken input → blank). */
export function normalize(raw) {
  return strip(migrate(raw && typeof raw === 'object' ? raw : null));
}

/** Two copies merged without losing either side's progress. */
export function merge(a, b) {
  return strip(mergeSaves(normalize(a), normalize(b)));
}

/** Whether two copies hold the same progress. */
export function same(a, b) {
  return JSON.stringify(sorted(normalize(a))) === JSON.stringify(sorted(normalize(b)));
}
function sorted(v) {
  if (!v || typeof v !== 'object') return v;
  const out = {};
  for (const k of Object.keys(v).sort()) out[k] = sorted(v[k]);
  return out;
}

/** Only well-typed option values. */
export function pickOptions(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of OPTION_KEYS) if (typeof raw[k] === 'boolean') out[k] = raw[k];
  return out;
}

/** The browser build's cloud slot (JSON text of its save document) → { progress, options }, or null. */
export function readForeign(text) {
  if (typeof text !== 'string' || !text) return null;
  let obj;
  try { obj = JSON.parse(text); } catch { return null; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  return { progress: normalize(obj), options: pickOptions(obj.settings) };
}

/** Every per-player settings key the browser build wrote. */
export function isLegacyKey(key) {
  return SETTINGS_KEYS.includes(key) || key === 'ui.language' || key === 'audio.options' || key.startsWith('graphics.gpu.');
}

function utcDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
/** Consecutive UTC days with a cleared Daily, ending today or yesterday (game.js dailyStreak). */
export function dailyStreak(dailyBest, today) {
  let ms = Date.parse(today + 'T00:00:00Z');
  if (!Number.isFinite(ms)) return 0;
  if (!(utcDay(ms) in dailyBest)) ms -= 86400000;
  let streak = 0;
  while (utcDay(ms) in dailyBest) { streak += 1; ms -= 86400000; }
  return streak;
}
