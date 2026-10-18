import { preparePurchase } from './lib/commerceCheckout.js';
import { json, safeError } from './lib/commerceCore.js';
import { resolvePublicSite } from './lib/environmentIsolation.js';
export async function onRequestPost({request,env}) {
 const site=resolvePublicSite(request,env);
 if(!site.ok)return json({success:false,error:site.error},site.status);
 if(request.headers.get('Origin')!==site.origin)return json({success:false,error:'ORIGIN_REQUIRED'},403);
 try{return json(await preparePurchase(env,await request.json()));}
 catch(error){const code=safeError(error);return json({success:false,error:code},/REQUIRED|INVALID|CONFLICT|EXPIRED|ALREADY/.test(code)?409:503);}
}
export async function onRequest(context){return context.request.method==='POST'?onRequestPost(context):json({error:'METHOD_NOT_ALLOWED'},405);}
