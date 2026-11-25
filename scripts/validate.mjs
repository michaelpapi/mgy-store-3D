/* Checks the BUILT site (run `npm run build` first). Fails on broken things, only warns about things still to fill in.
     npm run validate */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

const out = resolve(process.env.MGY_OUT_DIR || 'dist');
const site = JSON.parse(readFileSync('src/data/site.json', 'utf8'));
const catalog = JSON.parse(readFileSync('src/data/products.json', 'utf8')).products;
const looks = JSON.parse(readFileSync('src/data/looks.json', 'utf8')).looks;
let errors = 0, warnings = 0;
const bad = (m) => { errors++; console.log('  ERROR  ' + m); };
const warn = (m) => { warnings++; console.log('  todo   ' + m); };

if (!existsSync(out)) { console.log(`No build found at ${out}. Run "npm run build" first.`); process.exit(1); }

const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(out);
const pages = files.filter((f) => f.endsWith('.html'));
const rel = (f) => '/' + f.slice(out.length + 1).replace(/\\/g, '/');
const urlExists = (u) => {
  const path = decodeURIComponent(u.split('#')[0].split('?')[0]);
  if (!path || path === '/') return existsSync(join(out, 'index.html'));
  const f = join(out, path);
  return (existsSync(f) && statSync(f).isFile()) || existsSync(join(f, 'index.html'));
};

console.log(`checking ${pages.length} pages in ${out}`);

/* every product has a page, a card on the home page and its images */
const home = readFileSync(join(out, 'index.html'), 'utf8');
for (const p of catalog) {
  if (!existsSync(join(out, 'product', p.handle, 'index.html'))) bad(`no page for ${p.handle}`);
  for (const im of p.images) for (const suffix of ['', '-sm']) if (!existsSync(join(out, 'products', `${im.file}${suffix}.webp`))) bad(`${p.handle}: missing image products/${im.file}${suffix}.webp`);
  if (!home.includes(`/product/${p.handle}/`)) bad(`${p.handle} is not linked from the home page`);
  if (!p.variants.some((v) => v.stock == null || v.stock > 0)) warn(`${p.handle} is sold out in every variant`);
}

/* internal links and assets on every page */
const attr = /\b(?:href|src|data-model-url|poster)=["']([^"'#][^"']*)["']/g;
for (const f of pages) {
  const html = readFileSync(f, 'utf8');
  for (const m of html.matchAll(attr)) {
    const u = m[1];
    if (/^(https?:|mailto:|tel:|data:|javascript:|\/\/)/.test(u)) continue;
    if (!u.startsWith('/')) continue;
    if (!urlExists(u)) bad(`${rel(f)} points to ${u}, which does not exist`);
  }
  if (!/<title>[^<]+<\/title>/.test(html)) bad(`${rel(f)} has no <title>`);
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { JSON.parse(m[1]); } catch { bad(`${rel(f)} has broken JSON-LD`); } }
  if (/fonts\.googleapis|fonts\.gstatic/.test(html)) bad(`${rel(f)} loads Google Fonts (fonts are meant to be self-hosted)`);
}

/* the 3D chain needs its model, the lookbook needs real products */
for (const [i, it] of site.chain.items.entries()) {
  if (!existsSync(join(out, it.model.replace(/^\//, '')))) bad(`3D model ${it.model} (chain.items[${i}]) is missing`);
  if (!catalog.some((p) => p.handle === it.product)) bad(`chain.items[${i}].product "${it.product}" is not in the catalog`);
}
for (const l of looks) for (const f of [l.image, l.backImage]) if (f && !existsSync(join(out, f))) bad(`look "${l.name}": photo ${f} is missing (put the file in photos-src/looks, run npm run images)`);
for (const l of looks) for (const h of l.products || []) if (!catalog.some((p) => p.handle === h)) bad(`look "${l.name}" uses unknown product ${h}`);
for (const k of ['welcome']) if (site[k]?.video && !existsSync(join(out, site[k].video.replace(/^\//, '')))) bad(`welcome video ${site[k].video} is missing`);

/* the checkout */
if (!site.leads?.token || site.leads.token.length < 24) bad('leads.token is missing or too short');
const gs = existsSync('docs/google-sheets-leads/Code.gs') ? readFileSync('docs/google-sheets-leads/Code.gs', 'utf8') : '';
if (!gs.includes(`var TOKEN = '${site.leads?.token}';`)) bad('Code.gs TOKEN does not match leads.token in site.json');
const wa = process.env.PUBLIC_WHATSAPP || site.contact.whatsapp;
if (!wa) warn('no WhatsApp number: checkout shows "not switched on". Set contact.whatsapp in src/data/site.json or PUBLIC_WHATSAPP on Netlify');
else if (!/^\d{7,15}$/.test(wa)) bad(`WhatsApp number "${wa}" must be digits only with the country code, e.g. 14045550123`);
if (!(process.env.PUBLIC_LEADS_URL || site.leads?.url)) warn('no Google Sheet URL: orders open WhatsApp but are not logged (docs/google-sheets-leads/SETUP.md)');

/* size */
const kb = (f) => statSync(f).size / 1024;
const big = files.filter((f) => /\.(webp|png|jpg)$/.test(f) && kb(f) > 400);
for (const f of big) warn(`${rel(f)} is ${Math.round(kb(f))} KB: consider shrinking it`);
const total = files.reduce((a, f) => a + statSync(f).size, 0);
console.log(`built site: ${files.length} files, ${(total / 1048576).toFixed(1)} MB`);

console.log(errors ? `\n${errors} error(s), ${warnings} to-do(s)` : `\nOK${warnings ? `, with ${warnings} thing(s) still to fill in` : ''}`);
process.exit(errors ? 1 : 0);
