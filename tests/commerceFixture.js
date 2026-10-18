import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { now } from '../functions/lib/commerceCore.js';
export const EMAIL='commerce-test@example.com';
export class D1 {
 constructor(){
  this.db=new DatabaseSync(':memory:');
  for(const name of readdirSync(new URL('../migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())
   this.db.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
 }
 prepare(query){
  const make=(args=[])=>({bind:(...next)=>make(next),
   first:async()=>this.db.prepare(query).get(...args)||null,
   all:async()=>({results:this.db.prepare(query).all(...args)}),
   run:async()=>({meta:{changes:this.db.prepare(query).run(...args).changes}}),
   _run:()=>this.db.prepare(query).run(...args)});
  return make();
 }
 async batch(statements){this.db.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>s._run());this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
export function fixture() {
 const env={SITE_URL:'https://commerce.efficiadigital.pages.dev',ORDERS_DB:new D1(),STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_simulation',
  MAILERLITE_API_KEY:'simulation',STRIPE_PRICE_AUDIT:'price_Audit',STRIPE_PRICE_VISIBILITY:'price_Visibility',STRIPE_PRICE_PERFORMANCE:'price_Performance',
  COMMERCE_LINK_SECRET:'isolated-test-secret-at-least-32-characters',COMMERCE_INVOICE_CUTOVER:1,
  COMMERCE_REMINDERS_ENABLED:'true',COMMERCE_REMINDER_OWNER_VERIFIED:'server_only',HOSTINGER_MAIL_API_TOKEN:'mock',HOSTINGER_MAILBOX_ID:'mock'};
 const registry={production:[],preview:[]};
 for(const [scope,start] of [['PREVIEW',100],['PRODUCTION',200]]) {
  for(const [i,key] of ['DIAGNOSTIC','AUDIT_PROSPECT','AUDIT_CLIENT','VISIBILITY_PROSPECT','VISIBILITY_CLIENT','PERFORMANCE_PROSPECT','PERFORMANCE_CLIENT','CUSTOM_CLIENT','STOP'].entries()) {
   env[`MAILERLITE_${scope}_${key}_GROUP_ID`]=String(start+i);registry[scope.toLowerCase()].push(String(start+i));
  }
 }
 env.COMMERCE_GROUP_REGISTRY=JSON.stringify(registry);
 const sessions=new Map(),keys=new Map(),people=new Map(),invoices=new Map(),calls=[],emails=[];
 let count=0;const state={env,sessions,keys,people,invoices,calls,emails,fail:null};
 state.fetch=async(input,options={})=>{
  // Workers rejects redirect:error before dispatch; model the actual edge contract.
  assert.notEqual(options.redirect,'error');
  const u=new URL(input instanceof Request?input.url:input),method=options.method||'GET';
  const body=options.body instanceof URLSearchParams?Object.fromEntries(options.body):options.body?JSON.parse(options.body):null;
  calls.push({url:u.href,method,body});
  if(state.fail?.({url:u.href,method,body}))return Response.json({error:'simulated'},{status:503});
  if(u.hostname==='api.stripe.com') {
   if(method==='POST' && u.pathname==='/v1/checkout/sessions') {
    const key=options.headers['Idempotency-Key'];assert.ok(key);
    if(keys.has(key)){assert.deepEqual(keys.get(key).body,body);return Response.json(keys.get(key).session);}
    const id=`cs_test_${++count}`,metadata=Object.fromEntries(Object.entries(body).filter(([k])=>k.startsWith('metadata[')).map(([k,v])=>[k.slice(9,-1),v]));
    const session={id,url:`https://checkout.stripe.com/c/pay/${id}`,status:'open',payment_status:'unpaid',livemode:env.STRIPE_MODE==='live',customer_email:body.customer_email,metadata,expires_at:now()+86400,created:now(),amount_total:10000,currency:'eur',payment_intent:null};
    sessions.set(id,session);keys.set(key,{body,session});return Response.json(session);
   }
   if(u.pathname.endsWith('/line_items'))return Response.json({data:[{quantity:1,price:{id:env.STRIPE_PRICE_AUDIT}}]});
   if(u.pathname.startsWith('/v1/checkout/sessions/'))return Response.json(sessions.get(u.pathname.split('/').at(-1)));
   if(u.pathname.startsWith('/v1/invoices/'))return Response.json(invoices.get(u.pathname.split('/').at(-1)));
  }
  if(u.hostname==='connect.mailerlite.com') {
   if(u.pathname==='/api/subscribers' && method==='POST') {
    assert.equal(body.status,undefined);assert.equal(body.resubscribe,undefined);
    let person=people.get(body.email)||{id:String(people.size+1),email:body.email,status:'active',groups:[],fields:{}};
    person.fields={...person.fields,...body.fields};people.set(body.email,person);return Response.json({data:person});
   }
   const m=u.pathname.match(/^\/api\/subscribers\/([^/]+)(?:\/groups\/(\d+))?$/);
   if(m){const person=people.get(decodeURIComponent(m[1]))||[...people.values()].find(x=>x.id===m[1]);
    if(!person)return Response.json({},{status:404});
    if(!m[2]){if(method==='PUT'){assert.equal(body.status,undefined);assert.equal(body.resubscribe,undefined);assert.equal(body.groups,undefined);person.fields={...person.fields,...body.fields};}return Response.json({data:person});}
    if(method==='POST' && !person.groups.some(g=>g.id===m[2]))person.groups.push({id:m[2]});
    if(method==='DELETE')person.groups=person.groups.filter(g=>g.id!==m[2]);
    return new Response(null,{status:204});
   }
  }
  if(u.hostname==='api.mail.hostinger.com'){assert.deepEqual(body.to,[EMAIL]);emails.push(body);return new Response(null,{status:204});}
  throw Error(`UNMOCKED_NETWORK_${u.hostname}_${u.pathname}`);
 };
 state.payload=(product='audit')=>({request_id:crypto.randomUUID(),product,full_name:'Test dédié',email:EMAIL,company_name:'Test Efficia',city:'Bruxelles',unknown_google_business:true,cgv_accepted:true,cgv_version:'2026-08-18-v2'});
 state.event=(session,type='checkout.session.completed')=>({id:`evt_${crypto.randomUUID().replaceAll('-','')}`,type,livemode:false,created:now(),data:{object:{id:session.id}}});
 state.person=(status='active',ids=[])=>{const p={id:'1',email:EMAIL,status,groups:ids.map(id=>({id})),fields:{}};people.set(EMAIL,p);return p;};
 state.due=()=>env.ORDERS_DB.db.exec("UPDATE commerce_attempts SET created_at=created_at-86401");
 state.retry=()=>env.ORDERS_DB.db.exec('UPDATE commerce_contacts SET retry_at=0');
 return state;
}
