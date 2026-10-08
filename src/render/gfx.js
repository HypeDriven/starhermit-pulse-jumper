'use strict';

// Graphics quality model: presets, per-category overrides, GPU detection and a
// cost summary. Pure (no three.js) so the settings panel, the renderer and the
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
export const PARTICLE_COUNT = { off: 0, low: 90, high: 240 };

export const DEFAULT_GRAPHICS = Object.freeze({ preset: 'auto', render_scale: 1, adaptive: true, show_fps: false });

/**
 * Best preset for this GPU from the unmasked renderer string. Software
 * renderers get Low; discrete GPUs and Apple M-series get High; everything
 * else Balanced. Touch/mobile devices are capped at Balanced.
 */
export function detectPreset(gpu, { mobile = false } = {}) {
  const g = String(gpu || '').toLowerCase();
  let p = 'balanced';
  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/.test(g)) p = 'low';
  else if (/nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|amd radeon(?!.*graphics)|apple m\d/.test(g)) p = 'high';
  if (mobile && (p === 'high' || p === 'ultra')) p = 'balanced';
  return p;
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

/**
 * Resolve saved settings into concrete tiers.
 * `saved`: { preset: 'auto'|preset, render_scale, adaptive, show_fps, <category>: 'preset'|tier }.
 */
export function resolve(saved, detected) {
  const s = saved || {};
  const auto = !PRESETS.includes(s.preset);
  const preset = auto ? (PRESETS.includes(detected) ? detected : 'balanced') : s.preset;
  const row = TABLE[preset];
  const userScale = clamp(Number(s.render_scale) || 1, 0.5, 2);
  const out = { preset, auto, userScale, scale: row.scale * userScale, dprCap: row.dprCap };
  for (const [cat, tiers] of Object.entries(CATEGORIES)) {
    out[cat] = tiers.includes(s[cat]) ? s[cat] : row[cat];
  }
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
    r.particles === 'off' ? null : t('particles').replace('{n}', PARTICLE_COUNT[r.particles]),
    pixels ? `${pixels[0]}×${pixels[1]} px` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}
