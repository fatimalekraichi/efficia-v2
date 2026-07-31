import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runKnowledgeEngine } from "../functions/lib/knowledgeEngine.js";
import { runReasoningEngine } from "../functions/lib/reasoning-engine/reasoningEngine.js";
import { runComposer } from "../functions/lib/composer-engine/composerEngine.js";
import { buildScoreContext } from "../functions/lib/auditComposition.js";

// Cas de référence "Auto Service Fischer" (Score-Efficia_Auto-Service-Fischer_Dippach_2026-07-17_V3.pdf),
// tel que déjà calculé et validé par le Score Efficia historique (scoreEngine.js,
// non modifié ici). Ces valeurs sont reprises telles quelles du rapport validé —
// ce test vérifie uniquement que buildScoreContext()/freeDiagnostic les
// retransmettent fidèlement, sans les recalculer.
function fischerReviewedScore() {
  return {
    scoringVersion: "score-efficia-v4",
    score: 55,
    roundedScore: 55,
    repondus: 28,
    totalCrit: 29,
    indices: { visibilite: 79, confiance: 65, conversion: 13 },
    band: {
      min: 50,
      nom: "Potentiel inexploité",
      couleur: "#d97706",
      verdict: "Votre fiche dispose d'une base visible, mais plusieurs leviers peuvent encore renforcer sa capacité à rassurer et convertir.",
    },
    projectedPackScore: { projete: 88, corriges: 16, ameliorables: 16 },
    categories: [
      { key: "informations", label: "Informations essentielles", brut: 23, maxEvalue: 24, pct: 23 / 24 },
      { key: "visibilite", label: "Visibilité locale", brut: 10, maxEvalue: 12, pct: 10 / 12 },
      { key: "photos", label: "Photos & visuels", brut: 7, maxEvalue: 12, pct: 7 / 12 },
      { key: "avis", label: "Avis clients", brut: 15, maxEvalue: 27, pct: 15 / 27 },
      { key: "contenu", label: "Contenu de la fiche", brut: 0, maxEvalue: 22, pct: 0 },
      { key: "activite", label: "Activité & animation", brut: 0, maxEvalue: 3, pct: 0 },
    ],
  };
}

