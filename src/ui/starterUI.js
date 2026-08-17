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

// Soft radial-gradient texture for the warm light pools under each pedestal.
function makePoolTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255, 224, 168, 0.85)');
  g.addColorStop(0.4, 'rgba(255, 205, 140, 0.34)');
  g.addColorStop(1.0, 'rgba(255, 190, 120, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Dawn-shrine backdrop: a small gradient dome — deep dusk violet overhead
// melting into warm amber at the horizon, with a soft sun-glow rising behind
// the pedestals. The sanctum must never read as a black void.
const SANCTUM_DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SANCTUM_DOME_FRAG = /* glsl */ `
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, -1.0, 1.0);
  vec3 top = vec3(0.13, 0.11, 0.24);   // deep dusk violet
  vec3 mid = vec3(0.40, 0.30, 0.47);   // mauve
  vec3 hor = vec3(0.78, 0.52, 0.33);   // warm dawn amber
  vec3 col = mix(hor, mid, smoothstep(0.02, 0.24, h));
  col = mix(col, top, smoothstep(0.22, 0.7, h));
  float glow = pow(max(dot(vDir, normalize(vec3(0.0, 0.16, -1.0))), 0.0), 5.0);
  col += vec3(1.0, 0.72, 0.42) * glow * 0.4;
  gl_FragColor = vec4(col, 1.0);
}`;

function buildPedestal(rng) {
  const g = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7b7292, roughness: 0.8, flatShading: true });
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
  // Warm dusk-mauve haze — depth without murk (the old near-black fog +
  // no-key lighting measured the floor at ~1-2% luminance; this is a shrine
  // at dawn, not a void).
  scene.fog = new THREE.FogExp2(0x453a5c, 0.026);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);

  // Gradient backdrop dome: dusk violet overhead, warm dawn amber behind
  // the pedestals.
  const domeGeo = new THREE.SphereGeometry(60, 24, 16);
  const domeMat = new THREE.ShaderMaterial({
    vertexShader: SANCTUM_DOME_VERT, fragmentShader: SANCTUM_DOME_FRAG,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.renderOrder = -100;
  scene.add(dome);

  // Floor: circular stone dais, vertex-shaded — lifted so it reads as warm
  // lit stone at the center fading to cool slate at the rim.
  const floorGeo = new THREE.CircleGeometry(9, 40);
  const c1 = new THREE.Color(0x746a8c), c2 = new THREE.Color(0x322c48);
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

  // Lighting: warm key sun + cool sky fill + gentle cool rim (§8: warm key,
  // cool fill, rim-light feel).
  const hemi = new THREE.HemisphereLight(0x8d8ac8, 0x4a3f58, 1.05);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffc98c, 1.35);
  key.position.set(2.6, 5.2, 4.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -5; key.shadow.camera.right = 5;
  key.shadow.camera.top = 5; key.shadow.camera.bottom = -5;
  key.shadow.camera.near = 1; key.shadow.camera.far = 20;
  key.shadow.bias = -0.002;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x8fa8ff, 0.75);
  rim.position.set(-3, 4.2, -5.5);
  scene.add(rim);

  const rng = seededRandom(hashStr('starter-sanctum'));
  const pedestals = [];
  const positions = [[-2.3, 0, 0], [0, 0, -0.6], [2.3, 0, 0]];
  const rigs = [];
  let buildCreature = null;
  try { ({ buildCreature } = await import('../creatures/registry.js')); }
  catch (e) { console.warn('[starterUI] creature registry unavailable yet', e); }

  const poolTex = makePoolTexture();
  const poolGeo = new THREE.CircleGeometry(1.2, 28);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMats = [];

  for (let i = 0; i < STARTERS.length; i++) {
    const ped = buildPedestal(rng);
    ped.position.set(positions[i][0], 0, positions[i][2]);
    scene.add(ped);
    pedestals.push(ped);

    // Soft pool of warm light on the floor under each pedestal.
    const poolMat = new THREE.MeshBasicMaterial({
      map: poolTex, color: 0xffd9a0, transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.position.set(positions[i][0], 0.012, positions[i][2]);
    scene.add(pool);
    poolMats.push(poolMat);

    // Warm shrine spot aimed at the creature atop the pedestal, angled in
    // from the camera side so the face — not just the crown — reads clearly.
    const spot = new THREE.SpotLight(0xffe0b0, 1.5, 9, Math.PI / 5.2, 0.7, 1.2);
    spot.position.set(positions[i][0] + 0.5, 3.3, positions[i][2] + 2.4);
    spot.target.position.set(positions[i][0], ped.userData.topY + 0.25, positions[i][2]);
    scene.add(spot, spot.target);

    // Warm bounce off the light pool — lifts each creature's face and belly
    // so even the soot-dark starters read clearly.
    const bounce = new THREE.PointLight(0xffc98a, 0.9, 4, 2);
    bounce.position.set(positions[i][0], ped.userData.topY + 0.55, positions[i][2] + 0.8);
    scene.add(bounce);

    let rig = null;
    if (buildCreature) {
      try {
        const { group, animator } = buildCreature(STARTERS[i]);
        group.position.set(positions[i][0], ped.userData.topY, positions[i][2]);
        // Face where the camera settles when this pedestal is focused.
        const camX = positions[i][0] * 0.62 - 0.6, camZ = positions[i][2] + 3.6;
        group.rotation.y = Math.atan2(camX - positions[i][0], camZ - positions[i][2]);
        group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        animator.play?.('idle');
        scene.add(group);
        rig = { group, animator };
      } catch (e) { console.warn(`[starterUI] failed to build ${STARTERS[i]}`, e); }
    }
    rigs.push({ spot, rig, pool: poolMat });
  }

  // Drifting gold shardlight motes — the sanctum breathes.
  const moteCount = 26;
  const moteGeo = new THREE.BufferGeometry();
  const motePos = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    motePos[i * 3] = (rng() - 0.5) * 9;
    motePos[i * 3 + 1] = 0.4 + rng() * 2.8;
    motePos[i * 3 + 2] = (rng() - 0.5) * 7;
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteMat = new THREE.PointsMaterial({
    map: poolTex, color: 0xffe9b0, size: 0.16, transparent: true, opacity: 0.5,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  scene.add(motes);

  let time = 0, focusIdx = 1, camState = { x: 0, y: 1.9, z: 5.0 };
  function update(dt) {
    time += dt;
    for (const r of rigs) r.rig?.animator?.update?.(dt);
    motes.rotation.y = time * 0.02;
    moteMat.opacity = 0.42 + Math.sin(time * 0.8) * 0.12;
    // Focus light blooms on the selected pedestal; the others stay softly lit.
    rigs.forEach((r, i) => {
      const focused = i === focusIdx;
      r.spot.intensity += ((focused ? 4.2 : 1.6) - r.spot.intensity) * Math.min(1, dt * 5);
      r.pool.opacity += ((focused ? 0.8 : 0.5) - r.pool.opacity) * Math.min(1, dt * 5);
    });
    // Camera dollies in close, framing the focused creature right-of-center
    // so the info panel (left side) never covers it.
    const p = positions[focusIdx];
    const tx = p[0] * 0.62 - 0.6, tz = p[2] + 3.6, ty = 1.7;
    camState.x += (tx - camState.x) * Math.min(1, dt * 3.2);
    camState.z += (tz - camState.z) * Math.min(1, dt * 3.2);
    camState.y += (ty - camState.y) * Math.min(1, dt * 3.2);
    camera.position.set(camState.x, camState.y + Math.sin(time * 0.4) * 0.04, camState.z);
    camera.lookAt(p[0] - 0.6, 1.08, p[2]);
  }

  function dispose() {
    floorGeo.dispose(); floorMat.dispose();
    domeGeo.dispose(); domeMat.dispose();
    moteGeo.dispose(); moteMat.dispose();
    poolGeo.dispose(); poolTex.dispose();
    for (const m of poolMats) m.dispose();
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
    let prevMode = 'title';
    let ready = false;

    (async () => {
      try {
        const mod = await import('../data/creatures.js');
        SPECIES = mod.SPECIES ?? {};
      } catch (e) { console.warn('[starterUI] creature data unavailable yet', e); }
      handle = await buildScene();
      ready = true;
      prevMode = game.mode;
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
