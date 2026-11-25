// @ts-nocheck  (ported from the Shopify theme; see the notes at the top)
/* =====================================================================
   MGY chain showcase  (3D scene + interaction; markup is in src/components/ChainShowcase.astro)
   - several pieces (chain.items in src/data/site.json) hang side by side in one scene
   - they drop in from above the screen together once the welcome gate opens, each caught on an invisible "thread" so it swings and settles
   - drag / swipe / arrow keys turn a piece; tap or click one (or its button, or its number key) to bring it forward and inspect it
   - picking another swaps them: the new one comes forward, the old one steps back and dims
   three.js comes from npm and is bundled by Astro/Vite (no CDN).
   ===================================================================== */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, MeshStandardMaterial, MeshBasicMaterial,
  PlaneGeometry, BoxGeometry, PMREMGenerator, Color, Box3, Vector3, BackSide, DoubleSide,
  ACESFilmicToneMapping, SRGBColorSpace
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const FOV = 30;
const MODEL_H = 3;            // every piece is scaled to this height in scene units
const GAP = 0.55;             // space between pieces at rest
const FILL = 0.5;    // was 0.62: piece size on desktop. Smaller = more space around it
const LOWER = 0.1;   // was 0.04: how far down the pieces sit. Bigger = more space under the heading
const DIM = 0.3;              // how dark a piece goes when another one is in front (1 = no change)
const STAGGER = 0.16;         // seconds between one piece starting to fall and the next
/* the metals: polished, lit by the studio below */
const METALS = { silver: { color: 0xf1f1f4, roughness: 0.17 }, gold: { color: 0xffc75c, roughness: 0.2 } };
const PHYS = {
  G: 28,                      // gravity while falling
  K: 230, C: 7.2,             // "thread" spring + damping when the chain is caught
  SW_K: 11.5, SW_C: 0.9,      // pendulum swing
  YK: 26, YC: 6.4             // yaw (turn) spring
};

/* a dark studio with soft light strips: what polished silver needs to look like silver */
function makeEnvironment(renderer) {
  const sc = new Scene();
  sc.add(new Mesh(new BoxGeometry(22, 16, 22), new MeshBasicMaterial({ color: 0x090909, side: BackSide })));
  const strip = (w, h, pos, intensity, tint) => {
    const m = new Mesh(new PlaneGeometry(w, h),
      new MeshBasicMaterial({ color: new Color(tint || 0xffffff).multiplyScalar(intensity), side: DoubleSide }));
    m.position.set(pos[0], pos[1], pos[2]); m.lookAt(0, 0, 0); sc.add(m);
  };
  strip(10, 3.4, [0, 6.6, 2], 16);              // overhead softbox
  strip(2.4, 10, [-7.5, 1, 3], 10, 0xfff1e2);   // left tall strip, warm
  strip(2.4, 10, [7.5, 0, 3], 10, 0xe3eeff);    // right tall strip, cool
  strip(6, 6, [0, 1, -9], 6);                   // back fill
  strip(11, 1.6, [0, -5.5, 4], 3.2);            // low bounce
  strip(1.3, 7, [-3.6, 0, 9], 7);               // slim fronts: give the faces a glint
  strip(1.3, 7, [3.6, 0, 9], 7);
  const pm = new PMREMGenerator(renderer);
  const rt = pm.fromScene(sc, 0.035);
  pm.dispose();
  return rt.texture;
}

function loadGLB(buffer) {
  return new Promise((res, rej) => {
    const l = new GLTFLoader();
    l.setMeshoptDecoder(MeshoptDecoder);
    l.parse(buffer, '', res, rej);
  });
}

async function getModelBuffer(url) {
  if (!url) throw new Error('No chain model URL');
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('Chain model not found: ' + url);
    return await r.arrayBuffer();
  } finally { clearTimeout(to); }
}

