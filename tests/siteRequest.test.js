import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequestPost } from '../functions/api/site-request.js';
import { validateSiteRequest } from '../js/site-request-validation.js';
const valid = () => ({ name: 'Test local', company: 'Atelier test', website: '', message: 'Contrôle local sans envoi réel.', contact: 'test@example.com', company_url: '', requestId: crypto.randomUUID() });
function environment() {
 const sql = new DatabaseSync(':memory:');
 sql.exec(readFileSync(new URL('../migrations/0022_site_request_delivery.sql',import.meta.url),'utf8'));
 return { HOSTINGER_MAIL_API_TOKEN: 'test-only-secret', HOSTINGER_MAILBOX_ID: 'ACtest', ORDERS_DB: { prepare(query) { return { bind(...values) { return { first: async()=>sql.prepare(query).get(...values), run: async()=>({meta:{changes:Number(sql.prepare(query).run(...values).changes)}}) }; } }; } } };
}
function request(body, origin='https://efficiadigital.com',type='application/json') { return new Request('https://efficiadigital.com/api/site-request',{method:'POST',headers:{Origin:origin,'Content-Type':type,'CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(body)}); }
test('validation accepts creation/email or telephone, rejects invalid fields and unsafe URL',()=>{
 assert.ok(validateSiteRequest(valid()).data); assert.ok(validateSiteRequest({...valid(),contact:'+32 478 020 842'}).data);
 for(const patch of [{name:' '},{company:''},{message:''},{contact:'abc'},{website:'javascript:alert(1)'},{website:'https://user:pass@example.com'},{message:'a'.repeat(4001)}]) assert.ok(validateSiteRequest({...valid(),...patch}).error);
});
test('invalid input, origin, content type and absent configuration never send',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error();});
 for(const [body,origin,type,status] of [[valid(),'https://attacker.test','application/json',403],[valid(),'https://efficiadigital.com','text/plain',415],[null,'https://efficiadigital.com','application/json',400],[{...valid(),company_url:'spam'},'https://efficiadigital.com','application/json',400],[{...valid(),contact:'invalid'},'https://efficiadigital.com','application/json',400]]) assert.equal((await onRequestPost({request:request(body,origin,type),env:environment()})).status,status);
 assert.equal((await onRequestPost({request:request(valid()),env:{}})).status,503);assert.equal(calls,0);
});
test('only Hostinger 204 confirms sending; destination fixed; same request is not sent twice',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async(url,options)=>{calls++;assert.equal(url,'https://api.mail.hostinger.com/api/v1/mailboxes/ACtest/send');assert.equal(options.headers.Authorization,'Bearer test-only-secret');assert.equal(options.redirect,'manual');const payload=JSON.parse(options.body);assert.deepEqual(payload.to,['contact@efficiadigital.com']);assert.match(payload.text,/test@example.com/);assert.equal(payload.html,undefined);return new Response(null,{status:204});});
 const env=environment(),body=valid();
 for(let i=0;i<2;i++){const r=await onRequestPost({request:request(body),env});assert.equal(r.status,200);assert.deepEqual(await r.json(),{success:true,status:'sent',requestId:body.requestId});}assert.equal(calls,1);
 assert.equal((await onRequestPost({request:request({...body,message:'different'}),env})).status,409);
});
test('failure, unexpected 200 and timeout never produce success or automatic resend',async t=>{
 for(const code of [200,301,302,307,308,401,500,504,null]){
 let calls=0;const mock=t.mock.method(globalThis,'fetch',async()=>{calls++;if(code===null)throw Error('timeout');return new Response('',{status:code});});
 const env=environment(),body=valid();const r=await onRequestPost({request:request(body),env});assert.equal(r.status,502);assert.equal((await r.json()).success,false);assert.equal((await onRequestPost({request:request(body),env})).status,409);assert.equal(calls,1);mock.mock.restore();}
});
test('rate limit prevents a sixth distinct request in the same hour',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(null,{status:204});});const env=environment();
 for(let i=0;i<5;i++) assert.equal((await onRequestPost({request:request(valid()),env})).status,200);
 assert.equal((await onRequestPost({request:request(valid()),env})).status,429);assert.equal(calls,5);
});
test('oversized JSON and unavailable receipt storage fail closed',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(null,{status:204});});
 assert.equal((await onRequestPost({request:request({...valid(),message:'é'.repeat(33000)}),env:environment()})).status,400);
 const env=environment();env.ORDERS_DB.prepare=()=>{throw Error('unavailable');};assert.equal((await onRequestPost({request:request(valid()),env})).status,503);assert.equal(calls,0);
});
