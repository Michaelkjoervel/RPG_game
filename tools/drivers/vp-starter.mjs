// Visual polish check: title → new game → starter sanctum, screenshot all
// three focus states (center nixling, left kindlet, right thistlit).
export async function run(page, h) {
  await h.sleep(6500);                        // boot + title
  await h.press('Enter'); await h.sleep(1400); // New Journey
  await h.press('Enter'); await h.sleep(2500); // accept default name
  // Advance intro dialogue, but stop as soon as the starter UI appears so we
  // never accidentally confirm a starter.
  for (let i = 0; i < 10; i++) {
    const there = await page.evaluate(() => !!document.querySelector('.starter-root'));
    if (there) break;
    await h.press('Enter'); await h.sleep(700);
  }
  await h.sleep(3000);                        // scene build + camera settle
  await h.shot('starter-focus-nixling');
  await h.press('ArrowLeft'); await h.sleep(1400);
  await h.shot('starter-focus-kindlet');
  await h.press('ArrowLeft'); await h.sleep(1400);
  await h.shot('starter-focus-thistlit');
}
