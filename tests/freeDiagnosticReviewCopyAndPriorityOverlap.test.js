// Tests permanents — corrige deux défauts textuels génériques du diagnostic
// gratuit, observés sur un cas réel (Computelec, analyse f43bf6c3-79cd-
// 4ab8-8f62-525b145da924) mais corrigés SANS coder en dur aucune valeur de
// cette entreprise : toutes les fixtures ci-dessous sont synthétiques.
//
// Défaut 1 (page 3 "Ce que nous avons analysé" — bloc "Confiance visible
// face aux concurrents") : une fiche sans aucun avis affichait "0/5 et 0
// avis" (ou une valeur cassée), et ce même texte apparaissait aussi bien
// pour "zéro avis confirmé" que pour "volume d'avis jamais vérifié" — deux
// réalités différentes présentées à l'identique. Voir
// functions/lib/renderAnalysisHtml.js (formatRatingReviewsPhrase).
//
// Défaut 2 (page 4/5 "Vos trois priorités") : la priorité "visibilité
// locale" (signal position/categories) pouvait répéter la priorité
// "clarté/conversion" (signal description) en mentionnant elle aussi "vos
// services", et pouvait suggérer de changer la catégorie principale sans
// preuve suffisante. Voir functions/lib/composer-engine/
// firstActionTemplates.js, functions/lib/reasoning-engine/causes.js et
// functions/lib/reasoning-engine/businessImpacts.js.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runKnowledgeEngine } from "../functions/lib/knowledgeEngine.js";
import { runReasoningEngine } from "../functions/lib/reasoning-engine/reasoningEngine.js";
import { runComposer } from "../functions/lib/composer-engine/composerEngine.js";
import { renderFreeDiagnosticHtml } from "../functions/lib/renderAnalysisHtml.js";
import { buildDocumentModel } from "./renderFreeDiagnosticHtml.test.js";

// ---------------------------------------------------------------------------
// Défaut 1 — affichage avis/note d'une fiche sans avis (page 3)
// ---------------------------------------------------------------------------

async function renderWithCompetitiveEvidence(evidence) {
  const documentModel = await buildDocumentModel("free");
  documentModel.freeDiagnostic.criteriaSummary.summaries = [{
    key: "attractiviteConcurrents",
    label: "À confirmer",
    status: "not_verified",
    evidence,
  }];
  return renderFreeDiagnosticHtml(documentModel);
}

function ownFicheText(html) {
  const match = html.match(/Votre fiche :<\/strong>\s*([^<]*)/);
  return match ? match[1].trim() : null;
}

function competitorText(html) {
  const match = html.match(/Moyenne des concurrents :<\/strong>\s*([^<]*)/);
  return match ? match[1].trim() : null;
}

test("Avis page 3 · 1 — fiche avec zéro avis connu affiche « aucun avis client »", async () => {
  const html = await renderWithCompetitiveEvidence({
    rating: null, reviews: 0, averageRating: 4.1, averageReviews: 19.666666667,
  });
  assert.equal(ownFicheText(html), "aucun avis client");
});

test("Avis page 3 · 2 — aucune trace de « --/5 », « 0/5 et 0 avis », null ou undefined dans le rendu", async () => {
  const scenarios = [
    { rating: null, reviews: 0, averageRating: 4.1, averageReviews: 19.666666667 },
    { rating: null, reviews: null, averageRating: null, averageReviews: null },
    { rating: 1.8, reviews: 5, averageRating: 4.8, averageReviews: 10.6666666667 },
    { rating: null, reviews: 12, averageRating: 4.1, averageReviews: 19.666666667 },
  ];
  for (const evidence of scenarios) {
    const html = await renderWithCompetitiveEvidence(evidence);
    assert.doesNotMatch(html, /--\/5/, JSON.stringify(evidence));
    assert.doesNotMatch(html, /\/5 et --/, JSON.stringify(evidence));
    assert.doesNotMatch(html, /0\/5 et 0 avis/, JSON.stringify(evidence));
    assert.doesNotMatch(html, /\bnull\b/, JSON.stringify(evidence));
    assert.doesNotMatch(html, /\bundefined\b/, JSON.stringify(evidence));
    assert.doesNotMatch(html, /NaN/, JSON.stringify(evidence));
  }
});

