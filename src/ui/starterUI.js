// LUMENFALL — Starter choice: a memorable moment.
// Three stone pedestals in a small sanctum scene, each bearing a starter idling atop it.
// Selecting rotates/dollies the camera to focus that pedestal with a side info panel
// (name, aspect chip, personality, base stat bars). Confirming plays a happy animation +
// light-bloom flash before resolving the chosen species id.
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { input } from '../core/input.js';
import { TAU } from '../core/math.js';
import { hashStr, seededRandom } from '../core/rng.js';
import { ASPECTS } from '../data/aspects.js';

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

function buildPedestal(rng) {
  const g = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4a4658, roughness: 0.85, flatShading: true });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.22, 8), stoneMat);
  base.position.y = 0.11;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, 0.55, 8), stoneMat);
  shaft.position.y = 0.22 + 0.275;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 0.14, 8), stoneMat);
  cap.position.y = 0.22 + 0.55 + 0.07;
  const runeMat = new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffd166, emissiveIntensity: 0.9, roughness: 0.4 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 6, 24), runeMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.22 + 0.55 + 0.02;
  g.add(base, shaft, cap, ring);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.topY = 0.22 + 0.55 + 0.14;
  return g;
}

async function buildScene() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1c1930, 0.05);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);

  // Floor: circular stone dais, vertex-shaded.
  const floorGeo = new THREE.CircleGeometry(9, 40);
  const c1 = new THREE.Color(0x2c283f), c2 = new THREE.Color(0x171526);
  const pos = floorGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const d = Math.min(1, Math.hypot(pos.getX(i), pos.getY(i)) / 9);
    const c = c1.clone().lerp(c2, d);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  floorGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  scene.add(floor);

  const hemi = new THREE.HemisphereLight(0x6a6fae, 0x0c0a16, 0.55);
  scene.add(hemi);

  const rng = seededRandom(hashStr('starter-sanctum'));
  const pedestals = [];
  const positions = [[-2.3, 0, 0], [0, 0, -0.6], [2.3, 0, 0]];
  const rigs = [];
  let buildCreature = null;
  try { ({ buildCreature } = await import('../creatures/registry.js')); }
  catch (e) { console.warn('[starterUI] creature registry unavailable yet', e); }

  for (let i = 0; i < STARTERS.length; i++) {
    const ped = buildPedestal(rng);
    ped.position.set(positions[i][0], 0, positions[i][2]);
    scene.add(ped);
    pedestals.push(ped);

    const spot = new THREE.SpotLight(0xffe9b0, 0, 6, Math.PI / 5, 0.6, 1.4);
    spot.position.set(positions[i][0], 3.4, positions[i][2] + 1.6);
    spot.target.position.set(positions[i][0], ped.userData.topY, positions[i][2]);
    scene.add(spot, spot.target);

    let rig = null;
    if (buildCreature) {
      try {
        const { group, animator } = buildCreature(STARTERS[i]);
        group.position.set(positions[i][0], ped.userData.topY, positions[i][2]);
        group.rotation.y = Math.PI * 0.15;
        group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        animator.play?.('idle');
        scene.add(group);
        rig = { group, animator };
      } catch (e) { console.warn(`[starterUI] failed to build ${STARTERS[i]}`, e); }
    }
    rigs.push({ spot, rig });
  }

  let time = 0, focusIdx = 1, camState = { x: 0, y: 2.2, z: 5.2 };
  function update(dt) {
    time += dt;
    for (const r of rigs) r.rig?.animator?.update?.(dt);
    // Focus light brightens on the selected pedestal.
    rigs.forEach((r, i) => { r.spot.intensity += ((i === focusIdx ? 2.2 : 0.35) - r.spot.intensity) * Math.min(1, dt * 5); });
    const p = positions[focusIdx];
    const tx = p[0] * 0.55, tz = p[2] + 4.6, ty = 2.1;
    camState.x += (tx - camState.x) * Math.min(1, dt * 3.2);
    camState.z += (tz - camState.z) * Math.min(1, dt * 3.2);
    camState.y += (ty - camState.y) * Math.min(1, dt * 3.2);
    camera.position.set(camState.x, camState.y + Math.sin(time * 0.4) * 0.04, camState.z);
    camera.lookAt(p[0], 1.1, p[2]);
  }

  function dispose() {
    floorGeo.dispose(); floorMat.dispose();
    for (const ped of pedestals) ped.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    for (const r of rigs) {
      r.rig?.group.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose()); } });
    }
  }

  return { scene, camera, update, dispose, setFocus: (i) => { focusIdx = i; }, playHappy: (i) => rigs[i]?.rig?.animator?.play?.('happy') };
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
    let ready = false;

    (async () => {
      try {
        const mod = await import('../data/creatures.js');
        SPECIES = mod.SPECIES ?? {};
      } catch (e) { console.warn('[starterUI] creature data unavailable yet', e); }
      handle = await buildScene();
      ready = true;
      game.mode = 'cutscene';
      game.setScene(handle);
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
