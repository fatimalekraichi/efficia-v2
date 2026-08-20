import { COMPOSER_CONFIG } from "./composerConfig.js";
import { COMPOSER_VERSION } from "./composerVersion.js";
import { REPORT_DEPTH_PROFILES, resolveReportDepth } from "../reportDepth.js";
import { buildComparisonCard } from "./comparisonCard.js";
import { buildExpectedResult } from "./expectedResultTemplates.js";
import { buildFirstAction } from "./firstActionTemplates.js";
import { buildHeroHeadline } from "./heroTemplates.js";
import { calculateImprovementPotential } from "./improvementPotential.js";
import { buildKeyFindings, selectComposerItems } from "./selection.js";
import { buildExecutiveSummary } from "./summaryTemplates.js";
import { buildWhyNow } from "./whyNowTemplates.js";

const CRITERIA_STATUS_LABELS = {
  compliant: "conforme",
  partial: "à améliorer",
  deficient: "prioritaire",
  not_verified: "à confirmer",
};

// Passthrough des 6 domaines historiques (scoreEngine.calculateScoreDetail) —
// aucune nouvelle méthode de notation, uniquement une mise en forme des champs
// déjà calculés. Exportée (point 3 du plan, 2026-07-31) : réutilisée telle
// quelle pour le modèle premium (model.domains), en plus de freeDiagnostic.
export function buildDomains(categories) {
  if (!Array.isArray(categories)) return [];
  return categories.map((category) => ({
    key: category.key,
    label: category.label,
    points: Number.isFinite(category.brut) ? Math.round(category.brut * 100) / 100 : null,
    max: category.maxEvalue ?? null,
    pct: Number.isFinite(category.pct) ? category.pct : null,
  }));
}

// Résumé des 29 critères par statut déjà attribué en validation manuelle
// (compliant/partial/deficient/not_verified) — simple comptage + regroupement
// par domaine, aucune nouvelle grille de statut.
function buildCriteriaSummary(criteria) {
  if (!Array.isArray(criteria) || !criteria.length) return null;

  const counts = { compliant: 0, partial: 0, deficient: 0, not_verified: 0 };
  const domainsByKey = new Map();

  for (const item of criteria) {
    if (item?.status === "not_applicable") continue;
    const status = counts[item.status] !== undefined ? item.status : "not_verified";
    counts[status] += 1;

    if (!domainsByKey.has(item.category)) {
      domainsByKey.set(item.category, { key: item.category, label: item.categoryLabel, criteria: [] });
    }
    domainsByKey.get(item.category).criteria.push({
      key: item.key,
      question: item.question,
      status,
      statusLabel: CRITERIA_STATUS_LABELS[status] || status,
    });
  }

  return {
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    counts,
    byDomain: [...domainsByKey.values()],
  };
}

function buildFreePriorityCard(item) {
  const logic = item.logic || {};
  return {
    rank: item.rank,
    id: item.id,
    signal: item.signal,
    title: item.title,
    observed: logic.cause || null,
    prospectView: [logic.businessImpact, logic.competitiveAngle].filter(Boolean).join(" ") || null,
    firstAction: buildFirstAction(item.signal),
    expectedResult: buildExpectedResult(item.signal),
    estimatedTime: item.actionability?.estimatedTime || null,
    impact: item.severity || null,
  };
}

// Modèle dédié au Diagnostic Efficia gratuit (Étape A). Construit à partir des
// mêmes données Knowledge/Reasoning que le reste du documentModel, mais avec le
// plafond gratuit (exactement 3 priorités) quel que soit le palier réellement
// résolu pour ce document — ce sous-objet ne change jamais de profondeur.
function buildFreeDiagnostic(bundle, scoreContext = {}) {
  const freeSelections = selectComposerItems(bundle, REPORT_DEPTH_PROFILES.free.caps);

  return {
    band: scoreContext.band || null,
    indices: scoreContext.indices || null,
    domains: buildDomains(scoreContext.categories),
    criteriaSummary: buildCriteriaSummary(scoreContext.criteria),
    projectedScore: scoreContext.projectedPackScore?.projete ?? null,
    priorities: freeSelections.priorities.map(buildFreePriorityCard),
  };
}

function n(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstDefined(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== "");
}

function formatDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function scoreBand(score) {
  const numericScore = n(score);
  if (numericScore === null) return null;
  return COMPOSER_CONFIG.scoreBands.find((band) => numericScore >= band.min)?.label || null;
}

function publicCard(item) {
  return {
    id: item.id,
    signal: item.signal,
    impactType: item.impactType,
    title: item.title,
    message: item.presentation?.short || null,
    reasoning: item.presentation?.long || null,
    evidence: item.evidence || null,
    competitiveAngle: item.logic?.competitiveAngle || null,
    actionability: item.actionability || null,
    confidence: item.confidence,
    priority: item.priority,
    severity: item.severity,
  };
}