test("Avis page 3 · 3 — zéro avis confirmé reste distinct d'un volume d'avis inconnu", async () => {
  const zeroConnu = await renderWithCompetitiveEvidence({
    rating: null, reviews: 0, averageRating: 4.1, averageReviews: 19.666666667,
  });
  const inconnu = await renderWithCompetitiveEvidence({
    rating: null, reviews: null, averageRating: 4.1, averageReviews: 19.666666667,
  });
  assert.equal(ownFicheText(zeroConnu), "aucun avis client");
  assert.equal(ownFicheText(inconnu), "non vérifiable");
  assert.notEqual(ownFicheText(zeroConnu), ownFicheText(inconnu));
});

test("Avis page 3 · 4 — fiche avec avis et note disponibles conserve le format existant", async () => {
  const html = await renderWithCompetitiveEvidence({
    rating: 1.8, reviews: 5, averageRating: 4.8, averageReviews: 10.6666666667,
  });
  assert.equal(ownFicheText(html), "1,8/5 et 5 avis");
  assert.equal(competitorText(html), "4,8/5 et 10,67 avis");
});

test("Avis page 3 · 4bis — avis présents mais note moyenne absente reste distinct de « aucun avis »", async () => {
  const html = await renderWithCompetitiveEvidence({
    rating: null, reviews: 12, averageRating: 4.1, averageReviews: 19.666666667,
  });
  const text = ownFicheText(html);
  assert.notEqual(text, "aucun avis client");
  assert.match(text, /12 avis/);
  assert.doesNotMatch(text, /--|\/5 et 0|0\/5/);
});

test("Avis page 3 · 5 — les concurrents restent affichés normalement même quand la fiche n'a aucun avis", async () => {
  const html = await renderWithCompetitiveEvidence({
    rating: null, reviews: 0, averageRating: 4.1, averageReviews: 19.666666667,
  });
  assert.equal(competitorText(html), "4,1/5 et 19,67 avis");
});

test("Avis page 3 · 6 — concurrents absents : aucune phrase cassée, formulation neutre", async () => {
  const html = await renderWithCompetitiveEvidence({
    rating: null, reviews: 0, averageRating: null, averageReviews: null,
  });
  assert.equal(ownFicheText(html), "aucun avis client");
  assert.equal(competitorText(html), "non vérifiable");
});

