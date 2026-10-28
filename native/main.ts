// Pulse Jumper on the StarHermit engine: the entry module (starhermit.txt
// engine.entry), played natively by the StarHermit client and in browsers by
// the engine's web runtime. The rules (src/core/rules.js) and the content
// (src/core/levels.js) are the browser build's, unchanged; this module is
// what src/game.js did around them — the game flow (title → modes → stage,
// difficulty or challenge → 3-2-1 countdown → run ⇄ pause → results), input
// (jump, form and pause from keys and pads, taps on the course: right half
// jumps, left half changes form, mirrored for the left-handed; the JUMP /
// FORM touch buttons), sounds per rules event and the death shake, attempts
// and their penalty, progression and achievements, posting a finished
// Journey, Daily or Challenge run to the high-score board with the Daily's
// top entries, the drifting runner behind the title, and the lifecycle (a
// hidden window pauses the run, as visibilitychange did).
// Screens are drawn by screens.ts (starhermit:ui), the world by render.ts
// (starhermit:scene).
//
// Time is the runtime's fixed steps at the rules' 60 Hz (STEP_SECONDS): one
// rules step per fixed step while the run is active, so pauses, a hidden
// window and slow frames never cost time and play scripts replay exactly; the
// countdown counts the same steps (60 a number, as its 1 s) and so does the
// half-second beat between the run's end and the results. Input is quantized
// as before: the latest action before a step is that step's command. The
// world is drawn between steps by the frame's interpolation.
import "./i18n.ts";
import { clipboard, frame, onFixedUpdate, onPreferencesChange, onRender, onResume, onStart, onSuspend, onUpdate, preferences, setFixedRate } from "starhermit:engine";
import { isDown, onAction, onPointerButton, onTouch, primaryPointer } from "starhermit:input";
import * as ui from "starhermit:ui";
import { onSessionEnded, requestSignIn } from "starhermit:platform";
import { C, Levels, Progress, Rules, type Level, type RunState, type Score } from "./game.ts";
import * as audio from "./audio.ts";
import { N, S, T } from "./i18n.ts";
import * as platform from "./platform.ts";
import { lookFor } from "./quality.ts";
import * as render from "./render.ts";
import { drawScreens } from "./screens.ts";
import { applyContrast, initStyles } from "./style.ts";

export type Screen = "title" | "modes" | "journey" | "practice" | "challenge" | "pause" | "results" | "help" | "settings";
export type Machine = "title" | "countdown" | "active" | "paused" | "resolving" | "results";
export type Mode = "learn" | "journey" | "daily" | "practice" | "challenge";
export interface Results {
  headline: () => string;
  score: Score;
  best: number | null;
  lines: (() => string)[];
  canNext: boolean;
  daily: boolean;
}

export const app = {
  /** The screen shown (null: the run's HUD). */
  screen: "title" as Screen | null,
  machine: "title" as Machine,
  /** Where Help and Settings go back to (screenBeforeOverlay). */
  back: "title" as Screen,
  /** Frame the screen opened on (the press that opened it must not also act on it). */
  openedFrame: 0,
  focusNext: null as string | null,
  mode: null as Mode | null,
  modeArg: null as number | string | null,
  level: null as Level | null,
  state: null as RunState | null,
  prev: null as RunState | null,
  attempts: 0,
  dailyDate: "",
  countdown: 0,
  results: null as Results | null,
  lb: null as platform.Posted | "posting" | null,
  board: null as platform.BoardRow[] | "none" | null,
  accountNote: null as (() => string) | null,
};
let queued: "jump" | "form" | null = null;
let countdownTicks = 0;
let resolveTicks = 0;
let pausedFrom: Machine | null = null;
let idleT = 0;

// ------------------------------------------------------------------ helpers
let lastAnnouncement = "";
/** The live regions (ui.announce); repeated text is skipped. */
export function announce(text: string, assertive = false): void {
  if (!text || text === lastAnnouncement) return;
  lastAnnouncement = text;
  try { ui.announce(text.slice(0, 500), { politeness: assertive ? "assertive" : "polite" }); } catch { /* too many this frame */ }
}
export function click(): void { audio.event("ui"); }
/** Pure-touch devices show the JUMP / FORM buttons (a phone reports no pointer before its first touch). */
export function touchOnly(): boolean {
  const pp = primaryPointer();
  if (pp !== "none") return pp === "coarse";
  const f = frame(), sc = ui.preferences().scale;
  const w = f.width / sc, h = f.height / sc;
  return (w <= 700 && h >= w) || (w > h && h <= 500);
}
function utcDay(ms: number): string { return new Date(ms).toISOString().slice(0, 10); }
/** The Daily's UTC day by the platform's clock (the device's when offline). */
export function today(): string { return utcDay(platform.nowMs()); }

