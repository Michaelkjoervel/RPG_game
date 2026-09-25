// ============================================================================
// world/sky.js — the big gradient sky dome, soft sun/moon, day/night cycle,
// stars, painted drifting cloud banks, layered backdrop silhouettes beyond the
// zone edge (hills / pine lines / snowy peaks / ruined spires), whisperwood's
// light shafts; the tuned shadow-casting key light; cave/spire dark-dome +
// player-following fill light; per-zone light MOODS; the shared rim light.
//
// Contract (docs/CONTRACTS_ADDENDUM.md):
//   createSky(zone, scene) -> { update(dt, dayTime), sunLight, dispose() }
//   (also returns fillLight + sunDir, read by world.js's shadow-follow)
//
// Extra export (v2): `skyShared` — the live sky uniforms + the GLSL that
// evaluates the sky gradient, so water.js can reflect exactly the sky that is
// on screen, and weather.js can flash it for lightning. One overworld sky
// exists at a time (world.js disposes the old zone before building the new
// one), so the latest createSky() owns it.
//
// Light design (docs/DESIGN_BIBLE.md §8): one clearly dominant warm key
// (sun by day, cool moon by night), a dropped cool fill so forms model,
// warm-light/cool-shadow contrast, and a nameable per-zone mood (MOODS
// table below) — brighthollow's warm afternoon amber, whisperwood's
// green-gold, gloamcavern's teal dark, mirrorlake's rose dusk, etc.
//
// Fog note: `scene.fog` is set ONCE here (from zone.ambient, harmonized with
// the sky palette at the *current* time of day and the zone mood) and never
// touched again by this module. world/weather.js (a sibling area's module)
// snapshots `scene.fog.density`/`.color` at creation time as its restore
// baseline and multiplies/lerps from there each frame — if sky.js also wrote
// scene.fog every frame the two would fight over authority every tick. The
// one-time write happens inside createSky (before weather.js is created —
// world.js builds sky first), so weather's snapshot sees the harmonized
// values. Crossing day/night INSIDE one zone therefore keeps the entry-time
// fog color; the dome + lights carry the time-of-day mood, which dominates.
// (sky.js only READS scene.fog afterwards — the near backdrop layer's mist
// matches whatever fog the terrain edge is wearing.)
//
// The dome, stars, clouds and backdrop layers use the "push to the far clip
// plane" trick (z = w, nudged a hair inside: exactly on the plane some
// triangles got numerically clipped into see-through slivers) so they always render
// behind everything regardless of the camera's actual far-plane distance
// (owned by another area's cameraRig.js) — no coordination needed, no risk of
// getting far-plane-clipped, and the backdrop rings can sit at any virtual
// distance without ever intersecting terrain. Their mutual order is plain
// painter's order via renderOrder: dome -> stars -> clouds -> far -> mid ->
// near backdrop layer.
// ============================================================================
import * as THREE from 'three';
import { clamp, clamp01, lerp, TAU } from '../core/math.js';
import { seededRandom, hashStr } from '../core/rng.js';
import { G } from '../core/state.js';
import { settings } from '../core/settings.js';
// Namespace import on purpose: the look-dev rim API (setLookParams) is being
// added in parallel — a missing named export must never break this module.
import * as MAT from '../gfx/materials.js';

const INDOOR_BIOMES = new Set(['cave', 'spire']);
const WHITE = new THREE.Color(0xffffff); // lerp target only — never mutated
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- zone light moods
// Every zone gets a NAMEABLE light identity. Values are authored against the
// game's ACESFilmic/1.05-exposure pipeline (game.js). Fields:
//   key      key-light tint the zone sun leans toward (warm identity)
//   keyI     key intensity multiplier    fillI  hemisphere multiplier
//   shadow   cool daylight shadow tint (hemisphere sky side)
//   bounce   warm ground-bounce tint (hemisphere ground side)
//   warmth   how hard the day horizon leans toward the key color
//   haze     how far the day horizon washes toward white (default 0.35)
//   midMix   how much horizon color climbs into the mid sky (default 0.3)
//   duskBias optional hue the dusk palette leans toward (mirrorlake rose)
//   starFloor optional minimum star visibility (starfall's identity)
//   clouds   cloud-bank amount multiplier (default 1)
//   fogTint / fogTintAmt / fogMul — one-time fog harmonization at zone entry
//   indoor   cave/spire palette override (dome, hemi, fill, slanted key)
const MOODS = {
  brighthollow:  { name: 'warm afternoon amber', key: 0xffc37a, keyI: 1.12, fillI: 0.85, shadow: 0x8090d8, bounce: 0xd8b48c, warmth: 0.5,  fogTint: 0xd6dcca, fogTintAmt: 0.3,  fogMul: 1.05 },
  dawnmeadow:    { name: 'fresh spring gold',    key: 0xffd79a, keyI: 1.05, fillI: 1.0,  shadow: 0x84a0d4, bounce: 0xbcc88c, warmth: 0.35, fogTint: 0xd2e8c4, fogTintAmt: 0.35, fogMul: 0.95 },
  // haze/midMix: the forest horizon is a luminous green-gold haze under a
  // clear teal sky — the v1 values washed the band above the canopy to gray.
  whisperwood:   { name: 'green-gold shafts',    key: 0xf0d878, keyI: 1.15, fillI: 0.72, shadow: 0x4a6a58, bounce: 0x84a068, warmth: 0.6,  haze: 0.08, midMix: 0.14, fogTint: 0x94b070, fogTintAmt: 0.55, fogMul: 1.2, clouds: 0.8 },
  mirrorlake:    { name: 'dusk rose',            key: 0xffd8b4, keyI: 1.0,  fillI: 0.95, shadow: 0x8a8cc8, bounce: 0xc4aca4, warmth: 0.3,  duskBias: 0xe8907e, fogTint: 0xdcc0c0, fogTintAmt: 0.4, fogMul: 1.0 },
  skyreach:      { name: 'cold thin blue',       key: 0xd4e4ff, keyI: 0.92, fillI: 0.85, shadow: 0x46536e, bounce: 0x66718a, warmth: 0.05, fogTint: 0x59688a, fogTintAmt: 0.45, fogMul: 1.0, clouds: 1.7 },
  sunkenruins:   { name: 'murky cyan',           key: 0xe8eecc, keyI: 0.95, fillI: 0.85, shadow: 0x5a8a86, bounce: 0x8ca894, warmth: 0.2,  fogTint: 0x76a49c, fogTintAmt: 0.5,  fogMul: 1.1 },
  starfallglade: { name: 'violet night sparkle', key: 0xffcf9c, keyI: 1.0,  fillI: 0.95, shadow: 0x6c58a8, bounce: 0x8868a0, warmth: 0.3,  starFloor: 0.75, fogTint: 0x5c4884, fogTintAmt: 0.45, fogMul: 1.0, clouds: 0.6 },
  gloamcavern:   { name: 'teal dark, glow accents', fogTint: 0x102b28, fogTintAmt: 0.55, fogMul: 1.0,
    // Raking teal-white key (low elevation, real intensity) sculpts the cave
    // floor; hemi pulled down in trade so the net luminance holds but forms
    // shade instead of reading as one flat teal wash.
    // Tight bright fill pool (small radius, fast decay): brightness falls off
    // INSIDE the visible frame, so the flat cave floor grades from a lit pool
    // around the Warden into teal-dark distance instead of one even wash.
    indoor: { domeTop: 0x0e1a1c, domeBottom: 0x091012, domeHorizon: 0x143230, hemiSky: 0x58a8a0, hemiGround: 0x1e3c3a, fill: 0x5ee0cc, key: 0x9fd8d0, keyI: 2.2, keyDir: [0.6, 0.5, 0.38], hemiScale: 0.78, fillRadius: 19, fillDecay: 1.55, fillScale: 1.3 } },
  hollowspire:   { name: 'oppressive violet',    fogTint: 0x1c1428, fogTintAmt: 0.55, fogMul: 1.0,
    indoor: { domeTop: 0x141020, domeBottom: 0x0c0a14, domeHorizon: 0x241a34, hemiSky: 0x9282ba, hemiGround: 0x352c4a, fill: 0xb8a2ff, key: 0xa88fd8, keyI: 1.0, keyDir: [-0.4, 0.85, 0.25] } },
};
const MOOD_DEFAULT = { name: 'default', key: 0xffd9a0, keyI: 1.0, fillI: 1.0, shadow: 0x8098d0, bounce: 0xb8ac90, warmth: 0.3, fogTintAmt: 0, fogMul: 1.0 };
const INDOOR_DEFAULT = { domeTop: 0x151726, domeBottom: 0x0c0d16, domeHorizon: 0x1c1e2c, hemiSky: 0x8a96ad, hemiGround: 0x4a4f62, fill: 0x8fb8ff, key: 0x9aa8d0, keyI: 0.8, keyDir: [0.45, 0.8, 0.3] };

