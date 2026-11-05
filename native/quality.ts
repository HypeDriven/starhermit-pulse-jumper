// The look per graphics level. The engine's level (levelSettings()) owns the
// engine effects: shadow on/off and map size, AO, bloom, grade, anti-aliasing,
// the texture cap, and how far the beat particles scale within the tier (the
// level's particle budget over the tier's anchor level, at most 2×). The art
// stays the browser build's four presets (src/render/gfx.js, each tuned to hold
// 60 FPS), keyed by the level's quality tier. The course, obstacle sizes,
// collision and timing are identical on every tier — only visuals change. The
// runtime owns the rest of the old Graphics panel: Auto and the level choice,
// render scale and the pixel-ratio cap, adaptive resolution, the frame-rate
// limit and readout. The panel's per-effect overrides are not offered.
import { levelSettings, type GraphicsLevel, type LevelSettings, type QualityTier } from "starhermit:engine";
import type { AntialiasMode } from "starhermit:scene";

export interface Budget {
  /** Runner, slab, gate, gem and floor shading: Lambert (Low), standard (Balanced), clear-coated physical (High, Ultra). */
  material: "lambert" | "standard" | "physical";
  /** Curved-mesh segment multiplier (runner sphere, rings, gate pillars, sky dome). */
  seg: number;
  /** Floor roughness-noise texture size in px (detail on). */
  texture: number;
  /** Beat particles at Particles high (low: 3/8). */
  particles: number;
  /** Motion-trail points behind the runner (Particles high). */
  trail: number;
}
interface Art {
  /** Image-based lighting from the room environment. */
  reflections: boolean;
  particles: "off" | "low" | "high";
  /** Twinkling stars and the sun's scrolling stripes. */
  animatedSky: boolean;
  /** Lane edges, skyline, slab edges, beacon glow, runner halo, the synth sun, the floor's roughness map. */
  detailed: boolean;
}
export interface Look extends Art {
  preset: QualityTier;
  /** Key-light shadow map, the level's size (0 = off). */
  shadows: number;
  ao: { resolution: number; samples: number; denoiseSamples: number } | null;
  /** Bloom's resolution, the level's (null = off). */
  bloom: number | null;
  grade: boolean;
  antialias: AntialiasMode;
  budget: Budget;
  /** Live beat particles (the Particles tier's share of the budget). */
  particleCount: number;
}

const ART: Record<QualityTier, Art> = {
  low: { reflections: false, particles: "off", animatedSky: false, detailed: false },
  balanced: { reflections: true, particles: "low", animatedSky: true, detailed: true },
  high: { reflections: true, particles: "high", animatedSky: true, detailed: true },
  ultra: { reflections: true, particles: "high", animatedSky: true, detailed: true },
};
const BUDGETS: Record<QualityTier, Budget> = {
  low: { material: "lambert", seg: 0.5, texture: 64, particles: 120, trail: 16 },
  balanced: { material: "standard", seg: 0.75, texture: 128, particles: 160, trail: 20 },
  high: { material: "physical", seg: 1, texture: 256, particles: 240, trail: 28 },
  ultra: { material: "physical", seg: 1.5, texture: 512, particles: 360, trail: 40 },
};
export const PARTICLE_MAX = 720;
export const TRAIL_MAX = 40;
const SHARE = { off: 0, low: 0.375, high: 1 };
const ANCHOR: Record<QualityTier, GraphicsLevel> = { low: "quantum", balanced: "molecular", high: "terrestrial", ultra: "galactic" };

/** The look for a graphics level's settings. */
export function lookFor(s: LevelSettings = levelSettings()): Look {
  const preset = s.quality;
  const k = Math.min(2, s.particles / levelSettings(ANCHOR[preset]).particles);
  const b = BUDGETS[preset];
  const budget = { ...b, texture: Math.min(b.texture, s.maxTextureSize), particles: Math.min(PARTICLE_MAX, Math.round(b.particles * k)) };
  const art = ART[preset];
  return {
    preset, ...art,
    shadows: s.shadows ? s.shadowMapSize : 0,
    ao: s.ao && { resolution: s.ao.resolution, samples: s.ao.samples, denoiseSamples: s.ao.denoiseSamples },
    bloom: s.bloom ? s.bloom.resolution : null,
    grade: s.grade,
    antialias: s.antialias,
    budget,
    particleCount: Math.round(budget.particles * SHARE[art.particles]),
  };
}
