// LUMENFALL — items & shops. Single source for ITEMS and SHOPS.
// See docs/CONTRACTS_ADDENDUM.md §Item ids for the pinned id list (every id below is used
// exactly once, nothing invented, nothing missing).
//
// Effect shapes (consumed by battle/bag/UI systems — kept small & declarative on purpose):
//   restorative → { heal:number }            flat HP restored
//              or { cleanse:true }            clears any status ailment
//              or { revive:pct }              revives a fainted Kindred at `pct` of max vigor
//              or { resonanceXp:number }      grants Resonance progress to the target
//   charm      → { catchRate:0..1 }           mirrors capture.js's pinned charmBase table exactly
//   stone      → { awakenAspect:aspectId }    aspect flavor only — the *actual* awakening link is
//                                             SPECIES[id].awakensTo === {id, item:'<thisId>'} (creature-data's file)
//   talisman   → { stat:'might'|'ward'|'focus'|'aegis'|'haste'|'vigor', pct:number }
//             or { aspect:aspectId, pct:number }
//             or { surviveKO:true }
//   key        → no mechanical effect (null); plot/quest bearing only
export const ITEMS = {
  // ---------------------------------------------------------------- Restoratives
  tonic: {
    id: 'tonic', name: 'Tonic', kind: 'restorative', price: 35,
    effect: { heal: 35 },
    desc: 'A warm, honeyed draught brewed from meadow herbs. Mends minor hurts.',
  },
  super_tonic: {
    id: 'super_tonic', name: 'Super Tonic', kind: 'restorative', price: 80,
    effect: { heal: 80 },
    desc: 'Distilled shardlight and mountain mint. Mends deep hurts fast.',
  },
  grand_tonic: {
    id: 'grand_tonic', name: 'Grand Tonic', kind: 'restorative', price: 160,
    effect: { heal: 160 },
    desc: 'A healer\'s last resort, sealed in glass. Mends nearly anything.',
  },
  remedy: {
    id: 'remedy', name: 'Remedy', kind: 'restorative', price: 42,
    effect: { cleanse: true },
    desc: 'Bitter, clean-tasting root tea. Clears burns, venom, frost — any ailment.',
  },
  vigil_bloom: {
    id: 'vigil_bloom', name: 'Vigil Bloom', kind: 'restorative', price: 240,
    effect: { revive: 0.5 },
    desc: 'A pressed flower that never quite wilts. Revives a fainted Kindred at half vigor.',
  },
  honey_drop: {
    id: 'honey_drop', name: 'Honey Drop', kind: 'restorative', price: 65,
    effect: { resonanceXp: 40 },
    desc: 'Slow-crystallised sunlight from Dawnmeadow\'s hives. Deepens a bond.',
  },

  // ---------------------------------------------------------------- Charms (capture.js is the source of truth for rate math — mirrored here for shop copy)
  woven_charm: {
    id: 'woven_charm', name: 'Woven Charm', kind: 'charm', price: 50,
    effect: { catchRate: 0.30 },
    desc: 'Reed and twine around a whisper of shardlight. The simplest attunement.',
  },
  glazed_charm: {
    id: 'glazed_charm', name: 'Glazed Charm', kind: 'charm', price: 150,
    effect: { catchRate: 0.45 },
    desc: 'Kiln-glazed and rune-etched. A steadier, surer bond.',
  },
  gilded_charm: {
    id: 'gilded_charm', name: 'Gilded Charm', kind: 'charm', price: 400,
    effect: { catchRate: 0.60 },
    desc: 'Gold leaf laid over a sliver of true starlight.',
  },
  starwoven_charm: {
    id: 'starwoven_charm', name: 'Starwoven Charm', kind: 'charm', price: 900,
    effect: { catchRate: 0.85 },
    desc: 'Woven, thread by thread, from a fallen star\'s own light. Vanishingly rare.',
  },

  // ---------------------------------------------------------------- Awakening Stones (one per Aspect)
  emberstone: {
    id: 'emberstone', name: 'Emberstone', kind: 'stone', price: 380,
    effect: { awakenAspect: 'ember' },
    desc: 'Warm to the touch, never cooling. Coaxes an Ember-bonded Kindred to awaken.',
  },
  tidestone: {
    id: 'tidestone', name: 'Tidestone', kind: 'stone', price: 380,
    effect: { awakenAspect: 'tide' },
    desc: 'Smooth and salt-slick, it beats faintly like a far-off surf. Wakes what sleeps in Tide.',
  },
  bloomstone: {
    id: 'bloomstone', name: 'Bloomstone', kind: 'stone', price: 380,
    effect: { awakenAspect: 'bloom' },
    desc: 'Threaded with living green veins that never stop growing.',
  },
  galestone: {
    id: 'galestone', name: 'Galestone', kind: 'stone', price: 380,
    effect: { awakenAspect: 'gale' },
    desc: 'Lighter than it should be; it hums when the wind changes.',
  },
  terrastone: {
    id: 'terrastone', name: 'Terrastone', kind: 'stone', price: 380,
    effect: { awakenAspect: 'terra' },
    desc: 'A fist-sized chunk of the old world\'s bones, patient and unhurried.',
  },
  voltstone: {
    id: 'voltstone', name: 'Voltstone', kind: 'stone', price: 380,
    effect: { awakenAspect: 'volt' },
    desc: 'Crackles faintly in a storm and refuses to be forgotten.',
  },
  froststone: {
    id: 'froststone', name: 'Froststone', kind: 'stone', price: 380,
    effect: { awakenAspect: 'frost' },
    desc: 'Never melts, even held all night in a warm palm.',
  },
  venomstone: {
    id: 'venomstone', name: 'Venomstone', kind: 'stone', price: 380,
    effect: { awakenAspect: 'venom' },
    desc: 'Slick with a sheen that isn\'t quite oil, isn\'t quite dew.',
  },
  lumenstone: {
    id: 'lumenstone', name: 'Lumenstone', kind: 'stone', price: 420,
    effect: { awakenAspect: 'lumen' },
    desc: 'A true shard of the Lumen, pale gold, faintly warm against the dark.',
  },
  umbrastone: {
    id: 'umbrastone', name: 'Umbrastone', kind: 'stone', price: 420,
    effect: { awakenAspect: 'umbra' },
    desc: 'Cool and light-swallowing. Looking at it too long feels like being looked back at.',
  },

  // ---------------------------------------------------------------- Talismans
  might_band: {
    id: 'might_band', name: 'Might Band', kind: 'talisman', price: 220,
    effect: { stat: 'might', pct: 15 },
    desc: 'A leather wrist-band, iron-stitched. Sharpens every blow.',
  },
  ward_amulet: {
    id: 'ward_amulet', name: 'Ward Amulet', kind: 'talisman', price: 220,
    effect: { stat: 'ward', pct: 15 },
    desc: 'A carved river-stone pendant. Turns aside the worst of a hit.',
  },
  focus_lens: {
    id: 'focus_lens', name: 'Focus Lens', kind: 'talisman', price: 220,
    effect: { stat: 'focus', pct: 15 },
    desc: 'A cracked prism on a cord. Clarifies intent into force.',
  },
  aegis_veil: {
    id: 'aegis_veil', name: 'Aegis Veil', kind: 'talisman', price: 220,
    effect: { stat: 'aegis', pct: 15 },
    desc: 'Gauze-thin and near-invisible. Steadies the will against status and shock.',
  },
  haste_feather: {
    id: 'haste_feather', name: 'Haste Feather', kind: 'talisman', price: 220,
    effect: { stat: 'haste', pct: 15 },
    desc: 'A single pipwing feather that never settles. Quickens every step.',
  },
  vigor_root: {
    id: 'vigor_root', name: 'Vigor Root', kind: 'talisman', price: 220,
    effect: { stat: 'vigor', pct: 15 },
    desc: 'A knotted root, still faintly growing. Deepens a Kindred\'s reserves.',
  },
  survivor_knot: {
    id: 'survivor_knot', name: 'Survivor\'s Knot', kind: 'talisman', price: 520,
    effect: { surviveKO: true },
    desc: 'A frayed cord tied by a Warden who should not have lived. Once per battle, a killing blow leaves 1 vigor instead of none.',
  },
  ember_sigil: {
    id: 'ember_sigil', name: 'Ember Sigil', kind: 'talisman', price: 300,
    effect: { aspect: 'ember', pct: 20 },
    desc: 'A branded coal-iron token. Feeds Ember-aspect strikes.',
  },
  tide_sigil: {
    id: 'tide_sigil', name: 'Tide Sigil', kind: 'talisman', price: 300,
    effect: { aspect: 'tide', pct: 20 },
    desc: 'Etched shell, still faintly damp. Feeds Tide-aspect strikes.',
  },
  bloom_sigil: {
    id: 'bloom_sigil', name: 'Bloom Sigil', kind: 'talisman', price: 300,
    effect: { aspect: 'bloom', pct: 20 },
    desc: 'A pressed leaf that will not brown. Feeds Bloom-aspect strikes.',
  },
  gale_sigil: {
    id: 'gale_sigil', name: 'Gale Sigil', kind: 'talisman', price: 300,
    effect: { aspect: 'gale', pct: 20 },
    desc: 'A whittled charm that rattles in still air. Feeds Gale-aspect strikes.',
  },
  terra_sigil: {
    id: 'terra_sigil', name: 'Terra Sigil', kind: 'talisman', price: 300,
    effect: { aspect: 'terra', pct: 20 },
    desc: 'A flat river stone, sigil-scored. Feeds Terra-aspect strikes.',
  },
  volt_sigil: {
    id: 'volt_sigil', name: 'Volt Sigil', kind: 'talisman', price: 300,
    effect: { aspect: 'volt', pct: 20 },
    desc: 'Wound copper wire around a chip of glass fused by lightning. Feeds Volt-aspect strikes.',
  },

  // ---------------------------------------------------------------- Key items
  kindred_codex: {
    id: 'kindred_codex', name: 'Kindred Codex', kind: 'key', price: null,
    effect: null,
    desc: 'Elder Maren\'s gift: a living ledger that fills itself in as you meet the Kindred of Vael.',
  },
  shrine_shard: {
    id: 'shrine_shard', name: 'Shrine Shard', kind: 'key', price: null,
    effect: null,
    desc: 'A sliver of the Lumen kept at Brighthollow\'s shrine since before living memory.',
  },
  ferry_gear: {
    id: 'ferry_gear', name: 'Ferry Gear', kind: 'key', price: null,
    effect: null,
    desc: 'A tangle of block, tackle, and oiled rope — everything Juno\'s sunken ferry needs to sail again.',
  },
  lantern_oil: {
    id: 'lantern_oil', name: 'Lantern Oil', kind: 'key', price: 60,
    effect: null,
    desc: 'Slow-burning oil, safe even in Gloamcavern\'s damp dark.',
  },
  glade_key: {
    id: 'glade_key', name: 'Glade Key', kind: 'key', price: null,
    effect: null,
    desc: 'Not a key at all, but a knot of rekindled shardlight — Starfall Glade opens to a heart at peace.',
  },
};