// ---------------------------------------------------------------- backdrop silhouettes
// 2–3 rings of distant landscape beyond the zone edge, near -> far. Angles
// are ELEVATIONS in degrees as seen from the zone center at eye height;
// `R` is the ring radius in units of the near radius (half-diagonal + 45 m).
// kinds: hills (smooth, optional round tree clumps), trees (pine line on low
// hills, optional round crowns), jagged (fractal ridge), spires (ruined
// towers/columns on low hills). tint = albedo; aerial = how far the layer
// melts into the horizon; mist = how much its foot dissolves into haze.
// `bump` raises the ridge around a compass bearing (radians, x=cos, z=sin;
// north = -PI/2) — e.g. Skyreach's range looming north of Mirrorlake.
const BACKDROPS = {
  meadow: [
    { kind: 'hills', R: 1.0, base: 0.9, amp: 2.3, clumps: 0.55, tint: 0x4f8a44, aerial: 0.3, mist: 0.55 },
    { kind: 'hills', R: 1.8, base: 1.8, amp: 3.4, clumps: 0.3, tint: 0x4d7462, aerial: 0.52, mist: 0.6 },
    { kind: 'jagged', R: 3.2, base: 1.5, amp: 6.2, rough: 0.5, tint: 0x5a6e92, aerial: 0.6, mist: 0.7, snow: 0.55, bump: { dir: -Math.PI / 2, amp: 2.0, width: 0.7 } },
  ],
  town: [
    { kind: 'hills', R: 1.0, base: 1.0, amp: 2.0, clumps: 0.7, tint: 0x538c46, aerial: 0.3, mist: 0.55 },
    { kind: 'hills', R: 1.8, base: 1.9, amp: 3.2, clumps: 0.35, tint: 0x4f7664, aerial: 0.52, mist: 0.6 },
    { kind: 'jagged', R: 3.2, base: 1.5, amp: 5.4, rough: 0.48, tint: 0x5e7296, aerial: 0.6, mist: 0.7, snow: 0.6 },
  ],
  lake: [
    { kind: 'hills', R: 1.0, base: 0.8, amp: 1.8, clumps: 0.75, tint: 0x46784a, aerial: 0.32, mist: 0.6 },
    { kind: 'trees', R: 1.8, base: 1.1, amp: 2.2, trees: 0.55, treeH: 1.4, round: 0.5, tint: 0x3f6658, aerial: 0.52, mist: 0.6 },
    { kind: 'jagged', R: 3.2, base: 1.4, amp: 6.6, rough: 0.55, tint: 0x5c6f98, aerial: 0.58, mist: 0.65, snow: 0.45, bump: { dir: -Math.PI / 2, amp: 4.0, width: 0.75 } },
  ],
  forest: [
    { kind: 'trees', R: 1.0, base: 0.9, amp: 1.6, trees: 1.0, treeH: 2.6, round: 0.3, tint: 0x2c563a, aerial: 0.26, mist: 0.45 },
    { kind: 'trees', R: 1.8, base: 1.8, amp: 3.0, trees: 0.8, treeH: 1.9, round: 0.1, tint: 0x36604e, aerial: 0.46, mist: 0.55 },
    { kind: 'jagged', R: 3.2, base: 1.8, amp: 5.6, rough: 0.46, tint: 0x4c6a80, aerial: 0.58, mist: 0.65 },
  ],
  glade: [
    { kind: 'trees', R: 1.0, base: 1.0, amp: 1.7, trees: 0.95, treeH: 2.4, round: 0.75, tint: 0x2c2c4e, aerial: 0.3, mist: 0.5 },
    { kind: 'trees', R: 1.8, base: 2.0, amp: 2.8, trees: 0.7, treeH: 1.7, round: 0.25, tint: 0x363462, aerial: 0.5, mist: 0.55 },
    { kind: 'jagged', R: 3.2, base: 2.0, amp: 5.2, rough: 0.45, tint: 0x4a4478, aerial: 0.6, mist: 0.6 },
  ],
  mountain: [
    { kind: 'jagged', R: 1.0, base: 1.6, amp: 7.0, rough: 0.6, tint: 0x4a5262, aerial: 0.42, mist: 0.45, snow: 0.5 },
    { kind: 'jagged', R: 1.8, base: 2.6, amp: 10.0, rough: 0.58, tint: 0x566076, aerial: 0.56, mist: 0.55, snow: 0.38 },
    { kind: 'jagged', R: 3.2, base: 3.6, amp: 12.5, rough: 0.55, tint: 0x64708c, aerial: 0.68, mist: 0.6, snow: 0.3 },
  ],
  ruins: [
    { kind: 'spires', R: 1.0, base: 0.5, amp: 2.4, spires: 0.45, spireH: 2.2, tint: 0x5a6c64, aerial: 0.34, mist: 0.42 },
    { kind: 'spires', R: 1.8, base: 1.0, amp: 3.0, spires: 0.7, spireH: 3.6, tint: 0x5e7278, aerial: 0.5, mist: 0.45 },
    { kind: 'hills', R: 3.2, base: 2.2, amp: 3.6, clumps: 0, tint: 0x6e8494, aerial: 0.74, mist: 0.7 },
  ],
};
BACKDROPS.cave = null; BACKDROPS.spire = null; // interiors: nothing
// Per-zone overrides. Skyreach's own terrain climbs to ~20 deg around the
// pass, so its ranges must tower above that — dark rock with snow caps,
// looming through the storm haze rather than dissolving in it.
const BACKDROP_ZONES = {
  skyreach: [
    { kind: 'jagged', R: 1.0, base: 3.5, amp: 13.0, sharp: 2.1, rough: 0.62, tint: 0x363e4e, aerial: 0.28, mist: 0.4, snow: 0.3 },
    { kind: 'jagged', R: 1.8, base: 6.5, amp: 15.0, sharp: 2.0, rough: 0.6, tint: 0x434d62, aerial: 0.4, mist: 0.45, snow: 0.26 },
    { kind: 'jagged', R: 3.2, base: 9.0, amp: 16.0, sharp: 1.9, rough: 0.58, tint: 0x55607c, aerial: 0.52, mist: 0.5, snow: 0.22 },
  ],
};

// ---------------------------------------------------------------- day/night curve
// dayTime: 0 = midnight, 0.5 = noon (per docs/ARCHITECTURE.md G.calendar.dayTime).
function elevationFactor(t) {
  return Math.cos((t - 0.5) * TAU); // -1 at midnight .. +1 at noon
}
function dayWeight(t) {
  // 0 fully night .. 1 fully day, soft-edged around the horizon
  return clamp01((elevationFactor(t) + 0.06) / 0.22);
}
function dawnDuskWeight(t) {
  // peaks near sunrise/sunset, ~0 at noon and midnight
  const e = elevationFactor(t);
  return clamp01(1 - Math.abs(e) / 0.42);
}
function duskSide(t) { return t > 0.5 && t < 1.0; } // rough half used to bias warm-dusk vs warm-dawn hue
function nightWeight(t) {
  // 0 by day, 1 deep night; leaks into the dusk band so the moon rises early
  return clamp01(1 - dayWeight(t) * 1.4 - dawnDuskWeight(t) * 0.75);
}

// ---------------------------------------------------------------- shared sky GLSL
// The one sky gradient every sky-facing shader agrees on (dome, backdrop
// haze, clouds' aerial fade, water reflections).
const SKY_PARS = /* glsl */ `
uniform vec3 uSkyTop, uSkyMid, uSkyBottom, uSkyHorizon;
uniform vec3 uSkySunDir, uSkySunColor, uSkyGlowColor;
uniform float uSkySunAmt, uSkyGlowAmt, uSkyFlash;
vec3 lfSkyGradient(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  // Three-stop gradient: thin horizon band -> mid (fades out by ~9 deg) ->
  // zenith (fully by ~30 deg — gameplay cameras see real sky color, not haze).
  vec3 col = mix(uSkyMid, uSkyTop, smoothstep(0.1, 0.38, h));
  col = mix(uSkyHorizon, col, smoothstep(0.0, 0.12, h));
  col = mix(uSkyBottom, col, smoothstep(-0.12, 0.04, h));
  // Azimuthal horizon glow — sunrise/sunset fire around the sun's bearing.
  vec2 fwd = normalize(dir.xz + vec2(1e-5, 0.0));
  vec2 sunFwd = normalize(uSkySunDir.xz + vec2(1e-5, 0.0));
  float az = max(dot(fwd, sunFwd), 0.0);
  float band = exp(-abs(h - 0.02) * 7.0);
  col += uSkyGlowColor * (pow(az, 5.0) * band * uSkyGlowAmt);
  col += vec3(0.55, 0.6, 0.75) * uSkyFlash * (0.35 + 0.65 * smoothstep(-0.05, 0.4, h));
  return col;
}
`;

