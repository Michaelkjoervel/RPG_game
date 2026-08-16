// Lumenfall entry point.
import { game } from './game/game.js';
import { bus } from './core/events.js';

async function boot() {
  game.start();
  // Audio engine subscribes to bus events; must init before any UI.
  const { initAudio } = await import('./audio/audio.js');
  initAudio();
  const { initHud } = await import('./ui/hud.js');
  initHud();
  const { showTitle } = await import('./ui/titleUI.js');

  document.getElementById('boot-screen')?.classList.add('hidden');
  await showTitle(game);
}

boot().catch(showBootFailure);

// The console is often out of reach (embedded pages, other people's machines),
// so failures have to explain themselves on the screen the player is looking at.
function showBootFailure(e) {
  console.error('[boot] fatal', e);
  const el = document.getElementById('boot-screen');
  if (!el) return;
  el.classList.remove('hidden');
  const sub = el.querySelector('.boot-sub');
  if (!sub) return;
  const webglMissing = !(() => {
    try {
      const c = document.createElement('canvas');
      return c.getContext('webgl2') || c.getContext('webgl');
    } catch (err) { return null; }
  })();
  const detail = String(e?.message ?? e ?? 'unknown error');
  sub.textContent = webglMissing
    ? 'this browser can’t open a WebGL context — Lumenfall needs hardware 3D'
    : `the world failed to wake: ${detail}`;
  sub.style.maxWidth = '46ch';
  sub.style.lineHeight = '1.5';
  sub.style.textAlign = 'center';
}

// Surface unhandled errors during development.
window.addEventListener('unhandledrejection', (e) => console.error('[unhandled]', e.reason));

// Debug/test handle (harness + QA drivers). Not referenced by gameplay code.
Promise.all([import('./core/state.js'), import('./core/input.js'), import('./core/tween.js')])
  .then(([{ G }, { input }, tweenMod]) => { window.LF = { game, bus, G, input, tween: tweenMod }; });
export { game, bus };
