import test from "node:test";
import assert from "node:assert/strict";
import { buildReviewedData } from "../functions/lib/manualReview.js";
import { __test__ as pdfRouteTest } from "../functions/api/pdf/_shared.js";
import { renderAnalysisHtml } from "../functions/lib/renderAnalysisHtml.js";
import { buildKnowledgeInput } from "../functions/api/knowledge/_shared.js";

const baseAnalysisRow = {
  analysis_id: "analysis-review-1",
  nom: "Cabinet Test",
  ville: "Arlon",
  activity: "Médecin",
  name: "Cabinet Test",
  rating: 4.2,
  reviews: 12,
  photos_count: 4,
  description_length: 0,
  local_position: null,
  search_query: null,
  competitors_json: "[]",
  normalized_json: JSON.stringify({
    name: "Cabinet Test",
    phone: "+32 00 00 00",
    website: "https://example.com",
    observed_fields: ["description"],
  }),
};

test("description 0 caractère devient une description absente", () => {
  const { reviewedObservation } = buildReviewedData(baseAnalysisRow, {});

  assert.equal(reviewedObservation.descriptionLength, 0);
  assert.equal(reviewedObservation.descriptionStatus, "absent");
  assert.equal(reviewedObservation.hasDescription, false);
});

test("une description non récupérée ne devient pas artificiellement absente", () => {
  const row = {
    ...baseAnalysisRow,
    normalized_json: JSON.stringify({ name: "Cabinet Test", observed_fields: [] }),
  };
  const { reviewedObservation } = buildReviewedData(row, {});
  assert.equal(reviewedObservation.descriptionLength, null);
  assert.equal(reviewedObservation.descriptionStatus, "unknown");
  assert.equal(reviewedObservation.hasDescription, null);
});

test("0 concurrent garde un benchmark indisponible sans prétendre comparer à 3 concurrents", () => {
  const { reviewedBenchmark } = buildReviewedData(baseAnalysisRow, {});

  assert.equal(reviewedBenchmark.competitorCount, 0);
  assert.equal(reviewedBenchmark.benchmarkConfidence, "unavailable");
  assert.deepEqual(reviewedBenchmark.competitors, []);
});

test("les contrôles visuels restent inconnus tant qu'ils ne sont pas confirmés", () => {
  const { reviewedObservation } = buildReviewedData(baseAnalysisRow, {});

  assert.equal(reviewedObservation.photoQuality, "unknown");
  assert.equal(reviewedObservation.photoRelevance, "unknown");
  assert.equal(reviewedObservation.visualConsistency, "unknown");
  assert.equal(reviewedObservation.reviewResponseStatus, "unknown");
});

test("la validation humaine conserve les critères détaillés de contrôle", () => {
  const { manualReview } = buildReviewedData(baseAnalysisRow, {
    criteriaReview: [
      {
        key: "photoRecente",
        category: "Photos et visuels",
        question: "Une photo récente a-t-elle été ajoutée ?",
        value: "deficient",
        label: "Plus de 6 mois",
        checklist: ["Photo datée"],
      },
      {
        key: "qualitePhotos",
        category: "Photos et visuels",
        question: "Les photos donnent-elles une impression professionnelle ?",
        value: "not_verified",
        label: "Non vérifié",
        checklist: ["Photos nettes"],
      },
      {
        key: "",
        question: "Critère incomplet",
        value: "compliant",
      },
      {
        key: "nap",
        category: "Informations essentielles",
        question: "Le nom, l’adresse et le téléphone semblent-ils cohérents ?",
        value: "valeur-invalide",
        label: "Valeur invalide",
      },
    ],
  });

  assert.equal(manualReview.criteriaReview.length, 3);
  assert.deepEqual(manualReview.criteriaReview[0], {
    key: "photoRecente",
    category: "Photos et visuels",
    question: "Une photo récente a-t-elle été ajoutée ?",
    value: "deficient",
    label: "Plus de 6 mois",
    checklist: ["Photo datée"],
  });
  assert.equal(manualReview.criteriaReview[1].value, "not_verified");
  assert.deepEqual(manualReview.criteriaReview[1].checklist, ["Photos nettes"]);
  assert.equal(manualReview.criteriaReview[2].key, "nap");
  assert.equal(manualReview.criteriaReview[2].value, "not_verified");
});

test("les données originales ne sont pas remplacées par la validation humaine", () => {
  const row = {
    ...baseAnalysisRow,
    competitors_json: JSON.stringify([{ name: "Concurrent A", place_id: "a", rating: 4.8 }]),
  };
  const originalCompetitorsJson = row.competitors_json;

  const { reviewedBenchmark } = buildReviewedData(row, {
    excludedCompetitorIds: ["a"],
    confirmedCity: "Bruxelles",
  });

  assert.equal(row.competitors_json, originalCompetitorsJson);
  assert.equal(row.ville, "Arlon");
  assert.equal(reviewedBenchmark.location, "Bruxelles");
  assert.equal(reviewedBenchmark.competitorCount, 0);
});

