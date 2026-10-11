import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../js/diagnostic-tone-config.js';
import '../js/diagnostic-evidence.js';
import '../js/diagnostic-report.js';
const E=globalThis.EfficiaDiagnosticEvidence,R=globalThis.EfficiaDiagnosticReport;
const proof=(key,value)=>({criterionId:key,field:key,observedValue:value,source:'Contrôle public',observedAt:'2026-10-11',confidence:'certain'});
const controls=[['tauxReponseAvis','Rarement / jamais',10],['descriptionRemplie',0,5],['horaires','Horaires habituels non renseignés',4]].map(([key,value,missingPoints])=>({key,status:'ko',evidence:proof(key,value),missingPoints,rawDomainMaximum:20,normalizedDomainMaximum:20}));
const search={rank:1,positionKind:'observed',query:'Peintre en bâtiment Sarreguemines',observedAt:'2026-10-11T01:53:43Z',location:'Sarreguemines'};
function render(activity='Peintre en bâtiment',confirmed=false){
 const searchTest={...search,...(confirmed?{organicConfirmation:E.confirmOrganicRank(search,true,'2026-10-11')}:{})};
 const model=E.buildDiagnosticModel({controls,searchTest});
 const before=JSON.stringify(model);
 const r=R.renderDiagnostic({model,score:60,searchTest,identity:{company:'Peinture Sarland',activity}});
 assert.equal(JSON.stringify(model),before);assert.deepEqual(r.errors,[]);return r;
}
test('3 pages, date en tête et conformité dynamique, sans compte des non vérifiables dans les deux variantes',()=>{
 for(const confirmed of [false,true]){
  const r=render(undefined,confirmed);
  assert.equal((r.html.match(/data-report-page=/g)||[]).length,3);
  assert.equal((r.html.match(/11\/10\/2026/g)||[]).length,2);
  assert.match(r.html,/Diagnostic réalisé le 11\/10\/2026 · Recherche « Peintre en bâtiment Sarreguemines » centrée sur Sarreguemines/);
  assert.doesNotMatch(r.html,/Constaté sur|autres points détaillés|points restent à vérifier|marche à suivre détaillée/i);
  assert.equal(r.html.includes('Profil A'),confirmed);
 }
});
test('modèles prêts à compléter, entreprise automatique, vocabulaire éditorial du secteur',()=>{
 for(const [activity,term]of [['Peintre en bâtiment','chantier'],['Consultant','prestation']]){
  const r=render(activity);const examples=r.blocks.filter(b=>b.id.startsWith('priority.1.example'));
  assert.equal(examples.length,2);
  assert.match(examples[0].text,new RegExp('\\['+term+'\\]'));
  for(const e of examples){assert.match(e.text,/\[Prénom\]/);assert.match(e.text,/\[Signataire\], Peinture Sarland/);}
  assert.match(examples[1].text,/\[point soulevé\]/);assert.match(examples[1].text,/\[téléphone\]/);
 }
 assert.ok(E.lintDiagnosticText([{text:'[date]'}]).some(e=>e.rule==='placeholder'));
});
test('priorités secondaires : une seule phrase combinée, titre et aucun détail supplémentaire',()=>{
 const r=render();
 assert.equal(r.blocks.find(b=>b.id==='priority.2.observation').text,'Aucune description : présentez vos services et votre zone d’intervention en quelques phrases.');
 assert.equal(r.blocks.find(b=>b.id==='priority.3.observation').text,'Aucun horaire affiché : renseignez vos horaires habituels et ceux des jours fériés.');
 assert.equal(r.blocks.filter(b=>/^priority\.[23]\.first_action$/.test(b.id)).length,0);
 const css=readFileSync(new URL('../admin/free-diagnostic-production/index.html',import.meta.url),'utf8');
 assert.match(css,/\.domain-grid\{display:grid;grid-template-columns:1fr 1fr/);
});