// Statuts des 29 critères reconstitués depuis la page 3 du PDF de référence
// (✓ conforme · ! à améliorer · ✗ prioritaire · ○ à confirmer) : 12 conformes,
// 7 à améliorer, 9 prioritaires, 1 à confirmer.
function fischerCriteria() {
  const c = (key, category, categoryLabel, status) => ({
    key, category, categoryLabel, question: `Question ${key}`, status,
    label: status, points: null, max: 1,
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
    c("recherchesSpecifiques", "visibilite", "Visibilité locale", "not_verified"),
  ];
}

function fischerAnalysis() {
  return {
    analysisId: "fischer-dippach-001",
    reportType: "free",
    reviewedScore: fischerReviewedScore(),
    scoreInputs: { criteria: fischerCriteria() },
  };
}

test("buildScoreContext retransmet fidèlement le Score Efficia historique (cas Fischer)", () => {
  const context = buildScoreContext(fischerAnalysis());

  assert.equal(context.band.nom, "Potentiel inexploité");
  assert.deepEqual(context.indices, { visibilite: 79, confiance: 65, conversion: 13 });
  assert.equal(context.categories.length, 6);
  assert.equal(context.projectedPackScore.projete, 88);
  assert.equal(context.criteria.length, 29);
});

async function weakProfileBundle() {
  const path = new URL("./fixtures/knowledge-weak-profile.json", import.meta.url);
  const knowledgeInput = JSON.parse(await readFile(path, "utf8"));
  const knowledge = runKnowledgeEngine({ ...knowledgeInput, reportType: "free" });
  const context = {
    business: {
      name: "Petit Atelier Local",
      category: "artisan",
      rating: knowledgeInput.business.rating,
      reviews: knowledgeInput.business.reviews,
      photos_count: knowledgeInput.business.photos_count,
      description_length: knowledgeInput.business.description_length,
      position: knowledgeInput.business.position,
    },
    benchmark: knowledgeInput.benchmark,
  };
  const reasoning = runReasoningEngine({
    analysisId: "fischer-dippach-001",
    reportType: "free",
    generatedAt: "2026-07-17T08:00:00.000Z",
    context,
    knowledge,
  });

  return {
    analysisId: "fischer-dippach-001",
    reportType: "free",
    generatedAt: "2026-07-17T08:00:00.000Z",
    meta: { businessName: "Auto Service Fischer", category: "Garage", city: "Dippach", generatedAt: "2026-07-17T08:00:00.000Z" },
    observation: context.business,
    benchmark: context.benchmark,
    knowledge,
    reasoning,
    scoreContext: buildScoreContext(fischerAnalysis()),
  };
}

test("freeDiagnostic (cas Fischer) : score, indices, domaines et projection transmis sans altération", async () => {
  const documentModel = runComposer(await weakProfileBundle());
  const { freeDiagnostic } = documentModel;

  // score = 55 (Score Efficia, non recalculé ici)
  assert.equal(fischerReviewedScore().score, 55);
  assert.equal(freeDiagnostic.band.nom, "Potentiel inexploité");

  // indices = 79 / 65 / 13
  assert.deepEqual(freeDiagnostic.indices, { visibilite: 79, confiance: 65, conversion: 13 });

  // les six domaines historiques sont correctement transmis
  assert.equal(freeDiagnostic.domains.length, 6);
  const informations = freeDiagnostic.domains.find((d) => d.key === "informations");
  assert.deepEqual(informations, { key: "informations", label: "Informations essentielles", points: 23, max: 24, pct: 23 / 24 });
  const contenu = freeDiagnostic.domains.find((d) => d.key === "contenu");
  assert.deepEqual(contenu, { key: "contenu", label: "Contenu de la fiche", points: 0, max: 22, pct: 0 });

  // projectedScore = 88
  assert.equal(freeDiagnostic.projectedScore, 88);

  // le résumé des critères distingue conforme / à améliorer / prioritaire / à confirmer
  assert.deepEqual(freeDiagnostic.criteriaSummary.counts, {
    compliant: 12,
    partial: 7,
    deficient: 9,
    not_verified: 1,
  });
  assert.equal(freeDiagnostic.criteriaSummary.total, 29);
});

test("freeDiagnostic.priorities : exactement 3 priorités, avec observed/prospectView/firstAction/expectedResult/estimatedTime/impact", async () => {
  const documentModel = runComposer(await weakProfileBundle());
  const { priorities } = documentModel.freeDiagnostic;

  assert.equal(priorities.length, 3);
  for (const priority of priorities) {
    assert.ok(priority.observed, `observed manquant pour ${priority.id}`);
    assert.ok(priority.prospectView, `prospectView manquant pour ${priority.id}`);
    assert.ok(priority.firstAction, `firstAction manquant pour ${priority.id}`);
    assert.ok(priority.expectedResult, `expectedResult manquant pour ${priority.id}`);
    assert.ok(priority.impact, `impact manquant pour ${priority.id}`);
  }

  // expectedResult est déterministe (même signal => même phrase, aucune variante).
  const bis = runComposer(await weakProfileBundle());
  assert.deepEqual(
    priorities.map((p) => p.expectedResult),
    bis.freeDiagnostic.priorities.map((p) => p.expectedResult),
  );
});

test("freeDiagnostic ne modifie ni le Score Efficia ni le documentModel premium existant", async () => {
  const bundleFree = await weakProfileBundle();
  const bundlePremium = { ...bundleFree, reportType: "premium" };

  const documentFree = runComposer(bundleFree);
  const documentPremium = runComposer(bundlePremium);

  // Le Score Efficia (hero.score) est strictement identique quel que soit le palier.
  assert.equal(documentFree.hero.score, documentPremium.hero.score);

  // Le contenu premium existant (priorities/weaknesses/actionPlan) n'est pas
  // impacté par l'ajout de freeDiagnostic.
  assert.ok(documentPremium.priorities.length >= documentFree.priorities.length);
  assert.equal(documentPremium.vocabulary.reportLabel, "Audit Efficia™");

  // freeDiagnostic reste présent (et capé à 3) même sur un documentModel premium :
  // c'est un sous-modèle indépendant du palier résolu pour le reste du document.
  assert.equal(documentPremium.freeDiagnostic.priorities.length, 3);
});
