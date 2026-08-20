import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildReviewedObservation, normalizeManualReview } from "../functions/lib/manualReview.js";
import { GRILLE } from "../functions/lib/score-efficia/criteriaCatalog.js";
import {
  QUESTIONNAIRE_VERSION,
  PHOTO_DEPENDENT_KEYS,
  REVIEW_DEPENDENT_KEYS,
  incompleteQuestionnaireFields,
  locationScore,
} from "../functions/lib/score-efficia/questionnaireRules.js";
import { buildScorePrefill } from "../functions/lib/score-efficia/scoreCatalog.js";
import { runScoreEfficia } from "../functions/lib/score-efficia/scoreEngine.js";

const completeCriteria = () => GRILLE.flatMap((category) => category.criteres.map((criterion) => ({
  key: criterion.key,
  category: category.cat,
  question: criterion.q,
  value: "compliant",
  label: criterion.opts[0][0],
  selectedOptionIndex: 0,
  points: criterion.max,
})));

test("Aucune photo supprime les quatre réponses masquées et applique leur score nul", () => {
  const manualReview = normalizeManualReview({
    reportType: "free",
    photoPresence: "none",
    reviewsPresence: "present",
    criteriaReview: completeCriteria(),
  });
  assert.deepEqual(
    manualReview.criteriaReview.filter((item) => PHOTO_DEPENDENT_KEYS.includes(item.key)),
    [],
  );
  const first = runScoreEfficia({ manualReview });
  const second = runScoreEfficia({ manualReview });
  PHOTO_DEPENDENT_KEYS.forEach((key) => {
    assert.equal(first.scoreInputs.answers[key], 0);
    assert.equal(first.scoreInputs.criteria.find((item) => item.key === key).source, "conditional_absence");
  });
  assert.deepEqual(first, second);
  assert.equal(first.reviewedScore.repondus, 29);
  assert.deepEqual(incompleteQuestionnaireFields(manualReview), []);
});

test("le retour à Oui ne restaure pas silencieusement les anciennes réponses photo", () => {
  const withoutPhotos = normalizeManualReview({
    photoPresence: "none",
    reviewsPresence: "present",
    criteriaReview: completeCriteria(),
  });
  const withPhotosAgain = normalizeManualReview({
    ...withoutPhotos,
    photoPresence: "present",
  });
  PHOTO_DEPENDENT_KEYS.forEach((key) => {
    assert.equal(withPhotosAgain.criteriaReview.some((item) => item.key === key), false);
    assert.equal(runScoreEfficia({ manualReview: withPhotosAgain }).scoreInputs.answers[key], null);
  });
  assert.ok(incompleteQuestionnaireFields(withPhotosAgain).includes("nombrePhotos"));
});

test("Aucun avis est distinct d’une note artificielle de 0 sur 5", () => {
  const manualReview = normalizeManualReview({
    photoPresence: "present",
    reviewsPresence: "none",
    criteriaReview: completeCriteria(),
  });
  const observation = buildReviewedObservation({ rating: 4.8, reviews: 12, photos_count: 8 }, manualReview);
  assert.equal(observation.rating, null);
  assert.equal(observation.reviews, 0);
  assert.equal(manualReview.criteriaReview.some((item) => item.key === "noteMoyenne"), false);
  REVIEW_DEPENDENT_KEYS.forEach((key) => assert.equal(manualReview.criteriaReview.some((item) => item.key === key), false));
  const score = runScoreEfficia({ manualReview });
  ["noteMoyenne", ...REVIEW_DEPENDENT_KEYS].forEach((key) => {
    assert.equal(score.scoreInputs.answers[key], 0);
  });
  assert.deepEqual(incompleteQuestionnaireFields(manualReview), []);
});

test("un champ réellement visible et incomplet bloque la finalisation", () => {
  const criteriaReview = completeCriteria().filter((item) => item.key !== "nap");
  const manualReview = normalizeManualReview({
    photoPresence: "none",
    reviewsPresence: "none",
    criteriaReview,
  });
  assert.deepEqual(incompleteQuestionnaireFields(manualReview), ["nap"]);
});

