// Visual polish check: title screen (two moments of the orbiting camera).
export async function run(page, h) {
  await h.sleep(6500);
  await h.shot('title');
  await h.sleep(9000);
  await h.shot('title-later');
}
