/* Sends a lead (a confirmed order, a mailing-list sign-up, or a problem report after a failed WhatsApp send) to the Google Sheet
   through an Apps Script web app. No leads.url in src/data/site.json = preview mode: nothing is sent. */
import { APP } from './data.ts';

export type LeadKind = 'order' | 'subscribe' | 'issue';
export const leadsLive = () => !!APP.leads;

export function logLead(kind: LeadKind, payload: Record<string, unknown>) {
  const L = APP.leads;
  if (!L) { console.info('[leads: preview mode, not saved]', kind, payload); return; }
  if (kind !== 'subscribe' && !L.logOrders) return;
  try {
    // text/plain keeps this a "simple" request, so the browser skips the CORS preflight that Apps Script cannot answer
    fetch(L.url, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: L.token, kind, at: new Date().toISOString(), ...payload }) }).catch(() => {});
  } catch { /* never block the WhatsApp hand-off on logging */ }
}
