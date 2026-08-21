import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runKnowledgeEngine } from "../functions/lib/knowledgeEngine.js";
import { runReasoningEngine } from "../functions/lib/reasoning-engine/reasoningEngine.js";
import { runComposer } from "../functions/lib/composer-engine/composerEngine.js";
import { buildNarrativeModel } from "../functions/lib/composer-engine/narrativeModel.js";
import { buildScoreContext } from "../functions/lib/auditComposition.js";
import {
  renderAnalysisHtml,
  renderFreeDiagnosticHtml,
  renderPremiumAuditHtml,
} from "../functions/lib/renderAnalysisHtml.js";

// Même cas de référence "Auto Service Fischer" que tests/freeDiagnosticModel.test.js
// (Score-Efficia_Auto-Service-Fischer_Dippach_2026-07-17_V3.pdf).
function fischerAnalysis() {
  return {
    analysisId: "fischer-dippach-001",
    reportType: "free",
    reviewedScore: {
      scoringVersion: "score-efficia-v4",
      score: 55,
      roundedScore: 55,
      repondus: 28,
      totalCrit: 29,
      indices: { visibilite: 79, confiance: 65, conversion: 13 },
      band: { min: 50, nom: "Potentiel inexploité", couleur: "#d97706", verdict: "Verdict de bande." },
      projectedPackScore: { projete: 88, corriges: 16, ameliorables: 16 },
      categories: [
        { key: "informations", label: "Informations essentielles", brut: 23, maxEvalue: 24, pct: 23 / 24 },
        { key: "visibilite", label: "Visibilité locale", brut: 10, maxEvalue: 12, pct: 10 / 12 },
        { key: "photos", label: "Photos & visuels", brut: 7, maxEvalue: 12, pct: 7 / 12 },
        { key: "avis", label: "Avis clients", brut: 15, maxEvalue: 27, pct: 15 / 27 },
        { key: "contenu", label: "Contenu de la fiche", brut: 0, maxEvalue: 22, pct: 0 },
        { key: "activite", label: "Activité & animation", brut: 0, maxEvalue: 3, pct: 0 },
      ],
    },
    scoreInputs: {
      criteria: (() => {
        const c = (key, category, categoryLabel, status) => ({
          key, category, categoryLabel, question: `Question ${key}`, status, label: status, points: null, max: 1,
        });
        return [
          c("revendiquee", "informations", "Informations essentielles", "compliant"),
          c("categoriePrincipale", "informations", "Informations essentielles", "compliant"),
          c("categoriesSecondaires", "informations", "Informations essentielles", "compliant"),
          c("horaires", "informations", "Informations essentielles", "compliant"),
          c("contact", "informations", "Informations essentielles", "compliant"),
          c("adresse", "informations", "Informations essentielles", "compliant"),
          c("attributs", "informations", "Informations essentielles", "partial"),
          c("nap", "informations", "Informations essentielles", "compliant"),
          c("logoCouverture", "photos", "Photos & visuels", "partial"),
          c("nombre", "photos", "Photos & visuels", "compliant"),
          c("recente", "photos", "Photos & visuels", "deficient"),
          c("variete", "photos", "Photos & visuels", "compliant"),
          c("qualite", "photos", "Photos & visuels", "compliant"),
          c("note", "avis", "Avis clients", "partial"),
          c("volume", "avis", "Avis clients", "partial"),
          c("recence", "avis", "Avis clients", "compliant"),
          c("tauxReponse", "avis", "Avis clients", "partial"),
          c("qualiteReponses", "avis", "Avis clients", "partial"),
          c("descriptionRemplie", "contenu", "Contenu de la fiche", "deficient"),
          c("descriptionQualite", "contenu", "Contenu de la fiche", "deficient"),
          c("servicesPresents", "contenu", "Contenu de la fiche", "deficient"),
          c("servicesDecrits", "contenu", "Contenu de la fiche", "deficient"),
          c("questionsReponses", "contenu", "Contenu de la fiche", "deficient"),
          c("liensAction", "contenu", "Contenu de la fiche", "deficient"),
          c("publicationRecente", "activite", "Activité & animation", "deficient"),
          c("rythmePublication", "activite", "Activité & animation", "deficient"),
          c("classementLocal", "visibilite", "Visibilité locale", "compliant"),
          c("attractiviteConcurrents", "visibilite", "Visibilité locale", "partial"),
          c("nomConforme", "informations", "Informations essentielles", "not_verified"),
        ];
      })(),
    },
  };
}

