// Pooled GPU-friendly particle systems for Lumenfall.
//
// One `Particles` instance owns:
//   · two pooled THREE.Points clouds — additive GLOW sprites (white-hot core,
//     soft halo) and normal-blended SOFT sprites (dust, debris, leaves) — with
//     a size/alpha-over-life shader,
//   · a STREAK layer: instanced camera-facing quads stretched along each
//     particle's screen-space velocity (sparks, arcs, speed lines),
//   · small pools of FLASH sprites (impact / charge light blooms) and
//     SHOCKWAVE rings (ground rings or camera-facing air rings),
//   · lightweight continuous emitters (trails, ambient fields).
// Everything is preallocated: emission, simulation and death never allocate —
// particles live in packed Float32 pools and are compacted with swap-on-death;
// flashes/rings recycle their slots.
//
// API (all positions accept THREE.Vector3 or plain {x,y,z}):
//   const P = new Particles(scene, { capacity })
//   P.emitBurst({ at, count, color, color2, size, sizeEnd, speed, spread, life,
//                 gravity, drag, up, additive, flicker, sway })
//   P.emitRing({ at, radius, count, color, size, life, speed, additive })  // expanding XZ ring
//   P.emitFountain({ at, count, color, size, life, speed, spread, gravity, additive })
//   P.emitSparks({ at, count, color, speed, life, ... })  // velocity-stretched streaks
//   P.flash({ at, color, size, sizeEnd, life, peak, stretchY }) // additive light bloom
//   P.shockwave({ at, color, radius, life, width, flat, peak }) // expanding ring
//   P.emitTrail(source, opts) -> handle { stop() }    // source: fn()->pos | Object3D | Vector3
//   P.ambient(opts) -> handle { stop() }              // continuous field emitter
//   P.setViewHeight(px)                               // for renderers not sized to the window
//   P.update(dt); P.activeCount(); P.stopAll(); P.dispose()
import * as THREE from 'three';
import { bus } from '../core/events.js';

// ---------------------------------------------------------------- pool layout
// Interleaved sim record per particle (Float32):
const S_PX = 0, S_PY = 1, S_PZ = 2;        // position
const S_VX = 3, S_VY = 4, S_VZ = 5;        // velocity
const S_LIFE = 6, S_MAXLIFE = 7;           // remaining / total (sec)
const S_SIZE0 = 8, S_SIZE1 = 9;            // world size start -> end
const S_R = 10, S_G = 11, S_B = 12;        // color
const S_GRAV = 13, S_DRAG = 14;            // per-particle physics
const S_SWAYA = 15, S_SWAYF = 16;          // lateral sine sway amp/freq
const S_SEED = 17;                         // phase seed
const S_PROF = 18;                         // alpha profile: 0 soft in/out, 1 hold->fade, 2 flicker
const STRIDE = 19;

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 0.0, 240.0);
    gl_Position = projectionMatrix * mv;
  }
`;
// Additive glow: a white-hot core inside a soft halo — reads as light, not dots.
const FRAG_GLOW = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv) * 2.0;
    float halo = pow(max(0.0, 1.0 - d), 1.4);
    float core = smoothstep(0.42, 0.0, d);
    float a = (halo * 0.85 + core * 0.5) * vAlpha;
    if (a < 0.01) discard;
    // HDR core (>1 linear) so the High-tier bloom catches it; Low/Med tonemap it to white.
    gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.55) * (1.0 + core * 1.6), a);
  }
`;
// Normal-blended soft disc: dust, debris, leaves, smoke — solid body, soft rim.
const FRAG_SOFT = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv) * 2.0;
    float a = smoothstep(1.0, 0.5, d) * vAlpha;
    if (a < 0.012) discard;
    gl_FragColor = vec4(vColor * (1.0 - d * 0.18), a);
  }
