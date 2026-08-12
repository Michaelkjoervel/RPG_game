// LUMENFALL — the Awakening cinematic. Fullscreen overlay: rotating light rays,
// drifting motes, a small dedicated 3D viewport (one module-level renderer,
// reused across opens) showing the pre-awakening silhouette flash into the
// fully-revealed awakened form, then a serif name reveal. Freezing the player /
// pausing other
// systems is the CALLER's job (story.js, bagUI's stone-use flow, party.js) —
// this module only renders and resolves when dismissed.
//
// Export: showAwakening({ mon, fromId, toId }) -> Promise<void>
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { G } from '../core/state.js';
import { input } from '../core/input.js';
import { delay } from '../core/tween.js';
import { easeOutBack } from '../core/math.js';

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
    _renderer.domElement.className = 'awk-canvas';
  }
  return _renderer;
}

let _speciesP = null;
const getSpecies = () =>
  (_speciesP ??= import('../data/creatures.js').then((m) => m.SPECIES ?? {}).catch(() => ({})));

/** Best-effort buildCreature — creatures/registry.js is built by a parallel
 * agent; if it isn't ready yet (or a species build throws) we fall back to a
 * small glowing placeholder wisp so the cinematic still plays. */
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
    new THREE.IcosahedronGeometry(0.42, 1),
    new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffc978, emissiveIntensity: 0.7, roughness: 0.35, flatShading: true })
  );
  mesh.position.y = 0.5;
  group.add(mesh);
  const animator = {
    play() {},
    update(dt) { mesh.rotation.y += dt * 0.7; mesh.position.y = 0.5 + Math.sin(performance.now() / 550) * 0.05; },
  };
  return { group, animator };
}

/** Uniformly scale + center a built group to a target on-screen height while
 * keeping feet at y=0 (kit convention). Returns { centerY, appliedScale }. */
function fitAndCenter(group, targetHeight = 1.5) {
  const size = new THREE.Vector3();
  new THREE.Box3().setFromObject(group).getSize(size);
  const appliedScale = targetHeight / Math.max(0.05, size.y);
  group.scale.setScalar(appliedScale);
  const center = new THREE.Vector3();
  new THREE.Box3().setFromObject(group).getCenter(center);
  group.position.x -= center.x;
  group.position.z -= center.z;
  return { centerY: center.y, appliedScale };
}

function silhouette(group) {
  const blackMat = new THREE.MeshBasicMaterial({ color: 0x05060a });
  group.traverse((o) => { if (o.isMesh) { o.userData._origMat = o.material; o.material = blackMat; } });
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

  requestAnimationFrame(() => root.classList.add('in'));

  // ---- 3D preview: silhouette -> flash -> full reveal. Guarded end-to-end
  // so a WebGL failure (context limits, etc.) degrades to text-only, never crashes.
  let renderer = null, raf = 0, onResize = null, fromGroup = null, toGroup = null;
  try {
    renderer = getRenderer(); // shared module-level renderer, sized per use
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const sizePx = () => Math.max(120, Math.min(stage.clientWidth, stage.clientHeight) || 320);
    let s = sizePx();
    renderer.setSize(s, s, false);
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 30);
    scene.add(new THREE.HemisphereLight(0x3a4560, 0x0a0b12, 0.6));
    const key = new THREE.DirectionalLight(0xffe9b0, 1.35); key.position.set(2.2, 3, 2.4); scene.add(key);
    const rim = new THREE.DirectionalLight(0xb9d3ff, 1.0); rim.position.set(-2.6, 1.6, -2.2); scene.add(rim);

    onResize = () => { const ns = sizePx(); if (ns !== s && ns > 0) { s = ns; renderer.setSize(s, s, false); camera.aspect = 1; camera.updateProjectionMatrix(); } };
    window.addEventListener('resize', onResize);

    let activeGroup = null, activeAnimator = null;
    let last = performance.now();
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (activeGroup) activeGroup.rotation.y += dt * 0.85;
      try { activeAnimator?.update?.(dt); } catch (e) { /* a bad model builder must not crash the reveal */ }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    // Phase 1 — silhouette of the pre-awakening form
    const fromBuild = await safeBuildCreature(fromId);
    fromGroup = fromBuild.group;
    const fromInfo = fitAndCenter(fromGroup, 1.5);
    silhouette(fromGroup);
    scene.add(fromGroup);
    camera.position.set(0, fromInfo.centerY, 3.0);
    camera.lookAt(0, fromInfo.centerY, 0);
    activeGroup = fromGroup; activeAnimator = fromBuild.animator;
    try { fromBuild.animator?.play?.('idle'); } catch (e) { /* ignore */ }

    await delay(1.4);

    // Phase 2 — climax flash, swap models
    flashEl.classList.add('go');
    sfx('awaken');
    await delay(0.2);
    scene.remove(fromGroup);
    disposeGroup(fromGroup);
    activeGroup = null; activeAnimator = null;

    const toBuild = await safeBuildCreature(toId);
    toGroup = toBuild.group;
    const toInfo = fitAndCenter(toGroup, 1.5);
    scene.add(toGroup);
    camera.position.set(0, toInfo.centerY, 3.0);
    camera.lookAt(0, toInfo.centerY, 0);
    toGroup.scale.setScalar(0.001);
    activeGroup = toGroup; activeAnimator = toBuild.animator;
    try { toBuild.animator?.play?.('happy'); } catch (e) { /* ignore */ }

    // pop-in reveal
    const popStart = performance.now();
    await new Promise((resolve) => {
      const step = () => {
        const t = Math.min(1, (performance.now() - popStart) / 620);
        toGroup.scale.setScalar(Math.max(0.001, easeOutBack(t) * toInfo.appliedScale));
        if (t < 1) requestAnimationFrame(step); else resolve();
      };
      step();
    });

    delay(0.9).then(() => { try { toBuild.animator?.play?.('idle'); } catch (e) { /* ignore */ } });
  } catch (e) {
    console.warn('[awakening] 3D preview unavailable, showing text-only reveal', e);
    stage.classList.add('hidden');
  }

  // ---- caption reveal (runs regardless of whether 3D succeeded) -----------
  eyebrow.classList.add('fade');
  titleEl.textContent = `${fromName} awakened into ${toName}!`;
  root.classList.add('revealed');
  await delay(0.5);
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
  renderer?.domElement.remove(); // renderer itself stays alive for reuse
  root.remove();
}
