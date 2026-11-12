// Localization coverage: every English key the native client draws (T("…")
// and N("…") in native/*.ts) is translated in every full locale (en-GB →
// en-US, es-ES → es-419, fr-CA → fr-FR inherit), no table row is unused,
// placeholders survive; account strings are the engine's (S("…") → starhermit.*).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const LOCALES = ['en-US', 'es-419', 'de-DE', 'fr-FR', 'pt-BR', 'it-IT', 'en-GB', 'es-ES', 'fr-CA', 'fr-BE', 'de-BE', 'en-SG', 'en-HK', 'en-BQ', 'es-CO', 'de-IT', 'fr-IT', 'es-CL', 'es-AR', 'es-EC', 'ja-JP', 'nl-BE', 'zh-SG', 'ms-SG', 'ta-SG', 'zh-HK', 'yue-HK', 'nl-NL', 'fi-FI', 'sv-FI', 'et-EE', 'id-ID', 'vi-VN', 'de-BR', 'da-DE', 'lb-BE', 'co-FR', 'eu-FR', 'ca-FR', 'oc-FR', 'sl-IT', 'fur-IT', 'ca-IT', 'oc-IT', 'ca-ES', 'eu-ES', 'gl-ES', 'su-ID', 'bew-ID', 'km-VN', 'ru-FI', 'ru-EE'];
const FULL = ['es-419', 'de-DE', 'fr-FR', 'pt-BR', 'it-IT'];

const tables = () => JSON.parse(read('assets/strings.json'));
function usedKeys() {
  const keys = new Set();
  const lit = String.raw`"((?:[^"\\]|\\.)*)"`;
  for (const f of readdirSync(new URL('native/', ROOT)).filter((n) => n.endsWith('.ts'))) {
    const src = read(`native/${f}`);
    for (const m of src.matchAll(new RegExp(String.raw`\b[TN]\(\s*${lit}`, 'g'))) keys.add(m[1].replace(/\\"/g, '"'));
  }
  return [...keys].filter((k) => /[A-Za-z]/.test(k)).sort();
}

test('every key the client draws is translated in every locale; no unused rows; placeholders intact', () => {
  const T = tables();
  const used = usedKeys();
  assert.ok(used.length > 80, `keys found: ${used.length}`);
  const problems = [];
  for (const loc of FULL) for (const k of used) if (!Object.prototype.hasOwnProperty.call(T[loc] || {}, k)) problems.push(`${loc} missing: ${k}`);
  for (const [loc, table] of Object.entries(T)) {
    if (!LOCALES.includes(loc)) problems.push(`unknown locale ${loc}`);
    for (const [k, v] of Object.entries(table)) {
      if (!used.includes(k)) { problems.push(`${loc} unused: ${k}`); continue; }
      const want = (k.match(/\{\w+\}/g) || []).sort().join(), got = (String(v).match(/\{\w+\}/g) || []).sort().join();
      if (want !== got) problems.push(`${loc} placeholders: ${k}`);
    }
  }
  for (const loc of ['en-GB', 'es-ES', 'fr-CA']) if (!T[loc]) problems.push(`no ${loc} table`);
  assert.deepEqual(problems, []);
});
