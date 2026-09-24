// Normalisation commune au géocodage et à la validation des ancrages.
export function normalizeLocalityComponent(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Alias exacts, limités au pays et à la commune : aucune région, commune
// voisine, distance approximative ou correspondance par préfixe.
const LOCALITY_ALIASES = {
  BE: [["Bruxelles", "Brussels", "Brussel", "Bruxelles-Ville", "Ville de Bruxelles", "City of Brussels"]],
  LU: [["Luxembourg", "Luxembourg City"]],
};
const aliasesByCountry = new Map(Object.entries(LOCALITY_ALIASES).map(([country, groups]) => [
  country,
  new Map(groups.flatMap((names) => names.map((name) => [
    normalizeLocalityComponent(name), normalizeLocalityComponent(names[0]),
  ]))),
]));

export function canonicalLocalityName(value, countryCode) {
  const name = normalizeLocalityComponent(value);
  return aliasesByCountry.get(String(countryCode || "").trim().toUpperCase())?.get(name) || name;
}
