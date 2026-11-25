/* Dialog helpers, the mobile menu, header scroll state. No libraries. */
import { $, $$ } from './data.ts';

export function openDialog(d: HTMLDialogElement | null) { if (d && !d.open) d.showModal(); }
export function closeDialog(d: HTMLDialogElement | null) { if (d?.open) d.close(); }

export function initUi() {
  // a click on the dimmed backdrop closes the cart (the "did it send?" question needs a real answer, so it stays)
  const cart = $<HTMLDialogElement>('#cart');
  cart?.addEventListener('click', (e) => { if (e.target === cart) cart.close(); });
  // lock page scroll while a dialog is open
  for (const d of $$<HTMLDialogElement>('dialog')) {
    d.addEventListener('close', () => { if (!$$('dialog[open]').length) document.documentElement.classList.remove('dlg'); });
    new MutationObserver(() => { if (d.open) document.documentElement.classList.add('dlg'); }).observe(d, { attributes: true, attributeFilter: ['open'] });
  }
}
