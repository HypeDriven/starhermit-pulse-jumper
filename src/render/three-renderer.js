'use strict';

// Three.js renderer: neon geometric world, deterministic visuals, graphics
// presets with per-effect overrides (see gfx.js), post-processing, adaptive
// resolution and reduced-motion support. Consumes immutable rules snapshots
// plus an interpolation alpha; never mutates game state.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FORM_NOVA, GROUND_Y, PLAYER_RADIUS } from '../core/constants.js';
import { detectPreset, resolve, describe, SHADOW_MAP, PARTICLE_COUNT } from './gfx.js';

const CAM_BACK = 6, CAM_UP = 4.2, CAM_SIDE = 8.5, LOOK_AHEAD = 7, LOOK_UP = 1.4;
const MAX_PARTICLES = PARTICLE_COUNT.high;
const TRAIL_LEN = 28;

const THEME_PALETTES = {
  'neon-grid': { bg: 0x060913, fog: 0x0a1226, grid: 0x1c3a6e, ground: 0x0a1020, accent: 0x22d3ee, sun: 0xe879c6, sun2: 0xfde047 },
  'sunset-wire': { bg: 0x140812, fog: 0x22102a, grid: 0x6e2c5a, ground: 0x180a18, accent: 0xfb7185, sun: 0xfb923c, sun2: 0xfde047 },
  'void-pulse': { bg: 0x030308, fog: 0x0c0a1c, grid: 0x3a2c8e, ground: 0x080612, accent: 0xa78bfa, sun: 0x8b5cf6, sun2: 0xe879c6 },
  'mono-chrome': { bg: 0x0a0a0c, fog: 0x141418, grid: 0x4a4a55, ground: 0x0e0e12, accent: 0xe5e7eb, sun: 0x9ca3af, sun2: 0xf3f4f6 },
  'aurora': { bg: 0x04120e, fog: 0x0a2018, grid: 0x1c6e52, ground: 0x081410, accent: 0x34d399, sun: 0x22d3ee, sun2: 0xa7f3d0 },
};

// Colour grade + vignette (display-space in/out, after OutputPass tone mapping
// is NOT assumed: it runs on linear HDR before the output transform).
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 1.0 }, uVignette: { value: 0.28 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uAmount; uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb;
      vec3 lc = clamp(c, 0.0, 1.0);
      // Gentle S-curve contrast, richer saturation, cool shadows / warm highlights.
      vec3 s = mix(lc, lc * lc * (3.0 - 2.0 * lc), 0.18);
      float l = dot(s, vec3(0.299, 0.587, 0.114));
      s = mix(vec3(l), s, 1.12);
      s *= mix(vec3(0.95, 0.98, 1.07), vec3(1.03, 1.0, 0.97), smoothstep(0.15, 0.7, l));
      c = mix(c, s + max(c - 1.0, 0.0), uAmount);
      float d = length((vUv - 0.5) * vec2(1.1, 1.0));
      c *= 1.0 - uVignette * smoothstep(0.38, 0.9, d);
      gl_FragColor = vec4(c, src.a);
    }`,
};

// Sky dome: theme gradient, horizon glow, striped synth sun (detail) and
// twinkling procedural stars (animated background).
const SKY_VERT = `
  varying vec3 vDir;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vDir = normalize(w.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * w;
    gl_Position.z = gl_Position.w; // on the far plane
  }`;
const SKY_FRAG = `
  uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uSun; uniform vec3 uSun2;
  uniform float uTime; uniform float uDetail; uniform float uStars;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 0.45, h));
    col += uGlow * exp(-abs(h) * 14.0) * 0.55;
    // Stars above the horizon.
    vec2 sp = vec2(atan(d.z, d.x) * 60.0, h * 90.0);
    vec2 cell = floor(sp);
    float r = hash(cell);
    if (r > 0.985 && h > 0.06) {
      vec2 f = fract(sp) - 0.5;
      float tw = 0.65 + 0.35 * sin(uTime * (1.5 + r * 3.0) + r * 40.0) * uStars;
      col += vec3(0.75, 0.85, 1.0) * smoothstep(0.22, 0.0, length(f)) * tw * smoothstep(0.06, 0.3, h);
    }
    // Striped synth sun low on the horizon ahead of the runner.
    if (uDetail > 0.5) {
      vec3 sd = normalize(vec3(1.0, 0.07, -0.42));
      float a = acos(clamp(dot(d, sd), -1.0, 1.0));
      float disc = smoothstep(0.13, 0.125, a) * smoothstep(0.0, 0.01, d.y);
      float v = (d.y - sd.y) / 0.13; // -1 bottom .. 1 top
      float stripes = step(0.0, v) + step(0.5, fract(v * 7.0 + uTime * 0.15 * uStars));
      vec3 sc = mix(uSun, uSun2, smoothstep(-0.9, 0.9, v));
      col = mix(col, sc * 0.8, disc * clamp(stripes, 0.0, 1.0));
      col += sc * exp(-a * 9.0) * 0.12 * step(0.0, d.y);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

let renderer = null;
let scene = null;
let camera = null;
let canvas = null;
let reducedMotion = false;

// Graphics state.
let gpu = '';
let detected = 'balanced';
let saved = {};
let q = resolve({}, 'balanced');
let composer = null, postKey = null, postFailed = false;
let pixelRatio = 1, size = [0, 0], adaptiveScale = 1;
let frameTimes = [], fps = 0, lastT = 0;
let envTex = null;
let time = 0; // decorative clock (frozen under reduced motion)

let playerMesh = null, playerRing = null, playerLight = null, playerHalo = null;
let groundPlane = null, grid = null, ambient = null, hemi = null, keyLight = null;
let sky = null, trail = null;
let levelGroup = null;
let detailGroup = null; // detail-only decoration (lane strips, skyline, edges)
let pulseRings = [];
let particles = null;
let checkpointRings = [];
let gemMeshes = [];
let lastGemsCollected = 0;
let currentTheme = 'neon-grid';
let shake = 0;
let currentLevel = null;
let assistMarker = null;
let timingAssist = false;
let idleT = 0;
const trailPos = [];

let spriteTex = null, noiseTex = null;

export function isWebGLAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (_) { return false; }
}

