'use strict';

// Game orchestrator: state machine, fixed-step simulation loop with
// interpolation, input routing, persistence, audio, and server integration.

import { STEP_SECONDS, FORM_NOVA } from './core/constants.js';
import { createRun, applyCommand, scoreOf, hashState } from './core/rules.js';
import {
  journeyLevel, dailyLevel, practiceLevel, challengeLevel, tutorialLevel, dailySeedFor,
} from './core/levels.js';
import { buildEnvelope } from './core/session.js';
import { loadSave, storeSave } from './core/save.js';
import * as audio from './audio/audio.js?v=production-qa-1';
import * as gfx from './render/three-renderer.js';
import * as ui from './ui/dom-ui.js';

// --- App state --------------------------------------------------------------
let save = loadSave();
let screenBeforeOverlay = 'screen-title';
let machine = 'boot'; // boot|title|modes|preparing|countdown|active|paused|resolving|results
let gl = false;

// Run state.
let level = null;
let mode = null; // 'learn'|'journey'|'daily'|'practice'|'challenge'
let modeArg = null;
let state = null;      // current rules snapshot
let prevState = null;  // previous snapshot for interpolation
let commands = [];
let attempts = 0;
let queuedAction = null; // at most one action per tick, quantized
let pendingTicks = 0;
let accumulator = 0;
let lastFrame = 0;
let countdownLeft = 0;
let dailyInfo = null; // { date, seed, contentVersion }
let clockOffset = 0;  // serverNow - clientNow

// --- Helpers ----------------------------------------------------------------
function utcDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
function today() { return utcDay(Date.now() + clockOffset); }

function persist() { storeSave(save); }

function applySettings() {
  ui.applyAccessibility(save.settings);
  audio.configure(save.settings);
  if (gl) {
    gfx.setQuality(save.settings.graphicsTier);
    gfx.setReducedMotion(save.settings.reducedMotion);
  }
}

function unlockAch(key) {
  if (!save.achievements[key]) { save.achievements[key] = true; persist(); }
}

// --- Run lifecycle ------------------------------------------------------------
function pickLevel(m, arg) {
  if (m === 'journey') return journeyLevel(arg || save.journeyUnlocked);
  if (m === 'daily') return dailyLevel(dailyInfo ? dailyInfo.date : today());
  if (m === 'practice') return practiceLevel(arg || 1);
  if (m === 'challenge') return challengeLevel(arg || 'moves');
  if (m === 'learn') return tutorialLevel(arg || 1);
  return journeyLevel(1);
}

function startRun(m, arg, keepAttempts = false) {
  mode = m; modeArg = arg;
  level = pickLevel(m, arg);
  if (!keepAttempts) attempts = 0;
  state = createRun(level, attempts);
  prevState = state;
  commands = [];
  queuedAction = null;
  accumulator = 0;
  machine = 'countdown';
  countdownLeft = 3;
  if (gl) gfx.loadLevel(level);
  ui.setHudVisible(true);
  ui.showCountdown('3');
  ui.announce('objective', objectiveText());
}

function objectiveText() {
  if (!level) return '';
  if (level.tutorialFlags) {
    const t = level.tutorialFlags;
    if (t.lesson === 1) return 'Lesson 1: press JUMP (Space) to clear the amber slabs.';
    if (t.lesson === 2) return 'Lesson 2: press FORM (F) to become NOVA and phase through the violet gates.';
    return 'Lesson 3: combine jumps and form changes to reach the beacon.';
  }
  if (level.challenge && level.challenge.kind === 'move-limit') {
    return `Move limit: finish using at most ${level.challenge.maxActions} actions.`;
  }
  if (level.challenge && level.challenge.kind === 'speed') {
    return `Speed target: finish in under ${level.challenge.target + 1} seconds.`;
  }
  return 'Reach the beacon. Jump amber slabs; phase violet gates as NOVA.';
}

function queueAction(type) {
  if (machine !== 'active') return;
  queuedAction = type; // latest input wins within a tick (quantization)
}

function stepOnce() {
  prevState = state;
  const cmd = queuedAction || 'none';
  queuedAction = null;
  const wasGrounded = state.grounded;
  const prevForm = state.form;
  const prevCp = state.checkpointsPassed;
  const prevGems = state.gemsCollected;
  state = applyCommand(state, level, cmd);
  commands.push(cmd);
  if (cmd === 'jump' && wasGrounded) audio.playJump();
  if (cmd === 'form' && state.form !== prevForm) audio.playFormChange();
  if (state.checkpointsPassed > prevCp) audio.playCheckpoint();
  if (state.gemsCollected > prevGems) audio.playGem();
  if (state.phase !== 'active') {
    machine = 'resolving';
    if (state.phase === 'won') audio.playWin(); else { audio.playDeath(); gfx.triggerShake(0.35); }
    setTimeout(finishRun, 500); // short resolution beat, then results
  }
}

