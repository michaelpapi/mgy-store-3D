/* End-to-end check in a real browser: builds the site into .test-dist with a test WhatsApp number and a test sheet URL, serves it,
   and walks through the welcome gate, the 3D chain, the lookbook, the shop and the whole WhatsApp checkout.

     npm run test:browser

   Needs Playwright's browser once:  npx playwright install chromium
   (or point CHROME_PATH at an installed Chrome, e.g. CHROME_PATH=/usr/bin/google-chrome)
   Set SHOTS=some/folder to also save screenshots. */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const PORT = 4399, BASE = `http://localhost:${PORT}`;
const WA = '14045550123', SHEET = 'https://script.google.com/macros/s/TEST/exec';
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const env = { ...process.env, MGY_OUT_DIR: '.test-dist', PUBLIC_WHATSAPP: WA, PUBLIC_LEADS_URL: SHEET };
console.log('building a test copy ...');
execSync('npx astro build', { env, stdio: 'ignore' });
/* a tiny static server for the built folder (so the test never clashes with your own `npm run dev` / `npm run preview`) */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.mp4': 'video/mp4' };
const root = resolve('.test-dist');
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, BASE).pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = join(root, path);
  try {
    if (!file.startsWith(root)) throw new Error('outside');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(PORT);
const stopServer = () => { try { server.close(); } catch {} };

let failed = 0;
const ok = (cond, msg) => { if (cond) console.log('  ok   ' + msg); else { failed++; console.log('  FAIL ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}${JSON.stringify(a) === JSON.stringify(b) ? '' : `  (got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)})`}`);
const shot = async (pg, name) => { if (SHOTS) await pg.screenshot({ path: `${SHOTS}/${name}.png` }); };

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function newPage(viewport = { width: 1440, height: 900 }, mobile = false) {
  const ctx = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile });
  const sheetPosts = [], errors = [];
  // wa.me and the sheet are external: answer them locally and record what was sent
  await ctx.route('https://wa.me/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>WhatsApp</h1>' }));
  await ctx.route(SHEET, (r) => { sheetPosts.push(JSON.parse(r.request().postData() || '{}')); r.fulfill({ status: 200, body: '{}' }); });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errors.push(String(e)));
  pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return { ctx, pg, sheetPosts, errors };
}
const count = (pg) => pg.evaluate(() => document.querySelector('[data-cart-count]').textContent);

