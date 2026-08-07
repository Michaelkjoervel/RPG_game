# LUMENFALL — Architecture & Module Contracts

Read `docs/DESIGN_BIBLE.md` first. This document defines HOW the code fits together.
**Follow these contracts exactly — integration depends on them.** Plain modern JavaScript
(ES modules), no build step, no TypeScript, no external assets (all geometry, materials,
audio are procedural).

## Runtime layout

- Static site served from repo root. `index.html` has `<canvas id="game-canvas">`, a DOM UI
  overlay `<div id="ui-root">`, and an import map: `"three" → ./vendor/three.module.js`,
  `"three/addons/" → ./vendor/addons/`.
- Entry: `src/main.js` → creates `Game` (`src/game/game.js`) → title screen → overworld ↔ battle.
- One `WebGLRenderer` shared by all scenes. Target 60fps on mid hardware: instancing for
  vegetation, merged geometry for static props, shadow map 2048, pixelRatio clamp 2.

## Core singletons (src/core/) — ALREADY WRITTEN, import and use, do not rewrite

- `events.js` → `export const bus = new EventBus()` with `.on(name, fn)`, `.off`, `.emit(name, payload)`.
- `state.js` → `export const G = {...}` the whole mutable game state (see Save schema below) plus
  helpers (`G.flags`, `G.party`, etc.). Everything reads/writes this; save serializes it.
- `save.js` → `saveGame(slot)`, `loadGame(slot)`, `listSaves()`, autosave on zone change.
- `input.js` → `input.axes {x,y}`, `input.pressed(action)`, `input.onAction(action, fn)`; actions:
  `move`, `interact` (E/Enter), `run` (Shift), `menu` (Esc/Tab), `codex` (C), `confirm`, `cancel`.
  Gamepad + keyboard + pointer supported.
- `settings.js` → persisted settings `{musicVol, sfxVol, quality (low/med/high), textSpeed, camShake, invertY}`.
- `rng.js` → `seededRandom(seed)` returns fn; `pick(arr)`, `randRange(a,b)`.
- `math.js` → `lerp, clamp, damp, smoothstep, easeOutBack, easeOutCubic, easeInOutSine` etc.
- `tween.js` → `tween({from,to,dur,ease,onUpdate,onDone})` central ticker; `delay(ms)` promise;
  `shake(intensity,dur)` emits `cam:shake`.

## Event names (bus) — canonical list

`game:start`, `game:loaded`, `zone:enter {zoneId}`, `zone:left`,
`dialogue:start {lines,speaker,onDone}`, `dialogue:end`,
`battle:start {encounter}`, `battle:end {result}`,
`battle:event {type,...}` (see Battle events), `party:changed`, `codex:updated {speciesId,status}`,
`quest:started {id}`, `quest:updated {id}`, `quest:completed {id}`,
`item:gained {id,qty}`, `glim:changed`, `creature:levelup {mon}`, `creature:awakened {mon,toId}`,
`resonance:up {mon}`, `sigil:gained {n}`, `cam:shake {intensity,dur}`, `ui:sfx {name}`,
`notify {text, icon?}` (toast), `flag:set {key}`.

## Data schemas (src/data/)

### Species (`src/data/creatures.js` → `export const SPECIES = { [id]: {...} }`)
```js
kindlet: {
  id: 'kindlet', name: 'Kindlet', aspects: ['ember'], stage: 1, rarity: 'starter',
  base: { vigor: 45, might: 52, ward: 40, focus: 48, aegis: 38, haste: 52 }, // sums ~275 stage1, ~340 stage2, ~410 stage3
  growth: 'medium', // xp curve: slow|medium|fast
  awakensTo: { id: 'charvane', level: 16 }, // or {id, item:'emberstone'} | {id, shrine:true} | {id, resonance:4}
  learnset: [ [1,'scratch'], [1,'emberflick'], [5,'soothe'], [9,'cinderdash'], ... ],
  trait: 'kindleheart',            // passive id in abilities.js TRAITS
  burst: 'cinderhowl',             // resonant burst id in abilities.js BURSTS
  size: 0.6, // world scale ~meters tall
  cry: { pitch: 1.4, timbre: 'chirp' }, // cry synth hints: pitch 0.5..2, timbre chirp|growl|hum|trill|rumble|bell
  codex: 'Its tail-flame flickers with its mood; it dims when the pup is lonely.',
  habitat: 'Hearths and sun-warmed stones',
}
```