test("une sous-question masquée par une réponse déficiente ne bloque pas la finalisation", () => {
  const criteriaReview = completeCriteria()
    .filter((item) => item.key !== "descriptionQualite")
    .map((item) => item.key === "descriptionRemplie" ? { ...item, value: "deficient", selectedOptionIndex: 2, points: 0 } : item);
  const manualReview = normalizeManualReview({
    photoPresence: "present",
    reviewsPresence: "present",
    criteriaReview,
  });
  assert.equal(manualReview.criteriaReview.some((item) => item.key === "descriptionQualite"), false);
  assert.deepEqual(incompleteQuestionnaireFields(manualReview), []);
  assert.equal(runScoreEfficia({ manualReview }).scoreInputs.answers.descriptionQualite, null);
});

test("les deux interfaces masquent et effacent les dépendances sans modifier les 29 critères", () => {
  const modern = readFileSync(new URL("../js/admin-audit-review.js", import.meta.url), "utf8");
  const legacy = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
  assert.equal(GRILLE.flatMap((category) => category.criteres).length, 29);
  for (const source of [modern, legacy]) {
    assert.match(source, /La fiche contient-elle des photos \?/);
    assert.match(source, /Aucune photo/);
    assert.match(source, /Aucun avis/);
    assert.match(source, /PHOTO_DEPENDENT_KEYS/);
    assert.match(source, /REVIEW_DEPENDENT_KEYS/);
  }
  assert.match(modern, /if \(hidden\) clearCriterionAnswer\(key\)/);
  assert.match(modern, /reviewsPresence === "none" && criterion\.key === "noteMoyenne"/);
  assert.match(legacy, /if\(masquer\) effacerReponseCritere\(key\)/);
});

test("le mode de réception pilote le critère historique adresse sans ajouter de trentième critère", () => {
  const flatCriteria = GRILLE.flatMap((category) => category.criteres);
  assert.equal(flatCriteria.length, 29);
  assert.equal(flatCriteria.reduce((sum, criterion) => sum + criterion.max, 0), 100);
  assert.equal(flatCriteria.filter((criterion) => criterion.key === "adresse").length, 1);
  assert.equal(flatCriteria.find((criterion) => criterion.key === "adresse").max, 2);
  assert.equal(flatCriteria.some((criterion) => criterion.key === "locationMode"), false);

  assert.equal(locationScore({ locationMode: "storefront", addressVerification: "exact" }), 2);
  assert.equal(locationScore({ locationMode: "storefront", addressVerification: "inaccurate" }), 0);
  assert.equal(locationScore({ locationMode: "service_area", serviceAreaVerification: "coherent" }), 2);
  assert.equal(locationScore({ locationMode: "service_area", serviceAreaVerification: "partial" }), 1);
  assert.equal(locationScore({ locationMode: "service_area", serviceAreaVerification: "incoherent" }), 0);
  assert.equal(locationScore({ locationMode: "hybrid", addressVerification: "exact", serviceAreaVerification: "coherent" }), 2);
  assert.equal(locationScore({ locationMode: "hybrid", addressVerification: "exact", serviceAreaVerification: "incoherent" }), 1);
  assert.equal(locationScore({ locationMode: "hybrid", addressVerification: "inaccurate", serviceAreaVerification: "coherent" }), 1);
  assert.equal(locationScore({ locationMode: "hybrid", addressVerification: "inaccurate", serviceAreaVerification: "incoherent" }), 0);

  const switchedToStorefront = normalizeManualReview({
    questionnaireVersion: QUESTIONNAIRE_VERSION,
    locationMode: "storefront",
    addressVerification: "exact",
    serviceAreaVerification: "coherent",
    criteriaReview: completeCriteria(),
  });
  assert.equal(switchedToStorefront.addressVerification, "exact");
  assert.equal(switchedToStorefront.serviceAreaVerification, "unknown");

  const serviceAreaReview = normalizeManualReview({
    questionnaireVersion: QUESTIONNAIRE_VERSION,
    locationMode: "service_area",
    serviceAreaVerification: "partial",
    criteriaReview: completeCriteria(),
  });
  const serviceAreaCriterion = runScoreEfficia({ manualReview: serviceAreaReview }).scoreInputs.criteria
    .find((criterion) => criterion.key === "adresse");
  assert.equal(serviceAreaCriterion.points, 1);
  assert.match(serviceAreaCriterion.question, /zone desservie/i);
  assert.doesNotMatch(serviceAreaCriterion.question, /adresse/i);
});

