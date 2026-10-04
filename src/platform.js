'use strict';

// StarHermit platform adapter over the shared SDK (starhermit-sdk.js, loaded
// as a classic script before the game modules; window.StarHermit).
// - The SDK reads the launch token (#game_token=, or #access_token= on a
//   sign-in return), strips it, takes the slug from game_scope and renews it.
// - Display names: profile nickname, "Player " + id prefix fallback (never
//   /api/v1/me, never usernames).
// - Cloud save: the save doc is mirrored to slot game:<slug> (debounced,
//   flushed on pagehide; remote-preferred on load); localStorage stays the
//   offline cache.
// - Settings KV mirror, keyboard bindings, invite link, sign-in.
// - Hosted leaderboards are read-only (the game's first platform board).
// Without a token the game stays local and never calls the StarHermit API.

/** The SDK instance (window.StarHermit; tests may inject one on globalThis). */
function sdk() { return globalThis.StarHermit || null; }
{
  const sh = sdk();
  if (sh && !sh.signedIn) sh.init(); // no-op when index.html already read it
}

export function isHosted() { return !!(sdk() && sdk().signedIn); }
export function getToken() { return isHosted() ? sdk().token : null; }
export function getSub() { return isHosted() ? String(sdk().userId) : null; }
export function getSlug() { return isHosted() ? sdk().slug : null; }
export function canSignIn() { return !!(sdk() && sdk().canSignIn()); }
export function signIn() { return !!(sdk() && sdk().signIn()); }
export function inviteLink() { return isHosted() ? sdk().inviteLink() : null; }

let statusCb = null;
function setStatus(s) { if (statusCb) statusCb(s); }
export function onStatus(cb) { statusCb = cb; }

/** fn({ signedIn }) when the platform session ends (renewal refused). */
export function onAuthChange(fn) {
  const sh = sdk();
  if (sh) sh.on('auth', (a) => fn({ signedIn: !!a.signedIn }));
}
{
  const sh = sdk();
  if (sh) {
    sh.on('saved', (ok) => setStatus(ok ? 'synced' : 'offline'));
    sh.on('auth', (a) => { if (!a.signedIn) setStatus(null); });
  }
}

// ---- display names: nickname only ----
export function fallbackName(userId) {
  return 'Player ' + String(userId || 'unknown').slice(0, 6);
}
export async function displayName(userId) {
  if (!isHosted() || !userId) return fallbackName(userId);
  const p = await sdk().profile(String(userId));
  return p ? p.displayName : fallbackName(userId);
}
export function myDisplayName() { return displayName(getSub()); }

// ---- cloud save ----
let docProvider = null;
export function cloudStart(provider) { docProvider = provider; }

/** The remote save doc (null when none / signed out). */
export async function cloudLoad() {
  if (!isHosted()) return null;
  return sdk().loadJSON();
}

/** Debounced (~2 s) mirror of the save doc. */
export function cloudDirty() {
  if (!isHosted() || !docProvider) return;
  setStatus('saving');
  sdk().saveJSON(docProvider(), 2000);
}

/** Push a pending save now (keepalive survives pagehide). */
export function cloudFlush() {
  if (!isHosted()) return Promise.resolve(false);
  return sdk().flushSave(true);
}
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('pagehide', cloudFlush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') cloudFlush();
  });
}

// ---- per-player settings KV ----
let settingsLoaded = false;
const sentSettings = {};

/** Platform-stored preferences ({} when signed out / none). */
export async function loadRemoteSettings() {
  if (!isHosted()) return {};
  const s = (await sdk().getSettings()) || {};
  settingsLoaded = true;
  for (const [k, v] of Object.entries(s)) sentSettings[k] = JSON.stringify(v);
  return s;
}

/** PATCH changed keys; never before the platform values were read. */
export function syncSettings(prefs) {
  if (!isHosted() || !settingsLoaded) return Promise.resolve(null);
  const patch = {};
  for (const [k, v] of Object.entries(prefs || {})) {
    const json = JSON.stringify(v);
    if (sentSettings[k] !== json) { patch[k] = v; sentSettings[k] = json; }
  }
  return Object.keys(patch).length ? sdk().patchSettings(patch) : Promise.resolve(null);
}

// ---- controls ----
export function loadBindings(defaults) {
  const copy = () => JSON.parse(JSON.stringify(defaults));
  if (!isHosted()) return Promise.resolve(copy());
  return sdk().loadBindings(defaults).catch(copy);
}

// ---- read-only hosted leaderboard ----
/** Top entries of the game's first platform board, or null when none. */
export async function boardEntries(opts = {}) {
  if (!isHosted()) return null;
  const r = await sdk().leaderboard(null, { pageSize: opts.pageSize || 10 });
  if (!r || !r.board) return null;
  return Promise.all((r.items || []).map(async (e, i) => ({
    rank: e.rank != null ? e.rank : i + 1,
    userId: e.userId,
    name: await displayName(e.userId),
    score: e.score,
  })));
}
