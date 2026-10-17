'use strict';

// Semantic HTML UI layer over the canvas: title, modes, journey, pause,
// results, help, settings. All screens are keyboard-operable with visible
// focus; objective/score/results are announced through live regions.

import { THEMES, journeyCount } from '../core/levels.js';
import { PRESETS, CATEGORIES, DEFAULT_GRAPHICS, presetTier, choosePreset } from '../render/gfx.js';
import { gfxStrings } from './gfx-i18n.js';
import { T, N, onLanguage } from '../lang.js';

const $ = (id) => document.getElementById(id);
let H = {}; // handlers supplied by game.js
let lastFocus = null;
let profileName = null; // platform nickname (null in local mode)
let profileStatus = null; // saving | synced | offline (cloud mirror)

function el(tag, attrs = {}, text = '') {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('aria')) n.setAttribute(k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), v);
    else n[k] = v;
  }
  if (text) n.textContent = text;
  return n;
}

function btn(label, className, onClick, id) {
  const b = el('button', { type: 'button', className: 'btn ' + className }, label);
  if (id) b.id = id;
  b.addEventListener('click', () => { onClick(); });
  return b;
}

// Reset a screen and return its centred content column. Every screen needs the
// .screen-core wrapper: on wide viewports .screen itself is a row (that is how
// the title rails sit beside the content), so unwrapped children would lay out
// side by side instead of stacking.
function core(screenId) {
  const s = $(screenId);
  s.innerHTML = '';
  const c = el('div', { class: 'screen-core' });
  s.append(c);
  return c;
}

const SCREENS = ['screen-title', 'screen-modes', 'screen-journey', 'screen-practice',
  'screen-challenge', 'screen-pause', 'screen-results', 'screen-help', 'screen-settings',
  'screen-countdown', 'webgl-error'];

export function showScreen(name) {
  for (const s of SCREENS) {
    const n = $(s);
    if (n) n.hidden = s !== name;
  }
  document.body.classList.toggle('playing', name === null);
  clearInterval(gfxTimer);
  if (name === 'screen-settings') {
    buildGraphics();
    gfxTimer = setInterval(refreshGraphicsSummary, 1000);
  }
  if (name) {
    lastFocus = document.activeElement;
    const scr = $(name);
    const focusable = scr && scr.querySelector('button:not([disabled]), [tabindex], input, select');
    // preventScroll + reset: a low first control must not scroll the heading
    // away; every screen opens at its top.
    if (focusable) focusable.focus({ preventScroll: true });
    if (scr) for (const n of [scr, ...scr.querySelectorAll('*')]) if (n.scrollTop) n.scrollTop = 0;
  } else if (lastFocus && document.contains(lastFocus)) {
    lastFocus.focus();
  }
}

export function announce(region, text) {
  const n = $('live-' + region);
  if (n) { n.textContent = ''; requestAnimationFrame(() => { n.textContent = text; }); }
}

// --- Screen builders --------------------------------------------------------

