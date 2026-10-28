// The browser build's DOM shell (index.html + src/ui/dom-ui.js) as
// starhermit:ui, built every frame over the world: the title over its
// see-through wash (Pulse Jumper, the tagline, PLAY, Daily, Journey, Learn,
// Help, Settings, Invite / Sign in, the account note; the Progress and Today
// rails, beside the menu on wide windows and under it on narrow ones); the
// mode cards; the Journey grid of 40 stages with locks and gold-bordered
// mastery trials; Practice's difficulty 1–5; the two Challenge cards; the
// pause screen; the results (headline, the score table, the time line, the
// best score, the leaderboard line and, signed in, the Daily's board); How to
// play with the effective keys; Settings (the game's two options and the
// runtime's Options); the countdown; the run's HUD (score, progress bar,
// PULSE / NOVA badge, pause button, objective line) and the JUMP / FORM
// touch buttons. The old media queries are layouts picked by the window's
// logical size: wide (≥ 1024 px: the title's rails at the sides) and short
// landscape (≤ 500 px tall: smaller headings and touch buttons, tighter
// gaps).
import { frame, openMenu } from "starhermit:engine";
import { bindings } from "starhermit:input";
import * as draw from "starhermit:draw";
import * as ui from "starhermit:ui";
import { C, Levels, Rules } from "./game.ts";
import { N, S, T } from "./i18n.ts";
import * as platform from "./platform.ts";
import {
  app, chooseMode, copyInvite, hudRects, later, leaderboardLine, leaveToTitle, nextStage, objectiveText, open, openOverlay,
  overlayBack, pauseGame, progress, resumeGame, retry, signIn, startRun, today, touchActed, touchOnly, queueAction, click,
} from "./main.ts";

