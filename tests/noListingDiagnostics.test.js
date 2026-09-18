import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness,identity,provider} from './noListingTestHelpers.js';
import {onRequestPost} from '../functions/api/admin/no-listing-diagnostics.js';
import {cityWithDe,reportReady,defaultPriorities,validatePriorities,normalizeIdentity} from '../js/no-listing-model.js';
import {competitionHtml,categoryLabel,panelFacts,panelSummaryHtml,priorityActionsHtml,presenceVerdictHtml,panelReviewSentence} from '../js/no-listing-report.js';
const collect=(h,d,extra={})=>h.send({action:'collect',id:d.id,revision:d.revision,zoneConfirmed:true,...extra});
const save=(h,d,data)=>h.send({action:'save',id:d.id,revision:d.revision,data});
test('élision des villes : voyelles, h muet connu, consonnes et préposition à inchangée',()=>{
  for(const [city,expected] of [['Auvelais','d’Auvelais'],['Évreux','d’Évreux'],['Huy','d’Huy'],['Hyères','d’Hyères'],['Namur','de Namur'],['Hambourg','de Hambourg']]){
    assert.equal(cityWithDe(city),expected);
    const data={...identity,city,searchCity:city};
    const priorities=defaultPriorities(data,{competitors:[{reviews:3,name:'Exemple'}]});
    assert.ok(priorities[1].actions.includes(`autour ${expected}`));
    assert.ok(priorities[0].finding.includes(`zone ${expected}.`));
    assert.ok(priorities[0].actions.includes(`à ${city}`));
  }
});
test('ancienne action automatique : élision au rendu, personnalisation et source intactes',()=>{
  const data={...identity,city:'Auvelais'};
  data.priorities=defaultPriorities(data);
  data.priorities[1].actions=data.priorities[1].actions.replace('autour d’Auvelais','autour de Auvelais');
  data.automaticPriorities=structuredClone(data.priorities);
  const original=JSON.stringify(data);
  assert.match(priorityActionsHtml(data,data.priorities[1],1),/autour d’Auvelais/);
  data.priorityOverrides={1:{actions:data.priorities[1].actions}};
  assert.match(priorityActionsHtml(data,data.priorities[1],1),/autour de Auvelais/);
  delete data.priorityOverrides;assert.equal(JSON.stringify(data),original);
});

