// AD review: dark-species legibility stage + size-outlier lineup + Box3 metrics.
export async function run(page, h) {
  await h.waitFor(`!!window.LF`, 30000);
  await h.sleep(1500);
  await page.evaluate(() => {
    document.getElementById('ui-root').style.display = 'none';
    document.getElementById('boot-screen')?.remove();
  });

  // Box3 metrics for every species (post registry rescale).
  const metrics = await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.js');
    const { buildCreature } = await import('/src/creatures/registry.js');
    const { SPECIES_LIST, SPECIES } = await import('/src/data/creatures.js');
    const out = [];
    for (const id of SPECIES_LIST) {
      try {
        const { group } = buildCreature(id);
        const b = new THREE.Box3().setFromObject(group);
        const s = new THREE.Vector3(); b.getSize(s);
        out.push(`${id}: h=${s.y.toFixed(2)} w=${s.x.toFixed(2)} d=${s.z.toFixed(2)} (data ${SPECIES[id]?.size})`);
      } catch (e) { out.push(`${id}: BUILD FAIL ${e.message}`); }
    }
    return out;
  });
  console.log('SIZES\n' + metrics.join('\n'));

  const stage = async (ids, spacing, camZ, camY) => {
    await page.evaluate(async ({ ids, spacing, camZ, camY }) => {
      const THREE = await import('/vendor/three.module.js');
      const { buildCreature } = await import('/src/creatures/registry.js');
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x2a2e40);
      const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
      cam.position.set(0, camY, camZ); cam.lookAt(0, 0.9, 0);
      scene.add(new THREE.HemisphereLight(0xeef2ff, 0x5a5446, 1.6));
      const sun = new THREE.DirectionalLight(0xfff2d0, 3.2); sun.position.set(4, 8, 6); scene.add(sun);
      const rim = new THREE.DirectionalLight(0x9ad1ff, 1.4); rim.position.set(-5, 4, -6); scene.add(rim);
      scene.add(new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 0.1, 48), new THREE.MeshStandardMaterial({ color: 0x3d4257 })));
      const animators = [];
      ids.forEach((id, i) => {
        try {
          const { group, animator } = buildCreature(id);
          group.position.set((i - (ids.length - 1) / 2) * spacing, 0.05, 0);
          scene.add(group); animators.push(animator);
          const c = document.createElement('canvas'); c.width = 256; c.height = 48;
          const x = c.getContext('2d');
          x.font = '600 28px Georgia'; x.textAlign = 'center'; x.fillStyle = '#ffe9b0'; x.fillText(id, 128, 34);
          const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
          spr.scale.set(2.2, 0.42, 1);
          spr.position.set((i - (ids.length - 1) / 2) * spacing, -0.15, 2.2);
          scene.add(spr);
        } catch (e) { console.error('build failed', id, e.message); }
      });
      const clock = new THREE.Clock();
      window.__qs = { update: () => { const dt = Math.min(clock.getDelta(), 0.05); animators.forEach(a => a.update(dt)); }, scene, camera: cam };
      window.LF.game.setScene(window.__qs);
    }, { ids, spacing, camZ, camY });
    await h.sleep(2500);
  };

  await stage(['duskit', 'vantash', 'noctyra', 'pyrelith'], 2.6, 9, 3.2);
  await h.shot('dark-small');
  await stage(['nyxmara', 'thalassyr'], 6.5, 13, 4.5);
  await h.shot('dark-legendaries');
  await stage(['lanterling', 'sonark', 'jellune', 'vellit', 'gloomel'], 2.4, 8.5, 3.0);
  await h.shot('size-outliers');
}
