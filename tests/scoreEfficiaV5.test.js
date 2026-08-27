import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { GRILLE } from "../functions/lib/score-efficia/criteriaCatalog.js";
import {
  CONFIG,
  BANDES,
  LEGACY_SCORING_VERSION,
  SCORING_VERSION,
} from "../functions/lib/score-efficia/scoreConfig.js";
import { buildScoreCatalog, buildScorePrefill } from "../functions/lib/score-efficia/scoreCatalog.js";
import { calculateScoreDetail, runScoreEfficia } from "../functions/lib/score-efficia/scoreEngine.js";
import { incompleteQuestionnaireFields } from "../functions/lib/score-efficia/questionnaireRules.js";

const html = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
const premiumAdmin = readFileSync(new URL("../js/admin-audit-review.js", import.meta.url), "utf8");
const serverRenderer = readFileSync(new URL("../functions/lib/renderAnalysisHtml.js", import.meta.url), "utf8");

function extractFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, `fonction ${name} introuvable`);
  return source.slice(start, end);
}

function calculateAdminScore(answers, profileKey = "default") {
  const context = {
    GRILLE,
    result: null,
    obtenirProfilActif: () => CONFIG.secteurs[profileKey] || CONFIG.secteurs.default,
    critereEstNote: (criterion) => criterion.scored !== false,
    lirePoints: (id) => answers.get(id) ?? null,
  };
  vm.runInNewContext(`${extractFunction(html, "calculScoreDetail", "listerElementsRestantsPourFinalisation")}\nresult = calculScoreDetail();`, context);
  return context.result;
}

const fullAnswers = () => Object.fromEntries(GRILLE.flatMap((category) => (
  category.criteres.map((criterion) => [criterion.key, criterion.max])
)));

const completeReview = (scoringVersion = SCORING_VERSION) => ({
  scoringVersion,
  profileKey: "default",
  photoPresence: "present",
  reviewsPresence: "present",
  locationMode: "storefront",
  addressVerification: "exact",
  serviceAreaVerification: "unknown",
  criteriaReview: GRILLE.flatMap((category) => category.criteres.map((criterion) => ({
    key: criterion.key,
    category: category.cat,
    question: criterion.q,
    value: "compliant",
    label: criterion.opts[0][0],
    selectedOptionIndex: 0,
    points: criterion.max,
    source: criterion.key === "attractiviteConcurrents" ? "auto" : "manual",
  }))),
});

test("v5 dérive le maximum effectif de chaque profil sans valeur codée en dur", () => {
  const expected = {
    default: 96,
    artisan: 95.2,
    restaurant: 96,
    commerce: 95.6,
    professionLiberale: 95.2,
    sante: 95.2,
    hebergement: 96,
  };
  for (const [profileKey, maximum] of Object.entries(expected)) {
    const detail = calculateScoreDetail(fullAnswers(), profileKey, SCORING_VERSION);
    assert.ok(Math.abs(detail.maximumEffectifProfil - maximum) < 1e-9, profileKey);
    assert.equal(Math.round(detail.total), 100, profileKey);
  }
});

test("v5 borne le score, normalise le maximum à 100 et le minimum à 0", () => {
  assert.equal(Math.round(calculateScoreDetail(fullAnswers(), "default", SCORING_VERSION).total), 100);
  assert.equal(Math.round(calculateScoreDetail({}, "default", SCORING_VERSION).total), 0);
  const excessive = Object.fromEntries(Object.entries(fullAnswers()).map(([key, value]) => [key, value * 100]));
  assert.equal(calculateScoreDetail(excessive, "default", SCORING_VERSION).total, 100);
});

test("attractivité Devant, Derrière ou ancienne valeur AUTO ne change jamais le score v5", () => {
  const answers = fullAnswers();
  const ahead = calculateScoreDetail({ ...answers, attractiviteConcurrents: 4 }, "artisan", SCORING_VERSION);
  const behind = calculateScoreDetail({ ...answers, attractiviteConcurrents: 0 }, "artisan", SCORING_VERSION);
  const missing = calculateScoreDetail({ ...answers, attractiviteConcurrents: null }, "artisan", SCORING_VERSION);
  assert.equal(ahead.total, behind.total);
  assert.equal(behind.total, missing.total);
  assert.equal(ahead.totalCrit, 28);
  assert.ok(Math.abs(ahead.categories.find((item) => item.key === "visibilite").maximumEffectifCategorie - 7.2) < 1e-9);
});

test("le classement local ne récupère pas les 4,8 points retirés au profil Artisan", () => {
  const answers = Object.fromEntries(Object.keys(fullAnswers()).map((key) => [key, 0]));
  answers.classementLocal = 6;
  answers.attractiviteConcurrents = 4;
  const detail = calculateScoreDetail(answers, "artisan", SCORING_VERSION);
  const visibility = detail.categories.find((item) => item.key === "visibilite");
  assert.ok(Math.abs(visibility.pointsPonderesBruts - 7.2) < 1e-9);
  assert.equal(visibility.pct, 0.6);
  assert.notEqual(visibility.pointsPonderesBruts, 12);
});

test("administration et serveur produisent le même score v5 sur un questionnaire complet", () => {
  const answersByKey = fullAnswers();
  const answersById = new Map(GRILLE.flatMap((category) => category.criteres.map((criterion) => (
    [criterion.id, answersByKey[criterion.key]]
  ))));
  const admin = calculateAdminScore(answersById, "artisan");
  const server = calculateScoreDetail(answersByKey, "artisan", SCORING_VERSION);
  assert.equal(Math.round(admin.total), Math.round(server.total));
  assert.ok(Math.abs(admin.maximumEffectifProfil - server.maximumEffectifProfil) < 1e-9);
  assert.equal(admin.totalCrit, 28);
});

