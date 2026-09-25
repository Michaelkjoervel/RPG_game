# Lumenfall — Visual Pass v2 brief ("flot og præsentabelt")

Shared brief for every agent in the v2 visual pass. Read it fully before your
first edit. It lives in the repo on purpose: container restarts wipe `/tmp`,
the scratchpad and every uncommitted change — this file and `git log` are what
survives.

## 1. Why this pass exists

The owner played the game and said the graphics were *"firkantet, klodset og
meget basic"* (angular, clunky, very basic). Visual pass v1 added a lot of
detail — gradients, eyes, gable roofs, lighting moods — but **kept the faceted
look**: `mat()` defaulted to `flatShading: true` for every material in the game
and `lobedMass` forced it. Faceted *is* angular: v1 polished the exact thing the
owner complained about. The owner now asks for a world that is
**"flot og præsentabelt"** — beautiful and presentable.

## 2. The v2 look: SOFT STYLIZED

- **Rounded forms, smooth shading.** Facets survive only where the real thing
  is cut or crystalline: crystals, gems, ice, dressed stone blocks, planks.
  Everything organic — creatures, people, foliage, most rocks, terrain,
  clouds — is smooth and soft.
- **Soft light.** Gentle terminator, a rim light that lifts creatures and
  people off the background, warm key / cool fill (sky.js already has the
  moods — keep them).
- **Lush.** Instanced grass that sways, fluffy canopies, flowers. The space
  around the player must feel full and alive.
- **Depth.** Every view layers foreground detail, a midground landmark and a
  background silhouette (ridges, tree lines, clouds). Never a flat empty
  horizon line.
- **Glow.** Emissive accents (crystals, lanterns, creature elements, shards)
  with gentle bloom on High.
- **Read.** Creatures and people get a soft dark outline so they pop the way
  finished games' characters do.
- Reference *feel* (not IP): A Short Hike's color, Ghibli-inspired soft
  foliage, the soft-toon creatures of modern Nintendo-style monster games,
  Tunic's clean readability. The bar: **would a screenshot of this frame make
  someone want to play the game?**

## 3. Baseline diagnosis (v1 renders)

- **Terrain**: huge flat-shaded triangles; vertex colors interpolate across
  them, so patches smear, path edges look airbrushed, grass reads acid-green.
  It looks like a low-resolution mesh — the single biggest "cheap" signal.
- **Emptiness**: zones are large (~220 m) and sparse — open fields, a few
  trees, a flat haze line for a horizon. Brighthollow's plaza is a big empty
  orange square with scattered props; it does not read as a town.
- **Characters**: from behind (the default camera!) the Warden is a purple
  slab — the cloak is a box panel.
- **Creatures**: the new eyes are charming, but bodies are cylinders and
  capsules with facet shading; legs read as sticks or pillars.
- **Trees**: better than v0 but faceted lobes; canopy undersides go near-black.
- **Lighting/sky**: solid after v1. Keep and extend, don't restart.

## 4. Shared foundation — `src/gfx/materials.js`

- `smoothGeometry(geo, { creaseAngle })` — crack-free rounded normals, in
  place. `creaseAngle ≈ 0.9` keeps hard edges on cut stone / furniture.
- `sphericalNormals(geo, { center, blend })` — "one soft ball" shading for
  canopies, bushes, clouds, fluffy fur (the classic stylized-foliage trick).
- `jitterGeometry` is now crack-free and ends with smooth normals (ignored by
  flat-shaded materials, used by smooth ones).
- Existing: `mat()`, `applyVertexGradient`, `contactShadow`, `lobedMass`,
  `windSway/tickWind`, `groundPalette`, `hashNoise`.
- `mergeVertices` / `mergeGeometries`: `three/addons/utils/BufferGeometryUtils.js`.
- Smoothing only shows on a material with flat shading off. Until the LOOK-DEV
  agent flips `mat()`'s default, pass `{ flat: false }` explicitly.
- Apply vertex colors **after** merging/smoothing, and paint by position, so
  duplicated corners stay identical.

## 5. Ownership (strict — edit only your own files)

| Agent | Owns |
|---|---|
| LOOK-DEV | `src/gfx/materials.js`, `src/gfx/postfx.js`, `src/creatures/kit.js`, `src/creatures/registry.js`, model-building sections of `src/world/player.js` and `src/world/npcs.js` |
| GROUND | `src/world/terrain.js`, new `src/world/grass.js`, grass hookup lines in `src/world/world.js` (nothing else in world.js) |
| SKY & WATER | `src/world/sky.js`, `src/world/water.js`, `src/world/weather.js` |
| WORLD DRESSING | `src/world/props.js`, `src/world/interactables.js`, `src/world/wildlife.js`, and ONLY the `props: [...]` arrays in `src/data/zones/*.js` |
| CREATURES | `src/creatures/models/*.js` (all 48) |
| PRESENTATION | `src/battle/arenas.js`, `src/battle/presentation.js`, `src/battle/vfx.js`, `src/battle/cameraDirector.js` (framing only), `src/gfx/particles.js`, `src/ui/titleUI.js`, `src/ui/starterUI.js`, `src/ui/awakeningUI.js` |

