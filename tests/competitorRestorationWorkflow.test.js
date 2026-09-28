import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {collectPageResultWithIsolatedChrome} from './chromeHeadlessHarness.js';
import {selbelecRealSnapshot as snapshot} from './selbelecRealSnapshotFixture.js';
import {startCompetitorRestorationFixture as fixture} from './competitorRestorationWorkflowFixture.js';
const chrome=process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

test('real save → destroy document → admin list → reopen restores every competitor field', {timeout:90000},async()=>{
 const script=`
 await open('/admin/free-diagnostic-production/?analysisId=${snapshot.analysisId}');await ready();
 evidence.push({stage:'legacy snapshot opened',values:values(),model:model()});
 const expected={};
 for(let i=1;i<=3;i++)for(const [key,value]of Object.entries({nom:'Concurrent '+i,note:'4,'+i,avis:String(i*43),photos:i===1?'0':String(i*11),services:i===2?'':String(i),pubs:i===3?'0':String(i*2)})){
  const el=doc.getElementById('dc-'+key+'-'+i);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));expected[el.id]=value;
 }
 doc.getElementById('btn-brouillon-d1').click();await wait(()=>!doc.getElementById('btn-brouillon-d1').disabled,'save');
 evidence.push({stage:'saved',values:values(),model:model()});
 await open('/admin');await wait(()=>doc.querySelector('a[href*="analysisId=${snapshot.analysisId}"]'),'admin list');
 const link=doc.querySelector('a[href*="analysisId=${snapshot.analysisId}"]');
 await new Promise(r=>{frame.onload=r;link.click();});doc=frame.contentDocument;await ready();
 evidence.push({stage:'reopened',values:values(),model:model(),expected});
 doc.getElementById('btn-pdf').click();
 await wait(()=>frame.contentWindow.__pdfSaved || !doc.getElementById('erreur-rendu-diagnostic').hidden,'PDF after reopen');
 if(!frame.contentWindow.__pdfSaved)throw Error(doc.getElementById('erreur-rendu-diagnostic').textContent);
 await wait(()=>!doc.getElementById('btn-pdf').disabled,'PDF finalized');
 evidence.push({stage:'pdf',values:values(),model:model(),expected,filename:frame.contentWindow.__pdfSaved});
 `;
 const pdfPath=process.env.RESTORATION_ROUNDTRIP_PDF||join(tmpdir(),'competitor-roundtrip.pdf');
 const f=await fixture(script,{pdfPath}),profile=mkdtempSync(join(tmpdir(),'competitor-restoration-'));
 try{
  const result=JSON.parse(await collectPageResultWithIsolatedChrome({chrome,url:f.url,profileDir:profile,phase:'competitor roundtrip',selector:'#result',timeout:85000,resultWait:80000}));
  if(process.env.RESTORATION_EVIDENCE)writeFileSync(process.env.RESTORATION_EVIDENCE,JSON.stringify({result,calls:f.calls,stored:JSON.parse(f.h.db.sqlite.prepare('SELECT answers_json FROM audit_drafts').get().answers_json)},null,2));
  assert.equal(result.error,undefined);
  const reopened=result.evidence.at(-1);
  assert.deepEqual(reopened.values,reopened.expected,'competitor fields lost after real save and fresh document');
  const stored=JSON.parse(f.h.db.sqlite.prepare('SELECT answers_json FROM audit_drafts').get().answers_json);
  for(const [id,value] of Object.entries(reopened.expected))assert.equal(stored.fields[id],value,id+' persisted in answers.fields');
  assert.equal(Object.keys(reopened.expected).length,18);
  assert.ok(f.calls.some(c=>c.method==='PUT'&&c.status===200));
 }finally{await f.close();rmSync(profile,{recursive:true,force:true});}
});


