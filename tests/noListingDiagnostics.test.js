import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness,identity,provider} from './noListingTestHelpers.js';
import {onRequestPost} from '../functions/api/admin/no-listing-diagnostics.js';
import {reportReady,defaultPriorities,validatePriorities,normalizeIdentity} from '../js/no-listing-model.js';
import {competitionHtml,categoryLabel} from '../js/no-listing-report.js';
const collect=(h,d,extra={})=>h.send({action:'collect',id:d.id,revision:d.revision,zoneConfirmed:true,...extra});
const save=(h,d,data)=>h.send({action:'save',id:d.id,revision:d.revision,data});

test('copie sans fiche : français à l’affichage, sources intactes et réserves non répétées',()=>{
  const observation={status:'success',query:identity.query,city:identity.city,countryCode:'BE',observedAt:'2026-09-16T10:00:00Z',
    competitors:[{name:'Exemple fictif',primary_category:'Electrician',secondary_categories:[],rating:4.5,reviews:13,location_link:'https://www.google.com/maps'}]};
  const original=structuredClone(observation),html=competitionHtml(observation,{translateCategories:true}),priorities=defaultPriorities(identity,observation);
  assert.match(html,/Électricien/);assert.doesNotMatch(html,/Electrician/);assert.deepEqual(observation,original);
  assert.match(competitionHtml(observation),/Electrician/);
  assert.equal(categoryLabel('Unknown local category'),'Unknown local category');
  assert.match(priorities[1].actions,/Choisir la catégorie principale correspondant à votre activité d’électricien\./);
  assert.doesNotMatch(JSON.stringify(priorities),/notre atelier|qui décrit réellement|déclare ne pas avoir|aucune fiche n’est évaluée|sans garantie|sans promettre/);
  assert.equal(priorities.length,3);
});

