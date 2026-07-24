import test from "node:test";
import assert from "node:assert/strict";
import { renderAnalysisHtml } from "../functions/lib/renderAnalysisHtml.js";

function makeAnalysis(overrides = {}) {
  return {
    analysisId: "analysis-1",
    status: "completed",
    business: {
      name: "La Planche des Saveurs",
      ville: "Dinant",
      activity: "restaurant",
      rating: 4.6,
      reviews: 449,
      photosCount: 623,
      competitors: [
        {
          name: "L'Inattendu",
          rating: 4.8,
          reviews: 324,
          photos_count: 234,
        },
      ],
    },
    benchmark: {
      score: 97,
      topCompetitor: {
        name: "L'Inattendu",
        rating: 4.8,
        reviews: 324,
      },
    },
    knowledge: {
      version: "1.0.0",
      summary: "La fiche obtient une base solide.",
      strengths: [
        {
          id: "FORCE_REVIEWS",
          signal: "reviews",
          message: "Votre réputation est portée par un volume d'avis solide.",
        },
      ],
      weaknesses: [
        {
          id: "WEAK_POSITION",
          signal: "position",
          message: "Votre fiche peut progresser sur la visibilité locale.",
        },
      ],
      opportunities: [
        {
          id: "OPP_DESCRIPTION",
          signal: "description",
          message: "Votre description peut être mieux exploitée.",
        },
      ],
      top_priorities: [
        {
          id: "WEAK_POSITION",
          signal: "position",
          message: "Renforcer la visibilité sur la recherche locale.",
        },
      ],
    },
    timestamps: {
      createdAt: "2026-07-24T07:00:00.000Z",
      knowledgeCompletedAt: "2026-07-24T07:01:00.000Z",
    },
    ...overrides,
  };
}

test("renderAnalysisHtml produit un document HTML complet avec les sections attendues", () => {
  const html = renderAnalysisHtml(makeAnalysis());

  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /La Planche des Saveurs/);
  assert.match(html, /Dinant · restaurant/);
  assert.match(html, /97\/100/);
  assert.match(html, /Résumé exécutif/);
  assert.match(html, /Forces/);
  assert.match(html, /Faiblesses/);
  assert.match(html, /Opportunités prioritaires/);
  assert.match(html, /Priorités/);
  assert.match(html, /Benchmark/);
  assert.match(html, /Meilleur concurrent/);
  assert.match(html, /Version du moteur : 1.0.0/);
});

test("renderAnalysisHtml affiche uniquement les données reçues sans recalculer le benchmark", () => {
  const html = renderAnalysisHtml(makeAnalysis());

  assert.match(html, /<td>4\.6<\/td>/);
  assert.match(html, /<td>4\.8<\/td>/);
  assert.match(html, /<td>449<\/td>/);
  assert.match(html, /<td>324<\/td>/);
  assert.match(html, /<td>623<\/td>/);
  assert.match(html, /<td>234<\/td>/);
});

test("renderAnalysisHtml échappe les contenus externes", () => {
  const html = renderAnalysisHtml(makeAnalysis({
    business: {
      name: "<script>alert('x')</script>",
      ville: "Dinant",
      activity: "restaurant",
      rating: 4.6,
      reviews: 449,
      photosCount: 623,
      competitors: [],
    },
    knowledge: {
      version: "1.0.0",
      summary: "Résumé <b>important</b>",
      strengths: [],
      weaknesses: [],
      opportunities: [],
      top_priorities: [],
    },
  }));

  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt;/);
  assert.match(html, /Résumé &lt;b&gt;important&lt;\/b&gt;/);
});
