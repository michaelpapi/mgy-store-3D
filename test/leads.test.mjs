// Runs docs/google-sheets-leads/Code.gs against a small mock of Apps Script's services.
// This proves the logic (token check, routing, formula guard, escaping, summary). It does NOT prove it works
// against real Google: do the live test in docs/google-sheets-leads/SETUP.md step 7.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const raw = readFileSync(new URL('../docs/google-sheets-leads/Code.gs', import.meta.url), 'utf8');
const siteToken = JSON.parse(readFileSync(new URL('../src/data/site.json', import.meta.url), 'utf8')).leads.token;
const src = raw.replace(/var TOKEN = '[^']*';/, "var TOKEN = 'TESTTOKEN';").replace("'CHANGE-ME@example.com'", "'owner@example.com'");

function world({ pdfThrows = false, code = src } = {}) {
  const sheets = {}, mails = [], files = [], triggers = [];
  const mkSheet = (name) => {
    const s = { name, rows: [], appendRow(r) { this.rows.push(r); }, setFrozenRows() {},
      getRange: (r, c, nr, nc) => ({ setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; },
        getValues: () => s.rows.slice(r - 1, r - 1 + nr).map((x) => x.slice(c - 1, c - 1 + nc)) }),
      getLastRow() { return this.rows.length; } };
    return s;
  };
  const ss = { getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = mkSheet(n)), getSheets: () => Object.values(sheets), deleteSheet() {} };
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ body: s, setMimeType() { return this; } }) },
    MailApp: { sendEmail: (m) => mails.push(m) },
    // New York in November is UTC-5
    Utilities: { formatDate: (d, tz, f) => { const p = new Date(d.getTime() - 5 * 3600000).toISOString(); return f === 'yyyy-MM-dd' ? p.slice(0, 10) : p.slice(0, 10) + ' ' + p.slice(11, 16); } },
    HtmlService: { createHtmlOutput: (html) => { if (pdfThrows) throw new Error('pdf boom'); return { getBlob: () => ({ getAs: () => ({ setName: (n) => ({ n, html }) }) }) }; } },
    DriveApp: { getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => ({ createFile: (b) => { files.push(b); return { getUrl: () => 'https://drive.example/' + b.n }; } }) },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: (fn) => { const tr = { fn }; const b = { timeBased: () => b, everyDays: () => b, atHour: (h) => { tr.hour = h; return b; }, inTimezone: (z) => { tr.tz = z; return b; }, create: () => triggers.push(tr) }; return b; }, deleteTrigger() {} },
  };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  const post = (obj) => JSON.parse(ctx.doPost({ postData: { contents: typeof obj === 'string' ? obj : JSON.stringify(obj) } }).body);
  return { ctx, sheets, mails, files, triggers, post };
}

const order = { token: 'TESTTOKEN', kind: 'order', ref: 'MGY-ORD-1124-AB12', at: '2026-11-24T14:00:00Z', name: 'Ada', phone: '+14045550123', email: 'ada@example.com', country: 'United States', address: '12 Peachtree St, Atlanta, GA 30303', note: 'Gift wrap',
  items: [{ id: 'SKU1', name: 'Funnel Neck Puffer', variant: 'L', qty: 2, price: 150 }], subtotal: 300 };

test('the shipped Code.gs token is the one in site.json (so no copy-paste step can go wrong)', () => {
  assert.ok(raw.includes(`var TOKEN = '${siteToken}';`));
  assert.ok(siteToken.length >= 30);
});
test('no other client\'s data leaked in', () => { assert.doesNotMatch(raw, /rain|lowkey|lowcutz|naira|lagos/i); });

test('an order is saved, alerted and PDF-copied', () => {
  const w = world(); const r = w.post(order);
  assert.deepEqual([r.ok, r.ref], [true, 'MGY-ORD-1124-AB12']);
  const rows = w.sheets.Orders.rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0][0], 'Received');
  const row = rows[1];
  assert.deepEqual([row[0], row[2], row[3], row[4], row[5], row[6], row[7]], ['2026-11-24 09:00', 'Ada', "'+14045550123" /* leading + gets the text guard; Sheets hides the apostrophe */, 'ada@example.com', 'United States', '12 Peachtree St, Atlanta, GA 30303', 'Gift wrap']);
  assert.equal(row[8], '2 x Funnel Neck Puffer (L) ($150)');
  assert.equal(row[9], 300);
  assert.match(row[10], /drive\.example\/MGY-ORD-1124-AB12\.pdf/);
  assert.equal(w.files.length, 1);
  assert.equal(w.mails.length, 1);
  assert.equal(w.mails[0].to, 'owner@example.com');
  assert.match(w.mails[0].subject, /MGY-ORD-1124-AB12/);
  assert.match(w.mails[0].htmlBody, /\$300\.00/);
});

test('subscribers are saved without an email being sent', () => {
  const w = world();
  assert.ok(w.post({ token: 'TESTTOKEN', kind: 'subscribe', email: 'a@b.co', source: 'welcome' }).ok);
  assert.deepEqual([...w.sheets.Subscribers.rows[1].slice(1)], ['a@b.co', 'welcome']);
  assert.equal(w.mails.length, 0);
});