// ------------------------------------------------------------------ layout
interface Layout { lw: number; lh: number; sc: number; wide: boolean; short: boolean; narrow: boolean }
function layoutNow(): Layout {
  const f = frame();
  const sc = ui.preferences().scale;
  const sa = f.safeArea;
  const lw = Math.max(1, (f.width - sa.left - sa.right) / sc), lh = Math.max(1, (f.height - sa.top - sa.bottom) / sc);
  return { lw, lh, sc, wide: lw >= 1024, short: lh <= 500 && lw > lh, narrow: lw < 600 };
}
const lastSize = new Map<string, number>();
// index.html's clamp(min, k·vw, max) font sizes (vw of the window's logical width)
const CLAMPS: Record<string, [number, number, number]> = {
  "btn-secondary": [15, 2.4, 19], "btn-danger": [15, 2.4, 19], "btn-primary": [19, 3.4, 26],
  "title-main": [32, 7, 60], "subtitle": [14, 2.2, 18], "screen-title": [22, 4.5, 36], "results-title": [26, 6, 48],
  "hud-objective": [13, 1.8, 18], "hud-score": [13, 1.8, 18], "hud-form-text": [13, 1.8, 18], "hud-form-nova-text": [13, 1.8, 18],
  "td": [14, 2, 18], "td-total": [14, 2, 18],
};
let LW = 1024;
/** The class with its clamped font size as an inline style. */
function sized(cls: string, extra: ui.Style = {}): [string, ui.Style] {
  const c = CLAMPS[cls];
  if (!c) return [cls, extra];
  const size = Math.min(c[2], Math.max(c[0], (LW * c[1]) / 100));
  return [cls, { ...extra, text: { ...(extra.text ?? {}), size } }];
}
function textWidth(text: string, style: string, kind?: "button" | "heading"): number {
  return ui.measureText(text, { ...(kind ? { kind } : {}), style: sized(style) }).width / ui.preferences().scale;
}
const fresh = (): boolean => frame().frame !== app.openedFrame;
interface Btn { id: string; text: string; style?: string; act: () => void; disabled?: boolean; name?: string }
const buttonWidth = (text: string, style: string): number => textWidth(text, style, "button") + 4;
/** A button `width` wide (null: its text's); a label too long for it wraps inside. */
function button(b: Btn, width: number | null = null): void {
  const style = b.style ?? "btn-secondary";
  const opts: ui.ButtonOptions = {};
  if (b.disabled) opts.disabled = true;
  const s: ui.Style = width != null ? { width } : {};
  const [, inline] = sized(style, s);
  if (width != null && buttonWidth(b.text, style) > width) {
    const inner = Math.max(20, width - 48);
    opts.content = () => { ui.style({ text: { align: "center", ...(inline.text?.size ? { size: inline.text.size } : {}) } }).paragraph(b.text, inner); };
  } else if (b.name) opts.content = () => { ui.style({ text: { weight: "bold" } }).label(b.text); };
  if (ui.style(style, inline).id(b.id).button(b.name ?? b.text, opts) && fresh()) later(b.act);
}
/** One full-width button a line (.settings-grid). */
function stack(label: string, list: Btn[], width: number, gap = 10): ui.Rect {
  return ui.column(label, () => { for (const b of list) button(b, width); }, { spacing: gap, width });
}
/** .btn-row: buttons at their own widths in centred rows that wrap at `width`. */
function flow(label: string, list: Btn[], width: number, gap = 12): ui.Rect {
  const rows: Btn[][] = [[]];
  let used = 0;
  const bw = (b: Btn): number => Math.min(width, buttonWidth(b.text, b.style ?? "btn-secondary"));
  for (const b of list) {
    const w = bw(b);
    if (rows[rows.length - 1]!.length && used + gap + w > width) { rows.push([]); used = 0; }
    used += (rows[rows.length - 1]!.length ? gap : 0) + w;
    rows[rows.length - 1]!.push(b);
  }
  return ui.column(label, () => {
    rows.forEach((row, ri) => ui.row(`${label}-r${ri}`, () => {
      for (const b of row) button(b, bw(b) >= width ? width : null);
    }, { spacing: gap, width, justify: "center" }));
  }, { spacing: gap, width });
}
/** Text up to `width` wide: one label when it fits, else a paragraph. */
function para(text: string, width: number, cls = "subtitle", id?: string, align: "start" | "center" = "center"): void {
  if (!text) return;
  let u = ui.style(...sized(cls, { text: { align } }));
  if (id) u = u.id(id);
  if (textWidth(text, cls) <= width) u.label(text);
  else u.paragraph(text, width);
}
function heading(cls: string, text: string, width: number, id?: string): void {
  if (textWidth(text, cls, "heading") <= width) (id ? ui.id(id) : ui).style(...sized(cls)).heading(text);
  else ui.style(...sized(cls, { text: { align: "center" } })).paragraph(text, width);
}
function rect(r: ui.Rect, action?: "jump" | "form"): void {
  hudRects.push({ x: r.x, y: r.y, width: r.width, height: r.height, ...(action ? { action } : {}) });
}
const gap = (h: number): void => { ui.widget("", { role: "none", size: { width: 1, height: h } }); };

// ------------------------------------------------------------------ the frame
export function drawScreens(): void {
  const L = layoutNow();
  LW = L.lw;
  const f = frame();
  const hc = ui.preferences().highContrast;
  if (app.screen === null) {
    if (app.machine === "countdown") countdownScreen(L);
    else if (app.state && (app.machine === "active" || app.machine === "resolving")) hud(L);
  } else {
    backdrop(app.screen === "title" && !hc ? "title-wash" : "screen", L);
    switch (app.screen) {
      case "title": titleScreen(L); break;
      case "modes": page("modes", L, modesScreen, 900); break;
      case "journey": page("journey", L, journeyScreen, 620); break;
      case "practice": page("practice", L, practiceScreen, 640); break;
      case "challenge": page("challenge", L, challengeScreen, 640); break;
      case "pause": page("pause", L, pauseScreen, 480); break;
      case "results": page("results", L, resultsScreen, 720); break;
      case "help": page("help", L, helpScreen, 940); break;
      case "settings": page("settings", L, settingsScreen, 560); break;
    }
  }
  if (app.focusNext) {
    const age = f.frame - app.openedFrame;
    if (age >= 1) ui.setFocus(app.focusNext);
    if (age >= 3) app.focusNext = null;
  }
}

