// LUMENFALL — Save/Load: 4 slot cards (slot 0 = read-only Autosave), overwrite confirm,
// double-confirm delete. showSaveMenu() writes to a chosen slot; showLoadMenu() resolves
// the chosen slot number for the caller to loadGame().
import { bus } from '../core/events.js';
import { G } from '../core/state.js';
import { input } from '../core/input.js';
import { listSaves, saveGame, deleteSave } from '../core/save.js';
import { TAU } from '../core/math.js';
import { ASPECTS } from '../data/aspects.js';

const sfx = (name) => bus.emit('ui:sfx', { name });
const cssHex = (n) => (typeof n === 'number' ? `#${n.toString(16).padStart(6, '0')}` : (n || '#c8c2b8'));

function leadBadge(meta, sp, size = 46) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.round(size * dpr);
  cv.style.width = cv.style.height = `${size}px`;
  const x = cv.getContext('2d');
  x.scale(dpr, dpr);
  const s = size, c1 = cssHex(ASPECTS[sp?.aspects?.[0]]?.color ?? ASPECTS.neutral.color);
  x.save(); x.beginPath(); x.arc(s / 2, s / 2, s * 0.47, 0, TAU); x.clip();
  x.fillStyle = '#161826'; x.fillRect(0, 0, s, s);
  const g = x.createRadialGradient(s * 0.5, s * 0.2, s * 0.04, s * 0.5, s * 0.3, s * 0.85);
  g.addColorStop(0, c1); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalAlpha = 0.55; x.fillStyle = g; x.fillRect(0, 0, s, s); x.globalAlpha = 1;
  const letter = String(sp?.name || meta?.partyLead || meta?.playerName || '?').charAt(0).toUpperCase();
  x.font = `600 ${s * 0.42}px Georgia, serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(242,234,216,0.95)'; x.fillText(letter, s * 0.5, s * 0.53);
  x.restore();
  x.lineWidth = Math.max(1.5, s * 0.05); x.strokeStyle = c1;
  x.beginPath(); x.arc(s / 2, s / 2, s * 0.47 - x.lineWidth / 2, 0, TAU); x.stroke();
  return cv;
}

let _speciesP = null;
const loadSpecies = () => (_speciesP ??= import('../data/creatures.js').then((m) => m.SPECIES ?? {}).catch(() => ({})));

function fmtPlaytime(sec) {
  sec = Math.floor(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function confirmModal(root, title, body, { okLabel = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    const scrim = document.createElement('div');
    scrim.className = 'modal-scrim';
    scrim.innerHTML = `
      <div class="confirm-modal panel">
        <div class="confirm-modal-title"></div>
        <div class="confirm-modal-body"></div>
        <div class="confirm-modal-actions">
          <button class="btn-ghost" data-a="no">Cancel</button>
          <button class="${danger ? 'btn-danger' : 'btn-gold'}" data-a="yes"></button>
        </div>
      </div>`;
    scrim.querySelector('.confirm-modal-title').textContent = title;
    scrim.querySelector('.confirm-modal-body').textContent = body;
    scrim.querySelector('[data-a="yes"]').textContent = okLabel;
    root.appendChild(scrim);
    sfx('ui_open');
    const close = (v) => { scrim.classList.add('out'); setTimeout(() => scrim.remove(), 200); resolve(v); };
    scrim.querySelector('[data-a="no"]').addEventListener('click', () => { sfx('ui_cancel'); close(false); });
    scrim.querySelector('[data-a="yes"]').addEventListener('click', () => { sfx('ui_confirm'); close(true); });
    scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) close(false); });
  });
}

function openSaveUI(mode) {
  return new Promise(async (resolve) => {
    const SPECIES = await loadSpecies();
    const root = document.createElement('div');
    root.className = 'save-root';
    root.innerHTML = `
      <div class="menu-hub-backdrop"></div>
      <div class="save-shell panel">
        <div class="save-shell-title gold-title"></div>
        <div class="save-grid"></div>
        <div class="save-shell-close"><button class="btn-ghost">${mode === 'load' ? 'Cancel' : 'Close'}</button></div>
      </div>
    `;
    document.getElementById('ui-root').appendChild(root);
    root.querySelector('.save-shell-title').textContent = mode === 'load' ? 'Continue Your Journey' : 'Save Your Journey';
    const gridEl = root.querySelector('.save-grid');
    let focusIdx = 0;

    function draw() {
      gridEl.innerHTML = '';
      const saves = listSaves();
      saves.forEach((meta, slot) => {
        const card = document.createElement('div');
        card.className = 'save-card';
        if (slot === 0) card.classList.add('readonly');
        if (slot === focusIdx) card.classList.add('focused');
        if (!meta) {
          card.classList.add('empty');
          card.textContent = slot === 0 ? 'Autosave — empty' : `Slot ${slot} — empty`;
          if (mode === 'save' && slot !== 0) {
            card.classList.remove('empty');
            card.innerHTML = `<div class="save-card-body"><div class="save-card-name">Empty Slot ${slot}</div><div class="save-card-meta">Click to save here</div></div>`;
            card.addEventListener('click', () => doSave(slot));
          }
          gridEl.appendChild(card);
          return;
        }
        const sp = SPECIES[meta.partyLead];
        card.innerHTML = `
          <div class="save-card-portrait"></div>
          <div class="save-card-body">
            <div class="save-card-top"><span class="save-card-name"></span><span class="save-card-tag"></span></div>
            <div class="save-card-meta"></div>
            <div class="save-card-sigils"></div>
          </div>
          <div class="save-card-actions"></div>
        `;
        card.querySelector('.save-card-portrait').appendChild(leadBadge(meta, sp, 46));
        card.querySelector('.save-card-name').textContent = meta.playerName || 'Warden';
        card.querySelector('.save-card-tag').textContent = slot === 0 ? 'Autosave' : `Slot ${slot}`;
        card.querySelector('.save-card-meta').innerHTML =
          `<span>${meta.zone ?? '?'}</span><span>${fmtPlaytime(meta.playtimeSec)}</span>` +
          `<span>${sp?.name ?? meta.partyLead ?? '—'} Lv${meta.leadLevel ?? 0}</span><span>${fmtDate(meta.savedAt)}</span>`;
        const sigilsEl = card.querySelector('.save-card-sigils');
        for (let i = 0; i < 5; i++) { const s = document.createElement('span'); s.textContent = '✦'; if (i < (meta.sigils ?? 0)) s.classList.add('on'); sigilsEl.appendChild(s); }
        const actions = card.querySelector('.save-card-actions');
        if (mode === 'save' && slot !== 0) {
          const ov = document.createElement('button');
          ov.className = 'btn-ghost'; ov.textContent = 'Overwrite';
          ov.addEventListener('click', (e) => { e.stopPropagation(); doSave(slot, true); });
          const del = document.createElement('button');
          del.className = 'icon-btn'; del.textContent = '✕'; del.title = 'Delete';
          del.addEventListener('click', async (e) => {
            e.stopPropagation();
            const ok = await confirmModal(root, 'Delete this save?', 'This cannot be undone.', { okLabel: 'Delete', danger: true });
            if (ok) { deleteSave(slot); sfx('ui_confirm'); bus.emit('notify', { text: `Slot ${slot} deleted.` }); draw(); }
          });
          actions.append(ov, del);
        }
        card.addEventListener('click', () => { focusIdx = slot; onConfirmCard(); });
        gridEl.appendChild(card);
      });
    }

    async function doSave(slot, overwrite = false) {
      if (overwrite) {
        const ok = await confirmModal(root, `Overwrite Slot ${slot}?`, 'Your previous save in this slot will be lost.', { okLabel: 'Overwrite', danger: true });
        if (!ok) return;
      }
      saveGame(slot);
      sfx('glim');
      bus.emit('notify', { text: `Saved to Slot ${slot}.`, icon: '✦' });
      draw();
    }

    function onConfirmCard() {
      const saves = listSaves();
      const meta = saves[focusIdx];
      if (mode === 'load') {
        if (!meta) { sfx('ui_cancel'); return; }
        sfx('ui_confirm');
        close(focusIdx);
      } else if (focusIdx !== 0) {
        doSave(focusIdx, !!meta);
      }
    }

    function close(result) {
      unsubs.forEach((f) => f());
      root.classList.add('out');
      sfx('ui_close');
      setTimeout(() => { root.remove(); resolve(result); }, 220);
    }

    function moveFocus(dir) {
      focusIdx = (focusIdx + dir + 4) % 4;
      sfx('ui_move');
      draw();
    }

    const unsubs = [
      input.onAction('up', () => moveFocus(-1)),
      input.onAction('down', () => moveFocus(1)),
      input.onAction('confirm', onConfirmCard),
      input.onAction('interact', onConfirmCard),
      input.onAction('cancel', () => close(undefined)),
    ];
    root.querySelector('.save-shell-close button').addEventListener('click', () => close(undefined));
    root.querySelector('.menu-hub-backdrop').addEventListener('pointerdown', () => close(undefined));

    draw();
    sfx('ui_open');
  });
}

export function showSaveMenu() { return openSaveUI('save'); }
export function showLoadMenu() { return openSaveUI('load'); }
