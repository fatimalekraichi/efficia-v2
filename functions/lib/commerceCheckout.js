import { ACTIVE_CGV_VERSION, hasValidCgvAcceptance } from './cgvAcceptance.js';
import { OFFERS, now, sql, rows, digest, clean, emailOf, siteConfig, groups, stripe, stripeMode, contactJob, syncContact } from './commerceCore.js';

export function normalizePurchase(p) {
 if(!hasValidCgvAcceptance(p))throw Error('CGV_ACCEPTANCE_REQUIRED');
 const lead={product:clean(p.product),full_name:clean(p.full_name),email:emailOf(p.email),company_name:clean(p.company_name),
  google_business_url:clean(p.google_business_url),city:clean(p.city),unknown_google_business:p.unknown_google_business===true,cgv_version:ACTIVE_CGV_VERSION};
 if(!OFFERS[lead.product] || !lead.full_name || !lead.company_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)
  || Object.values(lead).some(v=>typeof v==='string' && v.length>500))throw Error('INVALID_PURCHASE');
 if(lead.unknown_google_business){if(!lead.city)throw Error('CITY_REQUIRED');lead.google_business_url='';}
 else {try{if(!['http:','https:'].includes(new URL(lead.google_business_url).protocol))throw 0;}catch{throw Error('GOOGLE_URL_REQUIRED');}}
 return lead;
}
export function validCheckoutURL(url) {
 try{const u=new URL(url);return u.protocol==='https:' && u.hostname==='checkout.stripe.com' && !u.username && !u.password;}catch{return false;}
}
export async function createSession(env,attempt) {
 const site=siteConfig(env),p=JSON.parse(attempt.payload);
 if(attempt.session_id)return stripe(env,`checkout/sessions/${encodeURIComponent(attempt.session_id)}`);
 if(env.COMMERCE_CHECKOUT_ENABLED==='false')throw Error('CHECKOUT_TEMPORARILY_UNAVAILABLE');
 // Never reuse an uncertain key after Stripe may have pruned its 24h cache.
 if(now()-attempt.created_at>23*3600)throw Error('CHECKOUT_RECONCILIATION_REQUIRED');
 const body={mode:'payment',integration_identifier:'efficia-commerce-v1-qmrvkzpa','line_items[0][price]':p.price,'line_items[0][quantity]':'1',
  success_url:site.successUrl,cancel_url:site.cancelUrl,billing_address_collection:'required',customer_email:attempt.email,
  'metadata[efficia_version]':'commerce_v1','metadata[environment]':site.environment,
  'metadata[attempt_id]':attempt.id,'metadata[root_attempt_id]':attempt.root_id,
  'metadata[product_code]':attempt.offer,'metadata[product_name]':OFFERS[attempt.offer].name,
  'metadata[source]':site.origin,'metadata[cgv_version]':p.cgv_version,'metadata[cgv_accepted_at]':p.accepted_at,
  'metadata[customer_name]':p.full_name,'metadata[company_name]':p.company_name,
  'metadata[google_business_url]':p.google_business_url,'metadata[city]':p.city};
 if(p.payment_methods)for(const [i,method] of p.payment_methods.entries())body[`payment_method_types[${i}]`]=method;
 let session;
 // Stripe rejects a concurrent request while the same idempotency key is in flight.
 // Retry only this precise transient conflict, always with the identical key/body.
 for(let retry=0;retry<4;retry++) {
  try {session=await stripe(env,'checkout/sessions',{method:'POST',body,key:`efficia-${site.environment}-${attempt.id}`});break;}
  catch(error) {
   if(error.message!=='STRIPE_IDEMPOTENCY_IN_USE' || retry===3)throw error;
   await new Promise(resolve=>setTimeout(resolve,250*(retry+1)));
  }
 }
 if(!session.id || !validCheckoutURL(session.url) || session.livemode!==stripeMode(env))throw Error('INVALID_CHECKOUT_SESSION');
 await recordSession(env,attempt,session);
 return session;
}
export async function recordSession(env,attempt,session,type='') {
 const {environment}=siteConfig(env);
 if(session.metadata?.attempt_id!==attempt.id || session.metadata?.environment!==environment
  || session.metadata?.product_code!==attempt.offer || session.livemode!==stripeMode(env)
  || emailOf(session.customer_email || session.customer_details?.email)!==attempt.email)throw Error('SESSION_IDENTITY_MISMATCH');
 const state=session.payment_status==='paid'?'paid':session.payment_intent?.status==='processing'?'processing':
  type==='checkout.session.async_payment_failed' || (session.status==='complete' && session.payment_intent?.status==='requires_payment_method')?'failed':session.status==='complete'?'processing':session.status==='expired'?'expired':'open';
 await env.ORDERS_DB.batch([
  sql(env,`UPDATE commerce_attempts SET session_id=?,state=CASE WHEN state='paid' THEN 'paid' ELSE ? END,
   paid_at=CASE WHEN ?='paid' THEN COALESCE(paid_at,?) ELSE paid_at END,
   checkout_url=?,expires_at=?,stripe_snapshot=CASE WHEN state='paid' AND ?!='paid' THEN stripe_snapshot ELSE ? END WHERE id=? AND (session_id IS NULL OR session_id=?)`,
   session.id,state,state,now(),validCheckoutURL(session.url)?session.url:null,session.expires_at||null,state,JSON.stringify(session),attempt.id,session.id),
  contactJob(env,environment,attempt.email,{name:JSON.parse(attempt.payload).full_name}),
 ]);
 return state;
}
export async function preparePurchase(env,payload) {
 const site=siteConfig(env);stripeMode(env);groups(env);
 const p=normalizePurchase(payload);
 if(!/^[a-f0-9-]{36}$/i.test(payload.request_id||''))throw Error('REQUEST_ID_REQUIRED');
 const price=env[OFFERS[p.product].price];if(!/^price_[a-zA-Z0-9]+$/.test(price||''))throw Error('PRICE_NOT_CONFIGURED');
 const paymentMethods=env.COMMERCE_PAYMENT_METHODS ? env.COMMERCE_PAYMENT_METHODS.split(',').map(x=>x.trim()) : null;
 if(paymentMethods && (paymentMethods.length!==1 || paymentMethods[0]!=='card'))throw Error('UNVALIDATED_PAYMENT_METHODS');
 const fingerprint=await digest(JSON.stringify(p));
 // One active attempt for identical normalized input across tabs and distinct request IDs.
 const activeKey=`${site.environment}:${fingerprint}`;
 let request=await sql(env,'SELECT * FROM commerce_requests WHERE request_id=?',payload.request_id).first();
 if(request && request.fingerprint!==fingerprint)throw Error('REQUEST_ID_CONFLICT');
 const proposed=crypto.randomUUID();
 if(!request) {
  await sql(env,`INSERT OR IGNORE INTO commerce_attempts(id,environment,email,offer,payload,fingerprint,active_key,root_id,created_at)
   VALUES(?,?,?,?,?,?,?,?,?)`,proposed,site.environment,p.email,p.product,
   JSON.stringify({...p,price,payment_methods:paymentMethods,accepted_at:new Date().toISOString()}),fingerprint,activeKey,proposed,now()).run();
  const current=await sql(env,'SELECT id FROM commerce_attempts WHERE active_key=?',activeKey).first();
  await sql(env,'INSERT OR IGNORE INTO commerce_requests(request_id,fingerprint,attempt_id) VALUES(?,?,?)',payload.request_id,fingerprint,current.id).run();
  request=await sql(env,'SELECT * FROM commerce_requests WHERE request_id=?',payload.request_id).first();
  if(request.fingerprint!==fingerprint)throw Error('REQUEST_ID_CONFLICT');
 }
 const attempt=await sql(env,'SELECT * FROM commerce_attempts WHERE id=?',request.attempt_id).first();
 if(attempt.environment!==site.environment)throw Error('ENVIRONMENT_MISMATCH');
 const session=await createSession(env,attempt);
 if(session.payment_status==='paid')throw Error('ORDER_ALREADY_PAID');
 if(session.status!=='open' || session.expires_at<=now())throw Error('CHECKOUT_EXPIRED_USE_RECOVERY');
 // Snapshot has been persisted before marketing, even when marketing is unavailable.
 await syncContact(env,attempt.email).catch(()=>false);
 return {success:true,url:session.url,attempt_id:attempt.id};
}
export async function refreshAttempts(env,email) {
 const {environment}=siteConfig(env);
 const attempts=await rows(sql(env,"SELECT * FROM commerce_attempts WHERE environment=? AND email=? AND session_id IS NOT NULL AND state!='paid'",environment,email));
 for(const attempt of attempts) {
  const s=await stripe(env,`checkout/sessions/${encodeURIComponent(attempt.session_id)}?expand[]=payment_intent`);
  const type=s.payment_intent?.status==='requires_payment_method' && s.status==='complete'?'checkout.session.async_payment_failed':'';
  await recordSession(env,attempt,s,type);
 }
}
