// Battle arenas — 9 dressed stages (8 unique builds; 'town' aliases to meadow).
// Zero external assets: every shape is procedural geometry + vertex color /
// flat-shaded materials. Each build returns a self-contained stage the
// presentation layer can drop into its scene and tick every frame.
//
// API:
//   ARENA_FOR_BIOME: { biomeId -> arenaKind }
//   buildArena(kind, particles) -> {
//     kind, group,                        // THREE.Group to add to the battle scene
//     marks: { p:{x,y,z,face}, e:{x,y,z,face} },  // creature stand marks (y=0)
//     lights: { key, fill, rim },          // THREE.Light refs (rim may be null)
//     sky: { top, bottom }, fogColor, fogDensity,
//     update(dt, time),
//     dispose(),
//   }
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { settings } from '../core/settings.js';

const RADIUS = 11; // 22u dressed disc

export const ARENA_FOR_BIOME = {
  meadow: 'meadow', forest: 'forest', cave: 'cave', lake: 'lake',
  mountain: 'mountain', ruins: 'ruins', spire: 'spire', glade: 'glade',
  town: 'meadow',
};

// ------------------------------------------------------------ tiny helpers
const TAU = Math.PI * 2;
function hash01(x) { const s = Math.sin(x * 12.9898) * 43758.5453; return s - Math.floor(s); }

/** Collects disposables so every arena's dispose() is one call. */
class Bag {
  constructor() { this.geos = []; this.mats = []; this.lights = []; this.handles = []; }
  geo(g) { this.geos.push(g); return g; }
  mat(m) { this.mats.push(m); return m; }
  light(l) { this.lights.push(l); return l; }
  handle(h) { if (h) this.handles.push(h); return h; }
  dispose(group) {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const l of this.lights) l.dispose?.(); // frees shadow render targets
    for (const h of this.handles) h.stop?.();
    group.traverse((o) => { if (o.isReflector) o.dispose?.(); });
  }
}

function stdMat(bag, color, { rough = 0.85, metal = 0.05, emissive = 0x000000, emissiveIntensity = 1, flat = true, transparent = false, opacity = 1, side = THREE.FrontSide, vertexColors = false } = {}) {
  return bag.mat(new THREE.MeshStandardMaterial({
    color, roughness: rough, metalness: metal, emissive, emissiveIntensity,
    flatShading: flat, transparent, opacity, side, vertexColors,
  }));
}

/** Flat radial-gradient ground disc, vertex colored, subtle painterly hue jitter. */
function groundDisc(bag, centerColor, edgeColor, { segments = 64, rough = 0.95 } = {}) {
  const geo = bag.geo(new THREE.CircleGeometry(RADIUS, segments));
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c0 = new THREE.Color(centerColor), c1 = new THREE.Color(edgeColor), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const t = Math.min(1, Math.hypot(x, z) / RADIUS);
    tmp.copy(c0).lerp(c1, t * t);
    const jitter = 0.94 + hash01(x * 3.1 + z * 7.7) * 0.12;
    colors[i * 3] = tmp.r * jitter; colors[i * 3 + 1] = tmp.g * jitter; colors[i * 3 + 2] = tmp.b * jitter;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, stdMat(bag, 0xffffff, { vertexColors: true, rough }));
  mesh.receiveShadow = true;
  return mesh;
}

/** Big BackSide gradient-dome sky (vertex colored sphere segment). */
function dome(bag, topColor, bottomColor, { radius = 75, horizon = 0.02 } = {}) {
  const geo = bag.geo(new THREE.SphereGeometry(radius, 24, 16, 0, TAU, 0, Math.PI * 0.62));
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(topColor), bot = new THREE.Color(bottomColor), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / radius; // ~0 (horizon) .. 1 (zenith)
    const t = 1 - Math.pow(Math.max(0, Math.min(1, y + horizon)), 0.6);
    tmp.copy(top).lerp(bot, t);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, stdMat(bag, 0xffffff, { vertexColors: true, side: THREE.BackSide, rough: 1, metal: 0 }));
  mesh.frustumCulled = false;
  return mesh;
}

