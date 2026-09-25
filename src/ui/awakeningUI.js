// LUMENFALL — the Awakening cinematic. A full-screen overlay: rotating light
// rays and drifting motes (DOM) behind a dedicated 3D stage (one module-level
// renderer, reused across opens):
//   1. the Kindred as the player knows it, on a rune-ringed dais;
//   2. BUILD-UP — light spirals in, the rune ring and a pillar of light swell,
//      the body turns into a glowing light-form that pulses faster and faster;
//   3. FLASH — a white bloom + shockwave; the old form is gone;
//   4. REVEAL — the awakened form steps out of the light (light-form fading
//      back to its true colors) in a burst of motes, then the name caption.
// Freezing the player / pausing other systems is the CALLER's job (bagUI's
// stone flow, party.js) — this module only renders and resolves when dismissed.
//
// Export: showAwakening({ mon, fromId, toId }) -> Promise<void>
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { input } from '../core/input.js';
import { delay } from '../core/tween.js';
import { easeOutBack, easeOutCubic } from '../core/math.js';

const sfx = (name) => bus.emit('ui:sfx', { name });

// One viewport renderer, created lazily and REUSED for every awakening — a
// fresh WebGLRenderer per open risks browser context eviction. It lives for
// the module's lifetime (never disposed / never force-context-lost); per open
// we size it and move its canvas into the stage.
let _renderer = null;
function getRenderer() {
  if (!_renderer) {
    _renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    _renderer.outputColorSpace = THREE.SRGBColorSpace;
    _renderer.toneMapping = THREE.ACESFilmicToneMapping;
    _renderer.toneMappingExposure = 1.1;
    _renderer.setClearColor(0x000000, 0);
    _renderer.domElement.className = 'awk-canvas';
  }
  return _renderer;
}

let _speciesP = null;
const getSpecies = () =>
  (_speciesP ??= import('../data/creatures.js').then((m) => m.SPECIES ?? {}).catch(() => ({})));

/** Best-effort buildCreature — falls back to a small glowing wisp so the
 *  cinematic still plays if a species build throws. */
async function safeBuildCreature(speciesId) {
  try {
    const mod = await import('../creatures/registry.js');
    if (typeof mod.buildCreature !== 'function') throw new Error('registry.buildCreature missing');
    const built = mod.buildCreature(speciesId, {});
    if (!built?.group) throw new Error('buildCreature returned no group');
    return built;
  } catch (e) {
    console.warn(`[awakening] falling back to placeholder for "${speciesId}":`, e.message || e);
    return buildPlaceholder();
  }
}
function buildPlaceholder() {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.42, 3),
    new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffc978, emissiveIntensity: 0.7, roughness: 0.35 }),
  );
  mesh.position.y = 0.5;
  group.add(mesh);
  const animator = {
    play() {},
    update(dt) { mesh.rotation.y += dt * 0.7; mesh.position.y = 0.5 + Math.sin(performance.now() / 550) * 0.05; },
  };
  return { group, animator };
}

/** Uniformly scale + center a built group to a target height, feet at y=0. */
function fitAndCenter(group, targetHeight = 1.5) {
  const size = new THREE.Vector3();
  new THREE.Box3().setFromObject(group).getSize(size);
  const appliedScale = targetHeight / Math.max(0.05, Math.max(size.y, size.x * 0.7, size.z * 0.7));
  group.scale.setScalar(appliedScale);
  const center = new THREE.Vector3();
  new THREE.Box3().setFromObject(group).getCenter(center);
  group.position.x -= center.x;
  group.position.z -= center.z;
  return { centerY: center.y, appliedScale, height: size.y * appliedScale };
}

// ---- light-form: the body as glowing light (fresnel-edged, white-gold) ----
const LIGHTFORM_VERT = /* glsl */ `
  #include <common>
  varying vec3 vN; varying vec3 vV;
  void main() {
    #include <beginnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    #include <project_vertex>
    vN = normalize(transformedNormal);
    vV = normalize(-mvPosition.xyz);
  }`;
