// LUMENFALL — pause hub: Party / Codex / Bag / Quests / Save / Settings / Resume.
// Opens on input 'menu' while in the overworld (never during battle/dialogue/cutscene).
// Rail nav (up/down + confirm) selects a tab, which live-mounts its content in the pane;
// confirming again "drills in" and hands keyboard focus to that content until cancel
// bubbles back out. Esc/cancel backs out level by level, exactly one layer at a time.
import { bus } from '../core/events.js';
import { G } from '../core/state.js';
import { input } from '../core/input.js';
import { game } from '../game/game.js';
import { renderParty } from './party.js';
import { renderCodex } from './codexUI.js';
import { renderBag } from './bagUI.js';
import { showSettings } from './settingsUI.js';
import { showSaveMenu } from './saveUI.js';
import { anyLayerOpen, cancelTopLayer } from './uiStack.js';

const sfx = (name) => bus.emit('ui:sfx', { name });

const RAIL = [
  { id: 'party', label: 'Party', kind: 'content' },
  { id: 'codex', label: 'Codex', kind: 'content' },
  { id: 'bag', label: 'Bag', kind: 'content' },
  { id: 'quests', label: 'Quests', kind: 'content' },
  { id: 'save', label: 'Save', kind: 'modal' },
  { id: 'settings', label: 'Settings', kind: 'content' },
  { id: 'unstick', label: 'I’m stuck', kind: 'unstick' },
  { id: 'resume', label: 'Resume', kind: 'resume' },
];

