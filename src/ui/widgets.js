// LUMENFALL — shared UI widgets: a keyboard/gamepad-navigable list picker and a
// confirm-modal navigator. One implementation reused by party/bag/save UIs so
// every picker gets identical arrow+confirm+cancel behavior and Esc routing
// (each widget registers on the ui layer stack while open).
import { bus } from '../core/events.js';
import { input } from '../core/input.js';
import { pushLayer } from './uiStack.js';

const sfx = (name) => bus.emit('ui:sfx', { name });

/**
 * makeListPicker({ host, title, items, cancelLabel, emptyText, onClose })
 *   items: [{ label, sub, disabled, onPick() }]
 * -> { el, close() }
 * Fully navigable: up/down move, confirm/interact pick, cancel (Q / Esc via the
 * layer stack / Cancel button / gamepad B) closes just this picker.
 */
export function makeListPicker({ host, title, items = [], cancelLabel = 'Cancel', emptyText = null, onClose = null } = {}) {
  let closed = false;
  let focusIdx = Math.max(0, items.findIndex((it) => !it.disabled));

  const overlay = document.createElement('div');
  overlay.className = 'picker-overlay';
  overlay.innerHTML = `<div class="picker-panel panel"><div class="picker-title"></div><div class="picker-list"></div><button class="btn-ghost picker-cancel" style="margin-top:8px;"></button></div>`;
  overlay.querySelector('.picker-title').textContent = title ?? '';
  overlay.querySelector('.picker-cancel').textContent = cancelLabel;
  host.appendChild(overlay);
  const list = overlay.querySelector('.picker-list');

  const rows = items.map((it, i) => {
    const row = document.createElement('div');
    row.className = 'picker-item' + (it.disabled ? ' disabled' : '');
    row.innerHTML = `<span></span><span class="picker-item-sub"></span>`;
    row.firstElementChild.textContent = it.label ?? '';
    row.lastElementChild.textContent = it.sub ?? '';
    row.addEventListener('pointerenter', () => { focusIdx = i; paint(); });
    row.addEventListener('click', () => pick(i));
    list.appendChild(row);
    return row;
  });
  if (!items.length && emptyText) {
    const d = document.createElement('div');
    d.className = 'picker-item-sub';
    d.style.padding = '8px';
    d.textContent = emptyText;
    list.appendChild(d);
  }

  function paint() {
    rows.forEach((r, i) => r.classList.toggle('focused', i === focusIdx));
    rows[focusIdx]?.scrollIntoView({ block: 'nearest' });
  }
  function move(dir) {
    if (!rows.length) return;
    focusIdx = (focusIdx + dir + rows.length) % rows.length;
    sfx('ui_move');
    paint();
  }
  function pick(i) {
    const it = items[i];
    if (closed || !it || it.disabled) return;
    sfx('ui_confirm');
    close();
    it.onPick?.();
  }
  function close() {
    if (closed) return;
    closed = true;
    unsubs.forEach((f) => f());
    popLayer();
    overlay.remove();
    onClose?.();
  }
  function cancel() {
    if (closed) return;
    sfx('ui_cancel');
    close();
  }

  overlay.querySelector('.picker-cancel').addEventListener('click', cancel);
  const unsubs = [
    input.onAction('up', () => move(-1)),
    input.onAction('down', () => move(1)),
    input.onAction('confirm', () => pick(focusIdx)),
    input.onAction('interact', () => pick(focusIdx)),
    input.onAction('cancel', cancel),
  ];
  const popLayer = pushLayer('picker', cancel);
  paint();
  sfx('ui_open');
  return { el: overlay, close };
}

/**
 * makeConfirmNav({ buttons, initial, onCancel }) -> { destroy() }
 * Keyboard/gamepad nav for an already-built confirm modal: arrows move focus
 * between the given button elements, confirm clicks the focused one, cancel
 * calls onCancel. Registers a ui layer so Esc backs out only this modal, and
 * so the caller can gate its own confirm handler while the modal is up.
 */
export function makeConfirmNav({ buttons = [], initial = 0, onCancel = null } = {}) {
  let idx = Math.min(Math.max(0, initial), Math.max(0, buttons.length - 1));
  function paint() { buttons.forEach((b, i) => b.classList.toggle('focused', i === idx)); }
  function move(dir) {
    if (!buttons.length) return;
    idx = (idx + dir + buttons.length) % buttons.length;
    sfx('ui_move');
    paint();
  }
  const unsubs = [
    input.onAction('left', () => move(-1)),
    input.onAction('right', () => move(1)),
    input.onAction('up', () => move(-1)),
    input.onAction('down', () => move(1)),
    input.onAction('confirm', () => buttons[idx]?.click()),
    input.onAction('interact', () => buttons[idx]?.click()),
    input.onAction('cancel', () => onCancel?.()),
  ];
  const popLayer = pushLayer('confirm', () => onCancel?.());
  paint();
  return {
    destroy() { unsubs.forEach((f) => f()); popLayer(); },
  };
}
