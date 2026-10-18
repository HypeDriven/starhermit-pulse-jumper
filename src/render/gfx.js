'use strict';

// Graphics quality model: presets, per-category overrides, StarHermit hardware-level
// detection, per-preset budgets and a cost summary. Pure (no three.js) so the settings panel, the renderer and the
// unit tests agree on what a setting means.

export const PRESETS = ['low', 'balanced', 'high', 'ultra'];

// Category → allowed tiers, cheapest first.
export const CATEGORIES = {
  shadows: ['off', 'low', 'medium', 'high'],
  ao: ['off', 'on', 'high'],
  bloom: ['off', 'on'],
  grade: ['off', 'on'],
  antialias: ['off', 'fxaa', 'smaa', 'msaa'],
  reflections: ['off', 'on'],
  particles: ['off', 'low', 'high'],
  background: ['static', 'animated'],
  detail: ['plain', 'detailed'],
};

// Each preset is a row of tiers, a render scale (multiplies the capped device
// pixel ratio) and a device-pixel-ratio cap.
const TABLE = {
  low: { scale: 1, dprCap: 1, shadows: 'off', ao: 'off', bloom: 'off', grade: 'off', antialias: 'msaa', reflections: 'off', particles: 'off', background: 'static', detail: 'plain' },
  balanced: { scale: 1, dprCap: 1.5, shadows: 'low', ao: 'off', bloom: 'on', grade: 'on', antialias: 'fxaa', reflections: 'on', particles: 'low', background: 'animated', detail: 'detailed' },
  high: { scale: 1, dprCap: 2, shadows: 'medium', ao: 'on', bloom: 'on', grade: 'on', antialias: 'smaa', reflections: 'on', particles: 'high', background: 'animated', detail: 'detailed' },
  ultra: { scale: 1.25, dprCap: 2, shadows: 'high', ao: 'high', bloom: 'on', grade: 'on', antialias: 'msaa', reflections: 'on', particles: 'high', background: 'animated', detail: 'detailed' },
};

export const SHADOW_MAP = { off: 0, low: 1024, medium: 2048, high: 4096 };

export const DEFAULT_GRAPHICS = Object.freeze({ preset: 'auto', render_scale: 1, adaptive: true, show_fps: false });

// Auto picks the preset from the StarHermit hardware level (0 = Galaxy S20 / Intel UHD or weaker, 20 = RTX
// 5090; src/render/gpu-level.js → window.StarHermitGpu, a classic script loaded before the game): Low from 0,
// Balanced from 4, High from 10, Ultra from 17. Phones, tablets and ≤ 4 GB machines are capped at level 9.
export const LEVELS = { low: 0, balanced: 4, high: 10, ultra: 17 };
const gpuApi = () => globalThis.StarHermitGpu;

/** Hardware level 0–20 for an unmasked renderer string plus StarHermitGpu.detectSystem() facts. */
export function detectLevel(gpu, system) {
  const G = gpuApi();
  const sys = { webgl: true, webgl2: true, ...(system || {}), gpu: String(gpu || '') };
  if (!gpu) sys.webgl = false; // no renderer string: no usable WebGL
  return G ? G.detectLevel(sys) : (gpu ? LEVELS.balanced : 0);
}

/** The preset Auto starts from for a hardware level. */
export function presetForLevel(level) {
  const G = gpuApi();
  return G ? G.presetForLevel(level, LEVELS) : PRESETS.filter((p) => LEVELS[p] <= level).pop() || 'low';
}

/** Best preset for this GPU (the hardware level already caps phones/tablets at Balanced). */
export function detectPreset(gpu, system) {
  return presetForLevel(detectLevel(gpu, system));
}

/*
 * Per-preset asset and effect budget. Each preset holds 60 FPS on the weakest GPU Auto gives it (Low →
 * level 0, Balanced → 4, High → 10, Ultra → 17; measured with tests/gfx-bench.mjs). The course, obstacle
 * sizes, collision and timing are identical on every preset — only visuals change.
 *   material   runner / slab / gate / gem / floor shading: lambert (Low) / standard (Balanced) / physical
 *              clear-coated (High, Ultra)
 *   seg        curved-mesh segment multiplier (runner sphere, rings, gate pillars, sky dome)
 *   texture    floor roughness-noise texture size in px (Detail on)
 *   particles  beat-particle count at Particles "high" (low: 3/8), scaled with the level
 *   trail      motion-trail points behind the runner (Particles high)
 *   bloomRes / aoRes  bloom and GTAO resolution as a fraction of the frame
 */