function starsField(bag, count, radius) {
  const geo = bag.geo(new THREE.BufferGeometry());
  const p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const th = Math.random() * TAU, ph = Math.random() * Math.PI * 0.45 + 0.02;
    const r = radius * (0.9 + Math.random() * 0.08);
    p[i * 3] = Math.cos(th) * Math.sin(ph) * r;
    p[i * 3 + 1] = Math.cos(ph) * r;
    p[i * 3 + 2] = Math.sin(th) * Math.sin(ph) * r;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const mat = bag.mat(new THREE.PointsMaterial({ color: 0xfff8dc, size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0.8, depthWrite: false }));
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

/** Ring of an instanced primitive with jitter. placer(i,count) -> {x,z,ry,scale}. */
function ringInstances(bag, geo, mat, count, placer) {
  bag.geo(geo);
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), euler = new THREE.Euler();
  for (let i = 0; i < count; i++) {
    const { x, y = 0, z, ry = 0, scale = 1, tiltX = 0, tiltZ = 0 } = placer(i, count);
    euler.set(tiltX, ry, tiltZ);
    q.setFromEuler(euler);
    s.set(scale, scale, scale);
    m.compose(new THREE.Vector3(x, y, z), q, s);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  return mesh;
}

function ringPlacer(rMin, rMax, jitter = 0.35, scaleRange = [0.85, 1.2]) {
  return (i, count) => {
    const a = (i / count) * TAU + hash01(i * 3.7) * jitter;
    const r = rMin + hash01(i * 9.2 + 1) * (rMax - rMin);
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, ry: hash01(i * 5.1) * TAU, scale: scaleRange[0] + hash01(i * 13.3) * (scaleRange[1] - scaleRange[0]) };
  };
}

function makeLights(bag, { keyColor = 0xfff2d0, keyIntensity = 2.4, fillColor = 0x6f7ae0, fillIntensity = 0.55, rimColor = null, rimIntensity = 1.4, keyPos = [6, 9, -5], shadow = true } = {}) {
  const key = bag.light(new THREE.DirectionalLight(keyColor, keyIntensity));
  key.position.set(...keyPos);
  key.target.position.set(0, 1, 0);
  if (shadow) {
    key.castShadow = true;
    key.shadow.mapSize.set(settings.quality === 'low' ? 1024 : 2048, settings.quality === 'low' ? 1024 : 2048);
    key.shadow.camera.left = -13; key.shadow.camera.right = 13;
    key.shadow.camera.top = 13; key.shadow.camera.bottom = -13;
    key.shadow.camera.near = 1; key.shadow.camera.far = 30;
    key.shadow.bias = -0.0018;
  }
  const fill = bag.light(new THREE.HemisphereLight(fillColor, 0x1a1a22, fillIntensity));
  let rim = null;
  if (rimColor != null) {
    rim = bag.light(new THREE.PointLight(rimColor, rimIntensity, 26, 2));
    rim.position.set(-5, 3.5, 7);
  }
  return { key, fill, rim };
}

function marks() {
  return {
    p: { x: -4.5, y: 0, z: 0, face: Math.PI / 2 },
    e: { x: 4.5, y: 0, z: 0, face: -Math.PI / 2 },
  };
}

function lowTree(bag, { trunkColor, canopyColor, emissive = 0, h = 2.4, w = 1.3 } = {}) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(bag.geo(new THREE.CylinderGeometry(0.09, 0.14, h * 0.55, 6)), stdMat(bag, trunkColor, { rough: 0.95 }));
  trunk.position.y = h * 0.275; trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const s = 1 - i * 0.22;
    const c = new THREE.Mesh(bag.geo(new THREE.IcosahedronGeometry(w * 0.5 * s, 0)), stdMat(bag, canopyColor, { emissive, emissiveIntensity: emissive ? 0.7 : 0, rough: 0.8 }));
    c.position.set((hash01(i * 3.1) - 0.5) * 0.15, h * 0.55 + i * h * 0.22, (hash01(i * 7.7) - 0.5) * 0.15);
    c.castShadow = true;
    g.add(c);
  }
  return g;
}

