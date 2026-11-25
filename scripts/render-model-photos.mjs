/* Renders product photos from a 3D model, on the dark studio background the other jewelry photos use.
     node scripts/render-model-photos.mjs public/models/mgy-eagle-necklace.glb photos-src/products/mgy-eagle-necklace gold
   Writes <prefix>.webp (the whole necklace), <prefix>-2.webp and <prefix>-3.webp (close-ups of the pendant), 1312 x 1200.
   These are renders, not photographs: swap in real photos any time by replacing those files and running `npm run images`.
   Needs Playwright's browser once (npx playwright install chromium), or CHROME_PATH=/path/to/chrome. The last argument is the metal:
   gold or silver. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import sharp from 'sharp';

const [, , modelArg, prefixArg, metalArg = 'gold'] = process.argv;
if (!modelArg || !prefixArg) { console.error('usage: node scripts/render-model-photos.mjs model.glb photos-src/products/<handle> [gold|silver]'); process.exit(1); }
const METAL = { gold: 0xffc75c, silver: 0xf1f1f4 }[metalArg];
if (METAL === undefined) throw new Error('metal must be gold or silver');
const W = 1312, H = 1200;
/* camera shots: model turn (yaw), tilt (pitch), where the camera looks (y: 0 = clasp, -3 = bottom of the pendant) and how far away it is */
const SHOTS = [
  { name: '', yaw: 0.45, pitch: 0.4, look: -1.4, dist: 6.5 },
  { name: '-2', yaw: -0.5, pitch: 0.12, look: -2.05, dist: 3.9 },
  { name: '-3', yaw: 0.16, pitch: 0.34, look: -2.15, dist: 2.7 },
];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };

const page = `<!doctype html><meta charset=utf-8><canvas id=c></canvas>
<script type="importmap">{"imports":{"three":"/m/three/build/three.module.js","three/addons/":"/m/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const S = JSON.parse(new URLSearchParams(location.search).get('s')), W = ${W}, H = ${H};
const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
const model = (await l.loadAsync('/model.glb')).scene;
const metal = new THREE.MeshStandardMaterial({ color: ${METAL}, metalness: 1, roughness: ${metalArg === 'gold' ? 0.2 : 0.17} });
model.traverse((o) => { if (!o.isMesh) return; if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals(); o.material = metal; });
const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
model.position.set(-(box.min.x + box.max.x) / 2, -box.max.y, -(box.min.z + box.max.z) / 2);
const holder = new THREE.Group(); holder.scale.setScalar(3 / size.y); holder.add(model);
const turn = new THREE.Group(); turn.add(holder); turn.rotation.set(S.pitch, S.yaw, 0);
const scene = new THREE.Scene(); scene.add(turn);
const r = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, alpha: true, preserveDrawingBuffer: true });
r.setPixelRatio(1); r.setSize(W, H); r.setClearColor(0, 0); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; r.outputColorSpace = THREE.SRGBColorSpace;
const env = new THREE.Scene();   // the same dark studio with soft strips the site's 3D viewer uses
env.add(new THREE.Mesh(new THREE.BoxGeometry(22, 16, 22), new THREE.MeshBasicMaterial({ color: 0x090909, side: THREE.BackSide })));
const strip = (w, h, p, i, t) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(t || 0xffffff).multiplyScalar(i), side: THREE.DoubleSide })); m.position.set(...p); m.lookAt(0, 0, 0); env.add(m); };
strip(10, 3.4, [0, 6.6, 2], 16); strip(2.4, 10, [-7.5, 1, 3], 10, 0xfff1e2); strip(2.4, 10, [7.5, 0, 3], 10, 0xe3eeff); strip(6, 6, [0, 1, -9], 6); strip(11, 1.6, [0, -5.5, 4], 3.2); strip(1.3, 7, [-3.6, 0, 9], 7); strip(1.3, 7, [3.6, 0, 9], 7);
scene.environment = new THREE.PMREMGenerator(r).fromScene(env, 0.035).texture; scene.environmentIntensity = 1.5;
const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 100); cam.position.set(0, S.look, S.dist); cam.lookAt(0, S.look, 0);
r.render(scene, cam); window.DONE = true;
</script>`;

const server = createServer(async (q, res) => {
  const p = new URL(q.url, 'http://x').pathname;
  try {
    if (p === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(page); }
    const f = p === '/model.glb' ? resolve(modelArg) : p.startsWith('/m/') ? join(resolve('node_modules'), p.slice(3)) : null;
    if (!f) throw 0;
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

/* the dark floor the other jewelry photos sit on: a soft pool of light on near-black */
const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="g" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#3a3a3c"/><stop offset=".55" stop-color="#1b1b1c"/><stop offset="1" stop-color="#0a0a0a"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
for (const s of SHOTS) {
  const pg = await browser.newPage({ viewport: { width: W, height: H } });
  pg.on('pageerror', (e) => console.error(e));
  await pg.goto(`http://localhost:${port}/?s=${encodeURIComponent(JSON.stringify(s))}`);
  await pg.waitForFunction(() => window.DONE, null, { timeout: 120000 });
  const png = Buffer.from((await pg.evaluate(() => document.getElementById('c').toDataURL('image/png'))).split(',')[1], 'base64');
  await pg.close();
  const out = `${prefixArg}${s.name}.webp`;
  await sharp(bg).composite([{ input: png }]).webp({ quality: 86 }).toFile(out);
  console.log('wrote', out);
}
await browser.close(); server.close();
