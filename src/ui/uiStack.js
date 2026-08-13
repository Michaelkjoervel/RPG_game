// LUMENFALL — tiny UI layer stack (single owner of "is any overlay open?").
// Overlays (shop, save, settings modal, pickers, confirm modals, dialogue)
// register themselves while open so the global Esc handler in menus.js can act
// as "back exactly one layer" instead of toggling the pause hub underneath them.
const stack = [];

/** Register an open overlay. `onCancel` must close exactly that overlay (one
 * layer). Returns a pop() to call when the overlay closes itself. */
export function pushLayer(name, onCancel) {
  const entry = { name, onCancel };
  stack.push(entry);
  return () => {
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
  };
}

export function anyLayerOpen() { return stack.length > 0; }
export function topLayer() { return stack[stack.length - 1]?.name ?? null; }

/** Cancel (close) the topmost layer. Returns true if a layer consumed it. */
export function cancelTopLayer() {
  const top = stack[stack.length - 1];
  if (!top) return false;
  try { top.onCancel?.(); } catch (e) { console.error('[uiStack] onCancel threw', e); }
  return true;
}
