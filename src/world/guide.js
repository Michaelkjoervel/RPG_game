// =============================================================================
// world/guide.js — the quest guide ("where do I go?").
//
// Press H (gamepad Y, or the button in the quest tracker): a trail of warm
// lights runs along the walking route from the Warden to the tracked quest's
// goal, and a pillar of light stands over the goal itself. A goal in another
// zone routes through the portal chain, so the trail leads to the right exit
// first. The route prefers roads (path cells are cheaper), steps around
// props, NPCs and deep water, and re-plans when the player strays. It retargets
// on its own as quest steps change and stays on across zones until toggled off.
//
//   createGuide(world) -> { onZone(), update(dt), dispose() }
//   bus in : 'guide:toggle'   (HUD button)        input action 'hint'
//   bus out: 'guide:state' {active}               'notify' toasts
// Quest data: steps carry `goal` ({zone, npc?|at?} or fn(G)) and `hint` text
// (src/data/quests.js).
// =============================================================================
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { G, setFlag } from '../core/state.js';
import { input } from '../core/input.js';
import { QUESTS } from '../data/quests.js';
import { ZONES } from '../data/worldmap.js';
import { NPCS } from '../data/npcs.js';

const CELL = 1;            // nav grid resolution, metres
const ON_PATH = 1, OFF_PATH = 2.2; // the route hugs roads like a person would
const ORB_SPACING = 2.2;   // metres between trail lights
const MAX_ORBS = 46;       // ~100 m of trail ahead
const ARRIVE_R = 4.5;     // "they're right here" — a step or two short of talk range
const REPLAN_DIST = 5;     // strayed this far from the trail -> plan again
const GOLD = 0xffdf96;

// ----------------------------------------------------------------- quest pick
// Same rule as the HUD tracker: the earliest active main quest, otherwise the
// newest active side quest.
function trackedQuest() {
  let main = null, side = null;
  for (const [id, st] of Object.entries(G.quests || {})) {
    if (!st || st.done || !QUESTS[id]) continue;
    if (QUESTS[id].main) { if (!main) main = id; } else side = id;
  }
  return main ?? side;
}

function currentGoal() {
  const id = trackedQuest();
  if (!id) return null;
  const q = QUESTS[id];
  const step = q.steps[Math.min(G.quests[id]?.step ?? 0, q.steps.length - 1)];
  if (!step) return null;
  const goal = typeof step.goal === 'function' ? step.goal(G) : step.goal;
  const hint = typeof step.hint === 'function' ? step.hint(G) : step.hint;
  return { questId: id, goal: goal ?? null, hint: hint || step.text || q.name };
}

// ----------------------------------------------------------------- zone route
// Breadth-first over portals (respecting flag-locked ones); returns the first
// portal to take from `from` toward `to`, or null.
function firstPortalToward(from, to) {
  if (from === to) return null;
  const prev = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const z = queue.shift();
    for (const p of ZONES[z]?.portals ?? []) {
      if (p.flag && !G.flags[p.flag]) continue;
      if (prev.has(p.to)) continue;
      prev.set(p.to, { zone: z, portal: p });
      if (p.to === to) {
        // walk back to the first hop
        let cur = to, hop = prev.get(cur);
        while (hop && hop.zone !== from) { cur = hop.zone; hop = prev.get(cur); }
        return hop?.portal ?? null;
      }
      queue.push(p.to);
    }
  }
  return null;
}

const zoneName = (id) => ZONES[id]?.name ?? id;
const npcName = (id) => NPCS[id]?.name ?? 'them';

