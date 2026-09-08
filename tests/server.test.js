'use strict';

// Server API tests: daily seed, replay-validated score posting (the path the
// client actually uses after a failed attempt), and static-file confinement.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tmpdir } from 'node:os';
const dataDir = fs.mkdtempSync(path.join(tmpdir(), 'pulse-jumper-'));
process.env.PULSE_JUMPER_DATA_DIR = dataDir;
const { createApp } = await import('../server.js');
import { dailyLevel, solveLevel } from '../src/core/levels.js';
import { CONTENT_VERSION } from '../src/core/constants.js';
import { buildEnvelope } from '../src/core/session.js';

function withServer(fn) {
  return new Promise((resolve, reject) => {
    const server = createApp().listen(0, '127.0.0.1', async () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      try { await fn(base); resolve(); } catch (e) { reject(e); } finally { server.close(); }
    });
  });
}

const today = () => new Date().toISOString().slice(0, 10);

after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

test('daily endpoint reports the deterministic seed for today', async () => {
  await withServer(async (base) => {
    const r = await fetch(base + '/api/v1/daily');
    const body = await r.json();
    assert.equal(r.status, 200);
    assert.equal(body.date, today());
    assert.equal(body.seed, dailyLevel(body.date).seed);
    assert.equal(body.contentVersion, CONTENT_VERSION);
  });
});

test('a solved daily run is accepted and ranked', async () => {
  await withServer(async (base) => {
    const date = today();
    const level = dailyLevel(date);
    const { state, commands } = solveLevel(level);
    assert.equal(state.phase, 'won');
    // The client always claims the unpenalised total (attempts = 0), which is
    // what the server recomputes; a run after failed attempts must still post.
    const claim = buildEnvelope(level, commands, 0).result.score.total;
    assert.notEqual(claim, buildEnvelope(level, commands, 3).result.score.total);
    const r = await fetch(base + '/api/v1/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'test-runner', seed: level.seed, date,
        contentVersion: CONTENT_VERSION, commands, scoreClaim: claim,
      }),
    });
    const body = await r.json();
    assert.equal(r.status, 200, JSON.stringify(body));
    assert.equal(body.ok, true);
    assert.equal(body.score, claim);
    assert.ok(body.rank >= 1);
  });
});

test('an inflated score claim is rejected', async () => {
  await withServer(async (base) => {
    const date = today();
    const level = dailyLevel(date);
    const { commands } = solveLevel(level);
    const r = await fetch(base + '/api/v1/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed: level.seed, date, commands, scoreClaim: 999999 }),
    });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'score-mismatch');
  });
});

test('static hosting serves the game but not private paths', async () => {
  await withServer(async (base) => {
    const index = await fetch(base + '/');
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-type'), /text\/html/);

    for (const p of ['/.git/config', '/data/leaderboard.json', '/node_modules/express/package.json']) {
      const r = await fetch(base + p);
      assert.equal(r.status, 403, `expected 403 for ${p}`);
    }
    // agents.md exists in the parent directory only: traversal must not reach it.
    const escape = await fetch(base + '/%2e%2e/agents.md');
    assert.ok(escape.status >= 400, 'traversal must not escape the project root');
  });
});
