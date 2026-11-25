// @ts-nocheck  (ported from the Shopify theme's welcome.js; DOM-heavy, kept close to the original)
/* =====================================================================
   MGY WELCOME GATE
   A full-screen intro over the shop until "Enter world" is pressed. The only way in is the email-list sign-up (with the countdown):
   the email is saved to the Subscribers tab with the leads logger (leads.ts). There is no real login.
   Skips: ?nowelcome in the address; once per browser session after entering; and for good on this browser once the person has
   signed up (so a returning subscriber is not asked again). ?welcome forces it to show again.
   The inline script in Base.astro adds html.gated before first paint; this file builds the screen.
   ===================================================================== */
import { logLead } from './leads.ts';

const dataEl = document.getElementById('welcome-data');
if (dataEl) {
  const CONFIG = JSON.parse(dataEl.textContent || '{}');
  const root = document.documentElement, forced = /[?&]welcome\b/.test(location.search);
  let seen = false;
  try { seen = CONFIG.rememberSession && (sessionStorage.getItem('mgyEntered') == '1' || localStorage.getItem('mgySubscribed') == '1'); } catch (e) {}
  const skip = /[?&]nowelcome\b/.test(location.search) || (seen && !forced);
  if (skip) root.classList.remove('gated');
  else start(CONFIG);
}

function start(CONFIG) {
  const root = document.documentElement;
  root.classList.add('gated');                       // hides the shop immediately (also set in <head>)
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg>';
  let slides = [], cur = -1, timer = null, tick = null;

  const el = document.createElement('div'); el.id = 'welcome'; el.dataset.s = 'gate';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Welcome to Misguided Yutes');
  el.innerHTML = `
  <div class="w-bg" id="wBg"></div><div class="w-tint" id="wTint"></div><div class="w-fx"></div>
  <a class="w-ig" href="https://instagram.com/${CONFIG.instagram}" target="_blank" rel="noopener">${IG}<span>@${CONFIG.instagram}</span></a>
  <div class="w-main">
   <div class="w-eyebrow">MISGUIDED YUTES · DROP 01</div>
   <div class="w-logo"><div class="w-spin"><img src="${CONFIG.logo}" alt="Misguided Yutes"><img src="${CONFIG.logo}" alt="" aria-hidden="true"></div></div>
   <div class="w-gate" id="wGate">
    <p class="w-h">Join email list for early access</p>
    <div class="w-count" id="wCount" aria-live="off"></div>
    <form class="w-form" id="wMail" novalidate>
     <input type="email" id="wEmail" placeholder="Your email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" aria-label="Email address">
     <button>Subscribe</button>
    </form>
    <p class="w-msg" id="wMsg"></p>
   </div>
   <div class="w-enter">
    <button class="w-go" id="wGo" type="button">[ Enter world ]</button>
    <p class="w-sub">Drop 01 is live.</p>
   </div>
  </div>`;
  document.body.appendChild(el);
  /* the shop behind the gate can't be tabbed into */
  [...document.body.children].forEach((c) => { if (c !== el && c.tagName != 'SCRIPT' && c.tagName != 'svg') c.inert = true; });

  const $ = (s) => el.querySelector(s);
  backdrop(); countdown();

  $('#wMail').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#wEmail').value.trim().toLowerCase();   // lower-cased so the same person isn't listed twice
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return bad($('#wMail'), 'Enter a valid email.');
    logLead('subscribe', { email: v, source: 'welcome' });
    $('#wMsg').textContent = "You're on the list.";
    try { localStorage.setItem('mgySubscribed', '1'); } catch (e) {}
    $('#wEmail').readOnly = true; $('#wMail').classList.add('done');   // readOnly, not disabled: a disabled box greys the text out
    setTimeout(() => toEnter(), 1300);
  });
  $('#wGo').addEventListener('click', enter);

  function bad(f, m) { $('#wMsg').textContent = m; f.classList.remove('bad'); void f.offsetWidth; f.classList.add('bad'); }
  function toEnter() { el.dataset.s = 'enter'; cut(true); }
  function enter() {
    el.classList.add('out');
    try { sessionStorage.setItem('mgyEntered', '1'); } catch (e) {}
    /* open the page underneath while the gate fades, and tell the 3D chain it can drop */
    window.scrollTo(0, 0); root.classList.remove('gated');
    window.MGY_ENTERED = true; window.dispatchEvent(new Event('mgy:entered'));
    setTimeout(() => {
      el.remove();
      [...document.body.children].forEach((c) => { c.inert = false; });
      window.scrollTo(0, 0); clearInterval(timer); clearInterval(tick);
    }, reduce ? 0 : 900);
  }

  /* ---------- backdrop: looping video, or a flicker of photos if the video can't play ---------- */
  function backdrop() {
    const bg = document.getElementById('wBg');
    if (CONFIG.video) {
      const v = document.createElement('video');
      v.className = 'bgv'; v.src = CONFIG.video; v.muted = true; v.defaultMuted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.preload = 'auto';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      v.addEventListener('error', flicker);
      bg.appendChild(v); bg.classList.add('vid');
      const p = v.play(); if (p && p.catch) p.catch(() => {});
      return;
    }
    flicker();
    function flicker() {
      const old = bg.querySelector('video'); if (old) old.remove(); bg.classList.remove('vid');
      slides = (CONFIG.images || []).map((s) => { const n = document.createElement('img'); n.src = s; n.alt = ''; bg.appendChild(n); return n; });
      if (!slides.length) return;
      cut(false);
      if (!reduce && slides.length > 1) { clearInterval(timer); timer = setInterval(() => cut(true), CONFIG.cutMs || 1500); }
    }
  }
  function cut(glitch) {
    if (!slides.length) return;
    let n; do { n = Math.floor(Math.random() * slides.length); } while (slides.length > 1 && n == cur);
    if (slides[cur]) slides[cur].classList.remove('on');
    cur = n; slides[n].classList.add('on');
    const tints = CONFIG.tints || ['#0a1a3a', '#4a1a14', '#101010', '#16301f'];
    const t = tints[Math.floor(Math.random() * tints.length)];
    const tint = document.getElementById('wTint'); tint.style.setProperty('--tint', t); tint.style.background = t;
    if (glitch && !reduce) { const b = document.getElementById('wBg'); b.classList.remove('glitch'); void b.offsetWidth; b.classList.add('glitch'); }
  }

  /* ---------- countdown to the drop ---------- */
  function countdown() {
    const box = document.getElementById('wCount'), end = new Date(CONFIG.launch).getTime(), p = (n) => String(n).padStart(2, '0');
    function draw() {
      let s = Math.max(0, Math.floor((end - Date.now()) / 1000)); if (isNaN(s)) s = 0;
      const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
      box.innerHTML = [[d, 'days'], [h, 'hours'], [m, 'minutes'], [x, 'seconds']].map((a) => `<div><b>${p(a[0])}</b><span>${a[1]}</span></div>`).join('');
    }
    draw(); tick = setInterval(draw, 1000);
  }
}