// ------------------------------------------------------------------- nav grid
export function buildNav(world) {
  const zone = world.zone;
  const half = (zone.size ?? 200) / 2 - 1;
  const n = Math.floor((half * 2) / CELL) + 1;
  const blocked = new Uint8Array(n * n);
  const cost = new Float32Array(n * n).fill(OFF_PATH);
  const toI = (v) => Math.max(0, Math.min(n - 1, Math.round((v + half) / CELL)));
  const toW = (i) => i * CELL - half;

  const w = zone.water;
  if (w) {
    const wx = w.pos?.[0] ?? 0, wz = w.pos?.[1] ?? 0, wh = (w.size ?? 0) / 2, lvl = w.level ?? 0;
    for (let j = toI(wz - wh); j <= toI(wz + wh); j++) {
      for (let i = toI(wx - wh); i <= toI(wx + wh); i++) {
        if (lvl - world.heightAt(toW(i), toW(j)) > 0.5) blocked[j * n + i] = 1;
      }
    }
  }
  for (const c of world.colliders ?? []) {
    const r = (c.r ?? 0) + 0.45;
    for (let j = toI(c.z - r); j <= toI(c.z + r); j++) {
      for (let i = toI(c.x - r); i <= toI(c.x + r); i++) {
        const dx = toW(i) - c.x, dz = toW(j) - c.z;
        if (dx * dx + dz * dz <= r * r) blocked[j * n + i] = 1;
      }
    }
  }
  for (const p of zone.paths ?? []) {
    const [ax, az] = p.from, [bx, bz] = p.to, hw = (p.width ?? 3) / 2 + 0.75;
    const vx = bx - ax, vz = bz - az, len2 = vx * vx + vz * vz || 1;
    for (let j = toI(Math.min(az, bz) - hw); j <= toI(Math.max(az, bz) + hw); j++) {
      for (let i = toI(Math.min(ax, bx) - hw); i <= toI(Math.max(ax, bx) + hw); i++) {
        const x = toW(i), z = toW(j);
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2));
        const dx = x - (ax + vx * t), dz = z - (az + vz * t);
        if (dx * dx + dz * dz <= hw * hw) cost[j * n + i] = ON_PATH;
      }
    }
  }
  return { n, half, blocked, cost, toI, toW };
}

function nearestOpen(nav, idx, maxR = 8) {
  const { n, blocked } = nav;
  if (!blocked[idx]) return idx;
  const ci = idx % n, cj = (idx / n) | 0;
  for (let r = 1; r <= maxR; r++) {
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      if (!blocked[j * n + i]) return j * n + i;
    }
  }
  return -1;
}

// A* over the grid, 8-connected, no corner cutting. Returns world points.
export function findPath(nav, sx, sz, gx, gz) {
  const { n, blocked, cost, toI, toW } = nav;
  const start = nearestOpen(nav, toI(sz) * n + toI(sx));
  const goal = nearestOpen(nav, toI(gz) * n + toI(gx));
  if (start < 0 || goal < 0) return null;
  const N = n * n;
  const g = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const gi = goal % n, gj = (goal / n) | 0;
  const h = (idx) => {
    const dx = Math.abs((idx % n) - gi), dz = Math.abs(((idx / n) | 0) - gj);
    return (Math.max(dx, dz) + 0.4142 * Math.min(dx, dz)) * ON_PATH;
  };
  // binary heap of [f, idx]
  let hf = new Float64Array(1024), hi = new Int32Array(1024), hs = 0;
  const push = (f, idx) => {
    if (hs === hf.length) { const nf = new Float64Array(hs * 2); nf.set(hf); hf = nf; const ni = new Int32Array(hs * 2); ni.set(hi); hi = ni; }
    let k = hs++;
    while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= f) break; hf[k] = hf[p]; hi[k] = hi[p]; k = p; }
    hf[k] = f; hi[k] = idx;
  };
  const pop = () => {
    const top = hi[0], lf = hf[--hs], li = hi[hs];
    let k = 0;
    for (;;) {
      let c = 2 * k + 1; if (c >= hs) break;
      if (c + 1 < hs && hf[c + 1] < hf[c]) c++;
      if (hf[c] >= lf) break;
      hf[k] = hf[c]; hi[k] = hi[c]; k = c;
    }
    hf[k] = lf; hi[k] = li;
    return top;
  };
  g[start] = 0; push(h(start), start);
  const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];
  let found = false;
  while (hs > 0) {
    const cur = pop();
    if (closed[cur]) continue;
    if (cur === goal) { found = true; break; }
    closed[cur] = 1;
    const ci = cur % n, cj = (cur / n) | 0;
    for (let d = 0; d < 8; d++) {
      const i = ci + DI[d], j = cj + DJ[d];
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const nb = j * n + i;
      if (blocked[nb] || closed[nb]) continue;
      if (d >= 4 && (blocked[cj * n + i] || blocked[j * n + ci])) continue; // no corner cutting
      const step = (d >= 4 ? 1.4142 : 1) * 0.5 * (cost[cur] + cost[nb]);
      const ng = g[cur] + step;
      if (ng < g[nb]) { g[nb] = ng; came[nb] = cur; push(ng + h(nb), nb); }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let c = goal; c !== -1; c = came[c]) cells.push(c);
  cells.reverse();
  // light smoothing so diagonal staircases read as a curve
  const pts = cells.map((c) => [toW(c % n), toW((c / n) | 0)]);
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 1; k < pts.length - 1; k++) {
      pts[k] = [(pts[k - 1][0] + pts[k][0] * 2 + pts[k + 1][0]) / 4, (pts[k - 1][1] + pts[k][1] * 2 + pts[k + 1][1]) / 4];
    }
  }
  return pts;
}