### Abilities (`src/data/abilities.js` → `ABILITIES`, `TRAITS`, `BURSTS`)
```js
emberflick: {
  id: 'emberflick', name: 'Emberflick', aspect: 'ember', kind: 'focus', // might|focus|status
  power: 40, accuracy: 100, priority: 0,
  effects: [{ type: 'status', status: 'burn', chance: 15 }], // see battle engine for effect types
  desc: 'Flicks a spark at the foe. May burn.',
  fx: { anim: 'projectile', color: 0xff7a3c, impact: 'burst', sfx: 'fire_small' }, // presentation hints
}
```
Effect types the engine implements: `status` (burn|soak|root|shock|frostbite|venom|blind|dread),
`statStage {stat, stages, target:'self'|'foe', chance}`, `heal {percent}`, `drain {percent}`,
`recoil {percent}`, `priority`, `multihit {min,max}`, `aura {kind}` (emberhaze|tidesurge|gloom),
`cleanse`, `guard`, `flee`.

### Creature instance (a caught/party Kindred) — created by `makeCreature(speciesId, level, opts)` in `src/game/creatures.js`
```js
{ uid, speciesId, nickname|null, level, xp, resonance, resonanceXp, hp, maxHp,
  stats: {might,ward,focus,aegis,haste}, moves: ['emberflick', ...] /* ≤4 ids */,
  talisman: null|itemId, status: null, statStages: {...}, burstCharge: 0..100,
  shiny: false /* 'gleaming' 1/512 recolor */, hollowed: false, metAt: zoneId }
```

### Zones (`src/data/zones/<id>.js` → `export const ZONE = {...}`)
```js
{ id: 'dawnmeadow', name: 'Dawnmeadow', biome: 'meadow',
  size: 220, // square world units
  ambient: { skyTop: 0x9fd8ff, skyBottom: 0xdff2e0, fogColor: 0xcfe8d8, fogDensity: 0.008,
             sun: 0xfff2d0, music: 'meadow', weather: 'clear'|'rain'|'storm'|'snow'|'gloom' },
  terrain: { kind: 'meadow', hills: 1.0, seed: 7 },  // world/terrain.js interprets
  water: null | { level: 0.4, size: 80, pos: [x,z] },
  paths: [ { from:[x,z], to:[x,z], width: 3 } ],
  props: [ { kind: 'tree_oak', density: 0.4, area: [x,z,r] }, { kind:'rock_mossy', at:[x,z], scale:1.2 } ],
  portals: [ { to: 'whisperwood', at: [x, z], radius: 3, label: 'To Whisperwood', spawn: [x,z] } ],
  npcs: [ { id: 'keeper_bramwell', at: [x,z], face: 0 } ],   // -> data/npcs.js
  encounters: { patches: [ {at:[x,z], r:8} ], table: [ {speciesId:'vellit', w:30, lv:[2,4]} ],
                rate: 0.25, roaming: [ {speciesId:'pebbin', count:2, area:[x,z,r]} ] },
  interactables: [ { kind:'chest', at:[x,z], item:'tonic', qty:2, flag:'dm_chest1' },
                   { kind:'shard', at:[x,z], flag:'dm_shard1' } /* lore stones, etc */ ],
  spawn: [x, z] }
```

