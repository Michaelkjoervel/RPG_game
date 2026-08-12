# LUMENFALL — Contracts Addendum (pinned vocabularies & inner APIs)

Read after ARCHITECTURE.md. These lists are FIXED — all areas must use exactly these ids.

## World class API (src/world/world.js)
```js
class World {
  constructor(game)         // game.renderer available; world.game = game
  async loadZone(zoneId, spawn?)  // builds/disposes zone content; spawn [x,z] optional
  update(dt)                // called by game loop
  scene; camera             // THREE objects (camera from cameraRig)
  zone                      // current ZONE data
  heightAt(x, z) -> y       // terrain height
  colliders                 // array of {x, z, r} (props/buildings/npcs)
  player                    // from createPlayer(world)
  interact()                // player pressed E: dispatch to nearest npc/interactable
  async startWildBattle(speciesId, level, opts?)  // wraps game.startBattle for wild
  addCollider(c); removeCollider(c)
}
```
Inner modules (all receive the World instance where noted):
- `terrain.js`: `buildTerrain(zone) -> { mesh, heightAt(x,z), dispose() }`
- `sky.js`: `createSky(zone, scene) -> { update(dt, dayTime), sunLight, dispose() }`
- `water.js`: `createWater(zone) -> { mesh, update(dt), dispose() } | null`
- `props.js`: `buildProps(zone, heightAt) -> { group, colliders, updaters:[fn(dt,time)], dispose() }`
- `weather.js`: `createWeather(zone, scene) -> { update(dt), dispose() }`
- `wildlife.js`: `createWildlife(zone, world) -> { update(dt), dispose() }`
- `encounters.js`: `createEncounters(zone, world) -> { update(dt), dispose() }` (rolls & calls world.startWildBattle)
- `interactables.js`: `createInteractables(zone, world) -> { update(dt), tryInteract(playerPos, faceDir) -> bool, nearestPrompt(playerPos) -> {text}|null, dispose() }`
- `npcs.js`: `createNpcs(zone, world) -> { update(dt), tryInteract(playerPos, faceDir) -> bool, nearestPrompt(playerPos) -> {text}|null, colliders, dispose() }`
- `player.js`: `createPlayer(world) -> { object3D, update(dt), pos /*Vector3*/, face /*rad*/, teleport(x,z,face?), setFrozen(bool) }`
- `cameraRig.js`: `createCameraRig(world) -> { camera, update(dt), impulse(str) }` (listens cam:shake)

## Battle UI factory (src/ui/battleUI.js) — used by battle/battleFlow.js
```js
createBattleUI(ctx) -> {
  mount(), unmount(),
  async handleEvent(ev),            // battle engine events (pace short UI anims here)
  async getAction(view) -> action,  // view: {self, foe, canFlee, canCatch, bag, party}
  showDamage(xPct, yPct, text, kind), // kind: 'normal'|'super'|'weak'|'crit'|'heal'|'status'; x/y = % of screen
  log(text), async showVictory(result), async showDefeat(), async showVsCard(names)
}
```
Presentation computes screen % coords for showDamage by projecting 3D positions.

## Story glue (src/game/story.js)
- `startNewGame(game)` — full intro: cutscene dialogue → starter choice (`starterUI.chooseStarter`) → tutorial → leaves player in overworld.
- `runNpcInteraction(npcData, world)` — dialogue/battle/rewards/quests. Called by world/npcs.js.
- `onZoneEnter(zoneId, world)` — flag-gated story triggers. world.js calls after load.
- titleUI 'New Journey' → `(await import('../game/story.js')).startNewGame(game)`;
  'Continue' → pick slot → `loadGame(slot)` → `game.enterOverworld()`.

## Prop kinds (props.js implements ALL; zones use ONLY these)
tree_oak, tree_pine, tree_birch, tree_willow, tree_dead, tree_glow, mushroom_giant,
mushroom_cluster, rock, rock_mossy, rock_crystal, crystal_cluster, stump, log, bush,
berry_bush, flower_patch, reeds, lilypad, fern, grass_tuft, fence, lamp_post, shrine_stone,
ruin_pillar, ruin_arch, ruin_wall, house_small, house_large, shop_stall, bridge, well, cart,
crate, barrel, campfire, tent, ice_spike, snow_pile, lava_rock, ember_vent, spire_wall,
banner, statue_warden, waterfall, dock, boat, stalagmite, stalactite, hangmoss, glowfern

