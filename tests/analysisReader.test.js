import test from "node:test";
import assert from "node:assert/strict";
import { formatAnalysisRow } from "../functions/lib/analysisReader.js";

test("formatAnalysisRow parse les colonnes JSON et ne renvoie pas de chaîne JSON", () => {
  const output = formatAnalysisRow({
    analysis_id: "analysis-1",
    status: "completed",
    nom: "La Planche des Saveurs",
    ville: "Dinant",
    query: "La Planche des Saveurs Dinant",
    activity: "restaurant",
    search_query: "restaurant Dinant",
    place_id: "place-1",
    name: "La planche des saveurs",
    rating: 4.6,
    reviews: 449,
    photos_count: 623,
    description_length: 0,
    local_position: 4,
    fiche_json: "{\"name\":\"La planche des saveurs\"}",
    normalized_json: "{\"photos_sample_count\":3}",
    competitors_json: "[{\"name\":\"Concurrent\"}]",
    benchmark_score: 97,
    avg_rating: 4.7,
    avg_reviews: 340,
    avg_photos: 234,
    rating_gap: -0.1,
    reviews_gap: 109,
    photos_gap: 389,
    rating_percentile: 17,
    reviews_percentile: 100,
    photos_percentile: 100,
    top_competitor_name: "Concurrent",
    top_competitor_rating: 4.8,
    top_competitor_reviews: 324,
    benchmark_completed_at: "2026-07-24T07:00:00.000Z",
    knowledge_json: "{\"summary\":\"OK\"}",
    knowledge_completed_at: "2026-07-24T07:01:00.000Z",
    created_at: "2026-07-24T06:59:00.000Z",
    updated_at: "2026-07-24T07:01:00.000Z",
  });

  assert.equal(output.analysisId, "analysis-1");
  assert.equal(output.business.fiche.name, "La planche des saveurs");
  assert.equal(output.business.normalized.photos_sample_count, 3);
  assert.equal(output.business.competitors[0].name, "Concurrent");
  assert.equal(output.knowledge.summary, "OK");
  assert.equal(typeof output.business.fiche, "object");
  assert.equal(typeof output.knowledge, "object");
});

test("formatAnalysisRow retourne null pour les JSON vides", () => {
  const output = formatAnalysisRow({
    analysis_id: "analysis-empty",
    status: "collected",
    fiche_json: "",
    normalized_json: null,
    competitors_json: "",
    knowledge_json: null,
  });

  assert.equal(output.business.fiche, null);
  assert.equal(output.business.normalized, null);
  assert.equal(output.business.competitors, null);
  assert.equal(output.knowledge, null);
});
