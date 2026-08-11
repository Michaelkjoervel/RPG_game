// LUMENFALL — dialogue presentation.
// Bottom letterbox panel: gold serif nameplate, procedural portrait medallion,
// typewriter text (settings.textSpeed, confirm = complete-then-advance),
// navigable choice lists, '{player}' substitution.
//
// Exports:
//   showDialogue(dlg) -> Promise         dlg: { id?, lines: [{speaker, text, portrait?, choices?}] }
//   showDialogueById(id) -> Promise      (resolves DIALOGUES from src/data/dialogues.js)
// Also handles bus 'dialogue:start' {lines, speaker?, onDone?} for ad-hoc lines.
// story.js owns player freezing/letterboxing — this module only renders.
import { bus } from '../core/events.js';
import { G, setFlag } from '../core/state.js';
import { input } from '../core/input.js';
import { settings } from '../core/settings.js';
import { hashStr } from '../core/rng.js';
import { TAU } from '../core/math.js';

const sfx = (name) => bus.emit('ui:sfx', { name });
const CPS = { slow: 22, normal: 46, fast: 96, instant: Infinity };

// Lazy data modules (best-effort: dialogue must render even mid-integration).
let _dialoguesP = null, _npcsP = null;
const loadDialogues = () =>
  (_dialoguesP ??= import('../data/dialogues.js').then((m) => m.DIALOGUES ?? {}).catch(() => ({})));
const loadNpcs = () =>
  (_npcsP ??= import('../data/npcs.js').then((m) => m.NPCS ?? {}).catch(() => ({})));

// ---------------------------------------------------------------------------
// DOM (built once, reused)
// ---------------------------------------------------------------------------
let root = null, els = null;

function ensureDom() {
  if (root) return;
  root = document.createElement('div');
  root.className = 'dlg-root';
  root.innerHTML = `
    <div class="dlg-panel panel">
      <div class="dlg-portrait"></div>
      <div class="dlg-main">
        <div class="dlg-name gold-title"></div>
        <div class="dlg-text"></div>
        <div class="dlg-caret">▾</div>
      </div>
    </div>
    <div class="dlg-choices hidden"></div>
  `;
  document.getElementById('ui-root').appendChild(root);
  els = {
    panel: root.querySelector('.dlg-panel'),
    portrait: root.querySelector('.dlg-portrait'),
    name: root.querySelector('.dlg-name'),
    text: root.querySelector('.dlg-text'),
    caret: root.querySelector('.dlg-caret'),
    choices: root.querySelector('.dlg-choices'),
  };
  els.panel.addEventListener('click', () => onConfirm());
}

// ---------------------------------------------------------------------------
// Portrait medallion — human speakers. Aspect/palette-colored ring, serif
// initial, kind glyph badge (mask for Seekers, sigil star for Keepers...).
// ---------------------------------------------------------------------------
const _portraitCache = new Map();

function paletteColorOf(def, fallbackName) {
  const p = def?.appearance?.palette;
  let c = Array.isArray(p) ? p[0] : p;
  if (typeof c === 'number') c = `#${c.toString(16).padStart(6, '0')}`;
  if (typeof c === 'string' && c) return c;
  // Seeded warm hue from the name so unnamed villagers still feel distinct.
  const h = hashStr(String(fallbackName || '?')) % 360;
  return `hsl(${h} 42% 62%)`;
}

