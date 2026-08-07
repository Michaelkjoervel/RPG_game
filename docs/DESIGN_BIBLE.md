# LUMENFALL — Design Bible

**This document is the single source of truth for the world, creatures, story, and art direction.
Every contributor (human or agent) must read it before writing code or content, and must not
contradict it. Additions are welcome; contradictions are not.**

Lumenfall is an original single-player creature-collecting RPG. It is inspired by the *feel* of
the genre (adventure, discovery, bonding, strategic battles) but is an original IP. Never use
names, creatures, items, moves, locations, or terminology from Pokémon, Digimon, or any other
franchise.

---

## 1. The World and its Mythology

Ages ago, two lights hung in the sky: the Sun, and its wandering twin — **the Lumen**, a living
star. In an age no one remembers, the Lumen shattered. Its fall lit the sky for a hundred nights,
and its shards seeded the land of **Vael**. Where shardlight pooled — in deep water, old stone,
tangled roots — the land began to *dream*, and its dreams took flesh. These beings are the
**Kindred**: living memories of the world, each carrying a mote of starlight in its chest called
a **heartspark**.

Humans cannot touch shardlight directly; it burns. But a human who earns a Kindred's trust can
**attune** to its heartspark — a resonance that binds the two. Such humans are called
**Wardens**. Attunement is not ownership: a bond is a duet, and a Kindred grows stronger the
deeper the bond (**Resonance**) becomes.

The central mystery: the world's ambient shardlight is slowly fading — **the Dimming**. Wild
Kindred grow scarcer in dimmed places; colors literally drain from the land. The **Hollow
Order**, a masked faction, believes the only cure is to *reforge the Lumen* — by harvesting
heartsparks from living Kindred. Harvested Kindred don't die; worse, they become **Hollowed**:
gray, cracked husks with seams of pale light, driven to feral aggression. The player discovers
that deep Resonance can *rekindle* shardlight without harvesting — bonds are literally the cure —
setting up the ideological clash with the Order's leader, **Archon Sol**, a sincere zealot who
believes cruelty now prevents extinction later.

### Terminology (use everywhere, consistently)
| Concept | Lumenfall term |
|---|---|
| The world / region | **Vael** (region: **the Duskmere Reach**) |
| Creatures | **Kindred** (singular and plural) |
| Player profession | **Warden** |
| Catching | **Attunement** ("attune a Kindred") |
| Capture device | **Charm** (tiers: Woven, Glazed, Gilded, Starwoven) |
| Bond stat | **Resonance** (levels 0–5) |
| Evolution | **Awakening** ("Thistlit awakened into Briarback!") |
| Elements | **Aspects** (10, see §3) |
| Bestiary | **Kindred Codex** |
| Currency | **Glim** |
| Corrupted creatures | **Hollowed** (variant, not species) |
| Badge-equivalent | **Sigils**, earned from **Shrine Keepers** (5 total) |
| Healing item | **Tonic** / status cure **Remedy** / revive **Vigil Bloom** |
| Evolution items | **Awakening Stones** (Emberstone, Tidestone, ...) |
| Held equipment | **Talismans** |

## 2. Story Skeleton

- **Protagonist**: a young Warden-initiate from Brighthollow (default name **Rowan**, player-renamable).
- **Mentor**: **Elder Maren**, Brighthollow's scholar-elder. Gives the starter choice and the Kindred Codex.
- **Rival**: **Ashe** — childhood friend, warm but fiercely competitive. Picks the starter strong
  against yours. Mid-game, Ashe flirts with the Order's promises of power before turning back — their
  arc is doubt, not villainy. Recurring battles (5 total, escalating).
- **Antagonists**: the **Hollow Order** — rank-and-file **Seekers** (masked, gray-robed), lieutenants
  **Vess** (icy tactician, Frost/Umbra teams) and **Dorn** (jovial brute, Terra/Ember teams), and
  **Archon Sol** (final boss; Lumen/Umbra team; wields a Hollowed legendary attempt).