function buildTitle(save) {
  const s = $('screen-title');
  s.innerHTML = '';
  const core = el('div', { class: 'screen-core' });
  core.append(el('h1', { class: 'title-main', id: 'title-heading' }, 'Pulse Jumper'));
  core.append(el('p', { class: 'subtitle' },
    T('A one-button rhythm platformer in a neon world. Jump the slabs, phase the gates, ride the pulse.')));
  core.append(btn(T('▶ PLAY'), 'primary', H.onPlay, 'play-btn'));
  const row = el('div', { class: 'btn-row' });
  row.append(
    btn(T('Daily'), 'secondary', () => H.onMode('daily')),
    btn(T('Journey'), 'secondary', () => H.onMode('journey')),
    btn(T('Learn'), 'secondary', () => H.onMode('learn')),
    btn(T('Help'), 'secondary', () => H.onShowOverlay('screen-help')),
    btn(T('Settings'), 'secondary', () => H.onShowOverlay('screen-settings')),
    btn('', 'secondary', () => H.onInvite(), 'invite-btn'),
    btn('', 'secondary', () => H.onSignIn(), 'signin-btn'));
  core.append(row);
  core.append(el('p', { id: 'title-account-note', class: 'profile-line', role: 'status', hidden: true }));
  s.append(core);

  const left = el('div', { class: 'rail left' });
  left.append(el('h3', {}, T('Progress')));
  left.append(el('p', {}, T('Journey stage {n} of {total} unlocked.', { n: save.journeyUnlocked, total: journeyCount() })));
  const done = Object.keys(save.tutorialDone).length;
  left.append(el('p', {}, T('Lessons completed: {n}/3.', { n: done })));
  left.append(el('p', {}, T('Achievements unlocked: {n}.', { n: Object.keys(save.achievements).length })));
  s.append(left);
  const right = el('div', { class: 'rail right' });
  right.append(el('h3', {}, T('Today')));
  right.append(el('p', { id: 'title-daily-line' }, dailyLine ? dailyLine() : T('Daily challenge: one shared seed per UTC day.')));
  right.append(el('p', { id: 'title-profile-line', class: 'profile-line', hidden: true }));
  s.append(right);
  renderProfileLine();
  renderAccount();
  showAccountNote(accountNote);
}

// StarHermit account buttons: sign-in only on the hosted domain without a
// token, invite only when signed in.
let account = { signIn: false, invite: false, labels: null };
function renderAccount() {
  const si = $('signin-btn');
  const inv = $('invite-btn');
  if (!si || !inv) return;
  si.hidden = !account.signIn;
  inv.hidden = !account.invite;
  const labels = txt(account.labels);
  if (labels) {
    si.textContent = labels.signIn;
    inv.textContent = labels.invite;
  }
}
export function setAccount(a) {
  account = { ...account, ...a };
  renderAccount();
}
let accountNote = null;
export function showAccountNote(text) {
  accountNote = text;
  const n = $('title-account-note');
  if (!n || !text) return;
  n.textContent = txt(text);
  n.hidden = false;
}

function buildModes() {
  const s = $('screen-modes');
  s.innerHTML = '';
  const core = el('div', { class: 'screen-core' });
  core.append(el('h2', { class: 'screen-title', id: 'modes-heading' }, T('Choose a mode')));
  const mk = (title, desc, mode, arg) => {
    const c = el('div', { class: 'card' });
    c.append(el('h3', {}, title), el('p', {}, desc));
    c.append(btn(T('Play'), 'secondary', () => H.onMode(mode, arg)));
    return c;
  };
  const cards = el('div', { class: 'cards' });
  cards.append(
    mk(T('Learn'), T('Three short interactive lessons. Unranked, about a minute each.'), 'learn'),
    mk(T('Journey'), T('40 stages of rising difficulty. Mastery trial every 8th stage. Progress is saved.'), 'journey'),
    mk(T('Daily'), T('One shared seed per UTC day. Ranked on the leaderboard.'), 'daily'),
    mk(T('Practice'), T('Pick a difficulty 1–5. Unranked, restart freely.'), 'practice'),
    mk(T('Challenge'), T('Constrained variants: a move-limit course and a speed course. Unranked.'), 'challenge'));
  core.append(cards);
  core.append(btn(T('Back'), 'secondary', () => showScreen('screen-title')));
  s.append(core);
}

function buildJourney(save) {
  const s = core('screen-journey');
  s.append(el('h2', { class: 'screen-title', id: 'journey-heading' }, T('Journey')));
  const grid = el('div', { class: 'level-grid', role: 'group', ariaLabel: T('Journey stages') });
  for (let i = 1; i <= journeyCount(); i++) {
    const locked = i > save.journeyUnlocked;
    const best = save.journeyBest['journey-' + i];
    const b = btn(locked ? '🔒' : String(i),
      (i % 8 === 0 ? 'mastery ' : '') + (locked ? 'locked' : 'secondary'),
      () => { if (!locked) H.onMode('journey', i); });
    b.disabled = locked;
    b.title = locked ? T('Locked') : (best !== undefined ? T('Best: {n}', { n: best }) : T('Not cleared yet'));
    grid.append(b);
  }
  s.append(grid);
  s.append(el('p', { class: 'subtitle' }, T('Gold-bordered stages are mastery trials.')));
  s.append(btn(T('Back'), 'secondary', () => showScreen('screen-modes')));
}

