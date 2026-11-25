/* Everything the visitor sees of the order: the cart drawer, the sticky order bar, the header count and the WhatsApp hand-off.
   Add buttons live in shop.ts / lookbook.ts / chain showcase and call cart.add(). What happens when the customer comes back from
   WhatsApp is in sent.ts. */
import { $, $$, APP, announce } from './data.ts';
import { cart, MAX_QTY } from './cart.ts';
import { totals, usd, orderMessage, waUrl, makeRef, cleanPhone, validEmail } from './wa.ts';
import { openDialog, closeDialog } from './ui.ts';
import { expectReturn } from './sent.ts';

const drawer = () => $<HTMLDialogElement>('#cart');
let lastCount = -1;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function render() {
  const lines = cart.lines();
  const t = totals(lines);

  // header badge + order bar
  const badge = $('[data-cart-count]');
  if (badge) {
    badge.textContent = String(t.count);
    badge.classList.toggle('on', t.count > 0);
    if (t.count !== lastCount && lastCount !== -1 && t.count > 0) { badge.classList.remove('pop'); void badge.offsetWidth; badge.classList.add('pop'); }
  }
  lastCount = t.count;
  const bar = $('#order-bar');
  document.documentElement.classList.toggle('has-order', t.count > 0);
  if (bar) {
    bar.hidden = t.count === 0;
    const bc = $('[data-bar-count]', bar); if (bc) bc.textContent = plural(t.count, 'item', 'items');
    const bt = $('[data-bar-total]', bar); if (bt) bt.textContent = usd(t.subtotal);
  }

  // drawer
  const list = $('#cart-list'), empty = $('#cart-empty'), totalsBox = $('#cart-totals'), form = $('#cart-form');
  if (!list || !empty || !totalsBox || !form) return;
  list.replaceChildren(...lines.map((l) => {
    const li = document.createElement('li');
    li.innerHTML = `<div class="thumb"><img src="${l.image}" width="64" height="80" alt="" draggable="false"></div>
      <div class="ci-t"><b></b><small></small></div>
      <div class="stepper" role="group"><button type="button" data-dec="${l.id}" aria-label="Remove one">−</button><output>${l.qty}</output><button type="button" data-inc="${l.id}" aria-label="Add one more"${l.qty >= MAX_QTY ? ' disabled' : ''}>+</button></div>
      <button class="rm" type="button" data-remove="${l.id}">Remove</button>`;
    li.querySelector('b')!.textContent = l.name;
    li.querySelector('small')!.textContent = `${l.variant ? l.variant + ' · ' : ''}${usd(l.price * l.qty)}`;
    return li;
  }));
  const has = lines.length > 0;
  empty.hidden = has; totalsBox.hidden = !has; form.hidden = !has;
  if (has) $('#cart-total')!.textContent = usd(t.subtotal);
}

/* ---- buttons (event delegation covers drawer rows and the order bar) ---- */
function initButtons() {
  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-inc],[data-dec],[data-remove],[data-open-cart],[data-close-cart]');
    if (!el) return;
    const ds = el.dataset;
    if (ds.inc !== undefined) cart.add(ds.inc);
    else if (ds.dec !== undefined) cart.dec(ds.dec);
    else if (ds.remove !== undefined) cart.remove(ds.remove);
    else if (el.hasAttribute('data-open-cart')) { openDialog(drawer()); }
    else if (el.hasAttribute('data-close-cart')) closeDialog(drawer());
  });
  $('#cart-clear')?.addEventListener('click', () => { if (confirm('Clear everything in your order?')) cart.clear(); });
}

/* ---- customer details: saved as they type, so nothing is lost on a refresh ---- */
function initForm() {
  const f = {
    name: $<HTMLInputElement>('#co-name')!, phone: $<HTMLInputElement>('#co-phone')!, email: $<HTMLInputElement>('#co-email')!,
    country: $<HTMLSelectElement>('#co-country')!, address: $<HTMLTextAreaElement>('#co-address')!, note: $<HTMLInputElement>('#co-note')!,
  };
  const keys = Object.keys(f) as (keyof typeof f)[];
  const fill = () => {
    const c = cart.customer();
    for (const k of keys) if (document.activeElement !== f[k]) f[k].value = c[k];
    if (!f.country.value) f.country.value = APP.countries[0]?.name || ''; // first country in site.json is the default
  };
  fill();
  window.addEventListener('cart:change', fill);
  for (const k of keys) f[k].addEventListener('input', () => cart.setCustomer({ [k]: f[k].value.trim() }));

  const form = $<HTMLFormElement>('#cart-form')!;
  const err = (key: string, msg: string) => { const p = form.querySelector(`[data-err="${key}"]`); if (p) p.textContent = msg; p?.closest('.field')?.classList.toggle('bad', !!msg); };
  const off = $('#cart-off');

  if (!APP.whatsapp && off) { off.hidden = false; } // no WhatsApp number in site.json yet

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!APP.whatsapp) { announce('Checkout is not switched on yet'); off?.scrollIntoView({ block: 'nearest' }); return; }
    const name = f.name.value.trim(), address = f.address.value.trim(), rawPhone = f.phone.value.trim(), email = f.email.value.trim();
    const phone = rawPhone ? cleanPhone(rawPhone) : '';
    err('name', name ? '' : 'Please tell us your name.');
    err('address', address.length >= 8 ? '' : 'Please add the full address we should ship to.');
    err('phone', !rawPhone || phone ? '' : 'That phone number does not look right.');
    err('email', !email || validEmail(email) ? '' : 'That email does not look right.');
    if (!name || address.length < 8 || (rawPhone && !phone) || (email && !validEmail(email))) { (form.querySelector('.bad input, .bad textarea') as HTMLElement | null)?.focus(); return; }

    const lines = cart.lines();
    if (!lines.length) return;
    const ref = makeRef();
    const customer = { name, phone: phone || rawPhone, email, country: f.country.value, address, note: f.note.value.trim() };
    const msg = orderMessage({ business: APP.business, ref, customer, lines });
    const url = waUrl(APP.whatsapp, msg);
    const t = totals(lines);
    // not counted yet: the order is only logged once the customer confirms on return that they sent it (sent.ts)
    const rec = { ref, ...customer, items: lines.map((l) => ({ id: l.id, name: l.name, variant: l.variant, qty: l.qty, price: l.price })), subtotal: t.subtotal };
    cart.setPending({ kind: 'order', rec, url, at: Date.now() });
    expectReturn();
    // no 'noopener' feature here: it makes window.open() return null even when the tab opened, which would also send THIS page to WhatsApp
    const w = window.open(url, '_blank');
    if (w) { try { w.opener = null; } catch { /* cross-origin: fine */ } }
    closeDialog(drawer());
    if (!w) location.href = url; // popup blocked: go there directly
  });
}

export function initCart() {
  initButtons(); initForm();
  window.addEventListener('cart:change', render);
  render();
}
