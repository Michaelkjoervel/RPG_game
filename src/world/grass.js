// ============================================================================
// world/grass.js — instanced, wind-swept grass around the player (visual v2).
//
//   createGrass(zone, world) -> { mesh, update(dt), dispose(), stats() } | null
//
// One InstancedBufferGeometry, one draw call. The field is a set of fixed-size
// chunk SLOTS (a slice of the instance buffers each) around a camera-biased
// center; as the player moves, chunks that fall out of range are recycled for
// the chunks coming into range (queued nearest-first, filled within a small
// per-frame time budget, uploaded with partial buffer updates) — never a
// per-frame rebuild. Blades shrink toward the field edge, so it has no rim.
//
// The terrain's own GLSL ground function (terrain.js GROUND_GLSL, same
// uniforms, same mask texture) runs in the blade vertex shader: each root is
// exactly the ground color under it, tips go lighter/warmer. Blades also
// collapse wherever that function says "no grass" (paths, sand, rock, snow),
// so they can never disagree with the painted ground. CPU placement skips
// paths, water, steep slopes, prop/NPC collider footprints and building floors.
//
// Density follows settings.quality (≤60k blades high / 25k med / 8k low) and
// rebuilds on 'settings:changed'. Cave/spire biomes get no grass.
// ============================================================================
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';
import { seededRandom, hashStr } from '../core/rng.js';

const CS = 6;                 // chunk size, meters
const REFRESH = CS * 0.25;    // chunk-set recenter step (keeps the keep-margin small)

const TIERS = {
  high: { budget: 60000, radius: 28, segs: 3, widthMul: 1.0 },
  med: { budget: 25000, radius: 20, segs: 3, widthMul: 1.15 },
  low: { budget: 8000, radius: 13, segs: 2, widthMul: 1.4 },
};

// Per-biome blade character. tipMul/tipAdd turn the root (= ground) color
// into the tip color; windBase = constant lean, gust = traveling-wave strength;
// stalk = share of tall wispy stems; flowers = share of blades with a bloom tip.
const FLOWERS_MEADOW = [0xfff4dc, 0xffd65c, 0xc7a6ff];
const BIOMES = {
  meadow: { density: 1.0, hMin: 0.3, hMax: 0.62, w: 0.085, lean: 0.28, windBase: 0.1, gust: 0.42, clump: 0.5, stalk: 0.05,
    tipMul: [1.2, 1.2, 0.95], tipAdd: [0.035, 0.03, 0.0], glow: null, flowers: 0.018, flowerCols: FLOWERS_MEADOW },
  lake: { density: 0.95, hMin: 0.3, hMax: 0.6, w: 0.085, lean: 0.28, windBase: 0.1, gust: 0.4, clump: 0.5, stalk: 0.05,
    tipMul: [1.2, 1.2, 0.97], tipAdd: [0.035, 0.03, 0.005], glow: null, flowers: 0.014, flowerCols: [0xfff4dc, 0xffd65c, 0xa9c6ff] },
  town: { density: 0.95, hMin: 0.2, hMax: 0.42, w: 0.08, lean: 0.22, windBase: 0.08, gust: 0.35, clump: 0.4, stalk: 0.02,
    tipMul: [1.18, 1.18, 0.95], tipAdd: [0.03, 0.028, 0.0], glow: null, flowers: 0.014, flowerCols: [0xfff4dc, 0xffd65c, 0xff9fbe] },
  forest: { density: 0.8, hMin: 0.26, hMax: 0.55, w: 0.13, lean: 0.55, windBase: 0.05, gust: 0.22, clump: 0.65, stalk: 0.02,
    tipMul: [1.1, 1.16, 0.98], tipAdd: [0.0, 0.012, 0.0], glow: null, flowers: 0.006, flowerCols: [0xf6f2ff, 0xf6f2ff, 0xd9ccff],
    ferns: 0.012, fernCol: 0x6f9a4a },
  glade: { density: 0.9, hMin: 0.28, hMax: 0.58, w: 0.08, lean: 0.3, windBase: 0.08, gust: 0.3, clump: 0.55, stalk: 0.04,
    tipMul: [1.05, 1.2, 1.2], tipAdd: [0.0, 0.02, 0.035], glow: [0.1, 0.42, 0.5], flowers: 0.007, flowerGlow: 0.6, flowerCols: [0xbff2ff, 0xe8c8ff, 0xfff0b0] },
  mountain: { density: 0.7, hMin: 0.24, hMax: 0.52, w: 0.065, lean: 0.2, windBase: 0.42, gust: 0.5, clump: 0.85, stalk: 0.05,
    tipMul: [1.55, 1.4, 0.95], tipAdd: [0.1, 0.075, 0.02], glow: null, flowers: 0.008, flowerCols: [0xfdfcf4, 0xfdfcf4, 0xffe98a] },
  ruins: { density: 0.55, hMin: 0.2, hMax: 0.42, w: 0.085, lean: 0.3, windBase: 0.1, gust: 0.35, clump: 0.6, stalk: 0.03,
    tipMul: [1.18, 1.18, 0.95], tipAdd: [0.03, 0.025, 0.0], glow: null, flowers: 0.008, flowerCols: [0xfff4dc, 0xffd65c, 0xfff4dc] },
};

