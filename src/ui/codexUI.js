// LUMENFALL — Kindred Codex: unknown/seen/caught grid, detail pane with a live rotating
// 3D preview (one small module-level renderer, reused across opens), lore, stats, awakening
// chain pips and cry playback. renderCodex(container, opts?) -> { destroy(), setActive(active) }
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { G } from '../core/state.js';
import { input } from '../core/input.js';
import { TAU, clamp01 } from '../core/math.js';
import { ASPECTS } from '../data/aspects.js';
import { creaturePortraitCanvas } from './hud.js';

const sfx = (name) => bus.emit('ui:sfx', { name });

// One small preview renderer, created lazily and REUSED for every detail-pane
// open — a fresh WebGLRenderer per open risks browser context eviction. It
// lives for the module's lifetime (never disposed / never force-context-lost);
// per open we just size it and move its canvas into the pane.
let _previewRenderer = null;
function getPreviewRenderer() {
  if (!_previewRenderer) _previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  return _previewRenderer;
}

let _speciesP = null, _speciesListP = null;
const loadSpecies = () => (_speciesP ??= import('../data/creatures.js').then((m) => m.SPECIES ?? {}).catch(() => ({})));
const loadSpeciesList = () => (_speciesListP ??= import('../data/creatures.js').then((m) => m.SPECIES_LIST ?? Object.keys(m.SPECIES ?? {})).catch(() => []));

function buildChainLookup(SPECIES) {
  const forward = {};
  for (const id in SPECIES) if (SPECIES[id]?.awakensTo?.id) forward[id] = SPECIES[id].awakensTo;
  function rootOf(id) {
    let cur = id;
    for (let i = 0; i < 6; i++) {
      const prev = Object.keys(forward).find((k) => forward[k].id === cur);
      if (!prev) break;
      cur = prev;
    }
    return cur;
  }
  return function chainOf(id) {
    const root = rootOf(id);
    const chain = [root];
    let cur = root;
    for (let i = 0; i < 6; i++) {
      const next = forward[cur];
      if (!next) break;
      chain.push(next.id);
      cur = next.id;
    }
    return chain;
  };
}

// (Grid slots now use hud.js's creaturePortraitCanvas medallions — the old
//  bespoke silhouette/colored canvases were retired with review finding 11.)

function ringMeter(pct, size = 46) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.round(size * dpr);
  cv.style.width = cv.style.height = `${size}px`;
  const x = cv.getContext('2d');
  x.scale(dpr, dpr);
  const s = size, r = s * 0.42, lw = s * 0.14;
  x.lineWidth = lw; x.lineCap = 'round';
  x.strokeStyle = 'rgba(255,255,255,0.1)';
  x.beginPath(); x.arc(s / 2, s / 2, r, 0, TAU); x.stroke();
  if (pct > 0) {
    x.strokeStyle = '#ffe9b0'; x.shadowColor = '#ffe9b0'; x.shadowBlur = 4;
    x.beginPath(); x.arc(s / 2, s / 2, r, -Math.PI / 2, -Math.PI / 2 + clamp01(pct) * TAU); x.stroke();
  }
  return cv;
}

