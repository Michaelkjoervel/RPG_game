// LUMENFALL — Bag: category tabs, item cards with canvas icon glyphs, use flows.
// Tonics/remedies -> party target picker + heal/cleanse anim. Stones -> valid-member picker
// -> awakeningUI. Talismans -> equip picker. Charms/Key items are informational here (charms
// are spent from the battle catch action; key items are consumed by story logic).
// renderBag(container, opts?) -> { destroy(), setActive(active) }
import { bus } from '../core/events.js';
import { G, spendItem } from '../core/state.js';
import { input } from '../core/input.js';
import { TAU } from '../core/math.js';
import { ASPECTS } from '../data/aspects.js';
import { makeListPicker } from './widgets.js';

const sfx = (name) => bus.emit('ui:sfx', { name });
const cssHex = (n) => (typeof n === 'number' ? `#${n.toString(16).padStart(6, '0')}` : (n || '#c8c2b8'));

const TABS = [
  { id: 'restorative', label: 'Restoratives' },
  { id: 'charm', label: 'Charms' },
  { id: 'stone', label: 'Stones' },
  { id: 'talisman', label: 'Talismans' },
  { id: 'key', label: 'Key' },
];

let _itemsP = null, _creaturesApiP = null, _speciesP = null;
const loadItems = () => (_itemsP ??= import('../data/items.js').then((m) => m.ITEMS ?? {}).catch(() => ({})));
const loadCreaturesApi = () => (_creaturesApiP ??= import('../game/creatures.js').catch(() => ({})));
const loadSpecies = () => (_speciesP ??= import('../data/creatures.js').then((m) => m.SPECIES ?? {}).catch(() => ({})));

// ---------------------------------------------------------------------------
// Item icon glyph — procedural, colored by kind + implied aspect.
// ---------------------------------------------------------------------------
function aspectFromId(id) {
  for (const a in ASPECTS) if (id.includes(a)) return a;
  return null;
}
export function iconCanvas(id, item, size = 40) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.round(size * dpr);
  cv.style.width = cv.style.height = `${size}px`;
  const x = cv.getContext('2d');
  x.scale(dpr, dpr);
  const s = size, cx = s / 2, cy = s / 2;
  const kind = item?.kind ?? 'key';
  const aspect = aspectFromId(id);
  const color = aspect ? cssHex(ASPECTS[aspect]?.color) : (kind === 'restorative' ? '#7ec850' : kind === 'charm' ? '#ffe9b0' : kind === 'talisman' ? '#ffd166' : '#c8c2b8');
  x.save();
  x.translate(cx, cy);
  x.fillStyle = color; x.strokeStyle = color; x.lineWidth = s * 0.06;
  if (kind === 'restorative') {
    x.beginPath();
    x.moveTo(0, -s * 0.3);
    x.bezierCurveTo(s * 0.22, -s * 0.02, s * 0.2, s * 0.28, 0, s * 0.32);
    x.bezierCurveTo(-s * 0.2, s * 0.28, -s * 0.22, -s * 0.02, 0, -s * 0.3);
    x.globalAlpha = 0.85; x.fill();
    x.globalAlpha = 1; x.fillStyle = 'rgba(255,255,255,0.75)';
    x.fillRect(-s * 0.03, -s * 0.08, s * 0.06, s * 0.18);
    x.fillRect(-s * 0.09, -s * 0.02, s * 0.18, s * 0.06);
  } else if (kind === 'charm') {
    x.globalAlpha = 0.9;
    x.beginPath(); x.arc(0, 0, s * 0.26, 0, TAU); x.fill();
    x.globalAlpha = 1; x.strokeStyle = 'rgba(20,20,30,0.5)'; x.lineWidth = s * 0.03;
    x.beginPath(); x.arc(0, 0, s * 0.26, 0, Math.PI); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.6)'; x.beginPath(); x.arc(0, 0, s * 0.34, 0, TAU); x.stroke();
  } else if (kind === 'stone') {
    x.beginPath();
    x.moveTo(0, -s * 0.32); x.lineTo(s * 0.22, -s * 0.02); x.lineTo(0, s * 0.3); x.lineTo(-s * 0.22, -s * 0.02);
    x.closePath(); x.globalAlpha = 0.88; x.fill();
    x.globalAlpha = 1; x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = s * 0.025;
    x.beginPath(); x.moveTo(0, -s * 0.32); x.lineTo(0, s * 0.3); x.stroke();
  } else if (kind === 'talisman') {
    x.lineWidth = s * 0.08;
    x.beginPath(); x.arc(0, -s * 0.02, s * 0.22, 0, TAU); x.stroke();
    x.beginPath(); x.moveTo(0, s * 0.2); x.lineTo(0, s * 0.34); x.stroke();
  } else {
    x.lineWidth = s * 0.07;
    x.beginPath(); x.arc(-s * 0.12, -s * 0.14, s * 0.13, 0, TAU); x.stroke();
    x.beginPath(); x.moveTo(-s * 0.02, -s * 0.05); x.lineTo(s * 0.26, s * 0.24); x.stroke();
    x.beginPath(); x.moveTo(s * 0.1, s * 0.1); x.lineTo(s * 0.18, s * 0.03); x.stroke();
  }
  x.restore();
  return cv;
}