test('synthèse : fourchettes issues des seules fiches présentées, sans moyenne ni mutation',()=>{
  const collection={status:'success',query:'Électricien Auvelais',competitors:[{reviews:23,rating:5},{reviews:22,rating:5},{reviews:39,rating:4.8}]};
  const original=structuredClone(collection),facts=panelFacts(collection),html=panelSummaryHtml(collection,{indicators:true});
  assert.deepEqual(facts,{count:3,reviewed:3,reviewTotal:84,reviews:{min:22,max:39,known:3},ratings:{min:4.8,max:5,known:3}});
  assert.match(html,/Les 3 fiches observées dont le nombre d’avis est disponible cumulent 84 avis\./);
  assert.match(html,/84 avis<\/strong><span>sur 3 fiches renseignées/);assert.match(html,/4,8 à 5,0\/5/);assert.match(html,/fiches présentées/);
  assert.match(panelSummaryHtml(collection),/3 fiches Google sont présentées[\s\S]*Elles disposent d’avis clients/);
  assert.doesNotMatch(html,/moyenne|top 3|score|potentiel/);assert.deepEqual(collection,original);
});
test('verdict : repère seulement sur absence déclarée ou confirmée, identité échappée et aucun score',()=>{
  const data={company:'Entreprise <test>',activity:'Electrician',city:'Auvelais',collection:{status:'success',query:'Électricien Auvelais',competitors:[{reviews:23},{reviews:22},{reviews:39}]}};
  for(const absenceContext of ['declared','confirmed',undefined,'not_found','unavailable']){
    const html=presenceVerdictHtml({...data,absenceContext});
    assert.equal(html.includes('nl-presence-ring'),false);
    assert.equal(html.includes('Absence de fiche déclarée'),absenceContext==='declared');
    assert.equal(html.includes('Votre priorité : créer et optimiser votre fiche Google'),absenceContext==='confirmed');
    assert.doesNotMatch(html,/fiche Google identifiée/);
    assert.match(html,/Électricien Auvelais/);
    assert.match(html,/les trois fiches présentées cumulent 84 avis clients/);
    assert.doesNotMatch(html,/\/100|invisible|n’apparaît pas|perte|captent|<test>/);
  }
  assert.doesNotMatch(presenceVerdictHtml({...data,collection:{...data.collection,status:'error'}}),/84 avis|retenir 3/);
});
test('priorités 2 et 3 : deux et trois puces automatiques, sans modification des données ou des actions personnalisées',()=>{
  const data={...identity,priorities:defaultPriorities(identity)};
  const original=JSON.stringify(data);
  for(const index of [1,2]){
    const p=data.priorities[index];
    assert.equal((priorityActionsHtml(data,p,index).match(/<li>/g)||[]).length,index===2?3:2);
    const custom={...p,actions:'Premier conseil. Deuxième conseil. Troisième conseil. Quatrième conseil.'};
    assert.equal(priorityActionsHtml(data,custom,index),`<p>${custom.actions}</p>`);
    const explicit={...data,priorityOverrides:{[index]:{actions:p.actions}}};
    assert.equal(priorityActionsHtml(explicit,p,index),`<p>${p.actions}</p>`);
  }
  assert.match(priorityActionsHtml(data,data.priorities[2],2),/Ne pas sélectionner uniquement les clients satisfaits/);
  assert.match(priorityActionsHtml(data,data.priorities[2],2),/Ne proposer aucune contrepartie/);
  assert.match(priorityActionsHtml(data,data.priorities[2],2),/<li>Une fois votre fiche en ligne, proposer/);
  assert.match(priorityActionsHtml(data,data.priorities[2],2),/<li>Répondre aux avis avec courtoisie\.<\/li>/);
  assert.equal(JSON.stringify(data),original);
});
test('total des avis : panel partiel, zéro réel, singulier et données absentes',()=>{
  const sentence=competitors=>panelReviewSentence({status:'success',competitors});
  assert.equal(sentence([{reviews:1}]),'La fiche présentée compte 1 avis client. Ces avis peuvent aider un prospect à comparer les professionnels.');
  assert.equal(sentence([{reviews:0}]),'La fiche présentée compte 0 avis clients.');
  assert.match(sentence([{reviews:7},{reviews:null},{reviews:2}]),/Les 2 fiches dont le nombre d’avis est renseigné cumulent 9/);
  assert.doesNotMatch(sentence([{reviews:null},{reviews:'5'}]),/0 avis|5 avis|cumulent/);
  assert.doesNotMatch(sentence([]),/0 avis|cumulent/);
});
for(const count of [0,1,2,3])test(`synthèse : ${count} fiches, nombres d’avis et notes manquants non inventés`,()=>{
  const collection={status:'success',query:'Recherche fictive',competitors:Array.from({length:count},()=>({reviews:null,rating:null}))};
  const facts=panelFacts(collection),html=panelSummaryHtml(collection,{indicators:true}),intro=panelSummaryHtml(collection);
  assert.equal(facts.count,count);assert.equal(facts.reviews,null);assert.equal(facts.ratings,null);
  assert.equal((html.match(/class="nl-metric"/g)||[]).length,1);
  assert.doesNotMatch(html+intro,/0 avis|0,0\/5|disposent d’avis|dispose d’avis|n’apparaît nulle part|clients perdus/);
});
test('synthèse partielle et valeurs nulles, zéro réel, égalité et valeurs invalides',()=>{
  const c={status:'success',competitors:[{reviews:0,rating:null},{reviews:7,rating:4.5},{reviews:null,rating:4.5}]};
  const html=panelSummaryHtml(c,{indicators:true});
  assert.match(html,/7 avis<\/strong>/);assert.match(html,/sur 2 fiches renseignées/);assert.match(html,/4,5\/5/);assert.doesNotMatch(html,/4,5 à 4,5/);
  assert.match(panelSummaryHtml(c),/1 fiche dispose d’avis clients/);
  assert.equal(panelFacts({status:'error',competitors:c.competitors}).count,0);
  assert.equal(panelFacts({status:'success',competitors:[{reviews:'12',rating:NaN},{reviews:-1,rating:6}]}).reviews,null);
  assert.equal(panelFacts({status:'success',competitors:[{rating:0}]}).ratings,null);
});
test('les actions automatiques deviennent des puces sans perte et les personnalisations restent intactes',()=>{
  const data={...identity,priorities:defaultPriorities(identity)};
  data.automaticPriorities=structuredClone(data.priorities);
  const original=JSON.stringify(data),p=data.priorities[0],html=priorityActionsHtml(data,p,0);
  assert.match(html,/<ul class="nl-action-list">/);
  const text=[...html.matchAll(/<li>(.*?)<\/li>/g)].map(m=>m[1]).join(' ');
  assert.equal(text,p.actions);assert.equal(JSON.stringify(data),original);
  const custom={...p,actions:'Mon conseil personnalisé.\n\nGarder ce paragraphe.'};
  assert.equal(priorityActionsHtml(data,custom,0),'<p>Mon conseil personnalisé.\n\nGarder ce paragraphe.</p>');
  data.priorityOverrides=[{actions:p.actions}];
  assert.match(priorityActionsHtml(data,p,0),/^<p>/);
});

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

