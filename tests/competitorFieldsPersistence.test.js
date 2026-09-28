import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../admin/free-diagnostic-production/index.html',import.meta.url),'utf8');
const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
function state(competitors){
 const fields=Object.fromEntries([1,2,3].flatMap(i=>['nom','note','avis','photos','services','pubs'].map(k=>['dc-'+k+'-'+i,{value:''}])));
 const ctx={document:{getElementById:id=>fields[id]},donneesAnalyse:{concurrents:structuredClone(competitors),competitorQualificationStatus:'qualified',moyennesConcurrents:{photos:97},concurrence:{preserved:true}},actualiserPanneauConcurrentsQualifies(){},neutraliserPanelConcurrentielHistorique:()=>false,CONFIG:{seuils:{toleranceConcurrents:0.1}}};
 vm.createContext(ctx);vm.runInContext(slice('function estNombre','function calculerPotentielInterne')+slice('const CHAMPS_CONCURRENT','function appliquerChampsBrouillonD1')+slice('function lireChampNum','function synchroniserDonneesManuelles')+slice('function synchroniserConcurrentsManuels','function preRemplirDonneesObservees'),ctx);
 return {ctx,fields};
}
for(const count of [1,2,3])test(`preserves ${count} competitors, metadata and numeric types without recalculation`,()=>{
 const competitors=Array.from({length:count},(_,i)=>({label:'Entreprise '+i,note:4.8,avis:i?94:0,photos:0,services:null,pubs:'unknown',place_id:'place-'+i,website:'https://example.invalid',status:'not_verifiable'}));
 const {ctx}=state(competitors),before=JSON.stringify(ctx.donneesAnalyse);
 for(let cycle=0;cycle<3;cycle++){ctx.restaurerChampsConcurrents();ctx.synchroniserConcurrentsManuels();assert.equal(JSON.stringify(ctx.donneesAnalyse),before);}
});
test('legacy absent, null, empty and unknown stay distinct; zero stays visible',()=>{
 const {ctx,fields}=state([{label:'Legacy',avis:0,photos:null,services:'',pubs:'not_verifiable'}]);
 ctx.restaurerChampsConcurrents();assert.equal(fields['dc-avis-1'].value,'0');assert.equal(fields['dc-note-1'].value,'');assert.equal(fields['dc-pubs-1'].value,'not_verifiable');
 ctx.synchroniserConcurrentsManuels();const c=ctx.donneesAnalyse.concurrents[0];assert.equal(Object.hasOwn(c,'note'),false);assert.equal(c.photos,null);assert.equal(c.services,'');assert.equal(c.pubs,'not_verifiable');
});
test('explicit saved empty wins over model; decimal comma and all six raw fields survive',()=>{
 const {ctx,fields}=state([{label:'Original',note:4.8,avis:6,photos:5}]);
 ctx.restaurerChampsConcurrents({'dc-nom-1':'Manual','dc-note-1':'4,8','dc-photos-1':'','dc-avis-1':'0'});
 ctx.synchroniserConcurrentsManuels();assert.equal(ctx.donneesAnalyse.concurrents[0].label,'Manual');assert.equal(ctx.donneesAnalyse.concurrents[0].note,4.8);assert.equal(ctx.donneesAnalyse.concurrents[0].avis,0);assert.equal(ctx.donneesAnalyse.concurrents[0].photos,null);
 const saved=ctx.champsBrouillonD1();assert.equal(saved['dc-note-1'],'4,8');assert.equal(saved['dc-photos-1'],'');assert.equal(Object.keys(saved).filter(k=>k.startsWith('dc-')).length,18);
 fields['dc-pubs-1'].value='0';ctx.synchroniserConcurrentsManuels();assert.equal(ctx.donneesAnalyse.concurrents[0].pubs,0);
});
test('refresh-required panel cannot be resurrected by saved fields',()=>{
 const {ctx,fields}=state([{label:'Obsolete',avis:99}]);ctx.donneesAnalyse.competitorQualificationStatus='refresh_required';ctx.restaurerChampsConcurrents({'dc-avis-1':'99'});assert.ok(Object.values(fields).every(f=>f.value===''));
});

test('editing a restored panel retains known-only means; absent metrics never become zero',()=>{
 const {ctx,fields}=state([{label:'A',note:4.8,avis:0,photos:0},{label:'B',note:4.8,avis:100,photos:50},{label:'C',note:null,avis:null,photos:null}]);
 ctx.restaurerChampsConcurrents();fields['dc-note-1'].value='4,6';ctx.synchroniserConcurrentsManuels();
 assert.equal(ctx.donneesAnalyse.moyennesConcurrents.note,4.699999999999999);
 assert.equal(ctx.donneesAnalyse.moyennesConcurrents.avis,50);assert.equal(ctx.donneesAnalyse.moyennesConcurrents.photos,25);
 assert.equal(ctx.donneesAnalyse.concurrents[2].avis,null);
 assert.equal(ctx.donneesAnalyse.concurrents.map(c=>c.label).join(','),'A,B,C');
});