The integrator (main session) owns everything else, including `src/game/game.js`.
Gameplay logic is off limits for everyone: movement, collision, `heightAt`
values, encounters, dialogue, NPC ids/positions, portals, save data, battle
rules. If you need a change outside your files, write it in your final report.

## 6. Operational rules (learned the hard way)

1. **Commit + push your own files after every round** that passes
   `node --check` and a screenshot sanity check. Restarts wipe uncommitted work.
   Serialize git with a lock, and commit only your paths:
   ```bash
   until mkdir /tmp/lf-git-lock 2>/dev/null; do sleep 2; done
   git add <your files> && git commit -q -m "<what changed>" \
     -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" \
     -m "Claude-Session: https://claude.ai/code/session_01JHgiSrgSaoFpe2kKC2wxhi" -- <your files>
   git push -q origin claude/creature-collecting-rpg-2qlw2p || \
     (git pull -q --rebase --autostash origin claude/creature-collecting-rpg-2qlw2p && git push -q origin claude/creature-collecting-rpg-2qlw2p)
   rmdir /tmp/lf-git-lock
   ```
   After a restart: `npm install --no-audit --no-fund` if `node_modules` is gone;
   `git log --oneline -15` shows what you already committed.
2. **Never end your turn waiting on a background task or monitor** — nothing
   will wake you. Run every shoot as ONE blocking foreground command (Bash
   timeout 600000) that holds the screenshot lock:
   ```bash
   until mkdir /tmp/lf-shoot-lock 2>/dev/null; do
     a=$(( $(date +%s) - $(stat -c %Y /tmp/lf-shoot-lock 2>/dev/null || date +%s) ))
     [ $a -gt 720 ] && rmdir /tmp/lf-shoot-lock 2>/dev/null; sleep 15; done
   trap 'rmdir /tmp/lf-shoot-lock 2>/dev/null' EXIT INT TERM
   QA_BEAUTY=1 QA_VIEWPORT=1120x630 node tools/shoot.mjs <driver> <outDir>
   ```
   One browser at a time — the machine has 4 cores and software WebGL.
   Keep each shoot under ~8 minutes; split long drivers.
3. **Drivers**: reuse `loadIn(page, h)` and `goZone(page, h, zone, name, dayTime)`
   from `tools/drivers/integration-a.mjs` (seeded save → Continue; bounded,
   fire-and-forget zone entry). The title screen eats keypresses, so never
   drive it with raw keys for setup. `h.waitFor` strings must return
   serializable values (never DOM elements). Battle driver pattern:
   `tools/drivers/tour-c.mjs`. Creature gallery: `tools/drivers/showcase.mjs`.
   Put your drivers in `tools/drivers/v2-<agent>-*.mjs` (commit them) and your
   output under the scratchpad (`/tmp/claude-0/-home-user-RPG-game/af506d6b-d72f-5a70-b4c0-4c049ac352ba/scratchpad/v2-<agent>/`).
4. **Modes**: default = fast (960×540, quality `low` — no postfx, no shadows).
   `QA_BEAUTY=1` = 1600×900, quality `high`. For material/lighting iteration
   use `QA_BEAUTY=1 QA_VIEWPORT=1120x630`; finals at full `QA_BEAUTY=1`.
5. **Judge every render yourself** with the Read tool, as the harshest art
   director in the building. Faceted where it should be soft? Empty? Muddy?
   Does it make you want to play? Iterate until the answer is yes.
6. Kill only your own processes. Never `pkill -f` a pattern that could match
   another agent's command line.
7. Usage limits can kill you mid-task; you will be resumed from your
   transcript. Commit early so nothing is lost.

## 7. Performance budget

The owner plays in a browser on an ordinary laptop. Quality tiers are
`low | med | high` (`settings.quality`, default `high`; listen to
`settings:changed`).

- High ≈ 60 fps on a mid-range laptop GPU; Med ≈ integrated GPU; Low minimal.
- Report `renderer.info.render` (`calls`, `triangles`) before/after for your
  scenes: `page.evaluate("JSON.stringify(window.LF.game.renderer.info.render)")`.
- Grass: one or a few instanced draw calls; ≤ ~60k blades High, ~25k Med,
  ≤ ~8k Low.
- Outlines only on creatures and humans, never props.
- Bloom: High only, half resolution.
- No per-frame allocations, no per-frame geometry rebuilds.

## 8. Evidence and reporting

BEFORE shots (same cameras you'll use for AFTER) → at least three
edit/shoot/judge rounds → AFTER shots at full `QA_BEAUTY=1`. The final report
states honestly what improved, what is still weak, perf numbers, and the files
changed. The owner has called out overselling before — do not do it.

## 9. Definition of done

A new player's first minutes — title → starter choice → Brighthollow →
Dawnmeadow → first battle — look like a finished, charming indie game in every
frame, and the rest of the zones hold the same bar.
