// CREATURES v2 — headless model audit (NOT a shoot.mjs driver; run with node):
//   node tools/drivers/v2-creatures-stats.mjs [id,id,...]
// Builds every species through the real registry in Node (tiny DOM stub for
// the contact-shadow canvas), then prints per-model triangles, mesh (draw
// call) count, flat-shaded material count, real height/width/length, and
// checks the animator parts contract: legs carry hip/knee/foot, eyelids are
// named 'eyelid', every part is attached under the returned group, the
// model is planted (min y ~ 0) and nothing sits below the feet.
import * as THREE from 'three';

globalThis.document ??= {
  createElement: () => ({
    width: 0, height: 0,
    getContext: () => ({
      createRadialGradient: () => ({ addColorStop() {} }),
      createLinearGradient: () => ({ addColorStop() {} }),
      fillRect() {}, beginPath() {}, arc() {}, fill() {}, fillText() {},
    }),
  }),
};

const { buildCreature, SPECIES_MODEL_IDS } = await import('../../src/creatures/registry.js');
const only = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2].split(',') : null;
const DETAIL = process.argv.includes('--detail');
const ids = only ?? SPECIES_MODEL_IDS;

function tris(geo) {
  if (!geo) return 0;
  return geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
}

let total = 0;
const rows = [];
for (const id of ids) {
  const warn = [];
  const origWarn = console.warn;
  console.warn = (...a) => warn.push(a.map(String).join(' ').slice(0, 200));
  let built;
  try { built = buildCreature(id); } finally { console.warn = origWarn; }
  const { group, animator } = built;
  group.updateMatrixWorld(true);
  let t = 0, meshes = 0, flat = 0, smoothMeshes = 0, eyeT = 0, olT = 0, olN = 0;
  const mats = new Set();
  const inEye = (n) => { let p = n; while (p) { if (p.name === 'eye') return true; p = p.parent; } return false; };
  group.traverse((n) => {
    if (!n.isMesh || !n.visible) return;
    if (n.name === 'contactShadow') return;
    if (n.userData.lfOutline) { olT += tris(n.geometry); olN++; return; }
    meshes++;
    if (inEye(n)) { eyeT += tris(n.geometry); return; }
    t += tris(n.geometry);
    const ms = Array.isArray(n.material) ? n.material : [n.material];
    for (const m of ms) {
      mats.add(m);
      if (m.flatShading) flat++; else if (m.isMeshStandardMaterial) smoothMeshes++;
    }
  });
  total += t;
  if (DETAIL) {
    const agg = new Map();
    group.traverse((n) => {
      if (!n.isMesh || n.name === 'contactShadow') return;
      const k = `${n.parent?.name || '?'}>${n.name || n.geometry.type}`;
      const e = agg.get(k) || { n: 0, t: 0 };
      e.n++; e.t += tris(n.geometry); agg.set(k, e);
    });
    console.log(`--- ${id}`);
    for (const [k, e] of [...agg].sort((a, b) => b[1].t - a[1].t)) console.log(`   ${String(e.t).padStart(6)} tris  x${e.n}  ${k}`);
  }
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  // contract checks
  const parts = animator.parts || {};
  const problems = [];
  const inTree = (o) => { let p = o; while (p) { if (p === group) return true; p = p.parent; } return false; };
  const chk = (o, label) => { const obj = o && o.isObject3D ? o : o && o.group; if (!obj) problems.push(`${label}:missing`); else if (!inTree(obj)) problems.push(`${label}:detached`); };
  if (parts.body) chk(parts.body, 'body'); else problems.push('no body');
  if (parts.head) chk(parts.head, 'head');
  (parts.eyelids || []).forEach((e, i) => { chk(e, `eyelid${i}`); if (e && e.name !== 'eyelid') problems.push(`eyelid${i}:name=${e.name}`); });
  (parts.legs || []).forEach((l, i) => { if (!l.hip || !l.knee || !l.foot) problems.push(`leg${i}:incomplete`); else { chk(l.hip, `leg${i}.hip`); chk(l.knee, `leg${i}.knee`); } });
  (parts.tail || []).forEach((o, i) => chk(o, `tail${i}`));
  (parts.wings || []).forEach((w, wi) => (w || []).forEach((o, i) => chk(o, `wing${wi}.${i}`)));
  (parts.accents || []).forEach((o, i) => chk(o, `accent${i}`));
  (parts.fx || []).forEach((f, i) => { if (typeof f.update !== 'function') problems.push(`fx${i}:no update`); });
  if (Math.abs(box.min.y) > 0.01) problems.push(`minY=${box.min.y.toFixed(3)}`);
  if (warn.length) problems.push(`WARN:${warn[0]}`);
  rows.push({ id, t, eyeT, olT, olN, meshes, mats: mats.size, flat, smooth: smoothMeshes, h: size.y, w: size.x, l: size.z, loco: animator._loco, problems });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('id', 12), pad('tris', 7), pad('eyeT', 6), pad('olT', 6), pad('olN', 4), pad('meshes', 7), pad('mats', 5), pad('flat', 5), pad('smooth', 7), pad('h', 6), pad('w', 6), pad('l', 6), pad('loco', 8), 'problems');
for (const r of rows) {
  console.log(pad(r.id, 12), pad(r.t, 7), pad(r.eyeT, 6), pad(r.olT, 6), pad(r.olN, 4), pad(r.meshes, 7), pad(r.mats, 5), pad(r.flat, 5), pad(r.smooth, 7), pad(r.h.toFixed(2), 6), pad(r.w.toFixed(2), 6), pad(r.l.toFixed(2), 6), pad(r.loco, 8), r.problems.join(' | '));
}
console.log(`TOTAL own tris (excl. eyes+outlines) ${total} over ${rows.length} models (avg ${Math.round(total / rows.length)})`);
