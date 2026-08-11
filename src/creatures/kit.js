// =============================================================================
// LUMENFALL — src/creatures/kit.js
// Shared parts-kit for every Kindred model (src/creatures/models/<id>.js).
// =============================================================================
//
// WHY THIS FILE EXISTS
// Every one of the 48 Kindred is built from the same small vocabulary of
// stylized, low-poly building blocks. This kit is that vocabulary. Two other
// agents build the remaining 39 species by reading THIS file, animator.js and
// the 9 starter models (kindlet.js, charvane.js, pyrelith.js, nixling.js,
// maelfin.js, tidelorn.js, thistlit.js, briarback.js, sylvathorn.js) as
// ground truth — so every export below is documented with its shape, its
// coordinate convention and a runnable example. Read the starter models for
// real end-to-end usage; this header is the quick-reference.
//
// CONVENTIONS (apply to every model builder, see also CONTRACTS_ADDENDUM.md):
//   - A creature's root Group faces +Z, feet touch y=0, overall height should
//     land near SPECIES[id].size (registry.js rescales, but build at a
//     sensible real scale — roughly meters — so proportions stay sane).
//     Don't hand-compute the feet-at-y=0 offset across legs/tail/body — build
//     naturally, then call `groundPlant(root)` as your last line (see below).
//   - "Rest pose" = whatever local position/rotation/scale a part has the
//     moment your build_<id>(kit) function returns. animator.js snapshots
//     that as the idle baseline and animates OFFSETS from it. Build your
//     creature already standing in its natural idle stance.
//   - Attach children with `at(parent, child, x, y, z, opts)` — it accepts
//     both plain THREE.Object3D parts (orb, capsule, horn, ...) AND the
//     `{ group, ... }` wrapper objects returned by the compound helpers
//     (wing, tailChain, leg, flame, mote, crystal is a plain Group). It
//     always returns what you passed in, so you keep the handle:
//       const tail = at(body, tailChain(5, m), 0, 0.3, -0.4);
//       // tail.pivots is still there for the model to hand to the animator
//   - Every mesh you want shadows on: set `.castShadow = true` yourself (or
//     rely on registry.js, which turns it on for every mesh in the tree).
//
// LORE TOUCH (optional but recommended): every Kindred carries a mote of
// starlight in its chest, its "heartspark" (Design Bible §1). Consider
// giving your model a small `heartspark()` glow on the chest/core and
// dropping it into `parts.fx` — it's a cheap, on-brand detail that reads at
// a glance and every starter model does it; see kindlet.js for the simplest
// example.
//
// EXPORTS (grouped) — see each function's JSDoc below for full options.
//   Materials
//     mat(color, opts) -> Material                      stylized standard/unlit material
//   Primitive shapes (return THREE.Mesh unless noted)
//     orb(r, mat, opts)                                  sphere, non-uniform scale via opts
//     capsule(r, len, mat, opts)                         Y-axis capsule (limbs, torsos)
//     cone(r, h, mat, opts)                               base-centered cone
//     box(w, h, d, mat, opts)                             centered box
//     teardrop(mat, opts)                                 lathe: pointed top, round base
//     bulb(mat, opts)                                     lathe: bulging body, narrow neck
//     blob(r, mat, opts)                                  noise-displaced sphere, organic body
//   Face parts
//     eye(r, opts) -> Group                                sclera+iris+glint+named 'eyelid' child
//     brow(len, mat, opts) -> Mesh
//     fang(len, mat, opts) -> Mesh                          base at origin, tip hangs -Y
//   Appendages
//     ear(len, mat, opts) -> Mesh                            base at origin, +Y default
//     horn(len, mat, opts) -> Mesh                           curved cone, base at origin
//     wing(len, mat, opts) -> { group, bones }                membrane|feathered|energy
//     fin(len, mat, opts) -> Group                            single pivot, base at origin
//     tailChain(segments, mat, opts) -> { group, pivots }     chain extends toward -Z
//     leg(len, mat, opts) -> { group, hip, knee, foot }       group === hip
//   Foliage / decoration (return THREE.Mesh/Group unless noted)
//     leafBlade(len, mat, opts) -> Mesh                        flat, pointed, lies in XY plane
//     petal(len, mat, opts) -> Mesh                             flat, rounded
//     crystal(r, mat, opts) -> Group                            faceted shell + glowing core
//     fluffTuft(r, mat, opts) -> Group                          cluster of soft puffs
//     shellPlate(w, h, d, mat, opts) -> Mesh                    gently domed armor plate
//   Continuous FX (return { group, update(dt) } — push into parts.fx)
//     flame(height, opts) -> { group, update(dt, intensity) }   flickering layered flame
//     mote(count, opts) -> { group, update(dt) }                drifting glow motes
//     heartspark(r, color, opts) -> { group, update(dt) }        the lore chest-glow (see above)
//   Composition & palette
//     at(parent, child, x, y, z, opts) -> child                 attach + position sugar
//     groundPlant(root) -> root                                 shift so feet sit exactly at y=0
//     palette(aspectIds) -> { primary, secondary, accent, eye, emissive }  (hex ints)
//   Variants
//     hollowify(group, parts?) -> group                         gray, cracked, dim (mutates)
//     gleamify(group, parts?) -> group                          hue-shift + sparkle (mutates)
//
// EXAMPLE — a tiny two-part creature (see kindlet.js etc. for full builds):
//   import * as THREE from 'three';
//   import * as kit from '../kit.js';
//   export function build_example(k = kit) {
//     const pal = k.palette(['ember']);
//     const skin = k.mat(pal.primary);
//     const root = new THREE.Group();
//     const body = k.blob(0.3, skin, { seed: 3 });
//     root.add(body);
//     const head = k.at(body, k.orb(0.18, skin), 0, 0.32, 0.18);
//     const eyeL = k.at(head, k.eye(0.045, { skinColor: pal.primary }), 0.09, 0.03, 0.15);
//     const eyeR = k.at(head, k.eye(0.045, { skinColor: pal.primary }), -0.09, 0.03, 0.15);
//     const spark = k.heartspark(0.045, pal.eye);
//     k.at(body, spark, 0, 0.05, 0.24);
//     return {
//       group: k.groundPlant(root),
//       parts: { body, head, eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')], fx: [spark] },
//       hints: { personality: 'eager', locomotion: 'hop' },
//     };
//   }
// =============================================================================

