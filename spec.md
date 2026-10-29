# Pulse Jumper — specification

Pulse Jumper is a one-button rhythm platformer in a neon geometric world. The runner auto-runs along a
course: jumps clear the low amber slabs, and a form change (PULSE ⇄ NOVA) phases through the tall violet
gates. Checkpoints, gems and the finish beacon score points. It is a StarHermit engine **script game**
(engine 1.24.0, host API 1.21, `engine.minor=20`), played natively by the StarHermit client and in
browsers by the engine's web runtime from one package.

## Files

| Path | What it is |
| --- | --- |
| `starhermit.txt` | Manifest: entry `native/main.ts`, capabilities `platform,storage,clipboard`, `server=score-script.js`, the actions and their key and pad defaults. |
| `native/main.ts` | Game flow, the fixed-step run, input, progression, achievements, score posting, lifecycle. |
| `native/screens.ts` | Every screen, the HUD and the touch buttons on `starhermit:ui`. |
| `native/render.ts` | The world on `starhermit:scene`. |
| `native/quality.ts` | The look per graphics tier and level. |
| `native/audio.ts` | Sound effects and the ambient loop on `starhermit:audio`. |
| `native/platform.ts` | Save, game options, legacy migration, the player, the clock, score posting, the board. |
| `native/i18n.ts`, `native/style.ts`, `native/game.ts` | Strings, the UI style sheet, typed facade over the rules. |
| `src/core/*.js` | The rules, content, save model, replay session and PRNG (pure ES modules, unchanged from the browser build). |
| `src/progress.js` | The stored progress: normalize, merge, the browser build's cloud slot, legacy keys, the Daily streak. |
| `src/strings.js`, `src/platform-i18n.js` | Translations (nine locales). |
| `tools/ui-style.css` → `assets/ui-style.json` | The style sheet, converted with `npm run css`. |
| `score-script.js` | The platform script that range-checks a posted score for the `high-score` board. |
| `index.html`, `starhermit-files.json` | The web loader and file index from `npm run package` (never edited by hand). |

## Rules

- The run is simulated at a fixed 60 Hz (`STEP_SECONDS`): gravity −30 m/s², jump velocity 11 m/s, speed by
  stage (10–16 m/s). One command a step: `none`, `jump` (only when grounded) or `form` (toggles PULSE/NOVA).
  The latest input before a step is that step's command.
- A low slab (1.5 m) ends the run unless jumped. A gate (6 m) ends it unless the runner is NOVA.
- Score: checkpoints +50, gems +25, finishing +500, −10 per earlier failed attempt on the same stage this
  session (at most −100). Results show the breakdown.
- Challenges: **Move Limit** (at most 24 actions) and **Speed Target** (under 20 s). Finishing outside the
  limit shows "CLEAR — CHALLENGE FAILED".

## Modes and content

- **Learn**: three lessons (jump, form change, both); a mode card starts the first one not yet finished.
- **Journey**: 40 generated stages (every 8th a gold-bordered mastery trial); clearing a stage unlocks the
  next and keeps the best score per stage.
- **Daily**: one seed per UTC day, by the platform's clock (`serverNow`, the device's UTC date when offline);
  the best score per date is kept.
- **Practice**: difficulty 1–5, unranked.
- **Challenge**: the two constrained courses above.
- Every level is validated offline by the solver (`validateLevel`); tests prove all 40 stages, the Dailies,
  lessons, practice and challenges completable.

## Screens

- **Title** over the drifting runner: Pulse Jumper, the tagline, ▶ PLAY, Daily, Journey, Learn, Help,
  Settings, Invite a friend (signed in) or Sign in with StarHermit (guest), the account note. The Progress
  rail (Journey stage unlocked, lessons, achievements) and the Today rail (the Daily line, "Playing as …"
  with the cloud-save state) sit beside the menu from 1024 logical px wide, under it on narrower windows.
- **Modes**: five cards (Learn, Journey, Daily, Practice, Challenge), each with Play; Back.
- **Journey**: the 40-stage grid (🔒 on locked stages; scrolls when taller than 46 % of the window).
- **Practice**: buttons 1–5. **Challenge**: two cards.
- **Countdown** 3-2-1 (60 steps a number), then "Go!" is announced.
- **HUD**: SCORE, the progress meter, the PULSE/NOVA badge, the pause button (II), the objective line.
  Touch devices also show FORM (left) and JUMP (right) buttons, swapped for the left-handed.
- **Pause**: Resume, Restart run, Help, Settings, Leave to title (two columns in a short landscape window).
- **Results**: headline, breakdown table, time · jumps · form changes, the best score, the leaderboard line
  and, for a signed-in Daily clear, the board's top five with the player's rank. Retry, Next stage (Journey
  and Learn), Mode select, Title.
