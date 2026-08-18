// ============================================================================
// world/world.js — the overworld scene owner: loads/disposes zones, ties
// together terrain/sky/water/props/weather/wildlife/encounters/interactables/
// npcs/player/cameraRig, routes interaction + portal travel, starts wild
// battles, and drives the per-frame shadow-follow + wind clock.
//
// Contract (docs/CONTRACTS_ADDENDUM.md — "World class API"):
//   class World {
//     constructor(game)
//     async loadZone(zoneId, spawn?)
//     update(dt)
//     scene; camera
//     zone
//     heightAt(x, z) -> y
//     colliders                 // [{x,z,r}]
//     player
//     interact()
//     async startWildBattle(speciesId, level, opts?)
//     addCollider(c); removeCollider(c)
//   }
//
// Sibling world/* modules (props, weather, wildlife, encounters,
// interactables, npcs, player, cameraRig) are consumed strictly through the
// factory signatures pinned in the addendum — several don't exist yet while
// this file is written (parallel build), so every dynamic import is wrapped
// defensively: a missing/broken module degrades the zone (warns once) rather
// than crashing the game.
// ============================================================================
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { G } from '../core/state.js';
import { delay } from '../core/tween.js';
import { buildTerrain } from './terrain.js';
import { createSky } from './sky.js';
import { createWater } from './water.js';
import { tickWind } from '../gfx/materials.js';
import { applyAtmosphere } from '../gfx/postfx.js';

// biome -> battle arena id (docs/CONTRACTS_ADDENDUM.md "Arenas" table)
const ARENA_BY_BIOME = {
  meadow: 'meadow', forest: 'forest', cave: 'cave', lake: 'lake', mountain: 'mountain',
  ruins: 'ruins', spire: 'spire', glade: 'glade', town: 'meadow',
};
const SHADOW_FOLLOW_DIST = 40;   // how far along sunDir the light sits from its target
const SHADOW_FOLLOW_LIFT = 6;    // extra height so the light never grazes the horizon oddly
const PORTAL_FADE_IN = 0.42;     // seconds — matches hud.js's iris-in animation
const PORTAL_FADE_SETTLE = 0.08; // brief hold once the new zone is built, before clearing