- **Beats**: starter choice → Dawnmeadow tutorial → first Sigil → Whisperwood (first Hollowed Kindred
  found, mystery begins) → Order steals Brighthollow's shrine-shard, Maren injured → journey for the
  remaining Sigils through Gloamcavern, Mirrorlake, Skyreach → the Sunken Ruins reveal the truth of
  the Lumenfall and the Dimming → assault the Hollow Spire → Sol attempts to hollow the Firstborn
  **Thalassyr** → final battle → epilogue: shardlight rekindles where the player's bonds run deep.
  Post-game: hunt the Firstborn (Aurios, Nyxmara, Thalassyr).
- Smaller stories live in side quests (see quests data): a Seeker deserter, Driftmoor's sunken
  ferry, the lantern-keeper of Gloamcavern, Ashe's family, Keeper Liora's lost Dapplyn, etc.

## 3. Aspects (elements)

Ten Aspects + Neutral. Multipliers: strong ×1.6, weak ×0.65, immune ×0 (rare).

| Aspect | Flavor | Strong vs | Weak vs (takes more from) |
|---|---|---|---|
| **Ember** | fire, cinders | Bloom, Frost | Tide, Terra |
| **Tide** | water, currents | Ember, Terra | Bloom, Volt |
| **Bloom** | plants, growth | Tide, Terra | Ember, Frost, Venom |
| **Gale** | wind, sky | Bloom, Venom | Volt, Frost |
| **Terra** | stone, soil | Volt, Ember | Tide, Bloom |
| **Volt** | storm, lightning | Tide, Gale | Terra |
| **Frost** | ice, stillness | Gale, Bloom | Ember |
| **Venom** | toxin, decay | Bloom, Tide | Terra, Gale |
| **Lumen** | starlight, memory | Umbra | Umbra |
| **Umbra** | shadow, forgetting | Lumen | Lumen |

Lumen and Umbra are mutually strong AND mutually weak (high-stakes mirror). Neutral has no
multipliers. Same-aspect ability bonus (STAB-like): ×1.25, called **Attunement Bonus**.

## 4. The Kindred Roster (48 species — FIXED LIST, ids are canonical)

Stats: `vigor` (HP), `might`, `ward`, `focus`, `aegis`, `haste`. Stages awaken by level unless
noted. Silhouette and personality are binding creative direction. Rarity: C common, U uncommon,
R rare, L legendary.

### Starter lines (player picks one of three at level 5)
| id | Name | Aspect | Stage | Design & personality |
|---|---|---|---|---|
| `kindlet` | Kindlet | Ember | 1 | Round soot-black salamander pup, candle-flame tail tip that flickers with mood. Eager, clumsy. |
| `charvane` | Charvane | Ember | 2 (L16) | Lean coal-furred hound, magma cracks along spine, smoke wisps when it huffs. Loyal, proud. |
| `pyrelith` | Pyrelith | Ember/Terra | 3 (L34) | Heavy obsidian-plated saurian, molten mane, crown of embers. Slow fuse, unstoppable. |
| `nixling` | Nixling | Tide | 1 | Teal axolotl-sprite, droplet-shaped crest, big glassy eyes. Curious, easily distracted. |
| `maelfin` | Maelfin | Tide | 2 (L16) | Sleek otter-mer with sail fins and spiral tail current. Playful show-off. |
| `tidelorn` | Tidelorn | Tide/Gale | 3 (L34) | Long serpentine leviathan with a mane of living water, moon-pale underbelly. Serene, vast. |
| `thistlit` | Thistlit | Bloom | 1 | Hedgehog-seedling, thistle-quill back, one sprout antenna. Shy but stubborn. |
| `briarback` | Briarback | Bloom | 2 (L16) | Bristling thorn-boar, bramble armor, berry-red eyes. Protective headbutter. |
| `sylvathorn` | Sylvathorn | Bloom/Terra | 3 (L34) | Tall antlered guardian — stag body, bark plates, hanging moss cloak, glade-green glow. Solemn. |

