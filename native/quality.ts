// The look per graphics level: the browser build's four presets and budgets
// (src/render/gfx.js TABLE / BUDGETS, each tuned to hold 60 FPS on the
// weakest GPU its Auto gave it) keyed by the runtime's quality tier
// (frame().quality), with the beat particles scaled within the tier by the
// level (frame().levelIndex, at most 2×), as the browser build scaled them by
// its hardware level. The course, obstacle sizes, collision and timing are
// identical on every tier — only visuals change. The runtime owns the rest of
// the old Graphics panel: Auto and the level choice, render scale and the
// pixel-ratio cap, adaptive resolution, the frame-rate limit and readout.
// The panel's per-effect overrides are not offered (Options choose a level).
import type { QualityTier } from "starhermit:engine";
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
  bloomRes: number;
  aoRes: number;
}
export interface Look {
  preset: QualityTier;
  /** Key-light shadow map (0 = off). */
  shadows: 0 | 1024 | 2048 | 4096;
  ao: "off" | "on" | "high";
  bloom: boolean;
  grade: boolean;
  antialias: AntialiasMode;
  /** Image-based lighting from the room environment. */
  reflections: boolean;
  particles: "off" | "low" | "high";
  /** Twinkling stars and the sun's scrolling stripes. */
  animatedSky: boolean;
  /** Lane edges, skyline, slab edges, beacon glow, runner halo, the synth sun, the floor's roughness map. */
  detailed: boolean;
  budget: Budget;
  /** Live beat particles (the Particles tier's share of the budget). */
  particleCount: number;
}

const TABLE: Record<QualityTier, Omit<Look, "preset" | "budget" | "particleCount">> = {
  low: { shadows: 0, ao: "off", bloom: false, grade: false, antialias: "msaa", reflections: false, particles: "off", animatedSky: false, detailed: false },
  balanced: { shadows: 1024, ao: "off", bloom: true, grade: true, antialias: "fxaa", reflections: true, particles: "low", animatedSky: true, detailed: true },
  high: { shadows: 2048, ao: "on", bloom: true, grade: true, antialias: "smaa", reflections: true, particles: "high", animatedSky: true, detailed: true },
  ultra: { shadows: 4096, ao: "high", bloom: true, grade: true, antialias: "msaa", reflections: true, particles: "high", animatedSky: true, detailed: true },
};
const BUDGETS: Record<QualityTier, Budget> = {
  low: { material: "lambert", seg: 0.5, texture: 64, particles: 120, trail: 16, bloomRes: 0.5, aoRes: 0.5 },
  balanced: { material: "standard", seg: 0.75, texture: 128, particles: 160, trail: 20, bloomRes: 0.5, aoRes: 0.5 },
  high: { material: "physical", seg: 1, texture: 256, particles: 240, trail: 28, bloomRes: 0.5, aoRes: 0.5 },
  ultra: { material: "physical", seg: 1.5, texture: 512, particles: 360, trail: 40, bloomRes: 1, aoRes: 1 },
};
export const PARTICLE_MAX = 720;
export const TRAIL_MAX = 40;
const SHARE = { off: 0, low: 0.375, high: 1 };
/** The first level index of each tier (quantum, molecular, terrestrial, galactic). */
const TIER_FLOOR: Record<QualityTier, number> = { low: 0, balanced: 2, high: 4, ultra: 7 };

/** The look for a quality tier at a level index (0 … 9). */
export function lookFor(preset: QualityTier, levelIndex: number): Look {
  const b = { ...BUDGETS[preset] };
  // Levels are about 1.64× apart in GPU throughput: the particle count grows
  // with the level above the tier's first, at most 2× (gfx.js budgetFor).
  const k = Math.min(2, Math.pow(1.64, Math.max(0, levelIndex - TIER_FLOOR[preset])));
  b.particles = Math.min(PARTICLE_MAX, Math.round(b.particles * k));
  const t = TABLE[preset];
  return { preset, ...t, budget: b, particleCount: Math.round(b.particles * SHARE[t.particles]) };
}
