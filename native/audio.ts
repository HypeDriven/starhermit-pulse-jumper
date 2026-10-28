// Sound, as the browser build's src/audio/audio.js: the authored one-shots
// (sfx/<name>.opus, sfx/manifest.json) per game event — jump (two variants
// in turn), form change (two), checkpoint, gem (two), death, win and UI
// clicks (three) — and the pulsing ambient loop: a soft kick and a triangle
// bass note on every beat at 112 BPM over an eight-note bassline. The
// browser build scheduled the loop live with oscillators; here its eight
// beats are rendered once into a clip (createClip, a slice a frame) and looped
// on the music bus at the old music level (half the music volume). The
// runtime's Options own the volumes, mute and the voice limit. UI clicks play
// on the "interface" bus, the rest on "effects". The oscillator blips the
// browser build played while a sample decoded are not ported (a live
// synthesis graph makes clip loads fail on the engine's web runtime), so a
// clip still loading is silent. Clips load once the mixer runs (natively at
// once, in a browser after the first press), one at a time.
import { context, createClip, loadClip, play as playClip, type AudioClip, type Sound } from "starhermit:audio";

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
const clips = new Map<string, AudioClip>();
const cursor = new Map<SfxEvent, number>();
const queue: string[] = Object.values(SFX_BY_EVENT).flat();
let loading = false;
let suspended = false;

/** audio.js play*(): the event's next ready variant. */
export function event(type: SfxEvent): void {
  if (suspended) return;
  const ready = SFX_BY_EVENT[type].filter((n) => clips.has(n));
  if (!ready.length) return;
  const i = (cursor.get(type) ?? 0) % ready.length;
  cursor.set(type, i + 1);
  const name = ready[i]!;
  try { playClip(clips.get(name)!, { bus: type === "ui" ? "interface" : "effects" }); }
  catch { clips.delete(name); if (!queue.includes(name)) queue.push(name); } // a clip the mixer lost: load it again
}

/** A hidden window: everything quiet (audio.js suspend / resume). */
export function setSuspended(on: boolean): void { suspended = on; }

// -- the ambient loop ------------------------------------------------------------------------------
export const BEAT_SECONDS = 60 / 112;
const BASSLINE = [55, 55, 82.4, 55, 65.4, 55, 73.4, 98];
const RATE = 22050;
const BEAT_N = Math.round(BEAT_SECONDS * RATE);
const LOOP_N = BEAT_N * BASSLINE.length;
const loop = new Float32Array(LOOP_N);
let rendered = 0;
/** exponentialRampToValueAtTime from v0 at t0 to v1 at t1. */
const ramp = (t: number, t0: number, v0: number, t1: number, v1: number): number => v0 * Math.pow(v1 / v0, Math.min(1, Math.max(0, (t - t0) / (t1 - t0))));
/** Renders `count` more samples of the eight beats (scheduleBeat: kick 140→45 Hz over 0.12 s, gain 0.5→0.001 over 0.16 s; bass up to 0.35 in 30 ms, down to 0.001 by 0.9 beat). */
function renderLoop(count: number): boolean {
  const end = Math.min(LOOP_N, rendered + count);
  let kickPhase = 0, bassPhase = 0;
  for (let n = rendered; n < end; n++) {
    const b = Math.floor(n / BEAT_N);
    const t = (n - b * BEAT_N) / RATE;
    // phases restart each beat (each beat's oscillators start at 0)
    if (n === b * BEAT_N || n === rendered) {
      kickPhase = 0; bassPhase = 0;
      // integrate from the beat's start when a slice begins mid-beat
      for (let m = b * BEAT_N; m < n; m++) {
        const tt = (m - b * BEAT_N) / RATE;
        kickPhase += ramp(tt, 0, 140, 0.12, 45) / RATE;
        bassPhase += BASSLINE[b]! / RATE;
      }
    }
    let s = 0;
    if (t < 0.2) s += Math.sin(2 * Math.PI * kickPhase) * (t < 0.16 ? ramp(t, 0, 0.5, 0.16, 0.001) : 0.001);
    const ph = bassPhase % 1;
    const tri = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
    const g = t < 0.03 ? ramp(t, 0, 0.0001, 0.03, 0.35) : ramp(t, 0.03, 0.35, BEAT_SECONDS * 0.9, 0.001);
    s += tri * g;
    loop[n] = s * 0.5; // the old music bus: music volume × 0.5
    kickPhase += ramp(t, 0, 140, 0.12, 45) / RATE;
    bassPhase += BASSLINE[b]! / RATE;
  }
  rendered = end;
  return rendered >= LOOP_N;
}
let loopClip: AudioClip | null = null;
let loopVoice: Sound | null = null;

/** Each frame: the clips once the mixer runs (one at a time), then the loop, then its level. */
export function update(): void {
  if (context.state !== "running") return;
  if (!loading && queue.length) {
    const name = queue.shift()!;
    if (!clips.has(name)) {
      loading = true;
      loadClip(`sfx/${name}.opus`).then((c) => { clips.set(name, c); loading = false; }, (e: unknown) => { console.warn(`sfx ${name}: ${String(e)}`); loading = false; });
    }
    return;
  }
  if (loading) return;
  if (!loopClip) {
    if (!renderLoop(6000)) return;
    try { loopClip = createClip([loop], RATE); } catch (e) { console.warn(`audio: ${String(e)}`); rendered = 0; }
    return;
  }
  if (!loopVoice) {
    try { loopVoice = playClip(loopClip, { bus: "music", loop: true, gain: 0 }); } catch { loopVoice = null; }
    return;
  }
  try { loopVoice.fade(suspended ? 0 : 1, 0.15); } catch { /* the mixer restarted */ }
}
