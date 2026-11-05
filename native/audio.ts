// Sound, as the browser build's src/audio/audio.js: the authored one-shots
// (sfx/<name>.opus, sfx/manifest.json) per game event — jump (two variants
// in turn), form change (two), checkpoint, gem (two), death, win and UI
// clicks (three), each event a SoundBank — and the pulsing ambient loop: a
// soft kick and a triangle bass note on every beat at 112 BPM over an
// eight-note bassline. The browser build scheduled the loop live with
// oscillators; here the same graph renders its eight beats once
// (OfflineAudioContext) into a clip looped on the music bus at the old music
// level (half the music volume). The runtime's Options own the volumes, mute
// and the voice limit. UI clicks play on the "interface" bus, the rest on
// "effects". A clip still loading is silent. Everything loads in onStart;
// only starting the loop waits for the mixer (in a browser, the first press).
import { context, createClip, loadClip, OfflineAudioContext, play as playClip, SoundBank, type AudioClip, type Sound } from "starhermit:audio";

export type SfxEvent = "jump" | "form" | "checkpoint" | "gem" | "death" | "win" | "ui";
const SFX_BY_EVENT: Record<SfxEvent, string[]> = {
  jump: ["jump-launch", "jump-soft"],
  form: ["form-shift-pulse", "form-shift-nova"],
  checkpoint: ["checkpoint-chime"],
  gem: ["gem-pickup", "gem-sparkle"],
  death: ["death-zap"],
  win: ["win-fanfare"],
  ui: ["ui-click", "ui-confirm", "ui-back"],
};
const banks = new Map<SfxEvent, SoundBank>();
let suspended = false;

/** audio.js play*(): the event's next variant. */
export function event(type: SfxEvent): void {
  if (suspended) return;
  try { banks.get(type)?.play(); } catch { /* the mixer is full this frame: skip it */ }
}

/** A hidden window: everything quiet (audio.js suspend / resume). */
export function setSuspended(on: boolean): void { suspended = on; }

// -- the ambient loop ------------------------------------------------------------------------------
export const BEAT_SECONDS = 60 / 112;
const BASSLINE = [55, 55, 82.4, 55, 65.4, 55, 73.4, 98];
const RATE = 22050;
const LOOP_N = Math.round(BEAT_SECONDS * RATE) * BASSLINE.length;
/** The eight beats (scheduleBeat: kick 140→45 Hz over 0.12 s, gain 0.5→0.001 over 0.16 s; bass up to 0.35 in 30 ms, down to 0.001 by 0.9 beat). */
async function renderLoop(): Promise<AudioClip> {
  const off = new OfflineAudioContext(1, LOOP_N, RATE);
  const out = off.createGain();
  out.gain.value = 0.5; // the old music bus: music volume × 0.5
  out.connect(off.destination);
  BASSLINE.forEach((freq, b) => {
    const t = (b * LOOP_N) / BASSLINE.length / RATE;
    const kick = off.createOscillator(), kickGain = off.createGain();
    kick.frequency.setValueAtTime(140, t);
    kick.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    kickGain.gain.setValueAtTime(0.5, t);
    kickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    kick.connect(kickGain).connect(out);
    kick.start(t); kick.stop(t + 0.2);
    const bass = off.createOscillator(), bassGain = off.createGain();
    bass.type = "triangle";
    bass.frequency.value = freq;
    bassGain.gain.setValueAtTime(0.0001, t);
    bassGain.gain.exponentialRampToValueAtTime(0.35, t + 0.03);
    bassGain.gain.exponentialRampToValueAtTime(0.001, t + BEAT_SECONDS * 0.9);
    bass.connect(bassGain).connect(out);
    bass.start(t); bass.stop(t + BEAT_SECONDS);
  });
  return createClip(await off.startRendering());
}
let loopClip: AudioClip | null = null;
let loopVoice: Sound | null = null;

/** Loads every clip at once and renders the loop (onStart). */
export function loadSfx(): void {
  for (const [type, names] of Object.entries(SFX_BY_EVENT) as [SfxEvent, string[]][]) {
    void Promise.all(names.map((n) => loadClip(`sfx/${n}.opus`).catch((e: unknown) => { console.warn(`sfx ${n}: ${String(e)}`); return null; }))).then((loaded) => {
      const list = loaded.filter((c) => c !== null);
      if (list.length) banks.set(type, new SoundBank({ clips: list, order: "sequence", bus: type === "ui" ? "interface" : "effects" }));
    });
  }
  renderLoop().then((c) => { loopClip = c; }, (e: unknown) => { console.warn(`audio: ${String(e)}`); });
}

/** Each frame: the loop once the mixer runs, then its level. */
export function update(): void {
  if (context.state !== "running" || !loopClip) return;
  if (!loopVoice) {
    try { loopVoice = playClip(loopClip, { bus: "music", loop: true, gain: 0 }); } catch { loopVoice = null; }
    return;
  }
  try { loopVoice.fade(suspended ? 0 : 1, 0.15); } catch { /* the mixer restarted */ }
}