test("Knowledge utilise les données révisées quand elles existent", () => {
  const { reviewedObservation, reviewedBenchmark } = buildReviewedData({
    ...baseAnalysisRow,
    competitors_json: JSON.stringify([
      { name: "Concurrent A", place_id: "a", rating: 4.8, reviews: 20, photos_count: 10 },
      { name: "Concurrent B", place_id: "b", rating: 4.6, reviews: 16, photos_count: 8 },
    ]),
  }, {
    confirmedCity: "Bruxelles",
    confirmedCategory: "Médecin généraliste",
    confirmedPosition: 2,
    confirmedQuery: "médecin Bruxelles",
    descriptionStatus: "absent",
  });

  const input = buildKnowledgeInput({
    ...baseAnalysisRow,
    avg_rating: 4.1,
    avg_reviews: 99,
    avg_photos: 99,
    rating_gap: 0.1,
    reviews_gap: -87,
    photos_gap: -95,
    benchmark_score: 44,
    benchmark_completed_at: "2026-07-24T10:00:00.000Z",
    reviewed_observation_json: JSON.stringify(reviewedObservation),
    reviewed_benchmark_json: JSON.stringify(reviewedBenchmark),
    reviewed_score_json: JSON.stringify({
      scoringVersion: "score-efficia-v4",
      roundedScore: 81,
      score: 80.7,
    }),
    scoring_version: "score-efficia-v4",
  });

  assert.equal(input.business.category, "Médecin généraliste");
  assert.equal(input.business.position, 2);
  assert.equal(input.business.has_description, false);
  assert.equal(input.benchmark.panel_size, 2);
  assert.equal(input.benchmark.confidence, "limited");
  assert.equal(input.benchmark.benchmark_score, 81);
  assert.equal(input.benchmark.scoring_version, "score-efficia-v4");
  assert.equal(input.benchmark.competitor_median.reviews, 18);
});

test("les recommandations de réponse aux avis restent impossibles sans donnée vérifiée", () => {
  const { reviewedObservation } = buildReviewedData(baseAnalysisRow, {});
  const input = buildKnowledgeInput({
    ...baseAnalysisRow,
    benchmark_completed_at: "2026-07-24T10:00:00.000Z",
    reviewed_observation_json: JSON.stringify(reviewedObservation),
  });

  assert.equal(input.business.review_response_status, "unknown");
  assert.equal(input.business.owner_response_rate, null);
});

test("le PDF serveur est impossible avant approbation", () => {
  assert.equal(pdfRouteTest.canGeneratePdf({ status: "awaiting_review" }), false);
  assert.equal(pdfRouteTest.canGeneratePdf({ status: "preview_ready" }), false);
  assert.equal(pdfRouteTest.canGeneratePdf({ status: "approved" }), true);
  assert.equal(pdfRouteTest.canGeneratePdf({ status: "pdf_generated" }), true);
});

test("le renderer traduit les valeurs techniques visibles", () => {
  const html = renderAnalysisHtml({
    meta: { generatedAt: "2026-07-24T10:00:00Z", composerVersion: "1.0" },
    hero: {
      businessName: "Cabinet Test",
      city: "Arlon",
      category: "Médecin",
      score: 72,
      headline: "Une fiche claire à renforcer.",
      proofPoints: [],
    },
    executiveSummary: { text: "Résumé." },
    priorities: [
      {
        id: "p1",
        title: "Renforcer la confiance",
        whyItMatters: "Pourquoi.",
        proof: "Preuve.",
        businessImpact: "Impact.",
        timeEstimate: "20 minutes",
        severity: "high",
      },
    ],
    strengths: [],
    weaknesses: [],
    opportunities: [],
    actionPlan: [
      {
        id: "a1",
        // Sprint 5 (finition éditoriale) : "impactType" est le champ
        // réellement lu par actionCard() (renderAnalysisHtml.js) pour la
        // traduction "trust" → "Confiance" (LABEL_TRANSLATIONS). L'ancien nom
        // "expectedImpact" n'est lu par aucune fonction du renderer : la
        // vérification de traduction ci-dessous passait jusqu'ici par
        // coïncidence, via l'intitulé statique "Confiance" de la page "Vos
        // points forts" — page désormais omise quand strengths est vide
        // (objectif 7). On corrige donc le nom de champ pour tester ce que
        // ce test prétend réellement tester.
        action: "Action",
        difficulty: "hard",
        estimatedTime: "1 heure",
        canEfficiaAutomate: true,
        impactType: "trust",
      },
    ],
    whyNow: { text: "Pourquoi maintenant." },
    methodology: { text: "Méthode." },
    disclaimer: { text: "Note." },
    footer: {},
  });

  assert.match(html, /Élevé/);
  assert.match(html, /Difficile/);
  assert.match(html, /Confiance/);
  assert.doesNotMatch(html, />high</);
  assert.doesNotMatch(html, />hard</);
  assert.doesNotMatch(html, />trust</);
});
