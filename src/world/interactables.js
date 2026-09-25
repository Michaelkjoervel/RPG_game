// interactables.js — chests, lore shards, shrines, and hidden sparkle pickups.
//
// Contract (docs/CONTRACTS_ADDENDUM.md):
//   createInteractables(zone, world) ->
//     { update(dt), tryInteract(playerPos, faceDir) -> bool,
//       nearestPrompt(playerPos) -> {text}|null, dispose() }
//
// Zone data (docs/ARCHITECTURE.md):
//   interactables: [ { kind:'chest', at:[x,z], item, qty, flag },
//                     { kind:'shard', at:[x,z], flag, dialogue? },
//                     { kind:'shrine', at:[x,z] },
//                     { kind:'sparkle', at:[x,z], item, qty, flag } ]
//
// Note: a 'shrine' interactable is often co-located with a decorative
// `shrine_stone` PROP (props.js already renders the monument) — so this
// module deliberately draws only a light ground-rune + glow for shrines,
// never a duplicate monolith.
//
// EXTENSION beyond the pinned vocabulary — 'pedestal' | 'valve' | 'dais':
// the zone-content agent placed gloamcavern's light-puzzle pedestals and
// sunkenruins' water-stair valves + Sancturne's trial dais as interactables
// with these kinds ({kind, at, flag}), and flagged in its own file comments
// that they need "a renderer + story.js hookup". The renderer is squarely
// this module's job, so pedestal/valve get a simple, safe primitive: interact
// toggles G.flags[flag] with matching on/off visuals + sfx, which is exactly
// the raw signal a STORY_TRIGGERS-style puzzle checker needs to build on.
// 'dais' is a one-shot flag set (like a chest) marking the trial as entered —
// actually starting the Sancturne boss battle is still story.js's job (e.g.
// reacting to the flag via onZoneEnter or a 'flag:set' listener).
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { G, setFlag, hasFlag, gainItem } from '../core/state.js';
import { clamp01, TAU } from '../core/math.js';
import { tween } from '../core/tween.js';
import { Particles } from '../gfx/particles.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { applyLook } from '../gfx/materials.js';

const INTERACT_RADIUS = 2.5;
const GOLD = 0xffe9b0;

const PROMPT_TEXT = {
  chest: 'Open chest', shard: 'Read the shard', shrine: 'Rest at the shrine', sparkle: 'Search here',
  pedestal: 'Touch the pedestal', valve: 'Turn the valve', dais: 'Step onto the dais',
};

const warned = new Set();
const warnOnce = (msg) => { if (!warned.has(msg)) { warned.add(msg); console.warn('[interactables]', msg); } };

// v2: smooth by default (soft stylized) — crystals pass { flat: true }.
function mat(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color, flatShading: opts.flat === true, roughness: opts.rough ?? 0.75,
    metalness: opts.metal ?? 0, emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.ei ?? 1, transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide, depthWrite: opts.depthWrite ?? true,
  });
  try { if (!opts.transparent) applyLook(m, { rim: opts.rim ?? 0.6, wrap: 1 }); } catch (e) { /* look optional */ }
  return m;
}

// Shared soft textures (module-level, generated once, never disposed).
let _glowTex = null, _starTex = null;
function glowTex() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 63);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.14)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}
function starTex() {
  if (_starTex) return _starTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 1, 64, 64, 34);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  for (const [w, len] of [[5, 62], [3, 40]]) { // 4-point star rays + faint diagonals
    for (let k = 0; k < (len === 62 ? 2 : 2); k++) {
      g.save(); g.translate(64, 64); g.rotate(k * Math.PI / 2 + (len === 62 ? 0 : Math.PI / 4));
      const lg = g.createLinearGradient(-len, 0, len, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.95)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg; g.beginPath(); g.moveTo(-len, 0); g.lineTo(0, -w); g.lineTo(len, 0); g.lineTo(0, w); g.closePath(); g.fill();
      g.restore();
    }
  }
  _starTex = new THREE.CanvasTexture(c);
  return _starTex;
}

