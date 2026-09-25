// ============================================================================
// gfx/materials.js — shared material + shading helpers for the whole world.
//
// Exports (pinned — other areas import these; do not rename):
//   mat(color, opts) -> MeshStandardMaterial   SMOOTH soft-look factory (v2)
//   windSway(material, opts) -> unregister()    cheap time-based vertex sway
//   tickWind(dt)                                advances the shared sway clock
//   groundPalette(biome) -> {grass,grass2,dirt,stone,stoneDark,sand,snow,path}
//   disposeGroup(group, opts)                   traverse + dispose geos/materials
//   smoothGeometry(geo, {creaseAngle})          rounded shading, crack-free, in place
//   sphericalNormals(geo, {center, blend})      soft "one ball" foliage/cloud shading
//
// v2 SOFT LOOK (visual pass v2 — see docs/VISUAL_V2_BRIEF.md):
//   mat() is SMOOTH by default now. Faceting is opt-in: mat(c, { flat: true })
//   — keep it for crystals, gems, ice, dressed stone blocks and planks.
//   Every material mat() creates also gets the shared soft-light hook
//   (applyLook): a wrapped-diffuse terminator (light rolls softly into the
//   shadow side instead of cutting off) plus a fresnel RIM light that lifts
//   forms off the background. Opt out / scale per material with
//   mat(c, { rim: 0..1, wrap: 0..1 }) (defaults 1 = full shared strength).
//
//   setLookParams({ rimColor, rimStrength, rimPower, rimFar, rimDir, rimDirMix,
//                   wrap, outline })      ALLOCATION-FREE — call every frame.
//       rimColor   THREE.Color | hex   rim tint (SKY: feed it the sky color)
//       rimStrength number (0.3)      rim intensity in linear light units
//       rimPower   number (3)         fresnel exponent (higher = thinner rim)
//       rimFar     number (60)        rim fades out between rimFar/2..rimFar m
//                                     from the camera (no horizon glow)
//       rimDir     THREE.Vector3      WORLD dir the rim favours (e.g. toward
//                                     the sky/sun); rimDirMix 0 = omni rim
//       wrap       number (0.3)       diffuse wrap (0 = hard Lambert terminator)
//       outline    number (1)         global multiplier on outline width
//   getLookParams() -> the live uniform values (read-only use).
//   applyLook(material, { rim, wrap }) -> material
//       Give ANY MeshStandard/MeshPhysical material the same soft look (for
//       materials built with `new THREE.MeshStandardMaterial` elsewhere).
//       Idempotent; survives material.clone().
//   addOutline(object3d, { color, thickness, maxWorld, minSize, skip }) -> handle
//       Soft dark "ink" outline for CREATURES AND HUMANS ONLY (never props):
//       an inverted-hull back-face shell per mesh that SHARES the mesh's
//       geometry, extruded along position-averaged normals (hard-edged parts
//       don't split open), ~constant on-screen width (`thickness` ≈ pixels at
//       a 900 px tall frame, clamped to `maxWorld` so distant figures never
//       drown in ink), fogged. Skips transparent / additive / unlit (basic)
//       meshes, sprites, points, lines, contact-shadow discs, glowing
//       emissive parts, flat sheets, tiny parts, anything flagged
//       `userData.noOutline` (or under a flagged ancestor). One material per
//       call, so per-creature fades/dims (battle faint, follower fade) never
//       leak across creatures. handle: { material, meshes, setVisible(b), dispose() }
//   chainShaderHook(material, tag, fn(shader, renderer, material)) -> bool
//       Chain an onBeforeCompile hook with a STABLE, DISTINCT program cache
//       key (tag-based). Use it instead of assigning onBeforeCompile directly
//       so hooks (sway, look, outline, yours) compose and never share a
//       program they don't match.
//
// `windSway` is consumed directly by src/world/props.js (foliage/cloth/fronds)
// and by this module's own `mat({sway})` sugar. It self-registers into a
// module-level clock so callers never need to know about ticking — world.js
// advances it once per frame via `tickWind(dt)`.
// ============================================================================
import * as THREE from 'three';

// ---------------------------------------------------------------- shader hook chaining
// Three reuses a compiled program for any two materials whose cache keys
// match; the default key is `onBeforeCompile.toString()`, which is the SAME
// text for every closure made by the same hook function no matter what the
// closure chains to — so "sway" and "sway + look" materials would silently
// share one program. Every hook here goes through chainShaderHook, which keys
// the program on the ordered hook tags instead (stable across materials, so
// shaders compile once per variant, never per material).
const _hookState = new WeakMap(); // material -> { tags, baseKey, wrapper }

function _lfProgramKey() {
  const st = _hookState.get(this);
  if (!st) return this.onBeforeCompile.toString();
  // Someone replaced/chained our wrapper from outside: fold their identity in.
  const foreign = this.onBeforeCompile === st.wrapper ? '' : `|${this.onBeforeCompile.toString()}`;
  return `${st.baseKey}|lf:${st.tags.join('+')}${foreign}`;
}

