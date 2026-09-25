// v2 LOOK-DEV character stage: the real Warden (createPlayer) + follower and a
// row of real NPCs (createNpcs) on a neutral noon stage rendered through the
// game's postfx chain — fast iteration on character models without loading a
// zone. Shots: game-camera back view, back/front/side close-ups, a walking
// beat (cloak in motion), NPC row front + back, plus stats.
//   QA_BEAUTY=1 QA_VIEWPORT=1120x630 node tools/shoot.mjs tools/drivers/v2-lookdev-stage.mjs <out>
const NPC_IDS = (process.env.LOOK_NPCS ?? 'elder_maren,bryn,keeper_liora,merchant_wren,lt_vess,keeper_maro').split(',');

const SETUP = `async (npcIds) => {
  const THREE = await import('/vendor/three.module.js');
  const { G } = await import('/src/core/state.js');
  const { makeCreature } = await import('/src/game/creatures.js');
  const { createPlayer } = await import('/src/world/player.js');
  const { createNpcs } = await import('/src/world/npcs.js');
  const { applyAtmosphere } = await import('/src/gfx/postfx.js');
  const { tickWind } = await import('/src/gfx/materials.js');
  const { input } = await import('/src/core/input.js');
  G.party = [makeCreature('charvane', 18)];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9cc4e4);
  scene.fog = new THREE.Fog(0xb4cfe4, 28, 110);
  scene.add(new THREE.HemisphereLight(0xb8cde6, 0x8a7a5a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.0);
  sun.position.set(6, 10, 4); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
  sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: 0x7aa35a, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);
  const placements = npcIds.map((id, i) => ({ id, at: [(i - (npcIds.length - 1) / 2) * 1.5, -7], face: 0 }));
  const world = {
    zone: { id: 'stage', biome: 'meadow', size: 200, spawn: [0, 0], spawnFace: 0, npcs: placements },
    scene, colliders: [], heightAt: () => 0, get camera() { return cam; },
    props: null, game: window.LF.game, interact() {}, nearestPrompt() { return null; },
  };
  const player = createPlayer(world);
  world.player = player;
  const npcs = createNpcs(world.zone, world);
  await npcs.ready;
  const fx = applyAtmosphere(window.LF.game.renderer, scene, cam);
  window.__stage = { THREE, scene, cam, world, player, npcs, walk: 0, input };
  window.LF.game.setScene({
    scene, camera: cam,
    update: (dt) => {
      tickWind(dt);
      input.axes.x = 0; input.axes.y = window.__stage.walk;
      player.update(dt); // NPCs stay in their authored rest pose (no wander) for stable shots
      sun.target.position.copy(player.pos); sun.position.copy(player.pos).add(new THREE.Vector3(6, 10, 4));
    },
    render: () => fx.render(),
  });
  return 'stage up';
}`;

// camera relative to the Warden: dx right, dy up, dz forward (negative = behind)
const VIEW = (dx, dy, dz, ty, fov = 50) => `(() => {
  const s = window.__stage, p = s.player.pos, f = s.player.face;
  const cs = Math.cos(f), sn = Math.sin(f);
  s.cam.fov = ${fov}; s.cam.updateProjectionMatrix();
  s.cam.position.set(p.x + (${dx}) * cs + (${dz}) * sn, p.y + (${dy}), p.z - (${dx}) * sn + (${dz}) * cs);
  s.cam.lookAt(p.x, p.y + (${ty}), p.z);
  return true;
})()`;
const NPC_ROW = (front) => `(() => {
  const s = window.__stage;
  s.cam.fov = 44; s.cam.updateProjectionMatrix();
  s.cam.position.set(0, 1.6, ${front ? -0.4 : -13.6});
  s.cam.lookAt(0, 0.95, -7);
  return true;
})()`;
const STATS = `(() => {
  const g = window.LF.game, r = g.renderer, s = g.activeScene;
  const auto = r.info.autoReset; r.info.autoReset = false; r.info.reset();
  r.render(s.scene, s.camera);
  const o = { calls: r.info.render.calls, triangles: r.info.render.triangles };
  r.info.autoReset = auto;
  let meshes = 0, outlines = 0;
  s.world.player.object3D.traverse((m) => { if (m.isMesh) { meshes++; if (m.userData.lfOutline) outlines++; } });
  o.wardenMeshes = meshes; o.wardenOutlines = outlines;
  return JSON.stringify(o);
})()`;

export async function run(page, h) {
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 25000);
  await h.sleep(1200);
  await page.evaluate(() => { document.getElementById('ui-root').style.visibility = 'hidden'; });
  console.log(await page.evaluate(`(${SETUP})(${JSON.stringify(NPC_IDS)})`));
  await h.sleep(1500);
  await page.evaluate(`window.LF.game.activeScene.world = window.__stage.world; true`);
  // game camera: ~7.5 m behind, ~22° down — what the player sees all game
  await page.evaluate(VIEW(0, 3.0, -6.9, 1.1, 55)); await h.sleep(700);
  await h.shot('warden-gamecam');
  await page.evaluate(VIEW(0.45, 1.5, -2.5, 0.95)); await h.sleep(700);
  await h.shot('warden-back');
  await page.evaluate(VIEW(-1.2, 1.3, 2.2, 1.0)); await h.sleep(700);
  await h.shot('warden-front');
  await page.evaluate(VIEW(2.5, 1.2, -0.4, 0.9)); await h.sleep(700);
  await h.shot('warden-side');
  console.log('STATS stage:', await page.evaluate(STATS));
  // walking beat: cloak in motion (camera follows from behind)
  await page.evaluate(`window.__stage.walk = -1; true`);
  await h.sleep(1600);
  await page.evaluate(VIEW(0.9, 1.6, -3.0, 0.9)); await h.sleep(250);
  await h.shot('warden-walk');
  await page.evaluate(`window.__stage.walk = 0; true`);
  await h.sleep(1500);
  await page.evaluate(NPC_ROW(true)); await h.sleep(700);
  await h.shot('npcs-front');
  await page.evaluate(NPC_ROW(false)); await h.sleep(700);
  await h.shot('npcs-back');
}
