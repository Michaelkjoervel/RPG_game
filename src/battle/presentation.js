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
import { tween, delay, shake } from '../core/tween.js';
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
const HITSTOP_FREEZE = 0.12, HITSTOP_RAMP = 0.22;

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
  let hsPhase = 'idle', hsT = 0, timeScale = 1;

  if (config.weatherAura) auraHandle = vfx.auraAmbient(particles, config.weatherAura);

  // ---------------------------------------------------------------- helpers
  function focusOf(side) {
    const entry = mons[side];
    if (entry) return { x: entry.group.position.x, y: entry.focusY, z: entry.group.position.z };
    const mark = arena.marks[side];
    return { x: mark.x, y: 1.1, z: mark.z };
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

  function hitstop(freezeMs = 120, rampMs = 220) {
    hsPhase = 'freeze'; hsT = 0;
    camDir.impulse(0.15);
    return delay(((freezeMs + rampMs) * 0.55) / 1000);
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
    const dash = { x: lerp(home.x, target.x, 0.6), z: lerp(home.z, target.z, 0.6) };
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
    camDir.shot('closeUp', { side: other, ms: 70 });
    await delay(0.03);
    await tween({
      from: 0, to: 1, dur: 0.16, ease: easeOutCubic,
      onUpdate: (v) => { attacker.group.position.x = lerp(dash.x, home.x, v); attacker.group.position.z = lerp(dash.z, home.z, v); },
    });
    attacker.group.position.x = home.x; attacker.group.position.z = home.z;
  }

  async function projectileAttack(from, to, color, other) {
    vfx.conjure(particles, { at: from, color, dur: 0.2 });
    camDir.shot('closeUp', { side: other, ms: 0 });
    bolt.material.color.set(color); bolt.material.emissive.set(color);
    bolt.position.set(from.x, from.y, from.z);
    bolt.visible = true; bolt.scale.setScalar(0.32);
    const trail = particles.emitTrail(bolt, { color, size: 0.09, life: 0.3, rate: 90, gravity: 0 });
    await delay(0.16);
    await tween({
      from: 0, to: 1, dur: 0.32, ease: easeOutCubic,
      onUpdate: (v) => {
        bolt.position.set(lerp(from.x, to.x, v), lerp(from.y, to.y, v) + Math.sin(v * Math.PI) * 0.35, lerp(from.z, to.z, v));
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
  async function onIntro() {
    await camDir.shot('wide', { ms: 750 });
    await camDir.shot('rest', { ms: 480 });
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
    if (!isFinite(height) || height < 0.05) height = species?.size ?? 1.2;
    if (species?.size && Math.abs(height - species.size) / species.size > 0.4) {
      group.scale.multiplyScalar(species.size / Math.max(0.05, height));
      height = species.size;
    }
    const baseScale = group.scale.clone();
    scene.add(group);
    group.scale.setScalar(0.02);
    mons[side] = { group, animator, speciesId, mon: inst, baseScale, focusY: height * 0.55 };

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
    const attacker = mons[side];
    if (!attacker) return;
    attacker.animator?.play?.('attack');
    const color = move?.fx?.color ?? aspectColor(lastMoveAspect);
    if (move?.fx?.sfx) bus.emit('ui:sfx', { name: move.fx.sfx });
    const from = focusOf(side), to = focusOf(other);
    switch (move?.fx?.anim ?? 'melee') {
      case 'melee': await meleeAttack(attacker, side, other); break;
      case 'projectile': await projectileAttack(from, to, color, other); break;
      case 'beam': await beamAttack(from, to, color); break;
      case 'burst': await eruptionAttack(to, other, lastMoveAspect, color); break;
      case 'buff': vfx.auraSpiral(particles, { at: from, color, up: true }); await delay(0.34); break;
      case 'debuff': vfx.auraSpiral(particles, { at: to, color, up: false }); await delay(0.34); break;
      case 'field': vfx.fieldWash(particles, { color }); await delay(0.4); break;
      case 'song': vfx.songNotes(particles, { from, to, color }); await camDir.shot('closeUp', { side: other, ms: 240 }); break;
      default: await delay(0.2);
    }
  }

  async function onHit(ev) {
    const side = ev.side, entry = mons[side];
    const pos = focusOf(side);
    const kind = ev.eff === 'immune' ? 'status' : ev.crit ? 'crit' : (ev.eff === 'super' || ev.eff === 'weak') ? ev.eff : 'normal';
    const text = ev.eff === 'immune' ? 'No Effect' : String(ev.dmg);
    const { x, y } = project(pos);
    ui?.showDamage(x, y, text, kind);
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
    if (ev.eff !== 'immune') vfx.impact(particles, { at: pos, aspect: lastMoveAspect, eff: ev.eff, crit: ev.crit });
    if (ev.crit && ev.eff === 'super') shake(0.8, 0.32);
    else if (ev.crit || ev.eff === 'super') shake(0.55, 0.26);
    else shake(0.26, 0.16);
    if (ev.crit || ev.eff === 'super') await hitstop(120, 220);
    await delay(0.22);
  }

  async function onMiss() {
    const side = lastDefenderSide, entry = mons[side];
    const pos = focusOf(side);
    const { x, y } = project(pos);
    ui?.showDamage(x, y, 'Miss', 'status');
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
    await delay(0.15);
  }

  async function onStatusApplied(ev) {
    const pos = focusOf(ev.side);
    vfx.statusBurst(particles, ev.status, pos, false);
    const { x, y } = project(pos);
    ui?.showDamage(x, y, STATUS_LABEL[ev.status] ?? ev.status, 'status');
    bus.emit('ui:sfx', { name: 'debuff' });
    await delay(0.3);
  }
  async function onStatusTick(ev) {
    const pos = focusOf(ev.side);
    vfx.statusBurst(particles, ev.status, pos, true);
    const { x, y } = project(pos);
    ui?.showDamage(x, y, `-${ev.dmg}`, 'status');
    await delay(0.2);
  }
  async function onStatStage(ev) {
    vfx.statStageFx(particles, { at: focusOf(ev.side), delta: ev.delta });
    bus.emit('ui:sfx', { name: ev.delta >= 0 ? 'buff' : 'debuff' });
    await delay(0.26);
  }
  async function onHeal(ev) {
    const pos = focusOf(ev.side);
    vfx.healFx(particles, { at: pos });
    const { x, y } = project(pos);
    ui?.showDamage(x, y, `+${ev.amt}`, 'heal');
    bus.emit('ui:sfx', { name: 'heal' });
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

  async function onBurstUsed(ev) {
    const side = ev.side, other = SIDE_OTHER[side];
    const burst = await resolveBurst(ev.burst);
    const aspect = burst?.aspect ?? lastMoveAspect;
    const color = burst?.fx?.color ?? aspectColor(aspect);
    mons[side]?.animator?.play?.('special');
    await camDir.shot('burstCharge', { side, ms: 280 });
    setLightMult(0.35, 0.15);
    vignette.flash(0.6, 0.06, 0.16);
    bus.emit('ui:sfx', { name: burst?.fx?.sfx ?? 'burst_fire' });
    const dur = vfx.burstSignature(particles, { at: focusOf(side), target: focusOf(other), aspect, color });
    shake(0.5, 0.35);
    await delay(Math.min(dur, 1.1));
    vfx.impact(particles, { at: focusOf(other), aspect, color, eff: 'super', big: true });
    if (mons[other]) pulseEmissive(mons[other].group);
    shake(0.85, 0.4);
    await hitstop(120, 260);
    setLightMult(1, 0.4);
    await delay(0.2);
  }

  async function onFaint(ev) {
    const side = ev.side, entry = mons[side];
    if (!entry) return;
    entry.animator?.play?.('faint');
    vfx.dissolve(particles, { at: focusOf(side) });
    bus.emit('ui:sfx', { name: 'faint' });
    if (side === 'p') await camDir.shot('closeUp', { side, ms: 240 });
    else camDir.shot('orbitKO', { side, ms: 0 });
    await tween({
      from: 1, to: 0, dur: 0.68, ease: easeOutCubic,
      onUpdate: (v) => { entry.group.position.y = -0.9 * (1 - v); entry.group.scale.copy(entry.baseScale).multiplyScalar(Math.max(0.02, v)); setOpacity(entry.group, v); },
    });
    disposeMonEntry(entry);
    mons[side] = null;
  }

  async function onCatchAttempt(ev) {
    const entry = mons.e;
    const pStart = focusOf('p');
    const eTarget = entry ? { x: entry.group.position.x, y: 0.9, z: entry.group.position.z } : focusOf('e');
    await camDir.shot('catchFocus', { ms: 200 });
    bus.emit('ui:sfx', { name: 'catch_throw' });
    charm.visible = true; charm.scale.setScalar(1); charm.rotation.set(0, 0, 0);
    charm.position.set(pStart.x, pStart.y, pStart.z);
    await tween({
      from: 0, to: 1, dur: 0.48, ease: easeOutCubic,
      onUpdate: (v) => {
        charm.position.set(lerp(pStart.x, eTarget.x, v), lerp(pStart.y, eTarget.y, v) + Math.sin(v * Math.PI) * 1.6, lerp(pStart.z, eTarget.z, v));
        charm.rotation.x += 0.3; charm.rotation.y += 0.22;
      },
    });
    if (entry) {
      vfx.materialize(particles, { at: eTarget, color: 0xffe9b0, height: 0.6 });
      await tween({ from: 1, to: 0.02, dur: 0.22, ease: easeOutCubic, onUpdate: (v) => entry.group.scale.copy(entry.baseScale).multiplyScalar(v) });
      entry.group.visible = false;
    }
    await tween({ from: charm.position.y, to: 0.26, dur: 0.2, ease: easeOutBack, onUpdate: (v) => { charm.position.y = v; } });
    await delay(0.32);
    for (let i = 0; i < (ev.shakes ?? 0); i++) {
      bus.emit('ui:sfx', { name: 'catch_shake' });
      await tween({ from: 0, to: 1, dur: 0.22, ease: easeOutCubic, onUpdate: (v) => { charm.rotation.z = Math.sin(v * Math.PI * 3) * 0.5 * (1 - v); } });
      await delay(0.3);
    }
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
    if (outcome === 'win') await camDir.shot('victory', { side: 'p', ms: 550 });
    else if (outcome === 'loss') await camDir.shot('defeat', { ms: 550 });
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
        case 'turnStart': camDir.shot('rest', { ms: 260 }); break;
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
    if (hsPhase === 'freeze') { hsT += dt; timeScale = 0.06; if (hsT >= HITSTOP_FREEZE) { hsPhase = 'ramp'; hsT = 0; } }
    else if (hsPhase === 'ramp') { hsT += dt; const t = clamp01(hsT / HITSTOP_RAMP); timeScale = 0.06 + 0.94 * easeOutCubic(t); if (t >= 1) { hsPhase = 'idle'; timeScale = 1; } }
    else timeScale = 1;
    const sdt = dt * timeScale;
    arena.update(sdt, clock);
    particles.update(sdt);
    for (const side of SIDES) mons[side]?.animator?.update?.(sdt);
    camDir.update(dt);
  }

  function dispose() {
    for (const side of SIDES) if (mons[side]) disposeMonEntry(mons[side]);
    auraHandle?.stop();
    arena.dispose();
    particles.dispose();
    camDir.dispose();
    vignette.dispose();
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

/** Camera-parented fullscreen flash quad, used for burst cut-ins. */
function buildVignette(camera) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
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