function readGpu(gl) {
  try {
    // Firefox exposes the real renderer through RENDERER and warns on the debug extension.
    if (/firefox/i.test(navigator.userAgent)) return String(gl.getParameter(gl.RENDERER) || '');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  } catch (_) { return ''; }
}

function isMobile() {
  try {
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return touch && (coarse || /android|iphone|ipad|mobile/i.test(navigator.userAgent));
  } catch (_) { return false; }
}

function makeSpriteTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Deterministic value noise for the ground's roughness variation.
function makeNoiseTexture() {
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  let s = 1234567;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < n * n; i++) {
    const v = 150 + Math.floor(rnd() * 70);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function mount(canvasRef) {
  canvas = canvasRef;
  if (!isWebGLAvailable()) return false;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.type = THREE.PCFShadowMap; // soft filtering is built into PCF in r185
  gpu = readGpu(renderer.getContext());
  detected = detectPreset(gpu, { mobile: isMobile() });
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 400);
  spriteTex = makeSpriteTexture();
  noiseTex = makeNoiseTexture();

  ambient = new THREE.AmbientLight(0x334466, 0.35);
  scene.add(ambient);
  hemi = new THREE.HemisphereLight(0x6a8cff, 0x0a0614, 0.9);
  scene.add(hemi);
  keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
  keyLight.position.set(6, 12, 8);
  keyLight.shadow.camera.left = -14; keyLight.shadow.camera.right = 14;
  keyLight.shadow.camera.top = 10; keyLight.shadow.camera.bottom = -10;
  keyLight.shadow.camera.near = 1; keyLight.shadow.camera.far = 40;
  keyLight.shadow.bias = -0.0006;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight, keyLight.target);

  sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
      uSun: { value: new THREE.Color() }, uSun2: { value: new THREE.Color() },
      uTime: { value: 0 }, uDetail: { value: 1 }, uStars: { value: 1 },
    },
  }));
  sky.renderOrder = -1;
  sky.userData.noAO = true;
  sky.frustumCulled = false;
  scene.add(sky);

  // Player: glossy emissive sphere + gyro ring (form cues are color AND shape).
  const geo = new THREE.SphereGeometry(PLAYER_RADIUS, 32, 24);
  playerMesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
    color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 0.8, roughness: 0.25, metalness: 0.1,
    clearcoat: 1, clearcoatRoughness: 0.1,
  }));
  playerMesh.castShadow = true;
  playerRing = new THREE.Mesh(
    new THREE.TorusGeometry(PLAYER_RADIUS * 1.5, 0.06, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
  playerRing.rotation.x = Math.PI / 2.5;
  playerMesh.add(playerRing);
  playerLight = new THREE.PointLight(0x22d3ee, 12, 12);
  playerMesh.add(playerLight);
  playerHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: spriteTex, color: 0x22d3ee, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  playerHalo.scale.setScalar(PLAYER_RADIUS * 4);
  playerHalo.userData.noAO = true;
  playerMesh.add(playerHalo);
  scene.add(playerMesh);

  // Motion trail behind the runner (high particles only).
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_LEN * 3), 3));
  tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_LEN * 3), 3));
  trail = new THREE.Points(tg, new THREE.PointsMaterial({
    map: spriteTex, size: 0.55, vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending }));
  trail.frustumCulled = false;
  trail.visible = false;
  scene.add(trail);

  setGraphics(saved);
  return true;
}