// ------------------------------------------------------------------- meadow
function buildMeadow(P) {
  const bag = new Bag();
  const group = new THREE.Group();
  group.add(groundDisc(bag, 0x8fce5c, 0x4f9e4f));

  const trunkMat = stdMat(bag, 0x6b4a2c, { rough: 0.95 });
  const canopyMat = stdMat(bag, 0x7ec850, { rough: 0.8 });
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.16, 1.5, 6);
  const canopyGeo = new THREE.IcosahedronGeometry(0.85, 0);
  const trunks = ringInstances(bag, trunkGeo, trunkMat, 6, (i, n) => ({ ...ringPlacer(13, 17)(i, n), y: 0.75 }));
  const canopies = ringInstances(bag, canopyGeo, canopyMat, 6, (i, n) => { const b = ringPlacer(13, 17)(i, n); return { ...b, y: 2.1, scale: b.scale * 1.1 }; });
  group.add(trunks, canopies);

  const flowerGeo = new THREE.TetrahedronGeometry(0.14, 0);
  const flowerMat = stdMat(bag, 0xffb85c, { emissive: 0xffb85c, emissiveIntensity: 0.25, rough: 0.6 });
  group.add(ringInstances(bag, flowerGeo, flowerMat, 26, ringPlacer(3.5, 10.5, 0.9, [0.6, 1.3])));

  const clouds = new THREE.Group();
  const cloudGeo = new THREE.SphereGeometry(1, 7, 5);
  const cloudMat = stdMat(bag, 0xffffff, { transparent: true, opacity: 0.55, rough: 1 });
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Mesh(cloudGeo, cloudMat);
    c.scale.set(2.6 + i, 0.7, 1.3);
    c.position.set((i - 2) * 14, 13 + hash01(i * 4) * 3, -30 - hash01(i * 2) * 20);
    clouds.add(c);
  }
  group.add(clouds);
  group.add(dome(bag, 0x9fd8ff, 0xdff2e0));

  const lights = makeLights(bag, { keyColor: 0xfff2d0, keyIntensity: 2.5, fillColor: 0x9fd8ff, rimColor: 0xffe9b0, rimIntensity: 0.9 });
  group.add(lights.key, lights.key.target, lights.fill, lights.rim);

  const amb = bag.handle(P?.ambient({ radius: 10, y0: 0.2, y1: 3.2, rate: 3.5, color: 0xfff6c8, color2: 0xffe9b0, size: 0.07, life: 4.5, vel: { x: 0.15, y: 0.15, z: 0 }, sway: 0.6, flicker: true, additive: true }));

  return {
    kind: 'meadow', group, marks: marks(), lights, sky: { top: 0x9fd8ff, bottom: 0xdff2e0 }, fogColor: 0xcfe8d8, fogDensity: 0.006,
    update(dt, t) { clouds.position.x = Math.sin(t * 0.02) * 3; },
    dispose() { bag.dispose(group); },
  };
}

// ------------------------------------------------------------------- forest
function buildForest(P) {
  const bag = new Bag();
  const group = new THREE.Group();
  group.add(groundDisc(bag, 0x4a6b3a, 0x2c4a26));

  const trunks = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const b = ringPlacer(11.5, 15.5, 0.4, [1.4, 2.2])(i, 8);
    const h = 8 + hash01(i * 6.6) * 5;
    const trunk = new THREE.Mesh(bag.geo(new THREE.CylinderGeometry(0.35 * b.scale, 0.55 * b.scale, h, 7)), stdMat(bag, 0x3a2a1e, { rough: 0.95 }));
    trunk.position.set(b.x, h / 2, b.z); trunk.castShadow = true;
    trunks.add(trunk);
    const cap = new THREE.Mesh(bag.geo(new THREE.ConeGeometry(1.6 * b.scale, 3.2, 7)), stdMat(bag, 0x2f4a24, { rough: 0.85 }));
    cap.position.set(b.x, h + 1.1, b.z); cap.castShadow = true;
    trunks.add(cap);
  }
  group.add(trunks);

  const shafts = new THREE.Group();
  const shaftMat = stdMat(bag, 0xfff2c8, { transparent: true, opacity: 0.1, emissive: 0xfff2c8, emissiveIntensity: 0.4, side: THREE.DoubleSide });
  const shaftGeo = new THREE.ConeGeometry(1.1, 14, 10, 1, true);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(shaftGeo, shaftMat);
    const a = (i / 4) * TAU + 0.4;
    s.position.set(Math.cos(a) * 6, 6, Math.sin(a) * 6);
    s.rotation.z = 0.22; s.rotation.y = a;
    shafts.add(s);
  }
  bag.geo(shaftGeo);
  group.add(shafts);
  group.add(dome(bag, 0x3f5a45, 0x223326));

  const lights = makeLights(bag, { keyColor: 0xdff0c8, keyIntensity: 1.7, fillColor: 0x2f4a3a, fillIntensity: 0.65, rimColor: 0xa9e07a, rimIntensity: 1.1, keyPos: [5, 11, -3] });
  group.add(lights.key, lights.key.target, lights.fill, lights.rim);

  const amb = bag.handle(P?.ambient({ radius: 9, y0: 0.3, y1: 3.4, rate: 3, color: 0xa9e07a, color2: 0xfff6c8, size: 0.08, life: 3.5, vel: { x: 0.1, y: -0.35, z: 0 }, sway: 1.1, flicker: true }));

  return {
    kind: 'forest', group, marks: marks(), lights, sky: { top: 0x3f5a45, bottom: 0x223326 }, fogColor: 0x203324, fogDensity: 0.02,
    update(dt, t) { shaftMat.opacity = 0.07 + Math.sin(t * 0.6) * 0.04; },
    dispose() { bag.dispose(group); },
  };
}

