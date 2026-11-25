/* Shop behaviour shared by the grid, product pages, the lookbook panel and the chain panel:
   size / colour pickers, front-back photo, Add to cart, the category filter. */
import { $, $$, prodByHandle, thumb, photo, toast, announce, type Variant } from './data.ts';
import { cart } from './cart.ts';
import { fly } from './fly.ts';
import { usd } from './wa.ts';

/** the variant matching the pickers inside one .buy block */
export function variantFor(buy: HTMLElement): Variant | null {
  const p = prodByHandle.get(buy.dataset.pid || ''); if (!p) return null;
  const sels = $$<HTMLSelectElement>('select[data-opt]', buy);
  if (!sels.length) return p.v[0] || null;
  const vals: string[] = [];
  sels.forEach((s) => { vals[Number(s.dataset.opt)] = s.value; });
  return p.v.find((v) => v.o.every((o, i) => vals[i] == null || o === vals[i])) || null;
}

/** update the Add button and the photo for the chosen options */
export function refresh(buy: HTMLElement | null) {
  if (!buy) return;
  const v = variantFor(buy), holder = buy.closest<HTMLElement>('.item,.piece,.pdp');
  const add = $<HTMLButtonElement>('[data-add]', buy);
  if (add) {
    add.disabled = !v || !v.a;
    add.textContent = !v ? 'Unavailable' : v.a ? 'Add to cart' : 'Sold out';
  }
  if (!v || !holder) return;
  const img = $<HTMLImageElement>('.ph img', holder), back = holder.dataset.bk === '1' && v.b;
  const file = back ? v.b! : v.f;
  const src = holder.classList.contains('pdp') ? photo(file) : thumb(file);
  if (img && img.getAttribute('src') !== src) img.setAttribute('src', src);
  const fb = $('[data-flip]', holder);
  if (fb) {
    fb.style.display = v.b ? '' : 'none';
    if (!v.b) holder.dataset.bk = '0';
    fb.textContent = holder.dataset.bk === '1' ? 'VIEW FRONT' : 'VIEW BACK';
  }
}
const refreshAll = () => $$('.buy').forEach(refresh);

/* ---- category filter ---- */
function filt(c: string) {
  $$('#chips [data-filter]').forEach((b) => b.classList.toggle('on', b.dataset.filter === c));
  $$('#nav a[data-filter]').forEach((b) => b.classList.toggle('on', b.dataset.filter === c));
  $$('#grid .item').forEach((it) => { it.hidden = !(c === 'All' || it.dataset.cat === c); });
  const n = $$('#grid .item').filter((it) => !it.hidden).length;
  const e = $('#grid-empty'); if (e) e.hidden = n > 0;
}
export const jump = (sel: string) => { const e = $(sel); if (e) e.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };

export function initShop() {
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    let el: HTMLElement | null;

    if ((el = t.closest('[data-add]'))) {
      const buy = el.closest<HTMLElement>('.buy'); if (!buy) return;
      const v = variantFor(buy);
      if (!v || !v.a) return toast('That option is not available');
      if (cart.add(v.s)) { fly(el, thumb(v.f)); announce('Added to your order'); }
      return;
    }
    if ((el = t.closest('[data-flip]'))) {
      const h = el.closest<HTMLElement>('.item'); if (!h) return;
      h.dataset.bk = h.dataset.bk === '1' ? '0' : '1';
      refresh($<HTMLElement>('.buy', h));
      return;
    }
    if ((el = t.closest('[data-thumb]'))) {
      const im = $<HTMLImageElement>('.pdp .ph img'); if (im) im.setAttribute('src', el.dataset.thumb || '');
      return;
    }
    if ((el = t.closest('[data-filter]'))) {
      if ($('#shop')) { e.preventDefault(); filt(el.dataset.filter || 'All'); jump('#shop'); }
      return;
    }
    if ((el = t.closest('[data-jump]'))) {
      if ($(el.dataset.jump || '')) { e.preventDefault(); jump(el.dataset.jump!); }
    }
  });

  document.addEventListener('change', (e) => {
    const sel = (e.target as HTMLElement).closest?.('.buy select') as HTMLSelectElement | null;
    if (!sel) return;
    const buy = sel.closest<HTMLElement>('.buy')!, holder = buy.closest<HTMLElement>('.item');
    if (holder && sel.hasAttribute('data-color')) holder.dataset.bk = '0';
    refresh(buy);
    // jewelry prices differ by length: show the chosen option's price
    const p = prodByHandle.get(buy.dataset.pid || ''), v = variantFor(buy);
    if (p && v && new Set(p.v.map((x) => x.p)).size > 1) {
      const pr = buy.closest('.item,.piece,.pdp,.chain-panel')?.querySelector('[data-price]');
      if (pr) pr.textContent = usd(v.p);
    }
  });

  const q = new URLSearchParams(location.search);
  filt(q.get('cat') || 'All');
  refreshAll();
  if (q.get('cat') && $('#shop')) setTimeout(() => jump('#shop'), 60);
}
