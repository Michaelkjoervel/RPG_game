// LUMENFALL — quest runtime. Drives G.quests ({id: {step, done}}) against the declarative
// step/isDone tables in src/data/quests.js. See docs/ARCHITECTURE.md §NPCs/dialogue/quests.
//
// startQuest(id)     — registers a quest as active (idempotent) and immediately re-checks it
//                       (a quest whose first step is already satisfied completes on the spot).
// completeQuest(id)  — force-completes a quest regardless of its steps' isDone state. Used for
//                       quests resolved by a single dialogue choice/turn-in rather than a
//                       tracked condition (see game/story.js's NPC turn-in flow).
// updateQuests(G)    — re-evaluates every active, non-done quest's CURRENT step; advances the
//                       step (or completes the quest) whenever isDone(G) is now true. Safe to
//                       call as often as you like — it's a pure re-check, not a step-by-step tick.
// getTrackedStep()   — {questId, name, stepText}|null for menus/HUD consumers that want it
//                       (hud.js reads G.quests/QUESTS directly and doesn't need this, but
//                       menus.js's Quests pane or other future UI can use this convenience).
import { bus } from '../core/events.js';
import { G } from '../core/state.js';
import { QUESTS } from '../data/quests.js';

function finishQuest(id) {
  const q = QUESTS[id];
  const state = G.quests[id];
  if (!q || !state || state.done) return;
  state.done = true;
  state.step = q.steps.length;
  try { q.onComplete?.(G); } catch (e) { console.error(`[quests] onComplete threw for ${id}`, e); }
  bus.emit('quest:completed', { id });
}

export function startQuest(id) {
  const q = QUESTS[id];
  if (!q) { console.warn(`[quests] unknown quest id: ${id}`); return; }
  if (!G.quests[id]) {
    G.quests[id] = { step: 0, done: false };
    bus.emit('quest:started', { id });
  }
  checkOne(id);
}

export function completeQuest(id) {
  if (!QUESTS[id]) { console.warn(`[quests] unknown quest id: ${id}`); return; }
  if (!G.quests[id]) G.quests[id] = { step: 0, done: false };
  finishQuest(id);
}

function checkOne(id) {
  const q = QUESTS[id];
  const state = G.quests[id];
  if (!q || !state || state.done) return;
  let advanced = false;
  // A quest can satisfy several steps in one re-check (e.g. loading a save mid-progress).
  while (state.step < q.steps.length && q.steps[state.step]?.isDone?.(G)) {
    state.step += 1;
    advanced = true;
  }
  if (state.step >= q.steps.length) { finishQuest(id); return; }
  if (advanced) bus.emit('quest:updated', { id });
}

export function updateQuests(G_ignored) {
  for (const id of Object.keys(G.quests)) checkOne(id);
}

export function getTrackedStep() {
  // Tracking preference: the EARLIEST still-active main quest wins; otherwise
  // the newest active side quest (so side chatter never hijacks the main line).
  let main = null, side = null;
  for (const [id, state] of Object.entries(G.quests)) {
    if (state.done) continue;
    const q = QUESTS[id];
    if (!q) continue;
    if (q.main) { if (!main) main = [id, state, q]; }
    else side = [id, state, q];
  }
  const picked = main ?? side;
  if (!picked) return null;
  const [id, state, q] = picked;
  return {
    questId: id, name: q.name, main: !!q.main,
    stepText: q.steps[Math.min(state.step, q.steps.length - 1)]?.text ?? '',
  };
}

// Reactive re-evaluation: story.js flags, codex updates, battle outcomes and zone changes are
// the moments quest-relevant world state most often shifts.
for (const evName of ['flag:set', 'codex:updated', 'battle:end', 'zone:enter', 'item:gained']) {
  bus.on(evName, () => updateQuests(G));
}
