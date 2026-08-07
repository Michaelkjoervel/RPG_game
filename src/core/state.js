// G — the whole mutable game state. Serialized by save.js. See ARCHITECTURE.md save schema.
import { bus } from './events.js';

export const G = {
  version: 1,
  playerName: 'Rowan',
  starter: null,                    // 'kindlet' | 'nixling' | 'thistlit'
  pos: { zone: 'brighthollow', x: 0, z: 6, face: 0 },
  party: [],                        // creature instances (≤5)
  reserve: [],                      // stored creatures ("the Haven")
  bag: {},                          // itemId -> qty
  glim: 250,
  sigils: [false, false, false, false, false],
  flags: {},                        // story/world flags
  codex: {},                        // speciesId -> 'seen' | 'caught'
  quests: {},                       // id -> {step, done}
  playtimeSec: 0,
  calendar: { dayTime: 0.35 },      // 0..1, 0=midnight .5=noon
  resonanceWalks: 0,
  savedAt: null,
};

export function resetState() {
  Object.assign(G, {
    version: 1, playerName: 'Rowan', starter: null,
    pos: { zone: 'brighthollow', x: 0, z: 6, face: 0 },
    party: [], reserve: [], bag: { tonic: 3, woven_charm: 5 }, glim: 250,
    sigils: [false, false, false, false, false],
    flags: {}, codex: {}, quests: {}, playtimeSec: 0,
    calendar: { dayTime: 0.35 }, resonanceWalks: 0, savedAt: null,
  });
}

export function setFlag(key, val = true) {
  if (G.flags[key] === val) return;
  G.flags[key] = val;
  bus.emit('flag:set', { key, val });
}
export const hasFlag = (key) => !!G.flags[key];

export function gainItem(id, qty = 1) {
  G.bag[id] = (G.bag[id] ?? 0) + qty;
  if (G.bag[id] <= 0) delete G.bag[id];
  bus.emit('item:gained', { id, qty });
}
export function spendItem(id, qty = 1) {
  if ((G.bag[id] ?? 0) < qty) return false;
  G.bag[id] -= qty;
  if (G.bag[id] <= 0) delete G.bag[id];
  bus.emit('item:gained', { id, qty: -qty });
  return true;
}
export function gainGlim(amount) {
  G.glim = Math.max(0, G.glim + amount);
  bus.emit('glim:changed', { amount });
}
export function markCodex(speciesId, status) {
  const cur = G.codex[speciesId];
  if (cur === 'caught' || cur === status) return;
  G.codex[speciesId] = status;
  bus.emit('codex:updated', { speciesId, status });
}
export function sigilCount() { return G.sigils.filter(Boolean).length; }
