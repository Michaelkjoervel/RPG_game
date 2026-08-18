// CREATURES-BETA iteration driver: rows of specific creature IDs on a neutral
// stage, framed close enough to judge silhouette/tones/signature details.
// Usage:
//   QA_IDS="pyrelith,sancturne;tidelorn,sylvathorn" node tools/shoot.mjs tools/drivers/qa-beta-rows.mjs out
// Each ;-row gets one 3/4 shot (heights normalised). QA_SIL=1 adds a
// silhouette shot per row. Camera/stage logic mirrors qa-legend-closeup.mjs.
const ROWS = (process.env.QA_IDS ?? 'pyrelith,sancturne,tidelorn').split(';').map((r) => r.split(',').map((s) => s.trim()).filter(Boolean));
const SIL = process.env.QA_SIL === '1';

export async function run(page, h) {
  await h.waitFor('!!window.LF', 30000);
  await h.sleep(1200);
  await page.evaluate(() => {
    const ui = document.getElementById('ui-root');
    if (ui) ui.style.display = 'none';
    document.getElementById('boot-screen')?.remove();
  });

  await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.js');
    const { buildCreature } = await import('/src/creatures/registry.js');

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 400);
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
    const state = { animators: [] };

    function clear() {
      for (let i = holder.children.length - 1; i >= 0; i--) holder.remove(holder.children[i]);
      state.animators.length = 0;
    }
    function silhouette(group) {
      const black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
      group.traverse((n) => {
        if (n.name === 'motes' || n.name === 'starfield' || n.name === 'lightPool') { n.visible = false; return; }
        if (n.isMesh) n.material = black;
      });
    }
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
    function place(ids, { normalise = 1.5, gap = 0.9, sil = false } = {}) {
      clear();
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
      const total = built.reduce((a, b) => a + b.size.x, 0) + gap * (built.length - 1);
      x = -total / 2;
      for (const b of built) {
        b.group.position.x += x + b.size.x / 2 - (b.box.min.x + b.size.x / 2);
        x += b.size.x + gap;
        holder.add(b.group);
      }
      const rowBox = solidBox(holder);
      return {
        dims: built.map((b, i) => ({ id: ids[i], w: +b.size.x.toFixed(2), h: +b.size.y.toFixed(2), l: +b.size.z.toFixed(2) })),
        min: rowBox.min.toArray(), max: rowBox.max.toArray(),
      };
    }
    function frame(az = 34, el = 12, pad = 1.24) {
      const box = solidBox(holder);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const fov = cam.fov * Math.PI / 180;
      const aspect = innerWidth / innerHeight;
      const a0 = az * Math.PI / 180;
      const apparentW = Math.abs(size.x * Math.cos(a0)) + Math.abs(size.z * Math.sin(a0));
      let dist = (size.y * 0.5) / Math.tan(fov / 2) * pad;
      dist = Math.max(dist, (apparentW * 0.5) / (Math.tan(fov / 2) * aspect) * pad);
      const e = el * Math.PI / 180;
      cam.position.set(
        center.x + Math.sin(a0) * Math.cos(e) * dist,
        center.y + Math.sin(e) * dist,
        center.z + Math.cos(a0) * Math.cos(e) * dist,
      );
      cam.lookAt(center.x, center.y, center.z);
      cam.updateProjectionMatrix();
    }
    const clock = new THREE.Clock();
    window.__betaRows = { place, frame };
    window.LF.game.setScene({
      scene, camera: cam,
      update: () => {
        const dt = Math.min(clock.getDelta(), 0.05);
        for (const a of state.animators) a.update(dt);
      },
    });
  });

  const shoot = async (ids, sil, name) => {
    const info = await page.evaluate(({ ids, sil }) => {
      const r = window.__betaRows.place(ids, { normalise: 1.5, gap: 0.9, sil });
      window.__betaRows.frame(34, 12, 1.24);
      return r;
    }, { ids, sil });
    console.log(name, JSON.stringify(info.dims));
    await h.sleep(1500);
    await h.shot(name);
  };

  for (let i = 0; i < ROWS.length; i++) {
    await shoot(ROWS[i], false, `row${i + 1}-${ROWS[i][0]}`);
    if (SIL) await shoot(ROWS[i], true, `row${i + 1}-${ROWS[i][0]}-sil`);
  }
}
