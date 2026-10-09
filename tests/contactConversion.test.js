import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { validateSiteRequest } from '../js/site-request-validation.js';
const source = readFileSync(new URL('../js/contact.js', import.meta.url), 'utf8').replace(/^import[^\n]+\n/, '');
function harness(resultKind) {
  const input = { source: 'contact', name: 'Prénom privé', contact: 'private@example.test', company: '', message: 'Message privé', website: '', topic: 'les-deux', company_url: '' };
  const events = [], listeners = {};
  const status = { dataset: {}, focus() {} }, button = {};
  let resets = 0, sends = 0;
  const form = {
    action: '/api/site-request', elements: {},
    querySelector: selector => selector === '.site-form-status' ? status : button,
    addEventListener: (name, callback) => { listeners[name] = callback; },
    setAttribute() {}, removeAttribute() {}, reset() { resets++; },
  };
  vm.runInNewContext(source, {
    document: { querySelector: () => form }, location: { search: '' }, URLSearchParams,
    crypto: { randomUUID: () => 'local-request-id' }, AbortSignal,
    validateSiteRequest,
    FormData: class { [Symbol.iterator]() { return Object.entries(input)[Symbol.iterator](); } },
    window: { efficiaGA4: { trackFormSuccess: (...args) => events.push(args) } },
    fetch: async () => {
      sends++;
      if (resultKind === 'network-error') throw new TypeError('network');
      return { ok: resultKind !== 'http-error', json: async () => ({ success: true, status: resultKind === 'queued' ? 'queued' : 'sent', requestId: resultKind === 'wrong-id' ? 'other' : 'local-request-id' }) };
    },
  });
  return { submit: () => listeners.submit({ preventDefault() {} }), events, status, button, resets: () => resets, sends: () => sends };
}
test('contact emits topic only after confirmed sent receipt and resets fields afterward', async () => {
  const h = harness('sent');
  assert.equal(h.events.length, 0);
  await h.submit();
  assert.equal(h.sends(), 1);
  assert.equal(JSON.stringify(h.events), JSON.stringify([['contact', 'local-request-id', 'les-deux']]));
  assert.equal(h.status.dataset.state, 'success');
  assert.equal(h.resets(), 1);
  assert.equal(h.button.disabled, false);
  assert.doesNotMatch(JSON.stringify(h.events), /private|Prénom|Message/);
});
test('unconfirmed, wrong receipt, HTTP and network failures keep fields and never track', async () => {
  for (const kind of ['queued', 'wrong-id', 'http-error', 'network-error']) {
    const h = harness(kind); await h.submit();
    assert.equal(h.events.length, 0, kind);
    assert.equal(h.resets(), 0, kind);
    assert.equal(h.status.dataset.state, 'error', kind);
    assert.equal(h.button.disabled, false, kind);
  }
});