export function chainShaderHook(material, tag, fn) {
  if (!material || typeof fn !== 'function') return false;
  let st = _hookState.get(material);
  if (!st) {
    st = { tags: [], baseKey: String(material.customProgramCacheKey()), wrapper: null };
    _hookState.set(material, st);
    material.customProgramCacheKey = _lfProgramKey;
  }
  if (st.tags.includes(tag)) return false;
  const prev = material.onBeforeCompile;
  const wrapper = function lfChainedHook(shader, renderer) {
    prev.call(this, shader, renderer);
    fn(shader, renderer, this);
  };
  st.tags.push(tag);
  st.wrapper = wrapper;
  material.onBeforeCompile = wrapper;
  material.needsUpdate = true;
  return true;
}

// ---------------------------------------------------------------- wind sway
const _swayUniformSets = []; // every sway material's own uniform object
const _windTime = { value: 0 }; // ONE shared clock uniform for every sway material
const _swayState = new WeakMap(); // material -> its uniform set (re-sway updates in place)
let _windClock = 0;

/**
 * Injects a cheap, allocation-free vertex sway into any material via
 * onBeforeCompile — no geometry edits required. Sway amplitude grows with a
 * vertex's local height (so trunks/bases stay planted, canopies/tips move),
 * and is desynchronized per-instance (for InstancedMesh) or per-object (for
 * plain Meshes) using its own world position as a phase seed, so a whole
 * forest/field never sways in lockstep.
 *   opts: { strength=0.3 (~0..1), speed=1.3, heightScale=3.2 }
 * Returns an unregister function that removes this material's uniforms from
 * the shared sway clock — call it when the material is disposed (disposeGroup
 * does this automatically via `userData.unregisterSway`).
 * Chains with every other hook (applyLook, outlines, yours) via
 * chainShaderHook; calling it twice on one material just updates the params.
 */
