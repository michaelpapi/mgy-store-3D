/**
 * Misguided Yutes: orders logger (Google Apps Script web app)
 *
 * Receives orders, email sign-ups and problem reports from the website and:
 *   1. writes one row per lead into the right tab of THIS spreadsheet (Orders, Subscribers, Problems)
 *   2. emails the owner a short alert (orders and problems)
 *   3. saves a PDF copy of each order in a Drive folder
 *   4. emails the owner a summary every evening at 8pm (Atlanta time)
 *
 * Setup: see SETUP.md next to this file. In short: paste this in Extensions > Apps Script,
 * set OWNER_EMAIL, run setup() once, deploy as a web app, put the /exec URL in the site.
 *
 * Orders only arrive after the customer taps "Yes, I sent it" on the site, so the sheet holds only what was really sent.
 * If they tap "No, it didn't go through", a row lands in Problems instead and you get an email.
 * TOKEN below already matches leads.token in src/data/site.json.
 */

/* ---- settings you may change ---- */
var TOKEN = '2ff5b33f5951ccc37039f87747a21fdc';    // must match leads.token on the website (src/data/site.json)
var OWNER_EMAIL = 'CHANGE-ME@example.com';         // the owner's email: gets the alerts and the daily summary (no emails are sent until you change it)
var BUSINESS = 'Misguided Yutes';
var TIMEZONE = 'America/New_York';
var DRIVE_FOLDER = 'Misguided Yutes orders';       // created in My Drive the first time a PDF is saved
var MAKE_PDFS = true;
var DAILY_SUMMARY_HOUR = 20;                       // 8pm Atlanta time

var KINDS = ['order', 'subscribe', 'issue'];
var TABS = {
  order:     { name: 'Orders',      head: ['Received', 'Ref', 'Name', 'Phone', 'Email', 'Country', 'Address', 'Note', 'Items', 'Subtotal (USD)', 'PDF'] },
  subscribe: { name: 'Subscribers', head: ['Received', 'Email', 'Source'] },
  issue:     { name: 'Problems',    head: ['Received', 'Ref', 'Name', 'Phone', 'Email', 'Contact left', 'What happened', 'Note', 'Items', 'Subtotal (USD)'] }
};

/* ---- web app entry points ---- */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var d = parse_(e);
    if (!d || d.token !== TOKEN || !TOKEN || TOKEN.indexOf('CHANGE-ME') === 0) return reply_({ ok: false, error: 'unauthorized' });
    var kind = String(d.kind || '');
    if (!TABS[kind]) return reply_({ ok: false, error: 'unknown kind' });
    var out = save_(kind, d);
    return reply_({ ok: true, ref: out.ref || '' });
  } catch (err) {
    log_('doPost', err);
    return reply_({ ok: false, error: 'server error' });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function doGet() { return reply_({ ok: true, service: BUSINESS + ' orders' }); }

/* ---- saving ---- */
function save_(kind, d) {
  var sheet = sheet_(kind);
  var at = stamp_(d.at);
  var items = itemsText_(d.items);
  var ref = clean_(d.ref, 40);
  var pdfUrl = '';
  var row;

  if (kind === 'order') {
    if (MAKE_PDFS) pdfUrl = pdf_(d, ref);
    row = [at, ref, d.name, d.phone, d.email, d.country, d.address, d.note, items, num_(d.subtotal), pdfUrl];
  } else if (kind === 'subscribe') {
    row = [at, d.email, d.source];
  } else {
    row = [at, ref, d.name, d.phone, d.email, d.contact, d.reason, d.message, items, num_(d.subtotal)];
  }
  sheet.appendRow(row.map(function (v) { return typeof v === 'number' ? v : safe_(v); }));

  if (kind === 'order') alert_(d, ref, items, pdfUrl);
  if (kind === 'issue') issueAlert_(d, ref, items);
  return { ref: ref };
}

/* ---- helpers ---- */
function parse_(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  try { return JSON.parse(e.postData.contents); } catch (x) { return null; }
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_(kind) {
  var t = TABS[kind];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(t.name);
  if (!sh) {
    sh = ss.insertSheet(t.name);
    sh.appendRow(t.head);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, t.head.length).setFontWeight('bold').setBackground('#111111').setFontColor('#EEEEEE');
  }
  return sh;
}

/* A cell that starts with = + - @ is treated as a formula by Sheets. Someone could type =IMPORTXML(...) in the
   address box and have it run. Prefixing an apostrophe stores it as plain text. */
function safe_(v) {
  if (v === null || v === undefined) return '';
  var s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, 2000);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function clean_(v, max) { return String(v === null || v === undefined ? '' : v).replace(/[^\w\-. ]/g, '').slice(0, max || 100); }
function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function mail_(msg) {
  if (!OWNER_EMAIL || OWNER_EMAIL.indexOf('CHANGE-ME') === 0) return; // no owner email set yet: skip the email, the sheet row is still saved
  msg.to = OWNER_EMAIL;
  MailApp.sendEmail(msg);
}

function stamp_(iso) {
  var d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) d = new Date();
  return Utilities.formatDate(d, TIMEZONE, 'yyyy-MM-dd HH:mm');
}

function itemsText_(items) {
  if (!Array.isArray(items)) return '';
  return items.slice(0, 40).map(function (i) {
    var name = String((i && i.name) || (i && i.id) || '?') + (i && i.variant ? ' (' + i.variant + ')' : '');
    return String((i && i.qty) || 1) + ' x ' + name + (i && i.price ? ' ($' + num_(i.price) + ')' : '');
  }).join('; ');
}