// ---------------------------------------------------------------- dome shader
const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // pin to (just inside) the far plane — always behind everything. Exactly
  // z = w sits on the clip boundary and some triangles get numerically
  // clipped away (see-through slivers); a hair inside is stable.
  gl_Position = vec4(clip.xy, clip.w * 0.99999, clip.w);
}`;
const DOME_FRAG = /* glsl */ `
varying vec3 vDir;
${SKY_PARS}
uniform vec3 uMoonDir, uMoonDir2, uMoonColor;
uniform float uMoonAmt, uSunSoft;
void main() {
  vec3 dir = normalize(vDir);
  vec3 col = lfSkyGradient(dir);
  // Soft sun: a gently-edged disc (~1.7 deg) with a hot core, a warm inner
  // glow and a wide faint halo. uSunSoft (0 noon .. 1 low sun) swells the
  // glow near the horizon so dawn/dusk suns bloom, noon suns stay crisp.
  float sd = max(dot(dir, uSkySunDir), 0.0);
  float disc = smoothstep(0.99935, 0.99975, sd);
  float core = pow(sd, 3000.0);
  float glow = pow(sd, 160.0) * (0.5 + 0.5 * uSunSoft) + pow(sd, 22.0) * (0.12 + 0.2 * uSunSoft)
             + pow(sd, 5.0) * 0.04 * uSunSoft;
  col += uSkySunColor * (disc * 2.2 + core * 1.5 + glow) * uSkySunAmt;
  // moon: crescent disc (a second, offset disc bites the shadow side) + halo
  float moonDot = max(dot(dir, uMoonDir), 0.0);
  float mdisc = smoothstep(0.99935, 0.9998, moonDot);
  float bite = smoothstep(0.99915, 0.9997, max(dot(dir, uMoonDir2), 0.0));
  float crescent = clamp(mdisc - bite * 0.85, 0.0, 1.0);
  float mhalo = pow(moonDot, 90.0) * 0.3 + pow(moonDot, 14.0) * 0.05;
  col += uMoonColor * (crescent * 1.7 + mhalo) * uMoonAmt;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- star shader
const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
varying float vPhase;
uniform float uPixelScale;
void main() {
  vPhase = aPhase;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelScale;
  gl_Position = vec4(clip.xy, clip.w * 0.99999, clip.w);
}`;
const STAR_FRAG = /* glsl */ `
varying float vPhase;
uniform float uTime, uAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  float twinkle = 0.55 + 0.45 * sin(uTime * 2.2 + vPhase * 20.0);
  gl_FragColor = vec4(vec3(1.0, 0.98, 0.92), a * twinkle * uAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- painted clouds
// Camera-centered billboards pinned to the far plane: each instance is a
// direction (azimuth/elevation, drifting in azimuth with time) plus an
// angular size, so cloud banks sit exactly in the low band of sky the
// gameplay camera frames, never get fogged/clipped, and cost one draw call.
// The puff atlas (4 cumulus variants) is generated at startup: density in R,
// baked top-down self-shadowing in G, so the shader just paints a lit crown
// and a shaded belly in the time-of-day colors.
const CLOUD_VERT = /* glsl */ `
attribute vec4 aCloud;   // azimuth, elevation, half-width (rad), drift speed (rad/s)
attribute vec4 aCloud2;  // atlas cell (0..3), flip (+-1), aspect, alpha
uniform float uTime;
varying vec2 vUv;
varying vec3 vDir;
varying float vAlpha;
varying vec2 vCell;
void main() {
  float az = aCloud.x + uTime * aCloud.w;
  float el = aCloud.y;
  vec3 dir = vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
  vDir = dir;
  vec4 c = viewMatrix * vec4(cameraPosition + dir * 1000.0, 1.0);
  float w = tan(aCloud.z) * 1000.0;
  c.xy += vec2(position.x * aCloud2.y, position.y * aCloud2.z) * w * 2.0;
  vec4 clip = projectionMatrix * c;
  gl_Position = vec4(clip.xy, clip.w * 0.9999, clip.w);
  vUv = uv;
  vAlpha = aCloud2.w;
  vCell = vec2(mod(aCloud2.x, 2.0), floor(aCloud2.x / 2.0)) * 0.5;
}`;
const CLOUD_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vDir;
varying float vAlpha;
varying vec2 vCell;
uniform sampler2D uTex;
uniform vec3 uLit, uShade;
uniform float uAlpha, uRim, uSoft;
${SKY_PARS}
void main() {
  // atlas rows are stored top-down (flipY off): sample the cell upside-right
  vec4 t = texture2D(uTex, vCell + vec2(vUv.x, 1.0 - vUv.y) * 0.5);
  float dens = t.r;
  float a = smoothstep(0.03, mix(0.6, 1.15, uSoft), dens) * uAlpha * vAlpha;
  if (a < 0.004) discard;
  vec3 col = mix(uShade, uLit, t.g);
  // silver lining: thin edges glow when the cloud sits near the sun
  float sunNear = pow(max(dot(vDir, uSkySunDir), 0.0), 6.0);
  col += uSkySunColor * sunNear * (1.0 - smoothstep(0.08, 0.55, dens)) * uRim;
  // aerial perspective: banks low on the horizon dissolve into the sky
  float low = 1.0 - smoothstep(0.0, 0.24, vDir.y);
  col = mix(col, lfSkyGradient(vDir), low * 0.5);
  col += vec3(0.6, 0.65, 0.8) * uSkyFlash * 0.6;
  gl_FragColor = vec4(col, a * (1.0 - low * 0.35));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- backdrop shader
const BACK_VERT = /* glsl */ `
attribute float aEdge;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vEdge;
void main() {
  vWorld = position;
  vNormal = normal;
  vEdge = aEdge;
  vec4 clip = projectionMatrix * viewMatrix * vec4(position, 1.0);
  gl_Position = vec4(clip.xy, clip.w * 0.9999, clip.w); // just inside the far plane (see dome)
}`;
const BACK_FRAG = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying float vEdge;
uniform vec3 uTint, uSunC, uAmbC, uFogC, uSnowC;
uniform float uAerial, uMist, uNearFog, uSnowY, uEyeY, uRadius, uHazeUp;
${SKY_PARS}
float lfHash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  vec3 flat3 = vec3(vWorld.x, 0.0, vWorld.z);
  vec3 az = flat3 / max(length(flat3), 1e-3);
  float elev = (vWorld.y - uEyeY) / uRadius;          // ~tan(elevation)
  vec3 n = normalize(vNormal);
  // vertical pixels to the crest line: soft 1-px edge (the composer target
  // has no MSAA) and the anchor for the thin backlit rim below. dFdy only —
  // across steep neighbouring columns the horizontal derivative explodes
  // (fwidth opened see-through wedges), while (1-e)/(de/dy) is exactly the
  // vertical distance to the crest segment above this pixel.
  float px = (1.0 - vEdge) / max(abs(dFdy(vEdge)), 1e-6);
  // snow caps on high rock (noisy line)
  float ang = atan(az.z, az.x);
  float sn = lfHash(floor(ang * 180.0)) * 0.6 + lfHash(floor(ang * 41.0) + 7.0) * 0.4;
  float snow = smoothstep(uSnowY - 2.0, uSnowY + 2.0, vWorld.y + (sn - 0.5) * uRadius * 0.012);
  vec3 alb = mix(uTint, uSnowC, snow);
  float ndl = max(dot(n, uSkySunDir), 0.0);
  vec3 body = alb * (uAmbC + uSunC * (ndl * 0.85 + 0.15));
  // aerial perspective: the air between us and the ridge is lit by the whole
  // sky, not just the bright horizon band — lean the haze toward the mid sky
  // so far ranges read as soft blue/violet silhouettes, never a pale wall
  vec3 haze = lfSkyGradient(normalize(vec3(az.x, 0.028, az.z)));
  haze = mix(haze, uSkyMid, uHazeUp);
  haze = mix(haze, uFogC, uNearFog);
  vec3 col = mix(body, haze, uAerial);
  // backlit crest: silhouettes toward a low sun catch a thin warm rim
  vec2 sunFwd = normalize(uSkySunDir.xz + vec2(1e-5, 0.0));
  float toward = pow(max(dot(az.xz, sunFwd), 0.0), 4.0);
  col += (uSkyGlowColor + uSkySunColor * 0.3) * toward * exp(-px * 0.45) * uSkyGlowAmt * 0.6;
  // valley mist: the foot of every layer dissolves into the haze
  float mist = 1.0 - smoothstep(-0.035, 0.025, elev);
  col = mix(col, haze, clamp(mist * uMist, 0.0, 1.0));
  col += vec3(0.5, 0.55, 0.7) * uSkyFlash * 0.25;
  gl_FragColor = vec4(col, clamp(px + 0.35, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- light shafts (forest)
const SHAFT_VERT = /* glsl */ `
attribute vec4 aShaft;   // tile x, tile z, phase, width
uniform float uTile, uGroundY, uLen;
uniform vec3 uShaftDir;
varying vec2 vUv;
varying float vFade;
varying float vPhase;
varying float vDist;
varying vec3 vWorldP;
void main() {
  vec2 rel = mod(aShaft.xy - cameraPosition.xz + 0.5 * uTile, uTile) - 0.5 * uTile;
  vec3 base = vec3(cameraPosition.x + rel.x, uGroundY - 1.0, cameraPosition.z + rel.y);
  vec3 axis = uShaftDir;
  vec3 toCam = normalize(cameraPosition - base);
  vec3 side = normalize(cross(axis, toCam) + vec3(1e-4, 0.0, 0.0));
  vec3 p = base + axis * (position.y * uLen) + side * (position.x * aShaft.w);
  vUv = vec2(position.x + 0.5, position.y);
  float d = length(rel);
  // only in the middle distance: up close a beam is just a pale smear
  vFade = smoothstep(11.0, 17.0, d) * (1.0 - smoothstep(uTile * 0.34, uTile * 0.5, d));
  vWorldP = p;
  vPhase = aShaft.z;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const SHAFT_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vFade;
varying float vPhase;
varying float vDist;
varying vec3 vWorldP;
uniform vec3 uShaftColor;
uniform float uIntensity, uTime, uFogD;
void main() {
  // Light shafts only read against the dark under-canopy; seen against open
  // sky (above eye level) additive beams turn into searchlights — fade them
  // per pixel by elevation from the eye.
  vec3 toP = vWorldP - cameraPosition;
  float skyward = smoothstep(-0.03, 0.16, toP.y / max(length(toP), 1e-3));
  float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float a = across * across * (3.0 - 2.0 * across);
  a *= smoothstep(0.0, 0.3, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
  a *= vFade * (1.0 - skyward) * uIntensity * (0.55 + 0.45 * sin(uTime * 0.31 + vPhase * 6.2831));
  // a tilted beam's upper end can lean over the camera even when its foot is
  // far away — fade by true per-pixel distance so no beam ever smears the lens
  a *= smoothstep(9.0, 16.0, vDist);
  float fd = uFogD * vDist;
  a *= exp(-fd * fd);
  gl_FragColor = vec4(uShaftColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function makeColorSet(zone, mood) {
  const top = new THREE.Color(zone.ambient?.skyTop ?? 0x8ecbff);
  // Deepen the daylight zenith: zone skyTop values are authored bright, and
  // an un-deepened top washes out entirely at noon. A saturation push plus a
  // lightness cut keeps a real blue overhead (haze stays at the horizon)
  // while preserving each zone's hue identity.
  const topHSL = { h: 0, s: 0, l: 0 };
  top.getHSL(topHSL);
  top.setHSL(topHSL.h, Math.min(1, topHSL.s * 1.18 + 0.06), topHSL.l * 0.78);
  const bottom = new THREE.Color(zone.ambient?.skyBottom ?? 0xdff2e0);
  const keyC = new THREE.Color(mood.key ?? MOOD_DEFAULT.key);
  // The zone key light leans hard toward the mood color — this is the single
  // strongest per-zone identity lever.
  const sun = new THREE.Color(zone.ambient?.sun ?? 0xfff2d0).lerp(keyC, 0.55);
  const duskBias = mood.duskBias != null ? new THREE.Color(mood.duskBias) : null;

  const day = {
    top,
    mid: top.clone().lerp(bottom, mood.midMix ?? 0.3), // mostly zenith hue — a hint of haze
    bottom: bottom.clone().lerp(top, 0.22),
    // Noon horizon is warm-WHITE haze, not orange — authored skyBottom values
    // are warm enough that un-desaturated they read as permanent sunset.
    // Permanent-twilight zones (starFloor) skip the haze: their horizon must
    // stay saturated violet, not wash to gray.
    horizon: mood.starFloor
      ? bottom.clone().lerp(keyC, (mood.warmth ?? 0.3) * 0.2)
      : bottom.clone().lerp(WHITE, mood.haze ?? 0.35).lerp(keyC, (mood.warmth ?? 0.3) * 0.18),
  };
  const night = {
    top: top.clone().lerp(new THREE.Color(0x05070f), 0.9),
    mid: top.clone().lerp(new THREE.Color(0x0d1226), 0.85),
    bottom: bottom.clone().lerp(new THREE.Color(0x121c3a), 0.86),
    // A clear deep blue at the horizon (v1's gray-blue read as fog-gray).
    horizon: bottom.clone().lerp(new THREE.Color(0x1d3372), 0.9),
    glow: new THREE.Color(0x2c3c6e),
  };
  const dawn = {
    top: top.clone().lerp(new THREE.Color(0x7186c8), 0.45),
    mid: top.clone().lerp(new THREE.Color(0xe09aa8), 0.55), // the pink-gold band
    bottom: bottom.clone().lerp(new THREE.Color(0xffc188), 0.62),
    horizon: bottom.clone().lerp(new THREE.Color(0xffcf96), 0.7),
    glow: new THREE.Color(0xffb26e),
  };
  const dusk = {
    top: top.clone().lerp(new THREE.Color(0x453a78), 0.55), // deep violet zenith
    mid: top.clone().lerp(new THREE.Color(0xc86a70), 0.5),  // coral band
    bottom: bottom.clone().lerp(new THREE.Color(0xff9448), 0.58),
    horizon: bottom.clone().lerp(new THREE.Color(0xff8e56), 0.66),
    glow: new THREE.Color(0xff7a38),
  };
  if (duskBias) { // e.g. mirrorlake's rose dusk
    dusk.mid.lerp(duskBias, 0.32);
    dusk.bottom.lerp(duskBias, 0.25);
    dusk.horizon.lerp(duskBias, 0.3);
    dusk.glow.lerp(duskBias, 0.4);
  }
  return {
    day, night, dawn, dusk,
    sunNoon: sun,
    sunDawn: sun.clone().lerp(new THREE.Color(0xff9a5c), 0.6),
    sunDusk: (duskBias ? sun.clone().lerp(duskBias, 0.3) : sun.clone()).lerp(new THREE.Color(0xff6e3c), 0.6),
    moon: new THREE.Color(0x93ace0), // dim steel-blue — moonlight, not daylight

    shadow: new THREE.Color(mood.shadow ?? MOOD_DEFAULT.shadow),
    bounce: new THREE.Color(mood.bounce ?? MOOD_DEFAULT.bounce),
    duskGround: new THREE.Color(0x5b4a8a), // design-bible dusk purple (shadow side)
  };
}

// ---------------------------------------------------------------- live shared sky state
function makeSkyUniforms() {
  return {
    uSkyTop: { value: new THREE.Color(0x6aa8e8) },
    uSkyMid: { value: new THREE.Color(0x9cc8ec) },
    uSkyBottom: { value: new THREE.Color(0xcfe0e8) },
    uSkyHorizon: { value: new THREE.Color(0xe8eef0) },
    uSkySunDir: { value: new THREE.Vector3(0.3, 0.9, 0.3).normalize() },
    uSkySunColor: { value: new THREE.Color(0xfff2d0) },
    uSkySunAmt: { value: 1 },
    uSkyGlowColor: { value: new THREE.Color(0xff9a50) },
    uSkyGlowAmt: { value: 0 },
    uSkyFlash: { value: 0 },
  };
}

/**
 * Live sky state for sibling modules (water.js reflections, weather.js
 * lightning). `uniforms` are the SAME {value} objects the dome renders with —
 * reference them straight in another ShaderMaterial's uniforms (zero copies).
 * `light` carries the frame's key/fill so unlit shaders can match the lit
 * world. `glsl` declares those uniforms + lfSkyGradient(dir).
 */
export const skyShared = {
  glsl: SKY_PARS,
  uniforms: makeSkyUniforms(),
  indoor: false,
  flash: 0, // weather.js writes 0..1 (lightning); sky.js decays + applies it
  light: {
    sunColor: new THREE.Color(0xfff2d0), sunIntensity: 3, dir: new THREE.Vector3(0.3, 0.9, 0.3).normalize(),
    hemiSky: new THREE.Color(0x9fc0e8), hemiGround: new THREE.Color(0xb8ac90), hemiIntensity: 0.5,
    day: 1, dusk: 0, night: 0,
  },
  // Backdrop silhouettes for cheap water reflections: `tex` is a 1024x1 ring
  // (u = azimuth/2PI with x=cos, z=sin) whose R/G/B hold the near/mid/far
  // crest as tan(elevation) from (0, eyeY, 0): value*0.4 - 0.05. `colors` are
  // the layers' current flat lit+hazed colors. null when the zone has none.
  backdrop: null,
};

// ---------------------------------------------------------------- periodic noise helpers
// Everything on a ring must wrap seamlessly at 360°, so profiles are built
// from integer harmonics (hills) or circular midpoint displacement (ridges).
function harmonicProfile(rng, kMin, kMax, falloff) {
  const terms = [];
  let norm = 0;
  for (let k = kMin; k <= kMax; k++) {
    const amp = Math.pow(k, -falloff) * (0.6 + rng() * 0.8);
    terms.push([k, amp, rng() * TAU]);
    norm += amp;
  }
  return (a) => {
    let s = 0;
    for (let i = 0; i < terms.length; i++) { const t = terms[i]; s += Math.sin(t[0] * a + t[2]) * t[1]; }
    return s / norm; // ~[-1, 1], usually much tighter
  };
}
function ridgeProfile(rng, levels, rough) {
  // circular midpoint displacement -> jagged but periodic, values ~[0,1]
  let pts = [];
  const N0 = 9;
  for (let i = 0; i < N0; i++) pts.push(rng());
  let amp = 0.5;
  for (let l = 0; l < levels; l++) {
    const next = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      next.push(a, (a + b) * 0.5 + (rng() * 2 - 1) * amp);
    }
    pts = next;
    amp *= rough;
  }
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
  const n = pts.length, span = Math.max(1e-5, hi - lo);
  return (a) => {
    const f = ((a / TAU) % 1 + 1) % 1 * n;
    const i = Math.floor(f), u = f - i;
    return (pts[i % n] * (1 - u) + pts[(i + 1) % n] * u - lo) / span;
  };
}

/** Silhouette polyline for one backdrop layer: sorted [angle, elevationDeg] pairs. */
function buildProfile(spec, rng) {
  const base = spec.base ?? 1, amp = spec.amp ?? 2;
  const bump = spec.bump;
  const bumpAt = (a) => {
    if (!bump) return 0;
    let d = Math.abs(((a - bump.dir) % TAU + TAU + Math.PI) % TAU - Math.PI);
    return bump.amp * Math.exp(-(d * d) / (2 * (bump.width ?? 0.7) ** 2));
  };
  let ground;
  if (spec.kind === 'jagged') {
    // sharpened fractal ridge, modulated by a slow swell so ranges rise and
    // fall around the ring (distinct massifs with low gaps, not a wall)
    const ridge = ridgeProfile(rng, 7, spec.rough ?? 0.55);
    const swell = harmonicProfile(rng, 1, 5, 0.9);
    const sharp = spec.sharp ?? 1.45;
    ground = (a) => {
      const s = clamp01(swell(a) * 0.9 + 0.5);
      return base + amp * Math.pow(ridge(a), sharp) * (0.3 + 0.7 * s) + bumpAt(a);
    };
  } else {
    const hills = harmonicProfile(rng, 2, 26, 1.25);
    const broad = harmonicProfile(rng, 1, 5, 0.8);
    ground = (a) => base + amp * clamp01(0.5 + hills(a) * 0.9 + broad(a) * 0.35) + bumpAt(a);
  }
  // base sampling: ~0.75 deg for ridges (keeps the jag), 1.2 deg for hills,
  // 2 deg under tree lines (the crowns carry the silhouette there)
  const step = (spec.kind === 'jagged' ? 0.75 : spec.kind === 'trees' ? 2 : 1.2) * DEG;
  const samples = [];
  for (let a = 0; a < TAU - 1e-6; a += step) samples.push(a);

  // silhouette features stamped on top of the ground line
  const feats = []; // { a, w (rad half-width), h (deg above ground), shape }
  if (spec.kind === 'trees') {
    let a = rng() * 0.02;
    while (a < TAU) {
      const round = rng() < (spec.round ?? 0);
      const w = (round ? 0.55 + rng() * 0.5 : 0.3 + rng() * 0.28) * DEG * (spec.treeW ?? 1) / spec.R;
      const h = (spec.treeH ?? 2) * (0.55 + rng() * 0.6) * (round ? 0.75 : 1) / Math.sqrt(spec.R);
      if (rng() < (spec.trees ?? 1)) feats.push({ a, w, h, shape: round ? 'round' : 'pine' });
      a += w * (round ? 1.3 : 1.05 + rng() * 0.9);
    }
  } else if (spec.kind === 'hills' && spec.clumps) {
    let a = rng() * 0.2;
    while (a < TAU) {
      const n = 1 + Math.floor(rng() * 4);
      if (rng() < spec.clumps) {
        for (let i = 0; i < n; i++) {
          const w = (0.4 + rng() * 0.45) * DEG / Math.sqrt(spec.R);
          feats.push({ a: a + i * w * 1.3, w, h: (0.5 + rng() * 0.5) * 1.1 / Math.sqrt(spec.R), shape: 'round' });
        }
      }
      a += (3 + rng() * 9) * DEG;
    }
  } else if (spec.kind === 'spires') {
    let a = rng() * 0.3;
    while (a < TAU) {
      if (rng() < (spec.spires ?? 0.5)) {
        const cluster = 1 + Math.floor(rng() * 4);
        for (let i = 0; i < cluster; i++) {
          const w = (0.12 + rng() * 0.3) * DEG * (i === 0 ? 1.6 : 1);
          const h = (spec.spireH ?? 3) * (0.35 + rng() * 0.75) * (i === 0 ? 1.3 : 1);
          feats.push({ a: a + i * (0.9 + rng() * 1.2) * DEG, w, h, shape: rng() < 0.3 ? 'spire' : 'tower', seed: rng() });
        }
      }
      a += (6 + rng() * 16) * DEG;
    }
  }
  // extra sample points on each feature so crowns/tips/steps are exact
  for (const f of feats) {
    if (f.shape === 'pine') {
      samples.push(f.a - f.w, f.a, f.a + f.w);
    } else if (f.shape === 'round') {
      for (let i = -3; i <= 3; i++) samples.push(f.a + (i / 3) * f.w);
    } else { // tower / spire: near-vertical sides + broken/pointed top
      const xs = f.shape === 'spire'
        ? [-1.04, -1, -0.675, -0.05, 0.575, 1, 1.04]
        : [-1.04, -1, -0.35, -0.33, 0.18, 0.2, 0.22, 1, 1.04];
      for (const x of xs) samples.push(f.a + x * f.w);
    }
  }
  const featH = (f, a) => {
    const x = (a - f.a) / f.w; // -1..1 across the feature
    if (x < -1.001 || x > 1.001) return -Infinity;
    const ax = Math.min(1, Math.abs(x));
    if (f.shape === 'pine') return f.h * (1 - ax);
    if (f.shape === 'round') return f.h * Math.sqrt(Math.max(0, 1 - ax * ax)) * 0.85 + f.h * 0.15 * (1 - ax);
    if (f.shape === 'spire') {
      const roof = f.h * 0.35 * Math.max(0, 1 - Math.abs(x + 0.05) * 1.6);
      return f.h * 0.8 + roof;
    }
    // tower with a broken, stepped top: a bite out of the crown, lower right shoulder
    if (x < -0.34) return f.h;
    if (x < 0.19) return f.h * (0.88 - f.seed * 0.25);
    if (x < 0.21) return f.h;
    return f.h * 0.86;
  };
  const norm = (a) => ((a % TAU) + TAU) % TAU;
  const pts = samples.map(norm).sort((p, q) => p - q);
  // dedupe near-identical angles
  const uniq = [];
  for (const a of pts) if (!uniq.length || a - uniq[uniq.length - 1] > 1e-5) uniq.push(a);
  // bucket features by angle for a cheap envelope evaluation
  const out = [];
  for (const a of uniq) {
    let h = ground(a), fh = -Infinity;
    for (let i = 0; i < feats.length; i++) {
      const f = feats[i];
      let d = a - f.a;
      if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
      if (Math.abs(d) > f.w * 1.01) continue;
      const v = featH(f, f.a + d);
      if (v > fh) fh = v;
    }
    if (fh > -Infinity) h = Math.max(h, ground(a) + fh);
    out.push([a, h]);
  }
  return out;
}

/** Ring strip mesh: per profile point one bottom and one crest vertex (2 triangles per point). */
function buildBackdropGeometry(profile, R, eyeY) {
  const n = profile.length;
  const pos = new Float32Array(n * 2 * 3);
  const nrm = new Float32Array(n * 2 * 3);
  const edge = new Float32Array(n * 2);
  const bottomY = eyeY - R * Math.tan(14 * DEG);
  for (let k = 0; k < n; k++) {
    const [a, e] = profile[k];
    const [ap, ep] = profile[(k - 1 + n) % n];
    const [an, en] = profile[(k + 1) % n];
    const ca = Math.cos(a), sa = Math.sin(a);
    const topY = eyeY + R * Math.tan(e * DEG);
    let da = an - ap; if (da <= 0) da += TAU;
    const slope = (Math.tan(en * DEG) - Math.tan(ep * DEG)) / Math.max(1e-4, da); // dh/ds (R cancels)
    // crest normal: facing the zone center, tipped up, turned by the slope
    const tx = -sa, tz = ca;       // tangent (increasing angle)
    const ix = -ca, iz = -sa;      // inward
    let cx = ix * 0.75 - tx * slope * 0.7, cy = 0.62, cz = iz * 0.75 - tz * slope * 0.7;
    let l = Math.hypot(cx, cy, cz); cx /= l; cy /= l; cz /= l;
    let bx = ix, by = 0.18, bz = iz; l = Math.hypot(bx, by, bz); bx /= l; by /= l; bz /= l;
    const o = k * 6;
    pos[o] = ca * R; pos[o + 1] = bottomY; pos[o + 2] = sa * R;
    pos[o + 3] = ca * R; pos[o + 4] = topY; pos[o + 5] = sa * R;
    nrm[o] = bx; nrm[o + 1] = by; nrm[o + 2] = bz;
    nrm[o + 3] = cx; nrm[o + 4] = cy; nrm[o + 5] = cz;
    edge[k * 2] = 0; edge[k * 2 + 1] = 1;
  }
  const idx = new (n * 2 > 65535 ? Uint32Array : Uint16Array)(n * 6);
  for (let k = 0; k < n; k++) {
    const a = k * 2, b = ((k + 1) % n) * 2;
    idx.set([a, a + 1, b, b, a + 1, b + 1], k * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

// ---------------------------------------------------------------- cloud atlas
let _cloudTex = null;
/** 4 soft cumulus variants in a 2x2 atlas: R = density, G = baked top-light. Shared, built once. */
function cloudTexture() {
  if (_cloudTex) return _cloudTex;
  const W = 512, H = 256, CW = 256, CH = 128;
  const dens = new Float32Array(W * H);
  const rng = seededRandom(0x51c0d5);
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * CW, oy = Math.floor(v / 2) * CH;
    const baseY = 92 + rng() * 8;           // flat belly line (px from the cell top)
    const puffs = [];
    const n = 12 + Math.floor(rng() * 9);
    const tall = 0.55 + rng() * 0.5;          // how towering this variant is
    for (let i = 0; i < n; i++) {
      const u = 0.16 + rng() * 0.68;
      const center = 1 - Math.abs(u - 0.5) * 2;
      const r = (11 + rng() * 17) * (0.6 + 0.75 * center);
      const lift = r * (0.25 + rng() * 0.9) * (0.4 + center * tall);
      puffs.push([ox + u * CW, oy + baseY - lift, r]);
    }
    // a few flat, wide belly puffs keep the base broad
    for (let i = 0; i < 4; i++) puffs.push([ox + (0.24 + i * 0.17 + rng() * 0.05) * CW, oy + baseY - 4, 16 + rng() * 8]);
    for (let y = oy; y < oy + CH; y++) {
      for (let x = ox; x < ox + CW; x++) {
        let d = 0;
        for (const [cx, cy, r] of puffs) {
          const dx = (x - cx) / r, dy = (y - cy) / r;
          const q = 1 - (dx * dx + dy * dy);
          if (q > 0) d += q * q;
        }
        // flatten the underside + keep a clean margin inside the cell
        d *= clamp01((oy + baseY + 7 - y) / 12);
        const mx = Math.min(x - ox, ox + CW - 1 - x), my = Math.min(y - oy, oy + CH - 1 - y);
        d *= clamp01(Math.min(mx, my) / 6);
        dens[y * W + x] = d;
      }
    }
  }
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = dens[i];
      // light: optical depth toward the sky (up and a little left) — crowns
      // bright, bellies and inner folds shaded
      let od = 0;
      for (let s = 1; s <= 7; s++) {
        const sy = y - s * 4, sx = x - s * 1.5;
        if (sy < 0 || ((sy / CH) | 0) !== ((y / CH) | 0)) break;
        od += dens[sy * W + Math.max(0, Math.round(sx))] ?? 0;
      }
      const light = Math.exp(-od * 0.42);
      const hn = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const grain = (hn - Math.floor(hn) - 0.5) * 0.05;
      data[i * 4] = Math.round(clamp01(Math.min(1, d) + grain * Math.min(1, d * 3)) * 255);
      data[i * 4 + 1] = Math.round(clamp01(light * 0.85 + 0.15) * 255);
      data[i * 4 + 2] = 0;
      data[i * 4 + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.flipY = false;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  _cloudTex = tex;
  return tex;
}

export function createSky(zone, scene) {
  const biome = zone.biome ?? zone.terrain?.kind ?? 'meadow';
  const indoor = INDOOR_BIOMES.has(biome);
  const mood = MOODS[zone.id] ?? MOOD_DEFAULT;
  const ind = indoor ? { ...INDOOR_DEFAULT, ...(mood.indoor ?? {}) } : null;
  const colors = makeColorSet(zone, mood);
  const keyI = mood.keyI ?? 1.0;
  const fillI = mood.fillI ?? 1.0;
  const domeR = Math.max((zone.size ?? 200) * 0.9, 180);
  const storm = zone.ambient?.weather === 'storm';
  const quality = settings.quality ?? 'high';
  const disposables = [];
  const skyObjects = [];

  // The actual time of day right now — used ONLY for the one-time fog
  // harmonization and the first-frame seed. Falls back safely when state
  // isn't initialized (unit tests construct sky without a running game).
  const tNow = (G?.calendar?.dayTime ?? zone.ambient?.startDayTime ?? 0.35);

  // ---------------------------------------------------------- fog (set once — see file header)
  // Harmonized: authored zone fog -> leaned toward the sky horizon color at
  // the CURRENT time of day -> tinted toward the mood. Entering mirrorlake at
  // dusk gets rose fog, whisperwood gets mossy green — never neutral gray.
  // The authored fogColor and mood tint are DAYLIGHT colors: by night they
  // hand over to the night horizon's deep blue (v1 kept the pale mood tint at
  // full strength after dark — dawnmeadow's night horizon read as glowing gray).
  const fogColor = new THREE.Color(zone.ambient?.fogColor ?? 0xcfe0d8);
  if (!indoor) {
    const dw0 = dayWeight(tNow), ddw0 = dawnDuskWeight(tNow);
    const dwp0 = dw0 * (1 - ddw0 * 0.45); // palette weight (see update())
    const band0 = duskSide(tNow) ? colors.dusk : colors.dawn;
    const horizon0 = colors.night.horizon.clone().lerp(band0.horizon, ddw0).lerp(colors.day.horizon, dwp0);
    const mid0 = colors.night.mid.clone().lerp(band0.mid, ddw0).lerp(colors.day.mid, dwp0);
    // The "air" color: the horizon lifted a little toward the mid sky. By day
    // the authored fog keeps a say; at dusk/night the sky's own air takes
    // over (the authored color is a daylight color — v1 left distant trees
    // glowing pale gray against a rose dusk and a gray band under night skies).
    const air0 = horizon0.clone().lerp(mid0, 0.3);
    fogColor.lerp(air0, 0.55 + 0.4 * (1 - dw0));
    // Aerial perspective: at midday the distance cools toward the zenith blue
    // instead of staying a warm wall (warm fog is a dusk/dawn effect).
    fogColor.lerp(colors.day.top, dw0 * 0.24);
    const fogLight = clamp01(dw0 + ddw0 * 0.35);
    if (mood.fogTint != null) fogColor.lerp(new THREE.Color(mood.fogTint), (mood.fogTintAmt ?? 0.4) * (mood.starFloor ? 1 : fogLight));
    // distant silhouettes should sit a touch darker than the glowing band
    fogColor.multiplyScalar(lerp(0.86, 1, dw0));
  } else if (mood.fogTint != null) {
    fogColor.lerp(new THREE.Color(mood.fogTint), mood.fogTintAmt ?? 0.4);
  }
  scene.fog = new THREE.FogExp2(fogColor.getHex(), (zone.ambient?.fogDensity ?? 0.008) * (mood.fogMul ?? 1));

  // ---------------------------------------------------------- shared sky uniforms
  const skyU = makeSkyUniforms();
  skyShared.uniforms = skyU;
  skyShared.indoor = indoor;
  skyShared.flash = 0;
  skyShared.backdrop = null;
  if (indoor) {
    skyU.uSkyTop.value.setHex(ind.domeTop);
    skyU.uSkyMid.value.setHex(ind.domeHorizon);
    skyU.uSkyBottom.value.setHex(ind.domeBottom);
    skyU.uSkyHorizon.value.setHex(ind.domeHorizon);
    skyU.uSkySunAmt.value = 0;
  }

  // ---------------------------------------------------------- gradient dome
  const domeUniforms = {
    ...skyU,
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uMoonDir2: { value: new THREE.Vector3(0, -1, 0) },
    uMoonColor: { value: new THREE.Color(colors.moon) },
    uMoonAmt: { value: 0 },
    uSunSoft: { value: 0 },
  };
  const domeGeo = new THREE.SphereGeometry(domeR, 32, 20);
  const domeMat = new THREE.ShaderMaterial({
    uniforms: domeUniforms, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG,
    side: THREE.BackSide, depthWrite: true, depthTest: true, fog: false,
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.name = 'skydome';
  dome.frustumCulled = false;
  // Drawn LAST among opaques: it sits at the far plane, so early depth test
  // skips every pixel terrain/props already covered (usually most of the
  // frame) instead of shading the full screen first and overdrawing it.
  // Transparent sky layers (stars, clouds, backdrop) still come after it.
  dome.renderOrder = 10000;
  dome.matrixAutoUpdate = false; // stays at origin forever
  scene.add(dome);
  skyObjects.push(dome);
  disposables.push({ geo: domeGeo, mat: domeMat });

  // ---------------------------------------------------------- stars (outdoor only)
  let stars = null, starUniforms = null;
  if (!indoor) {
    const starRng = seededRandom(hashStr((zone.id ?? 'zone') + '_stars'));
    const COUNT = 640;
    const starGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(COUNT * 3);
    const size = new Float32Array(COUNT);
    const phase = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const u = starRng(), v = starRng();
      const yaw = u * TAU;
      const elev = Math.pow(v, 0.55) * (Math.PI * 0.5 - 0.03) + 0.04; // biased upward, avoid horizon band
      const cy = Math.cos(elev);
      const x = Math.cos(yaw) * cy, y = Math.sin(elev), z = Math.sin(yaw) * cy;
      const r = domeR * 0.985;
      pos[i * 3] = x * r; pos[i * 3 + 1] = y * r; pos[i * 3 + 2] = z * r;
      size[i] = 1.35 + starRng() * 2.4;
      phase[i] = starRng() * 100;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    const hasDOM = typeof window !== 'undefined';
    const pixelScale = hasDOM ? Math.min(window.devicePixelRatio || 1, 2) * 1.85 : 1.85;
    starUniforms = { uTime: { value: 0 }, uAlpha: { value: 0 }, uPixelScale: { value: pixelScale } };
    const starMat = new THREE.ShaderMaterial({
      uniforms: starUniforms, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false,
    });
    stars = new THREE.Points(starGeo, starMat);
    stars.name = 'stars';
    stars.frustumCulled = false;
    stars.renderOrder = -999;
    scene.add(stars);
    skyObjects.push(stars);
    disposables.push({ geo: starGeo, mat: starMat });
  }

  // ---------------------------------------------------------- painted cloud banks (outdoor only)
  let clouds = null, cloudU = null;
  if (!indoor) {
    const cRng = seededRandom(hashStr((zone.id ?? 'zone') + '_clouds_v2'));
    const qMul = quality === 'low' ? 0.5 : quality === 'med' ? 0.75 : 1;
    const COUNT = Math.max(8, Math.round(40 * (mood.clouds ?? 1) * qMul));
    const list = [];
    for (let i = 0; i < COUNT; i++) {
      // Most banks sit low (2–11 deg): that's the strip of sky the default
      // 18-deg-pitch gameplay camera actually frames. Fewer, bigger ones float
      // higher for looking-up shots.
      const r = cRng();
      const el = (r < 0.62 ? 1.8 + cRng() * 9 : r < 0.9 ? 10 + cRng() * 14 : 22 + cRng() * 22) * DEG;
      const nearness = clamp01((el / DEG - 2) / 30); // higher = closer = bigger
      const hw = (4.5 + cRng() * 6 + nearness * 12) * DEG * (storm ? 1.8 : 1);
      list.push({
        az: cRng() * TAU, el, hw,
        speed: (0.0022 + cRng() * 0.003) * (storm ? 2.2 : 1) * (cRng() < 0.5 ? 1 : 0.8),
        cell: Math.floor(cRng() * 4), flip: cRng() < 0.5 ? -1 : 1,
        // storm decks are flat, smeared banks; fair-weather puffs are rounder
        aspect: (storm ? 0.3 : 0.5) * (0.8 + cRng() * 0.35) * (1 - nearness * 0.15),
        alpha: 0.75 + cRng() * 0.25,
      });
    }
    list.sort((p, q) => p.el - q.el); // far (low) banks first, nearer overhead ones on top
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    const a1 = new Float32Array(COUNT * 4), a2 = new Float32Array(COUNT * 4);
    list.forEach((c, i) => {
      a1.set([c.az, c.el, c.hw, c.speed], i * 4);
      a2.set([c.cell, c.flip, c.aspect, c.alpha], i * 4);
    });
    geo.setAttribute('aCloud', new THREE.InstancedBufferAttribute(a1, 4));
    geo.setAttribute('aCloud2', new THREE.InstancedBufferAttribute(a2, 4));
    geo.instanceCount = COUNT;
    cloudU = {
      ...skyU,
      uTex: { value: cloudTexture() },
      uTime: { value: 0 },
      uLit: { value: new THREE.Color(0xffffff) },
      uShade: { value: new THREE.Color(0x8a96b0) },
      uAlpha: { value: 0.9 },
      uRim: { value: 0.6 },
      uSoft: { value: storm ? 1 : 0 },
    };
    const cloudMat = new THREE.ShaderMaterial({
      uniforms: cloudU, vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG,
      transparent: true, depthWrite: false, depthTest: true, fog: false,
    });
    clouds = new THREE.Mesh(geo, cloudMat);
    clouds.name = 'clouds';
    clouds.frustumCulled = false;
    clouds.renderOrder = -998;
    scene.add(clouds);
    skyObjects.push(clouds);
    disposables.push({ geo, mat: cloudMat });
    quad.dispose();
  }

  // ---------------------------------------------------------- backdrop silhouettes (outdoor only)
  // Reference eye height: the terrain's typical height (read once from the
  // terrain mesh world.js already added) + standing eye height.
  let eyeY = 3;
  const terrainMesh = scene.getObjectByName('terrain');
  const tPos = terrainMesh?.geometry?.attributes?.position;
  if (tPos && tPos.count) {
    let sum = 0, n = 0;
    const stride = Math.max(1, Math.floor(tPos.count / 4000));
    for (let i = 0; i < tPos.count; i += stride) { sum += tPos.getY(i); n++; }
    eyeY = sum / Math.max(1, n) + 3;
  }
  const backLayers = [];
  const specs = indoor ? null : (BACKDROP_ZONES[zone.id] ?? BACKDROPS[biome] ?? BACKDROPS.meadow);
  if (specs) {
    const half = (zone.size ?? 200) / 2;
    const rNear = half * Math.SQRT2 + 45;
    const bRng = seededRandom(hashStr((zone.id ?? 'zone') + '_backdrop'));
    // denser storms/fog push the whole backdrop further into the haze
    const hazeK = clamp01(((zone.ambient?.fogDensity ?? 0.008) - 0.008) / 0.014);
    specs.forEach((spec, li) => {
      const R = rNear * spec.R;
      const profile = buildProfile(spec, bRng);
      const geo = buildBackdropGeometry(profile, R, eyeY);
      const u = {
        ...skyU,
        uTint: { value: new THREE.Color(spec.tint) },
        uSunC: { value: new THREE.Color() },
        uAmbC: { value: new THREE.Color() },
        uFogC: { value: new THREE.Color() },
        uSnowC: { value: new THREE.Color(0xe8eef8) },
        uAerial: { value: clamp01(spec.aerial + hazeK * (1 - spec.aerial) * 0.25) },
        uMist: { value: spec.mist ?? 0.5 },
        uNearFog: { value: li === 0 ? 0.55 : li === 1 ? 0.2 : 0 },
        uHazeUp: { value: li === 0 ? 0.1 : li === 1 ? 0.25 : 0.42 },
        uSnowY: { value: spec.snow != null ? eyeY + R * Math.tan(((spec.base ?? 1) + (spec.amp ?? 2) * spec.snow) * DEG) : 1e9 },
        uEyeY: { value: eyeY },
        uRadius: { value: R },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: u, vertexShader: BACK_VERT, fragmentShader: BACK_FRAG,
        transparent: true, depthWrite: false, depthTest: true, fog: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `backdrop${li}`;
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = -995 - li; // near layer (li 0) drawn last
      scene.add(mesh);
      skyObjects.push(mesh);
      disposables.push({ geo, mat });
      backLayers.push({ mesh, u, spec, profile, R, color: new THREE.Color() });
    });
    // crest ring texture for water reflections (see skyShared.backdrop)
    const N = 1024;
    const data = new Uint8Array(N * 4);
    const cursor = backLayers.map(() => 0);
    for (let i = 0; i < N; i++) {
      const a = (i + 0.5) / N * TAU;
      for (let li = 0; li < 3; li++) {
        const L = backLayers[li];
        if (!L) { data[i * 4 + li] = 0; continue; }
        const p = L.profile;
        let k = cursor[li];
        while (k < p.length - 1 && p[k + 1][0] < a) k++;
        cursor[li] = k;
        const [a0, e0] = p[k], [a1raw, e1] = p[(k + 1) % p.length];
        const a1 = a1raw <= a0 ? a1raw + TAU : a1raw;
        const u = a < a0 ? 0 : clamp01((a - a0) / Math.max(1e-6, a1 - a0));
        const tanE = Math.tan(lerp(e0, e1, u) * DEG);
        data[i * 4 + li] = Math.round(clamp01((tanE + 0.05) / 0.4) * 255);
      }
      data[i * 4 + 3] = 255;
    }
    const ringTex = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    ringTex.wrapS = THREE.RepeatWrapping;
    ringTex.magFilter = THREE.LinearFilter;
    ringTex.minFilter = THREE.LinearFilter;
    ringTex.needsUpdate = true;
    disposables.push({ mat: ringTex }); // dispose() is all we need from it
    skyShared.backdrop = {
      tex: ringTex, eyeY,
      radii: new THREE.Vector3(backLayers[0]?.R ?? 1e5, backLayers[1]?.R ?? 1e5, backLayers[2]?.R ?? 1e5),
      colors: [0, 1, 2].map((i) => backLayers[i]?.color ?? new THREE.Color()),
    };
  }

  // ---------------------------------------------------------- whisperwood light shafts
  let shafts = null, shaftU = null;
  if (biome === 'forest' && quality !== 'low') {
    const sRng = seededRandom(hashStr((zone.id ?? 'zone') + '_shafts'));
    const COUNT = quality === 'med' ? 9 : 14;
    const TILE = 58;
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.translate(0, 0.5, 0); // y 0..1 along the shaft
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    const a = new Float32Array(COUNT * 4);
    for (let i = 0; i < COUNT; i++) a.set([sRng() * TILE, sRng() * TILE, sRng(), 1.1 + sRng() * 2.6], i * 4);
    geo.setAttribute('aShaft', new THREE.InstancedBufferAttribute(a, 4));
    geo.instanceCount = COUNT;
    shaftU = {
      uTile: { value: TILE }, uGroundY: { value: 0 }, uLen: { value: 15 },
      uShaftDir: { value: new THREE.Vector3(0.3, 1, 0.1).normalize() },
      uShaftColor: { value: new THREE.Color(0xe6f0a0) },
      uIntensity: { value: 0 }, uTime: { value: 0 }, uFogD: { value: 0.02 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: shaftU, vertexShader: SHAFT_VERT, fragmentShader: SHAFT_FRAG,
      transparent: true, depthWrite: false, depthTest: true, fog: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    shafts = new THREE.Mesh(geo, mat);
    shafts.name = 'lightShafts';
    shafts.frustumCulled = false;
    shafts.renderOrder = 4;
    scene.add(shafts);
    skyObjects.push(shafts);
    disposables.push({ geo, mat });
    quad.dispose();
  }

  // ---------------------------------------------------------- lights
  // One dominant key: the warm sun by day, the cool moon by night (same
  // DirectionalLight — color/intensity/direction cross-fade through dusk).
  // Indoors it becomes a dim slanted mood key (no shadow) so forms still model.
  const sunLight = new THREE.DirectionalLight(indoor ? ind.key : colors.sunNoon.getHex(), indoor ? ind.keyI : 3.0 * keyI);
  sunLight.name = 'sunLight';
  sunLight.position.set(20, 32, 20); // sane default until world.js's shadow-follow takes over
  sunLight.target.name = 'sunLightTarget';
  sunLight.castShadow = !indoor;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -18; sunLight.shadow.camera.right = 18;
  sunLight.shadow.camera.top = 18; sunLight.shadow.camera.bottom = -18;
  sunLight.shadow.camera.near = 1; sunLight.shadow.camera.far = 70;
  sunLight.shadow.bias = -0.0015;
  sunLight.shadow.normalBias = 0.02;
  sunLight.shadow.camera.updateProjectionMatrix();
  scene.add(sunLight, sunLight.target);

  // Indoor ambience: the cave/spire floor palettes are dark *linear* albedos
  // behind ACES tonemapping — a timid hemisphere reads as a black screen.
  // These values are tuned empirically against a median-luminance target of
  // ~12% for caves (readable silhouettes) while the near-black dome keeps the
  // mood. The spire's fortress-black walls swallow far more light, so it gets
  // a stronger fill just to hold silhouette readability. Hue now comes from
  // the zone mood (gloamcavern teal, hollowspire violet).
  const indoorHemiI = (biome === 'spire' ? 7.0 : 4.0) * (ind?.hemiScale ?? 1);
  const indoorFillI = biome === 'spire' ? 9.0 : 7.5;
  const hemi = new THREE.HemisphereLight(
    indoor ? ind.hemiSky : colors.day.top.getHex(),
    indoor ? ind.hemiGround : colors.day.bottom.getHex(),
    indoor ? indoorHemiI : 0.5 * fillI,
  );
  hemi.name = 'skyHemi';
  scene.add(hemi);

  // Player-following fill light (world.js repositions it each frame).
  // cave/spire: the main readability light — bright enough that silhouettes
  // and crystal emissives read against the dark, wide + soft falloff.
  // outdoor: a faint warm "lantern" glow that only wakes at deep night so the
  // Warden never dissolves into the dark (see update()).
  let fillLight = null;
  if (indoor) {
    fillLight = new THREE.PointLight(ind.fill, indoorFillI * (ind.fillScale ?? 1), ind.fillRadius ?? 30, ind.fillDecay ?? 1.2);
    fillLight.name = 'skyFill';
    scene.add(fillLight);
  } else {
    fillLight = new THREE.PointLight(0xffc27a, 0, 11, 1.8);
    fillLight.name = 'skyLantern';
    scene.add(fillLight);
  }

  // The light direction world.js's shadow-follow reads (returned as `sunDir`).
  // Outdoors it cross-fades sun -> moon through dusk; indoors it's the fixed
  // slanted mood key.
  const lightDir = new THREE.Vector3(0, 1, 0);
  if (indoor) {
    lightDir.set(ind.keyDir[0], ind.keyDir[1], ind.keyDir[2]).normalize();
    skyU.uSkySunDir.value.copy(lightDir);
  }

  // ---------------------------------------------------------- scratch (no per-frame allocs)
  const _tc = new THREE.Color();
  const _tc2 = new THREE.Color();
  const _tc3 = new THREE.Color();
  const _tc4 = new THREE.Color();
  const _rim = new THREE.Color();
  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _rimDir = new THREE.Vector3();
  const CL_DAY_LIT = new THREE.Color(0xfff8ee), CL_DAY_SHADE = new THREE.Color(0x9aa6bc);
  const CL_DAWN_LIT = new THREE.Color(0xffd6a0), CL_DAWN_SHADE = new THREE.Color(0xb293a8);
  const CL_DUSK_LIT = new THREE.Color(0xffa290), CL_DUSK_SHADE = new THREE.Color(0x6e5a90);
  const CL_NIGHT_LIT = new THREE.Color(0x4a5676), CL_NIGHT_SHADE = new THREE.Color(0x1a2036);
  const CL_STORM_LIT = new THREE.Color(0x8a93a6), CL_STORM_SHADE = new THREE.Color(0x3a4252);
  if (mood.duskBias != null) CL_DUSK_LIT.lerp(new THREE.Color(mood.duskBias), 0.25);
  const azimuth = 0.9 + (hashStr(zone.id ?? 'zone') % 1000) / 1000 * 1.6;
  let time = zone.terrain?.seed != null ? (zone.terrain.seed % 17) * 0.31 : 0;
  let warden = null, wardenLookup = 0;
  const lookParams = { rimColor: _rim, rimStrength: 0.3, rimDir: _rimDir, rimDirMix: 0.35 };

  function update(dt, dayTime) {
    time += dt;
    const t = dayTime ?? 0.5;

    // lightning flash (weather.js pulses skyShared.flash) decays here
    const flash = skyShared.flash;
    skyU.uSkyFlash.value = flash;
    if (flash > 0) skyShared.flash = Math.max(0, flash - dt * 5.5);

    if (!indoor) {
      const elev = elevationFactor(t);
      const elevRad = elev * (72 * Math.PI / 180);
      const dirX = Math.cos(elevRad) * Math.sin(azimuth);
      const dirY = Math.sin(elevRad);
      const dirZ = Math.cos(elevRad) * Math.cos(azimuth);
      skyU.uSkySunDir.value.set(dirX, dirY, dirZ).normalize();
      // Moon opposes the sun — as the sun sinks the moon climbs the far side.
      const moonDir = domeUniforms.uMoonDir.value.set(-dirX, -dirY, -dirZ).normalize();
      // Crescent bite direction: nudge sideways (perp to up) for the shadow disc.
      _v.crossVectors(moonDir, _v2.set(0, 1, 0));
      if (_v.lengthSq() < 1e-4) _v.set(1, 0, 0);
      _v.normalize();
      domeUniforms.uMoonDir2.value.copy(moonDir).addScaledVector(_v, 0.011).normalize();

      const dw = dayWeight(t);
      const ddw = dawnDuskWeight(t);
      const nw = nightWeight(t);
      const dusk = duskSide(t);
      const band = dusk ? colors.dusk : colors.dawn;
      // Palette day-weight: while the sun is still low the dawn/dusk band
      // lingers in the COLORS (golden hour) — v1 let the noon palette swamp
      // it by ~0.27, so an early-morning town read as plain midday. Light
      // LEVELS keep using dw.
      const dwp = dw * (1 - ddw * 0.45);

      // sky gradient: night <-> (dawn|dusk) <-> day, three stops + horizon
      skyU.uSkyTop.value.copy(colors.night.top).lerp(band.top, ddw).lerp(colors.day.top, dwp);
      skyU.uSkyMid.value.copy(colors.night.mid).lerp(band.mid, ddw).lerp(colors.day.mid, dwp);
      skyU.uSkyBottom.value.copy(colors.night.bottom).lerp(band.bottom, ddw).lerp(colors.day.bottom, dwp);
      skyU.uSkyHorizon.value.copy(colors.night.horizon).lerp(band.horizon, ddw).lerp(colors.day.horizon, dwp);
      // horizon fire around the sun's bearing — strongest mid-band, gone at noon
      skyU.uSkyGlowColor.value.copy(colors.night.glow).lerp(band.glow, clamp01(ddw * 1.6));
      let glowAmt = Math.pow(ddw, 1.15) * 0.95 * (1 - dwp * 0.8) + nw * 0.12;
      if (storm) glowAmt *= 0.2;
      skyU.uSkyGlowAmt.value = glowAmt;

      // Warm-weighted color: any presence in the dawn/dusk band commits the key
      // light to amber (ddw peaks at only ~0.26 by 0.8 dayTime — unweighted it
      // stayed a cold blue while the ground went black).
      const sunCol = _tc.copy(colors.moon).lerp(dusk ? colors.sunDusk : colors.sunDawn, clamp01(ddw * 2.2)).lerp(colors.sunNoon, dwp);
      skyU.uSkySunColor.value.copy(sunCol);
      let sunAmt = clamp01(0.12 + dw * 0.88 + ddw * 0.25);
      // Storm zones (Skyreach): no cheerful sun-glow bleeding through the
      // storm dome — keep the mood cold.
      if (storm) sunAmt = Math.min(sunAmt, 0.25);
      skyU.uSkySunAmt.value = sunAmt;
      domeUniforms.uSunSoft.value = clamp01(1 - elev * 2.2);
      domeUniforms.uMoonAmt.value = nw * (storm ? 0.3 : 1);

      // ---- the ONE dominant key light: sun by day, moon by night ----------
      // moonMix crossfades color/intensity/direction through the dusk band.
      const moonMix = clamp01((nw - 0.45) / 0.45);
      sunLight.color.copy(sunCol).lerp(colors.moon, moonMix);
      const dayI = Math.pow(dw, 0.8) * 3.0 + ddw * 1.9;
      sunLight.intensity = (dayI * (1 - moonMix) + 0.62 * moonMix) * keyI;
      // Direction hand-off sun -> moon. The two are exact opposites, so the
      // blend passes through zero-length at the midpoint — the y-lift keeps it
      // finite (the key sweeps overhead during deep twilight, when it is at
      // its dimmest, so the sweep never reads on screen).
      lightDir.set(dirX, dirY, dirZ).multiplyScalar(1 - moonMix)
        .addScaledVector(_v2.set(-dirX, -dirY, -dirZ), moonMix);
      lightDir.y += moonMix * (1 - moonMix); // peak +0.25 at the midpoint
      if (lightDir.lengthSq() < 1e-4) lightDir.set(0, 1, 0);
      lightDir.normalize();
      // Position is NOT set here — world.js's per-frame "shadow-follow" step
      // keeps the light (and its tight shadow frustum) centered on the
      // player using this same exported `sunDir` vector, so the two never fight.

      // ---- dropped cool fill: warm-light/cool-shadow modelling ------------
      // Day: hemisphere sky side leans hard into the mood's cool shadow tint
      // (that is the color shadows take), ground side into the warm bounce.
      // Dusk: warm horizon light from the sky side, design-bible purple from
      // the ground. Night: deep blue, barely there — the moon key dominates.
      const warmW = clamp01(ddw * 1.9);
      _tc3.copy(colors.day.top).lerp(colors.shadow, 0.6);
      hemi.color.copy(colors.night.mid).lerp(band.horizon, warmW).lerp(_tc3, dwp);
      _tc4.copy(colors.day.bottom).lerp(colors.bounce, 0.5);
      hemi.groundColor.copy(colors.night.bottom).lerp(colors.duskGround, warmW).lerp(_tc4, dwp);
      // Fill stays LOW relative to the key (~1:6 at noon) so forms model;
      // floored through dusk so the band never collapses to black. (Raised
      // from 0.44: shadow sides of tall props and canopy undersides were
      // dropping to unreadable cool gray.)
      // (dusk floor 0.4 -> 0.5 in v2: the soft look wants readable dusk grounds)
      hemi.intensity = Math.max(lerp(0.13, 0.5, dw), 0.5 * clamp01(ddw * 5)) * fillI;

      if (stars) {
        // zone.ambient.stars / mood.starFloor: permanent-twilight zones
        // (Starfall Glade) keep their stars — it's their identity.
        const starFloor = mood.starFloor ?? (zone.ambient?.stars ? 0.6 : 0);
        starUniforms.uAlpha.value = damp01(starUniforms.uAlpha.value, Math.max(clamp01(1 - dw * 1.4), starFloor), dt);
      }
      if (starUniforms) starUniforms.uTime.value = time;

      // Warden lantern glow — wakes through dusk into night so the player
      // always carries a warm pool of light against the cool moonlight.
      if (fillLight) fillLight.intensity = clamp01((0.3 - dw) / 0.3) * 2.2;

      // ---- painted clouds: golden at dawn, rose at dusk, blue-gray at night
      if (clouds) {
        const dawnDusk = clamp01(ddw * 1.8) * (1 - dw * 0.55);
        const lit = cloudU.uLit.value.copy(CL_NIGHT_LIT)
          .lerp(dusk ? CL_DUSK_LIT : CL_DAWN_LIT, clamp01(ddw * 2.2))
          .lerp(CL_DAY_LIT, dw * (1 - dawnDusk * 0.6));
        const shade = cloudU.uShade.value.copy(CL_NIGHT_SHADE)
          .lerp(dusk ? CL_DUSK_SHADE : CL_DAWN_SHADE, clamp01(ddw * 2.2))
          .lerp(_tc2.copy(CL_DAY_SHADE).lerp(colors.day.top, 0.3), dw * (1 - dawnDusk * 0.6));
        if (storm) { lit.lerp(CL_STORM_LIT, 0.8).multiplyScalar(0.35 + dw * 0.65); shade.lerp(CL_STORM_SHADE, 0.85).multiplyScalar(0.35 + dw * 0.65); }
        // Permanent-twilight zones: clouds stay dim violet wisps
        if (mood.starFloor) { lit.multiplyScalar(0.5); shade.multiplyScalar(0.55); }
        cloudU.uAlpha.value = (storm ? 0.95 : lerp(0.72, 0.95, dw)) * (mood.starFloor ? 0.5 : 1);
        cloudU.uRim.value = storm ? 0.1 : 0.35 + ddw * 0.9;
        cloudU.uTime.value = time;
      }
    } else {
      // indoor: gentle flicker-free steady ambience; fillLight followed by world.js.
      // Tuned bright enough that cave/spire floors and silhouettes actually read
      // (median luminance target ≥12% in caves) while the dark dome keeps the mood.
      // The slanted mood key breathes very slightly with the fill.
      hemi.intensity = indoorHemiI * (1 + Math.sin(time * 0.15) * 0.025);
      if (fillLight) fillLight.intensity = indoorFillI * (ind.fillScale ?? 1) * (1 + Math.sin(time * 0.4) * 0.05);
      sunLight.intensity = ind.keyI * (1 + Math.sin(time * 0.23) * 0.03);
    }

    // ---- publish the frame's light for unlit shaders (water, backdrop) ----
    const L = skyShared.light;
    L.sunColor.copy(sunLight.color); L.sunIntensity = sunLight.intensity; L.dir.copy(lightDir);
    L.hemiSky.copy(hemi.color); L.hemiGround.copy(hemi.groundColor); L.hemiIntensity = hemi.intensity;
    if (!indoor) { L.day = dayWeight(t); L.dusk = dawnDuskWeight(t); L.night = nightWeight(t); }

    // ---- backdrop layers: lit by the same key/fill, hazed by the same sky
    if (backLayers.length) {
      const fogC = scene.fog?.color;
      for (let i = 0; i < backLayers.length; i++) {
        const B = backLayers[i], u = B.u;
        // /PI matches three's physically-based Lambert; distant layers read
        // a touch brighter in their fill (more open sky above them).
        u.uSunC.value.copy(sunLight.color).multiplyScalar(sunLight.intensity / Math.PI);
        u.uAmbC.value.copy(hemi.color).lerp(hemi.groundColor, 0.35).multiplyScalar(hemi.intensity * 1.45 / Math.PI);
        if (fogC) u.uFogC.value.copy(fogC);
        // flat stand-in color for the water's reflection of this layer
        B.color.copy(u.uTint.value).multiply(_tc2.copy(u.uSunC.value).multiplyScalar(0.45).add(u.uAmbC.value));
        _tc3.copy(skyU.uSkyHorizon.value).lerp(u.uFogC.value, u.uNearFog.value);
        B.color.lerp(_tc3, u.uAerial.value);
      }
    }

    // ---- whisperwood shafts: green-gold, by day only ----
    if (shafts) {
      if (!warden && (wardenLookup -= dt) <= 0) { warden = scene.getObjectByName('warden') || null; wardenLookup = 1; }
      if (warden) shaftU.uGroundY.value = warden.position.y;
      const s = skyU.uSkySunDir.value;
      // shafts lean toward the sun's bearing, but never more than 40 deg off
      // vertical (a low sun would otherwise lay them flat along the ground)
      const hl = Math.hypot(s.x, s.z) || 1;
      const tilt = Math.min(Math.acos(clamp(s.y, -1, 1)), 40 * DEG);
      shaftU.uShaftDir.value.set(s.x / hl * Math.sin(tilt), Math.cos(tilt), s.z / hl * Math.sin(tilt));
      shaftU.uIntensity.value = 0.14 * clamp01(dayWeight(t) * 1.2 - 0.1) * (0.7 + dawnDuskWeight(t) * 0.6);
      shaftU.uTime.value = time;
      shaftU.uFogD.value = (scene.fog?.density ?? 0.02) * 0.7;
    }

    // ---- shared rim light (LOOK-DEV's soft-look hook): sky/sun-derived ----
    if (MAT.setLookParams) {
      if (!indoor) {
        const dw = dayWeight(t), ddw = dawnDuskWeight(t), nw = nightWeight(t);
        // day: cool sky-white from above; dawn/dusk: warm sun-fire from the low
        // sun (back-light rims when you face it); night: soft moon-blue.
        _rim.copy(skyU.uSkyTop.value).lerp(WHITE, 0.5);
        _tc.copy(skyU.uSkySunColor.value).lerp(skyU.uSkyGlowColor.value, 0.4);
        _rim.lerp(_tc, clamp01(ddw * 1.6) * (1 - dw * 0.5));
        _rim.lerp(colors.moon, nw);
        // Low sun = backlight: the rim swells and goes nearly omni, so figures
        // standing against a sunset sky glow along their whole silhouette
        // (a sun-favouring rim would hide exactly on the edges we look at).
        const low = clamp01(ddw * 1.5) * (1 - dw * 0.5);
        lookParams.rimStrength = (0.27 + low * 0.3 + nw * 0.04) * (storm ? 0.75 : 1);
        _rimDir.copy(lightDir).multiplyScalar(0.6).add(_v.set(0, 1, 0)).normalize();
        lookParams.rimDirMix = 0.32 - low * 0.14;
      } else {
        _rim.setHex(ind.fill).lerp(WHITE, 0.25);
        lookParams.rimStrength = 0.34;
        _rimDir.copy(lightDir);
        lookParams.rimDirMix = 0.2;
      }
      try { MAT.setLookParams(lookParams); } catch (e) { /* look-dev API mid-change — never break the sky */ }
    }
  }

  function damp01(a, b, dt) { return a + (b - a) * (1 - Math.exp(-4 * dt)); }

  function dispose() {
    for (const o of skyObjects) scene.remove(o);
    scene.remove(sunLight, sunLight.target, hemi);
    if (fillLight) scene.remove(fillLight);
    sunLight.dispose(); // frees the 2048 shadow render target
    for (const d of disposables) { d.geo?.dispose(); d.mat?.dispose(); }
    scene.fog = null;
  }

  // seed the very first frame's uniforms/lights immediately (so a render before
  // the first update() tick — e.g. a stray frame during load — still looks right)
  update(0, tNow);

  return { update, sunLight, fillLight, sunDir: lightDir, dispose };
}
