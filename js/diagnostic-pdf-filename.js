// Shared with the classic free diagnostic. Keep its default filename unchanged.
(function(root) {
function sanitizeFilenamePart(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function formatDateForFilename(dateValue) {
  if(typeof dateValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)){
    return dateValue;
  }
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Date d'analyse invalide.");
  }
  return date.toISOString().slice(0, 10);
}

function buildEfficiaPdfFilename({ businessName, city, analysisDate, analysisVersion, prefix = "Score-Efficia" }) {
  const version = Number(analysisVersion);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("Version d'analyse invalide.");
  }
  const entreprise = sanitizeFilenamePart(businessName) || "Entreprise";
  const ville = sanitizeFilenamePart(city) || "Ville";
  const date = formatDateForFilename(analysisDate);
  return `${prefix}_${entreprise}_${ville}_${date}_V${version}.pdf`;
}

root.EfficiaPdfFilename = Object.freeze({sanitizeFilenamePart, formatDateForFilename, buildEfficiaPdfFilename});
})(globalThis);