export const BUDGETS = {
  low: { material: 'lambert', seg: 0.5, texture: 64, particles: 120, trail: 16, bloomRes: 0.5, aoRes: 0.5 },
  balanced: { material: 'standard', seg: 0.75, texture: 128, particles: 160, trail: 20, bloomRes: 0.5, aoRes: 0.5 },
  high: { material: 'physical', seg: 1, texture: 256, particles: 240, trail: 28, bloomRes: 0.5, aoRes: 0.5 },
  ultra: { material: 'physical', seg: 1.5, texture: 512, particles: 360, trail: 40, bloomRes: 1, aoRes: 1 },
};
export const PARTICLE_MAX = 720;
export const TRAIL_MAX = 40;
const PARTICLE_SHARE = { off: 0, low: 0.375, high: 1 };

/** A preset's concrete budget for a hardware level (particle counts scale ≤ 2× within the preset). */
export function budgetFor(preset, level) {
  const b = { ...(BUDGETS[preset] || BUDGETS.balanced) };
  const G = gpuApi(), floor = LEVELS[preset] || 0;
  const lv = Math.max(Number.isFinite(level) ? level : floor, floor);
  const k = G ? Math.min(2, G.scaleBudget(1, lv, floor)) : 1;
  b.particles = Math.min(PARTICLE_MAX, Math.round(b.particles * k));
  return b;
}

/** Live beat-particle count for a resolved setting (Particles tier share of the preset's budget). */
export function particleCount(r) {
  return Math.round(r.budget.particles * (PARTICLE_SHARE[r.particles] ?? 0));
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

/**
 * Resolve saved settings into concrete tiers.
 * `saved`: { preset: 'auto'|preset, render_scale, adaptive, show_fps, <category>: 'preset'|tier }.
 */
export function resolve(saved, detected, level) {
  const s = saved || {};
  const auto = !PRESETS.includes(s.preset);
  const preset = auto ? (PRESETS.includes(detected) ? detected : 'balanced') : s.preset;
  const row = TABLE[preset];
  const userScale = clamp(Number(s.render_scale) || 1, 0.5, 2);
  const out = { preset, auto, userScale, scale: row.scale * userScale, dprCap: row.dprCap };
  for (const [cat, tiers] of Object.entries(CATEGORIES)) {
    out[cat] = tiers.includes(s[cat]) ? s[cat] : row[cat];
  }
  out.level = Number.isFinite(level) ? level : LEVELS[preset];
  out.budget = budgetFor(preset, out.level);
  out.adaptive = s.adaptive !== false;
  out.showFps = !!s.show_fps;
  // Post-processing runs only when something needs it; otherwise the canvas MSAA is used.
  out.post = out.ao !== 'off' || out.bloom === 'on' || out.grade === 'on'
    || out.antialias === 'fxaa' || out.antialias === 'smaa';
  return out;
}

/** The preset's own tier for a category (for "From preset (…)" labels). */
export function presetTier(preset, cat) {
  return TABLE[preset]?.[cat];
}

/** Choosing a preset clears every per-category override (keeps scale/adaptive/fps). */
export function choosePreset(saved, preset) {
  const s = saved || {};
  const out = { ...DEFAULT_GRAPHICS, preset: PRESETS.includes(preset) ? preset : 'auto' };
  if (s.render_scale !== undefined) out.render_scale = s.render_scale;
  if (s.adaptive !== undefined) out.adaptive = s.adaptive;
  if (s.show_fps !== undefined) out.show_fps = s.show_fps;
  return out;
}

const EN = {
  noShadows: 'no shadows', shadows: '{n}² shadows', ao: 'ambient occlusion', aoHigh: 'full ambient occlusion',
  bloom: 'bloom', noAa: 'no anti-aliasing', particles: '{n} particles',
};

/** Cost summary; `t(key)` supplies localized fragments (English by default). */
export function describe(r, pixels, t = (k) => EN[k]) {
  const parts = [
    r.shadows === 'off' ? t('noShadows') : t('shadows').replace('{n}', SHADOW_MAP[r.shadows]),
    r.ao === 'off' ? null : r.ao === 'high' ? t('aoHigh') : t('ao'),
    r.bloom === 'on' ? t('bloom') : null,
    r.antialias === 'off' ? t('noAa') : r.antialias.toUpperCase(),
    r.particles === 'off' ? null : t('particles').replace('{n}', particleCount(r)),
    pixels ? `${pixels[0]}×${pixels[1]} px` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}
