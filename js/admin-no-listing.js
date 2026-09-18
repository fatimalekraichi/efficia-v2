import {reportNarrativeTextMaxLength} from './report-narrative-fields.js';
import {PRIORITY_FIELDS, normalizeIdentity, validatePriorities, reportReady, defaultPriorities, NO_LISTING_TEXT_FIELDS, automaticReportTexts, noListingPdfFilename} from './no-listing-model.js';
import {escapeHtml, competitionHtml, renderNoListingReport, createNoListingPdf} from './no-listing-report.js';

const form=document.querySelector('#identity'), editor=document.querySelector('#priorities'), error=document.querySelector('#error'), status=document.querySelector('#status');
const report=document.querySelector('#report'), query=new URLSearchParams(location.search), captureId=query.get('captureId') || null;
let dossier=null, busy=false, dirty=false, textDirty=false;
const textEditor=document.querySelector('#report-text-editor');
const creationKey=crypto.randomUUID();
const errors={
  UNAUTHORIZED:'Votre session a expiré. Reconnectez-vous.', REVISION_CONFLICT:'Ce dossier a changé dans un autre onglet. Rechargez-le avant de continuer.',
  FINALIZED_READ_ONLY:'Ce rapport est finalisé et reste en lecture seule.', SAVE_FAILED:'L’enregistrement a échoué. Vos modifications restent dans les champs ; réessayez.',
  LOCALITY_UNAVAILABLE:'La localité n’a pas pu être vérifiée. Vérifiez la zone et le pays, puis relancez.',
  COLLECTION_UNAVAILABLE:'La recherche concurrentielle est indisponible. Aucun rapport complet ne peut être généré. Vous pouvez relancer la recherche.',
  POSSIBLE_EXISTING_LISTING:'Une fiche portant le nom de l’entreprise a été trouvée. Vérifiez s’il faut utiliser le diagnostic classique avant de continuer.',
  COLLECTION_REQUIRED:'Une recherche réussie et à jour est nécessaire avant de générer le rapport.',
  ABSENCE_CONFIRMATION_REQUIRED:'Choisissez et confirmez explicitement le contexte d’absence de fiche.',
  ZONE_CONFIRMATION_REQUIRED:'Confirmez la zone et le pays visés par la requête.',
};
async function api(payload,params='') {
  const response=await fetch('/api/admin/no-listing-diagnostics'+params,{method:payload?'POST':'GET',credentials:'same-origin',cache:'no-store',
    headers:payload?{'Content-Type':'application/json'}:{Accept:'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});
  const result=await response.json();
  if(result.dossier) dossier=result.dossier;
  if(!response.ok || !result.success) throw Error(errors[result.error] || 'L’opération a échoué. Vérifiez les champs et réessayez.');
  return result;
}
function currentData() {
  const identity=normalizeIdentity(Object.fromEntries(new FormData(form)));
  const fields=[...editor.querySelectorAll('fieldset')];
  const priorities=fields.length ? validatePriorities(fields.map(field=>Object.fromEntries(Object.keys(PRIORITY_FIELDS).map(key=>[key,field.querySelector(`[data-field="${key}"]`).value])))) : null;
  const reportTextValues=Object.fromEntries([...textEditor.querySelectorAll('[data-report-text]')].map(el=>[el.dataset.reportText,el.value]));
  return {...identity,priorities,...(textDirty?{reportTextValues}:{})};
}
function buttons() {
  const finalized=dossier?.status==='finalized';
  form.querySelectorAll('input,select,button').forEach(el=>el.disabled=busy || finalized);
  editor.querySelectorAll('textarea,button').forEach(el=>el.disabled=busy || finalized);
  textEditor.querySelectorAll('textarea,button').forEach(el=>el.disabled=busy || finalized);
  document.querySelector('#edit-texts').disabled=busy || finalized || !dossier?.data.priorities;
  const ready=reportReady(dossier?.data) && !dirty;
  document.querySelector('#preview').disabled=busy || !ready;
  document.querySelector('#export').disabled=busy || !ready;
  document.querySelector('#export').textContent=finalized?'Régénérer le PDF':'Générer le PDF et finaliser';
}
function fill() {
  for(const [key,value] of Object.entries(dossier.data)) if(form.elements[key]) form.elements[key].value=value;
  document.querySelector('#mode-confirmed').checked=true;
  if(dossier.data.priorities) {
    editor.innerHTML='<h2>Les trois priorités</h2>'+dossier.data.priorities.map((p,i)=>`<fieldset><legend>Priorité ${i+1}</legend>${Object.entries(PRIORITY_FIELDS).map(([key,max])=>`<label>${escapeHtml({title:'Titre',finding:'Constat et recommandation',actions:'Actions précises',benefit:'Bénéfice attendu'}[key])}<textarea data-field="${key}" maxlength="${max}" rows="${key==='title'?2:4}">${escapeHtml(p[key])}</textarea><small data-counter>${p[key].length} / ${max}</small><button class="admin-button is-secondary" type="button" data-restore-priority="${i}" data-restore-field="${key}">Rétablir le texte automatique</button></label>`).join('')}</fieldset>`).join('');
  }
  const collection=dossier.data.collection;
  document.querySelector('#observations').innerHTML=collection.status==='success'?competitionHtml(collection):`<p>${escapeHtml(errors[collection.error] || ({uncollected:'Recherche non effectuée.',collecting:'Recherche interrompue ou en cours. Relancez-la si nécessaire.',stale:'La requête ou la zone a changé. Relancez la recherche.',failed:'La collecte a échoué. Relancez la recherche.'}[collection.status]))}</p>`;
  const automatic=automaticReportTexts(dossier.data);
  document.querySelector('#report-text-fields').innerHTML=Object.entries(NO_LISTING_TEXT_FIELDS).map(([id,label])=>{
    const override=dossier.data.reportTextOverrides?.[id];
    return `<fieldset><legend>${escapeHtml(label)}</legend>${override?`<span class="admin-badge">Texte personnalisé</span>${override.needsReview?'<span class="admin-badge">À revérifier</span>':''}`:''}
      <p><strong>Texte automatique</strong><br>${escapeHtml(automatic[id])}</p>
      <label>Texte personnalisé<textarea data-report-text="${id}" maxlength="${Math.max(reportNarrativeTextMaxLength(id,automatic[id]),(override?.customText || '').length)}" rows="4" placeholder="Laisser vide pour utiliser le texte automatique">${escapeHtml(override?.customText || '')}</textarea></label>
      <button type="button" class="admin-button is-secondary" data-restore-text="${id}">Supprimer la personnalisation</button></fieldset>`;
  }).join('');
  dirty=false;textDirty=false;buttons();
  status.textContent=dossier.status==='finalized'?'Rapport finalisé — consultation en lecture seule. Aucun envoi d’e-mail.':'Dossier enregistré. La génération du PDF n’envoie aucun e-mail.';
}
async function save() {
  if(!form.reportValidity()) throw Error('Complétez les informations requises.');
  const data=currentData();
  if(!document.querySelector('#mode-confirmed').checked) throw Error(errors.ABSENCE_CONFIRMATION_REQUIRED);
  if(!dossier) {
    await api({action:'create',idempotencyKey:creationKey,captureId,confirmed:true,data});
    history.replaceState(null,'',`?id=${encodeURIComponent(dossier.id)}`);
  } else await api({action:'save',id:dossier.id,revision:dossier.revision,data});
  fill();
}
async function run(action) {
  if(busy)return;
  error.textContent='';
  // Read inputs before disabling them: disabled controls are absent from FormData.
  busy=true;status.textContent='Traitement en cours…';
  document.querySelectorAll('button').forEach(button=>button.disabled=true);
  try {await action();} catch(e){error.textContent=e.message || 'Une erreur est survenue. Réessayez.';status.textContent='Opération non terminée.';}
  finally{busy=false;buttons();}
}
form.addEventListener('submit',event=>{event.preventDefault();run(save);});
document.querySelector('#suggest-query').addEventListener('click',()=>{
  if(!form.elements.searchCity.value)form.elements.searchCity.value=form.elements.city.value;
  if(!form.elements.searchCountryCode.value)form.elements.searchCountryCode.value=form.elements.countryCode.value;
  form.elements.query.value=[form.elements.activity.value,form.elements.searchCity.value].filter(Boolean).join(' ');
  document.querySelector('#zone-confirmed').checked=false;dirty=true;report.hidden=true;buttons();
});
const onInput=event=>{
  dirty=true;report.hidden=true;
  if(['company','activity','query','searchCity','searchCountryCode'].includes(event.target.name))document.querySelector('#zone-confirmed').checked=false;
  if(event.target.matches('textarea[data-field]'))event.target.parentElement.querySelector('[data-counter]').textContent=`${event.target.value.length} / ${event.target.maxLength}`;
  buttons();
};
form.addEventListener('input',onInput);editor.addEventListener('input',onInput);
document.querySelector('#edit-texts').addEventListener('click',()=>{textEditor.hidden=!textEditor.hidden;});
textEditor.addEventListener('input',()=>{textDirty=true;dirty=true;report.hidden=true;buttons();});
textEditor.addEventListener('click',event=>{
  const id=event.target.closest('[data-restore-text]')?.dataset.restoreText;
  if(!id)return;
  const field=[...textEditor.querySelectorAll('[data-report-text]')].find(el=>el.dataset.reportText===id);
  field.value='';field.dispatchEvent(new Event('input',{bubbles:true}));
});
textEditor.addEventListener('submit',event=>{event.preventDefault();run(async()=>{
  await save();renderNoListingReport(dossier.data,report);status.textContent='Textes enregistrés. Aperçu mis à jour.';
});});
editor.addEventListener('click',event=>{
  const button=event.target.closest('[data-restore-priority]');if(!button)return;
  const index=Number(button.dataset.restorePriority),key=button.dataset.restoreField;
  const field=editor.querySelectorAll('fieldset')[index].querySelector(`[data-field="${key}"]`);
  field.value=defaultPriorities(dossier.data,dossier.data.collection)[index][key];
  field.dispatchEvent(new Event('input',{bubbles:true}));
});
document.querySelector('#collect').addEventListener('click',()=>run(async()=>{
  if(!document.querySelector('#zone-confirmed').checked)throw Error(errors.ZONE_CONFIRMATION_REQUIRED);
  await save();
  status.textContent='Recherche concurrentielle en cours…';buttons();
  try{await api({action:'collect',id:dossier.id,revision:dossier.revision,zoneConfirmed:true});}
  finally{fill();}
}));
document.querySelector('#preview').addEventListener('click',()=>run(async()=>{
  renderNoListingReport(dossier.data,report);report.scrollIntoView({behavior:'smooth'});status.textContent='Aperçu prêt.';
}));
document.querySelector('#export').addEventListener('click',()=>run(async()=>{
  if(dirty)throw Error('Enregistrez les modifications avant export.');
  buttons();
  status.textContent='Génération du PDF en cours…';
  const pdf=await createNoListingPdf(dossier.data,report);
  if(dossier.status!=='finalized')await api({action:'finalize',id:dossier.id,revision:dossier.revision});
  await pdf.save(noListingPdfFilename(dossier.data),{returnPromise:true});
  fill();status.textContent='PDF généré et dossier finalisé. Aucun e-mail envoyé.';
}));
async function initialize() {
  try {
    if(query.has('id')){await api(null,`?id=${encodeURIComponent(query.get('id'))}`);fill();}
    else if(captureId){
      const result=await api(null,`?captureId=${encodeURIComponent(captureId)}`);
      if(dossier)fill();
      else {
        for(const key of ['company','city','countryCode','website']) if(result.source[key])form.elements[key].value=result.source[key];
        form.elements.searchCity.value=form.elements.city.value;form.elements.searchCountryCode.value=form.elements.countryCode.value;
        document.querySelector('#source-context').textContent='Demande reçue : '+({declared_absent:'absence déclarée, à vérifier',not_found:'fiche non trouvée, à vérifier',unavailable:'recherche indisponible ; aucune conclusion sur l’existence de la fiche',ambiguous:'plusieurs résultats à vérifier',unresolved:'correspondance incertaine'}[result.source.reviewReason] || 'à vérifier');
      }
    }
    buttons();
  } catch(e){error.textContent=e.message;form.querySelectorAll('button').forEach(b=>b.disabled=true);}
}
initialize();