import * as THREE from 'three';
import { clamp, clamp01 } from '../core/math.js';
import { hashStr, seededRandom } from '../core/rng.js';
import { ASPECTS } from '../data/aspects.js';

// ------------------------------------------------------------------ Materials

/**
 * A stylized material factory used for every surface in the game's creature
 * (and by convention, prop) art. Defaults to flat-shaded MeshStandardMaterial
 * with a tiny per-call roughness jitter so surfaces don't read as uniform
 * plastic. Pass `unlit:true` for an emissive-looking, lighting-independent
 * material (eyes' glint, energy wings, hard-light antlers); add
 * `additive:true` on top for glow/particle-style blending.
 *
 * @param {number} color - hex color, e.g. 0xff7a3c
 * @param {object} [opts]
 * @param {number} [opts.rough=0.75] - roughness (standard material only)
 * @param {number} [opts.metal=0.05] - metalness (standard material only)
 * @param {boolean} [opts.flat=true] - flatShading
 * @param {number|null} [opts.emissive=null] - emissive color hex
 * @param {number} [opts.emissiveIntensity=1]
 * @param {boolean} [opts.vertexColors=false] - read geometry 'color' attribute
 * @param {boolean} [opts.transparent=false]
 * @param {number} [opts.opacity=1]
 * @param {THREE.Side} [opts.side=THREE.FrontSide]
 * @param {boolean} [opts.unlit=false] - use MeshBasicMaterial instead
 * @param {boolean} [opts.additive=false] - AdditiveBlending, implies unlit-friendly settings
 * @returns {THREE.Material}
 */
export function mat(color, opts = {}) {
  const {
    rough = 0.75, metal = 0.05, flat = true, emissive = null, emissiveIntensity = 1,
    vertexColors = false, transparent = false, opacity = 1, side = THREE.FrontSide,
    unlit = false, additive = false,
  } = opts;
  if (unlit || additive) {
    return new THREE.MeshBasicMaterial({
      color, vertexColors, side,
      transparent: transparent || additive || opacity < 1,
      opacity,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !additive,
    });
  }
  const roughJitter = (Math.random() - 0.5) * 0.08;
  const m = new THREE.MeshStandardMaterial({
    color, roughness: clamp01(rough + roughJitter), metalness: metal, flatShading: flat,
    vertexColors, transparent, opacity, side,
  });
  if (emissive != null) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = emissiveIntensity; }
  return m;
}

// -------------------------------------------------------------- Noise helper

// Deterministic, seeded, domain-warped sine "noise" — NOT true Perlin/Simplex,
// but cheap, dependency-free and plenty organic-looking for gentle body bumps.
function fakeNoise3(x, y, z, seed) {
  const s = seed * 12.9898 + 1;
  return (
    Math.sin(x * 3.1 + s + y * 1.7) * Math.cos(y * 2.6 - s * 0.7 + z * 1.3) +
    Math.sin(z * 2.1 + x * 1.1 + s * 0.4) * 0.6
  ) * 0.5;
}

// ---------------------------------------------------------------- Primitives

/**
 * A sphere, optionally squashed/stretched per-axis. The workhorse for heads,
 * bellies, cheeks, knuckles, berries, buds — anything round.
 * @param {number} r
 * @param {THREE.Material} m
 * @param {object} [opts] {sx=1,sy=1,sz=1, wSeg=10, hSeg=8}
 * @returns {THREE.Mesh}
 */
export function orb(r, m, opts = {}) {
  const { sx = 1, sy = 1, sz = 1, wSeg = 10, hSeg = 8 } = opts;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, wSeg, hSeg), m);
  mesh.scale.set(sx, sy, sz);
  return mesh;
}

/**
 * A capsule (rounded cylinder) aligned to local +Y — the default choice for
 * limbs, torsos, necks, tails-as-a-single-piece.
 *
 * GOTCHA when this mesh is ALSO an attachment anchor for other parts (e.g. a
 * capsule "torso" that a head/legs/tail get `at()`-ed onto): if you need it
 * lying along a different axis, rotate the GEOMETRY
 * (`mesh.geometry.rotateZ(Math.PI/2)`), not `mesh.rotation`. Rotating the
 * mesh's own transform also rotates the local coordinate frame every child
 * you attach to it is measured in, silently scrambling their x/y/z offsets.
 * Geometry rotation is baked into the vertices, leaving `mesh.rotation` at
 * identity so children behave exactly as authored. See charvane.js.
 * @param {number} r
 * @param {number} len - length of the straight midsection (total length = len + 2r)
 * @param {THREE.Material} m
 * @param {object} [opts] {capSeg=4, radSeg=8}
 * @returns {THREE.Mesh}
 */
export function capsule(r, len, m, opts = {}) {
  const { capSeg = 4, radSeg = 8 } = opts;
  return new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(len, 0.001), capSeg, radSeg), m);
}

/**
 * A cone with its BASE at the local origin, apex pointing +Y (unless you
 * flip it). Good for spikes, quills, snouts, small horns that don't need a
 * bend (use `horn()` for a curved one).
 * @param {number} r - base radius
 * @param {number} h - height
 * @param {THREE.Material} m
 * @param {object} [opts] {segments=8, flip=false} flip points the apex -Y instead
 * @returns {THREE.Mesh}
 */
