// LUMENFALL — battle UI. DOM overlay for combat: plates, action menu, damage
// numbers, vs-card, victory/defeat panels. Pure presentation of engine events;
// arena/creature-model/camera choreography belongs to battle/presentation.js.
//
// Contract (docs/CONTRACTS_ADDENDUM.md):
//   createBattleUI(ctx) -> {
//     mount(), unmount(),
//     async handleEvent(ev),
//     async getAction(view) -> action,   // view: {self, foe, canFlee, canCatch, bag, party}
//     showDamage(xPct, yPct, text, kind),
//     log(text), async showVictory(result), async showDefeat(), async showVsCard(names)
//   }
//
// `ctx` is read defensively: either the same config object passed to
// `new BattleEngine(config)` (kind, enemyName, playerTeam, enemyTeam, canFlee,
// canCatch, arena, weatherAura...) or a wrapper `{ config, game }` around it —
// we accept both shapes (`ctx.config ?? ctx`) since battleFlow.js is built in
// parallel and its exact call shape isn't pinned beyond "createBattleUI(ctx)".
//
// showVsCard(names) accepts, defensively: a plain string (used verbatim as the
// banner line), an array [playerLabel, enemyLabel], or an object
// { kind:'wild'|'warden'|'boss', enemy|enemyName, player|playerName, title? }.
// handleEvent calls it itself on the 'intro' event using ctx-derived info, so
// callers never strictly need to pass anything — but presentation.js may call
// it directly with more specific data for tighter sync, and any of the shapes
// above will render correctly.
//
// Sound ownership: battleUI only ever emits the generic UI chrome cues
// (ui_move/ui_confirm/ui_cancel/ui_open/ui_close) plus 'burst_ready' (a
// meter-state cue that is ours per the design brief). Per-ability/per-hit
// sound (hit_heavy, fire_small, catch_throw/shake/success/fail, faint, ...)
// is battle/presentation.js's job, driven by each ability's fx.sfx hint —
// battleUI never plays those, to avoid double-triggering at integration.
import { bus } from '../core/events.js';
import { G } from '../core/state.js';
import { input } from '../core/input.js';
import { settings } from '../core/settings.js';
import { tween, delay } from '../core/tween.js';
import { clamp, clamp01, easeOutCubic } from '../core/math.js';
import { ASPECTS, effectiveness, effectivenessLabel } from '../data/aspects.js';
import { hpColorFor, creaturePortraitCanvas } from './hud.js';

const sfx = (name) => bus.emit('ui:sfx', { name });

// ---------------------------------------------------------------------------
// Lazy data (owned by parallel agents) — cached after first successful load.
// ---------------------------------------------------------------------------
let _speciesP = null, _abilitiesP = null, _itemsP = null;
const loadSpecies = () =>
  (_speciesP ??= import('../data/creatures.js')
    .then((m) => ({ SPECIES: m.SPECIES ?? {}, XP_CURVES: m.XP_CURVES ?? {} }))
    .catch(() => ({ SPECIES: {}, XP_CURVES: {} })));
const loadAbilities = () =>
  (_abilitiesP ??= import('../data/abilities.js').then((m) => m.ABILITIES ?? {}).catch(() => ({})));
const loadItems = () =>
  (_itemsP ??= import('../data/items.js').then((m) => m.ITEMS ?? {}).catch(() => ({})));
const getSpecies = async () => (await loadSpecies()).SPECIES;
const getXpCurves = async () => (await loadSpecies()).XP_CURVES;

// ---------------------------------------------------------------------------
// Static vocab
// ---------------------------------------------------------------------------
const STATUS_META = {
  burn: { label: 'Burn', color: 'var(--ember)' },
  soak: { label: 'Soak', color: 'var(--tide)' },
  root: { label: 'Root', color: 'var(--bloom)' },
  shock: { label: 'Shock', color: 'var(--volt)' },
  frostbite: { label: 'Frostbite', color: 'var(--frost)' },
  venom: { label: 'Venom', color: 'var(--venom)' },
  blind: { label: 'Blind', color: 'var(--umbra)' },
  dread: { label: 'Dread', color: 'var(--dusk)' },
};
const AURA_META = {
  emberhaze: { label: 'Emberhaze rises', color: 'var(--ember)' },
  tidesurge: { label: 'Tidesurge rolls in', color: 'var(--tide)' },
  gloom: { label: 'A gloom settles', color: 'var(--umbra)' },
};
const STAT_LABEL = { might: 'Might', ward: 'Ward', focus: 'Focus', aegis: 'Aegis', haste: 'Haste' };

const ICONS = {
  fight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 20 18 6"/><path d="M15 6h3v3"/><circle cx="4" cy="20" r="1.3" fill="currentColor" stroke="none"/>
    <path d="M20 20 6 6"/><path d="M9 6H6v3"/><circle cx="20" cy="20" r="1.3" fill="currentColor" stroke="none"/></svg>`,
  switch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 9a7 7 0 0 1 12-4.5M19 4v4h-4"/><path d="M19 15a7 7 0 0 1-12 4.5M5 20v-4h4"/></svg>`,
  bag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 9V7a5 5 0 0 1 10 0v2"/><rect x="4" y="9" width="16" height="11" rx="2.5"/><path d="M4 13.2h16"/></svg>`,
  catch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="7.2"/><path d="M4.8 12h14.4M12 4.8a9.2 9.2 0 0 1 0 14.4 9.2 9.2 0 0 1 0-14.4Z" opacity=".5"/>
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>`,
  flee: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="M13 8l5 4-5 4M18 12H9"/></svg>`,
  burst: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l2.3 6.9L21 11l-6.7 2.1L12 20l-2.3-6.9L3 11l6.7-2.1L12 2Z"/></svg>`,
};
const RING_ACTIONS = [
  { act: 'fight', label: 'Fight', icon: ICONS.fight },
  { act: 'switch', label: 'Kindred', icon: ICONS.switch },
  { act: 'bag', label: 'Bag', icon: ICONS.bag },
  { act: 'catch', label: 'Attune', icon: ICONS.catch },
  { act: 'flee', label: 'Flee', icon: ICONS.flee },
];