// --------------------------------------------------------------------- cave
function buildCave(P) {
  const bag = new Bag();
  const group = new THREE.Group();
  group.add(groundDisc(bag, 0x3a3648, 0x1c1a26));

  const crystalMat = stdMat(bag, 0x6fd8e8, { emissive: 0x2fd8f0, emissiveIntensity: 1.1, rough: 0.35, metal: 0.2 });
  const crystalGeo = new THREE.IcosahedronGeometry(0.65, 0);
  const crystals = ringInstances(bag, crystalGeo, crystalMat, 9, (i, n) => { const b = ringPlacer(9.5, 15, 0.5, [0.7, 1.6])(i, n); return { ...b, y: 0.5 * b.scale, tiltZ: (hash01(i * 2.2) - 0.5) * 0.4 }; });
  group.add(crystals);

  const stalGeo = new THREE.ConeGeometry(0.35, 1.6, 6);
  const stalMat = stdMat(bag, 0x4a4258, { rough: 0.9 });
  group.add(ringInstances(bag, stalGeo, stalMat, 11, (i, n) => { const b = ringPlacer(9, 16, 0.6, [0.6, 1.5])(i, n); return { ...b, y: 0.8 * b.scale }; }));
  group.add(dome(bag, 0x120f1c, 0x0a0812, { horizon: 0.15 }));

  const lights = makeLights(bag, { keyColor: 0x8fb0ff, keyIntensity: 1.4, fillColor: 0x2a2438, fillIntensity: 0.4, rimColor: 0x6fd8e8, rimIntensity: 1.6, keyPos: [2, 8, -4] });
  const p2 = bag.light(new THREE.PointLight(0xb06fd8, 1.1, 20, 2)); p2.position.set(6, 2.4, 5);
  group.add(lights.key, lights.key.target, lights.fill, lights.rim, p2);

  const amb = bag.handle(P?.ambient({ radius: 8, y0: 0.2, y1: 3, rate: 4, color: 0xe8f6ff, color2: 0x6fd8e8, size: 0.05, life: 5, vel: { x: 0.04, y: 0.05, z: 0 }, sway: 0.3, flicker: true }));

  let pulse = 0;
  return {
    kind: 'cave', group, marks: marks(), lights, sky: { top: 0x120f1c, bottom: 0x0a0812 }, fogColor: 0x141220, fogDensity: 0.028,
    update(dt, t) { pulse = 0.85 + Math.sin(t * 1.4) * 0.25; crystalMat.emissiveIntensity = pulse; },
    dispose() { bag.dispose(group); },
  };
}

