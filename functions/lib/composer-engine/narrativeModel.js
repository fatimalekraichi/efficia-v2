import { COMPOSER_CONFIG } from "./composerConfig.js";
import { COMPOSER_VERSION } from "./composerVersion.js";
import { buildHeroHeadline } from "./heroTemplates.js";
import { calculateImprovementPotential } from "./improvementPotential.js";
import { buildKeyFindings } from "./selection.js";
import { buildExecutiveSummary } from "./summaryTemplates.js";
import { buildWhyNow } from "./whyNowTemplates.js";

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

function footerMethodology(bundle = {}) {
  const panelSize = n(bundle.benchmark?.panel_size ?? bundle.benchmark?.competitor_count);
  const panelText = panelSize === null
    ? "comparaison concurrentielle non disponible"
    : `comparaison à ${panelSize} concurrent${panelSize > 1 ? "s" : ""} ${panelSize > 1 ? "locaux" : "local"}`;
  return `Analyse issue des observations publiques · ${panelText}.`;
}

export function buildNarrativeModel(bundle = {}, selections = {}) {
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
    hero: {
      businessName: firstDefined(bundle.meta?.businessName, business.name),
      category: firstDefined(bundle.meta?.category, business.category),
      city: firstDefined(bundle.meta?.city, business.city),
      date: formatDate(generatedAt),
      score,
      scoreBand: scoreBand(score),
      improvementPotential,
      headline: buildHeroHeadline({ score, topStrength, topPriority }),
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
