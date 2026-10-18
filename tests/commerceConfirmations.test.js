import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,EMAIL} from './commerceFixture.js';
import {preparePurchase} from '../functions/lib/commerceCheckout.js';
import {handleEvent} from '../functions/lib/commerceEvents.js';
import {syncContact,now} from '../functions/lib/commerceCore.js';
import {runConfirmations} from '../functions/lib/commerceConfirmations.js';
for(const offer of ['audit','visibility','performance'])test(`${offer}: transactional confirmation once despite replay and concurrent jobs, preserves unsubscribe`,async t=>{
 const f=fixture();t.mock.method(globalThis,'fetch',f.fetch);f.person('unsubscribed');
 Object.assign(f.env,{COMMERCE_CONFIRMATIONS_ENABLED:'true',COMMERCE_CONFIRMATION_OWNER:'server_only',COMMERCE_CONFIRMATION_CUTOVER:now()-1});
 await preparePurchase(f.env,f.payload(offer));const s=[...f.sessions.values()][0];
 await runConfirmations(f.env);assert.equal(f.emails.length,0);
 s.payment_status='paid';s.status='complete';const e=f.event(s);await handleEvent(f.env,e);f.retry();await syncContact(f.env,EMAIL);
 await Promise.all([runConfirmations(f.env),runConfirmations(f.env)]);await handleEvent(f.env,e);await handleEvent(f.env,f.event(s));await runConfirmations(f.env);
 assert.equal(f.emails.length,1);assert.equal(f.people.get(EMAIL).status,'unsubscribed');assert.match(f.emails[0].subject,/Confirmation/);
});
test('confirmation opt-in flag, owner and cutover prevent historical flood',async t=>{
 const f=fixture();t.mock.method(globalThis,'fetch',f.fetch);assert.deepEqual(await runConfirmations(f.env),{disabled:true});
 Object.assign(f.env,{COMMERCE_CONFIRMATIONS_ENABLED:'true',COMMERCE_CONFIRMATION_OWNER:'server_only'});await assert.rejects(runConfirmations(f.env),/CUTOVER/);
});