function challengeFailed() {
  if (!level.challenge) return null;
  if (state.phase !== 'won') return null;
  const actions = state.jumpsUsed + state.formsUsed;
  if (level.challenge.kind === 'move-limit' && actions > level.challenge.maxActions) {
    return `Move limit exceeded (${actions}/${level.challenge.maxActions}).`;
  }
  if (level.challenge.kind === 'speed' && state.elapsed > level.challenge.target + 1) {
    return `Too slow (${state.elapsed.toFixed(1)}s, target ${level.challenge.target + 1}s).`;
  }
  return null;
}

function finishRun() {
  machine = 'results';
  const score = scoreOf(state);
  const won = state.phase === 'won';
  if (!won) attempts += 1;
  const failReason = challengeFailed();
  const lines = [];

  if (won) {
    if (mode === 'journey') {
      const idx = modeArg || save.journeyUnlocked;
      const id = level.id;
      const best = save.journeyBest[id];
      if (best === undefined || score.total > best) save.journeyBest[id] = score.total;
      if (idx >= save.journeyUnlocked && idx < 40) save.journeyUnlocked = idx + 1;
      unlockAch('first-clear');
      if (idx === 40) unlockAch('journey-complete');
      persist();
    } else if (mode === 'learn') {
      save.tutorialDone[level.tutorialFlags.lesson] = true;
      if (Object.keys(save.tutorialDone).length >= 3) unlockAch('tutorial-graduate');
      persist();
    } else if (mode === 'daily') {
      const d = dailyInfo ? dailyInfo.date : today();
      const best = save.dailyBest[d];
      if (best === undefined || score.total > best) { save.dailyBest[d] = score.total; persist(); }
      submitDailyScore(score.total);
    }
  }
  if (state.jumpsUsed + state.formsUsed === 0 && state.phase === 'dead') unlockAch('oof');

  const headline = won && !failReason ? 'STAGE CLEAR!' : (won ? 'CLEAR — CHALLENGE FAILED' : 'WIPED OUT');
  if (failReason) lines.push(failReason);
  lines.push(`Time ${state.elapsed.toFixed(1)}s · ${state.jumpsUsed} jumps · ${state.formsUsed} form changes`);

  const best = mode === 'journey' ? save.journeyBest[level.id]
    : mode === 'daily' ? save.dailyBest[dailyInfo ? dailyInfo.date : today()] : null;

  const canNext = won && !failReason &&
    ((mode === 'journey' && (modeArg || 1) < 40) || (mode === 'learn' && level.tutorialFlags.lesson < 3));
  ui.setHudVisible(false);
  ui.showResults({
    headline, score, best, extraLines: lines, canNext,
    onNext: () => startRun(mode, mode === 'learn' ? level.tutorialFlags.lesson + 1 : (modeArg || save.journeyUnlocked - 1) + 1),
  });
}

function submitDailyScore(scoreTotal) {
  if (!dailyInfo) return;
  const envelope = buildEnvelope(level, commands, 0);
  fetch('/api/v1/scores', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'guest', seed: dailyInfo.seed, date: dailyInfo.date,
      contentVersion: dailyInfo.contentVersion,
      commands: envelope.commands, scoreClaim: scoreTotal,
    }),
  }).then((r) => r.json()).then((res) => {
    if (res && res.ok) ui.announce('results', `Daily leaderboard rank ${res.rank}.`);
  }).catch(() => { /* offline: local best already saved */ });
}

// --- Main loop ------------------------------------------------------------------
function frame(now) {
  requestAnimationFrame(frame);
  if (!lastFrame) lastFrame = now;
  let dt = (now - lastFrame) / 1000;
  lastFrame = now;
  if (dt > 0.25) dt = 0.25; // tab was throttled; don't fast-forward wildly

  if (machine === 'countdown') {
    accumulator += dt;
    if (accumulator >= 1) {
      accumulator -= 1;
      countdownLeft -= 1;
      if (countdownLeft > 0) ui.showCountdown(String(countdownLeft));
      else { machine = 'active'; ui.showScreen(null); ui.announce('objective', 'Go!'); }
    }
  } else if (machine === 'active') {
    accumulator += dt;
    while (accumulator >= STEP_SECONDS && machine === 'active') {
      accumulator -= STEP_SECONDS;
      stepOnce();
    }
  }

  if (gl && state && (machine === 'active' || machine === 'countdown' ||
      machine === 'paused' || machine === 'resolving')) {
    const alpha = machine === 'active' ? accumulator / STEP_SECONDS : 1;
    const beatPhase = (now / 1000 / audio.beatPeriod()) % 1;
    gfx.render(state, prevState, alpha, beatPhase);
  }

  if (machine === 'active' && state) {
    ui.updateHUD(state, level, scoreOf(state).total, objectiveText());
  }
}

// --- Input -------------------------------------------------------------------
function onKeyDown(e) {
  if (e.repeat) return;
  const k = e.key;
  if (k === 'Escape' || k === 'p' || k === 'P') {
    if (machine === 'active') pauseGame();
    else if (machine === 'paused') resumeGame();
    return;
  }
  // Don't steal keys from form controls in menus.
  const tag = document.activeElement && document.activeElement.tagName;
  if (machine !== 'active' || tag === 'INPUT' || tag === 'SELECT') return;
  if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') {
    e.preventDefault(); audio.unlock(); queueAction('jump');
  } else if (k === 'f' || k === 'F' || k === 'ArrowDown' || k === 's' || k === 'S') {
    e.preventDefault(); audio.unlock(); queueAction('form');
  }
}