// ------------------------------------------------------------------ navigation
export function show(screen: Screen | null, focus: string | null = null): void {
  app.screen = screen;
  app.openedFrame = frame().frame;
  app.focusNext = focus;
  ui.setFocus(null);
}
const FIRST: Partial<Record<Screen, string>> = {
  title: "btn-play", modes: "mode-learn", journey: "stage-1", practice: "diff-1", challenge: "challenge-moves",
  pause: "btn-resume", results: "btn-retry", help: "btn-back", settings: "set-leftHanded",
};
/** A screen, focusing its first control (none on touch devices: a later Enter must not press it). */
export function open(screen: Screen): void {
  show(screen, primaryPointer() === "coarse" ? null : FIRST[screen] ?? null);
}
/** Help / Settings from the title, the modes, the results or the pause screen (onShowOverlay). */
export function openOverlay(screen: "help" | "settings"): void {
  click();
  const cur = app.screen;
  app.back = cur === "pause" || cur === "results" || cur === "title" ? cur
    : cur === "modes" || cur === "journey" || cur === "practice" || cur === "challenge" ? "modes" : "title";
  open(screen);
}
export function overlayBack(): void { click(); open(app.back); }
export function leaveToTitle(): void {
  click();
  app.machine = "title";
  app.state = null;
  open("title");
}

// ------------------------------------------------------------------ the run
function pickLevel(m: Mode, arg: number | string | null): Level {
  if (m === "journey") return Levels.journeyLevel(Number(arg) || progress().journeyUnlocked);
  if (m === "daily") return Levels.dailyLevel(app.dailyDate);
  if (m === "practice") return Levels.practiceLevel(Number(arg) || 1);
  if (m === "challenge") return Levels.challengeLevel(String(arg || "moves"));
  return Levels.tutorialLevel(Number(arg) || 1);
}
export function progress(): ReturnType<typeof platform.progress> { return platform.progress(); }

/** game.js startRun: the stage, a fresh run state (attempts kept on a retry), the countdown. */
export function startRun(m: Mode, arg: number | string | null = null, keepAttempts = false): void {
  // resolve the implicit argument now so retry / next always target the stage actually played
  if (m === "journey" && !arg) arg = Math.min(Math.max(1, progress().journeyUnlocked), 40);
  if (m === "learn" && !arg) arg = 1;
  if (m === "practice" && !arg) arg = 1;
  if (m === "challenge" && !arg) arg = "moves";
  if (m === "daily") app.dailyDate = today();
  app.mode = m; app.modeArg = arg;
  app.level = pickLevel(m, arg);
  if (!keepAttempts) app.attempts = 0;
  app.state = Rules.createRun(app.level, app.attempts);
  app.prev = app.state;
  queued = null;
  app.results = null;
  app.lb = null;
  app.board = null;
  app.machine = "countdown";
  app.countdown = 3;
  countdownTicks = 0;
  render.loadLevel(app.level);
  show(null);
  announce(objectiveText());
}
export function retry(): void { click(); if (app.mode && app.machine !== "active") startRun(app.mode, app.modeArg, true); }
export function nextStage(): void {
  click();
  const m = app.mode, lv = app.level;
  if (!m || !lv) return;
  startRun(m, m === "learn" ? lv.tutorialFlags!.lesson + 1 : Number(app.modeArg) + 1);
}
/** A mode card's Play (onMode): Learn starts the first unfinished lesson, Daily starts at once, the rest pick a stage first. */
export function chooseMode(m: Mode, arg?: number | string): void {
  click();
  if (arg === undefined) {
    if (m === "journey") { open("journey"); return; }
    if (m === "practice") { open("practice"); return; }
    if (m === "challenge") { open("challenge"); return; }
    if (m === "learn") {
      const done = progress().tutorialDone;
      startRun("learn", [1, 2, 3].find((l) => !done[l]) ?? 1);
      return;
    }
  }
  startRun(m, arg ?? null);
}