test("la divergence préexistante des questionnaires incomplets reste documentée", () => {
  const localRank = GRILLE.flatMap((category) => category.criteres).find((criterion) => criterion.key === "classementLocal");
  const admin = calculateAdminScore(new Map([[localRank.id, 6]]), "artisan");
  const server = calculateScoreDetail({ classementLocal: 6 }, "artisan", SCORING_VERSION);
  assert.equal(Math.round(admin.total), 100, "l’administration renormalise encore les seules réponses disponibles");
  assert.equal(Math.round(server.total), 8, "le serveur conserve les critères manquants au dénominateur");
  assert.notEqual(Math.round(admin.total), Math.round(server.total));
});

test("v4 explicite conserve le moteur historique et une analyse sans version reste historique", () => {
  const answers = fullAnswers();
  const legacy = calculateScoreDetail(answers, "artisan", LEGACY_SCORING_VERSION);
  assert.equal(legacy.total, 100);
  assert.equal(legacy.totalCrit, 29);

  const historical = runScoreEfficia({
    manualReview: { ...completeReview(LEGACY_SCORING_VERSION), scoringVersion: LEGACY_SCORING_VERSION },
  });
  assert.equal(historical.reviewedScore.scoringVersion, LEGACY_SCORING_VERSION);
  assert.equal(historical.reviewedScore.totalCrit, 29);
});

test("v5 retire la synthèse de la complétude et conserve son JSON historique chargeable", () => {
  const review = completeReview();
  review.criteriaReview = review.criteriaReview.filter((item) => item.key !== "attractiviteConcurrents");
  assert.deepEqual(incompleteQuestionnaireFields(review), []);
  const result = runScoreEfficia({ manualReview: review, scoringVersion: SCORING_VERSION });
  assert.equal(result.reviewedScore.totalCrit, 28);
  assert.equal(result.scoreInputs.answers.attractiviteConcurrents, null);

  const withLegacyJson = completeReview();
  withLegacyJson.criteriaReview.find((item) => item.key === "attractiviteConcurrents").points = 4;
  assert.doesNotThrow(() => runScoreEfficia({ manualReview: withLegacyJson, scoringVersion: SCORING_VERSION }));
});

test("catalogue v5 : 28 critères notés, une synthèse sans radios et nouveau libellé du volume", () => {
  const catalog = buildScoreCatalog(SCORING_VERSION);
  const criteria = catalog.categories.flatMap((category) => category.criteria);
  const summary = criteria.find((criterion) => criterion.key === "attractiviteConcurrents");
  const volume = criteria.find((criterion) => criterion.key === "volumeAvis");
  assert.equal(criteria.filter((criterion) => criterion.scored).length, 28);
  assert.equal(criteria.filter((criterion) => criterion.informational).length, 1);
  assert.deepEqual(summary.options, []);
  assert.equal(summary.max, 0);
  assert.equal(volume.question, "Le volume d’avis est-il supérieur à la moyenne des trois concurrents les mieux placés ?");
  assert.match(html, /data-informational-criterion="attractiviteConcurrents"/);
  assert.match(html, /data-legacy-attractiveness-options hidden/);
  assert.match(premiumAdmin, /data-informational-criterion/);
  assert.match(serverRenderer, /28 critères notés[^\n"]+synthèse concurrentielle non notée/);
  assert.match(serverRenderer, /\.free-diagnostic \.page-criteria \.chk-grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(serverRenderer, /\/96|\/95[,.][26]/);
});

test("cas Bivert artisan : synthèse Derrière sans perte supplémentaire", () => {
  const analysis = {
    business: {
      rating: 1.8,
      reviews: 5,
      competitors: [{ reviews: 5 }, { reviews: 7 }, { reviews: 20 }],
      normalized: {},
    },
    benchmark: { averages: { rating: 4.8, reviews: 10.6666666667 } },
  };
  const summary = buildScorePrefill(analysis, { scoringVersion: SCORING_VERSION }).criteria
    .find((criterion) => criterion.key === "attractiviteConcurrents");
  assert.equal(summary.label, "Derrière");
  assert.equal(summary.points, null);
  assert.equal(summary.scored, false);

  const answers = fullAnswers();
  answers.noteMoyenne = 0;
  answers.volumeAvis = 0;
  const withAhead = calculateScoreDetail({ ...answers, attractiviteConcurrents: 4 }, "artisan", SCORING_VERSION);
  const withBehind = calculateScoreDetail({ ...answers, attractiviteConcurrents: 0 }, "artisan", SCORING_VERSION);
  assert.equal(Math.round(withAhead.total), Math.round(withBehind.total));
  assert.equal(Math.round(withBehind.total), 88);
  assert.equal(Math.round(calculateScoreDetail({ ...answers, attractiviteConcurrents: 0 }, "artisan", LEGACY_SCORING_VERSION).total), 83);
});

test("les seuils restent appliqués après l’unique arrondi final", () => {
  const bandFor = (score) => BANDES.find((band) => score >= band.min) || BANDES.at(-1);
  [50, 70, 85].forEach((threshold) => {
    assert.equal(bandFor(Math.round(threshold - 0.49)).min, threshold);
    assert.ok(bandFor(Math.round(threshold - 0.51)).min < threshold);
  });
  assert.equal(CONFIG.totalScore, 100);
});
