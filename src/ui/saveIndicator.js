// A small corner pill confirming that autosaves reach the player's cloud save
// (claude.ai). Local saves are instant, so the pill only appears in cloud mode.
import { bus } from '../core/events.js';

export function initSaveIndicator() {
  const el = document.createElement('div');
  el.className = 'save-pill';
  el.setAttribute('aria-live', 'polite');
  (document.getElementById('ui-root') ?? document.body).appendChild(el);
  let hideT = null;
  bus.on('storage:status', ({ mode, state }) => {
    clearTimeout(hideT);
    if (state === 'error') { el.classList.remove('show'); return; }
    if (mode !== 'cloud') return;
    if (state === 'saving') {
      el.textContent = 'Saving…';
      el.classList.add('show');
    } else if (state === 'saved' && el.classList.contains('show')) {
      el.textContent = '✦ Saved';
      hideT = setTimeout(() => el.classList.remove('show'), 1400);
    } else {
      el.classList.remove('show');
    }
  });
}
