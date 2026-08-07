// Minimal boot driver: page loads, WebGL works, title screen appears.
export async function run(page, h) {
  const gl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const ctx = c.getContext('webgl2') || c.getContext('webgl');
    return ctx ? ctx.getParameter(ctx.RENDERER ?? 0x1F01) || 'yes' : null;
  });
  console.log('WEBGL:', gl ? String(gl).slice(0, 120) : 'UNAVAILABLE');
  await h.sleep(4000);
  await h.shot('boot');
  await h.sleep(3000);
  await h.shot('title');
}
