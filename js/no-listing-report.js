import {cityWithDe, panelFacts, reviewEvidenceSentence, defaultPriorities, reportReady, validatePriorities, panelReviewSentence, automaticReportTexts, effectiveReportText} from './no-listing-model.js';
export {panelFacts, panelReviewSentence} from './no-listing-model.js';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CATEGORY_FR = Object.freeze({electrician:'Électricien', 'electrical installation service':'Service d’installation électrique', 'electrical contractor':'Entreprise d’électricité'});
export const categoryLabel = value => CATEGORY_FR[String(value).trim().toLowerCase()] || String(value);
export function presenceVerdictHtml(data) {
  const texts=automaticReportTexts(data);
  const title=effectiveReportText(data,'page1.verdict_title',texts['page1.verdict_title']);
  const intro=effectiveReportText(data,'summary.general',texts['summary.general']);
  return `<div class="nl-box nl-verdict">${title?`<div class="nl-presence"><h2>${escapeHtml(title)}</h2></div>`:''}<p>${escapeHtml(intro).replace(/\r?\n/g,'<br>')}</p></div>`;
}
export function panelSummaryHtml(collection, {indicators=false,company='',reportTextOverrides={}}={}) {
  const facts=panelFacts(collection),n=facts.count;
  const observed=n?`${n} ${n===1?'fiche Google est présentée':'fiches Google sont présentées'} dans ce diagnostic.`:'Aucune fiche concurrente qualifiée et vérifiable n’a été retenue pour cette recherche.';
  const reviews=facts.reviewed===n && n>0
    ? `${n===1?'Elle dispose':'Elles disposent'} d’avis clients.`
    : facts.reviewed>0 ? `${facts.reviewed} ${facts.reviewed===1?'fiche dispose':'fiches disposent'} d’avis clients.` : '';
  const query=collection?.query?`Sur la recherche « ${escapeHtml(collection.query)} », `:'';
  const observation=query+observed+' '+reviews;
  if(!indicators)return `<div class="nl-box nl-summary"><h2>${n?'Des concurrents déjà visibles auprès de vos futurs clients':'Une observation locale limitée'}</h2><p>${observation.trim()} ${n?'Ces informations donnent aux internautes des repères pour comparer les professionnels et choisir qui contacter.':'Ce résultat ne démontre pas l’absence de concurrence locale.'}</p><p><strong>Votre priorité :</strong> mettre en place une présence Google complète pour présenter vos services et faciliter la prise de contact.</p></div>`;
  const metric=(value,label)=>`<div class="nl-metric"><strong>${value}</strong><span>${label}</span></div>`;
  const format=(r,decimals=false)=>{const f=v=>decimals?v.toFixed(1).replace('.',','):String(v);return r.min===r.max?f(r.min):`${f(r.min)} à ${f(r.max)}`;};
  const scope=r=>r.known===n?'par fiche':`sur ${r.known} ${r.known===1?'fiche renseignée':'fiches renseignées'}`;
  return `<div class="nl-panel-summary"><div class="nl-metrics">${metric(n,`fiche${n===1?'':'s'} présentée${n===1?'':'s'}`)}${facts.reviews?metric(`${facts.reviewTotal} avis`,`sur ${facts.reviews.known} ${facts.reviews.known===1?'fiche renseignée':'fiches renseignées'}`):''}${facts.ratings?metric(format(facts.ratings,true)+'/5',`notes ${scope(facts.ratings)}`):''}</div><p>${escapeHtml(effectiveReportText({reportTextOverrides},'page2.comparison_intro',automaticReportTexts({collection,company})['page2.comparison_intro'])).replace(/\r?\n/g,'<br>')}</p><p class="nl-muted">Ces repères concernent uniquement les fiches présentées, pas l’ensemble du marché local.</p></div>`;
}
export function priorityActionsHtml(data, priority, index, text=priority.actions) {
  // Only automatic copy is reformatted. Manual wording and paragraph breaks stay intact.
  const automatic=data.automaticPriorities?.[index]?.actions ?? defaultPriorities(data,data.collection)[index]?.actions;
  if(Object.hasOwn(data.priorityOverrides?.[index] || {},'actions') || priority.actions!==automatic) return `<p>${escapeHtml(text)}</p>`;
  text=text.replaceAll(`autour de ${data.city}`,`autour ${cityWithDe(data.city)}`);
  const sentences=text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/gu);
  if(!sentences || sentences.join('')!==text || sentences.length<2)return `<p>${escapeHtml(text)}</p>`;
  const selected=index===1?sentences.slice(0,2):index===2?['Une fois votre fiche en ligne, proposer au client de partager librement son expérience avec le lien d’avis Google.',sentences.slice(1,3).map(s=>s.trim()).join(' '),'Répondre aux avis avec courtoisie.']:sentences;
  return `<ul class="nl-action-list">${selected.map(s=>`<li>${escapeHtml(s.trim())}</li>`).join('')}</ul>`;
}
export function competitionHtml(collection, {translateCategories=false}={}) {
  if(collection?.status!=='success') return '<p>La recherche doit être effectuée ou relancée avant de présenter les résultats.</p>';
  const label=value=>translateCategories?categoryLabel(value):value;
  const cards=collection.competitors.map(c=>`<div class="nl-competitor"><strong>${escapeHtml(c.name)}</strong><p>${escapeHtml(c.primary_category ? label(c.primary_category) : c.secondary_categories.map(label).join(', '))}</p><p>${c.rating == null?'Note non disponible':`${c.rating.toFixed(1).replace('.',',')}/5`} · ${c.reviews == null?'Nombre d’avis non disponible':`${c.reviews} avis`}</p><a href="${escapeHtml(c.location_link)}" target="_blank" rel="noopener">Consulter la fiche observée</a></div>`).join('');
  return `<p class="nl-muted">Recherche « ${escapeHtml(collection.query)} » · ${escapeHtml(collection.city)} / ${escapeHtml(collection.countryCode)} · Observation du ${escapeHtml(new Date(collection.observedAt).toLocaleDateString('fr-BE',{timeZone:'Europe/Brussels'}))}</p>${cards || '<p>Aucune fiche concurrente qualifiée et vérifiable n’a été retenue pour cette recherche. Ce résultat ne démontre pas l’absence de concurrence locale.</p>'}${collection.competitors.length<3?'<p class="nl-muted">Observation limitée aux données disponibles ; aucune moyenne concurrentielle n’est calculée.</p>':''}`;
}
export function renderNoListingReport(data, container) {
  if(!reportReady(data)) throw Error('La recherche n’est pas à jour. Relancez-la avant de générer le rapport.');
  validatePriorities(data.priorities);
  container.replaceChildren(); container.hidden=false;
  let content;
  const newPage=()=>{
    const page=document.createElement('article');page.className='nl-page';
    page.innerHTML='<header class="nl-header"><div class="nl-logo" role="img" aria-label="Efficia Digital"></div><span>DIAGNOSTIC DE VISIBILITÉ LOCALE<br>Sans fiche Google</span></header><div class="nl-content"></div><footer class="nl-footer"><span>Efficia Digital · Diagnostic gratuit</span><span class="nl-pagination"></span></footer>';
    container.append(page);content=page.querySelector('.nl-content');return page;
  };
  // Measure the painted descendants, not only scrollHeight (collapsed margins can lie).
  const fits=()=>{
    const bottom=content.getBoundingClientRect().bottom;
    return [...content.querySelectorAll('*')].every(el=>el.getBoundingClientRect().bottom<=bottom+0.1);
  };
  const blockFor=html=>{
    const block=document.createElement('div');block.className='nl-block';block.innerHTML=html;
    return block;
  };
  const add=html=>{
    const block=blockFor(html);
    content.append(block);
    if(!fits()){
      block.remove();if(!content.children.length) throw Error('Un bloc est trop long pour une page. Réduisez uniquement ce texte avant export.');
      newPage();content.append(block);
      if(!fits()) throw Error('Un bloc est trop long pour une page. Réduisez uniquement ce texte avant export.');
    }
  };
  newPage();
  add(`<div class="nl-kicker">Votre présence locale</div><h1>Diagnostic de visibilité locale<br>Sans fiche Google</h1><p class="nl-company">${escapeHtml(data.company)}</p><p>${escapeHtml(data.activity)} · ${escapeHtml(data.city)} / ${escapeHtml(data.countryCode)}</p>${data.website?`<p class="nl-muted">Site indiqué : ${escapeHtml(data.website)}</p>`:''}`);
  add(presenceVerdictHtml(data));
  // Keep the introduction and the observed panel on their existing separate pages.
  newPage();
  add(`<section class="nl-competition"><h2>La concurrence locale observée</h2>${competitionHtml(data.collection,{translateCategories:true})}${panelSummaryHtml(data.collection,{indicators:true,company:data.company,reportTextOverrides:data.reportTextOverrides})}</section>`);
  data.priorities.forEach((p,index)=>{
    // Keep priority 3 and the service description on their dedicated diagnostic page.
    if(index===2 && content.querySelector('.nl-priority-title'))newPage();
    const badge=['Étape essentielle','Pour faciliter le contact','Pour développer la confiance'][index];
    const reminder=['Pour disposer d’une présence sur Google Maps','','Pour donner des repères aux futurs clients'][index];
    const heading=suite=>`<div class="nl-priority-title" data-priority="${index+1}" data-continuation="${suite}"><span class="nl-kicker">Priorité ${index+1} / 3</span><span class="nl-priority-badge">${badge}</span><h2>${escapeHtml(p.title)}${suite?' — suite':''}</h2>${!suite && reminder?`<p class="nl-muted">${reminder}</p>`:''}</div>`;
    const fields=[['Constat et recommandation',p.finding],['Les actions à mettre en œuvre',p.actions],['Bénéfice attendu',p.benefit]];
    const fieldHtml=(label,text)=>`<p class="nl-field-label">${label}</p>${label==='Les actions à mettre en œuvre'?priorityActionsHtml(data,p,index,text):`<p>${escapeHtml(text)}</p>`}`;
    const whole=blockFor(heading(false)+fields.map(([label,text])=>fieldHtml(label,text)).join(''));
    content.append(whole);
    if(fits()) return;
    whole.remove();if(content.children.length)newPage();
    content.append(whole);
    if(fits()) return;
    whole.remove();
    // Only an overlong priority is split. Every continuation repeats its own title.
    let fragment=blockFor(heading(false));content.append(fragment);
    const continuation=()=>{newPage();fragment=blockFor(heading(true));content.append(fragment);};
    for(const [label,text] of fields){
      let rest=text;
      while(rest){
        const part=document.createElement('div');part.innerHTML=fieldHtml(label,rest);fragment.append(part);
        if(fits()) break;
        part.remove();
        if(fragment.children.length>1){continuation();continue;}
        // Preserve all characters, splitting only at whitespace when possible.
        let lo=0,hi=rest.length;
        fragment.append(part);
        while(lo<hi){const mid=Math.ceil((lo+hi)/2);part.innerHTML=fieldHtml(label,rest.slice(0,mid));if(fits())lo=mid;else hi=mid-1;}
        if(!lo)throw Error('Le titre personnalisé ne laisse pas de place au texte. Raccourcissez uniquement ce titre.');
        const prefix=rest.slice(0,lo), paragraph=prefix.lastIndexOf('\n\n');
        const boundary=paragraph>0 ? paragraph : prefix.search(/\s+\S*$/);
        const cut=boundary>0?boundary:lo;
        part.innerHTML=fieldHtml(label,rest.slice(0,cut));rest=rest.slice(cut);
        continuation();
      }
    }
  });
  add('<div class="nl-box nl-service"><p>Vous préférez nous confier ces étapes ? Découvrez les deux formules à la page suivante.</p></div>');
  add('<p class="nl-muted">Ces recommandations ne garantissent ni une position sur Google ni un nombre de clients. L’accompagnement à la validation ne garantit pas la validation par Google.</p>');
  // One final commercial page; preceding diagnostic pages remain unchanged.
  newPage().classList.add('nl-commercial');
  add(`<h1>Vous préférez nous confier la mise en place ?</h1>
    <p class="nl-commercial-intro">Vous avez les premières étapes. Nous pouvons prendre en charge la création et la configuration de votre fiche, avec votre participation pour les informations et la validation demandées par Google.</p>
    <div class="nl-offer-grid"><article class="nl-offer nl-offer--primary" data-offer="visibility">
      <span class="nl-offer-tag">Pack Visibilité</span><div class="nl-offer-price">349 € <small>TTC</small></div>
      <h2>Création et optimisation de votre fiche</h2>
      <ul>
        <li>Vérification d’une éventuelle fiche existante</li>
        <li>Création ou aide à la récupération de la fiche</li>
        <li>Catégories, description et services</li>
        <li>Coordonnées, horaires et zone desservie</li>
        <li>Ajout de vos photos fournies</li>
        <li>Optimisation initiale</li>
        <li>Accompagnement à la validation Google</li>
      </ul>
      <a class="nl-offer-cta nl-offer-cta--primary" href="https://efficiadigital.com/achat?offre=visibility">Choisir le Pack Visibilité</a>
    </article>
    <article class="nl-offer" data-offer="performance">
      <span class="nl-offer-tag">Pack Performance</span><div class="nl-offer-price">499 € <small>TTC</small></div>
      <h2>Mise en place + suivi pendant un mois</h2>
      <ul>
        <li>Tout le Pack Visibilité inclus</li>
        <li>Contrôle des informations publiées</li>
        <li>Ajustements nécessaires pendant 30 jours</li>
        <li>Conseils pour recueillir les premiers avis authentiques</li>
        <li>Analyse des premières données disponibles</li>
        <li>Bilan personnalisé à 30 jours et recommandations</li>
      </ul>
      <a class="nl-offer-cta" href="https://efficiadigital.com/achat?offre=performance">Choisir le Pack Performance</a>
    </article></div>
    <p class="nl-trust">Diagnostic offert, sans engagement. Vous restez propriétaire de votre fiche. Aucun faux avis : les interventions respectent les règles de Google.</p>
    <div class="nl-offer-note"><p>Validation et délais dépendants de Google.</p>
      <p>Le suivi de 30 jours commence lorsque la fiche est validée et visible.</p>
      <p>Assistance sur les difficultés courantes ; résolution des suspensions et litiges non garantie.</p>
      <p>Les données du premier mois peuvent être limitées pour une nouvelle fiche.</p></div>`);
  const pages=[...container.querySelectorAll('.nl-page')];
  pages.forEach((page,index)=>page.querySelector('.nl-pagination').textContent=`${index+1} / ${pages.length}`);
  return pages;
}
const PDF_SOURCES={
  html2canvas:['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js','https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'],
  jspdf:['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js','https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'],
};
async function loadLibrary(name,available) {
  if(available()) return;
  for(const src of PDF_SOURCES[name]) {
    try { await new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=src;
      const timer=setTimeout(()=>{script.remove();reject(Error('library timeout'));},12000);
      script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('library unavailable'));};document.head.append(script);
    }); if(available()) return; } catch { /* Try the second official distribution. */ }
  }
  throw Error('La bibliothèque PDF est indisponible. Aucun rapport n’a été finalisé. Réessayez.');
}
export async function createNoListingPdf(data,container) {
  await loadLibrary('jspdf',()=>Boolean(window.jspdf?.jsPDF));
  await loadLibrary('html2canvas',()=>typeof window.html2canvas==='function');
  await document.fonts.ready;
  const logo=new Image();logo.src='/assets/logo/logo-efficia-web.png';await logo.decode();
  const pages=renderNoListingReport(data,container);
  const pdf=new window.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  for(let i=0;i<pages.length;i++) {
    const page=pages[i];
    const content=page.querySelector('.nl-content'), bottom=content.getBoundingClientRect().bottom;
    if([...content.querySelectorAll('*')].some(el=>el.getBoundingClientRect().bottom>bottom+0.1)) throw Error('Le contenu dépasse la page. Export interrompu.');
    const canvas=await window.html2canvas(page,{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false,scrollX:0,scrollY:0});
    if(i)pdf.addPage();pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,210,297,undefined,'FAST');
    const rect=page.getBoundingClientRect();
    page.querySelectorAll('a[href]').forEach(link=>{const r=link.getBoundingClientRect();pdf.link((r.left-rect.left)/rect.width*210,(r.top-rect.top)/rect.height*297,r.width/rect.width*210,r.height/rect.height*297,{url:link.href});});
  }
  return pdf;
}
