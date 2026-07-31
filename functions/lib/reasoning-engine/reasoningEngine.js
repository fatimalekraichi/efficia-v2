import { actionability } from "./actionability.js";
import { businessImpacts } from "./businessImpacts.js";
import { causes } from "./causes.js";
import { buildEvidence, hasBenchmarkMedian, hasSignalValue } from "./evidence.js";
import { googleImpacts } from "./googleImpacts.js";
import { priorityLabel } from "./priorities.js";
import {
  CONFIDENCE_BASE,
  DEFAULT_GENERATED_AT,
  libraries_version,
  reasoning_rules_version,
  reasoningVersion,
} from "./reasoningConfig.js";
import { reasoningTemplates } from "./reasoningTemplates.js";

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickVariant(variants, { analysisId, libraryName, signal, type }) {
  if (!Array.isArray(variants) || variants.length === 0) return null;
  const index = hashString(`${analysisId}:${libraryName}:${signal}:${type}`) % variants.length;
  return variants[index];
}

function replacePlaceholders(template, context = {}) {
  const business = context.business || {};
  const benchmark = context.benchmark || {};
  const replacements = {
    name: business.name,
    reviews: business.reviews,
    photos: business.photos_count ?? business.photos,
    competitor_median_photos: benchmark.competitor_median?.photos,
    top_competitor_name: benchmark.top_competitor?.name,
    position: business.position,
    description_length: business.description_length,
  };

  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    const value = replacements[key];
    return value === null || value === undefined || value === "" ? "" : String(value);
  }).replace(/\s+/g, " ").trim();
}

function variantsFor(library, signal, type) {
  return library?.[signal]?.[type] || null;
}

function hasRequiredLibraries(signal, type) {
  const impact = businessImpacts[signal];
  return Boolean(
    variantsFor(causes, signal, type)?.length
    && variantsFor(googleImpacts, signal, type)?.length
    && impact?.direct?.[type]?.length
    && impact?.comparative?.[type]?.length
  );
}

function findingType(groupType) {
  if (groupType === "strengths") return "strength";
  if (groupType === "weaknesses") return "weakness";
  return "opportunity";
}

function collectKnowledgeFindings(knowledge = {}) {
  return ["strengths", "weaknesses", "opportunities"].flatMap((group) => {
    const items = Array.isArray(knowledge[group]) ? knowledge[group] : [];
    return items.map((item) => ({
      ...item,
      type: item.type || findingType(group),
    }));
  });
}

// Titre = première vraie fin de phrase (. ; ou :), en ignorant :
//  - les points décimaux (ex. "4.1", "114.3") : un point suivi d'un chiffre
//    n'est jamais une fin de phrase ici ;
//  - toute ponctuation rencontrée à l'intérieur d'une parenthèse non encore
//    refermée (ex. "(médiane : 24)") : ces messages Knowledge utilisent le
//    ":" comme séparateur libellé/valeur DANS la parenthèse, pas comme fin
//    de phrase — l'ancienne regex /[.;:]/ coupait au milieu ("...concurrents
//    (médiane" au lieu de "...concurrents (médiane : 24)").
function extractTitle(message) {
  const text = String(message || "");
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth > 0) continue;
    if (char === ";" || char === ":") return text.slice(0, index).trim();
    if (char === "." && !/\d/.test(text[index + 1] || "")) return text.slice(0, index).trim();
  }
  return text.trim();
}

function benchmarkConfidence(context = {}) {
  const confidence = context?.benchmark?.confidence;
  return CONFIDENCE_BASE[confidence] || CONFIDENCE_BASE.indicative;
}

function signalCompleteness(signal, context = {}) {
  const hasValue = hasSignalValue(signal, context);
  const hasBenchmark = Boolean(context?.benchmark);
  const hasMedian = hasBenchmarkMedian(signal, context);

  if (hasValue && hasMedian) return 1;
  if (hasValue && hasBenchmark) return 0.85;
  if (hasValue) return 0.75;
  if (hasMedian) return 0.65;
  return 0.5;
}

function computeConfidence(signal, context = {}) {
  const value = benchmarkConfidence(context) * signalCompleteness(signal, context);
  return Math.round(value * 100) / 100;
}

function buildLogic({ finding, analysisId, context }) {
  const signal = finding.signal;
  const type = finding.type;
  const impact = businessImpacts[signal];

  const cause = pickVariant(variantsFor(causes, signal, type), { analysisId, libraryName: "causes", signal, type });
  const googleImpact = pickVariant(variantsFor(googleImpacts, signal, type), {
    analysisId,
    libraryName: "googleImpacts",
    signal,
    type,
  });
  const businessImpact = pickVariant(impact.direct[type], {
    analysisId,
    libraryName: "businessImpactsDirect",
    signal,
    type,
  });
  const competitiveAngle = pickVariant(impact.comparative[type], {
    analysisId,
    libraryName: `businessImpactsComparative`,
    signal,
    type,
  });

  return {
    cause: replacePlaceholders(cause, context),
    googleImpact: replacePlaceholders(googleImpact, context),
    businessImpact: replacePlaceholders(businessImpact, context),
    competitiveAngle: replacePlaceholders(competitiveAngle, context),
  };
}

function buildActionability(finding) {
  if (finding.type === "strength") return null;
  const item = actionability[finding.signal];
  return item ? { ...item } : null;
}

function buildReasoning({ finding, analysisId, context }) {
  if (!finding?.signal || !finding?.type || !hasRequiredLibraries(finding.signal, finding.type)) return null;

  const logic = buildLogic({ finding, analysisId, context });
  if (!logic.cause || !logic.googleImpact || !logic.businessImpact || !logic.competitiveAngle) return null;

  return {
    id: finding.id,
    signal: finding.signal,
    type: finding.type,
    impactType: finding.businessImpact || null,
    title: finding.message ? extractTitle(finding.message) : finding.id,
    logic,
    evidence: buildEvidence(finding.signal, context),
    actionability: buildActionability(finding),
    presentation: {
      short: reasoningTemplates.short(logic),
      long: reasoningTemplates.long(logic),
    },
    confidence: computeConfidence(finding.signal, context),
    priority: finding.priority,
    priorityLabel: priorityLabel(Number(finding.priority) || 0),
    severity: finding.severity,
  };
}

export function runReasoningEngine(input = {}) {
  const analysisId = input.analysisId || "analysis";
  const context = input.context || {};
  const findings = collectKnowledgeFindings(input.knowledge);

  return {
    reasoningVersion,
    generatedAt: input.generatedAt || context.generatedAt || DEFAULT_GENERATED_AT,
    reasoningRulesVersion: reasoning_rules_version,
    librariesVersion: libraries_version,
    // Traçabilité uniquement : Reasoning n'utilise pas reportType pour filtrer ou
    // transformer les constats (chaque constat de Knowledge est expliqué, sans
    // exception, quel que soit le palier). Les plafonds se jouent en amont
    // (Knowledge) et en aval (Composer).
    reportType: input.reportType || null,
    reasonings: findings
      .map((finding) => buildReasoning({ finding, analysisId, context }))
      .filter(Boolean),
  };
}
