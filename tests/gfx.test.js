import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// src/render/gpu-level.js is a classic script in the page (window.StarHermitGpu); evaluate it the same way here.
new Function('window', 'module', readFileSync(new URL('../src/render/gpu-level.js', import.meta.url), 'utf8'))(globalThis, undefined);
const { detectPreset, detectLevel, presetForLevel, budgetFor, particleCount, resolve, presetTier, choosePreset, describe,
  PRESETS, CATEGORIES, LEVELS, BUDGETS, PARTICLE_MAX, TRAIL_MAX } = await import('../src/render/gfx.js');
const { GFX_STRINGS, pickLocale } = await import('../src/ui/gfx-i18n.js');

const DESK = { cores: 8, memoryGb: 8 };
const PHONE = { mobile: true, cores: 8, memoryGb: 8 };

test('hardware level picks the Auto preset (Low 0, Balanced 4, High 10, Ultra 17)', () => {
  assert.equal(detectPreset('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', DESK), 'low');
  assert.equal(detectLevel('llvmpipe (LLVM 15.0.7, 256 bits)', DESK), 0);
  assert.equal(detectPreset('', DESK), 'low', 'no WebGL');
  assert.equal(detectPreset('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', DESK), 'low');
  assert.equal(detectPreset('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', DESK), 'low');
  assert.equal(detectPreset('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)', DESK), 'balanced');
  assert.equal(detectPreset('ANGLE (NVIDIA, NVIDIA GeForce GTX 1070 Direct3D11 vs_5_0 ps_5_0)', DESK), 'high');
  assert.equal(detectPreset('ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0)', DESK), 'ultra');
  assert.equal(detectLevel('ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 Direct3D11 vs_5_0 ps_5_0)', DESK), 20);
  assert.equal(detectPreset('ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 Direct3D11 vs_5_0 ps_5_0)', DESK), 'ultra');
  for (const [p, lv] of Object.entries(LEVELS)) assert.equal(presetForLevel(lv), p);
  assert.equal(presetForLevel(3), 'low');
  assert.equal(presetForLevel(16), 'high');
});

test('phones and tablets are Balanced at most; software GPUs stay Low', () => {
  assert.equal(detectPreset('Adreno (TM) 740', PHONE), 'balanced');
  assert.ok(detectLevel('Adreno (TM) 740', PHONE) <= 9);
  assert.equal(detectPreset('Apple M2', PHONE), 'balanced');
  assert.equal(detectPreset('SwiftShader', PHONE), 'low');
});

test('per-preset budgets are explicit, grow from Low to Ultra and scale with the level', () => {
  const keys = ['material', 'seg', 'texture', 'particles', 'trail', 'bloomRes', 'aoRes'];
  for (const p of PRESETS) for (const k of keys) assert.ok(BUDGETS[p][k] != null, `${p}.${k}`);
  for (let i = 1; i < PRESETS.length; i++) for (const k of keys) {
    if (typeof BUDGETS.low[k] === 'number') assert.ok(BUDGETS[PRESETS[i]][k] >= BUDGETS[PRESETS[i - 1]][k], `${PRESETS[i]}.${k}`);
  }
  assert.deepEqual(PRESETS.map((p) => BUDGETS[p].material), ['lambert', 'standard', 'physical', 'physical']);
  assert.deepEqual(PRESETS.map((p) => BUDGETS[p].bloomRes), [0.5, 0.5, 0.5, 1], 'half-res bloom below Ultra');
  assert.deepEqual(resolve({ preset: 'high' }, 'low', 10).budget, BUDGETS.high, 'floor level = the tuned budget');
  assert.deepEqual(resolve({ preset: 'ultra' }, 'low', 0).budget, resolve({ preset: 'ultra' }, 'ultra', 17).budget);
  assert.ok(budgetFor('balanced', 9).particles > budgetFor('balanced', 4).particles, 'counts scale up within the preset');
  assert.ok(budgetFor('ultra', 20).particles <= PARTICLE_MAX);
  for (const p of PRESETS) assert.ok(BUDGETS[p].trail <= TRAIL_MAX);
  assert.equal(particleCount(resolve({ preset: 'high' }, 'low', 10)), BUDGETS.high.particles);
  assert.equal(particleCount(resolve({ preset: 'balanced' }, 'low', 4)), Math.round(BUDGETS.balanced.particles * 0.375));
  assert.equal(particleCount(resolve({ preset: 'low' }, 'low', 0)), 0, 'Low: particles off');
  assert.equal(resolve({}, 'low', 0).budget.material, 'lambert', 'headless SwiftShader: Low, Lambert');
});