export function objectiveText(): string {
  const level = app.level;
  if (!level) return "";
  const t = level.tutorialFlags;
  if (t) {
    if (t.lesson === 1) return T("Lesson 1: press JUMP (Space) to clear the amber slabs.");
    if (t.lesson === 2) return T("Lesson 2: press FORM (F) to become NOVA and phase through the violet gates.");
    return T("Lesson 3: combine jumps and form changes to reach the beacon.");
  }
  const ch = level.challenge;
  if (ch && ch.kind === "move-limit") return T("Move limit: finish using at most {n} actions.", { n: ch.maxActions });
  if (ch && ch.kind === "speed") return T("Speed target: finish in under {n} seconds.", { n: ch.target + 1 });
  return T("Reach the beacon. Jump amber slabs; phase violet gates as NOVA.");
}

/** A command from the player: the latest before a step is that step's (quantization). */
export function queueAction(type: "jump" | "form"): void {
  if (app.machine !== "active") return;
  queued = type;
}

/** game.js stepOnce: one rules step with the queued command, its sounds, and the end of the run. */
function stepOnce(): void {
  const level = app.level!, s0 = app.state!;
  app.prev = s0;
  const cmd = queued ?? "none";
  queued = null;
  const s = Rules.applyCommand(s0, level, cmd);
  app.state = s;
  if (cmd === "jump" && s0.grounded) audio.event("jump");
  if (cmd === "form" && s.form !== s0.form) audio.event("form");
  if (s.checkpointsPassed > s0.checkpointsPassed) audio.event("checkpoint");
  if (s.gemsCollected > s0.gemsCollected) audio.event("gem");
  if (s.phase !== "active") {
    app.machine = "resolving";
    resolveTicks = 0;
    if (s.phase === "won") audio.event("win");
    else { audio.event("death"); render.triggerShake(0.35); }
  }
}

const ACH_LABELS: Record<string, string> = {
  "first-clear": N("First Clear"), "journey-complete": N("Journey Complete"), "tutorial-graduate": N("Tutorial Graduate"),
  "oof": N("Oof"), "streak-7": N("Seven-Day Pulse"),
};
function unlockAch(key: string): void {
  const p = progress();
  if (!ACH_LABELS[key] || p.achievements[key]) return;
  p.achievements[key] = true;
  platform.saveNow();
  announce(T("Achievement unlocked: {name}.", { name: T(ACH_LABELS[key]!) }));
}

function challengeFailed(level: Level, s: RunState): (() => string) | null {
  const ch = level.challenge;
  if (!ch || s.phase !== "won") return null;
  const actions = s.jumpsUsed + s.formsUsed;
  if (ch.kind === "move-limit" && actions > ch.maxActions) {
    const max = ch.maxActions;
    return () => T("Move limit exceeded ({n}/{max}).", { n: actions, max });
  }
  if (ch.kind === "speed" && s.elapsed > ch.target + 1) {
    const t = s.elapsed.toFixed(1), target = ch.target + 1;
    return () => T("Too slow ({t}s, target {target}s).", { t, target });
  }
  return null;
}

