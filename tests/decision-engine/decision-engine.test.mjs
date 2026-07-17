import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createDecisionEngine, fixtureDirectory, loadFixture } from "./current-engine-harness.mjs";

const FIXTURE_DIR = fixtureDirectory();
const fixtureFiles = fs.readdirSync(FIXTURE_DIR)
  .filter(file => file.endsWith(".json"))
  .sort();
const fixtures = fixtureFiles.map(file => ({ file, fixture: loadFixture(path.join(FIXTURE_DIR, file)) }));

test("fixtures de non-regression disponibles", () => {
  assert.equal(fixtures.length, 8);
  assert.deepEqual(fixtureFiles, [
    "average-business.json",
    "health-profile.json",
    "incomplete-data.json",
    "pack-projection.json",
    "photos-recency.json",
    "restaurant-profile.json",
    "strong-business.json",
    "weak-business.json"
  ]);
});

test("les profils sectoriels conservent un total de 100 points", () => {
  const { CONFIG } = createDecisionEngine();
  for (const [profileKey, profile] of Object.entries(CONFIG.secteurs)) {
    const total = ["informations", "photos", "avis", "contenu", "activite", "visibilite"]
      .reduce((sum, categoryKey) => sum + profile[categoryKey], 0);
    assert.equal(total, 100, `Profil ${profileKey}`);
  }
});

for (const { file, fixture } of fixtures) {
  test(`${fixture.id}: calculScoreDetail(), indicesProspect(), priorites et projection restent stables`, () => {
    const engine = createDecisionEngine(fixture);
    const snapshot = engine.snapshot();

    assert.equal(snapshot.globalScore, fixture.expected.globalScore);
    assert.equal(snapshot.rawScore, fixture.expected.rawScore);
    assert.equal(snapshot.answeredCriteria, fixture.expected.answeredCriteria);
    assert.equal(snapshot.totalCriteria, fixture.expected.totalCriteria);
    assert.deepEqual(snapshot.evaluatedCategories, fixture.expected.evaluatedCategories);
    assert.equal(snapshot.denominatorWeight, fixture.expected.denominatorWeight);
    assert.deepEqual(snapshot.categories, fixture.expected.categories);
    assert.deepEqual(snapshot.indices, fixture.expected.indices);
    assert.deepEqual(snapshot.priorities, fixture.expected.priorities);
    assert.deepEqual(snapshot.projectedPack, fixture.expected.projectedPack);
    assert.deepEqual(snapshot.criteriaStatusCounts, fixture.expected.criteriaStatusCounts);
    assert.deepEqual(snapshot.payloadSummary, fixture.expected.payloadSummary);
  });

  test(`${fixture.id}: invariants du moteur de decision`, () => {
    const engine = createDecisionEngine(fixture);
    const detail = engine.calculScoreDetail();
    const snapshot = engine.snapshot();
    const payload = engine.construirePayloadAuditComplete({ pdfFilename: `${fixture.id}.pdf` });

    assert.ok(detail.total >= 0 && detail.total <= 100, `${file}: score hors bornes`);
    assert.ok(snapshot.projectedPack.projete <= 97, `${file}: projection Pack > 97`);
    assert.ok(snapshot.priorities.length <= 3, `${file}: plus de 3 priorités`);
    assert.equal(new Set(snapshot.priorities.map(priority => priority.family)).size, snapshot.priorities.length, `${file}: famille dupliquée`);

    for (const category of detail.categories) {
      if (category.repondusCat === 0) {
        assert.equal(category.pct, null, `${file}: categorie vide incluse`);
        assert.equal(category.pointsPonderes, null, `${file}: categorie vide pondérée`);
      }
    }

    for (const criterion of payload.criteria) {
      if (criterion.evaluationStatus === "not_evaluated") {
        assert.equal(criterion.pointsAwarded, null, `${file}: critère non évalué avec points`);
        assert.equal(criterion.verificationStatus, "not_verified", `${file}: critère non évalué mal vérifié`);
      }
      assert.ok(["compliant", "partial", "deficient", "not_evaluated"].includes(criterion.evaluationStatus));
      assert.ok(["observed", "manually_confirmed", "inferred", "not_verified", "unavailable"].includes(criterion.verificationStatus));
    }

    const secondSnapshot = createDecisionEngine(fixture).snapshot();
    assert.deepEqual(secondSnapshot, snapshot, `${file}: résultats non déterministes`);
  });
}

test("incomplete-data: les catégories sans donnée sont exclues du dénominateur", () => {
  const fixture = loadFixture(path.join(FIXTURE_DIR, "incomplete-data.json"));
  const snapshot = createDecisionEngine(fixture).snapshot();

  assert.deepEqual(snapshot.evaluatedCategories, ["informations"]);
  assert.equal(snapshot.denominatorWeight, 22);
  assert.equal(snapshot.criteriaStatusCounts.evaluation.not_evaluated, 21);
  assert.equal(snapshot.payloadSummary.notEvaluatedNullPoints, true);
});

test("photos-recency: le volume photo n'est pas traité comme une faiblesse quand l'actualité est le vrai sujet", () => {
  const fixture = loadFixture(path.join(FIXTURE_DIR, "photos-recency.json"));
  const engine = createDecisionEngine(fixture);
  const [firstPriority] = engine.snapshot().priorities;

  assert.equal(firstPriority.family, "photos");
  assert.equal(firstPriority.criterion, "photoRecente");
  assert.equal(engine.prioritePhotosPorteSurActualite(firstPriority), true);
});

test("pack-projection: la projection Pack est plafonnée à 97", () => {
  const fixture = loadFixture(path.join(FIXTURE_DIR, "pack-projection.json"));
  const projection = createDecisionEngine(fixture).scoreProjetePack();

  assert.equal(projection.projete, 97);
  assert.ok(projection.corriges > 0);
});

test("average-business: scoreCriteres() et payload audit complete exposent les champs attendus", () => {
  const fixture = loadFixture(path.join(FIXTURE_DIR, "average-business.json"));
  const engine = createDecisionEngine(fixture);
  const payload = engine.construirePayloadAuditComplete({ pdfFilename: "average-business.pdf" });

  assert.equal(engine.scoreCriteres(["descriptionRemplie", "descriptionQualite", "servicesPresents", "servicesDecrits"]), 43);
  assert.equal(payload.pdfFilename, "average-business.pdf");
  assert.equal(payload.scoreEfficia, fixture.expected.globalScore);
  assert.equal(payload.visibilityScore, fixture.expected.indices.visibilite);
  assert.equal(payload.trustScore, fixture.expected.indices.confiance);
  assert.equal(payload.conversionScore, fixture.expected.indices.conversion);
  assert.equal(payload.sectorProfile, "default");
  assert.equal(payload.criteria.length, fixture.expected.totalCriteria);
  assert.ok(payload.criteria.some(criterion => criterion.key === "volumeAvis" && criterion.verificationStatus === "observed"));
});