export function windSway(material, opts = {}) {
  const strength = opts.strength ?? 0.3;
  const speed = opts.speed ?? 1.3;
  const heightScale = opts.heightScale ?? 3.2;
  const existing = _swayState.get(material);
  if (existing) {
    existing.uSwayStrength.value = strength;
    existing.uSwaySpeed.value = speed;
    existing.uSwayHeight.value = Math.max(heightScale, 0.001);
    return material.userData.unregisterSway ?? (() => {});
  }
  const uniforms = {
    uWindTime: _windTime,
    uSwayStrength: { value: strength },
    uSwaySpeed: { value: speed },
    uSwayHeight: { value: Math.max(heightScale, 0.001) },
  };
  _swayState.set(material, uniforms);
  // The tag carries nothing material-specific: every sway material shares one
  // program per base variant (strength/speed/height live in uniforms).
  chainShaderHook(material, 'sway1', (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWindTime;
uniform float uSwayStrength;
uniform float uSwaySpeed;
uniform float uSwayHeight;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float swayPhase = (instanceMatrix[3].x + instanceMatrix[3].z) * 0.7;
#else
  float swayPhase = (modelMatrix[3].x + modelMatrix[3].z) * 0.7;
#endif
  float swayFactor = clamp(transformed.y, 0.0, uSwayHeight) / uSwayHeight;
  swayFactor *= swayFactor;
  float swayT = uWindTime * uSwaySpeed + swayPhase;
  transformed.x += sin(swayT) * uSwayStrength * swayFactor * 0.34;
  transformed.z += cos(swayT * 0.82 + swayPhase * 0.5) * uSwayStrength * swayFactor * 0.26;`,
      );
  });
  material.userData.isSway = true;
  _swayUniformSets.push(uniforms);
  const unregister = () => {
    const i = _swayUniformSets.indexOf(uniforms);
    if (i !== -1) _swayUniformSets.splice(i, 1);
  };
  material.userData.unregisterSway = unregister;
  return unregister;
}

/** Advance the shared wind clock — world.js calls this once per frame. */
export function tickWind(dt) {
  _windClock += dt;
  _windTime.value = _windClock;
}

// ---------------------------------------------------------------- dispose helper
/**
 * Traverse a group and dispose every geometry + material found, each exactly
 * once. Shared/cached resources are guarded: anything flagged with
 * `userData.shared = true` or present in the `exclude` set is skipped, and
 * `skipCachedGeometries: true` skips geometry disposal entirely (for builders
 * whose geometries live in an intentional module-level cache). Sway materials
 * are unregistered from the wind clock automatically.
 *   opts: { skipCachedGeometries=false, exclude: Set|null }
 */
export function disposeGroup(group, opts = {}) {
  if (!group) return;
  const { skipCachedGeometries = false, exclude = null } = opts;
  const seen = new Set();
  group.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton && !seen.has(o.skeleton)) { seen.add(o.skeleton); o.skeleton.dispose(); }
    if (!o.isMesh && !o.isPoints && !o.isLine && !o.isSprite) return;
    const g = o.geometry;
    if (g && !skipCachedGeometries && !seen.has(g) && !g.userData?.shared && !exclude?.has(g)) {
      seen.add(g);
      g.dispose();
    }
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (!m || seen.has(m) || m.userData?.shared || exclude?.has(m)) continue;
      seen.add(m);
      m.userData?.unregisterSway?.();
      m.dispose();
    }
  });
}

// ---------------------------------------------------------------- v2 soft look
// Shared uniforms: ONE object per parameter, referenced by every stylized
// material, so setLookParams() is a handful of scalar writes per frame no
// matter how many materials exist (three re-uploads material uniforms at
// least once per render call).
const LOOK = {
  uLfRimColor: { value: new THREE.Color(0xd6e6ff) },
  uLfRimStrength: { value: 0.3 },
  uLfRimPower: { value: 3.0 },
  uLfRimFar: { value: 60 },
  uLfRimDir: { value: new THREE.Vector3(0.2, 1, -0.35).normalize() },
  uLfRimDirMix: { value: 0.35 },
  uLfWrap: { value: 0.3 },
};
const OUTLINE_SCALE = { value: 1 };

/**
 * Drive the shared soft-look parameters (see the file header). Allocation-
 * free: colors/vectors are copied into the live uniforms. Unknown keys are
 * ignored; omitted keys keep their current value.
 */
export function setLookParams(p = {}) {
  if (p.rimColor != null) {
    if (p.rimColor.isColor) LOOK.uLfRimColor.value.copy(p.rimColor);
    else LOOK.uLfRimColor.value.set(p.rimColor);
  }
  if (p.rimStrength != null) LOOK.uLfRimStrength.value = p.rimStrength;
  if (p.rimPower != null) LOOK.uLfRimPower.value = Math.max(0.5, p.rimPower);
  if (p.rimFar != null) LOOK.uLfRimFar.value = Math.max(1, p.rimFar);
  if (p.rimDir != null) {
    LOOK.uLfRimDir.value.copy(p.rimDir);
    if (LOOK.uLfRimDir.value.lengthSq() < 1e-8) LOOK.uLfRimDir.value.set(0, 1, 0);
    LOOK.uLfRimDir.value.normalize();
  }
  if (p.rimDirMix != null) LOOK.uLfRimDirMix.value = Math.min(1, Math.max(0, p.rimDirMix));
  if (p.wrap != null) LOOK.uLfWrap.value = Math.min(1, Math.max(0, p.wrap));
  if (p.outline != null) OUTLINE_SCALE.value = Math.max(0, p.outline);
}

/** Live soft-look values (do not mutate the returned objects). */
export function getLookParams() {
  return {
    rimColor: LOOK.uLfRimColor.value, rimStrength: LOOK.uLfRimStrength.value,
    rimPower: LOOK.uLfRimPower.value, rimFar: LOOK.uLfRimFar.value,
    rimDir: LOOK.uLfRimDir.value, rimDirMix: LOOK.uLfRimDirMix.value,
    wrap: LOOK.uLfWrap.value, outline: OUTLINE_SCALE.value,
  };
}

const LOOK_PARS = /* glsl */ `
uniform vec3 uLfRimColor;
uniform float uLfRimStrength;
uniform float uLfRimPower;
uniform float uLfRimFar;
uniform vec3 uLfRimDir;
uniform float uLfRimDirMix;
uniform float uLfWrap;
uniform float uLfRimScale;
uniform float uLfWrapScale;
`;

// Soft terminator: the DIFFUSE term uses wrapped N·L (light rolls a little
// past 90° instead of cutting off); specular keeps the true N·L so there is
// no highlight leaking onto the dark side. Built once from three's own chunk;
// if a future three changes the chunk text, the replace is a no-op and the
// look simply falls back to plain Lambert (never a broken shader).
const _physChunk = THREE.ShaderChunk.lights_physical_pars_fragment;
const _WRAP_FROM_A = 'vec3 irradiance = dotNL * directLight.color;';
const _WRAP_FROM_B = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );';
const WRAPPED_PHYSICAL_CHUNK = (_physChunk.includes(_WRAP_FROM_A) && _physChunk.includes(_WRAP_FROM_B))
  ? _physChunk
    .replace(_WRAP_FROM_A, `${_WRAP_FROM_A}
	float lfWrapK = uLfWrap * uLfWrapScale;
	float lfWrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + lfWrapK ) / ( 1.0 + lfWrapK ) );
	vec3 lfDiffuseIrradiance = lfWrapNL * directLight.color;`)
    .replace(_WRAP_FROM_B, 'reflectedLight.directDiffuse += lfDiffuseIrradiance * BRDF_Lambert( material.diffuseColor );')
  : null;

// Fresnel rim, added to the lit result before the opaque/tonemap/fog chunks
// (so it is tonemapped and FOGGED like everything else). Fades out with
// camera distance so large surfaces never grow a horizon glow, and leans
// toward uLfRimDir (sky/back light) by uLfRimDirMix. Tinted half by albedo so
// it reads as light on the surface rather than a ghost halo.
const RIM_FRAG = /* glsl */ `
	{
		float lfNdV = saturate( dot( normal, geometryViewDir ) );
		float lfFres = pow( 1.0 - lfNdV, uLfRimPower );
		float lfFade = 1.0 - smoothstep( uLfRimFar * 0.5, uLfRimFar, length( vViewPosition ) );
		vec3 lfDirV = normalize( ( viewMatrix * vec4( uLfRimDir, 0.0 ) ).xyz );
		float lfDir = mix( 1.0, saturate( dot( normal, lfDirV ) * 0.5 + 0.5 ), uLfRimDirMix );
		float lfRim = lfFres * lfFade * lfDir * uLfRimStrength * uLfRimScale;
		outgoingLight += uLfRimColor * lfRim * mix( vec3( 1.0 ), diffuseColor.rgb, 0.45 );
	}
`;

const _lookState = new WeakMap(); // material -> its per-material uniforms

function _lookClone() {
  const c = new this.constructor().copy(this);
  const st = _lookState.get(this);
  if (st) applyLook(c, { rim: st.uLfRimScale.value, wrap: st.uLfWrapScale.value });
  const sw = _swayState.get(this);
  if (sw) windSway(c, { strength: sw.uSwayStrength.value, speed: sw.uSwaySpeed.value, heightScale: sw.uSwayHeight.value });
  return c;
}

/**
 * Give a MeshStandard/MeshPhysical material the v2 soft look (wrapped
 * terminator + fresnel rim). Idempotent — calling again just updates the
 * per-material scales. Other material types are returned untouched.
 *   opts: { rim=1 (0 = no rim), wrap=1 (0 = hard Lambert) }
 */
export function applyLook(material, { rim = 1, wrap = 1 } = {}) {
  if (!material || !material.isMeshStandardMaterial) return material;
  const existing = _lookState.get(material);
  if (existing) {
    existing.uLfRimScale.value = rim;
    existing.uLfWrapScale.value = wrap;
    return material;
  }
  const own = { uLfRimScale: { value: rim }, uLfWrapScale: { value: wrap } };
  _lookState.set(material, own);
  chainShaderHook(material, 'look1', (shader) => {
    Object.assign(shader.uniforms, LOOK, own);
    let fs = shader.fragmentShader.replace('#include <common>', `#include <common>\n${LOOK_PARS}`);
    if (WRAPPED_PHYSICAL_CHUNK) fs = fs.replace('#include <lights_physical_pars_fragment>', WRAPPED_PHYSICAL_CHUNK);
    fs = fs.replace('#include <opaque_fragment>', `${RIM_FRAG}\n\t#include <opaque_fragment>`);
    shader.fragmentShader = fs;
  });
  material.clone = _lookClone;
  return material;
}

