// The ten Aspects of Vael + Neutral. Single source of truth for the type chart.
// Multipliers: strong ×1.4, weak ×0.75. Attunement (same-aspect) bonus ×1.25.
export const ASPECTS = {
  ember:  { id: 'ember',  name: 'Ember',  color: 0xff7a3c, icon: '🔥', strong: ['bloom', 'frost'] },
  tide:   { id: 'tide',   name: 'Tide',   color: 0x4fa8ff, icon: '💧', strong: ['ember', 'terra'] },
  bloom:  { id: 'bloom',  name: 'Bloom',  color: 0x6fce5c, icon: '🌿', strong: ['tide', 'terra'] },
  gale:   { id: 'gale',   name: 'Gale',   color: 0xa8e4d8, icon: '🌪', strong: ['bloom', 'venom'] },
  terra:  { id: 'terra',  name: 'Terra',  color: 0xc9995c, icon: '⛰', strong: ['volt', 'ember'] },
  volt:   { id: 'volt',   name: 'Volt',   color: 0xffd94f, icon: '⚡', strong: ['tide', 'gale'] },
  frost:  { id: 'frost',  name: 'Frost',  color: 0xa8d8ff, icon: '❄', strong: ['gale', 'bloom'] },
  venom:  { id: 'venom',  name: 'Venom',  color: 0xb06fd8, icon: '☠', strong: ['bloom', 'tide'] },
  lumen:  { id: 'lumen',  name: 'Lumen',  color: 0xffe9b0, icon: '✦', strong: ['umbra'] },
  umbra:  { id: 'umbra',  name: 'Umbra',  color: 0x7a6f9e, icon: '🌑', strong: ['lumen'] },
  neutral:{ id: 'neutral',name: 'Neutral',color: 0xc8c2b8, icon: '◇', strong: [] },
};

export const STRONG_MULT = 1.4;
export const WEAK_MULT = 0.75;
export const ATTUNE_BONUS = 1.25;

// Effectiveness of one attacking aspect vs one defending aspect.
function single(atk, def) {
  if (atk === 'neutral' || def === 'neutral') return 1;
  if (ASPECTS[atk]?.strong.includes(def)) return STRONG_MULT;
  if (ASPECTS[def]?.strong.includes(atk)) return WEAK_MULT; // reverse of strong = resisted
  return 1;
}

// vs a defender with 1–2 aspects; multiplies.
export function effectiveness(attackAspect, defenderAspects) {
  let m = 1;
  for (const d of defenderAspects) m *= single(attackAspect, d);
  return m;
}

export function effectivenessLabel(mult) {
  if (mult === 0) return 'immune';
  if (mult >= STRONG_MULT) return 'super';
  if (mult <= WEAK_MULT) return 'weak';
  return 'normal';
}

export const aspectColor = (id) => ASPECTS[id]?.color ?? ASPECTS.neutral.color;
export const aspectCssVar = (id) => `var(--${id in ASPECTS ? id : 'neutral'})`;