export function cone(r, h, m, opts = {}) {
  const { segments = 8, flip = false } = opts;
  const geo = new THREE.ConeGeometry(r, h, segments);
  geo.translate(0, (flip ? -h : h) / 2, 0);
  if (flip) geo.rotateX(Math.PI);
  return new THREE.Mesh(geo, m);
}

/**
 * A centered box. Useful for crates-like props but also crude armor bits,
 * teeth, and (with tiny dims + emissive mat) hollowed crack-seam strips.
 * @returns {THREE.Mesh}
 */
export function box(w, h, d, m, opts = {}) {
  const { segments = 1 } = opts;
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d, segments, segments, segments), m);
}

function lathePoints(pts, segments) {
  return new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(Math.max(p[0], 0.0006), p[1])), segments);
}

/**
 * Lathed droplet: pointed at the top (y=height), rounding out to its widest
 * near the base, base sits at y=0. Great for crests (Nixling), fruit,
 * lanterns, hanging dew/berries.
 * @param {THREE.Material} m
 * @param {object} [opts] {height=0.3, width=0.18, segments=10}
 * @returns {THREE.Mesh}
 */
export function teardrop(m, opts = {}) {
  const { height = 0.3, width = 0.18, segments = 10 } = opts;
  const steps = 10;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 at tip, 1 at base
    const r = width * Math.sin(Math.pow(t, 0.6) * Math.PI * 0.5) * (0.35 + 0.65 * t);
    pts.push([r, height * (1 - t)]);
  }
  return new THREE.Mesh(lathePoints(pts, segments), m);
}

/**
 * Lathed bulb: a rounded belly pinched into a narrower neck near the top —
 * good for oozes, gourds, jars, jelly bells (used a lot by the second batch
 * of Kindred models: oozel, sludgemaw, jellune...).
 * @param {THREE.Material} m
 * @param {object} [opts] {height=0.26, width=0.2, neck=0.35, segments=10}
 * @returns {THREE.Mesh}
 */
export function bulb(m, opts = {}) {
  const { height = 0.26, width = 0.2, neck = 0.35, segments = 10 } = opts;
  const pts = [
    [0, height], [width * 0.22, height * 0.86], [width * neck, height * 0.62],
    [width * 0.34, height * 0.5], [width, height * 0.28], [width * 0.92, height * 0.08],
    [width * 0.5, 0], [0, 0],
  ];
  return new THREE.Mesh(lathePoints(pts, segments), m);
}

/**
 * A sphere displaced by cheap deterministic noise — the go-to for organic,
 * slightly lumpy bodies (torsos, bellies, mushroom caps, boulders).
 * Same `seed` always yields the same bumps (stable across reloads/instances
 * of the same species using the same seed).
 * @param {number} r
 * @param {THREE.Material} m
 * @param {object} [opts] {noise=0.16, seed=1, wSeg=10, hSeg=8, squash:{x,y,z}}
 * @returns {THREE.Mesh}
 */
export function blob(r, m, opts = {}) {
  const { noise = 0.16, seed = 1, wSeg = 10, hSeg = 8, squash = { x: 1, y: 1, z: 1 } } = opts;
  const geo = new THREE.SphereGeometry(r, wSeg, hSeg);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fakeNoise3(v.x * 2.2, v.y * 2.2, v.z * 2.2, seed);
    v.multiplyScalar(1 + n * noise);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, m);
  mesh.scale.set(squash.x, squash.y, squash.z);
  return mesh;
}

// ---------------------------------------------------------------- Face parts

/**
 * A big, readable creature eye: white sclera, a colored iris facing +Z, a
 * small unlit "glint" highlight (named 'eyeGlint') and a skin-colored
 * 'eyelid' mesh whose Y-scale controls openness (~0.06 = open, ~1 = closed).
 * The bible calls for big readable eyes with a specular highlight on every
 * species — this is the one true way to build one.
 *
 * IMPORTANT: grab the eyelid with `eyeGroup.getObjectByName('eyelid')` and
 * put it in `parts.eyelids` so animator.js can blink it — see any starter.
 *
 * @param {number} [r=0.05]
 * @param {object} [opts]
 * @param {number} [opts.irisColor=0x1c1c22]
 * @param {number} [opts.scleraColor=0xffffff]
 * @param {boolean} [opts.pupil=true]
 * @param {number} [opts.glintSize=r*0.32]
 * @param {number} [opts.skinColor=0x33323a] - color of the eyelid (match your head skin!)
 * @returns {THREE.Group}
 */
export function eye(r = 0.05, opts = {}) {
  const {
    irisColor = 0x1c1c22, scleraColor = 0xffffff, pupil = true,
    glintSize = r * 0.32, skinColor = 0x33323a,
  } = opts;
  const group = new THREE.Group(); group.name = 'eye';
  const sclera = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat(scleraColor, { rough: 0.3 }));
  sclera.name = 'eyeSclera';
  group.add(sclera);
  if (pupil) {
    const iris = new THREE.Mesh(new THREE.SphereGeometry(r * 0.62, 8, 6), mat(irisColor, { unlit: true }));
    iris.name = 'eyeIris';
    iris.position.z = r * 0.6;
    group.add(iris);
  }
  const glint = new THREE.Mesh(new THREE.SphereGeometry(glintSize, 6, 5), mat(0xffffff, { unlit: true }));
  glint.name = 'eyeGlint';
  glint.position.set(r * 0.28, r * 0.32, r * 0.84);
  group.add(glint);
  const lid = new THREE.Mesh(new THREE.SphereGeometry(r * 1.08, 10, 8), mat(skinColor, { rough: 0.85 }));
  lid.name = 'eyelid';
  lid.position.z = r * 0.12;
  lid.scale.set(1, 0.06, 0.7); // open by default (thin sliver, effectively hidden)
  group.add(lid);
  return group;
}

