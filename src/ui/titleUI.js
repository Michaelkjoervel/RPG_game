// LUMENFALL — Title screen.
// Live 3D vignette (dusk glade, glow trees, fireflies, the three starters idling around a
// shard crystal, slow drifting camera) behind a DOM menu shell: New Journey / Continue /
// Settings. showTitle(game) resolves once play actually begins (new game intro started, or
// a save was loaded and the overworld entered) — main.js awaits it once, at boot.
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { G } from '../core/state.js';
import { input } from '../core/input.js';
import { hasAnySave } from '../core/save.js';
import { TAU } from '../core/math.js';
import { hashStr, seededRandom } from '../core/rng.js';
// Side-effect import: registers the pause-hub's global 'menu' input listener. titleUI is
// the one ui-menus module guaranteed to load at boot (main.js awaits showTitle immediately),
// so this is where the hub's Esc/Tab handler gets wired up without touching main.js.
import './menus.js';

const sfx = (name) => bus.emit('ui:sfx', { name });
const STARTERS = ['kindlet', 'nixling', 'thistlit'];

// ---------------------------------------------------------------------------
// 3D vignette scene — self-contained, disposed on teardown.
// ---------------------------------------------------------------------------
function buildFireflies(count, radius) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const rng = seededRandom(hashStr('title-fireflies'));
  for (let i = 0; i < count; i++) {
    const a = rng() * TAU, r = Math.sqrt(rng()) * radius;
    pos[i * 3 + 0] = Math.cos(a) * r;
    pos[i * 3 + 1] = 0.3 + rng() * 2.6;
    pos[i * 3 + 2] = Math.sin(a) * r;
    seed[i] = rng() * TAU;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xffe9b0) } },
    vertexShader: `
      attribute float aSeed;
      uniform float uTime;
      varying float vFlicker;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.35 + aSeed) * 0.5;
        p.z += cos(uTime * 0.28 + aSeed * 1.7) * 0.5;
        p.y += sin(uTime * 0.6 + aSeed * 2.3) * 0.25;
        vFlicker = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 2.2 + aSeed * 6.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (140.0 / -mv.z) * (0.6 + vFlicker * 0.5);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vFlicker;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv) * 2.0;
        float a = smoothstep(1.0, 0.0, d) * vFlicker;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  return new THREE.Points(geo, mat);
}

function buildGlowTree(rng) {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.9, flatShading: true });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 1.1, 6), trunkMat);
  trunk.position.y = 0.55;
  g.add(trunk);
  const canopy = new THREE.Group();
  canopy.position.y = 1.15;
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x3f6b52, emissive: 0x5b4a8a, emissiveIntensity: 0.22, roughness: 0.75, flatShading: true,
  });
  const fruitMat = new THREE.MeshStandardMaterial({
    color: 0xffe9b0, emissive: 0xffb85c, emissiveIntensity: 1.4, roughness: 0.4, flatShading: true,
  });
  for (let i = 0; i < 3; i++) {
    const s = 0.62 - i * 0.13;
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), leafMat);
    blob.position.set((rng() - 0.5) * 0.25, i * 0.42, (rng() - 0.5) * 0.25);
    blob.rotation.set(rng() * TAU, rng() * TAU, rng() * TAU);
    canopy.add(blob);
  }
  for (let i = 0; i < 4; i++) {
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), fruitMat);
    const a = rng() * TAU, r = 0.4 + rng() * 0.2;
    fruit.position.set(Math.cos(a) * r, rng() * 0.7, Math.sin(a) * r);
    canopy.add(fruit);
  }
  g.add(canopy);
  g.userData.canopy = canopy;
  g.userData.sway = rng() * TAU;
  return g;
}

async function buildScene() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x241f38, 0.045);

  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);

  // Ground: soft dusk gradient disc, vertex-colored.
  const groundGeo = new THREE.CircleGeometry(16, 48);
  const colorA = new THREE.Color(0x362a52), colorB = new THREE.Color(0x1a1730);
  const posAttr = groundGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i), y = posAttr.getY(i);
    const d = Math.min(1, Math.hypot(x, y) / 16);
    const c = colorA.clone().lerp(colorB, d);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  // Trees ringing the clearing.
  const rng = seededRandom(hashStr('title-trees'));
  const trees = [];
  const treeCount = 7;
  for (let i = 0; i < treeCount; i++) {
    const t = buildGlowTree(rng);
    const a = (i / treeCount) * TAU + rng() * 0.3;
    const r = 8.5 + rng() * 3.5;
    t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    t.rotation.y = rng() * TAU;
    const sc = 0.85 + rng() * 0.5;
    t.scale.setScalar(sc);
    t.castShadow = true;
    scene.add(t);
    trees.push(t);
  }

  // Shard crystal centerpiece.
  const crystalGroup = new THREE.Group();
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0xffe9b0, emissive: 0xffd166, emissiveIntensity: 1.1, metalness: 0.15, roughness: 0.2, flatShading: true,
  });
  const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), crystalMat);
  crystal.position.y = 1.0;
  crystal.castShadow = true;
  crystalGroup.add(crystal);
  const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xffe9b0, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glowSprite.scale.setScalar(2.4);
  glowSprite.position.y = 1.0;
  crystalGroup.add(glowSprite);
  scene.add(crystalGroup);

  // Fireflies.
  const fireflies = buildFireflies(46, 11);
  scene.add(fireflies);

  // Lighting: dusk key + cool hemisphere + crystal point light.
  const hemi = new THREE.HemisphereLight(0x6a6fae, 0x141020, 0.65);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xb69cff, 0.55);
  key.position.set(-6, 8, 4);
  scene.add(key);
  const crystalLight = new THREE.PointLight(0xffd166, 1.6, 9, 2);
  crystalLight.position.set(0, 1.3, 0);
  scene.add(crystalLight);

  // Starters idling around the crystal.
  const starterRigs = [];
  try {
    const { buildCreature } = await import('../creatures/registry.js');
    STARTERS.forEach((id, i) => {
      const a = (i / STARTERS.length) * TAU - Math.PI / 2;
      const r = 2.3;
      const { group, animator } = buildCreature(id);
      group.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      group.lookAt(0, 0, 0);
      group.castShadow = true;
      group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      animator.play?.('idle');
      scene.add(group);
      starterRigs.push({ group, animator });
    });
  } catch (e) {
    console.warn('[titleUI] starter models unavailable yet', e);
  }

  let time = 0, camAngle = 0.4;
  const camR = 6.4, camH = 3.0;
  function update(dt) {
    time += dt;
    camAngle += dt * 0.032;
    camera.position.set(Math.sin(camAngle) * camR, camH + Math.sin(time * 0.15) * 0.18, Math.cos(camAngle) * camR);
    camera.lookAt(0, 1.05, 0);
    crystalGroup.rotation.y += dt * 0.22;
    const pulse = 1 + Math.sin(time * 1.6) * 0.05;
    crystal.scale.setScalar(pulse);
    crystalLight.intensity = 1.4 + Math.sin(time * 1.6) * 0.3;
    glowSprite.material.opacity = 0.28 + Math.sin(time * 1.6) * 0.08;
    fireflies.material.uniforms.uTime.value = time;
    for (const t of trees) t.userData.canopy.rotation.z = Math.sin(time * 0.6 + t.userData.sway) * 0.05;
    for (const s of starterRigs) s.animator.update?.(dt);
  }

  function dispose() {
    groundGeo.dispose(); groundMat.dispose();
    for (const t of trees) {
      t.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    }
    crystal.geometry.dispose(); crystalMat.dispose();
    glowSprite.material.map?.dispose(); glowSprite.material.dispose();
    fireflies.geometry.dispose(); fireflies.material.dispose();
    for (const s of starterRigs) {
      s.group.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose()); } });
    }
  }

  return { scene, camera, update, dispose };
}

// ---------------------------------------------------------------------------
// DOM shell
// ---------------------------------------------------------------------------
const MENU_ITEMS = [
  { id: 'new', label: 'New Journey' },
  { id: 'continue', label: 'Continue' },
  { id: 'settings', label: 'Settings' },
];

export function showTitle(game) {
  return new Promise((resolve) => {
    let resolved = false;
    let idx = 0;
    let modalOpen = false;
    const unsubs = [];

    const root = document.createElement('div');
    root.className = 'title-root';
    root.innerHTML = `
      <div class="title-vignette"></div>
      <div class="title-wrap">
        <div class="title-badge"><span class="title-star">&#10022;</span></div>
        <h1 class="title-logo">LUMENFALL</h1>
        <div class="title-tagline">an original Kindred RPG &mdash; the world is dreaming</div>
        <nav class="title-menu"></nav>
      </div>
      <div class="title-version">v1.0</div>
    `;
    document.getElementById('ui-root').appendChild(root);
    const menuEl = root.querySelector('.title-menu');

    const disabled = (id) => id === 'continue' && !hasAnySave();

    MENU_ITEMS.forEach((item, i) => {
      const b = document.createElement('button');
      b.className = 'title-item';
      b.dataset.id = item.id;
      b.innerHTML = `<span class="title-item-mark">&#9656;</span><span class="title-item-label"></span>`;
      b.querySelector('.title-item-label').textContent = item.label;
      b.disabled = disabled(item.id);
      b.addEventListener('pointerenter', () => { if (!modalOpen && !b.disabled) setFocus(i); });
      b.addEventListener('click', () => { if (!modalOpen && !b.disabled) { setFocus(i); activate(item.id); } });
      menuEl.appendChild(b);
    });

    function nextEnabled(from, dir) {
      let i = from;
      for (let n = 0; n < MENU_ITEMS.length; n++) {
        i = (i + dir + MENU_ITEMS.length) % MENU_ITEMS.length;
        if (!disabled(MENU_ITEMS[i].id)) return i;
      }
      return from;
    }

    function setFocus(i) {
      idx = i;
      [...menuEl.children].forEach((el, j) => el.classList.toggle('focused', j === i));
    }

    // Skip past a disabled Continue at boot.
    idx = disabled(MENU_ITEMS[0].id) ? nextEnabled(0, 1) : 0;
    setFocus(idx);

    function moveFocus(dir) {
      if (modalOpen) return;
      sfx('ui_move');
      setFocus(nextEnabled(idx, dir));
    }
    function confirmFocus() {
      if (modalOpen) return;
      const item = MENU_ITEMS[idx];
      if (disabled(item.id)) return;
      activate(item.id);
    }

    unsubs.push(input.onAction('up', () => moveFocus(-1)));
    unsubs.push(input.onAction('down', () => moveFocus(1)));
    unsubs.push(input.onAction('confirm', confirmFocus));
    unsubs.push(input.onAction('interact', confirmFocus));

    // ---- Name entry modal ----
    function openNameModal() {
      return new Promise((res) => {
        modalOpen = true;
        sfx('ui_open');
        const scrim = document.createElement('div');
        scrim.className = 'modal-scrim';
        scrim.innerHTML = `
          <div class="name-modal panel">
            <div class="name-modal-title gold-title">Who walks the Reach?</div>
            <input class="name-input" maxlength="12" spellcheck="false" autocomplete="off" />
            <div class="name-hint">Your Warden name &mdash; up to 12 characters</div>
            <div class="modal-actions">
              <button class="btn-ghost" data-act="cancel">Back</button>
              <button class="btn-gold" data-act="confirm">Begin</button>
            </div>
          </div>
        `;
        root.appendChild(scrim);
        const inputEl = scrim.querySelector('.name-input');
        inputEl.value = G.playerName || 'Rowan';
        requestAnimationFrame(() => { inputEl.focus(); inputEl.select(); });
        const close = (name) => {
          modalOpen = false;
          scrim.classList.add('out');
          sfx('ui_close');
          setTimeout(() => scrim.remove(), 220);
          res(name);
        };
        scrim.querySelector('[data-act="cancel"]').addEventListener('click', () => close(null));
        scrim.querySelector('[data-act="confirm"]').addEventListener('click', () => {
          sfx('ui_confirm');
          close(inputEl.value.trim() || 'Rowan');
        });
        inputEl.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') { sfx('ui_confirm'); close(inputEl.value.trim() || 'Rowan'); }
          if (e.key === 'Escape') close(null);
        });
        scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) close(null); });
      });
    }

    async function activate(id) {
      if (id === 'new') {
        sfx('ui_confirm');
        const name = await openNameModal();
        if (!name) return;
        G.playerName = name;
        await teardown();
        const { startNewGame } = await import('../game/story.js');
        await startNewGame(game);
        finish();
      } else if (id === 'continue') {
        sfx('ui_confirm');
        modalOpen = true;
        const { showLoadMenu } = await import('./saveUI.js');
        const slot = await showLoadMenu();
        modalOpen = false;
        if (slot == null) return;
        const { loadGame } = await import('../core/save.js');
        if (loadGame(slot)) {
          await teardown();
          await game.enterOverworld(G.pos.zone, [G.pos.x, G.pos.z]);
          finish();
        } else {
          bus.emit('notify', { text: 'That save could not be read.' });
        }
      } else if (id === 'settings') {
        sfx('ui_confirm');
        modalOpen = true;
        const { showSettings } = await import('./settingsUI.js');
        await showSettings();
        modalOpen = false;
      }
    }

    let sceneHandle = null;
    let torndown = false;
    (async () => {
      const handle = await buildScene();
      if (torndown) { handle.dispose(); return; }
      sceneHandle = handle;
      game.mode = 'title';
      game.setScene(sceneHandle);
    })();

    async function teardown() {
      torndown = true;
      unsubs.forEach((off) => off());
      root.classList.add('out');
      await new Promise((r) => setTimeout(r, 260));
      root.remove();
      sceneHandle?.dispose();
      sceneHandle = null;
    }

    function finish() {
      if (resolved) return;
      resolved = true;
      resolve();
    }
  });
}