// --------------------------------------------------------------------- lake
function buildLake(P) {
  const bag = new Bag();
  const group = new THREE.Group();
  group.add(groundDisc(bag, 0xdcd2a8, 0xc9b888));

  const waterGeo = new THREE.RingGeometry(RADIUS - 0.6, RADIUS + 6, 64, 6);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x4fa8ff, transparent: true, opacity: 0.72, roughness: 0.15, metalness: 0.35, flatShading: true, side: THREE.DoubleSide });
  bag.mat(waterMat); bag.geo(waterGeo);
  const basePos = waterGeo.attributes.position.array.slice();
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = -0.06;
  group.add(water);

  const lilyGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.05, 9);
  const lilyMat = stdMat(bag, 0x6fce5c, { rough: 0.7 });
  group.add(ringInstances(bag, lilyGeo, lilyMat, 7, (i, n) => { const b = ringPlacer(11.6, 15, 0.7, [0.7, 1.3])(i, n); return { ...b, y: 0.02 }; }));

  const clouds = new THREE.Group();
  const cloudGeo = new THREE.SphereGeometry(1, 7, 5);
  const cloudMat = stdMat(bag, 0xffffff, { transparent: true, opacity: 0.5, rough: 1 });
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(cloudGeo, cloudMat);
    c.scale.set(3 + i, 0.7, 1.4);
    c.position.set((i - 1.5) * 16, 14 + i, -32);
    clouds.add(c);
  }
  group.add(clouds);
  group.add(dome(bag, 0xaee2ff, 0xeaf7ff));

  const lights = makeLights(bag, { keyColor: 0xfff2d0, keyIntensity: 2.6, fillColor: 0xaee2ff, rimColor: 0xbfe8ff, rimIntensity: 1.0 });
  group.add(lights.key, lights.key.target, lights.fill, lights.rim);

  const amb = bag.handle(P?.ambient({ radius: 12, y0: 0.05, y1: 0.6, rate: 3, color: 0xffffff, color2: 0xbfe8ff, size: 0.07, life: 2.2, vel: { x: 0, y: 0.02, z: 0 }, sway: 0.2, flicker: true }));

  return {
    kind: 'lake', group, marks: marks(), lights, sky: { top: 0xaee2ff, bottom: 0xeaf7ff }, fogColor: 0xdcefff, fogDensity: 0.004,
    update(dt, t) {
      const arr = waterGeo.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = basePos[i], z = basePos[i + 2];
        arr[i + 1] = Math.sin(x * 0.4 + t * 1.6) * 0.06 + Math.cos(z * 0.35 + t * 1.1) * 0.05;
      }
      waterGeo.attributes.position.needsUpdate = true;
      clouds.position.x = Math.sin(t * 0.015) * 4;
    },
    dispose() { bag.dispose(group); },
  };
}

// ---------------------------------------------------------------- mountain
function buildMountain(P) {
  const bag = new Bag();
  const group = new THREE.Group();
  group.add(groundDisc(bag, 0xb8c4cf, 0x8a99a8));

  const rockGeo = new THREE.OctahedronGeometry(1, 0);
  const rockMat = stdMat(bag, 0x8a99a8, { rough: 0.95 });
  group.add(ringInstances(bag, rockGeo, rockMat, 8, (i, n) => { const b = ringPlacer(11, 16, 0.5, [1.1, 2.4])(i, n); return { ...b, y: 0.9 * b.scale, tiltX: hash01(i) * 0.5, tiltZ: hash01(i * 1.7) * 0.5 }; }));

  const seaGroup = new THREE.Group();
  const puffGeo = new THREE.SphereGeometry(1, 7, 5);
  const puffMat = stdMat(bag, 0xf3f7fb, { transparent: true, opacity: 0.85, rough: 1 });
  for (let i = 0; i < 40; i++) {
    const p = new THREE.Mesh(puffGeo, puffMat);
    const a = Math.random() * TAU, r = 20 + Math.random() * 55;
    p.position.set(Math.cos(a) * r, -3.5 - Math.random() * 1.5, Math.sin(a) * r);
    const s = 2.5 + Math.random() * 4;
    p.scale.set(s, s * 0.5, s);
    seaGroup.add(p);
  }
  bag.geo(puffGeo);
  group.add(seaGroup);
  group.add(dome(bag, 0x8fc6ff, 0xe9f5ff));

  const lights = makeLights(bag, { keyColor: 0xffffff, keyIntensity: 3.0, fillColor: 0x8fc6ff, fillIntensity: 0.7, rimColor: 0xe8fff6, rimIntensity: 1.0, keyPos: [7, 12, -4] });
  group.add(lights.key, lights.key.target, lights.fill, lights.rim);

  const amb = bag.handle(P?.ambient({ radius: 11, y0: 0.4, y1: 3.6, rate: 2.2, color: 0xffffff, size: 0.05, life: 1.6, vel: { x: 1.4, y: 0.05, z: 0.3 }, sway: 0.2 }));

  return {
    kind: 'mountain', group, marks: marks(), lights, sky: { top: 0x8fc6ff, bottom: 0xe9f5ff }, fogColor: 0xdcecff, fogDensity: 0.006,
    update(dt, t) { seaGroup.rotation.y = t * 0.01; },
    dispose() { bag.dispose(group); },
  };
}

