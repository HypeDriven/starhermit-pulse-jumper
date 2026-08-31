'use strict';

export const GAME_NAME = 'Pulse Jumper';
export const CONTENT_VERSION = 1;
export const SCHEMA_VERSION = 1;
export const SAVE_VERSION = 1;

// Simulation: fixed step.
export const STEP_SECONDS = 1 / 60;
export const GRAVITY = -30; // m/s^2 (negative is down)
export const JUMP_VELOCITY = 11; // m/s upward on jump (apex ~2.0 m above ground)
export const BASE_SPEED = 10; // m/s forward auto-run
export const MAX_SPEED = 16;

// World: x in meters forward, y up. Ground top surface is y = 0.
export const GROUND_Y = 0;
export const FINISH_MARGIN = 2; // meters past last content

// Player.
export const PLAYER_RADIUS = 0.5;
export const START_X = 0;

// Obstacles.
export const OBSTACLE_HALF_WIDTH = 0.6;
export const LOW_HEIGHT = 1.5; // cleared by jumping (apex ~1.67 m)
export const GATE_HEIGHT = 6; // impassable by jump; phase through in NOVA form
export const GEM_RADIUS = 0.9; // collect distance
export const GEM_Y = 1.6;

// Forms.
export const FORM_PULSE = 1; // cyan
export const FORM_NOVA = 2; // magenta, phases through gates

// Score.
export const SCORE_PER_CHECKPOINT = 50;
export const SCORE_PER_GEM = 25;
export const SCORE_FINISH_BONUS = 500;
export const SCORE_ATTEMPT_PENALTY = 10;
export const MAX_ATTEMPT_PENALTY = 100;

// Replay.
export const HASH_INTERVAL_TICKS = 60;
