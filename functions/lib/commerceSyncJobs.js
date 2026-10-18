import {siteConfig,sql,rows,now,syncContact} from './commerceCore.js';
import {runConfirmations} from './commerceConfirmations.js';
export async function runSyncJobs(env) {
 const {environment}=siteConfig(env);
 const pending=await rows(sql(env,`SELECT email FROM commerce_contacts WHERE environment=? AND revision>synced_revision AND sync_blocked=0 AND retry_at<=? AND lease_until<? ORDER BY retry_at LIMIT 10`,environment,now(),now()));
 for(const item of pending)await syncContact(env,item.email);
 const confirmations=await runConfirmations(env);
 return {contacts:pending.length,confirmations};
}
