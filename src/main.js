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

boot().catch((e) => {
  console.error('[boot] fatal', e);
  const el = document.getElementById('boot-screen');
  if (el) {
    el.classList.remove('hidden');
    el.querySelector('.boot-sub').textContent = 'something went wrong while waking the world — see console';
  }
});

// Surface unhandled errors during development.
window.addEventListener('unhandledrejection', (e) => console.error('[unhandled]', e.reason));

// Debug/test handle (harness + QA drivers). Not referenced by gameplay code.
import('./core/state.js').then(({ G }) => { window.LF = { game, bus, G }; });
export { game, bus };