function drawKindGlyph(x, kind, s) {
  x.save();
  x.translate(s * 0.76, s * 0.76);
  x.beginPath();
  x.arc(0, 0, s * 0.16, 0, TAU);
  x.fillStyle = 'rgba(16,18,28,0.95)';
  x.fill();
  x.lineWidth = 1;
  x.strokeStyle = 'rgba(255,233,176,0.4)';
  x.stroke();
  x.strokeStyle = 'rgba(255,233,176,0.9)';
  x.fillStyle = 'rgba(255,233,176,0.9)';
  x.lineWidth = s * 0.02;
  const r = s * 0.09;
  if (kind === 'seeker' || kind === 'order') {
    // Pale mask with dark eye slits
    x.fillStyle = 'rgba(220,218,228,0.92)';
    x.beginPath();
    x.ellipse(0, 0, r * 0.85, r * 1.05, 0, 0, TAU);
    x.fill();
    x.fillStyle = '#14161f';
    x.beginPath();
    x.ellipse(-r * 0.35, -r * 0.15, r * 0.16, r * 0.24, 0, 0, TAU);
    x.ellipse(r * 0.35, -r * 0.15, r * 0.16, r * 0.24, 0, 0, TAU);
    x.fill();
  } else if (kind === 'keeper') {
    // Four-point sigil star
    x.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU - Math.PI / 2, rr = i % 2 === 0 ? r * 1.1 : r * 0.4;
      x[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    x.closePath();
    x.fill();
  } else if (kind === 'rival') {
    // Crossed slashes — friendly duelist
    x.beginPath();
    x.moveTo(-r, r * 0.8); x.lineTo(r * 0.8, -r);
    x.moveTo(-r * 0.4, -r); x.lineTo(r, r * 0.5);
    x.stroke();
  } else if (kind === 'archon') {
    // Cracked halo
    x.beginPath();
    x.arc(0, 0, r * 0.9, -2.6, 0.9);
    x.stroke();
    x.beginPath();
    x.arc(0, 0, r * 0.9, 1.4, 2.2);
    x.stroke();
  } else if (kind === 'merchant') {
    x.beginPath();
    x.arc(0, 0, r * 0.7, 0, TAU);
    x.stroke();
    x.font = `700 ${r * 1.1}px Georgia, serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('g', 0, r * 0.05);
  } else if (kind === 'elder') {
    // Open tome lines
    for (let i = -1; i <= 1; i++) {
      x.beginPath();
      x.moveTo(-r * 0.8, i * r * 0.5);
      x.lineTo(r * 0.8, i * r * 0.5);
      x.stroke();
    }
  } else {
    x.restore();
    return;
  }
  x.restore();
}

function speakerPortraitCanvas(name, def, size = 84) {
  const kind = def?.kind ?? (name === G.playerName ? 'warden' : 'villager');
  const key = `${name}|${kind}|${size}`;
  if (_portraitCache.has(key)) return _portraitCache.get(key);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.round(size * dpr);
  cv.style.width = cv.style.height = `${size}px`;
  const x = cv.getContext('2d');
  x.scale(dpr, dpr);
  const s = size, ring = kind === 'warden' ? '#ffe9b0' : paletteColorOf(def, name);

  x.save();
  x.beginPath();
  x.arc(s / 2, s / 2, s * 0.47, 0, TAU);
  x.clip();
  x.fillStyle = '#141724';
  x.fillRect(0, 0, s, s);
  const g = x.createRadialGradient(s * 0.5, s * 0.2, s * 0.04, s * 0.5, s * 0.42, s * 0.8);
  g.addColorStop(0, ring);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalAlpha = 0.42;
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  x.globalAlpha = 1;
  // Bust silhouette — head + shoulders
  x.fillStyle = 'rgba(9,11,19,0.88)';
  x.beginPath();
  x.arc(s * 0.5, s * 0.42, s * 0.16, 0, TAU);
  x.fill();
  x.beginPath();
  x.ellipse(s * 0.5, s * 0.82, s * 0.3, s * 0.2, 0, Math.PI, TAU);
  x.fill();
  // Serif initial
  x.font = `600 ${s * 0.34}px Georgia, 'Times New Roman', serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = s * 0.045;
  x.strokeStyle = 'rgba(8,9,16,0.55)';
  x.strokeText(String(name || '?').charAt(0).toUpperCase(), s * 0.5, s * 0.52);
  x.fillStyle = 'rgba(242,234,216,0.95)';
  x.fillText(String(name || '?').charAt(0).toUpperCase(), s * 0.5, s * 0.52);
  x.restore();

  x.lineWidth = Math.max(2, s * 0.04);
  x.strokeStyle = ring;
  x.beginPath();
  x.arc(s / 2, s / 2, s * 0.47 - x.lineWidth / 2, 0, TAU);
  x.stroke();
  drawKindGlyph(x, kind, s);
  _portraitCache.set(key, cv);
  return cv;
}

async function resolveSpeaker(line) {
  const raw = line.portrait ?? line.speaker ?? '';
  const NPCS = await loadNpcs();
  let def = NPCS[raw] ?? null; // id match ('elder_maren')
  if (!def) def = Object.values(NPCS).find((n) => n?.name === raw) ?? null; // display-name match
  const name = def?.name ?? (raw === '{player}' ? (G.playerName || 'Rowan') : raw);
  return { name, def };
}

// ---------------------------------------------------------------------------
// Input plumbing — module-level handlers, gated by state.
// ---------------------------------------------------------------------------
let openState = false, typing = false, fullText = '', shownChars = 0, typeRes = null;
let advanceRes = null, choiceState = null, gpTimer = 0, raf = 0;

function onConfirm() {
  if (!openState) return;
  if (typing) {
    shownChars = fullText.length;
    finishTyping();
    return;
  }
  if (choiceState) {
    pickChoice();
    return;
  }
  if (advanceRes) {
    const r = advanceRes;
    advanceRes = null;
    sfx('ui_move');
    r();
  }
}

function moveChoice(dir) {
  if (!choiceState) return;
  const n = choiceState.els.length;
  choiceState.idx = (choiceState.idx + dir + n) % n;
  choiceState.els.forEach((e, i) => e.classList.toggle('focused', i === choiceState.idx));
  sfx('ui_move');
}

function pickChoice() {
  if (!choiceState) return;
  const st = choiceState;
  choiceState = null;
  sfx('ui_confirm');
  st.resolve(st.idx);
}

input.onAction('confirm', onConfirm);
input.onAction('interact', onConfirm);
input.onAction('cancel', () => { if (openState && typing) onConfirm(); });
input.onAction('up', () => moveChoice(-1));
input.onAction('down', () => moveChoice(1));

// ---------------------------------------------------------------------------
// Typewriter
// ---------------------------------------------------------------------------
function finishTyping() {
  typing = false;
  cancelAnimationFrame(raf);
  els.text.textContent = fullText;
  const r = typeRes;
  typeRes = null;
  r?.();
}

function typeLine(text) {
  fullText = text;
  shownChars = 0;
  typing = true;
  els.text.textContent = '';
  els.caret.classList.remove('show');
  const cps = CPS[settings.textSpeed] ?? CPS.normal;
  if (!isFinite(cps)) {
    finishTyping();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    typeRes = resolve;
    let last = performance.now(), acc = 0;
    const step = (now) => {
      if (!typing) return;
      acc += ((now - last) / 1000) * cps;
      last = now;
      const n = Math.min(fullText.length, Math.floor(acc));
      if (n !== shownChars) {
        shownChars = n;
        els.text.textContent = fullText.slice(0, n);
      }
      if (shownChars >= fullText.length) finishTyping();
      else raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });
}

const waitAdvance = () =>
  new Promise((resolve) => {
    els.caret.classList.add('show');
    advanceRes = () => {
      els.caret.classList.remove('show');
      resolve();
    };
  });

function presentChoices(choices) {
  els.choices.innerHTML = '';
  els.choices.classList.remove('hidden');
  const nodes = choices.map((c, i) => {
    const b = document.createElement('button');
    b.className = 'dlg-choice';
    b.innerHTML = `<span class="dlg-choice-caret">▸</span><span></span>`;
    b.lastElementChild.textContent = subst(c.text ?? '...');
    b.addEventListener('pointerenter', () => {
      if (!choiceState) return;
      choiceState.idx = i;
      choiceState.els.forEach((e, j) => e.classList.toggle('focused', j === i));
    });
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!choiceState) return;
      choiceState.idx = i;
      pickChoice();
    });
    els.choices.appendChild(b);
    return b;
  });
  nodes[0]?.classList.add('focused');
  return new Promise((resolve) => {
    choiceState = { els: nodes, idx: 0, resolve };
    // Gamepad stick navigation while choices are up.
    let lastMove = 0;
    gpTimer = setInterval(() => {
      if (!choiceState) return clearInterval(gpTimer);
      const y = input.axes?.y ?? 0;
      const now = performance.now();
      if (Math.abs(y) > 0.55 && now - lastMove > 220) {
        lastMove = now;
        moveChoice(y > 0 ? 1 : -1);
      }
    }, 60);
  }).finally(() => {
    clearInterval(gpTimer);
    els.choices.classList.add('hidden');
    els.choices.innerHTML = '';
  });
}

