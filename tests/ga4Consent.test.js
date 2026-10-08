import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/ga4.js', import.meta.url), 'utf8');
function harness(url = 'https://efficiadigital.com/?email=secret@example.test#secret') {
  const scripts = [], listeners = {}, writes = [];
  const window = { location: new URL(url) };
  const document = {
    get cookie() { return '_ga=abc; _ga_1V7NDZGLG4=xyz; necessary=keep'; },
    set cookie(value) { writes.push(value); },
    getElementById: id => scripts.find(s => s.id === id),
    createElement: () => ({ listeners: {}, addEventListener(n, cb) { this.listeners[n] = cb; }, remove() { scripts.splice(scripts.indexOf(this), 1); } }),
    head: { appendChild: s => scripts.push(s) },
    addEventListener: (n, cb) => { listeners[n] = cb; },
  };
  const context = { window, document, URL };
  vm.runInNewContext(source, context);
  const commands = () => (window.efficiaGA4Layer || []).map(a => Array.from(a));
  const events = () => commands().filter(a => a[0] === 'event');
  const click = (href, trackLocation) => listeners.click({ target: { closest: () => ({ href, dataset: { trackLocation } }) } });
  return { window, api: window.efficiaGA4, scripts, commands, events, click, writes, context };
}
test('no Google script or queue before choice or refusal; contacts and forms are dropped', () => {
  const h = harness(); h.click('tel:+321234567'); h.api.trackFormSuccess('diagnostic', 'private');
  h.api.setConsent(false);
  assert.equal(h.scripts.length, 0); assert.equal(h.commands().length, 0);
  assert.equal(h.window['ga-disable-G-1V7NDZGLG4'], true);
});
test('one script/config/page_view, including repeated consent and duplicate initialization', () => {
  const h = harness(); h.api.setConsent(true); h.api.setConsent(true);
  assert.equal(h.commands().length, 0);
  h.scripts[0].listeners.load(); h.api.setConsent(true);
  vm.runInNewContext(source, h.context);
  assert.equal(h.scripts.length, 1); assert.equal(h.commands().filter(a => a[0] === 'config').length, 1);
  assert.equal(h.events().filter(a => a[1] === 'page_view').length, 1);
  const config = h.commands().find(a => a[0] === 'config')[2];
  assert.equal(config.send_page_view, false); assert.equal(config.page_referrer, '');
  assert.equal(config.page_location, 'https://efficiadigital.com/');
  assert.equal(config.allow_google_signals, false);
  assert.ok(!JSON.stringify(h.commands()).includes('secret'));
});
test('withdrawal during tag load prevents late activation, reacceptance works', () => {
  const h = harness(); h.api.setConsent(true); h.api.setConsent(false);
  h.scripts[0].listeners.load(); assert.equal(h.events().length, 0);
  assert.equal(h.window['ga-disable-G-1V7NDZGLG4'], true);
  h.api.setConsent(true); assert.equal(h.events().length, 1); assert.equal(h.scripts.length, 1);
});
test('withdrawal clears pending commands and cookies, blocks events, reacceptance has no duplicate view', () => {
  const h = harness(); h.api.setConsent(true); h.scripts[0].listeners.load();
  h.click('mailto:private@example.test'); h.api.setConsent(false);
  h.click('tel:+321234567'); h.api.trackFormSuccess('site_request', 'private-id');
  assert.equal(h.events().length, 0); assert.ok(h.writes.some(x => x.startsWith('_ga=')));
  assert.ok(h.writes.every(x => !x.startsWith('necessary=')));
  h.api.setConsent(true); assert.equal(h.events().length, 0);
  assert.equal(h.api.trackFormSuccess('site_request', 'private-id'), false);
});
test('contacts carry channel only; leads carry generic form name and deduplicate locally', () => {
  const h = harness(); h.api.setConsent(true); h.scripts[0].listeners.load();
  ['tel:+321234567','mailto:private@example.test?body=secret','https://wa.me/321234567?text=secret','https://wa.me.evil.test/'].forEach(h.click);
  h.api.trackFormSuccess('diagnostic', 'secret-id'); h.api.trackFormSuccess('diagnostic', 'secret-id');
  h.api.trackFormSuccess('site_request', 'other-id'); h.api.trackFormSuccess('arbitrary-secret', 'id');
  assert.equal(h.events().filter(a => a[1] === 'contact_click').length, 3);
  assert.equal(h.events().filter(a => a[1] === 'generate_lead').length, 2);
  assert.ok(!/private|secret|321234567|other-id/.test(JSON.stringify(h.commands())));
});
test('preview, internal tools, admin and unknown paths fail closed even with consent', () => {
  for (const url of ['http://efficiadigital.com/', 'https://branch.efficia.pages.dev/', 'http://localhost:8765/', 'https://preview.efficiadigital.com/', 'https://efficiadigital.com/admin', 'https://efficiadigital.com/admin.html', 'https://efficiadigital.com/admin/free-diagnostic-production/', 'https://efficiadigital.com/outil-score-efficia-auto-v5.html', 'https://efficiadigital.com/customer/private']) {
    const h = harness(url); h.api.setConsent(true); assert.equal(h.scripts.length, 0, url);
  }
});
test('all public documents load one GA module before consent; diagnostic inherits home', () => {
  for (const name of ['site-internet-electricien','index','services','a-propos','contact','optimisation-google-business','achat','audit-google-business','refonte-site-internet','paiement-reussi','mentions-legales','cgv','politique-cookies','politique-confidentialite','404']) {
    const html = readFileSync(new URL(`../${name}.html`, import.meta.url), 'utf8');
    assert.equal((html.match(/src="[^" ]*js\/ga4\.js/g) || []).length, 1, name);
    assert.ok(html.indexOf('js/ga4.js') < html.indexOf('js/cookies.js'));
    assert.ok(!/googletagmanager\.com|gtag\(/.test(html));
  }
});
test('form conversion hooks are after verified server success, never submit/click listeners', () => {
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const site = readFileSync(new URL('../js/refonte-site.js', import.meta.url), 'utf8');
  assert.ok(app.indexOf('window.efficiaGA4?.trackFormSuccess') > app.indexOf('const [result] = await Promise.all([submitLeadRequest(payload)'));
  assert.ok(site.indexOf('window.efficiaGA4?.trackFormSuccess') > site.indexOf("result?.status !== 'sent'"));
});