test('création manuelle explicite et idempotente : aucune analyse, fiche, commande, score ni e-mail',async()=>{
  const h=await harness(),p=provider();try{
    const key=crypto.randomUUID();let r=await h.create({idempotencyKey:key});assert.equal(r.status,201);
    const again=await h.create({idempotencyKey:key});assert.equal(again.dossier.id,r.dossier.id);
    assert.equal(p.calls.length,0);
    for(const table of ['analyses','diagnostic_requests','orders','audit_questionnaire_snapshots'])assert.equal(h.db.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,0);
    assert.doesNotMatch(JSON.stringify(r.dossier),/"score"|"rating"|"place_id"|"position"/);
    assert.equal((await h.create({confirmed:false})).status,400);
    assert.equal((await h.create({data:{...identity,absenceContext:'not_found'}})).status,400);
  }finally{p.restore();h.db.sqlite.close();}
});
test('demande reçue : préremplissage, contexte non trouvé distinct, même dossier malgré double clic',async()=>{
  const h=await harness();try{
    const id=crypto.randomUUID();h.db.sqlite.prepare(`INSERT INTO diagnostic_lead_captures VALUES (?,?,?,'synced',?,?,?,'not_found',?)`).run(id,'Camille','test@example.invalid','2026-09-16','2026-09-16',JSON.stringify({company:identity.company,city:'Namur',countryCode:'BE'}),'2026-09-16');
    const pre=await h.get('?captureId='+id);assert.equal(pre.source.city,'Namur');assert.equal(pre.source.reviewReason,'not_found');assert.equal(pre.dossier,null);
    const results=await Promise.all([h.create({captureId:id}),h.create({captureId:id})]);
    assert.equal(results[0].dossier.id,results[1].dossier.id);
    assert.equal(h.db.sqlite.prepare('SELECT count(*) AS n FROM no_listing_diagnostics').get().n,1);
    assert.equal((await h.get('?captureId='+id)).dossier.captureId,id);
    assert.equal(h.db.sqlite.prepare('SELECT count(*) AS n FROM diagnostic_lead_captures').get().n,1);
    assert.equal((await h.get('')).completedCaptureCount,0);
    const p=provider();
    try {
      const d=(await collect(h,results[0].dossier)).dossier;
      assert.equal((await h.send({action:'finalize',id:d.id,revision:d.revision})).status,200);
      assert.equal((await h.get('')).completedCaptureCount,1);
    } finally { p.restore(); }
  }finally{h.db.sqlite.close();}
});
for(const count of [0,1,2,3])test(`${count} concurrents : observations réelles, sans moyenne, score ou classement de l’entreprise`,async()=>{
  const h=await harness(),p=provider({count});try{
    const d=(await h.create()).dossier,r=await collect(h,d);
    assert.equal(r.status,200);assert.equal(r.dossier.data.collection.competitors.length,count);
    assert.equal(r.dossier.data.priorities.length,3);assert.equal(reportReady(r.dossier.data),true);
    assert.doesNotMatch(JSON.stringify(r.dossier.data),/"score"|"position"|"average"|"benchmark"/);
    if(count){assert.equal(r.dossier.data.collection.competitors[0].rating,null);assert.equal(r.dossier.data.collection.competitors[0].reviews,null);}
    const url=new URL(p.calls[1].url);assert.equal(url.searchParams.get('query'),'Électricien Namur');assert.equal(url.searchParams.get('coordinates'),'50.46,4.87');assert.equal(url.searchParams.get('region'),'BE');
    assert.equal(p.calls.length,2);
  }finally{p.restore();h.db.sqlite.close();}
});
test('exclusion des publicités, catégories hors métier et profils non vérifiables',async()=>{
  const h=await harness(),p=provider({response:()=>Response.json({data:[[
    {name:'Annonce',place_id:'ads_123',category:'Electrician',sponsored:true,reviews:99},
    {name:'Camping',place_id:'camping',category:'Campground',reviews:50},
    {name:'Sans catégorie',place_id:'unknown',reviews:15},
    {name:'Sans identité vérifiable',category:'Electrician'},
    {name:'Entreprise fictive pertinente',place_id:'real_id',category:'Electrician'},
  ]]})});try{const r=await collect(h,(await h.create()).dossier);assert.deepEqual(r.dossier.data.collection.competitors.map(c=>c.name),['Entreprise fictive pertinente']);}finally{p.restore();h.db.sqlite.close();}
});
for(const [name,response] of [
  ['timeout',()=>{throw new DOMException('private detail','AbortError');}],
  ['HTTP',()=>new Response('secret fournisseur',{status:500})],
  ['JSON invalide',()=>new Response('<h1>secret</h1>')],
  ['objet vide',()=>Response.json({})],
  ['échec fournisseur',()=>Response.json({status:'Failure',data:[]})],
  ['résultat en attente',()=>Response.json({status:'Pending',data:[]})],
  ['groupes de résultats ambigus',()=>Response.json({data:[[],[]]})],
  ['erreur dans le groupe',()=>Response.json({data:[[{error:'private detail'}]]})],
])test(`${name} : erreur explicite, finalisation bloquée, aucune absence de concurrence inventée`,async()=>{
  const h=await harness(),p=provider({response});try{
    const r=await collect(h,(await h.create()).dossier);assert.equal(r.status,502);assert.equal(r.error,'COLLECTION_UNAVAILABLE');assert.equal(r.dossier.data.collection.status,'failed');
    assert.equal(reportReady(r.dossier.data),false);assert.equal(r.dossier.data.priorities,null);
    assert.doesNotMatch(JSON.stringify(r),/secret|private detail|<h1>/);
    assert.equal((await h.send({action:'finalize',id:r.dossier.id,revision:r.dossier.revision})).status,400);
  }finally{p.restore();h.db.sqlite.close();}
});
test('une fiche peut correspondre à l’entreprise : vérification obligatoire, aucun classement',async()=>{
  const h=await harness(),p=provider({response:()=>Response.json({data:[[{name:identity.company,place_id:'possible_id',category:'Electrician'}]]})});
  try{const r=await collect(h,(await h.create()).dossier);assert.equal(r.error,'POSSIBLE_EXISTING_LISTING');assert.equal(reportReady(r.dossier.data),false);}finally{p.restore();h.db.sqlite.close();}
});
test('zone/pays à confirmer : aucun appel avant confirmation ni fallback entreprise',async()=>{
  const h=await harness(),p=provider({geo:()=>Response.json({city:'Autre ville',country_code:'FR',latitude:48,longitude:2})});try{
    const d=(await h.create()).dossier;assert.equal((await collect(h,d,{zoneConfirmed:false})).status,400);assert.equal(p.calls.length,0);
    const r=await collect(h,d);assert.equal(r.error,'LOCALITY_UNAVAILABLE');assert.equal(p.calls.length,1);
  }finally{p.restore();h.db.sqlite.close();}
});
test('requête modifiée, relance, trois priorités éditées persistées et snapshot immuable',async()=>{
  const h=await harness(),p=provider();try{
    let d=(await collect(h,(await h.create()).dossier)).dossier;
    d.data.priorities[0].title='Titre personnalisé';d.data.priorities[2].actions='Action personnalisée sans contrepartie.';
    d=(await save(h,d,{...d.data,query:'Artisan électricien Namur'})).dossier;
    assert.equal(reportReady(d.data),false);
    d=(await save(h,d,d.data)).dossier;
    d=(await collect(h,d)).dossier;assert.equal(d.data.priorities[0].title,'Titre personnalisé');
    assert.match(d.data.priorities[0].finding,/Artisan électricien Namur/);
    assert.equal(new URL(p.calls.at(-1).url).searchParams.get('query'),'Artisan électricien Namur');
    d=(await h.get('?id='+d.id)).dossier;assert.equal(d.data.priorities[2].actions,'Action personnalisée sans contrepartie.');
    const snapshot=structuredClone(d.data);const final=await h.send({action:'finalize',id:d.id,revision:d.revision});
    assert.equal(final.status,200);assert.equal(final.dossier.status,'finalized');assert.deepEqual(final.dossier.data,snapshot);
    assert.equal((await save(h,final.dossier,final.dossier.data)).status,409);
    assert.deepEqual((await h.get('?id='+d.id)).dossier.data,snapshot);
    assert.equal((await h.get('')).dossiers.filter(d=>d.status==='finalized').length,1);
    assert.equal(h.db.sqlite.prepare('SELECT count(*) AS n FROM analyses').get().n,0);
  }finally{p.restore();h.db.sqlite.close();}
});
test('échec après une collecte réussie : observations précédentes non utilisables, relance possible',async()=>{
  const h=await harness();let p=provider();try{
    let d=(await collect(h,(await h.create()).dossier)).dossier;
    p.restore();p=provider({response:()=>new Response('unavailable',{status:503})});
    d=(await collect(h,d)).dossier;assert.equal(reportReady(d.data),false);
    assert.equal((await h.send({action:'finalize',id:d.id,revision:d.revision})).status,400);
    p.restore();p=provider({count:1});d=(await collect(h,d)).dossier;
    assert.equal(reportReady(d.data),true);assert.equal(d.data.collection.competitors.length,1);
    assert.match(d.data.priorities[0].finding,/1 fiche pertinente a été observée/);
  }finally{p.restore();h.db.sqlite.close();}
});
test('une modification pendant la collecte empêche de publier une réponse périmée',async()=>{
  const h=await harness();let release,started;
  const begun=new Promise(r=>started=r),hold=new Promise(r=>release=r);
  const p=provider({response:async()=>{started();await hold;return Response.json({data:[[]]});}});
  try{
    const d=(await h.create()).dossier, pending=collect(h,d);await begun;
    const current=(await h.get('?id='+d.id)).dossier;
    const edited=await save(h,current,{...current.data,query:'Électricien Namur centre'});assert.equal(edited.status,200);
    release();assert.equal((await pending).status,409);
    assert.equal((await h.get('?id='+d.id)).dossier.data.query,'Électricien Namur centre');
  }finally{release?.();p.restore();h.db.sqlite.close();}
});
test('révision périmée, injection HTML et nombre de priorités invalide refusés',async()=>{
  const h=await harness();try{
    const d=(await h.create()).dossier;
    assert.equal((await h.send({action:'save',id:d.id,revision:0,data:d.data})).status,409);
    assert.equal((await save(h,d,{...d.data,company:'<script>alert(1)</script>'})).status,400);
    assert.equal((await save(h,d,{...d.data,website:'not a URL'})).status,400);
    assert.equal((await save(h,d,{...d.data,priorities:[]})).status,400);
    assert.throws(()=>validatePriorities(Array(4).fill({})),/THREE_PRIORITIES/);
  }finally{h.db.sqlite.close();}
});
test('authentification, origine et stockage défaillant : jamais de faux succès',async()=>{
  const h=await harness();try{
    const payload={action:'create',confirmed:true,idempotencyKey:crypto.randomUUID(),data:identity};
    const ctx=h.context(payload);ctx.request=new Request(ctx.request.url,{method:'POST',body:JSON.stringify(payload)});
    assert.equal((await onRequestPost(ctx)).status,401);
    ctx.request=new Request(ctx.request.url,{method:'POST',headers:{Cookie:h.cookie,Origin:'https://attacker.invalid'},body:JSON.stringify(payload)});
    assert.equal((await onRequestPost(ctx)).status,403);
    h.db.sqlite.exec('DROP TABLE no_listing_diagnostics');assert.equal((await h.send(payload)).status,500);
  }finally{h.db.sqlite.close();}
});
test('accès des listes et création : variante séparée, PDF classique et Ads non chargés',()=>{
  const admin=readFileSync(new URL('../js/admin.js',import.meta.url),'utf8');
  assert.match(admin,/noListingId.*free-diagnostic-no-listing/);
  assert.match(admin,/d\.status==='finalized'/);assert.match(admin,/d\.status==='draft'/);
  const page=readFileSync(new URL('../admin/free-diagnostic-no-listing/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(page,/openai-ads|score-efficia-core|free-diagnostic-production/);
  assert.equal(defaultPriorities(identity).length,3);
  assert.throws(()=>normalizeIdentity({...identity,countryCode:''}),/REQUIRED/);
});
