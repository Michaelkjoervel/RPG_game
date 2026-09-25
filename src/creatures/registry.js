// =============================================================================
// LUMENFALL — src/creatures/registry.js
// The single entry point every other system uses to get a renderable,
// animated Kindred: `buildCreature(speciesId, { hollowed, gleaming })`.
// =============================================================================
//
// Every species' visual builder lives in src/creatures/models/<id>.js and
// exports `build_<id>(kit)`, returning `{ group, parts, hints }` (see
// kit.js's header for the parts/hints contract, and animator.js's header for
// how hints/parts drive procedural animation).
//
// This module statically imports ALL 48 species modules up front. Some of
// those files are still being written by two other agents in parallel right
// now — that's expected and fine: ES module imports don't execute until
// something actually calls buildCreature() for that species, so a
// currently-missing file only breaks builds for THAT species (caught by the
// try/catch below, which falls back to an "unknown wisp" placeholder rather
// than crashing the whole game).
//
// CONTRACT (ARCHITECTURE.md + CONTRACTS_ADDENDUM.md):
//   buildCreature(speciesId, {hollowed, gleaming} = {}) ->
//     { group /* THREE.Group, faces +Z, feet at y=0, height ≈ SPECIES[id].size */, animator }

import * as THREE from 'three';
import * as kit from './kit.js';
import { CreatureAnimator } from './animator.js';
import { addOutline } from '../gfx/materials.js';

// v2 soft-stylized look: every Kindred gets a soft dark ink outline (see
// gfx/materials.js addOutline) so it pops off grass/sky the way finished
// creature games' characters do. Applied here, once, after scaling and the
// hollowed/gleaming variants, so overworld followers, wild roamers, battle,
// the codex/title/starter previews and the gallery all get it for free.
// Width is ~constant on screen (≈ OUTLINE_PX px on a 900 px frame) and
// clamped to a small fraction of the creature's height at distance. Eyes,
// glows, transparent/unlit parts, flat sheets and tiny bits are skipped by
// addOutline itself. Deep plum-brown ink reads softer than black.
const OUTLINE_COLOR = 0x2a1d2b;
const OUTLINE_PX = 2.1;
// SPECIES is owned by the creature-data agent (src/data/creatures.js) and
// used only for its per-species `size` (world height in meters). Per the
// HARD RULES, importing a not-yet-existing sibling module is expected during
// the parallel build; this resolves once that file lands.
import { SPECIES } from '../data/creatures.js';

// The 48 canonical species ids (Design Bible §4), in bible order. Every
// builder below is imported unconditionally, per the addendum: "write all 48
// imports NOW; missing files will exist by integration."
import { build_kindlet } from './models/kindlet.js';
import { build_charvane } from './models/charvane.js';
import { build_pyrelith } from './models/pyrelith.js';
import { build_nixling } from './models/nixling.js';
import { build_maelfin } from './models/maelfin.js';
import { build_tidelorn } from './models/tidelorn.js';
import { build_thistlit } from './models/thistlit.js';
import { build_briarback } from './models/briarback.js';
import { build_sylvathorn } from './models/sylvathorn.js';
import { build_vellit } from './models/vellit.js';
import { build_veldrun } from './models/veldrun.js';
import { build_pipwing } from './models/pipwing.js';
import { build_aurelark } from './models/aurelark.js';
import { build_motling } from './models/motling.js';
import { build_zephyra } from './models/zephyra.js';
import { build_pebbin } from './models/pebbin.js';
import { build_cairnox } from './models/cairnox.js';
import { build_fulmin } from './models/fulmin.js';
import { build_stormane } from './models/stormane.js';
import { build_myclet } from './models/myclet.js';
import { build_fungore } from './models/fungore.js';
import { build_dapplyn } from './models/dapplyn.js';
import { build_cervalume } from './models/cervalume.js';
import { build_duskit } from './models/duskit.js';
import { build_noctyra } from './models/noctyra.js';
import { build_lanterling } from './models/lanterling.js';
import { build_glowvern } from './models/glowvern.js';
import { build_sonark } from './models/sonark.js';
import { build_reverbane } from './models/reverbane.js';
import { build_shardling } from './models/shardling.js';
import { build_chandelisk } from './models/chandelisk.js';
import { build_oozel } from './models/oozel.js';
import { build_sludgemaw } from './models/sludgemaw.js';
import { build_gloomel } from './models/gloomel.js';
import { build_finnet } from './models/finnet.js';
import { build_prismfin } from './models/prismfin.js';
import { build_jellune } from './models/jellune.js';
import { build_bogret } from './models/bogret.js';
import { build_nimbis } from './models/nimbis.js';
import { build_stratovane } from './models/stratovane.js';
import { build_rimehorn } from './models/rimehorn.js';
import { build_magmite } from './models/magmite.js';
import { build_glyphant } from './models/glyphant.js';
import { build_sancturne } from './models/sancturne.js';
import { build_vantash } from './models/vantash.js';
import { build_aurios } from './models/aurios.js';
import { build_nyxmara } from './models/nyxmara.js';
import { build_thalassyr } from './models/thalassyr.js';