test('Selbelec real snapshot → standard reopen → PDF button, without data injection', {timeout:90000},async()=>{
 const pdfPath=process.env.RESTORATION_PDF||join(tmpdir(),'Selbelec-restoration-workflow.pdf');
 const script=`
 await open('/admin');await wait(()=>doc.querySelector('a[href*="analysisId=${snapshot.analysisId}"]'),'list');
 await new Promise(r=>{frame.onload=r;doc.querySelector('a[href*="analysisId=${snapshot.analysisId}"]').click();});doc=frame.contentDocument;await ready();
 evidence.push({stage:'opened',values:values(),model:model(),responses:JSON.parse(frame.contentWindow.eval('JSON.stringify(collecterReponses())')),score:frame.contentWindow.eval('calculScoreDetail().total')});
 doc.getElementById('btn-brouillon-d1').click();await wait(()=>!doc.getElementById('btn-brouillon-d1').disabled,'save Selbelec');
 await open('about:blank');await open('/admin');await wait(()=>doc.querySelector('a[href*="analysisId=${snapshot.analysisId}"]'),'list again');
 await new Promise(r=>{frame.onload=r;doc.querySelector('a[href*="analysisId=${snapshot.analysisId}"]').click();});doc=frame.contentDocument;await ready();
 evidence.push({stage:'reopened',values:values(),model:model()});
 doc.getElementById('btn-pdf').click();
 await wait(()=>frame.contentWindow.__pdfSaved || !doc.getElementById('erreur-rendu-diagnostic').hidden,'PDF');
 if(!frame.contentWindow.__pdfSaved)throw Error(doc.getElementById('erreur-rendu-diagnostic').textContent);
 await wait(()=>!doc.getElementById('btn-pdf').disabled,'finalize');
 evidence.push({stage:'pdf',filename:frame.contentWindow.__pdfSaved,preview:[...doc.querySelectorAll('#rapport-contenu .page')].map(p=>p.innerText),model:model(),responses:JSON.parse(frame.contentWindow.eval('JSON.stringify(collecterReponses())')),detail:JSON.parse(frame.contentWindow.eval('JSON.stringify(calculScoreDetail())')),layout:JSON.parse(frame.contentWindow.eval('JSON.stringify(validerMiseEnPageRapport())')),links:[...doc.querySelectorAll('a[data-pdf-link]')].map(a=>a.href)});
 `;
 const readonlyScript=`
 await open('/admin');await wait(()=>doc.querySelector('a[href*="readonly=1"]'),'finalized list');doc.querySelector('[data-admin-completed-toggle]').click();
 await new Promise(r=>{frame.onload=r;doc.querySelector('a[href*="readonly=1"]').click();});doc=frame.contentDocument;await ready();
 evidence.at(-1).readonly={values:values(),model:model(),locked:doc.body.dataset.readOnly};
 `;
 const f=await fixture(script+readonlyScript,{pdfPath}),profile=mkdtempSync(join(tmpdir(),'selbelec-reopen-'));
 try{
  const result=JSON.parse(await collectPageResultWithIsolatedChrome({chrome,url:f.url,profileDir:profile,phase:'Selbelec normal export',selector:'#result',timeout:85000,resultWait:80000}));
  writeFileSync(pdfPath+'.json',JSON.stringify({result,calls:f.calls,stored:JSON.parse(f.h.db.sqlite.prepare('SELECT answers_json FROM audit_drafts').get().answers_json)},null,2));
  assert.equal(result.error,undefined);
  const final=result.evidence.at(-1);
  assert.equal(Math.round(final.detail.total),29);assert.equal(final.preview.length,4);assert.equal(final.layout.ok,true);
  assert.deepEqual(final.model.concurrents,snapshot.answers.observedData.concurrents);
  const expectedFields=Object.fromEntries(snapshot.answers.observedData.concurrents.flatMap((c,i)=>Object.entries({nom:c.label,note:c.note,avis:c.avis,photos:c.photos,services:c.services,pubs:c.pubs}).map(([key,value])=>['dc-'+key+'-'+(i+1),value==null?'':String(value)])));
  for(const stage of result.evidence.filter(e=>e.values))assert.deepEqual(stage.values,expectedFields,stage.stage+' restores all 18 legacy fields');
  assert.deepEqual(final.readonly.values,expectedFields);
  assert.deepEqual(final.responses,result.evidence[0].responses);
  assert.deepEqual(final.model,result.evidence[0].model);
  assert.match(final.preview.join('\n'),/médiane de 94 avis/);
  assert.equal(final.links.length,2);
  for(const link of final.links)assert.equal(new URL(link).searchParams.get('audit'),snapshot.analysisId);

  assert.equal(final.model.moyennesConcurrents.photos,97);
  assert.ok(f.calls.some(c=>c.method==='POST'&&c.path.includes('audit-snapshots')&&c.status===200),'real finalization must succeed');assert.ok(!f.calls.some(c=>c.status>=400),JSON.stringify(f.calls));
  assert.equal(final.readonly.locked,'true');assert.deepEqual(final.readonly.model.concurrents,snapshot.answers.observedData.concurrents);
  assert.equal(final.readonly.values['dc-avis-1'],'726');assert.equal(final.readonly.values['dc-avis-2'],'94');assert.equal(final.readonly.values['dc-avis-3'],'43');
  assert.match(final.preview.join('\n'),/94/);assert.match(final.preview.join('\n'),/726/);
  assert.equal(f.calls.filter(c=>c.method==='PUT').length,2,'only explicit save and PDF save; hydration must not save');
 }finally{await f.close();rmSync(profile,{recursive:true,force:true});}
});

