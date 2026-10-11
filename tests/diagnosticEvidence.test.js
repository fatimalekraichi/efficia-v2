import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/diagnostic-tone-config.js';
import '../js/diagnostic-evidence.js';
const {benchmarkStatistics,normalizeEvidence,competitiveFactor,calculatePriority,lintDiagnosticText}=globalThis.EfficiaDiagnosticEvidence;
const proof=(patch={})=>({criterionId:'descriptionRemplie',field:'description',observedValue:0,source:'fiche publique',observedAt:'2026-10-10',confidence:'certain',availability:'observed',...patch});
const fact=(patch={})=>({id:'description',kind:'finding',subject:'client',polarity:'defect',text:'Votre fiche ne contient aucune description.',evidence:proof(),...patch});
test('benchmark : zéro est connu, null est inconnu ; une faible base d’avis ne supprime pas les photos',()=>{
 const b=benchmarkStatistics([{avis:0,note:null,photos:12},{avis:0,note:4,photos:8},{avis:null,note:5,photos:null}]);
 assert.equal(b.metrics.avis.median,0);assert.equal(b.metrics.avis.count,2);
 assert.equal(b.metrics.note.mean,4.5);assert.equal(b.metrics.note.weakRating,true);
 assert.equal(b.metrics.photos.mean,10);assert.equal(b.metrics.photos.count,2);
 assert.equal(benchmarkStatistics(null).count,0);
});
test('les données inconnues ne deviennent jamais zéro ou défaut confirmé',()=>{
 assert.equal(normalizeEvidence(null).confidence,'uncertain');
 assert.equal(normalizeEvidence(proof({observedValue:null})).confidence,'uncertain');
 assert.equal(normalizeEvidence(proof({source:''})).confidence,'uncertain');
 assert.equal(normalizeEvidence(proof()).observedValue,0);
});
test('importance : conversion /100 une seule fois, facteurs et majorité stricte',()=>{
 const e=proof();
 const p=calculatePriority({missingPoints:4,normalizedDomainMaximum:20,rawDomainMaximum:20,evidence:e,comparison:{clientDefect:true,leaderSatisfied:true}});
 assert.equal(p.importance,6);assert.equal(p.factor,1.5);
 assert.equal(competitiveFactor(e,{clientDefect:true,peers:[{comparable:true,satisfied:true}]}),1);
 assert.equal(competitiveFactor(e,{clientDefect:true,peers:[{comparable:true,satisfied:true},{comparable:true,satisfied:false}]}),1);
 assert.equal(competitiveFactor(e,{clientDefect:true,peers:[{comparable:true,satisfied:true},{comparable:true,satisfied:true}]}),1.5);
 assert.equal(competitiveFactor(e,{clientAbove:true}),.5);
 assert.equal(calculatePriority({missingPoints:4,normalizedDomainMaximum:20,rawDomainMaximum:20,evidence:proof({confidence:'uncertain'})}),null);
});
test('lint : constats valides, titres méthodologiques et parenthèses précises autorisés',()=>{
 assert.deepEqual(lintDiagnosticText([fact(),{id:'title',kind:'methodology',text:'Vérifications applicables (champs publics observés)'}]),[]);
 assert.deepEqual(lintDiagnosticText([fact({evidence:proof({confidence:'partial'}),text:'Aucune description dans la fiche consultée.'})]),[]);
});
for(const [rule,patch] of [
 ['placeholder',{text:'Dernier avis le [date].'}],
 ['template',{text:'Compléter les autres attributs applicables.'}],
 ['ranking-promise',{text:'Prendre la première place.'}],
 ['ambiguous-fields',{text:'Téléphone ou site web absent.'}],
 ['internal-jargon',{text:'Contrôle de récence : 0.'}],
 ['dangling-pronoun',{text:'Il ne voit aucune description.'}],
 ['certainty',{text:'La description semble absente.'}],
 ['client-rating-label',{text:'Votre note moyenne : 4,6.'}],
 ['missing-evidence',{evidence:proof({confidence:'uncertain'})}],
 ['unretrieved-field',{evidence:proof({availability:'not_retrieved'})}],
 ['partial-period',{text:'0 avis sur les 12 derniers mois.',evidence:proof({criterionId:'recenceAvis',field:'avis',complete:false})}],
])test(`lint : ${rule}`,()=>assert.ok(lintDiagnosticText([fact(patch)]).some(e=>e.rule===rule)));
test('contradictions : même champ interdit ; volume et récence documentés distincts autorisés',()=>{
 const a=fact({id:'strength',polarity:'strength'});
 assert.ok(lintDiagnosticText([a,fact()]).some(e=>e.rule==='contradiction'));
 assert.deepEqual(lintDiagnosticText([a,fact({evidence:proof({criterionId:'recenceAvis',field:'dernierAvis',observedValue:'2026-01-01'})})]),[]);
});
test('les compteurs doivent couvrir chaque contrôle exactement une fois',()=>{
 assert.deepEqual(lintDiagnosticText([],{counts:{total:4,ok:1,warn:1,ko:1,unknown:1}}),[]);
 assert.equal(lintDiagnosticText([],{counts:{total:5,ok:1,warn:1,ko:1,unknown:1}})[0].rule,'inconsistent-counts');
});

