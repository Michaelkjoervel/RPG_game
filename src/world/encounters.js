// encounters.js — shimmer patches: glinting grass that rolls wild battles as
// the player lingers and moves inside them.
//
// Contract (docs/CONTRACTS_ADDENDUM.md):
//   createEncounters(zone, world) -> { update(dt), dispose() }
//
// Zone data (docs/ARCHITECTURE.md):
//   encounters: { patches:[{at:[x,z], r:8}], table:[{speciesId,w,lv:[min,max]}],
//                 rate: 0.25, roaming:[...] }  // roaming Kindred are wildlife.js's job
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { clamp01 } from '../core/math.js';
import { weightedPick, randInt, seededRandom, hashStr } from '../core/rng.js';
import { Particles } from '../gfx/particles.js';

const GLINT = 0xdcffb0;
const BATTLE_COOLDOWN = 4; // seconds after any encounter battle before patches can roll again

function shimmerMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(GLINT) }, uAlpha: { value: 0.28 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform vec3 uColor; uniform float uAlpha; uniform float uTime;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      void main(){
        vec2 c = vUv - 0.5;
        float d = length(c) * 2.0;
        float edge = smoothstep(1.0, 0.55, d);
        float g = hash(floor(vUv * 22.0) + floor(uTime * 3.0));
        float glint = step(0.965, g) * (0.5 + 0.5 * sin(uTime * 9.0 + g * 40.0));
        float a = (edge * 0.22 + glint * edge) * uAlpha;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
}

export function createEncounters(zone, world) {
  const table = zone.encounters?.table ?? [];
  const patchesData = zone.encounters?.patches ?? [];
  const rate = clamp01(zone.encounters?.rate ?? 0.2);
  const scene = world.scene;

  if (!patchesData.length || !table.length) {
    return { update() {}, dispose() {} };
  }

  const heightAt = (x, z) => { try { return world.heightAt(x, z); } catch (e) { return 0; } };
  const fx = new Particles(scene, { capacity: 220 });
  const disposables = [];
  let T = Math.random() * 100;
  let cooldown = 0;
  let battleInFlight = false;

  const patches = patchesData.map((p, i) => {
    const [x, z] = p.at ?? [0, 0];
    const r = p.r ?? 6;
    const y = heightAt(x, z) + 0.03;
    const mat = shimmerMaterial();
    disposables.push({ mat });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 24), mat);
    disposables.push({ geo: disc.geometry });
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(x, y, z);
    scene.add(disc);
    return { x, z, r, r2: r * r, disc, mat, accum: 0, intensity: 0, seed: hashStr(`${zone.id ?? 'z'}:${i}`) };
  });

  function insidePatch(px, pz) {
    for (const p of patches) {
      const dx = px - p.x, dz = pz - p.z;
      if (dx * dx + dz * dz <= p.r2) return p;
    }
    return null;
  }

  function rollAndMaybeTrigger(patch) {
    if (cooldown > 0 || battleInFlight) return;
    if (Math.random() >= rate) return;
    const pick = weightedPick(table);
    if (!pick) return;
    const rng = seededRandom(patch.seed + Math.floor(T * 1000));
    const [lo, hi] = pick.lv ?? [3, 5];
    const level = randInt(lo, hi, rng);

    battleInFlight = true;
    cooldown = BATTLE_COOLDOWN;
    bus.emit('ui:sfx', { name: 'ui_open' });
    fx.emitBurst({ at: { x: patch.x, y: patch.disc.position.y + 0.1, z: patch.z }, count: 22, color: GLINT, size: 0.09, life: 0.5, speed: 2.2, up: 1.1 });

    Promise.resolve(world.startWildBattle?.(pick.speciesId, level))
      .catch((e) => { console.error('[encounters] startWildBattle failed', e); return null; })
      .then(() => { battleInFlight = false; });
  }

  function update(dt) {
    T += dt;
    if (cooldown > 0) cooldown -= dt;
    fx.update(dt);

    const player = world.player;
    const ppos = player?.pos;

    for (const p of patches) {
      p.mat.uniforms.uTime.value = T;
      let inside = false, moving = false;
      if (ppos) {
        const dx = ppos.x - p.x, dz = ppos.z - p.z;
        inside = dx * dx + dz * dz <= p.r2;
        if (inside) {
          const mv = (p._lx == null) ? 0 : Math.hypot(ppos.x - p._lx, ppos.z - p._lz);
          moving = mv > 0.006;
          p._lx = ppos.x; p._lz = ppos.z;
        } else { p._lx = ppos.x; p._lz = ppos.z; }
      }
      p.intensity = p.intensity + ((inside ? 1 : 0) - p.intensity) * Math.min(1, dt * 3.5);
      p.mat.uniforms.uAlpha.value = 0.24 + p.intensity * 0.42;

      if (inside && moving && !battleInFlight && cooldown <= 0) {
        p.accum += dt;
        if (p.accum >= 1) {
          p.accum -= 1;
          rollAndMaybeTrigger(p);
        }
      } else if (!inside) {
        p.accum = 0;
      }
    }
  }

  function dispose() {
    fx.dispose();
    for (const p of patches) scene.remove(p.disc);
    for (const d of disposables) { d.geo?.dispose?.(); d.mat?.dispose?.(); }
    patches.length = 0;
  }

  return { update, dispose };
}
