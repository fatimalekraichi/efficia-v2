import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture,EMAIL } from './commerceFixture.js';
import { onRequestPost as prepareCheckout } from '../functions/prepare-checkout.js';
import { resolveMailerLiteGroupId,resolvePublicSite } from '../functions/lib/environmentIsolation.js';
const PREVIEW_ORIGIN='https://isolation-test.efficiadigital.pages.dev';
const jsonRequest=(origin,path,body,headers={})=>new Request(`${origin}${path}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...headers},body:JSON.stringify(body)});
for(const mode of ['preview','production'])test(`${mode}: Checkout and groups remain in the configured environment`,async t=>{
 const f=fixture();if(mode==='production'){f.env.SITE_URL='https://efficiadigital.com';f.env.STRIPE_MODE='live';f.env.STRIPE_SECRET_KEY='sk_live_simulation_only';}
 t.mock.method(globalThis,'fetch',f.fetch);
 const r=await prepareCheckout({env:f.env,request:jsonRequest(f.env.SITE_URL,'/prepare-checkout',f.payload())});assert.equal(r.status,200);
 const result=await r.json();assert.equal(result.mailerlite_group_id,undefined);
 const body=f.calls.find(c=>c.url.includes('api.stripe.com')&&c.method==='POST').body;
 assert.equal(body.success_url,`${f.env.SITE_URL}/paiement-reussi?session_id={CHECKOUT_SESSION_ID}`);
 assert.equal(body['metadata[source]'],f.env.SITE_URL);
 assert.deepEqual(f.people.get(EMAIL).groups.map(g=>g.id),[mode==='preview'?'101':'201']);
});
test('untrusted request origins and missing configuration cause no external call',async t=>{
 const f=fixture();t.mock.method(globalThis,'fetch',f.fetch);
 for(const origin of ['https://evil.example','https://efficiadigital.com']) {
  const r=await prepareCheckout({env:f.env,request:jsonRequest(origin,'/prepare-checkout',f.payload())});assert.equal(r.status,403);
 }
 const missing=await prepareCheckout({env:{...f.env,SITE_URL:''},request:jsonRequest(f.env.SITE_URL,'/prepare-checkout',f.payload())});assert.equal(missing.status,500);
 const forged=await prepareCheckout({env:f.env,request:jsonRequest(f.env.SITE_URL,'/prepare-checkout',f.payload(),{Origin:'https://evil.example'})});assert.equal(forged.status,403);
 assert.equal(f.calls.length,0);
});
test('missing and colliding mappings fail before Checkout',async t=>{
 const f=fixture();t.mock.method(globalThis,'fetch',f.fetch);delete f.env.MAILERLITE_PREVIEW_AUDIT_PROSPECT_GROUP_ID;
 const r=await prepareCheckout({env:f.env,request:jsonRequest(f.env.SITE_URL,'/prepare-checkout',f.payload())});assert.equal(r.status,503);assert.equal(f.calls.length,0);
 const selector={productCode:'audit',role:'client'};
 assert.equal(resolveMailerLiteGroupId({MAILERLITE_PREVIEW_AUDIT_CLIENT_GROUP_ID:'1',MAILERLITE_PRODUCTION_AUDIT_CLIENT_GROUP_ID:'1'},'preview',selector).ok,false);
});
test("resolvePublicSite ignore les en-têtes Origin et utilise la configuration validée", () => {
  const request = jsonRequest(PREVIEW_ORIGIN, "/prepare-checkout", {}, {
    Origin: "https://evil.example",
    Host: "evil.example",
  });
  const result = resolvePublicSite(request, { SITE_URL: PREVIEW_ORIGIN });
  assert.equal(result.ok, true);
  assert.equal(result.origin, PREVIEW_ORIGIN);

  const rootPagesOrigin = "https://efficiadigital.pages.dev";
  const rootResult = resolvePublicSite(
    jsonRequest(rootPagesOrigin, "/prepare-checkout", {}),
    { SITE_URL: rootPagesOrigin },
  );
  assert.equal(rootResult.ok, true);
  assert.equal(rootResult.origin, rootPagesOrigin);
});

test('le sélecteur checklist isole ses groupes et refuse absence, collision et identifiant invalide', () => {
  const selector = { purpose: 'checklist' };
  const env = { MAILERLITE_PRODUCTION_CHECKLIST_GROUP_ID: 'production-checklist', MAILERLITE_PREVIEW_CHECKLIST_GROUP_ID: 'preview-checklist' };
  assert.equal(resolveMailerLiteGroupId(env, 'production', selector).groupId, 'production-checklist');
  assert.equal(resolveMailerLiteGroupId(env, 'preview', selector).groupId, 'preview-checklist');
  assert.equal(resolveMailerLiteGroupId({ ...env, MAILERLITE_PREVIEW_CHECKLIST_GROUP_ID: '' }, 'preview', selector).ok, false);
  assert.equal(resolveMailerLiteGroupId({ ...env, MAILERLITE_PREVIEW_CHECKLIST_GROUP_ID: 'production-checklist' }, 'preview', selector).error, 'MAILERLITE_GROUP_ENVIRONMENT_COLLISION');
  assert.equal(resolveMailerLiteGroupId({ ...env, MAILERLITE_PREVIEW_CHECKLIST_GROUP_ID: 'invalid / group' }, 'preview', selector).ok, false);
});