### Wilds — Dawnmeadow & Brighthollow outskirts
| id | Name | Aspect | Stage | Design & personality |
|---|---|---|---|---|
| `vellit` | Vellit | Neutral | 1, C | Tuft-tailed meadow hopper (rabbit-deer mix), oversized ears. Skittish. |
| `veldrun` | Veldrun | Neutral | 2 (L14), U | Swift antelope-hare, ribbon tail streams when sprinting. Aloof racer. |
| `pipwing` | Pipwing | Gale | 1, C | Plump round songbird, feather-cowlick. Chirps constantly. |
| `aurelark` | Aurelark | Gale | 2 (L15), U | Elegant lark with dawn-gradient plumage, trailing pennant feathers. Vain soloist. |
| `motling` | Motling | Gale | 1, C | Palm-sized dust-moth sprite with mote-glow antennae. Drawn to light. |
| `zephyra` | Zephyra | Gale | 2 (L18), U | Moth queen, four ribbon wings, comet-trail scales. Regal drifter. |
| `pebbin` | Pebbin | Terra | 1, C | Toddler pebble-golem, moss cap, one loose stone orbiting it. Stoic, tips over. |
| `cairnox` | Cairnox | Terra | 2 (L20), U | Walking cairn of balanced stones, moss shoulders, glowing keystone heart. Patient. |
| `fulmin` | Fulmin | Volt | 1, U | Static-furred fox kit, sparks between ear tips. Zoomies incarnate. |
| `stormane` | Stormane | Volt | 2 (L22), R | Thunder-maned wolf, mane arcs with lightning when it howls. Storm-herald. |

### Whisperwood
| id | Name | Aspect | Stage | Design & personality |
|---|---|---|---|---|
| `myclet` | Myclet | Bloom/Venom | 1, C | Mushroom imp with cap-hat and spore pouch cheeks. Mischievous. |
| `fungore` | Fungore | Bloom/Venom | 2 (L20), U | Shroom-bear, shelf-fungus armor, spore breath. Sleepy juggernaut. |
| `dapplyn` | Dapplyn | Bloom | 1, U | Fawn dappled with living light-spots that drift like sun through leaves. Gentle. |
| `cervalume` | Cervalume | Lumen/Bloom | 2 (shrine), R | Radiant deer, antlers of hard light, hooves leave glowing blossoms. Awakens only at a Shrine. |
| `duskit` | Duskit | Umbra | 1, C | Small twilight owl, mask-like face disc, silent. Judgmental stare. |
| `noctyra` | Noctyra | Umbra/Gale | 2 (L21), U | Great owl of dusk-feathers that blur into shadow at the edges. Night-watcher. |
| `lanterling` | Lanterling | Lumen | 1, U | Firefly-wisp carrying its own tiny lantern (its heartspark, externalized). Helpful. |
| `glowvern` | Glowvern | Lumen | 2 (L19), U | Cat-sized lantern wyvern, glass-bell tail glows. Guides lost travelers. |

### Gloamcavern
| id | Name | Aspect | Stage | Design & personality |
|---|---|---|---|---|
| `sonark` | Sonark | Gale/Umbra | 1, C | Echo-bat with radar-dish ears bigger than its body. Gossip. |
| `reverbane` | Reverbane | Gale/Umbra | 2 (L23), U | Sleek sound-wraith bat, wings ripple with visible echo-rings. |
| `shardling` | Shardling | Terra/Lumen | 1, U | Crystal spiderling, translucent gem abdomen refracting light. Collector. |
| `chandelisk` | Chandelisk | Terra/Lumen | 2 (L25), R | Chandelier-spider, hanging crystal limbs, prisms scatter rainbow shards. |
| `oozel` | Oozel | Venom | 1, C | Dripstone slime with mineral crust hat. Absorbs puddles. |
| `sludgemaw` | Sludgemaw | Venom/Terra | 2 (L24), U | Bulky tar-slime with stalactite teeth. Slow, inexorable. |
| `gloomel` | Gloomel | Umbra/Tide | 1, R | Blind pale cave eel, lure of faint shadowlight. Sings in the dark. |

