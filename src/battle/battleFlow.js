// battleFlow.js — composes engine + presentation + UI into one battle.
// The only entry point overworld/story code needs: game.startBattle(config)
// (src/game/game.js, already wired) dynamically imports runBattle from here.
//
// `config` is the same object BattleEngine consumes (docs/ARCHITECTURE.md):
//   { playerTeam, enemyTeam, kind:'wild'|'warden'|'boss', canFlee, canCatch,
//     enemyName?, ai:'basic'|'tactical'|'boss', arena, weatherAura? }
// It is handed to createBattleUI(ctx) verbatim too — battleUI.js reads
// `ctx.config ?? ctx`, so passing the raw config satisfies that contract.
import { bus } from '../core/events.js';
import { createPresentation } from './presentation.js';

export async function runBattle(game, config = {}) {
  bus.emit('transition:battle');

  let presentation = null, ui = null;
  try {
    presentation = await createPresentation(game, config);
    const [{ createBattleUI }, { BattleEngine }] = await Promise.all([
      import('../ui/battleUI.js'),
      import('./engine.js'),
    ]);

    ui = createBattleUI(config);
    presentation.setUI(ui);

    const engine = new BattleEngine(config);
    engine.onEvent = async (ev) => {
      try { await presentation.handle(ev); } catch (e) { console.error('[battleFlow] presentation handler threw', e); }
      try { await ui.handleEvent(ev); } catch (e) { console.error('[battleFlow] battleUI handler threw', e); }
    };

    ui.mount();
    game.setScene(presentation);       // battle now drives the render loop
    bus.emit('transition:clear');      // swirl overlay lifts as the intro begins

    const result = await engine.run((view) => ui.getAction(view));
    if (result?.outcome === 'win' || result?.outcome === 'caught') await ui.showVictory(result);
    else if (result?.outcome === 'loss') await ui.showDefeat();
    // 'flee': battle just ends quietly, no dedicated end panel in the UI contract.
    return result;
  } catch (e) {
    // A sibling module mid-build, a bad config, a WebGL hiccup — whatever it
    // is, a battle must never hang the caller (story/world await this).
    console.error('[battleFlow] battle failed to run', e);
    bus.emit('transition:clear');
    return { outcome: 'flee', xp: 0, glim: 0 };
  } finally {
    ui?.unmount();
    presentation?.dispose();
  }
}