/** The screen's wash over the whole window (.screen): a placed role-"none" widget, so it covers what was built before it. */
function backdrop(cls: string, L: Layout): void {
  const f = frame();
  ui.place("backdrop", { anchor: "top-start", x: -f.safeArea.left / L.sc, y: -f.safeArea.top / L.sc }, () => {
    ui.widget("", { role: "none", size: { width: f.width / L.sc, height: f.height / L.sc }, draw: () => draw.box(0, 0, f.width, f.height, cls) });
  });
}
/** A screen (.screen): a column at most `width` wide, centred in the window (safe center), scrolling when taller than the room. */
function page(key: string, L: Layout, build: (w: number, L: Layout) => void, width: number): void {
  const pad = L.short ? 12 : 20;
  const outer = Math.min(width, L.lw);
  const avail = Math.max(80, L.lh);
  const h = lastSize.get(key) ?? 0;
  const scroll = h > avail;
  const inner = outer - 2 * pad - (scroll ? 14 : 0);
  const opening = frame().frame - app.openedFrame <= 5;
  const y = scroll ? 0 : Math.max(0, (avail - h) / 2);
  ui.place(`page-${key}`, { anchor: "top", y }, () => {
    const body = (): void => {
      const r = ui.column(`${key}-col`, () => build(inner, L), { width: outer - (scroll ? 14 : 0), spacing: L.short ? 8 : 14, padding: pad, align: "center" });
      lastSize.set(key, r.height / L.sc);
    };
    if (scroll) ui.scrollArea(`${key}-scroll`, { width: outer, height: avail }, body, opening ? { scrollTo: { top: 0 } } : undefined);
    else body();
  });
}