for(const count of [1,2,3])test(`SQLite + fresh documents: ${count} competitors, zero/unknown/legacy and repeated saves`,{timeout:60000},async()=>{
 const answers=structuredClone(snapshot.answers);
 answers.observedData.concurrents=Array.from({length:count},(_,i)=>({label:'Local '+i,note:4.8,avis:i===0?0:94,photos:i===0?null:0,services:'unknown',pubs:'not_verifiable',place_id:'local-'+i,manualOverride:true}));
 delete answers.observedData.concurrents[0].photos;
 const script=`
 for(let cycle=0;cycle<3;cycle++){
  await open('/admin');await wait(()=>doc.querySelector('a[href*="analysisId=${snapshot.analysisId}"]'),'list');
  await new Promise(r=>{frame.onload=r;doc.querySelector('a[href*="analysisId=${snapshot.analysisId}"]').click();});doc=frame.contentDocument;await ready();
  evidence.push({cycle,stage:'opened',values:values(),model:model()});
  doc.getElementById('btn-brouillon-d1').click();await wait(()=>!doc.getElementById('btn-brouillon-d1').disabled,'saved');
 }
 `;
 const f=await fixture(script,{answers}),profile=mkdtempSync(join(tmpdir(),'competitor-cycles-'));
 try{
  const result=JSON.parse(await collectPageResultWithIsolatedChrome({chrome,url:f.url,profileDir:profile,phase:'competitor cycles',selector:'#result',timeout:55000,resultWait:50000}));
  assert.equal(result.error,undefined);
  for(const stage of result.evidence){assert.deepEqual(stage.model.concurrents,answers.observedData.concurrents);assert.equal(stage.values['dc-avis-1'],'0');assert.equal(stage.values['dc-photos-1'],'');assert.equal(stage.values['dc-services-1'],'unknown');assert.equal(stage.values['dc-pubs-1'],'not_verifiable');}
  assert.equal(f.calls.filter(c=>c.method==='PUT').length,3,'no extra hydration save');
  const stored=JSON.parse(f.h.db.sqlite.prepare('SELECT answers_json FROM audit_drafts').get().answers_json);
  assert.deepEqual(stored.observedData.concurrents,answers.observedData.concurrents);
  assert.deepEqual(f.h.db.sqlite.prepare('SELECT field_id,custom_text FROM report_narrative_overrides ORDER BY field_id').all().map(r=>({...r})),snapshot.overrides.map(o=>({field_id:o.fieldId,custom_text:o.customText})).sort((a,b)=>a.field_id.localeCompare(b.field_id)));
 }finally{await f.close();rmSync(profile,{recursive:true,force:true});}
});


