// LUMENFALL — Settings: custom sliders/segmented controls/toggles (no default browser
// chrome), full keyboard+gamepad row navigation. showSettings(target?, opts?):
//   target = HTMLElement -> inline mode, returns { destroy(), setActive(active) }
//   target = omitted     -> modal mode, returns a Promise that resolves when closed
import { bus } from '../core/events.js';
import { input } from '../core/input.js';
import { settings, updateSetting } from '../core/settings.js';
import { clamp01 } from '../core/math.js';
import { pushLayer } from './uiStack.js';

const sfx = (name) => bus.emit('ui:sfx', { name });
const DEFAULTS = { musicVol: 0.7, sfxVol: 0.8, quality: 'high', textSpeed: 'normal', camShake: true, invertY: false, showDamageNumbers: true };

function row(label, note) {
  const r = document.createElement('div');
  r.className = 'setting-row';
  r.innerHTML = `<div><div class="setting-label"></div>${note ? `<div class="setting-note"></div>` : ''}</div><div class="setting-control"></div>`;
  r.querySelector('.setting-label').textContent = label;
  if (note) r.querySelector('.setting-note').textContent = note;
  return { el: r, control: r.querySelector('.setting-control') };
}

function buildSlider(control, { value, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'lf-slider-wrap';
  wrap.innerHTML = `<div class="lf-slider"><div class="ls-fill"></div><div class="ls-thumb"></div></div><span class="lsv"></span>`;
  control.appendChild(wrap);
  const slider = wrap.querySelector('.lf-slider');
  const fill = wrap.querySelector('.ls-fill');
  const thumb = wrap.querySelector('.ls-thumb');
  const valEl = wrap.querySelector('.lsv');
  let v = clamp01(value);
  function paint() {
    fill.style.width = `${v * 100}%`;
    thumb.style.left = `${v * 100}%`;
    valEl.textContent = `${Math.round(v * 100)}%`;
  }
  paint();
  function setFromClientX(clientX) {
    const rect = slider.getBoundingClientRect();
    v = clamp01((clientX - rect.left) / rect.width);
    paint();
    onChange(v);
  }
  slider.addEventListener('pointerdown', (e) => {
    slider.setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
    const move = (ev) => setFromClientX(ev.clientX);
    const up = () => { slider.removeEventListener('pointermove', move); slider.removeEventListener('pointerup', up); };
    slider.addEventListener('pointermove', move);
    slider.addEventListener('pointerup', up);
  });
  return {
    el: slider,
    nudge(dir) { v = clamp01(v + dir * 0.05); paint(); onChange(v); },
    setValue(nv) { v = clamp01(nv); paint(); },
    setFocused(f) { slider.classList.toggle('focused', f); },
  };
}

function buildSegmented(control, { options, value, onChange }) {
  const seg = document.createElement('div');
  seg.className = 'segmented';
  control.appendChild(seg);
  let idx = Math.max(0, options.findIndex((o) => o.id === value));
  const btns = options.map((o, i) => {
    const b = document.createElement('button');
    b.textContent = o.label;
    b.className = i === idx ? 'active' : '';
    b.addEventListener('click', () => setIdx(i));
    seg.appendChild(b);
    return b;
  });
  function setIdx(i) {
    idx = (i + options.length) % options.length;
    btns.forEach((b, j) => b.classList.toggle('active', j === idx));
    onChange(options[idx].id);
  }
  return {
    el: seg,
    nudge(dir) { setIdx(idx + dir); },
    setValue(id) { const i = options.findIndex((o) => o.id === id); if (i >= 0) { idx = i; btns.forEach((b, j) => b.classList.toggle('active', j === idx)); } },
    setFocused(f) { btns.forEach((b, j) => b.classList.toggle('focused', f && j === idx)); },
  };
}

function buildToggle(control, { value, onChange }) {
  const t = document.createElement('div');
  t.className = 'lf-toggle' + (value ? ' on' : '');
  t.innerHTML = `<div class="lt-knob"></div>`;
  control.appendChild(t);
  let v = !!value;
  function toggle() { v = !v; t.classList.toggle('on', v); onChange(v); }
  t.addEventListener('click', toggle);
  return { el: t, toggle, setValue(nv) { v = !!nv; t.classList.toggle('on', v); }, setFocused: (f) => t.classList.toggle('focused', f) };
}

function buildPanel(host) {
  const panel = document.createElement('div');
  panel.className = 'settings-panel';
  host.appendChild(panel);
  const rows = [];

  function addSlider(label, key) {
    const r = row(label);
    const c = buildSlider(r.control, { value: settings[key], onChange: (v) => updateSetting(key, v) });
    panel.appendChild(r.el);
    rows.push({ el: r.el, key, ...c, type: 'slider' });
  }
  function addSegmented(label, key, options, note) {
    const r = row(label, note);
    const c = buildSegmented(r.control, { options, value: settings[key], onChange: (v) => { updateSetting(key, v); sfx('ui_move'); } });
    panel.appendChild(r.el);
    rows.push({ el: r.el, key, ...c, type: 'segmented' });
  }
  function addToggle(label, key) {
    const r = row(label);
    const c = buildToggle(r.control, { value: settings[key], onChange: (v) => { updateSetting(key, v); sfx('ui_move'); } });
    panel.appendChild(r.el);
    rows.push({ el: r.el, key, ...c, type: 'toggle' });
  }

  addSlider('Music Volume', 'musicVol');
  addSlider('SFX Volume', 'sfxVol');
  addSegmented('Quality', 'quality', [{ id: 'low', label: 'Low' }, { id: 'med', label: 'Med' }, { id: 'high', label: 'High' }], 'Applies to shadows & pixel ratio');
  addSegmented('Text Speed', 'textSpeed', [{ id: 'slow', label: 'Slow' }, { id: 'normal', label: 'Normal' }, { id: 'fast', label: 'Fast' }, { id: 'instant', label: 'Instant' }]);
  addToggle('Camera Shake', 'camShake');
  addToggle('Invert Y', 'invertY');
  addToggle('Damage Numbers', 'showDamageNumbers');

  const resetWrap = document.createElement('div');
  resetWrap.className = 'settings-reset';
  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn-ghost';
  resetBtn.textContent = 'Reset to Defaults';
  resetBtn.addEventListener('click', () => {
    sfx('ui_confirm');
    for (const r of rows) {
      if (!(r.key in DEFAULTS)) continue;
      updateSetting(r.key, DEFAULTS[r.key]);
      r.setValue(DEFAULTS[r.key]);
    }
  });
  resetWrap.appendChild(resetBtn);
  panel.appendChild(resetWrap);
  // Reset joins the keyboard focus ring like any other row.
  rows.push({
    el: resetWrap, type: 'button', btn: resetBtn,
    setFocused: (f) => resetBtn.classList.toggle('focused', f),
  });

  const credits = document.createElement('div');
  credits.className = 'settings-credits';
  credits.textContent = 'Lumenfall — an original creature RPG. Thank you for playing.';
  panel.appendChild(credits);

  return { panel, rows };
}

function attachNav(rows, root, { onBack } = {}) {
  let idx = 0, active = false;
  function paintFocus() { rows.forEach((r, i) => r.setFocused?.(active && i === idx)); }
  function move(dir) {
    if (!rows.length) return;
    idx = (idx + dir + rows.length) % rows.length;
    sfx('ui_move');
    paintFocus();
    rows[idx].el.scrollIntoView({ block: 'nearest' });
  }
  function nudge(dir) { rows[idx]?.nudge?.(dir); }
  function confirmRow() {
    const r = rows[idx];
    if (!r) return;
    if (r.type === 'toggle') { sfx('ui_confirm'); r.toggle(); }
    else if (r.type === 'button') r.btn?.click();
  }
  const unsubs = [
    input.onAction('up', () => { if (active) move(-1); }),
    input.onAction('down', () => { if (active) move(1); }),
    input.onAction('left', () => { if (active) nudge(-1); }),
    input.onAction('right', () => { if (active) nudge(1); }),
    input.onAction('confirm', () => { if (active) confirmRow(); }),
    input.onAction('cancel', () => { if (active) onBack?.(); }),
  ];
  return {
    setActive(v) { active = v; if (v) idx = 0; paintFocus(); },
    destroy() { unsubs.forEach((f) => f()); },
  };
}

export function showSettings(target, opts = {}) {
  if (target instanceof HTMLElement) {
    const { panel, rows } = buildPanel(target);
    const nav = attachNav(rows, target, opts);
    return {
      setActive(v) { nav.setActive(v); },
      destroy() { nav.destroy(); panel.remove(); },
    };
  }
  return new Promise((resolve) => {
    const scrim = document.createElement('div');
    scrim.className = 'modal-scrim';
    scrim.style.zIndex = 8;
    scrim.innerHTML = `<div class="panel" style="width:min(460px,92vw);max-height:84vh;overflow-y:auto;padding:22px 24px;"></div>`;
    document.getElementById('ui-root').appendChild(scrim);
    const host = scrim.firstElementChild;
    const titleEl = document.createElement('div');
    titleEl.className = 'gold-title';
    titleEl.style.cssText = 'font-size:18px;margin-bottom:14px;';
    titleEl.textContent = 'Settings';
    host.appendChild(titleEl);
    const { panel, rows } = buildPanel(host);
    const closeBtn = document.createElement('div');
    closeBtn.style.cssText = 'display:flex;justify-content:flex-end;margin-top:14px;';
    closeBtn.innerHTML = `<button class="btn-gold">Close</button>`;
    host.appendChild(closeBtn);
    const closeButton = closeBtn.querySelector('button');
    closeButton.addEventListener('click', close);
    // Close is part of the modal's focus ring too.
    rows.push({
      el: closeBtn, type: 'button', btn: closeButton,
      setFocused: (f) => closeButton.classList.toggle('focused', f),
    });
    const nav = attachNav(rows, host, { onBack: close });
    nav.setActive(true);
    scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) close(); });
    const popLayer = pushLayer('settings', close);
    sfx('ui_open');

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      sfx('ui_close');
      nav.destroy();
      popLayer();
      scrim.classList.add('out');
      setTimeout(() => { scrim.remove(); resolve(); }, 220);
    }
  });
}
