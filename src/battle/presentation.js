// Battle presentation — owns the 3D battle scene: arena, creature models,
// camera direction and VFX sequencing. Translates BattleEngine events
// (docs/ARCHITECTURE.md "Battle events") into cinematic, snappy choreography.
// No DOM here — that's battleUI.js's job; we call into it (via setUI) only
// for screen-projected damage numbers, which need our camera/3D knowledge.
//
// createPresentation(game, config) -> {
//   scene, camera, update(dt),
//   async handle(ev),          // one BattleEngine event
//   setUI(ui), project(worldPos) -> {x,y} screen %,
//   dispose(),
// }
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { tween, delay, shake, setTimeScale } from '../core/tween.js';
import { clamp01, lerp, easeOutCubic, easeOutBack } from '../core/math.js';
import { aspectColor } from '../data/aspects.js';
import { Particles } from '../gfx/particles.js';
import { buildArena } from './arenas.js';
import { createCameraDirector } from './cameraDirector.js';
import * as vfx from './vfx.js';

const SIDES = ['p', 'e'];
const SIDE_OTHER = { p: 'e', e: 'p' };
const STATUS_LABEL = {
  burn: 'Burn!', soak: 'Soaked!', root: 'Rooted!', shock: 'Shocked!',
  frostbite: 'Frostbite!', venom: 'Poisoned!', blind: 'Blinded!', dread: 'Dread!',
};
const AURA_SFX = { emberhaze: 'fire_small', tidesurge: 'water', gloom: 'dark' };
const HITSTOP_DEPTH = 0.05; // freeze-frame time scale during hitstop

