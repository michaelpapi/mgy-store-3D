/* After WhatsApp: ask whether the order was really sent. Nothing is counted until the customer says yes, so the sheet only holds
   orders that were actually sent.

     Yes  -> logged for the owner, the order is cleared, a thank-you shows and the page goes back to the top
     No   -> "what happened?" (quick reasons + optional note + optional contact) is logged as a problem for the owner,
             then they can keep the order or clear it
     Esc  -> does not skip the question (the dialog has to be answered)

   The customer counts as "away" while WhatsApp is in front; when the page is visible again, we ask. If the browser dropped the page
   while they were in WhatsApp, the pending order is still saved and we ask on the next load. */
import { $, $$ } from './data.ts';
import { cart } from './cart.ts';
import { logLead } from './leads.ts';
import { openDialog, closeDialog } from './ui.ts';

let away = false;
/** call right after handing the order to WhatsApp */
export const expectReturn = () => { away = true; };

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initSent() {
  const askEl = $<HTMLDialogElement>('#ask'), thanksEl = $<HTMLDialogElement>('#thanks');
  if (!askEl || !thanksEl) return;
  const ask: HTMLDialogElement = askEl, thanks: HTMLDialogElement = thanksEl;
  const q = <T extends HTMLElement>(sel: string) => ask.querySelector<T>(sel)!;
  const step = (n: 'ask' | 'why' | 'sorry') => ask.querySelectorAll<HTMLElement>('[data-step]').forEach((s) => { s.hidden = s.dataset.step !== n; });
  const retry = q<HTMLAnchorElement>('[data-retry]');
  const whyText = q<HTMLTextAreaElement>('[data-why-text]'), whyContact = q<HTMLInputElement>('[data-why-contact]'), whyHint = q('[data-why-hint]');
  let thanksTimer = 0;

  ask.addEventListener('cancel', (e) => e.preventDefault()); // Esc must not skip the question
  const goHome = () => { clearTimeout(thanksTimer); window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); };
  thanks.addEventListener('click', (e) => { if (e.target === thanks || (e.target as Element).closest('[data-close-thanks]')) closeDialog(thanks); });
  thanks.addEventListener('close', goHome);

  const finish = () => { // "yes, I sent it": empty the order, say thank you, go to the top
    cart.clear();
    closeDialog(ask);
    openDialog(thanks);
    thanksTimer = window.setTimeout(() => closeDialog(thanks), 4800);
  };
  const cancelAll = () => { // nothing is sent, the order is wiped, back to the start
    closeDialog(ask);
    cart.clear();
    goHome();
  };

  function openAsk() {
    const p = cart.pending();
    if (!p || ask.open) return;
    if (cart.isEmpty()) { cart.setPending(undefined); return; }
    $$<HTMLDialogElement>('dialog[open]').forEach((d) => d.close());
    retry.href = p.url;
    step('ask');
    openDialog(ask);
  }

  const back = () => { if (away && document.visibilityState === 'visible') { away = false; openAsk(); } };
  document.addEventListener('visibilitychange', () => { if (!cart.pending()) return; if (document.visibilityState === 'hidden') away = true; else back(); });
  window.addEventListener('blur', () => { if (cart.pending()) away = true; });
  window.addEventListener('focus', () => { if (cart.pending()) back(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted && cart.pending()) openAsk(); });
  if (cart.pending()) window.setTimeout(openAsk, 900); // the page was reloaded while they were in WhatsApp
  retry.addEventListener('click', () => { away = true; });

  q('[data-yes]').addEventListener('click', () => {
    const p = cart.pending();
    if (p) logLead('order', p.rec); // only now is it counted and the owner told
    cart.setPending(undefined);
    finish();
  });
  q('[data-no]').addEventListener('click', () => { whyHint.textContent = ''; whyContact.value = whyContact.value || cart.customer().phone || cart.customer().email; step('why'); });
  const clearHint = () => { whyHint.textContent = ''; };
  [whyText, whyContact].forEach((el) => el.addEventListener('input', clearHint));
  ask.querySelectorAll('[data-why-reason]').forEach((el) => el.addEventListener('change', clearHint));
  q('[data-why-back]').addEventListener('click', () => step('ask'));
  q('[data-why-send]').addEventListener('click', () => {
    const reason = ask.querySelector<HTMLInputElement>('[data-why-reason]:checked')?.value || '';
    const message = whyText.value.trim(), contact = whyContact.value.trim(), digits = contact.replace(/\D/g, '');
    const fail = (t: string) => { whyHint.textContent = t; };
    if (!reason && message.length < 3) { fail('Please pick what happened or write a short note.'); return; }
    if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact) && (digits.length < 7 || digits.length > 15)) { fail('That phone number or email does not look right. Fix it, or leave it empty.'); whyContact.focus(); return; }
    const p = cart.pending();
    const rec = (p?.rec ?? {}) as Record<string, unknown>;
    logLead('issue', { ref: rec.ref, name: rec.name, phone: rec.phone, email: rec.email, items: rec.items, subtotal: rec.subtotal, contact, reason, message });
    cart.setPending(undefined);
    step('sorry');
  });
  q('[data-cancel-ask]').addEventListener('click', cancelAll);
  q('[data-cancel-why]').addEventListener('click', cancelAll);
  q('[data-keep]').addEventListener('click', () => closeDialog(ask)); // keep it as it is
  q('[data-fresh]').addEventListener('click', cancelAll);
}