const subst = (t) => String(t ?? '').replaceAll('{player}', G.playerName || 'Rowan');

// ---------------------------------------------------------------------------
// Core runner — dialogues queue so overlapping calls never fight for the panel.
// ---------------------------------------------------------------------------
let _queue = Promise.resolve();

async function runLines(lines) {
  for (const line of lines ?? []) {
    const { name, def } = await resolveSpeaker(line);
    const narration = !name;
    root.classList.toggle('narration', narration);
    els.name.textContent = name;
    els.portrait.innerHTML = '';
    if (!narration) els.portrait.appendChild(speakerPortraitCanvas(name, def));
    await typeLine(subst(line.text));
    if (Array.isArray(line.choices) && line.choices.length) {
      const idx = await presentChoices(line.choices);
      const c = line.choices[idx] ?? {};
      if (c.flag) setFlag(c.flag);
      if (typeof c.fn === 'function') {
        try { c.fn(G); } catch (e) { console.error('[dialogue] choice fn threw', e); }
      }
      if (c.goto) {
        const DIALOGUES = await loadDialogues();
        const next = DIALOGUES[c.goto];
        if (next) { await runLines(next.lines); return; }
        console.warn(`[dialogue] goto target missing: ${c.goto}`);
      }
    } else {
      await waitAdvance();
    }
  }
}

export function showDialogue(dlg) {
  const job = async () => {
    if (!dlg?.lines?.length) return;
    ensureDom();
    openState = true;
    bus.emit('dialogue:start', { _fromUI: true, lines: dlg.lines });
    sfx('ui_open');
    root.classList.add('open');
    try {
      await runLines(dlg.lines);
    } finally {
      openState = false;
      choiceState = null;
      advanceRes = null;
      typing = false;
      cancelAnimationFrame(raf);
      root.classList.remove('open');
      sfx('ui_close');
      bus.emit('dialogue:end');
    }
  };
  _queue = _queue.then(job, job);
  return _queue;
}

export async function showDialogueById(id) {
  const DIALOGUES = await loadDialogues();
  const dlg = DIALOGUES[id];
  if (!dlg) {
    console.warn(`[dialogue] unknown dialogue id: ${id}`);
    return;
  }
  return showDialogue(dlg);
}

// Ad-hoc lines over the bus — {lines: ['...', ...] | [{speaker,text}], speaker?, onDone?}
bus.on('dialogue:start', (p) => {
  if (!p || p._fromUI) return;
  const lines = (p.lines ?? []).map((l) =>
    typeof l === 'string' ? { speaker: p.speaker ?? '', text: l } : l
  );
  showDialogue({ lines }).then(() => p.onDone?.());
});