/**
 * A thin curved brow ridge, lies along local X (rotate/attach above an eye).
 * @returns {THREE.Mesh}
 */
export function brow(len, m, opts = {}) {
  const { thickness = len * 0.22 } = opts;
  const mesh = capsule(thickness * 0.5, Math.max(len - thickness, 0.01), m, { capSeg: 3, radSeg: 6 });
  mesh.rotation.z = Math.PI / 2;
  return mesh;
}

/**
 * A sharp fang/tusk. Base at the origin, tip hangs toward -Y by default —
 * attach at the gumline and it points down correctly with no extra rotation.
 * @returns {THREE.Mesh}
 */
export function fang(len, m, opts = {}) {
  const { r = len * 0.28, segments = 6 } = opts;
  return cone(r, len, m, { segments, flip: true });
}

// ----------------------------------------------------------------- Appendages

/**
 * An ear. Base at the origin, extends +Y. `floppy:true` gives a flat,
 * leaf-like droop (use for hounds/rabbits); default is a small flattened
 * perky cone (use for foxes/bats/alert creatures).
 * @returns {THREE.Mesh}
 */
export function ear(len, m, opts = {}) {
  const { width = len * 0.55, floppy = false, segments = 8 } = opts;
  if (floppy) return leafBlade(len, m, { width, segments: 6 });
  const geo = new THREE.ConeGeometry(width * 0.5, len, segments, 1);
  geo.translate(0, len / 2, 0);
  geo.scale(1, 1, 0.42);
  return new THREE.Mesh(geo, m);
}

/**
 * A curved horn. Base at the origin, grows toward +Y and bends toward +X as
 * it rises (quadratic bend, so the tip sweeps most). Mirror `bend` negative
 * for the other side, or rotate the whole mesh via `at()`.
 * @param {number} len
 * @param {THREE.Material} m
 * @param {object} [opts] {baseR=len*0.16, tipR=len*0.02, bend=0.5, segments=8}
 * @returns {THREE.Mesh}
 */
export function horn(len, m, opts = {}) {
  const { baseR = len * 0.16, tipR = len * 0.02, bend = 0.5, segments = 8 } = opts;
  const geo = new THREE.CylinderGeometry(tipR, baseR, len, segments, 6, false);
  geo.translate(0, len / 2, 0);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = clamp01(v.y / len);
    v.x += bend * t * t * len;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, m);
}

function bladeShape(len, width, pointed) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(len * 0.38, width * 0.55, pointed ? len : len * 0.88, pointed ? 0 : width * 0.12);
  s.quadraticCurveTo(len * 0.38, -width * 0.5, 0, 0);
  return s;
}

/**
 * A flat, pointed blade — grass, thistle quills, thin flower leaves, feather
 * stand-ins. Lies flat in the local XY plane, length along +X, base at the
 * origin. Orient it with `at(parent, blade, x, y, z, {rz, ry})`.
 * @returns {THREE.Mesh}
 */
export function leafBlade(len, m, opts = {}) {
  const { width = len * 0.32, segments = 6 } = opts;
  return new THREE.Mesh(new THREE.ShapeGeometry(bladeShape(len, width, true), segments), m);
}

/**
 * A flat, rounded blade — flower petals, lily pads, soft leaves. Same
 * convention as leafBlade.
 * @returns {THREE.Mesh}
 */
export function petal(len, m, opts = {}) {
  const { width = len * 0.6, segments = 6 } = opts;
  return new THREE.Mesh(new THREE.ShapeGeometry(bladeShape(len, width, false), segments), m);
}

/**
 * A wing/sail-fin membrane made of `boneCount` chained pivots so it can be
 * flapped procedurally. `group` is the shoulder pivot (attach this to the
 * body); `bones` is the ordered [shoulder, ...mid, tip] pivot chain for the
 * animator to rotate. Local convention: +X = spanwise (root→tip), +Y =
 * chordwise (leading/trailing edge), so **flapping = rotating a bone around
 * its local Z** (this sweeps the tip up/down in Y as X carries most of the
 * mass). Mirror a left/right pair with `group.scale.x = -1`.
 * @param {number} len - total span
 * @param {THREE.Material} m
 * @param {object} [opts] {style:'membrane'|'feathered'|'energy', width=len*0.62, droop=0.12, bones=2}
 * @returns {{group: THREE.Group, bones: THREE.Group[]}}
 */
export function wing(len, m, opts = {}) {
  const { style = 'membrane', width = len * 0.62, droop = 0.12, bones: boneCount = 2 } = opts;
  const root = new THREE.Group(); root.name = 'wingRoot';
  const bones = [root];
  let parent = root;
  const segLen = len / boneCount;
  const segMat = style === 'energy' ? mat(m.color ? m.color.getHex() : 0xffe9b0, { unlit: true, additive: true, opacity: 0.55 }) : m;
  for (let i = 0; i < boneCount; i++) {
    let bone = parent;
    if (i > 0) {
      bone = new THREE.Group(); bone.name = `wingBone${i}`;
      bone.position.set(segLen, -droop * segLen * 0.5, 0);
      parent.add(bone);
      bones.push(bone);
      parent = bone;
    }
    const w0 = width * (1 - i / boneCount) + width * 0.1;
    const w1 = width * (1 - (i + 1) / boneCount) + width * 0.16;
    if (style === 'feathered') {
      const cluster = new THREE.Group();
      const featherCount = 3;
      for (let f = 0; f < featherCount; f++) {
        const fLen = segLen * (0.92 - f * 0.1);
        const feather = leafBlade(fLen, segMat, { width: w0 * 0.42 * (1 - f * 0.1), segments: 5 });
        feather.position.set(0, 0, 0);
        feather.rotation.z = -0.1 - f * 0.22;
        cluster.add(feather);
      }
      bone.add(cluster);
    } else {
      const geo = new THREE.ShapeGeometry(wingSegmentShape(segLen * 1.08, w0 * 0.5, w1 * 0.5), 6);
      const seg = new THREE.Mesh(geo, segMat);
      seg.rotation.x = -Math.PI * 0.42 + droop * 0.3;
      bone.add(seg);
    }
  }
  return { group: root, bones };
}