/** game.js finishRun: progression, achievements, the results and the leaderboard post. */
function finishRun(): void {
  const s = app.state!, level = app.level!, mode = app.mode!;
  app.machine = "results";
  const score = Rules.scoreOf(s);
  const won = s.phase === "won";
  if (!won) app.attempts += 1;
  const failReason = challengeFailed(level, s);
  const p = progress();
  if (won) {
    if (mode === "journey") {
      const idx = Number(app.modeArg) || p.journeyUnlocked;
      const best = p.journeyBest[level.id];
      if (best === undefined || score.total > best) p.journeyBest[level.id] = score.total;
      if (idx >= p.journeyUnlocked && idx < 40) p.journeyUnlocked = idx + 1;
      platform.saveNow();
      unlockAch("first-clear");
      if (idx === 40) unlockAch("journey-complete");
    } else if (mode === "learn") {
      p.tutorialDone[level.tutorialFlags!.lesson] = true;
      platform.saveNow();
      if (Object.keys(p.tutorialDone).length >= 3) unlockAch("tutorial-graduate");
    } else if (mode === "daily") {
      const best = p.dailyBest[app.dailyDate];
      if (best === undefined || score.total > best) { p.dailyBest[app.dailyDate] = score.total; platform.saveNow(); }
      if (Progress.dailyStreak(p.dailyBest, today()) >= 7) unlockAch("streak-7");
    }
  }
  if (s.jumpsUsed + s.formsUsed === 0 && s.phase === "dead") unlockAch("oof");

  const key = won && !failReason ? N("STAGE CLEAR!") : won ? N("CLEAR — CHALLENGE FAILED") : N("WIPED OUT");
  const lines: (() => string)[] = [];
  if (failReason) lines.push(failReason);
  const vars = { t: s.elapsed.toFixed(1), jumps: s.jumpsUsed, forms: s.formsUsed };
  lines.push(() => T("Time {t}s · {jumps} jumps · {forms} form changes", vars));
  const best = mode === "journey" ? p.journeyBest[level.id] : mode === "daily" ? p.dailyBest[app.dailyDate] : undefined;
  const canNext = won && !failReason && ((mode === "journey" && Number(app.modeArg) < 40) || (mode === "learn" && level.tutorialFlags!.lesson < 3));
  const daily = mode === "daily" && won && platform.signedIn();
  app.results = { headline: () => T(key), score, best: best ?? null, lines, canNext, daily };
  open("results");
  announce(T("{headline}. Total score {n}.", { headline: T(key), n: score.total }), true);
  // signed in: Journey, Daily and Challenge runs (cleared or wiped out) post their total; the results show the rank
  if (platform.signedIn() && (mode === "journey" || mode === "daily" || mode === "challenge")) {
    app.lb = "posting";
    const run = app.state;
    void platform.postScore(Math.max(0, score.total)).then((r) => { if (app.state === run) app.lb = r; });
  }
  if (daily) {
    announce(T("Your best is saved to your account."));
    const run = app.state;
    void platform.boardTop(5).then((rows) => { if (app.state === run) app.board = rows ?? "none"; });
  }
}
export function leaderboardLine(): string | null {
  const r = app.lb;
  if (!r) return null;
  if (r === "posting") return S("lbPosting");
  return !r.posted ? S("lbNotPosted") : r.rank ? S("lbRank", { rank: r.rank }) : S("lbPosted");
}

// ------------------------------------------------------------------ pause
export function pauseGame(): void {
  if (app.machine !== "active" && app.machine !== "countdown") return;
  pausedFrom = app.machine;
  app.machine = "paused";
  open("pause");
}
export function resumeGame(): void {
  if (app.machine !== "paused") return;
  app.machine = pausedFrom === "countdown" ? "countdown" : "active";
  pausedFrom = null;
  show(null);
}

// ------------------------------------------------------------------ account
export function copyInvite(): void {
  click();
  const link = platform.inviteLink();
  if (!link) return;
  try { clipboard.writeText(link); app.accountNote = () => S("inviteCopied"); }
  catch { app.accountNote = () => S("inviteFailed", { link }); }
}
export function signIn(): void { click(); void requestSignIn().catch(() => undefined); }

// ------------------------------------------------------------------ input
/** Rectangles (window pixels) of the HUD's buttons, set by screens.ts each frame: presses there are not course taps. */
export const hudRects: { x: number; y: number; width: number; height: number; action?: "jump" | "form" }[] = [];
type PEvent = { x: number; y: number };
const presses: PEvent[] = [];
let lastTouch = -1e9;
/** Frame of the last pointer press that acted through a touch button (its release activates the button too). */
export const touchActed = { jump: -1e9, form: -1e9 };
onTouch((e) => {
  lastTouch = frame().time;
  if (e.control || e.phase !== "start") return;
  presses.push({ x: e.x, y: e.y });
});
onPointerButton((e) => {
  if (e.button !== 0 || !e.pressed || frame().time - lastTouch < 0.6) return;
  presses.push({ x: e.x, y: e.y });
});
/** game.js onCanvasPointer and the touch buttons' pointerdown, decided once the frame's UI is built. */
function pointerInput(): void {
  const live = app.machine === "active" && app.screen === null;
  for (const ev of presses.splice(0)) {
    if (!live) continue;
    const hit = hudRects.find((r) => ev.x >= r.x && ev.y >= r.y && ev.x <= r.x + r.width && ev.y <= r.y + r.height);
    if (hit) {
      if (hit.action) { touchActed[hit.action] = frame().frame; ui.setFocus(null); queueAction(hit.action); }
      continue;
    }
    // touch zones: the left half changes form, the right half jumps (mirrored when left-handed)
    const left = ev.x < frame().width / 2;
    const jumpZone = platform.options.leftHanded ? left : !left;
    ui.setFocus(null);
    queueAction(jumpZone ? "jump" : "form");
  }
}

