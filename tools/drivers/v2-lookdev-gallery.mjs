// v2 LOOK-DEV creature gallery: the showcase.mjs stage (12 per batch, straight
// from the registry) plus a closer "hero" row, rendered through the game's own
// postfx chain so bloom/grade match the world. Batches via LOOK_BATCHES
// (e.g. "1,2" — 1-based; default all four), hero row via LOOK_HERO=0 to skip.
//   QA_BEAUTY=1 QA_VIEWPORT=1120x630 node tools/shoot.mjs tools/drivers/v2-lookdev-gallery.mjs <out>
const batches = () => (process.env.LOOK_BATCHES ?? '1,2,3,4').split(',').map((s) => parseInt(s, 10) - 1).filter((n) => n >= 0);
const HERO = process.env.LOOK_HERO !== '0';
const HERO_IDS = (process.env.LOOK_HERO_IDS ?? 'kindlet,nixling,thistlit,charvane,cairnox').split(',');

const STAGE = `async (spec) => {
  const THREE = await import('/vendor/three.module.js');
  const { buildCreature } = await import('/src/creatures/registry.js');
  const { SPECIES_LIST, SPECIES } = await import('/src/data/creatures.js');
  const { applyAtmosphere } = await import('/src/gfx/postfx.js');
  const ids = spec.ids ?? SPECIES_LIST.slice(spec.batch * 12, spec.batch * 12 + 12);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fb4d8);
  scene.fog = new THREE.Fog(0x9fc0dc, 30, 90);
  const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 200);
  if (spec.hero) { cam.position.set(0, 1.35, 4.4); cam.lookAt(0, 0.42, 0); }
  else { cam.position.set(0, 6.5, 14); cam.lookAt(0, 0.8, 0); }
  // Noon-ish rig close to sky.js: warm key 3.0, cool sky / warm bounce hemisphere.
  scene.add(new THREE.HemisphereLight(0xb8cde6, 0x8a7a5a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.0); sun.position.set(6, 10, 7); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 0.1, 64), new THREE.MeshStandardMaterial({ color: 0x6f9a52, roughness: 0.95 }));
  ground.position.y = -0.05; scene.add(ground);
  const animators = [];
  ids.forEach((id, i) => {
    const cols = spec.hero ? ids.length : 4;
    const col = i % cols, row = Math.floor(i / cols);
    try {
      const { group, animator } = buildCreature(id);
      if (spec.hero) {
        const sz = SPECIES[id]?.size ?? 1;
        if (sz > 0.9) group.scale.multiplyScalar(0.9 / sz);
        group.position.set((col - (cols - 1) / 2) * 1.12, 0, 0);
        group.rotation.y = (col - (cols - 1) / 2) * -0.18;
      } else {
        group.position.set((col - 1.5) * 4.2, 0.0, (row - 1) * 4.2);
      }
      scene.add(group);
      animators.push(animator);
      if (!spec.hero) {
        const c = document.createElement('canvas'); c.width = 256; c.height = 48;
        const ctx2 = c.getContext('2d');
        ctx2.font = '600 26px Georgia'; ctx2.textAlign = 'center'; ctx2.fillStyle = '#ffe9b0';
        ctx2.fillText(SPECIES[id]?.name ?? id, 128, 34);
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
        spr.scale.set(2.6, 0.5, 1);
        spr.position.set((col - 1.5) * 4.2, 0.3, (row - 1) * 4.2 + 1.7);
        scene.add(spr);
      }
    } catch (e) { console.error('build failed', id, e.message); }
  });
  const renderer = window.LF.game.renderer;
  if (window.__lookFx) { try { window.__lookFx.dispose(); } catch (e) {} }
  const fx = applyAtmosphere(renderer, scene, cam);
  window.__lookFx = fx;
  const clock = new THREE.Clock();
  window.__showcase = {
    scene, camera: cam,
    update: () => { const dt = Math.min(clock.getDelta(), 0.05); animators.forEach((a) => a.update(dt)); },
    render: () => fx.render(),
  };
  window.LF.game.setScene(window.__showcase);
  return ids.join(',');
}`;

export async function run(page, h) {
  await h.waitFor(`!!window.LF`, 20000);
  await h.sleep(1500);
  await page.evaluate(() => {
    document.getElementById('ui-root').style.display = 'none';
    document.getElementById('boot-screen')?.remove();
  });
  if (HERO) {
    console.log('HERO:', await page.evaluate(`(${STAGE})(${JSON.stringify({ hero: true, ids: HERO_IDS })})`));
    await h.sleep(3000);
    await h.shot('hero-row');
  }
  for (const b of batches()) {
    console.log('BATCH:', await page.evaluate(`(${STAGE})(${JSON.stringify({ batch: b })})`));
    await h.sleep(2600);
    await h.shot(`creatures-batch-${b + 1}`);
  }
}