function wingSegmentShape(len, w0, w1) {
  const s = new THREE.Shape();
  s.moveTo(0, w0 * 0.15);
  s.quadraticCurveTo(len * 0.5, w0 + len * 0.22, len, w1);
  s.lineTo(len, -w1 * 0.4);
  s.quadraticCurveTo(len * 0.5, -w0 * 0.35, 0, -w0 * 0.15);
  s.closePath();
  return s;
}

/**
 * A single-pivot fin (dorsal sails, gill fronds, flippers, tail-fin
 * flourishes). `group` IS the pivot — base at the origin, blade spans +X.
 * Wag it by rotating `group.rotation.z` (or reorient via `at()` first).
 * @returns {THREE.Group}
 */
export function fin(len, m, opts = {}) {
  const { width = len * 0.7, curve = 0.2 } = opts;
  const group = new THREE.Group(); group.name = 'fin';
  const geo = new THREE.ShapeGeometry(wingSegmentShape(len, width * 0.5, width * 0.18), 6);
  const mesh = new THREE.Mesh(geo, m);
  mesh.rotation.x = -Math.PI * 0.5 + curve;
  group.add(mesh);
  return group;
}

/**
 * A chain of tapering pivots for tails (and equally, necks/manes/tentacles).
 * `group` is the root pivot (attach this to the body); the chain extends
 * toward local -Z by default (i.e. trails behind a +Z-facing creature with
 * no extra rotation needed). `pivots` is ordered root→tip for the animator
 * to wave with a per-segment phase offset.
 * @param {number} segments
 * @param {THREE.Material} m
 * @param {object} [opts] {segLen=0.14, startR=0.05, endR=0.015, tipTuft=false, tipMat}
 * @returns {{group: THREE.Group, pivots: THREE.Group[]}}
 */
export function tailChain(segments, m, opts = {}) {
  const { segLen = 0.14, startR = 0.05, endR = 0.015, tipTuft = false, tipMat = m } = opts;
  const root = new THREE.Group(); root.name = 'tailRoot';
  const pivots = [root];
  let parent = root;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments, t1 = (i + 1) / segments;
    const r0 = startR + (endR - startR) * t0;
    const r1 = startR + (endR - startR) * t1;
    const seg = capsule((r0 + r1) * 0.5, segLen, m, { capSeg: 3, radSeg: 6 });
    seg.rotation.x = Math.PI / 2; // capsule's natural axis is Y; lay it along Z
    seg.position.z = -segLen * 0.5;
    parent.add(seg);
    if (i === segments - 1 && tipTuft) {
      const tuft = fluffTuft(r1 * 2.4, tipMat, { count: 4, seed: i + 1 });
      tuft.position.z = -segLen;
      parent.add(tuft);
    }
    if (i < segments - 1) {
      const next = new THREE.Group(); next.name = `tailPivot${i + 1}`;
      next.position.z = -segLen;
      parent.add(next);
      pivots.push(next);
      parent = next;
    }
  }
  return { group: root, pivots };
}

/**
 * A jointed 2-segment leg with a foot. `group === hip` (the attach/rotation
 * point at the top), `knee` is the mid-joint pivot, `foot` is the ground
 * contact mesh (toe points +Z). Walk cycles rotate `hip.rotation.x` (thigh
 * swing) and `knee.rotation.x` (knee bend, keep it >= 0 like a real joint).
 * @param {number} len - total leg length, hip to ground
 * @param {THREE.Material} m
 * @param {object} [opts] {footMat=m, thighR=len*0.16, shinR=len*0.11, footLen=len*0.3}
 * @returns {{group: THREE.Group, hip: THREE.Group, knee: THREE.Group, foot: THREE.Mesh}}
 */
export function leg(len, m, opts = {}) {
  const { footMat = m, thighR = len * 0.16, shinR = len * 0.11, footLen = len * 0.3 } = opts;
  const hip = new THREE.Group(); hip.name = 'legHip';
  const thighLen = len * 0.5, shinLen = len * 0.42;
  const thigh = capsule(thighR, thighLen, m);
  thigh.position.y = -thighLen / 2 - thighR * 0.25;
  hip.add(thigh);
  const knee = new THREE.Group(); knee.name = 'legKnee';
  knee.position.y = -thighLen - thighR * 0.25;
  hip.add(knee);
  const shin = capsule(shinR, shinLen, m);
  shin.position.y = -shinLen / 2 - shinR * 0.2;
  knee.add(shin);
  const foot = box(shinR * 1.7, shinR * 0.85, footLen, footMat);
  foot.position.set(0, -shinLen - shinR * 0.5, footLen * 0.3);
  knee.add(foot);
  return { group: hip, hip, knee, foot };
}

// ------------------------------------------------------------ Decoration/FX

/**
 * A faceted crystal shard with a small glowing core. `group.userData.core`
 * exposes the inner mesh if you want to pulse it yourself; or just wrap it
 * with an fx entry (see `heartspark` for exactly this pattern).
 * @returns {THREE.Group}
 */