async function buildDocumentModel(reportType) {
  const path = new URL("./fixtures/knowledge-weak-profile.json", import.meta.url);
  const knowledgeInput = JSON.parse(await readFile(path, "utf8"));
  const knowledge = runKnowledgeEngine({ ...knowledgeInput, reportType });
  const context = {
    business: {
      name: "Auto Service Fischer",
      category: "Garage",
      rating: knowledgeInput.business.rating,
      reviews: knowledgeInput.business.reviews,
      photos_count: knowledgeInput.business.photos_count,
      description_length: knowledgeInput.business.description_length,
      position: knowledgeInput.business.position,
    },
    // Score Efficia (55) prioritaire sur l'ancien benchmark_score, comme le fait
    // déjà buildBenchmarkContext() en production (reviewedScore.score en premier).
    benchmark: { ...knowledgeInput.benchmark, benchmark_score: 55 },
  };
  const reasoning = runReasoningEngine({
    analysisId: "fischer-dippach-001",
    reportType,
    generatedAt: "2026-07-17T08:00:00.000Z",
    context,
    knowledge,
  });

  const bundle = {
    analysisId: "fischer-dippach-001",
    reportType,
    generatedAt: "2026-07-17T08:00:00.000Z",
    meta: { businessName: "Auto Service Fischer", category: "Garage", city: "Dippach", generatedAt: "2026-07-17T08:00:00.000Z" },
    observation: context.business,
    benchmark: context.benchmark,
    knowledge,
    reasoning,
    scoreContext: buildScoreContext(fischerAnalysis()),
  };

  return runComposer(bundle);
}

test("le routeur renderAnalysisHtml choisit le renderer gratuit dédié quand reportType === free", async () => {
  const documentModel = await buildDocumentModel("free");
  const html = renderAnalysisHtml(documentModel);

  assert.equal(html, renderFreeDiagnosticHtml(documentModel));
  assert.notEqual(html, renderPremiumAuditHtml(documentModel));
});

test("le routeur renderAnalysisHtml choisit le renderer premium quand reportType === premium (ou absent)", async () => {
  const documentModel = await buildDocumentModel("premium");
  const html = renderAnalysisHtml(documentModel);

  assert.equal(html, renderPremiumAuditHtml(documentModel));
});

