// Persistent storage for saves and settings.
//
// Inside the claude.ai artifact viewer the page keeps progress in the
// artifact's `db` capability, in the player's own private subtree
// (`data/users/<id>/`, invisible to everyone else — the artifact's owner
// included), so it survives reloads, republishes and other devices. Anywhere
// else (dev server, the standalone file) it uses localStorage as before.
//
// The game's save code is synchronous, the db is not: every value lives in an
// in-memory cache that `init()` fills before the game boots; reads hit the
// cache, writes update it at once and reach the db in the background — one
// write in flight per key, later writes coalesced into the newest value.
//
//   await storage.init()           boot waits for this (bounded)
//   storage.getItem(key)           string | null
//   storage.setItem(key, value)    value: string
//   storage.removeItem(key)
//   storage.mode                   'cloud' | 'local' | 'memory'
//   storage.hasPendingWrites()
//   storage.announce()             call once the HUD is up: shows a queued notice
//
// Emits `storage:status` {mode, state: 'saving'|'saved'|'error'} and one
// `notify` toast if this view cannot keep progress at all.
import { bus } from './events.js';

const KEYS = ['lumenfall_save_0', 'lumenfall_save_1', 'lumenfall_save_2', 'lumenfall_save_3', 'lumenfall_settings'];
const SAVE_PREFIX = 'lumenfall_save_';
const CONNECT_TIMEOUT_MS = 12000; // use() itself gives up after 10 s when no viewer answers

const cache = new Map();
const pending = new Map();   // key -> newest value not yet written (null = delete)
const inflight = new Set();  // keys with a db write running
let local = probeLocal();
let col = null;              // db collection data/users/<id>
let cloudBroken = false;
let warned = false;
let initPromise = null;

// localStorage is usable synchronously from the first import, so settings and
// saves read at module load keep working exactly as before outside claude.ai.
if (local) for (const k of KEYS) {
  try { const v = local.getItem(k); if (v != null) cache.set(k, v); } catch (e) { /* ignore */ }
}

export const storage = {
  mode: local ? 'local' : 'memory',
  init,
  announce,
  getItem: (key) => (cache.has(key) ? cache.get(key) : null),
  setItem(key, value) { write(key, String(value)); },
  removeItem(key) { write(key, null); },
  hasPendingWrites: () => pending.size > 0 || inflight.size > 0,
};

function probeLocal() {
  try {
    const ls = window.localStorage;
    ls.setItem('__lf_probe', '1');
    ls.removeItem('__lf_probe');
    return ls;
  } catch (e) { return null; }
}

function init() {
  if (!initPromise) initPromise = connectCloud().catch((e) => {
    console.warn('[storage] cloud saves unavailable — using', storage.mode, e?.code ?? e?.message ?? e);
  }).then(() => {
    if (storage.mode === 'memory') warnOnce("This view can't keep your progress — it will be lost when you close the page.");
    bus.emit('storage:status', { mode: storage.mode, state: 'saved' });
    return storage.mode;
  });
  return initPromise;
}