function buildPractice() {
  const s = core('screen-practice');
  s.append(el('h2', { class: 'screen-title' }, T('Practice')));
  s.append(el('p', { class: 'subtitle' }, T('Select a difficulty. Unranked; restart any time.')));
  const row = el('div', { class: 'btn-row' });
  for (let d = 1; d <= 5; d++) {
    row.append(btn(String(d), 'secondary', () => H.onMode('practice', d)));
  }
  s.append(row, btn(T('Back'), 'secondary', () => showScreen('screen-modes')));
}

function buildChallenge() {
  const s = core('screen-challenge');
  s.append(el('h2', { class: 'screen-title' }, T('Challenge')));
  const cards = el('div', { class: 'cards' });
  const c1 = el('div', { class: 'card' });
  c1.append(el('h3', {}, T('Move Limit')), el('p', {}, T('Finish the course using at most 24 actions. Every jump and form change counts.')));
  c1.append(btn(T('Play'), 'secondary', () => H.onMode('challenge', 'moves')));
  const c2 = el('div', { class: 'card' });
  c2.append(el('h3', {}, T('Speed Target')), el('p', {}, T('Maximum speed course. Finish in 19 seconds or better.')));
  c2.append(btn(T('Play'), 'secondary', () => H.onMode('challenge', 'speed')));
  cards.append(c1, c2);
  s.append(cards, btn(T('Back'), 'secondary', () => showScreen('screen-modes')));
}

function buildPause() {
  const s = core('screen-pause');
  s.append(el('h2', { class: 'screen-title', id: 'pause-heading' }, T('Paused')));
  const col = el('div', { class: 'settings-grid' });
  col.append(btn(T('Resume'), 'primary', H.onResume, 'resume-btn'));
  col.append(btn(T('Restart run'), 'secondary', H.onRetry));
  col.append(btn(T('Help'), 'secondary', () => H.onShowOverlay('screen-help')));
  col.append(btn(T('Settings'), 'secondary', () => H.onShowOverlay('screen-settings')));
  col.append(btn(T('Leave to title'), 'danger', H.onLeave));
  s.append(col);
}

// Text arguments may be functions so the screen re-renders in a new language.
const txt = (v) => (typeof v === 'function' ? v() : v);
let lastResults = null;

export function showResults(args) {
  lastResults = args;
  renderResults(args);
  showScreen('screen-results');
  announce('results', T('{headline}. Total score {n}.', { headline: txt(args.headline), n: args.score.total }));
}

function renderResults({ headline, score, best, extraLines = [], canNext, onNext }) {
  const lb = $('results-lb');
  const lbState = lb ? { hidden: lb.hidden, text: lb.textContent } : null;
  const s = core('screen-results');
  s.append(el('h2', { class: 'results-title', id: 'results-heading' }, txt(headline)));
  const table = el('table', { class: 'breakdown' });
  const row = (label, val) => {
    const tr = el('tr');
    tr.append(el('td', {}, label), el('td', {}, String(val)));
    return tr;
  };
  table.append(
    row(T('Checkpoints'), score.checkpoints),
    row(T('Gems'), score.gems),
    row(T('Finish bonus'), score.finish),
    row(T('Attempt penalty'), score.penalties));
  const tr = el('tr', { class: 'total' });
  tr.append(el('td', {}, T('Total')), el('td', {}, String(score.total)));
  table.append(tr);
  s.append(table);
  for (const line of extraLines) s.append(el('p', { class: 'subtitle' }, txt(line)));
  if (best !== null && best !== undefined) {
    s.append(el('p', { class: 'best-line' }, T('Best score: {n}', { n: best })));
  }
  s.append(el('p', { class: 'subtitle', id: 'results-lb', 'aria-live': 'polite', hidden: true }));
  const rowB = el('div', { class: 'btn-row' });
  rowB.append(btn(T('Retry'), 'primary', H.onRetry));
  if (canNext && onNext) rowB.append(btn(T('Next stage'), 'secondary', onNext));
  rowB.append(btn(T('Mode select'), 'secondary', () => showScreen('screen-modes')),
    btn(T('Title'), 'secondary', H.onLeave));
  s.append(rowB);
  return lbState;
}

