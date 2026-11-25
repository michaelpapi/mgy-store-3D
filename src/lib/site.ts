// Build-time helpers (run during `astro build`, never shipped to the browser).
import site from '../data/site.json';
import catalog from '../data/products.json';
import lookData from '../data/looks.json';
import lookMedia from '../data/looks-media.json';   // photo sizes, written by npm run images
import { siteSchema, productsSchema, looksSchema } from '../config/schema.ts';

export const config = siteSchema.parse(site); // throws with an exact path if the config is wrong
// Environment variables win over site.json, so the WhatsApp number and the sheet link can live in Netlify
// (Site settings -> Environment variables) instead of the repo:  PUBLIC_WHATSAPP=14045550123   PUBLIC_LEADS_URL=https://script.google.com/macros/s/.../exec
const env = (import.meta as any).env ?? {};
if (env.PUBLIC_WHATSAPP) config.contact.whatsapp = siteSchema.shape.contact.shape.whatsapp.parse(String(env.PUBLIC_WHATSAPP).replace(/\D/g, ''));
if (env.PUBLIC_LEADS_URL) config.leads.url = siteSchema.shape.leads.shape.url.parse(String(env.PUBLIC_LEADS_URL));
const parsed = productsSchema.parse(catalog);
export const products = parsed.products;
export type Product = (typeof products)[number];
export type Variant = Product['variants'][number];

export const byHandle = new Map(products.map((p) => [p.handle, p]));

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const money = (n: number) => fmt.format(n);
export const priceText = (p: Pick<Product, 'price' | 'priceVaries'>) => `${p.priceVaries ? 'From ' : ''}${money(p.price)}`;

export const big = (file: string) => `/products/${file}.webp`;
export const small = (file: string) => `/products/${file}-sm.webp`;

const isColor = (n: string) => /^colou?r$/i.test(n);

/** The photo shown when a variant is picked, and its "back" photo (if any).
 *  Back photo rule (same as the Shopify theme): an image whose alt text contains the word "back" (and the colour name when the
 *  product has a Color option). With no Color option, exactly 2 photos and none marked "back", the 2nd one is the back. */
export function photosFor(p: Product, v: Variant) {
  const front = v.image || p.images[0].file;
  const ci = p.options.findIndex((o) => isColor(o.name));
  const colour = ci >= 0 ? (v.options[ci] || '').toLowerCase() : '';
  const marked = p.images.filter((i) => /\bback\b/i.test(i.alt));
  let back: string | null = null;
  for (const i of marked) if (ci < 0 || i.alt.toLowerCase().includes(colour)) { back = i.file; break; }
  if (!back && ci < 0 && marked.length === 0 && p.images.length === 2) back = p.images[1].file;
  return { front, back };
}

export const available = (v: Variant) => v.stock === null || v.stock > 0;
export const hasBack = (p: Product) => p.variants.some((v) => photosFor(p, v).back);

/* ---------- looks ---------- */
const lk = looksSchema.parse(lookData).looks;
export const looks = lk.map((l, i) => {
  const lead = l.lead ? byHandle.get(l.lead) : undefined;
  if (l.lead && !lead) throw new Error(`looks.json: look "${l.name}" lead "${l.lead}" is not a product`);
  if (!l.image && !lead) throw new Error(`looks.json: look "${l.name}" needs an "image" (model photo) or a "lead" product`);
  const pieces = l.products.map((h) => {
    const p = byHandle.get(h);
    if (!p) throw new Error(`looks.json: look "${l.name}" uses "${h}", which is not a product in products.json`);
    return p;
  });
  const front = l.image || big(photosFor(lead!, lead!.variants[0]).front);
  const media = (lookMedia as Record<string, { w: number; h: number }>)[(l.image || '').replace(/^\/looks\/|\.webp$/g, '')];
  const ar = media ? Math.round((media.w / media.h) * 1000) / 1000 : 0.8;   // width / height, so a card is the shape of its photo
  return { n: i + 1, name: l.name, tagline: l.tagline, front, back: l.backImage || '', flat: !l.image, ar, showsBack: l.showsBack, pieces };
});
export const lookNumberOf = (handle: string) => looks.find((l) => l.pieces.some((p) => p.handle === handle))?.n ?? 0;

export const waDigits = config.contact.whatsapp;
export const igUrl = `https://instagram.com/${config.contact.instagram}`;

const json = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');
export { json };

/** The JSON the browser scripts read: the cart, variants, photos and the look list. Kept small on purpose. */
export function clientData() {
  return {
    business: config.business.name,
    whatsapp: config.contact.whatsapp,
    currency: config.currency,
    countries: config.shipping.countries,
    shippingNote: config.shipping.note,
    leads: config.leads.url ? { url: config.leads.url, token: config.leads.token, logOrders: config.leads.logOrders } : null,
    products: products.map((p) => ({
      h: p.handle, t: p.title, ty: p.type, o: p.options,
      v: p.variants.map((v) => {
        const ph = photosFor(p, v);
        return { s: v.sku, o: v.options, p: v.price, a: available(v) ? 1 : 0, f: ph.front, b: ph.back };
      }),
    })),
  };
}