const {classifyProfile,leaderForSearch,buildDiagnosticModel}=globalThis.EfficiaDiagnosticEvidence;
const search={query:'Peintre Sarreguemines',observedAt:'2026-10-10',positionKind:'organic',location:null};
for(const [rank,code] of [[1,'A'],[2,'B'],[3,'B'],[4,'C'],[10,'C'],[11,'D'],[15,'D'],[null,'indeterminate'],[0,'indeterminate']]){
 test(`profil au rang ${rank}, indépendant de la note et du score`,()=>assert.equal(classifyProfile({position:rank,note:5,nbAvis:999,score:rank===1?12:99},[],search).code,code));
}
test('absence confirmée limitée au périmètre, rang observé sans preuve insuffisant',()=>{
 assert.equal(classifyProfile({},[],{...search,absenceConfirmed:true,scope:'20 premiers résultats'}).code,'D');
 assert.equal(classifyProfile({},[],{...search,absenceConfirmed:true}).code,'indeterminate');
 assert.equal(classifyProfile({position:2},[],{...search,positionKind:'observed'}).code,'indeterminate');
});
test('premier réel : même recherche, date et lieu ; jamais le premier élément du tableau',()=>{
 assert.equal(leaderForSearch([{rank:2,note:5}],search),null);
 const leader={rank:1,comparable:true,positionKind:'organic',query:search.query,observedAt:search.observedAt,location:null};
 assert.deepEqual(leaderForSearch([leader],search),leader);
 assert.equal(leaderForSearch([{...leader,query:'Autre requête'}],search),null);
 assert.equal(leaderForSearch([{...leader,location:'Paris'}],search),null);
});
const control=(key,value,status='ko')=>({key,label:key,status,missingPoints:4,rawDomainMaximum:10,normalizedDomainMaximum:25,evidence:proof({criterionId:key,field:key,observedValue:value})});
test('preuves inconnues exclues des priorités et décompte indépendant des actions',()=>{
 const model=buildDiagnosticModel({controls:[control('description',0),control('contact',null),control('avis',19,'ok')]});
 assert.deepEqual(model.counts,{total:3,ok:1,warn:0,ko:1,unknown:1});assert.equal(model.priorities.length,1);assert.equal(model.remainingControls,0);
});
test('volume supérieur mesuré : facteur réduit ; récence inconnue ne crée aucune exception',()=>{
 const c=control('volumeAvis',19);c.evidence.comparison={comparable:true};
 const r=buildDiagnosticModel({listing:{position:2},searchTest:search,competitors:[{avis:2},{avis:4},{avis:7}],controls:[c,control('recenceAvis',null),control('description',0)]});
 assert.equal(r.profile.code,'B');assert.equal(r.priorities[0].key,'description');assert.equal(r.priorities[1].priority.factor,.5);assert.notEqual(r.priorities[1].priority.label,'Priorité élevée');
 assert.equal(r.priorities.some(c=>c.key==='recenceAvis'),false);
});
test('absence confirmée et champ non récupéré restent distincts',()=>{
 const a=control('description',0),b=control('site',0);b.evidence.availability='not_retrieved';
 const r=buildDiagnosticModel({controls:[a,b]});assert.equal(r.counts.ko,1);assert.equal(r.counts.unknown,1);
});
test('la validation manuelle exige une preuve et ne contourne pas les autres règles',()=>{
 assert.ok(lintDiagnosticText([fact({edited:true})]).some(e=>e.rule==='unverified-edit'));
 assert.ok(lintDiagnosticText([fact({edited:true,reviewed:true,text:'Description ou horaires manquants.'})]).some(e=>e.rule==='ambiguous-fields'));
});