// Effective keyboard bindings ({ action: KeyboardEvent.code[] }) for Help.
let bindings = {
  jump: ['Space', 'ArrowUp', 'KeyW'], form: ['KeyF', 'ArrowDown', 'KeyS'], pause: ['Escape', 'KeyP'],
};
function keyLabel(code) {
  const named = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Space: T('Space') };
  if (named[code]) return named[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  return String(code).replace(/[^\w ]/g, '');
}
function kbds(action) {
  const list = (bindings[action] || []).map((c) => `<kbd>${keyLabel(c)}</kbd>`);
  return list.length > 1 ? T('{a} or {b}', { a: list.slice(0, -1).join(', '), b: list[list.length - 1] }) : (list[0] || '');
}
export function setBindings(b) {
  bindings = b;
  buildHelp();
}

function helpCards() {
  return [
    [T('Jump'), T('Press {keys}, or tap the right side to jump. Jumping clears the low amber slabs.', { keys: kbds('jump') })],
    [T('Form change'), T('Press {keys}, or tap the left side to switch between PULSE (cyan sphere) and NOVA (magenta, wide halo). Tall violet gates can only be phased through as NOVA.', { keys: kbds('form') })],
    [T('Scoring'), T('Checkpoints +50, gems +25, finishing +500. Each failed attempt on a stage costs 10 points (max 100).')],
    [T('Pause'), T('Press {keys}, or the II button. The game pauses automatically when the tab is hidden.', { keys: kbds('pause') })],
  ];
}

function buildHelp() {
  const s = core('screen-help');
  s.append(el('h2', { class: 'screen-title', id: 'help-heading' }, T('How to play')));
  const cards = el('div', { class: 'cards' });
  for (const [title, html] of helpCards()) {
    const c = el('div', { class: 'card' });
    c.append(el('h3', {}, title));
    const p = el('p', {});
    p.innerHTML = html;
    c.append(p);
    cards.append(c);
  }
  s.append(cards, btn(T('Back'), 'secondary', () => showScreen(H.onHelpBack())));
}

const SETTING_DEFS = [
  ['musicVolume', N('Music volume'), 'range'],
  ['effectsVolume', N('Effects volume'), 'range'],
  ['muted', N('Mute all audio'), 'checkbox'],
  ['reducedMotion', N('Reduced motion'), 'checkbox'],
  ['highContrast', N('High contrast'), 'checkbox'],
  ['largerText', N('Larger text'), 'checkbox'],
  ['leftHanded', N('Left-handed touch controls'), 'checkbox'],
  ['timingAssist', N('Timing assist (landing marker)'), 'checkbox'],
];

