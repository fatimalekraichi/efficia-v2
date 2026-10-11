import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/diagnostic-tone-config.js';
import '../js/diagnostic-evidence.js';
import '../js/diagnostic-report.js';
import {runAdminBrowserHarness} from './freeDiagnosticBrowserFixture.js';
import {selbelecDiagnosticScript} from './selbelecDiagnosticFixture.js';
const E=globalThis.EfficiaDiagnosticEvidence,R=globalThis.EfficiaDiagnosticReport;
function sample(count=4,median=4){
 const controls=Array.from({length:count},(_,i)=>({key:['descriptionRemplie','horaires','contact','attributs','servicesPresents'][i],status:'ko',evidence:{criterionId:['descriptionRemplie','horaires','contact','attributs','servicesPresents'][i],field:'champ public',observedValue:'À compléter',source:'Opérateur',observedAt:'2026-10-11',confidence:'certain'},missingPoints:4,rawDomainMaximum:20,normalizedDomainMaximum:20}));
 for(const [key,value]of [['noteMoyenne',4.6],['volumeAvis',19]])controls.push({key,status:'ok',evidence:{criterionId:key,field:key,observedValue:value,source:'Collecte',observedAt:'2026-10-11',confidence:'certain'}});
 return E.buildDiagnosticModel({listing:{note:4.6,nbAvis:19},controls,competitors:[{note:4,avis:median}]});
}
const render=(model,extra={})=>R.renderDiagnostic({model,score:60,identity:{company:'Entreprise & Fils'},searchTest:{observedAt:'2025-02-03'},...extra});
test('teaser calculé avec uniquement défauts et points à renforcer, conditionnel et sans liste',()=>{
 for(const count of [0,1,3,4,5]){
  const model=sample(count);const r=render(model);assert.deepEqual(r.errors,[]);
  const rest=model.counts.ko+model.counts.warn-model.priorities.length;
  assert.equal(r.html.includes('class="audit-teaser"'),rest>=1);
  if(rest>=1)assert.match(r.blocks.find(b=>b.id==='page2.teaser_title').text,new RegExp('^'+rest+' autres points'));
 }
});
test('comparaisons dérivées vérifiées, ratio non affiché pour médiane zéro ou ratio inférieur à 2',()=>{
 for(const median of [0,4,15]){
  const r=render(sample(0,median));assert.deepEqual(r.errors,[]);
  const strengths=r.blocks.filter(b=>b.id.startsWith('page1.strength.'));
  assert.equal(strengths.some(b=>b.text.includes('Près de 5')),median===4);
  if(median>=3)assert.ok(strengths.some(b=>b.text==='Note supérieure à la moyenne locale'));
  const ratio=strengths.find(b=>b.comparison==='review-ratio');
  if(ratio)assert.ok(E.lintDiagnosticText([{...ratio,text:'Près de 99 fois plus d\'avis que la fiche médiane'}],{benchmark:sample(0,4).benchmark}).some(e=>e.rule==='unsupported-value'));
 }
});
test('date de conformité dynamique et lien WhatsApp encodé, repli si configuration absente',()=>{
 const r=render(sample(),{contact:{whatsapp:'+33 6 00 00 00 00'}});
 assert.match(r.html,/Nous préparons les optimisations, puis nous vous les soumettons pour validation avant toute publication\./);
 assert.match(r.html,/03\/02\/2025/);assert.doesNotMatch(r.html,/6 septembre 2026/);
 assert.match(r.html,/https:\/\/wa.me\/33600000000\?text=Bonjour%2C/);
 assert.match(r.html,/Entreprise%20%26%20Fils/);
 assert.doesNotMatch(render(sample()).html,/wa.me|>WhatsApp</);
 assert.match(render(sample()).html,/Répondez simplement à l'e-mail\./);
});
test('export jsPDF : Audit, Pack et WhatsApp sont trois annotations de lien',{timeout:120000},async()=>{
 const r=await runAdminBrowserHarness("CONFIG.contact={whatsapp:'33600000000'};"+selbelecDiagnosticScript,{analysisId:'v5-link-test',overrides:[],capturePdf:true},{timeout:110000,resultWait:100000});
 assert.equal(r.error,undefined,r.error);
 const bytes=Buffer.from(r.pdf,'base64').toString('latin1');
 assert.equal((bytes.match(/\/Subtype \/Link/g)||[]).length,3);
 assert.equal(r.links.length,3);
 for(const link of r.links)assert.ok(bytes.includes(link.href),link.href);
 assert.ok(r.links.some(l=>l.text==='Je veux savoir quoi corriger en premier'));
 assert.ok(r.links.some(l=>l.text==='Optimiser ma fiche maintenant'));
 const wa=r.links.find(l=>l.text==='WhatsApp');assert.ok(wa);assert.match(new URL(wa.href).searchParams.get('text'),/^Bonjour, j'ai reçu le Diagnostic Efficia pour/);
});