function esc_(s) {
  return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function usd_(n) { return '$' + num_(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

function log_(where, err) { try { console.error(where + ': ' + (err && err.stack ? err.stack : err)); } catch (x) {} }

/* ---- alert email + PDF ---- */
function alert_(d, ref, items, pdfUrl) {
  try {
    var lines = [
      '<h2>New order ' + esc_(ref) + '</h2>',
      '<p><b>' + esc_(d.name) + '</b>' + (d.phone ? ' &middot; ' + esc_(d.phone) : '') + (d.email ? ' &middot; ' + esc_(d.email) : '') + '</p>',
      '<p>Ship to: ' + esc_(d.address) + ', ' + esc_(d.country) + '</p>',
      '<p>' + esc_(items) + '</p>',
      '<p>Subtotal: <b>' + esc_(usd_(d.subtotal)) + '</b> (shipping and taxes not included)</p>'
    ];
    if (d.note) lines.push('<p>Note: ' + esc_(d.note) + '</p>');
    if (pdfUrl) lines.push('<p><a href="' + esc_(pdfUrl) + '">Open PDF copy</a></p>');
    lines.push('<p style="color:#777">The customer is also messaging you on WhatsApp. Confirm availability, shipping and how they will pay there.</p>');
    mail_({ subject: BUSINESS + ': new order ' + ref, htmlBody: lines.join('\n') });
  } catch (err) { log_('alert_', err); }
}

function issueAlert_(d, ref, items) {
  try {
    var who = esc_(d.name || 'A customer') + (d.phone ? ' &middot; ' + esc_(d.phone) : '') + (d.email ? ' &middot; ' + esc_(d.email) : '');
    mail_({
      subject: BUSINESS + ': a customer could not send their order ' + ref,
      htmlBody: '<h2>Follow up</h2><p>' + who + '</p>' +
        '<p>What happened: <b>' + esc_(d.reason || '-') + '</b></p>' +
        (d.message ? '<p>Note: ' + esc_(d.message) + '</p>' : '') +
        (d.contact ? '<p>Contact they left: ' + esc_(d.contact) + '</p>' : '') +
        '<p>' + esc_(items) + ' (' + esc_(usd_(d.subtotal)) + ')</p>' +
        '<p style="color:#777">They told the site the WhatsApp message was not sent. It is worth reaching out.</p>'
    });
  } catch (err) { log_('issueAlert_', err); }
}

function pdf_(d, ref) {
  try {
    var td = 'border-bottom:1px solid #ddd;padding:6px';
    var html = '<html><body style="font-family:Arial,sans-serif;color:#222">' +
      '<h1 style="margin:0">' + esc_(BUSINESS) + '</h1><p style="margin:0 0 16px;color:#777">Atlanta, GA</p>' +
      '<h2>Order ' + esc_(ref) + '</h2>' +
      '<p><b>Name:</b> ' + esc_(d.name) + '<br><b>Phone:</b> ' + esc_(d.phone) + '<br><b>Email:</b> ' + esc_(d.email) +
      '<br><b>Ship to:</b> ' + esc_(d.address) + ', ' + esc_(d.country) + '</p>' +
      '<table style="border-collapse:collapse;width:100%">' +
      (Array.isArray(d.items) ? d.items.slice(0, 40).map(function (i) {
        return '<tr><td style="' + td + '">' + esc_((i && i.name) || (i && i.id)) + (i && i.variant ? ' (' + esc_(i.variant) + ')' : '') + '</td><td style="' + td + ';text-align:center">x ' + esc_((i && i.qty) || 1) +
          '</td><td style="' + td + ';text-align:right">' + (i && i.price ? esc_(usd_(i.price)) : '') + '</td></tr>';
      }).join('') : '') + '</table>' +
      '<p style="font-size:18px"><b>Subtotal: ' + esc_(usd_(d.subtotal)) + '</b></p>' +
      (d.note ? '<p><b>Note:</b> ' + esc_(d.note) + '</p>' : '') +
      '<p style="color:#777">Shipping and any taxes are confirmed on WhatsApp. This is a copy of the order request, not a receipt.</p></body></html>';
    var blob = HtmlService.createHtmlOutput(html).getBlob().getAs('application/pdf').setName(ref + '.pdf');
    var folders = DriveApp.getFoldersByName(DRIVE_FOLDER);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER);
    return folder.createFile(blob).getUrl();
  } catch (err) { log_('pdf_', err); return ''; }
}

/* ---- daily summary ---- */
function dailySummary() {
  var today = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
  var parts = [], total = 0;
  KINDS.forEach(function (k) {
    var sh = sheet_(k), last = sh.getLastRow();
    if (last < 2) { parts.push(TABS[k].name + ': 0'); return; }
    var rows = sh.getRange(2, 1, last - 1, TABS[k].head.length).getValues();
    var todays = rows.filter(function (r) { return String(r[0]).indexOf(today) === 0; });
    parts.push(TABS[k].name + ': ' + todays.length);
    if (k === 'order') todays.forEach(function (r) { total += num_(r[TABS[k].head.indexOf('Subtotal (USD)')]); });
  });
  mail_({
    subject: BUSINESS + ': summary for ' + today,
    htmlBody: '<p>' + esc_(parts.join(' | ')) + '</p><p>Value of today\'s orders (before shipping and taxes): <b>' + esc_(usd_(total)) + '</b></p>'
  });
}

/* ---- one-time setup: run this from the editor ---- */
function setup() {
  KINDS.forEach(sheet_);
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'dailySummary') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailySummary').timeBased().everyDays(1).atHour(DAILY_SUMMARY_HOUR).inTimezone(TIMEZONE).create();
  var first = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sheet1');
  if (first && first.getLastRow() === 0 && SpreadsheetApp.getActiveSpreadsheet().getSheets().length > 1) SpreadsheetApp.getActiveSpreadsheet().deleteSheet(first);
  console.log('Tabs created and the 8pm summary is scheduled.');
}
