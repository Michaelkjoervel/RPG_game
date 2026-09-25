// ============================================================================
// gfx/postfx.js — the world's screen-space finish, tiered by settings.quality:
//
//   'high' : scene -> soft BLOOM (half resolution) -> grade -> output
//   'med'  : scene -> grade -> output                (no bloom)
//   'low'  : plain renderer.render()                 (zero overhead)
//
// The grade pass is one fullscreen shader: gentle pivot contrast + saturation
// lift, warm-highlight/cool-shadow split tone, and a soft vignette.
//
//   applyAtmosphere(renderer, scene, camera) -> {
//     render(), setCamera(camera), setEnabled(bool), dispose()
//   }
//
// Built on the vendored EffectComposer/RenderPass/UnrealBloomPass/ShaderPass/
// OutputPass so tone mapping + color space still resolve exactly as a direct
// `renderer.render()` would (OutputPass applies renderer.toneMapping /
// outputColorSpace on the way to screen). Bloom and grade therefore run in
// LINEAR, pre-tonemap HDR space:
//   - BLOOM keys on linear luminance. A fully sunlit white surface peaks
//     around ~1.0 (sun 3.0 × albedo/π + sky fill), so the threshold sits just
//     above that: only emissive/glow content blooms — crystals, lanterns,
//     windows at night, creature element glows, shards, unlit glow meshes
//     brighter than ~1.1. To make something bloom, give it emissive ≳ 1.2 on a
//     bright color (or an unlit color pushed above 1). BLOOM_* below.
//   - The grade constants are tuned for that space (pivot 0.18 linear gray,
//     small additive tints that ACES then rolls off).
// The scene target is multisampled (MSAA) so edges — and the creature/human
// ink outlines — stay clean in postfx mode (the canvas's own antialias does
// not apply to offscreen targets).
// If the composer ever fails to build or to render (odd GPU/driver), it
// permanently falls back to plain rendering rather than risk the game loop.
// World.render(renderer, dt) is the main caller — call `render()` once per
// frame instead of `renderer.render(scene, camera)`. Any other scene (battle,
// previews) can use the same chain via its own applyAtmosphere() instance.
// ============================================================================
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';

let EffectComposer = null, RenderPass = null, ShaderPass = null, OutputPass = null, UnrealBloomPass = null;
let _addonsPromise = null;
function loadAddons() {
  if (_addonsPromise) return _addonsPromise;
  _addonsPromise = Promise.all([
    import('three/addons/postprocessing/EffectComposer.js'),
    import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/ShaderPass.js'),
    import('three/addons/postprocessing/OutputPass.js'),
    // Bloom is optional: if it fails to load, the grade chain still works.
    import('three/addons/postprocessing/UnrealBloomPass.js').catch((e) => {
      console.warn('[postfx] bloom unavailable — grade only', e?.message ?? e);
      return null;
    }),
  ]).then(([a, b, c, d, e]) => {
    EffectComposer = a.EffectComposer; RenderPass = b.RenderPass;
    ShaderPass = c.ShaderPass; OutputPass = d.OutputPass;
    UnrealBloomPass = e?.UnrealBloomPass ?? null;
  }).catch((e) => {
    console.warn('[postfx] postprocessing addons unavailable — plain render only', e?.message ?? e);
  });
  return _addonsPromise;
}

// Bloom tuning (linear HDR luminance; see header).
const BLOOM_THRESHOLD = 1.08;  // just above the brightest sunlit diffuse
const BLOOM_KNEE = 0.3;        // soft ramp above the threshold (highpass smoothWidth)
const BLOOM_STRENGTH = 0.55;
const BLOOM_RADIUS = 0.42;
const MSAA_SAMPLES = { high: 4, med: 4 };

const ATMO_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.34 },  // corner falloff strength
    uSat: { value: 1.09 },       // saturation lift (1.13 pushed midground grass toward acid green)
    uContrast: { value: 1.06 },  // pivot contrast around linear mid-gray
    uWarm: { value: 0.014 },     // warm push into the lights
    uCool: { value: 0.012 },     // cool blue lift in the shadows
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette, uSat, uContrast, uWarm, uCool;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float g = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(g), c.rgb, uSat);                 // saturation lift
      c.rgb = max((c.rgb - 0.18) * uContrast + 0.18, 0.0); // gentle pivot contrast (linear space)
      // Split tone: warm the lights, cool the shadows — reinforces the
      // warm-key/cool-shadow lighting story in every zone.
      float lit = clamp(g * 2.4, 0.0, 1.0);
      c.rgb += vec3(uWarm, uWarm * 0.5, -uWarm * 0.55) * lit;
      c.rgb += vec3(-uCool * 0.55, -uCool * 0.1, uCool) * (1.0 - lit);
      c.rgb = max(c.rgb, 0.0);
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
  let composer = null, renderPass = null, atmoPass = null, bloomPass = null;
  let ready = false, broken = false;
  let enabled = settings.quality !== 'low';
  let curCam = camera || new THREE.PerspectiveCamera();
  let curPr = 1;

  function applyTier() {
    if (!composer) return;
    const tier = settings.quality;
    if (bloomPass) bloomPass.enabled = tier === 'high';
    // MSAA on the scene target; a changed sample count needs a re-allocation.
    const samples = MSAA_SAMPLES[tier] ?? 0;
    for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
      if (rt && rt.samples !== samples) { rt.samples = samples; rt.dispose(); }
    }
  }

  function resize() {
    const { w, h, pr } = screenSize();
    curPr = pr;
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
  }

  async function build() {
    if (broken || composer || !renderer) return;
    try {
      await loadAddons();
      if (!EffectComposer) { broken = true; return; }
      const { w, h, pr } = screenSize();
      const target = new THREE.WebGLRenderTarget(w * pr, h * pr, {
        type: THREE.HalfFloatType, samples: MSAA_SAMPLES[settings.quality] ?? 0,
      });
      composer = new EffectComposer(renderer, target);
      renderPass = new RenderPass(scene, curCam);
      composer.addPass(renderPass);
      if (UnrealBloomPass) {
        try {
          bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);
          bloomPass.highPassUniforms.smoothWidth.value = BLOOM_KNEE;
          // HALF resolution of the CSS canvas regardless of devicePixelRatio:
          // UnrealBloomPass halves whatever size it is given, so feed it the
          // CSS size (the composer passes device pixels).
          const setBloomSize = bloomPass.setSize.bind(bloomPass);
          bloomPass.setSize = (dw, dh) => setBloomSize(Math.max(2, Math.round(dw / curPr)), Math.max(2, Math.round(dh / curPr)));
          composer.addPass(bloomPass);
        } catch (e) {
          console.warn('[postfx] bloom pass failed to build — grade only', e?.message ?? e);
          bloomPass = null;
        }
      }
      atmoPass = new ShaderPass(ATMO_SHADER);
      composer.addPass(atmoPass);
      composer.addPass(new OutputPass());
      resize();
      applyTier();
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
    try { resize(); } catch (e) { /* ignore — next frame falls back if this got wedged */ }
  });
  const offSettings = bus.on('settings:changed', ({ key } = {}) => {
    if (key !== 'quality') return;
    enabled = settings.quality !== 'low';
    if (enabled && !composer && !broken) build();
    else if (composer) {
      try { applyTier(); resize(); } catch (e) { /* ignore */ }
    }
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
      try { bloomPass?.dispose?.(); } catch (e) { /* ignore */ }
      try { composer?.dispose?.(); } catch (e) { /* ignore */ }
      composer = null; ready = false;
    },
  };
}
