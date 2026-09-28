import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {calculateScoreDetail} from '../functions/lib/score-efficia/scoreEngine.js';
import {SCORING_VERSION} from '../functions/lib/score-efficia/scoreConfig.js';
import {GRILLE} from '../functions/lib/score-efficia/criteriaCatalog.js';

const source = readFileSync(new URL('../admin/free-diagnostic-production/index.html', import.meta.url), 'utf8');
function block(start, end) {
 const from=source.indexOf(start), to=source.indexOf(end,from+start.length);
 assert.ok(from>=0 && to>from,start);
 return source.slice(from,to);
}
const benchmark=block('function statistiquesAvisConcurrents(', 'function texteConsultantPage1(');
const selection=block('const FAMILLES_PRIORITES =', 'function contexteRapport(');
function harness(data, recent=true) {
 const ctx={donneesAnalyse:data, CONFIG:{tempsTaches:{},seuils:{toleranceConcurrents:0.1}},
 estNombre:v=>v!==null && v!==undefined && v!=='' && Number.isFinite(Number(v)),
 estTexte:v=>typeof v==='string' && v.trim()!=='', libelleRechercheRapport:v=>v,
 etatCritere:key=>key==='photoRecente' && recent?'conforme':'insuffisant',
 critereEligiblePourNarration:()=>true, detailsPriorite:()=>({action:'Action normale'}),
 localisationNonVerifiablePubliquement:()=>false,
 actionPhotosPriorite:()=>'', premierPasInfos:()=>'', rapportSansAvis:()=>false,
 choisirVarianteNarrative:(_id,_branch,variants)=>variants[0],
 contexteRapport:()=>({data}),
 niveauImpactPriorite:()=>({label:'Impact élevé',couleur:'#000',fond:'#fff'}),
 titrePriorite:()=> 'Développer les avis authentiques',
 constatObservePriorite:()=> 'Constat normal', consequenceBusinessPriorite:()=> 'Conséquence normale',
 resultatAttenduPriorite:()=> 'Résultat normal', microLivrablePriorite:()=> {throw Error('modèle gratuit interdit');},
 textePublicationDiagnostic:(_id,text)=>text};
 vm.runInNewContext(benchmark+'\n'+block('function problemeReputation(', 'const FAMILLES_PRIORITES')+'\n'+selection+'\n'+block('function narrationPrioriteV3(', 'function rendrePrioriteV3Principale('), ctx);
 return ctx;
}
const candidate=(key,max=5)=>({critere:{key,max,q:key},points:0,perdu:max});
const candidates=[candidate('categoriesSecondaires'),candidate('volumeAvis'),candidate('descriptionRemplie')];
const data=(nbAvis=0)=>({nbAvis,position:7,derniereRequeteAnalysee:'Menuisier Namur',concurrents:[{avis:5},{avis:10},{avis:20}]});
const order=h=>Array.from(h.selectionnerPrioritesDynamiques(candidates),p=>p.famille);

