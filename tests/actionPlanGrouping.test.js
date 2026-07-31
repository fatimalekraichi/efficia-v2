import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_HORIZONS, bucketForAction, groupActionPlan } from "../functions/lib/composer-engine/actionPlanGrouping.js";

// Point 6 du plan (2026-07-31, Sprint 2B) : regroupement purement
// déterministe à partir de {difficulty, estimatedTime} déjà calculés par
// actionability.js — aucun nouveau score, aucun recalcul, aucun changement
// d'ordre.

test("bucketForAction : easy → Cette semaine, medium → Ce mois-ci, hard → À surveiller", () => {
  assert.equal(bucketForAction({ difficulty: "easy", estimatedTime: "15–20 min" }), ACTION_HORIZONS.THIS_WEEK);
  assert.equal(bucketForAction({ difficulty: "medium", estimatedTime: "30–60 min" }), ACTION_HORIZONS.THIS_MONTH);
  assert.equal(bucketForAction({ difficulty: "hard", estimatedTime: "en continu" }), ACTION_HORIZONS.WATCH);
});

test("bucketForAction : un délai indéterminé (variable/en continu/long terme) va toujours à 'À surveiller'", () => {
  assert.equal(bucketForAction({ difficulty: "medium", estimatedTime: "variable" }), ACTION_HORIZONS.WATCH);
  assert.equal(bucketForAction({ difficulty: "easy", estimatedTime: "en continu" }), ACTION_HORIZONS.WATCH);
  assert.equal(bucketForAction({ difficulty: "hard", estimatedTime: "long terme" }), ACTION_HORIZONS.WATCH);
});

test("bucketForAction est déterministe (même entrée, même sortie)", () => {
  const input = { difficulty: "medium", estimatedTime: "30–60 min" };
  assert.equal(bucketForAction(input), bucketForAction({ ...input }));
});

test("groupActionPlan ne perd, ne duplique et ne réordonne aucune action", () => {
  const actionPlan = [
    { order: 1, id: "A", difficulty: "easy", estimatedTime: "15–20 min" },
    { order: 2, id: "B", difficulty: "medium", estimatedTime: "30–60 min" },
    { order: 3, id: "C", difficulty: "hard", estimatedTime: "en continu" },
    { order: 4, id: "D", difficulty: "easy", estimatedTime: "10 min" },
    { order: 5, id: "E", difficulty: "medium", estimatedTime: "variable" },
  ];

  const groups = groupActionPlan(actionPlan);
  const flattened = groups.flatMap((group) => group.items);

  // Aucune action perdue ni dupliquée : mêmes ids, mêmes tailles.
  assert.equal(flattened.length, actionPlan.length);
  assert.deepEqual(new Set(flattened.map((item) => item.id)), new Set(actionPlan.map((item) => item.id)));

  // Ordre relatif préservé à l'intérieur de chaque groupe (A avant D dans
  // "Cette semaine", puisque A précède D dans actionPlan).
  const thisWeek = groups.find((group) => group.label === ACTION_HORIZONS.THIS_WEEK);
  assert.deepEqual(thisWeek.items.map((item) => item.id), ["A", "D"]);

  const watch = groups.find((group) => group.label === ACTION_HORIZONS.WATCH);
  assert.deepEqual(watch.items.map((item) => item.id), ["C", "E"]);
});

test("groupActionPlan respecte l'ordre des horizons (Cette semaine, Ce mois-ci, À surveiller) et omet les groupes vides", () => {
  const actionPlan = [
    { order: 1, id: "A", difficulty: "hard", estimatedTime: "en continu" },
    { order: 2, id: "B", difficulty: "easy", estimatedTime: "10 min" },
  ];

  const groups = groupActionPlan(actionPlan);

  assert.deepEqual(groups.map((group) => group.label), [ACTION_HORIZONS.THIS_WEEK, ACTION_HORIZONS.WATCH]);
});

test("groupActionPlan sur une liste vide renvoie une liste de groupes vide", () => {
  assert.deepEqual(groupActionPlan([]), []);
  assert.deepEqual(groupActionPlan(), []);
});