// ------------------------------------------------------------------ title
function titleCore(w: number): void {
  heading("title-main", "Pulse Jumper", w, "title-heading");
  para(T("A one-button rhythm platformer in a neon world. Jump the slabs, phase the gates, ride the pulse."), Math.min(w, 640), "subtitle", "tagline");
  button({ id: "btn-play", text: T("▶ PLAY"), style: "btn-primary", act: () => { click(); open("modes"); } });
  const list: Btn[] = [
    { id: "btn-daily", text: T("Daily"), act: () => chooseMode("daily") },
    { id: "btn-journey", text: T("Journey"), act: () => chooseMode("journey") },
    { id: "btn-learn", text: T("Learn"), act: () => chooseMode("learn") },
    { id: "btn-help", text: T("Help"), act: () => openOverlay("help") },
    { id: "btn-settings", text: T("Settings"), act: () => openOverlay("settings") },
  ];
  if (platform.inviteLink()) list.push({ id: "btn-invite", text: S("invite"), act: copyInvite });
  if (!platform.signedIn()) list.push({ id: "btn-signin", text: S("signIn"), act: signIn });
  flow("title-menu", list, w);
  if (app.accountNote) para(app.accountNote(), w, "profile-line", "title-account-note");
}
function progressRail(w: number, align: "start" | "center"): void {
  const p = progress();
  heading("rail-heading", T("Progress"), w, "rail-progress");
  para(T("Journey stage {n} of {total} unlocked.", { n: p.journeyUnlocked, total: Levels.journeyCount() }), w, "rail-text", "rail-journey", align);
  para(T("Lessons completed: {n}/3.", { n: Object.keys(p.tutorialDone).length }), w, "rail-text", "rail-lessons", align);
  para(T("Achievements unlocked: {n}.", { n: Object.keys(p.achievements).length }), w, "rail-text", "rail-achievements", align);
}
const SYNC: Record<string, string> = { saving: N("saving…"), synced: N("cloud save synced"), offline: N("offline — progress kept locally") };
function todayRail(w: number, align: "start" | "center"): void {
  heading("rail-heading", T("Today"), w, "rail-today");
  const date = today();
  para(platform.signedIn()
    ? T("Daily challenge for {date} — seed {seed}. Ranked.", { date, seed: Levels.dailySeedFor(date).toString(16) })
    : T("Daily challenge: local UTC day, unranked."), w, "rail-text", "title-daily-line", align);
  if (platform.signedIn()) {
    const st = platform.syncState();
    const name = T("Playing as {name}", { name: platform.displayName() || T("Player {id}", { id: "" }).trim() });
    para(name + (st ? ` · ${T(SYNC[st]!)}` : ""), w, "profile-line", "title-profile-line", align);
  }
}
function titleScreen(L: Layout): void {
  const key = "title";
  const h = lastSize.get(key) ?? 0;
  const pad = L.short ? 12 : 20;
  if (L.wide) {
    // .screen as a row: the rails at the sides of the centred menu
    const rail = 220, gapX = 24;
    const coreW = Math.min(640, L.lw - 2 * (rail + gapX) - 2 * pad);
    const y = Math.max(0, (L.lh - h) / 2);
    ui.place("page-title", { anchor: "top-start", y }, () => {
      const r = ui.row("title-row", () => {
        ui.column("rail-left", () => progressRail(rail, "start"), { width: rail, spacing: 12 });
        ui.spacer();
        ui.column("title-core", () => titleCore(coreW), { width: coreW, spacing: 14, align: "center" });
        ui.spacer();
        ui.column("rail-right", () => todayRail(rail, "start"), { width: rail, spacing: 12 });
      }, { width: L.lw, padding: pad, align: "center" });
      lastSize.set(key, r.height / L.sc);
    });
    return;
  }
  page(key, L, (w) => {
    if (!L.short) gap(Math.min(24, L.lh * 0.03));
    titleCore(w);
    gap(L.short ? 4 : 18);
    progressRail(w, "center");
    gap(L.short ? 4 : 18);
    todayRail(w, "center");
  }, 760);
}

