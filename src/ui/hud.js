// LUMENFALL — persistent in-play HUD.
// Party pips + lead medallion (canvas portrait, hp arc, level), compass, quest tracker,
// zone title cards, toasts, interact prompt, battle-transition swirl overlay,
// cinematic letterbox bars, and the always-on ambient vignette.
// The HUD is strictly passive: every element is pointer-events:none.
//
// Exports beyond initHud():
//   creaturePortraitCanvas(speciesId, size) -> HTMLCanvasElement  (shared with battleUI)
//   hpColorFor(frac) -> css color string
import { bus } from '../core/events.js';
import { G } from '../core/state.js';
import { input } from '../core/input.js';
import { tween } from '../core/tween.js';
import { hashStr, seededRandom } from '../core/rng.js';
import { clamp01, TAU } from '../core/math.js';
import { game } from '../game/game.js';
import { ASPECTS } from '../data/aspects.js';
import * as creatureData from '../data/creatures.js';
import * as questData from '../data/quests.js';

const SPECIES = creatureData.SPECIES ?? {};
const QUESTS = questData.QUESTS ?? {};

// Canvas needs literal colors — these mirror styles/base.css tokens exactly.
const C_HP = '#6fdc8c', C_HP_LOW = '#ffb85c', C_HP_CRIT = '#ff6b6b';
const C_GOLD = 'rgba(255,233,176,0.92)', C_SIL = 'rgba(10,12,20,0.85)';

export function hpColorFor(frac) {
  return frac > 0.5 ? C_HP : frac > 0.25 ? C_HP_LOW : C_HP_CRIT;
}

const cssColor = (n) =>
  typeof n === 'number' ? `#${n.toString(16).padStart(6, '0')}` : (n || '#c8c2b8');
const aspectHex = (id) => cssColor(ASPECTS[id]?.color ?? ASPECTS.neutral?.color);

// ---------------------------------------------------------------------------
// Procedural creature medallion — aspect-gradient disc, seeded silhouette blob,
// initial letter, aspect ring. Cached per species+size (canvases are cloned out).
// ---------------------------------------------------------------------------
const _portraitCache = new Map();