test('écarts B limités à deux métriques comparables du vrai premier',()=>{
 const leader={rank:1,comparable:true,positionKind:'organic',query:search.query,observedAt:search.observedAt,location:null,note:5,avis:30,photos:25,criteria:{noteMoyenne:{comparable:true},volumeAvis:{comparable:true},nombrePhotos:{comparable:true}}};
 const m=buildDiagnosticModel({listing:{position:2,note:4.6,nbAvis:19,nbPhotos:11},searchTest:search,competitors:[leader]});
 assert.equal(m.gaps.length,2);assert.deepEqual(m.gaps.map(g=>g.key),['noteMoyenne','volumeAvis']);
 assert.equal(buildDiagnosticModel({listing:{position:2},searchTest:search,competitors:[{...leader,observedAt:'2026-10-09'}]}).gaps.length,0);
});
test('comparaison incomplète, contrôles dédupliqués et objets absents',()=>{
 const m=buildDiagnosticModel({competitors:null,controls:[control('description',0),control('description',0)]});
 assert.equal(m.counts.total,1);assert.equal(m.priorities.length,1);
 assert.equal(buildDiagnosticModel({controls:null}).counts.total,0);
});
test('contradiction manuelle chiffrée interdite même après validation',()=>{
 const errors=lintDiagnosticText([fact({text:'Description : 42 caractères.',edited:true,reviewed:true})]);
 assert.ok(errors.some(e=>e.rule==='unsupported-value'));
});

test('observed exige une preuve explicite de recherche organique pour le profil A',()=>{
 const E=globalThis.EfficiaDiagnosticEvidence;
 assert.equal(E.classifyProfile({},[],{...search,rank:1,positionKind:'observed',rankEvidence:{organicResultsOnly:true}}).code,'A');
 assert.equal(E.classifyProfile({},[],{...search,rank:1,positionKind:'observed',rankEvidence:{source:'provider_result_index_zero_based'},sponsoredResultsExcluded:0}).code,'indeterminate');
});
test('lieu : priorité au lieu réel, sinon ville de geographicAnchor',()=>{
 const E=globalThis.EfficiaDiagnosticEvidence,anchor={label:'Sarreguemines, France',locality:{city:'Sarreguemines'}};
 assert.equal(E.searchLocation(null,anchor),'Sarreguemines');assert.equal(E.searchLocation('Metz',anchor),'Metz');
 assert.equal(E.clientDate('2026-10-11T01:53:43.833Z'),'11/10/2026');
});
for(const text of ['https://maps.google.com','www.example.com','2026-10-11T01:53:43Z','Donnée renseignée dans le diagnostic','Partiel','Certain','Observation partielle','Description : 0']){
 test('lint client bloque '+text,()=>assert.ok(lintDiagnosticText([{id:'client',kind:'copy',text}]).some(e=>e.rule==='technical-client-copy')));
}
test('réponse opérateur : ferme, intervalle, indisponible ; métadonnées internes conservées',()=>{
 const E=globalThis.EfficiaDiagnosticEvidence;
 const proof=E.operatorEvidence({criterionId:'descriptionRemplie',field:'description',answer:'Vide',observedAt:'2026-10-11',url:'https://maps.google.com',operator:'Opérateur local'});
 assert.equal(proof.confidence,'certain');assert.equal(proof.source,"Fiche Google publique consultée par l'opérateur");assert.equal(E.normalizeEvidence(proof).url,'https://maps.google.com');
 assert.equal(E.operatorEvidence({answer:'1 à 6 mois'}).confidence,'partial');
 assert.equal(E.operatorEvidence({answer:'Non vérifiable'}).confidence,'uncertain');
 assert.equal(E.operatorEvidence({}).confidence,'uncertain');
});