const warned = new Set();
function warnOnce(tag, msg) {
  const key = tag + '|' + msg;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[world] ${tag}:`, msg);
}

export class World {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.zone = null;
    this.zoneId = null;
    this.colliders = [];

    this.player = null;
    this.cameraRig = null;
    this.terrain = null;
    this.sky = null;
    this.water = null;
    this.props = null;
    this.weather = null;
    this.wildlife = null;
    this.encounters = null;
    this.interactables = null;
    this.npcs = null;

    this._time = 0;
    this._loadChain = Promise.resolve();
    this._transferring = false;
    this._battleStarting = false;
    this._fx = applyAtmosphere(game.renderer, this.scene, null);
  }

  get camera() { return this.cameraRig ? this.cameraRig.camera : null; }

  heightAt(x, z) { return this.terrain ? this.terrain.heightAt(x, z) : 0; }
  addCollider(c) { this.colliders.push(c); }
  removeCollider(c) {
    const i = this.colliders.indexOf(c);
    if (i >= 0) this.colliders.splice(i, 1);
  }

  // ================================================================ zone lifecycle
  /** Serialized so overlapping calls (portal mash, save-load race) never interleave builds. */
  loadZone(zoneId, spawn) {
    this._loadChain = this._loadChain
      .catch(() => {}) // a prior failed load must not poison the chain forever
      .then(() => this._loadZoneImpl(zoneId, spawn));
    return this._loadChain;
  }

  async _loadZoneImpl(zoneId, spawn) {
    const { ZONES } = await import('../data/worldmap.js');
    const zone = ZONES?.[zoneId];
    if (!zone) { console.error(`[world] unknown zone "${zoneId}" — load aborted, previous zone kept`); return; }

    this._disposeZone();
    this.zone = zone;
    this.zoneId = zoneId;
    this.colliders = [];

    // terrain -> sky (sets scene.fog once) -> water -> props/weather/wildlife/
    // encounters/interactables/npcs -> player -> cameraRig, per the brief.
    this.terrain = buildTerrain(zone);
    this.terrain.mesh.name = 'terrain';
    this.scene.add(this.terrain.mesh);

    this.sky = createSky(zone, this.scene);

    this.water = createWater(zone);
    if (this.water) this.scene.add(this.water.mesh);

    try {
      const { buildProps } = await import('./props.js');
      this.props = buildProps(zone, this.terrain.heightAt);
      this.scene.add(this.props.group);
      if (this.props.colliders) for (const c of this.props.colliders) this.colliders.push(c);
    } catch (e) { warnOnce('props.js', e?.message ?? e); }

    try {
      const { createWeather } = await import('./weather.js');
      this.weather = createWeather(zone, this.scene);
    } catch (e) { warnOnce('weather.js', e?.message ?? e); }

    try {
      const { createNpcs } = await import('./npcs.js');
      this.npcs = createNpcs(zone, this);
      if (this.npcs?.colliders) for (const c of this.npcs.colliders) this.colliders.push(c);
    } catch (e) { warnOnce('npcs.js', e?.message ?? e); }

    try {
      const { createInteractables } = await import('./interactables.js');
      this.interactables = createInteractables(zone, this);
    } catch (e) { warnOnce('interactables.js', e?.message ?? e); }

    try {
      const { createWildlife } = await import('./wildlife.js');
      this.wildlife = createWildlife(zone, this);
    } catch (e) { warnOnce('wildlife.js', e?.message ?? e); }

    try {
      const { createEncounters } = await import('./encounters.js');
      this.encounters = createEncounters(zone, this);
    } catch (e) { warnOnce('encounters.js', e?.message ?? e); }

    try {
      const { createPlayer } = await import('./player.js');
      this.player = createPlayer(this);
      // `spawn` (portal arrival / explicit teleport) overrides the zone's own
      // default spawn that createPlayer already used — face the interior.
      if (spawn) this.player.teleport(spawn[0], spawn[1], Math.atan2(-spawn[0], -spawn[1]));
    } catch (e) { warnOnce('player.js', e?.message ?? e); }

    try {
      const { createCameraRig } = await import('./cameraRig.js');
      this.cameraRig = createCameraRig(this);
      this._fx?.setCamera?.(this.cameraRig.camera);
    } catch (e) { warnOnce('cameraRig.js', e?.message ?? e); }

    G.pos.zone = zoneId;

    try {
      const story = await import('../game/story.js');
      await story.onZoneEnter?.(zoneId, this);
    } catch (e) { warnOnce('game/story.js', e?.message ?? e); }

    bus.emit('zone:title', { name: zone.name });
  }

  _disposeZone() {
    const safe = (tag, fn) => { try { fn(); } catch (e) { console.error(`[world] ${tag} dispose failed`, e); } };
    safe('player', () => this.player?.dispose?.());
    safe('cameraRig', () => this.cameraRig?.dispose?.());
    safe('npcs', () => this.npcs?.dispose?.());
    safe('interactables', () => this.interactables?.dispose?.());
    safe('wildlife', () => this.wildlife?.dispose?.());
    safe('encounters', () => this.encounters?.dispose?.());
    safe('weather', () => this.weather?.dispose?.());
    safe('props', () => { this.props?.dispose?.(); if (this.props) this.scene.remove(this.props.group); });
    safe('water', () => { this.water?.dispose?.(); if (this.water) this.scene.remove(this.water.mesh); });
    safe('sky', () => this.sky?.dispose?.()); // sky.js removes its own scene objects + clears fog
    safe('terrain', () => { this.terrain?.dispose?.(); if (this.terrain) this.scene.remove(this.terrain.mesh); });

    this.player = null; this.cameraRig = null; this.npcs = null; this.interactables = null;
    this.wildlife = null; this.encounters = null; this.weather = null; this.props = null;
    this.water = null; this.sky = null; this.terrain = null;
    this.colliders.length = 0;
  }

  // ================================================================ interaction
  /** Priority: npcs -> interactables -> portal (per the addendum). */
  interact() {
    if (!this.zone) return false;
    if (this.npcs?.tryInteract?.(this._playerPos(), this._playerFace())) return true;
    if (this.interactables?.tryInteract?.(this._playerPos(), this._playerFace())) return true;
    return this._tryPortal();
  }

  /** Aggregate prompt used by player.js's own polling (falls back to its own portal check if absent). */
  nearestPrompt(pos) {
    return this.npcs?.nearestPrompt?.(pos)
      ?? this.interactables?.nearestPrompt?.(pos)
      ?? this._portalPrompt(pos);
  }

  _playerPos() { return this.player ? this.player.pos : { x: 0, y: 0, z: 0 }; }
  _playerFace() { return this.player ? this.player.face : 0; }

  _findPortal(pos) {
    const portals = this.zone?.portals;
    if (!portals || !portals.length) return null;
    for (let i = 0; i < portals.length; i++) {
      const p = portals[i];
      const r = (p.radius ?? 3) + 0.5;
      const dx = pos.x - p.at[0], dz = pos.z - p.at[1];
      if (dx * dx + dz * dz < r * r) return p;
    }
    return null;
  }
  _portalPrompt(pos) {
    const p = this._findPortal(pos);
    return p ? { text: p.label ?? `To ${p.to}` } : null;
  }
  _tryPortal() {
    if (this._transferring || !this.player) return false;
    const p = this._findPortal(this.player.pos);
    if (!p) return false;
    this._transferZone(p);
    return true;
  }

  /** Portal travel: brief iris fade, swap zone, fade back in — see COMMON brief's DECISION. */
  async _transferZone(portal) {
    if (this._transferring) return;
    this._transferring = true;
    try {
      if (this.player) this.player.setFrozen(true);
      bus.emit('transition:battle'); // reused as the generic iris overlay (hud.js)
      await delay(PORTAL_FADE_IN);
      await this.loadZone(portal.to, portal.spawn);
      if (this.game.activeScene !== this) this.game.setScene(this);
      bus.emit('zone:enter', { zoneId: portal.to }); // bypassing game.enterOverworld — fire it ourselves
      await delay(PORTAL_FADE_SETTLE);
      bus.emit('transition:clear');
      if (this.player) this.player.setFrozen(false);
      this.game.autosave?.();
    } finally {
      this._transferring = false;
    }
  }

  // ================================================================ wild battles
  /** Wraps game.startBattle for a wild encounter. Battle owns its own transition overlay. */
  async startWildBattle(speciesId, level, opts = {}) {
    if (!this.zone || this._battleStarting || this.game.mode !== 'overworld') return null;
    // Never open a battle the player cannot act in (e.g. racing the defeat-heal flow).
    if (!G.party.some((m) => m && m.hp > 0)) return null;
    this._battleStarting = true;
    try {
      const { makeCreature } = await import('../game/creatures.js');
      const enemy = makeCreature(speciesId, level, opts.enemyOpts);
      const config = {
        playerTeam: G.party,
        enemyTeam: [enemy],
        kind: 'wild',
        canFlee: true,
        canCatch: true,
        ai: 'basic',
        arena: ARENA_BY_BIOME[this.zone.biome] ?? 'meadow',
      };
      this.player?.setFrozen(true);
      const result = await this.game.startBattle(config);
      this.player?.setFrozen(false);
      return result;
    } catch (e) {
      warnOnce('startWildBattle', e?.message ?? e);
      this.player?.setFrozen(false);
      return null;
    } finally {
      this._battleStarting = false;
    }
  }

  // ================================================================ per-frame update
  update(dt) {
    this._time += dt;
    tickWind(dt);

    // Every subsystem is isolated: the exact failure that motivated this was a
    // throwing camera update (blocked gamepad API) that silently stopped the
    // view from following the player while everything else kept working. One
    // subsystem's bad frame must never take the rest of the world with it —
    // and it must warn (once) rather than fail invisibly.
    this._sub('player', () => this.player?.update(dt));
    this._sub('camera', () => this.cameraRig?.update(dt));
    this._sub('sky', () => this.sky?.update(dt, G.calendar.dayTime));
    this._sub('water', () => this.water?.update(dt));

    const updaters = this.props?.updaters;
    if (updaters) for (let i = 0; i < updaters.length; i++) {
      try { updaters[i](dt, this._time); } catch (e) { warnOnce('props updater', e?.message ?? e); }
    }

    this._sub('weather', () => this.weather?.update(dt));
    this._sub('wildlife', () => this.wildlife?.update(dt));
    this._sub('encounters', () => this.encounters?.update(dt));
    this._sub('npcs', () => this.npcs?.update(dt));
    this._sub('interactables', () => this.interactables?.update(dt));

    this._sub('shadow', () => this._updateShadowFollow());
  }

  _sub(name, fn) {
    try { fn(); } catch (e) {
      warnOnce(`update:${name}`, `world subsystem "${name}" failed: ${e?.message ?? e}`);
      (this._subErrors ??= {})[name] = String(e?.message ?? e); // surfaced by the F1 overlay
    }
  }

  _updateShadowFollow() {
    const light = this.sky?.sunLight;
    if (!light || !this.player) return;
    const p = this.player.pos;
    const dir = this.sky.sunDir;
    if (dir) {
      light.target.position.set(p.x, p.y, p.z);
      light.position.set(
        p.x + dir.x * SHADOW_FOLLOW_DIST,
        p.y + Math.max(dir.y, 0.05) * SHADOW_FOLLOW_DIST + SHADOW_FOLLOW_LIFT,
        p.z + dir.z * SHADOW_FOLLOW_DIST,
      );
      light.target.updateMatrixWorld();
    }
    const fill = this.sky?.fillLight;
    if (fill) fill.position.set(p.x, p.y + 3.0, p.z + 0.4);
  }

  // ================================================================ render
  /** Game._loop() calls this instead of a plain renderer.render() when set as activeScene. */
  render(renderer, dt) {
    try { this._fx.render(); }
    catch (e) { warnOnce('render', e?.message ?? e); renderer.render(this.scene, this.camera); }
  }
}