function init(root) {
  if (root.__chain) return;
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const stage = $('[data-chain-stage]'), canvas = $('[data-chain-canvas]');
  if (!stage || !canvas) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const autorotate = root.dataset.autorotate !== 'false' && !reduce;
  const frame = $('[data-chain-frame]');
  let cfg = []; try { cfg = JSON.parse(root.dataset.items || '[]'); } catch (_) {}
  const panels = $$('[data-chain-panel]');

  /* ---------- which piece is selected (-1: none). The page's buttons and panels follow it ---------- */
  let selected = -1, lastActive = 0, frameItem = -1;
  function applySelectionUI() {
    root.classList.toggle('is-selected', selected >= 0);
    if (selected >= 0) root.dataset.sel = String(selected); else delete root.dataset.sel;
    panels.forEach((pn) => {
      const on = Number(pn.dataset.chainPanel) === selected;
      pn.classList.toggle('on', on); pn.inert = !on; pn.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
    $$('[data-chain-pick]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.chainPick) === selected)));
  }
  applySelectionUI();

  /* ---------- renderer ---------- */
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { return fail(true); }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new Scene();
  scene.environment = makeEnvironment(renderer);
  scene.environmentIntensity = 1.5;
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);

  /* each piece:  rig (drop + position)  >  swing (pendulum about the clasp)  >  spin (user turn)  >  holder (scale)  >  model */
  const items = cfg.map((c, i) => {
    const rig = new Group(), swing = new Group(), spin = new Group(), holder = new Group();
    rig.add(swing); swing.add(spin); spin.add(holder); scene.add(rig);
    const m = METALS[c.metal] || METALS.silver;
    return {
      i, url: c.model, rig, swing, spin, holder, base: new Color(m.color),
      mat: new MeshStandardMaterial({ color: m.color, metalness: 1, roughness: m.roughness }),
      ready: false, failed: false, bbox: null, w: 1.6,
      phase: 'wait', wake: null, dropY: 0, vy: 0, swingA: 0, swingV: 0,
      yaw: 0, yawV: 0, userYaw: 0, pitch: 0, pitchV: 0, userPitch: 0,
      sel: 0, dim: 0, px: 0, py: 0, ps: 1, baseX: 0, placed: false,
    };
  });
  if (!items.length) return fail(true);
  const live = () => items.filter((it) => it.ready);
  let started = false, wantGo = false, visible = true;

  const S = { w: 1, h: 1, aspect: 1, hh: 2, vw: 4, mobile: false, yoff: 0 };

  /* ---------- state ---------- */
  let dropStart = 4;
  let t = 0, idle = 0, selAny = 0;
  let drag = null, dragVel = 0;

  function layout() {
    const r = stage.getBoundingClientRect();
    S.w = Math.max(1, Math.round(r.width)); S.h = Math.max(1, Math.round(r.height));
    S.aspect = S.w / S.h; S.mobile = S.aspect < 0.9;
    renderer.setSize(S.w, S.h, false);
    camera.aspect = S.aspect;
    const pieces = live(), n = Math.max(1, pieces.length);
    const total = (pieces.length ? pieces.reduce((a, it) => a + it.w, 0) : 1.8 * n) + GAP * (n - 1) * (S.mobile ? 0.7 : 1);
    const tn = Math.tan((FOV * Math.PI) / 360);
    const fill = S.mobile ? 0.58 : FILL;            // share of the stage height a piece occupies at rest
    const dH = (MODEL_H / fill / 2) / tn;
    const dW = (total * (S.mobile ? 1.12 : 1.3) / 2) / (tn * S.aspect);   // and enough width for all of them side by side
    const d = Math.max(dH, dW);
    camera.position.set(0, 0, d);
    camera.updateProjectionMatrix();
    S.hh = d * tn; S.vw = 2 * S.hh * S.aspect;
    S.yoff = -S.hh * (S.mobile ? 0.14 : LOWER);     // sit a little low so the heading has room above
    dropStart = S.hh + MODEL_H * 0.5 + 0.8;        // enough to clear the top edge completely
    // side by side, centred
    let x = -total / 2;
    pieces.forEach((it) => { it.baseX = x + it.w / 2; x += it.w + GAP * (S.mobile ? 0.7 : 1); });
    items.forEach((it) => {
      if (it.phase === 'wait') it.dropY = dropStart;
      const g = goal(it); it.px = g.x; it.py = g.y; it.ps = g.s; it.placed = true;
    });
  }

  /* where a piece wants to be: at rest (side by side), in front (selected), or stepped back (another is selected) */
  function goal(it) {
    if (selected < 0) return { x: it.baseX, y: S.yoff, s: 1 };
    if (it.i === selected) return S.mobile ? { x: 0, y: S.hh * 0.54, s: 0.6 } : { x: -S.vw * 0.17, y: S.yoff, s: 1.12 };
    const others = live().filter((o) => o.i !== selected), k = others.indexOf(it), m = others.length;
    if (S.mobile) {                                   // little ones either side of the chosen piece
      const s = 0.34, side = k % 2 === 0 ? -1 : 1;
      return { x: side * (S.vw / 2 - 0.3 - (it.w * s) / 2), y: S.hh * 0.54, s };
    }
    const s = 0.46;                                   // stacked down the left edge
    return { x: -S.vw / 2 + 0.35 + (it.w * s) / 2, y: S.yoff + ((m - 1) / 2 - k) * MODEL_H * s * 1.15, s };
  }

  /* ---------- models ---------- */
  Promise.all(items.map((it) =>
    getModelBuffer(it.url)
      .then(loadGLB)
      .then((gltf) => {
        const model = gltf.scene;
        model.traverse((o) => {
          if (!o.isMesh) return;
          if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
          o.material = it.mat;
        });
        const box = new Box3().setFromObject(model);          // model is not parented yet, so world == local
        const size = box.getSize(new Vector3());
        const sc = MODEL_H / size.y;
        model.position.set(-(box.min.x + box.max.x) / 2, -box.max.y, -(box.min.z + box.max.z) / 2);   // clasp (top centre) at the origin
        it.bbox = { min: box.min.clone().add(model.position), max: box.max.clone().add(model.position) };   // holder space (unscaled)
        it.w = size.x * sc;
        it.holder.scale.setScalar(sc);
        it.holder.add(model);
        it.holder.updateMatrixWorld(true);
        it.ready = true;
      })
      .catch((err) => {
        console.warn('[MGY chain]', it.url, err); it.failed = true;
        $$(`[data-chain-pick="${it.i}"]`).forEach((b) => { b.hidden = true; });
      })
  )).then(() => {
    if (!live().length) return fail();
    layout();
    renderer.compile(scene, camera);
    items.forEach(applyPose);
    renderer.render(scene, camera);
    root.classList.add('is-ready');
    if (wantGo) go();
  });

  function fail(uiOnly) {
    root.classList.add('no-3d');
    if (renderer) { renderer.dispose(); renderer = null; }
    if (uiOnly) {   /* no WebGL at all: still let people pick a piece and open its product panel over the still photos */
      $$('[data-chain-pick]').forEach((b) => b.addEventListener('click', () => { selected = Number(b.dataset.chainPick); applySelectionUI(); }));
      $$('[data-chain-close]').forEach((b) => b.addEventListener('click', () => { selected = -1; applySelectionUI(); }));
    }
  }

  /* ---------- drop ---------- */
  function launch(it) {
    it.phase = 'falling'; it.dropY = dropStart; it.vy = -1.5;
    it.swingA = it.i % 2 ? -0.5 : 0.5; it.swingV = 0;        // arrives a little crooked
    it.yaw = 2.3 + it.i * 0.7; it.yawV = it.i % 2 ? -7.5 : 7.5;   // and spinning
  }
  function go() {
    const pieces = live();
    if (!pieces.length || pieces.some((it) => it.phase !== 'wait' || it.wake != null)) { wantGo = true; return; }
    pieces.forEach((it, k) => {
      if (reduce) { it.phase = 'hang'; it.dropY = 0; it.vy = 0; } else it.wake = t + k * STAGGER;   // the first piece falls first, the next a beat later
    });
    if (reduce) { applyAll(); }
  }
  function trigger() {
    if (started) return;
    started = true;
    if (live().length) go(); else wantGo = true;
  }

  /* ---------- physics ---------- */
  function physicsItem(it, h) {
    if (!it.ready) return;
    if (it.phase === 'wait' && it.wake != null && t >= it.wake) launch(it);
    if (it.phase === 'falling') {
      it.vy -= PHYS.G * h; it.dropY += it.vy * h;
      if (it.dropY <= 0) { it.dropY = 0; it.phase = 'caught'; it.swingV += 1.7; }
    } else if (it.phase === 'caught') {
      it.vy += (-PHYS.K * it.dropY - PHYS.C * it.vy) * h; it.dropY += it.vy * h;
      if (Math.abs(it.dropY) < 0.002 && Math.abs(it.vy) < 0.03) { it.dropY = 0; it.vy = 0; it.phase = 'hang'; }
    }
    it.swingV += (-PHYS.SW_K * it.swingA - PHYS.SW_C * it.swingV) * h; it.swingA += it.swingV * h;

    /* idle sway, and drift back to facing front, once nobody is touching it */
    let sway = 0;
    if (!drag && idle > 2.5 && it.phase === 'hang') {
      if (autorotate && it.i !== selected) sway = 0.42 * Math.sin((t - 2.5) * 0.55 + it.i * 2.1);
      if (idle > 6) it.userYaw = lerp(it.userYaw, Math.round(it.userYaw / TAU) * TAU, 1 - Math.exp(-h * 0.5));
      it.userPitch = lerp(it.userPitch, 0, 1 - Math.exp(-h * 0.8));
    }
    const yawTarget = it.userYaw + sway;
    it.yawV += (-PHYS.YK * (it.yaw - yawTarget) - PHYS.YC * it.yawV) * h; it.yaw += it.yawV * h;
    it.pitchV += (-PHYS.YK * (it.pitch - it.userPitch) - PHYS.YC * it.pitchV) * h; it.pitch += it.pitchV * h;

    const want = it.i === selected ? 1 : 0;
    it.sel += (want - it.sel) * (1 - Math.exp(-h * 6.5));
    if (Math.abs(it.sel - want) < 0.0005) it.sel = want;
    // position / size / brightness glide to wherever the selection says this piece belongs
    const g = goal(it), k = 1 - Math.exp(-h * 6.5), dimWant = selected >= 0 && it.i !== selected ? 1 : 0;
    it.px += (g.x - it.px) * k; it.py += (g.y - it.py) * k; it.ps += (g.s - it.ps) * k; it.dim += (dimWant - it.dim) * k;
  }
  function physics(h) {
    t += h; idle += h;
    items.forEach((it) => physicsItem(it, h));
    selAny = Math.max(...items.map((it) => it.sel));
  }
  function update(dt) {
    dt = Math.min(dt, 0.05);
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (let i = 0; i < n; i++) physics(h);
    applyAll();
  }

  function applyPose(it) {
    if (!it.ready) return;
    const bob = reduce || it.phase !== 'hang' ? 0 : 0.035 * Math.sin(t * 1.15 + it.i * 1.7);
    it.rig.scale.setScalar(it.ps);
    it.rig.position.set(it.px, it.py + (MODEL_H * it.ps) / 2 + it.dropY + bob, 0);
    it.swing.rotation.z = it.swingA;
    it.spin.rotation.set(it.pitch, it.yaw, 0);
    it.mat.color.copy(it.base).multiplyScalar(lerp(1, DIM, it.dim));      // the piece behind goes dark
  }
  function applyAll() {
    items.forEach(applyPose);
    const e = selAny * selAny * (3 - 2 * selAny), lead = items[selected >= 0 ? selected : lastActive] || items[0];
    scene.environmentIntensity = lerp(1.5, 2.2, e);
    renderer.toneMappingExposure = lerp(1, 1.2, e);
    scene.environmentRotation.y = 0.18 * Math.sin(t * 0.32) + lead.yaw * 0.12;
    if (frame && frameItem >= 0 && items[frameItem].sel > 0.01) updateFrame(items[frameItem]);
  }

  /* screen-space rectangle of a piece (used for hit-testing + the bracket overlay) */
  const tmp = new Vector3();
  function screenRect(it) {
    if (!it.bbox) return null;
    it.holder.updateMatrixWorld(true);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const { min, max } = it.bbox;
    for (let i = 0; i < 8; i++) {
      tmp.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z);
      it.holder.localToWorld(tmp); tmp.project(camera);
      const x = (tmp.x * 0.5 + 0.5) * S.w, y = (-tmp.y * 0.5 + 0.5) * S.h;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    return { x0, y0, x1, y1 };
  }
  function updateFrame(it) {
    const r = screenRect(it); if (!r) return;
    const pad = 22, w = Math.max(64, r.x1 - r.x0) + pad * 2, h = r.y1 - r.y0 + pad * 2;
    const cx = (r.x0 + r.x1) / 2;
    frame.style.setProperty('--fx', (cx - w / 2).toFixed(1) + 'px');
    frame.style.setProperty('--fy', (r.y0 - pad).toFixed(1) + 'px');
    frame.style.setProperty('--fw', w.toFixed(1) + 'px');
    frame.style.setProperty('--fh', h.toFixed(1) + 'px');
    root.style.setProperty('--gx', cx.toFixed(1) + 'px');
    root.style.setProperty('--gy', ((r.y0 + r.y1) / 2).toFixed(1) + 'px');
  }
  /* which piece is under the pointer: the nearest by centre among those whose box (plus a little margin) contains it; -1 if none */
  function hit(clientX, clientY) {
    const b = canvas.getBoundingClientRect(), x = clientX - b.left, y = clientY - b.top, m = 22;
    let best = -1, bd = 1e12;
    live().forEach((it) => {
      const r = screenRect(it); if (!r) return;
      if (x >= r.x0 - m && x <= r.x1 + m && y >= r.y0 - m && y <= r.y1 + m) {
        const d = Math.hypot(x - (r.x0 + r.x1) / 2, y - (r.y0 + r.y1) / 2);
        if (d < bd) { bd = d; best = it.i; }
      }
    });
    return best;
  }
  /* a drag that starts on empty space turns the selected piece, or else the one nearest across */
  function nearestAcross(clientX) {
    const b = canvas.getBoundingClientRect(), x = clientX - b.left;
    let best = lastActive, bd = 1e12;
    live().forEach((it) => { const r = screenRect(it); const d = Math.abs(x - (r.x0 + r.x1) / 2); if (d < bd) { bd = d; best = it.i; } });
    return best;
  }

  /* ---------- select / inspect ---------- */
  function setSelected(v) {
    const next = v === false || v == null ? -1 : Number(v);
    if (next === selected) return;
    selected = next;
    if (next >= 0) { lastActive = next; frameItem = next; }
    applySelectionUI();
    const it = items[next];
    if (it && it.ready) {
      it.userYaw = Math.round(it.userYaw / TAU) * TAU;      // turn it to face you
      it.userPitch = 0; it.swingV += 1.1;                   // little nudge as it comes forward
      if (frame) updateFrame(it);
    }
    idle = 0;
    if (!raf && !window.MGY_CHAIN_TEST) startLoop();
  }

  /* ---------- input ---------- */
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const over = hit(e.clientX, e.clientY);
    const item = over >= 0 ? over : selected >= 0 ? selected : nearestAcross(e.clientX);
    lastActive = item;
    drag = { item, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), moved: 0, lt: performance.now() };
    dragVel = 0; idle = 0; startLoop();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    canvas.classList.add('drag');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) { canvas.style.cursor = hit(e.clientX, e.clientY) >= 0 ? 'pointer' : ''; return; }
    const it = items[drag.item], dx = e.clientX - drag.lx, dy = e.clientY - drag.ly, now = performance.now();
    drag.moved += Math.abs(dx) + Math.abs(dy);
    it.userYaw += dx * 0.012; it.userPitch = clamp(it.userPitch + dy * 0.006, -0.55, 0.55);
    dragVel = lerp(dragVel, dx / Math.max(1, now - drag.lt) * 1000, 0.4);
    drag.lx = e.clientX; drag.ly = e.clientY; drag.lt = now; idle = 0;
  });
  const endDrag = (e, cancelled) => {
    if (!drag) return;
    const d = drag; drag = null; canvas.classList.remove('drag');
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    if (!cancelled && d.moved < 7 && performance.now() - d.t < 500) {
      const over = hit(e.clientX, e.clientY);
      if (over >= 0) setSelected(over === selected ? -1 : over); else setSelected(-1);
    } else {
      items[d.item].userYaw += clamp(dragVel, -2500, 2500) * 0.0005;       // flick momentum
    }
    idle = 0;
  };
  canvas.addEventListener('pointerup', (e) => endDrag(e, false));
  canvas.addEventListener('pointercancel', (e) => endDrag(e, true));
  stage.addEventListener('keydown', (e) => {
    const cur = items[selected >= 0 ? selected : lastActive];
    if (e.key === 'ArrowLeft') { if (cur) cur.userYaw -= 0.45; idle = 0; startLoop(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { if (cur) cur.userYaw += 0.45; idle = 0; startLoop(); e.preventDefault(); }
    else if (e.key === 'Escape') setSelected(false);
    else if (/^[1-9]$/.test(e.key) && items[Number(e.key) - 1] && items[Number(e.key) - 1].ready) { setSelected(Number(e.key) - 1); e.preventDefault(); }
    else if ((e.key === 'Enter' || e.key === ' ') && e.target === stage) { setSelected(selected >= 0 ? false : lastActive); e.preventDefault(); }
  });
  $$('[data-chain-pick]').forEach((b) => b.addEventListener('click', () => setSelected(Number(b.dataset.chainPick))));
  $$('[data-chain-close]').forEach((b) => b.addEventListener('click', () => {
    const i = selected; setSelected(false);
    const back = $(`.chain-hint [data-chain-pick="${i}"]`); if (back) back.focus({ preventScroll: true });
  }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && selected >= 0) setSelected(false); });

  /* ---------- loop ---------- */
  let raf = 0, last = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = (now - last) / 1000 || 0; last = now;
    update(dt);
    renderer.render(scene, camera);
    const settled = !drag && !autorotate && reduce && items.every((it) => !it.ready || (it.phase === 'hang' && Math.abs(it.yawV) < 0.0005 &&
      Math.abs(it.swingV) < 0.0005 && Math.abs(it.yaw - it.userYaw) < 0.0005 && Math.abs(it.px - goal(it).x) < 0.0005 && it.sel === (it.i === selected ? 1 : 0)));
    if (settled) stopLoop();
  }
  function startLoop() { if (!raf && renderer && (visible || selected >= 0) && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function stopLoop() { cancelAnimationFrame(raf); raf = 0; }

  new ResizeObserver(() => { if (renderer) { layout(); applyAll(); if (!raf) renderer.render(scene, camera); } }).observe(stage);
  new IntersectionObserver((en) => {
    visible = en[0].isIntersecting;
    if (visible) { startLoop(); if (!gated() && !started && en[0].intersectionRatio > 0.3) trigger(); } else stopLoop();
  }, { threshold: [0, 0.3] }).observe(stage);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopLoop(); else startLoop(); });

  function gated() { return document.documentElement.classList.contains('gated') && !window.MGY_ENTERED; }
  if (gated()) window.addEventListener('mgy:entered', trigger, { once: true });
  else if (window.MGY_ENTERED) trigger();

  layout();

  /* a summary of where the pieces are: 'wait' until all of them are waiting, 'hang' once all are hanging, otherwise 'falling' */
  const summary = () => {
    const ps = live().map((it) => it.phase);
    return !ps.length || ps.every((p) => p === 'wait') ? 'wait' : ps.every((p) => p === 'hang') ? 'hang' : 'falling';
  };
  root.__chain = {
    dispose() { stopLoop(); if (renderer) { renderer.dispose(); renderer = null; } root.__chain = null; },
    /* test hooks (only used by the automated checks) */
    _tick(dt, n = 1) { for (let i = 0; i < n; i++) update(dt); renderer.render(scene, camera); },   // n physics steps, one render
    _go: trigger,
    _select: setSelected,
    _state() {
      return { phase: summary(), ready: items.every((it) => it.ready || it.failed) && live().length > 0, selected, count: live().length,
        phases: items.map((it) => it.phase), yaw: items.map((it) => it.yaw), userYaw: items.map((it) => it.userYaw), x: items.map((it) => it.px), scale: items.map((it) => it.ps), dim: items.map((it) => it.dim),
        rects: items.map((it) => screenRect(it)) };
    }
  };
  if (window.MGY_CHAIN_TEST) { window.__chain = root.__chain; } else { startLoop(); }
}

function boot() { document.querySelectorAll('[data-chain]').forEach(init); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
