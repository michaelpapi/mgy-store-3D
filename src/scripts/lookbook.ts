/* Lookbook: a field of floating looks. One look is in focus; the rest drift around it. Click or tap another and it takes the
   focus while its details panel springs forward. Also: arrows / swipe / keyboard, front/back view, "Add full look", deep links
   (?look=3, and the LOOK 03 tags on shop cards). The motion itself is CSS (mgy.css); this file only decides where each card sits. */
import { $, $$, toast, thumb, prodByHandle } from './data.ts';
import { cart } from './cart.ts';
import { fly } from './fly.ts';
import { refresh, variantFor, jump } from './shop.ts';

type LookJ = { n: string; t: string; front: string; back: string; sb: boolean; ar: number };
type Slot = { x: number; y: number; s: number; r: number };

/* Where the look in focus sits, and where every other look floats (centre point as % of the stage, size relative to the focused card).
   Look number i always floats at slot i, so cards return to the same place when they lose the focus. */
const FOCUS_WIDE: Slot = { x: 31, y: 50, s: 1, r: 0 };
const FOCUS_NARROW: Slot = { x: 50, y: 43, s: .74, r: 0 };
const WIDE: Slot[] = [
  { x: 5, y: 17, s: .36, r: -8 }, { x: 6, y: 52, s: .30, r: 5 }, { x: 5, y: 86, s: .34, r: -5 }, { x: 19, y: 5, s: .28, r: 7 },
  { x: 20, y: 95, s: .30, r: -6 }, { x: 42, y: 3, s: .27, r: -5 }, { x: 45, y: 97, s: .28, r: 6 }, { x: 57, y: 24, s: .36, r: 6 },
  { x: 58, y: 52, s: .32, r: -6 }, { x: 57, y: 80, s: .36, r: 5 }, { x: 68, y: 6, s: .26, r: -8 },
];
const NARROW: Slot[] = [
  { x: 11, y: 12, s: .40, r: -8 }, { x: 89, y: 13, s: .40, r: 7 }, { x: 8, y: 50, s: .38, r: 5 }, { x: 92, y: 52, s: .38, r: -6 },
  { x: 12, y: 84, s: .40, r: -5 }, { x: 88, y: 85, s: .40, r: 6 }, { x: 32, y: 3, s: .28, r: 6 }, { x: 68, y: 3, s: .28, r: -6 },
  { x: 30, y: 97, s: .28, r: -5 }, { x: 70, y: 97, s: .28, r: 5 }, { x: 50, y: 99, s: .26, r: 4 },
];