const vinelec={...identity,company:'Vinelec srl',activity:'Électricien',city:'Bassenge',searchCity:'Bassenge',query:'Electricien Bassenge',website:'https://www.electricitevinelec.be/'};
const vinelecPanel={status:'success',query:vinelec.query,competitors:[{name:'Belka - Solutions Electriques',reviews:29,rating:4.8},{name:'acdc elec',reviews:null,rating:null},{name:'Guintens Électricité',reviews:29,rating:5}]};
for(const count of [0,1,2,3])test(`agrégats : ${count} nombres d’avis connus, avec donnée manquante`,()=>{
  const collection={status:'success',competitors:[{reviews:null},...Array.from({length:count},()=>({reviews:29}))]};
  const facts=panelFacts(collection);
  assert.equal(facts.reviewTotal,count?29*count:null);
  assert.equal(facts.reviews?.known??0,count);
});
test('Vinelec : total 58, identité, site, activité, requête et deux fiches à 29 avis',()=>{
  const priorities=defaultPriorities(vinelec,vinelecPanel);
  validatePriorities(priorities);
  assert.equal(panelFacts(vinelecPanel).reviewTotal,58);
  assert.match(panelSummaryHtml(vinelecPanel,{indicators:true,company:vinelec.company}),/58 avis<\/strong><span>sur 2 fiches renseignées/);
  assert.match(presenceVerdictHtml({...vinelec,collection:vinelecPanel}),/cumulent 58 avis/);
  for(const text of ['Vinelec srl','Électricien','Electricien Bassenge','zone de Bassenge','3 fiches'])assert.ok(priorities[0].finding.includes(text));
  assert.match(priorities[0].finding,/Nous n’avons pas identifié/);
  assert.match(priorities[0].actions,/Google Maps.*demander sa gestion.*conditions d’éligibilité/);
  assert.ok(priorities[1].finding.includes(vinelec.website));
  assert.match(priorityActionsHtml(vinelec,priorities[1],1),/site web indiqué/);
  assert.match(priorities[2].finding,/Les 2 fiches.*affichent chacune 29 avis/);
  const summary=panelSummaryHtml(vinelecPanel,{indicators:true,company:vinelec.company});
  assert.match(summary,/4,8 à 5,0\/5/);assert.match(summary,/Vinelec srl/);
  assert.match(summary,/pas l’ensemble du marché local/);
  assert.doesNotMatch(JSON.stringify(priorities)+summary,/n’a pas de fiche|fiche n’existe|grâce à leurs avis|garantit.*clients|meilleur classement/);
});
test('constats : sans site, avis uniques, différents, nuls ou indisponibles',()=>{
  const finding=reviews=>defaultPriorities({...vinelec,website:''},{status:'success',competitors:reviews.map(reviews=>({reviews}))});
  assert.match(finding([29])[1].finding,/Aucun site web n’est renseigné pour Vinelec srl/);
  assert.doesNotMatch(finding([29])[1].finding,/https:|site.*déjà/);
  assert.match(finding([29])[2].finding,/La seule fiche.*affiche 29 avis/);
  assert.match(finding([12,null,29])[2].finding,/Les 2 fiches.*cumulent 41 avis/);
  assert.match(finding([0,null])[2].finding,/affiche 0 avis/);
  for(const reviews of [[],[null],[null,null,null]]){
    assert.match(finding(reviews)[2].finding,/n’est pas disponible/);
    assert.doesNotMatch(finding(reviews)[2].finding,/affiche.*0 avis|cumulent/);
  }
});