test('local collection response → refresh button → save → fresh reopen preserves refreshed panel', {timeout:60000},async()=>{
 const script=`
 await open('/admin/free-diagnostic-production/?analysisId=${snapshot.analysisId}');await ready();
 doc.getElementById('btn-relancer-recherche').click();await wait(()=>!doc.getElementById('btn-relancer-recherche').disabled,'refresh');
 evidence.push({stage:'refreshed',values:values(),model:model()});
 doc.getElementById('btn-brouillon-d1').click();await wait(()=>!doc.getElementById('btn-brouillon-d1').disabled,'save');
 await open('/admin');await wait(()=>doc.querySelector('a[href*="analysisId=${snapshot.analysisId}"]'),'list');
 await new Promise(r=>{frame.onload=r;doc.querySelector('a[href*="analysisId=${snapshot.analysisId}"]').click();});doc=frame.contentDocument;await ready();
 evidence.push({stage:'reopened',values:values(),model:model()});
 `;
 const f=await fixture(script),profile=mkdtempSync(join(tmpdir(),'competitor-refresh-'));
 try{
  const result=JSON.parse(await collectPageResultWithIsolatedChrome({chrome,url:f.url,profileDir:profile,phase:'refresh roundtrip',selector:'#result',timeout:55000,resultWait:50000}));
  assert.equal(result.error,undefined);const [before,after]=result.evidence;
  assert.equal(before.model.derniereAnalyseRechercheAt,'2026-09-24T18:00:00.000Z');
  assert.deepEqual(after.model.concurrents,before.model.concurrents);
  assert.deepEqual(after.model.moyennesConcurrents,before.model.moyennesConcurrents);
  assert.equal(after.model.derniereAnalyseRechercheAt,before.model.derniereAnalyseRechercheAt);
  for(const [id,value]of Object.entries(before.values))assert.equal(after.values[id],value);
  assert.ok(f.calls.some(c=>c.path.includes('free-diagnostic-collect')&&c.method==='POST'));
 }finally{await f.close();rmSync(profile,{recursive:true,force:true});}
});

// The persistence API accepts historical answers with no fields object, including
// explicit null. Opening such a dossier must still restore its saved model.
for(const mode of ['absent','null'])test(`legacy ${mode} answers.fields opens through the normal SQLite route`,{timeout:60000},async()=>{
 const answers=structuredClone(snapshot.answers);
 if(mode==='null')answers.fields=null;else delete answers.fields;
 const script=`
 await open('/admin/free-diagnostic-production/?analysisId=${snapshot.analysisId}');await ready();
 evidence.push({stage:'legacy hydrated',values:values(),model:model()});
 `;
 const f=await fixture(script,{answers}),profile=mkdtempSync(join(tmpdir(),'competitor-legacy-'));
 const storedBefore=JSON.stringify(f.h.db.sqlite.prepare('SELECT * FROM audit_drafts').all());
 try{
  const result=JSON.parse(await collectPageResultWithIsolatedChrome({chrome,url:f.url,profileDir:profile,phase:'legacy fields '+mode,selector:'#result',timeout:55000,resultWait:50000}));
  if(process.env.RESTORATION_LEGACY_EVIDENCE)writeFileSync(process.env.RESTORATION_LEGACY_EVIDENCE+'.'+mode+'.json',JSON.stringify({result,calls:f.calls},null,2));
  assert.equal(result.error,undefined,'legacy dossier must finish hydration');
  assert.deepEqual(result.jsErrors,[]);
  assert.ok(f.calls.every(c=>c.method==='GET'),'opening must not write');
  assert.equal(JSON.stringify(f.h.db.sqlite.prepare('SELECT * FROM audit_drafts').all()),storedBefore);
  for(const [i,c] of answers.observedData.concurrents.entries())for(const [key,value]of Object.entries({nom:c.label,note:c.note,avis:c.avis,photos:c.photos,services:c.services,pubs:c.pubs}))assert.equal(result.evidence[0].values['dc-'+key+'-'+(i+1)],value==null?'':String(value));
  assert.deepEqual(result.evidence[0].model.concurrents,answers.observedData.concurrents);
 }finally{await f.close();rmSync(profile,{recursive:true,force:true});}
});