export function crystal(r, m, opts = {}) {
  const { coreColor = 0xffffff, detail = 0 } = opts;
  const group = new THREE.Group(); group.name = 'crystal';
  const outer = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), m);
  group.add(outer);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.42, 0), mat(coreColor, { unlit: true }));
  core.name = 'crystalCore';
  group.add(core);
  group.userData.core = core;
  return group;
}

/**
 * A soft cluster of overlapping puffs — fur tufts, moss clumps, cheek fluff.
 * @returns {THREE.Group}
 */
export function fluffTuft(r, m, opts = {}) {
  const { count = 5, spread = r * 0.85, seed = 1 } = opts;
  const group = new THREE.Group(); group.name = 'fluffTuft';
  const rng = seededRandom(seed * 8191 + count * 131);
  for (let i = 0; i < count; i++) {
    const rr = r * (0.55 + rng() * 0.55);
    const puff = orb(rr, m, { sy: 1.1 + rng() * 0.2 });
    puff.position.set((rng() - 0.5) * spread, (rng() - 0.5) * spread * 0.6, (rng() - 0.5) * spread);
    group.add(puff);
  }
  return group;
}

/**
 * A gently domed armor plate (chest/back/shoulder scutes, shell segments).
 * @returns {THREE.Mesh}
 */
export function shellPlate(w, h, d, m, opts = {}) {
  const { bulge = 0.15, segments = 3 } = opts;
  const geo = new THREE.BoxGeometry(w, h, d, segments, segments, 1);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const nx = w > 0 ? v.x / (w / 2) : 0, ny = h > 0 ? v.y / (h / 2) : 0;
    const b = clamp01(1 - nx * nx) * clamp01(1 - ny * ny);
    v.z += b * bulge;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, m);
}

/**
 * A flickering layered flame (tail-tip candle-flames, torches, ember crowns).
 * Returns a self-driving fx object: push it into `parts.fx` so
 * animator.js ticks it every frame independent of the pose state.
 * @param {number} height
 * @param {object} [opts] {colors=[deep,mid,tip], width=height*0.55, seed=1}
 * @returns {{group: THREE.Group, update(dt, intensity?): void}}
 */
export function flame(height = 0.3, opts = {}) {
  const { colors = [0xd8380f, 0xff8a2e, 0xffe089], width = height * 0.55, seed = 1 } = opts;
  const group = new THREE.Group(); group.name = 'flame';
  const layers = [];
  const n = colors.length;
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const h = height * (1 - t * 0.55);
    const w = width * (1 - t * 0.62);
    const m = mat(colors[i], { unlit: true, transparent: true, opacity: 0.92 - t * 0.12, side: THREE.DoubleSide });
    const mesh = leafBlade(h, m, { width: w, segments: 4 });
    mesh.rotation.z = Math.PI / 2; // point +Y instead of leafBlade's default +X
    mesh.position.y = i * height * 0.1;
    group.add(mesh);
    layers.push(mesh);
  }
  const rng = seededRandom(seed * 104729 + 17);
  const phase = rng() * Math.PI * 2;
  let t = 0;
  function update(dt, intensity = 1) {
    t += dt;
    for (let i = 0; i < layers.length; i++) {
      const L = layers[i];
      const sx = 1 + Math.sin(t * 9 + phase + i * 1.7) * 0.09 * intensity;
      const sy = 1 + Math.sin(t * 5.3 + phase + i * 0.6) * 0.12 * intensity;
      L.scale.set(sx, sy, 1);
      L.rotation.y = Math.sin(t * 2.2 + i * 0.8 + phase) * 0.3;
    }
    group.rotation.z = Math.sin(t * 1.7 + phase) * 0.05 * intensity;
  }
  return { group, update };
}

/**
 * A handful of small glowing motes drifting in a loose orbit around the
 * attach point — ember drift, pollen, sparkles, dust. Self-driving fx:
 * push into `parts.fx`.
 * @param {number} count
 * @param {object} [opts] {color=0xffe9b0, size=0.035, radius=0.3, height=0.15, speed=1, seed=1}
 * @returns {{group: THREE.Group, update(dt): void}}
 */
export function mote(count = 6, opts = {}) {
  const { color = 0xffe9b0, size = 0.035, radius = 0.3, height = 0.15, speed = 1, seed = 1 } = opts;
  const group = new THREE.Group(); group.name = 'motes';
  const rng = seededRandom(seed * 7919 + count * 101);
  const n = Math.max(1, count);
  const items = new Array(n);
  const m = mat(color, { unlit: true, transparent: true, opacity: 0.85 });
  for (let i = 0; i < n; i++) {
    const s = size * (0.7 + rng() * 0.6);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(s, 6, 5), m.clone());
    mesh.name = 'mote';
    group.add(mesh);
    items[i] = {
      mesh, a: rng() * Math.PI * 2, r: radius * (0.5 + rng() * 0.6), h: height * (0.4 + rng() * 0.8),
      sp: (0.4 + rng() * 0.8) * speed, ph: rng() * Math.PI * 2, by: rng() * Math.PI * 2,
    };
  }
  let t = 0;
  function update(dt) {
    t += dt;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const ang = it.a + t * it.sp * 0.6;
      it.mesh.position.set(Math.cos(ang) * it.r, it.h * 0.5 + Math.sin(t * it.sp + it.by) * it.h * 0.5, Math.sin(ang) * it.r);
      const flick = 0.65 + 0.35 * Math.sin(t * it.sp * 3 + it.ph);
      it.mesh.material.opacity = 0.5 + 0.42 * flick;
      it.mesh.scale.setScalar(0.75 + 0.35 * flick);
    }
  }
  return { group, update };
}

/**
 * The lore chest-glow: every Kindred carries a heartspark of starlight
 * (Design Bible §1). A tiny pulsing crystal core wrapped as a self-driving
 * fx object — push into `parts.fx`, attach the group to the chest.
 * @param {number} [r=0.045]
 * @param {number} [color=0xffe9b0]
 * @returns {{group: THREE.Group, update(dt): void}}
 */
