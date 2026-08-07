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
    this._listeners.get(action)?.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  }
  onAction(action, fn) {
    if (!this._listeners.has(action)) this._listeners.set(action, new Set());
    this._listeners.get(action).add(fn);
    return () => this._listeners.get(action)?.delete(fn);
  }
  pressed(action) { return this.actions.has(action); }
  justPressed(action) { return this._justPressed.has(action); }

  update() {
    // Gamepad poll
    const gp = navigator.getGamepads?.()[0];
    let gx = 0, gy = 0;
    if (gp) {
      gx = Math.abs(gp.axes[0]) > 0.15 ? gp.axes[0] : 0;
      gy = Math.abs(gp.axes[1]) > 0.15 ? gp.axes[1] : 0;
      const map = { 0: 'confirm', 1: 'cancel', 2: 'interact', 9: 'menu' };
      for (const [btn, action] of Object.entries(map)) {
        const pressed = gp.buttons[btn]?.pressed;
        const was = this[`_gpb${btn}`];
        if (pressed && !was) { this.actions.add(action); this._justPressed.add(action); this._fire(action); this.lastDevice = 'gp'; }
        if (!pressed && was) this.actions.delete(action);
        this[`_gpb${btn}`] = pressed;
      }
      if (gp.buttons[10]?.pressed || gp.buttons[5]?.pressed) this.actions.add('run');
      else if (this.lastDevice === 'gp') this.actions.delete('run');
    }
    // Movement axes (keyboard priority, else stick)
    const kx = (this.actions.has('right') ? 1 : 0) - (this.actions.has('left') ? 1 : 0);
    const ky = (this.actions.has('down') ? 1 : 0) - (this.actions.has('up') ? 1 : 0);
    this.axes.x = kx !== 0 ? kx : gx;
    this.axes.y = ky !== 0 ? ky : gy;
    if (gx || gy) this.lastDevice = 'gp';
  }
  endFrame() { this._justPressed.clear(); }
}

export const input = new Input();
