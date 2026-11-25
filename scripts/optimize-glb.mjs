/* Shrinks a 3D model for the web: welds it, gives it smooth normals, simplifies it, quantises it and meshopt-compresses it.
     node scripts/optimize-glb.mjs <in.glb> <out.glb> [keep]
   `keep` is the share of triangles to keep, 0..1 (default 0.3). It was used to turn the 12 MB eagle necklace export into the file in
   public/models/. Only meshes, one material and node transforms are handled (no textures, no animation), which is all a jewellery
   model needs. Uses the `meshoptimizer` package (already installed here as a dependency of three's types; if it is ever missing:
   npm i -D meshoptimizer). The page decodes the result with three's MeshoptDecoder, the same as mgy-chain.glb. */
import { readFileSync, writeFileSync } from 'node:fs';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const [, , inFile, outFile, keepArg] = process.argv;
if (!inFile || !outFile) { console.error('usage: node scripts/optimize-glb.mjs in.glb out.glb [keep=0.3]'); process.exit(1); }
const KEEP = Number(keepArg || 0.3);
await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);

/* ---- read the GLB ---- */
const buf = readFileSync(inFile);
if (buf.toString('latin1', 0, 4) !== 'glTF') throw new Error('not a .glb file');
let off = 12, json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8')); else if (type === 0x004e4942) bin = data;
  off += 8 + len;
}
const read = (accIdx) => {
  const a = json.accessors[accIdx], bv = json.bufferViews[a.bufferView];
  const o = (bv.byteOffset || 0) + (a.byteOffset || 0), n = a.count * ({ SCALAR: 1, VEC3: 3 }[a.type]);
  const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];
  const ab = bin.buffer.slice(bin.byteOffset + o, bin.byteOffset + o + n * T.BYTES_PER_ELEMENT);
  return new T(ab);
};

/* ---- per mesh ---- */
const outParts = [];          // [{ bytes, view }] compressed buffer views, appended in order
const newViews = [], newAccessors = [];
let outBinLen = 0;
const pad4 = (n) => (n + 3) & ~3;
function addView(bytes, extra) {
  const view = { buffer: 0, byteOffset: outBinLen, byteLength: bytes.length, ...extra };
  outParts.push(bytes); outBinLen += pad4(bytes.length); newViews.push(view); return newViews.length - 1;
}

