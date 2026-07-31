import { COMPOSER_CONFIG } from "./composerConfig.js";
import { buildKeyFindingLine } from "./keyFindingTemplates.js";

// cap === null/undefined signifie "pas de plafond" (palier premium) : on ne
// tronque alors jamais une liste, elle reste bornée uniquement par les constats
// réellement produits par Knowledge/Reasoning.
function applyCap(list, cap) {
  return cap === null || cap === undefined ? list : list.slice(0, cap);
}

function byPriorityDesc(a, b) {
  const priorityDiff = (Number(b.priority) || 0) - (Number(a.priority) || 0);
  if (priorityDiff !== 0) return priorityDiff;
  return String(a.id || "").localeCompare(String(b.id || ""));
}

function byWeightDesc(a, b) {
  const weightDiff = (Number(b.weight) || 0) - (Number(a.weight) || 0);
  if (weightDiff !== 0) return weightDiff;
  return byPriorityDesc(a, b);
}

function knowledgeById(knowledge = {}) {
  const entries = [
    ...(knowledge.strengths || []),
    ...(knowledge.weaknesses || []),
    ...(knowledge.opportunities || []),
    ...(knowledge.top_priorities || []),
  ];
  return new Map(entries.map((item) => [item.id, item]));
}

function mergeReasoning(reasoning, knowledgeItem = {}) {
  return {
    ...reasoning,
    weight: knowledgeItem.weight,
    magnitude: knowledgeItem.magnitude,
  };
}

function reasoningsByType(bundle = {}, type) {
  const byId = knowledgeById(bundle.knowledge);
  return (bundle.reasoning?.reasonings || [])
    .filter((item) => item.type === type)
    .map((item) => mergeReasoning(item, byId.get(item.id)));
}

function selectUniqueBySignal(items, blockedSignals = new Set()) {
  const selected = [];
  const usedSignals = new Set(blockedSignals);

  for (const item of items) {
    if (!item?.signal || usedSignals.has(item.signal)) continue;
    selected.push(item);
    usedSignals.add(item.signal);
  }

  return { selected, usedSignals };
}

function selectIssueCards(bundle, strengthSignals, caps) {
  const issueCandidates = [
    ...reasoningsByType(bundle, "weakness"),
    ...reasoningsByType(bundle, "opportunity"),
  ].sort(byPriorityDesc);

  const { selected } = selectUniqueBySignal(issueCandidates, strengthSignals);
  const weaknesses = applyCap(selected.filter((item) => item.type === "weakness"), caps.weaknesses);
  const opportunities = applyCap(selected.filter((item) => item.type === "opportunity"), caps.opportunities);

  return { weaknesses, opportunities };
}

function reasoningsById(bundle = {}) {
  return new Map((bundle.reasoning?.reasonings || []).map((item) => [item.id, item]));
}

function selectPriorities(bundle, caps) {
  const byId = reasoningsById(bundle);
  const ranked = (bundle.knowledge?.top_priorities || [])
    .map((item) => byId.get(item.id))
    .filter(Boolean)
    .filter((item) => item.type === "weakness" || item.type === "opportunity")
    .sort(byPriorityDesc);
  return applyCap(ranked, caps.priorities).map((item, index) => ({ ...item, rank: index + 1 }));
}

function easeFactor(actionability = {}) {
  return COMPOSER_CONFIG.actionEaseFactor[actionability.difficulty] || 1;
}

function selectActionPlan(bundle, caps) {
  const ranked = (bundle.reasoning?.reasonings || [])
    .filter((item) => item.type !== "strength")
    .filter((item) => item.actionability)
    .map((item) => ({
      ...item,
      composeScore: (Number(item.priority) || 0) * easeFactor(item.actionability),
    }))
    .sort((a, b) => {
      const composeDiff = b.composeScore - a.composeScore;
      if (composeDiff !== 0) return composeDiff;
      return byPriorityDesc(a, b);
    });
  return applyCap(ranked, caps.actionPlan)
    .map((item, index) => ({
      order: index + 1,
      id: item.id,
      action: item.title,
      difficulty: item.actionability.difficulty,
      estimatedTime: item.actionability.estimatedTime,
      requiresGoogleAccess: item.actionability.requiresGoogleAccess,
      canEfficiaAutomate: item.actionability.canEfficiaAutomate,
      impactType: item.impactType,
      priority: item.priority,
      severity: item.severity,
      signal: item.signal,
    }));
}

export function selectComposerItems(bundle = {}, caps = COMPOSER_CONFIG.caps) {
  const strengths = applyCap(reasoningsByType(bundle, "strength").sort(byWeightDesc), caps.strengths);

  const strengthSignals = new Set(strengths.map((item) => item.signal).filter(Boolean));
  const issues = selectIssueCards(bundle, strengthSignals, caps);
  const priorities = selectPriorities(bundle, caps);
  const actionPlan = selectActionPlan(bundle, caps);

  return {
    strengths,
    weaknesses: issues.weaknesses,
    opportunities: issues.opportunities,
    priorities,
    actionPlan,
  };
}

export function buildKeyFindings({ strengths = [], priorities = [] } = {}) {
  const topStrength = strengths[0] ? [{
    kind: "strength",
    id: strengths[0].id,
    line: buildKeyFindingLine(strengths[0]),
  }] : [];

  const topPriorities = priorities.slice(0, 2).map((item) => ({
    kind: "priority",
    id: item.id,
    line: buildKeyFindingLine(item),
  }));

  return [...topStrength, ...topPriorities].slice(0, COMPOSER_CONFIG.caps.keyFindings);
}
