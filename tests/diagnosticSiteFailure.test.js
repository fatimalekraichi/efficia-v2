import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/diagnostic-tone-config.js';
import '../js/diagnostic-evidence.js';
import '../js/diagnostic-report.js';

test('un site inaccessible ne devient jamais une différence de coordonnées dans le rendu client', () => {
  const E=globalThis.EfficiaDiagnosticEvidence, R=globalThis.EfficiaDiagnosticReport;
  for (const issue of ['dns','erreur_serveur','incident_technique']) {
    const evidence={criterionId:'nap',field:'site web',observedValue:'Site inaccessible',source:'Contrôle opérateur',observedAt:'2026-10-11',confidence:'certain',siteState:{etat:'inaccessible',problemeTechnique:issue}};
    const model=E.buildDiagnosticModel({controls:[{key:'nap',status:'ko',evidence,missingPoints:3,rawDomainMaximum:20,normalizedDomainMaximum:20}]});
    const rendered=R.renderDiagnostic({model,score:49,identity:{company:'Entreprise fictive'},searchTest:{observedAt:'2026-10-11'}});
    assert.deepEqual(rendered.errors,[]);
    assert.match(rendered.html,/Rétablir l’accès à votre site/);
    assert.doesNotMatch(rendered.html,/coordonnées.*différences|DNS records|Please check|erreur serveur 500/);
    if(issue==='dns')assert.match(rendered.html,/problème de configuration DNS/);
    if(issue==='erreur_serveur')assert.match(rendered.html,/erreur serveur/);
    assert.match(rendered.html,/Faites vérifier le fonctionnement du site/);
  }
});
