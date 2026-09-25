// LUMENFALL — Starter choice: a memorable moment.
// Three stone pedestals in a small sanctum scene, each bearing a starter idling atop it.
// Selecting rotates/dollies the camera to focus that pedestal with a side info panel
// (name, aspect chip, personality, base stat bars). Confirming plays a happy animation +
// light-bloom flash before resolving the chosen species id.
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { input } from '../core/input.js';
import { hashStr, seededRandom } from '../core/rng.js';
import { ASPECTS } from '../data/aspects.js';
import { TAU } from '../core/math.js';

const sfx = (name) => bus.emit('ui:sfx', { name });

const STARTERS = ['kindlet', 'nixling', 'thistlit'];
// Binding creative direction from docs/DESIGN_BIBLE.md §4 (starter lines) — canonical, hardcoded.
const PERSONALITY = {
  kindlet: 'Eager, clumsy. Its tail-flame flickers brighter with every excitement.',
  nixling: 'Curious, easily distracted. Big glassy eyes drinking in the whole world.',
  thistlit: 'Shy but stubborn. One sprout antenna trembles when it screws up its courage.',
};
const STAT_META = [
  { key: 'vigor', label: 'Vigor', color: 'var(--hp)' },
  { key: 'might', label: 'Might', color: 'var(--ember)' },
  { key: 'ward', label: 'Ward', color: 'var(--terra)' },
  { key: 'focus', label: 'Focus', color: 'var(--lumen)' },
  { key: 'aegis', label: 'Aegis', color: 'var(--frost)' },
  { key: 'haste', label: 'Haste', color: 'var(--volt)' },
];
const STAT_MAX = 80;

function cssHex(n) { return typeof n === 'number' ? `#${n.toString(16).padStart(6, '0')}` : (n || '#c8c2b8'); }

// Aspect identity per starter: plinth rune color, light tint and the motes
// that swirl around it while it is the one in focus.
const STARTER_FX = {
  kindlet: { rune: 0xff8a3c, light: 0xffb27a, color: 0xff8a3c, color2: 0xffd27a, vel: { x: 0, y: 0.55, z: 0 }, flicker: true },
  nixling: { rune: 0x5fb8ff, light: 0xa8d8ff, color: 0x7fc8ff, color2: 0xe0f4ff, vel: { x: 0, y: 0.35, z: 0 }, flicker: false },
  thistlit: { rune: 0x8fd85c, light: 0xc8f0a0, color: 0xa8e07a, color2: 0xfff6b0, vel: { x: 0.1, y: 0.22, z: 0 }, flicker: true },
};

// A low weathered stone plinth: rounded, crack-free smooth shading, a moss
// cap and an emissive rune ring in the starter's aspect color.
function buildPlinth(MAT, fx, seed) {
  const g = new THREE.Group();
  const stoneGeo = new THREE.CylinderGeometry(0.5, 0.6, 0.28, 28, 3).toNonIndexed();
  stoneGeo.deleteAttribute('uv');
  MAT.jitterGeometry(stoneGeo, 0.035, seed);
  MAT.smoothGeometry(stoneGeo, { creaseAngle: 0.95 });
  stoneGeo.translate(0, 0.14, 0);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.92 });
  MAT.applyLook?.(stoneMat, { rim: 0.6 });
  const stone = new THREE.Mesh(stoneGeo, stoneMat);
  const mossGeo = new THREE.CylinderGeometry(0.45, 0.49, 0.05, 28, 1).toNonIndexed();
  mossGeo.deleteAttribute('uv');
  MAT.jitterGeometry(mossGeo, 0.02, seed + 3);
  MAT.smoothGeometry(mossGeo);
  mossGeo.translate(0, 0.295, 0);
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x6f9a48, roughness: 0.95 });
  const moss = new THREE.Mesh(mossGeo, mossMat);
  const runeMat = new THREE.MeshStandardMaterial({ color: fx.rune, emissive: fx.rune, emissiveIntensity: 1.2, roughness: 0.4 });
  const rune = new THREE.Mesh(new THREE.TorusGeometry(0.545, 0.014, 8, 48), runeMat);
  rune.rotation.x = Math.PI / 2;
  rune.position.y = 0.23;
  g.add(stone, moss, rune);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.topY = 0.315;
  g.userData.runeMat = runeMat;
  return g;
}

