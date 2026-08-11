// LUMENFALL — Party management: cards, reorder, details (stats/moves/talisman/lore), Awaken.
// renderParty(container, opts?) -> { destroy(), setActive(active) }  (opts.onBack: bubble cancel)
import { bus } from '../core/events.js';
import { G } from '../core/state.js';
import { input } from '../core/input.js';
import { hashStr, seededRandom } from '../core/rng.js';
import { clamp01, TAU } from '../core/math.js';
import { ASPECTS } from '../data/aspects.js';

const sfx = (name) => bus.emit('ui:sfx', { name });
const hpColor = (f) => (f > 0.5 ? 'var(--hp)' : f > 0.25 ? 'var(--hp-low)' : 'var(--hp-crit)');
const cssHex = (n) => (typeof n === 'number' ? `#${n.toString(16).padStart(6, '0')}` : (n || '#c8c2b8'));

const STAT_META = [
  { key: 'vigor', label: 'Vigor', color: 'var(--hp)' },
  { key: 'might', label: 'Might', color: 'var(--ember)' },
  { key: 'ward', label: 'Ward', color: 'var(--terra)' },
  { key: 'focus', label: 'Focus', color: 'var(--lumen)' },
  { key: 'aegis', label: 'Aegis', color: 'var(--frost)' },
  { key: 'haste', label: 'Haste', color: 'var(--volt)' },
];
const STAT_MAX = 220;

// ---------------------------------------------------------------------------
// Lazily-loaded sibling data (may not exist yet mid-integration — best-effort).
// ---------------------------------------------------------------------------
let _speciesP = null, _abilitiesP = null, _itemsP = null, _creaturesApiP = null;
const loadSpecies = () => (_speciesP ??= import('../data/creatures.js').then((m) => m.SPECIES ?? {}).catch(() => ({})));
const loadAbilities = () => (_abilitiesP ??= import('../data/abilities.js').then((m) => m.ABILITIES ?? {}).catch(() => ({})));
const loadItems = () => (_itemsP ??= import('../data/items.js').then((m) => m.ITEMS ?? {}).catch(() => ({})));
const loadCreaturesApi = () => (_creaturesApiP ??= import('../game/creatures.js').catch(() => ({})));

