// Creature showcase: renders a grid of creature models straight from the registry
// onto a neutral stage and screenshots them in batches. Usage:
//   QA_BEAUTY=1 node tools/shoot.mjs tools/drivers/showcase.mjs
export async function run(page, h) {
  await h.waitFor(`!!window.LF`, 20000);
  await h.sleep(1500);
  await page.evaluate(() => {
    document.getElementById('ui-root').style.display = 'none';
    document.getElementById('boot-screen')?.remove();
  });
  const batches = await page.evaluate(async () => {
    const { SPECIES_LIST } = await import('/src/data/creatures.js');
    return Math.ceil(SPECIES_LIST.length / 12);
  });
  for (let b = 0; b < batches; b++) {
    await page.evaluate(async (batch) => {
      const THREE = await import('/vendor/three.module.js');
      const { buildCreature } = await import('/src/creatures/registry.js');
      const { SPECIES_LIST, SPECIES } = await import('/src/data/creatures.js');
      const ids = SPECIES_LIST.slice(batch * 12, batch * 12 + 12);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x2a2e40);
      const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
      cam.position.set(0, 6.5, 14); cam.lookAt(0, 0.8, 0);
      scene.add(new THREE.HemisphereLight(0xeef2ff, 0x5a5446, 1.6));
      const sun = new THREE.DirectionalLight(0xfff2d0, 3.2); sun.position.set(4, 8, 6); scene.add(sun);
      const rim = new THREE.DirectionalLight(0x9ad1ff, 1.4); rim.position.set(-5, 4, -6); scene.add(rim);
      scene.add(new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 0.1, 48), new THREE.MeshStandardMaterial({ color: 0x3d4257 })));
      const animators = [];
      ids.forEach((id, i) => {
        const col = i % 4, row = Math.floor(i / 4);
        try {
          const { group, animator } = buildCreature(id);
          group.position.set((col - 1.5) * 4.2, 0.05, (row - 1) * 4.2);
          scene.add(group);
          animators.push(animator);
          // name sprite
          const c = document.createElement('canvas'); c.width = 256; c.height = 48;
          const ctx2 = c.getContext('2d');
          ctx2.font = '600 26px Georgia'; ctx2.textAlign = 'center'; ctx2.fillStyle = '#ffe9b0';
          ctx2.fillText(SPECIES[id]?.name ?? id, 128, 34);
          const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
          spr.scale.set(2.6, 0.5, 1);
          spr.position.set((col - 1.5) * 4.2, 0.3, (row - 1) * 4.2 + 1.7);
          scene.add(spr);
        } catch (e) { console.error('build failed', id, e.message); }
      });
      const clock = new THREE.Clock();
      window.__showcase = { update: () => { const dt = Math.min(clock.getDelta(), 0.05); animators.forEach(a => a.update(dt)); }, scene, camera: cam };
      window.LF.game.setScene(window.__showcase);
    }, b);
    await h.sleep(2500);
    await h.shot(`creatures-batch-${b + 1}`);
  }
}
