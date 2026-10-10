import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { onRequestPost, onRequestGet, onRequestOptions } from '../functions/api/checklist.js';
const production = 'https://efficiadigital.com';
const preview = 'https://checklist.efficiadigital.pages.dev';
const valid = () => ({ firstName: 'Prénom privé', email: 'private@example.test', consent: true, company_url: '' });
function environment(origin = production) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/0022_site_request_delivery.sql', import.meta.url), 'utf8'));
  return { sql, env: { SITE_URL: origin, MAILERLITE_API_KEY: 'test-only-secret',
    MAILERLITE_PRODUCTION_CHECKLIST_GROUP_ID: 'prod-checklist', MAILERLITE_PREVIEW_CHECKLIST_GROUP_ID: 'preview-checklist',
    ORDERS_DB: { prepare(query) { return { bind(...values) { return {
      run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...values).changes) } }),
    }; } }; } },
  } };
}
function request(body = valid(), origin = production, headers = {}) {
  return new Request(`${origin}/api/checklist`, { method: 'POST', headers: {
    Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...headers,
  }, body: JSON.stringify(body) });
}
test('validation refuses missing, malformed, overlong fields and non-boolean consent before fetch', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw Error('unexpected'); });
  const { env } = environment();
  for (const patch of [{ firstName: '' }, { firstName: ' ' }, { firstName: 1 }, { firstName: 'a'.repeat(81) },
    { email: '' }, { email: 'bad@' }, { email: 'a b@example.test' }, { email: 'a'.repeat(250) + '@b.test' },
    { consent: undefined }, { consent: false }, { consent: 'true' }, { consent: 1 }]) {
    const result = await onRequestPost({ request: request({ ...valid(), ...patch }), env });
    assert.equal(result.status, 400); assert.equal((await result.json()).success, false);
  }
  for (const body of [null, [], 'invalid']) assert.equal((await onRequestPost({ request: request(body), env })).status, 400);
  assert.equal(mock.mock.callCount(), 0);
});
test('honeypot simulates success without D1 or MailerLite', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw Error('unexpected'); });
  const result = await onRequestPost({ request: request({ company_url: 'spam' }), env: {} });
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), { success: true });
  assert.equal(mock.mock.callCount(), 0);
});
test('production and preview use only their group; existing fields, groups and status are not replayed', async t => {
  for (const [origin, group] of [[production, 'prod-checklist'], [preview, 'preview-checklist']]) {
    const mock = t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(url, 'https://connect.mailerlite.com/api/subscribers');
      assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'manual');
      assert.deepEqual(JSON.parse(options.body), { email: valid().email, fields: { name: valid().firstName }, groups: [group] });
      return Response.json({ data: { id: 'test' } }, { status: 201 });
    });
    const { env, sql } = environment(origin);
    const response = await onRequestPost({ request: request(valid(), origin), env });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { success: true });
    const rows = sql.prepare('SELECT * FROM site_request_delivery').all();
    assert.equal(rows[0].status, 'sent');
    assert.doesNotMatch(JSON.stringify(rows), /private|Prénom|192\.0\.2\.1|test-only-secret/);
    assert.match(rows[0].payload_hash, /^[a-f0-9]{64}$/);
    assert.equal(mock.mock.callCount(), 1); mock.mock.restore(); sql.close();
  }
});
test('missing configuration, origin mismatch and colliding groups fail closed without production fallback', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw Error('unexpected'); });
  for (const patch of [{ MAILERLITE_API_KEY: '' }, { ORDERS_DB: null }, { SITE_URL: '' },
    { MAILERLITE_PREVIEW_CHECKLIST_GROUP_ID: '' }, { MAILERLITE_PREVIEW_CHECKLIST_GROUP_ID: 'prod-checklist' }]) {
    const { env } = environment(preview);
    assert.equal((await onRequestPost({ request: request(valid(), preview), env: { ...env, ...patch } })).status, 503);
  }
  assert.equal((await onRequestPost({ request: request(valid(), preview), env: environment().env })).status, 403);
  assert.equal(mock.mock.callCount(), 0);
});
test('rate limit permits five attempts per hour, rejects sixth and stores no raw personal data', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 200 }));
  const { env, sql } = environment();
  for (let i = 0; i < 5; i++) assert.equal((await onRequestPost({ request: request(), env })).status, 200);
  assert.equal((await onRequestPost({ request: request(), env })).status, 429);
  assert.equal(mock.mock.callCount(), 5);
  sql.exec('UPDATE site_request_delivery SET created_at = created_at - 3601');
  assert.equal((await onRequestPost({ request: request(), env })).status, 200);
  assert.doesNotMatch(JSON.stringify(sql.prepare('SELECT * FROM site_request_delivery').all()), /private@example|Prénom privé|192\.0\.2\.1/);
  sql.close();
});
test('upstream failures and transport exceptions return generic 502 and never log personal data', async t => {
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  for (const code of [204, 302, 422, 500, null]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => {
      if (code === null) throw Object.assign(Error('Prénom privé private@example.test'), { name: 'Prénom privé' });
      return new Response(code === 204 ? null : 'Prénom privé private@example.test', { status: code });
    });
    const { env } = environment();
    const response = await onRequestPost({ request: request(), env });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { success: false, error: 'Une erreur est survenue. Merci de réessayer dans quelques instants.' });
    mock.mock.restore();
  }
  assert.equal(logs.length, 5);
  assert.doesNotMatch(JSON.stringify(logs), /Prénom|private@example|test-only-secret/);
});
test('protocol checks, malformed/oversized JSON and unavailable D1 never call upstream', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw Error('unexpected'); });
  const { env } = environment();
  assert.equal((await onRequestPost({ request: request(valid(), production, { Origin: 'https://evil.test' }), env })).status, 403);
  assert.equal((await onRequestPost({ request: request(valid(), production, { 'Content-Type': 'text/plain' }), env })).status, 415);
  for (const body of ['{', 'x'.repeat(33000)]) {
    const req = new Request(`${production}/api/checklist`, { method: 'POST', headers: { Origin: production, 'Content-Type': 'application/json' }, body });
    assert.equal((await onRequestPost({ request: req, env })).status, 400);
  }
  env.ORDERS_DB.prepare = () => { throw Error('unavailable'); };
  assert.equal((await onRequestPost({ request: request(), env })).status, 503);
  assert.equal(onRequestGet().status, 405); assert.equal(onRequestOptions().status, 405);
  assert.equal(mock.mock.callCount(), 0);
});
test('public placements share one form, have a no-JS fallback and do not expose PDF before success', () => {
  const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
  for (const name of ['checklist-site-internet.html', 'refonte-site-internet.html']) {
    const html = read(name);
    assert.match(html, /data-checklist/); assert.match(html, /<noscript>.*mailto:.*wa\.me/s);
    assert.match(html, /src="\/js\/checklist.js"/);
    assert.doesNotMatch(html, /href="[^" ]*votre-site-en-10-points.pdf/);
  }
  const refonte = read('refonte-site-internet.html');
  assert.ok(refonte.indexOf('id="faq"') < refonte.indexOf('data-checklist'));
  assert.ok(refonte.indexOf('data-checklist') < refonte.indexOf('class="section site-founder"'));
  for (const name of readdirSync(new URL('../', import.meta.url)).filter(n => n.endsWith('.html'))) {
    const html = read(name);
    if (html.includes('<footer class="footer"')) assert.match(html.match(/<footer[\s\S]*?<\/footer>/)[0], /href="\/checklist-site-internet"/);
  }
  assert.match(read('_headers'), /\/assets\/documents\/votre-site-en-10-points.pdf\s+X-Robots-Tag: noindex/);
  assert.match(read('sitemap.xml'), /https:\/\/efficiadigital.com\/checklist-site-internet/);
});
