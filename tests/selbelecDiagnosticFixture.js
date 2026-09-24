// Données synthétiques de contrôle ; toutes les API sont interceptées localement.
export const selbelecDiagnosticScript = String.raw`(async()=>{try{
for(let i=0;i<250&&analysisIdContexteAdminHydrate!==analysisIdDepuisUrl();i++)await new Promise(r=>setTimeout(r,20));
if(analysisIdContexteAdminHydrate!==analysisIdDepuisUrl())throw Error('Contexte fixture non chargé');
const fields={'p-entreprise':'Selbelec','p-contact':'','p-ville':'Bruxelles','p-activite':'Électricien','d-requete':'Électricien Bruxelles','d-zone-recherche':'Bruxelles','d-zone-pays':'BE','d-note':'5','d-avis':'6','d-photos':'1','d-desclen':'0','d-position':'0','d-services':'0'};
for(const[id,value]of Object.entries(fields))document.getElementById(id).value=value;
for(const[i,avis]of [96,217,551].entries())for(const[k,v]of Object.entries({nom:'Concurrent '+(i+1),avis,note:4.6,photos:35}))document.getElementById('dc-'+k+'-'+(i+1)).value=v;
donneesAnalyse.competitorQualificationStatus='qualified';donneesAnalyse.competitorQualificationVersion='competitor-qualification-v1';
donneesAnalyse.derniereRequeteAnalysee='Électricien Bruxelles';donneesAnalyse.requeteTestee='Électricien Bruxelles';donneesAnalyse.positionKind='organic';
donneesAnalyse.zoneGeographique={locality:{city:'Bruxelles',countryCode:'BE'},geocodedCity:'Brussels',geocodedCountryCode:'BE'};
collecteDiagnosticValidee=true;
auditPublicIdActif="selbelec-control-fixture";
const low=['varietePhotos','logoCouverture','categoriesSecondaires','volumeAvis','tauxReponseAvis','descriptionRemplie','descriptionQualite','servicesPresents','servicesDecrits','liensAction','questionsReponses','nombrePhotos','classementLocal'];
for(const cr of GRILLE.flatMap(c=>c.criteres)){
const inputs=[...document.querySelectorAll('input[name="c'+cr.id+'"]')].filter(e=>!e.dataset.special&&Number.isFinite(Number(e.value)));
inputs.sort((a,b)=>low.includes(cr.key)?Number(a.value)-Number(b.value):Number(b.value)-Number(a.value));
if(inputs[0]){inputs[0].checked=true;inputs[0].dispatchEvent(new Event('change',{bubbles:true}));}}
const mode=document.querySelector('input[name="condition-location-mode"][value="service_area"]');mode.checked=true;mode.dispatchEvent(new Event('change',{bubbles:true}));
const zone=document.querySelector('input[name="location-service-area"][value="not_verifiable"]');zone.checked=true;zone.dispatchEvent(new Event('change',{bubbles:true}));
if(!genererRapport({exigerVersion:false}))throw Error('rendu refusé');
await document.fonts.ready;
const pages=[...document.querySelectorAll('#rapport-contenu .page')];
const candidates=GRILLE.flatMap(c=>c.criteres).filter(c=>lirePoints(c.id)!==null&&lirePoints(c.id)<c.max).map(critere=>({critere,points:lirePoints(critere.id),perdu:critere.max-lirePoints(critere.id)}));
const priorities=selectionnerPrioritesDynamiques(candidates).map(narrationPrioriteV3);
let pdf;
if(window.__workflowFixture.capturePdf){
const {jsPDFCtor,html2canvasFn}=await assurerLibrairiesPDF();pdf=new jsPDFCtor({unit:'mm',format:'a4',orientation:'portrait'});
for(const[i,page]of pages.entries()){const canvas=await html2canvasFn(page,optionsCapturePdfDiagnostic());if(i)pdf.addPage('a4','portrait');pdf.addImage(canvas.toDataURL('image/jpeg',.98),'JPEG',0,0,210,297);ajouterLiensPdfPourPage(pdf,page);}
}
document.getElementById('workflow-browser-result').textContent=JSON.stringify({preview:pages.map(p=>p.innerText),layout:pages.map(p=>mesuresPageRapport(p)),detail:calculScoreDetail(),priorities,links:[...pages.at(-1).querySelectorAll('a')].map(a=>({text:a.innerText,href:a.href,color:getComputedStyle(a).color,background:getComputedStyle(a).backgroundColor})),pdf:pdf?.output('datauristring').split(',')[1],fetchCalls:window.__workflowFetchCalls});
}catch(e){document.getElementById('workflow-browser-result').textContent=JSON.stringify({error:String(e.stack||e)});}})();`;