// ---------------------------------------------------------------- cheap JS value noise
function ihash(x, z, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z, s) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = x - x0, fz = z - z0;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = ihash(x0, z0, s), b = ihash(x0 + 1, z0, s), c = ihash(x0, z0 + 1, s), d = ihash(x0 + 1, z0 + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const sstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- blade geometry
// Unit blade: x = side (-1..1), y = t (0..1 along the blade), tip vertex at t=1.
function bladeGeometry(segs) {
  const pos = [];
  for (let k = 0; k < segs; k++) { const t = k / segs; pos.push(-1, t, 0, 1, t, 0); }
  pos.push(0, 1, 0);
  const idx = [];
  for (let k = 0; k < segs - 1; k++) {
    const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, d, a, d, c);
  }
  const top = (segs - 1) * 2;
  idx.push(top, top + 1, segs * 2);
  return { pos: new Float32Array(pos), idx: new Uint16Array(idx), tris: idx.length / 3 };
}

/** Number of CS-chunks whose rect lies within `r` of a center offset (ox,oz) inside a chunk. */
function chunksWithin(r, ox, oz) {
  let n = 0;
  const k = Math.ceil(r / CS) + 1;
  for (let j = -k; j <= k; j++) {
    for (let i = -k; i <= k; i++) {
      const x0 = i * CS, z0 = j * CS;
      const dx = Math.max(x0 - ox, 0, ox - (x0 + CS)), dz = Math.max(z0 - oz, 0, oz - (z0 + CS));
      if (dx * dx + dz * dz < r * r) n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------- shaders
const VERT_PARS = /* glsl */ `
attribute vec4 iRoot;   // x, y, z, yaw
attribute vec4 iShape;  // height, width, lean, ground normal y
uniform float uGTime;
uniform vec4 uGPush;    // playerX, playerZ, radius, strength
uniform vec4 uGWind;    // dirX, dirZ, base lean, gust strength
uniform vec3 uGTipMul;
uniform vec3 uGTipAdd;
uniform vec4 uGFlower;  // x: bloom threshold (hash > x)
uniform vec3 uGFlowerA, uGFlowerB, uGFlowerC;
uniform vec3 uGFernCol;
varying vec3 vBladeCol;
varying float vBladeT;
varying vec3 vBladeW;
varying vec3 vBladeInfo; // x: across-blade side, y: fern frond flag, z: bloom
`;
const VERT_BODY = /* glsl */ `
  float bT = position.y;
  float bSide = position.x;
  vec3 bRoot = iRoot.xyz;
  float bRnd = lfHash(bRoot.xz * 3.71 + 0.37);
  float bRnd2 = lfHash(bRoot.zx * 1.93 + 4.1);
  float bH = iShape.x;
  float bFern = step(iShape.y, 0.0);   // negative width marks a fern frond
  float bW = abs(iShape.y);
  // shrink toward the field edge; collapse wherever the ground says "no grass"
  float bFade = 1.0 - smoothstep(uGField.z, uGField.w, distance(bRoot.xz, uGField.xy));
  float bGrass;
  vec3 bBump;
  vec3 bGround = lfGround(bRoot, vec3(0.0, iShape.w, sqrt(max(0.0, 1.0 - iShape.w * iShape.w))), 0.02, lfMask(bRoot.xz), bGrass, bBump);
  float bVis = bFade * smoothstep(0.12, 0.6, bGrass);
  bH *= bVis;
  bW *= min(1.0, bVis * 3.0);
  // an occasional bloom: wider top, flower-colored
  float bFl = lfHash(bRoot.zx * 2.13 + 9.7);
  // (a distant-field effect: near the camera the real flower props take over)
  float bBloom = step(uGFlower.x, bFl) * smoothstep(4.5, 9.0, distance(bRoot, cameraPosition));
  bW *= 1.0 + bBloom * 0.5 * smoothstep(0.3, 0.6, bT) * (1.0 - step(0.99, bT));
  vec2 bDir = vec2(sin(iRoot.w), cos(iRoot.w));
  vec2 bAcross = vec2(bDir.y, -bDir.x);
  // wind: slow traveling gust waves + per-blade flutter
  float bGust = smoothstep(0.3, 0.85, lfNoise(bRoot.xz * 0.045 - uGWind.xy * (uGTime * 0.6)));
  float bFlut = sin(uGTime * (2.2 + bRnd * 1.7) + bRnd * 6.2832 + dot(bRoot.xz, uGWind.xy) * 0.45);
  vec2 bBend = uGWind.xy * (uGWind.z + bGust * uGWind.w + bFlut * (0.05 + 0.1 * bGust))
             + bDir * iShape.z + bAcross * (bFlut * 0.04);
  // bend away from the player
  vec2 bPd = bRoot.xz - uGPush.xy;
  float bPl = length(bPd) + 1e-4;
  float bPush = 1.0 - smoothstep(uGPush.z * 0.3, uGPush.z, bPl);
  bBend += (bPd / bPl) * (bPush * uGPush.w);
  bH *= 1.0 - bPush * 0.3;
  float bBl = min(length(bBend), 1.6);
  vec3 bPos = bRoot;
  float bProf = mix(1.0 - bT * 0.88, 0.25 + 3.2 * bT * (1.0 - bT), bFern);
  bPos.xz += bAcross * (bSide * 0.5 * bW * bProf);
  bPos.xz += bBend * (bT * bT * bH);
  bPos.y += bH * bT * (1.0 - 0.38 * bBl * bT);
  // soft, mostly-up normals: blades light like the ground they grow from,
  // rounded across their width
  vec3 objectNormal = normalize(vec3(0.0, 1.0, 0.0) + vec3(bDir.x, 0.0, bDir.y) * 0.28
                                + vec3(bAcross.x, 0.0, bAcross.y) * (bSide * 0.35));
  float bHue = bRnd2 * 2.0 - 1.0;
  vec3 bTip = (bGround * uGTipMul + uGTipAdd) * (0.9 + bRnd * 0.2) * vec3(1.0 + bHue * 0.05, 1.0, 1.0 - bHue * 0.07);
  vBladeCol = mix(bGround, bTip, pow(bT, 1.25)) * (1.0 + bGust * 0.1 * bT);
  float bSel = fract(bFl * 61.7);
  vec3 bFc = bSel < 0.34 ? uGFlowerA : (bSel < 0.67 ? uGFlowerB : uGFlowerC);
  vBladeCol = mix(vBladeCol, bFc, bBloom * smoothstep(0.7, 0.92, bT) * (1.0 - bFern)); // just the tip
  vBladeCol = mix(vBladeCol, mix(bGround, uGFernCol * (0.85 + bRnd * 0.3), smoothstep(0.0, 0.6, bT)), bFern);
  vBladeT = bT;
  vBladeInfo = vec3(bSide, bFern, bBloom);
`;
const FRAG_PARS = /* glsl */ `
varying vec3 vBladeCol;
varying float vBladeT;
varying vec3 vBladeW;
varying vec3 vBladeInfo;
uniform vec3 uGGlow;
uniform float uGFlowerGlow;
uniform vec3 uGSunDir;
uniform vec3 uGSunCol;
`;

// ---------------------------------------------------------------- entry point
export function createGrass(zone, world) {
  const ground = world.terrain?.ground;
  if (!ground) return null;
  if (ground.style === 1) return null; // cave / spire: stone floors, no grass
  const B = BIOMES[ground.kind] ?? BIOMES[zone.biome] ?? BIOMES.meadow;
  const half = ground.half;
  const seed = (ground.seed ?? hashStr(zone.id ?? 'zone')) | 0;
  const patches = zone.encounters?.patches ?? [];
  const water = ground.water;
  const field = ground.uniforms.uGField.value;   // shared with the terrain shader
  const fieldK = ground.uniforms.uGFieldK.value;

  // ---------------------------------------------------------- material (kept across tier rebuilds)
  const gu = {
    uGTime: { value: 0 },
    uGPush: { value: new THREE.Vector4(9999, 9999, 1.15, 0.95) },
    uGWind: { value: new THREE.Vector4(0.8, 0.6, B.windBase, B.gust) },
    uGTipMul: { value: new THREE.Vector3(...B.tipMul) },
    uGTipAdd: { value: new THREE.Vector3(...B.tipAdd) },
    uGFlower: { value: new THREE.Vector4(1 - B.flowers, 0, 0, 0) },
    uGFlowerA: { value: new THREE.Color(B.flowerCols[0]) },
    uGFlowerB: { value: new THREE.Color(B.flowerCols[1]) },
    uGFlowerC: { value: new THREE.Color(B.flowerCols[2]) },
    uGGlow: { value: new THREE.Color(...(B.glow ?? [0, 0, 0])) },
    uGFernCol: { value: new THREE.Color(B.fernCol ?? 0x6f9a4a) },
    uGFlowerGlow: { value: B.flowerGlow ?? 0 }, // >~1.1 crosses the High-tier bloom threshold
    uGSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uGSunCol: { value: new THREE.Color(0, 0, 0) },
  };
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.82, metalness: 0, side: THREE.DoubleSide,
  });
  material.defines = { ...ground.defines };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ground.uniforms, gu);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${ground.glsl}\n${VERT_PARS}`)
      .replace('#include <beginnormal_vertex>', VERT_BODY)
      .replace('#include <begin_vertex>', 'vec3 transformed = bPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  vBladeW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <color_fragment>', `diffuseColor.rgb = vBladeCol;
  if (vBladeInfo.y > 0.5) { // leaflet stripes + darker mid-rib on fern fronds
    float bLeaf = abs(fract(vBladeT * 7.0 - abs(vBladeInfo.x) * 0.85) - 0.5);
    diffuseColor.rgb *= (1.0 - 0.28 * smoothstep(0.32, 0.5, bLeaf)) * (1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.18, abs(vBladeInfo.x))));
  }`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
#ifdef DOUBLE_SIDED
  normal *= faceDirection; // undo the back-face flip: both sides share the soft up-normal
  nonPerturbedNormal = normal;
#endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += uGGlow * smoothstep(0.55, 1.0, vBladeT) * (1.0 - vBladeInfo.y) * (1.0 - vBladeInfo.z);
  totalEmissiveRadiance += vBladeCol * (uGFlowerGlow * vBladeInfo.z * smoothstep(0.8, 0.95, vBladeT)); // glade: glowing bloom points
  {
    // backlit translucency: blades glow warm when you look toward the sun
    float bBack = pow(max(dot(normalize(vBladeW - cameraPosition), uGSunDir), 0.0), 4.0);
    totalEmissiveRadiance += vBladeCol * uGSunCol * (bBack * vBladeT * 0.4);
  }`);
  };
  material.customProgramCacheKey = () => `lf-grass-v2-${ground.style}`;

  // ---------------------------------------------------------- chunk bookkeeping (no per-frame allocations)
  const cMin = Math.floor(-half / CS) - 1;
  const nC = Math.ceil(half * 2 / CS) + 3;
  const chunkSlot = new Int32Array(nC * nC).fill(-1);
  const wantStamp = new Int32Array(nC * nC);
  const queue = new Int32Array(nC * nC);
  const queueD = new Float32Array(nC * nC);
  let qLen = 0, qHead = 0, stamp = 1;
  let slotChunk = null, slotFill = null, freeSlots = null, freeTop = 0;
  let centerValid = false, qcx = 0, qcz = 0;   // quantized (chunk-set) center
  let fcx = 0, fcz = 0;                        // smoothed (fade) center

  // ---------------------------------------------------------- per-tier buffers
  let tier, R, keepR, perChunk, maxChunks, grid, order, capacity, bladeTris;
  let geo = null, mesh = null, aRoot = null, aShape = null, rootArr = null, shapeArr = null;
  const holder = new THREE.Group(); // stable object for world.js to add/remove across rebuilds
  holder.name = 'grass';

  function build() {
    tier = TIERS[settings.quality] ?? TIERS.high;
    R = tier.radius;
    keepR = R + REFRESH * 1.5; // chunks kept just beyond the fade radius (no edge pop)
    maxChunks = 0;
    for (const [ox, oz] of [[0, 0], [CS / 2, CS / 2], [CS / 2, 0], [CS * 0.25, CS * 0.75], [CS * 0.9, CS * 0.1]]) {
      maxChunks = Math.max(maxChunks, chunksWithin(keepR, ox, oz));
    }
    maxChunks += 2;
    perChunk = Math.floor(tier.budget / maxChunks);
    capacity = maxChunks * perChunk;
    // oversampled jittered grid, visited in a shuffled order so a chunk that
    // hits its capacity early still spreads its blades evenly
    grid = Math.max(4, Math.min(255, Math.floor(Math.sqrt(perChunk * 1.7))));
    order = new Uint16Array(grid * grid);
    for (let i = 0; i < order.length; i++) order[i] = i;
    const orng = seededRandom(0x9e3779b9);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(orng() * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }

    const blade = bladeGeometry(tier.segs);
    bladeTris = blade.tris;
    geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(blade.pos, 3));
    geo.setIndex(new THREE.BufferAttribute(blade.idx, 1));
    rootArr = new Float32Array(capacity * 4);
    shapeArr = new Float32Array(capacity * 4); // height 0 = hidden until filled
    aRoot = new THREE.InstancedBufferAttribute(rootArr, 4);
    aShape = new THREE.InstancedBufferAttribute(shapeArr, 4);
    aRoot.setUsage(THREE.DynamicDrawUsage);
    aShape.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iRoot', aRoot);
    geo.setAttribute('iShape', aShape);
    geo.instanceCount = capacity;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), half * 2);

    mesh = new THREE.Mesh(geo, material);
    mesh.name = 'grassBlades';
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    holder.add(mesh);

    slotChunk = new Int32Array(maxChunks).fill(-1);
    slotFill = new Int32Array(maxChunks);
    freeSlots = new Int32Array(maxChunks);
    freeTop = 0;
    for (let s = maxChunks - 1; s >= 0; s--) freeSlots[freeTop++] = s;
    chunkSlot.fill(-1);
    qLen = 0; qHead = 0;
    centerValid = false;
  }

  function teardown() {
    if (mesh) holder.remove(mesh);
    geo?.dispose();
    geo = mesh = aRoot = aShape = rootArr = shapeArr = null;
  }

  // ---------------------------------------------------------- placement
  const mS = { edge: 0, cobble: 0, bare: 0, apron: 0 };
  const localCol = new Float32Array(64 * 3); // colliders overlapping the chunk being filled
  const localRect = [];                      // building floors overlapping it (reused)
  const rockNy = 1 - (ground.rockSlope + 0.07); // sparse short grass climbs the earth banks; none on rock
  let rs = 1; // mulberry32 state, reseeded per chunk (no closure allocations per fill)
  const rng = () => {
    rs = (rs + 0x6D2B79F5) | 0;
    let t = Math.imul(rs ^ (rs >>> 15), 1 | rs);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  function fillChunk(slot, ci) {
    const cx = (ci % nC) + cMin, cz = Math.floor(ci / nC) + cMin;
    const x0 = cx * CS, z0 = cz * CS;
    const base = slot * perChunk;
    // gather colliders / building floors overlapping this chunk
    let nCol = 0;
    const cols = world.colliders ?? [];
    for (let i = 0; i < cols.length && nCol < 64; i++) {
      const c = cols[i];
      const r = (c.r ?? 0.5) * 0.95 + 0.08;
      if (c.x + r < x0 || c.x - r > x0 + CS || c.z + r < z0 || c.z - r > z0 + CS) continue;
      localCol[nCol * 3] = c.x; localCol[nCol * 3 + 1] = c.z; localCol[nCol * 3 + 2] = r * r;
      nCol++;
    }
    localRect.length = 0;
    const sp = world.props?.surfacePatches;
    if (sp) for (let i = 0; i < sp.length; i++) {
      const p = sp[i];
      const r = Math.sqrt(p.r2) + 0.3;
      if (p.x + r < x0 || p.x - r > x0 + CS || p.z + r < z0 || p.z - r > z0 + CS) continue;
      localRect.push(p);
    }
    rs = (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ Math.imul(seed, 83492791)) | 0 || 1;
    const cell = CS / grid;
    const G2 = grid * grid;
    const off = Math.floor(rng() * G2);
    let n = 0;
    for (let k = 0; k < G2 && n < perChunk; k++) {
      const ce = order[(k + off) % G2];
      const x = x0 + ((ce % grid) + rng()) * cell, z = z0 + (Math.floor(ce / grid) + rng()) * cell;
      const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng();
      if (x < -half + 0.3 || x > half - 0.3 || z < -half + 0.3 || z > half - 0.3) continue;
      // density: clumps and gaps
      const clumpN = vnoise(x * 0.19, z * 0.19, seed + 11);
      let dens = B.density * (1 - B.clump + B.clump * sstep(0.22, 0.72, clumpN));
      ground.sampleMask(x, z, mS);
      if (mS.edge < 0.12) continue; // path (baked edge incl. wobble)
      dens *= sstep(0.12, 0.8, mS.edge);
      dens *= 1 - 0.65 * sstep(0.25, 0.7, mS.bare);
      if (dens <= 0.02 || r1 > dens) continue;
      const y = ground.surfaceY(x, z);
      if (water) {
        const above = y - water.level;
        const apron = mS.apron * (1 - sstep(0.4, 2.6, above));
        if (apron > 0.24) continue;
        if (above < 0.12 && Math.abs(x - water.cx) < water.half + 0.5 && Math.abs(z - water.cz) < water.half + 0.5) continue;
      }
      if (y > ground.snowLine - 1.2) continue;
      const ny = ground.surfaceNy(x, z);
      if (ny < rockNy) continue;
      let blocked = false;
      for (let q = 0; q < nCol; q++) {
        const dx = x - localCol[q * 3], dz = z - localCol[q * 3 + 1];
        if (dx * dx + dz * dz < localCol[q * 3 + 2]) { blocked = true; break; }
      }
      if (blocked) continue;
      for (let q = 0; q < localRect.length; q++) {
        const p = localRect[q];
        const dx = x - p.x, dz = z - p.z;
        const lx = dx * p.cos - dz * p.sin, lz = dx * p.sin + dz * p.cos;
        if (Math.abs(lx) < p.hx + 0.15 && Math.abs(lz) < p.hz + 0.15) { blocked = true; break; }
      }
      if (blocked) continue;
      // blade shape: tall/short bands, trampled near paths, tall in encounter grass
      const hN = vnoise(x * 0.075, z * 0.075, seed + 29);
      let h = B.hMin + (B.hMax - B.hMin) * (hN * 0.7 + r2 * 0.3);
      let w = B.w * tier.widthMul * (0.8 + r2 * 0.45);
      let lean = B.lean * (0.35 + r1 * 0.9);
      if (r4 < B.stalk) { h *= 1.55 + r3 * 0.5; w *= 0.55; lean *= 0.5; } // wispy stalk
      h *= (0.55 + 0.45 * sstep(0.2, 1.6, mS.edge)) * (1 - 0.4 * mS.bare);
      for (let q = 0; q < patches.length; q++) {
        const P = patches[q];
        const dx = x - P.at[0], dz = z - P.at[1], pr = P.r ?? 6;
        const d2 = dx * dx + dz * dz;
        if (d2 < pr * pr) { h *= 1 + 0.6 * sstep(0, 0.55, 1 - Math.sqrt(d2) / pr); break; }
      }
      if (B.ferns && r4 > 1 - B.ferns && mS.edge > 0.9 && n + 7 <= perChunk
          && vnoise(x * 0.09, z * 0.09, seed + 53) > 0.45) {
        const fronds = 5 + Math.floor(r2 * 3);
        const fh = 0.5 + r1 * 0.35;
        for (let f = 0; f < fronds; f++) {
          const a = r3 * Math.PI * 2 + (f / fronds) * Math.PI * 2 + (rng() - 0.5) * 0.5;
          const of = (base + n) * 4;
          rootArr[of] = x + Math.sin(a) * 0.04; rootArr[of + 1] = y - 0.02; rootArr[of + 2] = z + Math.cos(a) * 0.04;
          rootArr[of + 3] = a;
          shapeArr[of] = fh * (0.85 + rng() * 0.3);
          shapeArr[of + 1] = -(0.17 + r2 * 0.06) * tier.widthMul; // negative = fern frond
          shapeArr[of + 2] = 0.95 + rng() * 0.35;
          shapeArr[of + 3] = ny;
          n++;
        }
        continue;
      }
      const o = (base + n) * 4;
      rootArr[o] = x; rootArr[o + 1] = y - 0.03; rootArr[o + 2] = z; rootArr[o + 3] = r3 * Math.PI * 2;
      shapeArr[o] = h;
      shapeArr[o + 1] = w;
      shapeArr[o + 2] = lean;
      shapeArr[o + 3] = ny;
      n++;
    }
    for (let k = n; k < perChunk; k++) { shapeArr[(base + k) * 4] = 0; shapeArr[(base + k) * 4 + 1] = 0; } // hide unused tail
    slotFill[slot] = n;
    aRoot.addUpdateRange(base * 4, perChunk * 4);
    aShape.addUpdateRange(base * 4, perChunk * 4);
    aRoot.needsUpdate = true;
    aShape.needsUpdate = true;
  }

  // ---------------------------------------------------------- chunk window
  function refreshWanted(px, pz) {
    stamp++;
    const k = Math.ceil(keepR / CS) + 1;
    const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
    qLen = 0; qHead = 0;
    for (let j = pcz - k; j <= pcz + k; j++) {
      const gj = j - cMin;
      if (gj < 0 || gj >= nC) continue;
      for (let i = pcx - k; i <= pcx + k; i++) {
        const gi = i - cMin;
        if (gi < 0 || gi >= nC) continue;
        const x0 = i * CS, z0 = j * CS;
        const dx = Math.max(x0 - px, 0, px - (x0 + CS)), dz = Math.max(z0 - pz, 0, pz - (z0 + CS));
        const d2 = dx * dx + dz * dz;
        if (d2 >= keepR * keepR) continue;
        const ci = gj * nC + gi;
        wantStamp[ci] = stamp;
        if (chunkSlot[ci] < 0) { // nearest-first insertion (the queue is short)
          let q = qLen++;
          while (q > 0 && queueD[q - 1] > d2) { queue[q] = queue[q - 1]; queueD[q] = queueD[q - 1]; q--; }
          queue[q] = ci; queueD[q] = d2;
        }
      }
    }
    for (let s = 0; s < maxChunks; s++) { // release slots whose chunk left the window
      const ci = slotChunk[s];
      if (ci >= 0 && wantStamp[ci] !== stamp) {
        chunkSlot[ci] = -1; slotChunk[s] = -1; slotFill[s] = 0;
        freeSlots[freeTop++] = s;
      }
    }
  }

  function processQueue(budgetMs) {
    if (qHead >= qLen) return;
    const t0 = performance.now();
    while (qHead < qLen && freeTop > 0) {
      const ci = queue[qHead++];
      if (wantStamp[ci] !== stamp || chunkSlot[ci] >= 0) continue;
      const slot = freeSlots[--freeTop];
      slotChunk[slot] = ci;
      chunkSlot[ci] = slot;
      fillChunk(slot, ci);
      if (performance.now() - t0 > budgetMs) break;
    }
  }

  // ---------------------------------------------------------- per frame
  let time = 0;
  const windA = (Math.abs(seed) % 628) / 100;

  function update(dt) {
    if (!mesh) return;
    time += dt;
    gu.uGTime.value = time;
    const p = world.player?.pos;
    if (!p) return;
    // center the field ahead of the player, in the direction the camera looks
    const cam = world.camera;
    let fx = 0, fz = 0;
    if (cam) {
      fx = p.x - cam.position.x; fz = p.z - cam.position.z;
      const l = Math.hypot(fx, fz);
      if (l > 1e-3) { fx /= l; fz /= l; } else { fx = 0; fz = 0; }
    }
    const tx = p.x + fx * R * 0.3, tz = p.z + fz * R * 0.3;
    const jump = !centerValid || Math.abs(tx - fcx) > R * 0.5 || Math.abs(tz - fcz) > R * 0.5;
    if (jump) { fcx = tx; fcz = tz; }
    else { const k = 1 - Math.exp(-4 * dt); fcx += (tx - fcx) * k; fcz += (tz - fcz) * k; }
    if (jump || Math.abs(fcx - qcx) > REFRESH || Math.abs(fcz - qcz) > REFRESH) {
      qcx = fcx; qcz = fcz; centerValid = true;
      refreshWanted(qcx, qcz);
    }
    // zone entry / teleport refills finish at once; otherwise a small per-frame
    // slice (nearest chunks first, so the edge of the field fills in unseen)
    processQueue(jump ? 120 : 1.5);

    field.set(fcx, fcz, R * 0.58, R);
    fieldK.x = 0.14;
    gu.uGPush.value.x = p.x; gu.uGPush.value.y = p.z;
    const wa = windA + Math.sin(time * 0.05) * 0.35;
    gu.uGWind.value.x = Math.cos(wa); gu.uGWind.value.y = Math.sin(wa);
    const sky = world.sky;
    if (sky?.sunDir) gu.uGSunDir.value.copy(sky.sunDir);
    if (sky?.sunLight) {
      gu.uGSunCol.value.copy(sky.sunLight.color).multiplyScalar(Math.min(1.2, sky.sunLight.intensity / 3));
    }
  }

  // ---------------------------------------------------------- quality changes
  const offSettings = bus.on('settings:changed', ({ key } = {}) => {
    if (key !== 'quality') return;
    teardown();
    build();
    material.defines = { ...ground.defines }; // terrain (subscribed first) already switched LF_GROUND_LQ
    material.needsUpdate = true;
  });

  build();

  function dispose() {
    offSettings?.();
    teardown();
    material.dispose();
    fieldK.x = 0;
  }

  function stats() {
    let blades = 0;
    for (let s = 0; s < maxChunks; s++) blades += slotFill[s];
    return {
      tier: settings.quality, radius: R, capacity, perChunk, maxChunks,
      activeChunks: maxChunks - freeTop, bladesPlaced: blades,
      trisPerBlade: bladeTris, trisSubmitted: capacity * bladeTris, drawCalls: 1,
    };
  }

  return { mesh: holder, update, dispose, stats };
}