// ------------------------------------------------------------------ modes, journey, practice, challenge
function cards(label: string, w: number, list: { id: string; title: string; text: string; act: () => void }[]): void {
  const gapX = 14;
  const cw = Math.min(260, w);
  const cols = Math.max(1, Math.min(list.length, Math.floor((w + gapX) / (cw + gapX))));
  ui.column(label, () => {
    for (let r = 0; r * cols < list.length; r++) {
      ui.row(`${label}-r${r}`, () => {
        for (const c of list.slice(r * cols, (r + 1) * cols)) {
          ui.column(`${c.id}-card`, () => {
            para(c.title, cw - 38, "card-heading", undefined, "start");
            para(c.text, cw - 38, "card-text", undefined, "start");
            button({ id: c.id, text: T("Play"), name: `${T("Play")} — ${c.title}`, act: c.act });
          }, { style: "card", width: cw, spacing: 8 });
        }
      }, { spacing: gapX, justify: "center", width: w });
    }
  }, { spacing: gapX, width: w });
}
function backButton(id: string, act: () => void): void { button({ id, text: T("Back"), act }); }
function modesScreen(w: number): void {
  heading("screen-title", T("Choose a mode"), w, "modes-heading");
  cards("mode-cards", w, [
    { id: "mode-learn", title: T("Learn"), text: T("Three short interactive lessons. Unranked, about a minute each."), act: () => chooseMode("learn") },
    { id: "mode-journey", title: T("Journey"), text: T("40 stages of rising difficulty. Mastery trial every 8th stage. Progress is saved."), act: () => chooseMode("journey") },
    { id: "mode-daily", title: T("Daily"), text: T("One shared seed per UTC day. Ranked on the leaderboard."), act: () => chooseMode("daily") },
    { id: "mode-practice", title: T("Practice"), text: T("Pick a difficulty 1–5. Unranked, restart freely."), act: () => chooseMode("practice") },
    { id: "mode-challenge", title: T("Challenge"), text: T("Constrained variants: a move-limit course and a speed course. Unranked."), act: () => chooseMode("challenge") },
  ]);
  backButton("btn-back", () => { click(); open("title"); });
}
function journeyScreen(w: number, L: Layout): void {
  heading("screen-title", T("Journey"), w, "journey-heading");
  const p = progress();
  const gw = Math.min(560, w);
  const gapX = 8;
  const cols = Math.max(4, Math.floor((gw + gapX) / (56 + gapX)));
  const cw = (gw - (cols - 1) * gapX) / cols;
  const n = Levels.journeyCount();
  const grid = (): void => {
    for (let r = 0; r * cols < n; r++) {
      ui.row(`jg-${r}`, () => {
        for (let i = r * cols + 1; i <= Math.min(n, (r + 1) * cols); i++) {
          const locked = i > p.journeyUnlocked;
          const mastery = i % 8 === 0;
          const best = p.journeyBest[`journey-${i}`];
          const cls = locked ? (mastery ? "stage-locked-mastery" : "stage-locked") : mastery ? "stage-mastery" : "stage";
          const name = [T("Stage {n}", { n: i }), mastery ? T("mastery trial") : "",
            locked ? T("Locked") : best !== undefined ? T("Best: {n}", { n: best }) : T("Not cleared yet")].filter(Boolean).join(", ");
          const opts: ui.ButtonOptions = { content: () => ui.label(locked ? "🔒" : String(i)) };
          if (locked) opts.disabled = true;
          if (ui.style(cls, { width: cw }).id(`stage-${i}`).button(name, opts) && fresh() && !locked) later(() => chooseMode("journey", i));
        }
      }, { spacing: gapX });
    }
  };
  // .level-grid: at most 46 % of the window tall, scrolling inside
  const rows = Math.ceil(n / cols);
  const gridH = rows * 44 + (rows - 1) * gapX;
  const maxH = Math.max(140, L.lh * 0.46);
  if (gridH > maxH) ui.scrollArea("journey-grid-scroll", { width: gw + 14, height: maxH }, () => ui.column("journey-grid", grid, { spacing: gapX, width: gw }));
  else ui.column("journey-grid", grid, { spacing: gapX, width: gw });
  para(T("Gold-bordered stages are mastery trials."), w, "subtitle", "journey-note");
  backButton("btn-back", () => { click(); open("modes"); });
}
function practiceScreen(w: number): void {
  heading("screen-title", T("Practice"), w, "practice-heading");
  para(T("Select a difficulty. Unranked; restart any time."), w, "subtitle", "practice-note");
  flow("practice-row", [1, 2, 3, 4, 5].map((d) => ({ id: `diff-${d}`, text: String(d), name: `${T("Practice")} ${d}`, act: () => chooseMode("practice", d) })), w);
  backButton("btn-back", () => { click(); open("modes"); });
}
function challengeScreen(w: number): void {
  heading("screen-title", T("Challenge"), w, "challenge-heading");
  cards("challenge-cards", w, [
    { id: "challenge-moves", title: T("Move Limit"), text: T("Finish the course using at most 24 actions. Every jump and form change counts."), act: () => chooseMode("challenge", "moves") },
    { id: "challenge-speed", title: T("Speed Target"), text: T("Maximum speed course. Finish in 19 seconds or better."), act: () => chooseMode("challenge", "speed") },
  ]);
  backButton("btn-back", () => { click(); open("modes"); });
}

