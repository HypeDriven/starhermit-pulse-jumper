'use strict';

// Semantic HTML UI layer over the canvas: title, modes, journey, pause,
// results, help, settings. All screens are keyboard-operable with visible
// focus; objective/score/results are announced through live regions.

import { THEMES, journeyCount } from '../core/levels.js';

const $ = (id) => document.getElementById(id);
let H = {}; // handlers supplied by game.js
let lastFocus = null;

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

const SCREENS = ['screen-title', 'screen-modes', 'screen-journey', 'screen-practice',
  'screen-challenge', 'screen-pause', 'screen-results', 'screen-help', 'screen-settings',
  'screen-countdown', 'webgl-error'];

export function showScreen(name) {
  for (const s of SCREENS) {
    const n = $(s);
    if (n) n.hidden = s !== name;
  }
  document.body.classList.toggle('playing', name === null);
  if (name) {
    lastFocus = document.activeElement;
    const scr = $(name);
    const focusable = scr && scr.querySelector('button:not([disabled]), [tabindex], input, select');
    if (focusable) focusable.focus();
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
    'A one-button rhythm platformer in a neon world. Jump the slabs, phase the gates, ride the pulse.'));
  core.append(btn('▶ PLAY', 'primary', H.onPlay, 'play-btn'));
  const row = el('div', { class: 'btn-row' });
  row.append(
    btn('Daily', 'secondary', () => H.onMode('daily')),
    btn('Journey', 'secondary', () => H.onMode('journey')),
    btn('Learn', 'secondary', () => H.onMode('learn')),
    btn('Help', 'secondary', () => H.onShowOverlay('screen-help')),
    btn('Settings', 'secondary', () => H.onShowOverlay('screen-settings')));
  core.append(row);
  s.append(core);

  const left = el('div', { class: 'rail left' });
  left.append(el('h3', {}, 'Progress'));
  left.append(el('p', {}, `Journey stage ${save.journeyUnlocked} of ${journeyCount()} unlocked.`));
  const done = Object.keys(save.tutorialDone).length;
  left.append(el('p', {}, `Lessons completed: ${done}/3.`));
  s.append(left);
  const right = el('div', { class: 'rail right' });
  right.append(el('h3', {}, 'Today'));
  right.append(el('p', { id: 'title-daily-line' }, 'Daily challenge: one shared seed per UTC day.'));
  s.append(right);
}

function buildModes() {
  const s = $('screen-modes');
  s.innerHTML = '';
  const core = el('div', { class: 'screen-core' });
  core.append(el('h2', { class: 'screen-title', id: 'modes-heading' }, 'Choose a mode'));
  const mk = (title, desc, mode, arg) => {
    const c = el('div', { class: 'card' });
    c.append(el('h3', {}, title), el('p', {}, desc));
    c.append(btn('Play', 'secondary', () => H.onMode(mode, arg)));
    return c;
  };
  const cards = el('div', { class: 'cards' });
  cards.append(
    mk('Learn', 'Three short interactive lessons. Unranked, about a minute each.', 'learn'),
    mk('Journey', '40 stages of rising difficulty. Mastery trial every 8th stage. Progress is saved.', 'journey'),
    mk('Daily', 'One shared seed per UTC day. Ranked on the leaderboard.', 'daily'),
    mk('Practice', 'Pick a difficulty 1–5. Unranked, restart freely.', 'practice'),
    mk('Challenge', 'Constrained variants: a move-limit course and a speed course. Unranked.', 'challenge'));
  core.append(cards);
  core.append(btn('Back', 'secondary', () => showScreen('screen-title')));
  s.append(core);
}

