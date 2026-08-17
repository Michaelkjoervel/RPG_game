// Game — top-level orchestration: renderer, main loop, mode state machine.
// Modes: 'title' | 'overworld' | 'battle' | 'cutscene'. UI overlays live in DOM.
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { G } from '../core/state.js';
import { input } from '../core/input.js';
import { settings } from '../core/settings.js';
import { tick as tweenTick } from '../core/tween.js';
import { saveGame } from '../core/save.js';

class Game {
  constructor() {
    this.mode = 'boot';
    this.renderer = null;
    this.clock = new THREE.Clock();
    this.overworld = null;      // world/world.js World instance
    this.activeScene = null;    // {scene, camera, update(dt), render?()}
    this._paused = false;
    this._battleDepth = 0;
  }

  initRenderer() {
    const canvas = document.getElementById('game-canvas');
    // Context creation is the single most environment-dependent step in the
    // whole game: embedded frames, machines without a discrete GPU and strict
    // browsers all reject some option combinations that others accept. Walk
    // from best to plainest rather than failing the boot on the first refusal.
    const attempts = [
      { antialias: true, powerPreference: 'high-performance' },
      { antialias: true, powerPreference: 'default' },
      { antialias: false, powerPreference: 'default' },
      { antialias: false, failIfMajorPerformanceCaveat: false },
    ];
    let lastErr = null;
    for (const opts of attempts) {
      try {
        this.renderer = new THREE.WebGLRenderer({ canvas, ...opts });
        break;
      } catch (e) { lastErr = e; this.renderer = null; }
    }
    if (!this.renderer) {
      throw new Error(`could not open a WebGL context (${lastErr?.message ?? 'unknown reason'})`);
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = settings.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this._resize();
    window.addEventListener('resize', () => this._resize());

    // A lost GPU context stops all drawing while the DOM keeps animating — the
    // game looks frozen mid-frame and feels like being stuck in the scenery.
    // Say so out loud instead of leaving the player staring at a stale image.
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();                 // required, or the context can never come back
      this._contextLost = true;
      this._showStallOverlay('The world lost its light — the browser dropped this page’s 3D context.');
    }, false);
    canvas.addEventListener('webglcontextrestored', () => {
      this._contextLost = false;
      this._hideStallOverlay();
      // Rebuilding the current zone re-uploads everything the GPU just forgot.
      if (this.mode === 'overworld' && this.overworld) {
        this.overworld.loadZone(G.pos.zone, [G.pos.x, G.pos.z]).catch((err) => console.error('[game] zone rebuild failed', err));
      }
    }, false);
    bus.on('settings:changed', ({ key, value }) => {
      if (key !== 'quality') return;
      this.renderer.shadowMap.enabled = value !== 'low';
      this._resize(); // re-clamps pixelRatio for the new quality immediately
    });
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, settings.quality === 'low' ? 1 : 2);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h);
    if (this.activeScene?.camera) {
      this.activeScene.camera.aspect = w / h;
      this.activeScene.camera.updateProjectionMatrix();
    }
    bus.emit('render:resize', { w, h });
  }

  setScene(sceneObj) {
    this.activeScene = sceneObj;
    if (sceneObj?.camera) {
      sceneObj.camera.aspect = window.innerWidth / window.innerHeight;
      sceneObj.camera.updateProjectionMatrix();
    }
  }

  start() {
    input.attach();
    this.initRenderer();
    this._initDiagnostics();
    this._loop();
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this._dt = dt;
    // A throwing input device (blocked permissions policy) or a bad frame must
    // never take the whole game down — the next frame is already scheduled.
    try { input.update(); } catch (e) { this._warnOnce('input', e); }
    tweenTick(dt);
    if (!this._paused && this.activeScene) {
      try { this.activeScene.update?.(dt); } catch (e) { console.error('[update]', e); }
    }
    if (this.activeScene?.scene && this.activeScene?.camera) {
      try {
        if (this.activeScene.render) this.activeScene.render(this.renderer, dt);
        else this.renderer.render(this.activeScene.scene, this.activeScene.camera);
        this._lastDrawAt = performance.now();
        if (this._stalled) { this._stalled = false; this._hideStallOverlay(); }
      } catch (e) {
        this._warnOnce('render', e);
        this._renderError = e;
      }
      // A picture that stopped updating is invisible as a bug — surface it.
      this._lastDrawAt ??= performance.now();
      if (!this._stalled && performance.now() - this._lastDrawAt > 2500) {
        this._stalled = true;
        this._showStallOverlay(this._contextLost
          ? 'The world lost its light — the browser dropped this page’s 3D context.'
          : `Drawing stopped: ${this._renderError?.message ?? 'the renderer stopped producing frames'}`);
      }
    }
    if (this.mode === 'overworld' && !this._paused) {
      G.playtimeSec += dt;
      G.calendar.dayTime = (G.calendar.dayTime + dt / 900) % 1; // 15-min day cycle
    }
    this._updateDiagnostics();
    input.endFrame();
  }

  // F1 — live state readout. Exists so a player who is stuck can tell us what
  // the game thinks is happening, instead of us guessing from a screenshot.
  _initDiagnostics() {
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'F1') return;
      e.preventDefault();
      this._diag = !this._diag;
      const el = this._diagEl ?? (this._diagEl = (() => {
        const d = document.createElement('div');
        d.id = 'diag-overlay';
        d.style.cssText = `position:fixed;left:12px;bottom:12px;z-index:130;padding:10px 14px;
          border-radius:10px;background:rgba(8,9,15,.88);border:1px solid rgba(255,233,176,.22);
          color:#dfd8c8;font:12px/1.6 ui-monospace,Menlo,Consolas,monospace;white-space:pre;
          pointer-events:none;max-width:60ch`;
        document.body.appendChild(d);
        return d;
      })());
      el.style.display = this._diag ? 'block' : 'none';
    });
  }

  _updateDiagnostics() {
    if (!this._diag || !this._diagEl) return;
    const w = this.overworld, p = w?.player, cam = w?.camera;
    const f = (n) => (typeof n === 'number' ? n.toFixed(2) : String(n));
    let out = `mode ${this.mode}   paused ${this._paused}   fps~${Math.round(1 / Math.max(this._dt || 0.016, 0.001))}\n`;
    out += `zone ${w?.zone?.id ?? '—'}   colliders ${w?.colliders?.length ?? '—'}\n`;
    if (p) {
      const gy = w.heightAt ? w.heightAt(p.pos.x, p.pos.z) : NaN;
      out += `player  ${f(p.pos.x)}, ${f(p.pos.y)}, ${f(p.pos.z)}   ground ${f(gy)}\n`;
      out += `frozen  ${p.isFrozen?.() ?? '?'}   input ${f(input.axes.x)}, ${f(input.axes.y)}\n`;
    } else out += 'player  — (none)\n';
    if (cam) {
      const cgy = w.heightAt ? w.heightAt(cam.position.x, cam.position.z) : NaN;
      out += `camera  ${f(cam.position.x)}, ${f(cam.position.y)}, ${f(cam.position.z)}   ground ${f(cgy)}`;
    }
    this._diagEl.textContent = out;
  }

  _showStallOverlay(reason) {
    console.error('[game] rendering stalled:', reason);
    let el = document.getElementById('stall-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'stall-overlay';
      el.style.cssText = `position:fixed;inset:0;z-index:120;display:flex;flex-direction:column;
        align-items:center;justify-content:center;gap:14px;text-align:center;padding:24px;
        background:radial-gradient(ellipse at 50% 45%,rgba(8,9,15,.86) 0%,rgba(8,9,15,.96) 100%);
        font-family:'Segoe UI',system-ui,sans-serif;color:#b9b2a3;`;
      el.innerHTML = `
        <div style="font-family:Georgia,serif;font-size:26px;letter-spacing:.18em;color:#ffe9b0">LUMENFALL</div>
        <div id="stall-why" style="max-width:44ch;line-height:1.55;font-size:13.5px"></div>
        <button id="stall-reload" style="margin-top:6px;padding:10px 22px;border-radius:999px;
          border:1px solid rgba(255,233,176,.35);background:rgba(255,233,176,.10);color:#ffe9b0;
          font-family:Georgia,serif;font-size:15px;letter-spacing:.06em;cursor:pointer">Wake the world</button>
        <div style="font-size:11.5px;color:#7c766c">Your last autosave is kept.</div>`;
      document.body.appendChild(el);
      el.querySelector('#stall-reload').addEventListener('click', () => location.reload());
    }
    el.querySelector('#stall-why').textContent = reason;
    el.style.display = 'flex';
  }

  _hideStallOverlay() {
    const el = document.getElementById('stall-overlay');
    if (el) el.style.display = 'none';
  }

  _warnOnce(key, e) {
    (this._warned ??= new Set());
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(`[game] ${key} failed and was disabled for this frame path:`, e);
  }

  pause(v) { this._paused = v; bus.emit(v ? 'game:paused' : 'game:resumed'); }

  async enterOverworld(zoneId = G.pos.zone, spawn = null) {
    const { World } = await import('../world/world.js');
    if (!this.overworld) this.overworld = new World(this);
    // Resuming a save with no explicit spawn: restore the exact saved position
    // rather than the zone's default entrance.
    if (!spawn && G.savedAt && zoneId === G.pos.zone) spawn = [G.pos.x, G.pos.z];
    this.mode = 'overworld';
    await this.overworld.loadZone(zoneId, spawn);
    this.setScene(this.overworld);
    bus.emit('zone:enter', { zoneId });
  }

  // Battle takes over rendering; overworld is suspended, then restored.
  async startBattle(config) {
    if (this._battleDepth > 0) return null; // never nest battles
    this._battleDepth++;
    const prevMode = this.mode;
    this.mode = 'battle';
    bus.emit('battle:start', { kind: config.kind ?? 'wild', encounter: config });
    try {
      const { runBattle } = await import('../battle/battleFlow.js');
      const result = await runBattle(this, config);
      bus.emit('battle:end', { result });
      return result;
    } finally {
      this._battleDepth--;
      this.mode = prevMode;
      if (this.overworld) this.setScene(this.overworld);
    }
  }

  autosave() { if (G.starter) saveGame(0); }
}

export const game = new Game();
