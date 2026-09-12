'use strict';

// StarHermit platform adapter (browser only).
// - Reads the launch token from the URL fragment (#game_token=<jwt>), strips it,
//   and sends Authorization: Bearer on every same-origin /api call.
// - Re-mints the token every 45 min via POST /api/v1/games/{slug}/launch-token.
// - Fetches the account display name via GET /api/v1/users/{sub}/profile
//   (never /api/v1/me, never usernames); "Player " + id.slice(0,8) fallback.
// - Mirrors the save doc into the platform cloud-save slot (zip+base64,
//   remote-preferred on load); localStorage stays the offline cache.
// - Hosted leaderboards are read-only: GET /api/v1/games/{slug} → leaderboardId,
//   then GET /api/v1/leaderboards/{id}/entries with display-name resolution.
// When no token was read the game stays in local mode and never calls the API.

import { zipStore, unzipFirstEntry, bytesToBase64 } from './core/zipstore.js';

// ---- launch token: fragment first, read once, then stripped ----
function readTokenOnce() {
  if (location.hash.length > 1) {
    const params = new URLSearchParams(location.hash.slice(1));
    const tok = params.get('game_token');
    if (tok) {
      try {
        const kept = new URLSearchParams(params);
        kept.delete('game_token');
        const rest = kept.toString();
        history.replaceState(null, '', location.pathname + location.search + (rest ? '#' + rest : ''));
      } catch (_) { /* sandboxed frame: the token still works for this session */ }
      return tok;
    }
  }
  // query-string fallbacks are for local dev on the game's own server only
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
    const q = new URLSearchParams(location.search);
    return q.get('game_token') || q.get('launch') || q.get('token');
  }
  return null;
}

function decodeJwtPayload(tok) {
  try {
    const part = tok.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (_) { return {}; }
}

let token = readTokenOnce();
const payload = token ? decodeJwtPayload(token) : {};
const sub = payload.sub || null;
const slug = payload.game_scope || null; // never hard-code the game slug
const hosted = !!token;

// ---- authenticated REST (Bearer on every call) ----
async function api(path, opts = {}) {
  const headers = { ...opts.headers, authorization: 'Bearer ' + token };
  if (opts.body) headers['content-type'] = 'application/json';
  const res = await fetch(path, {
    method: opts.method || 'GET', headers,
    body: opts.body, keepalive: !!opts.keepalive,
  });
  if (opts.raw) return res;
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
  return j;
}

// ---- token refresh: scoped launch tokens may re-mint; 45 min cadence ----
const REFRESH_MS = 45 * 60 * 1000;
const REFRESH_RETRY_MS = 60 * 1000;
let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshToken, REFRESH_MS);
}
async function refreshToken() {
  if (!hosted || !slug) return;
  try {
    const j = await api('/api/v1/games/' + slug + '/launch-token', { method: 'POST' });
    if (j && j.token) token = j.token;
  } catch (_) {
    refreshTimer = setTimeout(refreshToken, REFRESH_RETRY_MS);
    return;
  }
  scheduleRefresh();
}
if (hosted && slug) scheduleRefresh();

// ---- display names: nickname only, never usernames, never /api/v1/me ----
const nameCache = new Map();
function fallbackName(userId) {
  return 'Player ' + String(userId || 'unknown').slice(0, 8);
}
async function displayName(userId) {
  if (!hosted || !userId) return fallbackName(userId);
  if (nameCache.has(userId)) return nameCache.get(userId);
  const name = await api('/api/v1/users/' + userId + '/profile')
    .then((j) => (j && j.nickname) ? j.nickname : fallbackName(userId))
    .catch(() => fallbackName(userId));
  nameCache.set(userId, name);
  return name;
}

// ---- cloud save: one zip+base64 doc; localStorage stays the offline cache ----
const SAVE_ENTRY = 'pulse-jumper-save.json';
let statusCb = null;
function setStatus(s) { if (statusCb) statusCb(s); }

async function cloudLoad() {
  if (!hosted || !slug) return null;
  const res = await api('/api/v1/me/cloud-saves/' + slug, { raw: true });
  if (res.status === 404) return null; // no save yet
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return JSON.parse(new TextDecoder().decode(unzipFirstEntry(bytes)));
}

async function cloudPushDoc(doc, keepalive) {
  if (!hosted || !slug) return;
  const bytes = new TextEncoder().encode(JSON.stringify(doc));
  const body = JSON.stringify({ dataBase64: bytesToBase64(zipStore(SAVE_ENTRY, bytes)) });
  await api('/api/v1/me/cloud-saves/' + slug, { method: 'PUT', body, keepalive });
}

let docProvider = null, dirtyTimer = null, pushing = false, repush = false;
function cloudStart(provider) { docProvider = provider; }

function cloudDirty() {
  if (!hosted || !slug || !docProvider) return;
  setStatus('saving');
  clearTimeout(dirtyTimer);
  dirtyTimer = setTimeout(() => cloudPush(false), 2000); // debounce ~2 s
}

async function cloudPush(keepalive) {
  if (!docProvider) return;
  if (pushing) { repush = true; return; }
  pushing = true;
  try {
    await cloudPushDoc(docProvider(), keepalive);
    setStatus('synced');
  } catch (_) {
    setStatus('offline');
  } finally {
    pushing = false;
    if (repush) { repush = false; cloudPush(false); }
  }
}

function cloudFlush() {
  clearTimeout(dirtyTimer);
  if (!hosted || !slug || !docProvider) return;
  cloudPush(true); // keepalive so the PUT survives pagehide
}
window.addEventListener('pagehide', cloudFlush);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') cloudFlush();
});

// ---- read-only hosted leaderboards ----
async function gameInfo() {
  if (!hosted || !slug) return null;
  const res = await api('/api/v1/games/' + slug, { raw: true });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function leaderboardEntries(leaderboardId, opts = {}) {
  const q = new URLSearchParams({
    friendsOnly: opts.friendsOnly ? '1' : '',
    page: String(opts.page || 0),
    pageSize: String(opts.pageSize || 10),
  });
  const j = await api('/api/v1/leaderboards/' + leaderboardId + '/entries?' + q);
  const entries = j.entries || [];
  return Promise.all(entries.map(async (e, i) => ({
    rank: e.rank != null ? e.rank : i + 1,
    userId: e.userId,
    name: await displayName(e.userId),
    score: e.score,
  })));
}

export {
  hosted, fallbackName,
  api, displayName,
  cloudStart, cloudDirty, cloudFlush, cloudLoad,
  gameInfo, leaderboardEntries,
};
export function getToken() { return token; }
export function getSub() { return sub; }
export function getSlug() { return slug; }
export function onStatus(cb) { statusCb = cb; }
export function myDisplayName() { return displayName(sub); }
// exposed for validation harnesses
export * as _zip from './core/zipstore.js';