function onCanvasPointer(e) {
  if (machine !== 'active') return;
  e.preventDefault();
  audio.unlock();
  // Touch zones: left half = form, right half = jump (mirrored when left-handed).
  const left = e.clientX < window.innerWidth / 2;
  const jumpZone = save.settings.leftHanded ? left : !left;
  queueAction(jumpZone ? 'jump' : 'form');
}

function pauseGame() {
  if (machine !== 'active') return;
  machine = 'paused';
  screenBeforeOverlay = 'screen-pause';
  ui.showScreen('screen-pause');
}

function resumeGame() {
  if (machine !== 'paused') return;
  machine = 'active';
  lastFrame = 0; // discard time spent paused
  ui.showScreen(null);
}

function leaveToTitle() {
  machine = 'title';
  ui.setHudVisible(false);
  ui.refreshMetaScreens(save);
  ui.showScreen('screen-title');
}

// --- Server time + daily ------------------------------------------------------
async function syncDaily() {
  if (/^[0-9a-f-]{36}\.starhermit\.com$/i.test(location.hostname)) {
    dailyInfo = null;
    ui.setDailyLine('Daily challenge: local UTC day, unranked.');
    return;
  }
  try {
    const t0 = Date.now();
    const r = await fetch('/api/v1/time');
    const body = await r.json();
    if (body && Number.isFinite(body.now)) {
      clockOffset = body.now - Math.round((t0 + Date.now()) / 2);
    }
    const d = await (await fetch('/api/v1/daily')).json();
    if (d && d.date && Number.isFinite(d.seed)) {
      dailyInfo = d;
      ui.setDailyLine(`Daily challenge for ${d.date} — seed ${d.seed.toString(16)}. Ranked.`);
    }
  } catch (_) {
    dailyInfo = null;
    ui.setDailyLine('Daily challenge: offline — using local UTC day, unranked.');
  }
}

// --- Boot ----------------------------------------------------------------------
function boot() {
  ui.init({
    onPlay: () => { audio.unlock(); audio.playUi(); ui.showScreen('screen-modes'); },
    onMode: (m, arg) => {
      audio.unlock(); audio.playUi();
      if (m === 'journey' && arg === undefined) { ui.showScreen('screen-journey'); return; }
      if (m === 'practice' && arg === undefined) { ui.showScreen('screen-practice'); return; }
      if (m === 'challenge' && arg === undefined) { ui.showScreen('screen-challenge'); return; }
      if (m === 'learn' && arg === undefined) {
        const next = [1, 2, 3].find((l) => !save.tutorialDone[l]) || 1;
        startRun('learn', next);
        return;
      }
      startRun(m, arg);
    },
    onResume: resumeGame,
    onRetry: () => { if (machine !== 'active') startRun(mode, modeArg, true); },
    onLeave: leaveToTitle,
    onShowOverlay: (name) => {
      if (machine === 'paused') screenBeforeOverlay = 'screen-pause';
      else if (!document.getElementById('screen-results').hidden) screenBeforeOverlay = 'screen-results';
      else if (!document.getElementById('screen-modes').hidden
        || !document.getElementById('screen-journey').hidden
        || !document.getElementById('screen-practice').hidden
        || !document.getElementById('screen-challenge').hidden) screenBeforeOverlay = 'screen-modes';
      else screenBeforeOverlay = 'screen-title';
      ui.showScreen(name);
    },
    onHelpBack: () => screenBeforeOverlay,
    onSettingsChange: (patch) => {
      save.settings = { ...save.settings, ...patch };
      persist(); applySettings();
    },
  });
  ui.refreshMetaScreens(save);
  applySettings();

  const canvas = document.getElementById('game-canvas');
  gl = gfx.mount(canvas);
  if (!gl) { ui.showScreen('webgl-error'); return; }
  gfx.setQuality(save.settings.graphicsTier);
  gfx.setReducedMotion(save.settings.reducedMotion);
  gfx.loadLevel(journeyLevel(1)); // ambient backdrop behind menus

  canvas.addEventListener('pointerdown', onCanvasPointer);
  document.getElementById('touch-jump').addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation(); audio.unlock(); queueAction('jump');
  });
  document.getElementById('touch-form').addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation(); audio.unlock(); queueAction('form');
  });
  document.getElementById('hud-pause').addEventListener('click', pauseGame);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', () => gfx.resize());
  window.addEventListener('orientationchange', () => setTimeout(() => gfx.resize(), 100));
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) ui.setTouchMode(true);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (machine === 'active') pauseGame();
      audio.suspend();
    } else {
      audio.resume();
      gfx.resize();
    }
  });

  machine = 'title';
  ui.showScreen('screen-title');
  syncDaily();
  requestAnimationFrame(frame);
}

if (typeof document !== 'undefined') {
  window.addEventListener('error', (e) => {
    document.body.dataset.bootError = `${e.message} @ ${e.filename}:${e.lineno}`;
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