### NPCs/dialogue/quests (`src/data/npcs.js`, `dialogues.js`, `quests.js`)
NPC: `{ id, name, kind:'villager'|'keeper'|'seeker'|'rival'|..., appearance:{palette,hat,...},
dialogue: 'dlg_id' | fn(G)=>id, wanderRadius, battle?: { team:[{speciesId,level}...], reward,
onWin:{flag}, once:flag } }`.
Dialogue: `{ id, lines: [ {speaker, text, portrait?, choices?: [{text, goto|flag|fn}] } ] }`
— text supports `{player}` substitution. Quest: `{ id, name, steps: [{text, isDone(G)}],
onComplete(G), rewards {glim,items,xp} }` with tracker UI showing current step.

## Battle contract — THE critical seam

`src/battle/engine.js` is **pure logic, zero three.js/DOM imports**. It runs a battle as an
async state machine and reports everything through an event sink:

```js
const battle = new BattleEngine({
  playerTeam: [creature, ...], enemyTeam: [...],
  kind: 'wild'|'warden'|'boss', canFlee, canCatch, enemyName?, ai: 'basic'|'tactical'|'boss',
  arena: 'meadow'|'forest'|'cave'|'lake'|'mountain'|'ruins'|'spire', weatherAura?: 'emberhaze'|...
});
battle.onEvent = async (ev) => { /* presentation+UI await this; engine waits for the promise */ };
const result = await battle.run(getPlayerAction); // getPlayerAction(view) -> Promise<action>
// action: {type:'move', moveId} | {type:'switch', index} | {type:'item', itemId, targetUid?}
//       | {type:'catch', charmId} | {type:'flee'} | {type:'burst'}
// result: {outcome:'win'|'loss'|'flee'|'caught', xp, glim, caught?}
```
Battle events (`ev.type`): `intro`, `send {side,mon}`, `recall {side}`, `turnStart {n}`,
`moveUsed {side,mon,move}`, `hit {side,dmg,eff:'super'|'weak'|'normal'|'immune',crit,hpLeft}`,
`miss`, `statusApplied {side,status}`, `statusTick {side,status,dmg}`, `statStage {side,stat,delta}`,
`heal {side,amt}`, `auraStart {kind}`, `auraEnd`, `burstReady {side}`, `burstUsed {side,mon,burst}`,
`faint {side}`, `catchAttempt {shakes,success}`, `xp {mon,amount,levelups}`, `end {result}`.
`side` is `'p'` or `'e'`. The engine AWAITS `onEvent` so presentation controls pacing.

`src/battle/presentation.js` owns the battle scene: arena builder (`arenas.js`), creature models
via `src/creatures/registry.js`, camera director (`cameraDirector.js`), VFX (`vfx.js`,
`src/gfx/particles.js`), animation sequencing per `fx.anim` hint
(`melee|projectile|beam|burst|buff|debuff|field|song`). `src/ui/battleUI.js` renders DOM:
health bars (animated drain), action menu, move cards w/ aspect colors, team pips, log toasts.
`src/battle/battleFlow.js` composes engine+presentation+UI; overworld calls
`startBattle(config) -> Promise<result>`.

## Creature models contract

`src/creatures/registry.js` → `buildCreature(speciesId, {variant})` returns
`{ group /*THREE.Group facing +Z, feet at y=0, height≈species.size*/, animator }`.
Each species has a builder in `src/creatures/models/<id>.js` exporting `build_<id>(kit)`.
`src/creatures/kit.js` provides shared parts/materials (bodies, eyes w/ highlight, horns, wings,
fins, tails, leaf/flame/crystal shapes, toon-ish gradient materials, `hollowify(group)`).
`animator` (from `src/creatures/animator.js`) exposes
`play(name)` for `idle|walk|attack|special|hit|faint|happy|sleep` (procedural, looping idle w/
breath+blink) and `update(dt)`. EVERY species: unique silhouette + personality-driven idle.

## Overworld contract