const cssColor = (n) => (typeof n === 'number' ? `#${n.toString(16).padStart(6, '0')}` : (n || '#c8c2b8'));
const setFillBar = (el, frac) => { if (!el) return; el.style.width = `${clamp01(frac) * 100}%`; el.style.background = hpColorFor(frac); };
const setGhostBar = (el, frac) => { if (!el) return; el.style.width = `${clamp01(frac) * 100}%`; };

const TEMPLATE = `
  <div class="bui-aura hidden"><span class="bui-aura-dot"></span><span class="bui-aura-name"></span></div>

  <div class="bui-plate bui-plate-e">
    <div class="bui-plate-top"><span class="bui-mon-name"></span><span class="bui-mon-lv"></span></div>
    <div class="bui-chips"></div>
    <div class="bui-hpbar"><div class="bui-hp-ghost"></div><div class="bui-hp-fill"></div></div>
    <div class="bui-status-row"></div>
  </div>

  <div class="bui-plate bui-plate-p">
    <div class="bui-plate-top"><span class="bui-mon-name"></span><span class="bui-mon-lv"></span></div>
    <div class="bui-chips"></div>
    <div class="bui-hpbar"><div class="bui-hp-ghost"></div><div class="bui-hp-fill"></div></div>
    <div class="bui-status-row"></div>
    <div class="bui-xpbar"><div class="bui-xp-fill"></div></div>
    <div class="bui-burst">
      <div class="bui-burst-track"><div class="bui-burst-fill"></div></div>
      <span class="bui-burst-label">Burst</span>
    </div>
  </div>

  <div class="bui-log"></div>
  <div class="bui-dmg-layer"></div>
  <div class="bui-catch-pips hidden"><span></span><span></span><span></span></div>
  <div class="bui-burstflash hidden"></div>

  <div class="bui-vs hidden">
    <div class="bui-vs-half bui-vs-left"><span></span></div>
    <div class="bui-vs-half bui-vs-right"><span></span></div>
    <div class="bui-vs-title"></div>
  </div>

  <div class="bui-dock hidden">
    <div class="bui-ring-wrap"><div class="bui-ring"></div></div>

    <div class="bui-panel bui-panel-moves hidden">
      <div class="bui-grid bui-moves-grid"></div>
      <button type="button" class="bui-back">&lsaquo; Back</button>
    </div>

    <div class="bui-panel bui-panel-switch hidden">
      <div class="bui-list bui-switch-list"></div>
      <button type="button" class="bui-back">&lsaquo; Back</button>
    </div>

    <div class="bui-panel bui-panel-bag hidden">
      <div class="bui-bag-tabs">
        <button type="button" data-tab="restoratives" class="active">Restoratives</button>
        <button type="button" data-tab="charms">Charms</button>
      </div>
      <div class="bui-list bui-bag-list"></div>
      <button type="button" class="bui-back">&lsaquo; Back</button>
    </div>

    <div class="bui-panel bui-panel-target hidden">
      <div class="bui-target-hint"></div>
      <div class="bui-list bui-target-list"></div>
      <button type="button" class="bui-back">&lsaquo; Back</button>
    </div>
  </div>

  <div class="bui-end bui-victory hidden"></div>
  <div class="bui-end bui-defeat hidden"></div>
`;

