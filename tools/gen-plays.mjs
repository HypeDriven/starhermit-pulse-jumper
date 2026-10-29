// Writes the engine play scripts that play whole runs through the real UI
// (tests/native/*.play): the content's own solver (src/core/levels.js
// solveLevel: jump low slabs, change to NOVA before gates) plays a stage with
// the browser build's rules, and its commands become timed key (or touch)
// lines, so the scripts replay the solver's runs exactly and check the final
// score and time on the results.
//
// Timing (measured on the 1.23.0 render check, one fixed step a frame at the
// rules' 60 Hz): after the line that starts a run (the click on a stage, a
// mode card's Play, Retry or Next stage) the 3-2-1 countdown takes 180
// steps; a line after `frames F` that follows the starting line acts as the
// command of rules tick F − AFTER (before stepping); each key line takes one
// frame and `frames N` takes N + 1. A repeated action on consecutive ticks
// alternates between its keys (a key held over two lines would be one press).
// The solver's plans clear their stages with every command shifted by up to
// ±4 ticks (tools/gen-plays.mjs --windows), so a script survives a frame of
// drift, but the offsets below are exact.
//   node tools/gen-plays.mjs [--offset N] [--windows]
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRun, applyCommand, scoreOf } from '../src/core/rules.js';
import { journeyLevel, tutorialLevel, challengeLevel, practiceLevel, dailyLevel, solveLevel } from '../src/core/levels.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const args = main ? process.argv.slice(2) : [];
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : def; };
export const AFTER_START = opt('--offset', -180);
/** A touch acts a tick later than a key (the press is decided after the frame's UI) and takes two frames. */
export const TOUCH_LAG = opt('--touch-lag', 2);
const KEYS = { jump: ['Space', 'ArrowUp', 'KeyW'], form: ['KeyF', 'ArrowDown', 'KeyS'] };

/** The solver's run: [{ tick, action }] and the final state. */
export function plan(level) {
  const { commands, state } = solveLevel(level);
  const cmds = [];
  commands.forEach((c, tick) => { if (c !== 'none') cmds.push({ tick, action: c }); });
  return { cmds, state, score: scoreOf(state) };
}

/** Key lines for the commands, from the line after the run's starting line. */
export function lines(cmds, { touch = null } = {}) {
  const out = [];
  const lag = touch ? TOUCH_LAG : 0, len = touch ? 2 : 1;
  let c = AFTER_START + lag; // the tick the next line acts at
  let last = null;
  for (const { tick, action } of cmds) {
    if (tick < c) throw new Error(`command at tick ${tick} before the script can press (${c})`);
    if (tick > c) out.push(`frames ${tick - c - 1}`);
    if (touch) out.push(`touch ${touch[action]}`);
    else {
      const keys = KEYS[action];
      const k = last && last.action === action && last.tick === tick - 1 ? keys[(keys.indexOf(last.key) + 1) % keys.length] : keys[0];
      out.push(`key ${k} 1`);
      last = { action, tick, key: k };
    }
    c = tick + len;
  }
  return out;
}

/** The lines that close a run: its results' total and time. */
function resultsLines(p, name) {
  const t = (p.state.tick / 60).toFixed(1);
  const jumps = p.state.jumpsUsed, forms = p.state.formsUsed;
  return ['until 900 STAGE CLEAR', 'frames 20', `expect =${p.score.total}`, `expect =Time ${t}s · ${jumps} jumps · ${forms} form changes`, `save ${name}`];
}

function write(name, header, body) {
  writeFileSync(join(root, 'tests', 'native', name), header.map((l) => `# ${l}`).join('\n') + '\n' + body.join('\n') + '\n');
  console.log(`wrote tests/native/${name}`);
}

/** Today's Daily (a date-derived course) from the title's Daily button by keys: the script's lines (tests/native.mjs writes it at test time). */
export function dailyPlay(nowMs) {
  const date = new Date(nowMs).toISOString().slice(0, 10);
  const d = plan(dailyLevel(date));
  return [
    `# The Daily for ${date} (UTC), played to the beacon by the solver from the title's Daily button (written by tests/native.mjs at test time).`,
    'until 300 Pulse Jumper', 'frames 30', 'click =Daily', ...lines(d.cmds), ...resultsLines(d, 'daily'), `expect =Best score: ${d.score.total}`,
    'click =Title', 'until 60 Progress', 'frames 10',
  ];
}

if (main) generate();

