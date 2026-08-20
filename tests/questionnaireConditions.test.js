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
  assert.equal(runScoreEfficia({ manualReview }).scoreInputs.answers.descriptionQualite, 0);
});

test("les deux interfaces masquent et effacent les dépendances sans modifier les 29 critères", () => {
  const modern = readFileSync(new URL("../js/admin-audit-review.js", import.meta.url), "utf8");
  const legacy = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
  const legacyCatalog = readFileSync(new URL("../src/decision-engine/criteria.catalog.js", import.meta.url), "utf8");
  assert.equal(GRILLE.flatMap((category) => category.criteres).length, 29);
  for (const source of [modern, legacy]) {
    assert.doesNotMatch(source, /La fiche contient-elle des photos \?/);
    assert.match(source, /Aucun avis/);
    assert.match(source, /PHOTO_DEPENDENT_KEYS/);
    assert.match(source, /REVIEW_DEPENDENT_KEYS/);
  }
  assert.match(modern, /Aucune photo/);
  assert.match(legacyCatalog, /Aucune photo/);
  assert.match(modern, /if \(hidden\) clearCriterionAnswer\(key\)/);
  assert.match(modern, /reviewsPresence === "none" && criterion\.key === "noteMoyenne"/);
  assert.match(legacy, /if\(masquer\) effacerReponseCritere\(key\)/);
  assert.match(legacy, /function critereEstMasque\(cr\)/);
  assert.match(legacy, /const visibleCriteria = cat\.criteres\.filter\(cr => !critereEstMasque\(cr\)\)/);
});

test("le catalogue v4 remplace le test de recherches par le contrôle manuel du nom sans changer les 29 critères", () => {
  const flatCriteria = GRILLE.flatMap((category) => category.criteres);
  const information = GRILLE.find((category) => category.key === "informations");
  const visibility = GRILLE.find((category) => category.key === "visibilite");
  const nameCriterion = flatCriteria.find((criterion) => criterion.key === "nomConforme");
  assert.equal(flatCriteria.length, 29);
  assert.equal(flatCriteria.some((criterion) => criterion.key === "recherchesSpecifiques"), false);
  assert.equal(information.pts, 24);
  assert.equal(visibility.pts, 10);
  assert.deepEqual(GRILLE.map((category) => [category.key, category.pts]), [
    ["informations", 24], ["photos", 15], ["avis", 25],
    ["contenu", 21], ["activite", 5], ["visibilite", 10],
  ]);
  assert.equal(nameCriterion.q, "Le nom de la fiche correspond-il au nom réel de l’entreprise, sans ajout artificiel de mots-clés ?");
  assert.deepEqual(nameCriterion.opts.map(([label, points]) => [label, points]), [
    ["Conforme au nom réel", 2],
    ["Douteux / légèrement surchargé", 1],
    ["Ajouts artificiels manifestes", 0],
  ]);
  assert.equal(nameCriterion.aide, "Comparer avec l’enseigne, le site officiel et les mentions légales. Ne pas pénaliser une ville, un métier ou un service lorsqu’il fait réellement partie du nom commercial utilisé par l’entreprise.");
});

test("un brouillon v3 ne recycle pas l’ancienne réponse et exige le nouveau contrôle du nom", () => {
  const legacy = normalizeManualReview({
    questionnaireVersion: "score-efficia-questionnaire-v3",
    photoPresence: "present",
    reviewsPresence: "present",
    criteriaReview: [
      ...completeCriteria().filter((item) => item.key !== "nomConforme"),
      { key: "recherchesSpecifiques", category: "Visibilité locale", question: "Ancien contrôle", value: "compliant" },
    ],
  });
  assert.equal(legacy.criteriaReview.some((item) => item.key === "recherchesSpecifiques"), false);
  assert.equal(incompleteQuestionnaireFields(legacy).includes("nomConforme"), true);
});

test("les quatre dépendances serveur suppriment les sous-réponses forgées et les notent à zéro", () => {
  const pairs = [
    ["tauxReponseAvis", "qualiteReponsesAvis"],
    ["descriptionRemplie", "descriptionQualite"],
    ["servicesPresents", "servicesDecrits"],
    ["publicationRecente", "rythmePublication"],
  ];
  for (const [parent, child] of pairs) {
    const criteriaReview = completeCriteria().map((item) => item.key === parent
      ? { ...item, value: "deficient", selectedOptionIndex: 2, points: 0 }
      : item);
    const manualReview = normalizeManualReview({ photoPresence: "present", reviewsPresence: "present", criteriaReview });
    assert.equal(manualReview.criteriaReview.some((item) => item.key === child), false);
    assert.equal(runScoreEfficia({ manualReview }).scoreInputs.answers[child], 0);
    assert.equal(incompleteQuestionnaireFields(manualReview).includes(child), false);
    const reactivated = normalizeManualReview({
      ...manualReview,
      criteriaReview: manualReview.criteriaReview.map((item) => item.key === parent
        ? { ...item, value: "compliant", selectedOptionIndex: 0, points: undefined }
        : item),
    });
    assert.equal(reactivated.criteriaReview.some((item) => item.key === child), false);
    assert.equal(runScoreEfficia({ manualReview: reactivated }).scoreInputs.answers[child], null);
    assert.equal(incompleteQuestionnaireFields(reactivated).includes(child), true);
  }
});

test("le diagnostic gratuit et l’audit Premium utilisent exactement le même calcul", () => {
  const criteriaReview = completeCriteria();
  const shared = { photoPresence: "present", reviewsPresence: "present", criteriaReview };
  const free = runScoreEfficia({ manualReview: normalizeManualReview({ ...shared, reportType: "free" }) });
  const premium = runScoreEfficia({ manualReview: normalizeManualReview({ ...shared, reportType: "premium" }) });
  assert.deepEqual(free.scoreInputs.answers, premium.scoreInputs.answers);
  assert.deepEqual(free.reviewedScore, premium.reviewedScore);
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
