/* The order: variants (by SKU) + quantities, plus the customer's details so far. Kept in localStorage so a returning visitor keeps
   their order. Single source of truth for the cart drawer, the order bar, the lookbook and the product cards. */
import { varBySku, thumb, variantLabel } from './data.ts';
import type { Line, Customer } from './wa.ts';

const KEY = 'mgy.cart.v1';
export const MAX_QTY = 10;

/* An order is only counted once the customer says they sent it on WhatsApp. Until then it waits here, so it survives a reload or the
   browser dropping the page while they are in WhatsApp (see sent.ts). */
export type Pending = { kind: 'order'; rec: Record<string, unknown>; url: string; at: number };
type Stored = { items: Record<string, number>; customer: Customer; pending?: Pending; at: number };

const blank = (): Stored => ({ items: {}, customer: { name: '', phone: '', email: '', country: '', address: '', note: '' }, at: 0 });

function load(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return blank();
    const s = blank();
    for (const [sku, q] of Object.entries(raw.items || {})) {
      const n = Math.floor(Number(q));
      const hit = varBySku.get(sku);
      if (hit && hit.v.a && n >= 1) s.items[sku] = Math.min(n, MAX_QTY); // drops items that no longer exist or are sold out
    }
    const c = raw.customer || {};
    s.customer = {
      name: String(c.name || '').slice(0, 80), phone: String(c.phone || '').slice(0, 24), email: String(c.email || '').slice(0, 80),
      country: String(c.country || '').slice(0, 40), address: String(c.address || '').slice(0, 300), note: String(c.note || '').slice(0, 140),
    };
    const pd = raw.pending;
    if (pd && pd.kind === 'order' && typeof pd.url === 'string' && pd.rec && typeof pd.rec === 'object') s.pending = { kind: 'order', rec: pd.rec, url: pd.url, at: Number(pd.at) || 0 };
    s.at = Number(raw.at) || 0;
    return s;
  } catch {
    return blank();
  }
}

let state = load();
const emit = () => window.dispatchEvent(new CustomEvent('cart:change'));
function save(touch = true) {
  if (touch) state.at = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: the cart still works until the tab closes */ }
}

export const cart = {
  qty: (sku: string) => state.items[sku] || 0,
  /** returns false when the variant is unknown or sold out */
  add(sku: string, n = 1) {
    const hit = varBySku.get(sku);
    if (!hit || !hit.v.a) return false;
    state.items[sku] = Math.min((state.items[sku] || 0) + n, MAX_QTY);
    save(); emit(); return true;
  },
  /** add several at once (the lookbook's "Add full look"): one save, one update of the page */
  addMany(skus: string[]) {
    let ok = 0;
    for (const sku of skus) { const hit = varBySku.get(sku); if (hit && hit.v.a) { state.items[sku] = Math.min((state.items[sku] || 0) + 1, MAX_QTY); ok++; } }
    if (ok) { save(); emit(); }
    return ok;
  },
  dec(sku: string) { if (!state.items[sku]) return; state.items[sku] -= 1; if (state.items[sku] <= 0) delete state.items[sku]; save(); emit(); },
  remove(sku: string) { delete state.items[sku]; save(); emit(); },
  clear() { state.items = {}; state.pending = undefined; save(); emit(); },
  lines(): Line[] {
    return Object.entries(state.items).flatMap(([sku, q]) => {
      const hit = varBySku.get(sku); if (!hit) return [];
      return [{ id: sku, name: hit.p.t, variant: variantLabel(hit.v), qty: q, price: hit.v.p, image: thumb(hit.v.f) }];
    });
  },
  isEmpty: () => Object.keys(state.items).length === 0,
  customer: (): Customer => ({ ...state.customer }),
  setCustomer(p: Partial<Customer>) { state.customer = { ...state.customer, ...p }; save(false); },
  pending: (): Pending | undefined => (state.pending && Date.now() - state.pending.at < 12 * 3600_000 ? state.pending : undefined), // older than 12 hours: forget it
  setPending(p: Pending | undefined) { state.pending = p; save(false); },
};

// keep several open tabs in step
window.addEventListener('storage', (e) => { if (e.key === KEY) { state = load(); emit(); } });
