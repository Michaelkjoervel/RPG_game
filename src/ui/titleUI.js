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
import { pushLayer } from './uiStack.js';
// Side-effect import: registers the pause-hub's global 'menu' input listener. titleUI is
// the one ui-menus module guaranteed to load at boot (main.js awaits showTitle immediately),
// so this is where the hub's Esc/Tab handler gets wired up without touching main.js.
import './menus.js';

const sfx = (name) => bus.emit('ui:sfx', { name });
const STARTERS = ['kindlet', 'nixling', 'thistlit'];

// ---------------------------------------------------------------------------
// 3D hero shot — dusk over a flowering hill: the starter trio in the warm
// last light (each trailing motes of its own aspect), swaying grass and
// flowers in the foreground, a soft framing tree, layered hazy ridges and a
// glowing horizon under a deep indigo sky that keeps the gold logo crisp.
// Built from the shared stage kit (battle/arenas.js); disposed on teardown.
// ---------------------------------------------------------------------------
const SUN_DIR = new THREE.Vector3(-0.72, 0.05, -1).normalize();
const smooth01 = (t) => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };

// Soft cumulus puff texture (canvas) for billboard clouds.
function makeCloudTexture(seed = 11) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  const rng = seededRandom(seed);
  for (let i = 0; i < 16; i++) {
    const x = 40 + rng() * 176, y = 70 + (rng() - 0.5) * 28 - Math.sin((x / 256) * Math.PI) * 26;
    const r = 18 + rng() * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildStars(count, rng) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = -Math.PI * 0.95 + rng() * Math.PI * 0.9; // the sky ahead of the camera
    const el = 0.16 + Math.pow(rng(), 0.7) * 0.9;
    const r = 300;
    pos[i * 3] = Math.cos(el) * Math.sin(a) * r;
    pos[i * 3 + 1] = Math.sin(el) * r;
    pos[i * 3 + 2] = -Math.cos(el) * Math.cos(a) * r;
    seed[i] = rng() * TAU;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float aSeed; uniform float uTime; varying float vA;
      void main() {
        vA = (0.45 + 0.55 * sin(uTime * 1.3 + aSeed * 7.0)) * smoothstep(40.0, 160.0, position.y);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 2.2 + fract(aSeed * 3.7) * 2.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(vec3(1.0, 0.96, 0.88), smoothstep(1.0, 0.0, d) * vA); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -900;
  return pts;
}

async function buildScene(game) {
  const K = await import('../battle/arenas.js');
  const MAT = await import('../gfx/materials.js');
  const { Particles } = await import('../gfx/particles.js');
  const scene = new THREE.Scene();
  const disposables = [];
  const track = (o) => { o.traverse?.((m) => { if (m.geometry) disposables.push(m.geometry); if (m.material) disposables.push(m.material); }); return o; };
  const q = K.stageQuality();

  // ---- sky: indigo zenith -> rose -> gold horizon, sun just setting left
  const dome = K.stageSkyDome({
    top: 0x1c2358, mid: 0x7a4f86, horizon: 0xffb477, bottom: 0x3a3048,
    sun: 0xffc27a, sunDir: SUN_DIR.toArray(), sunAmt: 1.35, glow: 1.25, radius: 420,
  });
  scene.add(track(dome));
  const fogColor = new THREE.Color(0xb08aa0);
  scene.fog = new THREE.FogExp2(fogColor, 0.0095);
  scene.background = new THREE.Color(0x2a2a52);
  const stars = buildStars(q === 0 ? 70 : 150, seededRandom(hashStr('title-stars')));
  scene.add(track(stars));

  // Clouds: warm-bellied puffs catching the last light.
  const cloudTex = makeCloudTexture();
  disposables.push(cloudTex);
  const clouds = [];
  const crng = seededRandom(hashStr('title-clouds'));
  for (let i = 0; i < 7; i++) {
    const m = new THREE.SpriteMaterial({ map: cloudTex, color: i < 3 ? 0xffc9a8 : 0xd8a6b8, transparent: true, opacity: 0.55 + crng() * 0.25, depthWrite: false, fog: false });
    const s = new THREE.Sprite(m);
    const x = (crng() - 0.45) * 420, y = 42 + crng() * 70, z = -230 - crng() * 90;
    s.position.set(x, y, z);
    s.scale.set(150 + crng() * 120, 50 + crng() * 34, 1);
    s.renderOrder = -800;
    scene.add(s);
    disposables.push(m);
    clouds.push({ s, speed: 0.6 + crng() * 0.8, x0: x });
  }

  // ---- ground: a flowering hilltop plateau that falls away into the valley
  const PLATEAU = 0.15;
  const heightAt = (x, z) => {
    const edge = smooth01((1.5 - z) / 9);                 // 0 on the hilltop, 1 down in the valley
    const drop = -edge * (2.4 + 1.6 * K.fbm2(x * 0.03, z * 0.03, 5));
    const hills = Math.max(0, (-z - 45) / 95) * (3 + 14 * K.fbm2(x * 0.012 + 3, z * 0.012, 8));
    return PLATEAU + drop + hills + (1 - edge) * 0.08 * K.fbm2(x * 0.4, z * 0.4, 2);
  };
  const groundMat = K.stageGroundMaterial({
    a: 0x5f8a36, b: 0x86ad48, c: 0xc8b85e, dirt: 0x8a7050, far: 0x8a7a98, hill: 0x5f7a52,
    marks: [99, 99, 99, 99], worn: [0.1, 0.1, 0, 0], farR: [16, 110, 0.75], hillR: [8, 40, 0.45],
  });
  const groundGeo = K.buildStageGround(heightAt, { radius: 200, inner: 14, step: q === 0 ? 1 : 0.6, segs: 128 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  scene.add(track(ground));

  // The trio's spots (camera sits 1 m above them, 3.6-4.4 m back; heads land
  // just under the menu, feet near the bottom edge).
  const SPOTS = { kindlet: [-1.38, 4.2, 0.5], nixling: [0, 4.85, 0], thistlit: [1.38, 4.2, -0.5] };
  const nearSpot = (x, z) => Math.min(...Object.values(SPOTS).map(([sx, sz]) => Math.hypot(x - sx, z - sz)));

  // grass and flowers: short in front of the lens, lush on the hilltop
  const grass = K.buildGrass({
    count: 5200, base: 0x4a6a2a, tipA: 0xc0d270, tipB: 0xe0cc72, h: 0.32, seed: 21, r0: 0, r1: 24,
    center: [0, 2], heightAt,
    accept: (x, z) => (Math.hypot(x, z - 8.4) < 1.6 ? 0 : nearSpot(x, z) < 0.5 ? 0.25 : z > -6 ? 1 : 0.4),
    scaleAt: (x, z) => (nearSpot(x, z) < 0.9 ? 0.6 : z > 6 ? 0.8 : 1),
  });
  scene.add(track(grass));
  const flowers = K.buildFlowers({
    count: 240, colors: [0xfff4f8, 0xffd94f, 0xff9fb0, 0xc9b0ff, 0xffffff], seed: 5, r0: 0.5, r1: 16, heightAt,
    accept: (x, z) => (Math.hypot(x, z - 8.4) < 1.8 || nearSpot(x, z) < 0.6 ? 0 : z > -8 ? 1 : 0),
  });
  scene.add(track(flowers));

  // soft trees framing the valley on both sides (midground, never a dark lump)
  const treeGeo = K.softTreeGeometry({ seed: 3, h: 4.6, crown: 2.3, lobes: 7, leafLo: 0x35502e, leafHi: 0xd0c070, trunk: 0x4a3424, trunkTop: 0x7a5a3c });
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  try { MAT.windSway(treeMat, { strength: 0.22, speed: 0.9, heightScale: 8 }); } catch (e) { /* static */ }
  MAT.applyLook?.(treeMat, { rim: 1 });
  const TREES = [[-9.5, -3.5, 1.25, 0.4], [-12.5, -9, 1.05, 2.3], [10.5, -6, 1.3, 1.9], [14, -12, 1.0, 3.1], [-20, -24, 1.2, 1.2], [22, -28, 1.1, 0.8]];
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, TREES.length);
  const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), ts = new THREE.Vector3(), tp = new THREE.Vector3(), te = new THREE.Euler();
  TREES.forEach(([x, z, sc, ry], i) => {
    tm.compose(tp.set(x, heightAt(x, z) - 0.1, z), tq.setFromEuler(te.set(0, ry, 0)), ts.set(sc, sc, sc));
    trees.setMatrixAt(i, tm);
  });
  trees.castShadow = true; trees.receiveShadow = true;
  scene.add(track(trees));

  // tree line + two ridges of hazy hills beyond the valley
  const tlRng = seededRandom(hashStr('title-treeline'));
  const tlItems = [];
  for (let i = 0; i < 90; i++) {
    const x = (tlRng() - 0.5) * 220, z = -48 - tlRng() * 40;
    const s = 2.2 + tlRng() * 2.8;
    tlItems.push({ x, y: heightAt(x, z) + s * 0.8, z, sx: s, sy: s * 1.2, sz: s, ry: tlRng() * TAU });
  }
  scene.add(track(K.buildBlobField(tlItems, { lo: 0x2c3a38, hi: 0x6a7a52, detail: 1, seed: 6 })));
  scene.add(track(K.buildRidges({ r: 150, hMin: 4, hMax: 18, base: -8, cLo: 0x5f5a88, cHi: 0x76689a, seed: 7, freq: 6 })));
  scene.add(track(K.buildRidges({ r: 250, hMin: 14, hMax: 44, base: -10, cLo: 0x7a6aa0, cHi: 0x8e78ac, seed: 15, freq: 8, sharp: 0.7 })));

  // a lumen shard glowing on the far hill — the world's dreaming light
  const glowTex = K.glowTexture();
  const shard = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffd88a, emissiveIntensity: 2.2, roughness: 0.3, flatShading: true }));
  shard.scale.set(0.8, 1.6, 0.8);
  const shardPos = new THREE.Vector3(24, heightAt(24, -70) + 3.5, -70);
  shard.position.copy(shardPos);
  scene.add(track(shard));
  const shardGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd9a0, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  shardGlow.position.copy(shardPos);
  shardGlow.scale.setScalar(16);
  scene.add(shardGlow);
  disposables.push(shardGlow.material);

  // ---- lights: warm low sun behind-left, cool sky, soft front fill
  const hemi = new THREE.HemisphereLight(0x8a86d8, 0x6a5a38, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb070, 2.6);
  sun.position.copy(SUN_DIR).multiplyScalar(30).setY(9);
  sun.target.position.set(0, 0.4, 3);
  if (q > 0) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 5, far: 70 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.03;
  }
  scene.add(sun, sun.target);
  const front = new THREE.DirectionalLight(0xffe2cc, 0.85);
  front.position.set(4, 5, 12);
  front.target.position.set(0, 0.5, 3);
  scene.add(front, front.target);

  // ---- camera: low on the hill, looking out over the valley
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 900);
  const camBase = new THREE.Vector3(0, PLATEAU + 1.0, 8.4);
  const camLook = new THREE.Vector3(0, PLATEAU + 1.0 + Math.tan(0.018) * 20, -11.6);

  // ---- the starter trio, just below the menu, each with its own motes
  const particles = new Particles(scene, { capacity: 900 });
  const AURA = {
    kindlet: { color: 0xff8a3c, color2: 0xffd27a, vel: { x: 0, y: 0.5, z: 0 }, size: 0.05, flicker: true },
    nixling: { color: 0x7fc8ff, color2: 0xe0f4ff, vel: { x: 0, y: 0.32, z: 0 }, size: 0.05, flicker: false },
    thistlit: { color: 0xa8e07a, color2: 0xfff6b0, vel: { x: 0.08, y: 0.18, z: 0 }, size: 0.05, flicker: true },
  };
  const starterRigs = [];
  try {
    const { buildCreature } = await import('../creatures/registry.js');
    for (const id of STARTERS) {
      const [x, z, turn] = SPOTS[id];
      const { group, animator } = buildCreature(id);
      group.position.set(x, heightAt(x, z), z);
      // face the camera, turned slightly toward each other
      group.rotation.y = Math.atan2(camBase.x - x, camBase.z - z) + turn;
      group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      animator.play?.('idle');
      scene.add(group);
      const a = AURA[id];
      const h = particles.ambient({ center: { x, y: 0, z }, radius: 0.55, y0: PLATEAU + 0.1, y1: PLATEAU + 0.85, rate: 5, color: a.color, color2: a.color2, size: a.size, life: 1.8, vel: a.vel, sway: 0.5, flicker: a.flicker });
      starterRigs.push({ group, animator, h });
    }
  } catch (e) {
    console.warn('[titleUI] starter models unavailable yet', e);
  }
  // valley motes: fireflies waking in the dusk
  const motes = particles.ambient({ center: { x: 0, y: 0, z: 1 }, radius: 9, y0: 0.3, y1: 3.2, rate: q === 0 ? 3 : 6, color: 0xffe9b0, color2: 0xffc97a, size: 0.07, life: 5, vel: { x: 0.06, y: 0.12, z: 0 }, sway: 0.9, flicker: true });

  // Same screen grade as the rest of the game (plain render on Low).
  let fx = null;
  try {
    const { applyAtmosphere } = await import('../gfx/postfx.js');
    if (game?.renderer) fx = applyAtmosphere(game.renderer, scene, camera);
  } catch (e) { fx = null; }

  let time = 0;
  function update(dt) {
    time += dt;
    try { MAT.tickWind?.(dt); } catch (e) { /* static */ }
    // slow breathing drift: the view floats a hand's width side to side
    camera.position.set(camBase.x + Math.sin(time * 0.11) * 0.18, camBase.y + Math.sin(time * 0.17) * 0.04, camBase.z + Math.sin(time * 0.07) * 0.12);
    camera.lookAt(camLook.x + Math.sin(time * 0.09) * 0.25, camLook.y, camLook.z);
    for (const c of clouds) c.s.position.x = c.x0 + Math.sin(time * 0.01 * c.speed) * 30 + time * c.speed * 0.4;
    stars.material.uniforms.uTime.value = time;
    shardGlow.material.opacity = 0.7 + Math.sin(time * 1.3) * 0.12;
    shard.rotation.y = time * 0.3;
    particles.update(dt);
    for (const s of starterRigs) s.animator.update?.(dt);
  }

  function dispose() {
    try { fx?.dispose(); } catch (e) { /* ignore */ }
    particles.dispose();
    for (const d of disposables) { d.userData?.unregisterSway?.(); d.dispose?.(); }
    trees.dispose?.();
    for (const s of starterRigs) {
      s.group.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose()); } });
    }
  }

  return {
    scene, camera, update, dispose,
    render(renderer) { if (fx) fx.render(); else renderer.render(scene, camera); },
  };
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
    // A lighter frame than the stylesheet's: the hero shot must read to the
    // corners, with just enough dusk behind the logo and menu for the gold.
    const vig = root.querySelector('.title-vignette');
    if (vig) vig.style.background = [
      'radial-gradient(ellipse 46% 30% at 50% 35%, rgba(10,10,28,0.32) 0%, rgba(10,10,28,0) 100%)',
      'radial-gradient(ellipse 22% 18% at 50% 64%, rgba(10,10,24,0.28) 0%, rgba(10,10,24,0) 100%)',
      'radial-gradient(ellipse at 50% 45%, rgba(11,12,20,0) 58%, rgba(11,12,20,0.38) 100%)',
    ].join(',');
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
            <div class="name-hint">Your Warden name &mdash; up to 12 characters &middot; gamepad: [A] Accept</div>
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
        let closed = false;
        const close = (name) => {
          if (closed) return;
          closed = true;
          offPad.forEach((f) => f());
          popLayer();
          modalOpen = false;
          scrim.classList.add('out');
          sfx('ui_close');
          setTimeout(() => scrim.remove(), 220);
          res(name);
        };
        const accept = () => { sfx('ui_confirm'); close(inputEl.value.trim() || 'Rowan'); };
        scrim.querySelector('[data-act="cancel"]').addEventListener('click', () => close(null));
        scrim.querySelector('[data-act="confirm"]').addEventListener('click', accept);
        inputEl.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') accept();
          if (e.key === 'Escape') close(null);
        });
        scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) close(null); });
        // Gamepad path — the text input never blocks a pad. Typing swallows its
        // own keys (stopPropagation above), so these only see pad buttons (or
        // Enter while the field is unfocused): [A]/confirm accepts the current
        // (default) name, [B]/cancel backs out.
        const offPad = [
          input.onAction('confirm', accept),
          input.onAction('cancel', () => close(null)),
        ];
        const popLayer = pushLayer('name-entry', () => close(null));
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
      let handle;
      try { handle = await buildScene(game); }
      catch (e) {
        // The menu is DOM and keeps working; only the backdrop is lost.
        console.error('[titleUI] title scene failed to build', e);
        if (!torndown) game.mode = 'title';
        return;
      }
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
