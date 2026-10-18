import { runConfirmations } from './lib/commerceConfirmations.js';
import { signatureValid, handleEvent } from './lib/commerceEvents.js';
import { json,sql,syncContact } from './lib/commerceCore.js';
export async function onRequestPost(context) {
 const {request,env}=context;
 const raw=await request.text();
 if(!await signatureValid(raw,request.headers.get('Stripe-Signature'),env.STRIPE_WEBHOOK_SECRET))return json({error:'INVALID_SIGNATURE'},400);
 try{
  const event=JSON.parse(raw),result=await handleEvent(env,event);
  if(!result.ignored && context.waitUntil)context.waitUntil((async()=>{
   const row=await sql(env,`SELECT email FROM commerce_attempts WHERE session_id=?
    UNION SELECT email FROM commerce_invoices WHERE id=? LIMIT 1`,event.data.object.id,event.data.object.id).first();
   if(row){await syncContact(env,row.email);await runConfirmations(env,row.email);}
  })().catch(()=>{})); // Durable job remains pending; cron retries if this fast path fails.
  return json(result);
 }
 catch{return json({error:'WEBHOOK_RETRY_REQUIRED'},503);}
}
export async function onRequest(context){return context.request.method==='POST'?onRequestPost(context):json({error:'METHOD_NOT_ALLOWED'},405);}
