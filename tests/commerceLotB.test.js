import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,EMAIL} from './commerceFixture.js';
import {preparePurchase} from '../functions/lib/commerceCheckout.js';
import {dispatchReminder,runCommerceJobs,eligibility} from '../functions/lib/commerceReminders.js';
import {reminderCopy} from '../functions/lib/commerceReminderCopy.js';
import {sql,now} from '../functions/lib/commerceCore.js';
for(const offer of ['audit','visibility','performance'])test(`${offer}: final copy, fallback, encoded personal links`,()=>{
 const link='https://example.com/reprendre-commande?token=a&b=1';const c=reminderCopy(offer,link,link+'&action=stop','');
 assert.ok(c.text.startsWith('Bonjour,'));assert.ok(c.text.includes(link));assert.ok(c.html.includes('&amp;action=stop'));assert.ok(c.text.includes('relances commerciales Efficia Digital'));assert.ok(!/\{greeting\}|\{resume\}|\{stop\}|\[Prénom\]/.test(c.html));
 const x=reminderCopy(offer,link,link+'&action=stop','<img src=x onerror=alert(1)>');assert.ok(!x.html.includes('<img'));assert.ok(x.html.includes('&lt;img'));
});
test('missing activation cutover fails closed',async t=>{const f=fixture();t.mock.method(globalThis,'fetch',f.fetch);const a=await preparePurchase(f.env,f.payload());f.due();delete f.env.COMMERCE_REMINDER_CUTOVER;assert.equal(await dispatchReminder(f.env,a.attempt_id),'cutover_required');assert.equal((await runCommerceJobs(f.env)).reminders,0);assert.equal(f.emails.length,0);});
test('historical attempts never receive reminders after future cutover',async t=>{const f=fixture();t.mock.method(globalThis,'fetch',f.fetch);const a=await preparePurchase(f.env,f.payload());f.due();f.env.COMMERCE_REMINDER_CUTOVER=String(now()-3600);assert.equal((await runCommerceJobs(f.env)).reminders,0);assert.equal(await dispatchReminder(f.env,a.attempt_id),'already_claimed_or_not_due');assert.equal(f.emails.length,0);});
test('new recovery of historical root is excluded too',async t=>{const f=fixture();t.mock.method(globalThis,'fetch',f.fetch);const a=await preparePurchase(f.env,f.payload());const root=await sql(f.env,'SELECT * FROM commerce_attempts WHERE id=?',a.attempt_id).first();f.env.COMMERCE_REMINDER_CUTOVER=String(now()-86420);await sql(f.env,'UPDATE commerce_attempts SET created_at=? WHERE id=?',now()-90000,root.id).run();assert.equal((await eligibility(f.env,{...root,created_at:now()-86410})).reason,'BEFORE_CUTOVER');assert.equal(f.emails.length,0);});
test('disabled reminder engine does not require lot B migration for sync',async()=>{const f=fixture();f.env.COMMERCE_REMINDERS_ENABLED='false';f.env.ORDERS_DB.db.exec('DROP TABLE commerce_reminder_contacts');assert.equal((await runCommerceJobs(f.env)).reminders,0);});
test('old CGV accepted sessions still settle after version change',async t=>{
 const {handleEvent}=await import('../functions/lib/commerceEvents.js');const {syncContact,groups}=await import('../functions/lib/commerceCore.js');
 const f=fixture();t.mock.method(globalThis,'fetch',f.fetch);const p=await preparePurchase(f.env,f.payload());const a=await sql(f.env,'SELECT * FROM commerce_attempts WHERE id=?',p.attempt_id).first();
 const payload=JSON.parse(a.payload);payload.cgv_version='2026-08-18-v2';await sql(f.env,'UPDATE commerce_attempts SET payload=? WHERE id=?',JSON.stringify(payload),a.id).run();
 const s=f.sessions.get(a.session_id);s.metadata.cgv_version='2026-08-18-v2';s.status='complete';s.payment_status='paid';await handleEvent(f.env,f.event(s));f.retry();await syncContact(f.env,EMAIL);
 assert.equal((await sql(f.env,'SELECT count(*) n FROM orders').first()).n,1);assert.ok(f.people.get(EMAIL).groups.some(g=>g.id===groups(f.env).clients.audit));
});