function buildJourney(save) {
  const s = $('screen-journey');
  s.innerHTML = '';
  s.append(el('h2', { class: 'screen-title', id: 'journey-heading' }, 'Journey'));
  const grid = el('div', { class: 'level-grid', role: 'group', ariaLabel: 'Journey stages' });
  for (let i = 1; i <= journeyCount(); i++) {
    const locked = i > save.journeyUnlocked;
    const best = save.journeyBest['journey-' + i];
    const b = btn(locked ? '🔒' : String(i),
      (i % 8 === 0 ? 'mastery ' : '') + (locked ? 'locked' : 'secondary'),
      () => { if (!locked) H.onMode('journey', i); });
    b.disabled = locked;
    b.title = locked ? 'Locked' : (best !== undefined ? `Best: ${best}` : 'Not cleared yet');
    grid.append(b);
  }
  s.append(grid);
  s.append(el('p', { class: 'subtitle' }, 'Gold-bordered stages are mastery trials.'));
  s.append(btn('Back', 'secondary', () => showScreen('screen-modes')));
}

function buildPractice() {
  const s = $('screen-practice');
  s.innerHTML = '';
  s.append(el('h2', { class: 'screen-title' }, 'Practice'));
  s.append(el('p', { class: 'subtitle' }, 'Select a difficulty. Unranked; restart any time.'));
  const row = el('div', { class: 'btn-row' });
  for (let d = 1; d <= 5; d++) {
    row.append(btn(String(d), 'secondary', () => H.onMode('practice', d)));
  }
  s.append(row, btn('Back', 'secondary', () => showScreen('screen-modes')));
}

function buildChallenge() {
  const s = $('screen-challenge');
  s.innerHTML = '';
  s.append(el('h2', { class: 'screen-title' }, 'Challenge'));
  const cards = el('div', { class: 'cards' });
  const c1 = el('div', { class: 'card' });
  c1.append(el('h3', {}, 'Move Limit'), el('p', {}, 'Finish the course using at most 24 actions. Every jump and form change counts.'));
  c1.append(btn('Play', 'secondary', () => H.onMode('challenge', 'moves')));
  const c2 = el('div', { class: 'card' });
  c2.append(el('h3', {}, 'Speed Target'), el('p', {}, 'Maximum speed course. Finish in 19 seconds or better.'));
  c2.append(btn('Play', 'secondary', () => H.onMode('challenge', 'speed')));
  cards.append(c1, c2);
  s.append(cards, btn('Back', 'secondary', () => showScreen('screen-modes')));
}

function buildPause() {
  const s = $('screen-pause');
  s.innerHTML = '';
  s.append(el('h2', { class: 'screen-title', id: 'pause-heading' }, 'Paused'));
  const col = el('div', { class: 'settings-grid' });
  col.append(btn('Resume', 'primary', H.onResume, 'resume-btn'));
  col.append(btn('Restart run', 'secondary', H.onRetry));
  col.append(btn('Help', 'secondary', () => H.onShowOverlay('screen-help')));
  col.append(btn('Settings', 'secondary', () => H.onShowOverlay('screen-settings')));
  col.append(btn('Leave to title', 'danger', H.onLeave));
  s.append(col);
}

export function showResults({ headline, score, best, extraLines = [], canNext, onNext }) {
  const s = $('screen-results');
  s.innerHTML = '';
  s.append(el('h2', { class: 'results-title', id: 'results-heading' }, headline));
  const table = el('table', { class: 'breakdown' });
  const row = (label, val) => {
    const tr = el('tr');
    tr.append(el('td', {}, label), el('td', {}, String(val)));
    return tr;
  };
  table.append(
    row('Checkpoints', score.checkpoints),
    row('Gems', score.gems),
    row('Finish bonus', score.finish),
    row('Attempt penalty', score.penalties));
  const tr = el('tr', { class: 'total' });
  tr.append(el('td', {}, 'Total'), el('td', {}, String(score.total)));
  table.append(tr);
  s.append(table);
  for (const line of extraLines) s.append(el('p', { class: 'subtitle' }, line));
  if (best !== null && best !== undefined) {
    s.append(el('p', { class: 'best-line' }, `Best score: ${best}`));
  }
  const rowB = el('div', { class: 'btn-row' });
  rowB.append(btn('Retry', 'primary', H.onRetry));
  if (canNext && onNext) rowB.append(btn('Next stage', 'secondary', onNext));
  rowB.append(btn('Mode select', 'secondary', () => showScreen('screen-modes')),
    btn('Title', 'secondary', H.onLeave));
  s.append(rowB);
  showScreen('screen-results');
  announce('results', `${headline}. Total score ${score.total}.`);
}