// ------------------------------------------------------------------ pause
function pauseScreen(w: number, L: Layout): void {
  heading("screen-title", T("Paused"), w, "pause-heading");
  const list: Btn[] = [
    { id: "btn-resume", text: T("Resume"), style: "btn-primary", act: () => { click(); resumeGame(); } },
    { id: "btn-restart", text: T("Restart run"), act: () => { click(); if (app.mode) startRun(app.mode, app.modeArg, true); } },
    { id: "btn-pause-help", text: T("Help"), act: () => openOverlay("help") },
    { id: "btn-pause-settings", text: T("Settings"), act: () => openOverlay("settings") },
    { id: "btn-leave", text: T("Leave to title"), style: "btn-danger", act: leaveToTitle },
  ];
  const bw = Math.min(w, 420);
  if (L.short) {
    // five actions fit a short landscape window in two columns
    const cw = (bw - 10) / 2;
    ui.column("pause-grid", () => {
      for (let i = 0; i < list.length; i += 2) ui.row(`pause-r${i}`, () => { for (const b of list.slice(i, i + 2)) button(b, cw); }, { spacing: 10 });
    }, { spacing: 8, width: bw });
  } else stack("pause-menu", list, bw);
}

// ------------------------------------------------------------------ results
function resultsScreen(w: number): void {
  const R = app.results;
  if (!R) return;
  heading("results-title", R.headline(), w, "results-heading");
  // table.breakdown: label and value columns
  const rows: [string, number, boolean][] = [
    [T("Checkpoints"), R.score.checkpoints, false], [T("Gems"), R.score.gems, false], [T("Finish bonus"), R.score.finish, false],
    [T("Attempt penalty"), R.score.penalties, false], [T("Total"), R.score.total, true],
  ];
  const c1 = Math.max(...rows.map(([k]) => textWidth(k, "td-total"))) + 8;
  const c2 = Math.max(...rows.map(([, v]) => textWidth(String(v), "td-total"))) + 8;
  const tw = Math.min(w, c1 + c2 + 32 + 32);
  ui.column("results-table", () => rows.forEach(([k, v, total], i) => ui.row(`res-${i}`, () => {
    ui.style(total ? "td-total" : "td").label(k);
    ui.spacer();
    ui.style(total ? "td-total" : "td").id(`res-${i}-v`).label(String(v));
  }, { style: total ? "tr-total" : "tr", width: tw, align: "center" })), { spacing: 0, width: tw });
  R.lines.forEach((line, i) => para(line(), w, "subtitle", `results-line-${i}`));
  if (R.best !== null) para(T("Best score: {n}", { n: R.best }), w, "best-line", "results-best");
  const lb = leaderboardLine();
  if (lb) para(lb, w, "subtitle", "results-lb");
  if (R.daily && app.board) {
    ui.column("daily-board", () => {
      if (app.board === "none") {
        heading("board-heading", T("Daily board"), w, "daily-board-h");
        para(T("No platform leaderboard for this game yet — your best is saved to your account."), w, "subtitle");
      } else if (app.board) {
        heading("board-heading", T("Daily board — platform"), w, "daily-board-h");
        if (!app.board.length) para(T("No entries yet today."), w, "subtitle");
        app.board.forEach((e, i) => para(`${e.rank}. ${e.name} — ${e.score}`, w, "board-line", `board-${i}`));
        const mine = app.board.find((e) => e.mine);
        if (mine) para(T("Your platform rank: {n}.", { n: mine.rank }), w, "best-line");
      }
      para(T("Your best is saved to your account."), w, "subtitle", "daily-board-note");
    }, { spacing: 6, width: w, align: "center" });
  }
  const list: Btn[] = [{ id: "btn-retry", text: T("Retry"), style: "btn-primary", act: retry }];
  if (R.canNext) list.push({ id: "btn-next", text: T("Next stage"), act: nextStage });
  list.push({ id: "btn-modes", text: T("Mode select"), act: () => { click(); open("modes"); } }, { id: "btn-title", text: T("Title"), act: leaveToTitle });
  flow("results-btns", list, w);
}

