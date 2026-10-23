import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fixture,EMAIL } from './commerceFixture.js';
import { onRequestPost as prepareCheckout } from '../functions/prepare-checkout.js';
import { onRequestPost as legacyCheckout } from '../functions/create-checkout-session.js';
import { handleEvent } from '../functions/lib/commerceEvents.js';
import { syncContact,sql } from '../functions/lib/commerceCore.js';
import { ACTIVE_CGV_VERSION } from '../functions/lib/cgvAcceptance.js';
const root=new URL('../',import.meta.url);
const readProjectFile=path=>readFile(new URL(path,root),'utf8');
const context=(f,body)=>({env:f.env,request:new Request(`${f.env.SITE_URL}/prepare-checkout`,{method:'POST',headers:{Origin:f.env.SITE_URL,'Content-Type':'application/json'},body:JSON.stringify(body)})});
test("l’interface exige une acceptation explicite et accessible des CGV", async () => {
  const [html, script] = await Promise.all([
    readProjectFile("achat.html"),
    readProjectFile("js/purchase.js"),
  ]);

  const checkbox = html.match(/<input\s+[\s\S]*?id="cgv-acceptance"[\s\S]*?>/)?.[0] || "";
  assert.match(checkbox, /type="checkbox"/);
  assert.match(checkbox, /name="cgv_acceptance"/);
  assert.match(checkbox, /\brequired\b/);
  assert.doesNotMatch(checkbox, /\bchecked\b/);
  assert.match(html, /<label for="cgv-acceptance">/);
  assert.match(html, /href="\/cgv" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /data-cgv-error role="alert" aria-live="polite"/);
  assert.match(html, new RegExp(ACTIVE_CGV_VERSION));

  const form = html.match(/<form class="purchase-form"[\s\S]*?<\/form>/)?.[0] || "";
  assert.equal((form.match(/name="cgv_acceptance"/g) || []).length, 1);
  assert.doesNotMatch(form, /confirme[^<]*(?:activité|professionnel)|name="(?:bce|vat|tva|siren|siret|rcs|professional_id)"/iu);
  assert.match(form, /name="company_name"/);
  assert.match(form, /name="google_business_url"/);
  assert.match(form, /name="city"/);

  assert.match(script, /if \(!cgvAcceptance\?\.checked\)/);
  assert.match(script, /cgvAcceptance\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(script, /cgv_accepted: true/);
  assert.match(script, /cgv_version: formElement\.dataset\.cgvVersion/);
  assert.match(script, /Vous devez lire et accepter les Conditions générales de vente avant de poursuivre\./);
});


test('both endpoints reject absent, false, ambiguous and obsolete terms without external effects',async t=>{
 const f=fixture();t.mock.method(globalThis,'fetch',f.fetch);
 for(const handler of [prepareCheckout,legacyCheckout])for(const value of [undefined,false,null,'true',1,{},[]]) {
  const r=await handler(context(f,{...f.payload(),cgv_accepted:value}));assert.equal(r.status,409);assert.equal((await r.json()).error,'CGV_ACCEPTANCE_REQUIRED');
 }
 const r=await prepareCheckout(context(f,{...f.payload(),cgv_version:'obsolete'}));assert.equal(r.status,409);assert.equal(f.calls.length,0);
});
test('server acceptance proof survives retries and is projected to the paid order',async t=>{
 const f=fixture();t.mock.method(globalThis,'fetch',f.fetch);const p=f.payload();
 assert.equal((await prepareCheckout(context(f,p))).status,200);assert.equal((await prepareCheckout(context(f,p))).status,200);
 const s=[...f.sessions.values()][0];assert.equal(s.metadata.cgv_version,ACTIVE_CGV_VERSION);assert.ok(Number.isFinite(Date.parse(s.metadata.cgv_accepted_at)));
 s.payment_status='paid';s.status='complete';await handleEvent(f.env,f.event(s));await syncContact(f.env,EMAIL);
 const order=await sql(f.env,'SELECT * FROM orders').first();assert.equal(order.cgv_version,ACTIVE_CGV_VERSION);assert.equal(order.cgv_accepted_at,s.metadata.cgv_accepted_at);
 assert.equal(f.sessions.size,1);
});
test('historical migration remains untouched and new migration is additive',async()=>{
 const old=await readProjectFile('migrations/0012_order_cgv_acceptance.sql');assert.equal(createHash('sha256').update(old).digest('hex'),'3f73ac365c4a5d59d77c740c005327745385172c0fbde992c77a2a5fefe5d7e2');
 const added=await readProjectFile('migrations/0025_commerce_reconciliation.sql');assert.doesNotMatch(added,/DROP|DELETE FROM|UPDATE orders/i);assert.match(added,/CREATE TABLE commerce_attempts/);
});
test("les CGV définissent le Client professionnel et la rétractation B2B", async () => {
  const [successPage, cgvPage, sitemap] = await Promise.all([
    readProjectFile("paiement-reussi.html"),
    readProjectFile("cgv.html"),
    readProjectFile("sitemap.xml"),
  ]);

  assert.equal(ACTIVE_CGV_VERSION, "2026-10-19-v3");
  assert.match(cgvPage, /Version des CGV : 2026-10-19-v3/);
  assert.match(cgvPage, /Dernière mise à jour : 19 octobre 2026/);
  assert.match(cgvPage, /Les services Efficia Digital sont exclusivement destinés aux professionnels\./);
  assert.match(cgvPage, /Est considéré comme Client professionnel toute personne physique ou morale, publique ou privée/);
  assert.match(cgvPage, /le Client déclare agir exclusivement dans le cadre de son activité professionnelle et non à titre privé/);
  assert.match(cgvPage, /Les commandes effectuées en qualité de consommateur ne sont pas acceptées\./);
  assert.doesNotMatch(cgvPage, /Lorsque le client est un consommateur[^<]*il bénéficie du droit de rétractation/);
  assert.match(cgvPage, /le droit de rétractation de quatorze jours prévu pour les consommateurs ne s’applique pas aux commandes passées sur le site/);
  assert.match(cgvPage, /dispositions impératives éventuellement applicables/);
  assert.match(cgvPage, /<meta name="robots" content="noindex, follow">/);
  assert.doesNotMatch(sitemap, /https:\/\/efficiadigital\.com\/cgv<\/loc>/);
  assert.match(successPage, /href="\/cgv"[^>]*>Conditions générales de vente<\/a>/);
});
