/* Reads the JSON the page was built with (src/lib/site.ts -> clientData) and a few DOM helpers. */
export type Variant = { s: string; o: string[]; p: number; a: 0 | 1; f: string; b: string | null };
export type Prod = { h: string; t: string; ty: string; o: { name: string; values: string[] }[]; v: Variant[] };
export type Country = { code: string; name: string };
export type AppData = {
  business: string;
  whatsapp: string;
  currency: string;
  countries: Country[];
  shippingNote: string;
  leads: { url: string; token: string; logOrders: boolean } | null;
  products: Prod[];
};

export const APP: AppData = JSON.parse(document.getElementById('app-data')?.textContent || '{"products":[],"countries":[]}');
export const prodByHandle = new Map<string, Prod>(APP.products.map((p) => [p.h, p]));
/** every variant, found by its SKU */
export const varBySku = new Map<string, { p: Prod; v: Variant }>(APP.products.flatMap((p) => p.v.map((v) => [v.s, { p, v }] as const)));

export const thumb = (file: string) => `/products/${file}-sm.webp`;
export const photo = (file: string) => `/products/${file}.webp`;
export const variantLabel = (v: Variant) => v.o.join(' / ');

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
export const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

export function announce(msg: string) {
  const el = document.getElementById('live');
  if (el) { el.textContent = ''; setTimeout(() => (el.textContent = msg), 30); }
}
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let toastTimer = 0;
export function toast(msg: string) {
  const el = document.getElementById('toast'); if (!el) return;
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => el.classList.remove('on'), 2200);
  announce(msg);
}