export const SHOPS = {
  shop_brighthollow: {
    id: 'shop_brighthollow',
    name: 'Pip\'s Provisions',
    merchant: 'merchant_pip',
    greeting: 'Fresh stock, fair prices — for a fellow Warden!',
    stock: [
      'tonic', 'super_tonic', 'remedy', 'honey_drop',
      'woven_charm', 'glazed_charm',
      'vigor_root', 'haste_feather',
      'lantern_oil',
    ],
  },
  shop_driftmoor: {
    id: 'shop_driftmoor',
    name: 'Wren\'s Wares',
    merchant: 'merchant_wren',
    greeting: 'Driftmoor\'s finest — charms, stones, and stranger things.',
    stock: [
      'tonic', 'super_tonic', 'grand_tonic', 'remedy', 'vigil_bloom', 'honey_drop',
      'glazed_charm', 'gilded_charm', 'starwoven_charm',
      'emberstone', 'tidestone', 'bloomstone', 'galestone', 'terrastone',
      'voltstone', 'froststone', 'venomstone', 'lumenstone', 'umbrastone',
      'might_band', 'ward_amulet', 'focus_lens', 'aegis_veil', 'survivor_knot',
      'ember_sigil', 'tide_sigil', 'bloom_sigil', 'gale_sigil', 'terra_sigil', 'volt_sigil',
    ],
  },
};
