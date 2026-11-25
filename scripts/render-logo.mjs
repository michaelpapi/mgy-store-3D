/* Renders the 3D logo (assets-src/mgy-logo-3d.glb) to the transparent images the site uses.
     npm run logo
   Writes public/brand/mgy-logo.webp (big: welcome screen), mgy-logo-sm.webp (footer, dark-theme header), mgy-logo-ink-sm.webp
   (dark version for the light-theme header) and og.png (link previews).
   Needs Playwright's browser once (npx playwright install chromium), or CHROME_PATH=/path/to/chrome. To change the look, edit the
   LOOK values below (colour, glossiness, light strength, turn) and run it again. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import sharp from 'sharp';

const INK = { color: 0x232323, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, exposure: 1.1, envIntensity: 0.9, keyLight: 2.6 };   // dark version for the light-theme header
const LOOK = { color: 0xe9e7e3, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.25, exposure: 0.85, envIntensity: 0.55, keyLight: 2.2, turnY: 0, tiltX: 0 };
const SRC = resolve('assets-src/mgy-logo-3d.glb'), OUT = resolve('public/brand'), W = 1800;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };

const page = `<!doctype html><meta charset=utf-8><canvas id=c></canvas>
<script type="importmap">{"imports":{"three":"/m/three/build/three.module.js","three/addons/":"/m/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const L = { ...${JSON.stringify(LOOK)}, ...JSON.parse(new URLSearchParams(location.search).get('o') || '{}') }, W = ${W};
const gltf = await new GLTFLoader().loadAsync('/logo.glb');
let mesh; gltf.scene.traverse((o) => { if (o.isMesh) mesh = o; });
mesh.geometry.computeVertexNormals();   // the file has no normals; smooth ones give the soft, poured look
mesh.material = new THREE.MeshPhysicalMaterial({ color: L.color, roughness: L.roughness, metalness: 0, clearcoat: L.clearcoat, clearcoatRoughness: L.clearcoatRoughness, envMapIntensity: L.envIntensity });
mesh.geometry.computeBoundingBox();
const bb = mesh.geometry.boundingBox, size = bb.getSize(new THREE.Vector3());
const holder = new THREE.Group(); mesh.position.sub(bb.getCenter(new THREE.Vector3())); holder.add(mesh); holder.rotation.set(L.tiltX, L.turnY, 0);
const scene = new THREE.Scene(); scene.add(holder);
const H = Math.round(W / (size.x / size.y) * 1.08);
const r = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, alpha: true, preserveDrawingBuffer: true });
r.setPixelRatio(1); r.setSize(W, H); r.setClearColor(0, 0); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = L.exposure; r.outputColorSpace = THREE.SRGBColorSpace;
scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.03).texture;
const key = new THREE.DirectionalLight(0xffffff, L.keyLight); key.position.set(-0.6, 0.9, 1.2); scene.add(key);
const rim = new THREE.DirectionalLight(0xffffff, 0.5); rim.position.set(0.8, -0.3, 0.6); scene.add(rim);
const hw = size.x / 2 * 1.04, hh = hw * H / W;
const cam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.01, 2); cam.position.set(0, 0, 0.6); cam.lookAt(0, 0, 0);
r.render(scene, cam); window.DONE = true;
</script>`;

const server = createServer(async (q, res) => {
  const p = new URL(q.url, 'http://x').pathname;
  try {
    if (p === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(page); }
    const f = p === '/logo.glb' ? SRC : p.startsWith('/m/') ? join(resolve('node_modules'), p.slice(3)) : null;
    if (!f) throw 0;
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function render(over = {}) {
  const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  pg.on('pageerror', (e) => console.error(e));
  await pg.goto(`http://localhost:${port}/?o=${encodeURIComponent(JSON.stringify(over))}`);
  await pg.waitForFunction(() => window.DONE, null, { timeout: 120000 });
  const png = Buffer.from((await pg.evaluate(() => document.getElementById('c').toDataURL('image/png'))).split(',')[1], 'base64');
  await pg.close();
  return png;
}
const png = await render(), inkPng = await render(INK);
await browser.close(); server.close();

await mkdir(OUT, { recursive: true });
const crop = (b) => sharp(b).trim({ threshold: 1 }).extend({ top: 12, bottom: 12, left: 12, right: 12, background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
const logo = await crop(png), ink = await crop(inkPng);
await sharp(logo).resize({ width: 1400 }).webp({ quality: 90, alphaQuality: 100 }).toFile(join(OUT, 'mgy-logo.webp'));
await sharp(logo).resize({ width: 480 }).webp({ quality: 88, alphaQuality: 100 }).toFile(join(OUT, 'mgy-logo-sm.webp'));
await sharp(ink).resize({ width: 480 }).webp({ quality: 88, alphaQuality: 100 }).toFile(join(OUT, 'mgy-logo-ink-sm.webp'));
// link-preview card: the logo on the site's black
const small = await sharp(logo).resize({ width: 820 }).toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 4, background: '#0b0b0b' } }).composite([{ input: small, gravity: 'center' }]).png().toFile(join(OUT, 'og.png'));
const m = await sharp(join(OUT, 'mgy-logo.webp')).metadata();
console.log(`wrote mgy-logo.webp (${m.width}x${m.height}), mgy-logo-sm.webp, mgy-logo-ink-sm.webp, og.png in public/brand/`);
