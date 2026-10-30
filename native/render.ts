// The neon world on starhermit:scene, as the browser build's
// src/render/three-renderer.js drew it with three.js r185: the sky dome (theme
// gradient, horizon glow, twinkling stars and the striped synth sun; WGSL),
// the dark floor with its grid and, on detailed looks, a roughness-noise map,
// the glowing lane edges, the instanced skyline with lit caps, the amber
// slabs with their caps and neon edges, the violet gate arches with their
// spinning swirls, the bobbing gems, the checkpoint rings pulsing on the
// beat, the finish beacon and its glow, the timing-assist marker, the beat
// particles, and the runner — a glossy emissive sphere with its gyro ring,
// point light and halo (cyan PULSE, magenta NOVA with a wider ring) — with
// its motion trail, the chase camera that frames portrait windows too, and
// the death shake.
//
// From three.js r185: punctual light intensities are the page's (engine.minor 23+);
// the sky ShaderMaterial is WGSL;
// the RoomEnvironment reflections are r185's (the renderer's room, moved down
// 3.5 m as r183+ does); the grid is LineSegments as GridHelper builds them; the post chain (GTAOPass, UnrealBloomPass threshold
// 0.86, the grade before the output, FXAA / SMAA / MSAA) is renderer.ao /
// bloom / grade / antialias; the key light's shadow is the
// page's own fitted ortho box, snapped to texels; the floor's noise is a DataTexture with the same stream.
// The 2D fallback for browsers without WebGL is gone (the runtime draws
// wherever it runs). Cosmetic randomness never touches the rules.
import {
  ACESFilmicToneMapping, AdditiveBlending, AmbientLight, BackSide, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color,
  CylinderGeometry, DataTexture, DirectionalLight, DoubleSide, EdgesGeometry, Float32BufferAttribute, Fog, Group, HemisphereLight,
  InstancedMesh, LinearFilter, LinearMipmapLinearFilter, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, MeshPhysicalMaterial, MeshStandardMaterial, OctahedronGeometry, PerspectiveCamera, PlaneGeometry, PMREMGenerator,
  PointLight, Points, PointsMaterial, Quaternion, RepeatWrapping, RingGeometry, RoomEnvironment, ShaderMaterial, SphereGeometry,
  Sprite, SpriteMaterial, SRGBColorSpace, OrthographicCamera, TorusGeometry, Vector3, renderer, scene, type Material, type Object3D, type Texture,
} from "starhermit:scene";
import { OffscreenCanvas } from "starhermit:canvas";
import { C, type Level, type RunState } from "./game.ts";
import { PARTICLE_MAX, TRAIL_MAX, type Look } from "./quality.ts";

const PI = Math.PI;
const { GROUND_Y, PLAYER_RADIUS, FORM_NOVA } = C;
const CAM_BACK = 6, CAM_UP = 4.2, CAM_SIDE = 8.5, LOOK_AHEAD = 7, LOOK_UP = 1.4;

interface Palette { bg: number; fog: number; grid: number; ground: number; accent: number; sun: number; sun2: number }
const THEME_PALETTES: Record<string, Palette> = {
  "neon-grid": { bg: 0x060913, fog: 0x0a1226, grid: 0x1c3a6e, ground: 0x0a1020, accent: 0x22d3ee, sun: 0xe879c6, sun2: 0xfde047 },
  "sunset-wire": { bg: 0x140812, fog: 0x22102a, grid: 0x6e2c5a, ground: 0x180a18, accent: 0xfb7185, sun: 0xfb923c, sun2: 0xfde047 },
  "void-pulse": { bg: 0x030308, fog: 0x0c0a1c, grid: 0x3a2c8e, ground: 0x080612, accent: 0xa78bfa, sun: 0x8b5cf6, sun2: 0xe879c6 },
  "mono-chrome": { bg: 0x0a0a0c, fog: 0x141418, grid: 0x4a4a55, ground: 0x0e0e12, accent: 0xe5e7eb, sun: 0x9ca3af, sun2: 0xf3f4f6 },
  "aurora": { bg: 0x04120e, fog: 0x0a2018, grid: 0x1c6e52, ground: 0x081410, accent: 0x34d399, sun: 0x22d3ee, sun2: 0xa7f3d0 },
};