function fmtPlaytime(sec) {
  sec = Math.floor(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

// ---------------------------------------------------------------------------
// Quests pane — built inline (no separate module in the file ownership list).
// ---------------------------------------------------------------------------
function mountQuests(container, opts = {}) {
  let active = false;
  const wrap = document.createElement('div');
  wrap.className = 'quest-pane';
  container.appendChild(wrap);
  let QUESTS = {};

  async function draw() {
    try { QUESTS = (await import('../data/quests.js')).QUESTS ?? {}; }
    catch (e) { QUESTS = {}; }
    const entries = Object.entries(G.quests || {});
    const mains_ = [], sides_ = [], done_ = [];
    for (const [id, prog] of entries) {
      const def = QUESTS[id];
      if (prog?.done) done_.push({ id, def, prog });
      else (def?.main ? mains_ : sides_).push({ id, def, prog });
    }
    wrap.innerHTML = '';
    if (!entries.length) {
      wrap.innerHTML = `<div class="quest-empty">No quests yet — the road will provide.</div>`;
      return;
    }
    const addSection = (label, list, tracked) => {
      const sec = document.createElement('div');
      sec.className = 'quest-section-label';
      sec.textContent = label;
      wrap.appendChild(sec);
      if (!list.length) { wrap.insertAdjacentHTML('beforeend', `<div class="quest-empty">Nothing active.</div>`); return; }
      for (const { id, def, prog } of list) {
        const step = def?.steps?.[Math.min(prog?.step ?? 0, (def?.steps?.length ?? 1) - 1)];
        const d = document.createElement('div');
        d.className = 'quest-entry' + (tracked ? ' tracked' : '');
        d.innerHTML = `<div class="quest-entry-name"></div><div class="quest-entry-step"></div>`;
        d.querySelector('.quest-entry-name').textContent = def?.name ?? id;
        d.querySelector('.quest-entry-step').textContent = step?.text ?? '';
        wrap.appendChild(d);
      }
    };
    addSection('Main Quest', mains_, true);
    addSection('Side Quests', sides_, false);
    if (done_.length) {
      const doneLabel = document.createElement('div');
      doneLabel.className = 'quest-section-label';
      doneLabel.textContent = 'Completed';
      wrap.appendChild(doneLabel);
      for (const { id, def } of done_) {
        const d = document.createElement('div');
        d.className = 'quest-entry done';
        d.innerHTML = `<div class="quest-entry-name"></div>`;
        d.querySelector('.quest-entry-name').textContent = def?.name ?? id;
        wrap.appendChild(d);
      }
    }
  }
  draw();
  const offs = ['quest:started', 'quest:updated', 'quest:completed', 'flag:set'].map((ev) => bus.on(ev, () => draw()));

  const onCancel = () => { if (active) opts.onBack?.(); };
  const unsub = input.onAction('cancel', onCancel);

  return {
    setActive(v) { active = v; },
    destroy() { offs.forEach((o) => o()); unsub(); wrap.remove(); },
  };
}

// ---------------------------------------------------------------------------
// Hub shell
// ---------------------------------------------------------------------------
let hubEl = null, railIdx = 0, layer = 'rail', open_ = false;
let currentHandle = null, currentTabId = null;
let railUnsubs = [];
let dialogueLock = false, letterboxLock = false;

function locked() { return dialogueLock || letterboxLock; }

function ensureDom() {
  if (hubEl) return;
  hubEl = document.createElement('div');
  hubEl.className = 'menu-hub';
  hubEl.innerHTML = `
    <div class="menu-hub-backdrop"></div>
    <div class="menu-shell panel">
      <div class="menu-rail">
        <div class="menu-rail-title gold-title">Menu</div>
        <div class="menu-rail-items"></div>
        <div class="menu-rail-spacer"></div>
        <div class="menu-rail-footer">
          <div class="mf-time"></div>
          <div class="mf-glim"></div>
          <div class="mf-keys">[Enter] Select &middot; [Q/Esc] Back</div>
        </div>
      </div>
      <div class="menu-content"><div class="menu-content-inner"></div></div>
    </div>
  `;
  document.getElementById('ui-root').appendChild(hubEl);
  const list = hubEl.querySelector('.menu-rail-items');
  RAIL.forEach((item, i) => {
    const b = document.createElement('button');
    b.className = 'menu-rail-item';
    b.dataset.id = item.id;
    b.innerHTML = `<span class="ri-mark"></span><span></span>`;
    b.lastElementChild.textContent = item.label;
    b.addEventListener('pointerenter', () => { if (layer === 'rail') setRailIdx(i); });
    b.addEventListener('click', () => { setRailIdx(i); selectRail(); });
    list.appendChild(b);
  });
  hubEl.querySelector('.menu-hub-backdrop').addEventListener('pointerdown', () => { if (layer === 'rail') close(); });
}

function refreshFooter() {
  hubEl.querySelector('.mf-time').textContent = `Playtime ${fmtPlaytime(G.playtimeSec)}`;
  hubEl.querySelector('.mf-glim').textContent = `${G.glim ?? 0} Glim`;
}

function refreshRailVisual() {
  const items = hubEl.querySelectorAll('.menu-rail-item');
  items.forEach((el, i) => {
    el.classList.toggle('active', RAIL[i].id === currentTabId);
    el.classList.toggle('focused', i === railIdx && layer === 'rail');
  });
}

function setRailIdx(i) {
  railIdx = (i + RAIL.length) % RAIL.length;
  refreshRailVisual();
  const item = RAIL[railIdx];
  if (item.kind === 'content') mountTab(item.id);
}

function mountTab(id) {
  if (currentTabId === id) return;
  currentHandle?.destroy?.();
  currentHandle = null;
  currentTabId = id;
  const pane = hubEl.querySelector('.menu-content-inner');
  pane.innerHTML = '';
  const titleEl = document.createElement('div');
  titleEl.className = 'menu-content-title';
  titleEl.textContent = RAIL.find((r) => r.id === id)?.label ?? '';
  pane.appendChild(titleEl);
  const body = document.createElement('div');
  pane.appendChild(body);
  const opts = { onBack: () => backToRail() };
  if (id === 'party') currentHandle = renderParty(body, opts);
  else if (id === 'codex') currentHandle = renderCodex(body, opts);
  else if (id === 'bag') currentHandle = renderBag(body, opts);
  else if (id === 'quests') currentHandle = mountQuests(body, opts);
  else if (id === 'settings') currentHandle = showSettings(body, opts);
  refreshRailVisual();
}

function bindRailInput() {
  unbindRailInput();
  railUnsubs.push(input.onAction('up', () => { sfx('ui_move'); setRailIdx(railIdx - 1); }));
  railUnsubs.push(input.onAction('down', () => { sfx('ui_move'); setRailIdx(railIdx + 1); }));
  railUnsubs.push(input.onAction('right', () => selectRail()));
  railUnsubs.push(input.onAction('confirm', () => selectRail()));
  railUnsubs.push(input.onAction('interact', () => selectRail()));
  railUnsubs.push(input.onAction('cancel', () => close()));
}
function unbindRailInput() { railUnsubs.forEach((f) => f()); railUnsubs = []; }

async function selectRail() {
  const item = RAIL[railIdx];
  if (!item) return;
  if (item.kind === 'resume') { sfx('ui_confirm'); close(); return; }
  // Escape hatch: whatever pinned the Warden — a cutscene that never handed
  // control back, a wedge between props, a camera buried in scenery — this
  // frees them, puts them on open ground and re-seats the camera.
  if (item.kind === 'unstick') {
    sfx('ui_confirm');
    try {
      const w = game.overworld;
      w?.player?.recover?.();
      w?.cameraRig?.recenter?.();
    } catch (e) { console.error('[menus] unstick failed', e); }
    close();
    return;
  }
  if (item.kind === 'modal') {
    sfx('ui_confirm');
    unbindRailInput();
    if (item.id === 'save') await showSaveMenu();
    bindRailInput();
    return;
  }
  // content tab: hand off keyboard focus into the pane.
  mountTab(item.id);
  if (!currentHandle) return;
  sfx('ui_confirm');
  unbindRailInput();
  layer = 'content';
  refreshRailVisual();
  // Activate the pane one tick later: its input handlers were registered when
  // the tab mounted (on rail focus), so activating synchronously would let the
  // very confirm keypress that drilled in also fire inside the pane and
  // activate its first item.
  setTimeout(() => { if (open_ && layer === 'content') currentHandle?.setActive?.(true); }, 0);
}

function backToRail() {
  currentHandle?.setActive?.(false);
  layer = 'rail';
  bindRailInput();
  refreshRailVisual();
}

export function openMenu(tab) {
  if (open_) { if (tab) { const i = RAIL.findIndex((r) => r.id === tab); if (i >= 0) { setRailIdx(i); selectRail(); } } return; }
  if (game.mode !== 'overworld' || locked()) return;
  ensureDom();
  open_ = true;
  layer = 'rail';
  sfx('ui_open');
  game.pause(true);
  hubEl.classList.add('open');
  refreshFooter();
  const startIdx = tab ? Math.max(0, RAIL.findIndex((r) => r.id === tab)) : 0;
  setRailIdx(startIdx);
  bindRailInput();
  if (tab) selectRail();
}

function close() {
  if (!open_) return;
  open_ = false;
  sfx('ui_close');
  unbindRailInput();
  currentHandle?.destroy?.();
  currentHandle = null;
  currentTabId = null;
  hubEl.classList.remove('open');
  game.pause(false);
}

bus.on('dialogue:start', () => { dialogueLock = true; });
bus.on('dialogue:end', () => { dialogueLock = false; });
bus.on('letterbox', ({ on } = {}) => { letterboxLock = !!on; });
bus.on('glim:changed', () => { if (open_) refreshFooter(); });

// Esc routing (finding 6): while ANY overlay layer is open (shop, save,
// settings modal, dialogue, pickers, confirm modals) Esc cancels exactly one
// layer via the ui stack. Inside the hub it acts like Q (back one layer of the
// active pane); the hub only closes fully from the rail.
input.onAction('menu', () => {
  if (anyLayerOpen()) { cancelTopLayer(); return; }
  if (open_) {
    if (layer === 'rail') close();
    else input._fire('cancel'); // Esc == Q inside a pane: back exactly one layer
  } else openMenu();
});

// KeyC — jump straight to the Codex from the overworld (no layer open).
input.onAction('codex', () => {
  if (open_ || anyLayerOpen() || locked()) return;
  if (game.mode !== 'overworld') return;
  openMenu('codex');
});