// The Settings screen keeps one skeleton: its game controls and the Graphics
// controls redraw inside their own boxes (#settings-controls, #gfx-controls),
// so the shared Sound / Language / Report sections that game-options.js mounts
// in #gfx-section (data-options-graphics) are never torn down.
function buildSettings(settings) {
  let s = $('settings-shell');
  if (!s) {
    s = core('screen-settings');
    s.id = 'settings-shell';
    s.append(el('h2', { class: 'screen-title', id: 'settings-heading' }));
    const grid = el('div', { id: 'settings-controls', class: 'settings-grid' });
    const gfxBox = el('div', { id: 'gfx-section', class: 'settings-grid gfx-section', role: 'group', ariaLabelledby: 'gfx-heading' });
    gfxBox.dataset.optionsGraphics = '';
    gfxBox.append(el('div', { id: 'gfx-controls', class: 'settings-grid' }));
    const cols = el('div', { class: 'settings-cols' });
    cols.append(grid, gfxBox);
    s.append(cols, btn('', 'secondary', () => showScreen(H.onHelpBack()), 'settings-back'));
  }
  $('settings-heading').textContent = T('Settings');
  $('settings-back').textContent = T('Back');
  const grid = $('settings-controls');
  grid.innerHTML = '';
  for (const [key, label, kind] of SETTING_DEFS) {
    const lab = el('label', {});
    lab.append(el('span', {}, T(label)));
    let input;
    if (kind === 'range') {
      input = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(settings[key]) });
      input.addEventListener('input', () => H.onSettingsChange({ [key]: Number(input.value) }));
    } else {
      input = el('input', { type: 'checkbox', checked: !!settings[key] });
      input.addEventListener('change', () => H.onSettingsChange({ [key]: input.checked }));
    }
    input.id = 'setting-' + key;
    lab.append(input);
    grid.append(lab);
  }
  gfxSettings = settings;
  buildGraphics();
}

// --- Graphics section ----------------------------------------------------------
// Quality preset, render scale, one override per effect, adaptive resolution,
// fps readout, GPU/cost summary. Changes apply live and persist with settings.
let gfxSettings = null;
let gfxTimer = null;

function currentGraphics() {
  return { ...DEFAULT_GRAPHICS, ...((gfxSettings && gfxSettings.graphics) || {}) };
}

function setGraphics(next) {
  gfxSettings = { ...gfxSettings, graphics: next };
  H.onSettingsChange({ graphics: next });
  const focusId = document.activeElement && document.activeElement.id;
  buildGraphics();
  if (focusId && $(focusId)) $(focusId).focus();
}

function gfxRow(labelText, input, extra) {
  const lab = el('label', {});
  lab.append(el('span', {}, labelText));
  if (extra) {
    const wrap = el('span', { class: 'gfx-inline' });
    wrap.append(input, extra);
    lab.append(wrap);
  } else lab.append(input);
  return lab;
}