for (const mesh of json.meshes) {
  for (const prim of mesh.primitives) {
    if (prim.mode !== 4 && prim.mode !== undefined) throw new Error('only triangle meshes are handled');
    let pos = read(prim.attributes.POSITION), idx = prim.indices !== undefined ? read(prim.indices) : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
    idx = Uint32Array.from(idx);
    /* 1. weld vertices that share a position */
    const remap = MeshoptSimplifier.generatePositionRemap(pos, 3);
    for (let i = 0; i < idx.length; i++) idx[i] = remap[idx[i]];
    /* 2. smooth area-weighted normals on the full-detail mesh */
    const nrm = new Float32Array(pos.length);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) { nrm[k] += nx; nrm[k + 1] += ny; nrm[k + 2] += nz; }
    }
    for (let i = 0; i < nrm.length; i += 3) {
      const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l;
    }
    /* 3. simplify, keeping the shading (normals) as close as possible */
    const target = Math.max(300, Math.floor((idx.length * KEEP) / 3) * 3);
    const [simp, err] = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, nrm, 3, [1.2, 1.2, 1.2], null, target, 0.01, []);
    /* 4. drop the vertices nobody uses, and reorder for compression */
    const [remap2, count] = MeshoptSimplifier.compactMesh(simp);
    const p2 = new Float32Array(count * 3), n2 = new Float32Array(count * 3);
    for (let i = 0; i < pos.length / 3; i++) { const r = remap2[i]; if (r === 0xffffffff) continue; p2.set(pos.subarray(i * 3, i * 3 + 3), r * 3); n2.set(nrm.subarray(i * 3, i * 3 + 3), r * 3); }
    const [remap3, uniq] = MeshoptEncoder.reorderMesh(simp, true, true);
    const p3 = new Float32Array(uniq * 3), n3 = new Float32Array(uniq * 3);
    for (let i = 0; i < count; i++) { const r = remap3[i]; if (r === 0xffffffff) continue; p3.set(p2.subarray(i * 3, i * 3 + 3), r * 3); n3.set(n2.subarray(i * 3, i * 3 + 3), r * 3); }
    /* 5. quantise positions to 16 bit (the node transform scales them back), normals to octahedral 8 bit */
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < p3.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p3[i + k]); mx[k] = Math.max(mx[k], p3[i + k]); }
    const ctr = mn.map((v, k) => (v + mx[k]) / 2), half = Math.max(...mx.map((v, k) => (v - mn[k]) / 2));
    const q = new Int16Array(uniq * 4);
    for (let i = 0; i < uniq; i++) for (let k = 0; k < 3; k++) q[i * 4 + k] = Math.round(((p3[i * 3 + k] - ctr[k]) / half) * 32767);
    const qmin = [0, 1, 2].map((k) => Math.min(...Array.from({ length: uniq }, (_, i) => q[i * 4 + k]))), qmax = [0, 1, 2].map((k) => Math.max(...Array.from({ length: uniq }, (_, i) => q[i * 4 + k])));
    const n4 = new Float32Array(uniq * 4); for (let i = 0; i < uniq; i++) { n4.set(n3.subarray(i * 3, i * 3 + 3), i * 4); }
    const nOct = MeshoptEncoder.encodeFilterOct(n4, uniq, 4, 8);
    const posBytes = MeshoptEncoder.encodeVertexBuffer(new Uint8Array(q.buffer), uniq, 8);
    const nrmBytes = MeshoptEncoder.encodeVertexBuffer(nOct, uniq, 4);
    const idxBytes = MeshoptEncoder.encodeIndexBuffer(new Uint8Array(simp.buffer, simp.byteOffset, simp.byteLength), simp.length, 4);
    const mk = (bytes, raw, count, stride, mode, filter) => addView(bytes, { byteStride: mode === 'TRIANGLES' ? undefined : stride, extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: 0, byteLength: bytes.length, byteStride: stride, mode, count, ...(filter ? { filter } : {}) } } , __fallbackLen: raw });
    const vPos = mk(posBytes, q.byteLength, uniq, 8, 'ATTRIBUTES');
    const vNrm = mk(nrmBytes, nOct.byteLength, uniq, 4, 'ATTRIBUTES', 'OCTAHEDRAL');
    const vIdx = mk(idxBytes, simp.byteLength, simp.length, 4, 'TRIANGLES');
    const acc = (o) => newAccessors.push(o) - 1;
    prim.attributes = {
      POSITION: acc({ bufferView: vPos, componentType: 5122, count: uniq, type: 'VEC3', min: qmin, max: qmax }),
      NORMAL: acc({ bufferView: vNrm, componentType: 5120, normalized: true, count: uniq, type: 'VEC3' }),
    };
    prim.indices = acc({ bufferView: vIdx, componentType: 5125, count: simp.length, type: 'SCALAR' });
    /* the node that uses this mesh scales and moves the 16 bit numbers back to metres */
    for (const n of json.nodes) if (n.mesh === json.meshes.indexOf(mesh)) { n.scale = [half / 32767, half / 32767, half / 32767]; n.translation = ctr; }
    console.log(`${mesh.name || 'mesh'}: ${pos.length / 3} -> ${uniq} vertices, ${idx.length / 3} -> ${simp.length / 3} triangles (error ${(err * 100).toFixed(2)}% of size)`);
  }
}

/* ---- write the GLB ---- */
const outBin = Buffer.alloc(outBinLen);
let at = 0;
newViews.forEach((v, i) => { Buffer.from(outParts[i]).copy(outBin, at); at += pad4(outParts[i].length); });
const fallbackLen = newViews.reduce((s, v) => s + v.__fallbackLen, 0);
newViews.forEach((v) => { delete v.__fallbackLen; if (v.byteStride === undefined) delete v.byteStride; });
// the compressed views live in buffer 0 (the GLB bin chunk); the "fallback" buffer 1 only declares the uncompressed size and has no data
for (const v of newViews) { const e = v.extensions.EXT_meshopt_compression; e.byteOffset = v.byteOffset; v.buffer = 1; v.byteOffset = 0; v.byteLength = e.count * e.byteStride; }
json.bufferViews = newViews; json.accessors = newAccessors;
json.buffers = [{ byteLength: outBin.length }, { byteLength: fallbackLen, extensions: { EXT_meshopt_compression: { fallback: true } } }];
json.extensionsUsed = ['EXT_meshopt_compression', 'KHR_mesh_quantization'];
json.extensionsRequired = ['EXT_meshopt_compression', 'KHR_mesh_quantization'];
const js = Buffer.from(JSON.stringify(json)); const jsPad = Buffer.concat([js, Buffer.alloc(pad4(js.length) - js.length, 0x20)]);
const head = Buffer.alloc(12); head.write('glTF', 0, 'latin1'); head.writeUInt32LE(2, 4);
const ch = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]); };
const out = Buffer.concat([head, ch(0x4e4f534a, jsPad), ch(0x004e4942, outBin)]); out.writeUInt32LE(out.length, 8);
writeFileSync(outFile, out);
console.log(`${(buf.length / 1048576).toFixed(1)} MB -> ${(out.length / 1048576).toFixed(2)} MB  (${outFile})`);