// ---------------------------------------------------------------------------
// Portrait medallion (self-contained — party.js does not depend on hud.js internals).
// ---------------------------------------------------------------------------
const _portraitCache = new Map();
function portraitCanvas(speciesId, species, size = 58) {
  const key = `${speciesId}|${size}`;
  if (_portraitCache.has(key)) { const c = _portraitCache.get(key).cloneNode(); c.getContext('2d').drawImage(_portraitCache.get(key), 0, 0); return c; }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.round(size * dpr);
  cv.style.width = cv.style.height = `${size}px`;
  cv.className = 'pc-canvas';
  const x = cv.getContext('2d');
  x.scale(dpr, dpr);
  const aspects = species?.aspects?.length ? species.aspects : ['neutral'];
  const c1 = cssHex(ASPECTS[aspects[0]]?.color), c2 = cssHex(ASPECTS[aspects[1] ?? aspects[0]]?.color);
  const s = size, cx0 = s / 2, cy0 = s / 2, R = s * 0.47;
  x.save(); x.beginPath(); x.arc(cx0, cy0, R, 0, TAU); x.clip();
  x.fillStyle = '#161826'; x.fillRect(0, 0, s, s);
  let g = x.createRadialGradient(s * 0.5, s * 0.2, s * 0.04, s * 0.5, s * 0.3, s * 0.85);
  g.addColorStop(0, c1); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalAlpha = 0.55; x.fillStyle = g; x.fillRect(0, 0, s, s);
  g = x.createRadialGradient(s * 0.2, s * 0.85, s * 0.05, s * 0.3, s * 0.85, s * 0.85);
  g.addColorStop(0, c2); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalAlpha = 0.32; x.fillStyle = g; x.fillRect(0, 0, s, s);
  x.globalAlpha = 1;
  const rng = seededRandom(hashStr(String(speciesId)));
  x.fillStyle = 'rgba(10,12,20,0.85)';
  x.beginPath(); x.ellipse(s * 0.5, s * 0.6, s * 0.27, s * 0.2, 0, 0, TAU); x.fill();
  x.beginPath(); x.arc(s * 0.5, s * 0.36, s * 0.15, 0, TAU); x.fill();
  const letter = String(species?.name || speciesId || '?').charAt(0).toUpperCase();
  x.font = `600 ${s * 0.38}px Georgia, serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = s * 0.05; x.strokeStyle = 'rgba(8,9,16,0.55)'; x.strokeText(letter, s * 0.5, s * 0.53);
  x.fillStyle = 'rgba(242,234,216,0.95)'; x.fillText(letter, s * 0.5, s * 0.53);
  x.restore();
  x.lineWidth = Math.max(1.5, s * 0.045); x.strokeStyle = c1; x.globalAlpha = 0.95;
  x.beginPath(); x.arc(cx0, cy0, R - x.lineWidth / 2, 0, TAU); x.stroke(); x.globalAlpha = 1;
  _portraitCache.set(key, cv);
  const out = cv.cloneNode(); out.getContext('2d').drawImage(cv, 0, 0);
  return out;
}

// ---------------------------------------------------------------------------
export function renderParty(container, opts = {}) {
  let active = false;
  let focusIdx = 0;
  let reorderMode = false, reorderSel = -1;
  let detailMon = null;
  const unsubs = [];

  const root = document.createElement('div');
  root.className = 'party-root';
  container.appendChild(root);

  let SPECIES = {}, ABILITIES = {}, ITEMS = {}, creaturesApi = {};

  async function loadData() {
    [SPECIES, ABILITIES, ITEMS, creaturesApi] = await Promise.all([loadSpecies(), loadAbilities(), loadItems(), loadCreaturesApi()]);
  }

  function isReady(mon) {
    try {
      return !!(creaturesApi.checkAwakening?.(mon, { type: 'level' }) || creaturesApi.checkAwakening?.(mon, { type: 'resonance' }));
    } catch (e) { return false; }
  }

  function drawGrid() {
    root.innerHTML = '';
    const toolbar = document.createElement('div');
    toolbar.className = 'party-toolbar';
    toolbar.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:10px;';
    const reorderBtn = document.createElement('button');
    reorderBtn.className = 'btn-ghost';
    reorderBtn.textContent = reorderMode ? 'Done reordering' : 'Reorder';
    reorderBtn.addEventListener('click', () => { reorderMode = !reorderMode; reorderSel = -1; sfx('ui_move'); drawGrid(); });
    toolbar.appendChild(reorderBtn);
    root.appendChild(toolbar);

    const grid = document.createElement('div');
    grid.className = 'party-grid';
    root.appendChild(grid);

    const party = G.party || [];
    for (let i = 0; i < 5; i++) {
      const mon = party[i];
      if (!mon) {
        const empty = document.createElement('div');
        empty.className = 'party-empty-slot';
        empty.textContent = 'Empty';
        grid.appendChild(empty);
        continue;
      }
      const sp = SPECIES[mon.speciesId];
      const card = document.createElement('div');
      card.className = 'party-card';
      if ((mon.hp ?? 1) <= 0) card.classList.add('fainted');
      if (i === focusIdx && active) card.classList.add('focused');
      if (reorderMode && reorderSel === i) card.classList.add('selecting');
      const f = clamp01((mon.hp ?? 0) / (mon.maxHp || 1));
      card.innerHTML = `
        <div class="pc-slot"></div>
        <div class="pc-name"></div>
        <div class="pc-lv"></div>
        <div class="pc-hp-track"><div class="pc-hp-fill"></div></div>
        <div class="pc-aspects"></div>
        <div class="pc-resonance"></div>
      `;
      card.querySelector('.pc-slot').appendChild(portraitCanvas(mon.speciesId, sp, 58));
      card.querySelector('.pc-name').textContent = mon.nickname || sp?.name || mon.speciesId;
      card.querySelector('.pc-lv').textContent = `Lv ${mon.level ?? 1}`;
      const fill = card.querySelector('.pc-hp-fill');
      fill.style.width = `${Math.round(f * 100)}%`;
      fill.style.background = hpColor(f);
      const chips = card.querySelector('.pc-aspects');
      (sp?.aspects ?? []).forEach((a) => { const c = document.createElement('span'); c.className = `aspect-chip chip-${a}`; c.style.padding = '1px 6px'; c.style.fontSize = '8px'; c.textContent = ''; chips.appendChild(c); });
      const res = card.querySelector('.pc-resonance');
      for (let h = 0; h < 5; h++) { const s = document.createElement('span'); s.textContent = '♥'; if (h < (mon.resonance ?? 0)) s.classList.add('filled'); res.appendChild(s); }
      if (mon.status) { const st = document.createElement('div'); st.className = 'pc-status'; st.textContent = mon.status; card.appendChild(st); }
      if (isReady(mon)) { const aw = document.createElement('div'); aw.className = 'pc-awaken'; aw.textContent = 'Awaken'; card.appendChild(aw); }
      card.addEventListener('click', () => { focusIdx = i; onConfirmCard(); });
      grid.appendChild(card);
    }
    const hint = document.createElement('div');
    hint.className = 'party-hint';
    hint.textContent = reorderMode ? 'Select two Kindred to swap their order.' : 'Select a Kindred to view details.';
    root.appendChild(hint);
  }

  function onConfirmCard() {
    const mon = G.party[focusIdx];
    if (!mon) return;
    if (reorderMode) {
      if (reorderSel < 0) { reorderSel = focusIdx; sfx('ui_move'); drawGrid(); return; }
      if (reorderSel === focusIdx) { reorderSel = -1; drawGrid(); return; }
      const a = reorderSel, b = focusIdx;
      [G.party[a], G.party[b]] = [G.party[b], G.party[a]];
      reorderSel = -1;
      sfx('ui_confirm');
      bus.emit('party:changed');
      drawGrid();
      return;
    }
    sfx('ui_confirm');
    openDetails(mon);
  }

  // -------------------------------------------------------------- Details
  function statBarRow(label, val, max, color) {
    const row = document.createElement('div');
    row.className = 'stat-bar-row';
    row.innerHTML = `<span class="stat-bar-label"></span><span class="stat-bar-track"><span class="stat-bar-fill"></span></span><span class="stat-bar-val"></span>`;
    row.querySelector('.stat-bar-label').textContent = label;
    row.querySelector('.stat-bar-val').textContent = val;
    const f = row.querySelector('.stat-bar-fill');
    f.style.background = color;
    requestAnimationFrame(() => { f.style.transform = `scaleX(${Math.min(1, val / max)})`; });
    return row;
  }

  function openDetails(mon) {
    detailMon = mon;
    const sp = SPECIES[mon.speciesId];
    const wrap = document.createElement('div');
    wrap.className = 'party-details';
    wrap.innerHTML = `
      <button class="icon-btn pd-close" style="float:right;">&times;</button>
      <div class="pd-head">
        <div class="pd-portrait"></div>
        <div>
          <div class="pd-name"></div>
          <div class="pd-meta"></div>
          <div class="pd-chips" style="display:flex;gap:6px;margin-top:4px;"></div>
        </div>
      </div>
      <div class="pd-cols">
        <div class="pd-col-stats"></div>
        <div class="pd-col-moves">
          <div class="quest-section-label">Moves</div>
          <div class="move-slots"></div>
          <div class="quest-section-label" style="margin-top:14px;">Talisman</div>
          <div class="talisman-slot-wrap"></div>
        </div>
      </div>
      <div class="pd-lore"></div>
      <div class="pd-awaken-wrap" style="margin-top:14px;"></div>
    `;
    root.appendChild(wrap);
    wrap.querySelector('.pd-portrait').appendChild(portraitCanvas(mon.speciesId, sp, 68));
    wrap.querySelector('.pd-name').textContent = mon.nickname || sp?.name || mon.speciesId;
    wrap.querySelector('.pd-meta').textContent = `Lv ${mon.level ?? 1} · ${mon.hp ?? 0}/${mon.maxHp ?? 0} HP · Res ${mon.resonance ?? 0}/5`;
    const chipsEl = wrap.querySelector('.pd-chips');
    (sp?.aspects ?? []).forEach((a) => { const c = document.createElement('span'); c.className = `aspect-chip chip-${a}`; c.textContent = ASPECTS[a]?.name ?? a; chipsEl.appendChild(c); });

    const statsCol = wrap.querySelector('.pd-col-stats');
    statsCol.appendChild(statBarRow('Vigor', mon.maxHp ?? 0, STAT_MAX, 'var(--hp)'));
    const s = mon.stats ?? {};
    for (const meta of STAT_META.slice(1)) statsCol.appendChild(statBarRow(meta.label, s[meta.key] ?? 0, STAT_MAX, meta.color));

    const moveSlots = wrap.querySelector('.move-slots');
    const moves = mon.moves ?? [];
    for (let i = 0; i < 4; i++) {
      const moveId = moves[i];
      const slot = document.createElement('div');
      slot.className = 'move-slot' + (moveId ? '' : ' empty');
      if (moveId) {
        const ab = ABILITIES[moveId];
        slot.innerHTML = `<div class="ms-name"></div><div class="ms-meta"></div>`;
        slot.querySelector('.ms-name').textContent = ab?.name ?? moveId;
        const meta = slot.querySelector('.ms-meta');
        if (ab) {
          const chip = document.createElement('span');
          chip.className = `aspect-chip chip-${ab.aspect}`;
          chip.style.cssText = 'padding:1px 6px;font-size:8px;';
          meta.appendChild(chip);
          const pw = document.createElement('span');
          pw.textContent = ab.power ? `PWR ${ab.power}` : ab.kind?.toUpperCase() ?? '';
          meta.appendChild(pw);
        }
      } else {
        slot.textContent = '— empty —';
      }
      slot.addEventListener('click', () => openMovePicker(mon, i));
      moveSlots.appendChild(slot);
    }

    const talWrap = wrap.querySelector('.talisman-slot-wrap');
    renderTalismanSlot(talWrap, mon);

    wrap.querySelector('.pd-lore').textContent = sp?.codex ?? '';

    const awakenWrap = wrap.querySelector('.pd-awaken-wrap');
    renderAwakenAction(awakenWrap, mon);

    wrap.querySelector('.pd-close').addEventListener('click', closeDetails);
  }

  function renderTalismanSlot(el, mon) {
    el.innerHTML = '';
    const slot = document.createElement('div');
    if (mon.talisman) {
      const it = ITEMS[mon.talisman];
      slot.className = 'talisman-slot';
      slot.innerHTML = `<div class="ts-name"></div><div class="ts-desc"></div>`;
      slot.querySelector('.ts-name').textContent = it?.name ?? mon.talisman;
      slot.querySelector('.ts-desc').textContent = it?.desc ?? '';
    } else {
      slot.className = 'talisman-slot empty';
      slot.textContent = 'No talisman equipped — click to equip';
    }
    slot.addEventListener('click', () => openTalismanPicker(mon, el));
    el.appendChild(slot);
  }

  function openMovePicker(mon, slotIdx) {
    const sp = SPECIES[mon.speciesId];
    const known = (sp?.learnset ?? []).filter(([lv]) => lv <= (mon.level ?? 1)).map(([, id]) => id);
    const uniqueKnown = [...new Set(known)];
    const overlay = document.createElement('div');
    overlay.className = 'picker-overlay';
    overlay.innerHTML = `<div class="picker-panel panel"><div class="picker-title">Choose a move</div><div class="picker-list"></div><button class="btn-ghost" style="margin-top:8px;">Cancel</button></div>`;
    root.appendChild(overlay);
    const list = overlay.querySelector('.picker-list');
    uniqueKnown.forEach((id) => {
      const ab = ABILITIES[id];
      const equipped = mon.moves.includes(id);
      const item = document.createElement('div');
      item.className = 'picker-item' + (equipped ? ' disabled' : '');
      item.innerHTML = `<span></span><span class="picker-item-sub"></span>`;
      item.firstElementChild.textContent = ab?.name ?? id;
      item.lastElementChild.textContent = equipped ? 'equipped' : (ab?.power ? `PWR ${ab.power}` : ab?.kind ?? '');
      item.addEventListener('click', () => {
        if (equipped) return;
        sfx('ui_confirm');
        mon.moves[slotIdx] = id;
        bus.emit('party:changed');
        overlay.remove();
        openDetails(mon);
      });
      list.appendChild(item);
    });
    overlay.querySelector('button').addEventListener('click', () => { sfx('ui_cancel'); overlay.remove(); });
    sfx('ui_open');
  }

  function openTalismanPicker(mon, anchorEl) {
    const bagTalismans = Object.keys(G.bag || {}).filter((id) => (ITEMS[id]?.kind === 'talisman') && G.bag[id] > 0);
    const overlay = document.createElement('div');
    overlay.className = 'picker-overlay';
    overlay.innerHTML = `<div class="picker-panel panel"><div class="picker-title">Equip a talisman</div><div class="picker-list"></div><button class="btn-ghost" style="margin-top:8px;">Cancel</button></div>`;
    root.appendChild(overlay);
    const list = overlay.querySelector('.picker-list');
    if (mon.talisman) {
      const unequip = document.createElement('div');
      unequip.className = 'picker-item';
      unequip.innerHTML = `<span>Unequip</span>`;
      unequip.addEventListener('click', () => { sfx('ui_confirm'); mon.talisman = null; bus.emit('party:changed'); overlay.remove(); renderTalismanSlot(anchorEl, mon); });
      list.appendChild(unequip);
    }
    if (!bagTalismans.length) list.insertAdjacentHTML('beforeend', `<div class="picker-item-sub" style="padding:8px;">No talismans in your bag.</div>`);
    bagTalismans.forEach((id) => {
      const it = ITEMS[id];
      const item = document.createElement('div');
      item.className = 'picker-item';
      item.innerHTML = `<span></span><span class="picker-item-sub"></span>`;
      item.firstElementChild.textContent = it?.name ?? id;
      item.lastElementChild.textContent = `x${G.bag[id]}`;
      item.addEventListener('click', () => {
        sfx('ui_confirm');
        mon.talisman = id;
        bus.emit('party:changed');
        overlay.remove();
        renderTalismanSlot(anchorEl, mon);
      });
      list.appendChild(item);
    });
    overlay.querySelector('button').addEventListener('click', () => { sfx('ui_cancel'); overlay.remove(); });
    sfx('ui_open');
  }

  function renderAwakenAction(el, mon) {
    el.innerHTML = '';
    if (!isReady(mon)) return;
    const btn = document.createElement('button');
    btn.className = 'btn-gold';
    btn.textContent = 'Awaken';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const targetId = creaturesApi.checkAwakening?.(mon, { type: 'level' }) || creaturesApi.checkAwakening?.(mon, { type: 'resonance' });
      if (!targetId) return;
      const fromId = mon.speciesId;
      try {
        const { showAwakening } = await import('./awakeningUI.js');
        creaturesApi.applyAwakening?.(mon);
        await showAwakening({ mon, fromId, toId: targetId });
      } catch (e) {
        creaturesApi.applyAwakening?.(mon);
        console.warn('[party] awakening cinematic unavailable', e);
      }
      bus.emit('party:changed');
      closeDetails();
      drawGrid();
    });
    el.appendChild(btn);
  }

  function closeDetails() {
    detailMon = null;
    const el = root.querySelector('.party-details');
    el?.remove();
  }

  // -------------------------------------------------------------- Input
  function moveFocus(dir) {
    if (!active || detailMon) return;
    sfx('ui_move');
    const len = Math.max(1, (G.party || []).length);
    focusIdx = (focusIdx + dir + len) % len;
    drawGrid();
  }
  function onCancel() {
    if (!active) return;
    if (detailMon) { sfx('ui_cancel'); closeDetails(); return; }
    if (reorderMode) { reorderMode = false; reorderSel = -1; sfx('ui_cancel'); drawGrid(); return; }
    opts.onBack?.();
  }

  unsubs.push(input.onAction('left', () => moveFocus(-1)));
  unsubs.push(input.onAction('right', () => moveFocus(1)));
  unsubs.push(input.onAction('up', () => moveFocus(-1)));
  unsubs.push(input.onAction('down', () => moveFocus(1)));
  unsubs.push(input.onAction('confirm', () => { if (!detailMon && active) onConfirmCard(); }));
  unsubs.push(input.onAction('interact', () => { if (!detailMon && active) onConfirmCard(); }));
  unsubs.push(input.onAction('cancel', onCancel));

  const offPartyChanged = bus.on('party:changed', () => { if (!detailMon) drawGrid(); });

  (async () => { await loadData(); drawGrid(); })();

  return {
    setActive(v) { active = v; drawGrid(); },
    destroy() { unsubs.forEach((f) => f()); offPartyChanged(); root.remove(); },
  };
}
