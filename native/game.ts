// The browser build's pure game modules, imported unchanged (allowJs) and
// typed here with the shapes this client reads: the deterministic rules
// (src/core/rules.js: the run state, the 60 Hz fixed step with jump, form
// change, obstacle, gem, checkpoint and finish handling, scoring), the
// versioned content (src/core/levels.js: 40 Journey stages, the Daily from a
// UTC date, Practice 1–5, the two Challenges, three lessons, the solver), the
// progress model this client stores (src/progress.js, over src/core/save.js's
// migrate and merge).
import * as RulesJs from "../src/core/rules.js";
import * as LevelsJs from "../src/core/levels.js";
import * as ConstJs from "../src/core/constants.js";
import * as ProgressJs from "../src/progress.js";

export interface Obstacle { x: number; kind: "low" | "gate" }
export interface Gem { x: number; y?: number }
export interface Level {
  id: string; version: number; seed: number; speed: number; length: number; theme: string; par: number; mastery: boolean;
  tutorialFlags: { requireJumps: number; requireForms: number; lesson: number } | null;
  obstacles: Obstacle[]; gems: Gem[]; checkpoints: number[];
  challenge?: { kind: "speed"; target: number } | { kind: "move-limit"; maxActions: number };
}
export interface RunState {
  version: number; seed: number; levelId: string; tick: number; phase: "active" | "dead" | "won";
  terminalReason: "hit-gate" | "hit-low" | "finished" | null;
  x: number; y: number; vy: number; grounded: boolean; form: number; speed: number; length: number; attempts: number;
  checkpointsPassed: number; gemsCollected: number; jumpsUsed: number; formsUsed: number; obstacleIndex: number; gemIndex: number; elapsed: number;
}
export interface Score { total: number; checkpoints: number; gems: number; finish: number; penalties: number }
export interface Progress {
  version: number; journeyUnlocked: number; journeyBest: Record<string, number>; dailyBest: Record<string, number>;
  tutorialDone: Record<string, boolean>; achievements: Record<string, boolean>;
}
export interface GameOptions { leftHanded: boolean; timingAssist: boolean }

interface RulesApi {
  createRun(level: Level, attempts?: number): RunState;
  applyCommand(state: RunState, level: Level, type: string): RunState;
  scoreOf(state: RunState): Score;
}
interface LevelsApi {
  journeyLevel(i: number): Level;
  journeyCount(): number;
  dailyLevel(date: string): Level;
  dailySeedFor(date: string): number;
  practiceLevel(d: number): Level;
  challengeLevel(kind: string): Level;
  tutorialLevel(lesson: number): Level;
}
interface ConstApi {
  STEP_SECONDS: number; FORM_PULSE: number; FORM_NOVA: number; GROUND_Y: number; PLAYER_RADIUS: number; CONTENT_VERSION: number;
}
interface ProgressApi {
  blank(): Progress;
  normalize(raw: unknown): Progress;
  merge(a: unknown, b: unknown): Progress;
  same(a: unknown, b: unknown): boolean;
  readForeign(text: string | null | undefined): { progress: Progress; options: Partial<GameOptions> } | null;
  pickOptions(raw: unknown): Partial<GameOptions>;
  OPTION_KEYS: (keyof GameOptions)[];
  isLegacyKey(key: string): boolean;
  dailyStreak(dailyBest: Record<string, number>, today: string): number;
}

export const Rules = RulesJs as unknown as RulesApi;
export const Levels = LevelsJs as unknown as LevelsApi;
export const C = ConstJs as unknown as ConstApi;
export const Progress = ProgressJs as unknown as ProgressApi;
