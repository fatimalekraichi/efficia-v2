import { createTraceableOrder } from './commerceOrderProjection.js';
import { resolvePublicSite, resolveMailerLiteGroupId } from './environmentIsolation.js';

export const OFFERS = {
 audit: { name: 'Audit fiche Google', price: 'STRIPE_PRICE_AUDIT' },
 visibility: { name: 'Pack Visibilité Google', price: 'STRIPE_PRICE_VISIBILITY' },
 performance: { name: 'Pack Performance', price: 'STRIPE_PRICE_PERFORMANCE' },
};
export const now = () => Math.floor(Date.now()/1000);
export const sql = (env, query, ...args) => env.ORDERS_DB.prepare(query).bind(...args);
export const rows = async statement => (await statement.all()).results;
export const json = (body, status=200) => Response.json(body, {status,headers:{'Cache-Control':'no-store'}});
export const clean = v => typeof v === 'string' ? v.trim() : '';
export const emailOf = v => clean(v).toLowerCase();
export async function digest(value) {
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
}
export function siteConfig(env) {
 const site = resolvePublicSite(new Request(env.SITE_URL),env);
 if (!site.ok || !env.ORDERS_DB) throw Error('COMMERCE_CONFIGURATION');
 return site;
}
export function stripeMode(env) {
 const {environment} = siteConfig(env);
 const mode = environment === 'production' ? 'live' : 'test';
 if(env.STRIPE_MODE !== mode || !new RegExp(`^(sk|rk)_${mode}_`).test(env.STRIPE_SECRET_KEY || '')) throw Error('STRIPE_MODE_MISMATCH');
 return mode === 'live';
}
export async function stripe(env,path,{method='GET',body,key}={}) {
 stripeMode(env);
 const response = await fetch(`https://api.stripe.com/v1/${path}`,{
  method,headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Stripe-Version':'2026-06-24.dahlia',
   ...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),
   ...(key?{'Idempotency-Key':key}:{})},
  ...(body?{body:new URLSearchParams(body)}:{}),signal:AbortSignal.timeout(8000),redirect:'manual'});
 if(!response.ok) {
  const detail=response.status===409?await response.json().catch(()=>null):null;
  if(detail?.error?.code==='idempotency_key_in_use')throw Error('STRIPE_IDEMPOTENCY_IN_USE');
  throw Error(`STRIPE_HTTP_${response.status}`);
 }
 const data=await response.json();
 if(typeof data.livemode === 'boolean' && data.livemode !== stripeMode(env)) throw Error('STRIPE_OBJECT_MODE_MISMATCH');
 return data;
}
export function groups(env) {
 const {environment}=siteConfig(env), prefix=`MAILERLITE_${environment.toUpperCase()}_`;
 const get=selector=>{const r=resolveMailerLiteGroupId(env,environment,selector);if(!r.ok)throw Error(r.error);return r.groupId;};
 const result={diagnostic:get({purpose:'diagnostic'}),clients:{},prospects:{},
  custom:clean(env[`${prefix}CUSTOM_CLIENT_GROUP_ID`]),stop:clean(env[`${prefix}STOP_GROUP_ID`])};
 for(const offer of Object.keys(OFFERS)) {
  result.clients[offer]=get({productCode:offer,role:'client'});
  result.prospects[offer]=get({productCode:offer,role:'prospect'});
 }
 const ids=[result.diagnostic,...Object.values(result.clients),...Object.values(result.prospects),result.custom,result.stop];
 if(ids.some(id=>!/^\d+$/.test(id)) || new Set(ids).size!==ids.length) throw Error('GROUP_REGISTRY_INCOMPLETE');
 // Pin both environment registries at deployment; never infer IDs from names.
 const registry=JSON.parse(env.COMMERCE_GROUP_REGISTRY || '{}');
 if(!Array.isArray(registry[environment]) || ids.some(id=>!registry[environment].includes(id)))throw Error('GROUP_REGISTRY_MISMATCH');
 const other=environment==='production'?'preview':'production';
 if((registry[other]||[]).some(id=>ids.includes(id)))throw Error('GROUP_ENVIRONMENT_COLLISION');
 return result;
}
export function contactJob(env,environment,email,fields={}) {
 return sql(env,`INSERT INTO commerce_contacts(environment,email,fields) VALUES(?,?,?)
 ON CONFLICT(environment,email) DO UPDATE SET revision=revision+1,retry_at=0,
 fields=json_patch(commerce_contacts.fields,excluded.fields)`,environment,email,JSON.stringify(fields));
}
export async function ml(env,path,{method='GET',body,missing=false}={}) {
 if(!env.MAILERLITE_API_KEY)throw Error('MAILERLITE_KEY_MISSING');
 const r=await fetch(`https://connect.mailerlite.com/api/${path}`,{method,
  headers:{Authorization:`Bearer ${env.MAILERLITE_API_KEY}`,Accept:'application/json','Content-Type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000),redirect:'manual'});
 if(missing && r.status===404)return null;
 if(!r.ok) {
  const error=new Error(`MAILERLITE_HTTP_${r.status}`);
  error.permanent=[400,401,403,404,405,410,422].includes(r.status);
  error.operation=`${method} ${path.replace(/subscribers\/[^/]+/,'subscribers/:id').replace(/groups\/[^/]+/,'groups/:id')}`;
  throw error;
 }
 return r.status===204?null:(await r.json()).data;
}
export async function subscriber(env,email) {
 const person=await ml(env,`subscribers/${encodeURIComponent(email)}`,{missing:true});
 if(person!==null && (!person?.id || !person.status || !Array.isArray(person.groups)))throw Error('MAILERLITE_INVALID_SUBSCRIBER');
 return person;
}
export function commercialAllowed(person,g,stopped=false) {
 const blocked=[...Object.values(g.clients),g.custom,g.stop];
 return !stopped && person?.status==='active' && !(person.groups||[]).some(x=>blocked.includes(String(x.id)));
}
export async function paidContact(env,email) {
 const {environment}=siteConfig(env);
 return Boolean(await sql(env,`SELECT 1 FROM commerce_attempts WHERE environment=? AND email=? AND state='paid'
 UNION SELECT 1 FROM commerce_invoices WHERE environment=? AND email=? LIMIT 1`,environment,email,environment,email).first());
}
export async function queueDiagnostic(env,email,fields) {
 const {environment}=siteConfig(env); groups(env);
 await env.ORDERS_DB.batch([contactJob(env,environment,email,fields),sql(env,
  `UPDATE commerce_contacts SET diagnostic_requested=1 WHERE environment=? AND email=?`,environment,email)]);
}
export async function syncContact(env,email) {
 const {environment}=siteConfig(env), g=groups(env), token=crypto.randomUUID();
 const claimed=await sql(env,`UPDATE commerce_contacts SET lease_token=?,lease_until=?
 WHERE environment=? AND email=? AND lease_until<? AND revision>synced_revision AND sync_blocked=0 AND retry_at<=? RETURNING *`,
 token,now()+600,environment,email,now(),now()).first();
 if(!claimed)return false;
 const fence=async()=>{if(!await sql(env,`SELECT 1 FROM commerce_contacts WHERE environment=? AND email=? AND lease_token=? AND lease_until>?`,environment,email,token,now()+10).first())throw Error('SYNC_LEASE_LOST');};
 try {
  const paidAttempts=await rows(sql(env,"SELECT * FROM commerce_attempts WHERE environment=? AND email=? AND state='paid'",environment,email));
  for(const attempt of paidAttempts) {
   const snapshot=JSON.parse(attempt.stripe_snapshot), p=JSON.parse(attempt.payload);
   snapshot.payment_intent=typeof snapshot.payment_intent==='object'?snapshot.payment_intent?.id:snapshot.payment_intent;
   snapshot.line_items={data:[{price:{id:p.price}}]};
   snapshot.efficia_paid_at=attempt.paid_at;
   await createTraceableOrder({session:snapshot,env});
  }
  let person=await subscriber(env,email);
  // Omit status and resubscribe everywhere. Inactive addresses are not reactivated.
  await fence();
  const fields=JSON.parse(claimed.fields);
  if(claimed.diagnostic_requested && (!person?.fields?.audit_status || person.fields.audit_status==='lead capturé'))fields.audit_status='diagnostic demandé';
  // Update an identified subscriber by ID. Never upsert an existing inactive
  // contact or pass status/resubscribe; group membership is reconciled separately.
  person=person ? await ml(env,`subscribers/${person.id}`,{method:'PUT',body:{fields}})
   : await ml(env,'subscribers',{method:'POST',body:{email,fields}});
  if(!person?.id)throw Error('SUBSCRIBER_ID_MISSING');
  let membership=new Set((person.groups||[]).map(x=>String(x.id)));
  const add=async id=>{if(!membership.has(id)){await fence();await ml(env,`subscribers/${person.id}/groups/${id}`,{method:'POST'});membership.add(id);}};
  const remove=async id=>{if(membership.has(id)){await fence();await ml(env,`subscribers/${person.id}/groups/${id}`,{method:'DELETE'});membership.delete(id);}};
  const attempts=await rows(sql(env,'SELECT offer,state FROM commerce_attempts WHERE environment=? AND email=?',environment,email));
  const invoices=await sql(env,'SELECT 1 FROM commerce_invoices WHERE environment=? AND email=? LIMIT 1',environment,email).first();
  // All client additions must succeed before any prospect removal.
  for(const offer of Object.keys(OFFERS))if(attempts.some(a=>a.offer===offer && a.state==='paid'))await add(g.clients[offer]);
  if(invoices)await add(g.custom);
  if(claimed.stopped)await add(g.stop);
  const blocked=claimed.stopped || [...Object.values(g.clients),g.custom,g.stop].some(id=>membership.has(id));
  for(const offer of Object.keys(OFFERS)) {
   if(blocked)await remove(g.prospects[offer]);
   else if(attempts.some(a=>a.offer===offer && ['open','expired','processing','failed'].includes(a.state)))await add(g.prospects[offer]);
  }
  if(claimed.diagnostic_requested && !claimed.diagnostic_group_done) {
   // Existing membership and a durable latch prevent repeated group-entry confirmations.
   await add(g.diagnostic);
   await sql(env,'UPDATE commerce_contacts SET diagnostic_group_done=1 WHERE environment=? AND email=?',environment,email).run();
  }
  await sql(env,`UPDATE commerce_contacts SET synced_revision=?,attempts=0,last_error=NULL,last_error_operation=NULL,sync_blocked=0,lease_until=0,lease_token=NULL
   WHERE environment=? AND email=? AND lease_token=?`,claimed.revision,environment,email,token).run();
  return true;
 } catch(error) {
  await sql(env,`UPDATE commerce_contacts SET attempts=attempts+1,retry_at=?,last_error=?,sync_blocked=?,last_error_operation=?,lease_until=0,lease_token=NULL
   WHERE environment=? AND email=? AND lease_token=?`,now()+Math.min(3600,30*2**Math.min(claimed.attempts,7)),safeError(error),error.permanent?1:0,error.operation||null,environment,email,token).run();
  return false;
 }
}
export function safeError(error) {return /^[A-Z0-9_]+$/.test(error?.message||'')?error.message:'DEPENDENCY_UNAVAILABLE';}
