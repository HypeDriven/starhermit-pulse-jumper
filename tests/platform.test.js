// StarHermit adapter (src/platform.js) over the shared SDK with a stubbed fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The SDK is a classic browser script: evaluate it the way a <script> would.
const holder = {};
new Function('self', 'module', readFileSync(new URL('../starhermit-sdk.js', import.meta.url), 'utf8'))(holder, undefined);
const SDK = holder.StarHermit;

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = `h.${b64u({ sub: 'user-4455cc', game_scope: 'pj-slug', exp: Math.floor(Date.now() / 1000) + 3600 })}.s`;

function install(href) {
  const calls = [];
  const saves = {};
  const kv = { musicVolume: 0.3 };
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', init });
    const r = (status, body) => new Response(body, { status });
    const j = (o) => r(200, JSON.stringify(o));
    if (url === '/api/v1/users/user-4455cc/profile') return j({ username: 'hidden', nickname: 'Neon' });
    if (url.includes('/cloud-saves/')) {
      const key = decodeURIComponent(url.split('/cloud-saves/')[1]);
      if (init.method === 'PUT') { saves[key] = Buffer.from(JSON.parse(init.body).dataBase64, 'base64'); return j({}); }
      return saves[key] ? r(200, saves[key]) : r(404, '');
    }
    if (url.endsWith('/settings') && init.method === 'PATCH') { Object.assign(kv, JSON.parse(init.body).settings); return j({}); }
    if (url.endsWith('/settings')) return j({ settings: kv });
    if (url.endsWith('/controls')) return j({ actions: [{ action: 'jump', codes: ['KeyJ'] }] });
    if (url.endsWith('/leaderboards')) return j([{ id: 'b', key: 'daily' }]);
    if (url.startsWith('/api/v1/leaderboards/b/entries')) return j({ items: [{ userId: 'user-4455cc', score: 900, rank: 1 }] });
    return r(404, '');
  };
  const u = new URL(href);
  const loc = { hash: u.hash, search: u.search, pathname: u.pathname, origin: u.origin, hostname: u.hostname, href };
  globalThis.window = { addEventListener() {} };
  globalThis.document = { addEventListener() {}, visibilityState: 'visible' };
  globalThis.StarHermit = SDK.create({ window: { location: loc, history: { replaceState() {} } }, fetch, setTimeout: () => 0, clearTimeout: () => {} });
  return { calls, saves, kv };
}

test('hosted: token, nickname, cloud save game:<slug>, settings, bindings, board', async () => {
  const h = install(`https://pj-slug.starhermit.com/#game_token=${TOKEN}`);
  const p = await import('../src/platform.js?hosted');
  assert.equal(p.isHosted(), true);
  assert.equal(p.getSub(), 'user-4455cc');
  assert.equal(p.getSlug(), 'pj-slug');
  assert.equal(await p.myDisplayName(), 'Neon');

  const doc = { version: 1, journeyUnlocked: 3 };
  let status = null;
  p.onStatus((s) => { status = s; });
  p.cloudStart(() => doc);
  p.cloudDirty();
  assert.equal(status, 'saving');
  assert.equal(await p.cloudFlush(), true);
  assert.equal(status, 'synced');
  assert.deepEqual(Object.keys(h.saves), ['game:pj-slug']);
  assert.deepEqual(await p.cloudLoad(), doc);

  assert.equal(await p.syncSettings({ muted: true }), null, 'no PATCH before the KV was read');
  assert.deepEqual(await p.loadRemoteSettings(), { musicVolume: 0.3 });
  await p.syncSettings({ musicVolume: 0.3, muted: true });
  const patches = h.calls.filter((c) => c.method === 'PATCH').map((c) => JSON.parse(c.init.body));
  assert.deepEqual(patches, [{ settings: { muted: true } }]);

  assert.deepEqual(await p.loadBindings({ jump: ['Space'], form: ['KeyF'] }), { jump: ['KeyJ'], form: ['KeyF'] });
  assert.deepEqual(await p.boardEntries({ pageSize: 5 }), [{ rank: 1, userId: 'user-4455cc', name: 'Neon', score: 900 }]);
  assert.match(p.inviteLink(), /\/game-invite\/user-4455cc\/pj-slug$/);
  assert.ok(h.calls.every((c) => c.init.headers.Authorization === `Bearer ${TOKEN}`));
});

test('standalone: no StarHermit request', async () => {
  const h = install('http://localhost:3000/');
  const p = await import('../src/platform.js?standalone');
  assert.equal(p.isHosted(), false);
  assert.equal(p.canSignIn(), false);
  assert.equal(p.inviteLink(), null);
  assert.equal(await p.myDisplayName(), 'Player unknow');
  p.cloudStart(() => ({}));
  p.cloudDirty();
  assert.equal(await p.cloudFlush(), false);
  assert.equal(await p.cloudLoad(), null);
  assert.deepEqual(await p.loadRemoteSettings(), {});
  assert.deepEqual(await p.loadBindings({ jump: ['Space'] }), { jump: ['Space'] });
  assert.equal(await p.boardEntries(), null);
  assert.equal(h.calls.length, 0);
});