// -- renderer, camera, lights ----------------------------------------------------------------
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
const camera = new PerspectiveCamera(55, 16 / 9, 0.1, 400);
renderer.camera = camera;
const ambient = new AmbientLight(0x334466, 0.35);
const hemi = new HemisphereLight(0x6a8cff, 0x0a0614, 0.9);
const keyLight = new DirectionalLight(0xffffff, 1.7);
keyLight.position.set(6, 12, 8);
// The browser build's fitted box: 28 × 20 m around the runner, near 1, far 40.
const shadowCam = keyLight.shadow.camera as OrthographicCamera;
shadowCam.left = -14; shadowCam.right = 14; shadowCam.top = 10; shadowCam.bottom = -10;
shadowCam.near = 1; shadowCam.far = 40;
shadowCam.updateProjectionMatrix();
keyLight.shadow.bias = -0.0006;
keyLight.shadow.normalBias = 0.02;
scene.add(ambient, hemi, keyLight, keyLight.target);

// -- textures ----------------------------------------------------------------------------------
function makeSpriteTexture(): Texture {
  const c = new OffscreenCanvas(64, 64);
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
const spriteTex = makeSpriteTexture();
/** The floor's roughness noise: the browser build's LCG stream, as bytes (grey 150–219). */
function makeNoiseTexture(n: number): Texture {
  const data = new Uint8Array(n * n * 4);
  let s = 1234567;
  for (let i = 0; i < n * n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const v = 150 + Math.floor((s / 0x7fffffff) * 70);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const t = new DataTexture(data, n, n);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
let noiseTex: Texture | null = null;
let noiseSize = 0;

// -- the sky dome (WGSL port of SKY_FRAG) ----------------------------------------------------
const SKY_FRAG = /* wgsl */ `
fn pjHash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn fragment(f: Fragment) -> vec4f {
  let d = normalize(f.world - camera_position());
  let h = d.y;
  var col = mix(uniforms.uHorizon, uniforms.uTop, smoothstep(-0.02, 0.45, h));
  col = col + uniforms.uGlow * exp(-abs(h) * 14.0) * 0.55;
  // stars above the horizon
  let sp = vec2f(atan2(d.z, d.x) * 60.0, h * 90.0);
  let cell = floor(sp);
  let r = pjHash(cell);
  if (r > 0.985 && h > 0.06) {
    let q = fract(sp) - 0.5;
    let tw = 0.65 + 0.35 * sin(uniforms.uTime * (1.5 + r * 3.0) + r * 40.0) * uniforms.uStars;
    col = col + vec3f(0.75, 0.85, 1.0) * (1.0 - smoothstep(0.0, 0.22, length(q))) * tw * smoothstep(0.06, 0.3, h);
  }
  // the striped synth sun low on the horizon ahead of the runner
  if (uniforms.uDetail > 0.5) {
    let sd = normalize(vec3f(1.0, 0.07, -0.42));
    let a = acos(clamp(dot(d, sd), -1.0, 1.0));
    let disc = (1.0 - smoothstep(0.125, 0.13, a)) * smoothstep(0.0, 0.01, d.y);
    let v = (d.y - sd.y) / 0.13;
    let stripes = step(0.0, v) + step(0.5, fract(v * 7.0 + uniforms.uTime * 0.15 * uniforms.uStars));
    let sc = mix(uniforms.uSun, uniforms.uSun2, smoothstep(-0.9, 0.9, v));
    col = mix(col, sc * 0.8, disc * clamp(stripes, 0.0, 1.0));
    col = col + sc * exp(-a * 9.0) * 0.12 * step(0.0, d.y);
  }
  return vec4f(col, 1.0);
}`;
const skyU = {
  uTop: { value: new Color() }, uHorizon: { value: new Color() }, uGlow: { value: new Color() },
  uSun: { value: new Color() }, uSun2: { value: new Color() }, uTime: { value: 0 }, uDetail: { value: 1 }, uStars: { value: 1 },
};
const skyMat = new ShaderMaterial({ uniforms: skyU, fragmentShader: SKY_FRAG, side: BackSide, depthWrite: false, depthTest: false, fog: false });
const sky = new Mesh(new SphereGeometry(300, 32, 16), skyMat);
sky.renderOrder = -1;
sky.frustumCulled = false;
sky.noAO = true;
scene.add(sky);

// -- state -------------------------------------------------------------------------------------
let look: Look | null = null;
let reducedMotion = false;
let timingAssist = false;
let time = 0; // decorative clock (frozen under reduced motion)
let shake = 0;
let currentTheme = "neon-grid";
let currentLevel: Level | null = null;
let envTex: Texture | null = null;

let player: Mesh, playerRing: Mesh, playerLight: PointLight, playerHalo: Sprite;
let trail: Points;
let levelGroup: Group | null = null;
let detailGroup: Group | null = null;
let groundPlane: Mesh | null = null;
let grid: LineSegments | null = null;
let pulseRings: Mesh[] = [];
let checkpointRings: Mesh[] = [];
let gemMeshes: Mesh[] = [];
let particles: Points | null = null;
let assistMarker: Mesh | null = null;
let lastGemsCollected = 0;
const trailPos: number[] = [];

const seg = (n: number, min = 3): number => Math.max(min, Math.round(n * (look?.budget.seg ?? 1)));

type Std = MeshLambertMaterial | MeshStandardMaterial | MeshPhysicalMaterial;
interface SurfaceParams {
  color: number; emissive?: number; emissiveIntensity?: number; roughness?: number; metalness?: number;
  clearcoat?: number; clearcoatRoughness?: number; transparent?: boolean; opacity?: number;
}
/** Shading per the budget: Lambert on Low, standard on Balanced, clear-coated physical on High / Ultra (colour, emission and opacity alike on all). */
function surface(p: SurfaceParams): Std {
  const { roughness, metalness, clearcoat, clearcoatRoughness, ...base } = p;
  const tier = look?.budget.material ?? "standard";
  if (tier === "lambert") return new MeshLambertMaterial(base);
  const pbr = { ...base, roughness: roughness ?? 1, metalness: metalness ?? 0 };
  if (tier === "standard" || !clearcoat) return new MeshStandardMaterial(pbr);
  return new MeshPhysicalMaterial({ ...pbr, clearcoat, clearcoatRoughness: clearcoatRoughness ?? 0 });
}

// -- the runner ----------------------------------------------------------------------------------
function playerMaterial(): Std {
  return surface({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 0.8, roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.1 });
}
function buildPlayer(): void {
  if (player) { scene.remove(player); disposeTree(player); }
  player = new Mesh(new SphereGeometry(PLAYER_RADIUS, seg(32, 12), seg(24, 8)), playerMaterial());
  player.castShadow = true;
  playerRing = new Mesh(new TorusGeometry(PLAYER_RADIUS * 1.5, 0.06, seg(8, 4), seg(48, 16)),
    new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
  playerRing.rotation.x = PI / 2.5;
  player.add(playerRing);
  playerLight = new PointLight(0x22d3ee, 12, 12);
  player.add(playerLight);
  playerHalo = new Sprite(new SpriteMaterial({ map: spriteTex, color: 0x22d3ee, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false }));
  playerHalo.scale.setScalar(PLAYER_RADIUS * 4);
  playerHalo.noAO = true;
  player.add(playerHalo);
  scene.add(player);
}
// The motion trail (Particles high): built at the largest budget, the look draws its share.
{
  const tg = new BufferGeometry();
  tg.setAttribute("position", new BufferAttribute(new Float32Array(TRAIL_MAX * 3), 3));
  tg.setAttribute("color", new BufferAttribute(new Float32Array(TRAIL_MAX * 3), 3));
  trail = new Points(tg, new PointsMaterial({ map: spriteTex, size: 0.55, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending }));
  trail.frustumCulled = false;
  trail.visible = false;
  scene.add(trail);
}

function disposeTree(root: Object3D): void {
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.geometry) m.geometry.dispose();
    if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x: Material) => x.dispose());
  });
}

