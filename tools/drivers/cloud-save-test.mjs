// Cloud-save regression test: runs the game inside a FAKE claude.ai artifact
// viewer — `window.claude.use('db'|'user')` backed by a Node-side store that
// survives page reloads, and localStorage blocked like the sandboxed frame —
// then proves progress persists: manual save → reload → Continue; autosave
// after progress → reload → Continue from the autosave; settings persist.
//   CLOUD_SCENARIO=persist (default) | flaky (first two writes fail
//                  transiently, must still persist) | fail (writes rejected:
//                  view-only viewer) | nodb (db unavailable: signed out)
//   node tools/shoot.mjs tools/drivers/cloud-save-test.mjs <outDir>
const SCENARIO = process.env.CLOUD_SCENARIO ?? 'persist';
const UID = 'u_test_player';
const store = new Map(); // full doc path -> body
// The cloud already holds fast-mode settings so software GL stays light.
store.set(`data/users/${UID}/lumenfall_settings`, {
  value: JSON.stringify({ musicVol: 0, sfxVol: 0, quality: 'low', textSpeed: 'fast', camShake: true, invertY: false, showDamageNumbers: true }),
  updatedAt: 1,
});
let writes = 0, flakyLeft = SCENARIO === 'flaky' ? 2 : 0;

const BOOTED = `!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`;
const M = (m) => `window.LF?.game.mode === '${m}'`;

async function install(page) {
  await page.exposeFunction('__fdbList', (col) => JSON.stringify([...store].filter(([p]) => p.startsWith(col + '/') && !p.slice(col.length + 1).includes('/'))
    .map(([p, data]) => ({ id: p.slice(col.length + 1), data }))));
  await page.exposeFunction('__fdbSet', async (path, json) => {
    await new Promise((r) => setTimeout(r, 120)); // network latency: exercises the write queue
    if (SCENARIO === 'fail') return JSON.stringify({ code: 'invalid_argument', message: 'view-only viewer' });
    if (flakyLeft > 0) { flakyLeft--; return JSON.stringify({ code: 'unavailable', message: 'blip' }); }
    store.set(path, JSON.parse(json)); writes++; return '';
  });
  await page.exposeFunction('__fdbDel', async (path) => { store.delete(path); return ''; });
  await page.addInitScript(({ uid, scenario }) => {
    // Sandboxed artifact frame: browser storage throws.
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('sandboxed', 'SecurityError'); } });
    const ref = (path) => ({
      id: path.split('/').pop(), path,
      async set(data) { const e = await window.__fdbSet(path, JSON.stringify(data)); if (e) throw JSON.parse(e); },
      async delete() { await window.__fdbDel(path); },
    });
    const db = Object.freeze({
      collection: (col) => ({
        path: col,
        async get() {
          const rows = JSON.parse(await window.__fdbList(col));
          return { docs: rows.map((r) => ({ id: r.id, exists: true, data: () => r.data, metadata: {} })), size: rows.length, empty: !rows.length };
        },
        doc: (id) => ref(col + '/' + id),
      }),
      doc: (p) => ref(p),
    });
    const user = Object.freeze({ id: async () => uid, isOwner: async () => true, canEdit: async () => true, can: async () => true });
    window.claude = Object.freeze({
      use: (name) => new Promise((r) => setTimeout(() => r(name === 'db' ? (scenario === 'nodb' ? null : db) : name === 'user' ? user : null), 80)),
    });
  }, { uid: UID, scenario: SCENARIO });
}

async function boot(page, h) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (!await h.waitFor(BOOTED, 40000)) throw new Error('boot timeout');
  await h.sleep(1500);
  return page.evaluate(`(async () => (await import('/src/core/storage.js')).storage.mode)()`);
}

const settled = `(async () => !(await import('/src/core/storage.js')).storage.hasPendingWrites())()`;

async function continueSlot(page, h, skip) {
  await h.press('ArrowDown'); await h.sleep(350);
  await h.press('Enter'); await h.sleep(1200);           // Continue
  for (let i = 0; i < skip; i++) { await h.press('ArrowDown'); await h.sleep(350); }
  await h.press('Enter');
  return h.waitFor(M('overworld'), 60000);
}

