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

const calculateEfficiaScoreDetail = globalThis.EfficiaScoreCore.calculateScoreDetail;

const html = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
const premiumAdmin = readFileSync(new URL("../js/admin-audit-review.js", import.meta.url), "utf8");
const serverRenderer = readFileSync(new URL("../functions/lib/renderAnalysisHtml.js", import.meta.url), "utf8");

function extractFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, `fonction ${name} introuvable`);
  return source.slice(start, end);
}

function calculateAdminScore(answersByKey, profileKey = "default") {
  const adminGrid = GRILLE.map((category) => ({
    ...category,
    criteres: category.criteres.map((criterion) => ({ ...criterion, id: criterion.key })),
  }));
  const context = {
    GRILLE: adminGrid,
    CONFIG,
    EfficiaScoreCore: { calculateScoreDetail: calculateEfficiaScoreDetail },
    scoringVersionActif: SCORING_VERSION,
    LEGACY_SCORING_VERSION,
    profilActif: profileKey,
    result: null,
    critereEstNote: (criterion) => criterion.scored !== false,
    critereEstMasque: () => false,
    lirePoints: (id) => answersByKey[id] ?? null,
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
  const admin = calculateAdminScore(answersByKey, "artisan");
  const server = calculateScoreDetail(answersByKey, "artisan", SCORING_VERSION);
  assert.equal(Math.round(admin.total), Math.round(server.total));
  assert.ok(Math.abs(admin.maximumEffectifProfil - server.maximumEffectifProfil) < 1e-9);
  assert.equal(admin.totalCrit, 28);
});

