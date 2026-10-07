import { validateSiteRequest, CONTACT_TOPICS } from '../../js/site-request-validation.js';
const RECIPIENT = 'contact@efficiadigital.com';
const ERROR = 'L’envoi n’a pas pu être confirmé. Vos champs sont conservés. Contactez-nous par e-mail ou WhatsApp.';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const fail = (status, error = ERROR) => json({ success: false, error }, status);
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 32768) { await reader.cancel(); throw new Error('large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function onRequestPost({ request, env }) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) return fail(403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return fail(415);
  let input;
  try { input = await readBody(request); } catch { return fail(400, 'Le formulaire est invalide ou trop volumineux.'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(400);
  if (input.company_url) return fail(400);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId || '')) return fail(400);
  const checked = validateSiteRequest(input);
  if (checked.error) return fail(400, checked.error);
  // Secrets must be provisioned independently for each deployment environment.
  if (!env.HOSTINGER_MAIL_API_TOKEN || !/^AC[A-Za-z0-9]+$/.test(env.HOSTINGER_MAILBOX_ID || '') || !env.ORDERS_DB) {
    return fail(503, 'Le formulaire est temporairement indisponible. Contactez-nous à contact@efficiadigital.com ou par WhatsApp.');
  }
  const db = env.ORDERS_DB;
  const id = input.requestId;
  const digest = await hash(JSON.stringify(checked.data));
  const now = Math.floor(Date.now() / 1000);
  // Rotating keyed hash: neither IP addresses nor contact fields are persisted.
  const rateKey = await hash(`${env.HOSTINGER_MAIL_API_TOKEN}:${Math.floor(now / 86400)}:${request.headers.get('CF-Connecting-IP') || 'local'}`);
  const success = () => json({ success: true, status: 'sent', requestId: id });
  try {
    const existing = await db.prepare('SELECT payload_hash, status FROM site_request_delivery WHERE request_id = ?').bind(id).first();
    if (existing) {
      if (existing.payload_hash !== digest) return fail(409);
      if (existing.status === 'sent') return success();
      // Never automatically repeat an uncertain upstream send.
      return fail(409);
    }
    await db.prepare('DELETE FROM site_request_delivery WHERE created_at < ?').bind(now - 7 * 86400).run();
    const inserted = await db.prepare(`INSERT INTO site_request_delivery (request_id, payload_hash, rate_key, status, created_at)
      SELECT ?, ?, ?, 'sending', ? WHERE (SELECT COUNT(*) FROM site_request_delivery WHERE rate_key = ? AND created_at > ?) < 5
      ON CONFLICT(request_id) DO NOTHING`).bind(id, digest, rateKey, now, rateKey, now - 3600).run();
    if (inserted.meta?.changes !== 1) return fail(429, 'Plusieurs demandes ont déjà été effectuées. Patientez ou contactez-nous par e-mail ou WhatsApp.');
  } catch { return fail(503); }
  const data = checked.data;
  let response;
  try {
    response = await fetch(`https://api.mail.hostinger.com/api/v1/mailboxes/${encodeURIComponent(env.HOSTINGER_MAILBOX_ID)}/send`, {
      method: 'POST', redirect: 'manual',
      headers: { Authorization: `Bearer ${env.HOSTINGER_MAIL_API_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data.source === 'contact'
        ? { to: [RECIPIENT], displayName: 'Efficia Digital — Formulaire contact', subject: `Demande de contact — ${id}`, text: `Demande depuis la page Contact\nRéférence : ${id}\n\nPrénom : ${data.name}\nEntreprise et métier : ${data.company || 'Non précisé'}\nDemande concernant : ${CONTACT_TOPICS[data.topic] || 'Non précisé'}\nContact : ${data.contact}\n\nMessage :\n${data.message || 'Aucun message'}` }
        : { to: [RECIPIENT], displayName: 'Efficia Digital — Formulaire site', subject: `Demande création / refonte de site — ${id}`, text: `Demande depuis la page Création / refonte de site\nRéférence : ${id}\n\nNom : ${data.name}\nEntreprise et métier : ${data.company}\nSite actuel : ${data.website || 'Création de site'}\nContact : ${data.contact}\n\nCe qui vous gêne le plus :\n${data.message}` }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    console.error('site_request_transport_failed', { requestId: id, name: error?.name || 'Error' });
    response = null;
  }
  // Hostinger's documented success is precisely 204: sent + copy in INBOX.Sent.
  const sent = response?.status === 204;
  if (response && !sent) console.error('site_request_delivery_failed', { requestId: id, upstreamStatus: response.status });
  const state = sent ? 'sent' : response && response.status >= 400 && response.status < 500 ? 'failed' : 'uncertain';
  try { await db.prepare('UPDATE site_request_delivery SET status = ? WHERE request_id = ?').bind(state, id).run(); }
  catch { /* A receipt failure never triggers another send. */ }
  if (!sent) return fail(502);
  return success();
}
export function onRequestGet() { return fail(405); }
export function onRequestOptions() { return fail(405); }
