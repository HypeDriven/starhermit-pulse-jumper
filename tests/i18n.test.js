// Localization coverage: every English key the markup and code use is
// translated in every locale (en-GB → en-US, es-ES → es-419, fr-CA → fr-FR
// inherit), placeholders survive, the language follows sh-language.js and
// switches live, and the Graphics and StarHermit strings cover the nine locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTables, codeKeys, htmlKeys, audit, bootI18n, LOCALES } from './i18n-common.mjs';
import { GFX_STRINGS } from '../src/ui/gfx-i18n.js';
import { platformStrings } from '../src/platform-i18n.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

function usedKeys() {
  const keys = new Set(htmlKeys(read('index.html')));
  for (const f of ['src/game.js', 'src/platform.js', 'src/ui/dom-ui.js']) codeKeys(read(f)).forEach((k) => keys.add(k));
  return [...keys].sort();
}

test('every used key is translated in every locale; placeholders intact', () => {
  const used = usedKeys();
  assert.ok(used.length > 100, 'keys found: ' + used.length);
  assert.deepEqual(audit(loadTables(ROOT, 'src/strings.js', 'PJ_STRINGS'), used), []);
});

test('no player-facing literal is left untranslated in the UI module', () => {
  const src = read('src/ui/dom-ui.js');
  // el()/btn() text arguments are T(...)/N(...) calls or non-word values.
  const literals = [...src.matchAll(/\bbtn\(\s*'([^']*)'/g), ...src.matchAll(/\bel\('\w+',\s*\{[^}]*\},\s*'([^']*)'/g)];
  for (const m of literals.filter((x) => /[a-z]{3}/i.test(x[1]))) {
    if (m[1] !== 'Pulse Jumper') assert.fail('literal UI text: ' + m[1]); // the game's name stays
  }
});

test('the locale follows sh-language and switches live', () => {
  const { I18N, events, doc } = bootI18n(ROOT, { strings: 'src/strings.js', i18n: 'src/i18n.js', global: 'PJI18N', languages: ['de-DE'] });
  assert.equal(I18N.lang, 'de-DE');
  assert.equal(doc.documentElement.lang, 'de-DE');
  assert.equal(I18N.T('Settings'), 'Einstellungen');
  I18N.language.setChoice('fr-CA');
  assert.equal(I18N.lang, 'fr-CA');
  assert.equal(events.at(-1), 'fr-CA');
  assert.equal(I18N.T('SCORE'), 'POINTAGE');
  assert.equal(I18N.T('Paused'), 'En pause');
  I18N.language.setChoice('es-ES');
  assert.equal(I18N.T('Settings'), 'Ajustes');
  assert.equal(I18N.T('Best score: {n}', { n: 900 }), 'Mejor puntuación: 900');
  I18N.language.setChoice('en-GB');
  assert.equal(I18N.T('Paused'), 'Paused');
});

test('Graphics and StarHermit strings cover all nine locales', () => {
  const shKeys = Object.keys(platformStrings('en-US'));
  for (const l of LOCALES) {
    assert.ok(GFX_STRINGS[l], l);
    for (const k of shKeys) assert.ok(platformStrings(l)[k], `${l} ${k}`);
  }
});