test("questionnaire incomplet : administration, brouillon, aperçu et PDF partagent exactement le même score provisoire", () => {
  const localRank = GRILLE.flatMap((category) => category.criteres).find((criterion) => criterion.key === "classementLocal");
  const admin = calculateAdminScore({ classementLocal: 6 }, "artisan");
  const endpoint = runScoreEfficia({
    manualReview: {
      scoringVersion: SCORING_VERSION,
      profileKey: "artisan",
      criteriaReview: [{
        key: "classementLocal",
        question: localRank.q,
        value: "compliant",
        label: localRank.opts[0][0],
        selectedOptionIndex: 0,
        points: 6,
        source: "manual",
      }],
    },
  });
  const adminScore = Math.round(admin.total);
  const savedScore = adminScore;
  const previewScore = endpoint.reviewedScore.roundedScore;
  const pdfScore = endpoint.reviewedScore.roundedScore;
  assert.equal(adminScore, 8);
  assert.equal(adminScore, savedScore);
  assert.equal(savedScore, previewScore);
  assert.equal(previewScore, pdfScore);
  assert.equal(endpoint.reviewedScore.provisional, true);
  assert.match(html, /scoreSnapshot:\{[\s\S]*score:Math\.round\(detail\.total\)/);
  assert.match(serverRenderer, /free\.provisional \? `<p class="methode-note">\$\{PROVISIONAL_SCORE_NOTE\}/);
});

test("le décompte applicable est dynamique et exclut la synthèse non notée", () => {
  const hidden = new Set([
    "nomConforme",
    "photoRecente", "varietePhotos", "qualitePhotos",
    "qualiteReponsesAvis",
    "descriptionQualite", "servicesDecrits",
    "rythmePublication",
  ]);
  const context = {
    GRILLE,
    result: null,
    critereEstNote: (criterion) => criterion.scored !== false,
    critereEstMasque: (criterion) => hidden.has(criterion.key),
    critereEstNonApplicable: () => false,
    etatSiteOfficielCourant: () => ({ etat: "accessible" }),
    rapportSansAvis: () => false,
    REVIEW_DEPENDENT_KEYS: [],
  };
  vm.runInNewContext(`${extractFunction(html, "compterCriteresApplicablesRapport", "critereConfirmeMax")}\nresult = compterCriteresApplicablesRapport();`, context);
  assert.equal(context.result, 20);
  assert.match(html, /function checklistV3Html\(\)/);
  assert.match(html, /\$\{nbApplicables\}<\/b><span>vérifications applicables<\/span>/);
});

test("la page 3 réconcilie les contrôles terminaux non vérifiables sans les confondre avec À confirmer", () => {
  const criteres = [
    { id: "revendiquee", key: "revendiquee", max: 4, q: "Fiche revendiquée", force: "Fiche revendiquée et vérifiée", constat: "La fiche ne semble pas entièrement revendiquée ou vérifiée." },
    { id: "adresse", key: "adresse", max: 3, q: "Adresse / zone", force: "Localisation confirmée", constat: "La zone mérite d’être corrigée." },
  ];
  const source = [
    extractFunction(html, "statutControleRapportV3", "listeControlesRapportV3"),
    extractFunction(html, "listeControlesRapportV3", "libelleStatutRapportV3"),
    extractFunction(html, "libelleStatutRapportV3", "texteControleRapportV3"),
    extractFunction(html, "texteControleRapportV3", "checklistV3Html"),
    extractFunction(html, "checklistV3Html", "critereConfirmeMax"),
  ].join("\n");
  const render = ({ locationMode, addressVerification, serviceAreaVerification }) => {
    const context = {
      GRILLE: [{ cat: "Informations essentielles", criteres }],
      REVIEW_DEPENDENT_KEYS: [],
      LIBELLES_COURTS: {},
      result: null,
      critereEstNote: () => true,
      critereEstMasque: () => false,
      critereEstNonApplicable: () => false,
      critereEstNonVerifiablePubliquement: () => false,
      rapportSansAvis: () => false,
      etatSiteOfficielCourant: () => ({ etat: "accessible" }),
      modeLocalisation: () => locationMode,
      reponseAdresse: () => addressVerification,
      reponseZoneDesserte: () => serviceAreaVerification,
      lirePoints: (id) => id === "revendiquee" ? 4 : 0,
      forceChiffree: (criterion) => `Preuve positive : ${criterion.key}.`,
      faiblesseChiffree: (criterion) => `Faiblesse : ${criterion.key}.`,
      globalThis: {
        EfficiaQuestionnaireFinalization: {
          isAddressVerificationComplete: (value) => ["exact", "inaccurate", "not_verifiable"].includes(value),
          isServiceAreaVerificationComplete: (value) => ["coherent", "inaccurate", "not_verifiable"].includes(value),
        },
      },
    };
    vm.runInNewContext(`${source}\nresult = checklistV3Html();`, context);
    return context.result;
  };

  const terminal = render({ locationMode: "storefront", addressVerification: "not_verifiable", serviceAreaVerification: "unknown" });
  assert.deepEqual({ ...terminal.counts }, { ok: 1, warn: 0, ko: 0, unknown: 0, not_verifiable: 1 });
  assert.equal(terminal.total, 2);
  assert.equal(terminal.total, Object.values(terminal.counts).reduce((sum, count) => sum + count, 0));
  assert.match(terminal.html, /Non vérifiables<\/span><small>publiquement/u);
  assert.match(terminal.html, /v3-method-top--with-neutral/u);
  assert.match(terminal.html, /v3-status--neutral/u);
  assert.match(terminal.html, /Preuve positive : revendiquee\./u, "un badge Conforme ne doit jamais réutiliser la formulation négative");
  assert.doesNotMatch(terminal.html, /La fiche ne semble pas entièrement revendiquée/u);

  const hybridMissingArea = render({ locationMode: "hybrid", addressVerification: "not_verifiable", serviceAreaVerification: "unknown" });
  assert.deepEqual({ ...hybridMissingArea.counts }, { ok: 1, warn: 0, ko: 0, unknown: 1, not_verifiable: 0 });
  assert.equal(hybridMissingArea.total, 2, "la zone desservie manquante reste un contrôle distinct");
  assert.match(hybridMissingArea.html, /contrôles encore non résolus/u);
});

test("le reliquat des priorités est dédupliqué par identité métier, y compris pour le site technique", () => {
  const context = { result: null };
  vm.runInNewContext(`${extractFunction(html, "clePriorite", "prioriteInfosRevendiquee")}\nresult = {
    all: prioritesDistinctesRapport([
      { priorityKey:"revendiquee" }, { priorityKey:"adresse" }, { priorityKey:"horaires" }, { priorityKey:"contact" }, { priorityKey:"contact" }
    ], [
      { famille:"site_officiel" }, { priorityKey:"revendiquee" }, { priorityKey:"adresse" }
    ]).map(identitePrioriteRapport),
    remaining: compterPrioritesRestantesRapport([
      { priorityKey:"revendiquee" }, { priorityKey:"adresse" }, { priorityKey:"horaires" }, { priorityKey:"contact" }, { priorityKey:"contact" }
    ], [
      { famille:"site_officiel" }, { priorityKey:"revendiquee" }, { priorityKey:"adresse" }
    ])
  };`, context);
  assert.deepEqual([...context.result.all], ["revendiquee", "adresse", "horaires", "contact", "site_officiel"]);
  assert.equal(context.result.remaining, 2);
  assert.match(html, /projete:Math\.max\(Math\.round\(score\), projectionBrute\.projete\)/u, "le potentiel affiché ne peut pas être inférieur au score actuel");
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
  assert.match(serverRenderer, /vérifications applicables à cette fiche/);
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