export function heartspark(r = 0.045, color = 0xffe9b0, opts = {}) {
  const { seed = 3 } = opts;
  const core = crystal(r, mat(color, { unlit: true, transparent: true, opacity: 0.9 }), { coreColor: 0xffffff, detail: 0 });
  const rng = seededRandom(seed * 65537 + 3);
  const phase = rng() * Math.PI * 2;
  let t = 0;
  function update(dt) {
    t += dt;
    const p = 1 + Math.sin(t * 2.1 + phase) * 0.16;
    core.scale.setScalar(p);
    core.userData.core.scale.setScalar(1 + Math.sin(t * 2.1 + phase + 0.6) * 0.3);
  }
  return { group: core, update };
}

// ------------------------------------------------------------- Composition

/**
 * Attach + position sugar. Accepts either a plain Object3D (orb, capsule,
 * horn, ...) or a `{ group, ... }` wrapper (wing, tailChain, leg, flame,
 * mote, heartspark). Always returns exactly what you passed in, so you keep
 * access to `.bones` / `.pivots` / `.update` etc.
 * @param {THREE.Object3D} parent
 * @param {THREE.Object3D|{group: THREE.Object3D}} child
 * @param {number} [x=0]
 * @param {number} [y=0]
 * @param {number} [z=0]
 * @param {object} [opts] {rx,ry,rz, s (uniform scale), sx,sy,sz}
 * @returns {*} child, unchanged in type
 */
export function at(parent, child, x = 0, y = 0, z = 0, opts = {}) {
  const obj = child && child.isObject3D ? child : child && child.group;
  if (!obj || !obj.isObject3D) throw new Error('kit.at(): child must be an Object3D or a { group } wrapper');
  obj.position.set(x, y, z);
  if (opts.rx) obj.rotation.x = opts.rx;
  if (opts.ry) obj.rotation.y = opts.ry;
  if (opts.rz) obj.rotation.z = opts.rz;
  if (opts.s != null) obj.scale.setScalar(opts.s);
  if (opts.sx != null || opts.sy != null || opts.sz != null) {
    obj.scale.set(opts.sx ?? obj.scale.x, opts.sy ?? obj.scale.y, opts.sz ?? obj.scale.z);
  }
  parent.add(obj);
  return child;
}

/**
 * The recommended LAST step in every build_<id>() function: measures the
 * assembled model's world-space bounding box and shifts `root` vertically so
 * its lowest point sits exactly at y=0. Hand-computing every part's Y offset
 * so feet-on-the-ground works out exactly is tedious and error-prone the
 * moment you have legs, tails and floating fx all as separate children —
 * this makes "feet at y=0" (the #1 rule in CONTRACTS_ADDENDUM.md's model
 * conventions) trivially guaranteed instead. Call it once, at the very end,
 * on the actual object you're about to return as `group`:
 *   const root = new THREE.Group();
 *   root.add(body); // ...attach everything else to body/root as usual...
 *   return { group: kit.groundPlant(root), parts: {...}, hints: {...} };
 *
 * GOTCHA for anyone rescaling a model afterward (registry.js does this to
 * match SPECIES[id].size): groundPlant works by nudging `root.position.y`,
 * and position does NOT scale with the object's own `.scale` (only
 * child-local geometry does) — so `root.scale.multiplyScalar(s)` AFTER
 * groundPlant reintroduces a vertical offset. Call groundPlant again after
 * any such rescale to correct it (registry.js already does this).
 * @param {THREE.Object3D} root
 * @returns {THREE.Object3D} root, unchanged in type, position.y adjusted
 */
export function groundPlant(root) {
  const box = new THREE.Box3().setFromObject(root);
  if (isFinite(box.min.y)) root.position.y -= box.min.y;
  return root;
}

/**
 * A harmonized color set derived from a species' aspect(s), pulled straight
 * from the single source of truth in data/aspects.js. Single-aspect species
 * get a warm shard-gold eye; dual-aspect species get an eye tinted from
 * their secondary aspect.
 * @param {string[]|string} aspectIds - e.g. ['ember'] or ['bloom','terra']
 * @returns {{primary:number, secondary:number, accent:number, eye:number, emissive:number}}
 */
export function palette(aspectIds = ['neutral']) {
  const ids = Array.isArray(aspectIds) ? aspectIds : [aspectIds];
  const a = ASPECTS[ids[0]] || ASPECTS.neutral;
  const b = ASPECTS[ids[1]] || a;
  const primary = new THREE.Color(a.color);
  const secondary = new THREE.Color(b.color);
  const accent = primary.clone().lerp(new THREE.Color(0xffffff), 0.5);
  const eye = ids.length > 1
    ? secondary.clone().lerp(new THREE.Color(0xffffff), 0.3)
    : new THREE.Color(0xffe9b0).lerp(primary, 0.22);
  const emissive = primary.clone().lerp(new THREE.Color(0xffffff), 0.2);
  return { primary: primary.getHex(), secondary: secondary.getHex(), accent: accent.getHex(), eye: eye.getHex(), emissive: emissive.getHex() };
}

// --------------------------------------------------------------- Variants

/**
 * Mutates `group` in place into its Hollowed variant: desaturates every
 * mesh's color, dims emissive/eye-glint, and scatters a few pale
 * shardlight crack-seam strips across the silhouette (deterministic per
 * `group.name`, so the same species+build always cracks the same way).
 * If you pass `parts`, a slow pulsing crack-glow fx entry is appended to
 * `parts.fx` so the seams breathe faintly; without `parts` the seams are
 * still visually correct, just static.
 * @param {THREE.Group} group
 * @param {object} [parts]
 * @returns {THREE.Group} group
 */
