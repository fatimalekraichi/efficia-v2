import test from "node:test";
import assert from "node:assert/strict";
import { calculateScoreDetail, runScoreEfficia, scoreProjetePack } from "../functions/lib/score-efficia/scoreEngine.js";

test("un critère non vérifié compte au dénominateur (grille de 100) comme dans l'ancien outil", () => {
  const { reviewedScore } = runScoreEfficia({
    manualReview: {
      criteriaReview: [
        { key: "revendiquee", value: "compliant", label: "Oui" },
        { key: "categoriePrincipale", value: "not_verified", label: "À confirmer" },
      ],
    },
  });

  // Grille pleine : seul revendiquee (3 pts) est renseigné, tout le reste vaut 0.
  // L'ancien Score Efficia (calc() : somme brute) donnait donc 3/100, jamais 100.
  assert.equal(reviewedScore.roundedScore, 3);
  assert.equal(reviewedScore.repondus, 1);
  assert.equal(reviewedScore.categories.find((category) => category.key === "informations").maxEvalue, 24);
});

test("scoreProjetePack ne corrige que les critères historiquement livrables par le Pack", () => {
  const projection = scoreProjetePack({
    noteMoyenne: 0,
    descriptionRemplie: 0,
  });

  assert.equal(projection.projete, 4);
  assert.equal(projection.corriges, 1);
  assert.equal(projection.ameliorables, 2);
});

test("calculateScoreDetail conserve la pondération historique et les profils secteur", () => {
  const detailDefault = calculateScoreDetail({
    revendiquee: 3,
    nombrePhotos: 3,
  });
  const detailSante = calculateScoreDetail({
    revendiquee: 3,
    nombrePhotos: 3,
  }, "sante");

  assert.equal(Math.round(detailDefault.total), 6);
  assert.equal(Math.round(detailSante.total), 5);
  assert.equal(detailDefault.profil.informations, 24);
  assert.equal(detailSante.profil.informations, 28);
});
