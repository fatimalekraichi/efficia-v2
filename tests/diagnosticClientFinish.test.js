import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/diagnostic-tone-config.js';
import '../js/diagnostic-evidence.js';
import '../js/diagnostic-report.js';
const E=globalThis.EfficiaDiagnosticEvidence,R=globalThis.EfficiaDiagnosticReport;
const search={rank:1,positionKind:'observed',query:'Peintre en bâtiment Sarreguemines',observedAt:'2026-10-11T01:53:43Z',location:'Sarreguemines'};
const evidence=(key,value)=>({criterionId:key,field:key,observedValue:value,source:'Fiche Google publique',observedAt:'2026-10-11',confidence:'certain'});
const control=(key,value,status='ok')=>({key,status,evidence:evidence(key,value),missingPoints:status==='ok'?0:4,rawDomainMaximum:20,normalizedDomainMaximum:20});
const controls=[control('noteMoyenne',4.6),control('volumeAvis',19),control('tauxReponseAvis','Rarement / jamais','ko'),control('descriptionRemplie',0,'ko'),control('horaires','Horaires habituels non renseignés','ko')];
function render(confirmed=false,extra=[]){
 const searchTest={...search,...(confirmed?{organicConfirmation:E.confirmOrganicRank(search,true,'2026-10-11')}:{})};
 const model=E.buildDiagnosticModel({searchTest,controls:[...controls,...extra],competitors:[{note:4.8,avis:4},{note:4.1,avis:7},{note:3.5,avis:2}]});
 return R.renderDiagnostic({model,score:60,searchTest,identity:{company:'Sarland',facts:{Note:4.6,'Nombre d’avis':19}},domains:[{key:'photos',label:'Photos',points:17,maximum:17}]});
}
test('confirmation organique datée, révocable et liée au test',()=>{
 const organicConfirmation=E.confirmOrganicRank(search,true,'2026-10-11');
 assert.equal(organicConfirmation.confidence,'certain');assert.equal(E.classifyProfile({},[],{...search,organicConfirmation}).code,'A');
 for(const patch of [{query:'Autre'},{rank:2},{location:'Metz'},{observedAt:'2026-10-11T02:00:00Z'}])assert.equal(E.organicConfirmationMatches({...search,...patch,organicConfirmation}),false);
 for(const day of [null,'2999-01-01','2026-10-09'])assert.equal(E.organicConfirmationMatches({...search,organicConfirmation:E.confirmOrganicRank(search,true,day)}),false);
 assert.equal(E.organicConfirmationMatches({...search,organicConfirmation:E.confirmOrganicRank(search,false,'2026-10-11')}),false);
});
test('sans coche aucun badge ; avec coche profil A ; aucun vocabulaire défensif',()=>{
 const off=render(),on=render(true);
 assert.deepEqual(off.errors,[]);assert.deepEqual(on.errors,[]);
 assert.doesNotMatch(off.html,/profile-badge|Profil indéterminé|type de classement|annonce/i);
 assert.match(off.html,/1er résultat sur « Peintre en bâtiment Sarreguemines »/);
 assert.match(on.html,/Profil A/);assert.match(on.html,/Votre fiche est en tête sur cette recherche/);
});
test('page 1 : chaque chiffre une seule fois, repères et une source par section',()=>{
 const r=render();const page=r.html.split('data-report-page="2"')[0];
 assert.match(page,/Note supérieure à la moyenne locale/);
 assert.match(page,/Près de 5 fois plus d&#39;avis que la fiche médiane/);
 assert.equal((page.match(/Constaté sur votre fiche Google le 11\/10\/2026/g)||[]).length,0);
 assert.equal((page.match(/1er résultat/g)||[]).length,1);
});
for(const text of ['Les absences de données ne valent pas zéro','ajustés seulement lorsqu’une comparaison est documentée','Le classement des actions ne modifie pas le score','Les données non vérifiables ne constituent pas des défauts','Profil indéterminé','Les annonces ne sont pas distinguées']){
 test('lint défensif : '+text,()=>assert.ok(E.lintDiagnosticText([{text}]).some(e=>e.rule==='defensive-client-copy')));
}
test('constat réponses : décompte complet, échantillon, absence certaine et intervalle',()=>{
 for(const [value,counts,expected] of [
 ['Rarement / jamais',null,'Des avis récents restent sans réponse.'],
 ['Jamais',null,'Aucune réponse visible aux avis récents.'],
 ['Mesure',{total:19,unanswered:12,complete:true},'12 de vos 19 avis sans réponse.'],
 ['Mesure',{total:10,unanswered:7,complete:false},'Sur les 10 avis examinés, 7 restent sans réponse.']]){
  const c=control('tauxReponseAvis',value,'ko');c.evidence.reviewCounts=counts;
  const model=E.buildDiagnosticModel({controls:[c]});const r=R.renderDiagnostic({model,score:60});
  assert.equal(r.blocks.find(b=>b.id==='priority.1.observation').text,expected);assert.deepEqual(r.errors,[]);
 }
 for(const text of ['Rarement ou jamais','Des avis contrôlés restent sans réponse'])assert.ok(E.lintDiagnosticText([{kind:'finding',text,evidence:evidence('tauxReponseAvis','Rarement / jamais')}]).some(e=>e.rule==='review-response-copy'));
});
test('page 2, liste max 7 titres connus, priorités de même classe',()=>{
 const extras=['attributs','categoriesSecondaires','contact','servicesPresents','questionsReponses','publicationRecente','recenceAvis','varietePhotos'].map(k=>control(k,'À compléter','warn'));
 const r=render(false,extras);assert.deepEqual(r.errors,[]);
 assert.match(r.html,/Ce que nous avons vérifié/);assert.match(r.html,/Variété, qualité et récence, au-delà du nombre/);
 assert.match(r.html,/Comparaison indicative sur 3 fiches proches/);
 assert.equal((r.html.match(/class="v5-priority /g)||[]).length,3);
 assert.equal(r.blocks.filter(b=>/^page3\.other\.\d+$/.test(b.id)).length,0);
 assert.doesNotMatch(r.html,/autres points détaillés|points restent à vérifier/);
});