export function hollowify(group, parts) {
  group.traverse((node) => {
    if (!node.isMesh || !node.material || !node.material.color) return;
    if (node.name === 'eyeGlint') { node.scale.multiplyScalar(0.45); node.material.opacity = 0.5; node.material.transparent = true; return; }
    const hsl = { h: 0, s: 0, l: 0 };
    node.material.color.getHSL(hsl);
    node.material.color.setHSL(hsl.h, hsl.s * 0.12, clamp(hsl.l * 0.7 + 0.12, 0.18, 0.55));
    if (node.material.emissive) node.material.emissiveIntensity = Math.min(node.material.emissiveIntensity ?? 1, 0.25);
  });
  // box3 is WORLD-space; the crack strips are about to become CHILDREN of
  // `group`, so every size/position below is converted into group's LOCAL
  // space (world / group.scale for sizes, group.worldToLocal(...) for
  // positions) — otherwise placement/size come out wrong once `group` has
  // already been rescaled (registry.js rescales to SPECIES[id].size before
  // calling hollowify). Y-center is also clamped so a strip's own height
  // never pushes it past the model's true top/bottom.
  const box3 = new THREE.Box3().setFromObject(group);
  const worldSize = new THREE.Vector3(); box3.getSize(worldSize);
  const worldCenter = new THREE.Vector3(); box3.getCenter(worldCenter);
  const gs = group.scale;
  const seed = hashStr(group.name || 'hollow');
  const rng = seededRandom(seed);
  const crackMat = mat(0xffe9b0, { unlit: true, transparent: true, opacity: 0.85 });
  const cracks = [];
  const count = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < count; i++) {
    const worldH = worldSize.y * (0.2 + rng() * 0.2);
    const halfH = worldH / 2;
    const yRange = Math.max(0.001, worldSize.y - 2 * halfH);
    const worldY = box3.min.y + halfH + rng() * yRange;
    const worldPoint = new THREE.Vector3(
      worldCenter.x + (rng() - 0.5) * worldSize.x * 0.6,
      worldY,
      worldCenter.z + (rng() - 0.5) * worldSize.z * 0.6,
    );
    const localPoint = group.worldToLocal(worldPoint.clone());
    const localW = (Math.max(worldSize.x, worldSize.y, worldSize.z) * 0.012) / (gs.x || 1);
    const localH = worldH / (gs.y || 1);
    const localD = 0.01 / (gs.z || 1);
    const strip = box(localW, localH, localD, crackMat.clone());
    strip.name = 'hollowCrack';
    strip.position.copy(localPoint);
    strip.rotation.set((rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.5);
    group.add(strip);
    cracks.push(strip);
  }
  group.userData.hollowed = true;
  if (parts) {
    parts.fx = parts.fx || [];
    let t = rng() * 10;
    parts.fx.push({
      update(dt) {
        t += dt;
        const p = 0.55 + 0.45 * Math.sin(t * 1.4);
        for (const c of cracks) c.material.opacity = 0.4 + 0.5 * p;
      },
    });
  }
  return group;
}

/**
 * Mutates `group` in place into its Gleaming (shiny) variant: a tasteful hue
 * shift on every material plus a ring of warm sparkle motes. If `parts` is
 * passed the sparkle motes' update() is appended to `parts.fx` so they
 * animate; without `parts` they'll simply sit static (still pretty, just
 * not drifting).
 * @param {THREE.Group} group
 * @param {object} [parts]
 * @returns {THREE.Group} group
 */
export function gleamify(group, parts) {
  group.traverse((node) => {
    if (!node.isMesh || !node.material || !node.material.color) return;
    const hsl = { h: 0, s: 0, l: 0 };
    node.material.color.getHSL(hsl);
    node.material.color.setHSL((hsl.h + 0.52) % 1, clamp01(hsl.s * 1.1 + 0.08), clamp01(hsl.l * 1.04 + 0.02));
    if (node.material.emissive) node.material.emissiveIntensity = (node.material.emissiveIntensity ?? 1) * 1.3;
  });
  // NOTE: box3 is a WORLD-space measurement, but `sparkle.group` is about to
  // become a direct CHILD of `group` — so any SIZE we hand it must be
  // converted into group's LOCAL space first (world / group.scale — valid
  // for distances), and any ABSOLUTE POSITION must go through
  // `group.worldToLocal()` instead (dividing a position by scale is only
  // correct if group's local origin sits at world y=0, which it usually
  // doesn't — groundPlant leaves a nonzero position offset). Getting this
  // wrong is exactly how a gleam sparkle ends up floating below a model's
  // feet the moment registry.js has already rescaled it.
  const box3 = new THREE.Box3().setFromObject(group);
  const worldSize = new THREE.Vector3(); box3.getSize(worldSize);
  const gs = group.scale;
  const localSize = new THREE.Vector3(worldSize.x / (gs.x || 1), worldSize.y / (gs.y || 1), worldSize.z / (gs.z || 1));
  const radius = Math.max(localSize.x, localSize.z) * 0.55 || 0.3;
  const seed = hashStr((group.name || 'gleam') + '_g');
  const sparkle = mote(10, { color: 0xfff6d8, radius, height: localSize.y * 0.5, speed: 0.55, seed });
  sparkle.group.name = 'gleamSparkle';
  const worldAnchor = new THREE.Vector3(box3.min.x + worldSize.x * 0.5, box3.min.y + worldSize.y * 0.45, box3.min.z + worldSize.z * 0.5);
  sparkle.group.position.copy(group.worldToLocal(worldAnchor));
  group.add(sparkle.group);
  group.userData.gleaming = true;
  if (parts) { parts.fx = parts.fx || []; parts.fx.push(sparkle); }
  return group;
}
