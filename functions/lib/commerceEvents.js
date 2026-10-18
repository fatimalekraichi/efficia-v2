import { siteConfig,stripe,stripeMode,sql,now,contactJob,emailOf,OFFERS,digest } from './commerceCore.js';
import { recordSession } from './commerceCheckout.js';
export const EVENT_TYPES=['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','invoice.paid'];
async function adoptCutoverPayment(env,session,event) {
 const site=siteConfig(env),cutover=Number(env.COMMERCE_EVENT_CUTOVER||0),m=session.metadata||{};
 // Only a new paid event during the cutover window: no historical replay and
 // no reminders for old sessions. Price + origin are verified before adoption.
 if(!cutover || event.created<cutover || session.payment_status!=='paid' || m.source!==site.origin || m.efficia_version)return null;
 const items=await stripe(env,`checkout/sessions/${encodeURIComponent(session.id)}/line_items?limit=2`);
 if(items.data?.length!==1 || items.data[0].quantity!==1)return null;
 const offer=Object.keys(OFFERS).find(code=>env[OFFERS[code].price]===items.data[0].price?.id);
 const email=emailOf(session.customer_email||session.customer_details?.email);
 if(!offer || (m.product_code && m.product_code!==offer) || !email)return null;
 const id=crypto.randomUUID(),payload={product:offer,email,full_name:m.customer_name||session.customer_details?.name||'',company_name:m.company_name||'',
  city:m.city||'',google_business_url:m.google_business_url||'',price:items.data[0].price.id,cgv_version:m.cgv_version||'',accepted_at:m.cgv_accepted_at||''};
 await sql(env,`INSERT OR IGNORE INTO commerce_attempts(id,environment,email,offer,payload,fingerprint,root_id,session_id,state,created_at,reminder_status)
 VALUES(?,?,?,?,?,?,?,?,'creating',?,'suppressed')`,id,site.environment,email,offer,JSON.stringify(payload),await digest(session.id),id,session.id,now()).run();
 return sql(env,'SELECT * FROM commerce_attempts WHERE environment=? AND session_id=?',site.environment,session.id).first();
}
export async function signatureValid(raw,header,secret) {
 if(!secret || !header)return false;
 const parts=header.split(',').map(x=>x.trim().split('='));
 const timestamp=parts.find(x=>x[0]==='t')?.[1];
 if(!/^\d+$/.test(timestamp||'') || Math.abs(now()-Number(timestamp))>300)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const expected=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${raw}`))),b=>b.toString(16).padStart(2,'0')).join('');
 return parts.filter(x=>x[0]==='v1').some(([,value])=>{
  if(value.length!==expected.length)return false;let diff=0;for(let i=0;i<value.length;i++)diff|=value.charCodeAt(i)^expected.charCodeAt(i);return diff===0;
 });
}
export async function handleEvent(env,event) {
 const {environment}=siteConfig(env);
 if(event.livemode!==stripeMode(env))throw Error('EVENT_MODE_MISMATCH');
 if(!EVENT_TYPES.includes(event.type))return {ignored:true};
 if(!/^evt_[a-zA-Z0-9]+$/.test(event.id||'') || !event.data?.object?.id)throw Error('INVALID_EVENT');
 if(await sql(env,'SELECT 1 FROM commerce_events WHERE id=?',event.id).first())return {duplicate:true};
 const id=event.data.object.id;
 if(event.type==='invoice.paid') {
  const invoice=await stripe(env,`invoices/${encodeURIComponent(id)}`),m=invoice.metadata||{};
  const cutoff=Number(env.COMMERCE_INVOICE_CUTOVER || 0);
  if(!cutoff || invoice.created<cutoff || m.efficia_automation!=='custom_v1' || m.efficia_environment!==environment
   || !/^[a-zA-Z0-9_-]{1,100}$/.test(m.efficia_project_id||'')
   || !['deposit','balance','full'].includes(m.efficia_installment))return {ignored:true,reason:'INVOICE_NOT_ENROLLED'};
  if(invoice.status!=='paid' || !(invoice.amount_paid>0))return {ignored:true,reason:'INVOICE_NOT_PAID'};
  const email=emailOf(invoice.customer_email);if(!email)throw Error('INVOICE_EMAIL_MISSING');
  await env.ORDERS_DB.batch([
   sql(env,`INSERT OR IGNORE INTO commerce_invoices(id,environment,email,project_id,installment,amount_paid,currency,paid_at) VALUES(?,?,?,?,?,?,?,?)`,id,environment,email,m.efficia_project_id,m.efficia_installment,invoice.amount_paid,invoice.currency,invoice.status_transitions?.paid_at||event.created),
   contactJob(env,environment,email),
   sql(env,'INSERT OR IGNORE INTO commerce_events VALUES(?,?,?,?,?)',event.id,environment,id,event.type,now()),
  ]);
 } else {
  const session=await stripe(env,`checkout/sessions/${encodeURIComponent(id)}?expand[]=payment_intent`);
  let attempt=await sql(env,'SELECT * FROM commerce_attempts WHERE environment=? AND (session_id=? OR id=?)',environment,id,session.metadata?.attempt_id||'').first();
  if(!attempt)attempt=await adoptCutoverPayment(env,session,event);
  if(!attempt)return {ignored:true,reason:'SESSION_NOT_ENROLLED'};
  if(!session.metadata?.efficia_version && attempt.reminder_status==='suppressed' && attempt.session_id===session.id) {
   session.metadata={...session.metadata,attempt_id:attempt.id,environment,product_code:attempt.offer};
  }
  // State and reconciliation job are atomic; a crash before recording the event
  // produces a harmless replay, never loss of the downstream synchronization.
  await recordSession(env,attempt,session,event.type);
  await sql(env,'INSERT OR IGNORE INTO commerce_events VALUES(?,?,?,?,?)',event.id,environment,id,event.type,now()).run();
 }
 return {received:true};
}
