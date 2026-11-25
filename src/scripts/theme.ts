/* Light / dark switch. The saved choice is applied before first paint by the inline script in Base.astro. */
import { $ } from './data.ts';

function label() {
  const dark = document.documentElement.dataset.theme === 'dark', b = $('#tg');
  if (!b) return;
  const l = dark ? 'Switch to light mode' : 'Switch to dark mode';
  b.setAttribute('aria-label', l); b.title = l;
}
export function initTheme() {
  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('[data-theme-toggle]')) return;
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('mgyTheme', t); } catch { /* storage blocked */ }
    label();
  });
  label();
}
