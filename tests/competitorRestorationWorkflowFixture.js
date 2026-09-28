import {createServer} from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {extname,join} from 'node:path';
import {harness} from './noListingTestHelpers.js';
import {onRequestGet as getDraft,onRequestPut as putDraft} from '../functions/api/admin/audit-drafts/[draftId].js';
import {onRequestGet as listDrafts} from '../functions/api/admin/audit-drafts.js';
import {onRequestGet as getOverrides} from '../functions/api/admin/report-text-overrides/[analysisId].js';
import {onRequestPost as finalize,onRequestGet as getSnapshot} from '../functions/api/admin/audit-snapshots/[analysisId].js';
import {onRequestGet as listSnapshots} from '../functions/api/admin/audit-snapshots.js';
import {selbelecRealSnapshot as snapshot} from './selbelecRealSnapshotFixture.js';
const root=new URL('../',import.meta.url);
// Real HTTP save/read handlers and SQLite. Only the immutable collection context
// is supplied locally: no provider, Production request, or hydration replacement.
export async function startCompetitorRestorationFixture(script,{answers=snapshot.answers,pdfPath=null}={}){
 const h=await harness(),id=snapshot.analysisId,calls=[];
 // D1 batch semantics for the real finalization handler, backed by one
 // SQLite transaction; no persistence response is mocked.
 h.db.batch=async statements=>{
  h.db.sqlite.exec('BEGIN');
  try{const results=[];for(const statement of statements)results.push(await statement.run());h.db.sqlite.exec('COMMIT');return results;}
  catch(error){h.db.sqlite.exec('ROLLBACK');throw error;}
 };
 h.db.sqlite.prepare(`INSERT INTO analyses (analysis_id,nom,ville,query,status,created_at,updated_at,report_type) VALUES (?,?,?,?,?,?,?,'free')`).run(id,'Selbelec','Bruxelles','Electricien Bruxelles','awaiting_review','2026-09-24','2026-09-24');
 h.db.sqlite.prepare(`INSERT INTO audit_drafts VALUES (?,?,'draft','free',?,?, 'questionnaire',?,?)`).run(id,id,snapshot.answers.questionnaireVersion,JSON.stringify(answers),'2026-09-24','2026-09-24');
 const d=answers?.observedData || {};
 const collection={competitorQualificationStatus:d.competitorQualificationStatus,competitorQualificationVersion:d.competitorQualificationVersion,competitors:[],business:{rating:d.note,reviews:d.nbAvis,photosCount:d.nbPhotos,localPosition:d.position,positionKind:d.positionKind,searchQuery:d.requeteTestee,observedPrimaryCategory:d.categoriePrincipaleObservee,secondaryCategories:d.categoriesSecondairesObservees,secondaryCategoriesStatus:d.statutCategoriesSecondaires,confirmedActivity:d.activiteConfirmee}};
 const contextFixture={company:'Selbelec',city:'Bruxelles',activity:'Électricien',scoringVersion:'score-efficia-v5',collectionAvailable:Boolean(pdfPath),premiumAllowed:false,collection,scorePrefill:{criteria:Object.entries(answers?.responses || {}).filter(([,r])=>r?.source==='auto').map(([key,r])=>({key,...r}))}};
 const normalized={geographic_anchor:d.zoneGeographique,confirmed_search_zone:{city:'Bruxelles',countryCode:'BE',confirmed:true},last_search_query:'Electricien Bruxelles'};
 h.db.sqlite.prepare('UPDATE analyses SET normalized_json=?,search_query=? WHERE analysis_id=?').run(JSON.stringify(normalized),d.requeteTestee ?? null,id);
 for(const o of snapshot.overrides)h.db.sqlite.prepare(`INSERT INTO report_narrative_overrides (analysis_id,field_id,custom_text,automatic_text_snapshot,needs_review,context_hash,created_at,updated_at) VALUES (?,?,?,'',1,'fixture',?,?)`).run(id,o.fieldId,o.customText,'2026-09-24','2026-09-24');
 const server=createServer(async(req,res)=>{
  res.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self' about:");
  const url=new URL(req.url,'http://localhost'),path=url.pathname;
  const json=(v,s=200)=>{res.writeHead(s,{'Content-Type':'application/json'});res.end(JSON.stringify(v));};
  try{
   if(path==='/favicon.ico'){res.writeHead(204);return res.end();}
   if(path==='/runner'){res.setHeader('Content-Type','text/html');return res.end(`<!doctype html><output id="result"></output><iframe id="frame" style="width:1280px;height:1000px"></iframe><script>
   (async()=>{const frame=document.querySelector('#frame');let doc;const evidence=[];
   const wait=async(fn,label)=>{for(let n=0;n<800;n++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error(label+' '+doc?.querySelector('#statut')?.textContent);};
   const open=async(path)=>{await new Promise(r=>{frame.onload=r;frame.src=path;});doc=frame.contentDocument;};
   const ready=()=>wait(()=>frame.contentWindow.eval('analysisIdContexteAdminHydrate')==='${id}','hydration');
   const values=()=>Object.fromEntries([...doc.querySelectorAll('[id^="dc-"]')].map(el=>[el.id,el.value]));
   const model=()=>JSON.parse(frame.contentWindow.eval('JSON.stringify(donneesAnalyse)'));
   try{${script}\ndocument.querySelector('#result').textContent=JSON.stringify({evidence,jsErrors:frame.contentWindow.__restorationErrors || []});}catch(e){document.querySelector('#result').textContent=JSON.stringify({error:e.stack,evidence,jsErrors:frame.contentWindow.__restorationErrors || []});}})();</script>`);}
   if(path==='/test-pdf'){
    if(!pdfPath)throw Error('PDF not enabled');const chunks=[];for await(const chunk of req)chunks.push(chunk);writeFileSync(pdfPath,Buffer.concat(chunks));return json({success:true});
   }
   if(path.startsWith('/test-lib/')){res.setHeader('Content-Type','text/javascript');return res.end(readFileSync(join(process.env.NO_LISTING_PDF_LIBS||'/private/tmp/efficia-four-pages/no-listing-libs',path.split('/').at(-1))));}
   if(path.startsWith('/api/admin/')){
    const call={method:req.method,path};calls.push(call);let body='';for await(const part of req)body+=part;
    const request=new Request('http://localhost'+req.url,{method:req.method,headers:{Cookie:h.cookie,Origin:'http://localhost','Content-Type':'application/json'},...(body?{body}:{})});
    const context={env:h.env,request,params:{draftId:id,analysisId:id}};
    let response;
    if(path==='/api/admin/audit-drafts')response=await listDrafts(context);
    else if(path==='/api/admin/audit-drafts/'+id)response=await(req.method==='PUT'?putDraft:getDraft)(context);
    else if(path==='/api/admin/audit-snapshots/'+id)response=await(req.method==='GET'?getSnapshot:finalize)(context);
    else if(path==='/api/admin/report-text-overrides/'+id)response=await getOverrides(context);
    else if(path.startsWith('/api/admin/free-diagnostic-collect/'))return json({success:true,operation:'refresh_search',analysisId:id,reportType:'free',searchAnalyzedAt:'2026-09-24T18:00:00.000Z',competitiveDataChanged:true,business:{...collection.business,competitorQualificationVersion:1,competitorQualificationStatus:'qualified',competitors:d.concurrents.map(c=>({name:c.label,rating:c.note,reviews:c.avis,photos_count:c.photos,services_count:c.services,posts_count:c.pubs}))},scorePrefill:contextFixture.scorePrefill});
    else if(path.startsWith('/api/admin/free-diagnostic-context/'))return json({success:true,context:contextFixture});
    else if(path==='/api/admin/no-listing-diagnostics')return json({success:true,dossiers:[]});
    else if(path==='/api/admin/audit-snapshots')response=await listSnapshots(context);
    else if(path==='/api/admin/diagnostic-requests')return json({success:true,diagnostics:[],pendingCount:0});
    else throw Error('Unexpected API '+req.method+' '+path);
    call.status=response.status;return json(await response.json(),response.status);
   }
   if(path==='/admin/orders')return json({success:true,orders:[],stats:{}});
   const file=path==='/admin'?'admin.html':path.startsWith('/admin/free-diagnostic-production')?'admin/free-diagnostic-production/index.html':path.slice(1);
   if(file.includes('..'))throw Error('path');
   let content=readFileSync(new URL(file,root));
   if(file.endsWith('.html'))content=content.toString().replace(/<link[^>]*https:[^>]*>/g,'');
   if(file==='admin/free-diagnostic-production/index.html')content=content.replace('<head>',`<head><script>
    window.__restorationErrors=[];
    window.addEventListener('error',e=>{if(e.error)window.__restorationErrors.push(String(e.error));});
    window.addEventListener('unhandledrejection',e=>window.__restorationErrors.push(String(e.reason)));
   </script>`);
   if(pdfPath && file==='admin/free-diagnostic-production/index.html')content=content.replace('<script>\n/* ============ CONFIG',`<script src="/test-lib/jspdf.umd.min.js"></script><script src="/test-lib/html2canvas.min.js"></script><script>
    const RealPdf=window.jspdf.jsPDF;window.jspdf.jsPDF=function(...args){const pdf=new RealPdf(...args);pdf.save=(filename)=>{window.__pdfCapture=fetch('/test-pdf',{method:'POST',body:pdf.output('arraybuffer')}).then(r=>{if(!r.ok)throw Error('capture');window.__pdfSaved=filename;});};return pdf;};
   </script><script>\n/* ============ CONFIG`);
   res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(content);
  }catch(error){calls.push({method:req.method,path,status:500,error:String(error)});json({error:String(error)},500);}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {h,calls,url:`http://127.0.0.1:${server.address().port}/runner`,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));h.db.sqlite.close();}};
}
