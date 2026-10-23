import {reminderCopy} from './commerceReminderCopy.js';
export {reminderCopy} from './commerceReminderCopy.js';
import { runSyncJobs } from './commerceSyncJobs.js';
import { OFFERS,siteConfig,sql,rows,now,groups,subscriber,commercialAllowed,paidContact,contactJob,syncContact,safeError } from './commerceCore.js';
import { refreshAttempts,createSession,validCheckoutURL } from './commerceCheckout.js';
import { ACTIVE_CGV_VERSION } from './cgvAcceptance.js';

export async function recoveryToken(env,id,expires=now()+30*86400) {
 if((env.COMMERCE_LINK_SECRET||'').length<32)throw Error('LINK_SECRET_MISSING');
 const message=`${siteConfig(env).environment}.${id}.${expires}`;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.COMMERCE_LINK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message))),b=>b.toString(16).padStart(2,'0')).join('');
 return `${id}.${expires}.${signature}`;
}
export async function resolveToken(env,token) {
 const [id,time,mac,...extra]=(token||'').split('.');
 if(extra.length || !/^[a-f0-9-]{36}$/.test(id||'') || !/^\d+$/.test(time||'') || Number(time)<now())throw Error('LINK_EXPIRED');
 const expected=await recoveryToken(env,id,Number(time));
 if(expected.length!==token.length)throw Error('INVALID_LINK');
 let diff=0;for(let i=0;i<token.length;i++)diff|=expected.charCodeAt(i)^token.charCodeAt(i);
 if(diff)throw Error('INVALID_LINK');
 const row=await sql(env,'SELECT * FROM commerce_attempts WHERE id=? AND environment=?',id,siteConfig(env).environment).first();
 if(!row || row.id!==row.root_id)throw Error('INVALID_LINK');return row;
}
export async function latestAttempt(env,email) {
 return sql(env,`SELECT * FROM commerce_attempts WHERE environment=? AND email=? AND session_id IS NOT NULL
 ORDER BY created_at DESC,rowid DESC LIMIT 1`,siteConfig(env).environment,email).first();
}
export function reminderCutover(env) {
 const value=Number(env.COMMERCE_REMINDER_CUTOVER);
 return Number.isSafeInteger(value)&&value>0?value:null;
}
export async function eligibility(env,attempt) {
 const cutoff=reminderCutover(env);
 if(!cutoff)return {allowed:false,reason:'CUTOVER_REQUIRED'};
 const root=await sql(env,'SELECT created_at FROM commerce_attempts WHERE id=?',attempt.root_id).first();
 if(attempt.created_at<cutoff || !root || root.created_at<cutoff)return {allowed:false,reason:'BEFORE_CUTOVER'};
 if(!attempt.session_id)return {allowed:false,reason:'NO_SESSION'};
 await refreshAttempts(env,attempt.email); // Fail closed on Stripe failure.
 const {environment}=siteConfig(env);
 if(await paidContact(env,attempt.email))return {allowed:false,reason:'CLIENT'};
 const latest=await latestAttempt(env,attempt.email);
 if(latest?.id!==attempt.id)return {allowed:false,reason:'REPLACED'};
 if(latest.created_at>now()-86400)return {allowed:false,reason:'NOT_DUE'};
 const pending=await sql(env,"SELECT 1 FROM commerce_attempts WHERE environment=? AND email=? AND state='processing' LIMIT 1",environment,attempt.email).first();
 if(pending)return {allowed:false,reason:'ASYNC_PENDING'};
 const contact=await sql(env,'SELECT * FROM commerce_contacts WHERE environment=? AND email=?',environment,attempt.email).first();
 if(contact?.sync_blocked)return {allowed:false,reason:'SYNC_BLOCKED'};
 const person=await subscriber(env,attempt.email);
 if(!person)return {allowed:false,reason:'SYNC_PENDING'};
 if(!commercialAllowed(person,groups(env),Boolean(contact?.stopped)))return {allowed:false,reason:'INELIGIBLE'};
 return {allowed:true,person};
}
export async function dispatchReminder(env,id) {
 if(env.COMMERCE_REMINDERS_ENABLED!=='true' || env.COMMERCE_REMINDER_OWNER_VERIFIED!=='server_only')return 'disabled';
 const cutoff=reminderCutover(env);if(!cutoff)return 'cutover_required';
 if(!env.HOSTINGER_MAIL_API_TOKEN || !env.HOSTINGER_MAILBOX_ID)throw Error('SENDER_NOT_CONFIGURED');
 const {environment,origin}=siteConfig(env);
 const attempt=await sql(env,`UPDATE commerce_attempts SET reminder_status='checking',reminder_at=?
  WHERE id=? AND environment=? AND session_id IS NOT NULL AND created_at<=?
  AND created_at>=? AND (reminder_status='pending' OR (reminder_status='checking' AND reminder_at<?)) RETURNING *`,now(),id,environment,now()-86400,cutoff,now()-600).first();
 if(!attempt)return 'already_claimed_or_not_due';
 try {
  const eligible=await eligibility(env,attempt);
  if(!eligible.allowed) {
   await sql(env,"UPDATE commerce_attempts SET reminder_status=?,reminder_error=? WHERE id=? AND reminder_status='checking'",
    ['ASYNC_PENDING','SYNC_PENDING','NOT_DUE'].includes(eligible.reason)?'pending':'suppressed',eligible.reason,id).run();
   return eligible.reason;
  }
  const token=await recoveryToken(env,attempt.root_id),link=`${origin}/reprendre-commande?token=${encodeURIComponent(token)}`;
  const fields=eligible.person?.fields||{};
  const copy=reminderCopy(attempt.offer,link,`${link}&action=stop`,fields.first_name||'');
  // Recheck immediately before claiming the irreversible send. A Stripe payment
  // concurrent with the provider accepting the email cannot be atomically excluded.
  if(!(await eligibility(env,attempt)).allowed) {
   await sql(env,"UPDATE commerce_attempts SET reminder_status='pending' WHERE id=? AND reminder_status='checking'",id).run();return 'changed';
  }
  // One atomic reservation per contact, across all offers and concurrent workers.
  // rowid breaks equal server-created timestamps; webhook arrival never selects a winner.
  const reserved=await sql(env,`INSERT INTO commerce_reminder_contacts(environment,email,attempt_id,reserved_until)
   SELECT ?,?,?,? WHERE ?=(SELECT id FROM commerce_attempts WHERE environment=? AND email=? AND session_id IS NOT NULL ORDER BY created_at DESC,rowid DESC LIMIT 1)
   ON CONFLICT(environment,email) DO UPDATE SET attempt_id=excluded.attempt_id,reserved_until=excluded.reserved_until
   WHERE commerce_reminder_contacts.reserved_until<=? RETURNING attempt_id`,environment,attempt.email,attempt.id,now()+86430,
   attempt.id,environment,attempt.email,now()).first();
  if(!reserved) {
   await sql(env,"UPDATE commerce_attempts SET reminder_status='pending',reminder_error='CONTACT_RATE_LIMIT' WHERE id=? AND reminder_status='checking'",id).run();
   return 'CONTACT_RATE_LIMIT';
  }
  // A newer checkout or a payment may have appeared during the reservation.
  const finalCheck=await eligibility(env,attempt);
  if(!finalCheck.allowed) {
   await env.ORDERS_DB.batch([
    sql(env,"DELETE FROM commerce_reminder_contacts WHERE environment=? AND email=? AND attempt_id=?",environment,attempt.email,id),
    sql(env,"UPDATE commerce_attempts SET reminder_status='pending',reminder_error=? WHERE id=? AND reminder_status='checking'",finalCheck.reason,id)
   ]);
   return finalCheck.reason;
  }
  const claimed=await sql(env,"UPDATE commerce_attempts SET reminder_status='sending',reminder_at=? WHERE id=? AND reminder_status='checking' RETURNING id",now(),id).first();
  if(!claimed)return 'already_claimed';
  try {
   const response=await fetch(`https://api.mail.hostinger.com/api/v1/mailboxes/${encodeURIComponent(env.HOSTINGER_MAILBOX_ID)}/send`,{
    method:'POST',headers:{Authorization:`Bearer ${env.HOSTINGER_MAIL_API_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify({to:[attempt.email],displayName:'Efficia Digital',...copy}),signal:AbortSignal.timeout(8000),redirect:'manual'});
   // No automatic retry after ANY ambiguous send, including a lost 204 response.
   const status=response.status===204?'accepted':'uncertain';
   await sql(env,'UPDATE commerce_attempts SET reminder_status=?,reminder_error=? WHERE id=?',status,status==='uncertain'?'PROVIDER_RESPONSE_UNCONFIRMED':null,id).run();
   await sql(env,'UPDATE commerce_reminder_contacts SET reserved_until=? WHERE environment=? AND email=? AND attempt_id=?',now()+86400,environment,attempt.email,id).run();
   return status;
  } catch {
   await sql(env,"UPDATE commerce_attempts SET reminder_status='uncertain',reminder_error='SEND_OUTCOME_UNKNOWN' WHERE id=?",id).run();
   return 'uncertain';
  }
 } catch(error) {
  await sql(env,"UPDATE commerce_attempts SET reminder_status=?,reminder_error=? WHERE id=? AND reminder_status='checking'",error.permanent?'suppressed':'pending',safeError(error),id).run();
  return error.permanent?'suppressed':'retry';
 }
}
export async function resumePurchase(env,root) {
 await refreshAttempts(env,root.email);
 const newest=await latestAttempt(env,root.email);
 if(newest && newest.root_id!==root.id)throw Error('CHECKOUT_REPLACED');
 if(await paidContact(env,root.email))throw Error('ORDER_ALREADY_PAID');
 const {environment}=siteConfig(env);
 if(await sql(env,"SELECT 1 FROM commerce_attempts WHERE environment=? AND email=? AND state='processing'",environment,root.email).first())throw Error('PAYMENT_PROCESSING');
 const attempts=await rows(sql(env,'SELECT * FROM commerce_attempts WHERE root_id=? ORDER BY created_at DESC,rowid DESC',root.id));
 const latest=attempts[0];
 if(latest.state==='open' && latest.expires_at>now()+60 && validCheckoutURL(latest.checkout_url))return latest.checkout_url;
 if(latest.state==='creating')return (await createSession(env,latest)).url;
 const payload=JSON.parse(root.payload);
 if(payload.cgv_version!==ACTIVE_CGV_VERSION)throw Error('CGV_REACCEPTANCE_REQUIRED');
 const newId=crypto.randomUUID(),key=`recovery:${latest.id}`;
 await sql(env,`INSERT OR IGNORE INTO commerce_attempts(id,environment,email,offer,payload,fingerprint,active_key,root_id,created_at,reminder_status)
 VALUES(?,?,?,?,?,?,?,?,?,'pending')`,newId,environment,root.email,root.offer,root.payload,root.fingerprint,key,root.id,now()).run();
 const next=await sql(env,'SELECT * FROM commerce_attempts WHERE active_key=?',key).first();
 const session=await createSession(env,next);
 await syncContact(env,root.email).catch(()=>false);
 return session.url;
}
export async function stopContact(env,email) {
 const {environment}=siteConfig(env);
 await env.ORDERS_DB.batch([contactJob(env,environment,email),sql(env,'UPDATE commerce_contacts SET stopped=1 WHERE environment=? AND email=?',environment,email)]);
 await syncContact(env,email);
}
export async function runCommerceJobs(env) {
 const {environment}=siteConfig(env);
 // Bounded batches; jobs remain durable if a tick is interrupted.
 const sync=await runSyncJobs(env);
 const cutoff=reminderCutover(env);
 if(env.COMMERCE_REMINDERS_ENABLED!=='true'||env.COMMERCE_REMINDER_OWNER_VERIFIED!=='server_only'||!cutoff)return {...sync,reminders:0};
 const due=await rows(sql(env,`SELECT id FROM commerce_attempts WHERE environment=? AND session_id IS NOT NULL AND created_at<=? AND created_at>=?
  AND ((reminder_status='pending' AND (reminder_at IS NULL OR reminder_at<?)) OR (reminder_status='checking' AND reminder_at<?)) ORDER BY COALESCE(reminder_at,0),created_at LIMIT 10`,environment,now()-86400,cutoff,now()-300,now()-600));
 for(const item of due)await dispatchReminder(env,item.id);
 return {...sync,reminders:due.length};
}
