import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,existsSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {harness,identity,provider} from './noListingTestHelpers.js';
import {collectPageResultWithIsolatedChrome} from './chromeHeadlessHarness.js';
import {onRequestGet,onRequestPost} from '../functions/api/admin/no-listing-diagnostics.js';
const root=new URL('../',import.meta.url);
const chrome=process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const libs=process.env.NO_LISTING_PDF_LIBS || '/private/tmp/efficia-no-listing-validation';
for(const [fromCapture,longCopy] of [[false,false],[true,false],[true,true]])test(`Chrome + SQLite : ${fromCapture?'demande reçue':'création manuelle'}${longCopy?' / textes longs':''} → recherche → édition → aperçu/PDF → rapport finalisé`,
  {skip:!existsSync(chrome)||!existsSync(join(libs,'jspdf.umd.min.js')),timeout:90000},async()=>{
  const h=await harness(),captureId=crypto.randomUUID();
  if(fromCapture)h.db.sqlite.prepare(`INSERT INTO diagnostic_lead_captures VALUES (?,?,?,'synced',?,?,?,'not_found',?)`).run(captureId,'Camille','fictif@example.invalid','2026-09-16','2026-09-16',JSON.stringify({company:identity.company,city:identity.city,countryCode:'BE'}),'2026-09-16');
  const realFetch=globalThis.fetch,p=provider(),mockFetch=globalThis.fetch;
  globalThis.fetch=(input,options)=>new URL(String(input)).hostname==='127.0.0.1'?realFetch(input,options):mockFetch(input,options);
  let savedPdf=null, savedPages=0;
  const runner=`<!doctype html><meta charset="utf-8"><output id="result"></output><iframe id="frame" style="width:1200px;height:1000px"></iframe><script>
    (async()=>{const result=document.querySelector('#result'),frame=document.querySelector('#frame');
    const wait=async(f,label)=>{for(let i=0;i<1600;i++){if(f())return;await new Promise(r=>setTimeout(r,25));}throw Error(label+' '+frame.contentDocument.querySelector('#error')?.textContent);};
    const check=(v,m)=>{if(!v)throw Error(m);};
    const page=async(path)=>{await new Promise(r=>{frame.onload=r;frame.src=path;});await wait(()=>frame.contentDocument.querySelector('#save') && !frame.contentDocument.querySelector('#save').disabled,'load');return frame.contentDocument;};
    try{
      let doc=await page('/admin/free-diagnostic-no-listing/${fromCapture?'?captureId='+captureId:''}');
      await wait(()=>frame.contentWindow.__ready,'libraries');
      const fill=(name,value)=>{const el=doc.querySelector('[name="'+name+'"]');el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));};
      if(${fromCapture}){await wait(()=>doc.querySelector('[name="company"]').value,'prefill');check(doc.querySelector('[name="city"]').value==='Namur','city lost');check(doc.querySelector('#source-context').textContent.includes('fiche non trouvée'),'absence confused');}
      for(const [key,value]of Object.entries(${JSON.stringify(identity)}))fill(key,value);
      doc.querySelector('#mode-confirmed').click();doc.querySelector('#save').click();doc.querySelector('#save').click();
      await wait(()=>frame.contentWindow.location.search.includes('id=') && !doc.querySelector('#save').disabled,'save');
      const url=frame.contentWindow.location.pathname+frame.contentWindow.location.search;
      check(doc.querySelector('#export').disabled,'export before collection');
      doc.querySelector('#collect').click();await wait(()=>!doc.querySelector('#collect').disabled,'blocked collect');
      check(doc.querySelector('#error').textContent.includes('Confirmez'),'confirmation missing');
      doc.querySelector('#zone-confirmed').click();doc.querySelector('#collect').click();
      await wait(()=>doc.querySelectorAll('#priorities fieldset').length===3 && !doc.querySelector('#save').disabled,'collection');
      check(doc.querySelectorAll('#observations .nl-competitor').length===3,'competitors');
      check(doc.querySelector('#observations').textContent.includes('Nombre d’avis non disponible'),'missing value invented');
      const title=doc.querySelector('[data-field="title"]');title.value='Créer la présence locale de votre entreprise — EXEMPLE FICTIF';title.dispatchEvent(new Event('input',{bubbles:true}));
      doc.querySelectorAll('[data-field="actions"]')[2].value='Demander un avis authentique après la prestation, sans aucune contrepartie.';
      if(${longCopy})for(const fieldset of [...doc.querySelectorAll('#priorities fieldset')].slice(0,2)){
        for(const [field,sentence,times]of [
          ['finding','Exemple fictif long : votre entreprise souhaite présenter ses services et ses coordonnées de façon claire. ',8],
          ['actions','Préparer avec votre entreprise les informations exactes à publier, puis vérifier chaque élément avant sa mise en ligne. ',11],
          ['benefit','Ces informations aideront les personnes intéressées à comprendre vos services et à choisir comment vous contacter. ',6]
        ])fieldset.querySelector('[data-field="'+field+'"]').value=Array(times).fill(sentence.trim()).join('\\n\\n');
      }
      doc.querySelector('#save').click();await wait(()=>!doc.querySelector('#save').disabled,'save priorities');
      doc=await page(url);await wait(()=>doc.querySelectorAll('#priorities fieldset').length===3,'restore priorities');
      check(doc.querySelector('[data-field="title"]').value.includes('votre entreprise'),'title not restored');
      fill('query','Artisan électricien Namur');doc.querySelector('#save').click();await wait(()=>!doc.querySelector('#save').disabled,'query save');
      check(doc.querySelector('#export').disabled,'stale export');doc.querySelector('#zone-confirmed').click();doc.querySelector('#collect').click();
      await wait(()=>!doc.querySelector('#export').disabled,'recollect');check(doc.querySelector('[data-field="title"]').value.includes('votre entreprise'),'override lost');
      doc.querySelector('#preview').click();await wait(()=>!doc.querySelector('#report').hidden,'preview');
      const preview=doc.querySelector('#report').innerText;check(preview.includes('votre entreprise'),'preview title');
      check(!/notre atelier|Electrician|qui décrit réellement/.test(preview),'awkward copy');
      check(!/\\d+\\/100|Position Google|0 avis/.test(preview),'invented score or metric');
      check(doc.querySelectorAll('[data-priority][data-continuation="false"]').length===3,'three priorities');
      const competition=doc.querySelector('.nl-competition');check(competition.querySelectorAll('.nl-competitor').length===3,'competition group');
      check(competition.closest('.nl-page').querySelectorAll('.nl-competitor').length===3,'isolated competitor');
      check(competition.querySelector('h2') && competition.textContent.includes('Artisan électricien Namur'),'competition context');
      for(const index of [1,2,3]){
        const headings=[...doc.querySelectorAll('[data-priority="'+index+'"]')];
        if(!${longCopy} || index===3)check(headings.length===1,'unnecessary priority split');
        else check(headings.length>1 && headings.slice(1).every(h=>h.textContent.endsWith(' — suite')),'missing continuation heading '+index+' '+JSON.stringify(headings.map(h=>h.textContent)));
      }
      const pages=[...doc.querySelectorAll('.nl-page')];
      let minimumGap=Infinity;
      for(const page of pages){const c=page.querySelector('.nl-content'),footer=page.querySelector('.nl-footer');
        const lowest=Math.max(...[...c.querySelectorAll('*')].map(el=>el.getBoundingClientRect().bottom));
        check(lowest<=c.getBoundingClientRect().bottom+0.1,'painted overflow');
        const gap=(footer.getBoundingClientRect().top-lowest)*25.4/96;minimumGap=Math.min(minimumGap,gap);check(gap>=6,'footer reserve');check(page.querySelector('.nl-logo'),'logo missing');
      }
      doc.querySelector('#export').click();await wait(()=>frame.contentWindow.__pdfSaved,'PDF save');
      check(frame.contentWindow.__captured===preview,'preview and captured DOM diverge');
      check(doc.querySelector('#status').textContent.includes('Aucun e-mail'),'send confusion');
      await new Promise(r=>{frame.onload=r;frame.src=url;});doc=frame.contentDocument;
      await wait(()=>doc.querySelector('#status').textContent.includes('lecture seule'),'finalized reopen');
      check(doc.querySelector('[data-field="title"]').disabled,'final snapshot editable');check(doc.querySelector('[data-field="title"]').value.includes('votre entreprise'),'snapshot lost');
      doc.querySelector('#preview').click();await wait(()=>!doc.querySelector('#report').hidden,'finalized preview');check(doc.querySelector('#report').innerText===preview,'snapshot report changed');
      check(frame.contentWindow.__errors.length===0,'JS errors');
      await new Promise(r=>{frame.onload=r;frame.src='/admin';});doc=frame.contentDocument;
      await wait(()=>doc.querySelector('[data-admin-completed-toggle]').textContent.endsWith('(1)'),'completed list');
      doc.querySelector('[data-admin-completed-toggle]').click();check(doc.querySelector('#completed-audits-list').textContent.includes('Sans fiche')||doc.querySelector('#completed-audits-list').textContent.includes('sans fiche'),'completed type');
      check(doc.querySelector('#completed-audits-list a').href.includes('free-diagnostic-no-listing'),'wrong consultation route');
      result.textContent=JSON.stringify({success:true,pages:pages.length,preview,minimumGap});
    }catch(e){result.textContent=JSON.stringify({error:e.stack,ui:frame.contentDocument.body.innerText.slice(0,7000)});}})();</script>`;
  const server=createServer(async(req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    const json=(body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
    try{
      if(path==='/api/admin/no-listing-diagnostics'){
        let payload=null;if(req.method==='POST'){let text='';for await(const chunk of req)text+=chunk;payload=JSON.parse(text);}
        const ctx=h.context(payload,new URL(req.url,'http://localhost').search),r=await(payload?onRequestPost(ctx):onRequestGet(ctx));return json(await r.json(),r.status);
      }
      if(path==='/test-pdf'){
        const chunks=[];for await(const chunk of req)chunks.push(chunk);savedPdf=Buffer.concat(chunks);savedPages=Number(req.headers['x-pages']);return json({success:true});
      }
      if(path==='/api/admin/audit-snapshots')return json({success:true,audits:[]});
      if(path==='/api/admin/audit-drafts')return json({success:true,drafts:[]});
      if(path==='/api/admin/diagnostic-requests')return json({success:true,diagnostics:[],pendingCount:0});
      if(path==='/admin/orders')return json({success:true,orders:[],stats:{}});
      if(path==='/runner'){res.setHeader('Content-Type','text/html');res.end(runner);return;}
      if(path.startsWith('/test-lib/')){res.setHeader('Content-Type','text/javascript');res.end(readFileSync(join(libs,path.split('/').at(-1))));return;}
      if(path==='/admin' || path==='/admin/free-diagnostic-no-listing/'){
        let html=readFileSync(new URL(path==='/admin'?'admin.html':'admin/free-diagnostic-no-listing/index.html',root),'utf8');
        html=html.replace(/<link[^>]*https:[^>]*>/g,'').replace('</head>',`<script>window.__errors=[];addEventListener('error',e=>__errors.push(e.message));</script></head>`);
        if(path!=='/admin')html=html.replace('<script type="module"',`<script src="/test-lib/jspdf.umd.min.js"></script><script src="/test-lib/html2canvas.min.js"></script><script>
          const Real=window.jspdf.jsPDF;window.jspdf.jsPDF=function(...args){const pdf=new Real(...args);pdf.save=async()=>{await fetch('/test-pdf',{method:'POST',headers:{'X-Pages':String(pdf.getNumberOfPages())},body:pdf.output('arraybuffer')});window.__pdfSaved=true;};return pdf;};
          const canvas=window.html2canvas;window.html2canvas=(page,options)=>{window.__captured=document.querySelector('#report').innerText;return canvas(page,options);};window.__ready=true;
        </script><script type="module"`);
        res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;
      }
      if(/^\/(js|css|assets)\//.test(path)&&!path.includes('..')){
        res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(path)]||'application/octet-stream');res.end(readFileSync(new URL('.'+path,root)));return;
      }
      res.writeHead(404);res.end();
    }catch(e){json({error:String(e)},500);}
  });
  const dir=mkdtempSync(join(tmpdir(),'efficia-no-listing-chrome-'));
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const result=JSON.parse(await collectPageResultWithIsolatedChrome({chrome,url:`http://127.0.0.1:${server.address().port}/runner`,profileDir:dir,phase:'no-listing',selector:'#result',resultWait:65000}));
    assert.equal(result.error,undefined,result.error+'\n'+result.ui);assert.equal(result.success,true);assert.ok(savedPdf?.length>10000);assert.equal(savedPages,result.pages);
    assert.equal(h.db.sqlite.prepare('SELECT count(*) AS n FROM no_listing_diagnostics').get().n,1);
    assert.equal(h.db.sqlite.prepare('SELECT count(*) AS n FROM analyses').get().n,0);
    assert.equal(p.calls.length,4);
    if(fromCapture){const suffix=longCopy?'-LONG':'';writeFileSync(join(libs,'Diagnostic-sans-fiche-EXEMPLE-FICTIF'+suffix+'.pdf'),savedPdf);writeFileSync(join(libs,'preview'+suffix+'.txt'),result.preview);}
    console.log('PDF réel :',savedPages,'pages ; marge footer minimale',result.minimumGap.toFixed(1),'mm ; aperçu/capture identiques ; snapshot rouvert ; aucun appel MailerLite/Ads.');
  }finally{p.restore();server.closeAllConnections();await new Promise(r=>server.close(r));h.db.sqlite.close();rmSync(dir,{recursive:true,force:true});}
});