### Mirrorlake & Driftmoor
| id | Name | Aspect | Stage | Design & personality |
|---|---|---|---|---|
| `finnet` | Finnet | Tide | 1, C | Glass-finned koi, transparent fins like stained glass. Mirror-gazer. |
| `prismfin` | Prismfin | Tide/Lumen | 2 (L22), U | Grand koi whose fins split light into auroras. Lake spirit's herald. |
| `jellune` | Jellune | Tide | 1, U | Moon-jelly that floats above the water at night, bell glows with moonphase. Serene. |
| `bogret` | Bogret | Tide/Terra | 1, U | Grumpy stone-backed toad, wears its boulder like a hat. Territorial. |

### Skyreach Pass
| id | Name | Aspect | Stage | Design & personality |
|---|---|---|---|---|
| `nimbis` | Nimbis | Gale | 1, C | Kitten-sized cloud ray, drizzles when sad. Moody weather. |
| `stratovane` | Stratovane | Gale/Volt | 2 (L26), R | Manta of storm-cloud, lightning veins, thunder on wingbeat. |
| `rimehorn` | Rimehorn | Frost | 1, U | Shaggy ibex, horns of clear ice, frost-breath. Sure-footed elder. |
| `magmite` | Magmite | Ember/Terra | 1, U | Magma beetle, cooling-crust shell with lava seams. Carries warmth to cold places. |

### The Sunken Ruins & late game
| id | Name | Aspect | Stage | Design & personality |
|---|---|---|---|---|
| `glyphant` | Glyphant | Terra/Lumen | 1, R | Small ruin-guardian elephant, glyphs carved in stone hide glow when it remembers. |
| `sancturne` | Sancturne | Lumen/Umbra | 1, R | Ghost bound to a cracked reliquary urn; keeper of the Ruins' trial. |
| `vantash` | Vantash | Umbra | 1, R | Lithe void-panther, used by Order elites; tail ends in a hook of dark. |

### The Firstborn (Legendary)
| id | Name | Aspect | Design |
|---|---|---|---|
| `aurios` | Aurios, the Dawnhart | Lumen | Great stag of morning light, antlers a rising sunburst, walks above the ground on light. Found: Starfall Glade (post-Sigil 5). |
| `nyxmara` | Nyxmara, the Duskveil | Umbra/Gale | Panther with vast moth wings of night-sky, drinks fear, leaves calm. Post-game roaming. |
| `thalassyr` | Thalassyr, the Deepdream | Tide/Umbra | Abyssal leviathan sleeping beneath Mirrorlake; the world's dreams pool in its wake. Story-critical (Sol tries to hollow it). Post-game encounter. |

**Hollowed variants**: any species can appear Hollowed (desaturated gray, crack-seams of pale
light, dimmed eyes, jittery idle). They are battles, not catchable; defeating one releases its
spark. Visually implemented as a material/animation variant flag, never a separate model.

## 5. Progression Systems

- **Levels 1–50.** XP from battles; party-wide share at reduced rate.
- **Abilities**: each species has a learnset (level → ability). Max 4 equipped; replacing is free.
  Each creature also has one **Trait** (passive) and, at Resonance 3+, a **Resonant Burst**
  (signature super move charged by a battle meter).
- **Resonance (bond) 0–5**: raised by battling together, walking together (party lead), tonics,
  quest moments. Gates some Awakenings, powers Bursts, gives small stat bonus (+2%/level).
- **Awakening**: by level, by Awakening Stone, by Shrine (location), or by Resonance threshold —
  variety per roster table. Full-screen sequence with light bloom, silhouette morph, name reveal.
- **Talismans**: one held item per creature (stat boosts, aspect boosts, effects like
  "survive a KO at 1 HP once per battle").
- **Sigils** gate the world: e.g., Sigil 2 calms Gloamcavern's sealed gate, Sigil 4 stills the
  storm on Skyreach.

## 6. Combat Design

Turn-based, 1 active creature per side, teams up to 5, switching costs the turn. Order by
`haste` with priority tiers. Damage formula lives in `src/battle/formulas.js` (single source).
Meaningful decisions come from: aspect matchups, status (burn, soak, root, shock-stagger,
frostbite, venom, blind, dread), stat stages (−3..+3), weather/terrain auras (ember haze, tide
surge, gloom), switch prediction, Burst timing, and attunement (catching) as an action with
tension. Wild battles allow flee. Warden battles are 3–5 creature gauntlets. Bosses have aura
mechanics (e.g., armor phases, two-action turns for Firstborn).