export async function run(page, h) {
  await install(page);
  const mode1 = await boot(page, h);
  console.log('CLOUD mode after first boot:', mode1, '| scenario', SCENARIO);
  if (SCENARIO === 'fail' || SCENARIO === 'nodb') {
    await h.shot(`${SCENARIO}-title`);
    // A save attempt in this view: must not crash, must tell the player.
    await page.evaluate(`(async () => {
      const { G, resetState } = await import('/src/core/state.js');
      const { makeCreature } = await import('/src/game/creatures.js');
      const { saveGame } = await import('/src/core/save.js');
      resetState(); G.playerName = 'Rowan'; G.starter = 'kindlet'; G.party = [makeCreature('charvane', 18)];
      saveGame(1);
    })()`);
    await h.sleep(3000);
    const st = await page.evaluate(`(async () => { const s = (await import('/src/core/storage.js')).storage; return JSON.stringify({ mode: s.mode, pending: s.hasPendingWrites(), toasts: [...document.querySelectorAll('.toast-text')].map((t) => t.textContent) }); })()`);
    console.log('CLOUD state after save attempt:', st, '| cloud docs:', [...store.keys()].join(', '));
    await h.shot(`${SCENARIO}-after-save`);
    return;
  }

  // 1) A manual save lands in the player's private cloud subtree.
  const hadSave = await page.evaluate(`(async () => (await import('/src/core/save.js')).hasAnySave())()`);
  console.log('CLOUD fresh account has a save:', hadSave);
  await page.evaluate(`(async () => {
    const { G, resetState, gainItem, setFlag } = await import('/src/core/state.js');
    const { makeCreature } = await import('/src/game/creatures.js');
    const { saveGame } = await import('/src/core/save.js');
    resetState();
    G.playerName = 'Rowan'; G.starter = 'kindlet';
    G.party = [makeCreature('charvane', 18, { resonance: 3 }), makeCreature('aurelark', 16), makeCreature('cairnox', 15)];
    gainItem('woven_charm', 6); gainItem('tonic', 4);
    for (const f of ['intro_done','tutorial_done','dm_tip_shown','kb_beat','kl_beat']) setFlag(f);
    G.glim = 1240; G.pos = { zone: 'dawnmeadow', x: -6, z: 4, face: 0 };
    saveGame(1);
  })()`);
  await h.waitFor(settled, 10000);
  const doc1 = store.get(`data/users/${UID}/lumenfall_save_1`);
  console.log('CLOUD slot-1 doc written:', !!doc1, doc1 ? `${doc1.value.length} chars` : '');

  // 2) Reload: the save is still there, Continue loads it.
  const mode2 = await boot(page, h);
  const slots = await page.evaluate(`(async () => JSON.stringify((await import('/src/core/save.js')).listSaves().map((s) => s && { slot: s.slot, name: s.playerName, zone: s.zone })))()`);
  console.log('CLOUD after reload — mode', mode2, 'slots', slots);
  await h.shot('persist-title-after-reload');
  if (!await continueSlot(page, h, 1)) { await h.shot('persist-load-failed'); console.log('CLOUD RESULT: FAIL (could not continue)'); return; }
  await h.sleep(2500);
  for (let i = 0; i < 4; i++) { await h.press('Enter'); await h.sleep(300); }
  const loaded = await page.evaluate(`JSON.stringify({ name: LF.G.playerName, party: LF.G.party.map((m) => m.speciesId), zone: LF.G.pos.zone, tonic: LF.G.items?.tonic ?? LF.G.bag?.tonic ?? null })`);
  console.log('CLOUD loaded from slot 1:', loaded);

  // 3) Progress → autosave (no portal, no menu): gain items, wait.
  const w0 = writes;
  await page.evaluate(`(async () => { const { gainItem } = await import('/src/core/state.js'); gainItem('tonic', 3); gainItem('glazed_charm', 2); })()`);
  const pill = await h.waitFor(`document.querySelector('.save-pill.show')?.textContent ?? ''`, 8000, 100);
  console.log('CLOUD save pill shown:', JSON.stringify(pill || null));
  await h.shot('persist-autosave-pill');
  await h.waitFor(settled, 10000);
  const auto = store.get(`data/users/${UID}/lumenfall_save_0`);
  const autoHas = auto ? JSON.parse(auto.value) : null;
  console.log('CLOUD autosave written:', !!auto, '| writes during it:', writes - w0,
    '| has glazed_charm:', !!autoHas && JSON.stringify(autoHas).includes('glazed_charm'));

  // 4) Settings persist too.
  await page.evaluate(`(async () => { const { updateSetting } = await import('/src/core/settings.js'); updateSetting('textSpeed', 'normal'); updateSetting('textSpeed', 'instant'); })()`);
  await h.waitFor(settled, 10000);

  // 5) Reload again → the newest save is the autosave (slot 0), settings kept.
  const mode3 = await boot(page, h);
  const st3 = await page.evaluate(`(async () => {
    const { listSaves } = await import('/src/core/save.js');
    const { settings } = await import('/src/core/settings.js');
    return JSON.stringify({ textSpeed: settings.textSpeed, slot0: listSaves()[0] && listSaves()[0].playerName });
  })()`);
  console.log('CLOUD after 2nd reload — mode', mode3, st3);
  if (!await continueSlot(page, h, 0)) { await h.shot('persist-autoload-failed'); console.log('CLOUD RESULT: FAIL (could not continue from autosave)'); return; }
  await h.sleep(2000);
  const fromAuto = await page.evaluate(`JSON.stringify({ name: LF.G.playerName, glazed: JSON.stringify(LF.G).includes('glazed_charm'), zone: LF.G.pos.zone })`);
  console.log('CLOUD loaded from autosave:', fromAuto);
  await h.shot('persist-continued-from-autosave');
  const ok = mode1 === 'cloud' && mode2 === 'cloud' && mode3 === 'cloud' && !!doc1 && JSON.parse(loaded).name === 'Rowan'
    && !!auto && JSON.parse(fromAuto).glazed && JSON.parse(st3).textSpeed === 'instant';
  console.log('CLOUD RESULT:', ok ? 'PASS' : 'FAIL', '| cloud docs:', [...store.keys()].join(', '));
}
