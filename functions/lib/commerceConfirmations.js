import {sql,rows,siteConfig,now,OFFERS} from './commerceCore.js';
export function confirmationCopy(offer,sessionId) {
 return {subject:`Confirmation de votre commande — ${OFFERS[offer].name}`,text:
 `Bonjour,\n\nVotre paiement pour ${OFFERS[offer].name} est confirmé et votre commande est enregistrée.\nRéférence : ${sessionId}\n\nNous vous contacterons pour organiser la prestation et recueillir les informations nécessaires. Pour toute question sur cette commande, vous pouvez répondre à cet e-mail.\n\nLe reçu ou la facture de paiement est un document distinct émis par Stripe selon les paramètres de facturation.\n\nEfficia Digital\n\nCe message concerne uniquement votre commande et ne vous inscrit à aucune communication commerciale.`};
}
export async function runConfirmations(env,email=null) {
 if(env.COMMERCE_CONFIRMATIONS_ENABLED!=='true' || env.COMMERCE_CONFIRMATION_OWNER!=='server_only')return {disabled:true};
 const cutoff=Number(env.COMMERCE_CONFIRMATION_CUTOVER||0);if(!cutoff)throw Error('CONFIRMATION_CUTOVER_REQUIRED');
 if(!env.HOSTINGER_MAIL_API_TOKEN||!env.HOSTINGER_MAILBOX_ID)throw Error('SENDER_NOT_CONFIGURED');
 const {environment}=siteConfig(env);
 // Durable selection from paid records; event replay and different events share the same session key.
 await sql(env,`INSERT OR IGNORE INTO commerce_confirmations(session_id,environment,email,offer,created_at)
 SELECT a.session_id,a.environment,a.email,a.offer,? FROM commerce_attempts a
 WHERE a.environment=? AND a.state='paid' AND a.created_at>=? AND (? IS NULL OR a.email=?)
 AND EXISTS(SELECT 1 FROM orders o WHERE o.stripe_session_id=a.session_id)`,now(),environment,cutoff,email,email).run();
 const pending=await rows(sql(env,`SELECT * FROM commerce_confirmations WHERE environment=? AND status='pending' AND (? IS NULL OR email=?) ORDER BY created_at LIMIT 10`,environment,email,email));
 let accepted=0;
 for(const row of pending) {
  const claimed=await sql(env,"UPDATE commerce_confirmations SET status='sending',attempted_at=? WHERE session_id=? AND status='pending' RETURNING session_id",now(),row.session_id).first();
  if(!claimed)continue;
  try {
   const response=await fetch(`https://api.mail.hostinger.com/api/v1/mailboxes/${encodeURIComponent(env.HOSTINGER_MAILBOX_ID)}/send`,{
    method:'POST',headers:{Authorization:`Bearer ${env.HOSTINGER_MAIL_API_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify({to:[row.email],displayName:'Efficia Digital',...confirmationCopy(row.offer,row.session_id)}),signal:AbortSignal.timeout(8000),redirect:'manual'});
   const status=response.status===204?'accepted':'uncertain';
   await sql(env,'UPDATE commerce_confirmations SET status=?,error=? WHERE session_id=?',status,status==='uncertain'?'PROVIDER_RESPONSE_UNCONFIRMED':null,row.session_id).run();
   if(status==='accepted')accepted++;
  }catch {await sql(env,"UPDATE commerce_confirmations SET status='uncertain',error='SEND_OUTCOME_UNKNOWN' WHERE session_id=?",row.session_id).run();}
 }
 // No automatic retry of sending/uncertain: a lost acknowledgement must not duplicate a receipt.
 return {accepted};
}
