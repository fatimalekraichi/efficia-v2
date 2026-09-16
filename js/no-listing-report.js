import {ABSENCE_CONTEXTS, reportReady, validatePriorities} from './no-listing-model.js';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CATEGORY_FR = Object.freeze({electrician:'Électricien', 'electrical installation service':'Service d’installation électrique', 'electrical contractor':'Entreprise d’électricité'});
export const categoryLabel = value => CATEGORY_FR[String(value).trim().toLowerCase()] || String(value);
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
  add(`<div class="nl-box"><h3>Le contexte de ce diagnostic</h3><p>${escapeHtml(ABSENCE_CONTEXTS[data.absenceContext])}</p><p>Aucune fiche de votre entreprise n’est notée. Ce rapport présente les informations concurrentielles observées et les trois priorités recommandées.</p></div>`);
  add(`<section class="nl-competition"><h2>La concurrence locale observée</h2>${competitionHtml(data.collection,{translateCategories:true})}</section>`);
  data.priorities.forEach((p,index)=>{
    const heading=suite=>`<div class="nl-priority-title" data-priority="${index+1}" data-continuation="${suite}"><span class="nl-kicker">Priorité ${index+1} / 3</span><h2>${escapeHtml(p.title)}${suite?' — suite':''}</h2></div>`;
    const fields=[['Constat et recommandation',p.finding],['Les actions à mettre en œuvre',p.actions],['Bénéfice attendu',p.benefit]];
    const fieldHtml=(label,text)=>`<p class="nl-field-label">${label}</p><p>${escapeHtml(text)}</p>`;
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
  add('<p class="nl-muted">Ces recommandations ne garantissent ni une position sur Google ni un nombre de clients.</p>');
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
