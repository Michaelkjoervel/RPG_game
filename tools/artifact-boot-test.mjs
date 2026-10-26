// Boot the built single-file artifact (dist/lumenfall-artifact.html) the way
// the claude.ai artifact frame runs it: gamepad access throws (permissions
// policy) and browser storage throws (sandboxed frame). With FAKE_CLAUDE
// (default on) a fake `window.claude` grants `db` + `user`, so the page must
// report cloud saving; FAKE_CLAUDE=0 checks the no-runtime path (memory mode).
// Then New Journey → the intro must play with zero page errors.
//   node tools/artifact-boot-test.mjs [outDir]
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const OUT = resolve(process.argv[2] ?? join(ROOT, 'test-output', 'artifact-boot'));
mkdirSync(OUT, { recursive: true });
const FAKE = process.env.FAKE_CLAUDE !== '0';
const frag = readFileSync(join(ROOT, 'dist/lumenfall-artifact.html'), 'utf8');
const wrapped = join(OUT, 'artifact-wrapped.html');
writeFileSync(wrapped, `<!doctype html><html><head><meta charset="utf-8"></head><body>${frag}</body></html>`);

const CHROME = [process.env.PW_CHROME, '/opt/pw-browsers/chromium'].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath: CHROME,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.addInitScript((fake) => {
  Object.defineProperty(navigator, 'getGamepads', { value: () => { throw new DOMException('Access to the feature "gamepad" is disallowed by permissions policy.'); } });
  Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('The document is sandboxed and lacks the allow-same-origin flag.'); } });
  if (!fake) return;
  const mem = new Map();
  const ref = (p) => ({ id: p.split('/').pop(), path: p, async set(d) { mem.set(p, d); }, async delete() { mem.delete(p); } });
  const db = Object.freeze({
    collection: (c) => ({ path: c, doc: (id) => ref(c + '/' + id),
      async get() { const docs = [...mem].filter(([k]) => k.startsWith(c + '/')).map(([k, d]) => ({ id: k.slice(c.length + 1), exists: true, data: () => d })); return { docs, size: docs.length, empty: !docs.length }; } }),
    doc: ref,
  });
  const user = Object.freeze({ id: async () => 'u_boot', isOwner: async () => true, canEdit: async () => true, can: async () => true });
  window.claude = Object.freeze({ use: (n) => new Promise((r) => setTimeout(() => r(n === 'db' ? db : n === 'user' ? user : null), 60)) });
}, FAKE);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
await page.goto(`file://${wrapped}`);
const booted = await page.waitForFunction(() => !!window.LF && !document.querySelector('#boot-screen:not(.hidden)'), null, { timeout: 90000 }).then(() => true).catch(() => false);
console.log('BOOTED', booted, '| fake runtime', FAKE);
await page.waitForTimeout(2500);
console.log('SAVENOTE', await page.evaluate(() => document.querySelector('.title-savenote')?.textContent ?? '(none)'));
await page.screenshot({ path: join(OUT, 'title.png'), timeout: 120000 });
await page.keyboard.press('Enter'); // New Journey
await page.waitForTimeout(8000);
for (let i = 0; i < 6; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(1500); }
console.log('STATE', await page.evaluate(() => JSON.stringify({ mode: window.LF?.game?.mode, lastDrawMsAgo: Math.round(performance.now() - (window.LF?.game?._lastDrawAt ?? 0)) })));
await page.screenshot({ path: join(OUT, 'after-start.png'), timeout: 120000 });
console.log('ERRORS', errors.length ? errors.join(' | ') : 'none');
await browser.close();
