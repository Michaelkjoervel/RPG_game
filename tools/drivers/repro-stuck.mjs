// Reproduce the player's report: after the real intro, camera is under the
// terrain and movement does nothing. Plays the genuine New Journey flow.
export async function run(page, h) {
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 25000);
  await h.sleep(2500);
  await h.press('Enter'); await h.sleep(1400);          // New Journey
  await h.press('Enter');                               // accept default name
  // Advance until a party exists (starter chosen), mashing through the intro.
  for (let i = 0; i < 40; i++) {
    await h.press('Enter'); await h.sleep(650);
    if (await page.evaluate(`(window.LF?.G.party?.length ?? 0) > 0`)) break;
  }
  console.log('STARTER:', await page.evaluate(`window.LF.G.starter`));
  // Rival battle + post-intro: mash until we are standing in the overworld.
  for (let i = 0; i < 90; i++) {
    await h.press('Enter'); await h.sleep(600);
    const st = await page.evaluate(`JSON.stringify({m: window.LF.game.mode, w: !!window.LF.game.overworld?.zone})`);
    if (JSON.parse(st).m === 'overworld' && JSON.parse(st).w) break;
  }
  await h.sleep(2500);
  await h.shot('arrived');

  const probe = () => page.evaluate(`(() => {
    const g = window.LF.game, w = g.overworld, p = w?.player, cam = w?.camera;
    const px = p?.pos?.x ?? null, pz = p?.pos?.z ?? null;
    return JSON.stringify({
      mode: g.mode, paused: g._paused, zone: w?.zone?.id ?? null,
      player: p ? { x: +px.toFixed(2), y: +p.pos.y.toFixed(2), z: +pz.toFixed(2) } : null,
      ground: (w?.heightAt && px != null) ? +w.heightAt(px, pz).toFixed(2) : null,
      cam: cam ? { x: +cam.position.x.toFixed(2), y: +cam.position.y.toFixed(2), z: +cam.position.z.toFixed(2) } : null,
      camGround: (w?.heightAt && cam) ? +w.heightAt(cam.position.x, cam.position.z).toFixed(2) : null,
      frozen: p?._frozen ?? p?.frozen ?? 'unknown',
      dialogueOpen: !!document.querySelector('#ui-root [class*="dlg"]:not(.hidden)'),
      uiLayers: [...document.getElementById('ui-root').children].map(e => e.className || e.id),
      // Is the player standing inside a solid? (the "trapped" hypothesis)
      inside: (w?.colliders ?? []).filter((c) => {
        const dx = px - c.x, dz = pz - c.z;
        return Math.sqrt(dx * dx + dz * dz) < c.r;
      }).map((c) => ({ x: +c.x.toFixed(1), z: +c.z.toFixed(1), r: +c.r.toFixed(1) })),
      colliderCount: (w?.colliders ?? []).length,
      camInside: (w?.colliders ?? []).some((c) => {
        const dx = cam.position.x - c.x, dz = cam.position.z - c.z;
        return Math.sqrt(dx * dx + dz * dz) < c.r;
      }),
      canvas: [document.getElementById('game-canvas').width, document.getElementById('game-canvas').height],
      win: [innerWidth, innerHeight],
    });
  })()`);
  console.log('BEFORE MOVE:', await probe());
  await h.hold('w', 2000);
  await h.sleep(600);
  console.log('AFTER  MOVE:', await probe());
  await h.shot('after-move');
}