`src/world/world.js` owns the overworld scene: builds zone from data via `terrain.js`, `props.js`
(instanced vegetation w/ wind sway), `water.js`, `sky.js` (gradient dome, sun, clouds, day/night),
`weather.js` (rain/snow/storm particles + audio hooks), `wildlife.js` (ambient critters, roaming
encounters as visible creatures), `npcs.js` (visible stylized humans w/ idle anims + wander),
`interactables.js` (chests w/ open anim, lore shards, shrine), `encounters.js` (shimmer patches;
walking in rolls encounter → `battle:start`). `src/world/player.js`: third-person character
(stylized Warden model, run/idle anims), WASD+gamepad movement w/ acceleration, collision vs
props/bounds (simple radius), interact prompt system ("[E] Talk"), follower: party lead creature
walks behind the player using its registry model. `cameraRig.js`: smooth-follow orbit camera,
collision-aware, subtle idle drift, look-ahead while running.

## UI contract (src/ui/)

DOM in `#ui-root`, styles in `styles/*.css` (base tokens in `styles/base.css` — use its CSS
variables). Modules: `hud.js` (party pips, minimap-less compass, quest tracker, zone title
cards, toasts), `dialogueUI.js` (portrait letterbox dialogue, typewriter w/ skip, choices),
`menus.js` (pause hub: Party, Codex, Bag, Quests, Save, Settings), `party.js` (team manage,
reorder, details, talismans), `codexUI.js` (Kindred Codex: silhouette→discovered→caught states,
live rotating 3D preview via small secondary renderer viewport, lore, stats), `bagUI.js`,
`shopUI.js`, `titleUI.js` (animated title with 3D vignette, New/Continue/Settings),
`starterUI.js` (dramatic starter choice w/ 3D pedestals), `settingsUI.js`, `battleUI.js`,
`awakeningUI.js` (evolution cinematic overlay). All menus: keyboard+mouse+gamepad navigable,
open/close transitions, `ui:sfx` on every interaction.

## Audio contract (src/audio/)

`audio.js`: lazy AudioContext (first gesture), master/music/sfx gains wired to settings.
`music.js`: pattern sequencer (tracks defined in `tracks.js` as note patterns w/ synth voice
ids), crossfade between zone themes, battle transition sting. `sfx.js`: `sfx('hit_heavy')`
etc. — synthesized presets (UI ticks, hits per aspect, footsteps per surface, ambient beds per
biome started by zone). `cries.js`: `playCry(speciesId)` synthesizes from `species.cry`.
Subscribe to bus events (`ui:sfx`, `battle:event`, `zone:enter`...) so gameplay code never
imports synth internals directly.

## Save schema (localStorage `lumenfall_save_<slot>`)
`{ version, playerName, pos:{zone,x,z,face}, party:[creatureInst], reserve:[...], bag:{itemId:qty},
glim, sigils:[bool×5], flags:{...}, codex:{ [speciesId]:'seen'|'caught' }, quests:{[id]:{step,done}},
settings, playtimeSec, calendar:{dayTime}, starter, resonanceWalks, savedAt }`

## File ownership (for parallel agents — do NOT edit files outside your area)
- core/* , data/aspects.js, game/game.js, main.js, index.html, styles/base.css → INTEGRATOR ONLY
- world engine: src/world/* (except player.js, cameraRig.js), src/gfx/materials.js, postfx.js
- player controls: src/world/player.js, src/world/cameraRig.js
- zone content: src/data/zones/*, src/data/worldmap.js
- creature data: src/data/creatures.js, src/data/abilities.js
- creature models: src/creatures/*
- combat engine: src/battle/engine.js, formulas.js, ai.js, capture.js, src/game/creatures.js
- battle presentation: src/battle/presentation.js, arenas.js, cameraDirector.js, vfx.js, battleFlow.js, src/gfx/particles.js
- UI: src/ui/*, styles/* (except base.css)
- audio: src/audio/*
- story: src/data/npcs.js, dialogues.js, quests.js, items.js, story.js, src/game/quests.js, src/game/story.js

Every module must be import-error-free (`node --check` passes) and export exactly what this
contract names. When you need something from another area, import the contract surface — never
reimplement it.