`;

// Shared scratch (never allocated per-frame).
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _v = new THREE.Vector3();

function viewScale(heightPx) {
  // world-size -> px conversion factor for a ~38deg vertical fov camera.
  if (typeof window === 'undefined') return 1400;
  const pr = Math.min(window.devicePixelRatio || 1, 2);
  return ((heightPx ?? window.innerHeight) * pr * 0.5) / Math.tan((19 * Math.PI) / 180);
}

function readPos(src, out) {
  if (!src) { out.set(0, 0, 0); return out; }
  if (typeof src === 'function') { const p = src(); out.set(p.x || 0, p.y || 0, p.z || 0); return out; }
  if (src.isObject3D) { src.getWorldPosition(out); return out; }
  out.set(src.x || 0, src.y || 0, src.z || 0);
  return out;
}

// Integrate one packed particle record; returns the alpha for this frame, or
// -1 if the particle died (caller compacts).
function stepRecord(s, o, dt, t) {
  s[o + S_LIFE] -= dt;
  if (s[o + S_LIFE] <= 0) return -1;
  const drag = Math.max(0, 1 - s[o + S_DRAG] * dt);
  s[o + S_VX] *= drag; s[o + S_VY] *= drag; s[o + S_VZ] *= drag;
  s[o + S_VY] -= s[o + S_GRAV] * dt;
  const seed = s[o + S_SEED];
  const swayA = s[o + S_SWAYA];
  let px = s[o + S_PX] + s[o + S_VX] * dt;
  const py = s[o + S_PY] + s[o + S_VY] * dt;
  let pz = s[o + S_PZ] + s[o + S_VZ] * dt;
  if (swayA > 0) {
    const f = s[o + S_SWAYF];
    px += Math.sin(t * f + seed) * swayA * dt;
    pz += Math.cos(t * f * 0.83 + seed * 1.7) * swayA * dt;
  }
  s[o + S_PX] = px; s[o + S_PY] = py; s[o + S_PZ] = pz;
  const age = 1 - s[o + S_LIFE] / s[o + S_MAXLIFE]; // 0..1
  const prof = s[o + S_PROF];
  if (prof === 1) return age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3;                       // hold, late fade
  if (prof === 2) return (0.55 + 0.45 * Math.sin(t * 14 + seed * 5)) * (1 - age * age); // flicker
  return Math.min(age * 8, 1) * (1 - age) * (2 - age) * 0.75 + 0.25 * (1 - age);        // soft in, ease out
}

// ------------------------------------------------------------------ one layer
class Layer {
  constructor(scene, capacity, additive) {
    this.capacity = capacity;
    this.count = 0;
    this.sim = new Float32Array(capacity * STRIDE);
    this.time = 0;

    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
    this.aColor = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
    this.aSize = new THREE.BufferAttribute(new Float32Array(capacity), 1);
    this.aAlpha = new THREE.BufferAttribute(new Float32Array(capacity), 1);
    for (const a of [this.aPos, this.aColor, this.aSize, this.aAlpha]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aAlpha', this.aAlpha);
    geo.setDrawRange(0, 0);
    // Generous static bounds — battles happen inside a ~24u arena.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), 80);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: additive ? FRAG_GLOW : FRAG_SOFT,
      uniforms: { uScale: { value: viewScale() } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 12 : 11;
    this.geo = geo;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, life, size0, size1, r, g, b, grav, drag, swayA, swayF, prof) {
    if (this.count >= this.capacity) return; // pool full: drop (never grow, never throw)
    const o = this.count * STRIDE, s = this.sim;
    s[o + S_PX] = x; s[o + S_PY] = y; s[o + S_PZ] = z;
    s[o + S_VX] = vx; s[o + S_VY] = vy; s[o + S_VZ] = vz;
    s[o + S_LIFE] = life; s[o + S_MAXLIFE] = life;
    s[o + S_SIZE0] = size0; s[o + S_SIZE1] = size1;
    s[o + S_R] = r; s[o + S_G] = g; s[o + S_B] = b;
    s[o + S_GRAV] = grav; s[o + S_DRAG] = drag;
    s[o + S_SWAYA] = swayA; s[o + S_SWAYF] = swayF;
    s[o + S_SEED] = Math.random() * 6.283;
    s[o + S_PROF] = prof;
    this.count++;
  }

  update(dt) {
    this.time += dt;
    const s = this.sim, t = this.time;
    const pos = this.aPos.array, col = this.aColor.array, siz = this.aSize.array, alp = this.aAlpha.array;
    let i = 0;
    while (i < this.count) {
      const o = i * STRIDE;
      const a = stepRecord(s, o, dt, t);
      if (a < 0) {
        const last = (this.count - 1) * STRIDE;
        if (o !== last) for (let k = 0; k < STRIDE; k++) s[o + k] = s[last + k];
        this.count--;
        continue; // re-process swapped-in record at same index
      }
      const age = 1 - s[o + S_LIFE] / s[o + S_MAXLIFE];
      const p3 = i * 3;
      pos[p3] = s[o + S_PX]; pos[p3 + 1] = s[o + S_PY]; pos[p3 + 2] = s[o + S_PZ];
      col[p3] = s[o + S_R]; col[p3 + 1] = s[o + S_G]; col[p3 + 2] = s[o + S_B];
      siz[i] = s[o + S_SIZE0] + (s[o + S_SIZE1] - s[o + S_SIZE0]) * age;
      alp[i] = a;
      i++;
    }
    this.geo.setDrawRange(0, this.count);
    this.aPos.needsUpdate = true;
    this.aColor.needsUpdate = true;
    this.aSize.needsUpdate = true;
    this.aAlpha.needsUpdate = true;
  }

  dispose(scene) {
    scene.remove(this.points);
    this.geo.dispose();
    this.material.dispose();
    this.count = 0;
  }
}

// ------------------------------------------------------------ streak layer
// Instanced quads stretched along each particle's view-space velocity: the
// head sits on the particle, the tail trails behind by ~stretch seconds.
const STREAK_VERT = /* glsl */ `
  attribute vec3 iPos;
  attribute vec3 iVel;
  attribute vec3 iCol;
  attribute vec2 iSA;
  uniform float uStretch;
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
    vec2 d = vv.xy;
    float sp = length(d);
    d = sp > 1e-4 ? d / sp : vec2(1.0, 0.0);
    vec2 n = vec2(-d.y, d.x);
    float w = iSA.x;
    float len = w * 1.4 + sp * uStretch;
    mv.xy += d * (position.x - 0.5) * len + n * position.y * w;
    gl_Position = projectionMatrix * mv;
    vUv = vec2(position.x * 2.0 - 1.0, position.y * 2.0);
    vCol = iCol;
    vA = iSA.y;
  }
