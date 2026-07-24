import { COMPOSER_CONFIG } from "./composerConfig.js";

function n(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(clamp(value));
}

function negativeGapScore(gaps = {}) {
  const normalizers = COMPOSER_CONFIG.improvementPotential.gapNormalizers;
  const values = Object.entries(normalizers).map(([key, normalizer]) => {
    const gap = n(gaps[key]);
    if (gap === null || gap >= 0) return null;
    return clamp((Math.abs(gap) / normalizer) * 100);
  }).filter((value) => value !== null);

  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weakCountScore(items = []) {
  const cap = COMPOSER_CONFIG.improvementPotential.weakSignalCap;
  const uniqueSignals = new Set(items.map((item) => item.signal).filter(Boolean));
  return clamp((uniqueSignals.size / cap) * 100);
}

function gainScore(items = []) {
  const cap = COMPOSER_CONFIG.improvementPotential.gainPriorityCap;
  const total = items.reduce((sum, item) => sum + (n(item.priority) || 0), 0);
  return clamp((total / cap) * 100);
}

function easeScore(items = []) {
  const actionable = items.filter((item) => item.actionability);
  if (!actionable.length) return 0;

  const scores = actionable.map((item) => {
    const factor = COMPOSER_CONFIG.actionEaseFactor[item.actionability.difficulty] || 1;
    return clamp((factor / COMPOSER_CONFIG.actionEaseFactor.easy) * 100);
  });

  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function bandFor(score) {
  return COMPOSER_CONFIG.improvementPotential.bands.find((band) => score >= band.min)
    || COMPOSER_CONFIG.improvementPotential.bands.at(-1);
}

function driversFrom(items = []) {
  const labels = COMPOSER_CONFIG.improvementPotential.signalLabels;
  const bySignal = new Map();

  for (const item of items) {
    if (!item.signal) continue;
    const previous = bySignal.get(item.signal);
    if (!previous || (n(item.priority) || 0) > (n(previous.priority) || 0)) {
      bySignal.set(item.signal, item);
    }
  }

  return [...bySignal.values()]
    .sort((a, b) => (n(b.priority) || 0) - (n(a.priority) || 0))
    .slice(0, COMPOSER_CONFIG.caps.improvementDrivers)
    .map((item) => ({ label: labels[item.signal] || item.title || item.signal }));
}

export function calculateImprovementPotential({ benchmark = {}, weaknesses = [], opportunities = [], priorities = [] } = {}) {
  const issueItems = [...weaknesses, ...opportunities];
  const topItems = priorities.length ? priorities : issueItems;
  const weights = COMPOSER_CONFIG.improvementPotential.weights;

  const factors = {
    gap: negativeGapScore(benchmark.gaps),
    weakCount: weakCountScore(issueItems),
    gain: gainScore(topItems),
    ease: easeScore(topItems),
  };

  const score = round(
    factors.gap * weights.gap
    + factors.weakCount * weights.weakCount
    + factors.gain * weights.gain
    + factors.ease * weights.ease,
  );
  const band = bandFor(score);
  const driverSource = issueItems.length ? issueItems : topItems;

  return {
    title: "Potentiel d'amélioration",
    score,
    stars: band.stars,
    label: band.label,
    driversTitle: "Vos principaux leviers",
    drivers: driversFrom(driverSource),
    note: COMPOSER_CONFIG.improvementPotential.note,
    factors: {
      gapFactor: round(factors.gap),
      weakCountFactor: round(factors.weakCount),
      gainFactor: round(factors.gain),
      easeFactor: round(factors.ease),
    },
  };
}
