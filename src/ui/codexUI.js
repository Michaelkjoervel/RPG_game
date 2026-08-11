// LUMENFALL — Kindred Codex: unknown/seen/caught grid, detail pane with a live rotating
// 3D preview (its own small dedicated renderer, disposed on close), lore, stats, awakening
// chain pips and cry playback. renderCodex(container, opts?) -> { destroy(), setActive(active) }
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { G } from '../core/state.js';
import { input } from '../core/input.js';
import { TAU, clamp01 } from '../core/math.js';
import { hashStr, seededRandom } from '../core/rng.js';
import { ASPECTS } from '../data/aspects.js';

const sfx = (name) => bus.emit('ui:sfx', { name });
const cssHex = (n) => (typeof n === 'number' ? `#${n.toString(16).padStart(6, '0')}` : (n || '#c8c2b8'));

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

function silhouetteCanvas(speciesId, aspects, size = 72) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.round(size * dpr);
  cv.style.width = cv.style.height = `${size}px`;
  const x = cv.getContext('2d');
  x.scale(dpr, dpr);
  const s = size, c1 = cssHex(ASPECTS[aspects?.[0]]?.color ?? ASPECTS.neutral.color);
  const g = x.createRadialGradient(s * 0.5, s * 0.5, s * 0.05, s * 0.5, s * 0.5, s * 0.5);
  g.addColorStop(0, c1); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalAlpha = 0.4; x.fillStyle = g; x.fillRect(0, 0, s, s); x.globalAlpha = 1;
  const rng = seededRandom(hashStr(String(speciesId)));
  x.fillStyle = 'rgba(4,4,8,0.92)';
  x.beginPath(); x.ellipse(s * 0.5, s * 0.62, s * 0.24, s * 0.17, 0, 0, TAU); x.fill();
  x.beginPath(); x.arc(s * 0.5, s * 0.37, s * 0.14, 0, TAU); x.fill();
  return cv;
}

function coloredCanvas(speciesId, sp, size = 72) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.round(size * dpr);
  cv.style.width = cv.style.height = `${size}px`;
  const x = cv.getContext('2d');
  x.scale(dpr, dpr);
  const s = size, aspects = sp?.aspects?.length ? sp.aspects : ['neutral'];
  const c1 = cssHex(ASPECTS[aspects[0]]?.color), c2 = cssHex(ASPECTS[aspects[1] ?? aspects[0]]?.color);
  x.save(); x.beginPath(); x.arc(s / 2, s / 2, s * 0.47, 0, TAU); x.clip();
  x.fillStyle = '#161826'; x.fillRect(0, 0, s, s);
  let g = x.createRadialGradient(s * 0.5, s * 0.2, s * 0.04, s * 0.5, s * 0.3, s * 0.85);
  g.addColorStop(0, c1); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalAlpha = 0.6; x.fillStyle = g; x.fillRect(0, 0, s, s);
  g = x.createRadialGradient(s * 0.2, s * 0.85, s * 0.05, s * 0.3, s * 0.85, s * 0.85);
  g.addColorStop(0, c2); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalAlpha = 0.35; x.fillStyle = g; x.fillRect(0, 0, s, s); x.globalAlpha = 1;
  const rng = seededRandom(hashStr(String(speciesId)));
  x.fillStyle = 'rgba(10,12,20,0.85)';
  x.beginPath(); x.ellipse(s * 0.5, s * 0.62, s * 0.24, s * 0.17, 0, 0, TAU); x.fill();
  x.beginPath(); x.arc(s * 0.5, s * 0.37, s * 0.14, 0, TAU); x.fill();
  x.restore();
  x.lineWidth = Math.max(1.5, s * 0.045); x.strokeStyle = c1;
  x.beginPath(); x.arc(s / 2, s / 2, s * 0.47 - x.lineWidth / 2, 0, TAU); x.stroke();
  return cv;
}

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
  let preview = null; // { renderer, scene, camera, group, raf, dispose }

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
        slot.appendChild(coloredCanvas(id, sp, 54));
        const nm = document.createElement('div'); nm.className = 'cs-name'; nm.textContent = sp?.name ?? id; slot.appendChild(nm);
      } else if (status === 'seen') {
        slot.appendChild(silhouetteCanvas(id, sp?.aspects, 54));
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

    // Dedicated small 3D preview renderer.
    const canvasWrap = det.querySelector('.cd-canvas-wrap');
    const canvas = document.createElement('canvas');
    canvas.width = 240; canvas.height = 240;
    canvas.style.cssText = 'width:220px;height:220px;';
    canvasWrap.appendChild(canvas);
    try {
      const { buildCreature } = await import('../creatures/registry.js');
      if (detailId !== id) return; // closed while loading
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(220, 220, false);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 40);
      const hemi = new THREE.HemisphereLight(0x8890c8, 0x141018, 0.7);
      const key = new THREE.DirectionalLight(0xffe9b0, status === 'caught' ? 1.15 : 0.5);
      key.position.set(2, 3, 2.4);
      const rim = new THREE.DirectionalLight(0x9ad1ff, 0.4);
      rim.position.set(-2, 1.4, -2);
      scene.add(hemi, key, rim);
      const { group, animator } = buildCreature(id);
      if (status !== 'caught') {
        group.traverse((o) => { if (o.isMesh) { const c = o.material?.color; o.material = new THREE.MeshBasicMaterial({ color: 0x0a0b12 }); } });
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
          renderer.dispose();
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
