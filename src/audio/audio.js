'use strict';

// Procedural WebAudio: event blips + a pulsing ambient loop, with optional
// authored one-shot samples (sfx/*.opus) layered on top. Samples are lazy
// fetched after the user-gesture unlock; the synthesized blips remain the
// fallback while a sample is loading or if it fails to load.
// Resumes on first user gesture; silent while the tab is hidden.

let ctx = null;
let master = null, musicBus = null, effectsBus = null;
let musicTimer = null;
let beat = 0;
let settings = { musicVolume: 0.6, effectsVolume: 0.8, muted: false };

// Authored sample variants per event (basenames under sfx/, see
// sfx/manifest.json). Every event keeps its synthesized fallback below.
const SFX_BY_EVENT = {
  playJump: ['jump-launch', 'jump-soft'],
  playFormChange: ['form-shift-pulse', 'form-shift-nova'],
  playCheckpoint: ['checkpoint-chime'],
  playGem: ['gem-pickup', 'gem-sparkle'],
  playDeath: ['death-zap'],
  playWin: ['win-fanfare'],
  playUi: ['ui-click', 'ui-confirm', 'ui-back'],
};
// name -> AudioBuffer | 'loading' | 'failed'
const sampleCache = new Map();
const variantCursor = new Map();

function requestSample(name) {
  if (!ctx || sampleCache.has(name)) return;
  sampleCache.set(name, 'loading');
  fetch(`sfx/${name}.opus`)
    .then((res) => {
      if (!res.ok) throw new Error(`sfx ${name}: HTTP ${res.status}`);
      return res.arrayBuffer();
    })
    .then((bytes) => ctx.decodeAudioData(bytes))
    .then((buffer) => { sampleCache.set(name, buffer); })
    .catch(() => { sampleCache.set(name, 'failed'); });
}

// Play an authored sample for the event if one is already cached.
// Kicks off lazy loads for the event's variants either way; returns false
// when no sample was audible so the caller can run the synth fallback.
function playSample(eventName) {
  if (!ctx || ctx.state !== 'running') return false;
  const names = SFX_BY_EVENT[eventName] || [];
  const ready = names.filter((n) => sampleCache.get(n) instanceof AudioBuffer);
  if (!ready.length) {
    names.forEach(requestSample);
    return false;
  }
  const i = (variantCursor.get(eventName) || 0) % ready.length;
  variantCursor.set(eventName, i + 1);
  const buffer = ready[i];
  if (!buffer || typeof buffer.duration !== 'number') return false;
  try {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(effectsBus);
    src.start();
    return true;
  } catch {
    sampleCache.set(names[i], 'failed');
    return false;
  }
}

function ensureContext() {
  if (ctx) return true;
  const AC = typeof AudioContext !== 'undefined' ? AudioContext
    : (typeof globalThis.webkitAudioContext !== 'undefined' ? globalThis.webkitAudioContext : null);
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.connect(master);
  effectsBus = ctx.createGain();
  effectsBus.connect(master);
  applyVolumes();
  return true;
}

function applyVolumes() {
  if (!ctx) return;
  master.gain.value = settings.muted ? 0 : 1;
  musicBus.gain.value = settings.musicVolume * 0.5;
  effectsBus.gain.value = settings.effectsVolume;
}

export function configure(s) {
  settings = { ...settings, ...s };
  applyVolumes();
}

// Call from any user gesture.
export function unlock() {
  if (!ensureContext()) return;
  if (ctx.state === 'suspended') ctx.resume();
  startMusic();
}

export function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
export function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

function blip({ freq = 440, freqEnd = null, dur = 0.12, type = 'sine', gain = 0.3, when = 0 }) {
  if (!ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(effectsBus);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

export function playJump() {
  if (playSample('playJump')) return;
  blip({ freq: 300, freqEnd: 620, dur: 0.14, type: 'square', gain: 0.16 });
}
export function playFormChange() {
  if (playSample('playFormChange')) return;
  blip({ freq: 700, freqEnd: 220, dur: 0.16, type: 'sawtooth', gain: 0.14 });
}
export function playCheckpoint() {
  if (playSample('playCheckpoint')) return;
  blip({ freq: 520, dur: 0.1, gain: 0.2 }); blip({ freq: 780, dur: 0.14, gain: 0.2, when: 0.09 });
}
export function playGem() {
  if (playSample('playGem')) return;
  blip({ freq: 980, freqEnd: 1500, dur: 0.1, type: 'triangle', gain: 0.22 });
}
export function playDeath() {
  if (playSample('playDeath')) return;
  blip({ freq: 220, freqEnd: 60, dur: 0.4, type: 'sawtooth', gain: 0.28 });
}
export function playWin() {
  if (playSample('playWin')) return;
  [523, 659, 784, 1046].forEach((f, i) => blip({ freq: f, dur: 0.18, type: 'triangle', gain: 0.22, when: i * 0.12 }));
}
export function playUi() {
  if (playSample('playUi')) return;
  blip({ freq: 440, dur: 0.06, type: 'triangle', gain: 0.12 });
}

// Simple pulsing ambient loop: a soft kick + bass note per beat at 112 BPM.
const BEAT_SECONDS = 60 / 112;
const BASSLINE = [55, 55, 82.4, 55, 65.4, 55, 73.4, 98];

function scheduleBeat() {
  if (!ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime;
  const note = BASSLINE[beat % BASSLINE.length];
  // kick
  const k = ctx.createOscillator(); const kg = ctx.createGain();
  k.type = 'sine';
  k.frequency.setValueAtTime(140, t0);
  k.frequency.exponentialRampToValueAtTime(45, t0 + 0.12);
  kg.gain.setValueAtTime(0.5, t0);
  kg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
  k.connect(kg); kg.connect(musicBus); k.start(t0); k.stop(t0 + 0.2);
  // bass
  const o = ctx.createOscillator(); const og = ctx.createGain();
  o.type = 'triangle'; o.frequency.setValueAtTime(note, t0);
  og.gain.setValueAtTime(0.0001, t0);
  og.gain.exponentialRampToValueAtTime(0.35, t0 + 0.03);
  og.gain.exponentialRampToValueAtTime(0.001, t0 + BEAT_SECONDS * 0.9);
  o.connect(og); og.connect(musicBus); o.start(t0); o.stop(t0 + BEAT_SECONDS);
  beat += 1;
}

function startMusic() {
  if (musicTimer || !ctx) return;
  scheduleBeat();
  musicTimer = setInterval(scheduleBeat, BEAT_SECONDS * 1000);
}

export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}

// Seconds per beat so visuals can pulse to the music.
export function beatPeriod() { return BEAT_SECONDS; }
