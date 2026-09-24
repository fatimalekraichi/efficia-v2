import {readFileSync} from 'node:fs';
export const selbelecRealSnapshot=JSON.parse(readFileSync(new URL('./fixtures/selbelec-real/snapshot.json',import.meta.url),'utf8'));
const restore=String.raw`
const saved=window.__workflowFixture.answers;
// Replay the immutable snapshot exactly; never recalculate answers from live collection.
donneesAnalyse=structuredClone(saved.observedData);
for(const cr of GRILLE.flatMap(c=>c.criteres)){
 const a=saved.responses[cr.key];if(!a||cr.key==='adresse')continue;
 const radio=document.querySelector('input[name="c'+cr.id+'"][data-option-index="'+a.selectedOptionIndex+'"]');
 if(radio)radio.checked=true;
 sourcesCriteres.set(cr.id,a.source||'manual');
 const el=document.getElementById('crit-'+cr.id);if(el?.querySelector('.badges'))el.querySelector('.badges').textContent=a.statut==='automatique'?'AUTO':a.statut==='pre-remplie'?'PRÉ-REMPLI':'MANUEL';
}
for(const[i,c]of saved.observedData.concurrents.entries())for(const[k,v]of Object.entries({nom:c.label,avis:c.avis,note:c.note,photos:c.photos,services:c.services,pubs:c.pubs})){
 const el=document.getElementById('dc-'+k+'-'+(i+1));if(el)el.value=v??'';
}
auditPublicIdActif=window.__workflowFixture.analysisId;
`;

export const selbelecRealScript=String.raw`(async()=>{try{
for(let i=0;i<250&&analysisIdContexteAdminHydrate!==analysisIdDepuisUrl();i++)await new Promise(r=>setTimeout(r,20));
if(analysisIdContexteAdminHydrate!==analysisIdDepuisUrl())throw Error('Contexte fixture non chargé');
`+restore+String.raw`if(!genererRapport({exigerVersion:false}))throw Error('rendu refusé');
await document.fonts.ready;
const pages=[...document.querySelectorAll('#rapport-contenu .page')];
const candidates=GRILLE.flatMap(c=>c.criteres).filter(c=>lirePoints(c.id)!==null&&lirePoints(c.id)<c.max).map(critere=>({critere,points:lirePoints(critere.id),perdu:critere.max-lirePoints(critere.id)}));
const priorities=selectionnerPrioritesDynamiques(candidates).map(narrationPrioriteV3);
let pdf;
if(window.__workflowFixture.capturePdf){
const {jsPDFCtor,html2canvasFn}=await assurerLibrairiesPDF();pdf=new jsPDFCtor({unit:'mm',format:'a4',orientation:'portrait'});
for(const[i,page]of pages.entries()){const canvas=await html2canvasFn(page,optionsCapturePdfDiagnostic());if(i)pdf.addPage('a4','portrait');pdf.addImage(canvas.toDataURL('image/jpeg',.98),'JPEG',0,0,210,297);ajouterLiensPdfPourPage(pdf,page);}
}
document.getElementById('workflow-browser-result').textContent=JSON.stringify({validatedLayout:validerMiseEnPageRapport(),responses:collecterReponses(),observed:donneesAnalyse,secondary:[...document.querySelectorAll(".v3-mini-priority")].map(p=>p.innerText),primary:document.querySelector(".v3-priority-hero")?.innerText,representatives:document.querySelectorAll(".v3-observation").length,preview:pages.map(p=>p.innerText),layout:pages.map(p=>mesuresPageRapport(p)),detail:calculScoreDetail(),priorities,links:[...pages.at(-1).querySelectorAll('a')].map(a=>({text:a.innerText,href:a.href,color:getComputedStyle(a).color,background:getComputedStyle(a).backgroundColor})),pdf:pdf?.output('datauristring').split(',')[1],fetchCalls:window.__workflowFetchCalls});
}catch(e){document.getElementById('workflow-browser-result').textContent=JSON.stringify({error:String(e.stack||e)});}})();`;
