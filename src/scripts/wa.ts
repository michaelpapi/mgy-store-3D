/* Pure message builders for WhatsApp and the leads sheet. No DOM, so they can be unit-tested in Node. */

export type Line = { id: string; name: string; variant: string; qty: number; price: number; image: string };
export type Customer = { name: string; phone: string; email: string; country: string; address: string; note: string };

export const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export function totals(lines: Line[]) {
  const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  return { subtotal, count };
}

const lineText = (l: Line, i: number) => `${i + 1}. ${l.name}${l.variant ? ` (${l.variant})` : ''}${l.qty > 1 ? ` × ${l.qty}` : ''} — ${usd(l.price * l.qty)}`;
const tidy = (rows: string[]) => rows.join('\n').replace(/\n{3,}/g, '\n\n').trim();

/** MGY-ORD-1124-4F2K : month+day, then 4 random base-36 characters. Shown to the customer and written to the sheet, so the
 *  owner can search the sheet for the reference he sees in the chat. */
export function makeRef(ms: number = Date.now(), rand: () => number = Math.random) {
  const d = new Date(ms);
  const mmdd = `${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const tail = Math.floor(rand() * 36 ** 4).toString(36).toUpperCase().padStart(4, '0');
  return `MGY-ORD-${mmdd}-${tail}`;
}

export const waUrl = (number: string, text: string) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

export function orderMessage(o: { business: string; ref: string; customer: Customer; lines: Line[] }) {
  const t = totals(o.lines), c = o.customer;
  return tidy([
    `*NEW ORDER* · ${o.business}`,
    `Ref: ${o.ref}`,
    '',
    `*Name:* ${c.name}`,
    c.phone ? `*Phone:* ${c.phone}` : '',
    c.email ? `*Email:* ${c.email}` : '',
    '',
    '*Ship to:*',
    c.address,
    c.country,
    '',
    '*Items*',
    ...o.lines.map(lineText),
    '',
    `*Subtotal:* ${usd(t.subtotal)} (shipping and any taxes not included)`,
    c.note ? `*Note:* ${c.note}` : '',
    '',
    'Please confirm availability, the shipping cost and how I can pay. Thank you!',
  ]);
}

/** 7 to 15 digits once spaces, dashes, brackets and a leading + are removed (international numbers are fine). */
export function cleanPhone(raw: string) {
  const s = raw.replace(/[\s\-().]/g, '');
  return /^\+?\d{7,15}$/.test(s) ? s : '';
}
export const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
