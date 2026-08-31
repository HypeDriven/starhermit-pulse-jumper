'use strict';

// Pulse Jumper authoritative server: static hosting, platform time, daily
// seed, and server-side validated leaderboards (replays re-run through the
// shared rules engine).

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONTENT_VERSION } from './src/core/constants.js';
import { dailyLevel, dailySeedFor, validateLevel } from './src/core/levels.js';
import { runCommands } from './src/core/session.js';
import { scoreOf } from './src/core/rules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8090;
const DATA_DIR = path.join(__dirname, 'data');
const BOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');
const MAX_BOARD = 100;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.opus': 'audio/ogg',
};

function utcDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function loadBoard() {
  try {
    const obj = JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8'));
    if (obj && typeof obj === 'object' && obj.entries && typeof obj.entries === 'object') return obj;
  } catch (_) { /* missing or corrupt -> start fresh */ }
  return { entries: {} };
}

function saveBoard(board) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = BOARD_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(board));
  fs.renameSync(tmp, BOARD_FILE);
}

// Simple per-IP rate limiter for score posts: max 20 per minute.
const rateBuckets = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const b = rateBuckets.get(ip) || { count: 0, reset: now + 60000 };
  if (now > b.reset) { b.count = 0; b.reset = now + 60000; }
  b.count += 1;
  rateBuckets.set(ip, b);
  return b.count > 20;
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  app.get('/api/v1/time', (_req, res) => {
    res.json({ now: Date.now() });
  });

  app.get('/api/v1/daily', (_req, res) => {
    const date = utcDay(Date.now());
    res.json({ date, seed: dailySeedFor(date), contentVersion: CONTENT_VERSION });
  });

  app.get('/api/v1/leaderboard', (req, res) => {
    const seed = Number(req.query.seed);
    if (!Number.isFinite(seed)) return res.status(400).json({ error: 'bad-seed' });
    const board = loadBoard();
    const list = (board.entries[String(seed >>> 0)] || [])
      .slice(0, MAX_BOARD)
      .map(({ name, score, ticks, date }) => ({ name, score, ticks, date }));
    res.json({ seed: seed >>> 0, entries: list });
  });

  app.post('/api/v1/scores', (req, res) => {
    if (rateLimited(req.ip || 'unknown')) {
      return res.status(429).json({ error: 'rate-limited' });
    }
    const body = req.body;
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'bad-body' });
    const { seed, commands, scoreClaim, date } = body;
    const name = typeof body.name === 'string' && body.name.trim()
      ? body.name.trim().slice(0, 24) : 'guest';
    if (!Number.isFinite(seed)) return res.status(400).json({ error: 'bad-seed' });
    if (!Array.isArray(commands) || commands.length > 200000) {
      return res.status(400).json({ error: 'bad-commands' });
    }
    if (!Number.isInteger(scoreClaim)) return res.status(400).json({ error: 'bad-score-claim' });

    // The daily seed is the only ranked board; reject other seeds and
    // stale content versions outright.
    const day = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date : utcDay(Date.now());
    const level = dailyLevel(day);
    if ((seed >>> 0) !== level.seed) return res.status(400).json({ error: 'seed-mismatch' });
    if (body.contentVersion !== undefined && body.contentVersion !== CONTENT_VERSION) {
      return res.status(400).json({ error: 'stale-content-version' });
    }
    if (!validateLevel(level).ok) return res.status(500).json({ error: 'content-excluded' });

    const { state } = runCommands(level, commands, 0);
    const score = scoreOf(state);
    if (state.phase !== 'won') return res.status(400).json({ error: 'run-not-finished' });
    if (score.total !== scoreClaim || score.total < 0) {
      return res.status(400).json({ error: 'score-mismatch' });
    }

    const board = loadBoard();
    const key = String(level.seed);
    const list = board.entries[key] || [];
    list.push({ name, score: score.total, ticks: state.tick, date: day });
    // Ties: higher score, then fewer ticks (lower elapsed time), then stable order.
    list.sort((a, b) => b.score - a.score || a.ticks - b.ticks);
    board.entries[key] = list.slice(0, MAX_BOARD);
    saveBoard(board);
    const rank = board.entries[key].findIndex(
      (e) => e.name === name && e.score === score.total && e.ticks === state.tick) + 1;
    res.json({ ok: true, score: score.total, rank, seed: level.seed });
  });

  // Static files with explicit MIME types, confined to the project root.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let p = decodeURIComponent(req.path);
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(__dirname, p));
    if (!file.startsWith(__dirname + path.sep)) return res.status(403).json({ error: 'forbidden' });
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return next();
      res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    });
  });

  app.use((_req, res) => res.status(404).json({ error: 'not-found' }));
  return app;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  createApp().listen(PORT, () => {
    console.log(`pulse-jumper server listening on http://localhost:${PORT}`);
  });
}
