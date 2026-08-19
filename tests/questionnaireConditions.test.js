import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildReviewedObservation, normalizeManualReview } from "../functions/lib/manualReview.js";
import { GRILLE } from "../functions/lib/score-efficia/criteriaCatalog.js";
import {
  PHOTO_DEPENDENT_KEYS,
  REVIEW_DEPENDENT_KEYS,
  incompleteQuestionnaireFields,
} from "../functions/lib/score-efficia/questionnaireRules.js";
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