// ------------------------------------------------------------------- ruins
function buildRuins(P) {
  const bag = new Bag();
  const group = new THREE.Group();
  group.add(groundDisc(bag, 0x8a97a0, 0x545e68));

  const pillars = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const b = ringPlacer(11, 15.5, 0.4, [1, 1.6])(i, 8);
    const h = 3 + hash01(i * 8.8) * 3.5;
    const p = new THREE.Mesh(bag.geo(new THREE.CylinderGeometry(0.42 * b.scale, 0.5 * b.scale, h, 8)), stdMat(bag, 0xb9b2a0, { rough: 0.9 }));
    p.position.set(b.x, h / 2, b.z); p.rotation.z = (hash01(i * 4.4) - 0.5) * 0.18; p.castShadow = true;
    pillars.add(p);
  }
  group.add(pillars);

  const shaftMat = stdMat(bag, 0xffe9b0, { transparent: true, opacity: 0.08, emissive: 0xffe9b0, emissiveIntensity: 0.35, side: THREE.DoubleSide });
  const shaftGeo = new THREE.ConeGeometry(0.9, 12, 8, 1, true);
  const shafts = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(shaftGeo, shaftMat);
    const a = (i / 3) * TAU + 0.6;
    s.position.set(Math.cos(a) * 5, 5.5, Math.sin(a) * 5);
    s.rotation.z = 0.2; s.rotation.y = a;
    shafts.add(s);
  }
  bag.geo(shaftGeo);
  group.add(shafts);
  group.add(dome(bag, 0x9fb0c0, 0xe0dccb));

  const lights = makeLights(bag, { keyColor: 0xffe9b0, keyIntensity: 1.9, fillColor: 0x9fb0c0, fillIntensity: 0.6, rimColor: 0xbfe8ff, rimIntensity: 0.8, keyPos: [4, 10, -6] });
  group.add(lights.key, lights.key.target, lights.fill, lights.rim);

  if (settings.quality !== 'low') {
    try {
      const mgeo = new THREE.PlaneGeometry(RADIUS * 2, RADIUS * 2);
      mgeo.rotateX(-Math.PI / 2);
      bag.geo(mgeo);
      const mirror = new Reflector(mgeo, { color: 0x4a5a66, textureWidth: 512, textureHeight: 512, clipBias: 0.003 });
      mirror.position.y = 0.015;
      group.add(mirror);
    } catch (e) { console.warn('[arenas] ruins mirror floor unavailable', e); }
  }

  const amb = bag.handle(P?.ambient({ radius: 10, y0: 0.3, y1: 3.2, rate: 2.6, color: 0xffe9b0, size: 0.06, life: 4, vel: { x: 0.08, y: 0.12, z: 0 }, sway: 0.5, flicker: true }));

  return {
    kind: 'ruins', group, marks: marks(), lights, sky: { top: 0x9fb0c0, bottom: 0xe0dccb }, fogColor: 0xcfd6dc, fogDensity: 0.012,
    update(dt, t) { shaftMat.opacity = 0.06 + Math.sin(t * 0.5) * 0.03; },
    dispose() { bag.dispose(group); },
  };
}

