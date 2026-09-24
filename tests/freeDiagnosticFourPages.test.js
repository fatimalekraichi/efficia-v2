import test from 'node:test';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {runAdminBrowserHarness} from './freeDiagnosticBrowserFixture.js';
import {selbelecRealScript,selbelecRealSnapshot as snapshot} from './selbelecRealSnapshotFixture.js';

test('snapshot réel Selbelec : quatre pages, score inchangé et frontière commerciale', {timeout:120000},async()=>{
 const a=snapshot.answers;
 const r=await runAdminBrowserHarness(selbelecRealScript,{analysisId:snapshot.analysisId,answers:a,overrides:snapshot.overrides,capturePdf:Boolean(process.env.EFFICIA_REAL_PDF),context:{company:'Selbelec',city:a.fields['p-ville'],activity:a.fields['p-activite'],scoringVersion:a.scoreSnapshot.scoringVersion,collectionAvailable:false,premiumAllowed:false}},{timeout:110000,resultWait:100000});
 assert.equal(r.error,undefined,r.error);
 if(process.env.EFFICIA_REAL_PDF&&r.pdf){writeFileSync(process.env.EFFICIA_REAL_PDF,Buffer.from(r.pdf,'base64'));delete r.pdf;writeFileSync(process.env.EFFICIA_REAL_PDF+'.json',JSON.stringify(r,null,2));}
 assert.equal(r.preview.length,4);assert.equal(r.validatedLayout.ok,true,JSON.stringify(r.validatedLayout));assert.ok(r.layout.every(p=>p.ok),JSON.stringify(r.layout));
 assert.equal(r.detail.total,29);assert.equal(r.detail.pointsApplicables,100);
 assert.equal(r.detail.categories.reduce((s,c)=>s+c.pointsPonderes,0),29);
 assert.equal(r.detail.categories.reduce((s,c)=>s+c.maximumEffectifNormalise,0),100);
 for(const[k,v]of Object.entries(a.responses))assert.equal(r.responses[k]?.points,v.points,k);
 assert.deepEqual(r.observed.concurrents,a.observedData.concurrents);
 assert.match(r.preview[1],/médiane de 94 avis/);assert.match(r.preview[1],/43 et 726/);assert.ok(r.representatives<=3);
 assert.match(r.primary,/Renseigner les catégories secondaires utiles/);assert.match(r.primary,/Premier pas[\s\S]*catégories/i);assert.doesNotMatch(r.primary,/solliciter|répondre.*avis|clients satisfaits/i);
 assert.equal(r.secondary.length,2);
 for(const p of r.secondary){assert.match(p,/Constat/i);assert.match(p,/Conséquence/i);assert.match(p,/La marche à suivre complète et les actions recommandées sont détaillées dans l’Audit Efficia™/);assert.doesNotMatch(p,/Premier pas|Résultat attendu|solliciter régulièrement|puis répondre|Présenter plus clairement les prestations/i);}
 assert.match(r.preview[2],/11 autres points ont été détectés/);
 assert.match(r.preview[3],/99 € TTC/);assert.match(r.preview[3],/349 € TTC/);assert.match(r.preview[3],/Les 99 € de l’audit sont déduits du Pack Visibilité commandé dans les 30 jours/);
 assert.match(r.preview[3],/Audit inclus/);assert.match(r.preview[3],/Paiement unique, sans abonnement/);assert.match(r.preview[3],/valider avant toute publication/);
 assert.doesNotMatch(r.preview.join('\n'),/499|Pack Performance|Concurrent 1|médiane de 217/);
 for(const[i,p]of r.preview.entries())assert.match(p,new RegExp('Page '+(i+1)+'/4'));
 assert.equal(r.links.length,2);assert.deepEqual(r.links.map(l=>new URL(l.href).searchParams.get('offre')),['audit','visibility']);
 for(const l of r.links)assert.equal(new URL(l.href).searchParams.get('audit'),snapshot.analysisId);
});

function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
test('le snapshot réel finalisé et ses réponses restent identiques à la source récupérée',()=>{
 assert.equal(snapshot.snapshotId,'338a92e2-b751-43b8-84dc-d8402c447aaa');
 assert.equal(snapshot.finalizedAt,'2026-09-24T13:34:45.187Z');
 assert.equal(createHash('sha256').update(JSON.stringify(canonical(snapshot.answers))).digest('hex'),'8da80974b4af63d43b4a6776021ebb39a4f8e335bc8a83b3cb9a1c7f00c04b2b');
});
test('les autres points restent dynamiques, sans constante Selbelec dans le renderer',()=>{
 const html=readFileSync(new URL('../admin/free-diagnostic-production/index.html',import.meta.url),'utf8');
 const start=html.indexOf('function compteursPrioritesPage5('),end=html.indexOf('function prioriteInfosRevendiquee(',start);
 const context={};vm.runInNewContext(html.slice(start,end),context);
 for(const[total,presented,expected]of [[14,3,11],[6,3,3],[1,1,0],[0,0,0]])assert.equal(context.compteursPrioritesPage5(total,presented).restants,expected);
 assert.match(html,/\$\{compteursPriorites.restants\} autre/);
 assert.doesNotMatch(html,/11 autres points ont été détectés/);
});