async function connectCloud() {
  const use = typeof window !== 'undefined' ? window.claude?.use : null;
  if (typeof use !== 'function') return; // not inside the artifact viewer
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), CONNECT_TIMEOUT_MS); });
  try {
    const ns = await Promise.race([
      Promise.all([window.claude.use('db'), window.claude.use('user')]),
      timeout,
    ]);
    const [db, user] = ns ?? [];
    if (!db || !user) return;                       // signed out / not granted
    const id = await Promise.race([user.id(), timeout]);
    if (!id) return;                                // no private subtree for this viewer
    const c = db.collection('data/users/' + id);
    const snap = await Promise.race([c.get(), timeout]);
    if (!snap) return;

    const cloud = new Map();
    for (const d of snap.docs) {
      const v = d.exists ? d.data()?.value : undefined;
      if (typeof v === 'string') cloud.set(d.id, v);
    }
    col = c;
    storage.mode = 'cloud';
    // Cloud is the record. A copy this browser holds locally only wins when it
    // is a newer save (an upload interrupted by closing the tab) or the cloud
    // has nothing yet (progress from before cloud saves existed): upload it.
    const localCopy = new Map(cache);
    cache.clear();
    for (const [k, v] of cloud) cache.set(k, v);
    for (const [k, v] of localCopy) {
      const c2 = cloud.get(k);
      if (c2 == null || (k.startsWith(SAVE_PREFIX) && savedAt(v) > savedAt(c2))) {
        cache.set(k, v);
        write(k, v);
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

function savedAt(json) {
  try { return JSON.parse(json)?.savedAt ?? 0; } catch (e) { return 0; }
}

function write(key, value) {
  if (value == null) cache.delete(key); else cache.set(key, value);
  if (local) {
    // Local copy too: the only store outside claude.ai, and a recovery copy
    // inside it if a cloud write never lands.
    try { if (value == null) local.removeItem(key); else local.setItem(key, value); } catch (e) { /* quota / blocked */ }
  }
  if (storage.mode !== 'cloud' || cloudBroken) return;
  pending.set(key, value);
  pump(key);
}

// Refusals that retrying cannot fix; any other code (and none) counts as
// `unavailable` — a transient condition — per the db contract.
const FATAL = new Set(['invalid_argument', 'quota_exceeded', 'revoked', 'not_granted',
  'capability_disabled', 'capability_removed', 'transform_error']);

async function pump(key) {
  if (inflight.has(key)) return; // the running loop picks up the newest value
  inflight.add(key);
  bus.emit('storage:status', { mode: storage.mode, state: 'saving' });
  let backoff = 600;
  try {
    while (pending.has(key) && !cloudBroken) {
      const value = pending.get(key);
      pending.delete(key);
      try {
        await put(key, value);
        backoff = 600;
      } catch (e) {
        if (FATAL.has(e?.code)) { fail(e); break; }
        // Transient: keep the value (unless a newer one is already waiting)
        // and try again with growing pauses — never give up on a blip.
        console.warn('[storage] cloud write retry', key, e?.code ?? e?.message ?? e);
        if (!pending.has(key)) pending.set(key, value);
        await new Promise((r) => setTimeout(r, backoff + Math.random() * backoff));
        backoff = Math.min(backoff * 2, 30000);
      }
    }
  } finally {
    inflight.delete(key);
    if (!cloudBroken && !storage.hasPendingWrites()) bus.emit('storage:status', { mode: storage.mode, state: 'saved' });
  }
}

function put(key, value) {
  const ref = col.doc(key);
  return value == null ? ref.delete() : ref.set({ value, updatedAt: Date.now() });
}

function fail(e) {
  console.warn('[storage] cloud save failed', e?.code, e?.message);
  cloudBroken = true;
  pending.clear();
  bus.emit('storage:status', { mode: storage.mode, state: 'error', code: e?.code });
  storage.mode = local ? 'local' : 'memory'; // say honestly where progress goes now
  warnOnce(local
    ? "Couldn't save to your Claude account — progress is kept in this browser only."
    : e?.code === 'quota_exceeded'
      ? 'Your save storage is full — progress from now on will not be kept.'
      : "This view can't save to your account — progress will be lost when you close the page.");
}

// Notices wait until the HUD can show them (init runs before it exists).
let announced = false, queuedNotice = null;
function warnOnce(text) {
  if (warned) return;
  warned = true;
  if (announced) bus.emit('notify', { text, icon: '!', duration: 9000 });
  else queuedNotice = text;
}
function announce() {
  announced = true;
  if (queuedNotice) { bus.emit('notify', { text: queuedNotice, icon: '!', duration: 9000 }); queuedNotice = null; }
}

// Last chance: a write still in flight when the tab closes may never land.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (!storage.hasPendingWrites()) return;
    e.preventDefault();
    e.returnValue = '';
  });
}