try {
  /* ------------------------------------------------------------------ welcome gate + chain */
  console.log('\nwelcome gate and the 3D chain');
  {
    const { ctx, pg, sheetPosts, errors } = await newPage();
    await pg.addInitScript(() => { window.MGY_CHAIN_TEST = true; });
    await pg.goto(BASE + '/');
    await pg.waitForSelector('#welcome');
    ok(await pg.evaluate(() => document.documentElement.classList.contains('gated')), 'the shop is held back behind the gate');
    await pg.waitForFunction(() => window.__chain && window.__chain._state().ready, null, { timeout: 30000 });
    eq((await pg.evaluate(() => window.__chain._state())).phase, 'wait', 'the chains wait off-screen while the gate is up');
    await shot(pg, '1-gate');
    eq(await pg.locator('#welcome input').count(), 1, 'the gate has one field: email (no password)');
    await pg.fill('#wEmail', 'nope');
    await pg.press('#wEmail', 'Enter');
    ok(await pg.locator('#welcome[data-s=enter]').count() === 0, 'a bad email does not get through');
    await pg.fill('#wEmail', 'Michael@Example.com');
    for (const [theme, label] of [['light', 'light'], ['dark', 'dark']]) {
      await pg.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      const c = await pg.evaluate(() => { const e = getComputedStyle(document.getElementById('wEmail')); return [e.color, e.webkitTextFillColor, e.backgroundColor]; });
      eq(c, ['rgb(0, 0, 0)', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)'], `typed email is black on white in ${label} mode`);
    }
    await pg.press('#wEmail', 'Enter');
    await pg.waitForSelector('#welcome[data-s=enter]');
    await pg.waitForFunction(() => localStorage.getItem('mgySubscribed') === '1');
    ok(true, 'the email joins the waiting list and is remembered on this device');
    eq(await pg.evaluate(() => getComputedStyle(document.getElementById('wEmail')).color), 'rgb(0, 0, 0)', 'the email stays black after it is accepted');
    eq(sheetPosts.map((x) => [x.kind, x.email, x.source]), [['subscribe', 'michael@example.com', 'welcome']], 'the sign-up is logged once, lower-cased, with its source');
    await pg.click('#wGo');
    await pg.evaluate(() => window.__chain._tick(1 / 60, 6));
    const early = await pg.evaluate(() => window.__chain._state());
    eq(early.phase, 'falling', 'Enter world makes the chains fall');
    eq(early.phases, ['falling', 'wait'], 'the eagle necklace drops first and the MGY pendant follows a beat later');
    await pg.evaluate(() => window.__chain._tick(1 / 60, 420));
    const rest = await pg.evaluate(() => window.__chain._state());
    eq(rest.phase, 'hang', 'both chains are caught and hang');
    eq(rest.count, 2, 'two chains are in the scene');
    ok(rest.x[0] < 0 && rest.x[1] > 0 && rest.rects[0].x1 < rest.rects[1].x0, 'they hang side by side, the eagle on the left, the pendant on the right, with a gap between');
    ok(!(await pg.evaluate(() => document.documentElement.classList.contains('gated'))), 'the gate lifts');
    await pg.waitForSelector('#welcome', { state: 'detached' });
    await shot(pg, '2-chains-hanging');
    // inspect: pick the eagle by clicking it, the pendant by clicking it, then by the buttons, keys and the panel tabs
    const box = await pg.locator('[data-chain-canvas]').boundingBox();
    const centre = async (i) => { const r = (await pg.evaluate(() => window.__chain._state())).rects[i]; return [box.x + (r.x0 + r.x1) / 2, box.y + (r.y0 + r.y1) / 2]; };
    const sel = async () => (await pg.evaluate(() => window.__chain._state())).selected;
    const title = async () => (await pg.locator('.chain-panel.on h3').textContent()).trim();
    const settle = async (n = 120) => pg.evaluate((n) => window.__chain._tick(1 / 60, n), n);
    await pg.mouse.click(...await centre(0));
    await pg.waitForFunction(() => document.querySelector('[data-chain]').classList.contains('is-selected'));
    eq(await sel(), 0, 'clicking the eagle selects it');
    await settle();
    await shot(pg, '3-eagle-selected');
    eq(await title(), 'MGY Eagle Necklace', 'its product details open');
    eq(await pg.locator('.chain-panel.on .cp-cat').textContent(), 'Jewelry ↗', 'the panel names the product category');
    eq(await pg.locator('.chain-panel.on').count(), 1, 'only one details panel is open');
    const st = await pg.evaluate(() => window.__chain._state());
    ok(st.scale[0] > 1 && st.scale[1] < 0.6 && st.dim[1] > 0.9 && st.dim[0] < 0.05, 'the eagle comes forward; the pendant steps back and dims');
    await pg.mouse.click(...await centre(1));
    eq(await sel(), 1, 'clicking the other chain swaps the selection');
    await settle();
    await shot(pg, '4-pendant-selected');
    eq(await title(), 'MGY Pendant & Curb Chain', 'the pendant\'s details replace the eagle\'s');
    const st2 = await pg.evaluate(() => window.__chain._state());
    ok(st2.scale[1] > 1 && st2.scale[0] < 0.6, 'and the two trade places');
    await pg.click('.chain-panel.on .cp-tabs [data-chain-pick="0"]');
    eq(await sel(), 0, 'the tabs in the panel switch between the chains');
    eq(await pg.locator('.chain-panel.on .cp-tabs [aria-pressed=true]').textContent(), 'Eagle Necklace', 'the active tab is marked');
    await pg.focus('[data-chain-stage]');
    await pg.keyboard.press('2');
    eq(await sel(), 1, 'the number keys pick a chain');
    await pg.keyboard.press('Escape');
    await pg.waitForFunction(() => !document.querySelector('[data-chain]').classList.contains('is-selected'));
    eq(await sel(), -1, 'Escape closes the panel');
    await settle();
    // the hint buttons
    await pg.click('.chain-hint [data-chain-pick="1"]');
    eq(await sel(), 1, 'the button under the chains picks one');
    await pg.click('.chain-panel.on [data-chain-close]');
    eq(await sel(), -1, 'the close button deselects');
    await settle();
    // dragging turns only the chain you grab
    const before = await pg.evaluate(() => window.__chain._state().userYaw);
    const [cx, cy] = await centre(1);
    await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx + 90, cy, { steps: 6 }); await pg.mouse.up();
    const after = await pg.evaluate(() => window.__chain._state().userYaw);
    ok(after[1] - before[1] > 0.5 && Math.abs(after[0] - before[0]) < 0.001, 'dragging turns only the chain you grab');
    // a reload in the same visit must not bring the gate back
    await pg.reload();
    await pg.waitForSelector('[data-chain].is-ready', { timeout: 30000 });
    ok(!(await pg.evaluate(() => !!document.getElementById('welcome'))), 'the gate does not come back on a reload in the same visit');
    eq(errors.filter((e) => !/GL Driver|GPU stall/.test(e)), [], 'no console errors');
    await ctx.close();
  }

  /* ------------------------------------------------------------------ shop, cart, checkout */
  console.log('\nshop and checkout');
  {
    const { ctx, pg, sheetPosts, errors } = await newPage();
    await pg.goto(BASE + '/?nowelcome');
    await pg.waitForSelector('#grid .item');
    eq(await pg.locator('#grid .item').count(), 61, 'all 61 products are in the grid');
    ok(await pg.locator('#chips [data-filter="Tees"]').count() === 1 && await pg.locator('#chips [data-filter="Caps"]').count() === 1, 'the Tees and Caps chips exist');
    ok((await pg.locator('#grid .item').first().textContent()).length > 0 && (await pg.locator('#grid .item').first().getAttribute('data-cat')) !== 'Jewelry', 'the new lookbook products come first in the shop');

    await pg.click('#chips [data-filter="Jewelry"]');
    eq(await pg.locator('#grid .item:not([hidden])').count(), 4, 'the Jewelry chip shows 4 products');
    await pg.click('#chips [data-filter="All"]');

    // add a puffer in size L
    const puffer = pg.locator('#grid .item', { hasText: 'Funnel Neck Puffer' });
    await puffer.locator('select').selectOption('L');
    await puffer.locator('[data-add]').click();
    eq(await count(pg), '1', 'adding a puffer puts 1 in the cart');
    ok(await pg.locator('#order-bar').isVisible(), 'the order bar appears');

    // chain length changes the price
    const chain = pg.locator('#grid .item', { hasText: 'MGY Pendant & Curb Chain' });
    await chain.locator('select').selectOption('22 in');
    eq((await chain.locator('[data-price]').textContent()).trim(), '$95.00', 'picking 22 in shows that length\'s price');
    await chain.locator('[data-add]').click();
    eq(await count(pg), '2', '2 items now');

    await pg.click('.cart-btn');
    await pg.waitForSelector('#cart[open]');
    eq(await pg.locator('#cart-list li').count(), 2, 'the drawer lists both items');
    eq((await pg.locator('#cart-total').textContent()).trim(), '$245.00', 'subtotal is $150 + $95');
    ok((await pg.locator('#cart-list').textContent()).includes('L · $150.00'), 'the size is shown on the line');
    await shot(pg, '3-cart');

    // quantity stepper
    await pg.locator('[data-inc]').first().click();
    eq((await pg.locator('#cart-total').textContent()).trim(), '$395.00', '+ adds another puffer');
    await pg.locator('[data-dec]').first().click();

    // validation
    await pg.click('#cart-form button[type=submit]');
    ok((await pg.locator('[data-err=name]').textContent()).length > 0, 'a missing name is flagged');
    ok((await pg.locator('[data-err=address]').textContent()).length > 0, 'a missing address is flagged');
    eq(await pg.evaluate(() => window.__waOpened || 0), 0, 'nothing opens until the form is valid');
    eq(sheetPosts.length, 0, 'nothing is logged yet');

    await pg.fill('#co-name', 'Michael Test');
    await pg.fill('#co-phone', '+234 803 000 0000');
    await pg.fill('#co-email', 'mike@example.com');
    await pg.selectOption('#co-country', 'United Kingdom');
    await pg.fill('#co-address', '12 Test Road, London, N1 1AA');
    await pg.fill('#co-note', 'Gift wrap if possible');
    const [popup] = await Promise.all([ctx.waitForEvent('page'), pg.click('#cart-form button[type=submit]')]);
    const url = new URL(popup.url());
    eq(url.origin + url.pathname, `https://wa.me/${WA}`, 'WhatsApp opens on the shop number');
    const msg = url.searchParams.get('text');
    ok(/^\*NEW ORDER\* · Misguided Yutes\nRef: MGY-ORD-\d{4}-[0-9A-Z]{4}\n/.test(msg), 'the message starts with the order title and a reference');
    for (const part of ['*Name:* Michael Test', '*Phone:* +2348030000000', '*Email:* mike@example.com', '12 Test Road, London, N1 1AA', 'United Kingdom',
      '1. Funnel Neck Puffer (L) — $150.00', '2. MGY Pendant & Curb Chain (22 in) — $95.00', '*Subtotal:* $245.00', '*Note:* Gift wrap if possible'])
      ok(msg.includes(part), `message contains: ${part}`);
    const ref = msg.match(/Ref: (\S+)/)[1];
    await popup.close();
    eq(sheetPosts.length, 0, 'still nothing logged: the order is only counted once the customer confirms');

    // coming back from WhatsApp asks "did it go through?"
    await pg.evaluate(() => window.dispatchEvent(new Event('focus')));
    await pg.waitForSelector('#ask[open]');
    ok(await pg.locator('[data-yes]').isVisible(), 'the "did it go through?" question appears on return');
    await shot(pg, '4-did-it-send');
    await pg.press('#ask', 'Escape');
    ok(await pg.evaluate(() => document.getElementById('ask').open), 'Escape does not skip the question');
    await pg.click('[data-yes]');
    await pg.waitForSelector('#thanks[open]');
    await pg.waitForFunction(() => window.scrollY < 5, null, { timeout: 8000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
    eq(sheetPosts.length, 1, 'answering Yes logs exactly one order');
    const rec = sheetPosts[0];
    eq([rec.kind, rec.ref, rec.name, rec.country, rec.subtotal, rec.items.length, !!rec.token], ['order', ref, 'Michael Test', 'United Kingdom', 245, 2, true], 'the logged order matches what was sent');
    eq(await count(pg), '0', 'the cart is empty afterwards');
    await shot(pg, '5-thanks');
    await pg.click('[data-close-thanks]', { timeout: 2000 }).catch(() => {});   // it also closes by itself after a few seconds
    await pg.waitForFunction(() => !document.getElementById('thanks').open, null, { timeout: 8000 });

    // the "No" path
    await pg.locator('#grid .item', { hasText: 'Boxy Logo Hoodie' }).locator('[data-add]').click();
    await pg.click('.cart-btn'); await pg.waitForSelector('#cart[open]');
    eq(await pg.inputValue('#co-name'), 'Michael Test', 'the customer details were remembered');
    const [popup2] = await Promise.all([ctx.waitForEvent('page'), pg.click('#cart-form button[type=submit]')]);
    await popup2.close();
    await pg.evaluate(() => window.dispatchEvent(new Event('focus')));
    await pg.waitForSelector('#ask[open]');
    await pg.click('[data-no]');
    await pg.click('[data-why-send]');
    ok((await pg.locator('[data-why-hint]').textContent()).length > 0, 'a reason is required before sending the problem report');
    await pg.check('input[data-why-reason][value="WhatsApp did not open"]');
    await pg.click('[data-why-send]');
    await new Promise((r) => setTimeout(r, 300));
    eq(sheetPosts.length, 2, 'the problem is logged');
    eq([sheetPosts[1].kind, sheetPosts[1].reason], ['issue', 'WhatsApp did not open'], 'as an issue with its reason (not as an order)');
    await pg.click('[data-keep]');
    eq(await count(pg), '1', '"Keep my order" leaves the item in the cart');

    // the order survives a reload
    await pg.reload();
    await pg.waitForSelector('#grid .item');
    eq(await count(pg), '1', 'the cart survives a page reload');
    eq(errors, [], 'no console errors');
    await ctx.close();
  }

  /* ------------------------------------------------------------------ returning subscriber */
  console.log('\nreturning subscriber');
  {
    const { ctx, pg, errors } = await newPage();
    await pg.addInitScript(() => { try { localStorage.setItem('mgySubscribed', '1'); } catch {} });
    await pg.goto(BASE + '/');
    await pg.waitForSelector('#grid .item');
    eq(await pg.locator('#welcome').count(), 0, 'someone already on the list goes straight to the shop');
    eq(errors, [], 'no console errors');
    await ctx.close();
  }

  /* ------------------------------------------------------------------ lookbook + product page */
  console.log('\nlookbook and product page');
  {
    const { ctx, pg, errors } = await newPage();
    await pg.goto(BASE + '/?nowelcome&look=2');
    await pg.waitForSelector('#lfStage.ready');
    eq((await pg.locator('#lkName').textContent()).trim(), 'Dark Romance', '?look=2 opens the second look');
    eq(await pg.locator('.lc.on').count(), 1, 'exactly one look is in focus');
    eq(await pg.locator('.lc').count(), 11, 'all 11 looks float around the stage');
    eq(await pg.locator('.lp:not([hidden]) .piece').count(), 2, 'a look lists its 2 pieces');
    await pg.locator('#lookbook').scrollIntoViewIfNeeded();
    await new Promise((r) => setTimeout(r, 1200));
    await shot(pg, '6-lookbook');
    const w = async (i) => (await pg.locator(`.lc[data-card="${i}"]`).boundingBox()).width;
    const focusW = await w(1), otherW = await w(4);
    ok(focusW > otherW * 2, `the focused look is much larger than the others (${Math.round(focusW)}px vs ${Math.round(otherW)}px)`);
    // click another look: it takes the focus and the details spring forward
    await pg.locator('[data-pick="4"]').dispatchEvent('click');
    eq((await pg.locator('#lkName').textContent()).trim(), 'Brackets', 'clicking another look brings it into focus and swaps the details');
    eq(await pg.locator('.lc.on').getAttribute('data-card'), '4', 'the clicked card is the one in focus');
    ok(await pg.locator('#lkPanel.spring').count() === 1, 'the details panel springs forward');
    await new Promise((r) => setTimeout(r, 1200));
    ok((await w(4)) > (await w(1)) * 2, 'the clicked card grew and the old one shrank back');
    // front / back (Cream & Crest has a back photo)
    await pg.locator('[data-pick="3"]').dispatchEvent('click');
    await pg.locator('.lc.on [data-flip]').dispatchEvent('click');
    ok(await pg.locator('.lc.on.show-back').count() === 1, 'VIEW BACK flips the focused look to its back photo');
    await pg.locator('[data-pick="1"]').dispatchEvent('click');
    await pg.click('#addLook');
    eq(await count(pg), '2', 'Add full look puts both pieces in the cart');
    await pg.click('.arr.r');
    eq((await pg.locator('#lkName').textContent()).trim(), 'Pink Wash', 'the arrows step through the looks');
    await pg.keyboard.press('ArrowLeft');
    eq((await pg.locator('#lkName').textContent()).trim(), 'Dark Romance', 'the arrow keys step through the looks');
    // a LOOK tag in the shop jumps to that look
    await pg.locator('#grid a[data-look]').first().click();
    ok(await pg.locator('.lc.on').count() === 1, 'a LOOK tag on a shop card focuses that look');

    await pg.goto(BASE + '/product/mgy-pendant-curb-chain/');
    eq((await pg.locator('h1').textContent()).trim(), 'MGY Pendant & Curb Chain', 'product pages exist');
    await pg.selectOption('.pdp select', '24 in');
    eq((await pg.locator('.pdp [data-price]').textContent()).trim(), '$100.00', 'the price follows the chain length');
    const ld = JSON.parse(await pg.locator('script[type="application/ld+json"]').first().textContent());
    eq([ld['@type'], ld.offers.lowPrice, ld.offers.highPrice], ['Product', 85, 100], 'structured data for search engines is present');
    await shot(pg, '7-product');
    eq(errors, [], 'no console errors');
    await ctx.close();
  }

  /* ------------------------------------------------------------------ phone layout */
  console.log('\nphone layout');
  {
    const { ctx, pg, errors } = await newPage({ width: 390, height: 844 }, true);
    for (const path of ['/?nowelcome', '/product/funnel-neck-puffer/']) {
      await pg.goto(BASE + path);
      await pg.waitForSelector('main');
      const over = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(over <= 1, `${path} has no sideways scrolling on a phone (overflow ${over}px)`);
    }
    await pg.goto(BASE + '/?nowelcome');
    await pg.waitForSelector('#lfStage.ready');
    const sb = await pg.locator('#lfStage').boundingBox(), fb = await pg.locator('.lc.on').boundingBox();
    ok(fb.x >= sb.x - 1 && fb.x + fb.width <= sb.x + sb.width + 1, 'the focused look fits inside the stage on a phone');
    await pg.locator('#grid .item [data-add]').first().click();
    await pg.click('.cart-btn'); await pg.waitForSelector('#cart[open]');
    await shot(pg, '8-phone-cart');
    await new Promise((r) => setTimeout(r, 800));   // let the drawer finish sliding in
    const form = await pg.locator('#cart-form').boundingBox();
    ok(form && form.x >= 0 && form.x + form.width <= 390, 'the cart drawer fits the phone screen');
    eq(errors, [], 'no console errors');
    await ctx.close();
  }
} catch (e) {
  failed++; console.log('\nTEST CRASHED:', e.message);
} finally {
  await browser.close();
  stopServer();
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll browser checks passed');
process.exit(failed ? 1 : 0);