// ------------------------------------------------------------------ help
const KEY_NAMES: Record<string, string> = { "Arrow Up": "↑", "Arrow Down": "↓", "Arrow Left": "←", "Arrow Right": "→", Escape: "Esc" };
/** The effective keys of an action: "Space, ↑ or W" (dom-ui.js kbds). */
export function keysFor(action: string): string {
  let list: string[] = [];
  try {
    list = bindings(action).filter((b) => b.device === "keyboard").map((b) => (b.label === "Space" ? T("Space") : KEY_NAMES[b.label] ?? b.label));
  } catch { /* not yet */ }
  list = [...new Set(list)];
  return list.length > 1 ? T("{a} or {b}", { a: list.slice(0, -1).join(", "), b: list[list.length - 1]! }) : list[0] ?? "—";
}
function helpScreen(w: number): void {
  heading("screen-title", T("How to play"), w, "help-heading");
  const items: [string, string][] = [
    [T("Jump"), T("Press {keys}, or tap the right side to jump. Jumping clears the low amber slabs.", { keys: keysFor("jump") })],
    [T("Form change"), T("Press {keys}, or tap the left side to switch between PULSE (cyan sphere) and NOVA (magenta, wide halo). Tall violet gates can only be phased through as NOVA.", { keys: keysFor("form") })],
    [T("Scoring"), T("Checkpoints +50, gems +25, finishing +500. Each failed attempt on a stage costs 10 points (max 100).")],
    [T("Pause"), T("Press {keys}, or the II button. The game pauses automatically when the tab is hidden.", { keys: keysFor("pause") })],
  ];
  const gapX = 14;
  const cw = Math.min(260, w);
  const cols = Math.max(1, Math.min(items.length, Math.floor((w + gapX) / (cw + gapX))));
  ui.column("help-cards", () => {
    for (let r = 0; r * cols < items.length; r++) {
      ui.row(`help-r${r}`, () => items.slice(r * cols, (r + 1) * cols).forEach(([title, text], j) => {
        ui.column(`help-${r * cols + j}`, () => {
          para(title, cw - 38, "card-heading", undefined, "start");
          para(text, cw - 38, "card-text", `help-${r * cols + j}-text`, "start");
        }, { style: "card", width: cw, spacing: 6 });
      }), { spacing: gapX, justify: "center", width: w });
    }
  }, { spacing: gapX, width: w });
  backButton("btn-back", overlayBack);
}

// ------------------------------------------------------------------ settings
function settingsScreen(w: number): void {
  heading("screen-title", T("Settings"), w, "settings-heading");
  const fw = Math.min(420, w);
  ui.column("settings-grid", () => {
    const check = (key: "leftHanded" | "timingAssist", text: string): void => {
      const cur = platform.options[key];
      const next = ui.id(`set-${key}`).checkbox(T(text), cur);
      if (next !== cur) later(() => { platform.setOption(key, next); click(); });
    };
    check("leftHanded", N("Left-handed touch controls"));
    check("timingAssist", N("Timing assist (landing marker)"));
    para(T("Sound, graphics, language, reduced motion, high contrast and larger text are in the StarHermit Options."), fw, "setting-label", "options-note", "start");
    button({ id: "btn-options", text: T("Open Options"), act: () => { click(); openMenu(); } });
  }, { spacing: 12, width: fw });
  backButton("btn-back", overlayBack);
}

