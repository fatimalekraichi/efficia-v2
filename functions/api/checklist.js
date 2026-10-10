import { resolvePublicSite, resolveMailerLiteGroupId } from '../lib/environmentIsolation.js';
const ERROR = 'Une erreur est survenue. Merci de réessayer dans quelques instants.';
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
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(400, 'Le formulaire est invalide.');
  if (input.company_url) return json({ success: true });
  const firstName = typeof input.firstName === 'string' ? input.firstName.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim() : '';
  if (!firstName || firstName.length > 80) return fail(400, 'Indiquez votre prénom (80 caractères maximum).');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'Indiquez une adresse e-mail valide.');
  if (input.consent !== true) return fail(400, 'Votre accord est nécessaire pour recevoir la checklist et nos conseils par e-mail.');
  const site = resolvePublicSite(request, env);
  if (!site.ok) return fail(site.status === 403 ? 403 : 503);
  const group = resolveMailerLiteGroupId(env, site.environment, { purpose: 'checklist' });
  if (!group.ok || !env.MAILERLITE_API_KEY || !env.ORDERS_DB) return fail(503);
  const db = env.ORDERS_DB;
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  // Namespaced, rotating keyed hashes: no raw contact fields or IP in D1.
  const key = `checklist:${site.environment}:${env.MAILERLITE_API_KEY}:${Math.floor(now / 86400)}`;
  const rateKey = await hash(`${key}:${request.headers.get('CF-Connecting-IP') || 'local'}`);
  const digest = await hash(`${key}:${JSON.stringify({ firstName, email, consent: true })}`);
  try {
    await db.prepare('DELETE FROM site_request_delivery WHERE created_at < ?').bind(now - 7 * 86400).run();
    const inserted = await db.prepare(`INSERT INTO site_request_delivery (request_id, payload_hash, rate_key, status, created_at)
      SELECT ?, ?, ?, 'sending', ? WHERE (SELECT COUNT(*) FROM site_request_delivery WHERE rate_key = ? AND created_at > ?) < 5
      ON CONFLICT(request_id) DO NOTHING`).bind(id, digest, rateKey, now, rateKey, now - 3600).run();
    if (inserted.meta?.changes !== 1) return fail(429, 'Plusieurs demandes ont déjà été effectuées. Patientez ou contactez-nous par e-mail ou WhatsApp.');
  } catch { return fail(503); }
  let response;
  try {
    // POST is additive: omitted fields/groups survive. Never send status or resubscribe.
    response = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST', redirect: 'manual',
      headers: { Authorization: `Bearer ${env.MAILERLITE_API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, fields: { name: firstName }, groups: [group.groupId] }),
      signal: AbortSignal.timeout(15000),
    });
  } catch { response = null; }
  const sent = response?.status === 200 || response?.status === 201;
  // As in subscribe.js, log only the numeric status, never upstream body/errors.
  if (!sent) console.error('Checklist MailerLite request failed', { status: response?.status || null });
  const state = sent ? 'sent' : response && response.status >= 400 && response.status < 500 ? 'failed' : 'uncertain';
  try { await db.prepare('UPDATE site_request_delivery SET status = ? WHERE request_id = ?').bind(state, id).run(); }
  catch { /* A receipt failure never triggers another upstream call. */ }
  return sent ? json({ success: true }) : fail(502);
}
export function onRequestGet() { return fail(405); }
export function onRequestOptions() { return fail(405); }
