// Graphics benchmark hook for tools/gfx-bench.mjs (dev-only): picks a preset in Settings → Graphics, starts
// Practice difficulty 5 (the densest course: 11 slabs and gates, 14 gems, beat particles, trail) and plays it
// with real keyboard jumps/form changes timed from the offline solver's plan, retrying from the results
// screen whenever a run ends — the runner, camera, rings, gems and post chain animate all the time.
import { practiceLevel, solveLevel } from '../src/core/levels.js';
import { STEP_SECONDS } from '../src/core/constants.js';

export const presets = ['low', 'balanced', 'high', 'ultra'];
export const levels = { low: 0, balanced: 4, high: 10, ultra: 17 };

const STEP_MS = STEP_SECONDS * 1000;
const plan = (() => {
  const { commands } = solveLevel(practiceLevel(5), 1000000);
  const out = [];
  commands.forEach((c, tick) => { if (c === 'jump') out.push({ tick, key: 'ArrowUp' }); else if (c === 'form') out.push({ tick, key: 'ArrowDown' }); });
  return out;
})();

export async function setPreset(page, preset) {
  await page.waitForSelector('#play-btn', { state: 'visible', timeout: 30000 });
  await page.click('#screen-title button:has-text("Settings")');
  await page.waitForSelector('#screen-settings', { state: 'visible' });
  await page.selectOption('#setting-graphicsTier', preset);
  await page.waitForFunction((p) => document.body.dataset.gfxPreset === p, preset);
  await page.click('#screen-settings button:has-text("Back")');
  await page.waitForSelector('#screen-title', { state: 'visible' });
}

// The moment the fixed-step sim enters a run (body.playing), so key presses line up with solver ticks.
const installClock = (page) => page.evaluate(() => {
  window.__pjBench = { seq: 0, at: 0 };
  let was = false;
  const loop = () => {
    const playing = document.body.classList.contains('playing');
    if (playing && !was) { window.__pjBench.seq++; window.__pjBench.at = performance.now(); }
    was = playing;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
const seq = (page) => page.evaluate(() => window.__pjBench.seq);
async function waitRun(page, base) {
  await page.waitForFunction((s) => window.__pjBench.seq > s, base, { timeout: 15000 });
  return page.evaluate(() => window.__pjBench.at);
}

async function playRun(page, at) {
  for (const step of plan) {
    const target = (step.tick - 2) * STEP_MS;
    for (;;) {
      const [el, ended] = await page.evaluate((a) => [performance.now() - a, !document.getElementById('screen-results').hidden], at);
      if (ended) return; // wiped out: retry from the results screen
      if (el >= target) break;
      await page.waitForTimeout(Math.min(30, Math.max(4, target - el - 20)));
    }
    await page.keyboard.press(step.key);
  }
}

export async function start(page) {
  await installClock(page);
  await page.click('#play-btn');
  await page.waitForSelector('#screen-modes', { state: 'visible' });
  await page.locator('#screen-modes .card', { hasText: 'Practice' }).locator('button').click();
  await page.waitForSelector('#screen-practice', { state: 'visible' });
  let base = await seq(page);
  await page.click('#screen-practice button:text-is("5")');
  let at = await waitRun(page, base);
  let open = true;
  page.once('close', () => { open = false; });
  (async () => {
    while (open) {
      try {
        await playRun(page, at);
        await page.waitForFunction(() => !document.getElementById('screen-results').hidden, null, { timeout: 40000 });
        base = await seq(page);
        await page.click('#screen-results button:has-text("Retry")');
        at = await waitRun(page, base);
      } catch (e) {
        if (!open) return;
        if (process.env.BENCH_DEBUG) console.error(e.message);
        try { // recover: retry from the results screen if the run ended
          base = await seq(page);
          await page.click('#screen-results button:has-text("Retry")', { timeout: 3000 });
          at = await waitRun(page, base);
        } catch { await page.waitForTimeout(500).catch(() => {}); }
      }
    }
  })();
  await page.waitForTimeout(1500);
}
