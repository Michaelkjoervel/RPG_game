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
import { setTimeScale } from '../core/tween.js';
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
      bus.emit('battle:event', ev); // canonical bus mirror (ARCHITECTURE.md) — audio.js listens
      // 3D choreography and DOM feedback run in PARALLEL so plates/log/pips
      // land in sync with the action instead of after it. Each leg carries its
      // own catch — one layer failing must never stall or skip the other.
      await Promise.all([
        presentation.handle(ev).catch((e) => console.error('[battleFlow] presentation handler threw', e)),
        ui.handleEvent(ev).catch((e) => console.error('[battleFlow] battleUI handler threw', e)),
      ]);
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
    setTimeScale(1); // hitstop must never leak out of a battle, however it ended
    ui?.unmount();
    presentation?.dispose();
  }
}
