import { initUi } from './ui.ts';
import { initTheme } from './theme.ts';
import { initCart } from './cartui.ts';
import { initSent } from './sent.ts';
import { initShop } from './shop.ts';
import { initLookbook } from './lookbook.ts';

function boot() {
  initUi(); initTheme(); initCart(); initSent(); initShop(); initLookbook();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