// ---------------------------------------------------------------------------
function applyRestorative(itemId, item, mon) {
  const eff = item?.effect ?? {};
  const before = mon.hp ?? 0;
  if (eff.revive) {
    if ((mon.hp ?? 0) > 0) return { ok: false, reason: 'not fainted' };
    const pct = eff.revive.percent ?? 50;
    mon.hp = Math.max(1, Math.round((mon.maxHp || 1) * (pct / 100)));
  } else {
    if ((mon.hp ?? 0) <= 0) return { ok: false, reason: 'fainted' };
    if ((mon.hp ?? 0) >= (mon.maxHp ?? 0) && !eff.cleanse && !eff.resonanceXp) return { ok: false, reason: 'full hp' };
    if (eff.heal?.percent === 'full' || eff.heal?.full) mon.hp = mon.maxHp;
    else if (typeof eff.heal?.percent === 'number') mon.hp = Math.min(mon.maxHp, mon.hp + Math.round((mon.maxHp || 0) * eff.heal.percent / 100));
    else if (typeof eff.heal?.amount === 'number') mon.hp = Math.min(mon.maxHp, mon.hp + eff.heal.amount);
    else if (!eff.cleanse && !eff.resonanceXp) mon.hp = mon.maxHp;
  }
  if (eff.cleanse) mon.status = null;
  if (eff.resonanceXp) mon.resonanceXp = (mon.resonanceXp ?? 0) + (typeof eff.resonanceXp === 'number' ? eff.resonanceXp : (eff.resonanceXp.amount ?? 10));
  return { ok: true, healed: (mon.hp ?? 0) - before };
}