// ---------------------------------------------------------------- material factory
/**
 * Stylized material factory used across the world & gfx code (terrain.js,
 * wildlife.js, lobedMass). v2: SMOOTH by default with the shared soft look
 * (applyLook) — pass { flat: true } for cut/crystalline surfaces.
 *   opts: { rough, metal, flat=false, emissive, emissiveIntensity, transparent,
 *           opacity, side, vertexColors, depthWrite, fog,
 *           sway: number|{strength,speed,heightScale},
 *           rim=1, wrap=1 (soft-look scales; 0 disables either) }
 */
export function mat(color = 0xffffff, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    flatShading: opts.flat === true,
    roughness: opts.rough ?? 0.85,
    metalness: opts.metal ?? 0,
    vertexColors: !!opts.vertexColors,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    depthWrite: opts.depthWrite ?? true,
    fog: opts.fog !== false,
  });
  applyLook(m, { rim: opts.rim ?? 1, wrap: opts.wrap ?? 1 });
  if (opts.sway) windSway(m, typeof opts.sway === 'object' ? opts.sway : { strength: opts.sway });
  return m;
}

// ---------------------------------------------------------------- outlines
// Inverted-hull ink lines for creatures and humans (never props). Each
// outlined mesh gets ONE child mesh that shares its geometry, drawn with
// back faces only and pushed out along a per-vertex "outline normal" (the
// area-weighted average over every face touching that POSITION — so boxes,
// cylinders' caps and flat-shaded parts inflate as one closed shell instead
// of splitting open at hard edges). The push is done in view space and scaled
// with depth, so the line keeps ~the same pixel width at any distance, then
// clamped to maxWorld so far-away figures never turn into ink blobs.
const OUTLINE_VERT_PARS = /* glsl */ `
attribute vec3 lfOutlineNormal;
uniform float uLfOutlineW;
uniform float uLfOutlineMax;
uniform float uLfOutlineScale;
`;
const OUTLINE_VERT = /* glsl */ `
	{
		vec3 lfN = lfOutlineNormal;
		#ifdef USE_SKINNING
			lfN = ( skinMatrix * vec4( lfN, 0.0 ) ).xyz;
		#endif
		#ifdef USE_INSTANCING
			lfN = mat3( instanceMatrix ) * lfN;
		#endif
		lfN = normalize( normalMatrix * lfN );
		float lfPersp = projectionMatrix[ 2 ][ 3 ] != 0.0 ? 1.0 : 0.0;
		float lfDepth = mix( 1.0, max( - mvPosition.z, 0.001 ), lfPersp );
		float lfW = min( uLfOutlineW * uLfOutlineScale * lfDepth * 2.0 / projectionMatrix[ 1 ][ 1 ], uLfOutlineMax );
		mvPosition.xyz += lfN * lfW;
		gl_Position = projectionMatrix * mvPosition;
	}
`;

const OUTLINE_REF_PX = 900; // thickness is authored as pixels on a 900 px tall frame

function _ensureOutlineNormals(geometry) {
  if (geometry.attributes.lfOutlineNormal) return;
  geometry.setAttribute('lfOutlineNormal', new THREE.BufferAttribute(positionNormals(geometry), 3));
}

