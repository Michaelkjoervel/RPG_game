// Central pub/sub event bus. See docs/ARCHITECTURE.md for canonical event names.
export class EventBus {
  constructor() { this._handlers = new Map(); }
  on(name, fn) {
    if (!this._handlers.has(name)) this._handlers.set(name, new Set());
    this._handlers.get(name).add(fn);
    return () => this.off(name, fn);
  }
  once(name, fn) {
    const off = this.on(name, (p) => { off(); fn(p); });
    return off;
  }
  off(name, fn) { this._handlers.get(name)?.delete(fn); }
  emit(name, payload) {
    const hs = this._handlers.get(name);
    if (!hs) return;
    for (const fn of [...hs]) {
      try { fn(payload); }
      catch (e) { console.error(`[bus] handler for "${name}" threw`, e); }
    }
  }
}
export const bus = new EventBus();
