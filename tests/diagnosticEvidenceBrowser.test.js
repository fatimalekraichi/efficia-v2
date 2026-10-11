import test from 'node:test';
import assert from 'node:assert/strict';
import {runAdminBrowserHarness} from './freeDiagnosticBrowserFixture.js';
const ready=`for(let i=0;i<250&&analysisIdContexteAdminHydrate!==analysisIdDepuisUrl();i++)await new Promise(r=>setTimeout(r,20));`;
test('navigateur : trois pages, preuves, anciens fields:null et blocage avant export', {timeout:60000},async()=>{
 const r=await runAdminBrowserHarness(`(async()=>{try{${ready}
 const before=calculScoreDetail().total;
 genererRapport({exigerVersion:false});validerEditorialDiagnostic();
 const unknown=modeleDiagnosticAvecPreuves(calculScoreDetail()).model;
 const layout=validerMiseEnPageRapport();
 remplacementsTextesRapport.set('page1.verdict_title',{customText:'Vous allez prendre la première place.',needsReview:false});
 genererRapport({exigerVersion:false});let blocked=false;try{validerEditorialDiagnostic();}catch(e){blocked=e.message==='EDITORIAL_VALIDATION_FAILED';}
 remplacementsTextesRapport.clear();genererRapport({exigerVersion:false});
 document.querySelector('[data-editorial-block="summary.general"]').textContent='Texte modifié après contrôle';
 let tamperBlocked=false;try{validerEditorialDiagnostic();}catch(e){tamperBlocked=true;}
 document.getElementById('workflow-browser-result').textContent=JSON.stringify({before,after:calculScoreDetail().total,pages:document.querySelectorAll('#rapport-contenu .page').length,layout,blocked,tamperBlocked,unknown:unknown.counts});
 }catch(e){document.getElementById('workflow-browser-result').textContent=JSON.stringify({error:e.stack});}})();`,{overrides:[],answers:{questionnaireVersion:'score-efficia-questionnaire-v4',profileKey:'default',fields:null,observedData:{},responses:{}}},{timeout:45000,resultWait:35000});
 assert.equal(r.error,undefined,r.error);assert.equal(r.pages,3);assert.equal(r.layout.ok,true);assert.equal(r.before,r.after);assert.equal(r.blocked,true);assert.equal(r.tamperBlocked,true);assert.equal(r.unknown.ko,0);
});

test('opérateur : preuve automatique, Non vérifiable sauvegardé et restauré sans faux zéro',{timeout:60000},async()=>{
 const r=await runAdminBrowserHarness(`(async()=>{try{${ready}
 const cr=GRILLE.flatMap(c=>c.criteres).find(c=>c.key==='descriptionRemplie');
 const input=document.querySelector('input[name="c'+cr.id+'"][data-option-index="2"]');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));
 const proof=donneesAnalyse.evidence.descriptionRemplie;
 const unknown=document.querySelector('input[name="c'+cr.id+'"][data-special="not_verifiable"]');unknown.checked=true;unknown.dispatchEvent(new Event('change',{bubbles:true}));
 const responses=collecterReponses();input.checked=true;appliquerReponses(responses);
 const photo=GRILLE.flatMap(c=>c.criteres).find(c=>c.key==='qualitePhotos');
 const check=document.querySelector('input[data-check-crit="'+photo.id+'"]');check.checked=true;check.dispatchEvent(new Event('change',{bubbles:true}));
 await enregistrerBrouillonD1(true);
 genererRapport({exigerVersion:false});validerEditorialDiagnostic();
 await document.fonts.ready;
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 document.getElementById('workflow-browser-result').textContent=JSON.stringify({descriptionStatus:modeleDiagnosticAvecPreuves(calculScoreDetail()).model.observations.find(o=>o.key==='descriptionRemplie')?.status,photoProof:donneesAnalyse.evidence.qualitePhotos,persisted:window.__workflowFixture.answers.responses.descriptionRemplie,proof,points:lirePoints(cr.id),saved:responses.descriptionRemplie,restored:unknown.checked,evidence:donneesAnalyse.evidence.descriptionRemplie,unverifiable:critereEstNonVerifiablePubliquement(cr)});
 }catch(e){document.getElementById('workflow-browser-result').textContent=JSON.stringify({error:e.stack});}})();`,{overrides:[]},{timeout:45000,resultWait:35000});
 assert.equal(r.error,undefined,r.error);assert.equal(r.proof.confidence,'certain');assert.equal(r.proof.observedValue,'Vide');assert.match(r.proof.observedAt,/^\d{4}-\d{2}-\d{2}$/);
 assert.equal(r.descriptionStatus,'unknown');assert.equal(r.photoProof.operatorAnswer,true);assert.equal(r.persisted.value,'not_verifiable');assert.equal(r.saved.value,'not_verifiable');assert.equal(r.points,null);assert.equal(r.restored,true);assert.equal(r.unverifiable,true);assert.equal(r.evidence.confidence,'uncertain');
});