const _flatGeo = new WeakMap();
function _isSheet(geometry) {
  let v = _flatGeo.get(geometry);
  if (v !== undefined) return v;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const s = geometry.boundingBox.getSize(new THREE.Vector3());
  const hi = Math.max(s.x, s.y, s.z), lo = Math.min(s.x, s.y, s.z);
  v = !(hi > 0) || lo < hi * 0.04;
  _flatGeo.set(geometry, v);
  return v;
}

const _olColor = new THREE.Color();
function _materialWantsOutline(m) {
  if (!m || m.visible === false) return false;
  if (m.isShaderMaterial || m.isRawShaderMaterial || m.isPointsMaterial || m.isSpriteMaterial || m.isLineBasicMaterial) return false;
  if (m.isMeshBasicMaterial) return false;                 // unlit = glow / eye paint / fx
  if (m.transparent || m.opacity < 1 || m.blending !== THREE.NormalBlending) return false;
  if (m.wireframe || m.depthWrite === false) return false;
  if (m.emissive) {                                         // glowing parts stay ink-free
    _olColor.copy(m.emissive).multiplyScalar(m.emissiveIntensity ?? 1);
    if (0.2126 * _olColor.r + 0.7152 * _olColor.g + 0.0722 * _olColor.b > 0.42) return false;
  }
  return true;
}

function _flaggedNoOutline(o, root) {
  for (let n = o; n; n = n.parent) {
    if (n.userData && n.userData.noOutline) return true;
    if (n === root) break;
  }
  return false;
}

const _olScale = new THREE.Vector3();
const _v3a = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _noShadowDesc = { get: () => false, set: () => {}, configurable: true };

/**
 * Add a soft ink outline to a creature/human (see the file header).
 *   opts: { color=0x241a26, thickness=2 (px @900p), maxWorld (default 3.5% of
 *           the figure's height), minSize=0.018 (world radius below which a
 *           part is skipped), skip(mesh)->bool extra filter }
 * Returns { material, meshes, setVisible(bool), dispose() } or null.
 */
