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
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { G, setFlag, gainItem } from '../core/state.js';
import { clamp01, TAU } from '../core/math.js';
import { tween } from '../core/tween.js';
import { Particles } from '../gfx/particles.js';

const INTERACT_RADIUS = 2.5;
const GOLD = 0xffe9b0;

const PROMPT_TEXT = { chest: 'Open chest', shard: 'Read the shard', shrine: 'Rest at the shrine', sparkle: 'Search here' };

const warned = new Set();
const warnOnce = (msg) => { if (!warned.has(msg)) { warned.add(msg); console.warn('[interactables]', msg); } };

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, flatShading: opts.flat !== false, roughness: opts.rough ?? 0.75,
    metalness: opts.metal ?? 0, emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.ei ?? 1, transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide, depthWrite: opts.depthWrite ?? true,
  });
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
  function buildChest(rec) {
    const g = new THREE.Group();
    g.name = `chest:${rec.flag ?? ''}`;
    const woodMat = M('wood', 0x8a6a48, { rough: 0.85 });
    const trimMat = M('wood_trim', 0x5c4030, { rough: 0.8 });
    const goldMat = M('gold', GOLD, { rough: 0.35, metal: 0.5, emissive: GOLD, ei: 0.55 });

    const base = new THREE.Mesh(geo('chest_base', () => new THREE.BoxGeometry(0.62, 0.34, 0.4)), woodMat);
    base.position.y = 0.17;
    base.castShadow = true; base.receiveShadow = true;
    g.add(base);
    for (const dz of [-0.16, 0.16]) {
      const band = new THREE.Mesh(geo('chest_band', () => new THREE.BoxGeometry(0.66, 0.36, 0.04)), trimMat);
      band.position.set(0, 0.17, dz * 2.4);
      g.add(band);
    }

    const lid = new THREE.Group();
    lid.position.set(0, 0.34, -0.2); // hinge at the back top edge
    const lidMesh = new THREE.Mesh(geo('chest_lid', () => new THREE.CylinderGeometry(0.2, 0.2, 0.62, 10, 1, false, 0, Math.PI)), woodMat);
    lidMesh.rotation.z = Math.PI / 2; // half-pipe axis now runs along local X (chest width)
    lidMesh.position.set(0, 0, 0.2);
    lidMesh.castShadow = true;
    lid.add(lidMesh);
    const latch = new THREE.Mesh(geo('chest_latch', () => new THREE.SphereGeometry(0.05, 8, 6)), goldMat);
    latch.position.set(0, -0.03, 0.4);
    lid.add(latch);
    g.add(lid);

    g.userData.lid = lid;
    g.userData.gem = latch;
    return g;
  }

  function buildShard(rec) {
    const g = new THREE.Group();
    g.name = `shard:${rec.flag ?? ''}`;
    const crystalMat = M('shard_crystal', GOLD, { emissive: GOLD, ei: 1.1, rough: 0.3, transparent: true, opacity: 0.92 });
    const core = new THREE.Mesh(geo('shard_core', () => new THREE.OctahedronGeometry(0.24, 0)), crystalMat);
    core.scale.set(0.6, 1.5, 0.6);
    core.castShadow = true;
    g.add(core);
    const sub = new THREE.Mesh(geo('shard_sub', () => new THREE.OctahedronGeometry(0.13, 0)), crystalMat);
    sub.position.set(0.14, -0.16, 0.05);
    sub.scale.set(0.5, 1.2, 0.5);
    g.add(sub);
    const light = new THREE.PointLight(GOLD, 1.1, 5, 2);
    light.position.y = 0.1;
    g.add(light);
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

  function buildSparkle(rec) {
    const g = new THREE.Group();
    g.name = `sparkle:${rec.flag ?? ''}`;
    const light = new THREE.PointLight(GOLD, 0.35, 2.4, 2);
    light.position.y = 0.15;
    g.add(light);
    g.userData.light = light;
    g.userData.emitAcc = 0;
    return g;
  }

  // ---------------------------------------------------------------- load
  for (const entry of (zone.interactables ?? [])) {
    if (!PROMPT_TEXT[entry.kind]) { warnOnce(`unknown interactable kind "${entry.kind}" — skipped`); continue; }
    const [x, z] = entry.at ?? [0, 0];
    const y = heightAt(x, z);
    const rec = {
      kind: entry.kind, x, z, y, flag: entry.flag ?? null,
      item: entry.item ?? null, qty: entry.qty ?? 1,
      dialogueId: entry.dialogue ?? entry.flag ?? entry.id ?? null,
      consumed: false, group: null, cooldown: 0,
    };
    if (rec.flag && G.flags[rec.flag]) rec.consumed = true; // chests/sparkles already claimed persist across reloads

    let group;
    if (entry.kind === 'chest') group = buildChest(rec);
    else if (entry.kind === 'shard') group = buildShard(rec);
    else if (entry.kind === 'shrine') group = buildShrineGlow(rec);
    else group = buildSparkle(rec);

    group.position.set(x, y, z);
    if (rec.consumed && entry.kind === 'chest') group.userData.lid.rotation.x = -Math.PI * 0.62;
    if (rec.consumed && (entry.kind === 'sparkle')) group.visible = false;
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
    const lid = rec.group.userData.lid;
    tween({ from: 0, to: -Math.PI * 0.62, dur: 0.55, onUpdate: (v) => { lid.rotation.x = v; } });
    fx.emitBurst({ at: { x: rec.x, y: rec.y + 0.4, z: rec.z }, count: 16, color: GOLD, color2: 0xfff6e0, size: 0.1, life: 0.6, speed: 1.6, up: 0.9 });
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

  const ACTIONS = { chest: openChest, shard: readShard, shrine: restAtShrine, sparkle: collectSparkle };

  // ---------------------------------------------------------------- query helpers
  function findNearest(playerPos) {
    let best = null, bestD2 = INTERACT_RADIUS * INTERACT_RADIUS;
    for (const rec of records) {
      if (rec.kind !== 'shrine' && rec.consumed) continue;
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
        g.rotation.y += dt * 0.9;
        g.position.y = rec.y + 0.85 + Math.sin(T * 1.6 + rec.x) * 0.08;
      } else if (rec.kind === 'shrine') {
        g.userData.ring.material.uniforms.uAlpha.value = 0.4 + Math.sin(T * 0.8) * 0.1;
        g.userData.ring.rotation.z += dt * 0.12;
        g.userData.light.intensity = 0.65 + Math.sin(T * 1.3) * 0.15;
      } else if (rec.kind === 'chest') {
        const gem = g.userData.gem;
        gem.material.emissiveIntensity = rec.consumed ? 0.2 : 0.4 + Math.sin(T * 1.8 + rec.z) * 0.25;
      } else if (rec.kind === 'sparkle' && !rec.consumed) {
        g.userData.light.intensity = 0.25 + Math.sin(T * 3.2 + rec.x * 2) * 0.15;
        g.userData.emitAcc += dt * 3;
        if (g.userData.emitAcc >= 1) {
          g.userData.emitAcc -= 1;
          fx.emitFountain({ at: { x: rec.x, y: rec.y, z: rec.z }, count: 1, color: GOLD, size: 0.05, life: 0.7, speed: 0.35, spread: 0.12, gravity: 0.2 });
        }
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
