import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPreset, resolve, presetTier, choosePreset, describe, PRESETS, CATEGORIES } from '../src/render/gfx.js';
import { GFX_STRINGS, pickLocale } from '../src/ui/gfx-i18n.js';

test('detectPreset maps GPU strings to tiers', () => {
  assert.equal(detectPreset('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), 'low');
  assert.equal(detectPreset('llvmpipe (LLVM 15.0.7, 256 bits)'), 'low');
  assert.equal(detectPreset('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0)'), 'high');
  assert.equal(detectPreset('Apple M2'), 'high');
  assert.equal(detectPreset('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)'), 'balanced');
  assert.equal(detectPreset('Adreno (TM) 650'), 'balanced');
  assert.equal(detectPreset(''), 'balanced');
  assert.equal(detectPreset('Apple M2', { mobile: true }), 'balanced', 'touch devices cap Auto at balanced');
  assert.equal(detectPreset('SwiftShader', { mobile: true }), 'low');
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