test('zéro avis confirmé et panel exploitable : réputation en premier, sans doublon ni perte',()=>{
 const h=harness(data());
 assert.deepEqual(order(h),['reputation','visibilite','offre']);
 assert.equal(new Set(order(h)).size,3);
 assert.deepEqual(new Set(order(h)),new Set(order(harness(data(4)))));
 assert.equal(h.avisPrioritairesPourConfiance(data('0')),true);
});
for(const value of [null,undefined,'',' ',false,NaN,'inconnu'])test(`avis inconnus (${String(value)}) : aucune promotion ni verdict zéro`,()=>{
 const h=harness({...data(),nbAvis:value});
 assert.equal(h.avisPrioritairesPourConfiance(),false);
 assert.equal(h.verdictConfianceDiagnostic(),null);
 assert.equal(order(h)[0],'visibilite');
});
test('avis existants : hiérarchisation habituelle',()=>{
 assert.deepEqual(order(harness(data(4))),['visibilite','reputation','offre']);
});
test('avis existants : narration et exemple habituels restent inchangés',()=>{
 const h=harness(data(4));h.microLivrablePriorite=()=> 'Exemple existant';
 const n=h.narrationPrioriteV3({famille:'reputation'},0);
 assert.equal(n.observation,'Constat normal');assert.equal(n.client,'Conséquence normale');
 assert.equal(n.action,'Action normale');assert.equal(n.result,'Résultat normal');
 assert.equal(n.example,'Exemple existant');
});
test('panel absent, sans volume connu, sans avis ou périmé : pas de promotion',()=>{
 for(const extra of [{concurrents:[]},{concurrents:[{avis:null}]},{concurrents:[{avis:0},{avis:0}]},{competitorQualificationStatus:'refresh_required'}]){
 const h=harness({...data(),...extra});assert.equal(h.avisPrioritairesPourConfiance(),false);assert.equal(order(h)[0],'visibilite');
 }
});
test('panel partiel exploitable : un volume positif connu suffit, sans inventer les absents',()=>{
 const h=harness({...data(),concurrents:[{avis:null},{avis:8}]});
 assert.equal(h.avisPrioritairesPourConfiance(),true);
 assert.equal(h.statistiquesAvisConcurrents().median,8);
});
test('la réputation entre dans les trois premières même si son score narratif la plaçait quatrième',()=>{
 const h=harness(data());
 const four=[candidate('categoriesSecondaires'),candidate('volumeAvis',1),candidate('descriptionRemplie'),candidate('contact',20)];
 assert.ok(!harness(data(4)).selectionnerPrioritesDynamiques(four).some(p=>p.famille==='reputation'));
 const result=h.selectionnerPrioritesDynamiques(four);
 assert.equal(result.length,3);assert.equal(result[0].famille,'reputation');
 assert.equal(new Set(Array.from(result,p=>p.famille)).size,3);
});
test('score réel, pondérations, réponses et données restent strictement identiques',()=>{
 const d=data();const h=harness(d);
 const responses=Object.fromEntries(GRILLE.flatMap(c=>c.criteres).map((c,i)=>[c.key,i%2?c.max:0]));
 const before=calculateScoreDetail(responses,'default',SCORING_VERSION);
 const preserved=JSON.stringify({d,responses,candidates});
 order(h);h.verdictConfianceDiagnostic();h.narrationPrioriteV3({famille:'reputation'},0);
 assert.equal(JSON.stringify({d,responses,candidates}),preserved);
 assert.deepEqual(calculateScoreDetail(responses,'default',SCORING_VERSION),before);
});
test('verdict contextualisé : requête effectivement analysée, position, médiane et photos confirmées',()=>{
 const h=harness({...data(),requeteTestee:'Requête non retenue'});const v=h.verdictConfianceDiagnostic();
 assert.equal(v.titre,'Votre fiche est présente, mais l’absence d’avis peut freiner la confiance.');
 assert.equal(v.texte,'Lors de notre test sur « Menuisier Namur », votre fiche apparaît en 7e position. Ses photos récentes constituent une bonne base, mais elle ne présente encore aucun avis client, alors que les fiches comparées en comptent 10 en médiane. Pour un prospect qui ne connaît pas encore votre entreprise, ce manque de retours peut peser au moment de choisir qui contacter.');
});
test('verdict sans position, sans benchmark ni photos récentes : formulation prudente',()=>{
 const h=harness({...data(),position:null,concurrents:[]},false);const v=h.verdictConfianceDiagnostic();
 assert.match(v.texte,/position.*reste à confirmer/);
 assert.match(v.texte,/nombre d’avis des fiches comparées n’a pas pu être établi/);
 assert.doesNotMatch(v.texte,/photos récentes|0e|médiane|undefined|NaN|null/);
});
test('position zéro, première position et médiane décimale sont distinguées',()=>{
 assert.match(harness({...data(),position:0}).verdictConfianceDiagnostic().texte,/n’a pas été détectée/);
 const v=harness({...data(),position:1,concurrents:[{avis:2},{avis:3}]}).verdictConfianceDiagnostic();
 assert.match(v.texte,/1re position/);assert.match(v.texte,/2,5 en médiane/);
});
test('priorité gratuite complète : première étape limitée, résultat sans promesse, aucun modèle de message',()=>{
 const n=harness(data()).narrationPrioriteV3({famille:'reputation'},0);
 assert.equal(n.observation,'Votre fiche ne présente encore aucun avis client, alors que les entreprises comparées en comptent 10 en médiane.');
 assert.equal(n.client,'Un prospect qui ne connaît pas encore votre entreprise dispose de moins de preuves pour se rassurer et vous choisir.');
 assert.equal(n.action,'Mettre en place une demande d’avis simple et conforme auprès de chaque client réellement servi.');
 assert.equal(n.result,'Faire apparaître progressivement des retours authentiques qui aident les futurs clients à évaluer votre entreprise.');
 assert.equal(n.example,'');
 assert.equal(harness({...data(),concurrents:[]}).narrationPrioriteV3({famille:'reputation'},0).observation,'Votre fiche ne présente encore aucun avis client.');
});
test('aucune identité de dossier codée en dur et branche branchée dans le vrai renderer',()=>{
 const changed=benchmark+selection+block('function narrationPrioriteV3(', 'function rendrePrioriteV3Principale(');
 assert.doesNotMatch(changed,/jd\s*b[aâ]timent|virton|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}/i);
 assert.match(source,/const verdictConfiance = verdictConfianceDiagnostic\(\)/);
 assert.match(source,/verdictConfiance \? escapeHtml\(verdictConfiance.texte\)/);
 assert.match(source,/verdictConfiance\?\.titre \|\| phraseScore.texte/);
});
