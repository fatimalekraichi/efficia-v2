import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture,EMAIL } from './commerceFixture.js';
import { preparePurchase,recordSession } from '../functions/lib/commerceCheckout.js';
import { handleEvent,signatureValid } from '../functions/lib/commerceEvents.js';
import { sql,now,groups,queueDiagnostic,syncContact,commercialAllowed,contactJob } from '../functions/lib/commerceCore.js';
import { dispatchReminder,resumePurchase,recoveryToken,resolveToken,stopContact,runCommerceJobs } from '../functions/lib/commerceReminders.js';
import { onRequest as resumeRoute } from '../functions/reprendre-commande.js';
import { onRequestPost as subscribe } from '../functions/subscribe.js';

async function scenario(t,run){const f=fixture();t.mock.method(globalThis,'fetch',f.fetch);await run(f);}
const attempt=async f=>sql(f.env,'SELECT * FROM commerce_attempts ORDER BY created_at LIMIT 1').first();
const membership=f=>(f.people.get(EMAIL)?.groups||[]).map(g=>g.id);
const flush=async f=>{f.retry();await syncContact(f.env,EMAIL);};

for(const offer of ['audit','visibility','performance'])test(`${offer}: created session precedes prospect membership; paid client precedes removal`,t=>scenario(t,async f=>{
 const result=await preparePurchase(f.env,f.payload(offer));const a=await attempt(f);assert.equal(result.url,a.checkout_url);
 assert.ok(membership(f).includes(groups(f.env).prospects[offer]));
 assert.ok(f.calls.findIndex(c=>c.url.includes('api.stripe.com')&&c.method==='POST')<f.calls.findIndex(c=>c.url.includes('/groups/')&&c.method==='POST'));
 const session=f.sessions.get(a.session_id);session.status='complete';session.payment_status='paid';
 await handleEvent(f.env,f.event(session));await flush(f);
 assert.ok(membership(f).includes(groups(f.env).clients[offer]));assert.ok(!membership(f).includes(groups(f.env).prospects[offer]));
 const add=f.calls.findIndex(c=>c.url.endsWith(`/groups/${groups(f.env).clients[offer]}`)&&c.method==='POST');
 const remove=f.calls.findIndex(c=>c.url.endsWith(`/groups/${groups(f.env).prospects[offer]}`)&&c.method==='DELETE');assert.ok(add<remove);
 assert.equal((await sql(f.env,'SELECT count(*) n FROM orders').first()).n,1);
 assert.equal((await sql(f.env,'SELECT count(*) n FROM order_tasks').first()).n,1);
}));
test('Stripe failure: no pending group, retry uses the persisted attempt',t=>scenario(t,async f=>{
 const p=f.payload();f.fail=c=>c.url.includes('api.stripe.com');await assert.rejects(preparePurchase(f.env,p));
 assert.equal(f.people.size,0);assert.equal((await attempt(f)).session_id,null);
 f.fail=null;await preparePurchase(f.env,p);assert.equal(f.sessions.size,1);
}));
test('MailerLite outage: URL returned, durable retry succeeds',t=>scenario(t,async f=>{
 f.fail=c=>c.url.includes('mailerlite');const r=await preparePurchase(f.env,f.payload());assert.ok(r.url);
 const c=await sql(f.env,'SELECT * FROM commerce_contacts').first();assert.ok(c.revision>c.synced_revision);assert.ok(c.retry_at>now());
 f.fail=null;await flush(f);assert.ok(membership(f).includes('101'));
}));
test('concurrent same and different request IDs: one session',t=>scenario(t,async f=>{
 const p=f.payload();const result=await Promise.all([preparePurchase(f.env,p),preparePurchase(f.env,p),preparePurchase(f.env,{...p,request_id:crypto.randomUUID()})]);
 assert.equal(new Set(result.map(x=>x.url)).size,1);assert.equal(f.sessions.size,1);
 await assert.rejects(preparePurchase(f.env,{...p,product:'visibility'}),/CONFLICT/);
}));
test('uncertain Checkout beyond 23h is not blindly retried',t=>scenario(t,async f=>{
 const p=f.payload();f.fail=c=>c.url.includes('api.stripe.com');await assert.rejects(preparePurchase(f.env,p));f.due();f.fail=null;
 await assert.rejects(preparePurchase(f.env,p),/RECONCILIATION/);assert.equal(f.sessions.size,0);
}));
test('unpaid completion then async success: no premature client',t=>scenario(t,async f=>{
 await preparePurchase(f.env,f.payload());const s=[...f.sessions.values()][0];s.status='complete';s.payment_intent={id:'pi_test',status:'processing'};
 await handleEvent(f.env,f.event(s));await flush(f);assert.equal((await attempt(f)).state,'processing');assert.ok(!membership(f).includes('102'));
 f.due();assert.equal(await dispatchReminder(f.env,(await attempt(f)).id),'ASYNC_PENDING');assert.equal(f.emails.length,0);
 s.payment_status='paid';s.payment_intent.status='succeeded';await handleEvent(f.env,f.event(s,'checkout.session.async_payment_succeeded'));await flush(f);assert.ok(membership(f).includes('102'));
}));
test('async failure permits eligible J+1; expiry is not required',t=>scenario(t,async f=>{
 await preparePurchase(f.env,f.payload());const s=[...f.sessions.values()][0];s.status='complete';s.payment_intent={id:'pi_test',status:'requires_payment_method'};
 await handleEvent(f.env,f.event(s,'checkout.session.async_payment_failed'));assert.equal((await attempt(f)).state,'failed');f.due();
 assert.equal(await dispatchReminder(f.env,(await attempt(f)).id),'accepted');assert.equal(f.emails.length,1);
 assert.ok(!f.emails[0].text.includes('échoué'));
}));
test('repeated and different concurrent events: one order, task and client entry',t=>scenario(t,async f=>{
 await preparePurchase(f.env,f.payload());const s=[...f.sessions.values()][0];s.status='complete';s.payment_status='paid';const e=f.event(s);
 await Promise.all([handleEvent(f.env,e),handleEvent(f.env,e),handleEvent(f.env,f.event(s,'checkout.session.async_payment_succeeded'))]);
 await Promise.all([syncContact(f.env,EMAIL),syncContact(f.env,EMAIL)]);await flush(f);
 for(const table of ['orders','order_items','order_tasks'])assert.equal((await sql(f.env,`SELECT count(*) n FROM ${table}`).first()).n,1);
 assert.equal(f.calls.filter(c=>c.method==='POST'&&c.url.endsWith('/groups/102')).length,1);
 await handleEvent(f.env,f.event(s,'checkout.session.expired'));await flush(f);assert.equal((await attempt(f)).state,'paid');
}));
test('partial sync failure preserves client and retries removal without new client entry',t=>scenario(t,async f=>{
 await preparePurchase(f.env,f.payload());const s=[...f.sessions.values()][0];s.status='complete';s.payment_status='paid';
 await handleEvent(f.env,f.event(s));f.fail=c=>c.method==='DELETE';await flush(f);assert.deepEqual(membership(f).sort(),['101','102']);
 f.fail=null;await flush(f);assert.deepEqual(membership(f),['102']);assert.equal(f.calls.filter(c=>c.method==='POST'&&c.url.endsWith('/groups/102')).length,1);
}));
test('client addition failure never removes pending group',t=>scenario(t,async f=>{
 await preparePurchase(f.env,f.payload());const s=[...f.sessions.values()][0];s.payment_status='paid';await handleEvent(f.env,f.event(s));
 f.fail=c=>c.url.endsWith('/groups/102');await flush(f);assert.ok(membership(f).includes('101'));assert.equal(f.calls.filter(c=>c.method==='DELETE').length,0);
}));
test('unsubscribed address remains unsubscribed, no J+1',t=>scenario(t,async f=>{
 f.person('unsubscribed');await preparePurchase(f.env,f.payload());f.due();
 assert.equal(await dispatchReminder(f.env,(await attempt(f)).id),'INELIGIBLE');assert.equal(f.people.get(EMAIL).status,'unsubscribed');assert.equal(f.emails.length,0);
}));
test('open session: stable link reuses current Checkout, GET creates nothing',t=>scenario(t,async f=>{
 await preparePurchase(f.env,f.payload());f.due();const a=await attempt(f);assert.equal(await dispatchReminder(f.env,a.id),'accepted');
 const token=await recoveryToken(f.env,a.id),url=`${f.env.SITE_URL}/reprendre-commande?token=${token}`;
 const r=await resumeRoute({env:f.env,request:new Request(url)});assert.equal(r.status,200);assert.equal(f.sessions.size,1);
 assert.equal(await resumePurchase(f.env,await resolveToken(f.env,token)),a.checkout_url);assert.equal(f.sessions.size,1);
}));
test('expired session: one associated recovery session under concurrent clicks, no second reminder',t=>scenario(t,async f=>{
 await preparePurchase(f.env,f.payload());const a=await attempt(f),s=f.sessions.get(a.session_id);s.status='expired';s.url=null;s.expires_at=now()-1;
 await handleEvent(f.env,f.event(s,'checkout.session.expired'));f.due();assert.equal(await dispatchReminder(f.env,a.id),'accepted');
 const urls=await Promise.all([resumePurchase(f.env,a),resumePurchase(f.env,a)]);assert.equal(new Set(urls).size,1);assert.equal(f.sessions.size,2);
 const child=await sql(f.env,'SELECT * FROM commerce_attempts WHERE id!=root_id').first();assert.equal(child.root_id,a.id);assert.equal(child.offer,'audit');assert.equal(child.reminder_status,'pending');
 assert.ok(!f.emails[0].text.includes(a.checkout_url));assert.notEqual(urls[0],a.checkout_url);
 await dispatchReminder(f.env,a.id);assert.equal(f.emails.length,1);
}));
test('paid just before reminder, even without webhook: suppressed',t=>scenario(t,async f=>{
 await preparePurchase(f.env,f.payload());[...f.sessions.values()][0].payment_status='paid';f.due();assert.equal(await dispatchReminder(f.env,(await attempt(f)).id),'CLIENT');assert.equal(f.emails.length,0);
}));
test('concurrent reminder workers send at most once',t=>scenario(t,async f=>{
 await preparePurchase(f.env,f.payload());f.due();const id=(await attempt(f)).id;await Promise.all([dispatchReminder(f.env,id),dispatchReminder(f.env,id)]);assert.equal(f.emails.length,1);
}));
test('ambiguous provider response is quarantined without retry',t=>scenario(t,async f=>{
 await preparePurchase(f.env,f.payload());f.due();const id=(await attempt(f)).id;f.fail=c=>c.url.includes('hostinger');assert.equal(await dispatchReminder(f.env,id),'uncertain');f.fail=null;await dispatchReminder(f.env,id);assert.equal(f.emails.length,0);
}));
test('reminder disabled unless sole owner is explicitly verified',t=>scenario(t,async f=>{
 await preparePurchase(f.env,f.payload());f.due();delete f.env.COMMERCE_REMINDER_OWNER_VERIFIED;assert.equal(await dispatchReminder(f.env,(await attempt(f)).id),'disabled');assert.equal(f.emails.length,0);
}));
test('custom deposit, balance, full: scoped invoice metadata and no arbitrary Pack',t=>scenario(t,async f=>{
 for(const installment of ['deposit','balance','full']) {
  const i={id:`in_${installment}`,livemode:false,created:now(),status:'paid',amount_paid:70000,currency:'eur',customer_email:EMAIL,metadata:{efficia_automation:'custom_v1',efficia_environment:'preview',efficia_project_id:'test-project',efficia_installment:installment}};
  f.invoices.set(i.id,i);await handleEvent(f.env,f.event(i,'invoice.paid'));
 }
 await flush(f);assert.deepEqual(membership(f),['107']);assert.equal((await sql(f.env,'SELECT count(*) n FROM commerce_invoices').first()).n,3);
 assert.equal((await sql(f.env,'SELECT count(*) n FROM orders').first()).n,0);
}));
test('unmarked, historical and other-environment invoices are ignored',t=>scenario(t,async f=>{
 for(const [id,created,metadata] of [['in_unmarked',now(),{}],['in_old',0,{efficia_automation:'custom_v1'}],['in_other',now(),{efficia_automation:'custom_v1',efficia_environment:'production'}]]) {
  const i={id,created,metadata,livemode:false,status:'paid',amount_paid:70000,customer_email:EMAIL};f.invoices.set(id,i);assert.equal((await handleEvent(f.env,f.event(i,'invoice.paid'))).ignored,true);
 }
 assert.equal(f.people.size,0);
}));
test('STOP applies to a direct workflow entrant without trigger group',t=>scenario(t,async f=>{
 const person=f.person();assert.equal(commercialAllowed(person,groups(f.env)),true);await stopContact(f.env,EMAIL);
 assert.equal(commercialAllowed(f.people.get(EMAIL),groups(f.env)),false);assert.deepEqual(membership(f),['108']);
 for(const id of ['102','104','106','107'])assert.equal(commercialAllowed({...person,groups:[{id}]},groups(f.env)),false);
}));
test('diagnostic once per contact, group removal does not cause a repeated confirmation',t=>scenario(t,async f=>{
 await queueDiagnostic(f.env,EMAIL,{name:'Test'});await flush(f);assert.deepEqual(membership(f),['100']);
 f.people.get(EMAIL).groups=[];await queueDiagnostic(f.env,EMAIL,{name:'Test'});await flush(f);assert.deepEqual(membership(f),[]);
 assert.equal(f.calls.filter(c=>c.url.endsWith('/groups/100')&&c.method==='POST').length,1);
}));
test('diagnostic sync failure is retried durably by scheduled worker',t=>scenario(t,async f=>{
 await queueDiagnostic(f.env,EMAIL,{name:'Test'});f.fail=c=>c.url.includes('mailerlite');await syncContact(f.env,EMAIL);f.fail=null;f.retry();await runCommerceJobs(f.env);assert.deepEqual(membership(f),['100']);
}));
test('preview/live key, event mode and group-registry collisions fail closed',t=>scenario(t,async f=>{
 f.env.STRIPE_SECRET_KEY='sk_live_forbidden';await assert.rejects(preparePurchase(f.env,f.payload()),/MODE/);assert.equal(f.calls.length,0);f.env.STRIPE_SECRET_KEY='sk_test_simulation';
 await assert.rejects(handleEvent(f.env,{...f.event({id:'cs_test'}),livemode:true}),/MODE/);
 f.env.MAILERLITE_PREVIEW_AUDIT_CLIENT_GROUP_ID='202';await assert.rejects(preparePurchase(f.env,f.payload()),/COLLISION|REGISTRY/);assert.equal(f.calls.length,0);
}));
test('expired and tampered recovery tokens rejected',t=>scenario(t,async f=>{
 await preparePurchase(f.env,f.payload());const id=(await attempt(f)).id;
 await assert.rejects(resolveToken(f.env,await recoveryToken(f.env,id,now()-1)),/EXPIRED/);
 const token=await recoveryToken(f.env,id);await assert.rejects(resolveToken(f.env,token.slice(0,-1)+(token.endsWith('0')?'1':'0')),/INVALID/);
}));
test('webhook signature rejects stale timestamp and accepts a valid rotated signature',async()=>{
 const secret='mock',raw='{}',stamp=now();const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const mac=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${stamp}.${raw}`))),b=>b.toString(16).padStart(2,'0')).join('');
 assert.equal(await signatureValid(raw,`t=${stamp},v1=bad,v1=${mac}`,secret),true);assert.equal(await signatureValid(raw,`t=${stamp-400},v1=${mac}`,secret),false);
});

test('actual subscribe handler: capture then complete and repeated diagnostic, no report-sent group',t=>scenario(t,async f=>{
 const p={step:'lead_capture',first_name:'Sofia',email:EMAIL,idempotency_key:crypto.randomUUID()};
 const call=body=>subscribe({env:f.env,request:new Request(`${f.env.SITE_URL}/subscribe`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
 assert.equal((await call(p)).status,200);assert.deepEqual(membership(f),[]);
 const complete={...p,step:'diagnostic_request',company_name:'Test Efficia',city:'Bruxelles',country_code:'BE',declared_no_listing:true};
 assert.equal((await call(complete)).status,200);assert.deepEqual(membership(f),['100']);
 assert.equal((await call(complete)).status,200);assert.equal(f.calls.filter(c=>c.method==='POST'&&c.url.endsWith('/groups/100')).length,1);
 assert.equal((await sql(f.env,'SELECT count(*) n FROM diagnostic_lead_captures WHERE submitted_at IS NOT NULL').first()).n,1);
}));
test('actual diagnostic handler: failed complete request cannot confirm',t=>scenario(t,async f=>{
 const p={step:'diagnostic_request',first_name:'Sofia',email:EMAIL,idempotency_key:crypto.randomUUID(),company_name:'Test Efficia',city:'Bruxelles'};
 const r=await subscribe({env:f.env,request:new Request(`${f.env.SITE_URL}/subscribe`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)})});
 assert.equal(r.status,502);assert.equal(f.people.size,0);
}));
test('actual diagnostic handler: existing unsubscribed contact stays inactive and retains workflow state',t=>scenario(t,async f=>{
 const person=f.person('unsubscribed');person.fields.audit_status='diagnostic envoyé';
 const p={step:'diagnostic_request',first_name:'Sofia',email:EMAIL,idempotency_key:crypto.randomUUID(),company_name:'Test Efficia',city:'Bruxelles',declared_no_listing:true};
 const r=await subscribe({env:f.env,request:new Request(`${f.env.SITE_URL}/subscribe`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)})});
 assert.equal(r.status,200);assert.equal(f.people.get(EMAIL).status,'unsubscribed');assert.equal(f.people.get(EMAIL).fields.audit_status,'diagnostic envoyé');assert.deepEqual(membership(f),['100']);
}));

test('lost Stripe response: retry recovers same session',t=>scenario(t,async f=>{
 const p=f.payload();let lost=true;
 t.mock.method(globalThis,'fetch',async(...args)=>{const r=await f.fetch(...args);if(lost && String(args[0]).includes('api.stripe.com') && args[1].method==='POST'){lost=false;throw Error('simulated response lost');}return r;});
 await assert.rejects(preparePurchase(f.env,p));assert.equal(f.sessions.size,1);assert.equal(f.people.size,0);
 await preparePurchase(f.env,p);assert.equal(f.sessions.size,1);assert.ok(membership(f).includes('101'));
}));
test('D1 failure after Stripe creation: idempotent retry recovers without losing session',t=>scenario(t,async f=>{
 const p=f.payload(),batch=f.env.ORDERS_DB.batch.bind(f.env.ORDERS_DB);let fail=true;
 t.mock.method(f.env.ORDERS_DB,'batch',async statements=>{if(fail){fail=false;throw Error('DB unavailable');}return batch(statements);});
 await assert.rejects(preparePurchase(f.env,p));assert.equal(f.sessions.size,1);assert.equal(f.people.size,0);
 await preparePurchase(f.env,p);assert.equal(f.sessions.size,1);assert.ok((await attempt(f)).session_id);
}));
test('payment arrives between reminder checks: no send',t=>scenario(t,async f=>{
 await preparePurchase(f.env,f.payload());f.due();let reads=0;
 t.mock.method(globalThis,'fetch',async(...args)=>{if(String(args[0]).includes('api.stripe.com')&&args[1]?.method==='GET'&&++reads===2)[...f.sessions.values()][0].payment_status='paid';return f.fetch(...args);});
 assert.equal(await dispatchReminder(f.env,(await attempt(f)).id),'changed');assert.equal(f.emails.length,0);
}));
test('expired contact lease is recovered; current lease cannot be stolen',t=>scenario(t,async f=>{
 await queueDiagnostic(f.env,EMAIL,{name:'Test'});
 await sql(f.env,"UPDATE commerce_contacts SET lease_token='other',lease_until=?",now()+100).run();assert.equal(await syncContact(f.env,EMAIL),false);assert.equal(f.people.size,0);
 await sql(f.env,'UPDATE commerce_contacts SET lease_until=?',now()-1).run();assert.equal(await syncContact(f.env,EMAIL),true);assert.deepEqual(membership(f),['100']);
}));
test('new client on another offer suppresses pending reminders for all offers',t=>scenario(t,async f=>{
 await preparePurchase(f.env,f.payload('audit'));await preparePurchase(f.env,f.payload('visibility'));
 const s=[...f.sessions.values()].find(s=>s.metadata.product_code==='visibility');s.payment_status='paid';await handleEvent(f.env,f.event(s));await flush(f);f.due();
 assert.equal(await dispatchReminder(f.env,(await attempt(f)).id),'CLIENT');assert.equal(f.emails.length,0);assert.deepEqual(membership(f),['104']);
}));
test('legacy session paid after cutover is fulfilled without reminder or historical replay',t=>scenario(t,async f=>{
 f.env.COMMERCE_EVENT_CUTOVER=now()-10;
 const s={id:'cs_test_legacy',created:now()-86400,livemode:false,payment_status:'paid',status:'complete',customer_email:EMAIL,amount_total:9900,currency:'eur',metadata:{source:f.env.SITE_URL,product_code:'audit',customer_name:'Test',cgv_version:'historical',cgv_accepted_at:'2026-01-01T12:00:00Z'}};
 f.sessions.set(s.id,s);await handleEvent(f.env,f.event(s));await flush(f);assert.deepEqual(membership(f),['102']);assert.equal((await attempt(f)).reminder_status,'suppressed');
 const order=await sql(f.env,'SELECT * FROM orders').first();assert.equal(order.cgv_version,'historical');
 const old={...s,id:'cs_test_historical'};f.sessions.set(old.id,old);assert.equal((await handleEvent(f.env,{...f.event(old),created:1})).ignored,true);
 assert.equal((await sql(f.env,'SELECT count(*) n FROM orders').first()).n,1);
}));
for(const offer of ['visibility','performance'])test(`${offer}: J+1 draft references correct offer and remains single`,t=>scenario(t,async f=>{
 await preparePurchase(f.env,f.payload(offer));f.due();const id=(await attempt(f)).id;await dispatchReminder(f.env,id);await dispatchReminder(f.env,id);assert.equal(f.emails.length,1);assert.match(f.emails[0].text,offer==='visibility'?/Visibilité/:/Performance/);
}));


test('concurrent Stripe idempotency conflict retries the same frozen request',async t=>{
 const f=fixture();let tries=0;let first;
 t.mock.method(globalThis,'fetch',async(input,options)=>{
  if(String(input).endsWith('/checkout/sessions') && options.method==='POST') {
   const sent={key:options.headers['Idempotency-Key'],body:options.body.toString()};
   if(!tries++){first=sent;return Response.json({error:{code:'idempotency_key_in_use'}},{status:409});}
   assert.deepEqual(sent,first);
  }
  return f.fetch(input,options);
 });
 await preparePurchase(f.env,f.payload());assert.equal(tries,2);assert.equal(f.sessions.size,1);assert.equal(f.people.size,1);
});
test('different Stripe conflict is not retried or classified as a prospect',async t=>{
 const f=fixture();let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({error:{code:'different_conflict'}},{status:409});});
 await assert.rejects(preparePurchase(f.env,f.payload()),/STRIPE_HTTP_409/);assert.equal(calls,1);assert.equal(f.people.size,0);
});