export async function createPresentation(game, config = {}) {
  const scene = new THREE.Scene();
  const particles = new Particles(scene, { capacity: 2200 });
  const camDir = createCameraDirector({ getFocus: (side) => focusOf(side) });
  const camera = camDir.camera;
  scene.add(camera); // camera must be in the graph so children (vignette) render

  const arena = buildArena(config.arena ?? 'meadow', particles);
  scene.add(arena.group);
  scene.fog = new THREE.FogExp2(arena.fogColor ?? 0x232633, arena.fogDensity ?? 0.01);
  scene.background = new THREE.Color(arena.sky?.bottom ?? 0x232633);
  const baseLight = { key: arena.lights.key.intensity, fill: arena.lights.fill.intensity, rim: arena.lights.rim?.intensity ?? 0 };

  // Creatures are the stars (§8): a presentation-owned neutral fill from the
  // camera side, aimed at both stand marks, in EVERY arena — dark stages
  // (cave, spire) can no longer render the combatants as silhouettes. Kept
  // outside arena.lights so setLightMult dims the stage, not the actors.
  const creatureFill = new THREE.DirectionalLight(0xffffff, 0.6);
  const fillMid = {
    x: (arena.marks.p.x + arena.marks.e.x) / 2,
    z: (arena.marks.p.z + arena.marks.e.z) / 2,
  };
  creatureFill.position.set(fillMid.x, 5.5, fillMid.z - 9); // seeded camera-side; tracks camera each frame
  creatureFill.target.position.set(fillMid.x, 1, fillMid.z);
  scene.add(creatureFill, creatureFill.target);

  // -- reusable one-shot props (avoid per-move allocation/disposal churn) --
  const boltGeo = new THREE.IcosahedronGeometry(0.16, 1);
  const boltMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.3, flatShading: true });
  const bolt = new THREE.Mesh(boltGeo, boltMat); bolt.visible = false; bolt.renderOrder = 5; scene.add(bolt);

  const beamGeo = new THREE.CylinderGeometry(0.14, 0.14, 1, 10, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
  const beam = new THREE.Mesh(beamGeo, beamMat); beam.visible = false; scene.add(beam);

  const charmGeo = new THREE.IcosahedronGeometry(0.22, 1);
  const charmMat = new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffb85c, emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.3, flatShading: true });
  const charm = new THREE.Mesh(charmGeo, charmMat); charm.visible = false; charm.castShadow = true; scene.add(charm);

  const vignette = buildVignette(camera);

  // -- state --
  const mons = { p: null, e: null };
  let ui = null;
  let auraHandle = null;
  let clock = 0;
  let lastDefenderSide = 'e';
  let lastMoveAspect = 'neutral';
  let pendingBigHit = false;  // set by burstUsed: the next 'hit' carries the big impact
  let meleeReturn = null;     // set by meleeAttack: fn returning attacker home (fires after hitstop releases)
  // Hitstop state machine — drives the GLOBAL tween clock (core/tween.js
  // setTimeScale) so choreography, knockback and UI bars all freeze together.
  // Runs on REAL dt inside update(); camera shake stays unscaled (cameraDirector
  // integrates its own dt — verified not tween-driven).
  const hs = { phase: 'idle', t: 0, freeze: 0.06, ramp: 0.12, scale: 1, resolvers: [] };

  if (config.weatherAura) auraHandle = vfx.auraAmbient(particles, config.weatherAura);

  // ---------------------------------------------------------------- helpers
  function focusOf(side) {
    const entry = mons[side];
    if (entry) return { x: entry.group.position.x, y: entry.focusY, z: entry.group.position.z, radius: entry.radius };
    const mark = arena.marks[side];
    return { x: mark.x, y: 1.1, z: mark.z, radius: 0.8 };
  }

  const _proj = new THREE.Vector3();
  function project(pos) {
    _proj.set(pos.x, pos.y, pos.z).project(camera);
    return { x: (_proj.x * 0.5 + 0.5) * 100, y: (1 - (_proj.y * 0.5 + 0.5)) * 100 };
  }

  function dirAway(fromPos, towardPos) {
    const dx = towardPos.x - fromPos.x, dz = towardPos.z - fromPos.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: dx / len, z: dz / len };
  }

  function setOpacity(group, v) {
    group.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) { m.transparent = true; m.opacity = v; }
    });
  }

  function pulseEmissive(group, hex = 0xffffff, strength = 1, inDur = 0.07, outDur = 0.18) {
    const targets = [];
    group.traverse((o) => {
      if (o.isMesh && o.material && 'emissive' in o.material) {
        const mat = o.material;
        if (!mat.userData._baseEmissive) mat.userData._baseEmissive = mat.emissive.clone();
        targets.push(mat);
      }
    });
    if (!targets.length) return;
    const flashColor = new THREE.Color(hex);
    tween({
      from: 0, to: 1, dur: inDur, ease: easeOutCubic,
      onUpdate: (v) => { for (const m of targets) m.emissive.copy(m.userData._baseEmissive).lerp(flashColor, v * strength); },
      onDone: () => {
        tween({ from: 1, to: 0, dur: outDur, ease: easeOutCubic, onUpdate: (v) => { for (const m of targets) m.emissive.copy(m.userData._baseEmissive).lerp(flashColor, v * strength); } });
      },
    });
  }

  function setLightMult(mult, dur = 0.3) {
    tween({ from: arena.lights.key.intensity, to: baseLight.key * mult, dur, ease: easeOutCubic, onUpdate: (v) => { arena.lights.key.intensity = v; } });
    tween({ from: arena.lights.fill.intensity, to: baseLight.fill * mult, dur, ease: easeOutCubic, onUpdate: (v) => { arena.lights.fill.intensity = v; } });
    if (arena.lights.rim) tween({ from: arena.lights.rim.intensity, to: baseLight.rim * mult, dur, ease: easeOutCubic, onUpdate: (v) => { arena.lights.rim.intensity = v; } });
  }

  // Real hitstop: freeze the tween clock at HITSTOP_DEPTH for freezeMs, then
  // ramp back to 1. Resolves in REAL time (from the state machine in update),
  // never via delay() — a scaled delay would deadlock against its own freeze.
  // Tiers (design review): 60ms normal, 120ms super/crit, 180ms crit+super.
  function hitstop(freezeMs = 60, rampMs = null) {
    hs.phase = 'freeze'; hs.t = 0;
    hs.freeze = freezeMs / 1000;
    hs.ramp = (rampMs ?? freezeMs * 1.8) / 1000;
    camDir.impulse(0.15);
    return new Promise((resolve) => hs.resolvers.push(resolve));
  }
  function settleHitstop() {
    hs.phase = 'idle'; hs.scale = 1;
    setTimeScale(1);
    const rs = hs.resolvers; hs.resolvers = [];
    for (const r of rs) r();
  }
  /** Send a dashed-in melee attacker home (idempotent; awaited after hitstop). */
  async function releaseMelee() {
    const ret = meleeReturn;
    meleeReturn = null;
    if (ret) await ret();
  }

  function fallbackWisp() {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 1), new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffe9b0, emissiveIntensity: 0.8, flatShading: true }));
    core.position.y = 0.5;
    g.add(core);
    return g;
  }

  function disposeMonEntry(entry) {
    if (!entry) return;
    scene.remove(entry.group);
    entry.group.traverse((o) => {
      if (!o.isMesh) return;
      for (const g of Array.isArray(o.geometry) ? o.geometry : [o.geometry]) g?.dispose?.();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m?.dispose?.();
    });
  }

  async function resolveMove(move) {
    if (move && typeof move === 'object' && (move.fx || move.aspect)) return move;
    const id = typeof move === 'string' ? move : move?.id;
    if (!id) return null;
    try { const { ABILITIES } = await import('../data/abilities.js'); return ABILITIES?.[id] ?? null; }
    catch (e) { return null; }
  }
  async function resolveBurst(burst) {
    if (burst && typeof burst === 'object' && (burst.fx || burst.aspect)) return burst;
    const id = typeof burst === 'string' ? burst : burst?.id;
    if (!id) return null;
    try { const { BURSTS } = await import('../data/abilities.js'); return BURSTS?.[id] ?? null; }
    catch (e) { return null; }
  }

  function orientBeam(mesh, from, to) {
    const dir = new THREE.Vector3(to.x - from.x, to.y - from.y, to.z - from.z);
    const len = Math.max(0.01, dir.length());
    dir.normalize();
    mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    mesh.scale.set(1, len, 1);
  }

  // ------------------------------------------------------- move choreography
  async function meleeAttack(attacker, side, other) {
    const otherEntry = mons[other];
    const home = { x: attacker.group.position.x, z: attacker.group.position.z };
    const target = otherEntry ? { x: otherEntry.group.position.x, z: otherEntry.group.position.z } : { x: arena.marks[other].x, z: arena.marks[other].z };
    // Dash to actual CONTACT: stop 0.8u short of the defender's center so the
    // models visually touch instead of whiffing at mid-arena.
    const dx = target.x - home.x, dz = target.z - home.z;
    const dist = Math.hypot(dx, dz) || 1;
    const t = Math.max(0, (dist - 0.8) / dist);
    const dash = { x: home.x + dx * t, z: home.z + dz * t };
    const bs = attacker.baseScale;
    await tween({
      from: 1, to: 0.82, dur: 0.09, ease: easeOutCubic,
      onUpdate: (v) => attacker.group.scale.set(bs.x * (2 - v), bs.y * v, bs.z * (2 - v)),
    });
    await tween({
      from: 0, to: 1, dur: 0.2, ease: easeOutCubic,
      onUpdate: (v) => {
        attacker.group.position.x = lerp(home.x, dash.x, v);
        attacker.group.position.z = lerp(home.z, dash.z, v);
        attacker.group.position.y = Math.sin(v * Math.PI) * 0.22;
        const s = 1 + Math.sin(v * Math.PI) * 0.12;
        attacker.group.scale.set(bs.x / s, bs.y * s, bs.z / s);
      },
    });
    attacker.group.position.y = 0;
    attacker.group.scale.copy(bs);
    camDir.shot('closeUp', { side: other, ms: 0 });
    await delay(0.017); // hold one frame at contact — the hit lands here
    // Return home only after the hit's hitstop releases (onHit/onMiss await this).
    meleeReturn = async () => {
      await tween({
        from: 0, to: 1, dur: 0.16, ease: easeOutCubic,
        onUpdate: (v) => { attacker.group.position.x = lerp(dash.x, home.x, v); attacker.group.position.z = lerp(dash.z, home.z, v); },
      });
      attacker.group.position.x = home.x; attacker.group.position.z = home.z;
    };
  }

  // Per-aspect-family projectile motion identity: volt zigzags, terra lobs
  // under gravity, gale is an invisible gust read only through wind streaks,
  // tide skims low with a droplet trail; everything else keeps the soft arc.
  async function projectileAttack(from, to, color, other, aspect = 'neutral') {
    vfx.conjure(particles, { at: from, color, dur: 0.2 });
    camDir.shot('closeUp', { side: other, ms: 0 });
    bolt.material.color.set(color); bolt.material.emissive.set(color);
    bolt.position.set(from.x, from.y, from.z);
    bolt.visible = aspect !== 'gale';
    bolt.scale.setScalar(0.32);
    // perpendicular (XZ) axis for lateral zigzag
    const pdx = to.x - from.x, pdz = to.z - from.z;
    const plen = Math.hypot(pdx, pdz) || 1;
    const perp = { x: -pdz / plen, z: pdx / plen };
    const trailOpts = {
      volt: { color, color2: 0xfff6b0, size: 0.07, life: 0.22, rate: 140, gravity: 0, flicker: true },
      terra: { color, color2: 0x8a6a42, size: 0.11, life: 0.4, rate: 70, gravity: 2.5, additive: false },
      gale: { color: 0xe8fff6, color2: color, size: 0.12, life: 0.45, rate: 160, gravity: 0, spread: 0.3 },
      tide: { color, color2: 0xbfe8ff, size: 0.09, life: 0.5, rate: 120, gravity: 5 }, // droplets rain off
    }[aspect] ?? { color, size: 0.09, life: 0.3, rate: 90, gravity: 0 };
    const trail = particles.emitTrail(bolt, trailOpts);
    await delay(0.16);
    const dur = aspect === 'terra' ? 0.42 : aspect === 'volt' ? 0.26 : 0.32;
    await tween({
      from: 0, to: 1, dur, ease: aspect === 'terra' ? (x) => x : easeOutCubic,
      onUpdate: (v) => {
        let y, lat = 0;
        switch (aspect) {
          case 'volt': // hard zigzag ~8Hz, flat trajectory
            y = lerp(from.y, to.y, v);
            lat = Math.sign(Math.sin(v * dur * Math.PI * 2 * 8)) * 0.3 * Math.sin(v * Math.PI);
            break;
          case 'terra': // ballistic lob — high apex, gravity-accelerated fall
            y = lerp(from.y, to.y, v) + 1.7 * (4 * v * (1 - v));
            break;
          case 'tide': // low skimming arc
            y = lerp(from.y, to.y, v) + Math.sin(v * Math.PI) * 0.12;
            break;
          default: // soft arc (gale rides this too, invisibly)
            y = lerp(from.y, to.y, v) + Math.sin(v * Math.PI) * 0.35;
        }
        bolt.position.set(lerp(from.x, to.x, v) + perp.x * lat, y, lerp(from.z, to.z, v) + perp.z * lat);
        bolt.scale.setScalar(0.32 + v * 0.4);
      },
    });
    trail.stop();
    bolt.visible = false;
  }

  async function beamAttack(from, to, color) {
    vfx.conjure(particles, { at: from, color, dur: 0.28 });
    await camDir.shot('lowBeam', { ms: 240 });
    beamMat.color.set(color);
    orientBeam(beam, from, to);
    beam.visible = true;
    await tween({ from: 0, to: 1, dur: 0.14, ease: easeOutCubic, onUpdate: (v) => { beamMat.opacity = v * 0.85; beam.scale.x = beam.scale.z = 0.4 + v * 0.8; } });
    await delay(0.14);
    await tween({ from: 1, to: 0, dur: 0.2, ease: easeOutCubic, onUpdate: (v) => { beamMat.opacity = v * 0.85; } });
    beam.visible = false;
  }

  async function eruptionAttack(at, side, aspect, color) {
    camDir.shot('closeUp', { side, ms: 160 });
    const dur = vfx.eruption(particles, { at, aspect, color });
    shake(0.4, 0.28);
    await delay(dur);
  }

  // ------------------------------------------------------------ event beats
  // The wide establishing shot plays UNDER the UI's VS card (battleUI starts
  // the card on 'intro' without blocking), and it is kept short so both
  // send-ins land while the card is still on screen.
  async function onIntro() {
    await camDir.shot('wide', { ms: 700 });
    await camDir.shot('rest', { ms: 240, variant: 0 });
  }

  async function onSend(ev) {
    const side = ev.side;
    if (mons[side]) { disposeMonEntry(mons[side]); mons[side] = null; }
    const inst = typeof ev.mon === 'string' ? { speciesId: ev.mon } : (ev.mon ?? {});
    const speciesId = inst.speciesId ?? inst.id ?? String(ev.mon ?? 'kindlet');
    let species = null;
    try { const { SPECIES } = await import('../data/creatures.js'); species = SPECIES?.[speciesId] ?? null; }
    catch (e) { /* data agent's module not ready yet */ }

    let group, animator;
    try {
      const { buildCreature } = await import('../creatures/registry.js');
      ({ group, animator } = await buildCreature(speciesId, { hollowed: !!inst.hollowed, gleaming: !!(inst.shiny ?? inst.gleaming) }));
    } catch (e) {
      console.warn('[presentation] buildCreature unavailable for', speciesId, e);
      group = fallbackWisp(); animator = { play() {}, update() {} };
    }

    const mark = arena.marks[side];
    group.position.set(mark.x, 0, mark.z);
    group.rotation.y = mark.face;
    group.traverse((o) => { if (o.isMesh) o.castShadow = true; });

    const bbox = new THREE.Box3().setFromObject(group);
    let height = bbox.max.y - bbox.min.y;
    let spanXZ = Math.max(bbox.max.x - bbox.min.x, bbox.max.z - bbox.min.z);
    if (!isFinite(height) || height < 0.05) height = species?.size ?? 1.2;
    if (!isFinite(spanXZ) || spanXZ < 0.05) spanXZ = height;
    if (species?.size && Math.abs(height - species.size) / species.size > 0.4) {
      const k = species.size / Math.max(0.05, height);
      group.scale.multiplyScalar(k);
      height = species.size;
      spanXZ *= k;
    }
    const baseScale = group.scale.clone();
    scene.add(group);
    group.scale.setScalar(0.02);
    // `radius`: the model's true bounding radius (quadrupeds are far LONGER
    // than they are tall) — the camera director needs it to keep close-ups
    // outside the creature instead of inside its ribcage.
    mons[side] = {
      group, animator, speciesId, mon: inst, baseScale,
      focusY: height * 0.55, radius: Math.max(spanXZ, height) * 0.5,
    };

    const aColor = aspectColor(species?.aspects?.[0] ?? 'neutral');
    vfx.materialize(particles, { at: { x: mark.x, y: 0.05, z: mark.z }, color: aColor, height });
    const flashLight = new THREE.PointLight(0xffffff, 0, 8, 2);
    flashLight.position.set(mark.x, height * 0.5, mark.z);
    scene.add(flashLight);
    camDir.shot('sendIn', { side, ms: 0 });
    await delay(0.2);
    await tween({
      from: 0, to: 1, dur: 0.36, ease: easeOutBack,
      onUpdate: (v) => { group.scale.copy(baseScale).multiplyScalar(Math.max(0.02, v)); flashLight.intensity = Math.sin(clamp01(v) * Math.PI) * 2.6; },
      onDone: () => { scene.remove(flashLight); },
    });
    group.scale.copy(baseScale);
    animator?.play?.('idle');
    try { const { playCry } = await import('../audio/cries.js'); playCry(speciesId); } catch (e) { /* no gesture / not ready */ }
    await delay(0.15);
  }

  async function onRecall(ev) {
    const entry = mons[ev.side];
    if (!entry) return;
    vfx.dissolve(particles, { at: focusOf(ev.side), color: 0xffe9b0, count: 20 });
    await tween({
      from: 1, to: 0, dur: 0.26, ease: easeOutCubic,
      onUpdate: (v) => { entry.group.scale.copy(entry.baseScale).multiplyScalar(Math.max(0.02, v)); setOpacity(entry.group, v); },
    });
    disposeMonEntry(entry);
    mons[ev.side] = null;
  }

  async function onMoveUsed(ev) {
    const side = ev.side, other = SIDE_OTHER[side];
    lastDefenderSide = other;
    const move = await resolveMove(ev.move);
    lastMoveAspect = move?.aspect ?? 'neutral';
    // A Resonant Burst rides moveUsed+burstUsed back to back: skip the generic
    // anim beat entirely so charge-up → eruption plays in causal order inside
    // onBurstUsed (fix: the eruption used to fire BEFORE the charge).
    if (ev.isBurst) return;
    const attacker = mons[side];
    if (!attacker) return;
    await releaseMelee(); // safety: never start a move with someone still dashed in
    attacker.animator?.play?.('attack');
    const color = move?.fx?.color ?? aspectColor(lastMoveAspect);
    if (move?.fx?.sfx) bus.emit('ui:sfx', { name: move.fx.sfx });
    const from = focusOf(side), to = focusOf(other);
    switch (move?.fx?.anim ?? 'melee') {
      case 'melee': await meleeAttack(attacker, side, other); break;
      case 'projectile': await projectileAttack(from, to, color, other, lastMoveAspect); break;
      case 'beam': await beamAttack(from, to, color); break;
      case 'burst': await eruptionAttack(to, other, lastMoveAspect, color); break;
      case 'buff': vfx.auraSpiral(particles, { at: from, color, up: true }); await delay(0.34); break;
      case 'debuff': vfx.auraSpiral(particles, { at: to, color, up: false }); await delay(0.34); break;
      case 'field': vfx.fieldWash(particles, { color }); await delay(0.4); break;
      case 'song': vfx.songNotes(particles, { from, to, color }); await camDir.shot('closeUp', { side: other, ms: 240 }); break;
      default: await delay(0.2);
    }
  }

  // Damage number that stays glued to its 3D anchor: re-project every frame
  // for ~200ms so a settling camera doesn't strand the number mid-air.
  // (battleUI.showDamage clamps the vertical to 12–70% of screen.)
  function popDamage(pos, text, kind) {
    const { x, y } = project(pos);
    const handle = ui?.showDamage(x, y, text, kind);
    if (handle?.setPos) {
      tween({ from: 0, to: 1, dur: 0.2, ease: (v) => v, onUpdate: () => { const q = project(pos); handle.setPos(q.x, q.y); } });
    }
  }

  async function onHit(ev) {
    const side = ev.side, entry = mons[side];
    const pos = focusOf(side);
    const kind = ev.eff === 'immune' ? 'status' : ev.crit ? 'crit' : (ev.eff === 'super' || ev.eff === 'weak') ? ev.eff : 'normal';
    const text = ev.eff === 'immune' ? 'No Effect' : String(ev.dmg);
    popDamage(pos, text, kind);
    bus.emit('ui:sfx', { name: (ev.crit || ev.eff === 'super') ? 'hit_heavy' : 'hit_light' });
    if (entry) {
      entry.animator?.play?.('hit');
      pulseEmissive(entry.group);
      const other = focusOf(SIDE_OTHER[side]);
      const dir = dirAway(other, entry.group.position);
      const home = { x: entry.group.position.x, z: entry.group.position.z };
      const kb = { x: home.x + dir.x * 0.28, z: home.z + dir.z * 0.28 };
      tween({
        from: 0, to: 1, dur: 0.1, ease: easeOutCubic,
        onUpdate: (v) => { entry.group.position.x = lerp(home.x, kb.x, v); entry.group.position.z = lerp(home.z, kb.z, v); },
        onDone: () => tween({ from: 0, to: 1, dur: 0.2, ease: easeOutCubic, onUpdate: (v) => { entry.group.position.x = lerp(kb.x, home.x, v); entry.group.position.z = lerp(kb.z, home.z, v); } }),
      });
    }
    const big = pendingBigHit; pendingBigHit = false;
    if (ev.eff !== 'immune') vfx.impact(particles, { at: pos, aspect: lastMoveAspect, eff: ev.eff, crit: ev.crit, big });
    if (big || (ev.crit && ev.eff === 'super')) shake(0.85, 0.36);
    else if (ev.crit || ev.eff === 'super') shake(0.55, 0.26);
    else shake(0.26, 0.16);
    // real hitstop on EVERY damaging hit — tiers scale with the blow
    if (ev.eff !== 'immune') {
      if (ev.crit && ev.eff === 'super') await hitstop(180);
      else if (ev.crit || ev.eff === 'super' || big) await hitstop(120);
      else await hitstop(60);
    }
    await releaseMelee(); // dash-in attacker walks it off only once the freeze lets go
    await delay(0.22);
  }

  async function onMiss() {
    const side = lastDefenderSide, entry = mons[side];
    const pos = focusOf(side);
    popDamage(pos, 'Miss', 'status');
    if (entry) {
      const other = focusOf(SIDE_OTHER[side]);
      const dir = dirAway(other, entry.group.position);
      const home = { x: entry.group.position.x, z: entry.group.position.z };
      await tween({
        from: 0, to: 1, dur: 0.16, ease: easeOutCubic,
        onUpdate: (v) => { const s = Math.sin(v * Math.PI); entry.group.position.x = home.x + dir.x * 0.16 * s; entry.group.position.z = home.z + dir.z * 0.16 * s; },
      });
      entry.group.position.x = home.x; entry.group.position.z = home.z;
    }
    await releaseMelee(); // the whiffed attacker still has to come home
    await delay(0.15);
  }

  async function onStatusApplied(ev) {
    const pos = focusOf(ev.side);
    vfx.statusBurst(particles, ev.status, pos, false);
    popDamage(pos, STATUS_LABEL[ev.status] ?? ev.status, 'status');
    bus.emit('ui:sfx', { name: 'debuff' });
    await delay(0.3);
  }
  async function onStatusTick(ev) {
    const pos = focusOf(ev.side);
    vfx.statusBurst(particles, ev.status, pos, true);
    popDamage(pos, `-${ev.dmg}`, 'status');
    await delay(0.2);
  }
  async function onStatStage(ev) {
    vfx.statStageFx(particles, { at: focusOf(ev.side), delta: ev.delta });
    bus.emit('ui:sfx', { name: ev.delta >= 0 ? 'buff' : 'debuff' });
    await delay(0.26);
  }
  async function onHeal(ev) {
    const pos = focusOf(ev.side);
    if (ev.amt >= 0) {
      vfx.healFx(particles, { at: pos });
      popDamage(pos, `+${ev.amt}`, 'heal');
      bus.emit('ui:sfx', { name: 'heal' });
    } else {
      popDamage(pos, String(ev.amt), 'normal'); // recoil rides the heal event with amt<0
    }
    await delay(0.3);
  }

  function onAuraStart(ev) {
    auraHandle?.stop();
    auraHandle = vfx.auraAmbient(particles, ev.kind);
    vfx.fieldWash(particles, { color: ev.kind === 'emberhaze' ? 0xff7a3c : ev.kind === 'tidesurge' ? 0x4fa8ff : ev.kind === 'gloom' ? 0x7a6f9e : 0xffe9b0 });
    bus.emit('ui:sfx', { name: AURA_SFX[ev.kind] ?? 'buff' });
    setLightMult(0.86, 0.4);
  }
  function onAuraEnd() { auraHandle?.stop(); auraHandle = null; setLightMult(1, 0.4); }

  function onBurstReady(ev) {
    const entry = mons[ev.side];
    if (entry) vfx.auraSpiral(particles, { at: focusOf(ev.side), color: 0xffe9b0, up: true, height: entry.focusY * 0.7, dur: 0.35 });
  }

  // Resonant Burst beat, in causal order: charge-up shot on the user → stage
  // dims (to 0.6 — the creatureFill keeps the actors readable, never a black
  // screen) → white-gold flash → signature sequence → hard cut to the
  // defender at ~60% → the following 'hit' event lands the big impact.
  async function onBurstUsed(ev) {
    const side = ev.side, other = SIDE_OTHER[side];
    const burst = await resolveBurst(ev.burst);
    const aspect = burst?.aspect ?? lastMoveAspect;
    const color = burst?.fx?.color ?? aspectColor(aspect);
    lastMoveAspect = aspect;
    lastDefenderSide = other;
    mons[side]?.animator?.play?.('special');
    await camDir.shot('burstCharge', { side, ms: 280 });
    setLightMult(0.6, 0.15);
    vignette.flash(0.35, 0.06, 0.2); // white-gold pop, not a blackout
    bus.emit('ui:sfx', { name: burst?.fx?.sfx ?? 'burst_fire' });
    const dur = vfx.burstSignature(particles, { at: focusOf(side), target: focusOf(other), aspect, color });
    shake(0.5, 0.35);
    const seq = Math.min(dur, 1.1);
    await delay(seq * 0.6);
    camDir.shot('closeUp', { side: other, ms: 0, cut: true }); // hard cut: brace on the defender
    await delay(seq * 0.4);
    pendingBigHit = true; // the engine's real 'hit' event carries the impact (no double-impact here)
    setLightMult(1, 0.4);
  }

  // Faint: hold-dim 0.25s → 'faint' anim topple → upward mote dissolve while
  // the body fades in place. NO scale-down shrink, no sinking — a fallen
  // Kindred dissolves into light, it doesn't deflate.
  async function onFaint(ev) {
    const side = ev.side, entry = mons[side];
    if (!entry) return;
    await releaseMelee();
    bus.emit('ui:sfx', { name: 'faint' });
    if (side === 'p') await camDir.shot('closeUp', { side, ms: 240 });
    else camDir.shot('orbitKO', { side, ms: 0 });
    // hold-dim: the light leaves it first
    const dimTargets = [];
    entry.group.traverse((o) => {
      if (o.isMesh && o.material && o.material.color) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) dimTargets.push({ m, base: m.color.clone() });
      }
    });
    tween({ from: 0, to: 0.55, dur: 0.2, ease: easeOutCubic, onUpdate: (v) => { for (const d of dimTargets) d.m.color.copy(d.base).multiplyScalar(1 - v); } });
    await delay(0.25);
    entry.animator?.play?.('faint'); // topple
    await delay(0.35);
    vfx.dissolve(particles, { at: { x: entry.group.position.x, y: 0.15, z: entry.group.position.z }, height: entry.focusY * 1.8, count: 44 });
    await tween({
      from: 1, to: 0, dur: 0.55, ease: easeOutCubic,
      onUpdate: (v) => setOpacity(entry.group, v),
    });
    disposeMonEntry(entry);
    mons[side] = null;
  }

  // Attunement (catch) beat. Presentation DRIVES the shared timeline: each
  // shake is one awaited beat here, and the pip HUD lights in lockstep via the
  // internal ui.handleEvent({type:'catchShake', ...}) events (see battleUI.js
  // header). Camera creeps 0.25u closer per shake; the pauses between shakes
  // escalate 0.35/0.55/0.85s, then 0.6s of dead-still before the verdict.
  async function onCatchAttempt(ev) {
    const entry = mons.e;
    const pStart = focusOf('p');
    const eTarget = entry ? { x: entry.group.position.x, y: 0.9, z: entry.group.position.z } : focusOf('e');
    await camDir.shot('catchFocus', { ms: 200 });
    bus.emit('ui:sfx', { name: 'catch_throw' });
    charm.visible = true; charm.scale.setScalar(1); charm.rotation.set(0, 0, 0);
    charm.position.set(pStart.x, pStart.y, pStart.z);
    // gold-mote trail + faster spin: the charm reads as a precious thing in flight
    const charmTrail = particles.emitTrail(charm, { color: 0xffe9b0, color2: 0xffd94f, size: 0.07, life: 0.5, rate: 80, gravity: 0.7, flicker: true });
    await tween({
      from: 0, to: 1, dur: 0.48, ease: easeOutCubic,
      onUpdate: (v) => {
        charm.position.set(lerp(pStart.x, eTarget.x, v), lerp(pStart.y, eTarget.y, v) + Math.sin(v * Math.PI) * 1.6, lerp(pStart.z, eTarget.z, v));
        charm.rotation.x += 0.42; charm.rotation.y += 0.31;
      },
    });
    charmTrail.stop();
    if (entry) {
      vfx.materialize(particles, { at: eTarget, color: 0xffe9b0, height: 0.6 });
      await tween({ from: 1, to: 0.02, dur: 0.22, ease: easeOutCubic, onUpdate: (v) => entry.group.scale.copy(entry.baseScale).multiplyScalar(v) });
      entry.group.visible = false;
    }
    await tween({ from: charm.position.y, to: 0.26, dur: 0.2, ease: easeOutBack, onUpdate: (v) => { charm.position.y = v; } });
    await delay(0.32);
    const pauses = [0.35, 0.55, 0.85];
    for (let i = 0; i < (ev.shakes ?? 0); i++) {
      bus.emit('ui:sfx', { name: 'catch_shake' });
      ui?.handleEvent?.({ type: 'catchShake', i }); // light pip i in sync (internal event)
      camDir.shot('catchFocus', { push: 0.25 * (i + 1), ms: 0 });
      await tween({ from: 0, to: 1, dur: 0.22, ease: easeOutCubic, onUpdate: (v) => { charm.rotation.z = Math.sin(v * Math.PI * 3) * 0.5 * (1 - v); } });
      await delay(pauses[Math.min(i, pauses.length - 1)]);
    }
    await delay(0.6); // dead-still — let the hope hang
    ui?.handleEvent?.({ type: 'catchShake', phase: 'result', success: !!ev.success });
    if (ev.success) {
      vfx.sealBurst(particles, { at: { x: charm.position.x, y: charm.position.y + 0.2, z: charm.position.z } });
      bus.emit('ui:sfx', { name: 'catch_success' });
      await delay(0.5);
      if (entry) { disposeMonEntry(entry); mons.e = null; }
    } else {
      vfx.breakOut(particles, { at: { x: charm.position.x, y: charm.position.y + 0.2, z: charm.position.z } });
      bus.emit('ui:sfx', { name: 'catch_fail' });
      shake(0.4, 0.25);
      if (entry) {
        entry.group.visible = true;
        await tween({ from: 0, to: 1, dur: 0.22, ease: easeOutBack, onUpdate: (v) => entry.group.scale.copy(entry.baseScale).multiplyScalar(Math.max(0.02, v)) });
        entry.animator?.play?.('idle');
      }
      await delay(0.25);
    }
    charm.visible = false;
  }

  function onXp(ev) {
    const entry = mons.p;
    if (entry && ev.levelups?.length) {
      vfx.auraSpiral(particles, { at: focusOf('p'), color: 0xffd94f, up: true, height: entry.focusY, dur: 0.5 });
      bus.emit('ui:sfx', { name: 'levelup' });
    }
  }

  async function onEnd(ev) {
    auraHandle?.stop(); auraHandle = null;
    const outcome = ev.result?.outcome;
    if (outcome === 'win' || outcome === 'caught') {
      mons.p?.animator?.play?.('happy'); // the winner celebrates
      await camDir.shot('victory', { side: 'p', ms: 550 });
    } else if (outcome === 'loss') await camDir.shot('defeat', { ms: 550 });
    else await camDir.shot('wide', { ms: 450 });
  }

  // -------------------------------------------------------------- dispatch
  async function handle(ev) {
    if (!ev?.type) return;
    try {
      switch (ev.type) {
        case 'intro': await onIntro(); break;
        case 'send': await onSend(ev); break;
        case 'recall': await onRecall(ev); break;
        case 'turnStart': releaseMelee(); camDir.shot('rest', { ms: 260, variant: ev.n }); break;
        case 'moveUsed': await onMoveUsed(ev); break;
        case 'hit': await onHit(ev); break;
        case 'miss': await onMiss(); break;
        case 'statusApplied': await onStatusApplied(ev); break;
        case 'statusTick': await onStatusTick(ev); break;
        case 'statStage': await onStatStage(ev); break;
        case 'heal': await onHeal(ev); break;
        case 'auraStart': onAuraStart(ev); break;
        case 'auraEnd': onAuraEnd(); break;
        case 'burstReady': onBurstReady(ev); break;
        case 'burstUsed': await onBurstUsed(ev); break;
        case 'faint': await onFaint(ev); break;
        case 'catchAttempt': await onCatchAttempt(ev); break;
        case 'xp': onXp(ev); break;
        case 'end': await onEnd(ev); break;
        default: break;
      }
    } catch (e) { console.error(`[presentation] handler for "${ev.type}" threw`, e); }
  }

  // ----------------------------------------------------------------- frame
  function update(dt) {
    clock += dt;
    // hitstop machine runs on REAL dt; everything tween-driven freezes via the
    // global tween clock (setTimeScale), which the game loop applies next tick.
    if (hs.phase === 'freeze') {
      hs.t += dt; hs.scale = HITSTOP_DEPTH;
      if (hs.t >= hs.freeze) { hs.phase = 'ramp'; hs.t = 0; }
      setTimeScale(hs.scale);
    } else if (hs.phase === 'ramp') {
      hs.t += dt;
      const t = clamp01(hs.t / hs.ramp);
      hs.scale = HITSTOP_DEPTH + (1 - HITSTOP_DEPTH) * easeOutCubic(t);
      if (t >= 1) settleHitstop();
      else setTimeScale(hs.scale);
    }
    const sdt = dt * hs.scale;
    arena.update(sdt, clock);
    particles.update(sdt);
    for (const side of SIDES) mons[side]?.animator?.update?.(sdt);
    camDir.update(dt); // camera (incl. shake) stays unscaled — impacts read through the freeze
    // camera-side fill: whatever face the lens sees is never a dead silhouette
    creatureFill.position.set(camera.position.x, camera.position.y + 2.5, camera.position.z);
  }

  function dispose() {
    settleHitstop();
    setTimeScale(1); // belt & braces — battleFlow's finally also restores this
    for (const side of SIDES) if (mons[side]) disposeMonEntry(mons[side]);
    auraHandle?.stop();
    arena.dispose();
    particles.dispose();
    camDir.dispose();
    vignette.dispose();
    scene.remove(creatureFill, creatureFill.target);
    creatureFill.dispose();
    boltGeo.dispose(); boltMat.dispose();
    beamGeo.dispose(); beamMat.dispose();
    charmGeo.dispose(); charmMat.dispose();
    scene.remove(camera);
  }

  return {
    scene, camera, update,
    handle,
    setUI(u) { ui = u; },
    project,
    dispose,
  };
}

/** Camera-parented fullscreen flash quad, used for burst cut-ins.
 *  White-gold (0xfff2d0) — a burst is a FLASH of resonance, never a blackout. */
function buildVignette(camera) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff2d0, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0, -1);
  mesh.scale.set(60, 60, 1);
  mesh.renderOrder = 999;
  camera.add(mesh);
  function flash(peak = 0.5, inDur = 0.08, outDur = 0.18) {
    tween({
      from: 0, to: peak, dur: inDur, ease: easeOutCubic, onUpdate: (v) => { mat.opacity = v; },
      onDone: () => tween({ from: peak, to: 0, dur: outDur, ease: easeOutCubic, onUpdate: (v) => { mat.opacity = v; } }),
    });
  }
  return { mesh, flash, dispose() { camera.remove(mesh); geo.dispose(); mat.dispose(); } };
}