async function buildScene(game) {
  const K = await import('../battle/arenas.js');
  const MAT = await import('../gfx/materials.js');
  const { Particles } = await import('../gfx/particles.js');
  const q = K.stageQuality();
  const scene = new THREE.Scene();
  const disposables = [];
  const track = (o) => { o.traverse?.((m) => { if (m.geometry) disposables.push(m.geometry); if (m.material) disposables.push(m.material); }); return o; };

  // ---- dawn sky: the sun rising just behind the plinths rims all three
  const SUN = new THREE.Vector3(0.18, 0.07, -1).normalize();
  scene.add(track(K.stageSkyDome({ top: 0x3f5fa8, mid: 0xc890a8, horizon: 0xffd2a0, bottom: 0x6a6a70, sun: 0xffd6a0, sunDir: SUN.toArray(), sunAmt: 1.1, glow: 1.0 })));
  scene.fog = new THREE.FogExp2(0xe0b8a8, 0.02);
  scene.background = new THREE.Color(0xd8b0a8);

  // ---- a clearing in the meadow, trees closing softly behind
  const heightAt = (x, z) => {
    const r = Math.hypot(x, z + 1);
    return K.fbm2(x * 0.08, z * 0.08, 3) * 0.5 * Math.min(1, Math.max(0, (r - 4) / 6)) + Math.max(0, (-z - 12) / 30) * 5 * K.fbm2(x * 0.03, z * 0.03, 9);
  };
  const groundMat = K.stageGroundMaterial({
    a: 0x5f8f40, b: 0x7fa84c, c: 0xb0b460, dirt: 0x9c8a66, far: 0xb89a90, hill: 0x6a8a52,
    marks: [99, 99, 99, 99], worn: [0.1, 0.1, 0, 0], farR: [10, 45, 0.7], hillR: [8, 30, 0.35],
  });
  scene.add(track(new THREE.Mesh(K.buildStageGround(heightAt, { radius: 120, inner: 12, step: q === 0 ? 0.9 : 0.55, segs: 112 }), groundMat)));
  scene.children[scene.children.length - 1].receiveShadow = true;
  const PLINTHS = [[-2.4, 0.15], [0, -0.55], [2.4, 0.15]];
  const nearPlinth = (x, z) => Math.min(...PLINTHS.map(([px, pz]) => Math.hypot(x - px, z - pz)));
  scene.add(track(K.buildGrass({
    count: 3400, base: 0x4f7a34, tipA: 0xa8cc62, tipB: 0xe0d890, h: 0.3, seed: 12, r0: 0, r1: 14, heightAt,
    accept: (x, z) => (nearPlinth(x, z) < 0.95 ? 0 : 1), scaleAt: (x, z) => (nearPlinth(x, z) < 1.6 ? 0.75 : 1),
  })));
  scene.add(track(K.buildFlowers({
    count: 180, colors: [0xfff4f8, 0xffd94f, 0xff9fb0, 0xc9b0ff], seed: 9, r0: 0.5, r1: 10, heightAt,
    accept: (x, z) => (nearPlinth(x, z) < 1.1 ? 0 : 1),
  })));
  const treeGeo = K.softTreeGeometry({ seed: 7, h: 4.4, crown: 2.1, lobes: 7, leafLo: 0x2f4f36, leafHi: 0xb8c070 });
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  try { MAT.windSway(treeMat, { strength: 0.2, speed: 0.9, heightScale: 8 }); } catch (e) { /* static */ }
  MAT.applyLook?.(treeMat, { rim: 0.8 });
  const treeSpots = [[-9, -9.5, 1.15], [-4.5, -14, 1.05], [6.5, -12, 1.2], [11.5, -7, 1.0], [1.2, -17, 1.3], [-13, -4, 1.1], [14, -14, 1.2], [-9, -19, 1.3]];
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, treeSpots.length);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), e3 = new THREE.Euler();
  treeSpots.forEach(([x, z, s], i) => { trees.setMatrixAt(i, m4.compose(p3.set(x, heightAt(x, z) - 0.1, z), q4.setFromEuler(e3.set(0, i * 1.9, 0)), s3.set(s, s, s))); });
  trees.castShadow = true; trees.receiveShadow = true;
  scene.add(track(trees));
  const blobRng = seededRandom(hashStr('starter-treeline'));
  const tlGeo = K.softTreeGeometry({ seed: 17, detail: 1, lobes: 4, h: 4.6, crown: 2.1, leafLo: 0x3a5048, leafHi: 0x9aa070 });
  const tlMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  MAT.applyLook?.(tlMat, { rim: 0.6 });
  const tlCount = 44;
  const tlTrees = new THREE.InstancedMesh(tlGeo, tlMat, tlCount);
  for (let i = 0; i < tlCount; i++) {
    const x = (blobRng() - 0.5) * 80, z = -20 - blobRng() * 22, sc = 1.0 + blobRng() * 0.8;
    tlTrees.setMatrixAt(i, m4.compose(p3.set(x, heightAt(x, z) - 0.2, z), q4.setFromEuler(e3.set(0, blobRng() * TAU, 0)), s3.set(sc, sc * (0.9 + blobRng() * 0.3), sc)));
  }
  scene.add(track(tlTrees));
  scene.add(track(K.buildRidges({ r: 90, hMin: 5, hMax: 16, base: -6, cLo: 0x9a8098, cHi: 0xb89aa8, seed: 23 })));

  // ---- lights: dawn key behind (rim), sky fill, soft front fill
  scene.add(new THREE.HemisphereLight(0xa8b8f0, 0x6a5a40, 1.0));
  const key = new THREE.DirectionalLight(0xffc890, 2.4);
  key.position.copy(SUN).multiplyScalar(24).setY(7);
  key.target.position.set(0, 0.5, 0);
  if (q > 0) {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 4, far: 50 });
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.bias = -0.0015; key.shadow.normalBias = 0.03;
  }
  scene.add(key, key.target);
  const front = new THREE.DirectionalLight(0xfff0e0, 0.9);
  front.position.set(-2, 4, 9);
  front.target.position.set(0, 0.8, 0);
  scene.add(front, front.target);

  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 500);
  const particles = new Particles(scene, { capacity: 700 });

  let buildCreature = null;
  try { ({ buildCreature } = await import('../creatures/registry.js')); }
  catch (e) { console.warn('[starterUI] creature registry unavailable yet', e); }

  // Focus framing per plinth: the creature right of center (the info panel
  // owns the left), camera low enough that it looks a little heroic.
  const CAMS = PLINTHS.map(([px, pz]) => ({ pos: new THREE.Vector3(px - 1.3, 1.42, pz + 4.1), look: new THREE.Vector3(px - 0.78, 0.66, pz) }));
  const camFor = (i) => CAMS[i]; // precomputed: never allocate per frame

  const rigs = [];
  for (let i = 0; i < STARTERS.length; i++) {
    const id = STARTERS[i];
    const fx = STARTER_FX[id];
    const [px, pz] = PLINTHS[i];
    const plinth = buildPlinth(MAT, fx, 11 + i * 7);
    plinth.position.set(px, heightAt(px, pz) - 0.02, pz);
    scene.add(track(plinth));
    // aspect-tinted spot from the front-right: the focus light
    const spot = new THREE.SpotLight(fx.light, 0, 9, Math.PI / 6.5, 0.75, 1.3);
    spot.position.set(px + 1.2, 3.4, pz + 2.6);
    spot.target.position.set(px, 0.9, pz);
    scene.add(spot, spot.target);
    let rig = null;
    if (buildCreature) {
      try {
        const { group, animator } = buildCreature(id);
        group.position.set(px, plinth.position.y + plinth.userData.topY, pz);
        const c = camFor(i).pos;
        group.rotation.y = Math.atan2(c.x - px, c.z - pz) + 0.12;
        group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        animator.play?.('idle');
        scene.add(group);
        rig = { group, animator };
      } catch (e) { console.warn(`[starterUI] failed to build ${id}`, e); }
    }
    const aura = particles.ambient({ center: { x: px, y: 0, z: pz }, radius: 0.75, y0: 0.4, y1: 1.4, rate: 0, color: fx.color, color2: fx.color2, size: 0.055, life: 1.6, vel: fx.vel, sway: 0.7, flicker: fx.flicker });
    rigs.push({ spot, rig, aura, runeMat: plinth.userData.runeMat, fx });
  }
  // meadow motes, drifting through the dawn light
  const motes = particles.ambient({ center: { x: 0, y: 0, z: 0 }, radius: 7, y0: 0.3, y1: 3, rate: q === 0 ? 2 : 4, color: 0xfff0c8, color2: 0xffe0a0, size: 0.06, life: 5, vel: { x: 0.08, y: 0.1, z: 0 }, sway: 0.8, flicker: true });

  let fxPass = null;
  try {
    const { applyAtmosphere } = await import('../gfx/postfx.js');
    if (game?.renderer) fxPass = applyAtmosphere(game.renderer, scene, camera);
  } catch (e) { fxPass = null; }

  let time = 0, focusIdx = 1, settled = false;
  const camState = { pos: camFor(1).pos.clone().add(new THREE.Vector3(0, 0.4, 1.4)), look: camFor(1).look.clone() };
  function update(dt) {
    time += dt;
    try { MAT.tickWind?.(dt); } catch (e) { /* static */ }
    for (const r of rigs) r.rig?.animator?.update?.(dt);
    rigs.forEach((r, i) => {
      const focused = i === focusIdx;
      const k = Math.min(1, dt * 5);
      r.spot.intensity += ((focused ? 5.5 : 0) - r.spot.intensity) * k;
      r.runeMat.emissiveIntensity += ((focused ? 1.25 + Math.sin(time * 3) * 0.25 : 0.35) - r.runeMat.emissiveIntensity) * k;
      r.aura.rate = focused ? 9 : 1.2;
    });
    const tgt = camFor(focusIdx);
    const k = 1 - Math.exp(-dt * 4.5); // frame-rate independent glide
    camState.pos.lerp(tgt.pos, k);
    camState.look.lerp(tgt.look, k);
    settled = camState.pos.distanceTo(tgt.pos) < 0.02 && camState.look.distanceTo(tgt.look) < 0.02;
    camera.position.set(camState.pos.x + Math.sin(time * 0.35) * 0.05, camState.pos.y + Math.sin(time * 0.5) * 0.03, camState.pos.z);
    camera.lookAt(camState.look);
    particles.update(dt);
  }

  function dispose() {
    try { fxPass?.dispose(); } catch (e) { /* ignore */ }
    particles.dispose();
    for (const d of disposables) { d.userData?.unregisterSway?.(); d.dispose?.(); }
    trees.dispose?.(); tlTrees.dispose?.();
    for (const r of rigs) {
      r.spot.dispose?.();
      r.rig?.group.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose()); } });
    }
  }

  return {
    scene, camera, update, dispose,
    render(renderer) { if (fxPass) fxPass.render(); else renderer.render(scene, camera); },
    setFocus: (i) => { focusIdx = i; settled = false; },
    isSettled: () => settled, // QA probe: the focus glide has landed
    playHappy: (i) => {
      rigs[i]?.rig?.animator?.play?.('happy');
      const [px, pz] = PLINTHS[i];
      const fx = STARTER_FX[STARTERS[i]];
      particles.emitFountain({ at: { x: px, y: 0.5, z: pz }, count: 40, color: fx.color, color2: 0xffffff, size: 0.09, life: 1.3, speed: 3.2, spread: 0.5, gravity: 1.2, flicker: true });
      particles.emitRing({ at: { x: px, y: 0.45, z: pz }, radius: 0.5, count: 48, color: fx.color, color2: 0xffffff, size: 0.08, speed: 3.5, life: 0.7 });
    },
  };
}

