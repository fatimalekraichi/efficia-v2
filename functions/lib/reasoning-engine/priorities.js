export function computePriority({ base_weight, magnitude, confidenceFactor }) {
  const priority = Number(base_weight) * Number(magnitude) * Number(confidenceFactor);
  return Number.isFinite(priority) ? Math.round(priority * 100) / 100 : 0;
}

export function severityFromPriority(priority) {
  if (priority >= 12) return "critical";
  if (priority >= 8) return "high";
  if (priority >= 5) return "medium";
  return "low";
}

export function priorityLabel(priority) {
  if (priority >= 8) return "Haute";
  if (priority >= 5) return "Moyenne";
  return "Basse";
}