const LIGHTFORM_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uGlow; uniform float uPulse;
  varying vec3 vN; varying vec3 vV;
  void main() {
    float fres = pow(1.0 - clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 1.6);
    vec3 dark = vec3(0.05, 0.045, 0.08);
    vec3 col = mix(dark, uColor * 1.6, clamp(fres * (0.55 + uGlow) + uGlow * 0.85 + uPulse * 0.25, 0.0, 1.0));
    col += uColor * uGlow * uGlow * 0.9;
    gl_FragColor = vec4(col, 1.0);
  }`;

function makeLightform() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xffe6b0) }, uGlow: { value: 0 }, uPulse: { value: 0 } },
    vertexShader: LIGHTFORM_VERT, fragmentShader: LIGHTFORM_FRAG,
  });
}
/** Swap a group's lit materials for the light-form (and hide shadow discs /
 *  outline shells / transparent bits, which would read as slabs). */
function toLightform(group, mat) {
  group.traverse((o) => {
    if (!o.isMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    o.userData._origMat = o.material;
    o.userData._origVisible = o.visible;
    if (!m || m.transparent || m.isMeshBasicMaterial || m.side === THREE.BackSide || m.blending === THREE.AdditiveBlending) { o.visible = false; return; }
    o.material = mat;
  });
}
function fromLightform(group) {
  group.traverse((o) => {
    if (!o.isMesh || !o.userData._origMat) return;
    o.material = o.userData._origMat;
    o.visible = o.userData._origVisible ?? true;
    delete o.userData._origMat;
  });
}

function disposeMaterial(m) {
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap']) m[k]?.dispose?.();
  m.dispose?.();
}
function disposeGroup(group) {
  if (!group) return;
  const seen = new Set();
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    const mats = [].concat(o.material || [], o.userData?._origMat || []);
    for (const m of mats) { if (m && !seen.has(m)) { seen.add(m); disposeMaterial(m); } }
  });
}

function spawnMotes(container, n) {
  container.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const m = document.createElement('span');
    m.className = 'awk-mote';
    m.style.left = `${(Math.random() * 100).toFixed(1)}%`;
    m.style.animationDelay = `${(Math.random() * 4).toFixed(2)}s`;
    m.style.animationDuration = `${(4.5 + Math.random() * 3).toFixed(2)}s`;
    m.style.setProperty('--dx', `${(Math.random() * 44 - 22).toFixed(0)}px`);
    container.appendChild(m);
  }
}

function waitForConfirmClose(el) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      offC(); offI();
      el.removeEventListener('click', onClick);
      resolve();
    };
    const offC = input.onAction('confirm', finish);
    const offI = input.onAction('interact', finish);
    const onClick = () => finish();
    el.addEventListener('click', onClick);
  });
}

const TEMPLATE = `
  <div class="awk-rays awk-rays-a"></div>
  <div class="awk-rays awk-rays-b"></div>
  <div class="awk-motes"></div>
  <div class="awk-stage"></div>
  <div class="awk-flash"></div>
  <div class="awk-caption">
    <div class="awk-eyebrow">Awakening</div>
    <div class="awk-title"></div>
  </div>
  <div class="awk-hint hidden">Press Confirm to continue</div>
