'use strict';

// Versioned, checksummed local save with migration-safe load.
// Storage is injectable so tests can run without a browser.

import { SAVE_VERSION } from './constants.js';
import { fnv1a } from './prng.js';

const KEY = 'pulse-jumper-save';

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    settings: {
      musicVolume: 0.6, effectsVolume: 0.8, muted: false,
      graphicsTier: 'high', // 'high' | 'medium' | 'low'
      reducedMotion: false, highContrast: false, largerText: false,
      leftHanded: false, timingAssist: false,
    },
    journeyUnlocked: 1, // highest unlocked journey stage (1-based)
    journeyBest: {}, // levelId -> integer score
    dailyBest: {}, // dateString -> integer score
    tutorialDone: {}, // lesson number -> true
    achievements: {}, // key -> true
  };
}

function checksum(payload) {
  return fnv1a(JSON.stringify(payload));
}

export function encodeSave(save) {
  const payload = { ...save };
  delete payload.checksum;
  return JSON.stringify({ ...payload, checksum: checksum(payload) });
}

// Migrate older payloads forward. Unknown/missing version → defaults merged.
export function migrate(payload) {
  const base = defaultSave();
  if (!payload || typeof payload !== 'object') return base;
  const out = {
    ...base,
    ...payload,
    settings: { ...base.settings, ...(payload.settings || {}) },
    journeyBest: { ...(payload.journeyBest || {}) },
    dailyBest: { ...(payload.dailyBest || {}) },
    tutorialDone: { ...(payload.tutorialDone || {}) },
    achievements: { ...(payload.achievements || {}) },
  };
  out.version = SAVE_VERSION;
  if (!(out.journeyUnlocked >= 1)) out.journeyUnlocked = 1;
  delete out.checksum;
  return out;
}

export function decodeSave(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (_) { return null; }
  if (!obj || typeof obj !== 'object') return null;
  const { checksum: sum, ...payload } = obj;
  if (typeof sum !== 'string' || checksum(payload) !== sum) return null; // corrupt
  return migrate(payload);
}

export function loadSave(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return defaultSave();
  let text = null;
  try { text = store.getItem(KEY); } catch (_) { return defaultSave(); }
  if (!text) return defaultSave();
  return decodeSave(text) || defaultSave();
}

export function storeSave(save, storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return false;
  try { store.setItem(KEY, encodeSave(migrate(save))); return true; } catch (_) { return false; }
}

export const SAVE_KEY = KEY;
