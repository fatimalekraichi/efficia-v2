// Local-only fixture: real routes + SQLite, no provider request and no production access.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,extname} from 'node:path';
import {harness,identity} from './noListingTestHelpers.js';
import {defaultPriorities,searchIdentity} from '../js/no-listing-model.js';
import {onRequestGet,onRequestPost} from '../functions/api/admin/no-listing-diagnostics.js';
export async function startNoListingWorkflowFixture({outputDir='/private/tmp/efficia-no-listing-validation'}={}) {
  const h=await harness(),id=crypto.randomUUID(),now='2026-09-18T10:00:00.000Z';
  const data={...identity,company:'Vinelec srl',activity:'Electricien',city:'Bassenge',searchCity:'Bassenge',query:'Electricien Bassenge',website:'https://www.electricitevinelec.be/',absenceContext:'confirmed'};
  data.collection={status:'success',searchIdentity:searchIdentity(data),query:data.query,city:data.city,countryCode:'BE',observedAt:now,
    competitors:[{name:'Belka - Solutions Electriques',reviews:29,rating:4.8},{name:'acdc elec',reviews:null,rating:null},{name:'Dubuisson / Philippe',reviews:2,rating:4}].map(c=>({...c,primary_category:'Electrician',secondary_categories:[],location_link:'https://www.google.com/maps'}))};
  data.automaticPriorities=defaultPriorities(data,data.collection);data.priorities=structuredClone(data.automaticPriorities);
  data.priorities[0].finding='Personnalisation du dossier source à ne pas recopier.';
  data.priorityOverrides=[{finding:data.priorities[0].finding}];
  data.reportTextOverrides={'summary.general':{customText:'Introduction historique de la source.',automaticText:'',needsReview:false}};
  h.db.sqlite.prepare(`INSERT INTO no_listing_diagnostics (dossier_id,idempotency_key,status,data_json,snapshot_json,pdf_filename,created_at,updated_at,finalized_at) VALUES (?,?,'finalized',?,?,?,?,?,?)`)
    .run(id,crypto.randomUUID(),JSON.stringify(data),JSON.stringify(data),'ancien-nom.pdf',now,now,now);
  const source=JSON.stringify((await h.get('?id='+id)).dossier),exports=[],apiCalls=[];
  const root=new URL('../',import.meta.url),libs='/private/tmp/efficia-no-listing-validation';
  let runner='';
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost'),path=url.pathname;
    const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    try{
      if(path==='/runner'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(runner);}
      if(path==='/api/admin/no-listing-diagnostics'){
        let payload=null;if(req.method==='POST'){let body='';for await(const part of req)body+=part;payload=JSON.parse(body);}
        apiCalls.push({method:req.method,action:payload?.action});
        if(payload && !['duplicate','save','finalize'].includes(payload.action))return json({success:false,error:'NO_EXTERNAL_COLLECTION_IN_FIXTURE'},400);
        const response=await(payload?onRequestPost:onRequestGet)(h.context(payload,url.search));return json(await response.json(),response.status);
      }
      if(path==='/test-pdf'){
        const parts=[];for await(const part of req)parts.push(part);const bytes=Buffer.concat(parts);
        const filename=decodeURIComponent(req.headers['x-filename']||'');
        if(!/^Fiche-Diagnostic_[a-zA-Z0-9_-]+\.pdf$/.test(filename))throw Error('Unexpected filename '+filename);
        writeFileSync(join(outputDir,filename),bytes);exports.push({filename,bytes});return json({success:true});
      }
      if(path==='/api/admin/audit-snapshots')return json({success:true,audits:[]});
      if(path==='/api/admin/audit-drafts')return json({success:true,drafts:[]});
      if(path==='/api/admin/diagnostic-requests')return json({success:true,diagnostics:[],pendingCount:0});
      if(path==='/admin/orders')return json({success:true,orders:[],stats:{}});
      if(path.startsWith('/test-lib/')){res.setHeader('Content-Type','text/javascript');return res.end(readFileSync(join(libs,path.split('/').at(-1))));}
      if(path==='/admin' || path==='/admin/free-diagnostic-no-listing/'){
        let html=readFileSync(new URL(path==='/admin'?'admin.html':'admin/free-diagnostic-no-listing/index.html',root),'utf8');
        html=html.replace(/<link[^>]*https:[^>]*>/g,'');
        if(path!=='/admin')html=html.replace('<script type="module"',`<script src="/test-lib/jspdf.umd.min.js"></script><script src="/test-lib/html2canvas.min.js"></script><script>
          const Real=window.jspdf.jsPDF;window.jspdf.jsPDF=function(...args){const pdf=new Real(...args);pdf.save=async(filename)=>{
            const response=await fetch('/test-pdf',{method:'POST',headers:{'X-Filename':encodeURIComponent(filename)},body:pdf.output('arraybuffer')});
            if(!response.ok)throw Error('PDF capture failed');window.__savedFilename=filename;
          };return pdf;};
          const capture=window.html2canvas;window.html2canvas=(page,options)=>{window.__captured=document.querySelector('#report').innerText;return capture(page,options);};
        </script><script type="module"`);
        res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);
      }
      if(/^\/(js|css|assets)\//.test(path)&&!path.includes('..')){
        res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(path)]||'application/octet-stream');return res.end(readFileSync(new URL('.'+path,root)));
      }
      res.writeHead(404);res.end();
    }catch(error){json({error:String(error)},500);}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {h,id,source,exports,apiCalls,url:`http://127.0.0.1:${server.address().port}`,setRunner:html=>{runner=html;},
    close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));h.db.sqlite.close();}};
}
