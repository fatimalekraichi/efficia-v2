import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,EMAIL} from './commerceFixture.js';
import {contactJob,sql,syncContact,groups,now} from '../functions/lib/commerceCore.js';
import {runSyncJobs} from '../functions/lib/commerceSyncJobs.js';
import {preparePurchase} from '../functions/lib/commerceCheckout.js';

test('unsubscribed subscriber is updated by ID without status, resubscribe or destructive groups',async t=>{
 const f=fixture();f.person('unsubscribed');t.mock.method(globalThis,'fetch',async(url,opt)=>{
  if(String(url).endsWith('/api/subscribers')&&opt?.method==='POST')throw Error('UNSAFE_UPSERT');return f.fetch(url,opt);
 });await preparePurchase(f.env,f.payload());
 assert.equal(f.people.get(EMAIL).status,'unsubscribed');assert.ok(f.calls.some(c=>c.method==='PUT'&&c.url.endsWith('/subscribers/1')));
 assert.equal((await sql(f.env,'SELECT revision,synced_revision FROM commerce_contacts').first()).synced_revision,1);
});
for(const status of [400,401,403,404,405,410,422])test(`permanent MailerLite ${status} blocks retries including new events`,async t=>{
 const f=fixture();f.person();let refused=0;t.mock.method(globalThis,'fetch',async(url,opt)=>{
  if(String(url).includes('mailerlite')&&opt?.method==='PUT'){refused++;return Response.json({message:'Rejected'}, {status});}return f.fetch(url,opt);
 });await contactJob(f.env,'preview',EMAIL).run();await syncContact(f.env,EMAIL);f.retry();
 await contactJob(f.env,'preview',EMAIL).run();await runSyncJobs(f.env);await syncContact(f.env,EMAIL);
 const r=await sql(f.env,'SELECT * FROM commerce_contacts').first();assert.equal(refused,1);assert.equal(r.sync_blocked,1);assert.equal(r.last_error_operation,'PUT subscribers/:id');assert.ok(r.revision>r.synced_revision);
});
for(const status of [408,409,429,500,503])test(`temporary MailerLite ${status} retains durable retry`,async t=>{
 const f=fixture();f.person();let broken=true;t.mock.method(globalThis,'fetch',async(url,opt)=>{
  if(broken&&String(url).includes('mailerlite'))return new Response(null,{status});return f.fetch(url,opt);
 });await contactJob(f.env,'preview',EMAIL).run();await syncContact(f.env,EMAIL);const first=await sql(f.env,'SELECT * FROM commerce_contacts').first();assert.equal(first.sync_blocked,0);assert.ok(first.retry_at>now());
 broken=false;f.retry();await runSyncJobs(f.env);const last=await sql(f.env,'SELECT * FROM commerce_contacts').first();assert.equal(last.synced_revision,last.revision);assert.equal(last.last_error,null);
});
