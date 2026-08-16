// Firstborn legendary QA: closeups + silhouette checks for aurios, nyxmara and
// thalassyr on a neutral stage. Usage:
//   QA_BEAUTY=1 node tools/shoot.mjs tools/drivers/qa-legend-closeup.mjs test-output/legend-1
//
// Shots per run:
//   trio-3q         all three, heights normalised, 3/4 view (compare to each other)
//   trio-scale      all three at TRUE SPECIES size, 3/4 view
//   <id>-3q         single creature, 3/4 hero angle
//   <id>-front      single creature, near-front (wingspan / antler spread read)
//   <id>-sil        single creature, flat black on white — the 64px shape test
//   trio-sil        all three in silhouette side by side
const IDS = ['aurios', 'nyxmara', 'thalassyr'];

export async function run(page, h) {
  await h.waitFor('!!window.LF', 30000);
  await h.sleep(1200);
  await page.evaluate(() => {
    const ui = document.getElementById('ui-root');
    if (ui) ui.style.display = 'none';
    document.getElementById('boot-screen')?.remove();
  });

  // --- Build the stage once; expose a small API on window for later calls. --
  await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.js');
    const { buildCreature } = await import('/src/creatures/registry.js');

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 400);

    // Key / fill / rim: warm sun key, cool sky hemisphere, cold back rim so a
    // dark creature still separates from the background (Design Bible §8).
    const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x40405a, 1.25);
    const key = new THREE.DirectionalLight(0xfff0d4, 3.1); key.position.set(5, 7, 6);
    const fill = new THREE.DirectionalLight(0x9fc4ff, 0.9); fill.position.set(-6, 3, 4);
    const rim = new THREE.DirectionalLight(0xbfd8ff, 2.4); rim.position.set(-4, 5, -7);
    scene.add(hemi, key, fill, rim);

    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(60, 60, 0.1, 48),
      new THREE.MeshStandardMaterial({ color: 0x3a3f55, roughness: 0.95 }),
    );
    floor.position.y = -0.05;
    scene.add(floor);

    const holder = new THREE.Group();
    scene.add(holder);
    const state = { animators: [], sil: false };

    function clear() {
      for (let i = holder.children.length - 1; i >= 0; i--) holder.remove(holder.children[i]);
      state.animators.length = 0;
    }

    function silhouette(group) {
      // DoubleSide matters: every flat blade in the kit (fins, crests, wing
      // membranes, ray fans) is a single ShapeGeometry, and a FrontSide black
      // material makes every one of them that happens to face away from the
      // camera VANISH — which silently under-reports the silhouette.
      const black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
      group.traverse((n) => {
        if (n.name === 'motes' || n.name === 'starfield' || n.name === 'lightPool') { n.visible = false; return; }
        if (n.isMesh) n.material = black;
      });
    }

    // Bounding box of the SOLID model only. Mote fx anchor groups sit far off
    // the body (a wake, a halo) with their meshes parked at the origin until
    // the first update(), so including them wrecks both framing and height
    // normalisation.
    function solidBox(obj) {
      const box = new THREE.Box3();
      obj.updateWorldMatrix(true, true);
      obj.traverse((n) => {
        if (!n.isMesh || n.name === 'mote') return;
        const b = new THREE.Box3().setFromBufferAttribute(n.geometry.attributes.position);
        b.applyMatrix4(n.matrixWorld);
        box.union(b);
      });
      return box;
    }

    // Place `ids` in a row. normalise: target height in units, or null for the
    // creature's true SPECIES size. Returns the row's bounding box.
    function place(ids, { normalise = null, gap = 1.25, sil = false } = {}) {
      clear();
      state.sil = sil;
      scene.background = new THREE.Color(sil ? 0xf2f3f7 : 0x252a3c);
      floor.visible = !sil;
      hemi.intensity = sil ? 0 : 1.25;
      key.intensity = sil ? 0 : 3.1;
      fill.intensity = sil ? 0 : 0.9;
      rim.intensity = sil ? 0 : 2.4;

      const built = ids.map((id) => {
        const { group, animator } = buildCreature(id);
        if (normalise) {
          const hgt = Math.max(solidBox(group).max.y, 0.001);
          group.scale.multiplyScalar(normalise / hgt);
          group.position.y -= solidBox(group).min.y;
        }
        if (sil) silhouette(group);
        state.animators.push(animator);
        const box = solidBox(group);
        return { group, box, size: box.getSize(new THREE.Vector3()) };
      });

      let x = 0;
      const widths = built.map((b) => b.size.x);
      const total = widths.reduce((a, b) => a + b, 0) + gap * (built.length - 1);
      x = -total / 2;
      for (const b of built) {
        b.group.position.x += x + b.size.x / 2 - (b.box.min.x + b.size.x / 2);
        x += b.size.x + gap;
        holder.add(b.group);
      }
      const rowBox = solidBox(holder);
      return {
        min: rowBox.min.toArray(), max: rowBox.max.toArray(),
        dims: built.map((b, i) => ({ id: ids[i], w: +b.size.x.toFixed(2), h: +b.size.y.toFixed(2), l: +b.size.z.toFixed(2) })),
      };
    }

    // Frame the current contents from azimuth `az` (degrees, 0 = straight
    // front / +Z) and elevation `el`.
    function frame(az = 38, el = 14, pad = 1.22) {
      const box = solidBox(holder);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const fov = cam.fov * Math.PI / 180;
      const aspect = innerWidth / innerHeight;
      // Screen-space extents at this azimuth: the model's apparent width is
      // its footprint projected across the view direction, not its diagonal.
      const a0 = az * Math.PI / 180;
      const apparentW = Math.abs(size.x * Math.cos(a0)) + Math.abs(size.z * Math.sin(a0));
      const radiusV = size.y * 0.5;
      const radiusH = apparentW * 0.5;
      let dist = radiusV / Math.tan(fov / 2) * pad;
      dist = Math.max(dist, radiusH / (Math.tan(fov / 2) * aspect) * pad);
      const a = az * Math.PI / 180, e = el * Math.PI / 180;
      cam.position.set(
        center.x + Math.sin(a) * Math.cos(e) * dist,
        center.y + Math.sin(e) * dist,
        center.z + Math.cos(a) * Math.cos(e) * dist,
      );
      cam.lookAt(center.x, center.y, center.z);
      cam.updateProjectionMatrix();
    }

    const clock = new THREE.Clock();
    window.__legend = { place, frame };
    window.LF.game.setScene({
      scene, camera: cam,
      update: () => {
        const dt = Math.min(clock.getDelta(), 0.05);
        for (const a of state.animators) a.update(dt);
      },
    });
  });

  const shoot = async (ids, opts, az, el, name, pad = 1.22) => {
    const info = await page.evaluate(({ ids, opts, az, el, pad }) => {
      const r = window.__legend.place(ids, opts);
      window.__legend.frame(az, el, pad);
      return r;
    }, { ids, opts, az, el, pad });
    console.log(name, JSON.stringify(info.dims));
    await h.sleep(1600);
    await h.shot(name);
  };

  await shoot(IDS, { normalise: 1.6, gap: 1.1 }, 36, 14, 'trio-3q', 1.3);
  await shoot(IDS, { normalise: null, gap: 1.4 }, 36, 12, 'trio-scale', 1.3);

  for (const id of IDS) {
    await shoot([id], { normalise: 1.6 }, 38, 13, `${id}-3q`, 1.4);
    await shoot([id], { normalise: 1.6 }, 8, 8, `${id}-front`, 1.4);
    await shoot([id], { normalise: 1.6, sil: true }, 38, 10, `${id}-sil`, 1.4);
  }

  await shoot(IDS, { normalise: 1.6, gap: 1.1, sil: true }, 36, 10, 'trio-sil', 1.3);
}
