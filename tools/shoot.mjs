// Headless test harness: serves the repo, drives the game in Chromium, captures
// console output + screenshots. Usage:
//   node tools/shoot.mjs <driverFile> [outDir]
// Driver file: ES module exporting `export async function run(page, h) {}` with
// helpers h = { shot(name), sleep(ms), press(key, {times, delay}), hold(key, ms), errors() }.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const driverPath = resolve(process.argv[2] ?? 'tools/drivers/boot.mjs');
const OUT = resolve(process.argv[3] ?? 'test-output');
mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const file = join(ROOT, p);
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end('nf'); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage', '--no-sandbox'],
});
// BEAUTY=1: full-size, high quality (for visual QA screenshots).
// Default: small viewport + low quality so software rendering keeps a usable framerate.
// QA_VIEWPORT=WxH overrides both modes (used to reproduce a player's window shape).
const BEAUTY = process.env.QA_BEAUTY === '1';
const vpEnv = /^(\d+)x(\d+)$/.exec(process.env.QA_VIEWPORT ?? '');
const viewport = vpEnv
  ? { width: +vpEnv[1], height: +vpEnv[2] }
  : BEAUTY ? { width: 1600, height: 900 } : { width: 960, height: 540 };
const page = await browser.newPage({ viewport });
if (!BEAUTY) {
  await page.addInitScript(() => {
    localStorage.setItem('lumenfall_settings', JSON.stringify({
      musicVol: 0, sfxVol: 0, quality: 'low', textSpeed: 'fast', camShake: true, invertY: false, showDamageNumbers: true,
    }));
  });
}

const consoleLog = [];
page.on('console', (msg) => {
  const t = msg.type();
  const text = msg.text();
  consoleLog.push(`[${t}] ${text}`);
  if (t === 'error' || t === 'warning') console.log(`PAGE ${t.toUpperCase()}: ${text.slice(0, 500)}`);
});
page.on('pageerror', (err) => {
  consoleLog.push(`[pageerror] ${err.message}`);
  console.log(`PAGE EXCEPTION: ${String(err.stack || err.message).slice(0, 800)}`);
});

let shotN = 0;
const h = {
  page,
  shot: async (name) => {
    const f = join(OUT, `${String(++shotN).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: f });
    console.log(`SHOT ${f}`);
  },
  sleep: (ms) => page.waitForTimeout(ms),
  press: async (key, { times = 1, delay = 120 } = {}) => {
    for (let i = 0; i < times; i++) { await page.keyboard.press(key); await page.waitForTimeout(delay); }
  },
  hold: async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); },
  errors: () => consoleLog.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]')),
  // Poll an in-page condition (fn source string evaluated in page) until truthy.
  waitFor: async (fnSrc, timeoutMs = 30000, pollMs = 400) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const v = await page.evaluate(fnSrc);
      if (v) return v;
      await page.waitForTimeout(pollMs);
    }
    return null;
  },
};

try {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const { run } = await import(driverPath);
  await run(page, h);
} catch (e) {
  console.log('DRIVER FAILED:', e.message);
  try { await h.shot('driver-failure'); } catch {}
} finally {
  const errs = h.errors();
  console.log(`\n=== ${errs.length} page error(s) ===`);
  for (const e of errs.slice(0, 40)) console.log(e.slice(0, 600));
  await browser.close();
  server.close();
}