function priorityCard(item) {
  return {
    rank: item.rank,
    id: item.id,
    signal: item.signal,
    title: item.title,
    reasoning: item.presentation?.long || null,
    evidence: item.evidence || null,
    severity: item.severity,
    priority: item.priority,
    actionability: item.actionability || null,
  };
}

// Point 3 du plan (2026-07-31) : phrase courte à partir du rang déjà calculé
// par computeCompetitiveRank() (auditComposition.js) — aucun recalcul ici.
function rankSentence(rank) {
  if (!rank || !Number.isFinite(rank.aheadCount) || rank.aheadCount <= 0) return null;
  const { aheadCount, totalCompetitors } = rank;
  const competitorWord = aheadCount > 1 ? "concurrents" : "concurrent";
  const panelNote = Number.isFinite(totalCompetitors) && totalCompetitors > 0
    ? ` (sur ${totalCompetitors} observé${totalCompetitors > 1 ? "s" : ""})`
    : "";
  return `Vous êtes actuellement derrière ${aheadCount} ${competitorWord} sur cette recherche${panelNote}.`;
}

function footerMethodology(bundle = {}) {
  const panelSize = n(bundle.benchmark?.panel_size ?? bundle.benchmark?.competitor_count);
  const panelText = panelSize === null
    ? "comparaison concurrentielle non disponible"
    : `comparaison à ${panelSize} concurrent${panelSize > 1 ? "s" : ""} ${panelSize > 1 ? "locaux" : "local"}`;
  return `Analyse issue des observations publiques · ${panelText}.`;
}

export function buildNarrativeModel(bundle = {}, selections = {}, depth = resolveReportDepth(bundle.reportType)) {
  const generatedAt = firstDefined(bundle.generatedAt, bundle.meta?.generatedAt, bundle.reasoning?.generatedAt);
  const business = bundle.observation || bundle.context?.business || {};
  const benchmark = bundle.benchmark || bundle.context?.benchmark || {};
  const score = n(benchmark.benchmark_score);
  const improvementPotential = calculateImprovementPotential({
    benchmark,
    weaknesses: selections.weaknesses,
    opportunities: selections.opportunities,
    priorities: selections.priorities,
  });
  const topStrength = selections.strengths[0] || null;
  const topPriority = selections.priorities[0] || selections.weaknesses[0] || selections.opportunities[0] || null;
  const confidence = bundle.knowledge?.confidence || benchmark.confidence || null;

  return {
    composerVersion: COMPOSER_VERSION,
    generatedAt,
    locale: COMPOSER_CONFIG.locale,
    reportType: depth.reportType,
    vocabulary: depth.vocabulary,
    freeDiagnostic: buildFreeDiagnostic(bundle, bundle.scoreContext),
    // Point 3 du plan : score par domaine, déjà calculé par le Score Efficia
    // (scoreEngine.js) et déjà mis en forme par buildDomains() ci-dessus —
    // simplement exposé au modèle premium en plus de freeDiagnostic.domains.
    domains: buildDomains(bundle.scoreContext?.categories),
    hero: {
      businessName: firstDefined(bundle.meta?.businessName, business.name),
      category: firstDefined(bundle.meta?.category, business.category),
      city: firstDefined(bundle.meta?.city, business.city),
      date: formatDate(generatedAt),
      score,
      scoreBand: scoreBand(score),
      improvementPotential,
      headline: buildHeroHeadline({ score, topStrength, topPriority }),
      // Point 11 : comparaison visuelle VOUS / Meilleure fiche observée.
      comparison: buildComparisonCard(bundle),
      // Point 3 : rang exact parmi les concurrents connus.
      rank: { ...benchmark.rank, text: rankSentence(benchmark.rank) },
    },
    executiveSummary: buildExecutiveSummary({
      strengths: selections.strengths,
      priorities: selections.priorities,
      confidence,
    }),
    insights: [],
    keyFindings: buildKeyFindings({
      strengths: selections.strengths,
      priorities: selections.priorities,
    }),
    strengths: selections.strengths.map(publicCard),
    weaknesses: selections.weaknesses.map(publicCard),
    opportunities: selections.opportunities.map(publicCard),
    priorities: selections.priorities.map(priorityCard),
    actionPlan: selections.actionPlan,
    whyNow: buildWhyNow({
      priorities: selections.priorities,
      actionPlan: selections.actionPlan,
    }),
    footer: {
      disclaimer: `Analyse fondée sur l'état public de la fiche Google Business au ${formatDate(generatedAt) || "moment de l'analyse"}. Efficia Digital n'est pas affilié à Google. Le Potentiel d'amélioration est une estimation interne, pas une garantie de résultat.`,
      methodology: footerMethodology(bundle),
      versions: {
        reasoning: bundle.reasoning?.reasoningVersion || null,
        composer: COMPOSER_VERSION,
      },
    },
  };
}