/** Ordered list of every model id the registry knows how to build. */
export const SPECIES_MODEL_IDS = [
  'kindlet', 'charvane', 'pyrelith', 'nixling', 'maelfin', 'tidelorn', 'thistlit', 'briarback', 'sylvathorn',
  'vellit', 'veldrun', 'pipwing', 'aurelark', 'motling', 'zephyra', 'pebbin', 'cairnox', 'fulmin', 'stormane',
  'myclet', 'fungore', 'dapplyn', 'cervalume', 'duskit', 'noctyra', 'lanterling', 'glowvern',
  'sonark', 'reverbane', 'shardling', 'chandelisk', 'oozel', 'sludgemaw', 'gloomel',
  'finnet', 'prismfin', 'jellune', 'bogret',
  'nimbis', 'stratovane', 'rimehorn', 'magmite',
  'glyphant', 'sancturne', 'vantash',
  'aurios', 'nyxmara', 'thalassyr',
];

const BUILDERS = {
  kindlet: build_kindlet, charvane: build_charvane, pyrelith: build_pyrelith,
  nixling: build_nixling, maelfin: build_maelfin, tidelorn: build_tidelorn,
  thistlit: build_thistlit, briarback: build_briarback, sylvathorn: build_sylvathorn,
  vellit: build_vellit, veldrun: build_veldrun, pipwing: build_pipwing,
  aurelark: build_aurelark, motling: build_motling, zephyra: build_zephyra,
  pebbin: build_pebbin, cairnox: build_cairnox, fulmin: build_fulmin, stormane: build_stormane,
  myclet: build_myclet, fungore: build_fungore, dapplyn: build_dapplyn, cervalume: build_cervalume,
  duskit: build_duskit, noctyra: build_noctyra, lanterling: build_lanterling, glowvern: build_glowvern,
  sonark: build_sonark, reverbane: build_reverbane, shardling: build_shardling, chandelisk: build_chandelisk,
  oozel: build_oozel, sludgemaw: build_sludgemaw, gloomel: build_gloomel,
  finnet: build_finnet, prismfin: build_prismfin, jellune: build_jellune, bogret: build_bogret,
  nimbis: build_nimbis, stratovane: build_stratovane, rimehorn: build_rimehorn, magmite: build_magmite,
  glyphant: build_glyphant, sancturne: build_sancturne, vantash: build_vantash,
  aurios: build_aurios, nyxmara: build_nyxmara, thalassyr: build_thalassyr,
};

const warnedOnce = new Set();

function buildUnknownWisp() {
  // Elegant fallback so a missing/broken species builder never crashes the
  // game: a soft glowing orb with a couple of orbiting motes. Still a fully
  // valid { group, parts, hints } triple.
  const group = new THREE.Group();
  const glow = kit.mat(0xbfd6ff, { unlit: true, transparent: true, opacity: 0.75 });
  const body = kit.orb(0.25, glow);
  group.add(body);
  const spark = kit.heartspark(0.05, 0xffffff, { seed: 1 });
  kit.at(body, spark, 0, 0, 0);
  const motes = kit.mote(5, { color: 0xbfd6ff, radius: 0.35, height: 0.2, seed: 2 });
  kit.at(body, motes, 0, 0, 0);
  return {
    group,
    parts: { body, fx: [spark, motes] },
    hints: { personality: 'calm', hover: true, locomotion: 'float' },
  };
}

/**
 * Build a fully rigged, animated Kindred instance.
 * @param {string} speciesId - a key in SPECIES (data/creatures.js)
 * @param {object} [variant] {hollowed=false, gleaming=false}
 * @returns {{group: THREE.Group, animator: CreatureAnimator}}
 */