export function initLookbook() {
  const lj = $('#looks-json'); if (!lj) return;
  let LK: LookJ[] = [];
  try { LK = JSON.parse(lj.textContent || '[]'); } catch { /* no looks */ }
  if (!LK.length) return;

  const stage = $('#lfStage')!, root = $('#lookbook')!;
  const cards = $$<HTMLElement>('.lc', stage);
  const narrowQuery = matchMedia('(max-width:1000px)');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let act = 0;
  const back: Record<number, boolean> = {};          // which looks are showing their back photo

  const slotFor = (i: number): Slot => {
    const list = narrowQuery.matches ? NARROW : WIDE;
    return list[i % list.length];
  };

  function place() {
    const focus = narrowQuery.matches ? FOCUS_NARROW : FOCUS_WIDE;
    cards.forEach((c, i) => {
      const on = i === act, s = on ? focus : slotFor(i);
      c.style.setProperty('--x', s.x + '%'); c.style.setProperty('--y', s.y + '%');
      c.style.setProperty('--s', String(s.s)); c.style.setProperty('--r', s.r + 'deg');
      c.style.setProperty('--z', String(on ? 60 : 10 + Math.round(s.s * 20)));
      c.style.setProperty('--blur', on ? '0px' : (1.6 - s.s * 2.2).toFixed(2) + 'px');   // the smaller (further) the card, the softer
      c.style.setProperty('--dp', on ? '.25' : (0.5 + s.s).toFixed(2));                   // parallax depth
      c.classList.toggle('on', on);
      const hit = $<HTMLButtonElement>('.lc-hit', c)!;
      hit.setAttribute('aria-current', on ? 'true' : 'false');
      c.classList.toggle('show-back', !!back[i] && !!LK[i].back);
      const vt = $<HTMLButtonElement>('.vt', c); if (vt) { vt.tabIndex = on ? 0 : -1; vt.textContent = back[i] ? 'VIEW FRONT' : 'VIEW BACK'; }
    });
  }

  function details() {
    const lk = LK[act], showBack = !!back[act] || (lk.sb && back[act] === undefined);
    $('#lkNum')!.textContent = `LOOK ${String(act + 1).padStart(2, '0')} / ${String(LK.length).padStart(2, '0')}`;
    $('#lkName')!.textContent = lk.n || '';
    $('#lkTag')!.textContent = lk.t || '';
    $('#lkCap')!.textContent = `${String(act + 1).padStart(2, '0')} · ${lk.n}`;
    let cur: HTMLElement | null = null;
    $$('.lp').forEach((p) => { const show = Number(p.dataset.look) === act; p.hidden = !show; if (show) cur = p; });
    const btn = $<HTMLButtonElement>('#addLook')!;
    if (cur) {
      $$('.piece', cur).forEach((pc) => { pc.dataset.bk = showBack ? '1' : '0'; refresh($<HTMLElement>('.buy', pc)); });
      const n = Number((cur as HTMLElement).dataset.count);
      btn.textContent = n ? `Add full look · ${(cur as HTMLElement).dataset.total}` : 'No pieces in this look yet';
      btn.disabled = !n;
    }
    // spring the panel forward: restart its animation, and stagger what's inside it
    const panel = $('#lkPanel')!;
    panel.classList.remove('spring'); void panel.offsetWidth;
    let k = 0;
    [$('.p-top', panel), ...$$('.lp:not([hidden]) .piece', panel), btn].forEach((el) => { if (el) (el as HTMLElement).style.setProperty('--i', String(k++)); });
    panel.classList.add('spring');
  }

  function go(i: number, opts: { scrollIntoView?: boolean } = {}) {
    act = (i + LK.length) % LK.length;
    place(); details();
    if (opts.scrollIntoView && narrowQuery.matches) { const r = stage.getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight) jump('#lookbook'); }
  }

  /* ----- clicks ----- */
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    let el: HTMLElement | null;
    if ((el = t.closest('[data-pick]'))) { const i = Number(el.dataset.pick); if (i !== act) go(i, { scrollIntoView: true }); return; }
    if ((el = t.closest('[data-flip]'))) { const i = Number(el.dataset.flip); back[i] = !back[i]; if (i === act) { place(); details(); } return; }
    if ((el = t.closest('[data-lk-step]'))) { go(act + Number(el.dataset.lkStep)); return; }
    if (t.closest('[data-to-panel]')) { $('#lkPanel')!.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); return; }
    if (t.closest('[data-add-look]')) {
      const panel = $('.lp:not([hidden])'); if (!panel) return;
      const skus: string[] = []; let bad = false;
      $$('.buy', panel).forEach((b) => { const v = variantFor(b); if (!v || !v.a) bad = true; else skus.push(v.s); });
      if (bad) return toast('One of these pieces is sold out in that size');
      if (cart.addMany(skus)) {
        const first = prodByHandle.get($<HTMLElement>('.buy', panel)?.dataset.pid || '');
        if (first) fly(t.closest('[data-add-look]') as HTMLElement, thumb(first.v[0].f));
        toast(`${LK[act]?.n || 'Look'} added to your order`);
      }
    }
  });
  // "LOOK 03" tags on shop cards and product pages
  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest('a[data-look]') as HTMLElement | null;
    if (el && $('#lookbook')) { e.preventDefault(); go(Number(el.dataset.look) - 1); jump('#lookbook'); }
  });

  /* ----- keyboard: left/right arrows while the lookbook has the focus ----- */
  root.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(act + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(act - 1); }
  });

  /* ----- swipe on the stage (phones) ----- */
  let tx: number | null = null, ty = 0;
  stage.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (tx == null) return;
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; tx = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) go(act + (dx < 0 ? 1 : -1));
  });

  /* ----- a little parallax with the pointer (mouse only) ----- */
  if (!reduce && matchMedia('(pointer:fine)').matches) {
    stage.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      stage.style.setProperty('--px', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
      stage.style.setProperty('--py', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
    });
    stage.addEventListener('pointerleave', () => { stage.style.setProperty('--px', '0'); stage.style.setProperty('--py', '0'); });
  }

  /* ----- only drift while the lookbook is on screen ----- */
  if ('IntersectionObserver' in window) new IntersectionObserver(([en]) => root.classList.toggle('paused', !en.isIntersecting), { rootMargin: '80px' }).observe(root);
  narrowQuery.addEventListener('change', place);

  const ln = parseInt(new URLSearchParams(location.search).get('look') || '', 10);
  if (ln >= 1 && ln <= LK.length) { act = ln - 1; setTimeout(() => jump('#lookbook'), 60); }
  place(); details();
  stage.classList.add('ready');
}
