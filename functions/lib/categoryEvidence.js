function normalizeLabel(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const CATEGORY_FAMILIES = Object.freeze([
  {
    id: "electrician",
    activities: ["electricien", "electricite"],
    precise: ["electricien"],
    approximate: ["entreprise d electricite", "service d installation electrique", "installation electrique"],
    incompatible: ["fournisseur d electricite", "compagnie d electricite", "service public d electricite"],
  },
  {
    id: "plumber",
    activities: ["plombier", "plomberie"],
    precise: ["plombier"],
    approximate: ["service de plomberie", "entreprise de plomberie", "chauffagiste"],
  },
  {
    id: "bakery",
    activities: ["boulanger", "boulangerie"],
    precise: ["boulangerie"],
    approximate: ["patisserie", "magasin de gateaux"],
  },
  {
    id: "restaurant",
    activities: ["restaurant", "restaurateur"],
    precise: ["restaurant"],
    approximate: ["brasserie", "bistro", "restaurant familial"],
  },
  {
    id: "garage",
    activities: ["garage", "garagiste", "mecanicien automobile"],
    precise: ["garage automobile", "atelier de mecanique automobile"],
    approximate: ["service de reparation automobile", "mecanicien"],
  },
  {
    id: "hairdresser",
    activities: ["coiffeur", "coiffeuse", "salon de coiffure"],
    precise: ["salon de coiffure", "coiffeur"],
    approximate: ["institut de beaute"],
  },
  {
    id: "doctor",
    activities: ["medecin", "medecin generaliste", "cabinet medical"],
    precise: ["medecin generaliste", "medecin"],
    approximate: ["cabinet medical", "centre medical"],
  },
  {
    id: "dentist",
    activities: ["dentiste", "cabinet dentaire"],
    precise: ["dentiste"],
    approximate: ["cabinet dentaire", "centre dentaire"],
  },
  {
    id: "lawyer",
    activities: ["avocat", "cabinet d avocat"],
    precise: ["avocat"],
    approximate: ["cabinet d avocat", "services juridiques"],
  },
  {
    id: "construction",
    activities: ["entreprise de construction", "construction", "entrepreneur"],
    precise: ["entreprise de construction"],
    approximate: ["entrepreneur", "entrepreneur general"],
  },
  {
    id: "beauty",
    activities: ["estheticienne", "estheticien", "institut de beaute"],
    precise: ["institut de beaute", "estheticien"],
    approximate: ["salon de beaute"],
  },
]);

function normalizedSet(values) {
  return new Set(values.map(normalizeLabel));
}

const RULES = CATEGORY_FAMILIES.map((rule) => ({
  ...rule,
  activities: normalizedSet(rule.activities),
  precise: normalizedSet(rule.precise),
  approximate: normalizedSet(rule.approximate),
  incompatible: normalizedSet(rule.incompatible || []),
}));

function activityFamily(activity) {
  const normalized = normalizeLabel(activity);
  return RULES.find((rule) => rule.activities.has(normalized)) || null;
}

function categoryFamily(category) {
  const normalized = normalizeLabel(category);
  return RULES.find((rule) => rule.precise.has(normalized) || rule.approximate.has(normalized)) || null;
}

export function classifyPrimaryCategory(activity, observedCategory) {
  const normalizedActivity = normalizeLabel(activity);
  const normalizedCategory = normalizeLabel(observedCategory);
  if (!normalizedActivity || !normalizedCategory) {
    return { status: "unknown", points: null };
  }

  const family = activityFamily(normalizedActivity);
  if (family?.incompatible.has(normalizedCategory)) {
    return { status: "incompatible", points: 0 };
  }
  if (family?.precise.has(normalizedCategory)) {
    return { status: "precise", points: 4 };
  }
  if (family?.approximate.has(normalizedCategory)) {
    return { status: "approximate", points: 2 };
  }
  if (normalizedActivity === normalizedCategory) {
    return { status: "precise", points: 4 };
  }

  const observedFamily = categoryFamily(normalizedCategory);
  if (family && observedFamily && observedFamily.id !== family.id) {
    return { status: "incompatible", points: 0 };
  }
  return { status: "unknown", points: null };
}

export function classifySecondaryCategories({
  activity,
  primaryCategory,
  secondaryCategories,
  availability,
} = {}) {
  if (availability !== "available") return { status: "unknown", points: null, relevant: [] };
  const primary = normalizeLabel(primaryCategory);
  const categories = [...new Set((Array.isArray(secondaryCategories) ? secondaryCategories : [])
    .map((item) => String(item || "").trim())
    .filter((item) => item && normalizeLabel(item) !== primary))];
  if (!categories.length) return { status: "none", points: 0, relevant: [] };

  const classified = categories.map((category) => ({
    category,
    ...classifyPrimaryCategory(activity, category),
  }));
  const relevant = classified
    .filter((item) => item.status === "precise" || item.status === "approximate")
    .map((item) => item.category);
  if (relevant.length) return { status: "relevant", points: 2, relevant };
  if (classified.every((item) => item.status === "incompatible")) {
    return { status: "irrelevant", points: 0, relevant: [] };
  }
  return { status: "unknown", points: null, relevant: [] };
}

export const __test__ = { normalizeLabel, CATEGORY_FAMILIES };
