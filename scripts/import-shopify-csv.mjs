/* Turns a Shopify product CSV (+ optional inventory CSV) into src/data/products.json.

   Usage:  npm run catalog -- path/to/products.csv [path/to/inventory.csv]

   Defaults to ./catalog-src/mgy_products_import.csv and ./catalog-src/mgy_inventory_import.csv.
   The CSV is the same file you import into Shopify, so the store and this site can share one source of truth.
   Image file names are taken from the "Image Src" URLs (the last part of the URL, extension dropped); put the
   matching photos in photos-src/products/ and run `npm run images`. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';

const [productsPath = 'catalog-src/mgy_products_import.csv', inventoryPath = 'catalog-src/mgy_inventory_import.csv'] = process.argv.slice(2);

/** RFC 4180 parser: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const stripHtml = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const imgKey = (url) => basename(new URL(url).pathname).replace(/\.[a-z0-9]+$/i, '');

export function buildCatalog(productRows, inventoryRows = []) {
  const stock = new Map(inventoryRows.map((r) => [r['SKU'], Number(r['On hand (new)'] || r['Available (not editable)'] || 0)]));
  const byHandle = new Map();
  for (const r of productRows) {
    let p = byHandle.get(r['Handle']);
    if (!p) {
      p = { handle: r['Handle'], title: '', type: '', category: '', description: '', seo: '', tags: [], optionNames: [], images: [], variants: [], published: true };
      byHandle.set(r['Handle'], p);
    }
    if (r['Title']) {
      p.title = r['Title']; p.type = r['Type']; p.description = stripHtml(r['Body (HTML)']); p.seo = r['SEO Description'];
      p.category = (r['Product Category'] || '').split('>').pop().trim();
      p.tags = (r['Tags'] || '').split(',').map((t) => t.trim()).filter(Boolean);
      p.optionNames = [r['Option1 Name'], r['Option2 Name'], r['Option3 Name']].filter(Boolean);
      p.published = (r['Status'] || 'active') === 'active' && (r['Published'] || 'true') !== 'false';
    }
    if (r['Image Src']) p.images[Number(r['Image Position'] || p.images.length + 1) - 1] = { file: imgKey(r['Image Src']), alt: r['Image Alt Text'] };
    if (r['Variant SKU']) {
      const opts = [r['Option1 Value'], r['Option2 Value'], r['Option3 Value']].slice(0, Math.max(1, p.optionNames.length));
      p.variants.push({
        sku: r['Variant SKU'], options: opts, price: Number(r['Variant Price']),
        stock: stock.has(r['Variant SKU']) ? stock.get(r['Variant SKU']) : null,
        image: r['Variant Image'] ? imgKey(r['Variant Image']) : null,
      });
    }
  }
  const products = [];
  for (const p of byHandle.values()) {
    if (!p.published || !p.variants.length) continue;
    p.images = p.images.filter(Boolean);
    const single = p.variants.length === 1 && p.variants[0].options[0] === 'Default Title';
    const options = single ? [] : p.optionNames.map((name, i) => ({ name, values: [...new Set(p.variants.map((v) => v.options[i]))] }));
    const prices = p.variants.map((v) => v.price);
    products.push({
      handle: p.handle, title: p.title, type: p.type, category: p.category, description: p.description, seo: p.seo, tags: p.tags,
      price: Math.min(...prices), priceVaries: Math.min(...prices) !== Math.max(...prices),
      options, images: p.images,
      variants: p.variants.map((v) => ({ sku: v.sku, options: single ? [] : v.options, price: v.price, stock: v.stock, image: v.image })),
    });
  }
  return products;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!existsSync(productsPath)) { console.error(`Cannot find ${productsPath}. Pass the path to your Shopify products CSV.`); process.exit(1); }
  const inv = existsSync(inventoryPath) ? parseCsv(readFileSync(inventoryPath, 'utf8')) : [];
  const products = buildCatalog(parseCsv(readFileSync(productsPath, 'utf8')), inv);
  writeFileSync('src/data/products.json', JSON.stringify({ currency: 'USD', products }, null, 1) + '\n');
  const nv = products.reduce((a, p) => a + p.variants.length, 0);
  console.log(`src/data/products.json: ${products.length} products, ${nv} variants`);
}