// ------------------------------------------------------------------ countdown and HUD
function countdownScreen(L: Layout): void {
  backdrop("screen", L);
  const size = Math.max(32, Math.min(60, L.lw * 0.07));
  ui.place("countdown", "center", () => ui.style("countdown", { text: { size } }).id("countdown-text").label(String(Math.max(1, app.countdown))));
}
function pauseBars(): void {
  ui.widget("", {
    role: "none", size: { width: 14, height: 16 },
    draw: (r, s) => {
      const c = s.highContrast ? "#ffffff" : "#e8f6ff";
      const bw = r.width * 0.32;
      draw.box(r.x, r.y, bw, r.height, { background: c, radius: 1 });
      draw.box(r.x + r.width - bw, r.y, bw, r.height, { background: c, radius: 1 });
    },
  });
}
function hud(L: Layout): void {
  const s = app.state!, level = app.level!;
  const live = app.machine === "active";
  const total = Rules.scoreOf(s).total;
  const pct = Math.min(100, Math.round((s.x / level.length) * 100));
  const nova = s.form === C.FORM_NOVA;
  // #hud: SCORE n, the progress bar, the form badge, the pause button; the objective under it
  const barW = Math.max(60, Math.min(L.lw * 0.34, L.lw - 300));
  ui.place("hud", { anchor: "top-start", x: 0, y: 0 }, () => {
    ui.column("hud-col", () => {
      ui.row("hud-row", () => {
        ui.style("hud-label").id("hud-score-label").label(T("SCORE"));
        ui.style(...sized("hud-score")).id("hud-score").label(String(total));
        ui.widget(T("Level progress"), {
          role: "meter", size: { width: barW, height: 8 }, value: pct, min: 0, max: 100,
          draw: (rr, ws) => {
            draw.box(rr.x, rr.y, rr.width, rr.height, { background: ws.highContrast ? "#333333" : "#1c2c4a", radius: 4 });
            if (pct > 0) draw.box(rr.x, rr.y, Math.max(rr.height, rr.width * pct / 100), rr.height, { background: ws.highContrast ? "#ffff00" : "#fde047", radius: 4 });
          },
        });
        ui.column("hud-form", () => ui.style(...sized(nova ? "hud-form-nova-text" : "hud-form-text")).id("hud-form-text").label(nova ? "NOVA" : "PULSE"), { style: nova ? "hud-form-nova" : "hud-form" });
      }, { width: L.lw, height: 52, spacing: 14, align: "center", padding: { top: 8, bottom: 0, start: 14, end: 14 } });
      ui.column("hud-objective-col", () => para(objectiveText(), L.lw - 28, "hud-objective", "hud-objective", "start"), { padding: { start: 14, end: 14, top: 0, bottom: 0 } });
    }, { spacing: 6 });
  });
  // #hud-pause at the row's end (presses there are not course taps)
  const pr = ui.place("hud-pause", { anchor: "top-end", x: 14, y: 8 }, () => {
    const opts: ui.ButtonOptions = { content: pauseBars };
    if (!live) opts.disabled = true;
    if (ui.style("icon-btn").id("btn-pause").button(T("Pause game"), opts) && fresh() && live) later(() => { ui.setFocus(null); pauseGame(); });
  });
  rect(pr);
  // #touch-actions: FORM (left) and JUMP (right), swapped for the left-handed
  if (touchOnly()) {
    const lefty = platform.options.leftHanded;
    const bw = Math.min(L.lw * 0.34, 180);
    const tb = (action: "jump" | "form", anchor: ui.Anchor): void => {
      const big = action === "jump" ? T("JUMP") : T("FORM");
      const small = action === "jump" ? T("right tap") : T("left tap");
      const name = action === "jump" ? T("Jump (Space or right tap)") : T("Form (F or left tap)");
      const r = ui.place(`touch-${action}`, { anchor, x: 16, y: 10 }, () => {
        const opts: ui.ButtonOptions = {
          content: () => { ui.style("touch-big").label(big); ui.style("touch-small").label(small); },
        };
        if (!live) opts.disabled = true;
        const res = ui.style(action === "jump" ? "touch-jump" : "touch-form", { width: bw, ...(L.short ? { minHeight: 56 } : {}) }).id(`touch-${action}`).button(name, opts);
        // a pointer press acted at once (pointerInput); the release's activation comes from keys or a11y only
        if (res && fresh() && live && frame().frame - touchActed[action] > 90) later(() => { ui.setFocus(null); queueAction(action); });
      });
      rect(r, action);
    };
    tb("form", lefty ? "bottom-end" : "bottom-start");
    tb("jump", lefty ? "bottom-start" : "bottom-end");
  }
}
