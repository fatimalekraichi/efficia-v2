import {
  BUSINESS_IMPACT_BY_SIGNAL,
  CONFIDENCE_FACTORS,
  CONFIDENCE_RANKS,
  KNOWLEDGE_ENGINE_VERSION,
  KNOWLEDGE_MESSAGES_VERSION,
  KNOWLEDGE_RULES_VERSION,
  KNOWLEDGE_THRESHOLDS,
} from "./knowledgeConfig.js";
import { renderKnowledgeMessage } from "./knowledgeMessages.js";
import { KNOWLEDGE_RULES, getInputConfidence, messageGroupForRule } from "./knowledgeRules.js";

function n(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function meetsConfidence(inputConfidence, minConfidence) {
  return (CONFIDENCE_RANKS[inputConfidence] || 0) >= (CONFIDENCE_RANKS[minConfidence] || 0);
}

function signalHasAdvantage(input, signal) {
  const benchmark = input?.benchmark;
  if (!benchmark) return false;
  const gaps = benchmark.gaps || {};
  const percentiles = benchmark.percentiles || {};
  if (signal === "reviews") return n(gaps.reviews) >= 0 || n(percentiles.reviews) >= KNOWLEDGE_THRESHOLDS.reviews.forcePercentile;
  if (signal === "rating") return n(gaps.rating) >= 0 || n(percentiles.rating) >= 70;
  if (signal === "photos") return n(gaps.photos) >= 0 || n(percentiles.photos) >= KNOWLEDGE_THRESHOLDS.photos.forcePercentile;
  if (signal === "position") {
    const position = n(input?.business?.position);
    return position !== null && position >= 1 && position <= KNOWLEDGE_THRESHOLDS.position.strongMax;
  }
  return false;
}

function severityFromPriority(priority, type) {
  if (type === "strength") return "positive";
  if (priority >= 12) return "critical";
  if (priority >= 8) return "high";
  if (priority >= 5) return "medium";
  return "low";
}

function shortMessage(message) {
  return String(message || "").split(/[.;:]/)[0].trim();
}

function makeFinding(input, rule, order, inputConfidence) {
  const magnitude = round(rule.magnitude(input), 2);
  const confidenceFactor = CONFIDENCE_FACTORS[inputConfidence] || CONFIDENCE_FACTORS.indicative;
  const priority = round(rule.base_weight * magnitude * confidenceFactor, 2);
  const messageGroup = messageGroupForRule(rule, input);
  return {
    id: rule.id,
    type: rule.type,
    signal: rule.signal,
    businessImpact: BUSINESS_IMPACT_BY_SIGNAL[rule.signal] || "completeness",
    weight: rule.base_weight,
    magnitude,
    priority,
    severity: severityFromPriority(priority, rule.type),
    message: renderKnowledgeMessage(input, messageGroup),
    order,
    scoreForConflict: rule.base_weight * magnitude,
  };
}

function resolveConflicts(input, findings) {
  const grouped = new Map();
  for (const finding of findings) {
    if (!grouped.has(finding.signal)) grouped.set(finding.signal, []);
    grouped.get(finding.signal).push(finding);
  }

  const resolved = [];
  for (const [signal, group] of grouped.entries()) {
    let candidates = group;
    if (signalHasAdvantage(input, signal)) {
      const strengths = group.filter((finding) => finding.type === "strength");
      if (strengths.length) candidates = strengths;
    }

    const selected = [...candidates].sort((a, b) => {
      if (b.scoreForConflict !== a.scoreForConflict) return b.scoreForConflict - a.scoreForConflict;
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.order - b.order;
    })[0];
    resolved.push(selected);
  }

  return resolved.sort((a, b) => a.order - b.order);
}

function serializeFinding(finding, includeType = false) {
  const output = {
    id: finding.id,
    signal: finding.signal,
    businessImpact: finding.businessImpact,
    weight: finding.weight,
    magnitude: finding.magnitude,
    priority: finding.priority,
    severity: finding.severity,
    message: finding.message,
  };
  if (includeType) output.type = finding.type;
  return output;
}

function removeInternalFields(finding) {
  const { order, scoreForConflict, type, ...publicFinding } = finding;
  return publicFinding;
}

function bandPhrase(score) {
  if (score === null) return "une première base d'analyse";
  if (score >= 90) return "une performance globale excellente";
  if (score >= 75) return "une base solide";
  if (score >= 50) return "une base perfectible";
  return "un potentiel encore sous-exploité";
}

function buildSummary(input, strengths, topPriorities) {
  const name = input?.business?.name || "Votre fiche";
  const score = n(input?.benchmark?.benchmark_score);
  const scorePart = score === null ? "" : ` (${score}/100)`;
  const topStrength = strengths[0]?.message
    ? shortMessage(strengths[0].message)
    : "elle présente des éléments utiles pour progresser";
  const topPriority = topPriorities[0]?.message
    ? shortMessage(topPriorities[0].message)
    : "défendre cette avance et maintenir la qualité des signaux visibles";

  return `${name} obtient ${bandPhrase(score)}${scorePart}. ${topStrength}. Le principal levier : ${topPriority}.`;
}

function ensureNoInvalidText(output) {
  const text = JSON.stringify(output);
  if (/\b(null|undefined|NaN)\b/.test(text)) {
    return JSON.parse(text.replace(/\bundefined\b|\bNaN\b/g, ""));
  }
  return output;
}

export function runKnowledgeEngine(input = {}) {
  const inputConfidence = getInputConfidence(input);
  const matched = KNOWLEDGE_RULES
    .map((rule, order) => ({ rule, order }))
    .filter(({ rule }) => meetsConfidence(inputConfidence, rule.min_confidence))
    .filter(({ rule }) => {
      try {
        return Boolean(rule.when(input));
      } catch {
        return false;
      }
    })
    .map(({ rule, order }) => makeFinding(input, rule, order, inputConfidence));

  const resolved = resolveConflicts(input, matched);

  let strengths = resolved
    .filter((finding) => finding.type === "strength")
    .sort((a, b) => {
      if (b.scoreForConflict !== a.scoreForConflict) return b.scoreForConflict - a.scoreForConflict;
      return a.order - b.order;
    })
    .slice(0, 4);

  if (!strengths.length && n(input?.benchmark?.benchmark_score) >= KNOWLEDGE_THRESHOLDS.score.positiveFloor) {
    strengths = [{
      id: "FORCE_SCORE",
      type: "strength",
      signal: "global",
      businessImpact: BUSINESS_IMPACT_BY_SIGNAL.global,
      weight: 7,
      magnitude: 0.5,
      priority: round(7 * 0.5 * (CONFIDENCE_FACTORS[inputConfidence] || 0.6), 2),
      severity: "positive",
      message: renderKnowledgeMessage(input, "FORCE_SCORE_NEUTRAL"),
      order: Number.MAX_SAFE_INTEGER,
      scoreForConflict: 3.5,
    }];
  }

  const weaknesses = resolved.filter((finding) => finding.type === "weakness");
  const opportunities = resolved.filter((finding) => finding.type === "opportunity");

  const topPriorities = [...weaknesses, ...opportunities]
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.order - b.order;
    })
    .slice(0, 3);

  const output = {
    version: KNOWLEDGE_ENGINE_VERSION,
    rules_version: KNOWLEDGE_RULES_VERSION,
    messages_version: KNOWLEDGE_MESSAGES_VERSION,
    confidence: inputConfidence,
    strengths: strengths.map(removeInternalFields),
    weaknesses: weaknesses.map(removeInternalFields),
    opportunities: opportunities.map(removeInternalFields),
    top_priorities: topPriorities.map((finding) => {
      const serialized = serializeFinding(finding);
      delete serialized.weight;
      delete serialized.magnitude;
      return serialized;
    }),
    summary: buildSummary(input, strengths, topPriorities),
  };

  return ensureNoInvalidText(output);
}