// ---------------------------------------------------------------- graphics

function ensureEnv() {
  if (envTex || !renderer) return envTex;
  try {
    const pm = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    envTex = pm.fromScene(room, 0.04).texture;
    room.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    pm.dispose();
  } catch (_) { envTex = null; }
  return envTex;
}

/** Apply saved graphics settings ({ preset, render_scale, adaptive, show_fps, <cat> }). */
export function setGraphics(next) {
  saved = next && typeof next === 'object' ? next : {};
  q = resolve(saved, detected);
  if (canvas) canvas.dataset.gfxPreset = q.preset;
  if (typeof document !== 'undefined') document.body.dataset.gfxPreset = q.preset;
  if (!renderer) return;
  const mapSize = SHADOW_MAP[q.shadows];
  const shadowsWere = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = mapSize > 0;
  keyLight.castShadow = mapSize > 0;
  if (mapSize > 0 && keyLight.shadow.mapSize.x !== mapSize) {
    keyLight.shadow.mapSize.set(mapSize, mapSize);
    if (keyLight.shadow.map) { keyLight.shadow.map.dispose(); keyLight.shadow.map = null; }
  }
  applyDetail();
  applyParticles();
  applyMotion();
  adaptiveScale = 1;
  frameTimes = [];
  postKey = null; // rebuild the post chain on the next frame
  postFailed = false;
  fpsVisible(q.showFps);
  if (shadowsWere !== renderer.shadowMap.enabled) {
    scene.traverse((o) => {
      if (!o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; });
    });
  }
}

function applyDetail() {
  const on = q.detail === 'detailed';
  if (detailGroup) detailGroup.visible = on;
  if (playerHalo) playerHalo.visible = on;
  if (sky) sky.material.uniforms.uDetail.value = on ? 1 : 0;
  if (playerMesh) playerMesh.material.clearcoat = on ? 1 : 0;
  if (groundPlane) {
    const m = groundPlane.material;
    m.roughness = on ? 0.6 : 0.9;
    m.metalness = on ? 0.35 : 0;
    m.roughnessMap = on ? noiseTex : null;
    m.needsUpdate = true;
  }
  applyReflections();
}

// Image-based lighting from a PMREM'd RoomEnvironment. The dark floor takes its
// own, much weaker copy so grazing-angle Fresnel never greys out the course.
function applyReflections() {
  const env = q.reflections === 'on' ? ensureEnv() : null;
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  if (groundPlane) {
    groundPlane.material.envMap = env;
    groundPlane.material.envMapIntensity = 0.05;
    groundPlane.material.needsUpdate = true;
  }
}

function applyParticles() {
  const n = PARTICLE_COUNT[q.particles] || 0;
  if (particles) {
    particles.visible = n > 0;
    particles.geometry.setDrawRange(0, n);
  }
  if (trail) trail.visible = q.particles === 'high';
}

function applyMotion() {
  if (sky) sky.material.uniforms.uStars.value = q.background === 'animated' && !reducedMotion ? 1 : 0;
}