`;
const STREAK_FRAG = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vA;
  void main() {
    float across = 1.0 - smoothstep(0.0, 1.0, abs(vUv.y));
    float along = smoothstep(-1.0, -0.1, vUv.x) * (1.0 - smoothstep(0.75, 1.0, vUv.x));
    float a = across * across * along * vA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(vCol, vec3(1.0), across * across * 0.6) * (1.0 + across * across * 1.4), a);
  }
`;
class StreakLayer {
  constructor(scene, capacity) {
    this.capacity = capacity;
    this.count = 0;
    this.sim = new Float32Array(capacity * STRIDE);
    this.time = 0;
    const base = new THREE.PlaneGeometry(1, 1);
    base.translate(0.5, 0, 0); // x in [0,1]: 1 = head
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.iVel = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.iCol = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.iSA = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    for (const a of [this.iPos, this.iVel, this.iCol, this.iSA]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.iPos);
    geo.setAttribute('iVel', this.iVel);
    geo.setAttribute('iCol', this.iCol);
    geo.setAttribute('iSA', this.iSA);
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), 80);
    this.material = new THREE.ShaderMaterial({
      vertexShader: STREAK_VERT, fragmentShader: STREAK_FRAG,
      uniforms: { uStretch: { value: 0.05 } },
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 13;
    this.mesh.visible = false;
    this.geo = geo;
    this.base = base;
    scene.add(this.mesh);
  }
  spawn(...args) { Layer.prototype.spawn.apply(this, args); }
  update(dt) {
    this.time += dt;
    const s = this.sim, t = this.time;
    const pos = this.iPos.array, vel = this.iVel.array, col = this.iCol.array, sa = this.iSA.array;
    let i = 0;
    while (i < this.count) {
      const o = i * STRIDE;
      const a = stepRecord(s, o, dt, t);
      if (a < 0) {
        const last = (this.count - 1) * STRIDE;
        if (o !== last) for (let k = 0; k < STRIDE; k++) s[o + k] = s[last + k];
        this.count--;
        continue;
      }
      const age = 1 - s[o + S_LIFE] / s[o + S_MAXLIFE];
      const p3 = i * 3;
      pos[p3] = s[o + S_PX]; pos[p3 + 1] = s[o + S_PY]; pos[p3 + 2] = s[o + S_PZ];
      vel[p3] = s[o + S_VX]; vel[p3 + 1] = s[o + S_VY]; vel[p3 + 2] = s[o + S_VZ];
      col[p3] = s[o + S_R]; col[p3 + 1] = s[o + S_G]; col[p3 + 2] = s[o + S_B];
      sa[i * 2] = s[o + S_SIZE0] + (s[o + S_SIZE1] - s[o + S_SIZE0]) * age;
      sa[i * 2 + 1] = a;
      i++;
    }
    this.geo.instanceCount = this.count;
    this.mesh.visible = this.count > 0; // no empty instanced draw call
    this.iPos.needsUpdate = true; this.iVel.needsUpdate = true; this.iCol.needsUpdate = true; this.iSA.needsUpdate = true;
  }
  dispose(scene) {
    scene.remove(this.mesh);
    this.geo.dispose(); this.base.dispose(); this.material.dispose();
    this.count = 0;
  }
}

