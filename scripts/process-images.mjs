/* Makes the web-ready product photos.

   Reads every JPG / PNG / WebP in photos-src/products and writes two WebP sizes into public/products:
     <name>.webp      up to 1100px wide (product page, lookbook)
     <name>-sm.webp   up to 560px wide  (shop grid, cart)
   Also turns the model photos in photos-src/looks into public/looks/<name>.webp (up to 1000px wide) and writes their sizes to
   src/data/looks-media.json, so a lookbook card is exactly the shape of its photo.
   Run:  npm run images   (needs `npm install` first; uses sharp) */
import { readdirSync, mkdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, parse } from 'node:path';
import sharp from 'sharp';

const SRC = 'photos-src/products', OUT = 'public/products';
mkdirSync(OUT, { recursive: true });
let n = 0;
for (const f of readdirSync(SRC)) {
  if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
  const { name } = parse(f);
  const src = join(SRC, f);
  const big = join(OUT, `${name}.webp`), sm = join(OUT, `${name}-sm.webp`);
  const img = () => sharp(src).rotate().flatten({ background: '#e9e9e9' });
  await img().resize({ width: 1100, withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toFile(big);
  await img().resize({ width: 560, withoutEnlargement: true }).webp({ quality: 78, effort: 5 }).toFile(sm);
  n++;
}
const kb = readdirSync(OUT).reduce((a, f) => a + statSync(join(OUT, f)).size, 0) / 1024;
console.log(`${n} photos -> ${OUT} (${Math.round(kb)} KB total)`);

/* ---- lookbook model photos ---- */
const LSRC = 'photos-src/looks', LOUT = 'public/looks';
if (existsSync(LSRC)) {
  mkdirSync(LOUT, { recursive: true });
  const media = {};
  for (const f of readdirSync(LSRC).sort()) {
    if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
    const { name } = parse(f);
    const out = await sharp(join(LSRC, f)).rotate().resize({ width: 1000, withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toFile(join(LOUT, `${name}.webp`));
    media[name] = { w: out.width, h: out.height };
  }
  writeFileSync('src/data/looks-media.json', JSON.stringify(media, null, 1) + '\n');
  console.log(`${Object.keys(media).length} look photos -> ${LOUT}`);
}