export function addOutline(root, opts = {}) {
  if (!root || !root.isObject3D) return null;
  const { color = 0x241a26, thickness = 2, minSize = 0.018, skip = null } = opts;
  root.updateMatrixWorld(true);
  let maxWorld = opts.maxWorld;
  if (maxWorld == null) {
    const box = new THREE.Box3();
    root.traverse((o) => {
      if (o.isMesh && !o.userData?.lfOutline && o.name !== 'contactShadow' && o.geometry) box.expandByObject(o, false);
    });
    const h = box.isEmpty() ? 1 : Math.max(0.05, box.max.y - box.min.y);
    maxWorld = h * 0.035;
  }
  const material = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: true });
  material.name = 'lfOutline';
  material.userData.isOutline = true;
  const own = {
    uLfOutlineW: { value: thickness / OUTLINE_REF_PX },
    uLfOutlineMax: { value: maxWorld },
    uLfOutlineScale: OUTLINE_SCALE,
  };
  chainShaderHook(material, 'outline1', (shader) => {
    Object.assign(shader.uniforms, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${OUTLINE_VERT_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${OUTLINE_VERT}`);
    // When a whole figure fades (follower near the lens, battle faint), the
    // ink goes first — a half-faded body must not show its shell through it.
    shader.fragmentShader = shader.fragmentShader
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * opacity * opacity );');
  });

  const targets = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData?.lfOutline || !o.geometry?.attributes?.position) return;
    if (o.isSkinnedMesh && !o.skeleton) return;
    if (o.name === 'contactShadow' || _flaggedNoOutline(o, root)) return;
    if (o.children.some((c) => c.userData?.lfOutline)) return; // already outlined
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (!mats.every(_materialWantsOutline)) return;
    const g = o.geometry;
    // Flat sheets (blades, petals, wings, fins, mask discs) have no volume to
    // hull: the shell would just be a dark copy behind them.
    if (_isSheet(g)) return;
    if (!g.boundingSphere) g.computeBoundingSphere();
    o.matrixWorld.decompose(_v3a, _q, _olScale);
    const worldR = g.boundingSphere.radius * Math.max(Math.abs(_olScale.x), Math.abs(_olScale.y), Math.abs(_olScale.z));
    if (!(worldR >= minSize)) return;
    if (skip && skip(o)) return;
    targets.push(o);
  });

  const meshes = [];
  for (const o of targets) {
    _ensureOutlineNormals(o.geometry);
    let ol;
    if (o.isInstancedMesh) {
      ol = new THREE.InstancedMesh(o.geometry, material, o.count);
      ol.instanceMatrix = o.instanceMatrix;
    } else if (o.isSkinnedMesh) {
      // Same skeleton, same bind matrix, identity under the host: the shell
      // deforms with the host (the normal push is skinned in the shader too).
      ol = new THREE.SkinnedMesh(o.geometry, material);
      ol.bind(o.skeleton, o.bindMatrix);
      ol.bindMode = o.bindMode;
    } else {
      ol = new THREE.Mesh(o.geometry, material);
    }
    ol.name = 'lfOutline';
    ol.userData.lfOutline = true;
    ol.userData.noOutline = true;
    Object.defineProperty(ol, 'castShadow', _noShadowDesc);
    Object.defineProperty(ol, 'receiveShadow', _noShadowDesc);
    ol.raycast = () => {};
    ol.frustumCulled = o.frustumCulled && !o.isSkinnedMesh;
    ol.renderOrder = o.renderOrder;
    ol.matrixAutoUpdate = false; // identity under its host — never recomputed
    o.add(ol);
    meshes.push(ol);
  }
  const handle = {
    material, meshes,
    setVisible(v) { for (const m of meshes) m.visible = !!v; },
    dispose() {
      for (const m of meshes) m.parent?.remove(m);
      meshes.length = 0;
      material.dispose();
    },
  };
  root.userData.outline = handle.meshes.length ? { count: meshes.length } : root.userData.outline;
  return handle;
}

// ---------------------------------------------------------------- ground palettes
// Bible anchors: meadow greens #7ec850/#4f9e4f, dusk purple #5b4a8a, amber
// #ffb85c, deep slate #232633, shard-gold #ffe9b0, hollow-gray #9a9aa4.
// One palette per zone `biome` id (the 9 canonical biomes) — terrain.js
// blends these by height/slope/water-proximity/path-proximity.
const PALETTES = {
  meadow: { grass: 0x7ec850, grass2: 0x4f9e4f, dirt: 0x9a7a4c, stone: 0x9a978e, stoneDark: 0x7d7a72, sand: 0xe8d8ac, snow: 0xf2f6fa, path: 0xb08e5c },
  forest: { grass: 0x5c9e52, grass2: 0x3c6b46, dirt: 0x6b4a33, stone: 0x86837d, stoneDark: 0x64615c, sand: 0xcdb98c, snow: 0xe8eef2, path: 0x7a5a3a },
  glade: { grass: 0x6fb87e, grass2: 0x4a8a6a, dirt: 0x7a6250, stone: 0x8d8a94, stoneDark: 0x6a6774, sand: 0xd8ceac, snow: 0xecf0f6, path: 0x8a6f56 },
  lake: { grass: 0x74c25e, grass2: 0x4f9e4f, dirt: 0x8a7048, stone: 0x9a978e, stoneDark: 0x767368, sand: 0xe8dcb0, snow: 0xf0f4f8, path: 0xa89250 },
  town: { grass: 0x7ec850, grass2: 0x5c9e4a, dirt: 0x9a7a4c, stone: 0xa8a49a, stoneDark: 0x847f74, sand: 0xe0d0a4, snow: 0xf0f2f6, path: 0xb08e5c },
  cave: { grass: 0x4a5652, grass2: 0x3a4440, dirt: 0x544e5a, stone: 0x6d6a72, stoneDark: 0x46424c, sand: 0x5c5860, snow: 0x9fa0ac, path: 0x5a5560 },
  mountain: { grass: 0x6a9a5c, grass2: 0x4a7a4c, dirt: 0x7d6a58, stone: 0x8d8a86, stoneDark: 0x686560, sand: 0xc9c0a8, snow: 0xfafcff, path: 0x8a8378 },
  ruins: { grass: 0x6a9a5e, grass2: 0x4a7a4c, dirt: 0x8a7a5c, stone: 0xa8a49a, stoneDark: 0x847f74, sand: 0xd8ceac, snow: 0xeef0f4, path: 0x9a9080 },
  spire: { grass: 0x3a3f52, grass2: 0x2b2e3c, dirt: 0x33364a, stone: 0x3f4458, stoneDark: 0x282b38, sand: 0x4a4e60, snow: 0xc9cfe0, path: 0x3a3f52 },
};

/** Per-biome ground blend palette for terrain.js vertex coloring. Falls back to meadow. */
export function groundPalette(biome) {
  return PALETTES[biome] ?? PALETTES.meadow;
}

/* ============================================================================
   Stylized-art foundation — the difference between "programmer shapes" and
   art-directed low-poly is mostly three things, shared here so every builder
   (props, creatures, characters, terrain) speaks the same visual language:
     1. vertex-color GRADIENTS inside a single mesh (dark base -> lit crown),
     2. organic IRREGULARITY (seeded vertex jitter — no perfect primitives),
     3. grounding (soft contact-shadow discs under everything that stands).
   ========================================================================== */

const _c1 = new THREE.Color(), _c2 = new THREE.Color();

/** Seeded hash noise in [-1,1] from a vertex position — stable across reloads. */
export function hashNoise(x, y, z, seed = 0) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 53.13) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/**
 * Paints a vertical color ramp into geometry vertex colors, with optional hue
 * mottling so large surfaces never read as one flat swatch.
 * Pair with a material created via mat(0xffffff, {vertexColors:true}).
 */
export function applyVertexGradient(geometry, {
  from = 0x4f7a3a, to = 0x8fce5c, axis = 'y', noise = 0.06, seed = 1, exp = 1,
} = {}) {
  const pos = geometry.attributes.position;
  const bb = geometry.boundingBox ?? (geometry.computeBoundingBox(), geometry.boundingBox);
  const ai = axis === 'x' ? 0 : axis === 'z' ? 2 : 1;
  const lo = bb.min.getComponent(ai), hi = bb.max.getComponent(ai);
  const span = Math.max(1e-5, hi - lo);
  _c1.setHex(from); _c2.setHex(to);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let t = ((ai === 0 ? x : ai === 2 ? z : y) - lo) / span;
    t = Math.pow(Math.min(1, Math.max(0, t)), exp);
    const n = noise ? hashNoise(x, y, z, seed) * noise : 0;
    colors[i * 3 + 0] = _c1.r + (_c2.r - _c1.r) * t + n;
    colors[i * 3 + 1] = _c1.g + (_c2.g - _c1.g) * t + n;
    colors[i * 3 + 2] = _c1.b + (_c2.b - _c1.b) * t + n * 0.7;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * Seeded organic jitter: displaces vertices along their normals (plus a little
 * tangentially) so spheres stop being spheres. amp is in local units.
 * Recomputes normals. Safe on indexed and non-indexed geometry.
 */
export function jitterGeometry(geometry, amp = 0.06, seed = 1) {
  const pos = geometry.attributes.position;
  // Displace along a normal averaged per unique POSITION: non-indexed
  // primitives duplicate every corner once per face, and pushing each copy
  // along its own face normal tears visible cracks open under smooth shading.
  const nrm = positionNormals(geometry);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = hashNoise(x, y, z, seed);
    const n2 = hashNoise(z, x, y, seed + 7);
    pos.setXYZ(i,
      x + nrm[i * 3] * n * amp + n2 * amp * 0.35,
      y + nrm[i * 3 + 1] * n * amp,
      z + nrm[i * 3 + 2] * n * amp - n2 * amp * 0.35,
    );
  }
  pos.needsUpdate = true;
  // Rounded normals (ignored by flat-shaded materials, used by smooth ones).
  geometry.setAttribute('normal', new THREE.BufferAttribute(positionNormals(geometry), 3));
  return geometry;
}

const _posKey = (x, y, z) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;

/** Area-weighted normal per unique vertex position (shared by all its copies). */
function positionNormals(geometry) {
  const pos = geometry.attributes.position;
  const idx = geometry.index;
  const acc = new Map();
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const keys = new Array(pos.count);
  for (let i = 0; i < pos.count; i++) keys[i] = _posKey(pos.getX(i), pos.getY(i), pos.getZ(i));
  for (let t = 0; t < triCount; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3;
    const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    ab.subVectors(b, a); ac.subVectors(c, a); ab.cross(ac); // length = 2 × area
    for (const k of [keys[i0], keys[i1], keys[i2]]) {
      const v = acc.get(k);
      if (v) v.add(ab); else acc.set(k, ab.clone());
    }
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = acc.get(keys[i]);
    if (!v || v.lengthSq() < 1e-20) { out[i * 3 + 1] = 1; continue; }
    const l = v.length();
    out[i * 3] = v.x / l; out[i * 3 + 1] = v.y / l; out[i * 3 + 2] = v.z / l;
  }
  return out;
}

/**
 * Smooth (rounded) shading for any geometry, IN PLACE: every copy of a
 * duplicated corner gets the same averaged normal, so non-indexed primitives
 * (icospheres, jittered masses, merged parts) stop reading as facets. Pair with
 * a material that has flatShading off — mat(color, { flat: false }).
 *   creaseAngle (radians): faces meeting at a sharper angle keep a hard edge
 *   (default 0 = smooth everything). Use ~0.9 for cut stone / furniture.
 */
export function smoothGeometry(geometry, { creaseAngle = 0 } = {}) {
  const pos = geometry.attributes.position;
  if (!creaseAngle) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(positionNormals(geometry), 3));
    return geometry;
  }
  // Crease-aware: average only face normals within creaseAngle of each other.
  geometry.computeVertexNormals(); // per-face normals on non-indexed input
  const faceN = geometry.attributes.normal;
  const groups = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = _posKey(pos.getX(i), pos.getY(i), pos.getZ(i));
    (groups.get(k) ?? groups.set(k, []).get(k)).push(i);
  }
  const cosLim = Math.cos(creaseAngle);
  const out = new Float32Array(pos.count * 3);
  const ni = new THREE.Vector3(), nj = new THREE.Vector3(), sum = new THREE.Vector3();
  for (const list of groups.values()) {
    for (const i of list) {
      ni.fromBufferAttribute(faceN, i);
      sum.set(0, 0, 0);
      for (const j of list) {
        nj.fromBufferAttribute(faceN, j);
        if (ni.dot(nj) >= cosLim) sum.add(nj);
      }
      sum.normalize();
      out[i * 3] = sum.x; out[i * 3 + 1] = sum.y; out[i * 3 + 2] = sum.z;
    }
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return geometry;
}

/**
 * "Fluffy foliage" normals: bend every normal toward the direction from
 * `center` (default: bounding-box center) so a whole lumpy canopy/bush/cloud
 * shades like one soft ball instead of a pile of lit-and-shadowed lobes.
 *   blend 0..1 — 1 = pure spherical, ~0.7 keeps a hint of the lumps.
 */
export function sphericalNormals(geometry, { center = null, blend = 0.8 } = {}) {
  const pos = geometry.attributes.position;
  if (!geometry.attributes.normal) smoothGeometry(geometry);
  const nrm = geometry.attributes.normal;
  let cx, cy, cz;
  if (center) ({ x: cx, y: cy, z: cz } = center);
  else {
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    cx = (bb.min.x + bb.max.x) / 2; cy = (bb.min.y + bb.max.y) / 2; cz = (bb.min.z + bb.max.z) / 2;
  }
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i) - cx, pos.getY(i) - cy, pos.getZ(i) - cz).normalize();
    n.fromBufferAttribute(nrm, i).lerp(v, blend).normalize();
    nrm.setXYZ(i, n.x, n.y, n.z);
  }
  nrm.needsUpdate = true;
  return geometry;
}

let _aoTex = null;
/** Soft radial contact-shadow texture (shared, generated once). */
function aoTexture() {
  if (_aoTex) return _aoTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.42)');
  grad.addColorStop(0.65, 'rgba(0,0,0,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  _aoTex = new THREE.CanvasTexture(c);
  return _aoTex;
}

/**
 * A soft dark disc that visually plants an object on the ground — the cheapest
 * convincing ambient-occlusion stand-in there is. Place at the object's base
 * (y ≈ 0.02 above terrain). radius in world units.
 */
export function contactShadow(radius = 0.8, opacity = 1) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: aoTexture(), transparent: true, opacity, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  m.userData.noOutline = true;
  return m;
}

// Smooth, low-frequency lump field on the unit sphere (a few crossed sines):
// unlike per-vertex hash jitter it gives the SAME soft lumps at any
// tessellation, so lobes can be finely tessellated and still read as a few
// big organic bulges instead of crumpled paper.
function softLumps(x, y, z, seed) {
  const s = seed * 1.618;
  return (
    Math.sin(x * 2.1 + s) * Math.cos(y * 1.7 - s * 0.6) +
    Math.sin(z * 2.4 + x * 0.9 + s * 1.3) * 0.7 +
    Math.cos(y * 2.9 + z * 1.2 - s * 0.4) * 0.45
  ) / 2.15;
}

/**
 * Multi-lobed organic canopy/bush/cloud mass: several softly lumped,
 * gradient-painted icosphere lobes around a center. THE workhorse for fluffy
 * masses — one lobe reads as a placeholder, four read as art.
 * v2: smooth. Lobes are finely tessellated (detail 3 by default), displaced by
 * a smooth lump field, smooth-normalled (crack-free) and then bent toward one
 * shared center (sphericalNormals, `soft`) so the whole mass shades like one
 * soft ball with just a hint of its lobes. Same signature/return as before
 * (a Group of lobe meshes sharing one vertex-color material).
 *   opts adds: soft=0.6 (0 = per-lobe shading, 1 = one perfect ball)
 */
export function lobedMass({
  lobes = 4, radius = 1, spread = 0.75, squash = 0.82,
  from = 0x3e6b34, to = 0x8fce5c, seed = 1, jitter = 0.14, detail = 3, soft = 0.6,
} = {}) {
  const group = new THREE.Group();
  const material = mat(0xffffff, { vertexColors: true });
  const v = new THREE.Vector3();
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + hashNoise(i, seed, 0, seed) * 0.8;
    const r = radius * (0.55 + 0.45 * Math.abs(hashNoise(seed, i, 1, i)));
    const geo = new THREE.IcosahedronGeometry(r, Math.max(1, detail));
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      const l = v.length() || 1;
      const f = 1 + softLumps(v.x / l, v.y / l, v.z / l, seed * 7 + i) * jitter * 1.6;
      pos.setXYZ(k, v.x * f, v.y * f, v.z * f);
    }
    geo.translate(
      Math.cos(a) * spread * radius * (i === 0 ? 0 : 1),
      (hashNoise(i, i, seed, 3) * 0.3 + (i === 0 ? 0.15 : 0)) * radius,
      Math.sin(a) * spread * radius * (i === 0 ? 0 : 1),
    );
    geo.scale(1, squash, 1);
    smoothGeometry(geo);
    const mesh = new THREE.Mesh(geo, material);
    group.add(mesh);
  }
  // Paint the gradient across the whole assembled mass so lobes shade as one,
  // then bend every lobe's normals toward the mass center ("one soft ball").
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  for (const child of group.children) {
    const pos = child.geometry.attributes.position;
    _c1.setHex(from); _c2.setHex(to);
    const colors = new Float32Array(pos.count * 3);
    const span = Math.max(1e-5, box.max.y - box.min.y);
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(1, Math.max(0, (pos.getY(i) - box.min.y) / span));
      const n = hashNoise(pos.getX(i), pos.getY(i), pos.getZ(i), seed) * 0.05;
      colors[i * 3 + 0] = _c1.r + (_c2.r - _c1.r) * t + n;
      colors[i * 3 + 1] = _c1.g + (_c2.g - _c1.g) * t + n;
      colors[i * 3 + 2] = _c1.b + (_c2.b - _c1.b) * t + n * 0.7;
    }
    child.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (soft > 0) sphericalNormals(child.geometry, { center, blend: soft });
    child.castShadow = true;
  }
  return group;
}
