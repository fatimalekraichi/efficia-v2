import {jsonResponse, requireAdminSession, requireOrdersDb, requireSameOriginMutation} from '../../admin/_shared.js';
import {collectCompetitors, COMPETITOR_QUALIFICATION_VERSION} from '../../lib/collectCompetitors.js';
import {resolveGeographicAnchor, buildGeographicAnchorRecord} from '../../lib/geographicAnchor.js';
import {normalizeIdentity, searchIdentity, defaultPriorities, validatePriorities, reportReady, PRIORITY_FIELDS, saveReportTextOverrides, markNoListingTextsForReview, noListingPdfFilename} from '../../../js/no-listing-model.js';

const uuid = value => typeof value === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
const reply = (body,status=200) => jsonResponse(body,status,{'Cache-Control':'no-store'});
const rowData = row => ({id:row.dossier_id,captureId:row.capture_id,status:row.status,revision:row.revision,
  data:JSON.parse(row.status === 'finalized' ? row.snapshot_json : row.data_json),
  createdAt:row.created_at,updatedAt:row.updated_at,finalizedAt:row.finalized_at,pdfFilename:row.pdf_filename});

async function capture(db,id) {
  if (!uuid(id)) return null;
  return db.prepare(`SELECT c.* FROM diagnostic_lead_captures c WHERE c.idempotency_key=? AND c.submitted_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM diagnostic_requests d WHERE d.idempotency_key=c.idempotency_key)`).bind(id).first();
}
export async function onRequestGet(context) {
  const auth=await requireAdminSession(context); if(!auth.ok) return auth.response;
  const db=requireOrdersDb(context.env), params=new URL(context.request.url).searchParams;
  if(params.has('captureId')) {
    const source=await capture(db,params.get('captureId'));
    if(!source) return reply({success:false,error:'REQUEST_NOT_FOUND'},404);
    const existing=await db.prepare('SELECT * FROM no_listing_diagnostics WHERE capture_id=?').bind(source.idempotency_key).first();
    return reply({success:true,dossier:existing ? rowData(existing) : null,source:{...JSON.parse(source.request_details_json),reviewReason:source.review_reason}});
  }
  if(params.has('id')) {
    if(!uuid(params.get('id'))) return reply({success:false,error:'INVALID_ID'},400);
    const row=await db.prepare('SELECT * FROM no_listing_diagnostics WHERE dossier_id=?').bind(params.get('id')).first();
    return row ? reply({success:true,dossier:rowData(row)}) : reply({success:false,error:'NOT_FOUND'},404);
  }
  const rows=await db.prepare('SELECT * FROM no_listing_diagnostics ORDER BY updated_at DESC LIMIT 200').all();
  const completedCaptures=await db.prepare(`SELECT COUNT(*) AS count FROM no_listing_diagnostics n
    WHERE n.status='finalized' AND n.capture_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM diagnostic_requests d WHERE d.idempotency_key=n.capture_id)`).first();
  return reply({success:true,dossiers:(rows.results || []).map(rowData),completedCaptureCount:Number(completedCaptures?.count || 0)});
}
async function update(db,row,data,status='draft',filename=null) {
  const now=new Date().toISOString(), serialized=JSON.stringify(data);
  const result=await db.prepare(`UPDATE no_listing_diagnostics SET data_json=?, status=?, revision=revision+1,
    updated_at=?, snapshot_json=?, pdf_filename=?, finalized_at=? WHERE dossier_id=? AND revision=? AND status='draft'`)
    .bind(serialized,status,now,status==='finalized'?serialized:null,filename,status==='finalized'?now:null,row.dossier_id,row.revision).run();
  if(Number(result.meta?.changes ?? result.changes)!==1) return null;
  return db.prepare('SELECT * FROM no_listing_diagnostics WHERE dossier_id=?').bind(row.dossier_id).first();
}
export async function onRequestPost(context) {
  const auth=await requireAdminSession(context); if(!auth.ok) return auth.response;
  const origin=requireSameOriginMutation(context.request); if(!origin.ok) return origin.response;
  const db=requireOrdersDb(context.env);
  let body;
  try { const text=await context.request.text(); if(text.length>24000) throw Error(); body=JSON.parse(text); }
  catch { return reply({success:false,error:'INVALID_REQUEST'},400); }
  try {
    if(body.action==='create') {
      if(!uuid(body.idempotencyKey) || (body.captureId && !uuid(body.captureId))) throw Error('INVALID_ID');
      const identity=normalizeIdentity(body.data);
      if(body.confirmed!==true) throw Error('ABSENCE_CONFIRMATION_REQUIRED');
      const existing=await db.prepare('SELECT * FROM no_listing_diagnostics WHERE idempotency_key=? OR capture_id=?')
        .bind(body.idempotencyKey,body.captureId || null).first();
      if(existing) return reply({success:true,dossier:rowData(existing)});
      if(body.captureId && !await capture(db,body.captureId)) return reply({success:false,error:'REQUEST_NOT_FOUND'},404);
      const data={...identity,version:1,priorities:null,collection:{status:'uncollected'}};
      const now=new Date().toISOString();
      await db.prepare(`INSERT INTO no_listing_diagnostics (dossier_id,idempotency_key,capture_id,data_json,created_at,updated_at)
        VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING`).bind(crypto.randomUUID(),body.idempotencyKey,body.captureId || null,JSON.stringify(data),now,now).run();
      const row=await db.prepare('SELECT * FROM no_listing_diagnostics WHERE idempotency_key=? OR capture_id=?').bind(body.idempotencyKey,body.captureId || null).first();
      return reply({success:true,dossier:rowData(row)},201);
    }
    if(!uuid(body.id)) throw Error('INVALID_ID');
    const row=await db.prepare('SELECT * FROM no_listing_diagnostics WHERE dossier_id=?').bind(body.id).first();
    if(!row) return reply({success:false,error:'NOT_FOUND'},404);
    if(body.action==='duplicate') {
      if(row.status!=='finalized')return reply({success:false,error:'SOURCE_NOT_FINALIZED'},409);
      if(!uuid(body.idempotencyKey))throw Error('INVALID_ID');
      // Same principle as duplicateQuestionnaireSnapshot: facts survive, narrative overrides do not.
      const key=`duplicate:${row.dossier_id}:${body.idempotencyKey}`;
      const existing=await db.prepare('SELECT * FROM no_listing_diagnostics WHERE idempotency_key=?').bind(key).first();
      if(existing)return reply({success:true,dossier:rowData(existing)});
      const source=JSON.parse(row.snapshot_json), identity=normalizeIdentity(source);
      const automaticPriorities=defaultPriorities(identity,source.collection);
      const data={...identity,collection:source.collection,sourceDossierId:row.dossier_id,
        version:(Number.isSafeInteger(source.version)?source.version:1)+1,
        automaticPriorities,priorities:automaticPriorities,priorityOverrides:[],reportTextOverrides:{}};
      const now=new Date().toISOString();
      await db.prepare(`INSERT INTO no_listing_diagnostics (dossier_id,idempotency_key,data_json,created_at,updated_at)
        VALUES (?,?,?,?,?) ON CONFLICT(idempotency_key) DO NOTHING`)
        .bind(crypto.randomUUID(),key,JSON.stringify(data),now,now).run();
      const duplicate=await db.prepare('SELECT * FROM no_listing_diagnostics WHERE idempotency_key=?').bind(key).first();
      return reply({success:true,dossier:rowData(duplicate)},201);
    }
    if(row.status==='finalized') return reply({success:false,error:'FINALIZED_READ_ONLY'},409);
    if(body.revision!==row.revision) return reply({success:false,error:'REVISION_CONFLICT'},409);
    const data=JSON.parse(row.data_json);
    let changed;
    if(body.action==='save') {
      const identity=normalizeIdentity(body.data);
      const next={...data,...identity,priorities:body.data.priorities == null ? data.priorities : validatePriorities(body.data.priorities)};
      if(next.priorities) {
        const automatic=data.automaticPriorities || defaultPriorities(data,data.collection);
        next.priorityOverrides=next.priorities.map((p,index)=>Object.fromEntries(Object.keys(PRIORITY_FIELDS)
          .filter(key=>p[key]!==automatic[index][key]).map(key=>[key,p[key]])));
      }
      if(searchIdentity(next)!==searchIdentity(data)) next.collection={...data.collection,status:'stale'};
      if(next.priorities) {
        next.automaticPriorities=defaultPriorities(next,next.collection);
        next.priorities=next.automaticPriorities.map((p,i)=>({...p,...next.priorityOverrides[i]}));
      }
      next.reportTextOverrides=Object.hasOwn(body.data,'reportTextValues')
        ? saveReportTextOverrides(next,body.data.reportTextValues)
        : markNoListingTextsForReview(next);
      changed=await update(db,row,next);
    } else if(body.action==='collect') {
      if(body.zoneConfirmed!==true) throw Error('ZONE_CONFIRMATION_REQUIRED');
      // Reserve a revision before network I/O: a retry/concurrent save cannot publish stale results.
      const reserved=await update(db,row,{...data,collection:{...data.collection,status:'collecting'}});
      if(!reserved) return reply({success:false,error:'REVISION_CONFLICT'},409);
      let observation, failure;
      try {
        const anchor=await resolveGeographicAnchor({confirmedSearchZone:{city:data.searchCity,countryCode:data.searchCountryCode},apiKey:context.env.OUTSCRAPER_API_KEY});
        if(!anchor.ok || !anchor.coordinates || !anchor.coordinates.split(',').every(v=>v.trim() && Number.isFinite(Number(v)))) failure='LOCALITY_UNAVAILABLE';
        else {
          const result=await collectCompetitors({activite:data.activity,ville:data.searchCity,requete:data.query,
            coordinates:anchor.coordinates,region:anchor.region,apiKey:context.env.OUTSCRAPER_API_KEY,observationOnly:true,suppressSensitiveLogs:true});
          if(!result.ok) failure='COLLECTION_UNAVAILABLE';
          else if(result.concurrents.some(c=>c.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()===data.company.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim())) failure='POSSIBLE_EXISTING_LISTING';
          else {
            const observedAt=new Date().toISOString();
            observation={status:'success',searchIdentity:searchIdentity(data),query:data.query,city:data.searchCity,countryCode:data.searchCountryCode,
              observedAt,competitors:result.concurrents,qualificationVersion:COMPETITOR_QUALIFICATION_VERSION,
              anchor:buildGeographicAnchorRecord(anchor,observedAt)};
          }
        }
      } catch { failure='COLLECTION_UNAVAILABLE'; }
      const next={...data,collection:observation || {...data.collection,status:'failed',error:failure}};
      if(observation) {
        next.automaticPriorities=defaultPriorities(data,observation);
        next.priorities=next.automaticPriorities.map((p,i)=>({...p,...data.priorityOverrides?.[i]}));
      }
      next.reportTextOverrides=markNoListingTextsForReview(next);
      changed=await update(db,reserved,next);
      if(!changed) return reply({success:false,error:'REVISION_CONFLICT'},409);
      return reply({success:!failure,...(failure?{error:failure}:{}),dossier:rowData(changed)},failure?502:200);
    } else if(body.action==='finalize') {
      if(!reportReady(data)) throw Error('COLLECTION_REQUIRED');
      validatePriorities(data.priorities);
      changed=await update(db,row,data,'finalized',noListingPdfFilename(data));
    } else throw Error('INVALID_ACTION');
    return changed ? reply({success:true,dossier:rowData(changed)}) : reply({success:false,error:'REVISION_CONFLICT'},409);
  } catch(error) {
    const safe=['INVALID_TEXT','REQUIRED_FIELD','COUNTRY_REQUIRED','ABSENCE_CONFIRMATION_REQUIRED','INVALID_WEBSITE','THREE_PRIORITIES_REQUIRED','ZONE_CONFIRMATION_REQUIRED','COLLECTION_REQUIRED','INVALID_ID','INVALID_ACTION'];
    if(safe.includes(error.message)) return reply({success:false,error:error.message},400);
    console.error('no-listing-diagnostic: storage or input failure');
    return reply({success:false,error:'SAVE_FAILED'},500);
  }
}