test('contact conversion also requires confirmed server delivery', () => {
 const source = readFileSync(new URL('../js/contact.js', import.meta.url), 'utf8');
 assert.ok(source.indexOf('window.efficiaGA4?.trackFormSuccess') > source.indexOf("result?.status !== 'sent'"));
 const h = harness('https://efficiadigital.com/contact'); h.api.setConsent(true); h.scripts[0].listeners.load();
 h.api.trackFormSuccess('contact', 'private-id'); h.api.trackFormSuccess('contact', 'private-id');
 assert.equal(h.events().filter(e => e[1] === 'generate_lead').length, 1);
 assert.equal(h.events().at(-1)[2].form_name, 'contact');
});


test('conversion clicks use one delegated listener and allowlisted locations without URL data', () => {
 const h = harness();
 h.click('https://wa.me/321234567?text=secret', 'sticky_bar');
 h.click('https://efficiadigital.com/contact?email=private@example.test', 'hero');
 assert.equal(h.events().length, 0);
 h.api.setConsent(true); h.scripts[0].listeners.load();
 for (const place of ['sticky_bar', 'header', 'footer', 'contact_page', 'menu']) h.click('https://wa.me/321234567?text=secret', place);
 for (const place of ['hero', 'sticky_bar', 'header', 'process', 'final_cta', 'menu', 'footer']) h.click('https://efficiadigital.com/contact?email=private@example.test', place);
 assert.equal(h.events().filter(e => e[1] === 'whatsapp_click').length, 5);
 assert.equal(h.events().filter(e => e[1] === 'contact_cta_click').length, 7);
 h.click('https://wa.me.evil.test/', 'sticky_bar');
 h.click('https://other.test/contact', 'hero');
 h.click('https://efficiadigital.com/contact', 'private@example.test');
 assert.equal(h.events().filter(e => e[1] === 'contact_cta_click').length, 7);
 assert.ok(!/private|secret|321234567/.test(JSON.stringify(h.events())));
 h.api.setConsent(false); h.click('https://wa.me/321234567', 'footer');
 assert.equal(h.events().length, 0);
 assert.equal((source.match(/document.addEventListener\("click"/g) || []).length, 1);
});
test('contact topics are finite values; lead remains deduplicated and consent gated', () => {
 const h = harness('https://efficiadigital.com/contact');
 h.api.setConsent(true); h.scripts[0].listeners.load();
 for (const topic of ['', 'google', 'site', 'les-deux', 'ne-sait-pas']) h.api.trackFormSuccess('contact', topic, topic);
 assert.equal(JSON.stringify(h.events().filter(e => e[1] === 'generate_lead').map(e => e[2].topic)), JSON.stringify(['', 'google', 'site', 'les-deux', 'ne-sait-pas']));
 h.api.trackFormSuccess('contact', 'secret-id', 'private@example.test');
 assert.equal(h.events().at(-1)[2].topic, undefined);
 h.api.setConsent(false); h.api.trackFormSuccess('contact', 'denied', 'site');
 assert.equal(h.events().length, 0);
});