`;

// ---- the 3D stage -------------------------------------------------------
async function buildStage(width, height) {
  const K = await import('../battle/arenas.js');
  const { Particles } = await import('../gfx/particles.js');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.05, 60);
  const disposables = [];

  scene.add(new THREE.HemisphereLight(0x9aa8d8, 0x2a2438, 1.1));
  const key = new THREE.DirectionalLight(0xffe2b8, 2.2); key.position.set(2.2, 3.2, 2.6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xb9d3ff, 2.0); rim.position.set(-2.6, 2.0, -2.4); scene.add(rim);
  const glowLight = new THREE.PointLight(0xffd9a0, 0, 6, 2); glowLight.position.set(0, 0.9, 0.8); scene.add(glowLight);

  // dais: dark stone disc, soft light pool and a rune ring that wakes up
  const daisGeo = new THREE.CylinderGeometry(1.25, 1.4, 0.16, 48, 1);
  daisGeo.translate(0, -0.08, 0);
  const daisMat = new THREE.MeshStandardMaterial({ color: 0x3a3548, roughness: 0.8, metalness: 0.1 });
  const dais = new THREE.Mesh(daisGeo, daisMat);
  scene.add(dais);
  const runeMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const rune = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.018, 8, 96), runeMat);
  rune.rotation.x = Math.PI / 2; rune.position.y = 0.005;
  scene.add(rune);
  const poolMat = new THREE.MeshBasicMaterial({ map: K.glowTexture(), color: 0xffd9a0, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), poolMat);
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.01;
  scene.add(pool);
  const pillarMat = new THREE.SpriteMaterial({ map: K.glowTexture(), color: 0xffe6b8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const pillar = new THREE.Sprite(pillarMat);
  pillar.position.set(0, 1.2, 0); pillar.scale.set(1.2, 4.5, 1);
  scene.add(pillar);
  disposables.push(daisGeo, daisMat, rune.geometry, runeMat, pool.geometry, poolMat, pillarMat);

  const particles = new Particles(scene, { capacity: 1200 });
  particles.setViewHeight(height);
  return { scene, camera, key, rim, glowLight, runeMat, poolMat, pillarMat, pillar, particles, disposables };
}

export async function showAwakening({ mon, fromId, toId } = {}) {
  if (!fromId || !toId) { console.warn('[awakening] showAwakening called without fromId/toId'); return; }

  const root = document.createElement('div');
  root.className = 'awk-root';
  root.innerHTML = TEMPLATE;
  document.getElementById('ui-root').appendChild(root);
  spawnMotes(root.querySelector('.awk-motes'), 22);

  const SPECIES = await getSpecies();
  const fromName = (mon?.nickname || SPECIES[fromId]?.name || fromId || '???').toUpperCase();
  const toName = (SPECIES[toId]?.name || toId || '???').toUpperCase();
  const eyebrow = root.querySelector('.awk-eyebrow');
  const titleEl = root.querySelector('.awk-title');
  const flashEl = root.querySelector('.awk-flash');
  const hintEl = root.querySelector('.awk-hint');
  const stage = root.querySelector('.awk-stage');
  const caption = root.querySelector('.awk-caption');
  // Full-bleed stage; the caption sits in the lower third over it. (The
  // hint's pulse animation overrides the stylesheet's .hidden opacity, so it
  // is held back with visibility until the reveal.)
  stage.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border-radius:0;background:none;';
  caption.style.cssText = 'position:absolute;left:0;right:0;bottom:15vh;margin:0;z-index:3;';
  hintEl.style.cssText = 'position:absolute;left:0;right:0;bottom:9vh;margin:0;text-align:center;z-index:3;visibility:hidden;';
  eyebrow.style.cssText = 'text-shadow:0 2px 12px rgba(0,0,0,.8);';

  requestAnimationFrame(() => root.classList.add('in'));

  // ---- 3D: guarded end-to-end so a WebGL failure degrades to text-only.
  let renderer = null, raf = 0, onResize = null, fromGroup = null, toGroup = null, S = null, lightform = null;
  try {
    renderer = getRenderer();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const W = () => Math.max(320, stage.clientWidth || window.innerWidth);
    const H = () => Math.max(240, stage.clientHeight || window.innerHeight);
    renderer.setSize(W(), H(), false);
    stage.appendChild(renderer.domElement);
    S = await buildStage(W(), H());
    lightform = makeLightform();
    const { scene, camera, particles } = S;

    onResize = () => {
      renderer.setSize(W(), H(), false);
      camera.aspect = W() / H(); camera.updateProjectionMatrix();
      particles.setViewHeight(H());
    };
    window.addEventListener('resize', onResize);

    const cam = { y: 1.0, look: 0.75, dist: 6.2, orbit: 0 };
    let activeGroup = null, activeAnimator = null, last = performance.now();
    let pulse = 0, pulseRate = 0;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      cam.orbit += dt * 0.12;
      camera.position.set(Math.sin(cam.orbit) * cam.dist, cam.y, Math.cos(cam.orbit) * cam.dist);
      camera.lookAt(0, cam.look, 0);
      pulse += dt * pulseRate;
      lightform.uniforms.uPulse.value = pulseRate > 0 ? 0.5 + 0.5 * Math.sin(pulse) : 0;
      S.runeMat.opacity = Math.min(1, S.runeMat.opacity);
      S.pillar.material.opacity = Math.min(1, S.pillar.material.opacity);
      try { activeAnimator?.update?.(dt); } catch (e) { /* a bad model builder must not crash the reveal */ }
      particles.update(dt);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    // 1 — the Kindred as the player knows it
    const fromBuild = await safeBuildCreature(fromId);
    fromGroup = fromBuild.group;
    const fromInfo = fitAndCenter(fromGroup, 1.35);
    scene.add(fromGroup);
    activeGroup = fromGroup; activeAnimator = fromBuild.animator;
    try { fromBuild.animator?.play?.('idle'); } catch (e) { /* ignore */ }
    cam.look = fromInfo.height * 0.5; cam.y = fromInfo.height * 0.55 + 0.35;
    const center = { x: 0, y: fromInfo.height * 0.5, z: 0 };
    await delay(0.5);

    // 2 — build-up: light spirals in, the body becomes light, pulses quicken
    sfx('awaken');
    const gather = particles.ambient({ center: { x: 0, y: 0, z: 0 }, radius: 2.4, y0: 0.1, y1: 2.6, rate: 30, color: 0xffe9b0, color2: 0xffffff, size: 0.07, life: 0.9, vel: { x: 0, y: 0.6, z: 0 }, sway: 0.2, flicker: true });
    particles.flash({ at: center, color: 0xffffff, size: 1.2, sizeEnd: 2.4, life: 0.35, peak: 0.9 });
    toLightform(fromGroup, lightform);
    pulseRate = 6;
    const build = 1.5;
    const tb = performance.now();
    await new Promise((resolve) => {
      const step = () => {
        const k = Math.min(1, (performance.now() - tb) / (build * 1000));
        lightform.uniforms.uGlow.value = k * 0.9;
        pulseRate = 6 + k * 22;
        S.runeMat.opacity = 0.35 + k * 0.65;
        S.poolMat.opacity = 0.25 + k * 0.6;
        S.pillarMat.opacity = k * 0.75;
        S.pillar.scale.set(0.8 + k * 1.2, 3 + k * 3, 1);
        S.glowLight.intensity = k * 6;
        const s = fromInfo.appliedScale * (1 + Math.sin(pulse) * 0.03 * k);
        fromGroup.scale.setScalar(s);
        cam.dist = 6.2 - k * 1.2;
        if (Math.random() < 0.35) {
          const a = Math.random() * Math.PI * 2;
          particles.emitBurst({ at: { x: Math.cos(a) * 1.8, y: 0.2 + Math.random() * 2, z: Math.sin(a) * 1.8 }, count: 1, color: 0xffe9b0, size: 0.09, speed: 0.01, life: 0.5, gravity: 0, drag: 0 });
        }
        if (k < 1) requestAnimationFrame(step); else resolve();
      };
      step();
    });
    gather.stop();

    // 3 — flash: the old form is gone
    flashEl.classList.add('go');
    particles.flash({ at: center, color: 0xffffff, size: 1.5, sizeEnd: 6, life: 0.6, peak: 1 });
    particles.shockwave({ at: { x: 0, y: 0.02, z: 0 }, color: 0xffe9b0, radius: 5, life: 0.8, width: 0.08 });
    particles.shockwave({ at: center, color: 0xffffff, radius: 3.2, life: 0.55, width: 0.06, flat: false });
    await delay(0.16);
    scene.remove(fromGroup);
    activeGroup = null; activeAnimator = null;

    // 4 — the awakened form steps out of the light
    const toBuild = await safeBuildCreature(toId);
    toGroup = toBuild.group;
    const toInfo = fitAndCenter(toGroup, 1.6);
    toLightform(toGroup, lightform);
    lightform.uniforms.uGlow.value = 1;
    pulseRate = 0;
    scene.add(toGroup);
    activeGroup = toGroup; activeAnimator = toBuild.animator;
    try { toBuild.animator?.play?.('happy'); } catch (e) { /* ignore */ }
    const top = { x: 0, y: toInfo.height * 0.55, z: 0 };
    particles.emitFountain({ at: { x: 0, y: 0.1, z: 0 }, count: 90, color: 0xffe9b0, color2: 0xffffff, size: 0.09, life: 1.6, speed: 4.2, spread: 1.0, gravity: 2.2, flicker: true });
    particles.emitSparks({ at: top, count: 36, color: 0xffe9b0, color2: 0xffffff, size: 0.07, speed: 7, life: 0.5, gravity: 1, drag: 2 });
    const popStart = performance.now();
    await new Promise((resolve) => {
      const step = () => {
        const k = Math.min(1, (performance.now() - popStart) / 900);
        const s = Math.max(0.001, easeOutBack(Math.min(1, k * 1.4)));
        toGroup.scale.setScalar(s * toInfo.appliedScale);
        cam.look = 0.75 * toInfo.height * 0.66 + 0.25 * cam.look;
        cam.y = toInfo.height * 0.5 + 0.35;
        cam.dist = 5.0 + easeOutCubic(k) * 0.9;
        S.pillarMat.opacity = 0.75 * (1 - k);
        S.glowLight.intensity = 6 * (1 - k) + 1.2;
        if (k < 1) requestAnimationFrame(step); else resolve();
      };
      step();
    });
    // light-form melts back into true colors
    const meltStart = performance.now();
    await new Promise((resolve) => {
      const step = () => {
        const k = Math.min(1, (performance.now() - meltStart) / 450);
        lightform.uniforms.uGlow.value = 1 - k * 0.6;
        if (k < 1) requestAnimationFrame(step); else resolve();
      };
      step();
    });
    particles.flash({ at: top, color: 0xfff2d0, size: 1.0, sizeEnd: 2.8, life: 0.35, peak: 0.8 });
    fromLightform(toGroup);
    particles.ambient({ center: { x: 0, y: 0, z: 0 }, radius: 1.6, y0: 0.2, y1: 2.2, rate: 7, color: 0xffe9b0, color2: 0xfff8dc, size: 0.06, life: 2.4, vel: { x: 0, y: 0.35, z: 0 }, sway: 0.8, flicker: true });
    delay(1.1).then(() => { try { toBuild.animator?.play?.('idle'); } catch (e) { /* ignore */ } });
  } catch (e) {
    console.warn('[awakening] 3D preview unavailable, showing text-only reveal', e);
    stage.classList.add('hidden');
  }

  // ---- caption reveal (runs regardless of whether 3D succeeded) -----------
  eyebrow.classList.add('fade');
  titleEl.textContent = `${fromName} awakened into ${toName}!`;
  root.classList.add('revealed');
  await delay(0.5);
  hintEl.style.visibility = 'visible';
  hintEl.classList.remove('hidden');

  await delay(0.4); // guard against an already-queued confirm press skipping instantly
  await waitForConfirmClose(root);

  // ---- teardown -------------------------------------------------------
  root.classList.remove('in');
  root.classList.add('out');
  await delay(0.45);
  if (raf) cancelAnimationFrame(raf);
  if (onResize) window.removeEventListener('resize', onResize);
  disposeGroup(fromGroup);
  disposeGroup(toGroup);
  lightform?.dispose();
  if (S) {
    S.particles.dispose();
    for (const d of S.disposables) d.dispose?.();
  }
  renderer?.domElement.remove(); // renderer itself stays alive for reuse
  root.remove();
}