export function buildCreature(speciesId, variant = {}) {
  const { hollowed = false, gleaming = false } = variant;
  const builder = BUILDERS[speciesId];
  let built;
  try {
    if (!builder) throw new Error(`no model builder registered for "${speciesId}"`);
    built = builder(kit);
    if (!built || !built.group || !built.group.isObject3D) throw new Error(`build_${speciesId} did not return a valid { group }`);
  } catch (err) {
    if (!warnedOnce.has(speciesId)) {
      warnedOnce.add(speciesId);
      console.warn(`[registry] falling back to placeholder for "${speciesId}":`, err);
    }
    built = buildUnknownWisp();
  }
  const { group, parts = {}, hints = {} } = built;

  // Name the group after the species BEFORE scaling/variants so hollowify /
  // gleamify (which derive a deterministic seed from group.name) crack the
  // same way for the same species+build every time.
  group.name = speciesId;

  // Scale the whole creature so its measured height matches SPECIES[id].size,
  // if creature data is available. Data-agnostic fallback: if SPECIES lookup
  // fails (data module not ready yet, or an id outside the roster), leave the
  // model at its authored scale rather than crash.
  scaleToSpeciesHeight(group, speciesId);

  if (hollowed) kit.hollowify(group, parts);
  if (gleaming) kit.gleamify(group, parts);

  group.traverse((node) => { if (node.isMesh) node.castShadow = true; });
  pruneShadowCasters(group);

  try {
    // Ink only where it shapes the silhouette: parts smaller than ~5.5 % of
    // the creature's height (claws, teeth, spikes, buttons) skip their shell,
    // and at most the 14 largest parts get one (triangle + draw budget).
    const h = measureHeight(group) || 1;
    addOutline(group, {
      color: hollowed ? 0x2a2a30 : OUTLINE_COLOR, thickness: OUTLINE_PX,
      minSize: Math.min(0.12, Math.max(0.02, h * 0.055)), maxShells: 14,
    });
  } catch (err) {
    if (!warnedOnce.has('outline')) { warnedOnce.add('outline'); console.warn('[registry] outline pass failed', err); }
  }

  const animator = new CreatureAnimator(group, { parts, hints });
  return { group, animator };
}

// Shadow-map draws are the silent cost of 50-80-part creatures: eyes (sclera,
// iris, catchlight, lid), unlit glow bits, transparent fx and crumbs a few
// centimetres across can't cast a visible shadow, yet each one is an extra
// draw in every shadow pass. Pin them off (callers such as battle
// presentation blanket-enable castShadow on every mesh afterwards).
const _noShadow = { get: () => false, set: () => {}, configurable: true };
const _psV = new THREE.Vector3(), _psQ = new THREE.Quaternion(), _psS = new THREE.Vector3();
function pruneShadowCasters(group) {
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    if (!o.isMesh || !o.castShadow) return;
    let kill = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some((m) => !m || m.isMeshBasicMaterial || m.transparent || m.opacity < 1)) kill = true;
    for (let n = o; n && !kill && n !== group; n = n.parent) if (n.name === 'eye' || n.name === 'motes' || n.name === 'flame') kill = true;
    if (!kill && o.geometry) {
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      o.matrixWorld.decompose(_psV, _psQ, _psS);
      const r = o.geometry.boundingSphere.radius * Math.max(Math.abs(_psS.x), Math.abs(_psS.y), Math.abs(_psS.z));
      if (r < 0.03) kill = true;
    }
    if (kill) Object.defineProperty(o, 'castShadow', _noShadow);
  });
}

function measureHeight(group) {
  const box = new THREE.Box3().setFromObject(group);
  if (!isFinite(box.min.y) || !isFinite(box.max.y)) return 0;
  return Math.max(box.max.y, 0.0001);
}

// Rescale the whole model so its measured (post-build, pre-variant) height
// matches SPECIES[id].size. If a species has no data entry (shouldn't happen
// once creature-data lands, but keeps this file crash-proof in isolation),
// the model simply keeps its authored scale, which every model builder is
// expected to author at sane real-world proportions already.
//
// NOTE: every builder already calls kit.groundPlant() to plant its feet at
// y=0 — but that works by nudging the root's `.position.y`, and position
// does NOT scale with its own object's `.scale` (only child-local geometry
// does). Scaling the root after groundPlant has run reintroduces a vertical
// offset proportional to (1 - scaleFactor). So: scale first, then
// groundPlant AGAIN to correct for it. Cheap (one more bbox measurement) and
// makes this correct regardless of how big the size correction is.
function scaleToSpeciesHeight(group, speciesId) {
  const size = SPECIES && SPECIES[speciesId] ? SPECIES[speciesId].size : null;
  if (!size || size <= 0) return;
  const height = measureHeight(group);
  if (height <= 0) return;
  const s = size / height;
  if (isFinite(s) && s > 0) {
    group.scale.multiplyScalar(s);
    kit.groundPlant(group);
  }
}