export function creaturePortraitCanvas(speciesId, size = 64) {
  const key = `${speciesId}|${size}`;
  const cached = _portraitCache.get(key);
  if (cached) {
    // Return a visual copy so callers can freely place it multiple times.
    const copy = cached.cloneNode();
    copy.getContext('2d').drawImage(cached, 0, 0);
    copy.style.width = `${size}px`;
    copy.style.height = `${size}px`;
    return copy;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.round(size * dpr);
  cv.style.width = `${size}px`;
  cv.style.height = `${size}px`;
  const x = cv.getContext('2d');
  x.scale(dpr, dpr);
  const sp = SPECIES[speciesId];
  const aspects = sp?.aspects?.length ? sp.aspects : ['neutral'];
  const c1 = aspectHex(aspects[0]);
  const c2 = aspectHex(aspects[1] ?? aspects[0]);
  const s = size, cx0 = s / 2, cy0 = s / 2, R = s * 0.47;

  // Disc clip
  x.save();
  x.beginPath();
  x.arc(cx0, cy0, R, 0, TAU);
  x.clip();
  // Base slate + two aspect glows
  x.fillStyle = '#161826';
  x.fillRect(0, 0, s, s);
  let g = x.createRadialGradient(s * 0.5, s * 0.18, s * 0.05, s * 0.5, s * 0.3, s * 0.85);
  g.addColorStop(0, c1);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalAlpha = 0.6;
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  g = x.createRadialGradient(s * 0.2, s * 0.9, s * 0.05, s * 0.3, s * 0.85, s * 0.9);
  g.addColorStop(0, c2);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalAlpha = 0.35;
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  x.globalAlpha = 1;

  // Seeded creature-ish silhouette: body + head + ears/horns + tail nub.
  const rng = seededRandom(hashStr(String(speciesId)));
  x.fillStyle = C_SIL;
  const bw = (0.24 + rng() * 0.06) * s, bh = (0.18 + rng() * 0.06) * s;
  x.beginPath();
  x.ellipse(s * 0.5, s * 0.62, bw, bh, (rng() - 0.5) * 0.3, 0, TAU);
  x.fill();
  const hx = s * (0.5 + (rng() - 0.5) * 0.14), hy = s * (0.37 + (rng() - 0.5) * 0.05);
  const hr = (0.12 + rng() * 0.05) * s;
  x.beginPath();
  x.arc(hx, hy, hr, 0, TAU);
  x.fill();
  const ears = 1 + Math.round(rng());
  for (let i = 0; i <= ears; i++) {
    const a = -Math.PI / 2 + (i - ears / 2) * (0.5 + rng() * 0.3);
    const len = hr * (0.9 + rng() * 0.9), w = hr * (0.28 + rng() * 0.2);
    const bx = hx + Math.cos(a) * hr * 0.85, by = hy + Math.sin(a) * hr * 0.85;
    x.beginPath();
    x.moveTo(bx + Math.cos(a + Math.PI / 2) * w, by + Math.sin(a + Math.PI / 2) * w);
    x.lineTo(bx + Math.cos(a) * len, by + Math.sin(a) * len);
    x.lineTo(bx + Math.cos(a - Math.PI / 2) * w, by + Math.sin(a - Math.PI / 2) * w);
    x.closePath();
    x.fill();
  }
  x.beginPath();
  x.arc(s * (rng() > 0.5 ? 0.79 : 0.21), s * 0.64, s * (0.05 + rng() * 0.04), 0, TAU);
  x.fill();

  // Initial letter — the emblem's identity.
  const letter = String(sp?.name || speciesId || '?').charAt(0).toUpperCase();
  x.font = `600 ${s * 0.4}px Georgia, 'Times New Roman', serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = s * 0.05;
  x.strokeStyle = 'rgba(8,9,16,0.6)';
  x.strokeText(letter, s * 0.5, s * 0.54);
  x.fillStyle = C_GOLD;
  x.fillText(letter, s * 0.5, s * 0.54);
  x.restore();

  // Aspect ring + inner hairline.
  x.lineWidth = Math.max(1.5, s * 0.045);
  x.strokeStyle = c1;
  x.globalAlpha = 0.95;
  x.beginPath();
  x.arc(cx0, cy0, R - x.lineWidth / 2, 0, TAU);
  x.stroke();
  x.globalAlpha = 1;
  x.lineWidth = 1;
  x.strokeStyle = 'rgba(255,255,255,0.14)';
  x.beginPath();
  x.arc(cx0, cy0, R - s * 0.075, 0, TAU);
  x.stroke();

  _portraitCache.set(key, cv);
  return creaturePortraitCanvas(speciesId, size); // hand out a clone, keep master pristine
}

// HP arc drawn on an overlay canvas that rings the medallion.
function drawHpArc(cv, frac) {
  const x = cv.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const s = cv.width / dpr;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, s, s);
  const r = s * 0.47, lw = s * 0.075;
  x.lineWidth = lw;
  x.lineCap = 'round';
  // Track
  x.strokeStyle = 'rgba(255,255,255,0.10)';
  x.beginPath();
  x.arc(s / 2, s / 2, r, 0, TAU);
  x.stroke();
  if (frac <= 0) return;
  x.strokeStyle = hpColorFor(frac);
  x.shadowColor = x.strokeStyle;
  x.shadowBlur = 4;
  x.beginPath();
  x.arc(s / 2, s / 2, r, -Math.PI / 2, -Math.PI / 2 + clamp01(frac) * TAU);
  x.stroke();
  x.shadowBlur = 0;
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
let _inited = false;

export function initHud() {
  if (_inited) return;
  _inited = true;
  const uiRoot = document.getElementById('ui-root');
  const root = document.createElement('div');
  root.id = 'hud';
  root.className = 'pass-through';
  root.innerHTML = `
    <div class="hud-vignette"></div>
    <div class="hud-letterbox"><div class="lb-top"></div><div class="lb-bot"></div></div>
    <div class="hud-party hidden">
      <div class="lead-wrap">
        <div class="medal-stack"></div>
        <div class="lead-meta">
          <div class="lead-name"></div>
          <div class="lead-lv"></div>
        </div>
      </div>
      <div class="pips"></div>
    </div>
    <div class="hud-compass hidden"><div class="compass-disc">
      <span class="cn">N</span><span class="ce">E</span><span class="cs">S</span><span class="cw">W</span>
    </div><div class="compass-notch"></div></div>
    <div class="hud-quest hidden">
      <div class="hq-tag">Quest</div>
      <div class="hq-name"></div>
      <div class="hq-step"></div>
    </div>
    <div class="hud-zone-title"><div class="zt-name"></div><div class="zt-rule"></div><div class="zt-sub"></div></div>
    <div class="hud-toasts"></div>
    <div class="hud-prompt"><span class="key">E</span><span class="txt"></span></div>
  `;
  uiRoot.appendChild(root);

  const el = {
    party: root.querySelector('.hud-party'),
    medalStack: root.querySelector('.medal-stack'),
    leadName: root.querySelector('.lead-name'),
    leadLv: root.querySelector('.lead-lv'),
    pips: root.querySelector('.pips'),
    compass: root.querySelector('.hud-compass'),
    compassDisc: root.querySelector('.compass-disc'),
    quest: root.querySelector('.hud-quest'),
    hqName: root.querySelector('.hq-name'),
    hqStep: root.querySelector('.hq-step'),
    hqTag: root.querySelector('.hq-tag'),
    zt: root.querySelector('.hud-zone-title'),
    ztName: root.querySelector('.zt-name'),
    ztSub: root.querySelector('.zt-sub'),
    toasts: root.querySelector('.hud-toasts'),
    prompt: root.querySelector('.hud-prompt'),
    promptKey: root.querySelector('.hud-prompt .key'),
    promptTxt: root.querySelector('.hud-prompt .txt'),
    lbRoot: root.querySelector('.hud-letterbox'),
  };

  // ---- Party pips + lead medallion --------------------------------------
  let arcCv = null, medalFor = null, arcFrac = 1, arcSeq = 0;

  function rebuildMedal(lead) {
    el.medalStack.innerHTML = '';
    const medal = creaturePortraitCanvas(lead.speciesId, 62);
    medal.className = 'medal';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    arcCv = document.createElement('canvas');
    arcCv.width = arcCv.height = Math.round(72 * dpr);
    arcCv.style.width = arcCv.style.height = '72px';
    arcCv.className = 'arc';
    el.medalStack.appendChild(arcCv);
    el.medalStack.appendChild(medal);
    medalFor = lead.speciesId + '|' + lead.uid;
    arcFrac = clamp01((lead.hp ?? 1) / (lead.maxHp || 1));
    drawHpArc(arcCv, arcFrac);
  }

  function renderParty() {
    const party = G.party || [];
    el.party.classList.toggle('hidden', party.length === 0);
    if (!party.length) return;
    const lead = party[0];
    if (medalFor !== lead.speciesId + '|' + lead.uid) rebuildMedal(lead);
    el.leadName.textContent = lead.nickname || SPECIES[lead.speciesId]?.name || lead.speciesId;
    el.leadLv.textContent = `Lv ${lead.level ?? 1}`;
    const target = clamp01((lead.hp ?? 0) / (lead.maxHp || 1));
    if (Math.abs(target - arcFrac) > 0.002) {
      const from = arcFrac, seq = ++arcSeq;
      tween({ from, to: target, dur: 0.45, onUpdate: (v) => {
        if (seq !== arcSeq || !arcCv) return;
        arcFrac = v;
        drawHpArc(arcCv, v);
      } });
    }
    // Companion pips (members 2..5)
    const rest = party.slice(1);
    if (el.pips.childElementCount !== rest.length) {
      el.pips.innerHTML = '';
      rest.forEach(() => {
        const d = document.createElement('div');
        d.className = 'pip';
        el.pips.appendChild(d);
      });
    }
    rest.forEach((m, i) => {
      const d = el.pips.children[i];
      const f = clamp01((m.hp ?? 0) / (m.maxHp || 1));
      d.style.background = f <= 0 ? 'rgba(255,255,255,0.15)' : hpColorFor(f);
      d.classList.toggle('dead', f <= 0);
      d.title = m.nickname || SPECIES[m.speciesId]?.name || m.speciesId;
    });
  }

  for (const evName of ['party:changed', 'game:loaded', 'creature:levelup', 'creature:awakened', 'battle:end'])
    bus.on(evName, () => renderParty());
  setInterval(renderParty, 1200); // silent hp sync (walking regen, story heals...)
  renderParty();

  // ---- Quest tracker ----------------------------------------------------
  let trackedId = null;

  // Tracking preference (finding 4): the EARLIEST still-active MAIN quest wins;
  // otherwise the newest active side quest. Side chatter never hijacks the
  // main-line tracker any more.
  function pickTracked() {
    let firstMain = null, lastSide = null;
    for (const [id, st] of Object.entries(G.quests || {})) {
      if (!st || st.done || !QUESTS[id]) continue;
      if (QUESTS[id].main) { if (!firstMain) firstMain = id; }
      else lastSide = id;
    }
    return firstMain ?? lastSide;
  }

  function setTag(text, isMain) {
    el.hqTag.innerHTML = '';
    const chip = document.createElement('span');
    chip.className = 'hq-chip' + (isMain ? '' : ' side');
    chip.textContent = text;
    el.hqTag.appendChild(chip);
  }

  function renderQuest(bump = false) {
    trackedId = pickTracked();
    const q = trackedId ? QUESTS[trackedId] : null;
    el.quest.classList.toggle('hidden', !q);
    positionToasts();
    if (!q) return;
    const step = G.quests[trackedId]?.step ?? 0;
    setTag(q.main ? 'MAIN' : 'SIDE', !!q.main);
    el.hqName.textContent = q.name || trackedId;
    el.hqStep.textContent = q.steps?.[Math.min(step, (q.steps?.length ?? 1) - 1)]?.text ?? '';
    el.quest.classList.remove('done');
    if (bump) {
      el.quest.classList.remove('bump');
      void el.quest.offsetWidth;
      el.quest.classList.add('bump');
    }
    positionToasts();
  }

  bus.on('quest:started', () => renderQuest(true));
  bus.on('quest:updated', () => renderQuest(true));
  bus.on('quest:completed', ({ id } = {}) => {
    const q = id ? QUESTS[id] : null;
    if (q) {
      el.quest.classList.remove('hidden', 'bump');
      el.quest.classList.add('done');
      el.hqTag.textContent = 'Complete';
      el.hqName.textContent = q.name || id;
      el.hqStep.textContent = 'The thread is woven.';
      positionToasts();
      setTimeout(() => renderQuest(true), 2400);
    } else renderQuest(true);
  });
  bus.on('game:loaded', () => renderQuest(false));
  bus.on('flag:set', () => renderQuest(false));
  renderQuest(false);

  // ---- Zone title card --------------------------------------------------
  let ztTimer = 0;
  bus.on('zone:title', ({ name, sub } = {}) => {
    if (!name) return;
    el.ztName.textContent = name;
    el.ztSub.textContent = sub ?? '';
    el.ztSub.classList.toggle('hidden', !sub);
    el.zt.classList.remove('show');
    void el.zt.offsetWidth;
    el.zt.classList.add('show');
    clearTimeout(ztTimer);
    ztTimer = setTimeout(() => el.zt.classList.remove('show'), 2600);
  });

  // ---- Toasts -----------------------------------------------------------
  // Toasts stack BELOW the quest tracker: recompute the container's top offset
  // from the tracker's live height whenever either changes (finding 17).
  function positionToasts() {
    const trackerVisible = !el.quest.classList.contains('hidden');
    const r = trackerVisible ? el.quest.getBoundingClientRect() : null;
    el.toasts.style.top = `${r && r.height ? Math.round(r.bottom + 10) : 18}px`;
  }

  bus.on('notify', ({ text, icon, duration } = {}) => {
    if (!text) return;
    while (el.toasts.childElementCount >= 4) el.toasts.firstElementChild.remove();
    positionToasts();
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span class="toast-icon"></span><span class="toast-text"></span>`;
    t.querySelector('.toast-icon').textContent = icon || '✦';
    t.querySelector('.toast-text').textContent = text;
    el.toasts.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 350);
    }, Math.max(1500, duration ?? 3000));
  });

  // ---- Interact prompt --------------------------------------------------
  bus.on('prompt:show', ({ text } = {}) => {
    el.promptTxt.textContent = text ?? 'Interact';
    el.promptKey.textContent = input.lastDevice === 'gp' ? 'A' : 'E';
    el.prompt.classList.add('show');
  });
  bus.on('prompt:hide', () => el.prompt.classList.remove('show'));

  // ---- Letterbox --------------------------------------------------------
  let lbOn = false; // compass hides during cinematic letterbox (see tickCompass)
  bus.on('letterbox', ({ on } = {}) => { lbOn = !!on; el.lbRoot.classList.toggle('on', lbOn); });

  // ---- Battle transition swirl overlay ---------------------------------
  // 'transition:battle' irises the screen to dark (battle intros AND zone
  // portal fades — world.js reuses the pair); 'transition:clear' releases it.
  let btEl = null;
  bus.on('transition:battle', () => {
    root.classList.add('battle-dim');
    if (btEl) btEl.remove();
    btEl = document.createElement('div');
    btEl.className = 'hud-bt';
    btEl.innerHTML = `<div class="bt-swirl"></div><div class="bt-swirl2"></div><div class="bt-iris"></div>`;
    root.appendChild(btEl);
    void btEl.offsetWidth;
    btEl.classList.add('in');
  });
  bus.on('transition:clear', () => {
    if (game.mode !== 'battle') root.classList.remove('battle-dim');
    if (!btEl) return;
    const dying = btEl;
    btEl = null;
    dying.classList.add('out');
    setTimeout(() => dying.remove(), 550);
  });
  bus.on('battle:start', () => root.classList.add('battle-dim'));
  bus.on('battle:end', () => {
    root.classList.remove('battle-dim');
    renderParty();
  });

  // ---- Compass (minimap-less wayfinding) --------------------------------
  // North is world -Z. Reads the active camera's world matrix directly —
  // no allocations, one transform write per meaningful change.
  let lastBearing = 99;
  (function tickCompass() {
    requestAnimationFrame(tickCompass);
    const cam = game?.activeScene?.camera;
    const show = game?.mode === 'overworld' && !!cam && !lbOn && !root.classList.contains('battle-dim');
    el.compass.classList.toggle('hidden', !show);
    if (!show) return;
    const e = cam.matrixWorld?.elements;
    if (!e) return;
    const fx = -e[8], fz = -e[10];
    const b = Math.atan2(fx, -fz);
    if (Math.abs(b - lastBearing) < 0.005) return;
    lastBearing = b;
    el.compassDisc.style.transform = `rotate(${-b}rad)`;
  })();
}