function buildGraphics() {
  const box = $('gfx-controls');
  if (!box || !gfxSettings) return;
  const t = gfxStrings();
  const g = currentGraphics();
  const info = H.graphicsInfo ? H.graphicsInfo((k) => t.sum[k]) : null;
  const detected = info ? info.detected : 'balanced';
  const active = info ? info.resolved.preset : (PRESETS.includes(g.preset) ? g.preset : detected);
  box.innerHTML = '';
  box.append(el('h3', { id: 'gfx-heading', class: 'gfx-heading' }, t.graphics));

  const quality = el('select', { id: 'setting-graphicsTier' });
  quality.dataset.gfx = 'preset';
  quality.append(el('option', { value: 'auto', selected: !PRESETS.includes(g.preset) },
    t.auto.replace('{tier}', t.tier[detected])));
  for (const p of PRESETS) quality.append(el('option', { value: p, selected: g.preset === p }, t.tier[p]));
  quality.addEventListener('change', () => setGraphics(choosePreset(currentGraphics(), quality.value)));
  box.append(gfxRow(t.quality, quality));

  const pct = Math.round(Math.min(2, Math.max(0.5, Number(g.render_scale) || 1)) * 100);
  const scale = el('input', { id: 'gfx-scale', type: 'range', min: '50', max: '200', step: '5', value: String(pct) });
  scale.dataset.gfx = 'render_scale';
  const scaleVal = el('output', { id: 'gfx-scale-value', class: 'gfx-value' }, pct + '%');
  scale.addEventListener('input', () => { scaleVal.textContent = scale.value + '%'; });
  scale.addEventListener('change', () => setGraphics({ ...currentGraphics(), render_scale: Number(scale.value) / 100 }));
  box.append(gfxRow(t.renderScale, scale, scaleVal));

  for (const [cat, tiers] of Object.entries(CATEGORIES)) {
    const sel = el('select', { id: 'gfx-' + cat });
    sel.dataset.gfx = cat;
    sel.append(el('option', { value: 'preset', selected: !tiers.includes(g[cat]) },
      t.fromPreset.replace('{tier}', t.tier[presetTier(active, cat)])));
    for (const tier of tiers) sel.append(el('option', { value: tier, selected: g[cat] === tier }, t.tier[tier]));
    sel.addEventListener('change', () => {
      const next = { ...currentGraphics() };
      if (sel.value === 'preset') delete next[cat]; else next[cat] = sel.value;
      setGraphics(next);
    });
    box.append(gfxRow(t.cat[cat], sel));
  }

  const adaptive = el('input', { id: 'gfx-adaptive', type: 'checkbox', checked: g.adaptive !== false });
  adaptive.addEventListener('change', () => setGraphics({ ...currentGraphics(), adaptive: adaptive.checked }));
  box.append(gfxRow(t.adaptive, adaptive));
  const fpsBox = el('input', { id: 'gfx-show-fps', type: 'checkbox', checked: !!g.show_fps });
  fpsBox.addEventListener('change', () => setGraphics({ ...currentGraphics(), show_fps: fpsBox.checked }));
  box.append(gfxRow(t.showFps, fpsBox));

  box.append(el('p', { id: 'gfx-summary', class: 'gfx-summary' }));
  const note = el('p', { id: 'gfx-post-note', class: 'gfx-summary', role: 'status', hidden: true }, t.postFailed);
  box.append(note);
  refreshGraphicsSummary();
}

export function refreshGraphicsSummary() {
  const n = $('gfx-summary');
  if (!n || !H.graphicsInfo) return;
  const t = gfxStrings();
  const info = H.graphicsInfo((k) => t.sum[k]);
  if (!info) { n.textContent = ''; return; }
  n.textContent = `${info.gpu || t.unknownGpu} · ${info.summary}`;
  n.dataset.preset = info.resolved.preset;
  const note = $('gfx-post-note');
  if (note) note.hidden = !info.postFailed;
}

/** Rebuild the Graphics section (e.g. once the renderer knows the GPU). */
export function refreshGraphicsPanel() { buildGraphics(); }

// --- Public API ---------------------------------------------------------------

export function init(handlers) {
  H = handlers;
  buildModes(); buildPause(); buildPractice(); buildChallenge(); buildHelp();
}

let lastSave = null;
export function refreshMetaScreens(save) {
  lastSave = save;
  buildTitle(save);
  buildJourney(save);
  buildSettings(save.settings);
}

// Language change: rebuild every screen in place (the visible one keeps its
// place and focus), relabel Settings without touching the shared sections.
onLanguage(() => {
  const active = document.activeElement;
  const focusId = active && active.id;
  const focusText = active && active.tagName === 'BUTTON' && !focusId ? [...(active.closest('.screen')?.querySelectorAll('button') || [])].indexOf(active) : -1;
  const focusScreen = active && active.closest && active.closest('.screen');
  buildModes(); buildPause(); buildPractice(); buildChallenge(); buildHelp();
  if (lastSave) { buildTitle(lastSave); buildJourney(lastSave); buildSettings(lastSave.settings); }
  if (lastResults && $('screen-results').querySelector('.screen-core')) {
    const lb = renderResults(lastResults);
    const line = $('results-lb');
    if (lb && line) { line.hidden = lb.hidden; line.textContent = lb.text; }
    if (lastBoard) showDailyBoard(lastBoard);
  }
  if (focusId && $(focusId) && document.activeElement !== $(focusId)) $(focusId).focus({ preventScroll: true });
  else if (focusScreen && focusText >= 0 && document.activeElement === document.body) {
    const b = focusScreen.querySelectorAll('button')[focusText];
    if (b) b.focus({ preventScroll: true });
  }
});

