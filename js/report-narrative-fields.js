// Shared narrative field catalogue and validation; no storage or report engine dependencies.
export const REPORT_NARRATIVE_ANOMALY_CATEGORIES = Object.freeze([
  "texte faux ou contradictoire",
  "texte trop générique",
  "mauvaise adaptation au secteur",
  "problème de ton",
  "répétition",
  "problème de mise en page",
  "autre",
]);

/*
 * Les textes automatiques sont produits côté navigateur à partir des données
 * de la fiche. Une limite par libellé (90, 110, etc.) finissait donc par être
 * plus courte que certaines branches parfaitement valides du générateur.
 *
 * La règle est volontairement unique : chaque champ dispose d'un plancher
 * éditorial de 400 caractères et, dès que le texte automatique est plus long,
 * sa limite devient sa longueur + max(25 %, 50 caractères). L'API applique la
 * même fonction que l'éditeur ; aucun des deux ne tronque une valeur.
 */
export const REPORT_NARRATIVE_LIMIT_POLICY = Object.freeze({
  minimumMaxLength: 400,
  headroomRatio: 0.25,
  minimumHeadroom: 50,
  maximumAutomaticSnapshotLength: 4_000,
});

export const REPORT_NARRATIVE_TITLE_LIMIT_POLICY = Object.freeze({
  minimumMaxLength: 120,
  headroomRatio: 0.25,
  minimumHeadroom: 25,
});

const representativeCriteria = [
  "revendiquee", "categoriePrincipale", "categoriesSecondaires", "horaires", "contact", "adresse", "attributs", "nap",
  "logoCouverture", "nombrePhotos", "photoRecente", "varietePhotos", "qualitePhotos", "noteMoyenne", "volumeAvis",
  "recenceAvis", "tauxReponseAvis", "qualiteReponsesAvis", "descriptionRemplie", "descriptionQualite", "servicesPresents",
  "servicesDecrits", "questionsReponses", "liensAction", "publicationRecente", "rythmePublication", "classementLocal",
  "attractiviteConcurrents", "nomConforme",
];
const representativeLabels = Object.freeze({
  revendiquee: "Fiche revendiquée et vérifiée", categoriePrincipale: "Catégorie principale", categoriesSecondaires: "Catégories secondaires",
  horaires: "Horaires", contact: "Téléphone et site web", adresse: "Adresse / zone de service", attributs: "Attributs", nap: "Cohérence fiche / site",
  logoCouverture: "Logo et couverture", nombrePhotos: "Volume de photos", photoRecente: "Photos récentes", varietePhotos: "Variété des photos", qualitePhotos: "Qualité des photos",
  noteMoyenne: "Note moyenne", volumeAvis: "Volume d’avis", recenceAvis: "Avis récents", tauxReponseAvis: "Réponses aux avis", qualiteReponsesAvis: "Qualité des réponses",
  descriptionRemplie: "Description visible", descriptionQualite: "Description ciblée", servicesPresents: "Services présents", servicesDecrits: "Services détaillés",
  questionsReponses: "Questions / réponses", liensAction: "Liens d’action", publicationRecente: "Publication récente", rythmePublication: "Rythme de publication",
  classementLocal: "Classement local", attractiviteConcurrents: "Confiance visible face aux concurrents", nomConforme: "Conformité du nom",
});