export function renderBag(container, opts = {}) {
  let active = false;
  let tab = 'restorative';
  let focusIdx = 0;   // -1 = tabs row; else index into the current tab's item grid
  let cols = 1;       // measured from the rendered grid (2D nav)
  let ITEMS = {}, creaturesApi = {}, SPECIES = {};

  const root = document.createElement('div');
  root.className = 'bag-root';
  container.appendChild(root);
  root.innerHTML = `<div class="bag-tabs"></div><div class="bag-list"></div>`;
  const tabsEl = root.querySelector('.bag-tabs');
  const listEl = root.querySelector('.bag-list');

  TABS.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'bag-tab';
    b.dataset.id = t.id;
    b.textContent = t.label;
    b.addEventListener('click', () => { setTab(t.id); });
    tabsEl.appendChild(b);
  });

  function itemsInTab() {
    return Object.keys(G.bag || {})
      .filter((id) => (G.bag[id] ?? 0) > 0 && (ITEMS[id]?.kind ?? 'key') === tab)
      .sort();
  }

  function setTab(id, { stayOnTabs = false } = {}) {
    tab = id;
    focusIdx = stayOnTabs || !itemsInTab().length ? -1 : 0;
    tabsEl.querySelectorAll('.bag-tab').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
    drawList();
  }

  function drawList() {
    listEl.innerHTML = '';
    const ids = itemsInTab();
    tabsEl.querySelectorAll('.bag-tab').forEach((b) =>
      b.classList.toggle('focused', active && focusIdx === -1 && b.dataset.id === tab));
    if (!ids.length) { listEl.innerHTML = `<div class="bag-empty">Nothing here yet.</div>`; return; }
    ids.forEach((id, i) => {
      const item = ITEMS[id];
      const card = document.createElement('div');
      card.className = 'bag-item';
      if (i === focusIdx && active) card.classList.add('focused');
      card.innerHTML = `<div class="bag-item-icon"></div><div class="bag-item-body"><div class="bag-item-top"><span class="bag-item-name"></span><span class="bag-item-qty"></span></div><div class="bag-item-desc"></div></div>`;
      card.querySelector('.bag-item-icon').appendChild(iconCanvas(id, item, 40));
      card.querySelector('.bag-item-name').textContent = item?.name ?? id;
      card.querySelector('.bag-item-qty').textContent = `x${G.bag[id]}`;
      card.querySelector('.bag-item-desc').textContent = item?.desc ?? '';
      card.addEventListener('click', () => { focusIdx = i; useItem(id, item); });
      listEl.appendChild(card);
    });
    requestAnimationFrame(() => {
      const cs = getComputedStyle(listEl).gridTemplateColumns.split(' ').filter(Boolean);
      cols = Math.max(1, cs.length);
      listEl.querySelector('.bag-item.focused')?.scrollIntoView({ block: 'nearest' });
    });
  }

  // -------------------------------------------------------------- Pickers (shared widget)
  function useItem(id, item) {
    const kind = item?.kind ?? 'key';
    if (kind === 'restorative') return useRestorative(id, item);
    if (kind === 'stone') return useStone(id, item);
    if (kind === 'talisman') return useTalisman(id, item);
    bus.emit('notify', { text: item?.desc ?? 'A curious item.', icon: '✦' });
  }

  const monName = (mon) => mon.nickname || SPECIES[mon.speciesId]?.name || mon.speciesId;

  function useRestorative(id, item) {
    const party = G.party || [];
    if (!party.length) return;
    makeListPicker({
      host: root,
      title: `Use ${item?.name ?? id} on...`,
      items: party.map((mon) => ({
        label: monName(mon),
        sub: `${mon.hp ?? 0}/${mon.maxHp ?? 0} HP`,
        onPick: () => {
          const res = applyRestorative(id, item, mon);
          if (!res.ok) { bus.emit('notify', { text: `No effect (${res.reason}).` }); sfx('ui_cancel'); return; }
          spendItem(id, 1);
          bus.emit('ui:sfx', { name: 'heal' });
          bus.emit('notify', { text: `${monName(mon)} recovered ${Math.max(0, res.healed)} HP.`, icon: '✦' });
          bus.emit('party:changed');
          drawList();
        },
      })),
    });
  }

  async function useStone(id, item) {
    await Promise.all([loadCreaturesApi().then((m) => (creaturesApi = m)), loadSpecies().then((m) => (SPECIES = m))]);
    const party = G.party || [];
    const readyOf = (mon) => {
      try { return creaturesApi.checkAwakening?.(mon, { type: 'stone', itemId: id }) || null; } catch (e) { return null; }
    };
    const anyReady = party.some((mon) => readyOf(mon));
    makeListPicker({
      host: root,
      title: `Use ${item?.name ?? id} on...`,
      items: party.map((mon) => {
        const ready = !!readyOf(mon);
        return {
          label: monName(mon),
          sub: ready ? 'ready to awaken' : 'not ready',
          disabled: !ready,
          onPick: async () => {
            const targetId = readyOf(mon);
            const fromId = mon.speciesId;
            spendItem(id, 1);
            try {
              const { showAwakening } = await import('./awakeningUI.js');
              creaturesApi.applyAwakening?.(mon);
              await showAwakening({ mon, fromId, toId: targetId });
            } catch (e) {
              creaturesApi.applyAwakening?.(mon);
            }
            bus.emit('party:changed');
            drawList();
          },
        };
      }),
      emptyText: anyReady ? null : 'No Kindred are ready for this stone.',
    });
  }

  async function useTalisman(id, item) {
    await loadSpecies().then((m) => (SPECIES = m));
    const party = G.party || [];
    makeListPicker({
      host: root,
      title: `Equip ${item?.name ?? id} to...`,
      items: party.map((mon) => ({
        label: monName(mon),
        sub: mon.talisman ? `has ${mon.talisman}` : 'unequipped',
        onPick: () => {
          mon.talisman = id;
          bus.emit('notify', { text: `${item?.name ?? id} equipped to ${monName(mon)}.`, icon: '✦' });
          bus.emit('party:changed');
          drawList();
        },
      })),
    });
  }

  // -------------------------------------------------------------- Input
  const pickerOpen = () => !!root.querySelector('.picker-overlay');

  // 2D grid nav (finding 14, codex-style) with the tab strip as a row above the
  // grid: up from the top row focuses the tabs, left/right there switches tab.
  function moveFocus(dx, dy) {
    if (!active || pickerOpen()) return;
    const len = itemsInTab().length;
    if (focusIdx === -1) {
      if (dx) { moveTab(dx, { stayOnTabs: true }); return; }
      if (dy > 0 && len) { focusIdx = 0; sfx('ui_move'); drawList(); }
      return;
    }
    if (dy < 0 && focusIdx < cols) { focusIdx = -1; sfx('ui_move'); drawList(); return; }
    if (!len) { focusIdx = -1; drawList(); return; }
    const i = focusIdx + dx + dy * cols;
    focusIdx = ((i % len) + len) % len;
    sfx('ui_move');
    drawList();
  }
  function moveTab(dir, o = {}) {
    const i = TABS.findIndex((t) => t.id === tab);
    setTab(TABS[(i + dir + TABS.length) % TABS.length].id, o);
    sfx('ui_move');
  }
  function onConfirm() {
    if (!active || pickerOpen()) return;
    const ids = itemsInTab();
    if (focusIdx === -1) { if (ids.length) { focusIdx = 0; drawList(); } return; }
    const id = ids[focusIdx];
    if (id) useItem(id, ITEMS[id]);
  }

  const unsubs = [
    input.onAction('up', () => moveFocus(0, -1)),
    input.onAction('down', () => moveFocus(0, 1)),
    input.onAction('left', () => moveFocus(-1, 0)),
    input.onAction('right', () => moveFocus(1, 0)),
    input.onAction('confirm', onConfirm),
    input.onAction('interact', onConfirm),
    input.onAction('cancel', () => { if (active && !pickerOpen()) opts.onBack?.(); }),
  ];
  const offItemGained = bus.on('item:gained', () => drawList());

  (async () => {
    [ITEMS, creaturesApi, SPECIES] = await Promise.all([loadItems(), loadCreaturesApi(), loadSpecies()]);
    setTab('restorative');
  })();

  return {
    setActive(v) { active = v; drawList(); },
    destroy() { unsubs.forEach((f) => f()); offItemGained(); root.remove(); },
  };
}