function softDiscMaterial(colorHex, alpha = 0.55) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(colorHex) }, uAlpha: { value: alpha } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform vec3 uColor; uniform float uAlpha;
      void main(){
        float d = length(vUv - 0.5) * 2.0;
        float ring = smoothstep(1.0, 0.75, d) * smoothstep(0.35, 0.55, d);
        float fill = smoothstep(1.0, 0.0, d) * 0.35;
        float a = (ring + fill) * uAlpha;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
}

export function createInteractables(zone, world) {
  const disposables = []; // {geo?|mat?}
  const geoCache = new Map();
  const geo = (key, make) => {
    let g = geoCache.get(key);
    if (!g) { g = make(); geoCache.set(key, g); disposables.push({ geo: g }); }
    return g;
  };
  const M = (key, color, opts) => {
    let m = matCache.get(key);
    if (m) return m;
    m = mat(color, opts);
    matCache.set(key, m);
    disposables.push({ mat: m });
    return m;
  };
  const matCache = new Map();

  const scene = world.scene;
  const heightAt = (x, z) => { try { return world.heightAt(x, z); } catch (e) { return 0; } };
  const fx = new Particles(scene, { capacity: 260 });

  const records = [];
  let T = Math.random() * 100;

  // ---------------------------------------------------------------- builders
  // Additive billboard glow (sprite) and flat ground glow — no extra lights.
  function glowSprite(colorHex, size, opacity = 0.8, tex = glowTex()) {
    const m = new THREE.SpriteMaterial({ map: tex, color: colorHex, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    disposables.push({ mat: m });
    const sp = new THREE.Sprite(m);
    sp.scale.setScalar(size);
    return sp;
  }
  function groundGlow(colorHex, size, opacity = 0.5) {
    const m = new THREE.MeshBasicMaterial({ map: glowTex(), color: colorHex, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
    disposables.push({ mat: m });
    const d = new THREE.Mesh(geo('glow_plane', () => new THREE.PlaneGeometry(1, 1)), m);
    d.rotation.x = -Math.PI / 2;
    d.position.y = 0.03;
    d.scale.setScalar(size);
    d.renderOrder = 2;
    return d;
  }

  // ---------------------------------------------------------------- builders
  // Chest: rounded warm-wood body, domed lid on a back hinge, gold straps,
  // corner caps and lock plate; a golden seam of light leaks from under the
  // lid and a soft glow pools on the ground while it's unopened.
  function buildChest(rec) {
    const g = new THREE.Group();
    g.name = `chest:${rec.flag ?? ''}`;
    const woodMat = M('wood', 0xa8743f, { rough: 0.72 });
    const trimMat = M('wood_trim', 0x6a4226, { rough: 0.8 });
    const goldMat = M('gold', 0xffcf6e, { rough: 0.32, metal: 0.55, emissive: 0xffb84a, ei: 0.25 });
    const seamMat = M('chest_seam', 0xffe2a0, { emissive: 0xffd27a, ei: 2.4, rough: 1, rim: 0 });

    const base = new THREE.Mesh(geo('chest_base', () => new RoundedBoxGeometry(0.72, 0.38, 0.46, 2, 0.05)), woodMat);
    base.position.y = 0.19;
    base.castShadow = true; base.receiveShadow = true;
    g.add(base);
    const plank = new THREE.Mesh(geo('chest_plank', () => new THREE.BoxGeometry(0.735, 0.02, 0.475)), trimMat);
    plank.position.y = 0.2;
    g.add(plank);
    for (const dx of [-0.22, 0.22]) { // straps down the body
      const band = new THREE.Mesh(geo('chest_band', () => new RoundedBoxGeometry(0.07, 0.4, 0.48, 1, 0.015)), goldMat);
      band.position.set(dx, 0.19, 0);
      g.add(band);
    }
    for (const cx of [-0.34, 0.34]) for (const cz of [-0.21, 0.21]) { // corner caps
      const cap = new THREE.Mesh(geo('chest_corner', () => new RoundedBoxGeometry(0.08, 0.1, 0.08, 1, 0.02)), goldMat);
      cap.position.set(cx, 0.05, cz);
      g.add(cap);
    }
    const seam = new THREE.Mesh(geo('chest_seam', () => new THREE.BoxGeometry(0.7, 0.022, 0.44)), seamMat);
    seam.position.y = 0.385;
    g.add(seam);

    const lid = new THREE.Group();
    lid.position.set(0, 0.38, -0.23); // hinge at the back top edge
    const lidMesh = new THREE.Mesh(geo('chest_lid', () => new THREE.CylinderGeometry(0.23, 0.23, 0.72, 20, 1, false, 0, Math.PI)), woodMat);
    lidMesh.rotation.z = Math.PI / 2; // half-pipe axis along local X (chest width)
    lidMesh.position.set(0, 0, 0.23);
    lidMesh.scale.set(0.8, 1, 1);     // a slightly flattened dome
    lidMesh.castShadow = true;
    lid.add(lidMesh);
    for (const dx of [-0.22, 0.22]) { // straps over the dome
      const st = new THREE.Mesh(geo('chest_lid_strap', () => new THREE.CylinderGeometry(0.238, 0.238, 0.07, 20, 1, true, 0, Math.PI)), goldMat);
      st.rotation.z = Math.PI / 2;
      st.position.set(dx, 0, 0.23);
      st.scale.set(0.8, 1, 1);
      lid.add(st);
    }
    const plate = new THREE.Mesh(geo('chest_plate', () => new RoundedBoxGeometry(0.13, 0.15, 0.035, 1, 0.02)), goldMat);
    plate.position.set(0, -0.02, 0.465);
    lid.add(plate);
    const latch = new THREE.Mesh(geo('chest_latch', () => new THREE.SphereGeometry(0.035, 10, 8)), goldMat);
    latch.position.set(0, -0.07, 0.49);
    lid.add(latch);
    const hole = new THREE.Mesh(geo('chest_hole', () => new THREE.CylinderGeometry(0.014, 0.014, 0.02, 8)), trimMat);
    hole.rotation.x = Math.PI / 2;
    hole.position.set(0, -0.02, 0.485);
    lid.add(hole);
    g.add(lid);

    const pool = groundGlow(0xffd27a, 1.9, 0.42);
    g.add(pool);
    const halo = glowSprite(0xffe2a0, 1.2, 0.28);
    halo.position.y = 0.45;
    g.add(halo);

    g.userData.lid = lid;
    g.userData.gem = latch;
    g.userData.seam = seam;
    g.userData.pool = pool;
    g.userData.halo = halo;
    g.userData.emitAcc = 0;
    return g;
  }

  // Lore shard: a small faceted crystal cluster floating over a pulsing ring,
  // wrapped in a halo with motes orbiting it.
  function buildShard(rec) {
    const g = new THREE.Group();
    g.name = `shard:${rec.flag ?? ''}`;
    const crystalMat = M('shard_crystal', 0xffe9b0, { flat: true, emissive: 0xffd47a, ei: 1.5, rough: 0.25, metal: 0.1, transparent: true, opacity: 0.94 });
    const moteMat = M('shard_mote', 0xfff4d8, { emissive: 0xffe2a0, ei: 2.6, rough: 1, rim: 0 });
    const float = new THREE.Group();
    float.position.y = 0.85;
    const core = new THREE.Mesh(geo('shard_core', () => new THREE.OctahedronGeometry(0.24, 0)), crystalMat);
    core.scale.set(0.55, 1.6, 0.55);
    core.castShadow = true;
    float.add(core);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const sub = new THREE.Mesh(geo('shard_sub', () => new THREE.OctahedronGeometry(0.13, 0)), crystalMat);
      sub.position.set(Math.cos(a) * 0.13, -0.2, Math.sin(a) * 0.13);
      sub.scale.set(0.5, 1.25 - i * 0.18, 0.5);
      sub.rotation.set(Math.sin(a) * 0.5, a, -Math.cos(a) * 0.5);
      float.add(sub);
    }
    const halo = glowSprite(0xffd98a, 2.1, 0.55);
    float.add(halo);
    const motes = [];
    for (let i = 0; i < 4; i++) {
      const mo = new THREE.Mesh(geo('shard_mote_g', () => new THREE.SphereGeometry(0.028, 8, 6)), moteMat);
      float.add(mo);
      motes.push({ mesh: mo, r: 0.42 + i * 0.07, sp: 1.1 + i * 0.37, ph: i * 1.9, tilt: 0.3 + i * 0.25 });
    }
    g.add(float);
    const ring = new THREE.Mesh(geo('shard_ring', () => new THREE.PlaneGeometry(2.0, 2.0)), softDiscMaterial(GOLD, 0.5));
    disposables.push({ mat: ring.material });
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    g.add(ring);
    g.add(groundGlow(0xffd27a, 2.4, 0.35));
    const light = new THREE.PointLight(GOLD, 1.1, 5, 2);
    light.position.y = 0.9;
    g.add(light);
    g.userData.float = float;
    g.userData.halo = halo;
    g.userData.motes = motes;
    g.userData.ring = ring;
    g.userData.spin = 0;
    return g;
  }
  function buildShrineGlow(rec) {
    const g = new THREE.Group();
    g.name = `shrine:${rec.flag ?? ''}`;
    const ring = new THREE.Mesh(geo('shrine_ring', () => new THREE.PlaneGeometry(2.2, 2.2)), softDiscMaterial(GOLD, 0.5));
    disposables.push({ mat: ring.material });
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    g.add(ring);
    const light = new THREE.PointLight(GOLD, 0.7, 5, 2);
    light.position.y = 0.6;
    g.add(light);
    g.userData.ring = ring;
    g.userData.light = light;
    return g;
  }

  // Hidden sparkle: a slowly turning four-point star that twinkles above a
  // faint pool of light (plus the rising glitter the update loop emits).
  function buildSparkle(rec) {
    const g = new THREE.Group();
    g.name = `sparkle:${rec.flag ?? ''}`;
    const light = new THREE.PointLight(GOLD, 0.35, 2.4, 2);
    light.position.y = 0.15;
    g.add(light);
    const star = glowSprite(0xfff0c0, 0.75, 0.9, starTex());
    star.position.y = 0.42;
    g.add(star);
    const soft = glowSprite(0xffd98a, 0.9, 0.35);
    soft.position.y = 0.42;
    g.add(soft);
    g.add(groundGlow(0xffd27a, 1.1, 0.3));
    g.userData.light = light;
    g.userData.star = star;
    g.userData.soft = soft;
    g.userData.emitAcc = 0;
    return g;
  }

  function buildPedestal(rec) {
    const g = new THREE.Group();
    g.name = `pedestal:${rec.flag ?? ''}`;
    const stoneMat = M('pedestal_stone', 0x8d8a84, { rough: 0.85 });
    const runeMat = M('pedestal_rune', 0x9fe8ff, { emissive: 0x9fe8ff, ei: 0.15, rough: 0.35 });
    const base = new THREE.Mesh(geo('pedestal_base', () => new THREE.CylinderGeometry(0.26, 0.32, 0.5, 8)), stoneMat);
    base.position.y = 0.25;
    base.castShadow = true; base.receiveShadow = true;
    g.add(base);
    const gem = new THREE.Mesh(geo('pedestal_gem', () => new THREE.OctahedronGeometry(0.15, 0)), runeMat);
    gem.position.y = 0.58;
    g.add(gem);
    const light = new THREE.PointLight(0x9fe8ff, 0, 4, 2);
    light.position.y = 0.6;
    g.add(light);
    g.userData.gem = gem;
    g.userData.light = light;
    return g;
  }

  function buildValve(rec) {
    const g = new THREE.Group();
    g.name = `valve:${rec.flag ?? ''}`;
    const pipeMat = M('valve_pipe', 0x5c5860, { rough: 0.7, metal: 0.3 });
    const wheelMat = M('valve_wheel', 0x8a6a48, { rough: 0.6, metal: 0.2 });
    const stub = new THREE.Mesh(geo('valve_stub', () => new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8)), pipeMat);
    stub.rotation.z = Math.PI / 2;
    stub.position.y = 0.5;
    stub.castShadow = true;
    g.add(stub);
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(0.28, 0.5, 0);
    const wheel = new THREE.Mesh(geo('valve_wheel_ring', () => new THREE.TorusGeometry(0.16, 0.025, 6, 12)), wheelMat);
    wheelGroup.add(wheel);
    for (let i = 0; i < 4; i++) {
      const spoke = new THREE.Mesh(geo('valve_spoke', () => new THREE.BoxGeometry(0.03, 0.03, 0.3)), wheelMat);
      spoke.rotation.z = (i / 4) * Math.PI;
      wheelGroup.add(spoke);
    }
    g.add(wheelGroup);
    g.userData.wheel = wheelGroup;
    return g;
  }

  function buildDais(rec) {
    const g = new THREE.Group();
    g.name = `dais:${rec.flag ?? ''}`;
    const ring = new THREE.Mesh(geo('dais_ring', () => new THREE.PlaneGeometry(4.2, 4.2)), softDiscMaterial(0xdcc8ff, 0.5));
    disposables.push({ mat: ring.material });
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    g.add(ring);
    const stepMat = M('dais_step', 0x8d8a94, { rough: 0.8 });
    const step = new THREE.Mesh(geo('dais_step_ring', () => new THREE.CylinderGeometry(1.9, 2.1, 0.18, 16)), stepMat);
    step.position.y = 0.09;
    step.receiveShadow = true;
    g.add(step);
    const light = new THREE.PointLight(0xdcc8ff, 0.6, 7, 2);
    light.position.y = 1.2;
    g.add(light);
    g.userData.ring = ring;
    g.userData.light = light;
    return g;
  }

  // ---------------------------------------------------------------- load
  const BUILDERS = { chest: buildChest, shard: buildShard, shrine: buildShrineGlow, sparkle: buildSparkle, pedestal: buildPedestal, valve: buildValve, dais: buildDais };
  for (const entry of (zone.interactables ?? [])) {
    const builder = BUILDERS[entry.kind];
    if (!builder) { warnOnce(`unknown interactable kind "${entry.kind}" — skipped`); continue; }
    const [x, z] = entry.at ?? [0, 0];
    const y = heightAt(x, z);
    const rec = {
      kind: entry.kind, x, z, y, flag: entry.flag ?? null,
      item: entry.item ?? null, qty: entry.qty ?? 1,
      dialogueId: entry.dialogue ?? entry.flag ?? entry.id ?? null,
      consumed: false, active: false, group: null, cooldown: 0,
    };
    if (rec.flag && G.flags[rec.flag]) { rec.consumed = true; rec.active = true; } // persist across reloads

    const group = builder(rec);
    group.position.set(x, y, z);
    if (entry.kind === 'chest' && rec.consumed) {
      const u = group.userData;
      u.lid.rotation.x = -Math.PI * 0.62;
      u.seam.visible = false; u.pool.visible = false; u.halo.visible = false;
    }
    if (entry.kind === 'sparkle' && rec.consumed) group.visible = false;
    if (entry.kind === 'pedestal' && rec.active) group.userData.gem.material.emissiveIntensity = 1.1;
    if (entry.kind === 'valve' && rec.active) group.userData.wheel.rotation.x = Math.PI * 0.6;
    scene.add(group);
    rec.group = group;
    records.push(rec);
  }

  // ---------------------------------------------------------------- actions
  async function itemDisplayName(id) {
    try {
      const { ITEMS } = await import('../data/items.js');
      return ITEMS?.[id]?.name ?? id;
    } catch (e) { return id; }
  }

  function openChest(rec) {
    if (rec.consumed) return;
    rec.consumed = true;
    if (rec.flag) setFlag(rec.flag, true);
    bus.emit('ui:sfx', { name: 'chest' });
    const u = rec.group.userData, lid = u.lid;
    tween({ from: 0, to: -Math.PI * 0.62, dur: 0.55, onUpdate: (v) => { lid.rotation.x = v; } });
    tween({ from: 1, to: 0, dur: 0.9, onUpdate: (v) => { u.pool.material.opacity = 0.9 * v; u.halo.material.opacity = 0.9 * v; u.seam.material.emissiveIntensity = 4 * v; }, onDone: () => { u.seam.visible = false; u.pool.visible = false; u.halo.visible = false; } });
    fx.emitBurst({ at: { x: rec.x, y: rec.y + 0.4, z: rec.z }, count: 24, color: GOLD, color2: 0xfff6e0, size: 0.1, life: 0.8, speed: 1.8, up: 1.1 });
    if (rec.item) {
      gainItem(rec.item, rec.qty);
      itemDisplayName(rec.item).then((name) => {
        bus.emit('notify', { text: `Found ${rec.qty > 1 ? `${rec.qty}x ` : ''}${name}!`, icon: '🎁' });
      });
    }
  }

  function readShard(rec) {
    if (rec.flag && !G.flags[rec.flag]) setFlag(rec.flag, true);
    fx.emitBurst({ at: { x: rec.x, y: rec.y + 0.3, z: rec.z }, count: 10, color: GOLD, size: 0.07, life: 0.5, speed: 0.9, up: 0.6 });
    if (!rec.dialogueId) { warnOnce('lore shard with no dialogue/flag id — nothing to show'); return; }
    import('../ui/dialogueUI.js')
      .then((m) => m.showDialogueById(rec.dialogueId))
      .catch((e) => console.warn('[interactables] shard dialogue failed', e));
  }

  function restAtShrine(rec) {
    if (rec.cooldown > 0) return;
    rec.cooldown = 2.2;
    let healed = false;
    for (const mon of G.party) {
      if (mon.hp < mon.maxHp || mon.status) healed = true;
      mon.hp = mon.maxHp;
      mon.status = null;
    }
    bus.emit('ui:sfx', { name: 'shrine_heal' });
    fx.emitFountain({ at: { x: rec.x, y: rec.y + 0.1, z: rec.z }, count: 30, color: GOLD, color2: 0xfff6e0, size: 0.1, life: 1.1, speed: 2.4, spread: 0.9 });
    fx.emitRing({ at: { x: rec.x, y: rec.y + 0.05, z: rec.z }, radius: 0.3, count: 40, color: GOLD, life: 0.7, speed: 4.5, size: 0.09 });
    bus.emit('notify', { text: healed ? "The shrine's light mends your wounds." : 'The shrine hums, quietly content.', icon: '✦' });
    try { world.game?.autosave?.(); } catch (e) { /* ignore */ }
  }

  function collectSparkle(rec) {
    if (rec.consumed) return;
    rec.consumed = true;
    if (rec.flag) setFlag(rec.flag, true);
    fx.emitBurst({ at: { x: rec.x, y: rec.y + 0.2, z: rec.z }, count: 14, color: GOLD, color2: 0xfff6e0, size: 0.08, life: 0.55, speed: 1.4, up: 1 });
    if (rec.item) {
      gainItem(rec.item, rec.qty);
      itemDisplayName(rec.item).then((name) => {
        bus.emit('notify', { text: `Found ${rec.qty > 1 ? `${rec.qty}x ` : ''}${name}!`, icon: '✨' });
      });
    }
    const g = rec.group;
    tween({ from: 1, to: 0, dur: 0.35, onUpdate: (v) => { g.scale.setScalar(Math.max(0.001, v)); }, onDone: () => { g.visible = false; } });
  }

  function togglePedestal(rec) {
    if (rec.cooldown > 0) return;
    rec.cooldown = 0.4;
    rec.active = !rec.active;
    if (rec.flag) setFlag(rec.flag, rec.active);
    bus.emit('ui:sfx', { name: 'light' });
    fx.emitBurst({ at: { x: rec.x, y: rec.y + 0.58, z: rec.z }, count: 10, color: 0x9fe8ff, size: 0.06, life: 0.45, speed: 1.1, up: 0.8 });
    bus.emit('notify', { text: rec.active ? 'The pedestal glows to life.' : 'The pedestal dims.', icon: rec.active ? '✦' : '·' });
  }

  function toggleValve(rec) {
    if (rec.cooldown > 0) return;
    rec.cooldown = 0.5;
    rec.active = !rec.active;
    if (rec.flag) setFlag(rec.flag, rec.active);
    bus.emit('ui:sfx', { name: 'door' });
    tween({ from: rec.active ? 0 : Math.PI * 0.6, to: rec.active ? Math.PI * 0.6 : 0, dur: 0.5, onUpdate: (v) => { rec.group.userData.wheel.rotation.x = v; } });
    bus.emit('notify', { text: rec.active ? 'The valve groans open — water shifts somewhere below.' : 'The valve creaks shut.', icon: '⚙' });
  }

  function enterDais(rec) {
    if (rec.consumed) return;
    rec.consumed = true;
    if (rec.flag) setFlag(rec.flag, true);
    bus.emit('ui:sfx', { name: 'shrine_heal' });
    fx.emitRing({ at: { x: rec.x, y: rec.y + 0.1, z: rec.z }, radius: 0.4, count: 36, color: 0xdcc8ff, life: 0.9, speed: 3.5, size: 0.08 });
    bus.emit('notify', { text: 'The dais hums, awaiting a challenger...', icon: '✦' });
  }

  const ACTIONS = { chest: openChest, shard: readShard, shrine: restAtShrine, sparkle: collectSparkle, pedestal: togglePedestal, valve: toggleValve, dais: enterDais };
  const ALWAYS_AVAILABLE = new Set(['shrine', 'pedestal', 'valve']); // never gated by a one-shot "consumed" flag

  // ---------------------------------------------------------------- query helpers
  function findNearest(playerPos) {
    let best = null, bestD2 = INTERACT_RADIUS * INTERACT_RADIUS;
    for (const rec of records) {
      if (!ALWAYS_AVAILABLE.has(rec.kind) && rec.consumed) continue;
      const dx = playerPos.x - rec.x, dz = playerPos.z - rec.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = rec; }
    }
    return best;
  }

  // ---------------------------------------------------------------- public API
  function update(dt) {
    T += dt;
    fx.update(dt);
    for (const rec of records) {
      if (rec.cooldown > 0) rec.cooldown -= dt;
      const g = rec.group;
      if (!g || !g.visible) continue;
      if (rec.kind === 'shard') {
        const f = g.userData.float;
        f.rotation.y += dt * 0.9;
        f.position.y = 0.85 + Math.sin(T * 1.6 + rec.x) * 0.08;
        g.userData.halo.material.opacity = 0.45 + Math.sin(T * 2.1 + rec.z) * 0.12;
        for (const m of g.userData.motes) {
          const a = T * m.sp + m.ph;
          m.mesh.position.set(Math.cos(a) * m.r, Math.sin(a * 1.3) * m.tilt * 0.4, Math.sin(a) * m.r);
        }
        g.userData.ring.material.uniforms.uAlpha.value = 0.38 + Math.sin(T * 1.2 + rec.x) * 0.12;
        g.userData.ring.rotation.z -= dt * 0.25;
      } else if (rec.kind === 'shrine') {
        g.userData.ring.material.uniforms.uAlpha.value = 0.4 + Math.sin(T * 0.8) * 0.1;
        g.userData.ring.rotation.z += dt * 0.12;
        g.userData.light.intensity = 0.65 + Math.sin(T * 1.3) * 0.15;
      } else if (rec.kind === 'chest') {
        const u = g.userData;
        if (!rec.consumed) {
          const pulse = 0.5 + 0.5 * Math.sin(T * 1.8 + rec.z);
          u.gem.material.emissiveIntensity = 0.25 + pulse * 0.35;
          u.seam.material.emissiveIntensity = 1.8 + pulse * 1.2;
          u.pool.material.opacity = 0.3 + pulse * 0.16;
          u.halo.material.opacity = 0.18 + pulse * 0.14;
          u.emitAcc += dt * 1.6;
          if (u.emitAcc >= 1) {
            u.emitAcc -= 1;
            fx.emitFountain({ at: { x: rec.x + (Math.random() - 0.5) * 0.5, y: rec.y + 0.4, z: rec.z + (Math.random() - 0.5) * 0.3 }, count: 1, color: GOLD, color2: 0xfff6e0, size: 0.045, life: 1.1, speed: 0.3, spread: 0.08, gravity: -0.15 });
          }
        }
      } else if (rec.kind === 'sparkle' && !rec.consumed) {
        g.userData.light.intensity = 0.25 + Math.sin(T * 3.2 + rec.x * 2) * 0.15;
        const tw = 0.5 + 0.5 * Math.sin(T * 3.7 + rec.x * 1.3) * Math.sin(T * 1.9 + rec.z);
        g.userData.star.scale.setScalar(0.5 + tw * 0.45);
        g.userData.star.material.opacity = 0.55 + tw * 0.45;
        g.userData.star.material.rotation += dt * 0.6;
        g.userData.star.position.y = 0.42 + Math.sin(T * 1.3 + rec.z) * 0.05;
        g.userData.soft.position.y = g.userData.star.position.y;
        g.userData.emitAcc += dt * 3;
        if (g.userData.emitAcc >= 1) {
          g.userData.emitAcc -= 1;
          fx.emitFountain({ at: { x: rec.x, y: rec.y, z: rec.z }, count: 1, color: GOLD, size: 0.05, life: 0.7, speed: 0.35, spread: 0.12, gravity: 0.2 });
        }
      } else if (rec.kind === 'pedestal') {
        const target = rec.active ? 1.1 : 0;
        g.userData.gem.material.emissiveIntensity += (target - g.userData.gem.material.emissiveIntensity) * Math.min(1, dt * 5);
        g.userData.light.intensity = rec.active ? 0.7 + Math.sin(T * 2.2 + rec.x) * 0.2 : 0;
        g.userData.gem.rotation.y += dt * (rec.active ? 1.4 : 0.4);
      } else if (rec.kind === 'dais' && !rec.consumed) {
        g.userData.ring.material.uniforms.uAlpha.value = 0.45 + Math.sin(T * 0.6) * 0.15;
        g.userData.ring.rotation.z += dt * 0.06;
        g.userData.light.intensity = 0.55 + Math.sin(T * 1.1) * 0.15;
      }
    }
  }

  function tryInteract(playerPos) {
    const rec = findNearest(playerPos);
    if (!rec) return false;
    ACTIONS[rec.kind]?.(rec);
    return true;
  }

  function nearestPrompt(playerPos) {
    const rec = findNearest(playerPos);
    if (!rec) return null;
    if (rec.kind === 'pedestal') return { text: rec.active ? 'Dim the pedestal' : 'Light the pedestal' };
    if (rec.kind === 'valve') return { text: rec.active ? 'Shut the valve' : 'Turn the valve' };
    return { text: PROMPT_TEXT[rec.kind] };
  }

  function dispose() {
    fx.dispose();
    for (const rec of records) scene.remove(rec.group);
    for (const d of disposables) { d.geo?.dispose?.(); d.mat?.dispose?.(); }
    geoCache.clear();
    matCache.clear();
    records.length = 0;
  }

  return { update, tryInteract, nearestPrompt, dispose };
}
