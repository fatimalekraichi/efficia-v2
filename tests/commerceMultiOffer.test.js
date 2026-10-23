import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,EMAIL} from './commerceFixture.js';
import {preparePurchase} from '../functions/lib/commerceCheckout.js';
import {handleEvent} from '../functions/lib/commerceEvents.js';
import {dispatchReminder,latestAttempt} from '../functions/lib/commerceReminders.js';
import {now,sql} from '../functions/lib/commerceCore.js';
const row=(f,id)=>f.env.ORDERS_DB.db.prepare('SELECT * FROM commerce_attempts WHERE id=?').get(id);
const age=(f,id,seconds=86410)=>f.env.ORDERS_DB.db.prepare('UPDATE commerce_attempts SET created_at=? WHERE id=?').run(now()-seconds,id);
async function setup(t){const f=fixture();t.mock.method(globalThis,'fetch',f.fetch);return f;}
test('latest offer restarts J+1 and old late event does not select old offer',async t=>{
 const f=await setup(t);const a=await preparePurchase(f.env,f.payload('audit'));age(f,a.attempt_id);
 const b=await preparePurchase(f.env,f.payload('visibility'));
 await handleEvent(f.env,f.event(f.sessions.get(row(f,a.attempt_id).session_id),'checkout.session.expired'));
 assert.equal((await latestAttempt(f.env,EMAIL)).id,b.attempt_id);
 assert.equal(await dispatchReminder(f.env,a.attempt_id),'REPLACED');
 assert.equal(await dispatchReminder(f.env,b.attempt_id),'already_claimed_or_not_due');assert.equal(f.emails.length,0);
 age(f,b.attempt_id,86401);assert.equal(await dispatchReminder(f.env,b.attempt_id),'accepted');assert.equal(f.emails.length,1);
});
test('paid old session protects newest offer even before webhook',async t=>{
 const f=await setup(t),a=await preparePurchase(f.env,f.payload('audit'));age(f,a.attempt_id,90000);
 const b=await preparePurchase(f.env,f.payload('visibility'));age(f,b.attempt_id);
 f.sessions.get(row(f,a.attempt_id).session_id).payment_status='paid';
 assert.equal(await dispatchReminder(f.env,b.attempt_id),'CLIENT');assert.equal(f.emails.length,0);
});
test('concurrent workers across offers and rolling contact limit',async t=>{
 const f=await setup(t),a=await preparePurchase(f.env,f.payload('audit'));age(f,a.attempt_id,90000);
 const b=await preparePurchase(f.env,f.payload('visibility'));age(f,b.attempt_id,86410);
 await Promise.all([dispatchReminder(f.env,a.attempt_id),dispatchReminder(f.env,b.attempt_id),dispatchReminder(f.env,b.attempt_id)]);
 assert.equal(f.emails.length,1);
 const c=await preparePurchase(f.env,f.payload('performance'));age(f,c.attempt_id,86401);
 assert.equal(await dispatchReminder(f.env,c.attempt_id),'CONTACT_RATE_LIMIT');assert.equal(f.emails.length,1);
 f.env.ORDERS_DB.db.exec('UPDATE commerce_reminder_contacts SET reserved_until=0');
 assert.equal(await dispatchReminder(f.env,c.attempt_id),'accepted');assert.equal(f.emails.length,2);
});
test('same-second attempts use insertion chronology, not random ID or event order',async t=>{
 const f=await setup(t),a=await preparePurchase(f.env,f.payload('audit')),b=await preparePurchase(f.env,f.payload('visibility'));
 f.env.ORDERS_DB.db.prepare('UPDATE commerce_attempts SET created_at=?').run(now()-86410);
 assert.equal((await latestAttempt(f.env,EMAIL)).id,b.attempt_id);
 await Promise.all([dispatchReminder(f.env,a.attempt_id),dispatchReminder(f.env,b.attempt_id)]);assert.equal(f.emails.length,1);
});
test('limited launch freezes card selection across retries',async t=>{
 const f=await setup(t);f.env.COMMERCE_PAYMENT_METHODS='card';const p=f.payload();await preparePurchase(f.env,p);await preparePurchase(f.env,p);
 const call=f.calls.find(c=>c.url.endsWith('/checkout/sessions')&&c.method==='POST');assert.equal(call.body['payment_method_types[0]'],'card');
 f.env.COMMERCE_PAYMENT_METHODS='unvalidated';await assert.rejects(preparePurchase(f.env,f.payload()),/UNVALIDATED/);
});

test('blocked synchronization suppresses a commercial reminder',async t=>{
 const f=fixture();t.mock.method(globalThis,'fetch',f.fetch);await preparePurchase(f.env,f.payload());f.due();
 await sql(f.env,'UPDATE commerce_contacts SET sync_blocked=1').run();
 const {dispatchReminder}=await import('../functions/lib/commerceReminders.js');
 const a=await sql(f.env,'SELECT id FROM commerce_attempts').first();assert.equal(await dispatchReminder(f.env,a.id),'SYNC_BLOCKED');assert.equal(f.emails.length,0);
});
