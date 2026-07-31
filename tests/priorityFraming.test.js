import test from "node:test";
import assert from "node:assert/strict";
import { angleForSignal, buildConstat, buildEffortImpactNote } from "../functions/lib/composer-engine/priorityFraming.js";

// Sprint 3 — objectif 1 ("chaque priorité raconte une histoire") : un angle
// psychologique distinct par signal, jamais une formulation générique répétée.

test("angleForSignal : chaque signal connu a un angle distinct (aucun doublon, aucun texte vide)", () => {
  const signals = ["rating", "reviews", "photos", "description", "categories", "position"];
  const angles = signals.map(angleForSignal);

  for (const angle of angles) {
    assert.equal(typeof angle, "string");
    assert.ok(angle.length > 0);
  }
  assert.equal(new Set(angles).size, angles.length, "chaque signal doit avoir un angle différent");
});

test("angleForSignal : signal inconnu renvoie null (aucune formulation générique de repli)", () => {
  assert.equal(angleForSignal("unknown_signal"), null);
  assert.equal(angleForSignal(undefined), null);
});

// Objectif 3 : le Constat est une phrase purement factuelle dérivée de
// item.evidence.value déjà calculé (evidence.js) — jamais inventée, jamais
// recalculée.

test("buildConstat : produit une phrase factuelle non vide pour chacun des 6 signaux", () => {
  const cases = [
    { signal: "rating", evidence: { value: 4.1 } },
    { signal: "reviews", evidence: { value: 8 } },
    { signal: "photos", evidence: { value: 3 } },
    { signal: "description", evidence: { value: 120 } },
    { signal: "categories", evidence: { value: 2 } },
    { signal: "position", evidence: { value: 4 } },
  ];

  for (const item of cases) {
    const constat = buildConstat(item);
    assert.equal(typeof constat, "string", `${item.signal} devrait produire une phrase`);
    assert.ok(constat.length > 0);
    assert.match(constat, new RegExp(String(item.evidence.value).replace(".", "\\.")));
  }
});

test("buildConstat : reflète fidèlement la valeur réelle, y compris à zéro (jamais d'invention)", () => {
  assert.match(buildConstat({ signal: "photos", evidence: { value: 0 } }), /aucune photo/i);
  assert.match(buildConstat({ signal: "description", evidence: { value: 0 } }), /aucune description/i);
  assert.match(buildConstat({ signal: "categories", evidence: { value: 0 } }), /aucune catégorie/i);
});

test("buildConstat : renvoie null sans valeur disponible ou pour un signal inconnu (jamais d'extrapolation)", () => {
  assert.equal(buildConstat({ signal: "rating", evidence: {} }), null);
  assert.equal(buildConstat({ signal: "rating", evidence: null }), null);
  assert.equal(buildConstat({ signal: "unknown_signal", evidence: { value: 5 } }), null);
  assert.equal(buildConstat({}), null);
});

test("buildConstat est déterministe (même entrée, même sortie)", () => {
  const item = { signal: "reviews", evidence: { value: 8 } };
  assert.equal(buildConstat(item), buildConstat({ ...item, evidence: { ...item.evidence } }));
});

// Objectif 4 : la phrase effort/impact ne recalcule jamais la difficulté ni
// le temps — elle ne fait que les relier dans une phrase courte.

test("buildEffortImpactNote : une phrase distincte par palier de difficulté/temps", () => {
  const easy = buildEffortImpactNote({ difficulty: "easy", estimatedTime: "15–20 min" });
  const medium = buildEffortImpactNote({ difficulty: "medium", estimatedTime: "30–60 min" });
  // "hard" avec un temps borné (non "en continu"/"variable"/"long terme") pour
  // isoler le palier "hard" du repli "délai indéterminé" testé séparément.
  const hard = buildEffortImpactNote({ difficulty: "hard", estimatedTime: "quelques heures" });
  const openEnded = buildEffortImpactNote({ difficulty: "medium", estimatedTime: "variable" });

  for (const note of [easy, medium, hard, openEnded]) {
    assert.equal(typeof note, "string");
    assert.ok(note.length > 0);
  }
  assert.equal(new Set([easy, medium, hard, openEnded]).size, 4, "chaque combinaison doit produire un texte différent");
});

test("buildEffortImpactNote : un délai indéterminé (variable/en continu/long terme) prime toujours sur la difficulté", () => {
  const a = buildEffortImpactNote({ difficulty: "hard", estimatedTime: "en continu" });
  const b = buildEffortImpactNote({ difficulty: "medium", estimatedTime: "long terme" });

  assert.equal(a, b);
  assert.match(a, /progressiv|durée/i);
});

test("buildEffortImpactNote : renvoie null sans difficulté connue", () => {
  assert.equal(buildEffortImpactNote({}), null);
  assert.equal(buildEffortImpactNote(), null);
});