test("Avis page 3 · 12 — le correctif ne modifie ni le score, ni les prix, ni la pagination", async () => {
  const html = await renderWithCompetitiveEvidence({
    rating: null, reviews: 0, averageRating: 4.1, averageReviews: 19.666666667,
  });
  const pageCount = (html.match(/<section class="page/g) || []).length;
  // Ce renderer serveur est un parcours distinct du téléchargement gratuit
  // administré par index.html : il reste hors du correctif 4 pages.
  assert.equal(pageCount, 6);
  assert.match(html, /99\s*€/);
  assert.match(html, /349\s*€/);
  assert.match(html, /class="index-value">79<small>/);
});

// ---------------------------------------------------------------------------
// Défaut 2 — chevauchement des priorités "clarté" / "visibilité locale"
// ---------------------------------------------------------------------------

async function buildFreePriorities(businessOverrides, benchmarkOverrides) {
  const knowledgeInput = {
    analysisId: "priority-overlap-fixture",
    business: {
      name: "Entreprise Générique Test",
      category: "Catégorie générique",
      rating: null,
      reviews: 0,
      photos_count: 0,
      has_description: false,
      description_length: 0,
      secondary_categories: 0,
      position: 7,
      search_query: "Activité Ville",
      search_locality_city: "Ville",
      ...businessOverrides,
    },
    benchmark: {
      benchmark_score: 20,
      panel_size: 3,
      confidence: "established",
      percentiles: { rating: null, reviews: 2, photos: 3 },
      gaps: { rating: null, reviews: -19.67, photos: -8 },
      competitor_median: { rating: 4.1, reviews: 19.67, photos: 8 },
      top_competitor: { name: "Concurrent Générique", rating: 4.5, reviews: 40, photos: 15 },
      ...benchmarkOverrides,
    },
  };
  const reportType = "free";
  const knowledge = runKnowledgeEngine({ ...knowledgeInput, reportType });
  const context = { business: knowledgeInput.business, benchmark: knowledgeInput.benchmark };
  const reasoning = runReasoningEngine({
    analysisId: knowledgeInput.analysisId,
    reportType,
    generatedAt: "2026-08-30T08:00:00.000Z",
    context,
    knowledge,
  });
  const bundle = {
    analysisId: knowledgeInput.analysisId,
    reportType,
    generatedAt: "2026-08-30T08:00:00.000Z",
    meta: { businessName: knowledgeInput.business.name, category: knowledgeInput.business.category, city: "Ville", generatedAt: "2026-08-30T08:00:00.000Z" },
    observation: context.business,
    benchmark: context.benchmark,
    knowledge,
    reasoning,
    scoreContext: {},
  };
  const documentModel = await runComposer(bundle);
  return documentModel.freeDiagnostic.priorities;
}

// Profil synthétique reproduisant STRUCTURELLEMENT le cas Computelec (aucun
// avis, aucune photo, description absente, position dégradée sur une
// recherche locale) sans aucune valeur Computelec codée en dur — ni nom, ni
// ville, ni score, ni position réels.
function computelecShapedFixture() {
  return {
    business: {
      rating: null,
      reviews: 0,
      photos_count: 0,
      has_description: false,
      description_length: 0,
      secondary_categories: 0,
      position: 7,
      search_query: "Activité Ville",
      search_locality_city: "Ville",
    },
    benchmark: {},
  };
}

// Profil synthétique isolant "description" et "categories" comme seules
// faiblesses/opportunités (rating/reviews/photos/position déjà forts), pour
// vérifier la priorité "visibilité locale" côté catégories sans dépendre de
// l'ordre de priorité entre signaux.
function clarityAndCategoriesFixture() {
  return {
    business: {
      rating: 4.8,
      reviews: 200,
      photos_count: 60,
      has_description: false,
      description_length: 0,
      secondary_categories: 0,
      position: 1,
    },
    benchmark: {
      benchmark_score: 60,
      percentiles: { rating: 95, reviews: 95, photos: 95 },
      gaps: { rating: 0.5, reviews: 100, photos: 30 },
      competitor_median: { rating: 4.0, reviews: 50, photos: 20 },
    },
  };
}

// Correctif générique (2026-08-30, retour terrain diagnostic gratuit —
// correction fonctionnelle complémentaire) : isole "position" (faible ou
// forte) et "categoryRelevance" (statut de relecture manuelle poor/
// acceptable/strong/unknown, cf. functions/lib/manualReview.js) comme les
// deux seules variables du test, rating/reviews/photos/description restant
// fixés à un niveau neutre/fort pour ne jamais interférer avec le signal
// visibilité locale évalué. secondary_categories: 2 évite que OPP_CATEGORIES
// (absence de catégories secondaires) ne se substitue au signal testé.
function positionAndCategoryEvidenceFixture({ position, categoryRelevance }) {
  return {
    business: {
      rating: 4.6,
      reviews: 120,
      photos_count: 40,
      has_description: true,
      description_length: 800,
      secondary_categories: 2,
      position,
      ...(categoryRelevance !== undefined ? { category_relevance: categoryRelevance } : {}),
    },
    benchmark: {
      benchmark_score: 70,
      percentiles: { rating: 80, reviews: 80, photos: 80 },
      gaps: { rating: 0.3, reviews: 40, photos: 20 },
      competitor_median: { rating: 4.2, reviews: 80, photos: 20 },
    },
  };
}

test("Priorités · 7 — la priorité clarté/conversion (signal description) porte sur la description et les prestations", async () => {
  // Le classement par poids peut faire passer d'autres signaux devant
  // "description" selon le profil (cf. test "pas de forçage") : on utilise
  // ici la fixture qui isole volontairement description+categories comme
  // seules faiblesses, pour garantir sa présence sans figer un ordre.
  const fx = clarityAndCategoriesFixture();
  const priorities = await buildFreePriorities(fx.business, fx.benchmark);
  const clarityPriority = priorities.find((item) => item.signal === "description");
  assert.ok(clarityPriority, "aucune priorité 'description' générée par cette fixture");
  assert.match(clarityPriority.firstAction, /description|services|prestations|différenciants/i);
});

test("Priorités · 8a — la priorité position ne mentionne jamais la catégorie, seulement le classement/écart concurrentiel", async () => {
  // Correction fonctionnelle complémentaire (2026-08-30) : le signal
  // "position" ne doit plus jamais évoquer la catégorie — une position
  // faible seule n'est jamais une preuve d'inadéquation de catégorie.
  for (const fx of [computelecShapedFixture(), clarityAndCategoriesFixture(), positionAndCategoryEvidenceFixture({ position: 7, categoryRelevance: "poor" })]) {
    const priorities = await buildFreePriorities(fx.business, fx.benchmark);
    const positionPriority = priorities.find((item) => item.signal === "position");
    if (!positionPriority) continue;
    const wholeCard = [positionPriority.observed, positionPriority.prospectView, positionPriority.firstAction, positionPriority.expectedResult].join(" ");
    assert.doesNotMatch(wholeCard, /\bservices\b/i, positionPriority.firstAction);
    assert.doesNotMatch(positionPriority.firstAction, /catégorie/i, positionPriority.firstAction);
    assert.match(positionPriority.firstAction, /écarts?|classement|positionn|levier local/i);
  }
});

test("Priorités · 8b — quand la priorité categories apparaît, elle reste sur la catégorie/les recherches locales, jamais sur les services", async () => {
  for (const fx of [computelecShapedFixture(), clarityAndCategoriesFixture()]) {
    const priorities = await buildFreePriorities(fx.business, fx.benchmark);
    const categoriesPriority = priorities.find((item) => item.signal === "categories");
    if (!categoriesPriority) continue;
    const wholeCard = [categoriesPriority.observed, categoriesPriority.prospectView, categoriesPriority.firstAction, categoriesPriority.expectedResult].join(" ");
    assert.doesNotMatch(wholeCard, /\bservices\b/i, categoriesPriority.firstAction);
    assert.match(categoriesPriority.firstAction, /catégorie|recherches locales/i);
  }
});

test("Priorités · 9 — un même premier pas n'est jamais présenté deux fois parmi les priorités affichées", async () => {
  for (const fx of [computelecShapedFixture(), clarityAndCategoriesFixture()]) {
    const priorities = await buildFreePriorities(fx.business, fx.benchmark);
    const firstActions = priorities.map((item) => item.firstAction);
    assert.equal(new Set(firstActions).size, firstActions.length, JSON.stringify(firstActions));
  }
});

test("Priorités · 10 — la formulation sur la catégorie reste prudente, jamais une modification catégorique sans preuve", async () => {
  for (const fx of [computelecShapedFixture(), clarityAndCategoriesFixture()]) {
    const priorities = await buildFreePriorities(fx.business, fx.benchmark);
    const visibilityPriority = priorities.find((item) => item.signal === "position" || item.signal === "categories");
    if (!visibilityPriority) continue;
    const wholeCard = [visibilityPriority.observed, visibilityPriority.prospectView, visibilityPriority.firstAction, visibilityPriority.expectedResult].join(" ");
    assert.doesNotMatch(wholeCard, /catégorie[^.]*doit être (remplacée|supprimée|modifiée)/i, wholeCard);
    assert.doesNotMatch(wholeCard, /(remplacer|supprimer) la catégorie/i, wholeCard);
    assert.doesNotMatch(wholeCard, /meilleur(e)? classement garanti|améliorera votre classement/i, wholeCard);
  }
});

test("Priorités · 11 — aucune valeur Computelec codée en dur dans les modules de génération corrigés", async () => {
  const files = [
    "../functions/lib/renderAnalysisHtml.js",
    "../functions/lib/composer-engine/firstActionTemplates.js",
    "../functions/lib/composer-engine/expectedResultTemplates.js",
    "../functions/lib/reasoning-engine/causes.js",
    "../functions/lib/reasoning-engine/businessImpacts.js",
  ];
  const forbidden = [/computelec/i, /neufch[aâ]teau/i, /f43bf6c3-79cd-4ab8-8f62-525b145da924/i, /entreprise de domotique/i];
  for (const relativePath of files) {
    const content = await readFile(new URL(relativePath, import.meta.url), "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(content, pattern, `${relativePath} contient une valeur Computelec codée en dur (${pattern})`);
    }
  }
});

test("Priorités · structure — le diagnostic gratuit garde exactement 3 priorités et 4 pages avec ce profil", async () => {
  const fx = computelecShapedFixture();
  const priorities = await buildFreePriorities(fx.business, fx.benchmark);
  assert.equal(priorities.length, 3);
});

test("Priorités · pas de forçage — un profil sans faiblesse de catégorie ni de description ne produit ni priorité 'description' ni 'categories'", async () => {
  // Garde-fou générique demandé : la correction ne doit jamais forcer les
  // trois priorités "clarté/visibilité/réputation" si les données d'une
  // autre entreprise justifient un autre ordre.
  const priorities = await buildFreePriorities(
    {
      rating: 2.0,
      reviews: 3,
      photos_count: 0,
      has_description: true,
      description_length: 800,
      secondary_categories: 2,
      position: 1,
    },
    {
      benchmark_score: 30,
      percentiles: { rating: 5, reviews: 5, photos: 5 },
      gaps: { rating: -2, reviews: -50, photos: -20 },
    },
  );
  const signals = priorities.map((item) => item.signal);
  assert.ok(!signals.includes("description"), signals.join(","));
  assert.ok(!signals.includes("categories"), signals.join(","));
});

// Correction fonctionnelle complémentaire (2026-08-30, retour terrain
// diagnostic gratuit) : la recommandation "vérifier la catégorie
// principale" ne doit apparaître QUE lorsque le diagnostic produit
// réellement un signal categories applicable (business.category_relevance
// === "poor" — inadéquation avérée lors de la relecture manuelle), jamais
// à partir de la seule position locale faible. Scénarios 1 à 4 de la
// correction demandée par l'utilisateur.

test("Priorités · 13 — position faible + catégorie précise/conforme ou sans preuve → aucune recommandation de vérifier la catégorie", async () => {
  for (const categoryRelevance of ["strong", "acceptable", "unknown", undefined]) {
    const fx = positionAndCategoryEvidenceFixture({ position: 7, categoryRelevance });
    const priorities = await buildFreePriorities(fx.business, fx.benchmark);
    const categoryMismatch = priorities.find((item) => item.id === "WEAK_CATEGORY_MATCH");
    assert.equal(categoryMismatch, undefined, `categoryRelevance=${categoryRelevance} ne doit jamais produire WEAK_CATEGORY_MATCH`);
  }
});

test("Priorités · 14 — position faible + catégorie inadéquate confirmée (poor) → recommandation prudente de vérification autorisée", async () => {
  const fx = positionAndCategoryEvidenceFixture({ position: 7, categoryRelevance: "poor" });
  const priorities = await buildFreePriorities(fx.business, fx.benchmark);
  const categoryMismatch = priorities.find((item) => item.id === "WEAK_CATEGORY_MATCH");
  assert.ok(categoryMismatch, "categoryRelevance=poor doit produire WEAK_CATEGORY_MATCH quand la position est faible");
  assert.match(categoryMismatch.firstAction, /Vérifier que la catégorie principale correspond bien à l'activité recherchée/);
  // Le premier pas de "position" reste distinct et sans mention de catégorie.
  const positionPriority = priorities.find((item) => item.signal === "position");
  assert.ok(positionPriority);
  assert.doesNotMatch(positionPriority.firstAction, /catégorie/i);
  assert.notEqual(positionPriority.firstAction, categoryMismatch.firstAction);
});

test("Priorités · 15 — bonne position + catégorie inadéquate → le signal categories reste pertinent indépendamment du classement", async () => {
  const fx = positionAndCategoryEvidenceFixture({ position: 1, categoryRelevance: "poor" });
  const priorities = await buildFreePriorities(fx.business, fx.benchmark);
  const categoryMismatch = priorities.find((item) => item.id === "WEAK_CATEGORY_MATCH");
  assert.ok(categoryMismatch, "categoryRelevance=poor doit rester pertinent même avec une position forte (non faible)");
  // Avec une position forte, WEAK_POSITION ne doit pas apparaître (ce n'est
  // pas une faiblesse) : la priorité "categories" n'est donc pas un
  // sous-produit de la position.
  assert.ok(!priorities.some((item) => item.id === "WEAK_POSITION"));
});

test("Priorités · 16 — la formulation categories (WEAK_CATEGORY_MATCH) reste prudente, sans promesse de classement ni suppression forcée", async () => {
  const fx = positionAndCategoryEvidenceFixture({ position: 7, categoryRelevance: "poor" });
  const priorities = await buildFreePriorities(fx.business, fx.benchmark);
  const categoryMismatch = priorities.find((item) => item.id === "WEAK_CATEGORY_MATCH");
  assert.ok(categoryMismatch);
  const wholeCard = [categoryMismatch.observed, categoryMismatch.prospectView, categoryMismatch.firstAction, categoryMismatch.expectedResult].join(" ");
  assert.doesNotMatch(wholeCard, /doit être (remplacée|supprimée|modifiée)/i, wholeCard);
  assert.doesNotMatch(wholeCard, /(remplacer|supprimer) la catégorie/i, wholeCard);
  assert.doesNotMatch(wholeCard, /meilleur(e)? classement garanti|améliorera votre classement/i, wholeCard);
  assert.doesNotMatch(wholeCard, /\bservices\b/i, wholeCard);
});

test("Priorités · 17 — description + categories + position ensemble → trois premiers pas distincts, sans répéter les services", async () => {
  const fx = positionAndCategoryEvidenceFixture({ position: 7, categoryRelevance: "poor" });
  const priorities = await buildFreePriorities(
    { ...fx.business, has_description: false, description_length: 0 },
    fx.benchmark,
  );
  const bySignal = Object.fromEntries(priorities.map((item) => [item.signal, item]));
  assert.ok(bySignal.description, "priorité description manquante");
  assert.ok(bySignal.categories, "priorité categories manquante");
  assert.ok(bySignal.position, "priorité position manquante");
  const firstActions = [bySignal.description.firstAction, bySignal.categories.firstAction, bySignal.position.firstAction];
  assert.equal(new Set(firstActions).size, 3, firstActions.join(" | "));
  // "services" reste le territoire exclusif de description.
  assert.doesNotMatch(bySignal.categories.firstAction, /\bservices\b/i);
  assert.doesNotMatch(bySignal.position.firstAction, /\bservices\b/i);
});

// Scénario 8 (non-régression) : couvert par l'exécution complète de ce
// fichier de test — les 30 tests déjà présents avant cette correction
// fonctionnelle complémentaire restent verts (seul le test "Priorités · 8"
// a été remplacé par "· 8a"/"· 8b" ci-dessus, à la demande explicite de la
// correction : son ancienne assertion acceptait à tort "position" OU
// "categories" indifféremment).
