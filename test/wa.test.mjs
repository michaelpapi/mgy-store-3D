// The WhatsApp message and phone/email checks. These run the real TypeScript source (Node 22.18+ runs .ts directly).
import test from 'node:test';
import assert from 'node:assert/strict';
import { totals, makeRef, waUrl, orderMessage, cleanPhone, validEmail, usd } from '../src/scripts/wa.ts';

const line = (name, variant, qty, price) => ({ id: name, name, variant, qty, price, image: '' });
const cust = { name: 'Ada', phone: '+14045550123', email: 'ada@example.com', country: 'United States', address: '12 Peachtree St, Atlanta, GA', note: '' };

test('totals add up quantity and price', () => {
  assert.deepEqual(totals([line('a', 'M', 2, 150), line('b', '', 1, 95)]), { subtotal: 395, count: 3 });
  assert.deepEqual(totals([]), { subtotal: 0, count: 0 });
});

test('references look like MGY-ORD-MMDD-XXXX and are stable for a given time and random value', () => {
  assert.equal(makeRef(Date.UTC(2026, 10, 24), () => 0), 'MGY-ORD-1124-0000');
  assert.match(makeRef(), /^MGY-ORD-\d{4}-[0-9A-Z]{4}$/);
  assert.equal(makeRef(Date.UTC(2026, 0, 5), () => 0.9999999), 'MGY-ORD-0105-ZZZZ');
});

test('the order message lists items, quantity, the subtotal and who/where, and skips empty parts', () => {
  const m = orderMessage({ business: 'Misguided Yutes', ref: 'MGY-ORD-1124-AB12', customer: cust, lines: [line('Funnel Neck Puffer', 'L', 2, 150), line('MGY Belt Buckle', '', 1, 60)] });
  assert.ok(m.startsWith('*NEW ORDER* · Misguided Yutes\nRef: MGY-ORD-1124-AB12'));
  assert.ok(m.includes('1. Funnel Neck Puffer (L) × 2 — $300.00'));
  assert.ok(m.includes('2. MGY Belt Buckle — $60.00'));
  assert.ok(m.includes('*Subtotal:* $360.00'));
  assert.ok(m.includes('12 Peachtree St, Atlanta, GA\nUnited States'));
  assert.ok(!m.includes('*Note:*'));
  assert.ok(!/\n{3,}/.test(m));
  const bare = orderMessage({ business: 'X', ref: 'r', customer: { ...cust, phone: '', email: '', note: 'hi' }, lines: [line('a', '', 1, 1)] });
  assert.ok(!bare.includes('*Phone:*') && !bare.includes('*Email:*') && bare.includes('*Note:* hi'));
});

test('the wa.me link carries the number and an encoded message that decodes back exactly', () => {
  const text = '*NEW ORDER* & more\nline 2 — $5.00';
  const u = new URL(waUrl('14045550123', text));
  assert.equal(u.origin + u.pathname, 'https://wa.me/14045550123');
  assert.equal(u.searchParams.get('text'), text);
});

test('phone numbers: 7-15 digits, optional +, separators allowed', () => {
  assert.equal(cleanPhone('+1 (404) 555-0123'), '+14045550123');
  assert.equal(cleanPhone('0803 000 0000'), '08030000000');
  for (const bad of ['', 'abc', '12345', '1'.repeat(16), '404-555-01a3']) assert.equal(cleanPhone(bad), '');
});

test('email check', () => {
  assert.ok(validEmail('a@b.co'));
  for (const bad of ['', 'a@b', 'a b@c.com', '@x.com', 'a@b.c']) assert.ok(!validEmail(bad), bad);
});

test('usd formatting', () => { assert.equal(usd(1234.5), '$1,234.50'); });
