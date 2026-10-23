import { resolveToken,resumePurchase,stopContact } from './lib/commerceReminders.js';
import { siteConfig } from './lib/commerceCore.js';
const page=(text,status=200)=>new Response(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Votre commande — Efficia Digital</title><body><main><h1>Votre commande</h1>${text}</main></body></html>`,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
export async function onRequest({request,env}) {
 try {
  const {origin}=siteConfig(env),u=new URL(request.url);
  if(u.origin!==origin)return page('Lien indisponible.',403);
  const token=u.searchParams.get('token'),root=await resolveToken(env,token),stop=u.searchParams.get('action')==='stop';
  // GET never creates a session or unsubscribes: email scanners can safely inspect it.
  if(request.method==='GET')return page(`<p>${stop?'Arrêter toutes les relances commerciales Efficia Digital pour cette adresse e-mail ?':'Vous pouvez reprendre votre commande en toute sécurité.'}</p><form method="post"><button>${stop?'Arrêter toutes les relances commerciales':'Reprendre ma commande'}</button></form>`);
  if(request.method!=='POST' || request.headers.get('Origin')!==origin)return page('Action non autorisée.',403);
  if(stop){await stopContact(env,root.email);return page('<p>Toutes les relances commerciales Efficia Digital pour cette adresse e-mail sont arrêtées. Les messages nécessaires au traitement de vos commandes restent distincts.</p>');}
  const url=await resumePurchase(env,root);
  return new Response(null,{status:303,headers:{Location:url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 } catch(error) {
  const message=error.message==='ORDER_ALREADY_PAID'?'Un paiement est déjà confirmé. Contactez-nous si vous souhaitez une autre prestation.':
   error.message==='PAYMENT_PROCESSING'?'Votre paiement est en cours de confirmation. Merci de patienter.':
   'Ce lien ne peut pas être utilisé pour le moment. Contactez Efficia Digital pour reprendre votre commande.';
  return page(`<p>${message}</p>`,409);
 }
}
