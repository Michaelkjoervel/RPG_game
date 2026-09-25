// PRESENTATION v2 — battle arenas, framing and VFX, run to completion.
// Seeded save → Continue → for each zone in LF_BATTLE_ZONES (default
// "dawnmeadow,whisperwood"): enter the zone, start a wild battle, shoot the
// intro / rest framing / move beats, print per-frame renderer.info, then
// auto-fight until the battle ends and confirm we are back in the overworld.
//   QA_BEAUTY=1 QA_VIEWPORT=1120x630 LF_BATTLE_ZONES=dawnmeadow \
//     node tools/shoot.mjs tools/drivers/v2-presentation-battle.mjs <outDir>
import { loadIn, goZone } from './integration-a.mjs';
import { renderInfo } from './v2-presentation-title.mjs';

const FOES = { dawnmeadow: ['pebbin', 9], whisperwood: ['myclet', 9], brighthollow: ['vellit', 8],
  gloamcavern: ['glowvern', 10], mirrorlake: ['finnet', 10], skyreach: ['nimbis', 10],
  sunkenruins: ['glyphant', 10], starfallglade: ['lanterling', 10], hollowspire: ['duskit', 10] };
const DAY = { dawnmeadow: 0.45, whisperwood: 0.42 };

const vis = (sel) => `!!document.querySelector('${sel}:not(.hidden)')`;

async function fightToEnd(page, h, tag, maxSteps = 140) {
  let shotVictory = false;
  for (let i = 0; i < maxSteps; i++) {
    const st = await page.evaluate(`({
      mode: window.LF.game.mode,
      dock: ${vis('.bui-dock')},
      moves: ${vis('.bui-panel-moves')},
      sw: ${vis('.bui-panel-switch')},
      end: ${vis('.bui-victory')} || ${vis('.bui-defeat')},
    })`);
    if (st.mode !== 'battle') return st.mode;
    if (st.end) {
      if (!shotVictory) { shotVictory = true; await h.sleep(900); await h.shot(`${tag}-end-panel`); }
      await h.press('Enter'); await h.sleep(900); continue;
    }
    if (st.moves || st.sw) { await h.press('Enter'); await h.sleep(700); continue; }
    if (st.dock) { await h.press('Enter'); await h.sleep(600); continue; }
    await h.sleep(650);
  }
  return page.evaluate(`window.LF.game.mode`);
}

export async function run(page, h) {
  if (!await loadIn(page, h)) return;
  const zones = (process.env.LF_BATTLE_ZONES ?? 'dawnmeadow,whisperwood').split(',').map((s) => s.trim()).filter(Boolean);
  for (const zone of zones) {
    await goZone(page, h, zone, `${zone}-overworld`, DAY[zone] ?? 0.45);
    await page.evaluate(`for (const m of window.LF.G.party) { m.hp = m.maxHp; m.status = null; }`);
    const [foe, lv] = FOES[zone] ?? ['pebbin', 9];
    await page.evaluate(`window.__lfFoeOff?.(); window.__lfFoeOff = window.LF.bus.on('battle:event', (ev) => { if (ev.type === 'send' && ev.side === 'e') window.__lfFoe = ev.mon; })`);
    page.evaluate(`window.LF.game.overworld.startWildBattle('${foe}', ${lv})`).catch(() => {});
    const inBattle = await h.waitFor(`window.LF.game.mode === 'battle' && !!window.LF.game.activeScene?.handle`, 60000, 150);
    if (!inBattle) { await h.shot(`${zone}-no-battle`); continue; }
    await h.sleep(700);
    await h.shot(`${zone}-intro`);
    const ready = await h.waitFor(vis('.bui-dock'), 60000);
    await h.sleep(1600);
    await h.shot(`${zone}-rest`);
    console.log(`BATTLE RENDER ${zone}`, await renderInfo(page));
    if (!ready) { await h.shot(`${zone}-not-ready`); continue; }
    await h.press('Enter'); await h.sleep(1000);            // Fight → move grid
    await h.shot(`${zone}-moves`);
    await h.press('Enter');                                  // first move
    for (let i = 0; i < 5; i++) { await h.sleep(380); await h.shot(`${zone}-beat`); }
    if (process.env.LF_FIGHT === '0') {
      // beauty rounds: the foe's reply, then a one-hit finish (faint + victory beats)
      for (let i = 0; i < 3; i++) { await h.sleep(900); await h.shot(`${zone}-reply`); }
      await page.evaluate(`window.__lfFoe && (window.__lfFoe.hp = 1)`);
    }
    const end = await fightToEnd(page, h, zone, Number(process.env.LF_STEPS ?? 400));
    await h.sleep(1500);
    await h.shot(`${zone}-after`);
    console.log(`BATTLE ${zone} ENDED → mode=${end}`, await page.evaluate(`JSON.stringify(window.LF.G.party.map(m => m.speciesId + ':' + m.hp + '/' + m.maxHp))`));
  }
}
