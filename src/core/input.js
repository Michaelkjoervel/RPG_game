// Unified input: keyboard + gamepad + pointer. Action-based, rebind-friendly.
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyE: 'interact', Enter: 'confirm', Space: 'confirm',
  Escape: 'menu', Tab: 'menu', KeyC: 'codex', KeyQ: 'cancel', Backspace: 'cancel',
  ShiftLeft: 'run', ShiftRight: 'run',
};

class Input {
  constructor() {
    this.keys = new Set();          // raw codes
    this.actions = new Set();       // active actions
    this._justPressed = new Set();
    this._listeners = new Map();    // action -> Set<fn>
    this.axes = { x: 0, y: 0 };
    this.pointerLocked = false;
    this.lastDevice = 'kb';
    this._attached = false;
  }

  attach() {
    if (this._attached) return;
    this._attached = true;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const action = KEYMAP[e.code];
      this.keys.add(e.code);
      this.lastDevice = 'kb';
      if (action) {
        if (['confirm', 'cancel', 'menu', 'interact'].includes(action)) e.preventDefault();
        this.actions.add(action);
        this._justPressed.add(action);
        this._fire(action);
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const action = KEYMAP[e.code];
      if (action) this.actions.delete(action);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.actions.clear(); });
  }

  _fire(action) {
    // Snapshot before iterating: handlers registered DURING dispatch (e.g. a menu
    // re-binding its parent layer's keys) must not receive this same keypress.
    const hs = this._listeners.get(action);
    if (!hs) return;
    for (const fn of [...hs]) {
      if (!hs.has(fn)) continue; // removed mid-dispatch
      try { fn(); } catch (e) { console.error(e); }
    }
  }
  onAction(action, fn) {
    if (!this._listeners.has(action)) this._listeners.set(action, new Set());
    this._listeners.get(action).add(fn);
    return () => this._listeners.get(action)?.delete(fn);
  }
  pressed(action) { return this.actions.has(action); }
  justPressed(action) { return this._justPressed.has(action); }

  // Embedded frames can forbid the gamepad feature by permissions policy, in
  // which case getGamepads() THROWS rather than returning an empty list. One
  // refusal is permanent, so stop asking — and never let it break the frame.
  _pollGamepad() {
    if (this._gamepadBlocked) return null;
    try {
      return navigator.getGamepads?.()[0] ?? null;
    } catch (e) {
      this._gamepadBlocked = true;
      console.warn('[input] gamepads unavailable here — keyboard and mouse only');
      return null;
    }
  }

  update() {
    // Gamepad poll
    const gp = this._pollGamepad();
    let gx = 0, gy = 0;
    if (gp) {
      gx = Math.abs(gp.axes[0]) > 0.15 ? gp.axes[0] : 0;
      gy = Math.abs(gp.axes[1]) > 0.15 ? gp.axes[1] : 0;
      // D-pad (12-15) rides the same edge-trigger path as the face buttons so
      // menus receive up/down/left/right action events from a pad.
      const map = {
        0: 'confirm', 1: 'cancel', 2: 'interact', 9: 'menu',
        12: 'up', 13: 'down', 14: 'left', 15: 'right',
      };
      for (const [btn, action] of Object.entries(map)) {
        const pressed = gp.buttons[btn]?.pressed;
        const was = this[`_gpb${btn}`];
        if (pressed && !was) { this.actions.add(action); this._justPressed.add(action); this._fire(action); this.lastDevice = 'gp'; }
        if (!pressed && was) this.actions.delete(action);
        this[`_gpb${btn}`] = pressed;
      }
      if (gp.buttons[10]?.pressed || gp.buttons[5]?.pressed) this.actions.add('run');
      else if (this.lastDevice === 'gp') this.actions.delete('run');
      // Left-stick pulse-to-nav: menu navigation from the stick without
      // flooding — see _stickPulse for the fire/re-arm/repeat rules.
      this._stickPulse('x', gx, 'left', 'right');
      this._stickPulse('y', gy, 'up', 'down');
    }
    // Movement axes (keyboard priority, else stick)
    const kx = (this.actions.has('right') ? 1 : 0) - (this.actions.has('left') ? 1 : 0);
    const ky = (this.actions.has('down') ? 1 : 0) - (this.actions.has('up') ? 1 : 0);
    this.axes.x = kx !== 0 ? kx : gx;
    this.axes.y = ky !== 0 ? ky : gy;
    if (gx || gy) this.lastDevice = 'gp';
  }
  // Stick-to-menu-nav pulses: crossing |axis| > 0.6 emits the direction action
  // once; it re-arms when the axis falls back under 0.3; while held hard it
  // repeats every ~220ms. Movement itself still reads the analog axes directly.
  _stickPulse(axis, v, negAction, posAction) {
    const st = ((this._pulses ??= {})[axis] ??= { dir: 0, next: 0 });
    if (Math.abs(v) < 0.3) { st.dir = 0; return; } // re-arm
    if (Math.abs(v) <= 0.6) return;                // hysteresis band: hold state
    const dir = v > 0 ? 1 : -1;
    const now = performance.now();
    if (dir !== st.dir || now >= st.next) {
      st.dir = dir;
      st.next = now + 220;
      const action = dir > 0 ? posAction : negAction;
      this._justPressed.add(action);
      this.lastDevice = 'gp';
      this._fire(action);
    }
  }

  endFrame() { this._justPressed.clear(); }
}

export const input = new Input();