function fpsVisible(on) {
  let el = document.getElementById('fps-meter');
  if (on && !el) {
    el = document.createElement('div');
    el.id = 'fps-meter';
    el.setAttribute('aria-hidden', 'true');
    document.body.append(el);
  }
  if (el) el.hidden = !on;
}

/** What the settings panel shows: GPU, auto choice, resolved tiers, cost and frame rate. */
export function graphicsInfo(t) {
  const w = (canvas && canvas.clientWidth) || size[0];
  const h = (canvas && canvas.clientHeight) || size[1];
  const ratio = targetRatio();
  const px = [Math.round(w * ratio), Math.round(h * ratio)];
  return {
    gpu, detected, resolved: q, pixels: px,
    summary: describe(q, px, t),
    fps: Math.round(fps || 0),
    adaptiveScale: Math.round(adaptiveScale * 100) / 100,
    postFailed,
  };
}

function targetRatio() {
  return Math.min(window.devicePixelRatio || 1, q.dprCap) * q.scale * adaptiveScale;
}

function buildPost(w, h) {
  if (composer) { composer.dispose(); composer = null; }
  if (!q.post || postFailed) return;
  try {
    const pw = Math.max(1, Math.round(w * pixelRatio)), ph = Math.max(1, Math.round(h * pixelRatio));
    const target = new THREE.WebGLRenderTarget(pw, ph, {
      type: THREE.HalfFloatType, samples: q.antialias === 'msaa' ? 4 : 0,
    });
    const c = new EffectComposer(renderer, target);
    c.setPixelRatio(pixelRatio);
    c.setSize(w, h);
    c.addPass(new RenderPass(scene, camera));
    if (q.ao !== 'off') {
      const ao = new GTAOPass(scene, camera, pw, ph);
      ao.output = GTAOPass.OUTPUT.Default;
      // Sky dome and additive glows are not surfaces: keep them out of the AO pass.
      const hide = ao._overrideVisibility.bind(ao);
      ao._overrideVisibility = () => {
        hide();
        scene.traverse((o) => { if (o.userData.noAO && o.visible) { o.visible = false; ao._visibilityCache.push(o); } });
      };
      ao.blendIntensity = 0.75;
      ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.5, thickness: 1.5, scale: 1.0, samples: q.ao === 'high' ? 16 : 8 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: q.ao === 'high' ? 6 : 4, rings: 2, samples: q.ao === 'high' ? 16 : 8 });
      c.addPass(ao);
    }
    if (q.bloom === 'on') {
      // High threshold: only emissive neon and bright highlights bloom.
      c.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.7, 0.45, 0.86));
    }
    if (q.grade === 'on') c.addPass(new ShaderPass(GradeShader));
    c.addPass(new OutputPass());
    if (q.antialias === 'smaa') c.addPass(new SMAAPass(pw, ph));
    if (q.antialias === 'fxaa') {
      const fxaa = new ShaderPass(FXAAShader);
      fxaa.material.uniforms.resolution.value.set(1 / pw, 1 / ph);
      c.addPass(fxaa);
    }
    composer = c;
  } catch (_) {
    // Post-processing is an enhancement: render directly if the chain cannot be built.
    postFailed = true;
    composer = null;
  }
}

// Adaptive resolution: step the render scale down when frames are slow, back up when fast.
function adapt(dt) {
  frameTimes.push(dt);
  if (frameTimes.length < 90) return false;
  const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  frameTimes.length = 0;
  fps = 1000 / avg;
  const el = document.getElementById('fps-meter');
  if (el && !el.hidden) el.textContent = `${Math.round(fps)} fps · ${Math.round(pixelRatio * 100) / 100}×`;
  if (!q.adaptive) return false;
  const before = adaptiveScale;
  if (avg > 26) adaptiveScale = Math.max(0.6, adaptiveScale - 0.1);
  else if (avg < 14 && adaptiveScale < 1) adaptiveScale = Math.min(1, adaptiveScale + 0.05);
  return before !== adaptiveScale;
}

