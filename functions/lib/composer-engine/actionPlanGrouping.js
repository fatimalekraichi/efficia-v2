// Point 6 du plan (2026-07-31, Sprint 2B "Résumé + feuille de route") :
// regroupement du plan d'action par horizon (Cette semaine / Ce mois-ci /
// À surveiller). Fonction purement déterministe à partir de {difficulty,
// estimatedTime}, déjà calculés par functions/lib/reasoning-engine/
// actionability.js — aucun nouveau score, aucune nouvelle donnée.
//
// Le classement existant (composeScore, dans composer-engine/selection.js
// → selectActionPlan()) n'est jamais modifié ici : seul l'étiquetage/
// regroupement d'affichage change. L'ordre relatif des actions à l'intérieur
// de chaque groupe est strictement préservé (même ordre que model.actionPlan).
//
// Réutilisée à l'identique par actionPlanSection() (point 6) et
// roadmapSection() (point 10, renderAnalysisHtml.js) : les deux pages restent
// donc toujours synchronisées, sans duplication de logique de regroupement.

export const ACTION_HORIZONS = {
  THIS_WEEK: "Cette semaine",
  THIS_MONTH: "Ce mois-ci",
  WATCH: "À surveiller",
};

// Ces échéances ("variable", "en continu", "long terme") ne sont jamais des
// actions "de la semaine", quelle que soit la difficulté associée.
const OPEN_ENDED_TIMES = new Set(["variable", "en continu", "long terme"]);

export function bucketForAction({ difficulty, estimatedTime } = {}) {
  const time = String(estimatedTime || "").trim().toLowerCase();
  if (OPEN_ENDED_TIMES.has(time)) return ACTION_HORIZONS.WATCH;
  if (difficulty === "hard") return ACTION_HORIZONS.WATCH;
  if (difficulty === "easy") return ACTION_HORIZONS.THIS_WEEK;
  if (difficulty === "medium") return ACTION_HORIZONS.THIS_MONTH;
  return ACTION_HORIZONS.WATCH;
}

// Regroupe `actionPlan` (déjà trié par selectActionPlan()) en 3 sections
// ordonnées, sans jamais réordonner ni dupliquer une action : la somme des
// tailles des groupes retournés est toujours égale à la longueur de la liste
// d'entrée. Les groupes vides ne sont pas retournés.
export function groupActionPlan(actionPlan = []) {
  const order = [ACTION_HORIZONS.THIS_WEEK, ACTION_HORIZONS.THIS_MONTH, ACTION_HORIZONS.WATCH];
  const buckets = new Map(order.map((label) => [label, []]));

  for (const item of Array.isArray(actionPlan) ? actionPlan : []) {
    const label = bucketForAction(item);
    (buckets.get(label) || buckets.get(ACTION_HORIZONS.WATCH)).push(item);
  }

  return order
    .map((label) => ({ label, items: buckets.get(label) }))
    .filter((group) => group.items.length > 0);
}
