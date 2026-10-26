// Save/load — 3 manual slots + autosave slot 0. JSON of G, kept by
// core/storage.js (the player's private cloud save on claude.ai, localStorage
// elsewhere).
import { G, resetState } from './state.js';
import { bus } from './events.js';
import { storage } from './storage.js';

const key = (slot) => `lumenfall_save_${slot}`;

export function saveGame(slot = 0) {
  try {
    G.savedAt = Date.now();
    storage.setItem(key(slot), JSON.stringify(G));
    bus.emit('game:saved', { slot });
    return true;
  } catch (e) { console.error('save failed', e); return false; }
}

export function loadGame(slot = 0) {
  try {
    const raw = storage.getItem(key(slot));
    if (!raw) return false;
    const data = JSON.parse(raw);
    resetState();
    // Deep-assign known top-level keys; tolerate older saves missing new fields.
    for (const k of Object.keys(data)) G[k] = data[k];
    bus.emit('game:loaded', { slot });
    return true;
  } catch (e) { console.error('load failed', e); return false; }
}

export function listSaves() {
  const out = [];
  for (let slot = 0; slot <= 3; slot++) {
    try {
      const raw = storage.getItem(key(slot));
      if (!raw) { out.push(null); continue; }
      const d = JSON.parse(raw);
      out.push({
        slot, playerName: d.playerName, savedAt: d.savedAt, playtimeSec: d.playtimeSec ?? 0,
        zone: d.pos?.zone, partySize: d.party?.length ?? 0,
        partyLead: d.party?.[0]?.speciesId ?? null, leadLevel: d.party?.[0]?.level ?? 0,
        sigils: (d.sigils ?? []).filter(Boolean).length,
      });
    } catch (e) { out.push(null); }
  }
  return out;
}

export function deleteSave(slot) {
  try { storage.removeItem(key(slot)); } catch (e) { /* ignore */ }
}
export function hasAnySave() { return listSaves().some(Boolean); }