// -- the look ------------------------------------------------------------------------------------
function ensureEnv(): Texture | null {
  if (envTex) return envTex;
  try {
    const room = new RoomEnvironment(renderer);
    room.position.y = -3.5; // three r183+
    envTex = new PMREMGenerator(renderer).fromScene(room, 0.04).texture;
  } catch (e) { console.warn("environment:", e instanceof Error ? e.message : String(e)); envTex = null; }
  return envTex;
}
/** IBL from the room; the dark floor takes its own, much weaker copy so grazing Fresnel never greys out the course. */
function applyReflections(): void {
  const env = look?.reflections ? ensureEnv() : null;
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  const m = groundPlane?.material as MeshStandardMaterial | undefined;
  if (m && "envMapIntensity" in m) {
    m.envMap = env;
    m.envMapIntensity = 0.05;
  }
}
function applyDetail(): void {
  const on = !!look?.detailed;
  if (detailGroup) detailGroup.visible = on;
  if (playerHalo) playerHalo.visible = on;
  skyU.uDetail.value = on ? 1 : 0;
  const pm = player?.material as MeshPhysicalMaterial | undefined;
  if (pm && "clearcoat" in pm) pm.clearcoat = on ? 1 : 0;
  const m = groundPlane?.material as MeshStandardMaterial | undefined;
  if (m && "roughness" in m) {
    m.roughness = on ? 0.6 : 0.9;
    m.metalness = on ? 0.35 : 0;
    m.roughnessMap = on ? noiseTex : null;
  }
  applyReflections();
}
function applyParticles(): void {
  const n = look?.particleCount ?? 0;
  if (particles) {
    particles.visible = n > 0;
    particles.geometry.setDrawRange(0, n);
  }
  trail.visible = look?.particles === "high";
  trail.geometry.setDrawRange(0, Math.min(TRAIL_MAX, look?.budget.trail ?? 0));
}
function applyMotion(): void {
  skyU.uStars.value = look?.animatedSky && !reducedMotion ? 1 : 0;
}
function applyPost(): void {
  if (!look) return;
  renderer.shadowMap.enabled = look.shadows > 0;
  keyLight.castShadow = look.shadows > 0;
  if (look.shadows > 0) keyLight.shadow.mapSize = look.shadows;
  const hi = look.ao === "high";
  renderer.ao = look.ao === "off" ? null : {
    blendIntensity: 0.75, radius: 0.9, distanceExponent: 1.5, thickness: 1.5, scale: 1.0, samples: hi ? 16 : 8, resolution: look.budget.aoRes,
    denoise: { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: hi ? 6 : 4, rings: 2, samples: hi ? 16 : 8 },
  };
  // high threshold: only emissive neon and bright highlights bloom
  renderer.bloom = look.bloom ? { strength: 0.7, radius: 0.45, threshold: 0.86, resolution: look.budget.bloomRes } : null;
  // GradeShader on the linear HDR before the output: a 0.18 S-curve, 1.12 saturation, cool shadows / warm highlights, the 0.28 vignette
  renderer.grade = look.grade ? {
    space: "linear", contrastCurve: "s", contrast: 0.18, saturation: 1.12, shadows: [0.95, 0.98, 1.07], highlights: [1.03, 1.0, 0.97], split: [0.15, 0.7],
    vignette: { amount: 0.28, inner: 0.38, outer: 0.9, scale: [1.1, 1] },
    overRange: "keep", // minor 29: mix(c, s + max(c - 1, 0), amount) as the page's grade
  } : null;
  renderer.antialias = look.antialias;
}

