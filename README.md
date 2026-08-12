# ✦ LUMENFALL

*An original single-player creature-collecting RPG for the browser — built with Three.js.*

Ages ago the sky held a second star, the **Lumen**. It shattered, and where its shards fell the
land began to dream — its dreams taking flesh as the **Kindred**. You are a young **Warden** of
Brighthollow, setting out to bond with wild Kindred, earn the five Shrine Sigils, and face the
**Hollow Order**, whose cure for the world's slow Dimming is crueler than the disease.

## Play

No build step, no dependencies to install for playing — everything (world, creatures,
animation, music, sound) is generated procedurally at runtime.

```bash
# from the repo root — any static file server works:
python3 -m http.server 8080
# or: npm run serve
```

Open **http://localhost:8080** in a modern browser (Chrome/Edge/Firefox/Safari).
A discrete GPU is not required, but hardware WebGL is strongly recommended.

## Controls

| Input | Action |
|---|---|
| **WASD / arrows / left stick** | Move (analog speed on gamepad) |
| **Shift / R1** | Run |
| **E / Enter (gamepad A)** | Interact / confirm |
| **Q / Backspace (gamepad B)** | Cancel / back |
| **Esc / Tab (gamepad Start)** | Pause menu (Party, Codex, Bag, Quests, Save, Settings) |
| **Mouse drag / right stick** | Orbit camera · **wheel** zoom |

## The game

- **48 original Kindred** across 10 elemental Aspects, each with a procedural 3D model,
  personality-driven idle animation, synthesized cry, learnset, passive Trait and signature
  **Resonant Burst**. Rare **Gleaming** variants exist. Hollowed husks stalk the story.
- **9 handcrafted zones** — town, meadow, forest, cave, lake, storm pass, sunken ruins,
  fortress, and a hidden glade — with day/night, weather, roaming wildlife, hidden chests,
  lore shards, shrines, and environmental puzzles.
- **Strategic turn-based combat** — aspect matchups, statuses, stat stages, field auras,
  switch tactics, burst timing — staged in cinematic arenas with camera direction, particles,
  hitstop and damage numbers.
- **Attunement**: weaken wild Kindred and bind them with Charms; deepen **Resonance** to
  unlock Bursts and certain Awakenings (evolutions by level, stone, shrine, or bond).
- **A full story**: a rival's arc, five Shrine Keepers, the Hollow Order, Archon Sol, three
  legendary Firstborn to hunt post-game — plus 8 side quests and a working economy.
- **Complete audio identity** synthesized in WebAudio: 16 adaptive music tracks built on the
  six-note Lumen motif, per-biome ambience, and bespoke SFX for every interaction.
- **3 save slots + autosave** (browser localStorage).

## Development

```bash
npm install          # dev tooling only (three is vendored for the browser)
npm run serve        # local play
node tools/shoot.mjs tools/drivers/fullloop.mjs   # headless smoke playthrough
QA_BEAUTY=1 node tools/shoot.mjs tools/drivers/showcase.mjs  # creature gallery shots
```

- `docs/DESIGN_BIBLE.md` — the world, roster, story and art direction (single source of truth)
- `docs/ARCHITECTURE.md` + `docs/CONTRACTS_ADDENDUM.md` — module contracts and data schemas
- `src/` — ES modules, no bundler; `vendor/` — vendored Three.js r180
- `tools/` — headless Playwright harness and scripted playthrough drivers

Lumenfall is an original IP created for this project; all names, creatures, mechanics, art and
music are original work.
