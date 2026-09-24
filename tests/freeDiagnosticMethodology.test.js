import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {calculateScoreDetail} from '../functions/lib/score-efficia/scoreEngine.js';
import {GRILLE} from '../functions/lib/score-efficia/criteriaCatalog.js';
import {SCORING_VERSION} from '../functions/lib/score-efficia/scoreConfig.js';
import {reviewBenchmarkCode,reviewProblemCode,runAdminBrowserHarness} from './freeDiagnosticBrowserFixture.js';
import {selbelecDiagnosticScript} from './selbelecDiagnosticFixture.js';
const html=readFileSync(new URL('../admin/free-diagnostic-production/index.html',import.meta.url),'utf8');
function block(a,b){return html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));}
const estNombre=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
function harness(data={},states={}){
 const ctx={donneesAnalyse:data,estNombre,etatCritere:key=>states[key]||'inconnu',nEntier:Math.round,rapportSansAvis:()=>data.nbAvis===0};
 vm.runInNewContext(reviewBenchmarkCode+'\n'+reviewProblemCode+'\n'+block('function premierPasReputation(', 'const FAMILLES_PRIORITES'),ctx);
 return ctx;
}
for(const [values,median,min,max,count] of [[[96,217,551],217,96,551,3],[[1,2,9999],2,1,9999,3],[[2,3],2.5,2,3,2],[[null,12,undefined],12,12,12,1],[[0,4,8],4,0,8,3]]){
 test('médiane des volumes réellement retenus '+JSON.stringify(values),()=>{
  const data={concurrents:values.map(avis=>({avis}))};const h=harness(data);const stats=h.statistiquesAvisConcurrents();
  assert.deepEqual(JSON.parse(JSON.stringify(stats)),{median,min,max,count});
  assert.doesNotMatch(h.repereAvisConcurrents(),/moyenne|undefined|NaN|null/);
 });
}
test('benchmark absent ou périmé : aucune valeur inventée',()=>{
 for(const data of [{concurrents:[{avis:null},{avis:''}]},{concurrents:[{avis:100}],competitorQualificationStatus:'refresh_required'}])assert.equal(harness(data).statistiquesAvisConcurrents(),null);
});
test('maximums = 100, score = somme visible, poids précis préservés sur tous les profils',()=>{
 for(const profile of ['default','artisan','restaurant','commerce','professionLiberale','sante','hebergement']){
  for(let step=0;step<=10;step++){
   const answers=Object.fromEntries(GRILLE.flatMap(c=>c.criteres).map(c=>[c.key,c.max*step/10]));
   for(const notApplicableCriteria of [[],['descriptionQualite','servicesDecrits','rythmePublication']]){
    const d=calculateScoreDetail(answers,profile,SCORING_VERSION,{notApplicableCriteria});
    assert.equal(d.categories.reduce((s,c)=>s+c.maximumEffectifNormalise,0),100);
    assert.equal(d.categories.reduce((s,c)=>s+c.pointsPonderes,0),d.total);
    assert.equal(d.total,Math.round(d.categories.reduce((s,c)=>s+c.pointsPonderesPrecis,0)));
    for(const c of d.categories){assert.ok(c.pointsPonderes>=0&&c.pointsPonderes<=c.maximumEffectifNormalise);assert.ok(Math.abs(c.maximumEffectifNormalise-c.maximumEffectifNormalisePrecis)<1);}
   }
  }
 }
});
test('volume ou récence : acquisition authentique avant réponses, sans tri des clients',()=>{
 for(const key of ['volumeAvis','recenceAvis']){
  const h=harness({nbAvis:6,note:5},{[key]:'insuffisant',tauxReponseAvis:'insuffisant'});
  assert.equal(h.problemeReputation({data:h.donneesAnalyse}),key==='volumeAvis'?'volume':'recence');
  const action=h.premierPasReputation({data:h.donneesAnalyse});
  assert.match(action,/solliciter régulièrement.*tous les clients réellement servis.*sans récompense ni sélection/);
  assert.match(action,/puis répondre personnellement/);
  assert.match(h.resultatAttenduReputation({data:h.donneesAnalyse}),/Davantage d’avis récents/);
 }
});
test('réponses seules : aucune acquisition ni promesse de hausse de note',()=>{
 const h=harness({nbAvis:50,note:5},{volumeAvis:'conforme',recenceAvis:'conforme',tauxReponseAvis:'insuffisant'});
 assert.equal(h.problemeReputation({data:h.donneesAnalyse}),'reponses');
 assert.match(h.premierPasReputation({data:h.donneesAnalyse}),/Répondre personnellement/);
 assert.doesNotMatch(h.premierPasReputation({data:h.donneesAnalyse})+h.resultatAttenduReputation({data:h.donneesAnalyse}),/solliciter|collecte|nouveaux avis|remonter/);
});
test('concurrent extrême : la moyenne historique ne crée pas une acquisition contraire à la médiane affichée',()=>{
 const h=harness({nbAvis:6,note:5,concurrents:[{avis:1},{avis:2},{avis:9999}]},{volumeAvis:'insuffisant',tauxReponseAvis:'insuffisant'});
 assert.equal(h.problemeReputation({data:h.donneesAnalyse}),'reponses');
 assert.doesNotMatch(h.premierPasReputation({data:h.donneesAnalyse}),/solliciter|collecte/);
});
test('priorités : données non vérifiables exclues, description sans promesse de visibilité',()=>{
 const ctx={critereEstNonVerifiablePubliquement:()=>true,rapportSansAvis:()=>false,rapportPositionTop3:()=>false};
 vm.runInNewContext(block('function critereEligiblePourNarration(', 'function compterElementsAConfirmerRapport('),ctx);
 assert.equal(ctx.critereEligiblePourNarration({key:'descriptionRemplie'},'offre'),false);
 const source=block('function recommandationPriorite(', 'function microLivrablePriorite(');
 assert.doesNotMatch(source,/description[^.]*amélior[^.]*classement|description[^.]*remonter/iu);
});
test('filtre technique : 551 avis reste un volume, HTTP 500 reste une erreur',()=>{
 const ctx={};vm.runInNewContext(block('function normaliserTexteProspectRapport(', 'function texteEffectifRapport('),ctx);
 for(const text of ['551 avis','Entre 96 et 551 avis, médiane de 217 avis.','500 clients'])assert.equal(ctx.normaliserTexteProspectRapport(text),text);
 for(const text of ['HTTP 500','status code: 502','500','Internal Server Error'])assert.match(ctx.normaliserTexteProspectRapport(text),/erreur serveur/);
});
test('fixture Selbelec : véritable renderer quatre pages, score, priorités et liens', {skip:!existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),timeout:120000},async()=>{
 const result=await runAdminBrowserHarness(selbelecDiagnosticScript,{analysisId:'selbelec-control-fixture',overrides:[],capturePdf:Boolean(process.env.EFFICIA_CONTROL_PDF)},{timeout:110000,resultWait:100000});
 assert.equal(result.error,undefined,result.error);
 assert.equal(result.preview.length,4);assert.ok(result.layout.every(p=>p.ok));
 assert.equal(result.detail.pointsApplicables,100);assert.equal(result.detail.total,result.detail.categories.reduce((s,c)=>s+c.pointsPonderes,0));
 assert.doesNotMatch(result.preview[0],/Potentiel estimé|CONVERSION|Bonjour,/);
 assert.match(result.preview[0],/Ce qui freine les contacts/);assert.match(result.preview[0],/Électricien Bruxelles/);
 assert.match(result.preview[1],/médiane de 217 avis/);
 assert.deepEqual(result.priorities.map(p=>p.title),['Renseigner les catégories secondaires utiles','Développer les avis authentiques','Clarifier votre spécialité']);
 assert.match(result.priorities[0].action,/catégories secondaires/);assert.match(result.priorities[1].observation,/médiane de 217/);assert.match(result.priorities[1].action,/solliciter régulièrement/);
 assert.doesNotMatch(result.priorities[2].action+' '+result.priorities[2].result,/classement|position Google|visibilité/);
 for(const[offer,label]of [['audit','Recevoir mon plan d’action complet'],['visibility','Confier l’optimisation à Efficia']]){
  const link=result.links.find(l=>l.text===label);assert.ok(link,label);
  const url=new URL(link.href);assert.equal(url.pathname,'/achat');assert.equal(url.searchParams.get('offre'),offer);assert.equal(url.searchParams.get('audit'),'selbelec-control-fixture');
 }
 const pack=result.links.find(l=>new URL(l.href).searchParams.get('offre')==='visibility');
 assert.equal(pack.color,'rgb(255, 255, 255)');assert.equal(pack.background,'rgb(34, 95, 219)');
 assert.match(result.preview[3],/99 € TTC/);assert.match(result.preview[3],/349 € TTC/);
 for(const[i,page]of result.preview.entries())assert.match(page,new RegExp('Page '+(i+1)+'/4'));
 if(process.env.EFFICIA_CONTROL_PDF){
  const bytes=Buffer.from(result.pdf,'base64').toString('latin1');
  assert.equal((bytes.match(/\/Subtype \/Link/g)||[]).length,2);
  for(const link of result.links)assert.ok(bytes.includes(link.href));
  writeFileSync(process.env.EFFICIA_CONTROL_PDF,Buffer.from(result.pdf,'base64'));delete result.pdf;writeFileSync(process.env.EFFICIA_CONTROL_PDF+'.json',JSON.stringify(result,null,2));}
});