const compatibilityCases = [
 ['fields empty', a=>{a.fields={};}],
 ['fields string', a=>{a.fields='legacy';}],
 ['fields number', a=>{a.fields=7;}],
 ['fields array', a=>{a.fields=[];}],
 ['fields all 18', a=>{for(const [i,c] of a.observedData.concurrents.entries())for(const [key,value]of Object.entries({nom:c.label,note:c.note,avis:c.avis,photos:c.photos,services:c.services,pubs:c.pubs}))a.fields['dc-'+key+'-'+(i+1)]=value==null?'':String(value);}],
 ['legacy observed competitors only', a=>{delete a.fields;}],
 ['observed absent', a=>{delete a.observedData;}],
 ['observed null', a=>{a.observedData=null;}],
 ['observed string', a=>{a.observedData='legacy';}],
 ['observed array', a=>{a.observedData=[];}],
 ['competitors null', a=>{a.observedData.concurrents=null;}],
 ['competitors object', a=>{a.observedData.concurrents={0:{label:'invalid'}};}],
 ['competitors string', a=>{a.observedData.concurrents='legacy';}],
 ['competitor invalid entries', a=>{a.observedData.concurrents=[null,'invalid',[]];}],
 ['answers null', ()=>null],
 ['answers string', ()=>'legacy'],
 ['answers array', ()=>[]],
 ['responses null', a=>{a.responses=null;}],
 ['response null entry', a=>{a.responses.noteMoyenne=null;}],
 ['zero empty unknown absent', a=>{a.fields={};a.observedData.concurrents=[{label:'Legacy',avis:0,photos:null,services:'',pubs:'unknown',place_id:'preserved'}];}],
];
for(const [name,change] of compatibilityCases)test('compatibility: '+name,{timeout:60000},async()=>{
 const source=structuredClone(snapshot.answers);const replacement=change(source);const answers=replacement===undefined?source:replacement;
 const script=`
 await open('/admin/free-diagnostic-production/?analysisId=${snapshot.analysisId}');await ready();
 // Wait beyond the normal autosave debounce without triggering an input event.
 await new Promise(resolve=>setTimeout(resolve,1500));
 evidence.push({stage:'hydrated',values:values(),model:model()});
 `;
 const f=await fixture(script,{answers}),profile=mkdtempSync(join(tmpdir(),'competitor-compatibility-'));
 const database=()=>JSON.stringify(['audit_drafts','analyses','report_narrative_overrides','audit_questionnaire_snapshots'].map(table=>f.h.db.sqlite.prepare('SELECT * FROM '+table).all()));
 const storedBefore=database();
 try{
  const result=JSON.parse(await collectPageResultWithIsolatedChrome({chrome,url:f.url,profileDir:profile,phase:name,selector:'#result',timeout:55000,resultWait:50000}));
  assert.equal(result.error,undefined);assert.deepEqual(result.jsErrors,[]);
  assert.ok(f.calls.every(c=>c.method==='GET'),'opening never writes');assert.equal(database(),storedBefore,'opening never modifies the dossier');
  const competitors=answers?.observedData?.concurrents;
  if(Array.isArray(competitors) && competitors.every(c=>c && typeof c==='object' && !Array.isArray(c))){
   const actual=result.evidence[0];assert.deepEqual(actual.model.concurrents,competitors);
   for(const [i,c]of competitors.entries())for(const [key,value]of Object.entries({nom:c.label,note:c.note,avis:c.avis,photos:c.photos,services:c.services,pubs:c.pubs}))assert.equal(actual.values['dc-'+key+'-'+(i+1)],value==null?'':String(value));
  }
 }finally{await f.close();rmSync(profile,{recursive:true,force:true});}
});
