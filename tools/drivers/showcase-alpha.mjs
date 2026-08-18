// Close-range gallery for the 22 CREATURES-ALPHA models (visual overhaul QA).
// Same stage/lighting as showcase.mjs but near camera so eyes/gradients are
// judgeable. Usage:  node tools/shoot.mjs tools/drivers/showcase-alpha.mjs <out>
const HERO = ['kindlet', 'charvane', 'aurelark', 'cairnox'];
const REST = [
  'pipwing', 'pebbin', 'vellit', 'duskit', 'motling',
  'thistlit', 'dapplyn', 'myclet', 'fulmin', 'nixling',
  'sonark', 'fungore', 'veldrun', 'zephyra', 'stormane',
  'noctyra', 'lanterling', 'glowvern',
];

export async function run(page, h) {
  await h.waitFor(`!!window.LF`, 20000);
  await h.sleep(1500);
  await page.evaluate(() => {
    document.getElementById('ui-root').style.display = 'none';
    document.getElementById('boot-screen')?.remove();
  });
  const rows = [HERO, ...Array.from({ length: Math.ceil(REST.length / 5) }, (_, i) => REST.slice(i * 5, i * 5 + 5))];
  for (let b = 0; b < rows.length; b++) {
    await page.evaluate(async ({ ids, hero }) => {
      const THREE = await import('/vendor/three.module.js');
      const { buildCreature } = await import('/src/creatures/registry.js');
      const { SPECIES } = await import('/src/data/creatures.js');
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x2a2e40);
      const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
      if (hero) { cam.position.set(0, 1.1, 4.4); cam.lookAt(0, 0.6, 0); }
      else { cam.position.set(0, 1.3, 6.2); cam.lookAt(0, 0.55, 0); }
      scene.add(new THREE.HemisphereLight(0xeef2ff, 0x5a5446, 1.6));
      const sun = new THREE.DirectionalLight(0xfff2d0, 3.2); sun.position.set(4, 8, 6); scene.add(sun);
      const rim = new THREE.DirectionalLight(0x9ad1ff, 1.4); rim.position.set(-5, 4, -6); scene.add(rim);
      scene.add(new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 0.1, 48), new THREE.MeshStandardMaterial({ color: 0x3d4257 })));
      const animators = [];
      const spacing = hero ? 1.35 : 1.35;
      ids.forEach((id, i) => {
        try {
          const { group, animator } = buildCreature(id);
          group.position.set((i - (ids.length - 1) / 2) * spacing, 0.05, 0);
          group.rotation.y = -0.28; // slight 3/4 turn so silhouette + face both read
          scene.add(group);
          animators.push(animator);
          const c = document.createElement('canvas'); c.width = 256; c.height = 48;
          const ctx2 = c.getContext('2d');
          ctx2.font = '600 26px Georgia'; ctx2.textAlign = 'center'; ctx2.fillStyle = '#ffe9b0';
          ctx2.fillText(SPECIES[id]?.name ?? id, 128, 34);
          const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
          spr.scale.set(1.3, 0.25, 1);
          spr.position.set((i - (ids.length - 1) / 2) * spacing, 0.08, 1.1);
          scene.add(spr);
        } catch (e) { console.error('build failed', id, e.message); }
      });
      const clock = new THREE.Clock();
      window.__showcase = { update: () => { const dt = Math.min(clock.getDelta(), 0.05); animators.forEach(a => a.update(dt)); }, scene, camera: cam };
      window.LF.game.setScene(window.__showcase);
    }, { ids: rows[b], hero: b === 0 });
    await h.sleep(2200);
    await h.shot(b === 0 ? 'alpha-heroes' : `alpha-row-${b}`);
  }
}
