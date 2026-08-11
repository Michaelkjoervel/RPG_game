// TEMP STUB — for story.js integration smoke-testing only. Will be overwritten by the
// combat-engine agent's real implementation. Deleted at the end of this test run.
export function makeCreature(speciesId, level, opts = {}) {
  return {
    uid: Math.random().toString(36).slice(2), speciesId, nickname: null, level, xp: 0,
    resonance: opts.resonance ?? 0, resonanceXp: 0, hp: 100, maxHp: 100,
    stats: { might: 10, ward: 10, focus: 10, aegis: 10, haste: 10 },
    moves: ['pounce'], talisman: opts.talisman ?? null, status: null,
    statStages: {}, burstCharge: 0, shiny: false, hollowed: !!opts.hollowed, metAt: 'test',
  };
}
export function healParty(G) { for (const m of G.party) if (m) m.hp = m.maxHp; }