// ------------------------------------------------------------ flash pool
let _flashTex = null;
function flashTexture() {
  if (_flashTex) return _flashTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.12, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.3)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.07)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  _flashTex = new THREE.CanvasTexture(c);
  _flashTex.colorSpace = THREE.SRGBColorSpace;
  return _flashTex;
}

const RING_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uAlpha, uR, uW;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float ring = 1.0 - smoothstep(0.0, uW, abs(d - uR));
    float fill = (1.0 - smoothstep(0.0, uR, d)) * 0.18;
    float a = (ring * ring + fill) * uAlpha * (1.0 - smoothstep(0.92, 1.0, d));
    if (a < 0.005) discard;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), ring * ring * 0.35) * (1.0 + ring * ring * 1.2), a);
  }
`;

// ------------------------------------------------------------------ Particles
export class Particles {
  constructor(scene, { capacity = 2600 } = {}) {
    this.scene = scene;
    this.normal = new Layer(scene, Math.floor(capacity * 0.45), false);
    this.additive = new Layer(scene, capacity, true);
    this.streaks = new StreakLayer(scene, Math.max(64, Math.floor(capacity * 0.25)));
    this.emitters = [];  // {alive, acc, rate, kind, src, opts, layer, age, dur}
    this._viewH = null;
    this._offResize = bus.on('render:resize', () => this._applyScale());

    // flash sprites
    this.flashes = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.SpriteMaterial({ map: flashTexture(), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      const s = new THREE.Sprite(m);
      s.visible = false;
      s.renderOrder = 14;
      scene.add(s);
      this.flashes.push({ s, m, life: 0, max: 1, s0: 1, s1: 1, peak: 1, sy: 1 });
    }
    // shockwave rings
    this.ringGeo = new THREE.PlaneGeometry(2, 2);
    this.rings = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.ShaderMaterial({
        vertexShader: RING_VERT, fragmentShader: RING_FRAG,
        uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 }, uR: { value: 0 }, uW: { value: 0.1 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.ringGeo, m);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 13;
      const slot = { mesh, m, life: 0, max: 1, radius: 1, peak: 1, face: false };
      mesh.onBeforeRender = (r, sc, cam) => { if (slot.face) mesh.quaternion.copy(cam.quaternion); };
      scene.add(mesh);
      this.rings.push(slot);
    }
  }

  _applyScale() {
    const s = viewScale(this._viewH);
    this.normal.material.uniforms.uScale.value = s;
    this.additive.material.uniforms.uScale.value = s;
  }
  /** Size sprites for a canvas that is not window-high (e.g. an overlay viewport). */
  setViewHeight(px) { this._viewH = px; this._applyScale(); }

  _layer(additive) { return additive === false ? this.normal : this.additive; }

  _mixColor(color, color2) {
    _c.setHex(color ?? 0xffffff);
    if (color2 != null) {
      _c2.setHex(color2);
      _c.lerp(_c2, Math.random());
    }
    return _c;
  }

  /** Radial burst from a point. */
  emitBurst(opts = {}) {
    const { at, count = 20, color = 0xffe9b0, color2 = null, size = 0.16, sizeEnd = null,
      speed = 3.2, spread = 1, life = 0.55, gravity = 3, drag = 2.2, up = 0.6,
      additive = true, flicker = false, sway = 0 } = opts;
    const L = this._layer(additive);
    readPos(at, _v);
    const x = _v.x, y = _v.y, z = _v.z;
    for (let i = 0; i < count; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = (Math.random() - 0.5) * Math.PI * spread;
      const sp = speed * (0.35 + Math.random() * 0.65);
      const c = this._mixColor(color, color2);
      L.spawn(x, y, z,
        Math.cos(th) * Math.cos(ph) * sp, Math.sin(ph) * sp + up * speed * 0.45, Math.sin(th) * Math.cos(ph) * sp,
        life * (0.6 + Math.random() * 0.7), size * (0.7 + Math.random() * 0.6), sizeEnd ?? size * 0.25,
        c.r, c.g, c.b, gravity, drag, sway, 3.5, flicker ? 2 : 0);
    }
  }

  /** Expanding ring in the XZ plane (shockwaves, seals). */
  emitRing(opts = {}) {
    const { at, radius = 0.3, count = 42, color = 0xffe9b0, color2 = null, size = 0.14,
      life = 0.5, speed = 6, rise = 0.35, additive = true } = opts;
    const L = this._layer(additive);
    readPos(at, _v);
    const x = _v.x, y = _v.y, z = _v.z;
    for (let i = 0; i < count; i++) {
      const th = (i / count) * Math.PI * 2 + Math.random() * 0.12;
      const c = this._mixColor(color, color2);
      L.spawn(x + Math.cos(th) * radius, y + 0.04, z + Math.sin(th) * radius,
        Math.cos(th) * speed * (0.85 + Math.random() * 0.3), rise * (0.5 + Math.random()), Math.sin(th) * speed * (0.85 + Math.random() * 0.3),
        life * (0.75 + Math.random() * 0.5), size, size * 0.3,
        c.r, c.g, c.b, 0.4, 3.0, 0, 0, 0);
    }
  }

  /** Upward fountain (heals, shrine bursts, faints-to-motes). */
  emitFountain(opts = {}) {
    const { at, count = 24, color = 0x9dffb0, color2 = null, size = 0.13, life = 0.9,
      speed = 2.6, spread = 0.55, gravity = 1.4, additive = true, sway = 0.4, flicker = false } = opts;
    const L = this._layer(additive);
    readPos(at, _v);
    const x = _v.x, y = _v.y, z = _v.z;
    for (let i = 0; i < count; i++) {
      const th = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      const c = this._mixColor(color, color2);
      L.spawn(x + Math.cos(th) * r, y + Math.random() * 0.15, z + Math.sin(th) * r,
        Math.cos(th) * r * 0.8, speed * (0.6 + Math.random() * 0.7), Math.sin(th) * r * 0.8,
        life * (0.6 + Math.random() * 0.8), size * (0.7 + Math.random() * 0.6), size * 0.3,
        c.r, c.g, c.b, gravity, 1.2, sway, 2.6, flicker ? 2 : 1);
    }
  }

  /**
   * Velocity-stretched streaks: real elongated sparks (instanced quads laid
   * along their screen-space velocity) — volt arcs, impact sparks, speed lines.
   */
  emitSparks(opts = {}) {
    const { at, count = 12, color = 0xffd94f, color2 = 0xffffff, size = 0.09,
      speed = 6, spread = 1, life = 0.3, gravity = 0, drag = 2.5, up = 0 } = opts;
    const L = this.streaks;
    readPos(at, _v);
    const x = _v.x, y = _v.y, z = _v.z;
    for (let i = 0; i < count; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = (Math.random() - 0.5) * Math.PI * spread;
      const sp = speed * (0.5 + Math.random() * 0.6);
      const c = this._mixColor(color, color2);
      L.spawn(x, y, z,
        Math.cos(th) * Math.cos(ph) * sp, Math.sin(ph) * sp + up * speed * 0.4, Math.sin(th) * Math.cos(ph) * sp,
        life * (0.6 + Math.random() * 0.6), size * (0.8 + Math.random() * 0.5), size * 0.35,
        c.r, c.g, c.b, gravity, drag, 0, 0, 1);
    }
  }

  /** Additive light bloom at a point: grows from size to sizeEnd and fades. */
  flash(opts = {}) {
    const { at, color = 0xffffff, size = 0.6, sizeEnd = null, life = 0.28, peak = 1, stretchY = 1 } = opts;
    let slot = this.flashes.find((f) => f.life <= 0);
    if (!slot) slot = this.flashes.reduce((a, b) => (a.life < b.life ? a : b)); // recycle the oldest
    readPos(at, _v);
    slot.s.position.copy(_v);
    slot.m.color.setHex(color).multiplyScalar(1.7); // HDR: blooms on High
    slot.life = slot.max = Math.max(0.03, life);
    slot.s0 = size; slot.s1 = sizeEnd ?? size * 2.2; slot.peak = peak; slot.sy = stretchY;
    slot.s.scale.set(size, size * stretchY, 1);
    slot.m.opacity = peak;
    slot.s.visible = true;
  }

  /** Expanding shockwave ring: flat on the ground (default) or facing the camera. */
  shockwave(opts = {}) {
    const { at, color = 0xffe9b0, radius = 2.2, life = 0.45, width = 0.12, flat = true, peak = 1 } = opts;
    let slot = this.rings.find((r) => r.life <= 0);
    if (!slot) slot = this.rings.reduce((a, b) => (a.life < b.life ? a : b));
    readPos(at, _v);
    slot.mesh.position.copy(_v);
    slot.face = !flat;
    if (flat) slot.mesh.rotation.set(-Math.PI / 2, 0, 0);
    slot.mesh.scale.setScalar(radius);
    slot.m.uniforms.uColor.value.setHex(color);
    slot.m.uniforms.uW.value = width;
    slot.life = slot.max = Math.max(0.05, life);
    slot.peak = peak;
    slot.mesh.visible = true;
  }

  /**
   * Continuous trail following a moving source.
   * source: fn()->{x,y,z} | Object3D | Vector3. Returns { stop() }.
   */
  emitTrail(source, opts = {}) {
    const e = {
      alive: true, kind: 'trail', src: source, acc: 0, age: 0,
      rate: opts.rate ?? 60, dur: opts.dur ?? Infinity,
      opts: {
        color: opts.color ?? 0xffe9b0, color2: opts.color2 ?? null,
        size: opts.size ?? 0.13, life: opts.life ?? 0.4, spread: opts.spread ?? 0.06,
        gravity: opts.gravity ?? 0.4, additive: opts.additive !== false,
        vel: opts.vel ?? null, flicker: !!opts.flicker,
      },
      stop() { this.alive = false; },
    };
    this.emitters.push(e);
    return e;
  }

  /**
   * Ambient field emitter (arena motes, aura loops). Returns { stop() }.
   * opts: { center|getCenter, radius, y0, y1, rate, color, color2, size, life,
   *         vel:{x,y,z}, sway, flicker, additive }
   * (handle.rate may be changed live to fade a field up or down.)
   */
  ambient(opts = {}) {
    const e = {
      alive: true, kind: 'ambient', src: opts.getCenter ?? opts.center ?? { x: 0, y: 0, z: 0 },
      acc: 0, age: 0, rate: opts.rate ?? 6, dur: opts.dur ?? Infinity,
      opts: {
        radius: opts.radius ?? 9, y0: opts.y0 ?? 0.2, y1: opts.y1 ?? 4,
        color: opts.color ?? 0xfff6c8, color2: opts.color2 ?? null,
        size: opts.size ?? 0.09, life: opts.life ?? 4,
        vel: opts.vel ?? { x: 0, y: 0.22, z: 0 },
        sway: opts.sway ?? 0.5, flicker: !!opts.flicker, additive: opts.additive !== false,
      },
      stop() { this.alive = false; },
    };
    this.emitters.push(e);
    return e;
  }

  update(dt) {
    if (dt > 0) {
      // continuous emitters
      for (let i = this.emitters.length - 1; i >= 0; i--) {
        const e = this.emitters[i];
        e.age += dt;
        if (!e.alive || e.age > e.dur) { this.emitters.splice(i, 1); continue; }
        e.acc += e.rate * dt;
        const n = Math.floor(e.acc);
        if (n <= 0) continue;
        e.acc -= n;
        const o = e.opts;
        const L = this._layer(o.additive);
        readPos(e.src, _v);
        for (let k = 0; k < n && k < 24; k++) {
          const c = this._mixColor(o.color, o.color2);
          if (e.kind === 'trail') {
            const sp = o.spread;
            const vx = o.vel ? o.vel.x : (Math.random() - 0.5) * 0.4;
            const vy = o.vel ? o.vel.y : (Math.random() - 0.2) * 0.4;
            const vz = o.vel ? o.vel.z : (Math.random() - 0.5) * 0.4;
            L.spawn(_v.x + (Math.random() - 0.5) * sp, _v.y + (Math.random() - 0.5) * sp, _v.z + (Math.random() - 0.5) * sp,
              vx, vy, vz, o.life * (0.7 + Math.random() * 0.6),
              o.size * (0.75 + Math.random() * 0.5), o.size * 0.2,
              c.r, c.g, c.b, o.gravity, 1.5, 0, 0, o.flicker ? 2 : 0);
          } else {
            const th = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * o.radius;
            L.spawn(_v.x + Math.cos(th) * r, o.y0 + Math.random() * (o.y1 - o.y0), _v.z + Math.sin(th) * r,
              o.vel.x + (Math.random() - 0.5) * 0.1, o.vel.y * (0.6 + Math.random() * 0.8), o.vel.z + (Math.random() - 0.5) * 0.1,
              o.life * (0.6 + Math.random() * 0.8), o.size * (0.7 + Math.random() * 0.7), o.size * 0.5,
              c.r, c.g, c.b, 0, 0, o.sway, 0.8 + Math.random() * 0.8, o.flicker ? 2 : 1);
          }
        }
      }
      // flashes
      for (const f of this.flashes) {
        if (f.life <= 0) continue;
        f.life -= dt;
        if (f.life <= 0) { f.s.visible = false; f.m.opacity = 0; continue; }
        const t = 1 - f.life / f.max;
        const k = 1 - (1 - t) * (1 - t) * (1 - t);
        const sc = f.s0 + (f.s1 - f.s0) * k;
        f.s.scale.set(sc, sc * f.sy, 1);
        f.m.opacity = f.peak * (1 - t) * (1 - t) * Math.min(1, t * 14 + 0.25);
      }
      // shockwave rings
      for (const r of this.rings) {
        if (r.life <= 0) continue;
        r.life -= dt;
        if (r.life <= 0) { r.mesh.visible = false; continue; }
        const t = 1 - r.life / r.max;
        r.m.uniforms.uR.value = 0.08 + 0.84 * (1 - (1 - t) * (1 - t));
        r.m.uniforms.uAlpha.value = r.peak * (1 - t) * (1 - t);
      }
    }
    this.normal.update(dt);
    this.additive.update(dt);
    this.streaks.update(dt);
  }

  activeCount() { return this.normal.count + this.additive.count + this.streaks.count; }

  /** Stop all continuous emitters (live particles fade out naturally). */
  stopAll() { for (const e of this.emitters) e.alive = false; }

  dispose() {
    this.emitters.length = 0;
    this.normal.dispose(this.scene);
    this.additive.dispose(this.scene);
    this.streaks.dispose(this.scene);
    for (const f of this.flashes) { this.scene.remove(f.s); f.m.dispose(); }
    for (const r of this.rings) { this.scene.remove(r.mesh); r.m.dispose(); }
    this.ringGeo.dispose();
    this._offResize?.();
  }
}

export function createParticles(scene, opts) { return new Particles(scene, opts); }
