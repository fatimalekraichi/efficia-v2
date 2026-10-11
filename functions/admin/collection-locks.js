import { requireAdminSession } from "./_shared.js";

export async function onRequestGet(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;
  return new Response(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Verrous de collecte — Efficia</title>
<style>body{font:16px system-ui;max-width:1000px;margin:32px auto;padding:16px;color:#10213a}table{width:100%;border-collapse:collapse}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left;overflow-wrap:anywhere}button,input{font:inherit;padding:8px}#status{min-height:2em}.table{overflow:auto}</style>
<a href="/admin.html">Retour au back-office</a><h1>Verrous de collecte</h1>
<p>Seuls les verrous de plus de 15 minutes apparaissent. Il n’y a aucune expiration automatique.</p>
<p>Avant de libérer : vérifiez que la collecte est terminée et contrôlez son état chez le fournisseur. Libérer une opération encore active peut provoquer une double facturation.</p>
<label>Votre nom (déclaré dans le journal) <input id="operator" maxlength="80" required autocomplete="name"></label>
<button id="reload">Actualiser</button><p id="status" role="status"></p>
<div class="table"><table><thead><tr><th>Analyse</th><th>Date du verrou</th><th>Opération</th><th>Action</th></tr></thead><tbody id="locks"></tbody></table></div>
<script>
const status=document.getElementById('status'), rows=document.getElementById('locks');
async function load(){
 try{const response=await fetch('/api/admin/collection-locks',{cache:'no-store'});
 if(!response.ok)throw new Error('Chargement impossible : session ou stockage indisponible.');
 const data=await response.json();rows.replaceChildren();
 for(const lock of data.locks){const row=document.createElement('tr');
 for(const value of [lock.analysis_id,new Date(lock.acquired_at).toLocaleString('fr-FR'),lock.operation]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}
 const cell=document.createElement('td'), button=document.createElement('button');button.textContent='Libérer';cell.append(button);row.append(cell);rows.append(row);
 button.onclick=async()=>{const operator=document.getElementById('operator');if(!operator.reportValidity())return;
 if(!confirm('Confirmez-vous avoir vérifié que la collecte est terminée chez le fournisseur ? Cette libération sera journalisée avec votre nom et votre session.'))return;
 button.disabled=true;
 try{const result=await fetch('/api/admin/collection-locks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({analysisId:lock.analysis_id,token:lock.token,operator:operator.value,confirmed:true})});
 if(!result.ok)throw new Error('Libération refusée : verrou changé, trop récent, ou journal indisponible.');await load();status.textContent='Verrou libéré et journalisé.';
 }catch(error){status.textContent=error.message;button.disabled=false;}};
 }status.textContent=data.locks.length?'':'Aucun verrou de plus de 15 minutes.';
 }catch(error){status.textContent=error.message;}
}
document.getElementById('reload').onclick=load;load();
</script></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