const fields = [
  ["page1.title", "Titre de page", "Page 1 · Verdict", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
  ["page1.verdict_title", "Titre du verdict", "Page 1 · Verdict", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
  ["page1.verdict_eyebrow", "Surtitre du verdict", "Page 1 · Verdict", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
  ["summary.general", "Introduction / constat", "Page 1 · Verdict"],
  ["page1.score_disclaimer", "Précision sur le score", "Page 1 · Verdict"],
  ["page1.strengths_heading", "Titre « Ce qui fonctionne déjà »", "Page 1 · Signaux", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
  ["page1.weaknesses_heading", "Titre « Ce qui freine les contacts »", "Page 1 · Signaux", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
  ...[1, 2].flatMap((rank) => [
    [`page1.strength.${rank}`, `Texte « Ce qui fonctionne déjà » ${rank}`, "Page 1 · Signaux"],
    [`page1.weakness.${rank}`, `Texte « Ce qui freine les contacts » ${rank}`, "Page 1 · Signaux"],
  ]),
  ["page2.title", "Titre", "Page 2 · Comparaison locale", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
  ["page2.comparison_intro", "Explication de la comparaison locale", "Page 2 · Comparaison locale"],
  ["page2.efficia_label", "Titre « Lecture Efficia »", "Page 2 · Lecture Efficia", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
  ["weaknesses.summary", "Texte « Lecture Efficia »", "Page 2 · Lecture Efficia"],
  ["page2.efficia_explanation", "Précision « Lecture Efficia »", "Page 2 · Lecture Efficia"],
  ["page2.micro_note", "Note méthodologique", "Page 2 · Comparaison locale"],
  ["page3.title", "Titre", "Page 3 · Vérifications", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
  ["page3.introduction", "Introduction", "Page 3 · Vérifications"],
  ["page3.representative_heading", "Titre « Constats représentatifs »", "Page 3 · Constats représentatifs", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
  ...representativeCriteria.flatMap((key) => [
    [`page3.representative.${key}.title`, `Constat représentatif · ${representativeLabels[key]} · titre`, "Page 3 · Constats représentatifs", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
    [`page3.representative.${key}.description`, `Constat représentatif · ${representativeLabels[key]} · description`, "Page 3 · Constats représentatifs"],
  ]),
  ["page3.audit_boundary_title", "Titre « Réservé à l’Audit Efficia »", "Page 3 · Audit Efficia", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
  ["page3.audit_boundary_text", "Texte « Réservé à l’Audit Efficia »", "Page 3 · Audit Efficia"],
  ...[1, 2, 3].flatMap((rank) => [
    [`priority.${rank}.title`, `Priorité ${rank} · Titre`, rank === 1 ? "Page 4 · Priorité n°1" : "Page 5 · Priorités suivantes", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
    [`priority.${rank}.impact_label`, `Priorité ${rank} · Niveau d’impact`, rank === 1 ? "Page 4 · Priorité n°1" : "Page 5 · Priorités suivantes", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
    [`priority.${rank}.observation`, `Priorité ${rank} · Constat`, rank === 1 ? "Page 4 · Priorité n°1" : "Page 5 · Priorités suivantes"],
    [`priority.${rank}.impact`, `Priorité ${rank} · Impact prospect`, rank === 1 ? "Page 4 · Priorité n°1" : "Page 5 · Priorités suivantes"],
    [`priority.${rank}.first_action`, `Priorité ${rank} · Première action`, "Page 4 · Priorité n°1"],
    [`priority.${rank}.expected_result`, `Priorité ${rank} · Résultat attendu`, "Page 4 · Priorité n°1"],
    [`priority.${rank}.estimated_time`, `Priorité ${rank} · Estimation de temps`, "Page 4 · Priorité n°1"],
    [`priority.${rank}.action_example`, `Priorité ${rank} · Exemple ou aide d’action`, "Page 4 · Priorité n°1"],
  ]),
  ["page5.title", "Titre", "Page 5 · Priorités suivantes", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
  ["page5.subtitle", "Sous-titre", "Page 5 · Priorités suivantes"],
  ["page5.audit_teaser_title", "Titre du teasing Audit", "Page 5 · Audit Efficia", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
  ["page5.audit_teaser_text", "Texte du teasing Audit", "Page 5 · Audit Efficia"],
  ["page6.title", "Titre", "Page 6 · Solutions", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
  ["conclusion.commercial", "Texte d’introduction", "Page 6 · Solutions"],
  ["page6.audit_tag", "Surtitre de l’offre Audit", "Page 6 · Offre Audit", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
  ["page6.audit_description", "Description de l’offre Audit", "Page 6 · Offre Audit"],
  ...[1, 2, 3, 4, 5].map((rank) => [`page6.audit_benefit.${rank}`, `Offre Audit · bénéfice ${rank}`, "Page 6 · Offre Audit"]),
  ["page6.audit_cta", "Appel à l’action Audit", "Page 6 · Offre Audit", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
  ["page6.pack_tag", "Surtitre de l’offre Pack", "Page 6 · Offre Pack", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
  ["page6.pack_description", "Description de l’offre Pack", "Page 6 · Offre Pack"],
  ...[1, 2, 3, 4].map((rank) => [`page6.pack_benefit.${rank}`, `Offre Pack · bénéfice ${rank}`, "Page 6 · Offre Pack"]),
  ["page6.pack_cta", "Appel à l’action Pack", "Page 6 · Offre Pack", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
  ["page6.after_audit_title", "Titre après commande · Audit", "Page 6 · Après votre commande", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
  ["page6.after_audit", "Texte après commande · Audit", "Page 6 · Après votre commande"],
  ["page6.after_pack_title", "Titre après commande · Pack", "Page 6 · Après votre commande", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
  ["page6.after_pack", "Texte après commande · Pack", "Page 6 · Après votre commande"],
  ["page6.prospect_footer", "Texte de bas de page prospect", "Page 6 · Bas de page"],
  ["page6.legal", "Précision légale", "Page 6 · Bas de page"],
];

export const REPORT_NARRATIVE_FIELDS = Object.freeze(Object.fromEntries(fields.map(([id, label, section, policy = REPORT_NARRATIVE_LIMIT_POLICY]) => [id, Object.freeze({
  id,
  label,
  section,
  maxLength: policy.minimumMaxLength,
  ...policy,
})])));

export const REPORT_NARRATIVE_FIELD_IDS = Object.freeze(Object.keys(REPORT_NARRATIVE_FIELDS));

const FIELD_ID_SET = new Set(REPORT_NARRATIVE_FIELD_IDS);
const CATEGORY_SET = new Set(REPORT_NARRATIVE_ANOMALY_CATEGORIES);

export function reportNarrativeCatalog() {
  return REPORT_NARRATIVE_FIELD_IDS.map((id) => ({ ...REPORT_NARRATIVE_FIELDS[id] }));
}

export function isAllowedReportNarrativeField(fieldId) {
  return typeof fieldId === "string" && FIELD_ID_SET.has(fieldId);
}

export function countReportNarrativeCharacters(value) {
  return Array.from(String(value || "")).length;
}

export function reportNarrativeTextMaxLength(fieldId, automaticText = "") {
  if (!isAllowedReportNarrativeField(fieldId)) return null;
  const field = REPORT_NARRATIVE_FIELDS[fieldId];
  const automaticLength = countReportNarrativeCharacters(String(automaticText).trim());
  const headroom = Math.max(
    Math.ceil(automaticLength * field.headroomRatio),
    field.minimumHeadroom,
  );
  return Math.max(field.minimumMaxLength, automaticLength + headroom);
}

export function validateReportNarrativeText(fieldId, value, automaticText = "") {
  if (!isAllowedReportNarrativeField(fieldId)) return { ok: false, error: "UNAUTHORIZED_FIELD_ID" };
  if (typeof value !== "string") return { ok: false, error: "INVALID_TEXT_TYPE" };
  const text = value.trim();
  if (!text) return { ok: false, error: "EMPTY_CUSTOM_TEXT" };
  const length = countReportNarrativeCharacters(text);
  const maxLength = reportNarrativeTextMaxLength(fieldId, automaticText);
  if (length > maxLength) return { ok: false, error: "TEXT_TOO_LONG", maxLength, length };
  return { ok: true, text, length, maxLength };
}

export function validateReportNarrativeCategory(value, weeklyReview) {
  if (!weeklyReview && (value === null || value === undefined || value === "")) return { ok: true, category: null };
  if (typeof value !== "string" || !CATEGORY_SET.has(value)) return { ok: false, error: "INVALID_ANOMALY_CATEGORY" };
  return { ok: true, category: value };
}