- **How to play**: four cards with the player's effective keys. **Settings**: Left-handed touch controls,
  Timing assist (landing marker), and Open Options (the runtime's menu).
- Font sizes follow the browser build's `clamp(min, vw, max)` rules from the window's logical width.

## Controls

| Action | Keys | Pad | Touch |
| --- | --- | --- | --- |
| Jump | Space, ↑, W | A, D-pad up, stick up | right half of the course, JUMP button |
| Change form | F, ↓, S | B, X, D-pad down, stick down | left half of the course, FORM button |
| Pause / resume | Escape, P | Start | II button |

Mouse clicks on the course act as taps. Left-handed mirrors the course halves and the buttons. Players
rebind keys and pads in the runtime's Options.

## Look

The browser build's three.js r185 scene, ported to `starhermit:scene`: sky dome in WGSL (gradient, horizon
glow, twinkling stars, striped synth sun), dark floor with a one-pixel grid (a WGSL plane) and a roughness
noise map, lane edges, instanced skyline, amber slabs with neon edges, violet gate arches with spinning
swirls, bobbing gems, checkpoint rings pulsing at 112 BPM, the finish beacon, beat particles, the runner
(emissive sphere, gyro ring, point light, halo, motion trail) and the chase camera that frames portrait
windows. Punctual light intensities are ÷ π (engine light units); reflections use
`new RoomEnvironment(renderer)` moved down 3.5 m (r183+), environment intensity 0.55, the floor its own
envMap at 0.05.

Per graphics tier (`frame().quality`; particle counts scale with `levelIndex` up to 2×):

| Tier | Shading | Shadows | AO | Bloom / grade | AA | Reflections | Particles | Detail |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Low | Lambert | off | off | off | MSAA | off | off | plain |
| Balanced | standard | 1024 | off | on | FXAA | on | low | detailed |
| High | clear-coated physical | 2048 | on | on | SMAA | on | high | detailed |
| Ultra | clear-coated physical | 4096 | high | on | MSAA | on | high | detailed |

Bloom: strength 0.7, radius 0.45, threshold 0.86. Grade (linear): contrast 0.18, saturation 1.12, cool
shadows / warm highlights, vignette 0.28. Reduced motion stops the beat pulse, the twinkle, the bob and the
shake. The death shakes the camera.

## Audio

Authored clips per event (jump, form change, checkpoint, gem, death, win, UI; variants in turn) on the
effects and interface buses, and the ambient kick-and-bass loop rendered once into a clip and looped on the
music bus. Clips load one at a time once the mixer runs. Volumes, mute and the voice limit are the
runtime's Options. A hidden window silences everything.

## Platform

- **Save**: progress (`src/progress.js`) is the engine save, on the device and in the cloud slot. Two
  devices' copies merge (higher unlock, best score per stage and per date, union of lessons and
  achievements). The browser build's cloud slot (its whole save document as JSON under `game:<slug>`)
  shows as foreign: it is merged in, with its left-handed and timing-assist options, and replaced once.
  Guests' old browser localStorage cannot be migrated.
- **Options**: left-handed and timing assist are engine settings. The browser build's per-player settings
  keys are adopted when they are game options, then all of them are removed (volumes, mute, graphics,
  reduced motion, high contrast, larger text, language, `audio.options`, `graphics.gpu.*`).
- **Leaderboard**: signed in, a finished Journey, Daily or Challenge run (cleared or wiped out) posts its
  total (≥ 0) through `score-script.js` (a practice session carrying `{ type: 'result', scores }`), and the
  results show the rank. Practice and lessons post nothing. Scores are range-checked by the server script
  (0–100000); per the solo policy, they are not re-simulated server-side.
- **Achievements** (local, announced): First Clear, Journey Complete, Tutorial Graduate, Oof (wiped out
  without an action), Seven-Day Pulse (Daily cleared seven UTC days in a row).
- Sign in and Invite a friend use `requestSignIn` and the platform invite link (copied to the clipboard).

## Localization and accessibility

Nine locales (en-US, en-GB, es-419, es-ES, de-DE, fr-FR, fr-CA, pt-BR, it-IT) in the interface language
the runtime reports. Screen readers hear the objective, "Go!", achievements and the results through
`ui.announce`; every control has a name. High contrast swaps the UI tokens; larger text and interface size
are the runtime's.

## Lifecycle and determinism

Pausing, a hidden window (pauses the run) and slow frames cost no simulated time: the run, the countdown
(180 steps) and the half-second beat before the results (30 steps) all count fixed steps. The world is
drawn between steps by the frame's interpolation. Cosmetic randomness (shake) never touches the rules.

## Checks

- `npm run test:unit`: rules, replay, golden runs, fuzz, the level validator, save, progress and i18n.
- `npm run test:native` (`tests/native.mjs`): web index up to date, `tsc`, `starhermit check .` with no
  warnings, and the render-check play scripts in `tests/native/` — Journey stages 1–2 by keys, the three
  lessons on a portrait phone by touch, the Speed Target challenge in a phone held sideways by course
  taps, the menus (Help keys, timing assist, attempt penalty, pause), and today's Daily (written at test
  time). Scripts come from `npm run plays` (`tools/gen-plays.mjs`): the solver's commands become key or
  touch lines at measured offsets (keys: tick F − 180 after the starting line; touches a further 2 ticks).
- `npm run test:browser` (`tools/browser-play.mjs`): the package in GPU Chrome at desktop, phone and
  landscape (DPR 3), played to the results with no console errors.
- `npm run package` after every change.

## Known limitations

- The grid is a WGSL plane: `LineSegments` that cross the camera's near plane draw as filled shapes on the
  engine (reported), and GridHelper's lines run behind the chase camera.
- Synthesized fallback blips while a clip loads are not ported (a clip still loading is silent).
- The old Graphics panel's per-effect overrides, render scale and FPS readout are the runtime's Options.
- The old dev `server.js` (static hosting, replay-validated local board) is gone; the platform board is
  the only leaderboard.