// resample a polyline every `step` metres
function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let k = 1; k < pts.length; k++) {
    const [ax, az] = pts[k - 1], [bx, bz] = pts[k];
    const seg = Math.hypot(bx - ax, bz - az);
    let d = step - carry;
    while (d <= seg) { const t = d / seg; out.push([ax + (bx - ax) * t, az + (bz - az) * t]); d += step; }
    carry = seg - (d - step);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ------------------------------------------------------------------- visuals
// The trail: soft camera-facing motes — a bright core in a wide faint halo,
// fireflies leading the way rather than beads on a string.
function moteMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uColor: { value: new THREE.Color(GOLD) }, uScale: { value: 500 } },
    vertexShader: `attribute float aSize; attribute float aAlpha; uniform float uScale; varying float vAlpha;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vAlpha = aAlpha * smoothstep(95.0, 45.0, -mv.z); // melt into the distance like the fog
        gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), 0.0, 110.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uColor; varying float vAlpha;
      void main(){
        float r = length(gl_PointCoord - 0.5) * 2.0;
        if (r > 1.0) discard;
        float core = smoothstep(0.3, 0.0, r);
        float halo = pow(1.0 - r, 2.6) * 0.5;
        gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.97, 0.88), core) * (core * 1.5 + halo), vAlpha);
      }`,
  });
}

function beaconMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uColor: { value: new THREE.Color(GOLD) }, uT: { value: 0 }, uFade: { value: 1 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform vec3 uColor; uniform float uT; uniform float uFade;
      void main(){
        float up = pow(1.0 - vUv.y, 1.7);
        float band = 0.75 + 0.25 * sin(vUv.y * 22.0 - uT * 3.0);
        float soft = pow(abs(dot(vN, vV)), 1.6); // silhouette edges melt away: a shaft, not a tube
        gl_FragColor = vec4(uColor * 1.6, up * band * soft * 0.5 * uFade);
      }`,
  });
}

export function createGuide(world) {
  const scene = world.scene;
  const group = new THREE.Group();
  group.name = 'questGuide';
  group.visible = false;
  scene.add(group);

  const moteGeo = new THREE.BufferGeometry();
  const mPos = new Float32Array(MAX_ORBS * 3), mSize = new Float32Array(MAX_ORBS), mAlpha = new Float32Array(MAX_ORBS);
  moteGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3).setUsage(THREE.DynamicDrawUsage));
  moteGeo.setAttribute('aSize', new THREE.BufferAttribute(mSize, 1).setUsage(THREE.DynamicDrawUsage));
  moteGeo.setAttribute('aAlpha', new THREE.BufferAttribute(mAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  moteGeo.setDrawRange(0, 0);
  const moteMat = moteMaterial();
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false; motes.renderOrder = 5;
  group.add(motes);

  const beaconGeo = new THREE.CylinderGeometry(0.5, 0.95, 18, 24, 1, true);
  beaconGeo.translate(0, 9, 0);
  const bMat = beaconMaterial();
  const beacon = new THREE.Mesh(beaconGeo, bMat);
  beacon.frustumCulled = false; beacon.renderOrder = 4;
  const ringGeo = new THREE.RingGeometry(0.85, 1.25, 40);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.renderOrder = 4;
  const beaconGroup = new THREE.Group();
  beaconGroup.name = 'guideBeacon';
  beaconGroup.add(beacon, ring);
  group.add(beaconGroup);

  const _buf = new THREE.Vector2();

  let active = false;
  let nav = null;
  let target = null;      // { x, z, kind: 'npc'|'at'|'portal'|'none', label, npc? }
  let goalKey = '';
  let trail = [];         // [[x, y, z], ...] resampled, nearest-first
  let lastPlan = -1e9, clock = 0, checkT = 0, arrivedSaid = false;
  let lit = 0;            // motes drawn this frame

  function setActive(v) {
    active = v;
    group.visible = v;
    if (!v) { trail = []; lit = 0; moteGeo.setDrawRange(0, 0); }
    bus.emit('guide:state', { active: v });
  }

  function resolveTarget(info) {
    const goal = info?.goal;
    if (!goal || !world.zone) return null;
    const here = world.zone.id;
    if (goal.zone && goal.zone !== here) {
      const portal = firstPortalToward(here, goal.zone);
      if (!portal) return { kind: 'none' };
      return { kind: 'portal', x: portal.at[0], z: portal.at[1], to: portal.to, final: goal.zone };
    }
    if (goal.npc) {
      const live = world.npcs?.positionOf?.(goal.npc);
      const home = (world.zone.npcs ?? []).find((p) => p.id === goal.npc)?.at;
      const pos = live ?? (home ? { x: home[0], z: home[1] } : null);
      if (pos) return { kind: 'npc', x: pos.x, z: pos.z, npc: goal.npc };
    }
    if (goal.at) return { kind: 'at', x: goal.at[0], z: goal.at[1] };
    return { kind: 'here' }; // the goal is this zone itself — its story beat plays on arrival
  }

  function keyOf(info, t) {
    return `${info?.questId}|${JSON.stringify(info?.goal)}|${t?.kind}|${t?.to ?? ''}|${t?.npc ?? ''}`;
  }

  function plan() {
    trail = [];
    lastPlan = clock;
    const p = world.player?.pos;
    if (!p || !target || target.x == null) return;
    if (!nav) nav = buildNav(world);
    const pts = findPath(nav, p.x, p.z, target.x, target.z);
    if (!pts || pts.length < 2) return;
    trail = resample(pts, ORB_SPACING).map(([x, z]) => [x, world.heightAt(x, z) + 0.62, z]);
    beaconGroup.position.set(target.x, world.heightAt(target.x, target.z) + 0.02, target.z);
  }

  function announce(info) {
    if (!info) { bus.emit('notify', { text: 'No quest to guide you to right now.', icon: '✦', duration: 4000 }); return; }
    let text = info.hint;
    if (target?.kind === 'portal') {
      const via = target.to === target.final ? '' : ` (through ${zoneName(target.to)})`;
      text = `${info.hint} Follow the lights to the road toward ${zoneName(target.to)}${via}.`;
    } else if (target?.kind === 'npc') {
      text = `${info.hint} Follow the lights to ${npcName(target.npc)}.`;
    } else if (target?.kind === 'none') {
      text = `${info.hint} (That way is still closed — keep following the main quest.)`;
    }
    bus.emit('notify', { text, icon: '✦', duration: 8000 });
  }

  function retarget(say) {
    const info = currentGoal();
    target = resolveTarget(info);
    goalKey = keyOf(info, target);
    arrivedSaid = false;
    plan();
    if (say) announce(info);
    return info;
  }

  function toggle() {
    if (active) {
      setActive(false);
      bus.emit('notify', { text: 'Guide hidden — press H to show it again.', icon: '✦', duration: 2500 });
      return;
    }
    setActive(true);
    const info = retarget(true);
    if (!info) setActive(false);
  }

  function canToggle() {
    return world.game?.mode === 'overworld' && !world.game?._paused && !!world.player
      && !world._transferring && !world.player.isFrozen?.();
  }
  const offAction = input.onAction?.('hint', () => { if (canToggle()) toggle(); });
  const offBus = bus.on('guide:toggle', () => { if (canToggle()) toggle(); });

  function onZone() {
    nav = null; // the grid is per zone
    if (active) retarget(false);
    // One gentle pointer to the guide early in a new journey.
    if (!G.flags.guide_tip_shown && trackedQuest()) {
      setTimeout(() => {
        if (G.flags.guide_tip_shown || world.game?.mode !== 'overworld') return;
        setFlag('guide_tip_shown');
        bus.emit('notify', { text: 'Not sure where to go? Press H — a trail of lights shows the way to your quest.', icon: '✦', duration: 8000 });
      }, 6000);
    }
  }

  function update(dt) {
    clock += dt;
    if (!active) return;
    const p = world.player?.pos;
    if (!p) return;

    checkT += dt;
    if (checkT > 0.5) {
      checkT = 0;
      // quest moved on, an item changed the goal, an NPC wandered off: retarget
      const info = currentGoal();
      if (!info) { setActive(false); return; }
      const t = resolveTarget(info);
      if (keyOf(info, t) !== goalKey) { target = t; goalKey = keyOf(info, t); arrivedSaid = false; plan(); }
      else if (t?.kind === 'npc' && target && Math.hypot(t.x - target.x, t.z - target.z) > 2.5) { target = t; plan(); }
      // trim lights already passed; re-plan if the player strayed
      if (trail.length) {
        let best = 0, bestD = Infinity;
        const look = Math.min(trail.length, 30);
        for (let k = 0; k < look; k++) {
          const d = (trail[k][0] - p.x) ** 2 + (trail[k][2] - p.z) ** 2;
          if (d < bestD) { bestD = d; best = k; }
        }
        if (best > 0) trail.splice(0, best);
        if (Math.sqrt(bestD) > REPLAN_DIST && clock - lastPlan > 1.2) plan();
      } else if (target?.x != null && clock - lastPlan > 2) plan();
      // arrival
      if (target?.x != null && Math.hypot(p.x - target.x, p.z - target.z) < ARRIVE_R && !arrivedSaid) {
        arrivedSaid = true;
        if (target.kind === 'npc') bus.emit('notify', { text: `${npcName(target.npc)} is right here — press E to talk.`, icon: '✦', duration: 5000 });
      }
    }

    // animate the trail: motes bob, a pulse runs toward the goal, the ones
    // right at the Warden's feet stay out of the way
    const count = Math.min(trail.length, MAX_ORBS);
    for (let k = 0; k < count; k++) {
      const [x, y, z] = trail[k];
      const near = Math.hypot(x - p.x, z - p.z);
      const fadeIn = Math.min(1, Math.max(0, (near - 1.4) / 1.6));
      const fadeOut = k > count - 6 ? (count - k) / 6 : 1;
      const wave = Math.max(0, Math.cos(k * 0.55 - clock * 4.2)); // 0..1, travels goal-ward
      mPos[k * 3] = x;
      mPos[k * 3 + 1] = y + Math.sin(clock * 2.1 + k * 0.7) * 0.07;
      mPos[k * 3 + 2] = z;
      mSize[k] = 0.95 * (1 + 0.45 * wave) * Math.min(1, 0.4 + fadeIn);
      mAlpha[k] = fadeIn * fadeOut * (0.7 + 0.3 * wave);
    }
    lit = count;
    moteGeo.setDrawRange(0, count);
    for (const a of ['position', 'aSize', 'aAlpha']) moteGeo.attributes[a].needsUpdate = true;
    // world-size points: pixels per metre at unit distance for this camera + canvas
    const cam = world.camera, r = world.game?.renderer;
    if (cam && r) moteMat.uniforms.uScale.value = r.getDrawingBufferSize(_buf).y / (2 * Math.tan((cam.fov * Math.PI) / 360));

    const showBeacon = target?.x != null;
    beaconGroup.visible = showBeacon;
    if (showBeacon) {
      bMat.uniforms.uT.value = clock;
      // the pillar fades as you reach it so it never swallows the NPC
      const d = Math.hypot(p.x - target.x, p.z - target.z);
      bMat.uniforms.uFade.value = Math.min(1, Math.max(0.15, (d - 2) / 10));
      ring.scale.setScalar(1 + 0.12 * Math.sin(clock * 3));
      ringMat.opacity = 0.35 + 0.2 * Math.sin(clock * 3);
    }
  }

  function dispose() {
    offAction?.(); offBus?.();
    scene.remove(group);
    for (const o of [moteGeo, moteMat, beaconGeo, bMat, ringGeo, ringMat]) o.dispose?.();
  }

  return { onZone, update, dispose, toggle, get active() { return active; }, get lit() { return lit; } };
}
