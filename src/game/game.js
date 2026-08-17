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
    this._loop();
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    // A throwing input device (blocked permissions policy) or a bad frame must
    // never take the whole game down — the next frame is already scheduled.
    try { input.update(); } catch (e) { this._warnOnce('input', e); }
    tweenTick(dt);
    if (!this._paused && this.activeScene) {
      try { this.activeScene.update?.(dt); } catch (e) { console.error('[update]', e); }
    }
    if (this.activeScene?.scene && this.activeScene?.camera) {
      if (this.activeScene.render) this.activeScene.render(this.renderer, dt);
      else this.renderer.render(this.activeScene.scene, this.activeScene.camera);
    }
    if (this.mode === 'overworld' && !this._paused) {
      G.playtimeSec += dt;
      G.calendar.dayTime = (G.calendar.dayTime + dt / 900) % 1; // 15-min day cycle
    }
    input.endFrame();
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
