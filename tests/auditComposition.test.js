import test from "node:test";
import assert from "node:assert/strict";
import { computeCompetitiveRank, buildBenchmarkContext } from "../functions/lib/auditComposition.js";

// Point 3 du plan (2026-07-31, Sprint 1 "Constats irréfutables") : rang exact
// du client parmi les concurrents déjà collectés (analysis.business.competitors).
// Aucun nouveau calcul de benchmark, simple tri/comptage.

test("computeCompetitiveRank compte les concurrents strictement mieux notés", () => {
  const analysis = {
    business: {
      rating: 4.2,
      competitors: [{ rating: 4.6 }, { rating: 4.8 }, { rating: 4.0 }],
    },
  };

  assert.deepEqual(computeCompetitiveRank(analysis), { aheadCount: 2, totalCompetitors: 3 });
});

test("computeCompetitiveRank retourne null sans concurrents", () => {
  const analysis = { business: { rating: 4.2, competitors: [] } };

  assert.equal(computeCompetitiveRank(analysis), null);
});

test("computeCompetitiveRank retourne null sans note client", () => {
  const analysis = { business: { competitors: [{ rating: 4.6 }] } };

  assert.equal(computeCompetitiveRank(analysis), null);
});

test("computeCompetitiveRank retourne 0 en tête quand aucun concurrent ne dépasse le client", () => {
  const analysis = {
    business: {
      rating: 4.9,
      competitors: [{ rating: 4.6 }, { rating: 4.1 }],
    },
  };

  assert.deepEqual(computeCompetitiveRank(analysis), { aheadCount: 0, totalCompetitors: 2 });
});

test("computeCompetitiveRank lit reviewed.rating en priorité (grille validée manuellement)", () => {
  const analysis = {
    business: {
      rating: 4.9,
      reviewed: { rating: 4.0 },
      competitors: [{ rating: 4.5 }],
    },
  };

  assert.deepEqual(computeCompetitiveRank(analysis), { aheadCount: 1, totalCompetitors: 1 });
});

test("buildBenchmarkContext expose rank au même niveau que top_competitor", () => {
  const analysis = {
    business: {
      rating: 4.2,
      competitors: [{ rating: 4.6 }],
    },
    benchmark: {
      completedAt: "2026-07-24T08:00:00.000Z",
      score: 80,
      topCompetitor: { name: "Concurrent anonymisé", rating: 4.8 },
    },
  };

  const context = buildBenchmarkContext(analysis);

  assert.deepEqual(context.rank, { aheadCount: 1, totalCompetitors: 1 });
  assert.equal(context.top_competitor.name, "Concurrent anonymisé");
});