## NPC ids (data/npcs.js defines; zones reference)
elder_maren, ashe, keeper_bramwell, keeper_liora, keeper_maro, keeper_sera,
merchant_pip (brighthollow), merchant_wren (driftmoor), herbalist_syl (whisperwood),
deserter_finn (gloamcavern), lanternkeeper_ode (gloamcavern), ferryman_juno (mirrorlake),
climber_bo (skyreach), scholar_imre (sunkenruins), lt_vess, lt_dorn, archon_sol,
seeker_a, seeker_b, seeker_c, seeker_d (generic Order fights, flag-gated),
v_bh_1..v_bh_4 (Brighthollow villagers), v_dm_1..v_dm_2 (Driftmoor villagers)

## Item ids (data/items.js defines)
Restoratives: tonic, super_tonic, grand_tonic, remedy, vigil_bloom, honey_drop (resonance+)
Charms: woven_charm, glazed_charm, gilded_charm, starwoven_charm
Stones: emberstone, tidestone, bloomstone, galestone, terrastone, voltstone, froststone,
venomstone, lumenstone, umbrastone
Talismans: might_band, ward_amulet, focus_lens, aegis_veil, haste_feather, vigor_root,
survivor_knot (survive KO at 1hp once/battle), ember_sigil, tide_sigil, bloom_sigil,
gale_sigil, terra_sigil, volt_sigil (aspect +20% dmg)
Key items: kindred_codex, shrine_shard, ferry_gear, lantern_oil, glade_key
Item def: { id, name, kind:'restorative'|'charm'|'stone'|'talisman'|'key', price, desc, effect:{...} }
SHOPS = { shop_brighthollow: {name, stock:[itemId...]}, shop_driftmoor: {...} }

## Audio ids
Music (tracks.js): title, town, meadow, forest, cave, lake, mountain, ruins, spire, glade,
battle_wild, battle_warden, battle_boss, victory, awakening, gameover
SFX (sfx.js): ui_move, ui_confirm, ui_cancel, ui_open, ui_close, hit_light, hit_heavy, slash,
bloom, fire_small, fire_big, water, thunder, wind, earth, ice, venom, light, dark, heal, buff,
debuff, song, faint, catch_throw, catch_shake, catch_success, catch_fail, levelup, awaken,
chest, item_get, glim, quest_done, sigil, flee, encounter, burst_ready, burst_fire, step_grass,
step_stone, step_wood, step_sand, step_snow, step_water, splash, door, shrine_heal
Footstep surfaces: grass, stone, wood, sand, snow, water
Weather beds (sfx.js startWeatherBed/stopWeatherBed, driven by world/weather.js):
rain, storm, snow, gloom. Bursts: 'burst_fire'/'song' layer the burst's aspect hit
underneath, primed via the battle:event burstUsed listener in audio.js.

## Extra bus events (beyond ARCHITECTURE list)
`prompt:show {text}`, `prompt:hide`, `sfx:footstep {surface}`, `zone:title {name, sub?}`,
`transition:battle` (swirl overlay in), `transition:clear`, `letterbox {on}` (cutscene bars),
`creature:learnmove {mon, moveId}` (UI offers replace if 4 moves)

## Arenas (battle/arenas.js): biome→arena
meadow→meadow, forest→forest, cave→cave, lake→lake, mountain→mountain, ruins→ruins,
spire→spire, glade→glade, town→meadow

## Status effects (engine semantics — single source in engine)
burn (8% maxHP/turn, might ×0.7) · soak (haste ×0.75, +30% volt dmg taken) ·
root (cannot switch/flee, 3% dot, 3 turns) · shock (25% chance to lose the turn) ·
frostbite (4% dot, focus ×0.7) · venom (ramping dot 5%→+3%/turn) · blind (accuracy ×0.65) ·
dread (burst charge gain halved, aegis −1 stage on apply)
One status at a time; later replaces earlier only if target has none. Auras: emberhaze
(+30% ember dmg, frost −30%), tidesurge (+30% tide, ember −30%), gloom (+30% umbra, lumen −30%).

## Catching (capture.js)
Only wild battles. rate = charmBase (woven .50, glazed .62, gilded .60, starwoven .85)
× (1 − 0.7·hp/maxHp) × statusBonus (root/frostbite/shock 1.35, others 1.15) × rarityFactor
(C 1.0, U .7, R .35, L .12) — clamp .02–.95. 0–3 shake events then result. Hollowed: uncatchable.

## Creature model conventions (kit/registry)
Feet at y=0, face +Z, overall height ≈ SPECIES[id].size (meters). Export `build_<id>` from
`src/creatures/models/<id>.js`. Return `{ group, parts, hints }` per kit.js documentation.
Variants: `buildCreature(id, {hollowed, gleaming})`. Shadows: castShadow on meshes.