**Game feel is non-negotiable**: every ability has a camera treatment, animation, particles,
sound, hit reaction, damage numbers, and screen response (shake/flash scaled to impact).

## 7. The Region Map (zones — ids canonical)

| id | Name | Type | Content anchor |
|---|---|---|---|
| `brighthollow` | Brighthollow | town (start) | Maren's sanctum, shop, homes, shrine plaza |
| `dawnmeadow` | Dawnmeadow | fields | tutorial, first catches, Keeper Bramwell (Sigil 1, Terra) |
| `whisperwood` | Whisperwood | forest | mushroom glens, Keeper Liora (Sigil 2, Bloom/Lumen), first Hollowed |
| `gloamcavern` | Gloamcavern | cave | crystal dark, light-puzzle, Order ambush |
| `mirrorlake` | Mirrorlake & Driftmoor | lake + hamlet | Keeper Maro (Sigil 3, Tide), ferry, Thalassyr's calm |
| `skyreach` | Skyreach Pass | mountain storm | Keeper Sera (Sigil 4, Gale/Volt), wind bridges |
| `sunkenruins` | The Sunken Ruins | ruins | lore murals, Sancturne's trial (Sigil 5), water-stair puzzle |
| `hollowspire` | The Hollow Spire | fortress finale | Vess, Dorn, Archon Sol gauntlet |
| `starfallglade` | Starfall Glade | hidden glade | Aurios; entrance hidden in Whisperwood behind waterfall |

Zone connections: brighthollow ↔ dawnmeadow ↔ whisperwood ↔ gloamcavern ↔ mirrorlake ↔ skyreach
↔ sunkenruins → hollowspire. starfallglade hidden off whisperwood. Wild encounter levels scale
along that chain (2–6, 5–10, 9–15, 14–20, 18–26, 24–32, 30–38, 36–45).

## 8. Art Direction

- **Look**: stylized painterly low-poly — chunky silhouettes, soft gradients, NO photorealism.
  Flat-shaded or gently smooth-shaded forms with strong color design and rim-light feel.
- **Light**: warm key sun + cool sky hemisphere; volumetric-feel fog for depth; god-ray fakes
  where cheap. Day/night cycle tints the whole palette; shardlight is always pale gold-white.
- **Palette anchors**: meadow springs greens `#7ec850`/`#4f9e4f`, dusk purples `#5b4a8a`,
  warm amber `#ffb85c`, deep slate `#232633`, shard-gold `#ffe9b0`, hollow-gray `#9a9aa4`.
- **Creatures are the stars**: big readable eyes with specular highlight, distinct silhouette at
  64px, always-idle-animated (breathing, blinking, tail sway). Personality over detail.
- **Hollowed**: desaturate to gray, add emissive pale crack-seams, dim the eyes, jittery idle.
- **UI**: deep slate panels (rgba glass), shard-gold accents, parchment tones for codex/dialogue,
  rounded corners, serif display type for titles, clean sans for body. Every interaction has
  hover/press states and soft transitions. No default browser UI anywhere.

## 9. Audio Direction

All audio is synthesized at runtime via WebAudio (no external files). Music: layered, calm
modal themes — town (warm, lilting 3/4), meadow (bright pentatonic), forest (mysterious dorian),
cave (sparse echoes), lake (floating lydian), mountain (driving), ruins (choral pads), battle
(rhythmic, rising), boss (aggressive low ostinato), title (the "Lumen theme" — a 6-note motif:
G4 A4 C5 E5 D5 G5 — reuse this motif across arrangements for identity). Each species gets a
procedurally-generated cry from its seed (pitch/timbre mapped to size/aspect). SFX for every UI
tick, footstep-by-surface, ambient beds (wind, birds, water, cave drips) per zone.

## 10. Quality Bar

If a screen would look out of place in a trailer, it is not done. No placeholder text, no
default-styled buttons, no T-posed or static creatures, no silent interactions, no dead-feeling
world (always ambient motion: grass, wildlife, particles, weather). The player should always
know their current goal (quest tracker) and never be soft-locked.
