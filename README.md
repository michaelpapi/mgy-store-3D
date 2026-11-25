# Misguided Yutes: store

The MGY merch site, rebuilt on [Astro](https://astro.build) with no Shopify. It is a static site (plain HTML, CSS and a little JavaScript), so it is fast and cheap to host.

Checkout works like Rain G's Place: the customer builds a cart, fills in a short form, and the order opens in **WhatsApp**, pre-written. When they come back to the site it asks "Did your message go through?" and, on **Yes**, logs the order to a Google Sheet.

## Run it

You need Node 22.18 or newer.

```bash
npm install
npm run dev        # http://localhost:4321 (also on your network, so you can open it on your phone)
```

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Builds the site into `dist/` |
| `npm run preview` | Serves the built site locally, the closest thing to what Netlify will serve |
| `npm run validate` | Checks the built site: pages, images, links, config. Prints what is still to fill in |
| `npm test` | Unit tests (WhatsApp message, phone/email checks, CSV import, Google Sheet script) |
| `npm run test:browser` | Full walk-through in a real browser (gate, 3D chain, cart, checkout). Needs `npx playwright install chromium` once |
| `npm run catalog` | Rebuilds `src/data/products.json` from the CSVs in `catalog-src/` |
| `npm run images` | Rebuilds the web-sized product images from `photos-src/products/` |

Add `?nowelcome` to the address to skip the welcome gate while working, or `?welcome` to force it.

## Put it live on Netlify

1. Put this folder in a GitHub repository.
2. In Netlify: **Add new site > Import an existing project**, pick the repository. The settings come from `netlify.toml` (build `npm run build`, publish `dist`), so just deploy.
   Or without Git: run `npm run build`, then drag the `dist` folder onto Netlify's deploy page.
3. Under **Site configuration > Environment variables** add:
   - `PUBLIC_WHATSAPP`: the shop's WhatsApp number, digits only with the country code, e.g. `14045550123`
   - `PUBLIC_LEADS_URL`: the Google Apps Script web app URL (see below), optional
4. Redeploy. These two are read at build time, so changing them needs a new deploy.

**Until `PUBLIC_WHATSAPP` (or `contact.whatsapp` in `src/data/site.json`) is set, the cart shows "checkout is not switched on" instead of the order form.** That is deliberate, so nobody can send an order to a wrong number.

## Saving orders to a Google Sheet

Follow `docs/google-sheets-leads/SETUP.md` (about 10 minutes). It gives you a URL ending in `/exec`; that is `PUBLIC_LEADS_URL`. The secret in `Code.gs` already matches `leads.token` in `src/data/site.json`.

## Where to change things

| To change | Edit |
|---|---|
| Business name, tagline, city, Instagram, WhatsApp number, shipping countries, handling time, welcome-gate launch date and video, the 3D showcase's headline and which pieces it shows (`chain.items`) | `src/data/site.json` |
| Products, prices, sizes, stock | `catalog-src/*.csv` (the Shopify import files), then `npm run catalog` |
| Product photos | Put them in `photos-src/products/` using the same file names, then `npm run images` |
| Looks in the lookbook | `src/data/looks.json` |
| Colours, fonts, spacing | `src/styles/mgy.css` (variables at the top) |
| The 3D models (one `.glb` per piece) | `public/models/` (`mgy-eagle-necklace.glb`, `mgy-chain.glb`) |
| The MGY logo (header, welcome screen, footer, link preview) | Replace `assets-src/mgy-logo-3d.glb`, then `npm run logo`. It renders the 3D file into the transparent images in `public/brand/`. The look (colour, gloss, light) is the `LOOK` block at the top of `scripts/render-logo.mjs` |
| Page layout | `src/components/*.astro`, `src/pages/` |

**The 3D showcase (two chains).** `chain.items` in `src/data/site.json` lists the pieces left to right: the eagle necklace (gold) first, then the MGY pendant (silver). Each item has the `product` handle it belongs to, the `model` file in `public/models/`, its `metal` (`gold` or `silver`) and a short `label` for the buttons. Both fall in together when the welcome screen opens, hang side by side, and each can be dragged to turn. Click or tap one (or use the buttons under them, the tabs in the details panel, or the 1 / 2 keys) to bring it forward and open its product details; picking the other swaps them. Use 1 to 3 items; the layout adapts.

**Adding or changing a 3D model.** Export a `.glb` (meters or any scale, clasp at the top, no textures needed), then shrink it for the web: `node scripts/optimize-glb.mjs in.glb public/models/name.glb 0.3` (the last number is the share of triangles to keep; the 12 MB eagle export became 0.8 MB at 0.3 with no visible loss). Product photos can be rendered from the model with `node scripts/render-model-photos.mjs public/models/name.glb photos-src/products/<handle> gold` (the eagle necklace's photos are such renders; replace them with real photos whenever you have them and run `npm run images`). `catalog-src/add_eagle_necklace.py` added the eagle necklace product (prices, stock and weights in it are placeholders).

**Lookbook.** Each look in `src/data/looks.json` is a model photo that floats around the lookbook; one is in focus and clicking another brings it forward and springs its pieces panel up. To add or change a look: drop the photo in `photos-src/looks/`, run `npm run images` (makes `public/looks/<name>.webp` and records its size), then add an entry to `looks.json` with `name`, `tagline`, `image` (`/looks/<name>.webp`), optional `backImage` / `showsBack`, and `products` (product handles that appear in the photo). Visit `/?look=3` to open look 3 directly.

**Adding products.** Products live in the two Shopify-format CSVs in `catalog-src/` (run `npm run catalog` after editing them). `catalog-src/add_lookbook_products.py` is the script that added the lookbook products (Tees, Hoodies, Bottoms, Caps); it is safe to run again. Names, prices, weights and stock on those are placeholders, so change them in the CSVs.

**Welcome gate.** The first page takes an email only. It goes to the waiting list sheet (`subscribe` rows) and the visitor is remembered on that device (`localStorage`), so they go straight to the shop next time. `?welcome` forces the gate for testing; `?nowelcome` skips it.

**Sold out.** A size shows as sold out when its stock is 0. A blank stock means "always available". Cart quantity is capped at 10 per item.

## How the checkout is put together

- `src/scripts/cart.ts`: the cart, saved in the browser (`localStorage`), keyed by variant SKU
- `src/scripts/wa.ts`: builds the WhatsApp message, the order reference (`MGY-ORD-MMDD-XXXX`) and checks phone/email
- `src/scripts/cartui.ts`: the drawer, form and hand-off to WhatsApp
- `src/scripts/sent.ts`: the "did your message go through?" flow; **Yes** logs the order, **No** asks why and logs a problem instead
- `src/scripts/leads.ts`: posts to the Google Sheet script

Notes for the owner:

- **There is no online payment.** The message asks the shop to confirm availability, shipping and how to pay, and that is arranged in the WhatsApp chat. If you later want card payments, add a payment link (Stripe, PayPal) at that step.
- The subtotal does not include shipping or taxes; the message says so.
- Orders reach the sheet only when the customer says the message was sent, so the sheet never fills up with abandoned carts.
