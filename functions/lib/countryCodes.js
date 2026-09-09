// Codes pays autorisés par l'ancrage géographique. Cette table est partagée
// par la normalisation de la zone confirmée et la validation de la réponse
// fournisseur : elle évite de comparer littéralement « Belgium » et
// « Belgique » tout en conservant un contrôle ISO strict.
export const COUNTRY_NAME_TO_CODE = Object.freeze({
  france: "FR",
  belgique: "BE",
  belgium: "BE",
  luxembourg: "LU",
  suisse: "CH",
  switzerland: "CH",
  "pays-bas": "NL",
  netherlands: "NL",
  allemagne: "DE",
  germany: "DE",
});

export const COUNTRY_CODE_TO_NAME = Object.freeze({
  BE: "Belgique",
  FR: "France",
  LU: "Luxembourg",
  CH: "Suisse",
  NL: "Pays-Bas",
  DE: "Allemagne",
});

export function normalizeCountryKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function canonicalCountryCode({ countryCode, countryName } = {}) {
  const explicitCode = String(countryCode || "").trim().toUpperCase();
  if (explicitCode) return COUNTRY_CODE_TO_NAME[explicitCode] ? explicitCode : null;
  return COUNTRY_NAME_TO_CODE[normalizeCountryKey(countryName)] || null;
}
