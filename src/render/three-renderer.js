'use strict';

// Three.js renderer: neon geometric world, deterministic visuals, quality
// tiers, reduced-motion support. Consumes immutable rules snapshots plus an
// interpolation alpha; never mutates game state.

import * as THREE from 'three';
import { FORM_NOVA, GROUND_Y, PLAYER_RADIUS } from '../core/constants.js';

const CAM_BACK = 6, CAM_UP = 4.2, CAM_SIDE = 8.5, LOOK_AHEAD = 7, LOOK_UP = 1.4;

const THEME_PALETTES = {
  'neon-grid': { bg: 0x060913, fog: 0x0a1226, grid: 0x1c3a6e, ground: 0x0a1020, accent: 0x22d3ee },
  'sunset-wire': { bg: 0x140812, fog: 0x22102a, grid: 0x6e2c5a, ground: 0x180a18, accent: 0xfb7185 },
  'void-pulse': { bg: 0x030308, fog: 0x0c0a1c, grid: 0x3a2c8e, ground: 0x080612, accent: 0xa78bfa },
  'mono-chrome': { bg: 0x0a0a0c, fog: 0x141418, grid: 0x4a4a55, ground: 0x0e0e12, accent: 0xe5e7eb },
  'aurora': { bg: 0x04120e, fog: 0x0a2018, grid: 0x1c6e52, ground: 0x081410, accent: 0x34d399 },
};

const QUALITY = {
  high: { dpr: 2, shadows: true, particles: 240 },
  medium: { dpr: 1.5, shadows: false, particles: 90 },
  low: { dpr: 1, shadows: false, particles: 0 },
};

let renderer = null;
let scene = null;
let camera = null;
let canvas = null;
let quality = QUALITY.high;
let reducedMotion = false;

let playerMesh = null, playerRing = null, playerLight = null;
let groundPlane = null, grid = null, ambient = null, keyLight = null;
let levelGroup = null;
let pulseRings = [];
let particles = null;
let checkpointRings = [];
let currentTheme = 'neon-grid';
let shake = 0;

export function isWebGLAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (_) { return false; }
}

export function mount(canvasRef) {
  canvas = canvasRef;
  if (!isWebGLAvailable()) return false;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 300);

  ambient = new THREE.AmbientLight(0x334466, 0.9);
  scene.add(ambient);
  keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  keyLight.position.set(6, 12, 8);
  scene.add(keyLight);

  // Player: emissive sphere + gyro ring (form cues are color AND shape).
  const geo = new THREE.SphereGeometry(PLAYER_RADIUS, 24, 18);
  playerMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.1,
  }));
  playerRing = new THREE.Mesh(
    new THREE.TorusGeometry(PLAYER_RADIUS * 1.5, 0.06, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
  playerRing.rotation.x = Math.PI / 2.5;
  playerMesh.add(playerRing);
  playerLight = new THREE.PointLight(0x22d3ee, 12, 12);
  playerMesh.add(playerLight);
  scene.add(playerMesh);

  resize();
  return true;
}

export function setQuality(tier) {
  quality = QUALITY[tier] || QUALITY.high;
  if (renderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.dpr));
    renderer.shadowMap.enabled = quality.shadows;
    if (keyLight) keyLight.castShadow = quality.shadows;
  }
  resize();
}

export function setReducedMotion(on) { reducedMotion = !!on; }

export function setTheme(name) {
  currentTheme = THEME_PALETTES[name] ? name : 'neon-grid';
  if (!scene) return;
  const p = THEME_PALETTES[currentTheme];
  scene.background = new THREE.Color(p.bg);
  scene.fog = new THREE.Fog(p.fog, 30, 130);
  if (grid) grid.material.color.setHex(p.grid);
  if (groundPlane) groundPlane.material.color.setHex(p.ground);
}

function disposeGroup(group) {
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => m.dispose());
    }
  });
}

