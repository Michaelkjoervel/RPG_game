// Seeded RNG (mulberry32) + helpers. Use seeded streams for world-gen so zones are stable.
export function seededRandom(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const rand = Math.random;
export function pick(arr, rng = Math.random) { return arr[Math.floor(rng() * arr.length)]; }
export function randRange(a, b, rng = Math.random) { return a + rng() * (b - a); }
export function randInt(a, b, rng = Math.random) { return Math.floor(a + rng() * (b - a + 1)); }
export function chance(pct, rng = Math.random) { return rng() * 100 < pct; }
export function weightedPick(entries, rng = Math.random) {
  // entries: [{w, ...}]
  const total = entries.reduce((s, e) => s + (e.w ?? 1), 0);
  let r = rng() * total;
  for (const e of entries) { r -= (e.w ?? 1); if (r <= 0) return e; }
  return entries[entries.length - 1];
}
