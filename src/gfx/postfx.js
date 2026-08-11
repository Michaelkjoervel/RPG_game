// ============================================================================
// gfx/postfx.js — a single, lightweight screen-space atmosphere pass: subtle
// vignette + a small saturation/warmth lift on top of the normal render.
//
//   applyAtmosphere(renderer, scene, camera) -> {
//     render(), setCamera(camera), setEnabled(bool), dispose()
//   }
//
// Built on the vendored EffectComposer/RenderPass/ShaderPass/OutputPass so
// tone mapping + color space still resolve exactly as a direct
// `renderer.render()` would (OutputPass applies renderer.toneMapping /
// outputColorSpace on the way to screen). Disabled entirely on
// settings.quality 'low' (falls back to a plain render — zero overhead), and
// if the composer ever fails to build or to render (odd GPU/driver), it
// permanently falls back to plain rendering rather than risk the game loop.
// World.render(renderer, dt) is the only caller — call `render()` once per
// frame instead of `renderer.render(scene, camera)`.
// ============================================================================
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';

let EffectComposer = null, RenderPass = null, ShaderPass = null, OutputPass = null;
let _addonsPromise = null;
function loadAddons() {
  if (_addonsPromise) return _addonsPromise;
  _addonsPromise = Promise.all([
    import('three/addons/postprocessing/EffectComposer.js'),
    import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/ShaderPass.js'),
    import('three/addons/postprocessing/OutputPass.js'),
  ]).then(([a, b, c, d]) => {
    EffectComposer = a.EffectComposer; RenderPass = b.RenderPass;
    ShaderPass = c.ShaderPass; OutputPass = d.OutputPass;
  }).catch((e) => {
    console.warn('[postfx] postprocessing addons unavailable — plain render only', e?.message ?? e);
  });
  return _addonsPromise;
}

const ATMO_SHADER = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.32 }, uSat: { value: 1.05 }, uWarm: { value: 0.012 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette, uSat, uWarm;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float g = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(g), c.rgb, uSat);              // gentle saturation lift
      c.rgb += vec3(uWarm, uWarm * 0.55, -uWarm * 0.5); // faint warm bias
      vec2 uv = vUv - 0.5;
      float vig = 1.0 - dot(uv, uv) * uVignette;
      c.rgb *= clamp(vig, 0.0, 1.0);
      gl_FragColor = c;
    }
  `,
};

function screenSize() {
  const hasDOM = typeof window !== 'undefined';
  const w = hasDOM ? window.innerWidth : 1280;
  const h = hasDOM ? window.innerHeight : 720;
  const pr = Math.min((hasDOM ? window.devicePixelRatio : 1) || 1, settings.quality === 'low' ? 1 : 2);
  return { w, h, pr };
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera|null} camera  may be null at construction; call setCamera() once known
 */
export function applyAtmosphere(renderer, scene, camera) {
  let composer = null, renderPass = null, atmoPass = null;
  let ready = false, broken = false;
  let enabled = settings.quality !== 'low';
  let curCam = camera || new THREE.PerspectiveCamera();

  async function build() {
    if (broken || composer || !renderer) return;
    try {
      await loadAddons();
      if (!EffectComposer) { broken = true; return; }
      composer = new EffectComposer(renderer);
      renderPass = new RenderPass(scene, curCam);
      composer.addPass(renderPass);
      atmoPass = new ShaderPass(ATMO_SHADER);
      composer.addPass(atmoPass);
      composer.addPass(new OutputPass());
      const { w, h, pr } = screenSize();
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      ready = true;
    } catch (e) {
      console.warn('[postfx] composer build failed — falling back to plain render', e?.message ?? e);
      broken = true;
      composer = null;
    }
  }
  build();

  const offResize = bus.on('render:resize', () => {
    if (!composer) return;
    try {
      const { w, h, pr } = screenSize();
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
    } catch (e) { /* ignore — next frame falls back if this got wedged */ }
  });
  const offSettings = bus.on('settings:changed', ({ key } = {}) => {
    if (key !== 'quality') return;
    enabled = settings.quality !== 'low';
    if (enabled && !composer && !broken) build();
  });

  return {
    setCamera(cam) {
      if (!cam || cam === curCam) return;
      curCam = cam;
      if (renderPass) renderPass.camera = cam;
    },
    render() {
      if (enabled && ready && composer && !broken) {
        try { composer.render(); return; }
        catch (e) {
          console.warn('[postfx] render failed — disabling atmosphere pass for this session', e?.message ?? e);
          broken = true;
        }
      }
      renderer.render(scene, curCam);
    },
    setEnabled(v) { enabled = !!v && settings.quality !== 'low'; },
    dispose() {
      offResize?.();
      offSettings?.();
      try { composer?.dispose?.(); } catch (e) { /* ignore */ }
      composer = null; ready = false;
    },
  };
}
