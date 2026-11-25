/* A small copy of the product photo flies from the Add button to the cart (transform + opacity only, ~500 ms).
   Inside an open dialog it flies to that dialog's [data-fly-target]; on the page it flies to the cart button.
   Reduced motion: the target just pulses. */
import { reducedMotion } from './data.ts';

const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';

function pulse(el: Element | null) {
  el?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 260, easing: EASE });
}

export function fly(from: HTMLElement, src: string) {
  const dlg = document.querySelector<HTMLDialogElement>('dialog[open]');
  const target = dlg ? dlg.querySelector<HTMLElement>('[data-fly-target]') : document.querySelector<HTMLElement>('.cart-btn');
  if (!target || !from.isConnected) return;
  if (reducedMotion()) { pulse(target); return; }
  const a = from.getBoundingClientRect(), b = target.getBoundingClientRect();
  const origin = dlg ? dlg.getBoundingClientRect() : { left: 0, top: 0 };
  const size = 38;
  const el = document.createElement('div');
  el.className = 'flyer';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<img src="${src}" width="48" height="48" alt="" draggable="false">`;
  el.style.cssText = `position:${dlg ? 'absolute' : 'fixed'};left:${a.left + a.width / 2 - size / 2 - origin.left}px;top:${a.top + a.height / 2 - size / 2 - origin.top}px;width:${size}px;height:${size}px;z-index:400;pointer-events:none;will-change:transform,opacity`;
  (dlg ?? document.body).append(el);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const anim = el.animate(
    [
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 36}px) scale(1.15) rotate(140deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px,${dy}px) scale(0.35) rotate(320deg)`, opacity: 0.25 },
    ],
    { duration: 520, easing: EASE },
  );
  anim.onfinish = () => { el.remove(); pulse(target); };
  anim.oncancel = () => el.remove();
}