test('a problem report lands in Problems and the owner is told to follow up', () => {
  const w = world();
  assert.ok(w.post({ token: 'TESTTOKEN', kind: 'issue', ref: 'MGY-ORD-9', name: 'Ada', phone: '+1404', email: 'ada@x.com', contact: 'ada@x.com', reason: 'WhatsApp did not open', message: 'old phone', items: [{ id: 'S', name: 'Hoodie', variant: 'M', qty: 1, price: 90 }], subtotal: 90 }).ok);
  const row = w.sheets.Problems.rows[1];
  assert.equal(row[6], 'WhatsApp did not open');
  assert.equal(row[8], '1 x Hoodie (M) ($90)');
  assert.equal(w.mails.length, 1);
  assert.match(w.mails[0].subject, /could not send/);
  assert.match(w.mails[0].htmlBody, /WhatsApp did not open/);
  assert.equal(w.sheets.Orders, undefined);
});

test('requests without the right token or a known kind are rejected and write nothing', () => {
  const w = world();
  assert.equal(w.post({ ...order, token: 'nope' }).ok, false);
  assert.equal(w.post({ ...order, token: undefined }).ok, false);
  assert.equal(w.post({ token: 'TESTTOKEN', kind: 'booking' }).ok, false);   // Rain G's kinds do not exist here
  assert.equal(w.post('not json').ok, false);
  assert.equal(w.sheets.Orders, undefined);
  assert.equal(w.mails.length, 0);
  const placeholder = world({ code: raw.replace(/var TOKEN = '[^']*';/, "var TOKEN = 'CHANGE-ME-to-a-long-random-string';") });
  assert.equal(placeholder.post({ token: 'CHANGE-ME-to-a-long-random-string', kind: 'order' }).ok, false);
});

test('with no owner email the row is still saved and no email is attempted', () => {
  const w = world({ code: src.replace("'owner@example.com'", "'CHANGE-ME@example.com'") });
  assert.ok(w.post(order).ok);
  assert.equal(w.sheets.Orders.rows.length, 2);
  assert.equal(w.mails.length, 0);
});

test('formula-looking text is stored as plain text and HTML is escaped in emails and PDFs', () => {
  const w = world();
  w.post({ ...order, address: '=IMPORTXML("http://evil","//x")', note: '+cmd|calc', name: '@SUM(1)', phone: '-5' });
  const row = w.sheets.Orders.rows[1];
  assert.ok(String(row[6]).startsWith("'=IMPORTXML"));
  assert.ok(String(row[7]).startsWith("'+cmd"));
  assert.ok(String(row[2]).startsWith("'@SUM"));
  assert.ok(String(row[3]).startsWith("'-5"));
  w.post({ ...order, name: '<script>alert(1)</script>', address: '"><img src=x onerror=1>' });
  const html = w.mails.at(-1).htmlBody;
  assert.ok(!html.includes('<script>') && !html.includes('<img') && html.includes('&lt;script&gt;'));
  assert.ok(!w.files.at(-1).html.includes('<script>') && w.files.at(-1).html.includes('&lt;script&gt;'));
});

test('a failing PDF step, bad numbers and oversized input do not break saving', () => {
  const a = world({ pdfThrows: true }); assert.ok(a.post(order).ok);
  assert.equal(a.sheets.Orders.rows[1][10], '');
  assert.equal(a.mails.length, 1);
  const b = world(); b.post({ ...order, items: 'bad', subtotal: 'abc' });
  assert.deepEqual([b.sheets.Orders.rows[1][8], b.sheets.Orders.rows[1][9]], ['', 0]);
  const c = world(); c.post({ ...order, items: Array.from({ length: 200 }, (_, i) => ({ id: 'x' + i, qty: 1 })), address: 'a'.repeat(9000) });
  assert.ok(c.sheets.Orders.rows[1][6].length <= 2001);
  assert.ok(c.sheets.Orders.rows[1][8].split(';').length <= 40);
  assert.equal(JSON.parse(a.ctx.doGet().body).ok, true);
});

test('setup creates the tabs and the 8pm Atlanta summary; the summary counts only today', () => {
  const w = world(); w.ctx.setup();
  assert.ok(['Orders', 'Subscribers', 'Problems'].every((n) => w.sheets[n]));
  assert.deepEqual([w.triggers.length, w.triggers[0].fn, w.triggers[0].hour, w.triggers[0].tz], [1, 'dailySummary', 20, 'America/New_York']);
  const today = new Date().toISOString();
  w.post({ ...order, at: today, subtotal: 250 }); w.post({ ...order, at: today, ref: 'B', subtotal: 1100.5 }); w.post({ ...order, at: '2020-01-01T00:00:00Z', ref: 'old', subtotal: 999 });
  w.mails.length = 0; w.ctx.dailySummary();
  assert.equal(w.mails.length, 1);
  assert.match(w.mails[0].htmlBody, /Orders: 2/);
  assert.match(w.mails[0].htmlBody, /\$1,350\.50/);
});