test('duplication sans fiche : nouvel ID, faits copiés, textes réinitialisés, source immuable et retry idempotent',async()=>{
  const h=await harness(),p=provider();try{
    let a=(await collect(h,(await h.create()).dossier)).dossier;
    a.data.priorities[0].finding='Texte réservé au dossier source.';
    a=(await save(h,a,{...a.data,reportTextValues:{'summary.general':'Introduction réservée à la source.'}})).dossier;
    a=(await h.send({action:'finalize',id:a.id,revision:a.revision})).dossier;
    const before=structuredClone(a), calls=p.calls.length, key=crypto.randomUUID();
    const request={action:'duplicate',id:a.id,idempotencyKey:key};
    const b=(await h.send(request)).dossier;
    assert.notEqual(a.id,b.id);assert.equal(b.status,'draft');assert.equal(b.revision,1);
    assert.equal(b.captureId,null);assert.equal(b.finalizedAt,null);assert.equal(b.pdfFilename,null);
    assert.equal(b.data.sourceDossierId,a.id);assert.equal(b.data.version,2);
    for(const field of Object.keys(identity))assert.equal(b.data[field],a.data[field]);
    assert.deepEqual(b.data.collection,a.data.collection);
    assert.deepEqual(b.data.reportTextOverrides,{});assert.deepEqual(b.data.priorityOverrides,[]);
    assert.deepEqual(b.data.priorities,defaultPriorities(b.data,b.data.collection));
    assert.equal((await h.send(request)).dossier.id,b.id);
    assert.equal((await h.send({action:'duplicate',id:b.id,idempotencyKey:crypto.randomUUID()})).status,409);
    b.data.priorities[1].finding='Texte réservé à la copie.';
    await save(h,b,{...b.data,reportTextValues:{'summary.general':'Introduction de la copie.'}});
    assert.deepEqual((await h.get('?id='+a.id)).dossier,before);
    assert.equal(p.calls.length,calls,'duplication et édition sans collecte');
    const list=(await h.get('')).dossiers;
    assert.equal(list.length,2);assert.ok(list.some(d=>d.id===a.id && d.status==='finalized'));
    assert.ok(list.some(d=>d.id===b.id && d.status==='draft'));
  }finally{p.restore();h.db.sqlite.close();}
});
test('overrides : introduction, titre, résumé et trois priorités persistent et restent isolés',async()=>{
  const h=await harness(),p=provider();try{
    let a=(await collect(h,(await h.create()).dossier)).dossier;
    const b=(await collect(h,(await h.create()).dossier)).dossier;
    const values={'summary.general':'Introduction personnelle\nDeuxième ligne.', 'page1.verdict_title':'Votre prochaine étape', 'page2.comparison_intro':'Résumé du panel observé.'};
    const priorities=a.data.priorities.map((item,i)=>({...item,finding:`Constat spécifique ${i+1}`,actions:`Action spécifique ${i+1}.\nAutre action.`,benefit:`Bénéfice spécifique ${i+1}`}));
    a=(await save(h,a,{...a.data,priorities,reportTextValues:values})).dossier;
    const reloaded=(await h.get('?id='+a.id)).dossier;
    assert.deepEqual(reloaded.data.priorities,priorities);
    for(const [id,value]of Object.entries(values))assert.equal(reloaded.data.reportTextOverrides[id].customText,value);
    assert.match(presenceVerdictHtml(reloaded.data),/Introduction personnelle<br>Deuxième ligne/);
    assert.match(presenceVerdictHtml(reloaded.data),/Votre prochaine étape/);
    assert.match(panelSummaryHtml(a.data.collection,{indicators:true,reportTextOverrides:a.data.reportTextOverrides}),/Résumé du panel observé/);
    assert.deepEqual((await h.get('?id='+b.id)).dossier,b);
    assert.equal(a.data.collection.observedAt,reloaded.data.collection.observedAt);
    const final=await h.send({action:'finalize',id:a.id,revision:a.revision});
    assert.deepEqual(final.dossier.data.reportTextOverrides,a.data.reportTextOverrides);
    assert.equal((await save(h,final.dossier,{...a.data,reportTextValues:{}})).status,409);
  }finally{p.restore();h.db.sqlite.close();}
});
test('overrides : suppression restaure le texte automatique, contexte changé marque À revérifier',async()=>{
  const h=await harness(),p=provider();try{
    let d=(await collect(h,(await h.create()).dossier)).dossier;
    d=(await save(h,d,{...d.data,reportTextValues:{'summary.general':'Personnalisation à conserver.'}})).dossier;
    d=(await save(h,d,{...d.data,company:'Nouvelle raison sociale'})).dossier;
    assert.equal(d.data.reportTextOverrides['summary.general'].needsReview,true);
    assert.equal(d.data.reportTextOverrides['summary.general'].customText,'Personnalisation à conserver.');
    d=(await h.get('?id='+d.id)).dossier;
    assert.equal(d.data.reportTextOverrides['summary.general'].needsReview,true);
    d=(await save(h,d,{...d.data,reportTextValues:{'summary.general':''}})).dossier;
    assert.deepEqual(d.data.reportTextOverrides,{});
    assert.match(presenceVerdictHtml(d.data),/Nouvelle raison sociale : nous n’avons pas identifié/);
    assert.doesNotMatch(presenceVerdictHtml(d.data),/Personnalisation à conserver/);
  }finally{p.restore();h.db.sqlite.close();}
});
test('overrides : champs structurels refusés, HTML échappé, limites validées sans mutation',async()=>{
  const h=await harness(),p=provider();try{
    let d=(await collect(h,(await h.create()).dossier)).dossier;
    for(const reportTextValues of [{'price':'1 €'},{'summary.general':'x'.repeat(9000)},{'summary.general':null}]){
      assert.equal((await save(h,d,{...d.data,reportTextValues})).status,400);
      assert.deepEqual((await h.get('?id='+d.id)).dossier,d);
    }
    d=(await save(h,d,{...d.data,reportTextValues:{'summary.general':'<script>alert(1)</script>'}})).dossier;
    const html=presenceVerdictHtml(d.data);
    assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
  }finally{p.restore();h.db.sqlite.close();}
});
test('nom PDF : convention classique partagée, préfixe choisi, date ISO, ville, version et normalisation',async()=>{
  const {noListingPdfFilename}=await import('../js/no-listing-model.js');
  const options={businessName:'Vinelec srl',city:'Bassenge',analysisDate:'2026-09-18',analysisVersion:1};
  const classic=globalThis.EfficiaPdfFilename.buildEfficiaPdfFilename(options);
  assert.equal(classic,'Score-Efficia_Vinelec-srl_Bassenge_2026-09-18_V1.pdf');
  assert.equal(noListingPdfFilename({...vinelec,version:1},'2026-09-18'),'Fiche-Diagnostic_Vinelec-srl_Bassenge_2026-09-18_V1.pdf');
  assert.equal(noListingPdfFilename({...vinelec,version:2},'2026-09-18'),classic.replace('Score-Efficia','Fiche-Diagnostic').replace('_V1','_V2'));
  assert.equal(noListingPdfFilename({company:'Étoile & Fils / SRL',city:'Liège',version:3},'2026-09-18T23:00:00-02:00'),'Fiche-Diagnostic_Etoile-Fils-SRL_Liege_2026-09-19_V3.pdf');
  assert.throws(()=>noListingPdfFilename(vinelec,'invalid'));
});