test('resolve: auto follows detection, presets fill every category', () => {
  const r = resolve({}, 'low');
  assert.equal(r.preset, 'low');
  assert.equal(r.auto, true);
  assert.equal(r.post, false, 'Low renders without a post chain');
  assert.equal(r.shadows, 'off');
  for (const p of PRESETS) {
    const x = resolve({ preset: p }, 'low');
    assert.equal(x.preset, p);
    assert.equal(x.auto, false);
    for (const [cat, tiers] of Object.entries(CATEGORIES)) assert.ok(tiers.includes(x[cat]), `${p}.${cat}`);
  }
  assert.equal(resolve({ preset: 'bogus' }, 'high').preset, 'high');
});

test('resolve: overrides win, invalid overrides fall back, scale clamps', () => {
  const r = resolve({ preset: 'high', bloom: 'off', shadows: 'nonsense', render_scale: 9 }, 'low');
  assert.equal(r.bloom, 'off');
  assert.equal(r.shadows, presetTier('high', 'shadows'));
  assert.equal(r.userScale, 2);
  assert.equal(resolve({ render_scale: 0.1 }, 'low').userScale, 0.5);
  assert.equal(resolve({ preset: 'ultra' }, 'low').scale, 1.25);
  assert.equal(resolve({ preset: 'low', grade: 'on' }, 'low').post, true);
  assert.equal(resolve({}, 'low').adaptive, true);
  assert.equal(resolve({ adaptive: false, show_fps: true }, 'low').showFps, true);
});

test('choosing a preset clears overrides but keeps scale/adaptive/fps', () => {
  const next = choosePreset({ preset: 'high', bloom: 'off', ao: 'high', render_scale: 1.5, adaptive: false, show_fps: true }, 'low');
  assert.deepEqual(next, { preset: 'low', render_scale: 1.5, adaptive: false, show_fps: true });
  assert.equal(choosePreset({}, 'auto').preset, 'auto');
});

test('describe summarises cost', () => {
  const s = describe(resolve({ preset: 'high' }, 'low'), [1280, 800]);
  assert.match(s, /2048² shadows/);
  assert.match(s, /bloom/);
  assert.match(s, /1280×800 px/);
  assert.match(describe(resolve({}, 'low')), /no shadows/);
});

test('graphics strings exist for every required locale', () => {
  const keys = Object.keys(GFX_STRINGS['en-US']);
  for (const loc of ['en-US', 'en-GB', 'es-419', 'es-ES', 'de-DE', 'fr-FR', 'fr-CA', 'pt-BR', 'it-IT']) {
    const t = GFX_STRINGS[loc];
    assert.ok(t, loc);
    for (const k of keys) assert.ok(t[k], `${loc}.${k}`);
    for (const cat of Object.keys(CATEGORIES)) assert.ok(t.cat[cat], `${loc}.cat.${cat}`);
    for (const tiers of Object.values(CATEGORIES)) for (const tier of tiers) assert.ok(t.tier[tier], `${loc}.tier.${tier}`);
    for (const p of PRESETS) assert.ok(t.tier[p], `${loc}.tier.${p}`);
  }
  assert.equal(pickLocale('fr-CA'), 'fr-CA');
  assert.equal(pickLocale('es-MX'), 'es-419');
  assert.equal(pickLocale('en-AU'), 'en-GB');
  assert.equal(pickLocale('ja-JP'), 'en-US');
});

test('save migration carries a legacy low/medium tier into the graphics preset', async () => {
  const { migrate, defaultSave } = await import('../src/core/save.js');
  assert.equal(defaultSave().settings.graphics.preset, 'auto');
  assert.equal(migrate({ version: 1, settings: { graphicsTier: 'low' } }).settings.graphics.preset, 'low');
  assert.equal(migrate({ version: 1, settings: { graphicsTier: 'medium' } }).settings.graphics.preset, 'balanced');
  assert.equal(migrate({ version: 1, settings: { graphicsTier: 'high' } }).settings.graphics.preset, 'auto');
  const kept = migrate({ version: 1, settings: { graphicsTier: 'low', graphics: { preset: 'ultra', bloom: 'off' } } });
  assert.deepEqual(kept.settings.graphics, { preset: 'ultra', bloom: 'off' });
});
