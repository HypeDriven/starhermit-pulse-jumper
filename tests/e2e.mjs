/**
 * Pulse Jumper — end-to-end QA playthrough (dev only, not shipped).
 *
 * Drives the real visible UI in headless Chrome via playwright-core:
 *   title → Help open/close → Settings (reduced motion + high contrast) →
 *   Mode select → Journey → stage 1 → real keyboard jumps timed against the
 *   deterministic rules solver until the beacon → pause/resume mid-run →
 *   results ("STAGE CLEAR!") with score breakdown + persisted progress →
 *   Next stage → stage 2 won the same way → back to title.
 *   A second pass loads the game on a mobile 390x844 touch viewport, starts
 *   journey stage 1, makes real touch moves (FORM toggle → NOVA, JUMP),
 *   verifies progress advances and pause/resume works.
 *
 * The rules engine is a pure deterministic module (src/core/rules.js +
 * levels.js). The test imports it to compute the exact winning per-tick
 * command sequence for a stage (the same function the shipped offline
 * validator, src/core/levels.js solveLevel, uses to prove a level playable).
 * It then replays those commands through REAL keyboard input — Space/ArrowUp
 * to jump — aligned to the game's fixed-step clock (STEP_SECONDS = 1/60).
 * The engine advances x deterministically every tick regardless of input
 * (x += speed*dt always), so tick→x is exact and every jump only needs to be
 * timed inside its clear window; no game code is modified and no hidden
 * window API is used to move the player.
 *
 * Serving: the repo ships server.js (the StarHermit authoritative script
 * declared by starhermit.txt). The game is fully playable offline — when
 * /api/v1/time|daily are unavailable it sets dailyInfo=null and shows an
 * unranked local-daily line. So this test embeds a minimal node:http static
 * server on an ephemeral port and answers /api/* probes with 200 `{}`,
 * mirroring the arrow-exodus/picture-logic/balance-spire sibling suites.
 *
 * Run: npm run test:e2e  (or: node tests/e2e.mjs)
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { journeyLevel, solveLevel } from '../src/core/levels.js';
import { STEP_SECONDS } from '../src/core/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT = (stage, vp) => `/tmp/pulse-jumper-e2e-${stage}-${vp}.png`;
const STEP_MS = STEP_SECONDS * 1000; // 16.666… ms per simulation tick

// benign GPU/swiftshader noise (mirrors tools/production_game_audit.mjs)
const browserNoise = /GL Driver Message|GPU stall due to ReadPixels|Automatic fallback to software WebGL|EnableWebGLDeveloperExtensions/i;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.ts': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    // No StarHermit backend in the test: answer platform API probes with empty
    // JSON (200) so the offline path is exercised silently, like the siblings.
    if (p.startsWith('/api/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
      return;
    }
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const ok = (name) => console.log(`ok - ${name}`);
let failures = 0;

// Compute the winning per-tick command plan for a journey stage via the same
// offline solver the shipped validator uses. Returns [{tick, key}].
function planFor(modeArg) {
  const level = journeyLevel(modeArg);
  const { state, commands, reason } = solveLevel(level, 1000000);
  if (reason || state.phase !== 'won') {
    throw new Error(`stage ${modeArg} not solvable: ${reason || state.phase}`);
  }
  const plan = [];
  commands.forEach((c, tick) => {
    if (c === 'jump') plan.push({ tick, key: 'ArrowUp' });
    else if (c === 'form') plan.push({ tick, key: 'ArrowDown' });
  });
  return { level, plan };
}

// ---------- in-page active-phase clock ----------
// Observe the exact wall-clock moment the fixed-step sim becomes 'active'
// (the semantic transition to the playing field) so timed keyboard input can
// be aligned to the rules tick. Read-only; does not touch game internals.
async function installActiveClock(page) {
  await page.evaluate(() => {
    window.__pj = { seq: 0, activeAt: 0 };
    let wasPlaying = document.body.classList.contains('playing');
    const loop = () => {
      const playing = document.body.classList.contains('playing');
      if (playing && !wasPlaying) {
        window.__pj.seq += 1;
        window.__pj.activeAt = performance.now();
      }
      wasPlaying = playing;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

async function activeSeq(page) {
  return page.evaluate(() => window.__pj?.seq ?? 0);
}

// Block until the sim has (re)entered 'active' and return its anchor (ms).
async function waitActive(page, baseSeq) {
  await page.waitForFunction((s) => (window.__pj?.seq ?? 0) > s, baseSeq, { timeout: 15000 });
  return page.evaluate(() => window.__pj.activeAt);
}

// Perform a real input action at the moment the sim reaches `tick` (relative
// to the active anchor `at`), biased a couple of ticks early so the ~1-frame
// CDP latency still lands inside the obstacle-clear window. `action` is an
// async closure performing the real visible input (keyboard press for desktop,
// a touch tap on the JUMP/FORM tray for mobile). x advances deterministically
// every tick, so tick→x is exact and each jump only has to fire within its
// clear window (≈9 ticks wide for a low slab).
async function pressAt(page, at, tick, action, leadTicks = 2) {
  const targetMs = (tick - leadTicks) * STEP_MS;
  for (;;) {
    const el = await page.evaluate((a) => performance.now() - a, at);
    if (el >= targetMs) {
      await action();
      return;
    }
    await page.waitForTimeout(4);
  }
}

async function playPlan(page, at, plan, jumpAction, formAction) {
  for (const step of plan) {
    const action = step.key === 'ArrowDown' ? formAction : jumpAction;
    await pressAt(page, at, step.tick, action);
  }
}

const progressPct = (page) => page.evaluate(() => Number.parseFloat(document.getElementById('hud-progress-fill')?.style.width) || 0);

async function waitResults(page, timeout = 30000) {
  await page.waitForFunction(() => !document.getElementById('screen-results').hidden, null, { timeout });
  return page.textContent('#results-heading');
}

const saveDoc = (page) => page.evaluate(() => {
  const raw = localStorage.getItem('pulse-jumper-save');
  return raw ? JSON.parse(raw) : null;
});

// ---------- one full pass ----------
async function runPass(browser, name, ctxOpts, { full }) {
  const errors = [];
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error' || browserNoise.test(m.text())) return;
    const url = m.location()?.url || '';
    if (/Failed to load resource/.test(m.text()) && /\/api\/|\/favicon|\/sfx\//.test(url)) return;
    errors.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    const p = r.url();
    if (r.status() >= 400 && !/\/api\/|\/favicon|\/sfx\//.test(p)) errors.push(`http ${r.status()}: ${p}`);
  });

  const screenshot = (stage) => page.screenshot({ path: SHOT(stage, name) });

  try {
    // title
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForSelector('#screen-title', { state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => !!document.getElementById('play-btn') && !document.getElementById('webgl-error').hidden === false);
    await installActiveClock(page);
    await screenshot('title');
    ok(`${name}: title screen visible (WebGL up, no fallback error)`);

    if (full) {
      // Help open/close
      await page.click('#screen-title button:has-text("Help")');
      await page.waitForSelector('#screen-help', { state: 'visible' });
      const cards = await page.locator('#screen-help .card').count();
      if (cards !== 4) throw new Error(`expected 4 help cards, got ${cards}`);
      await page.click('#screen-help button:has-text("Back")');
      await page.waitForSelector('#screen-title', { state: 'visible' });
      ok(`${name}: help opens and closes (${cards} cards)`);

      // Settings: toggle reduced motion + high contrast, drop graphics quality
      // (lowers per-frame swiftshader load so the fixed-step sim holds a high
      // frame rate → precise input timing), mute audio. All through the UI.
      await page.click('#screen-title button:has-text("Settings")');
      await page.waitForSelector('#screen-settings', { state: 'visible' });
      await page.selectOption('#setting-graphicsTier', 'low');
      await page.check('#setting-reducedMotion');
      await page.check('#setting-highContrast');
      await page.check('#setting-muted');
      await page.check('#setting-timingAssist');
      await page.waitForFunction(() =>
        document.body.classList.contains('reduced-motion') && document.body.classList.contains('high-contrast'));
      await screenshot('settings');
      await page.click('#screen-settings button:has-text("Back")');
      await page.waitForSelector('#screen-title', { state: 'visible' });
      ok(`${name}: settings applied (low quality + reduced-motion + high-contrast + muted + timing-assist)`);
    }

    // Mode select → Journey
    await page.click('#play-btn');
    await page.waitForSelector('#screen-modes', { state: 'visible' });
    await page.locator('#screen-modes .card', { hasText: 'Journey' }).locator('button').click();
    await page.waitForSelector('#screen-journey', { state: 'visible' });
    const unlocked = await page.locator('#screen-journey .level-grid button:not(.locked)').count();
    if (unlocked < 1) throw new Error('no unlocked journey stage');
    await screenshot('journey');
    ok(`${name}: journey mode, ${unlocked} stage(s) unlocked`);

    // Stage 1 win
    const s1 = planFor(1);
    let base = await activeSeq(page);
    await page.locator('#screen-journey .level-grid button:not(.locked)').first().click();
    await page.waitForSelector('#hud', { state: 'visible' });
    const at1 = await waitActive(page, base);
    await page.waitForFunction(() => !document.getElementById('screen-countdown').hidden === false);
    ok(`${name}: stage 1 active (countdown → play), HUD live`);

    if (full) {
      // Timing assist was enabled in settings; the landing marker for the next
      // obstacle must appear in the 3D scene while the run is active.
      await page.waitForFunction(() => window.__pulseDebug && window.__pulseDebug.gfxDebug().assistVisible === true,
        null, { timeout: 5000 });
      ok(`${name}: timing-assist landing marker visible in scene`);
    }

    await playPlan(page, at1, s1.plan,
      () => page.keyboard.press('ArrowUp'), () => page.keyboard.press('ArrowDown'));
    // After the last obstacle is cleared, pause/resume mid-run is safe (no more
    // timed input is needed), so exercise it without corrupting the schedule.
    await page.waitForFunction(() => (Number.parseFloat(document.getElementById('hud-progress-fill').style.width) || 0) >= 60, null, { timeout: 15000 });
    await page.keyboard.press('Escape');
    await page.waitForSelector('#screen-pause', { state: 'visible' });
    await screenshot('pause');
    await page.click('#resume-btn');
    await page.waitForFunction(() => document.getElementById('screen-pause').hidden === true);
    ok(`${name}: pause (Esc) and resume mid-run`);

    const headline1 = await waitResults(page);
    if (!/STAGE CLEAR!/.test(headline1)) throw new Error(`stage 1 not won: "${headline1}"`);
    const rows = await page.locator('#screen-results .breakdown tr').count();
    if (rows !== 5) throw new Error(`expected 5 score-breakdown rows, got ${rows}`);
    const total = await page.locator('#screen-results .breakdown tr.total td:last-child').textContent();
    if (!(Number(total) > 0)) throw new Error(`non-positive score total: ${total}`);
    await screenshot('results1');
    const doc1 = await saveDoc(page);
    if (!doc1 || !(doc1.journeyBest?.['journey-1'] > 0)) {
      throw new Error('stage 1 best not persisted: ' + JSON.stringify(doc1));
    }
    if (!(doc1.journeyUnlocked >= 2)) throw new Error(`stage 2 not unlocked: ${doc1.journeyUnlocked}`);
    ok(`${name}: stage 1 "STAGE CLEAR!" — breakdown @ ${total} pts, progress persisted (unlocked ${doc1.journeyUnlocked})`);

    if (full) {
      // Stage 2: start via Next stage, then win it with the solver plan too.
      await page.click('#screen-results button:has-text("Next stage")');
      await page.waitForSelector('#hud', { state: 'visible' });
      base = await activeSeq(page);
      const at2 = await waitActive(page, base);
      const s2 = planFor(2);
      await playPlan(page, at2, s2.plan,
        () => page.keyboard.press('ArrowUp'), () => page.keyboard.press('ArrowDown'));
      const headline2 = await waitResults(page);
      if (!/STAGE CLEAR!/.test(headline2)) throw new Error(`stage 2 not won: "${headline2}"`);
      await screenshot('results2');
      ok(`${name}: stage 2 "STAGE CLEAR!" via Next stage`);

      await page.click('#screen-results button:has-text("Mode select")');
      await page.waitForSelector('#screen-modes', { state: 'visible' });
      await page.click('#screen-modes button:has-text("Back")');
      await page.waitForSelector('#screen-title', { state: 'visible' });
      await screenshot('back-to-title');
      ok(`${name}: back to title`);
    }
  } finally {
    await context.close();
  }

  if (errors.length) throw new Error(`${name} pass had page errors:\n  ${errors.join('\n  ')}`);
  console.log(`ok - ${name}: no page errors`);
}

// ---------- mobile pass (shorter) ----------
async function runMobile(browser) {
  const name = 'mobile';
  const errors = [];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error' || browserNoise.test(m.text())) return;
    const url = m.location()?.url || '';
    if (/Failed to load resource/.test(m.text()) && /\/api\/|\/favicon|\/sfx\//.test(url)) return;
    errors.push(`console: ${m.text()}`);
  });
  const screenshot = (stage) => page.screenshot({ path: SHOT(stage, name) });

  try {
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForSelector('#screen-title', { state: 'visible', timeout: 15000 });
    await installActiveClock(page);
    await screenshot('title');
    ok(`${name}: title screen visible`);

    // Optimize for headless swiftshader (via the real Settings UI) so the
    // fixed-step sim holds a high frame rate for precise timed touch input.
    await page.tap('#screen-title button:has-text("Settings")');
    await page.waitForSelector('#screen-settings', { state: 'visible' });
    await page.selectOption('#setting-graphicsTier', 'low');
    await page.check('#setting-reducedMotion');
    await page.check('#setting-muted');
    await page.tap('#screen-settings button:has-text("Back")');
    await page.waitForSelector('#screen-title', { state: 'visible' });

    await page.tap('#play-btn');
    await page.waitForSelector('#screen-modes', { state: 'visible' });
    await page.locator('#screen-modes .card', { hasText: 'Journey' }).locator('button').tap();
    await page.waitForSelector('#screen-journey', { state: 'visible' });
    const base = await activeSeq(page);
    await page.locator('#screen-journey .level-grid button:not(.locked)').first().tap();
    await page.waitForSelector('#hud', { state: 'visible' });
    const at = await waitActive(page, base);
    await page.waitForTimeout(250);
    await screenshot('play');

    // Real touch moves: the on-screen touch tray (FORM / JUMP) is visible in
    // touch mode. Tap FORM once → HUD badge flips to NOVA; then clear the
    // first two slabs with timed JUMP taps, proving the run advances for real.
    await page.waitForSelector('#touch-form', { state: 'visible' });
    const formBox = await page.locator('#touch-form').boundingBox();
    if (!formBox || formBox.width < 44 || formBox.height < 44) {
      throw new Error('FORM touch target too small on mobile: ' + JSON.stringify(formBox));
    }
    await page.touchscreen.tap(formBox.x + formBox.width / 2, formBox.y + formBox.height / 2);
    await page.waitForFunction(() => document.getElementById('hud-form').textContent === 'NOVA', null, { timeout: 3000 });
    ok(`${name}: FORM touch toggle → NOVA confirmed via HUD`);

    const s1 = planFor(1);
    const jumpBox = await page.locator('#touch-jump').boundingBox();
    if (!jumpBox || jumpBox.width < 44 || jumpBox.height < 44) {
      throw new Error('JUMP touch target too small on mobile: ' + JSON.stringify(jumpBox));
    }
    const jumpCx = jumpBox.x + jumpBox.width / 2;
    const jumpCy = jumpBox.y + jumpBox.height / 2;
    for (const st of s1.plan.slice(0, 2)) { // first two slabs
      await pressAt(page, at, st.tick, () => page.touchscreen.tap(jumpCx, jumpCy));
    }

    // Verify the run genuinely advances past the cleared slabs, then
    // pause/resume through the touch controls.
    const p0 = await progressPct(page);
    await page.waitForFunction(() => (Number.parseFloat(document.getElementById('hud-progress-fill').style.width) || 0) >= 25, null, { timeout: 8000 });
    const p1 = await progressPct(page);
    if (!(p1 > p0)) throw new Error(`progress did not advance: ${p0}% -> ${p1}%`);
    await page.tap('#hud-pause');
    await page.waitForSelector('#screen-pause', { state: 'visible' });
    await screenshot('pause');
    await page.tap('#resume-btn');
    await page.waitForFunction(() => document.getElementById('screen-pause').hidden === true);
    ok(`${name}: real touch moves (FORM + 2 timed JUMP) cleared slabs; run advanced to ${p1}%; pause/resume ok`);
  } finally {
    await context.close();
  }
  if (errors.length) throw new Error(`mobile pass had page errors:\n  ${errors.join('\n  ')}`);
  console.log(`ok - ${name}: no page errors`);
}

// ---------- main ----------
let browser = null;
try {
  browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'],
  });
  console.log(`serving ${ROOT} at ${BASE}`);
  await runPass(browser, 'desktop', { viewport: { width: 1280, height: 800 } }, { full: true });
  await runMobile(browser);
  console.log('\nE2E PASS — pulse-jumper, desktop + mobile, no page errors');
} catch (e) {
  failures++;
  console.error('\nE2E FAIL:', e.message || e);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.close();
}
if (failures) process.exit(1);