export function showCountdown(text) {
  const s = core('screen-countdown');
  s.append(el('div', { class: 'title-main', role: 'status' }, text));
  showScreen('screen-countdown');
}

export function setHudVisible(on) { $('hud').hidden = !on; }

export function updateHUD(state, level, scoreTotal, objective) {
  $('hud-score').textContent = String(scoreTotal);
  const pct = Math.min(100, Math.round((state.x / level.length) * 100));
  $('hud-progress-fill').style.width = pct + '%';
  const bar = $('hud-progress');
  bar.setAttribute('aria-valuenow', String(pct));
  const form = $('hud-form');
  const nova = state.form === 2;
  form.textContent = nova ? 'NOVA' : 'PULSE';
  form.classList.toggle('nova', nova);
  $('hud-objective').textContent = objective || '';
}

export function setTouchMode(on) { document.body.classList.toggle('touch', on); }

export function applyAccessibility(settings) {
  document.body.classList.toggle('high-contrast', !!settings.highContrast);
  document.body.classList.toggle('larger-text', !!settings.largerText);
  document.body.classList.toggle('reduced-motion', !!settings.reducedMotion);
  document.body.classList.toggle('left-handed', !!settings.leftHanded);
}

let dailyLine = null;
export function setDailyLine(text) {
  dailyLine = typeof text === 'function' ? text : () => text;
  const n = $('title-daily-line');
  if (n) n.textContent = dailyLine();
}

const SYNC_LABELS = {
  saving: () => T('saving…'),
  synced: () => T('cloud save synced'),
  offline: () => T('offline — progress kept locally'),
};

function renderProfileLine() {
  const n = $('title-profile-line');
  if (!n) return;
  if (!profileName) { n.hidden = true; return; }
  const status = SYNC_LABELS[profileStatus];
  n.textContent = T('Playing as {name}', { name: profileName }) + (status ? ` · ${status()}` : '');
  n.hidden = false;
}

// Name + cloud-sync status slot (hosted only; hidden in local mode).
export function setProfileLine(name, status) {
  profileName = name;
  profileStatus = status;
  renderProfileLine();
}

// Read-only daily board on the results screen (hosted only). Safe to call
// before the results screen exists — it no-ops unless results are visible.
let dailyNote = null;
let lastBoard = null;
export function showDailyBoard(args) {
  const { source, entries = [], myRank = null } = args;
  const s = $('screen-results');
  if (!s || s.hidden) return;
  const host = s.querySelector('.screen-core');
  if (!host) return;
  const old = $('daily-board');
  if (old) old.remove();
  const box = el('div', { id: 'daily-board', class: 'daily-board' });
  if (source === 'platform') {
    box.append(el('h3', {}, T('Daily board — platform')));
    if (!entries.length) box.append(el('p', { class: 'subtitle' }, T('No entries yet today.')));
    const list = el('ol', { class: 'board-list' });
    for (const e of entries) list.append(el('li', {}, `${e.rank}. ${e.name} — ${e.score}`));
    box.append(list);
    if (myRank) box.append(el('p', { class: 'best-line' }, T('Your platform rank: {n}.', { n: myRank })));
  } else {
    box.append(el('h3', {}, T('Daily board')));
    box.append(el('p', { class: 'subtitle' },
      T('No platform leaderboard for this game yet — your best is saved to your account.')));
  }
  if (dailyNote) box.append(el('p', { class: 'subtitle', id: 'daily-board-note' }, txt(dailyNote)));
  host.append(box);
  lastBoard = args;
}

// Graceful-fallback note under the daily board (e.g. validation backend down).
export function showDailyNote(text) {
  dailyNote = text;
  if (!text) return;
  const box = $('daily-board');
  if (!box || $('daily-board-note')) return;
  box.append(el('p', { class: 'subtitle', id: 'daily-board-note' }, txt(text)));
}