test("Diagnostic gratuit : exactement 6 pages et les 6 étapes attendues", async () => {
  const documentModel = await buildDocumentModel("free");
  const html = renderFreeDiagnosticHtml(documentModel);

  const pageCount = (html.match(/<section class="page/g) || []).length;
  assert.equal(pageCount, 6);

  assert.match(html, /ÉTAPE 1 · VOTRE FICHE AUJOURD'HUI/);
  assert.match(html, /Votre situation aujourd'hui/);
  assert.match(html, /ÉTAPE 2 · POURQUOI CE SCORE/);
  assert.match(html, /Pourquoi obtenez-vous ce score/);
  assert.match(html, /ÉTAPE 3 · CE QUE NOUS AVONS VÉRIFIÉ/);
  assert.match(html, /Ce que nous avons analysé/);
  assert.match(html, /ÉTAPE 4 · VOS TROIS PRIORITÉS/);
  assert.match(html, /Par où commencer/);
  assert.match(html, /ÉTAPE 5 · COMMENT LES RÉSOUDRE/);
  assert.match(html, /Comment les résoudre|Ce que ces trois priorités peuvent améliorer/);
  assert.match(html, /ÉTAPE 6 · PASSER À L'ACTION/);
  assert.match(html, /Passer à l'action|Deux façons d'améliorer votre fiche/);
});

test("Diagnostic gratuit : indices 79/65/13 affichés", async () => {
  const documentModel = await buildDocumentModel("free");
  const html = renderFreeDiagnosticHtml(documentModel);

  assert.match(html, /class="index-value">79<small>/);
  assert.match(html, /class="index-value">65<small>/);
  assert.match(html, /class="index-value">13<small>/);
  assert.match(html, /Visibilité/);
  assert.match(html, /Confiance/);
  assert.match(html, /Conversion/);
});

test("Diagnostic gratuit : les six domaines sont affichés", async () => {
  const documentModel = await buildDocumentModel("free");
  const html = renderFreeDiagnosticHtml(documentModel);

  for (const label of [
    "Informations essentielles",
    "Visibilité locale",
    "Photos &amp; visuels",
    "Avis clients",
    "Contenu de la fiche",
    "Activité &amp; animation",
  ]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /23\/24/);
  assert.match(html, /0\/22/);
});

test("Diagnostic gratuit : compteurs de critères 12/7/9/1", async () => {
  const documentModel = await buildDocumentModel("free");
  const html = renderFreeDiagnosticHtml(documentModel);

  assert.match(html, /12 conformes/);
  assert.match(html, /7 à améliorer/);
  assert.match(html, /9 prioritaires/);
  assert.match(html, /1 à confirmer/);
});

test("Diagnostic gratuit : exactement trois priorités affichées", async () => {
  const documentModel = await buildDocumentModel("free");
  const html = renderFreeDiagnosticHtml(documentModel);

  const priorityCount = (html.match(/Priorité \d/g) || []).length;
  assert.equal(priorityCount, 3);
  assert.equal(documentModel.freeDiagnostic.priorities.length, 3);
});

test("Diagnostic gratuit : une description vide confirmée n’est jamais présentée comme existante", async () => {
  const descriptionReasoning = {
    rank: 1,
    id: "DESCRIPTION_ABSENTE",
    type: "weakness",
    signal: "description",
    title: "Description à ajouter",
    evidence: { value: 0 },
    logic: { cause: "Votre description existe, mais elle peut encore mieux présenter votre activité." },
    actionability: {},
  };
  const documentModel = buildNarrativeModel({
    reportType: "free",
    observation: {},
    scoreContext: {},
    knowledge: { top_priorities: [{ id: descriptionReasoning.id }] },
    reasoning: { reasonings: [descriptionReasoning] },
  }, {
    priorities: [descriptionReasoning],
    strengths: [],
    weaknesses: [],
    opportunities: [],
  });
  const descriptionPriority = documentModel.freeDiagnostic.priorities[0];

  assert.equal(descriptionPriority.observed, "Aucune description n’est visible sur votre fiche Google.");
});

test("Diagnostic gratuit : projection de score 55 → 88", async () => {
  const documentModel = await buildDocumentModel("free");
  const html = renderFreeDiagnosticHtml(documentModel);

  assert.match(html, /55\/100/);
  assert.match(html, /88\/100/);
});

test("Diagnostic gratuit : les deux offres (Audit 99 € et Pack 349 €) sont présentes", async () => {
  const documentModel = await buildDocumentModel("free");
  const html = renderFreeDiagnosticHtml(documentModel);

  assert.match(html, /Audit Efficia complet/);
  assert.match(html, /99 €/);
  assert.match(html, /Pack Visibilité Google/);
  assert.match(html, /349 €/);
});

test("Diagnostic gratuit : affiche le rang organique confirmé", async () => {
  const documentModel = await buildDocumentModel("free");
  documentModel.freeDiagnostic.position = 2;
  documentModel.freeDiagnostic.testedQuery = "Électricien Audun-le-Tiche";
  documentModel.freeDiagnostic.positionKind = "organic";
  documentModel.freeDiagnostic.sponsoredResultsExcluded = 1;
  const html = renderFreeDiagnosticHtml(documentModel);

  assert.match(html, /2e résultat organique sur « Électricien Audun-le-Tiche » — hors annonces sponsorisées/);
  assert.match(html, /Une annonce sponsorisée apparaît au-dessus des résultats organiques/);
  assert.doesNotMatch(html, /Position observée : 3e/);
});

test("Diagnostic gratuit : aucun plan d'action premium complet, aucun mot collé, tout en français", async () => {
  const documentModel = await buildDocumentModel("free");
  const html = renderFreeDiagnosticHtml(documentModel);

  // Le plan d'action premium (section dédiée + libellés "Séquence recommandée" /
  // "Un plan d'action simple à suivre") n'apparaît pas dans le gratuit.
  assert.doesNotMatch(html, /Séquence recommandée/);
  assert.doesNotMatch(html, /Un plan d'action simple à suivre/);
  assert.doesNotMatch(html, /class="timeline"/);

  // Pas de titre tronqué (ni "..." ni coupure suspecte en fin de balise <h1>).
  assert.doesNotMatch(html, /<h1>[^<]*\.\.\.\s*<\/h1>/);

  // Vérification simple d'absence de mots collés dans les libellés statiques
  // clés (espace insécable après "?" géré via &nbsp;, pas de concaténation directe).
  assert.doesNotMatch(html, /[a-zàâäéèêëïîôöùûüç]{2,}[A-ZÀÂÄÉÈÊËÏÎÔÖÙÛÜÇ]{2,}/);
});

test("Diagnostic gratuit : ne modifie pas le Score Efficia ni le contenu premium existant", async () => {
  const documentFree = await buildDocumentModel("free");
  const documentPremium = await buildDocumentModel("premium");

  assert.equal(documentFree.hero.score, documentPremium.hero.score);

  const premiumHtml = renderPremiumAuditHtml(documentPremium);
  assert.match(premiumHtml, /Vos priorités/);
  // Sprint 5 (finition éditoriale, objectif 7) : la page "Vos points forts"
  // est désormais omise quand il n'y a aucun point fort à afficher — c'est
  // le cas pour ce profil "weak" (0 force), donc son absence ici est
  // attendue, pas une régression (cf. tests/premiumReportIntegrity.test.js).
  assert.equal(documentPremium.strengths.length, 0);
  assert.doesNotMatch(premiumHtml, /Vos points forts/);
  assert.match(premiumHtml, /Séquence recommandée/);
});

test("les rapports gratuit et Premium présentent la zone non vérifiable sans anomalie ni recommandation négative", async () => {
  const freeModel = await buildDocumentModel("free");
  freeModel.freeDiagnostic.provisional = true;
  freeModel.freeDiagnostic.locationConfirmation = "Zone desservie : à confirmer — information non vérifiable publiquement.";
  const freeHtml = renderFreeDiagnosticHtml(freeModel);

  const premiumModel = await buildDocumentModel("premium");
  premiumModel.scoreProvisional = true;
  premiumModel.locationConfirmation = "Zone desservie : à confirmer — information non vérifiable publiquement.";
  const premiumHtml = renderPremiumAuditHtml(premiumModel);

  for (const html of [freeHtml, premiumHtml]) {
    assert.match(html, /Ce score est provisoire : certaines informations ne sont pas vérifiables depuis la fiche publique et restent à confirmer\./);
    assert.match(html, /Zone desservie : à confirmer — information non vérifiable publiquement\./);
    assert.doesNotMatch(html, /Zone desservie : absente ou incohérente/i);
    assert.doesNotMatch(html, /corriger la zone desservie/i);
  }
  assert.match(freeHtml, /1 élément reste à confirmer\./);
  assert.doesNotMatch(freeHtml, /1 point n'est|Les 1 points|1 points/i);
  assert.match(premiumHtml, /Score Efficia™ provisoire/);
});