function generate() {
if (args.includes('--windows')) {
  for (const [name, level] of [['journey 1', journeyLevel(1)], ['journey 2', journeyLevel(2)], ['lesson 1', tutorialLevel(1)], ['lesson 2', tutorialLevel(2)], ['lesson 3', tutorialLevel(3)], ['speed', challengeLevel('speed')], ['practice 3', practiceLevel(3)]]) {
    const { commands } = solveLevel(level);
    const ok = [];
    for (let d = -12; d <= 12; d++) {
      const shifted = Array(commands.length + 40).fill('none');
      commands.forEach((c, i) => { if (c !== 'none' && i + d >= 0) shifted[i + d] = c; });
      let s = createRun(level);
      for (const c of shifted) { s = applyCommand(s, level, c); if (s.phase !== 'active') break; }
      if (s.phase === 'won') ok.push(d);
    }
    console.log(`${name}: clears with commands shifted by ${ok[0]}…${ok[ok.length - 1]} ticks`);
  }
  process.exit(0);
}

// Journey stage 1 to the beacon on a desktop window, then stage 2 by Next stage.
const j1 = plan(journeyLevel(1));
const j2 = plan(journeyLevel(2));
write('journey.play', [
  'Journey stages 1 and 2 played to the beacon by the content\'s solver (tools/gen-plays.mjs; generated: do not edit):',
  `stage 1 by keys (${j1.score.total} points), Next stage, stage 2 (${j2.score.total} points); the grid then shows stage 3 unlocked.`,
], [
  'until 300 Pulse Jumper', 'frames 30', 'save title', 'click =Journey', 'until 60 mastery trials', 'frames 10', 'save journey-grid',
  'click =Stage 1, Not cleared yet', ...lines(j1.cmds), ...resultsLines(j1, 'stage-1'),
  'click =Next stage', ...lines(j2.cmds), ...resultsLines(j2, 'stage-2'),
  'click =Title', 'until 60 Progress', 'frames 10', 'expect Journey stage 3 of 40 unlocked.', 'save title-after',
]);

// The three lessons on a phone, by the player's finger: jumps tap the course's right half, form changes the FORM button.
const PHONE_TOUCH = { jump: '75% 45%', form: '=Form (F or left tap)' };
const lessons = [1, 2, 3].map((n) => plan(tutorialLevel(n)));
write('lessons-phone.play', [
  'The three Learn lessons on a portrait phone (DPR 3), played by the content\'s solver with a finger (tools/gen-plays.mjs;',
  'generated: do not edit): jumps tap the right half of the course, form changes press the FORM button; Next stage leads',
  'from lesson to lesson, and the title then counts the lessons and the Tutorial Graduate achievement.',
  'viewport 390x844@3',
], [
  'until 300 Pulse Jumper', 'frames 30', 'save title', 'touch =Learn', ...lines(lessons[0].cmds, { touch: PHONE_TOUCH }), ...resultsLines(lessons[0], 'lesson-1'),
  'touch =Next stage', ...lines(lessons[1].cmds, { touch: PHONE_TOUCH }), ...resultsLines(lessons[1], 'lesson-2'),
  'touch =Next stage', ...lines(lessons[2].cmds, { touch: PHONE_TOUCH }), ...resultsLines(lessons[2], 'lesson-3'),
  'touch =Title', 'until 60 Progress', 'frames 10', 'expect Lessons completed: 3/3.', 'expect Achievements unlocked: 1.', 'save title-after',
]);

// The Speed Target challenge in a phone held sideways: taps on the course's right half jump, on its left half change form.
const LANDSCAPE_TOUCH = { jump: '80% 60%', form: '20% 60%' };
const speed = plan(challengeLevel('speed'));
write('challenge-landscape.play', [
  'The Speed Target challenge in a phone held sideways (DPR 3), played by the content\'s solver with taps on the course',
  `(tools/gen-plays.mjs; generated: do not edit): ${speed.score.total} points in ${(speed.state.tick / 60).toFixed(1)} s, under the 20 s target;`,
  'then Retry, the pause button, Restart run and Leave to title.',
  'viewport 844x390@3',
], [
  'until 300 Pulse Jumper', 'frames 30', 'save title', 'touch =▶ PLAY', 'until 60 Choose a mode', 'frames 10', 'save modes',
  'swipe 50% 85% 50% 15% 12', 'frames 30', 'touch Play — Challenge', 'until 60 Speed Target', 'frames 10', 'save challenges',
  'touch Play — Speed Target', ...lines(speed.cmds, { touch: LANDSCAPE_TOUCH }), ...resultsLines(speed, 'results'),
  'touch =Retry', 'frames 190', 'save run', 'touch =Pause game', 'until 60 Leave to title', 'frames 10', 'save paused',
  'touch =Restart run', 'frames 190', 'touch =Pause game', 'until 60 Leave to title', 'frames 10', 'touch =Leave to title',
  'until 60 Progress', 'frames 10', 'save title-after',
]);

// Menus on a desktop window: Help with the effective keys, Settings' timing assist, Practice's attempt penalty, pause.
const p2 = plan(practiceLevel(2));
write('menus.play', [
  'Menus on a desktop window (tools/gen-plays.mjs; generated: do not edit): How to play with the effective keys, Settings',
  'turning the timing assist on, Practice 2 left to wipe out twice (the second costs the 10-point attempt penalty), pause',
  `by Escape and Resume, then Practice 2 played to the beacon by the solver (${p2.score.total - 20} points after two failed attempts).`,
], [
  'until 300 Pulse Jumper', 'frames 30', 'click =Help', 'until 60 How to play', 'frames 10', 'expect Press Space, ↑ or W', 'save help',
  'click =Back', 'until 60 Progress', 'frames 10', 'click =Settings', 'until 60 Open Options', 'frames 10',
  'click =Timing assist (landing marker)', 'frames 10', 'save settings', 'click =Back', 'until 60 Progress', 'frames 10',
  'click =▶ PLAY', 'until 60 Choose a mode', 'frames 10', 'save modes', 'click Play — Practice', 'until 60 Select a difficulty', 'frames 10',
  'click =2', 'frames 100', 'key Escape 1', 'until 60 Leave to title', 'frames 10', 'save paused', 'click =Resume', 'frames 160', 'save run-assist',
  'until 900 WIPED OUT', 'frames 20', 'expect =Attempt penalty', 'save wiped-1',
  'click =Retry', 'frames 5', 'until 900 WIPED OUT', 'frames 20', 'expect =-10', 'save wiped-2',
  'click =Retry', ...lines(p2.cmds), 'until 900 STAGE CLEAR', 'frames 20', `expect =${p2.score.total - 20}`, 'save cleared',
  'click =Title', 'until 60 Progress', 'frames 10',
]);
}