// -------------------------------------------------------------------- spire
function buildSpire(P) {
  const bag = new Bag();
  const group = new THREE.Group();
  group.add(groundDisc(bag, 0x2c2a3a, 0x17151f));

  const wallGeo = new THREE.BoxGeometry(2.2, 6, 0.7);
  const wallMat = stdMat(bag, 0x232130, { rough: 0.85 });
  group.add(ringInstances(bag, wallGeo, wallMat, 8, (i, n) => { const b = ringPlacer(12.5, 12.5, 0.15, [1, 1.35])(i, n); return { ...b, y: 3 }; }));
  group.add(dome(bag, 0x0c0a14, 0x06050a, { horizon: 0.2 }));
  group.add(starsField(bag, 140, 60));

  const braziers = [];
  const braMat = stdMat(bag, 0x3a3648, { rough: 0.8 });
  const flameMat = stdMat(bag, 0xd8f0ff, { emissive: 0xbfe0ff, emissiveIntensity: 1.4, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.5;
    const x = Math.cos(a) * 6.6, z = Math.sin(a) * 6.6;
    const pole = new THREE.Mesh(bag.geo(new THREE.CylinderGeometry(0.08, 0.1, 1.5, 6)), braMat);
    pole.position.set(x, 0.75, z); pole.castShadow = true;
    const flame = new THREE.Mesh(bag.geo(new THREE.ConeGeometry(0.16, 0.5, 6)), flameMat);
    flame.position.set(x, 1.65, z);
    const glow = bag.light(new THREE.PointLight(0xbfe0ff, 1.3, 9, 2));
    glow.position.set(x, 1.7, z);
    group.add(pole, flame, glow);
    braziers.push({ flame, glow, phase: i * 1.7 });
  }

  const lights = makeLights(bag, { keyColor: 0x9fb0d8, keyIntensity: 0.9, fillColor: 0x1a1830, fillIntensity: 0.35, rimColor: 0x7a6f9e, rimIntensity: 1.2, keyPos: [3, 9, -3] });
  group.add(lights.key, lights.key.target, lights.fill, lights.rim);

  const amb = bag.handle(P?.ambient({ radius: 9, y0: 0.2, y1: 3.4, rate: 3.4, color: 0x9a9aa4, color2: 0xd8d8e2, size: 0.05, life: 4.5, vel: { x: 0.05, y: 0.08, z: 0 }, sway: 0.5, additive: false }));

  return {
    kind: 'spire', group, marks: marks(), lights, sky: { top: 0x0c0a14, bottom: 0x06050a }, fogColor: 0x100e18, fogDensity: 0.024,
    update(dt, t) {
      for (const b of braziers) {
        const f = 0.75 + Math.sin(t * 9 + b.phase) * 0.15 + Math.sin(t * 23 + b.phase) * 0.08;
        b.flame.scale.set(1, f, 1);
        b.glow.intensity = 1.1 * f;
      }
    },
    dispose() { bag.dispose(group); },
  };
}

// -------------------------------------------------------------------- glade
function buildGlade(P) {
  const bag = new Bag();
  const group = new THREE.Group();
  group.add(groundDisc(bag, 0x5b4a8a, 0x352a56));

  const trees = [];
  for (let i = 0; i < 6; i++) {
    const b = ringPlacer(12, 15.5, 0.4, [1, 1.4])(i, 6);
    const t = lowTree(bag, { trunkColor: 0x3a2a4a, canopyColor: 0xffe9b0, emissive: 0xffe9b0, h: 3.2, w: 1.6 });
    t.position.set(b.x, 0, b.z); t.scale.setScalar(b.scale);
    group.add(t);
    trees.push(t);
  }
  group.add(dome(bag, 0x5b4a8a, 0x24193f));
  group.add(starsField(bag, 90, 55));

  const lights = makeLights(bag, { keyColor: 0xffb85c, keyIntensity: 1.2, fillColor: 0x352a56, fillIntensity: 0.55, rimColor: 0xffe9b0, rimIntensity: 1.3, keyPos: [-4, 7, 4] });
  group.add(lights.key, lights.key.target, lights.fill, lights.rim);

  const amb = bag.handle(P?.ambient({ radius: 10, y0: 0.15, y1: 2.4, rate: 5, color: 0xffe9b0, color2: 0xfff8dc, size: 0.06, life: 3.6, vel: { x: 0.1, y: 0.1, z: 0.1 }, sway: 1, flicker: true }));

  return {
    kind: 'glade', group, marks: marks(), lights, sky: { top: 0x5b4a8a, bottom: 0x24193f }, fogColor: 0x2c2246, fogDensity: 0.014,
    update(dt, t) { const p = 0.6 + Math.sin(t * 0.9) * 0.2; for (const tr of trees) tr.children.slice(1).forEach((c) => { c.material.emissiveIntensity = p; }); },
    dispose() { bag.dispose(group); },
  };
}

const BUILDERS = {
  meadow: buildMeadow, forest: buildForest, cave: buildCave, lake: buildLake,
  mountain: buildMountain, ruins: buildRuins, spire: buildSpire, glade: buildGlade,
};

export function buildArena(biomeOrKind, particles) {
  const kind = ARENA_FOR_BIOME[biomeOrKind] ?? (BUILDERS[biomeOrKind] ? biomeOrKind : 'meadow');
  const fn = BUILDERS[kind] ?? buildMeadow;
  return fn(particles);
}