export function renderCodex(container, opts = {}) {
  let active = false;
  let SPECIES = {}, SPECIES_LIST = [], chainOf = () => [];
  let focusIdx = 0, detailId = null, cols = 6;
  let preview = null; // { dispose() } — the detail pane's dedicated mini renderer, when open

  const root = document.createElement('div');
  root.className = 'codex-root';
  container.appendChild(root);
  root.innerHTML = `
    <div class="codex-header">
      <div class="codex-ring-wrap"><div class="codex-ring-canvas"></div><div class="codex-ring-label"></div></div>
    </div>
    <div class="codex-grid"></div>
  `;
  const gridEl = root.querySelector('.codex-grid');
  const ringWrap = root.querySelector('.codex-ring-canvas');
  const ringLabel = root.querySelector('.codex-ring-label');

  function statusOf(id) { return G.codex?.[id]; }

  function drawHeader() {
    const total = SPECIES_LIST.length || 48;
    const caught = SPECIES_LIST.filter((id) => statusOf(id) === 'caught').length;
    const seen = SPECIES_LIST.filter((id) => statusOf(id)).length;
    ringWrap.innerHTML = '';
    ringWrap.appendChild(ringMeter(total ? caught / total : 0));
    ringLabel.innerHTML = `<b>${caught}</b> / ${total} caught<br/>${seen} seen`;
  }

  function drawGrid() {
    gridEl.innerHTML = '';
    SPECIES_LIST.forEach((id, i) => {
      const status = statusOf(id);
      const sp = SPECIES[id];
      const slot = document.createElement('div');
      slot.className = 'codex-slot ' + (status === 'caught' ? 'caught' : status === 'seen' ? 'seen' : 'unknown');
      if (i === focusIdx && active) slot.classList.add('focused');
      const num = document.createElement('div');
      num.className = 'cs-num';
      num.textContent = `#${i + 1}`;
      slot.appendChild(num);
      if (status === 'caught') {
        slot.appendChild(creaturePortraitCanvas(id, 54));
        const nm = document.createElement('div'); nm.className = 'cs-name'; nm.textContent = sp?.name ?? id; slot.appendChild(nm);
      } else if (status === 'seen') {
        // Same medallion, dimmed/desaturated by .seen-glyph — reads as "sighted,
        // not yet attuned" while matching the party/HUD portrait language.
        slot.classList.add('seen-glyph');
        slot.appendChild(creaturePortraitCanvas(id, 54));
        const nm = document.createElement('div'); nm.className = 'cs-name'; nm.textContent = sp?.name ?? id; slot.appendChild(nm);
      } else {
        const mark = document.createElement('div'); mark.className = 'cs-mark'; mark.textContent = '?'; slot.appendChild(mark);
      }
      slot.addEventListener('click', () => { focusIdx = i; sfx('ui_move'); onConfirmSlot(); });
      gridEl.appendChild(slot);
    });
    requestAnimationFrame(() => {
      const cs = getComputedStyle(gridEl).gridTemplateColumns.split(' ').filter(Boolean);
      cols = Math.max(1, cs.length);
      gridEl.querySelector('.codex-slot.focused')?.scrollIntoView({ block: 'nearest' });
    });
  }

  function onConfirmSlot() {
    const id = SPECIES_LIST[focusIdx];
    if (!id || !statusOf(id)) { sfx('ui_cancel'); return; }
    sfx('ui_confirm');
    openDetail(id);
  }

  // -------------------------------------------------------------- Detail pane
  async function openDetail(id) {
    detailId = id;
    const status = statusOf(id);
    const sp = SPECIES[id];
    const det = document.createElement('div');
    det.className = 'codex-detail';
    det.innerHTML = `
      <button class="icon-btn codex-detail-close">&times;</button>
      <div class="codex-detail-visual"><div class="cd-canvas-wrap"></div><button class="btn-ghost cd-cry-btn">Play Cry</button></div>
      <div class="codex-detail-info">
        <div class="cd-name"></div>
        <div class="cd-habitat"></div>
        <div class="cd-chips"></div>
        <div class="cd-lore"></div>
        <div class="quest-section-label">Awakening chain</div>
        <div class="cd-chain"></div>
        <div class="cd-stats"></div>
      </div>
    `;
    root.appendChild(det);
    det.querySelector('.codex-detail-close').addEventListener('click', closeDetail);
    det.querySelector('.cd-name').textContent = sp?.name ?? id;
    det.querySelector('.cd-habitat').textContent = sp?.habitat ?? '';
    const chipsEl = det.querySelector('.cd-chips');
    (sp?.aspects ?? []).forEach((a) => { const c = document.createElement('span'); c.className = `aspect-chip chip-${a}`; c.textContent = ASPECTS[a]?.name ?? a; chipsEl.appendChild(c); });

    const lore = det.querySelector('.cd-lore');
    const cryBtn = det.querySelector('.cd-cry-btn');
    if (status === 'caught') {
      lore.textContent = sp?.codex ?? '';
      cryBtn.addEventListener('click', async () => {
        try { (await import('../audio/cries.js')).playCry(id); } catch (e) { /* audio not ready */ }
      });
    } else {
      lore.textContent = 'Attune to this Kindred to unveil its lore.';
      cryBtn.disabled = true;
    }

    const chainEl = det.querySelector('.cd-chain');
    const chain = chainOf(id);
    chain.forEach((cid, i) => {
      if (i > 0) { const arrow = document.createElement('span'); arrow.className = 'cd-chain-arrow'; arrow.textContent = '▸'; chainEl.appendChild(arrow); }
      const revealed = !!statusOf(cid);
      const pip = document.createElement('div');
      pip.className = 'cd-chain-pip' + (revealed ? ' revealed' : '');
      pip.textContent = revealed ? (SPECIES[cid]?.name?.charAt(0) ?? '?') : '?';
      pip.title = revealed ? (SPECIES[cid]?.name ?? cid) : 'Undiscovered';
      chainEl.appendChild(pip);
    });

    const statsEl = det.querySelector('.cd-stats');
    if (status === 'caught' && sp?.base) {
      const max = 120;
      for (const [key, label] of [['vigor', 'Vigor'], ['might', 'Might'], ['ward', 'Ward'], ['focus', 'Focus'], ['aegis', 'Aegis'], ['haste', 'Haste']]) {
        const row = document.createElement('div');
        row.className = 'stat-bar-row';
        row.innerHTML = `<span class="stat-bar-label"></span><span class="stat-bar-track"><span class="stat-bar-fill"></span></span><span class="stat-bar-val"></span>`;
        row.querySelector('.stat-bar-label').textContent = label;
        row.querySelector('.stat-bar-val').textContent = sp.base[key] ?? 0;
        row.querySelector('.stat-bar-fill').style.background = 'var(--gold-strong)';
        row.querySelector('.stat-bar-fill').style.transform = `scaleX(${Math.min(1, (sp.base[key] ?? 0) / max)})`;
        statsEl.appendChild(row);
      }
    }

    // Shared small 3D preview renderer (module-level, sized per use).
    const canvasWrap = det.querySelector('.cd-canvas-wrap');
    try {
      const { buildCreature } = await import('../creatures/registry.js');
      if (detailId !== id) return; // closed while loading
      const renderer = getPreviewRenderer();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(220, 220, false);
      renderer.domElement.style.cssText = 'width:220px;height:220px;';
      canvasWrap.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 40);
      // Museum-plinth lighting: bright enough to read silhouettes and materials
      // against the solid detail panel (review finding 24).
      const hemi = new THREE.HemisphereLight(0x9aa2d8, 0x2a2436, 1.1);
      const key = new THREE.DirectionalLight(0xffe9b0, status === 'caught' ? 1.7 : 0.6);
      key.position.set(2, 3, 2.4);
      const rim = new THREE.DirectionalLight(0x9ad1ff, 0.65);
      rim.position.set(-2, 1.4, -2);
      scene.add(hemi, key, rim);
      const { group, animator } = buildCreature(id);
      if (status !== 'caught') {
        // Silhouette treatment for 'seen'-but-not-caught: flat near-black, no lit detail.
        group.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: 0x0a0b12 }); });
      }
      const box = new THREE.Box3().setFromObject(group);
      const size = box.getSize(new THREE.Vector3());
      const h = Math.max(0.3, size.y);
      camera.position.set(0, h * 0.55, h * 2.1);
      camera.lookAt(0, h * 0.5, 0);
      scene.add(group);
      animator.play?.('idle');
      let raf = 0, last = performance.now();
      function loop(now) {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        group.rotation.y += dt * 0.6;
        animator.update?.(dt);
        renderer.render(scene, camera);
      }
      raf = requestAnimationFrame(loop);
      preview = {
        dispose() {
          cancelAnimationFrame(raf);
          group.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose()); } });
          renderer.domElement.remove(); // renderer itself stays alive for reuse
        },
      };
    } catch (e) {
      canvasWrap.innerHTML = '<div style="color:var(--ink-dim);font-size:11px;padding:20px;text-align:center;">Model unavailable</div>';
      console.warn('[codexUI] creature preview unavailable', e);
    }
  }

  function closeDetail() {
    preview?.dispose(); preview = null;
    detailId = null;
    root.querySelector('.codex-detail')?.remove();
  }

  // -------------------------------------------------------------- Input
  function moveFocus(dx, dy) {
    if (!active || detailId) return;
    const len = SPECIES_LIST.length || 1;
    let i = focusIdx;
    if (dx) i += dx;
    if (dy) i += dy * cols;
    focusIdx = ((i % len) + len) % len;
    sfx('ui_move');
    drawGrid();
  }
  function onCancel() {
    if (!active) return;
    if (detailId) { sfx('ui_cancel'); closeDetail(); return; }
    opts.onBack?.();
  }

  const unsubs = [
    input.onAction('left', () => moveFocus(-1, 0)),
    input.onAction('right', () => moveFocus(1, 0)),
    input.onAction('up', () => moveFocus(0, -1)),
    input.onAction('down', () => moveFocus(0, 1)),
    input.onAction('confirm', () => { if (active && !detailId) onConfirmSlot(); }),
    input.onAction('interact', () => { if (active && !detailId) onConfirmSlot(); }),
    input.onAction('cancel', onCancel),
  ];
  const offCodex = bus.on('codex:updated', () => { drawHeader(); if (!detailId) drawGrid(); });

  (async () => {
    [SPECIES, SPECIES_LIST] = await Promise.all([loadSpecies(), loadSpeciesList()]);
    chainOf = buildChainLookup(SPECIES);
    drawHeader();
    drawGrid();
  })();

  return {
    setActive(v) { active = v; drawGrid(); },
    destroy() { unsubs.forEach((f) => f()); offCodex(); preview?.dispose(); root.remove(); },
  };
}