// Build (or rebuild) all level-dependent meshes.
export function loadLevel(level) {
  if (!scene) return;
  if (levelGroup) { scene.remove(levelGroup); disposeGroup(levelGroup); }
  levelGroup = new THREE.Group();
  pulseRings = []; checkpointRings = [];
  setTheme(level.theme);
  const p = THEME_PALETTES[currentTheme];

  // Ground strip + grid.
  const L = level.length + 60;
  groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(L, 24),
    new THREE.MeshStandardMaterial({ color: p.ground, roughness: 0.9, metalness: 0 }));
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.set(level.length / 2, GROUND_Y, 0);
  groundPlane.receiveShadow = quality.shadows;
  levelGroup.add(groundPlane);
  grid = new THREE.GridHelper(L, Math.floor(L / 2), p.grid, p.grid);
  grid.position.set(level.length / 2, GROUND_Y + 0.01, 0);
  grid.material.transparent = true; grid.material.opacity = 0.5;
  levelGroup.add(grid);

  // Obstacles: low = flat wide slab (jump), gate = tall arch (phase through).
  const lowMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.5, roughness: 0.4 });
  const gateMat = new THREE.MeshStandardMaterial({
    color: 0x8b5cf6, emissive: 0x8b5cf6, emissiveIntensity: 0.6,
    roughness: 0.4, transparent: true, opacity: 0.85 });
  for (const o of level.obstacles) {
    if (o.kind === 'low') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 3.2), lowMat);
      m.position.set(o.x, GROUND_Y + 0.75, 0);
      m.castShadow = quality.shadows;
      levelGroup.add(m);
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 0.12, 3.3),
        new THREE.MeshBasicMaterial({ color: 0xfff7ed }));
      cap.position.set(o.x, GROUND_Y + 1.5 + 0.06, 0);
      levelGroup.add(cap);
    } else {
      const arch = new THREE.Group();
      for (const dz of [-1.6, 1.6]) {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 6, 8), gateMat);
        pillar.position.set(o.x, GROUND_Y + 3, dz);
        arch.add(pillar);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 3.8), gateMat);
      bar.position.set(o.x, GROUND_Y + 6.1, 0);
      arch.add(bar);
      const swirl = new THREE.Mesh(
        new THREE.TorusGeometry(1.1, 0.05, 8, 40),
        new THREE.MeshBasicMaterial({ color: 0xd8b4fe, transparent: true, opacity: 0.8 }));
      swirl.position.set(o.x, GROUND_Y + 1.6, 0);
      swirl.rotation.y = Math.PI / 2;
      arch.add(swirl);
      pulseRings.push(swirl);
      levelGroup.add(arch);
    }
  }

  // Gems: spinning octahedrons.
  const gemMat = new THREE.MeshStandardMaterial({
    color: 0xfde047, emissive: 0xfde047, emissiveIntensity: 0.9, roughness: 0.2 });
  for (const g of level.gems) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), gemMat);
    m.position.set(g.x, typeof g.y === 'number' ? g.y : 1.6, 0);
    m.userData.gem = true;
    levelGroup.add(m);
  }

  // Checkpoints: vertical rings that pulse on the beat.
  for (const c of level.checkpoints) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.07, 8, 48),
      new THREE.MeshBasicMaterial({ color: p.accent, transparent: true, opacity: 0.55 }));
    ring.position.set(c, GROUND_Y + 2.4, 0);
    ring.rotation.y = Math.PI / 2;
    levelGroup.add(ring);
    checkpointRings.push(ring);
  }

  // Finish beacon.
  const fin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 10, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff }));
  fin.position.set(level.length, GROUND_Y + 5, 0);
  levelGroup.add(fin);

  // Beat particles (bounded pool, decorative only — never raycast).
  if (quality.particles > 0) {
    const n = quality.particles;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (i / n) * level.length;
      pos[i * 3 + 1] = 0.2 + ((i * 37) % 50) / 10;
      pos[i * 3 + 2] = (((i * 53) % 100) / 100 - 0.5) * 16;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    particles = new THREE.Points(pg, new THREE.PointsMaterial({
      color: p.accent, size: 0.12, transparent: true, opacity: 0.6 }));
    levelGroup.add(particles);
  }

  scene.add(levelGroup);
}

export function triggerShake(amount) {
  if (!reducedMotion) shake = Math.min(shake + amount, 0.5);
}

// Render one frame. `state`/`prev` are immutable snapshots; alpha in [0,1).
export function render(state, prev, alpha, beatPhase) {
  if (!renderer || !scene || !camera) return;
  const px = prev ? prev.x + (state.x - prev.x) * alpha : state.x;
  const py = prev ? prev.y + (state.y - prev.y) * alpha : state.y;

  // Player form: PULSE cyan sphere / NOVA magenta with halo ring enlarged.
  const isNova = state.form === FORM_NOVA;
  playerMesh.material.color.setHex(isNova ? 0xf0abfc : 0x22d3ee);
  playerMesh.material.emissive.setHex(isNova ? 0xd946ef : 0x22d3ee);
  playerLight.color.setHex(isNova ? 0xd946ef : 0x22d3ee);
  playerRing.scale.setScalar(isNova ? 1.5 : 1);
  playerMesh.position.set(px, py, 0);
  playerMesh.rotation.z = -px * 0.8;

  // Beat pulse on rings; suppressed under reduced motion.
  const pulse = reducedMotion ? 0 : Math.max(0, Math.sin(beatPhase * Math.PI * 2)) * 0.25;
  for (const r of checkpointRings) r.scale.setScalar(1 + pulse);
  for (const r of pulseRings) r.rotation.x += reducedMotion ? 0 : 0.02;
  if (particles) particles.material.opacity = 0.4 + pulse;

  // Spin gems near the player only (cheap cull).
  if (levelGroup) {
    for (const child of levelGroup.children) {
      if (child.userData.gem && Math.abs(child.position.x - px) < 40) {
        child.rotation.y += reducedMotion ? 0 : 0.05;
      }
    }
  }

  // Authored, drift-free camera: placed fresh from interpolated position.
  let sx = 0, sy = 0;
  if (shake > 0.001) {
    sx = (Math.random() - 0.5) * shake; sy = (Math.random() - 0.5) * shake;
    shake *= 0.85;
  }
  camera.position.set(px - CAM_BACK + sx, CAM_UP + sy, CAM_SIDE);
  camera.lookAt(px + LOOK_AHEAD, LOOK_UP, 0);

  renderer.render(scene, camera);
}

export function resize() {
  if (!renderer || !camera || !canvas) return;
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  if (w === 0 || h === 0) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.dpr));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

export function unmount() {
  if (levelGroup && scene) { scene.remove(levelGroup); disposeGroup(levelGroup); levelGroup = null; }
  if (renderer) { renderer.dispose(); renderer = null; }
  scene = null; camera = null; canvas = null; playerMesh = null; particles = null;
}
