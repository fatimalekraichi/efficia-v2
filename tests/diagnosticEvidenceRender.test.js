import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/diagnostic-tone-config.js';
import '../js/diagnostic-evidence.js';
import '../js/diagnostic-report.js';
import {normalizeQuestionnaireAnswers} from '../functions/lib/auditQuestionnaireSnapshots.js';
const E=globalThis.EfficiaDiagnosticEvidence,R=globalThis.EfficiaDiagnosticReport;
const searchTest={rank:2,positionKind:'organic',rankConfirmed:true};
function sarland(){
 const model=E.buildDiagnosticModel({listing:{position:2,note:4.6,nbAvis:19},searchTest,referenceSummary:{avisMedian:4,source:'Faits fournis'}});
 return {model,score:49,searchTest,identity:{company:'Peinture Sarland',facts:{Note:4.6,'Nombre d’avis':19,'Position au test':2}}};
}
test('Sarland : faits fournis, B et 49 indépendants, aucune description ou récence inventée',()=>{
 const input=sarland(),r=R.renderDiagnostic({...input,gauge:score=>`<b data-score="${score}">${score}</b>`});
 assert.equal(input.score,49);assert.equal(input.model.profile.code,'B');assert.equal(r.errors.length,0);
 assert.equal((r.html.match(/data-report-page=/g)||[]).length,3);
 assert.match(r.html,/data-score="49"/);assert.doesNotMatch(r.html,/profile-badge|Profil indéterminé/);assert.match(r.html,/Médiane fournie/);
 assert.doesNotMatch(r.html,/absence de description|manque d’avis récents|prendre la première place/);
 assert.match(r.html,/2e résultat sur/);assert.match(r.html,/le non renseignée/);
});
test('prix, déduction et périmètre des avis restent visibles',()=>{
 const {html}=R.renderDiagnostic(sarland());
 assert.match(html,/99 €/);assert.match(html,/349 €/);assert.match(html,/dans les 30 jours/);
 assert.match(html,/QR code/);assert.match(html,/optimisations conformes aux règles Google/);assert.match(html,/aucun faux avis/);assert.match(html,/n&#39;est pas affilié à Google/);
});
test('les remplacements manuels passent par le lint final',()=>{
 const r=R.renderDiagnostic({...sarland(),override:(id,s)=>id==='summary.general'?'Prendre la première place est garanti.':s});
 assert.ok(r.errors.some(e=>e.blockId==='summary.general'&&e.rule==='ranking-promise'));
});
test('brouillons historiques : conservation des preuves et fields:null',()=>{
 const evidence={contact:{field:'téléphone',observedValue:'absent',source:'Contrôle manuel',observedAt:'2026-10-10',confidence:'certain'}};
 const answers=normalizeQuestionnaireAnswers({fields:null,observedData:{evidence},responses:{}});
 assert.equal(answers.fields,null);assert.deepEqual(answers.observedData.evidence,evidence);
});
test('toute surface client masque la source interne et bloque les détails techniques',()=>{
 const evidence={criterionId:'descriptionRemplie',field:'description',observedValue:0,source:'https://maps.google.com',observedAt:'2026-10-11T01:53:43Z',confidence:'certain'};
 const model=E.buildDiagnosticModel({controls:[{key:'descriptionRemplie',status:'ko',evidence,missingPoints:4,rawDomainMaximum:14,normalizedDomainMaximum:16}]});
 const r=R.renderDiagnostic({model,score:60,searchTest:{observedAt:'2026-10-11T01:53:43Z',location:'Sarreguemines'}});
 assert.equal(r.errors.length,0);assert.match(r.html,/Diagnostic réalisé le 11\/10\/2026/);assert.doesNotMatch(r.html,/https:\/\/maps|2026-10-11|Observation partielle|Description : 0/);
 assert.ok(R.renderDiagnostic({model,score:60,identity:{company:'https://internal.example'}}).errors.some(e=>e.rule==='technical-client-copy'));
});
