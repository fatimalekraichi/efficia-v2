import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { collectCompetitors } from "../functions/lib/collectCompetitors.js";
import {
  buildScorePrefill,
  classifyReviewVolume,
} from "../functions/lib/score-efficia/scoreCatalog.js";

const html = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
const route = readFileSync(new URL("../functions/api/admin/free-diagnostic-collect/[analysisId].js", import.meta.url), "utf8");

function decision(reviews, competitorReviews) {
  return classifyReviewVolume({
    reviews,
    competitors:competitorReviews.map((value) => ({ reviews:value })),
  });
}

function volumeCriterion(reviews, competitorReviews) {
  return buildScorePrefill({
    business:{
      reviews,
      competitors:competitorReviews.map((value, index) => ({ name:`Concurrent ${index + 1}`, reviews:value })),
      normalized:{},
    },
    benchmark:{ averages:{} },
  }, { verifiedCategoryEvidence:true }).criteria.find((criterion) => criterion.key === "volumeAvis");
}

test("volume d'avis strictement supérieur à 110 % donne Supérieur (5)", () => {
  const result = decision(111, [100, 100, 100]);
  assert.equal(result.status, "superior");
  assert.equal(volumeCriterion(111, [100, 100, 100]).points, 5);
});

test("les limites exactes de 90 % et 110 % donnent Comparable (3)", () => {
  for (const reviews of [90, 110]) {
    const result = decision(reviews, [100, 100, 100]);
    assert.equal(result.status, "comparable");
    assert.equal(volumeCriterion(reviews, [100, 100, 100]).points, 3);
  }
});

test("volume strictement inférieur à 90 % donne Inférieur (0)", () => {
  const result = decision(89, [100, 100, 100]);
  assert.equal(result.status, "inferior");
  assert.equal(volumeCriterion(89, [100, 100, 100]).points, 0);
});

test("moyenne nulle : une fiche positive est Supérieure et une fiche nulle est Comparable", () => {
  assert.equal(decision(1, [0, 0, 0]).status, "superior");
  assert.equal(decision(0, [0, 0, 0]).status, "comparable");
});

test("moins de trois volumes concurrents valides reste À confirmer sans point", () => {
  const result = classifyReviewVolume({ reviews:10, competitors:[{ reviews:5 }, { reviews:"inconnu" }, { reviews:20 }] });
  assert.equal(result.status, "unknown");
  const criterion = buildScorePrefill({
    business:{ reviews:10, competitors:[{ reviews:5 }, { reviews:null }, { reviews:20 }], normalized:{} },
    benchmark:{ averages:{ reviews:12 } },
  }, { verifiedCategoryEvidence:true }).criteria.find((item) => item.key === "volumeAvis");
  assert.equal(criterion.value, "not_verified");
  assert.equal(criterion.points, null);
  const missingTarget = volumeCriterion(null, [5, 7, 20]);
  assert.equal(missingTarget.value, "not_verified");
  assert.equal(missingTarget.points, null);
});

test("la collecte exclut cible, doublon, sponsorisé et volume inexploitable avant de retenir les trois premiers valides", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ data:[[ 
    { name:"Annonce", place_id:"ad", reviews:999, sponsored:true },
    { name:"Bivert Alain", place_id:"target", reviews:5, sponsored:false },
    { name:"Concurrent A", place_id:"a", reviews:5, sponsored:false },
    { name:"Concurrent A dupliqué", place_id:"a", reviews:9, sponsored:false },
    { name:"Sans avis exploitable", place_id:"invalid", reviews:"—", sponsored:false },
    { name:"Concurrent B", place_id:"b", reviews:7, sponsored:false },
    { name:"Concurrent C", place_id:"c", reviews:20, sponsored:false },
    { name:"Concurrent D", place_id:"d", reviews:30, sponsored:false },
  ]] });
  try {
    const result = await collectCompetitors({
      requete:"Électricien Attert",
      activite:"Électricien",
      ville:"Attert",
      placeIdCible:"target",
      apiKey:"fixture-key",
      suppressSensitiveLogs:true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.sponsoredResultsExcluded, 1);
    assert.deepEqual(result.concurrents.map((item) => item.name), ["Concurrent A", "Concurrent B", "Concurrent C"]);
    assert.deepEqual(result.concurrents.map((item) => item.reviews), [5, 7, 20]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cas permanent Bivert : 5 face à 5, 7 et 20 donne Inférieur (0)", () => {
  const result = decision(5, [5, 7, 20]);
  assert.equal(result.averageReviews, 32 / 3);
  assert.equal(result.ratio, 0.46875);
  assert.equal(result.status, "inferior");
  const criterion = volumeCriterion(5, [5, 7, 20]);
  assert.equal(criterion.label, "Inférieur");
  assert.equal(criterion.points, 0);
  assert.deepEqual(criterion.evidence.competitorReviews, [5, 7, 20]);
});

test("la relance recalcule et réapplique volumeAvis, conserve le manuel contradictoire et affiche sa preuve", () => {
  const refresh = html.slice(html.indexOf("function appliquerResultatsRecherche"), html.indexOf("async function relancerAnalyseRecherche"));
  assert.match(refresh, /"volumeAvis"/);
  assert.match(refresh, /criteresTouchesManuellement\.has\(criterion\.id\)/);
  assert.match(refresh, /reviewVolumeManualConflict = true/);
  assert.match(html, /Votre fiche : \$\{formatReviews\(reviewEvidence\.value\)\} avis · Concurrents/);
  assert.match(html, /comparaison avec une tolérance de 10 %/);
  assert.match(html, /id="review-volume-manual-warning"/);
});

test("la collecte initiale et la relance persistent concurrents et moyenne dans une seule mise à jour", () => {
  const initial = route.slice(route.indexOf("const competitorsJson = JSON.stringify(competitorData.concurrents)"));
  const refresh = route.slice(route.indexOf("async function refreshSearchAnalysis"), route.indexOf("async function clearFailedCollection"));
  for (const source of [initial, refresh]) {
    assert.match(source, /competitors_json = \?/);
    assert.match(source, /avg_reviews = \?/);
    assert.match(source, /reviews_gap = \?/);
  }
});