const HELP_CARDS = [
  ['Jump', 'Press <kbd>Space</kbd>, <kbd>W</kbd>, <kbd>↑</kbd> or tap the right side to jump. Jumping clears the low amber slabs.'],
  ['Form change', 'Press <kbd>F</kbd>, <kbd>S</kbd>, <kbd>↓</kbd> or tap the left side to switch between PULSE (cyan sphere) and NOVA (magenta, wide halo). Tall violet gates can only be phased through as NOVA.'],
  ['Scoring', 'Checkpoints +50, gems +25, finishing +500. Each failed attempt on a stage costs 10 points (max 100).'],
  ['Pause', 'Press <kbd>Esc</kbd> or <kbd>P</kbd>, or the II button. The game pauses automatically when the tab is hidden.'],
];

function buildHelp() {
  const s = $('screen-help');
  s.innerHTML = '';
  s.append(el('h2', { class: 'screen-title', id: 'help-heading' }, 'How to play'));
  const cards = el('div', { class: 'cards' });
  for (const [title, html] of HELP_CARDS) {
    const c = el('div', { class: 'card' });
    c.append(el('h3', {}, title));
    const p = el('p', {});
    p.innerHTML = html;
    c.append(p);
    cards.append(c);
  }
  s.append(cards, btn('Back', 'secondary', () => showScreen(H.onHelpBack())));
}

const SETTING_DEFS = [
  ['musicVolume', 'Music volume', 'range'],
  ['effectsVolume', 'Effects volume', 'range'],
  ['muted', 'Mute all audio', 'checkbox'],
  ['graphicsTier', 'Graphics quality', 'select', ['high', 'medium', 'low']],
  ['reducedMotion', 'Reduced motion', 'checkbox'],
  ['highContrast', 'High contrast', 'checkbox'],
  ['largerText', 'Larger text', 'checkbox'],
  ['leftHanded', 'Left-handed touch controls', 'checkbox'],
  ['timingAssist', 'Timing assist (landing marker)', 'checkbox'],
];

function buildSettings(settings) {
  const s = $('screen-settings');
  s.innerHTML = '';
  s.append(el('h2', { class: 'screen-title', id: 'settings-heading' }, 'Settings'));
  const grid = el('div', { class: 'settings-grid' });
  for (const [key, label, kind, options] of SETTING_DEFS) {
    const lab = el('label', {});
    lab.append(el('span', {}, label));
    let input;
    if (kind === 'range') {
      input = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(settings[key]) });
      input.addEventListener('input', () => H.onSettingsChange({ [key]: Number(input.value) }));
    } else if (kind === 'checkbox') {
      input = el('input', { type: 'checkbox', checked: !!settings[key] });
      input.addEventListener('change', () => H.onSettingsChange({ [key]: input.checked }));
    } else {
      input = el('select', {});
      for (const o of options) {
        input.append(el('option', { value: o, selected: settings[key] === o }, o));
      }
      input.addEventListener('change', () => H.onSettingsChange({ [key]: input.value }));
    }
    input.id = 'setting-' + key;
    lab.append(input);
    grid.append(lab);
  }
  s.append(grid, btn('Back', 'secondary', () => showScreen(H.onHelpBack())));
}

// --- Public API ---------------------------------------------------------------

export function init(handlers) {
  H = handlers;
  buildModes(); buildPause(); buildPractice(); buildChallenge(); buildHelp();
}

export function refreshMetaScreens(save) {
  buildTitle(save);
  buildJourney(save);
  buildSettings(save.settings);
}

export function showCountdown(text) {
  const s = $('screen-countdown');
  s.innerHTML = '';
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

export function setDailyLine(text) {
  const n = $('title-daily-line');
  if (n) n.textContent = text;
}