onAction((e) => {
  if (!e.pressed) return;
  if (e.action === "pause") {
    if (ui.capturingKeys() || frame().frame === app.openedFrame) return;
    if (app.machine === "paused") resumeGame();
    else pauseGame(); // a no-op unless a run is counting down or active
    return;
  }
  if ((e.action === "jump" || e.action === "form") && app.machine === "active" && app.screen === null) {
    // game keys must not also walk or activate the UI focus over the HUD
    ui.setFocus(null);
    queueAction(e.action);
  }
});

const pendingActs: (() => void)[] = [];
/** A widget's press, run once the frame's UI is built (state changes mid-build would break later widgets). */
export function later(fn: () => void): void { pendingActs.push(fn); }

// ------------------------------------------------------------------ boot and lifecycle
let lookKey = "";
function applyLook(): void {
  const f = frame();
  const k = `${f.quality}:${f.levelIndex}`;
  if (k === lookKey) return;
  lookKey = k;
  render.applyLook(lookFor(f.quality, f.levelIndex));
}
function applyOptions(): void { render.setTimingAssist(platform.options.timingAssist); }

onStart(() => {
  setFixedRate(Math.round(1 / C.STEP_SECONDS));
  initStyles();
  platform.initPlatform();
  render.setReducedMotion(preferences().reducedMotion);
  applyOptions();
  applyLook();
  render.loadLevel(Levels.journeyLevel(1)); // the backdrop behind the menus
  open("title");
});
onPreferencesChange((p) => render.setReducedMotion(p.reducedMotion));
platform.onOptionsChange(applyOptions);
platform.onPlayer((on) => { if (!on) app.accountNote = () => S("signedOut"); });
onSessionEnded(() => { app.accountNote = () => S("signedOut"); }); // keep playing locally
let hidden = false;
onSuspend(() => {
  hidden = true;
  platform.flush();
  pauseGame();
  audio.setSuspended(true);
});
onResume(() => {
  hidden = false;
  audio.setSuspended(false);
});

onFixedUpdate(() => {
  if (hidden) return;
  if (app.machine === "countdown") {
    if (++countdownTicks >= 60) {
      countdownTicks = 0;
      app.countdown -= 1;
      if (app.countdown <= 0) { app.machine = "active"; announce(T("Go!"), true); }
    }
  } else if (app.machine === "active") stepOnce();
  else if (app.machine === "resolving") {
    if (++resolveTicks >= 30) finishRun();
  }
  if (app.screen === "title" && !preferences().reducedMotion) idleT += C.STEP_SECONDS;
});

let frameDt = 0;
onUpdate((dt) => {
  frameDt = dt;
  if (app.machine === "active" && (isDown("jump") || isDown("form"))) ui.setFocus(null);
  applyLook();
  applyContrast(ui.preferences().highContrast);
  audio.update();
});
onRender((alpha) => {
  hudRects.length = 0;
  drawScreens();
  for (const fn of pendingActs.splice(0)) fn();
  pointerInput();
  const f = frame();
  const beat = (f.time / audio.BEAT_SECONDS) % 1;
  const run = app.state && (app.machine === "countdown" || app.machine === "active" || app.machine === "paused" || app.machine === "resolving");
  if (run) {
    render.tick(frameDt);
    const a = app.machine === "active" ? Math.min(1, Math.max(0, alpha)) : 1;
    render.drawRun(app.state!, app.prev, a, beat, f.width, f.height);
  } else if (app.screen === "title") {
    render.tick(frameDt);
    render.drawIdle(idleT, beat, f.width, f.height);
  }
});