/** A new look (graphics level): effects, then the assets (shading model, segments, texture size) when its budget changed. */
export function applyLook(next: Look): void {
  const prev = look;
  if (prev && JSON.stringify(prev) === JSON.stringify(next)) return;
  look = next;
  if (noiseSize !== next.budget.texture) {
    noiseTex?.dispose();
    noiseTex = makeNoiseTexture(next.budget.texture);
    noiseSize = next.budget.texture;
  }
  applyPost();
  const assets = !prev || prev.budget.material !== next.budget.material || prev.budget.seg !== next.budget.seg || prev.budget.texture !== next.budget.texture;
  if (assets) {
    sky.geometry.dispose();
    sky.geometry = new SphereGeometry(300, seg(32, 12), seg(16, 8));
    buildPlayer();
    if (currentLevel) {
      // rebuild the course with the new assets; collected gems stay collected
      const hidden = gemMeshes.map((m) => !m.visible), collected = lastGemsCollected;
      loadLevel(currentLevel);
      gemMeshes.forEach((m, i) => { if (hidden[i]) m.visible = false; });
      lastGemsCollected = collected;
    }
  }
  applyDetail();
  applyParticles();
  applyMotion();
}
export function setReducedMotion(on: boolean): void { reducedMotion = on; applyMotion(); }
/** Timing assist: a ground marker at the recommended action point for the next obstacle (amber = jump, violet = form change). */
export function setTimingAssist(on: boolean): void { timingAssist = on; }