test('confirmation visuelle : preuve datée, sauvegarde, révocation et profil client',{timeout:60000},async()=>{
 const r=await runAdminBrowserHarness(`(async()=>{try{${ready}
 const E=EfficiaDiagnosticEvidence;
 const before=calculScoreDetail().total;
 const checkbox=document.getElementById('rang-organique-confirme'),date=document.getElementById('rang-organique-date');
 date.value='2026-10-11';checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));
 await enregistrerBrouillonD1(true);
 const saved=structuredClone(window.__workflowFixture.answers.observedData.organicConfirmation);
 genererRapport({exigerVersion:false});validerEditorialDiagnostic();
 const confirmed={profile:modeleDiagnosticAvecPreuves(calculScoreDetail()).model.profile.code,badge:document.querySelector('.profile-badge')?.textContent};
 checkbox.checked=false;checkbox.dispatchEvent(new Event('change',{bubbles:true}));
 await enregistrerBrouillonD1(true);chargerConfirmationRang();
 genererRapport({exigerVersion:false});validerEditorialDiagnostic();await document.fonts.ready;
 const plain=document.getElementById('rapport-contenu').textContent;
 document.getElementById('workflow-browser-result').textContent=JSON.stringify({before,after:calculScoreDetail().total,saved,confirmed,revoked:window.__workflowFixture.answers.observedData.organicConfirmation.confirmed,checked:checkbox.checked,badge:!!document.querySelector('.profile-badge'),plain});
 }catch(e){document.getElementById('workflow-browser-result').textContent=JSON.stringify({error:e.stack});}})();`,{overrides:[],answers:{questionnaireVersion:'score-efficia-questionnaire-v4',profileKey:'default',fields:{'p-entreprise':'Test','p-ville':'Sarreguemines','p-activite':'Peintre en bâtiment','d-requete':'Peintre en bâtiment Sarreguemines','d-position':'1'},responses:{},observedData:{position:1,positionKind:'observed',derniereRequeteAnalysee:'Peintre en bâtiment Sarreguemines',derniereAnalyseRechercheAt:'2026-10-11T01:53:43Z',lieuReelTest:'Sarreguemines'}}},{timeout:45000,resultWait:35000});
 assert.equal(r.error,undefined,r.error);assert.equal(r.confirmed.profile,'A');assert.equal(r.confirmed.badge,'Profil A');assert.equal(r.saved.confidence,'certain');assert.equal(r.saved.observedAt,'2026-10-11');
 assert.equal(r.revoked,false);assert.equal(r.checked,false);assert.equal(r.badge,false);assert.equal(r.before,r.after);
 assert.doesNotMatch(r.plain,/Profil indéterminé|annonces|type de classement/i);assert.match(r.plain,/1er résultat sur « Peintre en bâtiment Sarreguemines »/);
});
