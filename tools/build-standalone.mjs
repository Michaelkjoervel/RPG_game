// Builds a single self-contained playable HTML file (no network, no modules on
// disk) from the game sources — used to publish a shareable build.
//   node tools/build-standalone.mjs [outFile] [--artifact]
// --artifact emits a fragment (no doctype/html/head/body) for hosts that supply
// their own document shell, plus a first-click controls hint.
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const OUT = resolve(process.argv[2] ?? 'dist/lumenfall.html');

// Map the browser import-map specifiers ("three", "three/addons/…") onto the
// vendored files, since a bundle has no import map.
const threePlugin = {
  name: 'three-specifiers',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: resolve(ROOT, 'vendor/three.module.js') }));
    b.onResolve({ filter: /^three\/addons\// }, (args) => ({
      path: resolve(ROOT, 'vendor/addons', args.path.replace('three/addons/', '')),
    }));
  },
};

const result = await build({
  entryPoints: [resolve(ROOT, 'src/main.js')],
  bundle: true, format: 'esm', minify: true, write: false,
  plugins: [threePlugin], logLevel: 'warning',
});
const js = result.outputFiles[0].text;

const cssFiles = ['base', 'ui', 'battle', 'menus', 'title'];
const css = (await Promise.all(
  cssFiles.map((n) => readFile(resolve(ROOT, `styles/${n}.css`), 'utf8')),
)).join('\n');

const ARTIFACT = process.argv.includes('--artifact');

// Shown until the player's first click/keypress: an embedded page needs focus
// before it receives keys, and WebAudio needs a gesture before it can sound.
const HINT_CSS = `
#lf-hint {
  position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%); z-index: 60;
  display: flex; align-items: center; gap: 14px; padding: 9px 20px;
  background: rgba(24,26,38,.92); border: 1px solid rgba(255,233,176,.18);
  border-radius: 999px; box-shadow: 0 8px 32px rgba(0,0,0,.45);
  font-family: 'Segoe UI', system-ui, sans-serif; font-size: 12.5px; color: #b9b2a3;
  letter-spacing: .04em; transition: opacity 500ms ease; pointer-events: none;
}
#lf-hint b { color: #ffe9b0; font-weight: 600; }
#lf-hint.gone { opacity: 0; }
@media (prefers-reduced-motion: reduce) { #lf-hint { transition: none; } }`;

const HINT_HTML = `<div id="lf-hint">
  <span><b>Click</b> to focus</span><span><b>WASD</b> move</span><span><b>Shift</b> run</span>
  <span><b>E</b> interact</span><span><b>Esc</b> menu</span>
</div>`;
const HINT_JS = `
  (() => {
    const h = document.getElementById('lf-hint');
    if (!h) return;
    const go = () => { h.classList.add('gone'); setTimeout(() => h.remove(), 700); };
    addEventListener('pointerdown', go, { once: true });
    addEventListener('keydown', go, { once: true });
    setTimeout(go, 14000);
  })();`;

const BODY = `<canvas id="game-canvas"></canvas>
<div id="ui-root"></div>
<div id="boot-screen">
  <div class="boot-star">&#10022;</div>
  <div class="boot-title">LUMENFALL</div>
  <div class="boot-sub">the world is dreaming&hellip;</div>
</div>
${ARTIFACT ? HINT_HTML : ''}
<script type="module">
${js}
${ARTIFACT ? HINT_JS : ''}
</script>`;

const html = ARTIFACT
  ? `<title>Lumenfall</title>\n<style>${css}${HINT_CSS}</style>\n${BODY}\n`
  : `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Lumenfall</title>
<style>${css}</style>
</head>
<body>
${BODY}
</body>
</html>
`;
await writeFile(OUT, html, 'utf8');
console.log(`wrote ${OUT} — ${(html.length / 1024 / 1024).toFixed(2)} MB`);