export function createBattleUI(ctx = {}) {
  const cfg = ctx?.config ?? ctx ?? {};

  let root = null, els = null, mounted = false;
  const plates = {
    e: { mon: null, name: '', hpFrac: 1, hpSeq: 0, els: {} },
    p: { mon: null, name: '', hpFrac: 1, hpSeq: 0, burstFrac: 0, xpFrac: 0, els: {} },
  };
  const xpLog = new Map(); // uid -> { amount, levelups, mon }
  let logItems = [];
  let unsub = [];
  let nav = null;            // { items, idx, orientation:'h'|'v'|'grid', cols, onSelect, onCancel }
  let navGpTimer = null, navGpLast = 0;
  let panelMode = null;      // 'ring'|'moves'|'switch'|'bag'|'target'|null
  let currentView = null;
  let pendingResolve = null;
  let itemsCache = null;

  // ---- small DOM/query helpers ------------------------------------------
  function queryEls() {
    els = {
      aura: root.querySelector('.bui-aura'), auraName: root.querySelector('.bui-aura-name'),
      log: root.querySelector('.bui-log'), dmgLayer: root.querySelector('.bui-dmg-layer'),
      catchPips: root.querySelector('.bui-catch-pips'), burstFlash: root.querySelector('.bui-burstflash'),
      vs: root.querySelector('.bui-vs'), vsLeft: root.querySelector('.bui-vs-left span'),
      vsRight: root.querySelector('.bui-vs-right span'), vsTitle: root.querySelector('.bui-vs-title'),
      dock: root.querySelector('.bui-dock'), ringWrap: root.querySelector('.bui-ring-wrap'), ring: root.querySelector('.bui-ring'),
      panelMoves: root.querySelector('.bui-panel-moves'), movesGrid: root.querySelector('.bui-moves-grid'),
      panelSwitch: root.querySelector('.bui-panel-switch'), switchList: root.querySelector('.bui-switch-list'),
      panelBag: root.querySelector('.bui-panel-bag'), bagTabs: root.querySelector('.bui-bag-tabs'), bagList: root.querySelector('.bui-bag-list'),
      panelTarget: root.querySelector('.bui-panel-target'), targetHint: root.querySelector('.bui-target-hint'), targetList: root.querySelector('.bui-target-list'),
      victory: root.querySelector('.bui-victory'), defeat: root.querySelector('.bui-defeat'),
    };
    for (const side of ['e', 'p']) {
      const scope = root.querySelector(`.bui-plate-${side}`);
      plates[side].els = {
        plate: scope, name: scope.querySelector('.bui-mon-name'), lv: scope.querySelector('.bui-mon-lv'),
        chips: scope.querySelector('.bui-chips'), hpFill: scope.querySelector('.bui-hp-fill'), hpGhost: scope.querySelector('.bui-hp-ghost'),
        statusRow: scope.querySelector('.bui-status-row'),
        xpFill: scope.querySelector('.bui-xp-fill'), burstWrap: scope.querySelector('.bui-burst'), burstFill: scope.querySelector('.bui-burst-fill'),
      };
    }
  }

  // ---- navigation (keyboard / gamepad / pointer, one active menu at a time)
  function stopNavGamepadPoll() { if (navGpTimer) { clearInterval(navGpTimer); navGpTimer = null; } }
  function startNavGamepadPoll() {
    stopNavGamepadPoll();
    navGpTimer = setInterval(() => {
      if (!nav) return stopNavGamepadPoll();
      const { x = 0, y = 0 } = input.axes || {};
      const now = performance.now();
      if (now - navGpLast < 180) return;
      if (Math.abs(x) > 0.55) { navGpLast = now; moveNav(x > 0 ? 1 : -1, 0); }
      else if (Math.abs(y) > 0.55) { navGpLast = now; moveNav(0, y > 0 ? 1 : -1); }
    }, 55);
  }
  function refreshNavFocus() { nav?.items.forEach((el, i) => el.classList.toggle('focused', i === nav.idx)); }
  function setNav(items, { orientation = 'h', cols = 1, onSelect, onCancel, startIdx = 0 } = {}) {
    nav = { items, idx: Math.min(startIdx, Math.max(0, items.length - 1)), orientation, cols, onSelect, onCancel };
    items.forEach((el, i) => {
      el.classList.toggle('focused', i === nav.idx);
      el.onpointerenter = () => { if (nav) { nav.idx = i; refreshNavFocus(); } };
      el.onclick = (ev) => { ev.stopPropagation(); if (!nav) return; nav.idx = i; confirmNav(); };
    });
    startNavGamepadPoll();
  }
  function moveNav(dx, dy) {
    if (!nav || !nav.items.length) return;
    let i = nav.idx;
    if (nav.orientation === 'h') i = (i + dx + nav.items.length) % nav.items.length;
    else if (nav.orientation === 'v') i = (i + dy + nav.items.length) % nav.items.length;
    else {
      const cols = nav.cols || 1, rows = Math.ceil(nav.items.length / cols);
      let col = i % cols, row = (i / cols) | 0;
      if (dx) col = (col + dx + cols) % cols;
      if (dy) row = (row + dy + rows) % rows;
      i = Math.min(nav.items.length - 1, row * cols + col);
    }
    if (i !== nav.idx) { nav.idx = i; refreshNavFocus(); sfx('ui_move'); }
  }
  function confirmNav() { nav?.onSelect?.(nav.idx); }
  function cancelNav() { nav?.onCancel?.(); }

  // ---- stage switching (ring / sub-panels / hidden) ----------------------
  function setStage(which) {
    panelMode = which;
    els.dock.classList.toggle('hidden', which === null);
    const map = { ring: els.ringWrap, moves: els.panelMoves, switch: els.panelSwitch, bag: els.panelBag, target: els.panelTarget };
    for (const [k, el] of Object.entries(map)) el.classList.toggle('hidden', k !== which);
  }
  const hideDock = () => setStage(null);

  // ---- action ring ---------------------------------------------------------
  function buildRing(view) {
    els.ring.innerHTML = '';
    const items = RING_ACTIONS.map((a) => {
      const disabled = (a.act === 'catch' && !view.canCatch) || (a.act === 'flee' && !view.canFlee);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bui-card' + (disabled ? ' disabled' : '');
      btn.innerHTML = `<span class="bui-card-icon">${a.icon}</span><span class="bui-card-label">${a.label}</span>`;
      els.ring.appendChild(btn);
      return btn;
    });
    setNav(items, {
      orientation: 'h',
      onSelect: (i) => {
        const a = RING_ACTIONS[i];
        const disabled = (a.act === 'catch' && !view.canCatch) || (a.act === 'flee' && !view.canFlee);
        if (disabled) { sfx('ui_cancel'); return; }
        sfx('ui_confirm');
        if (a.act === 'fight') openMoves(view);
        else if (a.act === 'switch') openSwitch(view, {});
        else if (a.act === 'bag') openBag(view, 'restoratives');
        else if (a.act === 'catch') openBag(view, 'charms');
        else if (a.act === 'flee') resolveWith({ type: 'flee' });
      },
      onCancel: null,
    });
  }
  function showRing(view) { setStage('ring'); buildRing(view); }
  function backToRing() { showRing(currentView); }

  // ---- Fight: move grid ----------------------------------------------------
  async function openMoves(view) {
    setStage('moves');
    sfx('ui_open');
    const myMode = (panelMode = 'moves');
    const [ABILITIES, SPECIES] = await Promise.all([loadAbilities(), getSpecies()]);
    if (panelMode !== myMode) return; // user backed out mid-load
    const self = view.self || {};
    const foeSpecies = SPECIES[view.foe?.speciesId];
    const showEff = !!(view.foe?.speciesId && G.codex[view.foe.speciesId] === 'caught');
    els.movesGrid.innerHTML = '';
    const items = [];
    for (const id of self.moves || []) {
      const ab = ABILITIES[id];
      const aspect = ab?.aspect || 'neutral';
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'bui-move-card';
      card.style.setProperty('--move-color', cssColor(ASPECTS[aspect]?.color));
      const powerTxt = !ab || ab.kind === 'status' || !ab.power ? '—' : ab.power;
      const accTxt = !ab || (ab.accuracy ?? 100) >= 999 ? '—' : (ab.accuracy ?? 100);
      let effPip = '';
      if (showEff && foeSpecies) {
        const mult = effectiveness(aspect, foeSpecies.aspects || ['neutral']);
        const lbl = effectivenessLabel(mult);
        if (lbl !== 'normal') {
          const txt = lbl === 'super' ? '▲ Strong' : lbl === 'weak' ? '▽ Weak' : '✕ No effect';
          effPip = `<span class="bui-eff bui-eff-${lbl}">${txt}</span>`;
        }
      }
      card.innerHTML = `
        <div class="bui-move-top"><span class="bui-move-name">${ab?.name ?? id}</span><span class="aspect-chip chip-${aspect} mini">${ASPECTS[aspect]?.icon ?? ''}</span></div>
        <div class="bui-move-stats"><span>PWR ${powerTxt}</span><span>ACC ${accTxt}</span></div>
        ${effPip}`;
      els.movesGrid.appendChild(card);
      items.push(card);
      card._resolve = () => resolveWith({ type: 'move', moveId: id });
    }
    if ((self.burstCharge ?? 0) >= 100) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'bui-move-card bui-burst-card';
      card.innerHTML = `<div class="bui-move-top"><span class="bui-move-name">Resonant Burst</span>${ICONS.burst}</div><div class="bui-move-stats"><span>Signature move</span></div>`;
      els.movesGrid.appendChild(card);
      items.push(card);
      card._resolve = () => resolveWith({ type: 'burst' });
    }
    if (!items.length) els.movesGrid.innerHTML = '<div class="bui-empty">No moves ready.</div>';
    setNav(items, {
      orientation: 'grid', cols: Math.min(items.length, 4) || 1,
      onSelect: (i) => items[i]._resolve?.(),
      onCancel: () => { sfx('ui_cancel'); backToRing(); },
    });
  }

  // ---- Kindred: switch drawer ----------------------------------------------
  async function openSwitch(view, { forced = false } = {}) {
    setStage('switch');
    els.dock.classList.toggle('force-switch', forced);
    if (!forced) sfx('ui_open');
    const myMode = (panelMode = 'switch');
    const SPECIES = await getSpecies();
    if (panelMode !== myMode) return;
    const party = view.party || G.party || [];
    const selfUid = view.self?.uid;
    els.switchList.innerHTML = '';
    const items = [];
    party.forEach((m, idx) => {
      const fainted = (m.hp ?? 0) <= 0, active = m.uid === selfUid;
      const disabled = fainted || active;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'bui-party-card' + (disabled ? ' disabled' : '');
      const frac = clamp01((m.hp ?? 0) / (m.maxHp || 1));
      const tag = active ? '<span class="bui-party-tag">Active</span>' : fainted ? '<span class="bui-party-tag down">Fainted</span>' : '';
      card.innerHTML = `
        <span class="bui-party-portrait"></span>
        <span class="bui-party-meta">
          <span class="bui-party-name">${m.nickname || SPECIES[m.speciesId]?.name || m.speciesId}</span>
          <span class="bui-party-lv">Lv ${m.level ?? 1}</span>
          <span class="bui-party-hpbar"><span style="width:${frac * 100}%;background:${hpColorFor(frac)}"></span></span>
        </span>${tag}`;
      card.querySelector('.bui-party-portrait').appendChild(creaturePortraitCanvas(m.speciesId, 44));
      els.switchList.appendChild(card);
      items.push(card);
      card._resolve = disabled ? null : () => resolveWith({ type: 'switch', index: idx });
    });
    if (!items.length) els.switchList.innerHTML = '<div class="bui-empty">No other Kindred to call.</div>';
    setNav(items, {
      orientation: 'v',
      onSelect: (i) => { const it = items[i]; if (it.classList.contains('disabled')) { sfx('ui_cancel'); return; } it._resolve?.(); },
      onCancel: forced ? null : () => { sfx('ui_cancel'); backToRing(); },
    });
  }

  // ---- Bag: restoratives / charms -----------------------------------------
  async function openBag(view, section = 'restoratives') {
    setStage('bag');
    sfx('ui_open');
    setBagTab(section);
    const myMode = (panelMode = 'bag');
    itemsCache ??= await loadItems();
    if (panelMode !== myMode) return;
    renderBagList(view, section);
  }
  function setBagTab(section) {
    els.bagTabs.querySelectorAll('button[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === section));
  }
  function renderBagList(view, section) {
    const bag = view.bag || G.bag || {};
    const entries = Object.entries(bag)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ id, qty, def: itemsCache?.[id] }))
      .filter((e) => (section === 'charms' ? e.def?.kind === 'charm' : (e.def ? e.def.kind === 'restorative' : true)))
      .sort((a, b) => (a.def?.price ?? 0) - (b.def?.price ?? 0));
    els.bagList.innerHTML = '';
    const items = [];
    if (!entries.length) els.bagList.innerHTML = `<div class="bui-empty">${section === 'charms' ? 'No Charms in hand.' : 'Nothing to use.'}</div>`;
    for (const e of entries) {
      const disabled = section === 'charms' && !view.canCatch;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'bui-item-card' + (disabled ? ' disabled' : '');
      const glyph = section === 'charms' ? '✦' : (/vigil/.test(e.id) ? '✝' : /remedy/.test(e.id) ? '⚕' : '✡');
      card.innerHTML = `
        <span class="bui-item-icon" style="color:${section === 'charms' ? 'var(--gold)' : 'var(--ok)'}">${glyph}</span>
        <span class="bui-item-meta"><span class="bui-item-name">${e.def?.name ?? e.id}</span><span class="bui-item-desc">${e.def?.desc ?? ''}</span></span>
        <span class="bui-item-qty">×${e.qty}</span>`;
      els.bagList.appendChild(card);
      items.push(card);
      card._resolve = () => {
        if (disabled) { sfx('ui_cancel'); return; }
        if (section === 'charms') resolveWith({ type: 'catch', charmId: e.id });
        else openTargetPicker(view, e);
      };
    }
    setNav(items, {
      orientation: 'v',
      onSelect: (i) => items[i]._resolve?.(),
      onCancel: () => { sfx('ui_cancel'); backToRing(); },
    });
  }
  // (bag-tab clicks are wired in mount(), once `els` exists)

  // ---- item target picker ---------------------------------------------------
  async function openTargetPicker(view, entry) {
    setStage('target');
    sfx('ui_open');
    const myMode = (panelMode = 'target');
    els.targetHint.textContent = `Use ${entry.def?.name ?? entry.id} on...`;
    const SPECIES = await getSpecies();
    if (panelMode !== myMode) return;
    const party = view.party || G.party || [];
    const wantsFainted = /vigil/.test(entry.id) || !!entry.def?.effect?.revive;
    els.targetList.innerHTML = '';
    const items = [];
    party.forEach((m) => {
      const fainted = (m.hp ?? 0) <= 0;
      const eligible = wantsFainted ? fainted : !fainted;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'bui-party-card' + (eligible ? '' : ' disabled');
      const frac = clamp01((m.hp ?? 0) / (m.maxHp || 1));
      card.innerHTML = `
        <span class="bui-party-portrait"></span>
        <span class="bui-party-meta">
          <span class="bui-party-name">${m.nickname || SPECIES[m.speciesId]?.name || m.speciesId}</span>
          <span class="bui-party-hpbar"><span style="width:${frac * 100}%;background:${hpColorFor(frac)}"></span></span>
        </span>`;
      card.querySelector('.bui-party-portrait').appendChild(creaturePortraitCanvas(m.speciesId, 40));
      els.targetList.appendChild(card);
      items.push(card);
      card._resolve = eligible ? () => resolveWith({ type: 'item', itemId: entry.id, targetUid: m.uid }) : null;
    });
    setNav(items, {
      orientation: 'v',
      onSelect: (i) => { const it = items[i]; if (it.classList.contains('disabled')) { sfx('ui_cancel'); return; } it._resolve?.(); },
      onCancel: () => { sfx('ui_cancel'); openBag(view, 'restoratives'); },
    });
  }

  // ---- action resolution -----------------------------------------------------
  function resolveWith(action) {
    if (!pendingResolve) return;
    const r = pendingResolve;
    pendingResolve = null;
    nav = null;
    stopNavGamepadPoll();
    hideDock();
    r(action);
  }

  async function getAction(view = {}) {
    currentView = view;
    if (view.self) await syncPlateFromView('p', view.self);
    if (view.foe) await syncPlateFromView('e', view.foe);
    return new Promise((resolve) => {
      pendingResolve = resolve;
      const mustSwitch = view.mustSwitch === true || !view.self || (view.self.hp ?? 0) <= 0;
      if (mustSwitch) openSwitch(view, { forced: true });
      else showRing(view);
    });
  }

  async function syncPlateFromView(sideKey, monView) {
    const p = plates[sideKey];
    if (p.mon && p.mon.uid === monView.uid) return; // already tracked via 'send'/hit events
    const SPECIES = await getSpecies();
    ensurePlateMon(sideKey, monView, SPECIES);
  }

  // ---- plate rendering --------------------------------------------------
  function ensurePlateMon(sideKey, mon, SPECIES) {
    const p = plates[sideKey];
    p.mon = mon;
    p.name = mon.nickname || SPECIES[mon.speciesId]?.name || mon.speciesId || '???';
    p.els.name.textContent = p.name;
    p.els.lv.textContent = `Lv ${mon.level ?? 1}`;
    const aspects = SPECIES[mon.speciesId]?.aspects ?? ['neutral'];
    p.els.chips.innerHTML = aspects.map((a) => `<span class="aspect-chip chip-${a} mini">${ASPECTS[a]?.icon ?? ''} ${ASPECTS[a]?.name ?? a}</span>`).join('');
    const frac = clamp01((mon.hp ?? mon.maxHp ?? 1) / (mon.maxHp || 1));
    p.hpSeq = (p.hpSeq || 0) + 1;
    setFillBar(p.els.hpFill, frac);
    setGhostBar(p.els.hpGhost, frac);
    p.hpFrac = frac;
    renderStatus(p, mon.status);
    p.els.plate.classList.toggle('fainted', frac <= 0);
    p.els.plate.classList.remove('shake');
    p.els.plate.classList.add('populated');
    if (sideKey === 'p') {
      updateBurst(p, mon.burstCharge ?? 0, { instant: true });
      updateXpSliver(p, mon, { instant: true });
    }
  }
  function renderStatus(p, status) {
    const meta = status && STATUS_META[status];
    p.els.statusRow.innerHTML = meta ? `<span class="bui-status-badge" style="--sc:${meta.color}">${meta.label}</span>` : '';
  }
  function popStatus(p, status) {
    renderStatus(p, status);
    p.els.statusRow.firstElementChild?.classList.add('pop');
  }
  function popStatStage(p, stat, delta) {
    if (!delta) return;
    const el = document.createElement('div');
    el.className = `bui-stage-pop ${delta > 0 ? 'up' : 'down'}`;
    el.textContent = `${delta > 0 ? '▲' : '▼'} ${STAT_LABEL[stat] ?? stat}`;
    p.els.plate.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 850);
  }
  function popLevelUp(p) {
    const el = document.createElement('div');
    el.className = 'bui-lvup-pop';
    el.textContent = 'LEVEL UP!';
    p.els.plate.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, 1300);
  }
  function shakePlate(p) {
    p.els.plate.classList.remove('shake');
    void p.els.plate.offsetWidth;
    p.els.plate.classList.add('shake');
  }

  // Damage-ghost HP bar: colored fill snaps to the new value immediately (the
  // hit); a pale ghost sliver lags 150ms then drains after it over 450ms.
  // Healing rises both bars together with no lag (nothing to "trail").
  function animateHp(p, toFracRaw) {
    const toFrac = clamp01(toFracRaw);
    const fromFrac = p.hpFrac ?? toFrac;
    const seq = ++p.hpSeq;
    if (toFrac >= fromFrac) {
      tween({ from: fromFrac, to: toFrac, dur: 0.35, ease: easeOutCubic, onUpdate: (v) => { if (seq === p.hpSeq) { setFillBar(p.els.hpFill, v); setGhostBar(p.els.hpGhost, v); } } });
    } else {
      setFillBar(p.els.hpFill, toFrac);
      delay(0.15).then(() => {
        if (seq !== p.hpSeq) return;
        tween({ from: fromFrac, to: toFrac, dur: 0.45, ease: easeOutCubic, onUpdate: (v) => { if (seq === p.hpSeq) setGhostBar(p.els.hpGhost, v); } });
      });
    }
    p.hpFrac = toFrac;
  }

  function updateBurst(p, chargePct, { instant = false } = {}) {
    if (!p.els.burstFill) return;
    const frac = clamp01((chargePct ?? 0) / 100);
    if (instant) p.els.burstFill.style.width = `${frac * 100}%`;
    else tween({ from: p.burstFrac ?? frac, to: frac, dur: 0.4, ease: easeOutCubic, onUpdate: (v) => { p.els.burstFill.style.width = `${v * 100}%`; } });
    p.burstFrac = frac;
    p.els.burstWrap?.classList.toggle('ready', frac >= 1);
  }

  async function updateXpSliver(p, mon, { instant = false } = {}) {
    if (!p.els.xpFill) return;
    const [SPECIES, XP_CURVES] = await Promise.all([getSpecies(), getXpCurves()]);
    const sp = SPECIES[mon.speciesId];
    const curve = XP_CURVES?.[sp?.growth ?? 'medium'];
    if (!Array.isArray(curve) || !curve.length) return; // creature data not ready yet
    const lvl = clamp(mon.level ?? 1, 1, curve.length - 1);
    const cur = curve[lvl] ?? 0, next = curve[lvl + 1] ?? cur + 100;
    const frac = clamp01(((mon.xp ?? cur) - cur) / Math.max(1, next - cur));
    if (instant) p.els.xpFill.style.width = `${frac * 100}%`;
    else tween({ from: p.xpFrac ?? frac, to: frac, dur: 0.6, ease: easeOutCubic, onUpdate: (v) => { p.els.xpFill.style.width = `${v * 100}%`; } });
    p.xpFrac = frac;
  }

  // ---- log ----------------------------------------------------------------
  function log(text) {
    if (!text || !els?.log) return;
    const line = document.createElement('div');
    line.className = 'bui-log-line';
    line.textContent = text;
    els.log.appendChild(line);
    logItems.push(line);
    requestAnimationFrame(() => line.classList.add('show'));
    setTimeout(() => {
      line.classList.remove('show');
      line.classList.add('out');
      setTimeout(() => { line.remove(); logItems = logItems.filter((l) => l !== line); }, 300);
    }, 1700);
    while (logItems.length > 2) logItems.shift()?.remove();
  }
  function resetLog() { logItems.forEach((l) => l.remove()); logItems = []; els.log.innerHTML = ''; }

  // ---- damage numbers -------------------------------------------------------
  function showDamage(xPct, yPct, text, kind = 'normal') {
    if (!els?.dmgLayer) return;
    if (!settings.showDamageNumbers && kind !== 'heal') return;
    const el = document.createElement('div');
    el.className = `bui-dmg bui-dmg-${kind}`;
    el.style.left = `${xPct}%`;
    el.style.top = `${yPct}%`;
    el.textContent = text;
    els.dmgLayer.appendChild(el);
    requestAnimationFrame(() => el.classList.add('go'));
    setTimeout(() => el.remove(), 1000);
  }

  // ---- aura banner ------------------------------------------------------
  function showAura(kind) {
    const meta = AURA_META[kind];
    if (!meta || !els?.aura) return;
    els.aura.style.setProperty('--ac', meta.color);
    els.auraName.textContent = meta.label;
    els.aura.classList.remove('hidden');
    void els.aura.offsetWidth;
    els.aura.classList.add('show');
  }
  function hideAura() {
    if (!els?.aura) return;
    els.aura.classList.remove('show');
    setTimeout(() => els.aura.classList.add('hidden'), 320);
  }
  function flashBurst() {
    if (!els?.burstFlash) return;
    els.burstFlash.classList.remove('hidden');
    void els.burstFlash.offsetWidth;
    els.burstFlash.classList.add('go');
    setTimeout(() => { els.burstFlash.classList.remove('go'); els.burstFlash.classList.add('hidden'); }, 700);
  }

  async function onCatchAttempt(ev) {
    const total = Math.max(0, Math.min(3, ev.shakes ?? 0));
    els.catchPips?.classList.remove('hidden');
    [...(els.catchPips?.children || [])].forEach((c) => c.classList.remove('lit'));
    log('The Charm draws still...');
    for (let i = 0; i < total; i++) {
      await delay(0.48);
      els.catchPips?.children[i]?.classList.add('lit');
    }
    await delay(0.4);
    els.catchPips?.classList.add('hidden');
    log(ev.success ? 'Attunement complete — a bond is formed!' : 'The Charm springs open — it broke free!');
  }

  async function onXp(ev) {
    if (!ev?.mon) return;
    const uid = ev.mon.uid ?? ev.mon;
    const prev = xpLog.get(uid) || { amount: 0, levelups: [] };
    xpLog.set(uid, { amount: prev.amount + (ev.amount ?? 0), levelups: [...prev.levelups, ...(ev.levelups ?? [])], mon: ev.mon });
    if (plates.p.mon && plates.p.mon.uid === uid) {
      plates.p.mon.xp = ev.mon.xp ?? plates.p.mon.xp;
      plates.p.mon.level = ev.mon.level ?? plates.p.mon.level;
      await updateXpSliver(plates.p, plates.p.mon);
      if (ev.levelups?.length) { plates.p.els.lv.textContent = `Lv ${plates.p.mon.level}`; popLevelUp(plates.p); }
    }
  }

  function onFaint(side) {
    const p = plates[side];
    p.els.plate.classList.add('fainted');
    animateHp(p, 0);
    log(`${p.name || 'The Kindred'} has fallen...`);
  }

  // ---- top-level event handler --------------------------------------------
  async function handleEvent(ev) {
    if (!ev || !mounted) return;
    switch (ev.type) {
      case 'intro': {
        resetLog();
        await doVsCard();
        break;
      }
      case 'send': {
        const SPECIES = await getSpecies();
        ensurePlateMon(ev.side, ev.mon, SPECIES);
        log(`${plates[ev.side].name} takes the field!`);
        break;
      }
      case 'recall': log(`${plates[ev.side].name} is called back.`); break;
      case 'turnStart': break; // presentation paces the beat; nothing to render
      case 'moveUsed': {
        const ABILITIES = await loadAbilities();
        log(`${plates[ev.side].name} used ${ABILITIES[ev.move]?.name ?? ev.move}!`);
        break;
      }
      case 'hit': {
        const p = plates[ev.side];
        if (p.mon) { p.mon.hp = ev.hpLeft; animateHp(p, clamp01(ev.hpLeft / (p.mon.maxHp || 1))); }
        if (ev.eff === 'super') log('A resounding blow — super effective!');
        else if (ev.eff === 'weak') log('The blow lands soft — not very effective...');
        else if (ev.eff === 'immune') log('It has no effect...');
        if (ev.crit) { log('A critical strike!'); shakePlate(p); }
        break;
      }
      case 'miss': log(`${plates[ev.side === 'p' ? 'e' : 'p'].name}'s attack goes wide!`); break;
      case 'statusApplied': {
        const p = plates[ev.side];
        if (p.mon) p.mon.status = ev.status;
        popStatus(p, ev.status);
        log(`${p.name} is afflicted with ${STATUS_META[ev.status]?.label ?? ev.status}!`);
        break;
      }
      case 'statusTick': {
        const p = plates[ev.side];
        if (p.mon) { p.mon.hp = Math.max(0, (p.mon.hp ?? 0) - (ev.dmg ?? 0)); animateHp(p, clamp01(p.mon.hp / (p.mon.maxHp || 1))); }
        log(`${p.name} is hurt by ${STATUS_META[ev.status]?.label ?? ev.status}.`);
        break;
      }
      case 'statStage': popStatStage(plates[ev.side], ev.stat, ev.delta); break;
      case 'heal': {
        const p = plates[ev.side];
        if (p.mon) { p.mon.hp = Math.min(p.mon.maxHp || 0, (p.mon.hp ?? 0) + (ev.amt ?? 0)); animateHp(p, clamp01(p.mon.hp / (p.mon.maxHp || 1))); }
        log(`${p.name} recovers a measure of strength.`);
        break;
      }
      case 'auraStart': showAura(ev.kind); break;
      case 'auraEnd': hideAura(); break;
      case 'burstReady': {
        const p = plates[ev.side];
        if (ev.side === 'p') { updateBurst(p, 100); sfx('burst_ready'); }
        log(`${p.name}'s resonance surges — ready to burst!`);
        break;
      }
      case 'burstUsed': {
        const ABILITIES = await loadAbilities();
        const p = plates[ev.side];
        if (ev.side === 'p') updateBurst(p, 0);
        flashBurst();
        log(`${p.name} unleashes ${ABILITIES[ev.burst]?.name ?? ev.burst}!!`);
        break;
      }
      case 'faint': onFaint(ev.side); break;
      case 'catchAttempt': await onCatchAttempt(ev); break;
      case 'xp': await onXp(ev); break;
      case 'end': break; // battleFlow.js drives showVictory/showDefeat explicitly
      default: break;
    }
  }

  // ---- vs card --------------------------------------------------------------
  async function doVsCard() {
    const enemyTeamLead = cfg.enemyTeam?.[0];
    let enemyLabel = cfg.enemyName ?? null;
    if (!enemyLabel && enemyTeamLead?.speciesId) enemyLabel = (await getSpecies())[enemyTeamLead.speciesId]?.name ?? null;
    await showVsCard({ kind: cfg.kind ?? 'wild', enemyName: enemyLabel ?? 'a wild Kindred', playerName: G.playerName });
  }
  async function showVsCard(names) {
    if (!els?.vs) return;
    const n = typeof names === 'string' ? { title: names } : Array.isArray(names) ? { playerName: names[0], enemyName: names[1] } : (names || {});
    const kind = n.kind ?? cfg.kind ?? 'wild';
    const enemyName = n.enemyName ?? n.enemy ?? cfg.enemyName ?? 'a wild Kindred';
    const playerName = n.playerName ?? n.player ?? G.playerName ?? 'Warden';
    const title = n.title ?? (kind === 'wild' ? `WILD ${String(enemyName).toUpperCase()} APPEARED` : `WARDEN ${String(enemyName).toUpperCase()}`);
    els.vsLeft.textContent = `Warden ${playerName}`;
    els.vsRight.textContent = String(enemyName);
    els.vsTitle.textContent = title;
    els.vs.classList.remove('hidden');
    void els.vs.offsetWidth;
    els.vs.classList.add('show');
    sfx('ui_open');
    await delay(1.1);
    els.vs.classList.remove('show');
    els.vs.classList.add('hide');
    await delay(0.5);
    els.vs.classList.add('hidden');
    els.vs.classList.remove('hide');
  }

  // ---- confirm/click helper used by victory/defeat panels -------------------
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

  async function showVictory(result = {}) {
    hideDock();
    const SPECIES = await getSpecies();
    const rows = [];
    if (xpLog.size) {
      for (const data of xpLog.values()) {
        const mon = data.mon;
        rows.push({ name: mon?.nickname || SPECIES[mon?.speciesId]?.name || mon?.speciesId || 'Kindred', amount: data.amount, levelups: data.levelups });
      }
    } else if (result.xp) {
      rows.push({ name: plates.p.name || 'Your Kindred', amount: result.xp, levelups: [] });
    }
    const caught = result.caught;
    els.victory.innerHTML = `
      <div class="bui-end-card">
        <div class="bui-end-title">Victory</div>
        <div class="bui-end-glim"><span class="bui-end-glim-icon">✦</span><span class="bui-end-glim-num">0</span><span>Glim</span></div>
        <div class="bui-end-xplist">${rows.map((r) => `
          <div class="bui-end-xprow">
            <span class="bui-end-xpname">${r.name}</span>
            <span class="bui-end-xpbar"><span style="width:0%"></span></span>
            <span class="bui-end-xpamt">+${r.amount} XP</span>
            ${r.levelups.length ? '<span class="bui-end-lvup">LEVEL UP!</span>' : ''}
          </div>`).join('')}</div>
        ${caught ? `<div class="bui-end-caught"><span class="bui-end-caught-icon"></span><span>New Kindred attuned: <b>${SPECIES[caught.speciesId]?.name ?? caught.speciesId}</b></span></div>` : ''}
        <div class="bui-end-hint">Press Confirm to continue</div>
      </div>`;
    if (caught) els.victory.querySelector('.bui-end-caught-icon')?.appendChild(creaturePortraitCanvas(caught.speciesId, 46));
    els.victory.classList.remove('hidden');
    void els.victory.offsetWidth;
    els.victory.classList.add('show');
    sfx('ui_open');
    const glimEl = els.victory.querySelector('.bui-end-glim-num');
    tween({ from: 0, to: result.glim ?? 0, dur: 0.9, ease: easeOutCubic, onUpdate: (v) => { if (glimEl) glimEl.textContent = String(Math.round(v)); } });
    els.victory.querySelectorAll('.bui-end-xprow').forEach((row, i) => {
      const bar = row.querySelector('.bui-end-xpbar > span');
      const frac = rows[i]?.levelups?.length ? 0.85 : 0.4;
      setTimeout(() => { if (bar) bar.style.width = `${frac * 100}%`; }, 150 + i * 130);
    });
    await delay(0.6);
    await waitForConfirmClose(els.victory);
    els.victory.classList.remove('show');
    await delay(0.3);
    els.victory.classList.add('hidden');
    els.victory.innerHTML = '';
    sfx('ui_close');
    xpLog.clear();
  }

  async function showDefeat() {
    hideDock();
    els.defeat.innerHTML = `
      <div class="bui-end-card bui-end-card-defeat">
        <div class="bui-end-title">The world dims...</div>
        <div class="bui-end-sub">But a Warden's bond endures. You wake at the last shrine, spirits gathered close.</div>
        <div class="bui-end-hint">Press Confirm to continue</div>
      </div>`;
    els.defeat.classList.remove('hidden');
    void els.defeat.offsetWidth;
    els.defeat.classList.add('show');
    sfx('ui_open');
    await delay(0.7);
    await waitForConfirmClose(els.defeat);
    els.defeat.classList.remove('show');
    await delay(0.3);
    els.defeat.classList.add('hidden');
    els.defeat.innerHTML = '';
    sfx('ui_close');
  }

  // ---- lifecycle --------------------------------------------------------
  function mount() {
    if (mounted) return;
    mounted = true;
    root = document.createElement('div');
    root.className = 'bui-root';
    root.innerHTML = TEMPLATE;
    document.getElementById('ui-root').appendChild(root);
    queryEls();
    setStage(null);
    els.dock.addEventListener('click', (e) => { if (e.target.closest('.bui-back')) cancelNav(); });
    els.bagTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tab]');
      if (!btn || !currentView) return;
      sfx('ui_move');
      setBagTab(btn.dataset.tab);
      renderBagList(currentView, btn.dataset.tab);
    });
    unsub.push(input.onAction('left', () => moveNav(-1, 0)));
    unsub.push(input.onAction('right', () => moveNav(1, 0)));
    unsub.push(input.onAction('up', () => moveNav(0, -1)));
    unsub.push(input.onAction('down', () => moveNav(0, 1)));
    unsub.push(input.onAction('confirm', confirmNav));
    unsub.push(input.onAction('interact', confirmNav));
    unsub.push(input.onAction('cancel', cancelNav));
  }

  function unmount() {
    if (!mounted) return;
    mounted = false;
    unsub.forEach((fn) => fn());
    unsub = [];
    stopNavGamepadPoll();
    nav = null;
    pendingResolve = null;
    xpLog.clear();
    logItems = [];
    root?.remove();
    root = null;
    els = null;
  }

  return { mount, unmount, handleEvent, getAction, showDamage, log, showVictory, showDefeat, showVsCard };
}
