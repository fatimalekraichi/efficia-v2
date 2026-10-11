import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {runAdminBrowserHarness} from '../tests/freeDiagnosticBrowserFixture.js';
// Offline replay of the immutable real snapshot: the harness intercepts every API call.
// No collection, remote database, publication or outbound prospect message.
if(process.argv.includes('--real-sarland')){
 const folder=new URL('../output/sarland-reel/',import.meta.url);
 const saved=JSON.parse(readFileSync(new URL('finalisation-reelle.json',folder),'utf8')).snapshot;
 for(const confirmed of process.argv.includes('--v5')?[false]:(process.argv.includes('--v3')||process.argv.includes('--v4'))?[false,true]:[false]){
 const answers=structuredClone(saved.answers);
 answers.observedData.operatorObservedAt=saved.finalizedAt;
 const script=String.raw`(async()=>{try{
 for(let i=0;i<250&&analysisIdContexteAdminHydrate!==analysisIdDepuisUrl();i++)await new Promise(r=>setTimeout(r,20));
 if(window.__workflowFixture.confirmOrganic){
   document.getElementById('rang-organique-date').value=window.__workflowFixture.confirmationDate;
   const checkbox=document.getElementById('rang-organique-confirme');checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));
 }
 const before=calculScoreDetail().total;
 const libs=await assurerLibrairiesPDF();
 let captured=null;
 // Capture exactly the bytes passed by telechargerPDF to save, not a browser print.
 libs.jsPDFCtor.API.save=function(){captured=this.output('datauristring').split(',')[1];return this;};
 const ok=await telechargerPDF();
 if(!ok||!captured)throw Error(document.getElementById('statut')?.textContent||'Export failed');
 const {model,searchTest}=modeleDiagnosticAvecPreuves(calculScoreDetail());
 const pages=[...document.querySelectorAll('#rapport-contenu .page')];
 const shortLines=[...document.querySelectorAll('.priority-compact-copy')].map(el=>({height:el.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(el).lineHeight),width:el.scrollWidth,available:el.clientWidth}));
 const fontSizes=pages.flatMap(page=>[...page.querySelectorAll('*')].filter(el=>[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(el=>parseFloat(getComputedStyle(el).fontSize)));
 document.getElementById('workflow-browser-result').textContent=JSON.stringify({pdf:captured,links:[...document.querySelectorAll('#rapport-contenu a[href]')].map(a=>({text:a.textContent,url:a.href})),shortLines,score:before,after:calculScoreDetail().total,model,searchTest,layout:validerMiseEnPageRapport(),minFontPx:Math.min(...fontSizes),pages:pages.map(p=>p.innerText),errors:dernierControleEditorialDiagnostic.errors,calls:window.__workflowFetchCalls.map(c=>({url:c.url,method:c.method}))});
 }catch(e){document.getElementById('workflow-browser-result').textContent=JSON.stringify({error:e.stack});}})();`;
 const result=await runAdminBrowserHarness(script,{confirmOrganic:confirmed,confirmationDate:saved.finalizedAt.slice(0,10),analysisId:saved.analysisId,answers,overrides:[],context:{company:'Peinture Sarland',city:'Sarreguemines',activity:'Peintre en bâtiment',scoringVersion:'score-efficia-v5',collectionAvailable:false,premiumAllowed:false}},{timeout:110000,resultWait:100000});
 if(result.error)throw Error(result.error);
 if(result.score!==60||result.after!==60||result.pages.length!==3||result.minFontPx<12)throw Error('Real replay invariant failed: '+JSON.stringify({...result,pdf:undefined}));
 if(result.shortLines.some(l=>l.height>l.lineHeight+1||l.width>l.available+1))throw Error('Secondary priority exceeds one line');
 const basename=process.argv.includes('--v5')?'diagnostic-sarland-v5':process.argv.includes('--v4')?'diagnostic-sarland-v4'+(confirmed?'-profil-a':''):process.argv.includes('--v3')?'diagnostic-sarland-v3'+(confirmed?'-profil-a':''):'diagnostic-sarland-v2';
 result.variant=confirmed?'Case cochée pour test du parcours, sans nouvelle vérification publique':'Case non cochée';
 if(confirmed&&result.model.profile.code!=='A')throw Error('Expected profile A');
 writeFileSync(new URL(basename+'.pdf',folder),Buffer.from(result.pdf,'base64'));delete result.pdf;
 writeFileSync(new URL(basename+'-controle.json',folder),JSON.stringify(result,null,2));
 console.log(JSON.stringify({score:result.score,profile:result.model.profile.code,counts:result.model.counts,priorities:result.model.priorities.map(p=>p.key),layout:result.layout,minFontPx:result.minFontPx}));
 }
 process.exit(0);
}
const folder=new URL('../output/pdf/',import.meta.url);mkdirSync(folder,{recursive:true});
for(const name of process.argv.includes('--pr-preview')?['synthetic']:['sarland','synthetic']){
 const script=String.raw`(async()=>{try{
 for(let i=0;i<250&&analysisIdContexteAdminHydrate!==analysisIdDepuisUrl();i++)await new Promise(r=>setTimeout(r,20));
 const E=EfficiaDiagnosticEvidence;
 const isSarland=window.__workflowFixture.controlName==='sarland';
 const searchTest=isSarland?{rank:2,positionKind:'organic',rankConfirmed:true}:{rank:15,positionKind:'organic',query:'Recherche fictive de contrôle',observedAt:'2026-10-10',location:'Lieu fictif'};
 const listing=isSarland?{position:2,note:4.6,nbAvis:19}:{position:15,note:4.9,nbAvis:120,nbPhotos:2};
 const proof=(key,value)=>({criterionId:key,field:key,observedValue:value,source:isSarland?'Faits fournis pour ce contrôle':'Jeu de données fictif',observedAt:isSarland?null:'2026-10-10',confidence:'certain'});
 let controls=GRILLE.flatMap(cat=>cat.criteres).filter(c=>c.scored!==false).map(c=>({key:c.key,label:LIBELLES_COURTS[c.key]||c.q,status:'unknown',evidence:{criterionId:c.key,field:c.key,observedValue:null}}));
 const set=(key,value,status,label,missing=0)=>{const c=controls.find(c=>c.key===key);Object.assign(c,{status,label,evidence:proof(key,value),missingPoints:missing,rawDomainMaximum:20,normalizedDomainMaximum:20});};
 set('noteMoyenne',listing.note,'ok','Note');set('volumeAvis',listing.nbAvis,'ok','Nombre d’avis');
 if(!isSarland){set('attributs','À compléter','warn','Attributs',1);set('tauxReponseAvis','Rarement / jamais','ko','Réponses aux avis',9);set('descriptionRemplie',0,'ko','Description — nombre de caractères',7);set('horaires','horaires des jours fériés absents, contrôle réalisé','ko','Horaires des jours fériés',4);set('nombrePhotos',2,'warn','Nombre de photos',2);}
 const model=E.buildDiagnosticModel({listing,searchTest,controls,competitors:isSarland?[]:[{avis:0,note:5,photos:12},{avis:0,note:4,photos:8},{avis:null,note:null,photos:null}],referenceSummary:isSarland?{avisMedian:4,source:'Faits fournis'}:null});
 const domains=isSarland?[]:[['informations','Informations essentielles',18,28],['photos','Photos',12,17],['avis','Avis',23,24],['contenu','Contenu',10,16],['activite','Activité',2,3],['visibilite','Visibilité',12,12]].map(([key,label,points,maximum])=>({key,label,points,maximum}));
 const score=isSarland?49:77;
 const result=EfficiaDiagnosticReport.renderDiagnostic({model,score,domains,searchTest,contact:CONFIG.contact||{},
 identity:{company:isSarland?'Peinture Sarland — contrôle sur faits fournis':'Exemple fictif — contrôle de mise en page',facts:{Note:listing.note,'Nombre d’avis':listing.nbAvis,'Position au test':searchTest.rank,Photos:listing.nbPhotos??null}},
 header:()=>rapportHeaderHtml('Diagnostic Efficia™'),gauge:scoreGaugeHtml,
 payment:kind=>paymentButtonHtml({url:resolvePaymentUrl(kind==='audit'?AUDIT_PAYMENT_URL:PACK_PAYMENT_URL,kind==='audit'?'audit':'visibility'),label:kind==='audit'?'Je veux savoir quoi corriger en premier':'Optimiser ma fiche maintenant',variant:kind})});
 if(result.errors.length)throw Error(JSON.stringify(result.errors));
 document.getElementById('rapport-contenu').innerHTML=result.html;
 document.querySelectorAll('#rapport-contenu .report-v4 *').forEach(node=>{if(parseFloat(getComputedStyle(node).fontSize)<12)node.style.setProperty('font-size','12px','important');});
 if(isSarland){document.querySelector('.v3-score-lines').innerHTML='<p class="v3-micro-note">Score fourni : 49/100. Réponses et sous-scores non fournis : aucun recalcul ni répartition inventée.</p>';}
 document.body.classList.add('mode-rapport');majPaginationRapport();appliquerCompactionLocaleRapport();
 await document.fonts.ready;await waitForReportImages(document.getElementById('rapport-contenu'));
 const layout=validerMiseEnPageRapport();if(!layout.ok)throw Error('Débordement '+JSON.stringify(layout));
 const {jsPDFCtor,html2canvasFn}=await assurerLibrairiesPDF();const pdf=new jsPDFCtor({unit:'mm',format:'a4',orientation:'portrait'});
 const pages=[...document.querySelectorAll('#rapport-contenu .page')];
 for(const[i,page]of pages.entries()){const canvas=await html2canvasFn(page,optionsCapturePdfDiagnostic());if(i)pdf.addPage('a4','portrait');pdf.addImage(canvas.toDataURL('image/jpeg',.98),'JPEG',0,0,210,297);ajouterLiensPdfPourPage(pdf,page);}
 document.getElementById('workflow-browser-result').textContent=JSON.stringify({pdf:pdf.output('datauristring').split(',')[1],html:'<!doctype html><html lang="fr"><head><meta charset="utf-8">'+[...document.querySelectorAll('style')].map(s=>s.outerHTML).join('')+'</head><body class="mode-rapport"><div id="rapport"><div id="rapport-contenu">'+document.getElementById('rapport-contenu').innerHTML+'</div></div></body></html>',pages:pages.map(p=>p.innerText),layout,model,score,before:phraseDirecteScoreDiagnosticGratuit(score).texte});
 }catch(e){document.getElementById('workflow-browser-result').textContent=JSON.stringify({error:e.stack});}})();`;
 const r=await runAdminBrowserHarness(script,{overrides:[],controlName:name},{timeout:110000,resultWait:100000});
 if(r.error)throw Error(r.error);
 writeFileSync(new URL(name+'-controle.pdf',folder),Buffer.from(r.pdf,'base64'));
 writeFileSync(new URL(name+'-controle.html',folder),r.html);delete r.pdf;delete r.html;
 writeFileSync(new URL(name+'-controle.json',folder),JSON.stringify(r,null,2));
 if(name==='sarland'){
   const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
   writeFileSync(new URL('sarland-avant-apres.html',folder),`<!doctype html><html lang="fr"><meta charset="utf-8"><title>Sarland — comparaison éditoriale</title><style>body{font:18px/1.6 system-ui;max-width:1000px;margin:60px auto;color:#10213d;padding:24px}section{display:grid;grid-template-columns:1fr 1fr;gap:32px}article{padding:24px;border:1px solid #cbd5e1;border-radius:16px}small{color:#52637a}</style><h1>Peinture Sarland : avant / après</h1><p>Faits conservés : rang 2, note 4,6, 19 avis, médiane fournie 4, score 49/100.</p><section><article><h2>Avant</h2><p>${esc(r.before)}</p><small>Verdict de l’ancien helper pour le score 49. Comparaison de texte, pas reconstitution d’un ancien PDF client.</small></article><article><h2>Après — profil B</h2><p>${esc(r.model.profile.verdict)}</p><small>Score 49 inchangé ; classement et score distingués. Aucun défaut non documenté ni promesse de première place.</small></article></section><p><a href="sarland-controle.html">Voir le nouveau rendu complet de trois pages</a></p></html>`);
 }
 console.log(name+': 3 pages, mise en page validée, profil '+r.model.profile.code+', score '+r.score);
}