function setTheme(name: string): void {
  currentTheme = THEME_PALETTES[name] ? name : "neon-grid";
  const p = THEME_PALETTES[currentTheme]!;
  scene.background = new Color(p.bg);
  scene.fog = new Fog(p.fog, 30, 150);
  skyU.uTop.value.setHex(p.bg);
  skyU.uHorizon.value.setHex(p.fog).multiplyScalar(1.4);
  skyU.uGlow.value.setHex(p.accent).multiplyScalar(0.35);
  skyU.uSun.value.setHex(p.sun);
  skyU.uSun2.value.setHex(p.sun2);
  hemi.color.setHex(p.accent).lerp(new Color(0x6a8cff), 0.6);
}

/** Deterministic per-index hash in [0, 1). */
function hash01(i: number, salt: number): number {
  let x = (i * 374761393 + salt * 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

// GridHelper(size, divisions, color, color): a square of one-pixel lines
// centred on its position, as three's GridHelper builds it (the engine clips
// line segments at the near plane since 1.26).
function gridLines(size: number, divisions: number, color: number): LineSegments {
  const half = size / 2, step = size / divisions, pos: number[] = [];
  for (let i = 0, k = -half; i <= divisions; i++, k += step) pos.push(-half, 0, k, half, 0, k, k, 0, -half, k, 0, half);
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return new LineSegments(geo, new LineBasicMaterial({ color, transparent: true, opacity: 0.5 }));
}

/** Builds (or rebuilds) all level-dependent meshes. */
export function loadLevel(level: Level): void {
  currentLevel = level;
  if (levelGroup) { scene.remove(levelGroup); disposeTree(levelGroup); }
  levelGroup = new Group();
  detailGroup = new Group();
  levelGroup.add(detailGroup);
  pulseRings = []; checkpointRings = []; gemMeshes = []; lastGemsCollected = 0;
  trailPos.length = 0;
  setTheme(level.theme);
  const p = THEME_PALETTES[currentTheme]!;
  const accent = new Color(p.accent);

  // the floor strip and its grid
  const L = level.length + 60;
  groundPlane = new Mesh(new PlaneGeometry(L, 24), surface({ color: p.ground, roughness: 0.9, metalness: 0 }));
  groundPlane.rotation.x = -PI / 2;
  groundPlane.position.set(level.length / 2, GROUND_Y, 0);
  groundPlane.receiveShadow = true;
  levelGroup.add(groundPlane);
  if (noiseTex) noiseTex.repeat.set(L / 6, 4);
  grid = gridLines(L, Math.floor(L / 2), p.grid);
  grid.position.set(level.length / 2, GROUND_Y + 0.01, 0);
  levelGroup.add(grid);

  // detail: glowing lane edges, distant skyline silhouettes, neon slab edges
  const laneMat = new MeshBasicMaterial({ color: accent.clone().multiplyScalar(1.5) });
  for (const z of [-2.3, 2.3]) {
    const strip = new Mesh(new BoxGeometry(L, 0.05, 0.1), laneMat);
    strip.position.set(level.length / 2, GROUND_Y + 0.03, z);
    detailGroup.add(strip);
  }
  const towers = Math.max(12, Math.floor((level.length + 160) / 7));
  const tGeo = new BoxGeometry(1, 1, 1);
  tGeo.translate(0, 0.5, 0);
  const tMesh = new InstancedMesh(tGeo, new MeshBasicMaterial({ color: new Color(p.fog).multiplyScalar(0.55) }), towers);
  const capMesh = new InstancedMesh(tGeo, new MeshBasicMaterial({ color: accent.clone().multiplyScalar(0.9) }), towers);
  const m4 = new Matrix4(), qd = new Quaternion(), sc = new Vector3(), ps = new Vector3();
  for (let i = 0; i < towers; i++) {
    const x = -60 + i * 7 + hash01(i, 1) * 5;
    const z = -90 - hash01(i, 2) * 45;
    const wdt = 4 + hash01(i, 3) * 7, hgt = 6 + hash01(i, 4) ** 2 * 24;
    m4.compose(ps.set(x, GROUND_Y, z), qd, sc.set(wdt, hgt, wdt)); tMesh.setMatrixAt(i, m4);
    m4.compose(ps.set(x, GROUND_Y + hgt, z), qd, sc.set(wdt * 1.02, 0.25, wdt * 1.02)); capMesh.setMatrixAt(i, m4);
  }
  detailGroup.add(tMesh, capMesh);

  // obstacles: low = a flat wide slab (jump), gate = a tall arch (phase through)
  const lowMat = surface({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const gateMat = surface({ color: 0x8b5cf6, emissive: 0x8b5cf6, emissiveIntensity: 0.6, roughness: 0.3, clearcoat: 0.6, transparent: true, opacity: 0.85 });
  const capMat = new MeshBasicMaterial({ color: new Color(0xfff7ed).multiplyScalar(0.8) });
  const edgeSrc = (new EdgesGeometry(new BoxGeometry(1.2, 1.5, 3.2)).getAttribute("position") as BufferAttribute).array as Float32Array;
  const edgePos: number[] = [];
  const swirlMat = new MeshBasicMaterial({ color: new Color(0xd8b4fe).multiplyScalar(1.3), transparent: true, opacity: 0.85 });
  for (const o of level.obstacles) {
    if (o.kind === "low") {
      const m = new Mesh(new BoxGeometry(1.2, 1.5, 3.2), lowMat);
      m.position.set(o.x, GROUND_Y + 0.75, 0);
      m.castShadow = true; m.receiveShadow = true;
      levelGroup.add(m);
      const cap = new Mesh(new BoxGeometry(1.3, 0.12, 3.3), capMat);
      cap.position.set(o.x, GROUND_Y + 1.5 + 0.06, 0);
      levelGroup.add(cap);
      for (let i = 0; i < edgeSrc.length; i += 3) edgePos.push(edgeSrc[i]! * 1.01 + o.x, edgeSrc[i + 1]! * 1.01 + GROUND_Y + 0.75, edgeSrc[i + 2]! * 1.01);
    } else {
      const arch = new Group();
      for (const dz of [-1.6, 1.6]) {
        const pillar = new Mesh(new CylinderGeometry(0.28, 0.4, 6, seg(12, 6)), gateMat);
        pillar.position.set(o.x, GROUND_Y + 3, dz);
        pillar.castShadow = true;
        arch.add(pillar);
      }
      const bar = new Mesh(new BoxGeometry(0.6, 0.5, 3.8), gateMat);
      bar.position.set(o.x, GROUND_Y + 6.1, 0);
      bar.castShadow = true;
      arch.add(bar);
      const swirl = new Mesh(new TorusGeometry(1.1, 0.05, seg(8, 4), seg(48, 16)), swirlMat);
      swirl.position.set(o.x, GROUND_Y + 1.6, 0);
      swirl.rotation.y = PI / 2;
      arch.add(swirl);
      pulseRings.push(swirl);
      levelGroup.add(arch);
    }
  }
  if (edgePos.length) {
    const eg = new BufferGeometry();
    eg.setAttribute("position", new Float32BufferAttribute(edgePos, 3));
    detailGroup.add(new LineSegments(eg, new LineBasicMaterial({ color: new Color(0xffc56b).multiplyScalar(1.8) })));
  }

  // gems: spinning, gently bobbing octahedrons
  const gemMat = surface({ color: 0xfde047, emissive: 0xfde047, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
  const gemGeo = new OctahedronGeometry(0.32);
  for (const g of level.gems) {
    const m = new Mesh(gemGeo, gemMat);
    const y = typeof g.y === "number" ? g.y : 1.6;
    m.position.set(g.x, y, 0);
    m.userData.baseY = y;
    m.castShadow = true;
    levelGroup.add(m);
    gemMeshes.push(m);
  }

  // checkpoints: vertical rings that pulse on the beat
  for (const c of level.checkpoints) {
    const ring = new Mesh(new TorusGeometry(2.2, 0.07, seg(8, 4), seg(64, 24)),
      new MeshBasicMaterial({ color: accent.clone().multiplyScalar(1.2), transparent: true, opacity: 0.6 }));
    ring.position.set(c, GROUND_Y + 2.4, 0);
    ring.rotation.y = PI / 2;
    levelGroup.add(ring);
    checkpointRings.push(ring);
  }

  // the finish beacon
  const fin = new Mesh(new CylinderGeometry(0.15, 0.15, 10, 8), new MeshBasicMaterial({ color: new Color(0xffffff).multiplyScalar(1.6) }));
  fin.position.set(level.length, GROUND_Y + 5, 0);
  levelGroup.add(fin);
  const finGlow = new Mesh(new CylinderGeometry(0.6, 0.6, 10, seg(16, 8), 1, true),
    new MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false }));
  finGlow.position.copy(fin.position);
  finGlow.noAO = true;
  detailGroup.add(finGlow);

  // the timing-assist landing marker (shown per frame in update())
  assistMarker = new Mesh(new RingGeometry(0.9, 1.35, seg(32, 16)), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: DoubleSide }));
  assistMarker.rotation.x = -PI / 2;
  assistMarker.position.y = GROUND_Y + 0.02;
  assistMarker.visible = false;
  levelGroup.add(assistMarker);

  // beat particles (a pool for the top tier; the look's count is drawn). Decorative only.
  const pos = new Float32Array(PARTICLE_MAX * 3);
  for (let i = 0; i < PARTICLE_MAX; i++) {
    pos[i * 3] = hash01(i, 7) * level.length;
    pos[i * 3 + 1] = 0.2 + ((i * 37) % 50) / 10;
    pos[i * 3 + 2] = (((i * 53) % 100) / 100 - 0.5) * 16;
  }
  const pg = new BufferGeometry();
  pg.setAttribute("position", new BufferAttribute(pos, 3));
  particles = new Points(pg, new PointsMaterial({ color: p.accent, size: 0.3, map: spriteTex, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false }));
  levelGroup.add(particles);

  scene.add(levelGroup);
  applyDetail();
  applyParticles();
}

/** Hides the gem the runner just picked up (the nearest still-visible one). */
function consumeGems(count: number, px: number, py: number): void {
  for (let i = 0; i < count; i++) {
    let best: Mesh | null = null, bestD = Infinity;
    for (const m of gemMeshes) {
      if (!m.visible) continue;
      const dx = m.position.x - px, dy = (m.userData.baseY as number) - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = m; }
    }
    if (!best) return;
    best.visible = false;
  }
}

export function triggerShake(amount: number): void {
  if (!reducedMotion) shake = Math.min(shake + amount, 0.5);
}

const trailColor = new Color();
function updateTrail(px: number, py: number, nova: boolean): void {
  if (!trail.visible) return;
  trailPos.unshift(px, py);
  if (trailPos.length > TRAIL_MAX * 2) trailPos.length = TRAIL_MAX * 2;
  const pa = trail.geometry.getAttribute("position") as BufferAttribute, ca = trail.geometry.getAttribute("color") as BufferAttribute;
  trailColor.setHex(nova ? 0xd946ef : 0x22d3ee);
  const count = trailPos.length / 2, len = Math.min(TRAIL_MAX, look?.budget.trail ?? 0);
  for (let i = 0; i < len; i++) {
    const k = Math.min(i, count - 1);
    const f = i < count ? (1 - i / len) ** 2 * 0.8 : 0;
    pa.setXYZ(i, trailPos[k * 2]! - 0.05 * i, trailPos[k * 2 + 1]!, 0);
    ca.setXYZ(i, trailColor.r * f, trailColor.g * f, trailColor.b * f);
  }
  pa.needsUpdate = true; ca.needsUpdate = true;
}

/** Places the runner, camera and effects for one frame. */
function drawWorld(px: number, py: number, nova: boolean, beatPhase: number, active: boolean, width: number, height: number): void {
  const pm = player.material as Std;
  pm.color.setHex(nova ? 0xf0abfc : 0x22d3ee);
  pm.emissive.setHex(nova ? 0xd946ef : 0x22d3ee);
  playerLight.color.setHex(nova ? 0xd946ef : 0x22d3ee);
  playerHalo.material.color.setHex(nova ? 0xd946ef : 0x22d3ee);
  playerRing.scale.setScalar(nova ? 1.5 : 1);
  player.position.set(px, py, 0);
  player.rotation.z = -px * 0.8;

  // the beat pulse on rings (none under reduced motion)
  const pulse = reducedMotion ? 0 : Math.max(0, Math.sin(beatPhase * PI * 2)) * 0.25;
  for (const r of checkpointRings) r.scale.setScalar(1 + pulse);
  for (const r of pulseRings) r.rotation.x += reducedMotion ? 0 : 0.02;
  if (particles) {
    (particles.material as PointsMaterial).opacity = 0.4 + pulse;
    particles.position.y = reducedMotion ? 0 : Math.sin(time * 0.6) * 0.25;
  }
  playerHalo.material.opacity = 0.3 + pulse * 0.5;

  // spin and bob the gems near the runner
  if (!reducedMotion) {
    for (const g of gemMeshes) {
      if (Math.abs(g.position.x - px) < 40) {
        g.rotation.y += 0.05;
        g.position.y = (g.userData.baseY as number) + Math.sin(time * 2.4 + g.position.x) * 0.08;
      }
    }
  }
  updateTrail(px, py, nova);

  // the shadow box follows the runner, snapped to texels
  const ms = keyLight.shadow.mapSize;
  const texel = 28 / (typeof ms === "number" ? ms : ms.x);
  const cx = Math.round((px + 5) / texel) * texel;
  keyLight.target.position.set(cx, 0, 0);
  keyLight.position.set(cx + 6, 14, 8);

  // the authored chase camera, placed fresh from the interpolated position
  let sx = 0, sy = 0;
  if (active && shake > 0.001) {
    sx = (Math.random() - 0.5) * shake; sy = (Math.random() - 0.5) * shake;
    shake *= 0.85;
  }
  // narrow (portrait) frames: the camera slides forward less, sits farther out and looks less far ahead
  const aspect = width / height || 1.6;
  const k = Math.min(1, Math.max(0, (aspect - 0.55) / (1.3 - 0.55))); // 0 portrait → 1 wide
  const back = CAM_BACK * (0.15 + 0.85 * k);
  const side = CAM_SIDE * (2.4 - 1.4 * k);
  const ahead = LOOK_AHEAD * (0.6 + 0.4 * k);
  const up = CAM_UP * (1.3 - 0.3 * k);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  camera.position.set(px - back + sx, up + sy, side);
  camera.lookAt(px + ahead, LOOK_UP, 0);
  sky.position.copy(camera.position);
}

/** Advances the decorative clock (frozen under reduced motion). */
export function tick(dt: number): void {
  if (!reducedMotion) time += dt;
  skyU.uTime.value = look?.animatedSky ? time : 0;
}

/** A run frame: `state` / `prev` are rules snapshots, alpha the fraction of the step between them. */
export function drawRun(state: RunState, prev: RunState | null, alpha: number, beatPhase: number, width: number, height: number): void {
  if (!currentLevel) return;
  const px = prev ? prev.x + (state.x - prev.x) * alpha : state.x;
  const py = prev ? prev.y + (state.y - prev.y) * alpha : state.y;
  // collected gems leave the world so the pickup reads
  if (state.gemsCollected > lastGemsCollected) consumeGems(state.gemsCollected - lastGemsCollected, px, py);
  else if (state.gemsCollected < lastGemsCollected) for (const m of gemMeshes) m.visible = true; // restarted on the same level
  lastGemsCollected = state.gemsCollected;
  // timing assist: a ring at the recommended action point for the next obstacle (the solver's lead)
  if (assistMarker) {
    const next = timingAssist && state.phase === "active" ? currentLevel.obstacles[state.obstacleIndex] : undefined;
    if (next && next.x > state.x + 0.5) {
      const lead = next.kind === "low" ? state.speed * 0.37 : state.speed * 0.5;
      assistMarker.visible = true;
      assistMarker.position.set(Math.max(state.x + 1, next.x - lead), GROUND_Y + 0.02, 0);
      (assistMarker.material as MeshBasicMaterial).color.setHex(next.kind === "low" ? 0xf59e0b : 0x8b5cf6);
    } else assistMarker.visible = false;
  }
  drawWorld(px, py, state.form === FORM_NOVA, beatPhase, true, width, height);
}

/** The title backdrop: the runner drifts above the course; idleT in seconds of fixed steps (held under reduced motion). */
export function drawIdle(idleT: number, beatPhase: number, width: number, height: number): void {
  if (!currentLevel) return;
  if (assistMarker) assistMarker.visible = false;
  const span = Math.max(20, currentLevel.length - 20);
  const t = idleT;
  const px = 6 + ((t * 5) % span);
  const py = 2.4 + (reducedMotion ? 0 : Math.sin(t * 2) * 0.25);
  drawWorld(px, py, false, beatPhase, false, width, height);
}