test("non vérifiable reste à confirmer et bloque la finalisation sans pénalité arbitraire", () => {
  const manualReview = normalizeManualReview({
    questionnaireVersion: QUESTIONNAIRE_VERSION,
    photoPresence: "present",
    reviewsPresence: "present",
    locationMode: "service_area",
    serviceAreaVerification: "not_verifiable",
    criteriaReview: completeCriteria(),
  });
  assert.equal(runScoreEfficia({ manualReview }).scoreInputs.answers.adresse, null);
  assert.ok(incompleteQuestionnaireFields(manualReview).includes("serviceAreaVerification"));
});

test("un audit historique conserve son ancien score adresse jusqu’au choix explicite d’un mode", () => {
  const oldReview = normalizeManualReview({
    photoPresence: "present",
    reviewsPresence: "present",
    criteriaReview: completeCriteria().map((item) => item.key === "adresse" ? { ...item, points: 2 } : item),
  });
  assert.equal(oldReview.locationMode, "unknown");
  assert.equal(runScoreEfficia({ manualReview: oldReview }).scoreInputs.answers.adresse, 2);

  const edited = normalizeManualReview({
    ...oldReview,
    questionnaireVersion: QUESTIONNAIRE_VERSION,
    locationMode: "hybrid",
    addressVerification: "exact",
    serviceAreaVerification: "partial",
  });
  assert.equal(runScoreEfficia({ manualReview: edited }).scoreInputs.answers.adresse, 1);
  assert.deepEqual(incompleteQuestionnaireFields(edited), []);
});

test("le préremplissage fournisseur ne déduit jamais le mode de réception depuis une adresse", () => {
  const prefill = buildScorePrefill({
    business: { normalized: { address: "1 rue Exemple", full_address: "1 rue Exemple, Bruxelles" } },
  });
  assert.equal(prefill.conditions.locationMode, "unknown");
  assert.equal(prefill.conditions.addressVerification, "unknown");
  assert.equal(prefill.criteria.find((criterion) => criterion.key === "adresse").value, "not_verified");
});

test("les deux questionnaires effacent les valeurs de localisation devenues invisibles", () => {
  const modern = readFileSync(new URL("../js/admin-audit-review.js", import.meta.url), "utf8");
  const legacy = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
  for (const source of [modern, legacy]) {
    assert.match(source, /Comment l’entreprise reçoit-elle ses clients \?/);
    assert.match(source, /L’adresse et l’épingle Google Maps sont-elles exactes \?/);
    assert.match(source, /La zone desservie est-elle renseignée et cohérente \?/);
    assert.match(source, /not_verifiable/);
  }
  assert.match(modern, /if \(!applicable\) block\.querySelectorAll\('input\[type="radio"\]'\)\.forEach/);
  assert.match(modern, /\["storefront", "hybrid"\]\.includes\(conditions\.locationMode\)/);
  assert.match(modern, /\["service_area", "hybrid"\]\.includes\(conditions\.locationMode\)/);
  assert.match(legacy, /if\(!applicable\) document\.querySelectorAll\(`input\[name="\$\{name\}"\]`\)\.forEach/);
  assert.match(legacy, /\["storefront","hybrid"\]\.includes\(mode\)/);
  assert.match(legacy, /\["service_area","hybrid"\]\.includes\(mode\)/);
});

test("les brouillons des deux questionnaires sauvegardent et restaurent exactement la localisation", () => {
  const modern = readFileSync(new URL("../js/admin-audit-review.js", import.meta.url), "utf8");
  const legacy = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
  for (const source of [modern, legacy]) {
    assert.match(source, /locationMode/);
    assert.match(source, /addressVerification/);
    assert.match(source, /serviceAreaVerification/);
    assert.match(source, /1200/);
  }
  assert.match(modern, /fillCriteriaFromAnalysis\(currentAnalysis, answers\)/);
  assert.match(legacy, /restaurerLocalisation\(answers\)/);
  assert.match(legacy, /restaurerLocalisation\(data\)/);
});
