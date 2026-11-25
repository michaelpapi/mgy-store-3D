// The Shopify-CSV importer and the generated catalog.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseCsv, buildCatalog } from '../scripts/import-shopify-csv.mjs';

test('parseCsv handles quotes, doubled quotes, commas and newlines inside fields, and CRLF', () => {
  const rows = parseCsv('a,b,c\r\n1,"x, y","say ""hi"""\r\n2,"line1\nline2",\r\n');
  assert.deepEqual(rows, [{ a: '1', b: 'x, y', c: 'say "hi"' }, { a: '2', b: 'line1\nline2', c: '' }]);
});

test('buildCatalog groups variant rows under their product, reads options, stock and images', () => {
  const csv = [
    'Handle,Title,Type,Body (HTML),Tags,Option1 Name,Option1 Value,Variant SKU,Variant Price,Image Src,Image Position,Image Alt Text,Status',
    'tee,Tee,Tops,"<p>Soft &amp; plain</p>","a, b",Size,S,TEE-S,40,https://cdn/x/tee-1.jpg?v=2,1,Front,active',
    'tee,,,,,,M,TEE-M,45,https://cdn/x/tee-2.jpg,2,Back,',
    'tee,,,,,,L,TEE-L,45,,,,',
    'ring,Ring,Jewelry,,,Title,Default Title,RING-1,75,,,,active',
    'hidden,Hidden,Tops,,,Size,S,H-S,10,,,,draft',
  ].join('\n').replace(/^(tee,,,,,,[ML])/gm, '$1');
  const inv = parseCsv('SKU,On hand (new)\nTEE-S,3\nTEE-M,0\nRING-1,7');
  const products = buildCatalog(parseCsv(csv), inv);
  assert.deepEqual(products.map((p) => p.handle), ['tee', 'ring']);     // the draft product is dropped
  const tee = products[0];
  assert.equal(tee.description, 'Soft & plain');
  assert.deepEqual(tee.tags, ['a', 'b']);
  assert.deepEqual(tee.options, [{ name: 'Size', values: ['S', 'M', 'L'] }]);
  assert.deepEqual([tee.price, tee.priceVaries], [40, true]);
  assert.deepEqual(tee.variants.map((v) => [v.sku, v.price, v.stock]), [['TEE-S', 40, 3], ['TEE-M', 45, 0], ['TEE-L', 45, null]]);
  assert.deepEqual(tee.images.map((i) => i.file), ['tee-1', 'tee-2']);
  const ring = products[1];
  assert.deepEqual([ring.options, ring.variants[0].options, ring.priceVaries], [[], [], false]);   // "Default Title" is hidden
});

test('the generated catalog matches the CSVs in catalog-src and every product has what the shop needs', { skip: !existsSync(new URL('../src/data/products.json', import.meta.url)) }, () => {
  const made = buildCatalog(parseCsv(readFileSync(new URL('../catalog-src/mgy_products_import.csv', import.meta.url), 'utf8')), parseCsv(readFileSync(new URL('../catalog-src/mgy_inventory_import.csv', import.meta.url), 'utf8')));
  const saved = JSON.parse(readFileSync(new URL('../src/data/products.json', import.meta.url), 'utf8'));
  assert.equal(saved.currency, 'USD');
  assert.deepEqual(saved.products, made, 'src/data/products.json is out of date: run npm run catalog');
  const skus = new Set();
  for (const p of saved.products) {
    assert.ok(p.title && p.variants.length && p.images.length, p.handle);
    for (const v of p.variants) { assert.ok(v.price > 0, v.sku); assert.ok(!skus.has(v.sku), 'duplicate sku ' + v.sku); skus.add(v.sku); }
  }
});