export function chooseStarter(game) {
  return new Promise((resolve) => {
    let idx = 1;
    let locked = false;
    const unsubs = [];

    const root = document.createElement('div');
    root.className = 'starter-root';
    root.innerHTML = `
      <div class="starter-vignette"></div>
      <div class="starter-header">
        <div class="starter-title">Choose your Kindred</div>
        <div class="starter-sub">A bond, once struck, lasts a lifetime</div>
      </div>
      <div class="starter-info panel">
        <div class="starter-info-head">
          <div class="starter-info-name"></div>
          <div class="starter-info-chips"></div>
        </div>
        <div class="starter-info-personality"></div>
        <div class="starter-stats"></div>
        <div class="starter-nav">
          <button class="starter-nav-arrow" data-dir="-1">&#9664;</button>
          <div class="starter-dots"></div>
          <button class="starter-nav-arrow" data-dir="1">&#9654;</button>
        </div>
        <div class="starter-confirm"><button class="btn-gold">Bond with this Kindred</button></div>
      </div>
      <div class="starter-flash"></div>
    `;
    document.getElementById('ui-root').appendChild(root);
    // Softer frame than the stylesheet's: the clearing should read to the edges.
    const vig = root.querySelector('.starter-vignette');
    if (vig) vig.style.background = 'radial-gradient(ellipse at 58% 52%, rgba(11,12,20,0) 40%, rgba(11,12,20,0.28) 82%, rgba(11,12,20,0.5) 100%)';

    const el = {
      name: root.querySelector('.starter-info-name'),
      chips: root.querySelector('.starter-info-chips'),
      personality: root.querySelector('.starter-info-personality'),
      stats: root.querySelector('.starter-stats'),
      dots: root.querySelector('.starter-dots'),
      confirmBtn: root.querySelector('.starter-confirm button'),
      flash: root.querySelector('.starter-flash'),
    };

    STARTERS.forEach((_, i) => {
      const d = document.createElement('div');
      d.className = 'starter-dot';
      el.dots.appendChild(d);
    });

    let SPECIES = {};
    let handle = null;
    let prevMode = 'title';
    let ready = false;

    (async () => {
      try {
        const mod = await import('../data/creatures.js');
        SPECIES = mod.SPECIES ?? {};
      } catch (e) { console.warn('[starterUI] creature data unavailable yet', e); }
      try { handle = await buildScene(game); }
      catch (e) {
        // The choice itself must never be blocked by a 3D failure.
        console.error('[starterUI] starter scene failed to build', e);
        handle = { setFocus() {}, playHappy() {}, dispose() {} };
      }
      ready = true;
      prevMode = game.mode;
      game.mode = 'cutscene';
      if (handle.scene) game.setScene(handle);
      render();
    })();

    function render() {
      el.dots.querySelectorAll('.starter-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
      const id = STARTERS[idx];
      const sp = SPECIES[id];
      el.name.textContent = sp?.name ?? id;
      el.chips.innerHTML = '';
      (sp?.aspects ?? []).forEach((a) => {
        const chip = document.createElement('span');
        chip.className = `aspect-chip chip-${a}`;
        chip.textContent = ASPECTS[a]?.name ?? a;
        el.chips.appendChild(chip);
      });
      el.personality.textContent = PERSONALITY[id] ?? sp?.codex ?? '';
      el.stats.innerHTML = '';
      const base = sp?.base ?? {};
      for (const { key, label, color } of STAT_META) {
        const v = base[key] ?? 0;
        const row = document.createElement('div');
        row.className = 'starter-stat-row';
        row.innerHTML = `<span class="starter-stat-label"></span><span class="starter-stat-track"><span class="starter-stat-fill"></span></span><span class="starter-stat-val"></span>`;
        row.querySelector('.starter-stat-label').textContent = label;
        row.querySelector('.starter-stat-val').textContent = v || '—';
        const fill = row.querySelector('.starter-stat-fill');
        fill.style.background = color;
        fill.style.transform = `scaleX(${Math.min(1, v / STAT_MAX)})`;
        el.stats.appendChild(row);
      }
      handle?.setFocus?.(idx);
    }

    function move(dir) {
      if (locked) return;
      sfx('ui_move');
      idx = (idx + dir + STARTERS.length) % STARTERS.length;
      render();
    }

    async function confirm() {
      if (locked || !ready) return;
      locked = true;
      sfx('ui_confirm');
      el.confirmBtn.disabled = true;
      handle.playHappy(idx);
      await new Promise((r) => setTimeout(r, 260));
      el.flash.classList.add('go');
      const { delay } = await import('../core/tween.js');
      await delay(0.55);
      unsubs.forEach((off) => off());
      root.classList.add('out');
      await delay(0.32);
      root.remove();
      handle.dispose();
      // Hand the mode back exactly as we found it — leaving 'cutscene' behind
      // strands the player: frozen, with menus still working.
      game.mode = prevMode;
      resolve(STARTERS[idx]);
    }

    root.querySelectorAll('.starter-nav-arrow').forEach((b) => {
      b.addEventListener('click', () => move(Number(b.dataset.dir)));
    });
    el.confirmBtn.addEventListener('click', confirm);

    unsubs.push(input.onAction('left', () => move(-1)));
    unsubs.push(input.onAction('right', () => move(1)));
    unsubs.push(input.onAction('confirm', confirm));
    unsubs.push(input.onAction('interact', confirm));
  });
}