function present() {
  const now = performance.now();
  const dt = lastT ? Math.min(250, now - lastT) : 16;
  lastT = now;
  if (!reducedMotion) time += dt / 1000;
  if (sky) sky.material.uniforms.uTime.value = q.background === 'animated' ? time : 0;
  const rescale = adapt(dt);
  const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
  if (w === 0 || h === 0) return;
  const ratio = targetRatio();
  if (w !== size[0] || h !== size[1] || ratio !== pixelRatio || rescale) {
    size = [w, h];
    pixelRatio = ratio;
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const key = q.post && !postFailed ? [q.ao, q.bloom, q.grade, q.antialias, w, h, pixelRatio].join('|') : 'none';
  if (key !== postKey) { postKey = key; buildPost(w, h); }
  if (composer) {
    try { composer.render(dt / 1000); return; } catch (_) { postFailed = true; composer.dispose(); composer = null; postKey = null; }
  }
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- scene

export function setReducedMotion(on) { reducedMotion = !!on; applyMotion(); }

// Timing assist: show a ground marker at the recommended action point for
// the next obstacle (amber = jump, violet = form change).
export function setTimingAssist(on) { timingAssist = !!on; }

export function setTheme(name) {
  currentTheme = THEME_PALETTES[name] ? name : 'neon-grid';
  if (!scene) return;
  const p = THEME_PALETTES[currentTheme];
  scene.background = new THREE.Color(p.bg);
  scene.fog = new THREE.Fog(p.fog, 30, 150);
  if (grid) grid.material.color.setHex(p.grid);
  if (groundPlane) groundPlane.material.color.setHex(p.ground);
  if (sky) {
    const u = sky.material.uniforms;
    u.uTop.value.setHex(p.bg);
    u.uHorizon.value.setHex(p.fog).multiplyScalar(1.4);
    u.uGlow.value.setHex(p.accent).multiplyScalar(0.35);
    u.uSun.value.setHex(p.sun);
    u.uSun2.value.setHex(p.sun2);
  }
  if (hemi) hemi.color.setHex(p.accent).lerp(new THREE.Color(0x6a8cff), 0.6);
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

// Deterministic per-level hash in [0,1).
function hash01(i, salt) {
  let x = (i * 374761393 + salt * 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

// Build (or rebuild) all level-dependent meshes.
export function loadLevel(level) {
  if (!scene) return;
  currentLevel = level;
  if (levelGroup) { scene.remove(levelGroup); disposeGroup(levelGroup); }
  levelGroup = new THREE.Group();
  detailGroup = new THREE.Group();
  levelGroup.add(detailGroup);
  pulseRings = []; checkpointRings = []; gemMeshes = []; lastGemsCollected = 0;
  trailPos.length = 0;
  setTheme(level.theme);
  const p = THEME_PALETTES[currentTheme];
  const accent = new THREE.Color(p.accent);

  // Ground strip + grid.
  const L = level.length + 60;
  const groundMat = new THREE.MeshStandardMaterial({ color: p.ground, roughness: 0.9, metalness: 0, envMapIntensity: 0.08 });
  groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(L, 24), groundMat);
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.set(level.length / 2, GROUND_Y, 0);
  groundPlane.receiveShadow = true;
  levelGroup.add(groundPlane);
  if (noiseTex) noiseTex.repeat.set(L / 6, 4);
  grid = new THREE.GridHelper(L, Math.floor(L / 2), p.grid, p.grid);
  grid.position.set(level.length / 2, GROUND_Y + 0.01, 0);
  grid.material.transparent = true; grid.material.opacity = 0.5;
  levelGroup.add(grid);

  // Detail: glowing lane edges, distant skyline silhouettes, neon slab edges.
  const laneMat = new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(1.5) });
  for (const z of [-2.3, 2.3]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, 0.1), laneMat);
    strip.position.set(level.length / 2, GROUND_Y + 0.03, z);
    detailGroup.add(strip);
  }
  const towers = Math.max(12, Math.floor((level.length + 160) / 7));
  const tGeo = new THREE.BoxGeometry(1, 1, 1);
  tGeo.translate(0, 0.5, 0);
  const tMesh = new THREE.InstancedMesh(tGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(p.fog).multiplyScalar(0.55) }), towers);
  const capMesh = new THREE.InstancedMesh(tGeo, new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(0.9) }), towers);
  const m4 = new THREE.Matrix4(), qd = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  for (let i = 0; i < towers; i++) {
    const x = -60 + i * 7 + hash01(i, 1) * 5;
    const z = -90 - hash01(i, 2) * 45;
    const wdt = 4 + hash01(i, 3) * 7, hgt = 6 + hash01(i, 4) ** 2 * 24;
    m4.compose(ps.set(x, GROUND_Y, z), qd, sc.set(wdt, hgt, wdt)); tMesh.setMatrixAt(i, m4);
    m4.compose(ps.set(x, GROUND_Y + hgt, z), qd, sc.set(wdt * 1.02, 0.25, wdt * 1.02)); capMesh.setMatrixAt(i, m4);
  }
  detailGroup.add(tMesh, capMesh);

  // Obstacles: low = flat wide slab (jump), gate = tall arch (phase through).
  const lowMat = new THREE.MeshPhysicalMaterial({
    color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.1,
    clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const gateMat = new THREE.MeshPhysicalMaterial({
    color: 0x8b5cf6, emissive: 0x8b5cf6, emissiveIntensity: 0.6,
    roughness: 0.3, clearcoat: 0.6, transparent: true, opacity: 0.85 });
  const capMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff7ed).multiplyScalar(0.8) });
  const edgeSrc = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.2, 1.5, 3.2)).attributes.position.array;
  const edgePos = [];
  for (const o of level.obstacles) {
    if (o.kind === 'low') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 3.2), lowMat);
      m.position.set(o.x, GROUND_Y + 0.75, 0);
      m.castShadow = true; m.receiveShadow = true;
      levelGroup.add(m);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 3.3), capMat);
      cap.position.set(o.x, GROUND_Y + 1.5 + 0.06, 0);
      levelGroup.add(cap);
      for (let i = 0; i < edgeSrc.length; i += 3) {
        edgePos.push(edgeSrc[i] * 1.01 + o.x, edgeSrc[i + 1] * 1.01 + GROUND_Y + 0.75, edgeSrc[i + 2] * 1.01);
      }
    } else {
      const arch = new THREE.Group();
      for (const dz of [-1.6, 1.6]) {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 6, 12), gateMat);
        pillar.position.set(o.x, GROUND_Y + 3, dz);
        pillar.castShadow = true;
        arch.add(pillar);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 3.8), gateMat);
      bar.position.set(o.x, GROUND_Y + 6.1, 0);
      bar.castShadow = true;
      arch.add(bar);
      const swirl = new THREE.Mesh(
        new THREE.TorusGeometry(1.1, 0.05, 8, 48),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd8b4fe).multiplyScalar(1.3), transparent: true, opacity: 0.85 }));
      swirl.position.set(o.x, GROUND_Y + 1.6, 0);
      swirl.rotation.y = Math.PI / 2;
      arch.add(swirl);
      pulseRings.push(swirl);
      levelGroup.add(arch);
    }
  }
  if (edgePos.length) {
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.Float32BufferAttribute(edgePos, 3));
    detailGroup.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: new THREE.Color(0xffc56b).multiplyScalar(1.8) })));
  }

  // Gems: spinning, gently bobbing octahedrons.
  const gemMat = new THREE.MeshPhysicalMaterial({
    color: 0xfde047, emissive: 0xfde047, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.2,
    clearcoat: 1, clearcoatRoughness: 0.05 });
  for (const g of level.gems) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), gemMat);
    const y = typeof g.y === 'number' ? g.y : 1.6;
    m.position.set(g.x, y, 0);
    m.userData.gem = true;
    m.userData.baseY = y;
    m.castShadow = true;
    levelGroup.add(m);
    gemMeshes.push(m);
  }

  // Checkpoints: vertical rings that pulse on the beat.
  for (const c of level.checkpoints) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.07, 8, 64),
      new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(1.2), transparent: true, opacity: 0.6 }));
    ring.position.set(c, GROUND_Y + 2.4, 0);
    ring.rotation.y = Math.PI / 2;
    levelGroup.add(ring);
    checkpointRings.push(ring);
  }

  // Finish beacon.
  const fin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(1.6) }));
  fin.position.set(level.length, GROUND_Y + 5, 0);
  levelGroup.add(fin);
  const finGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 10, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
  finGlow.position.copy(fin.position);
  finGlow.userData.noAO = true;
  detailGroup.add(finGlow);

  // Timing-assist landing marker (visibility driven per frame in render()).
  assistMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.35, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  assistMarker.rotation.x = -Math.PI / 2;
  assistMarker.position.y = GROUND_Y + 0.02;
  assistMarker.visible = false;
  levelGroup.add(assistMarker);

  // Beat particles (bounded pool sized for the top tier; the draw range
  // follows the particle setting). Decorative only — never raycast.
  const n = MAX_PARTICLES;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = hash01(i, 7) * level.length;
    pos[i * 3 + 1] = 0.2 + ((i * 37) % 50) / 10;
    pos[i * 3 + 2] = (((i * 53) % 100) / 100 - 0.5) * 16;
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  particles = new THREE.Points(pg, new THREE.PointsMaterial({
    color: p.accent, size: 0.3, map: spriteTex, transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  levelGroup.add(particles);

  scene.add(levelGroup);
  applyDetail();
  applyParticles();
}

// Hide the gem the player just picked up (the nearest still-visible one).
function consumeGems(count, px, py) {
  for (let i = 0; i < count; i++) {
    let best = null, bestD = Infinity;
    for (const m of gemMeshes) {
      if (!m.visible) continue;
      const dx = m.position.x - px, dy = m.userData.baseY - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = m; }
    }
    if (!best) return;
    best.visible = false;
  }
}

export function triggerShake(amount) {
  if (!reducedMotion) shake = Math.min(shake + amount, 0.5);
}

function updateTrail(px, py, nova) {
  if (!trail || !trail.visible) return;
  trailPos.unshift(px, py);
  if (trailPos.length > TRAIL_LEN * 2) trailPos.length = TRAIL_LEN * 2;
  const pa = trail.geometry.attributes.position, ca = trail.geometry.attributes.color;
  const c = new THREE.Color(nova ? 0xd946ef : 0x22d3ee);
  const count = trailPos.length / 2;
  for (let i = 0; i < TRAIL_LEN; i++) {
    const k = Math.min(i, count - 1);
    const f = i < count ? (1 - i / TRAIL_LEN) ** 2 * 0.8 : 0;
    pa.setXYZ(i, trailPos[k * 2] - 0.05 * i, trailPos[k * 2 + 1], 0);
    ca.setXYZ(i, c.r * f, c.g * f, c.b * f);
  }
  pa.needsUpdate = true; ca.needsUpdate = true;
}

// Place the player/camera/effects and draw one frame.
function drawWorld(px, py, nova, beatPhase, active) {
  playerMesh.material.color.setHex(nova ? 0xf0abfc : 0x22d3ee);
  playerMesh.material.emissive.setHex(nova ? 0xd946ef : 0x22d3ee);
  playerLight.color.setHex(nova ? 0xd946ef : 0x22d3ee);
  playerHalo.material.color.setHex(nova ? 0xd946ef : 0x22d3ee);
  playerRing.scale.setScalar(nova ? 1.5 : 1);
  playerMesh.position.set(px, py, 0);
  playerMesh.rotation.z = -px * 0.8;

  // Beat pulse on rings; suppressed under reduced motion.
  const pulse = reducedMotion ? 0 : Math.max(0, Math.sin(beatPhase * Math.PI * 2)) * 0.25;
  for (const r of checkpointRings) r.scale.setScalar(1 + pulse);
  for (const r of pulseRings) r.rotation.x += reducedMotion ? 0 : 0.02;
  if (particles) {
    particles.material.opacity = 0.4 + pulse;
    particles.position.y = reducedMotion ? 0 : Math.sin(time * 0.6) * 0.25;
  }
  playerHalo.material.opacity = 0.3 + pulse * 0.5;

  // Spin and bob gems near the player only (cheap cull).
  if (!reducedMotion) {
    for (const g of gemMeshes) {
      if (Math.abs(g.position.x - px) < 40) {
        g.rotation.y += 0.05;
        g.position.y = g.userData.baseY + Math.sin(time * 2.4 + g.position.x) * 0.08;
      }
    }
  }
  updateTrail(px, py, nova);

  // Shadow box fitted to the play area around the runner, snapped to texels.
  if (keyLight.castShadow) {
    const texel = 28 / keyLight.shadow.mapSize.x;
    const cx = Math.round((px + 5) / texel) * texel;
    keyLight.target.position.set(cx, 0, 0);
    keyLight.position.set(cx + 6, 14, 8);
  }

  // Authored, drift-free camera: placed fresh from interpolated position.
  let sx = 0, sy = 0;
  if (active && shake > 0.001) {
    sx = (Math.random() - 0.5) * shake; sy = (Math.random() - 0.5) * shake;
    shake *= 0.85;
  }
  // Narrow (portrait) frames: the authored side view would push the player
  // off the left edge, so the camera slides forward less, sits farther out
  // and looks less far ahead — player and next slabs stay inside the frame.
  const w = canvas.clientWidth || 16, h = canvas.clientHeight || 9;
  const aspect = w / h || 1.6;
  const k = Math.min(1, Math.max(0, (aspect - 0.55) / (1.3 - 0.55))); // 0 portrait → 1 wide
  const back = CAM_BACK * (0.15 + 0.85 * k);
  const side = CAM_SIDE * (2.4 - 1.4 * k);
  const ahead = LOOK_AHEAD * (0.6 + 0.4 * k);
  const up = CAM_UP * (1.3 - 0.3 * k);
  camera.position.set(px - back + sx, up + sy, side);
  camera.lookAt(px + ahead, LOOK_UP, 0);
  sky.position.copy(camera.position);

  present();
}

// Render one frame. `state`/`prev` are immutable snapshots; alpha in [0,1).
export function render(state, prev, alpha, beatPhase) {
  if (!renderer || !scene || !camera) return;
  const px = prev ? prev.x + (state.x - prev.x) * alpha : state.x;
  const py = prev ? prev.y + (state.y - prev.y) * alpha : state.y;

  // Collected gems leave the world so the pickup reads visually.
  if (state.gemsCollected > lastGemsCollected) {
    consumeGems(state.gemsCollected - lastGemsCollected, px, py);
  } else if (state.gemsCollected < lastGemsCollected) {
    for (const m of gemMeshes) m.visible = true; // run restarted on the same level
  }
  lastGemsCollected = state.gemsCollected;

  // Timing assist: ring on the ground at the recommended action point for
  // the next obstacle (same lead the offline solver jumps on).
  if (assistMarker) {
    const next = (timingAssist && state.phase === 'active' && currentLevel)
      ? currentLevel.obstacles[state.obstacleIndex] : null;
    if (next && next.x > state.x + 0.5) {
      const lead = next.kind === 'low' ? state.speed * 0.37 : state.speed * 0.5;
      assistMarker.visible = true;
      assistMarker.position.set(Math.max(state.x + 1, next.x - lead), GROUND_Y + 0.02, 0);
      assistMarker.material.color.setHex(next.kind === 'low' ? 0xf59e0b : 0x8b5cf6);
    } else {
      assistMarker.visible = false;
    }
  }

  drawWorld(px, py, state.form === FORM_NOVA, beatPhase, true);
}

// Title backdrop: the runner drifts above the course (static under reduced motion).
export function renderIdle(beatPhase) {
  if (!renderer || !scene || !camera || !currentLevel) return;
  if (!reducedMotion) idleT += 1 / 60;
  if (assistMarker) assistMarker.visible = false;
  const span = Math.max(20, currentLevel.length - 20);
  const px = 6 + ((idleT * 5) % span);
  const py = 2.4 + (reducedMotion ? 0 : Math.sin(idleT * 2) * 0.25);
  drawWorld(px, py, false, beatPhase || 0, false);
}

export function resize() {
  if (!renderer || !camera || !canvas) return;
  size = [0, 0]; // present() re-measures and rebuilds targets on the next frame
}

export function unmount() {
  if (levelGroup && scene) { scene.remove(levelGroup); disposeGroup(levelGroup); levelGroup = null; }
  if (composer) { composer.dispose(); composer = null; }
  if (renderer) { renderer.dispose(); renderer = null; }
  scene = null; camera = null; canvas = null; playerMesh = null; particles = null;
}

// Read-only introspection for automated tests (no gameplay effect).
export function debugState() {
  return {
    timingAssist, assistVisible: !!(assistMarker && assistMarker.visible),
    preset: q.preset, post: !!composer, postFailed, shadows: !!(renderer && renderer.shadowMap.enabled),
    pixelRatio,
  };
}
