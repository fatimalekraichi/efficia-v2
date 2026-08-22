// Point 6 du plan (2026-07-31, Sprint 2B) : regroupement déterministe du plan
// d'action par horizon, réutilisé à l'identique par actionPlanSection() et
// roadmapSection() (point 10) ci-dessous — une seule fonction de regroupement,
// jamais dupliquée, pour garder les deux pages synchronisées.
import { groupActionPlan } from "./composer-engine/actionPlanGrouping.js";
// Sprint 5 (finition éditoriale) — module unique de présentation (objectif
// 11) : formats français, typographie, vocabulaire sectoriel, preuve
// enrichie, et les trois helpers de rédaction de Sprint 3 (angle, Constat,
// effort/impact), migrés depuis composer-engine/priorityFraming.js (supprimé
// — aucune duplication conservée). Aucune donnée n'est recalculée : ce
// module ne fait que présenter ce que Reasoning/Composer ont déjà produit.
import {
  angleForSignal,
  buildConstat,
  buildEffortImpactNote,
  buildEvidenceNarrative,
  cleanTypography,
  collapseKnownRedundancies,
  detectSector,
  adaptVocabulary,
  adaptImpactLabel,
  evidenceBarData,
  benchmarkPositionLabel,
  domainQualitativeNote,
  buildRankRationale,
  scoreInterpretationNote,
  buildClosingStatement,
  formatRatingDisplay,
  formatCount,
  formatOrdinal,
  formatFrenchNumber,
  formatFrenchNumbersInText,
  formatApproximateSignalValue,
  formatDescriptionReasoning,
  normalizeCategoryLabel,
} from "./presentationFormatter.js";

const EFFICIA_BLUE = "#2563eb";

// Objectif 1 (mission "finition avant bêta") — texte fixe, volontairement
// court et sans détail technique, affiché une seule fois sous le Score
// Efficia™ (page de couverture uniquement) : donne une explication crédible
// de ce que mesure le score et de sa méthode, sans jamais dévoiler la
// pondération réelle (scoreConfig.js, non modifié). N'affecte ni ne dépend
// de la valeur du score — reste identique quel que soit le résultat, à la
// différence de scoreInterpretationNote() juste en dessous.
const SCORE_AUTHORITY_NOTE = "Le Score Efficia™ mesure la capacité actuelle de votre fiche Google Business à transformer une recherche locale en prise de contact. La méthode Efficia™ évalue actuellement 29 critères répartis en six domaines, puis replace les résultats dans leur contexte local.";
const PROVISIONAL_SCORE_NOTE = "Ce score est provisoire : certaines informations ne sont pas vérifiables depuis la fiche publique et restent à confirmer.";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function present(value) {
  return value !== null && value !== undefined && value !== "";
}

function safeText(value, fallback = "Non disponible") {
  return escapeHtml(present(value) ? value : fallback);
}

function safePdfText(value, fallback = "Non disponible") {
  return safeText(value, fallback);
}

function pdfCell(value, fallback = "Non disponible") {
  return safePdfText(value, fallback);
}

function safeNumber(value, fallback = "Non disponible") {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return escapeHtml(fallback);
  return escapeHtml(Number.isInteger(parsed) ? parsed : parsed.toFixed(1));
}

// Mission "dernières corrections de qualité avant la bêta", objectif 4 —
// pour un artisan (électricien, plombier, chauffagiste...), "vos clients"
// désigne souvent des personnes qui n'ont PAS ENCORE choisi l'entreprise
// (elles comparent, hésitent, n'ont pas encore pris contact) : "vos futurs
// clients"/"vos prospects" lit mieux dans ce cas précis. Presentation
// Formatter ne peut être modifié que pour des bugs de typographie (règle
// absolue de cette mission) : cette liste vit donc ici, au niveau du
// renderer, phrase par phrase — jamais un remplacement aveugle de "clients"
// (qui casserait les cas où le mot désigne une clientèle déjà acquise). Les
// quatre phrases ci-dessous sont les angles (SIGNAL_ANGLES,
// presentationFormatter.js) réellement affichés pour un artisan : chacune
// décrit explicitement un moment AVANT la décision (premier choix, avant de
// contacter, comprendre l'activité) — jamais une clientèle existante.
const ARTISAN_PROSPECT_PHRASE_FIXES = [
  [
    "Pourquoi votre note influence le premier choix de vos clients",
    "Pourquoi votre note influence le premier choix de vos futurs clients",
  ],
  [
    "Le nombre d'avis reste l'un des signaux de confiance les plus regardés par vos clients",
    "Le nombre d'avis reste l'un des signaux de confiance les plus regardés par vos prospects",
  ],
  [
    "Vos photos aident vos clients à se projeter avant même de vous contacter",
    "Vos photos aident vos prospects à se projeter avant même de vous contacter",
  ],
  [
    "Une description claire permet à vos clients de comprendre votre activité en quelques secondes",
    "Une description claire permet à vos futurs clients de comprendre votre activité en quelques secondes",
  ],
  [
    "Être visible au bon moment fait souvent la différence pour vos clients",
    "Être visible au bon moment fait souvent la différence pour vos prospects",
  ],
  // Objectif 5 (cohérence de la narration) — mêmes constats en relisant les
  // rapports générés : ces trois phrases de Reasoning (businessImpacts.js,
  // non modifié) décrivent aussi explicitement un moment AVANT la décision
  // ("comparent plusieurs fiches", "hésitants" = pas encore choisi). À
  // l'inverse, "retours clients" (avis déjà laissés par une clientèle
  // acquise) n'est PAS repris ici : il désigne des clients existants, pas de
  // futurs clients — exactement le cas que la mission demande de ne jamais
  // remplacer aveuglément.
  [
    "Vos photos renforcent votre capacité à être choisi lorsque les clients comparent plusieurs fiches côte à côte.",
    "Vos photos renforcent votre capacité à être choisi lorsque les prospects comparent plusieurs fiches côte à côte.",
  ],
  [
    "En actualisant vos photos, vous améliorez votre présence quand les clients comparent plusieurs fiches côte à côte.",
    "En actualisant vos photos, vous améliorez votre présence quand les prospects comparent plusieurs fiches côte à côte.",
  ],
  [
    "Une fiche concurrente avec davantage d'avis peut sembler plus éprouvée et capter les clients hésitants.",
    "Une fiche concurrente avec davantage d'avis peut sembler plus éprouvée et capter les prospects hésitants.",
  ],
];

function applyArtisanProspectFixes(text, sector) {
  if (sector !== "artisan") return text;
  let result = text;
  for (const [source, target] of ARTISAN_PROSPECT_PHRASE_FIXES) {
    result = result.split(source).join(target);
  }
  return result;
}

// Objectif 7 (relecture éditoriale, mission "corrections de qualité avant la
// bêta") — correctif tous secteurs, pas sectoriel : le Résumé exécutif
// (Composer, summaryTemplates.js — buildExecutiveSummary/actionSentence et la
// constante LEVERS_CLOSING, non modifiables ici) fait suivre "ce rapport" (le
// document) de "le meilleur rapport entre effort et impact potentiel" (le
// ratio) dans la même phrase — deux sens différents du mot "rapport" à
// quelques mots d'écart, ce qu'un consultant senior ne laisserait pas passer.
// Cette clause est partagée à l'identique par les deux formulations du
// Résumé exécutif (avec et sans liste de leviers), d'où un remplacement de
// sous-chaîne plutôt qu'un remplacement de phrase entière : la phrase à
// liste de leviers contient un segment interpolé (les libellés des leviers)
// qui varie d'un rapport à l'autre. Le correctif retire aussi le second
// "aujourd'hui" de la phrase (le premier reste, dans "Aujourd'hui, les
// principaux leviers...", juste au-dessus) et l'adjectif "potentiel",
// superflu juste après "impact" — un mot en trop plutôt qu'une
// reformulation du fond, conforme à l'objectif 7 (mots inutiles).
const EDITORIAL_PHRASE_FIXES = [
  [
    "aujourd'hui le meilleur rapport entre effort et impact potentiel",
    "le meilleur équilibre entre effort et impact",
  ],
];

function applyEditorialPhraseFixes(text) {
  let result = text;
  for (const [source, target] of EDITORIAL_PHRASE_FIXES) {
    result = result.split(source).join(target);
  }
  return result;
}

// Sprint 5 (finition éditoriale) — objectifs 1 et 3, PREMIUM UNIQUEMENT :
// passe de nettoyage typographique + adaptation de vocabulaire sectoriel sur
// un texte déjà rédigé par Reasoning/Composer, avant échappement HTML par
// safeText(). N'est utilisé que par renderPremiumAuditHtml() et les
// fonctions qu'elle appelle ci-dessous — jamais par renderFreeDiagnosticHtml,
// qui continue d'utiliser safeText()/safeNumber() sans cette étape (aucun
// changement de comportement du Diagnostic gratuit).
function presentableText(value, sector) {
  if (!present(value)) return value;
  const withVocabulary = adaptVocabulary(String(value), sector);
  const withProspectWording = applyArtisanProspectFixes(withVocabulary, sector);
  const withEditorialFixes = applyEditorialPhraseFixes(withProspectWording);
  return cleanTypography(formatFrenchNumbersInText(collapseKnownRedundancies(withEditorialFixes)));
}

const LABEL_TRANSLATIONS = {
  high: "Élevé",
  medium: "Moyen",
  low: "Faible",
  easy: "Facile",
  moderate: "Modéré",
  hard: "Difficile",
  critical: "Critique",
  trust: "Confiance",
  conversion: "Conversion",
  visibility: "Visibilité",
  completeness: "Complétude",
};

function safeLabel(value, fallback = "Non disponible") {
  if (!present(value)) return escapeHtml(fallback);
  return safeText(LABEL_TRANSLATIONS[String(value)] || value, fallback);
}

// Premium Polish — objectif 3, PREMIUM UNIQUEMENT : "Conversion" (traduction
// de item.impactType === "conversion") devient "Prise de rendez-vous" pour
// un cabinet médical — la mission interdit explicitement le mot "conversion"
// pour ce secteur. Ne modifie ni LABEL_TRANSLATIONS ni safeLabel (partagés
// avec le Diagnostic gratuit) : la traduction de base est identique, seul
// le résultat est ensuite adapté au secteur.
function impactLabel(value, sector, fallback = "Non disponible") {
  if (!present(value)) return escapeHtml(fallback);
  const translated = LABEL_TRANSLATIONS[String(value)] || value;
  return safeText(adaptImpactLabel(translated, sector), fallback);
}

function stars(count) {
  const value = Number(count);
  const total = Number.isFinite(value) ? Math.max(0, Math.min(5, Math.round(value))) : 0;
  return `${"★".repeat(total)}${"☆".repeat(5 - total)}`;
}

function icon(name) {
  const attrs = `width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
  const icons = {
    check: `<svg ${attrs}><path d="M20 6 9 17l-5-5"/></svg>`,
    trend: `<svg ${attrs}><path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>`,
    target: `<svg ${attrs}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v3M21 12h-3M12 21v-3M3 12h3"/></svg>`,
    shield: `<svg ${attrs}><path d="M20 13c0 5-3.5 7.5-8 8.5C7.5 20.5 4 18 4 13V5l8-3 8 3v8Z"/><path d="m9 12 2 2 4-5"/></svg>`,
    clock: `<svg ${attrs}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
    spark: `<svg ${attrs}><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="M5 19v-2M4 18h2M19 5V3M18 4h2"/></svg>`,
    arrow: `<svg ${attrs}><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>`,
  };
  return icons[name] || icons.check;
}

function logo() {
  return `
    <div class="brand" aria-label="Efficia Digital">
      <img class="brand-logo" src="https://efficiadigital.com/assets/logo/logo-efficia-web.png" alt="Efficia Digital">
    </div>
  `;
}

function header(label = "Diagnostic Efficia™") {
  return `
    <header class="doc-header">
      ${logo()}
      <span>${safeText(label)}</span>
    </header>
  `;
}

// Objectif 2 (mission "finition avant bêta") — Composer (narrativeModel.js,
// non modifié) peut produire "comparaison concurrentielle non disponible"
// ou "comparaison à 0 concurrent local" quand aucun panel n'a pu être
// constitué : deux formulations exactes qui donnent l'impression d'un
// résultat cassé plutôt que d'un choix éditorial assumé. On ne touche
// jamais à la donnée (panel_size, calculé par Composer) : on reformule
// uniquement l'affichage, ici, au niveau du rendu.
const DEGENERATE_METHODOLOGY_PATTERN = /comparaison (concurrentielle non disponible|à 0 concurrents? locaux?)\.?/i;
const METHODOLOGY_FALLBACK_CLAUSE = "analyse fondée sur les données publiques actuellement disponibles";

function humanizeMethodologyText(raw) {
  const value = String(raw || "").trim();
  return DEGENERATE_METHODOLOGY_PATTERN.test(value) ? METHODOLOGY_FALLBACK_CLAUSE : value;
}

function methodologyProofItems(model) {
  const methodology = model.footer?.methodology || "";
  return [
    "120+ signaux analysés",
    methodology.includes("comparaison")
      ? humanizeMethodologyText(methodology.replace(/^Analyse issue des observations publiques ·\s*/i, ""))
      : "comparaison concurrentielle selon les données disponibles",
    "méthode Efficia™",
  ];
}

function footer(model, label = "") {
  return `
    <footer class="doc-footer">
      <span>${safeText(label || model.hero?.businessName || model.vocabulary?.reportLabel || "Diagnostic Efficia")}</span>
      <span>Efficia Digital</span>
    </footer>
  `;
}

// Point 1 du plan (2026-07-31, Sprint 1 "Constats irréfutables") : au lieu
// d'une seule ligne "valeur · référence observée", on affiche jusqu'à 3
// lignes (vous / moyenne concurrents / meilleure fiche observée nommée)
// quand la donnée existe — sans rien inventer : chaque ligne est omise si sa
// valeur n'est pas disponible (present() déjà utilisé partout ailleurs dans
// ce fichier pour ce même principe).
function evidenceLine(evidence) {
  if (!evidence) return "Donnée non communiquée publiquement à ce jour";
  const unitSuffix = evidence.unit ? ` ${safeText(evidence.unit, "")}` : "";
  const lines = [];

  const formatEvidenceValue = (value) => {
    if (/avis|photos?|caractères?|catégories?/i.test(String(evidence.unit || ""))) {
      return formatCount(value, "élément", "éléments").split(" ")[0];
    }
    return formatFrenchNumber(value);
  };

  if (present(evidence.value)) lines.push(`Vous : ${safeText(formatEvidenceValue(evidence.value))}${unitSuffix}`);
  if (present(evidence.competitorMedian)) {
    const approximate = formatApproximateSignalValue(
      /avis/i.test(String(evidence.unit || "")) ? "reviews"
        : /photos?/i.test(String(evidence.unit || "")) ? "photos"
          : /position/i.test(String(evidence.unit || "")) ? "position"
            : null,
      evidence.competitorMedian,
    );
    lines.push(`Moyenne concurrents : ${safeText(approximate || `environ ${formatEvidenceValue(evidence.competitorMedian)}`)}${unitSuffix && !approximate ? unitSuffix : ""}`);
  }
  if (evidence.topCompetitor && present(evidence.topCompetitor.value)) {
    lines.push(`Fiche de référence : ${safeText(formatEvidenceValue(evidence.topCompetitor.value))}${unitSuffix} (${safeText(evidence.topCompetitor.name, "")})`);
  }

  return lines.length ? lines.join("<br>") : safeText(evidence.source || "Observation");
}

// Sprint 5 (finition éditoriale) — objectifs 5, 6 et 8 : la "Preuve" devient
// une phrase (ou deux/trois) en prose qui intègre directement la comparaison
// concurrentielle, au lieu d'une simple juxtaposition de nombres. Repli sur
// l'ancien format (evidenceLine ci-dessus) uniquement pour les signaux non
// couverts par la prose (aucune perte d'information, jamais de texte inventé).
//
// `includeYou = false` : n'utilisé que par priorityCard(), qui affiche déjà
// la valeur "vous" dans son bloc Constat (Sprint 3) — éviter de répéter deux
// fois la même valeur sur la même carte (objectifs 1 et 9).
// Premium Polish (retour utilisateur) — objectif 1 : même si les gabarits
// buildEvidenceNarrative()/evidenceLine() ne contiennent aujourd'hui aucun
// mot générique sensible au secteur (aucun "client"/"entreprise"), cette
// fonction est désormais elle aussi systématiquement passée par
// presentableText() (sector en paramètre) — par sécurité et par cohérence
// avec le reste du rapport, plutôt que de supposer que ça restera vrai.
function proofNarrative(evidence, signal, { includeYou = true } = {}, sector = null) {
  const narrative = buildEvidenceNarrative(evidence, signal, { includeYou });
  if (narrative) return safeText(presentableText(narrative, sector));
  if (!includeYou) {
    // Le Constat affiche déjà "vous" : si aucune comparaison concurrentielle
    // n'est disponible, on l'indique sobrement plutôt que de répéter le
    // Constat ou d'inventer un chiffre.
    return present(evidence?.competitorMedian) || evidence?.topCompetitor
      ? evidenceLine(evidence)
      // Premium Polish — objectif 9 : "signal" est un terme interne
      // (taxonomie Reasoning) qui n'a rien à faire dans une phrase destinée
      // au lecteur ; reformulé pour rester naturel sans changer le
      // déclencheur (toujours affiché uniquement en l'absence de donnée
      // comparative, jamais un chiffre inventé).
      : safeText("Nous ne disposons pas encore de données comparatives sur ce point.");
  }
  return evidenceLine(evidence);
}

// Premium Polish (retour utilisateur) — objectif "preuves plus visuelles" :
// mini-jauge Vous/Concurrents à côté de la phrase de preuve. evidenceBarData()
// renvoie déjà les deux largeurs en % (aucun calcul supplémentaire ici) ;
// cette fonction ne fait que poser le balisage. Absente (chaîne vide) quand
// evidenceBarData() renvoie null (signal "position", ou donnée manquante).
function evidenceBar(evidence, signal) {
  const data = evidenceBarData(evidence, signal);
  if (!data) return "";
  // Premium Polish (retour utilisateur) — repère "Top X %" sous la jauge,
  // uniquement quand evidence.percentileRank existe déjà (rating/reviews/
  // photos) : voir benchmarkPositionLabel() pour l'origine de la donnée.
  const positionLabel = benchmarkPositionLabel(evidence?.percentileRank);
  return `
    <div class="evidence-bars">
      <div class="evidence-bar-row">
        <span class="evidence-bar-label">Vous</span>
        <div class="evidence-bar-track"><div class="evidence-bar-fill you" style="width:${data.youPct}%"></div></div>
        <span class="evidence-bar-value">${safeText(data.youLabel)}</span>
      </div>
      <div class="evidence-bar-row">
        <span class="evidence-bar-label">Concurrents</span>
        <div class="evidence-bar-track"><div class="evidence-bar-fill competitor" style="width:${data.competitorPct}%"></div></div>
        <span class="evidence-bar-value">${safeText(data.competitorLabel)}</span>
      </div>
      ${positionLabel ? `<p class="evidence-percentile">${safeText(positionLabel)}</p>` : ""}
    </div>
  `;
}

function scoreGauge(score) {
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  const circumference = 2 * Math.PI * 48;
  const offset = circumference * (1 - value / 100);
  return `
    <div class="score-gauge-wrap" aria-label="Score ${safeNumber(value)} sur 100">
      <svg class="score-gauge" viewBox="0 0 120 120">
        <circle class="score-gauge-bg" cx="60" cy="60" r="48"></circle>
        <circle class="score-gauge-value" cx="60" cy="60" r="48" style="stroke-dasharray:${circumference};stroke-dashoffset:${offset};"></circle>
      </svg>
      <div class="score-gauge-center">
        <strong>${safeNumber(value)}</strong>
        <span>/100</span>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------------------ */
/* Audit Efficia™ premium — renderPremiumAuditHtml                          */
/* Extrait à l'identique de l'ancien renderAnalysisHtml() (Étape B) :       */
/* aucune section, aucun texte, aucune donnée n'a été modifié ici.          */
/* ------------------------------------------------------------------------ */

// Point 11 du plan : bloc "VOUS / Meilleure fiche observée" — première chose
// lue, comme demandé. Chaque colonne n'affiche que les valeurs disponibles
// (aucune valeur inventée). Réutilise stars() (déjà utilisé pour le
// Potentiel d'amélioration) pour l'échelle 0-5.
function comparisonColumn(entity) {
  const ratingKnown = present(entity.rating);
  const photosBelongToPanel = Boolean(entity.photosIsEstimate && entity.name);
  const comparisonMeta = [
    present(entity.reviews) ? formatCount(entity.reviews, "avis", "avis") : "Nombre d'avis non communiqué",
    !photosBelongToPanel && present(entity.photos) ? formatCount(entity.photos, "photo", "photos") : null,
  ].filter(Boolean).join(" · ");
  // Sprint 5 (objectif 2) : format français (virgule décimale, pluriel
  // correct) au lieu du format brut ("4.1" → "4,1", "1 photos" → "1 photo").
  return `
    <div class="comparison-col">
      <p class="comparison-label">${safeText(entity.label === "Meilleure fiche observée" ? "Fiche de référence observée" : entity.label)}</p>
      ${ratingKnown ? `<p class="comparison-stars">${stars(Math.round(entity.rating))}</p>` : ""}
      <p class="comparison-rating">${ratingKnown ? `${safeText(formatRatingDisplay(entity.rating))}/5` : "Non communiquée"}</p>
      <p class="comparison-meta">${safeText(comparisonMeta)}</p>
      ${entity.name ? `<p class="comparison-name">${safeText(entity.name)}</p>` : ""}
    </div>
  `;
}

// Objectif 3 (mission "dernières corrections de qualité avant la bêta") — la
// position de recherche Google ("7e position", signal "position") et la
// comparaison aux concurrents étudiés (hero.rank.aheadCount/totalCompetitors)
// sont deux informations exactes mais jusqu'ici juxtaposées sans lien
// explicite. Cette fonction ne recalcule rien : elle lit uniquement la valeur
// du signal "position" déjà présente dans le modèle (Reasoning/Composer,
// jamais modifiés), là où elle existe déjà (priorités, faiblesses,
// opportunités ou forces).
function findPositionSignalValue(model) {
  const pools = [model?.priorities, model?.weaknesses, model?.opportunities, model?.strengths];
  for (const pool of pools) {
    const items = Array.isArray(pool) ? pool : [];
    const match = items.find((item) => item?.signal === "position" && present(item?.evidence?.value));
    if (match) {
      const value = Number(match.evidence.value);
      return Number.isFinite(value) && value > 0 ? value : null;
    }
  }
  return null;
}

function organicOrdinal(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  const rounded = Math.round(number);
  return rounded === 1 ? "1er" : `${rounded}e`;
}

function positionSummary({ position, testedQuery, positionKind, sponsoredResultsExcluded } = {}) {
  const numericPosition = Number(position);
  if (!Number.isFinite(numericPosition) || numericPosition <= 0) return "";
  const query = present(testedQuery) ? ` sur « ${String(testedQuery)} »` : "";
  if (positionKind === "organic") {
    const advertisingContext = Number(sponsoredResultsExcluded) > 0
      ? " Une annonce sponsorisée apparaît au-dessus des résultats organiques."
      : "";
    return `Position observée : ${organicOrdinal(numericPosition)} résultat organique${query} — hors annonces sponsorisées.${advertisingContext}`;
  }
  return `Position observée : ${formatOrdinal(numericPosition)} position${query}.`;
}

// Ne remplace la phrase existante (hero.rank.text, déjà écrite par Composer)
// que lorsque la position de recherche est aussi disponible : dans ce cas
// précis, une seule phrase mélangeait deux notions différentes. Sans cette
// donnée, aucun changement — la phrase d'origine reste affichée telle quelle.
function buildPedagogicalRankNote(model) {
  const rank = model?.hero?.rank;
  if (!rank || !Number.isFinite(rank.aheadCount) || rank.aheadCount <= 0) return rank?.text || "";

  const totalKnown = Number.isFinite(rank.totalCompetitors) && rank.totalCompetitors > 0;
  const positionFinding = [model?.priorities, model?.weaknesses, model?.opportunities, model?.strengths]
    .flatMap((items) => Array.isArray(items) ? items : [])
    .find((item) => item?.signal === "position" && present(item?.evidence?.value));
  const rawPosition = Number(positionFinding?.evidence?.value);
  if (positionFinding && Number.isFinite(rawPosition) && rawPosition <= 0) {
    const countLabel = rank.aheadCount === 3 ? "trois" : rank.aheadCount === 2 ? "deux" : String(rank.aheadCount);
    return `La fiche n’a pas été détectée dans la zone de résultats observée. Les ${countLabel} concurrents analysés apparaissaient avant elle sur cette recherche.`;
  }
  const positionValue = findPositionSignalValue(model);
  if (!present(positionValue) || !totalKnown) return rank.text || "";

  const totalPlural = rank.totalCompetitors > 1 ? "s" : "";
  const aheadPlural = rank.aheadCount > 1 ? "s" : "";
  const wereWord = rank.aheadCount > 1 ? "étaient" : "était";

  const organic = model?.searchContext?.positionKind === "organic";
  const positionLabel = organic
    ? `${organicOrdinal(positionValue)} résultat organique — hors annonces sponsorisées`
    : `${formatOrdinal(positionValue)} position`;
  return `Lors de notre recherche, votre fiche apparaissait en ${positionLabel}. `
    + `Parmi les ${rank.totalCompetitors} concurrent${totalPlural} analysé${totalPlural} dans ce rapport, `
    + `${rank.aheadCount} ${wereWord} mieux classé${aheadPlural} que vous.`;
}

// Objectif 2 (mission "finition avant bêta") — quand Composer
// (comparisonCard.js, non modifié) ne peut construire aucune carte de
// comparaison faute de fiche concurrente suffisamment documentée, la page
// affichait jusqu'ici un vide silencieux. On ne fabrique toujours aucune
// donnée : on affiche seulement, à la place du vide, une phrase honnête et
// professionnelle plutôt qu'une absence qui peut passer pour un bug.
function comparisonSection(model) {
  const hero = model.hero || {};
  const card = hero.comparison;
  if (!card) {
    const rankNote = positionSummary(model.searchContext);
    return `
      <div class="comparison-card comparison-fallback">
        <p>Certaines données publiques ne sont actuellement pas disponibles pour établir une comparaison directe. Les recommandations ci-dessous restent fondées sur l'analyse complète de votre fiche.</p>
      </div>
      ${rankNote ? `<p class="comparison-rank"><span class="comparison-note-line">${safeText(rankNote)}</span></p>` : ""}
    `;
  }
  const rankNote = buildPedagogicalRankNote(model) || positionSummary(model.searchContext);
  const panelPhotos = card.best?.photosIsEstimate && present(card.best?.photos)
    ? `Repère du panel : ${safeText(formatApproximateSignalValue("photos", card.best.photos))} en moyenne.` : "";
  const comparisonNotes = [panelPhotos, rankNote ? safeText(rankNote) : ""].filter(Boolean);
  return `
    <div class="comparison-card">
      ${comparisonColumn(card.you)}
      <div class="comparison-divider" aria-hidden="true"></div>
      ${comparisonColumn(card.best)}
    </div>
    ${comparisonNotes.length ? `<p class="comparison-rank">${comparisonNotes.map((note) => `<span class="comparison-note-line">${note}</span>`).join("")}</p>` : ""}
  `;
}

// Point 5 du plan (2026-07-31, Sprint 2A) : synthèse en liste du résumé
// exécutif, générée uniquement à partir des leviers déjà calculés par
// buildExecutiveSummary() (summaryTemplates.js) — jamais de libellé en dur ici.
// Le paragraphe existant (`summary.text`) reste le repli si la liste ne peut
// pas être produite (moins de 2 priorités disponibles).
function executiveSummaryBody(summary = {}, sector = null) {
  const leversList = Array.isArray(summary.leversList) ? summary.leversList.filter(Boolean) : [];
  if (leversList.length > 1) {
    return `
      <p class="summary-opening">${safeText(presentableText(summary.opening || summary.text, sector), "")}</p>
      <p class="summary-levers-intro">${safeText(presentableText(summary.leversIntro, sector), "")}</p>
      <ul class="summary-levers">
        ${leversList.map((lever) => `<li>${icon("check")}<span>${safeText(presentableText(lever, sector))}</span></li>`).join("")}
      </ul>
      ${summary.leversClosing ? `<p class="summary-closing">${safeText(presentableText(summary.leversClosing, sector))}</p>` : ""}
    `;
  }
  return `<p>${safeText(presentableText(summary.text, sector), "Synthèse en cours de finalisation.")}</p>`;
}

function heroSection(model, sector) {
  const hero = model.hero || {};
  const potential = hero.improvementPotential || {};
  const proofItems = methodologyProofItems(model);
  return `
    <section class="page cover-page">
      ${header(model.vocabulary?.reportLabel)}
      <div class="cover-grid">
        <div class="cover-copy">
          <p class="eyebrow">${safeText(model.vocabulary?.eyebrow || "Diagnostic Google Business")}</p>
          <h1>${safePdfText(hero.businessName, "Votre entreprise")}</h1>
          <p class="cover-meta">${[normalizeCategoryLabel(hero.category), hero.city, hero.date].filter(Boolean).map((item) => safeText(item, "")).join(" · ")}</p>
          <p class="headline">${safeText(presentableText(hero.headline, sector), "")}</p>
        </div>
        <div class="score-card">
          <span class="score-label">Score Efficia™${model.scoreProvisional ? " provisoire" : ""}</span>
          ${scoreGauge(hero.score)}
          <div class="score-band">${safeText(hero.scoreBand, "Score analysé")}</div>
          <p class="score-authority">${SCORE_AUTHORITY_NOTE}</p>
          ${model.scoreProvisional ? `<p class="score-authority">${PROVISIONAL_SCORE_NOTE}</p>` : ""}
          ${model.locationConfirmation ? `<p class="score-authority">${safeText(model.locationConfirmation)}</p>` : ""}
          <p class="score-interpretation">${safeText(presentableText(scoreInterpretationNote(hero.score), sector))}</p>
        </div>
      </div>
      ${comparisonSection(model)}
      ${model.websiteAvailabilityNote ? `<p class="methode-note">${safeText(model.websiteAvailabilityNote)}</p>` : ""}
      <div class="cover-bottom">
        <article class="hero-card executive-card">
          <div>
            <p class="letter-label">Note d'analyse</p>
            <h2>Résumé exécutif</h2>
            ${executiveSummaryBody(model.executionPlan?.personalizedOverview
              ? { ...(model.executiveSummary || {}), opening: model.executionPlan.personalizedOverview, text: model.executionPlan.personalizedOverview }
              : (model.executiveSummary || {}), sector)}
          </div>
        </article>
        <div class="cover-side">
          <article class="hero-card potential-card">
            <div class="potential-top">
              <span>${safeText(potential.title, "Potentiel d'amélioration")}</span>
              <strong>${safeText(stars(potential.stars), "")}</strong>
            </div>
            <div class="potential-score">
              <strong>${safeNumber(potential.score)}</strong>
              <span>${safeText(potential.label, "")}</span>
            </div>
            ${potential.timeframe ? `<p class="potential-timeframe">${safeText(presentableText(potential.timeframe, sector))}</p>` : ""}
            <p class="potential-title">${safeText(potential.driversTitle, "Vos principaux leviers")}</p>
            <ul class="driver-list">
              ${(potential.drivers || []).map((driver) => `<li>${icon("check")}<span>${safeText(presentableText(driver.label, sector))}</span></li>`).join("")}
            </ul>
            <small>${safeText(presentableText(potential.note, sector), "")}</small>
          </article>
          <article class="method-proof-card">
            <p>Analyse réalisée à partir de</p>
            <ul>
              ${proofItems.map((item) => `<li>${icon("check")}<span>${safeText(item)}</span></li>`).join("")}
            </ul>
          </article>
        </div>
      </div>
      ${footer(model, "Page de couverture")}
    </section>
  `;
}

function priorityCard(item, sector) {
  // Sprint 3 : chaque priorité "raconte une histoire" différente selon son
  // signal (objectif 1), avec ses deux niveaux de lecture bien séparés —
  // Constat (fait, objectif 3) puis Pourquoi c'est important (interprétation,
  // inchangée) — et une phrase courte reliant effort et impact (objectif 4).
  // Aucune de ces valeurs n'est recalculée : angle/constat/note sont dérivés
  // de item.signal, item.evidence et item.actionability, déjà produits par
  // Reasoning/Composer (evidence.js, actionability.js non modifiés).
  const angle = angleForSignal(item.signal);
  const constat = buildConstat(item);
  const effortImpactNote = buildEffortImpactNote(item.actionability || {}, item);
  // Premium Polish (retour utilisateur) — objectif "pourquoi cet ordre" :
  // voir buildRankRationale().
  const rankRationale = buildRankRationale(item);
  // Premium Polish — objectif 7 : la grille 2x2 "Pourquoi / Preuve / Impact /
  // Temps" forçait deux blocs de longueur très différente (le "Pourquoi",
  // texte de Reasoning sur 3-4 phrases, contre la "Preuve", plus courte) côte
  // à côte dans la même rangée — la carte semblait alors bancale (un bloc
  // rempli, l'autre à moitié vide). Nouvelle disposition : "Pourquoi c'est
  // important" et "Preuve" occupent chacun toute la largeur, l'un sous
  // l'autre (chacun peut alors respirer sur sa propre hauteur) ; "Impact" et
  // "Temps estimé", tous deux naturellement courts, restent groupés côte à
  // côte. Même contenu, même quatre informations : uniquement la disposition
  // change.
  //
  // Sprint 5 (objectif 6) : la Preuve n'inclut pas de nouveau la valeur
  // "vous" (includeYou: false), déjà énoncée dans le Constat ci-dessus —
  // jamais la même valeur répétée deux fois sur une même carte.
  return `
    <article class="priority-card">
      <div class="priority-rank">Priorité ${safeNumber(item.rank)}</div>
      <div class="priority-body">
        ${angle ? `<p class="eyebrow priority-angle">${safeText(presentableText(angle, sector))}</p>` : ""}
        <h3>${safeText(presentableText(item.title, sector))}</h3>
        ${rankRationale ? `<p class="priority-rank-rationale">${safeText(presentableText(rankRationale, sector))}</p>` : ""}
        ${constat ? `
        <div class="priority-constat">
          <span>Constat</span>
          <p>${safeText(presentableText(constat, sector))}</p>
        </div>` : ""}
        <div class="priority-block priority-why">
          <span>Pourquoi c'est important</span>
          <p>${safeText(presentableText(
            item.signal === "description"
              ? formatDescriptionReasoning(item.reasoning, item.evidence?.value)
              : item.reasoning,
            sector,
          ))}</p>
        </div>
        <div class="priority-block">
          <span>Preuve</span>
          <p>${proofNarrative(item.evidence, item.signal, { includeYou: false }, sector)}</p>
          ${evidenceBar(item.evidence, item.signal)}
        </div>
        <div class="priority-grid">
          <div>
            <span>Impact</span>
            <p>${safeLabel(item.severity)}</p>
          </div>
          <div>
            <span>Temps estimé</span>
            <p>${safeText(item.actionability?.estimatedTime)}</p>
          </div>
        </div>
        ${effortImpactNote ? `<p class="priority-effort-note">${safeText(effortImpactNote)}</p>` : ""}
      </div>
    </article>
  `;
}

function prioritiesSection(model, sector) {
  const items = model.priorities || [];
  // Sprint 5 (objectif 7) : si aucune priorité n'est disponible, la page
  // entière est omise plutôt que de montrer un titre suivi d'un texte de
  // repli isolé — le rapport ne doit jamais sembler inachevé, mais ne doit
  // pas non plus contenir de page quasi vide (cf. renderPremiumAuditHtml).
  if (!items.length) return "";
  return `
    <section class="page">
      ${header(model.vocabulary?.prioritiesTitle || "Les 3 priorités")}
      <div class="section-intro">
        <p class="eyebrow">Priorités</p>
        <h2>Les actions qui méritent votre attention en premier</h2>
        <p>Nous avons isolé les sujets qui peuvent le plus améliorer la perception de votre fiche et guider davantage de prospects vers une prise de contact.</p>
      </div>
      <div class="priority-list">
        ${items.map((item) => priorityCard(item, sector)).join("")}
      </div>
      ${footer(model, "Priorités")}
    </section>
  `;
}

// Premium Polish (retour utilisateur) — objectif "points forts" : chaque
// point fort commence désormais par une amorce rassurante courte ("Bonne
// nouvelle."), avant le titre déjà établi — change la perception d'entrée de
// carte sans toucher au contenu (titre/message) déjà produit par Composer.
function strengthCard(item, sector) {
  return `
    <article class="insight-card strength-card">
      <div class="card-icon">${icon("shield")}</div>
      <p class="strength-lead-in">Bonne nouvelle.</p>
      <h3>${safeText(presentableText(item.title, sector))}</h3>
      <p>${safeText(presentableText(item.message, sector))}</p>
      <div class="proof">${proofNarrative(item.evidence, item.signal, {}, sector)}</div>
      ${evidenceBar(item.evidence, item.signal)}
    </article>
  `;
}

function strengthsSection(model, sector) {
  const strengths = model.strengths || [];
  // Sprint 5 (objectif 7) : pas de page "Vos points forts" du tout quand la
  // liste est vide — le rapport ne doit jamais comporter de page qui ne
  // contient qu'un titre et une phrase de repli.
  if (!strengths.length) return "";
  return `
    <section class="page">
      ${header("Vos points forts")}
      <div class="section-intro positive">
        <p class="eyebrow">Confiance</p>
        <h2>Ce qui joue déjà en votre faveur</h2>
        <p>${safeText(presentableText("Ces points constituent une base de confiance. Ils montrent ce que votre fiche fait déjà bien lorsque quelqu'un compare plusieurs entreprises.", sector))}</p>
      </div>
      <div class="card-grid">
        ${strengths.map((item) => strengthCard(item, sector)).join("")}
      </div>
      ${footer(model, "Points forts")}
    </section>
  `;
}

function issueCard(item, type, sector) {
  const iconName = type === "opportunity" ? "trend" : "target";
  return `
    <article class="insight-card ${type === "opportunity" ? "opportunity-card" : "weakness-card"}">
      <div class="card-icon">${icon(iconName)}</div>
      <h3>${safeText(presentableText(item.title, sector))}</h3>
      <p>${safeText(presentableText(item.message, sector))}</p>
      <div class="proof">${proofNarrative(item.evidence, item.signal, {}, sector)}</div>
      ${evidenceBar(item.evidence, item.signal)}
    </article>
  `;
}

// Point 3 du plan : score par domaine, déjà calculé (buildDomains(),
// composer-engine/narrativeModel.js) — simple tableau récapitulatif, aucun
// nouveau calcul.
function domainRow(domain, sector) {
  const pct = Number.isFinite(domain.pct) ? Math.round(domain.pct * 100) : null;
  // Premium Polish (retour utilisateur) — une phrase sous la barre plutôt que
  // de laisser le pourcentage seul à interpréter (voir domainQualitativeNote).
  const note = domainQualitativeNote(domain.pct, domain.label);
  return `
    <div class="domain-row">
      <div class="domain-row-head">
        <span class="domain-label">${safeText(domain.label)}</span>
        <span class="domain-value">${pct !== null ? `${pct}%` : "Non évalué"}</span>
      </div>
      <div class="domain-bar-track">
        <div class="domain-bar-fill" style="width:${pct !== null ? Math.max(0, Math.min(100, pct)) : 0}%;"></div>
      </div>
      ${note ? `<p class="domain-note">${safeText(presentableText(note, sector))}</p>` : ""}
    </div>
  `;
}

function domainsBlock(domains, sector) {
  if (!Array.isArray(domains) || !domains.length) return "";
  return `
    <div class="domains-block">
      <h3 class="column-title">Score par domaine</h3>
      <div class="domain-list">${domains.map((domain) => domainRow(domain, sector)).join("")}</div>
    </div>
  `;
}

// Sprint 4 (consolidation) — objectif 1 : une même Knowledge finding peut être
// à la fois une "weakness"/"opportunity" (page Axes d'amélioration) ET une
// priorité (page Priorités, traitée plus en détail : Constat, Pourquoi c'est
// important, Preuve, Impact, effort/impact). Sans ce filtre, les deux pages
// affichaient alors les MÊMES phrases mot pour mot (businessImpact +
// competitiveAngle identiques). On n'exclut ici que l'affichage en double :
// la finding reste montrée une seule fois, sur la page qui la traite le plus
// complètement — aucune information n'est perdue, aucun tri ni score modifié
// (le classement de Composer n'est pas touché, seule la sélection d'affichage
// de cette page l'est, cf. objectif 7 : "sélectionner" reste un rôle autorisé
// du renderer).
function excludeAlreadyShownAsPriority(items, priorityIds) {
  if (!priorityIds || !priorityIds.size) return items;
  return items.filter((item) => !priorityIds.has(item.id));
}

function limitsSection(model, sector) {
  const priorityIds = new Set((model.priorities || []).map((item) => item.id).filter(Boolean));
  const weaknesses = excludeAlreadyShownAsPriority(model.weaknesses || [], priorityIds);
  const opportunities = excludeAlreadyShownAsPriority(model.opportunities || [], priorityIds);
  const domainsHtml = domainsBlock(model.domains, sector);

  // Sprint 5 (objectif 7) : chaque colonne ("À renforcer" / "Opportunités")
  // n'est affichée que si elle a un contenu réel — jamais une colonne avec
  // pour seul contenu une phrase de repli. Si la page entière n'a plus rien
  // à montrer (aucune limite, aucune opportunité, aucun score par domaine),
  // la page est omise en totalité.
  if (!weaknesses.length && !opportunities.length && !domainsHtml) return "";

  const columns = [];
  if (weaknesses.length) {
    columns.push(`
        <div>
          <h3 class="column-title">À renforcer</h3>
          <div class="stack">${weaknesses.map((item) => issueCard(item, "weakness", sector)).join("")}</div>
        </div>
    `);
  }
  if (opportunities.length) {
    columns.push(`
        <div>
          <h3 class="column-title">Opportunités</h3>
          <div class="stack">${opportunities.map((item) => issueCard(item, "opportunity", sector)).join("")}</div>
        </div>
    `);
  }

  return `
    <section class="page axes-page">
      ${header("Axes d'amélioration")}
      <div class="section-intro">
        <p class="eyebrow">Visibilité et conversion</p>
        <h2>Ce qui limite aujourd'hui votre visibilité</h2>
        <p>Les cartes restent volontairement pédagogiques : elles expliquent ce qui peut être renforcé, sans ton alarmiste.</p>
      </div>
      ${domainsHtml}
      ${columns.length ? `<div class="split-grid">${columns.join("")}</div>` : ""}
      ${footer(model, "Axes d'amélioration")}
    </section>
  `;
}

function boolLabel(value) {
  if (value === true) return "Oui";
  if (value === false) return "Non";
  return "À confirmer";
}

function actionCard(item, sector) {
  return `
    <article class="action-card">
      <div class="timeline-dot">${safeNumber(item.order)}</div>
      <div class="action-content">
        <h3>${safeText(presentableText(item.action, sector))}</h3>
        <dl>
          <div><dt>Difficulté</dt><dd>${safeLabel(item.difficulty)}</dd></div>
          <div><dt>Temps</dt><dd>${safeText(item.estimatedTime)}</dd></div>
          <div><dt>Automatisable par Efficia</dt><dd>${boolLabel(item.canEfficiaAutomate)}</dd></div>
          <div><dt>Impact attendu</dt><dd>${impactLabel(item.impactType, sector)}</dd></div>
        </dl>
      </div>
    </article>
  `;
}

// Point 6 du plan : un sous-titre par horizon au-dessus de chaque tronçon de
// timeline, sans renuméroter ni réordonner les actions (item.order reste
// celui déjà assigné par selectActionPlan(), composer-engine/selection.js).
function actionPlanGroup(group, sector) {
  return `
    <div class="action-group">
      <h3 class="column-title action-horizon">${safeText(group.label)}</h3>
      <div class="timeline">
        ${group.items.map((item) => actionCard(item, sector)).join("")}
      </div>
    </div>
  `;
}

function actionPlanSection(model, sector) {
  const groups = groupActionPlan(model.actionPlan);
  // Sprint 5 (objectif 7) : sans action, pas de page "Plan d'action" du tout
  // (plutôt qu'un titre suivi d'une timeline vide).
  if (!groups.length) return "";
  return `
    <section class="page">
      ${header("Plan d'action")}
      <div class="section-intro">
        <p class="eyebrow">Séquence recommandée</p>
        <h2>Un plan d'action simple à suivre</h2>
        <p>Les actions sont présentées dans un ordre pragmatique : commencer par ce qui clarifie vite la fiche, puis renforcer les signaux les plus visibles.</p>
      </div>
      ${groups.map((group) => actionPlanGroup(group, sector)).join("")}
      ${footer(model, "Plan d'action")}
    </section>
  `;
}

// Point 10 du plan (2026-07-31, Sprint 2B) : nouvelle page "Votre feuille de
// route personnalisée", insérée entre le Plan d'action et la Méthodologie.
// Réutilise strictement les mêmes actions déjà produites par Composer
// (model.actionPlan) et le même regroupement que actionPlanSection()
// ci-dessus (groupActionPlan) : aucune nouvelle priorisation, aucun nouveau
// calcul — uniquement une présentation plus pratique (checklist imprimable).
function roadmapItem(item, sector) {
  const meta = [
    present(item.difficulty) ? safeLabel(item.difficulty) : null,
    present(item.estimatedTime) ? safeText(item.estimatedTime) : null,
    present(item.impactType) ? impactLabel(item.impactType, sector) : null,
  ].filter(Boolean).join(" · ");
  return `
    <div class="roadmap-item">
      <span class="roadmap-checkbox" aria-hidden="true"></span>
      <div class="roadmap-item-body">
        <p class="roadmap-action">${safeText(presentableText(item.action, sector))}</p>
        ${meta ? `<p class="roadmap-meta">${meta}</p>` : ""}
      </div>
    </div>
  `;
}

function roadmapGroup(group, sector) {
  return `
    <div class="roadmap-group">
      <h3 class="column-title roadmap-horizon">${safeText(group.label)}</h3>
      <div class="roadmap-list">
        ${group.items.map((item) => roadmapItem(item, sector)).join("")}
      </div>
    </div>
  `;
}

function roadmapSection(model, sector) {
  const groups = groupActionPlan(model.actionPlan);
  // Sprint 5 (objectif 7) : même logique que actionPlanSection() ci-dessus —
  // sans action, pas de page "Feuille de route" du tout.
  if (!groups.length) return "";
  return `
    <section class="page roadmap-page">
      ${header("Votre feuille de route")}
      <div class="section-intro">
        <p class="eyebrow">Feuille de route</p>
        <h2>Votre feuille de route personnalisée</h2>
        <p>Les mêmes actions que le plan précédent, présentées pour être suivies au quotidien, une case à la fois.</p>
      </div>
      <div class="roadmap-groups">
        ${groups.map((group) => roadmapGroup(group, sector)).join("")}
      </div>
      ${footer(model, "Feuille de route")}
    </section>
  `;
}

function executionActionCard(item, sector) {
  return `<article class="execution-action-card">
    <div class="action-content">
      ${item.observed ? `<h4>Ce que nous avons observé</h4><p>${safeText(presentableText(item.observed, sector))}</p>` : ""}
      <h4>Objectif à 30 jours</h4><p>${safeText(presentableText(item.objective30Days, sector))}</p>
      <h4>Étapes exactes</h4><ol>${(item.steps || []).map((step) => `<li>${safeText(presentableText(step, sector))}</li>`).join("")}</ol>
      ${item.deliverableMode === "approved" ? `<h4>Livrable associé</h4><p>Le livrable approuvé correspondant est présenté dans la section dédiée de ce rapport.</p>` : item.deliverableMode === "recommendation" ? `<h4>Recommandation associée</h4><p>Une structure ou un modèle à adapter est présenté dans la section dédiée de cet audit.</p>` : `<h4>Préparation nécessaire</h4><p>Le contenu doit être confirmé dans le back-office avant de pouvoir être utilisé ou publié.</p>`}
      <dl>
        <div><dt>Responsable recommandé</dt><dd>${safeText(presentableText(item.owner, sector))}</dd></div>
        <div><dt>Temps estimé</dt><dd>${safeText(presentableText(item.estimatedTime, sector), "À planifier")}</dd></div>
        <div><dt>Action terminée lorsque</dt><dd>${safeText(presentableText(item.doneWhen, sector))}</dd></div>
        <div><dt>Indicateur à suivre</dt><dd>${safeText(presentableText(item.metric, sector))}</dd></div>
      </dl>
    </div>
  </article>`;
}

function executionOverviewSection(model, sector) {
  const plan = model.executionPlan;
  if (!plan?.actions?.length) return "";
  return `<section class="page">
    ${header("Plan d’exécution 30 jours")}
    <div class="section-intro"><p class="eyebrow">Vos trois résultats prioritaires</p><h2>Votre plan d’exécution sur 30 jours</h2><p>Ces résultats reprennent les priorités déjà identifiées dans l’audit, sans en ajouter de nouvelles.</p></div>
    <ol class="summary-list">${plan.outcomes.map((outcome) => `<li>${safeText(presentableText(outcome, sector))}</li>`).join("")}</ol>
    ${footer(model, "Plan d’exécution 30 jours")}
  </section>
  ${plan.actions.map((item) => `<section class="page execution-action-page">${header(`Priorité ${item.rank}`)}<div class="section-intro"><p class="eyebrow">Fiche d’action ${item.rank}</p><h2>${safePdfText(presentableText(item.title, sector))}</h2></div>${executionActionCard(item, sector)}${footer(model, `Priorité ${item.rank}`)}</section>`).join("")}`;
}

function executionDeliverablesSections(model) {
  const plan = model.executionPlan;
  if (!plan) return "";
  const approved = plan.approved || {};
  const sections = [];
  if (approved.description) {
    sections.push(`<section class="page">${header("Éléments prêts à publier")}<div class="section-intro"><p class="eyebrow">Fiche Google Business</p><h2>Description et éléments de fiche validés</h2></div>
      <article class="method-card"><h3>Votre description Google prête à publier</h3><p>${safeText(presentableText(approved.description.text))}</p><p><strong>${safeNumber(approved.description.text.length)} caractères · Statut : Approuvée</strong></p><p>Dans Google Business, ouvrez « Modifier le profil », puis « Description », copiez ce texte, publiez-le et contrôlez son affichage public.</p><p><strong>Critère de fin :</strong> La description est visible publiquement dans Google Search ou Maps.</p></article>
      ${footer(model, "Éléments de fiche")}</section>`);
  }
  if ((approved.categoryItems?.length || 0) + (approved.serviceItems?.length || 0) > 1) {
    const rows = [
      ...(approved.categoryItems || []).map((item, index) => [index ? "Catégorie secondaire" : "Catégorie principale", item.label || item.text, "À conserver si elle décrit toujours l’activité réelle", "Approuvée"]),
      ...(approved.serviceItems || []).map((item) => ["Service", item.label || item.text, "À conserver uniquement s’il est réellement proposé", "Approuvé"]),
    ];
    sections.push(`<section class="page">${header("Catégories et services")}<div class="section-intro"><p class="eyebrow">Structure de la fiche</p><h2>Catégories et services validés</h2></div><table><thead><tr><th>${pdfCell("Élément")}</th><th>${pdfCell("Valeur actuelle")}</th><th>${pdfCell("Recommandation")}</th><th>${pdfCell("Statut")}</th></tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${pdfCell(presentableText(cell))}</td>`).join("")}</tr>`).join("")}</tbody></table>${footer(model, "Catégories et services")}</section>`);
  }
  if (approved.photos?.length) {
    sections.push(`<section class="page">${header("Plan photos")}<div class="section-intro"><p class="eyebrow">Preuve visuelle</p><h2>Les photos à réaliser ce mois-ci</h2></div><div class="roadmap-list photo-deliverables">${approved.photos.map((item) => `<div class="roadmap-item"><span class="roadmap-checkbox"></span><div><p class="roadmap-action">${safeText(presentableText(item.subject || item.text))}</p><p><strong>Cadrage :</strong> ${safeText(presentableText(item.text))}</p><p><strong>Objectif :</strong> ${safeText(presentableText(item.objective))}</p><p class="roadmap-meta">Priorité ${safeText(item.priority)} · semaine ${safeNumber(item.week)}</p></div></div>`).join("")}</div>${footer(model, "Plan photos")}</section>`);
  }
  if (approved.reviewMessages?.length || approved.reviewResponses?.length || approved.reviewLink) {
    sections.push(`<section class="page">${header("Système d’avis")}<div class="section-intro"><p class="eyebrow">Confiance</p><h2>Votre système d’avis prêt à utiliser</h2></div>
      ${approved.reviewMessages?.map((item) => `<article class="method-card"><h3>${safeText(presentableText(item.label))}</h3><p>${safeText(presentableText(item.text))}</p></article>`).join("") || ""}
      ${approved.reviewResponses?.length ? `<article class="method-card"><h3>Modèles de réponse approuvés</h3>${approved.reviewResponses.map((item) => `<h4>${safeText(presentableText(item.label))}</h4><p>${safeText(presentableText(item.text))}</p>`).join("")}</article>` : ""}
      ${approved.reviewLink ? `<article class="method-card"><h3>Lien d’avis vérifié</h3><p><a href="${safeText(approved.reviewLink)}">${safeText(approved.reviewLink)}</a></p><p>Copiez ce lien dans les messages approuvés et testez-le depuis un téléphone extérieur à l’entreprise.</p></article>` : ""}
      <article class="method-card"><h3>Routine hebdomadaire</h3><ul>${(plan.reviews.routine || []).map((item) => `<li>${safeText(presentableText(item))}</li>`).join("")}</ul></article>
      ${plan.reviews.ratingEstimate ? `<article class="method-card"><h3>Objectif indicatif de note</h3><p>Note actuelle : ${safeText(presentableText(String(plan.reviews.currentRating)))} / 5 pour ${safeNumber(plan.reviews.currentReviews)} avis. Prochain palier prudent : ${safeText(String(plan.reviews.ratingEstimate.target).replace(".", ","))} / 5. Estimation : ${safeNumber(plan.reviews.ratingEstimate.needed)} nouvel avis 5 étoiles.</p><p>Estimation indicative, basée sur une moyenne mathématique simplifiée. La note affichée par Google peut être arrondie et évoluer différemment.</p></article>` : ""}
      ${footer(model, "Système d’avis")}</section>`);
  }
  if (approved.posts?.length) {
    sections.push(`<section class="page">${header("Publications Google")}<div class="section-intro"><p class="eyebrow">Activité</p><h2>Vos prochaines publications Google</h2></div>${approved.posts.map((item) => `<article class="method-card"><h3>${safeText(item.title)}</h3><p>${safeText(item.text)}</p><p>Semaine ${safeNumber(item.week)} · ${safeText(item.photoType)}</p></article>`).join("")}${footer(model, "Publications Google")}</section>`);
  }
  if (plan.actions.some((item) => item.signal === "position") && plan.visibility?.length) {
    sections.push(`<section class="page">${header("Leviers de visibilité")}<div class="section-intro"><p class="eyebrow">Visibilité locale</p><h2>Les leviers contrôlables à vérifier</h2></div><table class="visibility-table"><thead><tr><th>${pdfCell("Élément")}</th><th>${pdfCell("État actuel")}</th><th>${pdfCell("Action")}</th><th>${pdfCell("Responsable")}</th></tr></thead><tbody>${plan.visibility.map((row) => `<tr><td>${pdfCell(presentableText(row.label))}</td><td>${pdfCell(presentableText(String(row.current)))}</td><td>${pdfCell(presentableText(row.action))}</td><td>${pdfCell(presentableText(row.owner))}</td></tr>`).join("")}</tbody></table><p>La position J0/J30 reste un indicateur de suivi : elle varie selon le lieu, le moment et l’appareil utilisés.</p>${footer(model, "Leviers de visibilité")}</section>`);
  }
  return sections.join("");
}

function executionGuidanceSections(model) {
  const plan = model.executionPlan;
  const guidance = plan?.guidance || {};
  const sections = [];
  if (guidance.description) {
    const item = guidance.description;
    sections.push(`<section class="page guidance-page">${header("Structure de description")}<div class="section-intro"><p class="eyebrow">Recommandation générée · À adapter</p><h2>${safeText(presentableText(item.title))}</h2><p>${safeText(presentableText(item.objective))}</p></div><div class="split-grid"><article class="method-card"><h3>Informations à intégrer</h3><ul>${item.fields.map((value) => `<li>${safeText(presentableText(value))}</li>`).join("")}</ul></article><article class="method-card"><h3>Trame conseillée</h3><ol>${item.outline.map((value) => `<li>${safeText(presentableText(value))}</li>`).join("")}</ol></article></div><article class="method-card"><h3>Informations restant à confirmer</h3><ul>${item.missing.map((value) => `<li>${safeText(presentableText(value))}</li>`).join("")}</ul><p><strong>Statut :</strong> À confirmer avant rédaction définitive.</p></article><p class="upsell-note">${safeText(presentableText(item.packNote))}</p>${footer(model, "Structure de description")}</section>`);
  }
  if (guidance.photos?.length) {
    sections.push(`<section class="page guidance-page">${header("Recommandations photos")}<div class="section-intro"><p class="eyebrow">Recommandation générée · À adapter</p><h2>Les photos à ajouter en priorité</h2><p>Retenez uniquement les sujets qui existent réellement dans votre établissement.</p></div><table class="guidance-table"><thead><tr><th>Photo recommandée</th><th>Objectif</th><th>Conseil de prise de vue</th><th>Priorité</th><th>Publication</th></tr></thead><tbody>${guidance.photos.map((item) => `<tr><td>${safeText(presentableText(item.subject))}</td><td>${safeText(presentableText(item.objective))}</td><td>${safeText(presentableText(item.framing))}</td><td>${safeText(item.priority)}</td><td>Semaine ${safeNumber(item.week)}</td></tr>`).join("")}</tbody></table><p class="upsell-note">Dans le Pack Visibilité Google, Efficia organise cette liste avec vous, valide les sujets et prépare un calendrier de publication. Dans le Pack Performance, les publications et leur suivi sont intégrés au plan sur 30 jours.</p>${footer(model, "Recommandations photos")}</section>`);
  }
  if (guidance.reviews) {
    const item = guidance.reviews;
    sections.push(`<section class="page guidance-page">${header("Modèles de réponses")}<div class="section-intro"><p class="eyebrow">Modèles générés · À adapter</p><h2>Deux bases pour répondre aux avis</h2></div><div class="split-grid"><article class="method-card"><h3>Modèle positif</h3><p>${safeText(presentableText(item.positive))}</p></article><article class="method-card"><h3>Modèle négatif</h3><p>${safeText(presentableText(item.negative))}</p></article></div><article class="method-card"><h3>Règles d’utilisation</h3><p>${safeText(presentableText(item.usage))}</p><ul>${item.avoid.map((value) => `<li>${safeText(presentableText(value))}</li>`).join("")}</ul><p><strong>Statut :</strong> À adapter avant utilisation.</p></article><p class="upsell-note">${safeText(presentableText(item.packNote))}</p>${footer(model, "Modèles de réponses")}</section>`);
  }
  return sections.join("");
}

function executionCalendarSection(model) {
  const plan = model.executionPlan;
  if (!plan) return "";
  const weeks = [1, 2, 3, 4].map((week) => ({ week, items: plan.calendar.filter((item) => item.week === week) }));
  return `<section class="page">${header("Calendrier 30 jours")}<div class="section-intro"><p class="eyebrow">Suivi</p><h2>Votre calendrier d’exécution</h2></div><div class="roadmap-groups">${weeks.map(({ week, items }) => `<div class="roadmap-group"><h3 class="column-title">Semaine ${week}</h3>${items.length ? items.map((item) => `<div class="roadmap-item"><span class="roadmap-checkbox"></span><div><p class="roadmap-action">${safePdfText(presentableText(item.title))}</p><p class="roadmap-meta">${safePdfText(presentableText(item.owner))} · ${safePdfText(presentableText(item.estimatedTime), "À planifier")}</p><p>${safeText(presentableText(item.doneWhen))}</p></div></div>`).join("") : `<p>Contrôler les actions déjà réalisées et préparer la semaine suivante.</p>`}</div>`).join("")}</div>${footer(model, "Calendrier 30 jours")}</section>`;
}

function measurementSection(model) {
  const rows = model.executionPlan?.measurement || [];
  if (!rows.length) return "";
  return `<section class="page">${header("Mesure J0 / J30")}<div class="section-intro"><p class="eyebrow">Mesure</p><h2>Comment mesurer les progrès dans 30 jours</h2></div><table><thead><tr><th>Indicateur</th><th>J0</th><th>J+30</th><th>Évolution</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${safeText(presentableText(row.indicator))}</td><td>${safeText(presentableText(String(row.today)))}</td><td></td><td></td></tr>`).join("")}</tbody></table><ol><li>Ouvrez votre fiche Google Business.</li><li>Accédez aux performances.</li><li>Choisissez la période de référence.</li><li>Relevez les valeurs.</li><li>Revenez dans 30 jours avec la même période de comparaison.</li></ol>${footer(model, "Mesure J0 / J30")}</section>`;
}

function methodologySection(model, sector) {
  return `
    <section class="page final-page">
      ${header("Méthodologie")}
      <div class="section-intro">
        <p class="eyebrow">Décision</p>
        <h2>Pourquoi agir maintenant</h2>
        <p>${safeText(presentableText(model.whyNow?.text, sector), "Aucun texte de cadrage disponible.")}</p>
        ${model.vocabulary?.upsellNote ? `<p class="upsell-note">${safeText(presentableText(model.vocabulary.upsellNote, sector))}</p>` : ""}
      </div>
      <div class="method-grid">
        <article class="method-card">
          <h3>Méthodologie</h3>
          <p>${DEGENERATE_METHODOLOGY_PATTERN.test(String(model.footer?.methodology || ""))
            ? "Analyse issue des observations publiques · analyse fondée sur les données publiques actuellement disponibles pour votre fiche."
            : safeText(presentableText(model.footer?.methodology, sector))}</p>
        </article>
        <article class="method-card">
          <h3>Cadre de lecture</h3>
          <p>${safeText(presentableText(model.footer?.disclaimer, sector))}</p>
        </article>
        <article class="method-card">
          <h3>Versions</h3>
          <p>Composer ${safeText(model.footer?.versions?.composer)} · Reasoning ${safeText(model.footer?.versions?.reasoning)}</p>
        </article>
      </div>
      ${footer(model, "Méthodologie")}
    </section>
  `;
}

// Premium Polish — objectif 6 : le rapport se terminait jusqu'ici sur la
// page Méthodologie (mentions légales, versions techniques) — une fin assez
// abrupte. Nouvelle dernière page "En résumé", qui répond à quatre
// questions simples à partir de données déjà calculées (aucun nouveau
// score, aucune nouvelle priorité) :
//  1. Qu'est-ce qui fonctionne déjà ?  → la première force déjà sélectionnée
//     (model.strengths[0], Composer).
//  2. Quels sont les trois principaux freins ?  → les priorités déjà
//     classées par Composer (model.priorities, ordre non modifié).
//  3. Que faut-il faire en priorité ?  → la première action du plan déjà
//     ordonné (model.actionPlan[0]).
//  4. Pourquoi est-ce réalisable ?  → la même phrase effort/impact que la
//     carte de priorité correspondante (buildEffortImpactNote(), déjà
//     utilisée ailleurs) — jamais un nouveau calcul, jamais une promesse de
//     résultat, un ton rassurant plutôt que culpabilisant.
//
// Retour utilisateur — objectif "conclusion plus mémorable" : une dernière
// phrase de cadrage, sous la grille, sectorisée (buildClosingStatement()) —
// jamais une affirmation nouvelle sur les données du rapport, uniquement un
// rappel du périmètre de l'audit (présentation Google, pas la qualité réelle
// de l'activité), pour que le lecteur referme le rapport rassuré.
function conclusionSummarySection(model, sector) {
  const topStrength = (model.strengths || [])[0] || null;
  const topPriorities = (model.priorities || []).slice(0, 3);
  const firstAction = (model.actionPlan || [])[0] || null;
  const executionActions = Array.isArray(model.executionPlan?.actions) ? model.executionPlan.actions : [];
  const displayedPriorityTitle = (priority) =>
    executionActions.find((action) => action?.signal === priority?.signal)?.title || priority?.title;

  return `
    <section class="page final-page">
      ${header("En résumé")}
      <div class="section-intro">
        <p class="eyebrow">En résumé</p>
        <h2>Ce qu'il faut retenir de cette analyse</h2>
        <p>Un dernier tour d'horizon, pour repartir avec une idée claire de la situation et de la marche à suivre.</p>
      </div>
      <div class="summary-recap-grid">
        <article class="summary-recap-card">
          <span class="eyebrow">Qu'est-ce qui fonctionne déjà ?</span>
          <p>${model.executionPlan?.strengthSummary
            ? safeText(presentableText(model.executionPlan.strengthSummary, sector))
            : topStrength
            ? safeText(presentableText(topStrength.title, sector))
            : safeText(presentableText(model.executionPlan?.personalizedOverview || "La fiche dispose de données publiques qui permettent d’identifier des améliorations concrètes.", sector))}</p>
        </article>
        <article class="summary-recap-card">
          <span class="eyebrow">Quels sont les principaux freins ?</span>
          ${topPriorities.length ? `
          <ul class="summary-recap-list">
            ${topPriorities.map((item) => `<li>${icon("check")}<span>${safeText(presentableText(displayedPriorityTitle(item), sector))}</span></li>`).join("")}
          </ul>` : `<p>${safeText("Aucun frein majeur n'a été identifié à ce stade.")}</p>`}
        </article>
        <article class="summary-recap-card">
          <span class="eyebrow">Que faut-il faire en priorité ?</span>
          <p>${firstAction
            ? safeText(presentableText(firstAction.action, sector))
            : safeText("Continuer à maintenir votre fiche à jour reste la meilleure priorité actuelle.")}</p>
        </article>
        <article class="summary-recap-card">
          <span class="eyebrow">Pourquoi est-ce réalisable ?</span>
          <p>${safeText(presentableText(
            "Les améliorations proposées concernent essentiellement la manière dont votre établissement est présenté sur Google, et non la qualité de votre activité. Elles sont donc réalisables progressivement, sans modifier votre façon de travailler.",
            sector,
          ))}</p>
        </article>
      </div>
      <p class="summary-closing-statement">${safeText(presentableText(buildClosingStatement(sector), sector))}</p>
      ${footer(model, "En résumé")}
    </section>
  `;
}

/* -------------------------------------------------------------------------- */
/* Mission "transformer la dernière page en conclusion de conseil" —          */
/* troisième et dernière révision de la seule page "Et maintenant ?" (aucune  */
/* autre page touchée). Objectif 1 : une seule page, dense et sobre, plutôt   */
/* que les deux feuillets de la version précédente — le lecteur est déjà      */
/* arrivé au bout d'un rapport long, la conversion doit être courte.          */
/*                                                                            */
/* Objectif 4 : les "bénéfices" des packs ne sont plus une liste générique    */
/* fixe — reportFindingLabels() ci-dessous relit simplement model.priorities  */
/* (déjà calculé par Composer, jamais recalculé ni réordonné ici) et affiche  */
/* le libellé court du signal de chaque priorité déjà identifiée (ex.         */
/* "Description", "Galerie photos"). Aucun nouveau diagnostic n'est inventé : */
/* si aucune priorité n'existe, un repli sobre et générique est utilisé.      */
/*                                                                            */
/* Réutilise uniquement des classes/couleurs déjà existantes (offer-card,     */
/* hero-card, summary-recap-card, score-card, tokens --blue/--ink/--white/    */
/* --soft déjà utilisés ailleurs) : seules les classes propres à la mise en   */
/* page de cette page sont nouvelles. Aucun mot "réduction/promotion/         */
/* remise" : uniquement "déduction" de l'investissement déjà réalisé.        */
/* -------------------------------------------------------------------------- */

// Objectif 4 — libellé court et lisible pour chaque signal déjà identifié
// par Reasoning/Composer (item.signal, jamais recalculé). Local à cette page
// uniquement : ne modifie ni LABEL_TRANSLATIONS (partagé avec le Diagnostic
// gratuit) ni presentationFormatter.js.
const SIGNAL_SHORT_LABELS = {
  rating: "Note",
  reviews: "Avis",
  photos: "Galerie photos",
  description: "Description",
  categories: "Catégories",
  position: "Visibilité",
};

// Reprend les priorités déjà classées par Composer (model.priorities, ordre
// non modifié) et n'en garde que le libellé court du signal — jamais le
// texte complet (déjà affiché plus tôt dans le rapport), jamais une nouvelle
// analyse. Repli générique et sobre si aucune priorité n'est disponible.
function reportFindingLabels(model, limit = 4) {
  const priorities = Array.isArray(model?.executionPlan?.actions) && model.executionPlan.actions.length
    ? model.executionPlan.actions
    : (Array.isArray(model?.priorities) ? model.priorities : []);
  const labels = [];
  for (const item of priorities) {
    const label = SIGNAL_SHORT_LABELS[item?.signal];
    if (label && !labels.includes(label)) labels.push(label);
    if (labels.length >= limit) break;
  }
  return labels.length ? labels : ["Visibilité", "Réputation", "Présentation de votre fiche"];
}

function packFindingsList(items, introLabel) {
  return `
    <div class="pack-findings">
      ${introLabel ? `<p class="pack-findings-label">${safeText(introLabel)}</p>` : ""}
      <ul class="pack-features">
        ${items.map((item) => `<li>${icon("check")}<span>${safeText(item)}</span></li>`).join("")}
      </ul>
    </div>
  `;
}

// Objectif 6 — un vrai CTA (plus grand, plus visible qu'un badge), structure
// prête pour Stripe mais non relié : un <span>, jamais un <button>/<a>, ce
// document étant aussi imprimé en PDF (aucune interactivité possible sur
// papier) — on ne pose que l'apparence visuelle, sans laisser croire à un
// lien ou une action cliquable réelle.
function packCtaButton(label) {
  return `<span class="pack-cta" role="presentation">${safeText(label)}</span>`;
}

// Objectif 2/5 (mission précédente) — "popular" reprend le traitement bleu
// clair déjà utilisé (badge "Le plus choisi"), "premium" utilise un fond
// sombre (var(--ink), déjà existant) pour que le Pack Performance se lise
// immédiatement comme le palier supérieur — mêmes couleurs de la charte,
// aucune nouvelle teinte.
//
// Mission "la page doit parler du client" — le titre visible en grand
// (`intentTitle`) est désormais une intention du lecteur ("Je souhaite
// gagner du temps"), jamais un nom de produit : le cerveau choisit plus
// facilement une intention qu'un nom de pack. Le nom du pack (`productName`)
// redevient un repère secondaire, en petit, juste sous le prix — même
// principe déjà appliqué à .pack-findings (contenu secondaire, style
// démoté).
function packCard({ intentTitle, productName, price, badge, outcome, includesLabel, findings, findingsLabel, ctaLabel, variant }) {
  const modifierClass = variant === "premium" ? " pack-card-premium" : variant === "popular" ? " pack-card-highlight" : "";
  return `
    <article class="offer-card pack-card${modifierClass}">
      ${badge ? `<span class="pack-badge">${safeText(badge)}</span>` : ""}
      <h3>${safePdfText(intentTitle)}</h3>
      <div class="pack-price">${safePdfText(price)}</div>
      ${productName ? `<p class="pack-product-name">${safeText(productName)}</p>` : ""}
      ${outcome ? `<p class="pack-outcome">${safeText(outcome)}</p>` : ""}
      ${includesLabel ? `<p class="pack-includes">${safeText(includesLabel)}</p>` : ""}
      ${packFindingsList(findings, findingsLabel)}
      ${ctaLabel ? packCtaButton(ctaLabel) : ""}
    </article>
  `;
}

// Objectif 3 (mission "finition avant bêta") — nouvelle page insérée juste
// avant la page commerciale (finalConversionSection ci-dessous) : elle ne
// vend rien, elle montre concrètement le contenu du Pack Visibilité,
// action par action, pour que le lecteur sache ce qu'il achète avant de
// voir le prix. Contenu fixe (catalogue du Pack, identique pour tous les
// audits) : jamais dérivé de model.priorities, jamais recalculé — c'est la
// seule page du rapport qui ne dépend d'aucune donnée d'audit. Chaque
// libellé passe tout de même par presentableText() pour rester cohérent
// avec le vocabulaire sectoriel déjà utilisé partout ailleurs (ex. "clients"
// → "patients" pour un secteur médical).
const WHAT_WE_DO_GROUPS = [
  {
    title: "Les fondations de votre fiche",
    items: [
      "Rédaction complète de votre description : vos spécialités, votre zone d'intervention et ce qui vous différencie.",
      "Optimisation des catégories principale et secondaires, alignées sur les recherches réelles de vos clients.",
      "Vérification et complétion des informations essentielles : horaires, coordonnées, zone de service.",
      "Ajout et structuration de vos services, pour apparaître sur davantage de recherches qualifiées.",
    ],
  },
  {
    title: "La preuve sociale",
    items: [
      "Stratégie photos : sélection, organisation et enrichissement de votre galerie.",
      "Mise en place d'un système de réponse aux avis, avec un ton professionnel et rassurant.",
      "Plan de collecte d'avis, pour obtenir davantage d'avis récents sans sollicitation intrusive.",
    ],
  },
  {
    title: "La visibilité locale",
    items: [
      "Optimisation SEO locale : les mots-clés et signaux qui influencent votre position sur Google.",
      "Application des recommandations Google Business les plus récentes pour votre secteur.",
      "Suivi de positionnement, pour vérifier que les actions mises en place produisent un effet mesurable.",
    ],
  },
];

function whatWeDoSection(model, sector) {
  return `
    <section class="page final-page">
      ${header("Ce que nous allons réellement faire")}
      <div class="section-intro">
        <p class="eyebrow">Le Pack Visibilité, en détail</p>
        <h2>Ce que nous allons réellement faire</h2>
        <p>Pas des promesses marketing : des actions concrètes, appliquées directement sur votre fiche Google.</p>
      </div>
      <div class="card-grid">
        ${WHAT_WE_DO_GROUPS.map((group) => `
          <article class="method-card">
            <h3>${safeText(group.title)}</h3>
            <ul class="pack-features">
              ${group.items.map((item) => `<li>${icon("check")}<span>${safeText(presentableText(item, sector))}</span></li>`).join("")}
            </ul>
          </article>
        `).join("")}
      </div>
      <p class="summary-closing-statement">Chacune de ces actions correspond directement à une priorité identifiée dans ce rapport. Rien n'est générique&nbsp;: tout est appliqué en fonction de ce que votre fiche montre aujourd'hui.</p>
      ${footer(model, "Ce que nous allons réellement faire")}
    </section>
  `;
}

// Mission "la page doit parler du client" — la page raconte désormais
// l'histoire du lecteur avant de parler d'Efficia :
//   1. Ce que le lecteur sait déjà, grâce à ce rapport (récapitulatif en
//      quatre points, jamais un nouveau diagnostic — uniquement le rappel
//      des catégories déjà lues : forces/limites/axes/ordre d'action), puis
//      les deux possibilités qui s'offrent à lui.
//   2. Une phrase de transition vers les accompagnements.
//   3. Les packs — le grand titre est une intention du lecteur, le nom du
//      pack redevient un repère secondaire en petit ; le texte de résultat
//      renvoie explicitement à CE rapport, jamais une formule de brochure.
//   4. Pourquoi les 99 € ne sont pas perdus (inchangé, déjà validé).
//   5. Une conclusion plus humaine, avec une signature.
function finalConversionSection(model) {
  // Objectif 4 (mission précédente) — mêmes signaux prioritaires déjà
  // présentés au lecteur, pas une nouvelle liste : le Pack Visibilité
  // reprend ce qui a été identifié dans CE rapport précis.
  const findings = reportFindingLabels(model);

  return `
    <section class="page final-page conversion-page">
      ${header("Et maintenant ?")}
      <div class="section-intro conversion-intro">
        <p class="eyebrow">Et maintenant ?</p>
        <h2>Votre audit est terminé.</h2>
        <p class="conversion-recap-label">Aujourd'hui, vous savez exactement :</p>
        <ul class="conversion-recap">
          <li>${icon("check")}<span>ce qui fonctionne déjà</span></li>
          <li>${icon("check")}<span>ce qui limite votre visibilité</span></li>
          <li>${icon("check")}<span>ce qui mérite d'être amélioré</span></li>
          <li>${icon("check")}<span>dans quel ordre agir</span></li>
        </ul>
        <p class="conversion-choices-label">Vous avez maintenant deux possibilités :</p>
        <ul class="conversion-choices">
          <li>appliquer vous-même les recommandations de ce rapport</li>
          <li>ou nous confier directement leur mise en œuvre</li>
        </ul>
      </div>

      <!-- Objectif 6 (mission "corrections de qualité avant la bêta") — la
           transition ne répète plus littéralement "gagner du temps" (déjà
           utilisé comme intitulé du premier pack juste en dessous), et les
           deux textes de résultat ne suivent plus le même moule phrase à
           phrase ("Nous appliquons... Vous gagnez du temps... Vous
           bénéficiez de...") : une lecture côte à côte des deux cartes ne
           doit pas sonner comme un gabarit rempli deux fois. -->
      <p class="conversion-transition">Vous disposez maintenant du plan complet. Vous pouvez l’appliquer vous-même ou nous confier sa mise en œuvre.</p>

      <div class="pack-grid">
        ${packCard({
          intentTitle: "Je souhaite gagner du temps",
          productName: "Pack Visibilité Google",
          price: "349 €",
          badge: "Le plus choisi",
          variant: "popular",
          outcome: "Efficia applique à votre place la description, les catégories, les services, les informations, le système d’avis et l’organisation des photos validés dans ce rapport.",
          findingsLabel: "Ce que nous corrigeons, identifié dans ce rapport",
          findings,
          ctaLabel: "Commencer avec le Pack Visibilité",
        })}
        ${packCard({
          intentTitle: "Je souhaite aller plus loin",
          productName: "Pack Performance",
          price: "499 €",
          badge: "Solution complète",
          variant: "premium",
          outcome: "Efficia ajoute la mise en œuvre complète, les publications, le suivi sur 30 jours, le contrôle des performances et l’ajustement du plan.",
          includesLabel: "En plus du Pack Visibilité :",
          findings: [
            "Stratégie d'amélioration des avis",
            "Optimisations complémentaires avancées",
            "Priorisation renforcée des actions",
            "Accompagnement suivi dans la durée",
          ],
          ctaLabel: "Je choisis cette solution",
        })}
      </div>

      <!-- Objectif 3 (mission précédente) — le message principal n'est pas
           le montant, mais le fait qu'il n'est pas perdu : très visible,
           jamais "réduction". -->
      <div class="conversion-tail">
        <article class="score-card deductible-callout">
          <p class="score-band">Votre Audit Premium n'est pas une dépense perdue.</p>
          <p class="score-interpretation">Si vous choisissez un accompagnement dans les 30 jours, les 99 € déjà investis seront intégralement déduits.</p>
        </article>

      <!-- Mission "la page doit parler du client" — une conclusion plus
           humaine : le rapport reste la propriété du lecteur, la déduction
           n'est rappelée qu'en second, et la page se referme sur une
           signature plutôt qu'un argumentaire. -->
        <div><p class="summary-closing-statement">Quelle que soit votre décision, cet audit reste votre feuille de route. Vous pouvez vous y référer à tout moment pour améliorer progressivement votre visibilité sur Google. Si vous préférez nous confier cette mission dans les 30 prochains jours, les 99 € déjà investis seront intégralement déduits.</p>
        <p class="conversion-signature">Merci de votre confiance.<br>L'équipe Efficia Digital</p></div>
      </div>

      ${footer(model, "Et maintenant ?")}
    </section>
  `;
}

// Sprint 4 (consolidation) — objectif 4 : ordre des sections corrigé. Les
// priorités détaillées (Constat/Pourquoi/Preuve/Impact) doivent venir APRÈS
// les points forts et les axes d'amélioration, jamais avant : le lecteur doit
// d'abord voir où il en est et ce qui fonctionne déjà/le freine, avant de lire
// pourquoi chaque point comptera et dans quel ordre agir. L'ordre précédent
// (priorités juste après la couverture) inversait cette logique. Aucun
// contenu, aucune section n'est modifié ici — uniquement leur séquence.
//
// Sprint 5 (finition éditoriale) :
//  - objectif 3 : le secteur est détecté une seule fois ici (à partir de la
//    seule catégorie déjà disponible, hero.category) et transmis à toutes
//    les sections qui en ont besoin — jamais recalculé section par section.
//  - objectif 7 : chaque section ci-dessous renvoie "" quand elle n'a rien à
//    montrer (cf. strengthsSection/limitsSection/prioritiesSection/
//    actionPlanSection/roadmapSection) ; on filtre ces chaînes vides avant
//    de les assembler pour ne jamais laisser un bloc de page vide entre deux
//    sections réelles.
//
// Premium Polish — objectif 6 : "En résumé" est ajoutée en toute dernière
// position, après la Méthodologie — le rapport se referme désormais sur une
// synthèse claire plutôt que sur les mentions légales/versions techniques.
export function renderPremiumAuditHtml(documentModel = {}) {
  const sector = detectSector({ category: documentModel.hero?.category });
  const sections = [
    heroSection(documentModel, sector),
    strengthsSection(documentModel, sector),
    limitsSection(documentModel, sector),
    documentModel.executionPlan ? "" : prioritiesSection(documentModel, sector),
    documentModel.executionPlan ? executionOverviewSection(documentModel, sector) : actionPlanSection(documentModel, sector),
    documentModel.executionPlan ? executionGuidanceSections(documentModel) : "",
    documentModel.executionPlan ? executionDeliverablesSections(documentModel) : roadmapSection(documentModel, sector),
    documentModel.executionPlan ? executionCalendarSection(documentModel) : "",
    documentModel.executionPlan ? measurementSection(documentModel) : "",
    methodologySection(documentModel, sector),
    conclusionSummarySection(documentModel, sector),
    documentModel.executionPlan ? "" : whatWeDoSection(documentModel, sector),
    finalConversionSection(documentModel),
  ].filter((section) => section && section.trim().length > 0);

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeText(documentModel.vocabulary?.reportLabel || "Diagnostic Efficia")} - ${safeText(documentModel.hero?.businessName || "Analyse")}</title>
  ${styles()}
</head>
<body>
  <main class="report-shell">
    ${sections.join("\n")}
  </main>
</body>
</html>`;
}

/* ------------------------------------------------------------------------ */
/* Diagnostic Efficia™ gratuit — renderFreeDiagnosticHtml (Étape B)          */
/* Reproduit les 6 pages du PDF de référence validé (Auto Service Fischer). */
/* N'utilise QUE des données déjà présentes dans documentModel/freeDiagnostic */
/* (Étape A) : aucun recalcul, aucune nouvelle recommandation.              */
/* ------------------------------------------------------------------------ */

// Qualificatifs d'affichage (présentation uniquement — ne recalculent ni ne
// modifient aucune donnée du Score Efficia). Seuils repris À L'IDENTIQUE du
// générateur historique retrouvé dans l'archive Git (commit a9e3241,
// outil-score-efficia-auto-v5.html) :
//   - indices prospect → fonction styleIndice()  : >=75 Solide, >=50 À
//     renforcer, sinon Prioritaire (échelle 0-100) ;
//   - domaines → fonction statutDomaine() : >=80 Solide, >=60 Correct, >=40 À
//     renforcer, sinon Prioritaire (échelle 0-1, soit 0-100 %).
// Les seuils utilisés lors des sprints précédents (70/30 et 0.8/0.55/0.3)
// étaient une reconstruction approximative ; ce sont désormais les vraies
// valeurs historiques.
function indexStatusLabel(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return null;
  if (value >= 75) return "Solide";
  if (value >= 50) return "À renforcer";
  return "Prioritaire";
}

function domainStatusLabel(pct) {
  const value = Number(pct);
  if (!Number.isFinite(value)) return null;
  if (value >= 0.8) return "Solide";
  if (value >= 0.6) return "Correct";
  if (value >= 0.4) return "À renforcer";
  return "Prioritaire";
}

const STATUS_CLASS_BY_LABEL = {
  "Solide": "status-good",
  "Correct": "status-ok",
  "À renforcer": "status-warn",
  "Prioritaire": "status-bad",
};

function statusClass(label) {
  return STATUS_CLASS_BY_LABEL[label] || "status-ok";
}

// Symboles de la synthèse des critères (page 3), repris à l'identique de
// checklistHtml() dans le générateur historique : ✓ conforme / ! à améliorer
// / ✕ prioritaire / ○ à confirmer.
const CRITERION_ICON_BY_STATUS = {
  compliant: ["chk-ok", "✓"],
  partial: ["chk-warn", "!"],
  deficient: ["chk-ko", "✕"],
  not_verified: ["chk-unknown", "○"],
  not_applicable: ["chk-unknown", "○"],
  no_website: ["chk-unknown", "○"],
};

function criterionIcon(status) {
  return CRITERION_ICON_BY_STATUS[status] || CRITERION_ICON_BY_STATUS.not_verified;
}

function freeIndexCard(label, value) {
  const statusLabel = indexStatusLabel(value);
  return `
    <article class="index-card ${statusClass(statusLabel)}">
      <span class="index-label">${escapeHtml(label)}</span>
      <strong class="index-value">${safeNumber(value)}<small>/100</small></strong>
      ${statusLabel ? `<span class="index-status">${escapeHtml(statusLabel)}</span>` : ""}
    </article>
  `;
}

function freeIndicesRow(indices = {}) {
  return `
    <div class="index-row">
      ${freeIndexCard("Visibilité", indices?.visibilite)}
      ${freeIndexCard("Confiance", indices?.confiance)}
      ${freeIndexCard("Conversion", indices?.conversion)}
    </div>
  `;
}

// "Ce qu'il faut en retenir" — reprend la structure exacte de significationV2()
// (meaning-box / summary-line / summary-icon, glyphes ✓ / ! / ○) : jusqu'à 2
// points forts, jusqu'à 2 priorités, puis la note « à confirmer ». Aucune
// donnée inventée : uniquement des champs déjà présents dans documentModel.
function freeNotVerifiedNote(criteriaSummary) {
  const count = criteriaSummary?.counts?.not_verified || 0;
  if (!count) return null;
  return count === 1
    ? "1 élément reste à confirmer. Plutôt que de le deviner, nous l'avons marqué « à confirmer »."
    : `${count} éléments restent à confirmer. Plutôt que de les deviner, nous les avons marqués « à confirmer ».`;
}

function freeMeaningBox(model) {
  const free = model.freeDiagnostic || {};
  const strengths = (model.strengths || []).slice(0, 2);
  const priorities = (free.priorities || []).slice(0, 2);
  const notVerifiedNote = freeNotVerifiedNote(free.criteriaSummary);

  const lines = [
    ...strengths.map((item) => ({ symbolClass: "summary-icon--ok", symbol: "✓", text: item.message || item.title })),
    ...priorities.map((item) => ({ symbolClass: "summary-icon--warning", symbol: "!", text: item.observed || item.title })),
    ...(notVerifiedNote ? [{ symbolClass: "summary-icon--unknown", symbol: "○", text: notVerifiedNote }] : []),
  ].filter((item) => present(item.text));

  if (!lines.length) return "";
  return `
    <div class="meaning-box">
      <h3>Ce qu'il faut en retenir</h3>
      <ul>
        ${lines.map((item) => `<li class="summary-line"><span class="summary-icon ${item.symbolClass}">${item.symbol}</span><span><strong>${safeText(item.text)}</strong></span></li>`).join("")}
      </ul>
    </div>
  `;
}

function freeSituationSection(model) {
  const hero = model.hero || {};
  const free = model.freeDiagnostic || {};
  const showPotential = Number.isFinite(free.projectedScore) && free.projectedScore > (Number(hero.score) || 0) + 2;

  return `
    <section class="page page-hero" data-free-page="1">
      ${header(model.vocabulary?.reportLabel)}
      <div class="chapitre">ÉTAPE 1 · VOTRE FICHE AUJOURD'HUI</div>
      <h1>Votre situation aujourd'hui</h1>
      <p class="cover-meta">${[hero.businessName, hero.category, hero.city, hero.date].filter(Boolean).map((item) => safeText(item, "")).join(" · ")}</p>
      <div class="score-hero">
        <div>
          ${scoreGauge(hero.score)}
          ${showPotential ? `
            <div class="score-potential">Potentiel estimé : <span>${safeNumber(free.projectedScore)}/100</span></div>
            <div class="score-mini-story"><b>${safeNumber(hero.score)}</b><span>→</span><b>${safeNumber(free.projectedScore)}</b></div>
          ` : ""}
        </div>
        <div>
          <span class="score-level"><i style="background:${safeText(free.band?.couleur, "#2563eb")}"></i>${safeText(free.band?.nom, hero.scoreBand || "Score analysé")}</span>
          <div class="score-direct">${safeText(free.band?.verdict, "")}</div>
          <p class="hero-analysis-text">${safeText(model.executiveSummary?.text, "Résumé non disponible.")}</p>
        </div>
      </div>
      ${free.provisional ? `<p class="methode-note">${PROVISIONAL_SCORE_NOTE} ${safeText(free.locationConfirmation, "")}</p>` : ""}
      ${freeIndicesRow(free.indices)}
      ${positionSummary(free) ? `<p class="methode-note">${safeText(positionSummary(free))}</p>` : ""}
      ${model.websiteAvailabilityNote ? `<p class="methode-note">${safeText(model.websiteAvailabilityNote)}</p>` : ""}
      ${freeMeaningBox(model)}
      <p class="methode-note">Méthode — analyse réalisée sur l'état public de votre fiche Google Business. ${safeNumber(free.criteriaSummary?.total)} critères passés en revue selon la méthode Efficia™.</p>
      <div class="next-hint">Page suivante : comprendre d'où vient ce score <b>→</b></div>
      ${footer(model, "Page 1/6")}
    </section>
  `;
}

// Jauges de domaines — reprend la structure exacte de statutDomaine() +
// barre-cat/statut-domaine/barre-fond/barre-rempli du générateur historique.
function freeDomainRow(domain) {
  const pct = Number.isFinite(domain.pct) ? Math.max(0, Math.min(1, domain.pct)) : 0;
  const statusLabel = domainStatusLabel(domain.pct);
  return `
    <div class="barre-cat ${statusClass(statusLabel)}">
      <div class="ligne">
        <span>${safeText(domain.label)}</span>
        <strong>${safeNumber(domain.points)}/${safeNumber(domain.max)}</strong>
        ${statusLabel ? `<span class="statut-domaine">${escapeHtml(statusLabel)}</span>` : ""}
      </div>
      <div class="barre-fond"><div class="barre-rempli" style="width:${Math.round(pct * 100)}%"></div></div>
    </div>
  `;
}

function freeScoreExplanationSection(model) {
  const free = model.freeDiagnostic || {};
  const domains = free.domains || [];
  return `
    <section class="page" data-free-page="2">
      ${header(model.vocabulary?.reportLabel)}
      <div class="chapitre">ÉTAPE 2 · POURQUOI CE SCORE</div>
      <h1>Pourquoi obtenez-vous ce score&nbsp;?</h1>
      <p class="rapport-subtitle">Votre score se construit sur six domaines. Voici, d'un coup d'œil, où votre fiche est déjà solide — et où elle perd des points aujourd'hui.</p>
      <div class="domain-list">
        ${domains.length ? domains.map(freeDomainRow).join("") : `<p class="empty">Répartition par domaine non disponible.</p>`}
      </div>
      <div class="next-hint">Page suivante : le détail des points analysés <b>→</b></div>
      ${footer(model, "Page 2/6")}
    </section>
  `;
}

// Synthèse des critères par domaine — reprend checklistHtml() : chk-grid /
// chk-rubrique / chk-item / chk-ic, avec les mêmes symboles ✓ / ! / ✕ / ○.
function freeCriteriaDomainCard(domain) {
  const criteria = domain.criteria || [];
  const conformes = criteria.filter((item) => item.status === "compliant").length;
  return `
    <div class="chk-rubrique">
      <h3>${safeText(domain.label)}<span>${conformes}/${criteria.length} conformes</span></h3>
      ${criteria.map((item) => {
        const [iconClass, symbol] = criterionIcon(item.status);
        return `<div class="chk-item"><span class="chk-ic ${iconClass}">${symbol}</span><span>${safeText(item.question)}</span></div>`;
      }).join("")}
    </div>
  `;
}

function freeCriteriaSection(model) {
  const hero = model.hero || {};
  const free = model.freeDiagnostic || {};
  const summary = free.criteriaSummary || { total: 0, counts: {}, byDomain: [] };
  const counts = summary.counts || {};
  const notVerifiedCount = counts.not_verified || 0;

  return `
    <section class="page page-criteria" data-free-page="3">
      ${header(model.vocabulary?.reportLabel)}
      <div class="chapitre">ÉTAPE 3 · CE QUE NOUS AVONS VÉRIFIÉ</div>
      <h1>Ce que nous avons analysé</h1>
      <p class="rapport-subtitle">Pour établir ce diagnostic, nous avons passé la fiche de ${safeText(hero.businessName, "votre entreprise")} au crible de ${safeNumber(summary.total)} vérifications.</p>
      <div class="chk-compteur">
        <span class="count-tag status-compliant">${safeNumber(counts.compliant)} conformes</span>
        <span class="count-tag status-partial">${safeNumber(counts.partial)} à améliorer</span>
        <span class="count-tag status-deficient">${safeNumber(counts.deficient)} prioritaires</span>
        <span class="count-tag status-not_verified">${safeNumber(counts.not_verified)} à confirmer</span>
        ${counts.no_website ? `<span class="count-tag status-not_verified">${safeNumber(counts.no_website)} sans site web</span>` : ""}
        ${counts.not_applicable ? `<span class="count-tag status-not_verified">${safeNumber(counts.not_applicable)} non applicable</span>` : ""}
      </div>
      <div class="chk-grid">
        ${(summary.byDomain || []).map(freeCriteriaDomainCard).join("") || `<p class="empty">Détail des critères non disponible.</p>`}
      </div>
      <div class="chk-legend">Légende — <span class="chk-ok">✓</span> conforme&nbsp;&nbsp;·&nbsp;&nbsp;<span class="chk-warn">!</span> à améliorer&nbsp;&nbsp;·&nbsp;&nbsp;<span class="chk-ko">✕</span> prioritaire&nbsp;&nbsp;·&nbsp;&nbsp;<span class="chk-unknown">○</span> à confirmer manuellement.</div>
      <p class="rapport-note">Rassurez-vous : il n'est ni nécessaire ni utile de tout corriger d'un coup. Nous avons retenu les trois points qui, pour votre fiche précisément, changeront le plus de choses.${notVerifiedCount ? ` ${notVerifiedCount === 1 ? "1 élément reste" : `${notVerifiedCount} éléments restent`} à confirmer. ${notVerifiedCount === 1 ? "Il n'est vérifiable" : "Ils ne sont vérifiables"} que depuis l'intérieur du compte Google Business — c'est la première chose que couvre l'Audit complet.` : ""}</p>
      <div class="next-hint">Page suivante : vos trois priorités <b>→</b></div>
      ${footer(model, "Page 3/6")}
    </section>
  `;
}

// Cartes de priorité — reprend rendrePriorite() : priority-kicker,
// priority-title, priority-flow (Observation → Ce que voit votre client →
// Action immédiate + résultat attendu + temps estimé).
function freePriorityCard(item) {
  return `
    <article class="priority-card">
      <div class="priority-card-head">
        <div class="priority-kicker">Priorité ${safeNumber(item.rank)}</div>
        <span class="priority-kicker priority-kicker--impact">${safeLabel(item.impact)}</span>
      </div>
      <h3 class="priority-title">${safeText(item.title)}</h3>
      <div class="priority-flow">
        <div class="priority-step priority-step--observation">
          <div class="priority-step-label">Observation</div>
          <p>${safeText(item.observed)}</p>
        </div>
        <div class="priority-arrow">↓</div>
        <div class="priority-step priority-step--client">
          <div class="priority-step-label">Ce que voit votre client</div>
          <p>${safeText(item.prospectView)}</p>
        </div>
        <div class="priority-arrow">↓</div>
        <div class="priority-step priority-step--action">
          <div class="priority-step-label">Action immédiate</div>
          <p>${safeText(item.firstAction)}</p>
          ${present(item.expectedResult) ? `<p class="priority-resultat"><b>Résultat attendu :</b> ${safeText(item.expectedResult)}</p>` : ""}
          <span class="priority-time">Temps estimé : ${safeText(item.estimatedTime)}</span>
        </div>
      </div>
    </article>
  `;
}

// Page 4 — comme dans le générateur historique (prioritesPage4), seules les
// DEUX premières priorités figurent ici ; la troisième est page 5, avec la
// synthèse des bénéfices (mêmes pages que le PDF Fischer validé).
function freePrioritiesSection(model) {
  const items = (model.freeDiagnostic?.priorities || []).slice(0, 2);
  return `
    <section class="page page-priorities" data-free-page="4">
      ${header(model.vocabulary?.reportLabel)}
      <div class="chapitre">ÉTAPE 4 · VOS TROIS PRIORITÉS</div>
      <h1>Par où commencer</h1>
      <div class="priority-list">
        ${items.length ? items.map(freePriorityCard).join("") : `<p class="empty">Nous n'avons pas trouvé de priorité majeure : votre fiche est remarquablement bien tenue.</p>`}
      </div>
      <div class="next-hint">Page suivante : votre troisième priorité, et ce qu'elle peut changer <b>→</b></div>
      ${footer(model, "Page 4/6")}
    </section>
  `;
}

const AUDIT_COMPLET_ITEMS = [
  "Cohérence des catégories",
  "Stratégie d'avis",
  "SEO local",
  "Optimisation des services",
  "Questions / réponses (FAQ)",
  "Publications",
  "Photos",
  "Mots-clés",
  "Liens d'action (devis, RDV)",
  "Signaux de confiance",
];

// Icônes de bénéfice (page 5) : un choix simple par nature d'impact, sans
// inventer de nouvelle catégorisation ("famille") comme le faisait l'ancien
// pipeline — seul l'impact déjà calculé (item.impact) est réutilisé.
const BENEFIT_ICON_BY_IMPACT = {
  visibility: "trend",
  trust: "shield",
  conversion: "spark",
};

function freeBenefitCard(item) {
  const iconName = BENEFIT_ICON_BY_IMPACT[item.impact] || "spark";
  return `
    <div class="benefit-card">
      <b>${icon(iconName)}<span>${safeLabel(item.impact)}</span></b>
      ${safeText(item.expectedResult)}
    </div>
  `;
}

function freeResolutionSection(model) {
  const free = model.freeDiagnostic || {};
  const priorities = free.priorities || [];
  const thirdPriority = priorities[2];
  const reportLabel = model.vocabulary?.reportLabel || "Diagnostic Efficia™";

  return `
    <section class="page page-benefits" data-free-page="5">
      ${header(reportLabel)}
      <div class="chapitre">ÉTAPE 5 · COMMENT LES RÉSOUDRE</div>
      ${thirdPriority
        ? freePriorityCard(thirdPriority)
        : `<div class="bloc-item"><div class="t">Dernier ajustement</div><div class="d">Votre fiche ne demande pas de troisième chantier prioritaire. La meilleure suite consiste à consolider les deux actions précédentes et à vérifier les points restés à confirmer.</div></div>`}
      <h2 class="section-h2">Ce que ces trois priorités peuvent améliorer</h2>
      <div class="benefit-grid">
        ${priorities.length ? priorities.map(freeBenefitCard).join("") : ""}
      </div>
      <div class="paid-audit-box">
        <h3>Ce diagnostic gratuit couvre uniquement les freins visibles de l'extérieur.</h3>
        <p>${safeText(reportLabel)} analyse les informations publiquement observables. L’Audit Google Business approfondit cette lecture avec une analyse structurée de plus de 20 critères, notamment :</p>
        <div class="teaser-grid">
          ${AUDIT_COMPLET_ITEMS.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
        </div>
        <p class="teaser-more">…et de nombreux autres critères ayant un impact direct sur votre visibilité.</p>
      </div>
      <div class="next-hint">Page suivante : deux façons de passer à l'action <b>→</b></div>
      ${footer(model, "Page 5/6")}
    </section>
  `;
}

function freeOfferCard({ badge, title, price, features, cta, recommended }) {
  return `
    <article class="offer-card${recommended ? " offer-recommended" : ""}">
      <span class="offer-badge">${escapeHtml(badge)}</span>
      <h3>${escapeHtml(title)}</h3>
      <div class="offer-price">${escapeHtml(price)}</div>
      <ul class="offer-features">
        ${features.map((item) => `<li>${icon("check")}<span>${escapeHtml(item)}</span></li>`).join("")}
      </ul>
      <div class="offer-cta">${escapeHtml(cta)}</div>
    </article>
  `;
}

function freeActionSection(model) {
  const hero = model.hero || {};
  const free = model.freeDiagnostic || {};
  const showProjection = Number.isFinite(free.projectedScore) && free.projectedScore > (Number(hero.score) || 0) + 2;
  return `
    <section class="page final-page page-offers" data-free-page="6">
      ${header(model.vocabulary?.reportLabel)}
      <div class="chapitre">ÉTAPE 6 · PASSER À L'ACTION</div>
      <h1>Deux façons d'améliorer votre fiche</h1>
      <p class="rapport-subtitle">Vous pouvez appliquer ces trois priorités vous-même, ou confier à Efficia l'ensemble des optimisations de la fiche de ${safeText(hero.businessName, "votre entreprise")}.</p>
      ${showProjection ? `
        <div class="projection-grid">
          <div class="proj-col"><span>Votre score aujourd'hui</span><strong>${safeNumber(hero.score)}/100</strong></div>
          <div class="proj-fleche">${icon("arrow")}</div>
          <div class="proj-col"><span>Score projeté après optimisation</span><strong>${safeNumber(free.projectedScore)}/100</strong></div>
        </div>
      ` : ""}
      <div class="choice-note">Le Pack permet de corriger immédiatement les priorités détectées, sans que vous ayez à modifier la fiche vous-même.</div>
      <div class="offer-grid">
        ${freeOfferCard({
          badge: "Je le fais moi-même",
          title: "Audit Efficia complet",
          price: "99 €",
          features: [
            "Analyse structurée — plus de 20 critères passés en revue",
            "Plan d'action détaillé, prêt à appliquer",
            "Ordre précis des priorités",
            "Recommandations point par point",
          ],
          cta: "Recevoir l'Audit complet — 99 €",
        })}
        ${freeOfferCard({
          badge: "Efficia s'occupe de tout",
          title: "Pack Visibilité Google",
          price: "349 €",
          features: [
            "Optimisation complète de votre fiche par nos soins",
            "Description, services et catégories retravaillés",
            "Parcours de collecte d'avis mis en place",
            "Validation finale avec vous avant publication",
          ],
          cta: "Choisir le Pack — 349 €",
          recommended: true,
        })}
      </div>
      ${footer(model, "Page 6/6")}
    </section>
  `;
}

export function renderFreeDiagnosticHtml(documentModel = {}) {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeText(documentModel.vocabulary?.reportLabel || "Diagnostic Efficia")} - ${safeText(documentModel.hero?.businessName || "Analyse")}</title>
  ${styles()}
</head>
<body>
  <main class="report-shell free-diagnostic">
    ${freeSituationSection(documentModel)}
    ${freeScoreExplanationSection(documentModel)}
    ${freeCriteriaSection(documentModel)}
    ${freePrioritiesSection(documentModel)}
    ${freeResolutionSection(documentModel)}
    ${freeActionSection(documentModel)}
  </main>
</body>
</html>`;
}

/* ------------------------------------------------------------------------ */
/* Routeur — seul point qui choisit entre les deux renderers.               */
/* ------------------------------------------------------------------------ */

export function renderAnalysisHtml(documentModel = {}) {
  return documentModel?.reportType === "free"
    ? renderFreeDiagnosticHtml(documentModel)
    : renderPremiumAuditHtml(documentModel);
}

function styles() {
  return `
    <style>
      :root {
        --blue: ${EFFICIA_BLUE};
        --blue-soft: #eff6ff;
        --ink: #071a3d;
        --muted: #64748b;
        --soft: #f8fafc;
        --line: #e2e8f0;
        --green: #167a4a;
        --green-soft: #eef8f1;
        --orange: #b45309;
        --orange-soft: #fff7ed;
        --red: #dc2626;
        --white: #ffffff;
      }

      * { box-sizing: border-box; }

      html { scroll-behavior: auto; }

      body {
        margin: 0;
        color: var(--ink);
        background: #f6f9ff;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 16px;
        line-height: 1.6;
      }

      /* Premium Polish — objectif 8 : compactage léger des paddings/gaps
         (ici et sur les blocs répétés ci-dessous : cartes de priorité,
         points forts/faiblesses, actions, feuille de route, conclusion)
         pour réduire le nombre de pages sans toucher aux tailles de police
         ni aux interlignes de lecture — la lisibilité doit rester intacte. */
      .page {
        position: relative;
        width: min(1120px, calc(100% - 40px));
        min-height: 980px;
        margin: 32px auto;
        padding: 40px 40px 80px;
        background: var(--white);
        border: 1px solid rgba(226, 232, 240, 0.9);
        border-radius: 30px;
        box-shadow: 0 30px 90px rgba(15, 23, 42, 0.08);
        overflow: hidden;
      }

      .doc-header,
      .doc-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 24px;
      }

      .doc-header {
        padding-bottom: 22px;
        border-bottom: 1px solid var(--line);
      }

      .doc-header > span {
        color: var(--blue);
        font-size: 12px;
        font-weight: 850;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        min-height: 42px;
      }

      .brand-logo {
        width: 184px;
        height: 104px;
        object-fit: contain;
        object-position: left center;
        display: block;
      }

      .doc-footer {
        position: absolute;
        left: 46px;
        right: 46px;
        bottom: 28px;
        padding-top: 18px;
        border-top: 1px solid var(--line);
        color: #94a3b8;
        font-size: 12px;
        font-weight: 750;
      }

      .cover-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 390px;
        gap: 48px;
        align-items: center;
        padding: 44px 0 32px;
      }

      .eyebrow {
        margin: 0 0 14px;
        color: var(--blue);
        font-size: 13px;
        font-weight: 850;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      /* Bug corrigé (bêta) — mots collés dans le PDF ("Surla", "contre0",
         "renforceraitla"...) et dernière page dont le texte s'affichait un mot
         par ligne. Cause réelle : la valeur "anywhere" d'overflow-wrap
         autorise le moteur de mise en page à couper une ligne A N'IMPORTE
         QUEL caractère, y compris a l'endroit même d'une espace normale —
         un comportement connu pour être instable entre le rendu écran
         (aperçu HTML, jamais concerné) et le rendu PDF natif de Chromium
         (Cloudflare Browser Rendering, /pdf), qui recalcule la mise en page
         pour la pagination. Les textes source (knowledgeMessages.js,
         presentationFormatter.js) contiennent bien les espaces attendues à
         chaque endroit concerné : le défaut n'est donc pas un bug de
         contenu, seulement de rendu. Remplacé par "break-word", qui ne coupe
         que si un mot déborde réellement, sans jamais consommer une espace
         normale — comportement standard, sans perte de protection contre un
         débordement réel (URL longue, etc.). */
      h1, h2, h3, p { overflow-wrap: break-word; }

      h1 {
        margin: 0;
        max-width: 760px;
        font-size: clamp(48px, 5vw, 64px);
        line-height: 0.98;
        letter-spacing: -0.055em;
      }

      h2 {
        margin: 0;
        font-size: 32px;
        line-height: 1.08;
        letter-spacing: -0.035em;
      }

      h3 {
        margin: 0;
        font-size: 24px;
        line-height: 1.18;
        letter-spacing: -0.025em;
      }

      p {
        margin: 0;
        color: #475569;
      }

      .cover-meta {
        margin-top: 20px;
        color: var(--muted);
        font-weight: 750;
      }

      .headline {
        max-width: 760px;
        margin-top: 22px;
        color: #26364f;
        font-size: 23px;
        line-height: 1.55;
        font-weight: 750;
      }

      .score-card,
      .hero-card,
      .priority-card,
      .free-priority-card,
      .insight-card,
      .action-card,
      .method-card,
      .index-card,
      .criteria-domain-card,
      .offer-card,
      .summary-recap-card {
        border: 1px solid var(--line);
        background: var(--white);
        border-radius: 26px;
        box-shadow: 0 18px 54px rgba(15, 23, 42, 0.055);
      }

      .score-card {
        padding: 34px 34px 30px;
        text-align: center;
        background: radial-gradient(circle at 50% 15%, rgba(37, 99, 235, 0.08), transparent 42%), linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
        border-color: rgba(191, 219, 254, 0.85);
      }

      .score-gauge-wrap {
        position: relative;
        width: 278px;
        height: 278px;
        margin: 0 auto;
      }

      .score-gauge {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }

      .score-gauge-bg,
      .score-gauge-value {
        fill: none;
        stroke-width: 12;
      }

      .score-gauge-bg { stroke: #e8eef8; }
      .score-gauge-value { stroke: var(--blue); transition: none; }

      .score-gauge-center {
        position: absolute;
        inset: 0;
        display: grid;
        place-content: center;
        text-align: center;
      }

      .score-gauge-center strong {
        font-size: 78px;
        line-height: 0.9;
        letter-spacing: -0.06em;
      }

      .score-gauge-center span {
        margin-top: 8px;
        color: var(--muted);
        font-weight: 850;
      }

      .score-band {
        margin-top: 18px;
        color: var(--blue);
        font-size: 19px;
        font-weight: 900;
      }

      .score-label {
        display: inline-flex;
        margin-bottom: 18px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .score-authority {
        max-width: 300px;
        margin: 16px auto 0;
        padding-top: 14px;
        border-top: 1px solid var(--line);
        color: var(--muted);
        font-size: 12.5px;
        line-height: 1.55;
        font-weight: 650;
      }

      .score-interpretation {
        max-width: 300px;
        margin: 18px auto 0;
        color: #334155;
        font-size: 15px;
        line-height: 1.65;
        font-weight: 720;
      }

      .cover-bottom {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 376px;
        gap: 24px;
      }

      .hero-card {
        padding: 28px;
        display: flex;
        gap: 18px;
      }

      .hero-card h2 {
        margin-bottom: 14px;
        font-size: 28px;
      }

      .hero-card p {
        font-size: 18px;
        line-height: 1.7;
      }

      .executive-card {
        padding: 34px 38px;
        border-color: rgba(226, 232, 240, 0.62);
        box-shadow: none;
      }

      .executive-card p:not(.letter-label) {
        max-width: 720px;
        color: #26364f;
        font-size: 19px;
        line-height: 1.85;
      }

      /* Point 5 (Sprint 2A) : synthèse en liste du résumé exécutif — davantage
         d'espace blanc entre l'ouverture, la liste et la conclusion. */
      .executive-card p.summary-opening,
      .executive-card p.summary-levers-intro,
      .executive-card p.summary-closing {
        margin: 0 0 16px;
      }

      .summary-levers {
        display: grid;
        gap: 10px;
        margin: 0 0 20px;
        padding: 0;
        list-style: none;
      }

      .summary-levers li {
        display: flex;
        gap: 10px;
        align-items: center;
        color: #26364f;
        font-size: 18px;
        font-weight: 780;
      }

      .summary-levers svg { color: var(--blue); }

      .letter-label {
        margin-bottom: 10px;
        color: var(--blue);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .cover-side {
        display: grid;
        gap: 16px;
      }

      .card-icon {
        flex: 0 0 44px;
        width: 44px;
        height: 44px;
        display: grid;
        place-items: center;
        border-radius: 14px;
        color: var(--blue);
        background: var(--blue-soft);
      }

      .potential-card {
        display: block;
        border-color: rgba(226, 232, 240, 0.72);
        box-shadow: none;
      }

      .potential-top,
      .potential-score {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 18px;
      }

      .potential-top span,
      .potential-title {
        color: var(--muted);
        font-size: 13px;
        font-weight: 850;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .potential-top strong {
        color: #f59e0b;
        letter-spacing: 0.04em;
      }

      .potential-score {
        margin-top: 18px;
      }

      .potential-score strong {
        font-size: 46px;
        line-height: 1;
        letter-spacing: -0.05em;
      }

      .potential-score span {
        color: var(--ink);
        font-size: 18px;
        font-weight: 850;
      }

      .potential-title { margin-top: 22px; }

      /* Point 9 (Sprint 2A) : phrase de cadrage temporel sous le libellé —
         bloc visuellement inchangé sinon (score, étoiles, libellé, leviers). */
      .potential-timeframe {
        margin: 6px 0 0;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.5;
      }

      .driver-list {
        display: grid;
        gap: 10px;
        margin: 14px 0 18px;
        padding: 0;
        list-style: none;
      }

      .driver-list li {
        display: flex;
        gap: 10px;
        align-items: center;
        color: #334155;
        font-weight: 780;
      }

      .driver-list svg { color: var(--blue); }

      small {
        display: block;
        color: #94a3b8;
        font-size: 12px;
        line-height: 1.45;
      }

      .method-proof-card {
        padding: 20px 22px;
        border-radius: 24px;
        background: #ffffff;
        border: 1px solid rgba(226, 232, 240, 0.72);
      }

      .method-proof-card p {
        color: var(--muted);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .method-proof-card ul {
        display: grid;
        gap: 10px;
        margin: 14px 0 0;
        padding: 0;
        list-style: none;
      }

      .method-proof-card li {
        display: flex;
        gap: 10px;
        align-items: center;
        color: #26364f;
        font-size: 14px;
        font-weight: 780;
      }

      .method-proof-card svg {
        color: var(--blue);
      }

      .section-intro,
      .section-lead {
        max-width: 760px;
      }

      .section-intro {
        padding: 38px 0 22px;
      }

      .section-lead {
        margin-top: 16px;
        font-size: 18px;
        line-height: 1.65;
      }

      .section-intro p:not(.eyebrow) {
        margin-top: 14px;
        font-size: 18px;
        line-height: 1.65;
      }

      .positive .eyebrow { color: var(--green); }

      .priority-list,
      .stack,
      .timeline {
        display: grid;
        gap: 14px;
      }

      .priority-card,
      .free-priority-card {
        display: grid;
        grid-template-columns: 150px 1fr;
        padding: 0;
        overflow: hidden;
      }

      .priority-rank {
        display: grid;
        place-items: center;
        min-height: 190px;
        color: var(--blue);
        background: var(--blue-soft);
        font-size: 14px;
        font-weight: 900;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        text-align: center;
        padding: 16px;
      }

      .priority-body {
        padding: 22px;
      }

      .priority-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-top: 16px;
      }

      .priority-grid div {
        padding: 13px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: var(--soft);
      }

      .priority-grid span,
      .column-title {
        color: var(--muted);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .priority-grid p {
        margin-top: 8px;
        color: #243044;
        font-weight: 700;
      }

      /* Sprint 3 : "Constat" (niveau de lecture 1, factuel) — même langage
         visuel que .priority-grid (span/p), placé au-dessus, hors grille,
         pour bien le séparer visuellement de "Pourquoi c'est important". */
      .priority-constat {
        margin-top: 12px;
        padding: 13px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: var(--white);
      }

      .priority-constat span {
        color: var(--muted);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .priority-constat p {
        margin-top: 8px;
        color: #243044;
        font-weight: 700;
      }

      /* Premium Polish — objectif 7 : "Pourquoi c'est important" et "Preuve"
         occupent chacun toute la largeur (repris du même langage visuel que
         .priority-constat ci-dessus), au lieu d'être forcés côte à côte dans
         une grille 2 colonnes qui les comprimait l'un contre l'autre. */
      .priority-block {
        margin-top: 12px;
        padding: 13px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: var(--soft);
      }

      .priority-block span {
        color: var(--muted);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .priority-block p {
        margin-top: 8px;
        color: #243044;
        font-weight: 700;
        line-height: 1.55;
      }

      /* Premium Polish — objectif 2 : l'angle psychologique est maintenant
         une phrase complète et naturelle ("Pourquoi votre note influence le
         premier choix"), pas un intitulé abstrait à 2-3 mots — le mettre en
         majuscules (comportement par défaut de .eyebrow) le ferait paraître
         criard. On garde la couleur/le poids distinctifs, sans capitaliser. */
      .priority-angle {
        margin-bottom: 8px;
        text-transform: none;
        letter-spacing: 0;
        font-size: 15px;
      }

      /* Premium Polish (retour utilisateur) — "pourquoi cet ordre", juste
         sous le titre : voir buildRankRationale(). */
      .priority-rank-rationale {
        margin-top: 8px;
        color: var(--muted);
        font-size: 13.5px;
        font-style: italic;
        line-height: 1.5;
      }

      .priority-effort-note {
        margin-top: 12px;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.5;
        font-style: italic;
      }

      .priority-meta {
        display: flex;
        gap: 24px;
        margin-top: 14px;
        color: var(--muted);
        font-size: 13px;
        font-weight: 800;
      }

      .card-grid,
      .split-grid,
      .method-grid {
        display: grid;
        gap: 16px;
      }

      .card-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .split-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .method-grid {
        grid-template-columns: 1fr;
      }

      .insight-card,
      .method-card {
        padding: 20px;
      }

      .insight-card .card-icon {
        margin-bottom: 14px;
      }

      .insight-card p,
      .method-card p {
        margin-top: 12px;
      }

      /* Premium Polish — objectif 6 : page de conclusion "En résumé", quatre
         cartes courtes en grille 2x2 — même langage visuel que les cartes
         existantes (.method-card), sans nouvelle charte. */
      .summary-recap-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        margin-top: 8px;
      }

      .summary-recap-card {
        padding: 20px;
      }

      .summary-recap-card .eyebrow {
        margin-bottom: 10px;
      }

      .summary-recap-card p {
        color: #26364f;
        font-size: 17px;
        font-weight: 700;
        line-height: 1.6;
      }

      .summary-recap-list {
        display: grid;
        gap: 10px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .summary-recap-list li {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        color: #26364f;
        font-size: 17px;
        font-weight: 700;
        line-height: 1.5;
      }

      /* Retour utilisateur — dernière phrase de la page "En résumé", plus
         affirmée que le reste du texte courant (taille, poids, couleur de
         marque) pour rester en mémoire une fois le rapport refermé. */
      .summary-closing-statement {
        margin-top: 24px;
        padding-top: 20px;
        border-top: 1px solid var(--line);
        max-width: 760px;
        color: var(--ink);
        font-size: 19px;
        font-weight: 750;
        line-height: 1.6;
      }

      /* Mission "la page doit parler du client" — une signature sobre,
         pour une fin plus humaine que la seule phrase de clôture. */
      .conversion-signature {
        margin-top: 14px;
        color: var(--muted);
        font-size: 14px;
        font-weight: 700;
        line-height: 1.5;
      }

      /* Mission "page finale de conversion" — nouvelle page "Et maintenant ?",
         ajoutée après "En résumé". Les cartes elles-mêmes (.offer-card,
         .hero-card, .summary-recap-card) sont déjà stylées par la liste
         partagée bordure/fond/ombre plus haut ; seules les classes propres à
         CETTE page sont ajoutées ici. Rien n'est scopé sous
         .free-diagnostic : aucune règle existante n'est modifiée. */
      .pack-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
        margin-top: 4px;
      }

      .pack-card {
        position: relative;
        padding: 22px;
      }

      /* Objectif 1 — page unique, dense : l'intro de cette page précise n'a
         pas besoin de l'espace généreux du .section-intro standard (conçu
         pour des pages à un seul bloc). */
      .conversion-intro {
        padding-top: 24px;
        padding-bottom: 4px;
      }

      .pack-card-highlight {
        border-color: rgba(191, 219, 254, 0.9);
        background: radial-gradient(circle at 50% 0%, rgba(37, 99, 235, 0.06), transparent 55%), var(--white);
      }

      .pack-badge {
        display: inline-flex;
        margin-bottom: 14px;
        padding: 6px 14px;
        border-radius: 999px;
        background: var(--blue);
        color: var(--white);
        font-size: 12px;
        font-weight: 850;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .pack-card h3 {
        font-size: 22px;
      }

      .pack-price {
        margin-top: 10px;
        color: var(--blue);
        font-size: 30px;
        font-weight: 900;
        letter-spacing: -0.02em;
      }

      /* Mission "la page doit parler du client" — le nom du pack redevient
         un simple repère, en petit, sous le prix : le grand titre (h3) est
         désormais l'intention du lecteur, pas le nom du produit. */
      .pack-product-name {
        margin-top: 4px;
        color: var(--muted);
        font-size: 12.5px;
        font-weight: 800;
        letter-spacing: 0.02em;
      }

      /* Objectif 4 — le résultat attendu, affiché avant la liste des
         prestations : c'est ce que le client achète en premier. */
      .pack-outcome {
        margin-top: 14px;
        color: var(--ink);
        font-size: 15px;
        font-weight: 700;
        line-height: 1.55;
      }

      .pack-includes {
        margin-top: 16px;
        color: #26364f;
        font-size: 14px;
        font-weight: 800;
      }

      .pack-features {
        display: grid;
        gap: 8px;
        margin: 10px 0 0;
        padding: 0;
        list-style: none;
      }

      .pack-features li {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        color: #26364f;
        font-size: 14px;
        font-weight: 700;
        line-height: 1.45;
      }

      .pack-features svg { color: var(--blue); flex: 0 0 auto; margin-top: 2px; }

      /* Objectif 5 — Pack Performance doit se lire comme le palier premium :
         fond sombre (var(--ink), déjà utilisé ailleurs dans la charte pour le
         texte), jamais une nouvelle couleur. Le badge/prix repassent en blanc
         pour rester lisibles sur ce fond. */
      .pack-card-premium {
        background: var(--ink);
        border-color: var(--ink);
      }

      .pack-card-premium h3,
      .pack-card-premium .pack-price,
      .pack-card-premium .pack-includes {
        color: var(--white);
      }

      .pack-card-premium .pack-product-name,
      .pack-card-premium .pack-outcome {
        color: rgba(255, 255, 255, 0.85);
      }

      .pack-card-premium .pack-badge {
        background: var(--white);
        color: var(--ink);
      }

      .pack-card-premium .pack-features li,
      .pack-card-premium .pack-findings-label {
        color: rgba(255, 255, 255, 0.92);
      }

      .pack-card-premium .pack-features svg {
        color: #7fb0ff;
      }

      /* Objectif 4 — "ce que nous corrigeons", repris de model.priorities
         (reportFindingLabels ci-dessus). Devient secondaire : le résultat
         attendu (.pack-outcome) est désormais le premier message lu, cette
         liste de prestations passe donc en retrait (taille réduite, liste
         plus resserrée) plutôt qu'en avant-plan. */
      .pack-findings {
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid var(--line);
      }

      .pack-findings-label {
        margin-bottom: 6px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .pack-findings .pack-features li {
        font-size: 13px;
      }

      /* Objectif 6 — un vrai CTA (plus grand, plus visible qu'un badge) sous
         chaque pack ; structure prête pour Stripe, non reliée. C'est le fond
         de la carte (bleu clair ou sombre, cf. ci-dessus) qui distingue déjà
         les deux paliers, le bouton reste donc identique sur les deux. */
      .pack-cta {
        display: block;
        margin-top: 20px;
        padding: 16px 22px;
        border-radius: 14px;
        background: var(--blue);
        color: var(--white);
        font-size: 15.5px;
        font-weight: 850;
        text-align: center;
      }

      .pack-card-premium .pack-cta {
        background: var(--white);
        color: var(--ink);
      }

      /* Mission "la page doit parler du client" — la page commence
         désormais par ce que LE LECTEUR sait déjà (grâce à ce rapport),
         avant de parler des deux possibilités puis d'Efficia. Même
         intitulé visuel que .conversion-choices-label, pour que les deux
         listes se lisent comme une suite naturelle. */
      .conversion-recap-label,
      .conversion-choices-label {
        margin-top: 16px;
        color: var(--ink);
        font-size: 15px;
        font-weight: 750;
      }

      .conversion-recap {
        display: grid;
        gap: 6px;
        margin: 10px 0 0;
        padding: 0;
        list-style: none;
      }

      .conversion-recap li {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        color: #26364f;
        font-size: 14.5px;
        font-weight: 700;
        line-height: 1.45;
      }

      .conversion-recap svg { color: var(--blue); flex: 0 0 auto; margin-top: 2px; }

      /* Objectif 2 (mission précédente) — bloc de choix compact (remplace
         les deux grandes cartes de choix de la toute première version). */
      .conversion-choices {
        display: grid;
        gap: 4px;
        margin: 8px 0 0;
        padding: 0 0 0 20px;
        color: #475569;
        font-size: 15px;
        font-weight: 600;
        line-height: 1.55;
      }

      /* Mission "simplifier et optimiser la dernière page", objectif 2/5 —
         une seule phrase de transition (remplace l'ancien comparatif de
         temps en deux colonnes) : elle répond à "pourquoi choisir un
         accompagnement ?" et amène directement les packs, sans bloc
         supplémentaire à lire. */
      .conversion-transition {
        margin: 22px 0 4px;
        max-width: 640px;
        color: #26364f;
        font-size: 15.5px;
        font-weight: 700;
        line-height: 1.55;
      }

      /* Objectif 3 — "un grand encadré", très visible : réutilise .score-card
         (déjà stylé, dégradé bleu léger déjà existant) pour donner au message
         de déduction le même traitement que le Score Efficia™ en couverture.
         Le message n'est plus le montant seul, mais que l'investissement
         n'est pas perdu — d'où un texte pleine largeur plutôt qu'un chiffre
         isolé. */
      .deductible-callout {
        margin: 4px 0 22px;
        padding: 30px 36px;
      }

      .deductible-callout .score-band {
        max-width: 640px;
        margin: 0 auto;
        color: var(--ink);
        font-size: 22px;
        font-weight: 900;
        line-height: 1.35;
      }

      .deductible-callout .score-interpretation {
        max-width: 560px;
        margin: 10px auto 0;
        font-size: 16px;
        font-weight: 700;
      }

      .strength-card {
        border-color: #c8ead5;
        background: linear-gradient(180deg, #ffffff, #f8fffb);
      }

      .strength-card .card-icon {
        color: var(--green);
        background: var(--green-soft);
      }

      .weakness-card {
        background: #ffffff;
      }

      .opportunity-card {
        border-color: #fed7aa;
        background: linear-gradient(180deg, #ffffff, #fffaf5);
      }

      .opportunity-card .card-icon {
        color: var(--orange);
        background: var(--orange-soft);
      }

      .proof {
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid var(--line);
        color: var(--muted);
        font-size: 13px;
        font-weight: 780;
      }

      /* Premium Polish (retour utilisateur) — mini-jauge Vous/Concurrents,
         posée sous la phrase de preuve (jamais à la place) : même donnée,
         lecture instantanée en plus de la phrase. */
      .evidence-bars {
        display: grid;
        gap: 8px;
        margin-top: 12px;
      }

      .evidence-bar-row {
        display: grid;
        grid-template-columns: 82px 1fr auto;
        align-items: center;
        gap: 10px;
      }

      .evidence-bar-label {
        color: var(--muted);
        font-size: 12px;
        font-weight: 850;
        letter-spacing: 0.03em;
      }

      .evidence-bar-track {
        height: 10px;
        border-radius: 999px;
        background: var(--soft);
        overflow: hidden;
      }

      .evidence-bar-fill {
        height: 100%;
        border-radius: 999px;
      }

      .evidence-bar-fill.you { background: var(--blue); }
      .evidence-bar-fill.competitor { background: #cbd5e1; }

      .evidence-bar-value {
        color: #243044;
        font-size: 13px;
        font-weight: 800;
        white-space: nowrap;
      }

      .evidence-percentile {
        margin-top: 2px;
        color: var(--blue);
        font-size: 12.5px;
        font-weight: 800;
      }

      /* Premium Polish (retour utilisateur) — amorce rassurante en tête de
         chaque point fort ("Bonne nouvelle."), avant le titre. */
      .strength-lead-in {
        margin-bottom: 6px;
        color: var(--green);
        font-size: 13px;
        font-weight: 900;
        letter-spacing: 0.02em;
      }

      .column-title {
        margin: 0 0 14px;
      }

      .timeline {
        position: relative;
        padding-left: 34px;
      }

      .timeline::before {
        content: "";
        position: absolute;
        left: 15px;
        top: 20px;
        bottom: 20px;
        width: 2px;
        background: #d7e5ff;
      }

      .action-card,
      .execution-action-card {
        position: relative;
        display: grid;
        grid-template-columns: 46px 1fr;
        gap: 14px;
        padding: 20px;
        box-shadow: none;
      }

      /* Les fiches d'exécution sont plus longues que les anciennes cartes.
         Un conteneur grid est indivisible dans Chromium à l'impression et
         repoussait toute la fiche après son en-tête. Un flux block conserve
         la carte sur la même page et autorise une continuation propre si un
         contenu validé devient exceptionnellement long. */
      .execution-action-card {
        display: block;
      }

      .execution-action-card .timeline-dot {
        margin-bottom: 10px;
      }

      .execution-action-card h4 {
        margin: 9px 0 3px;
        font-size: 14px;
      }

      .execution-action-card p,
      .execution-action-card li {
        font-size: 13.5px;
        line-height: 1.42;
      }

      .execution-action-card ol {
        margin: 5px 0 8px;
        padding-left: 22px;
      }

      .execution-action-card .action-content dl {
        margin-top: 8px;
        gap: 6px;
      }

      .execution-action-card .action-content dl div {
        padding: 7px;
      }

      .execution-action-page h2 { letter-spacing: 0; }

      @media print {
        .execution-action-page { padding-top: 9mm; padding-bottom: 20mm; }
        .execution-action-page .section-intro { padding-top: 12px; padding-bottom: 7px; }
        .execution-action-page .section-intro h2 { font-size: 24px; line-height: 1.12; }
        .execution-action-page .execution-action-card { padding: 10px 13px; }
        .execution-action-page .execution-action-card h4 { margin-top: 6px; }
        .execution-action-page .execution-action-card p,
        .execution-action-page .execution-action-card li { font-size: 12.7px; line-height: 1.32; }
        .execution-action-page .execution-action-card ol { margin-bottom: 5px; }
        .execution-action-page .execution-action-card .action-content dl { grid-template-columns: 1fr 1fr; gap: 5px; }
        .execution-action-page .execution-action-card .action-content dl div { padding: 5px 7px; }
        .conversion-page { padding-top: 8mm; padding-bottom: 18mm; }
        .conversion-page .conversion-intro { padding: 10px 0 4px; }
        .conversion-page .conversion-intro h2 { font-size: 25px; }
        .conversion-page .conversion-recap { grid-template-columns: 1fr 1fr; gap: 3px 14px; margin-top: 5px; }
        .conversion-page .conversion-recap-label,
        .conversion-page .conversion-choices-label { margin-top: 7px; }
        .conversion-page .conversion-choices { grid-template-columns: 1fr 1fr; margin-top: 4px; line-height: 1.3; }
        .conversion-page .conversion-transition { margin: 9px 0 4px; font-size: 13.5px; }
        .conversion-page .pack-grid { grid-template-columns: 1fr; gap: 7px; }
        .conversion-page .pack-card { padding: 11px; }
        .conversion-page .pack-badge { margin-bottom: 6px; padding: 4px 9px; font-size: 9px; }
        .conversion-page .pack-card h3 { font-size: 17px; }
        .conversion-page .pack-price { margin-top: 4px; font-size: 23px; }
        .conversion-page .pack-outcome { margin-top: 6px; font-size: 12px; line-height: 1.3; }
        .conversion-page .pack-findings { margin-top: 7px; padding-top: 6px; }
        .conversion-page .pack-features { gap: 3px; margin-top: 4px; }
        .conversion-page .pack-features li,
        .conversion-page .pack-findings .pack-features li { gap: 5px; font-size: 10.5px; line-height: 1.25; }
        .conversion-page .pack-cta { margin-top: 7px; padding: 8px 10px; font-size: 11px; }
        .conversion-page .deductible-callout { margin: 4px 0 0; padding: 7px 12px; }
        .conversion-page .deductible-callout .score-band { font-size: 13px; line-height: 1.2; }
        .conversion-page .deductible-callout .score-interpretation { margin-top: 3px; font-size: 10px; line-height: 1.25; }
        .conversion-page .summary-closing-statement { margin-top: 4px; padding-top: 4px; font-size: 10px; line-height: 1.25; }
        .conversion-page .conversion-signature { margin-top: 3px; font-size: 9.5px; line-height: 1.2; }
        .conversion-page .conversion-tail { display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 8px; align-items: start; break-inside: avoid; }
      }

      .timeline-dot {
        position: relative;
        z-index: 1;
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        color: var(--blue);
        background: #edf4ff;
        font-weight: 900;
      }

      .action-content dl {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
        margin: 14px 0 0;
      }

      .action-content dl div {
        padding: 11px;
        border-radius: 16px;
        background: var(--soft);
      }

      dt {
        color: var(--muted);
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      dd {
        margin: 6px 0 0;
        color: #243044;
        font-weight: 820;
      }

      .final-page .section-intro {
        max-width: 860px;
      }

      .method-card {
        box-shadow: none;
        background: var(--soft);
      }

      .empty {
        margin: 0;
        padding: 20px;
        border: 1px dashed var(--line);
        border-radius: 18px;
        color: var(--muted);
      }

      /* — Point 11 (Sprint 1, 2026-07-31) : comparaison VOUS / Meilleure     */
      /*   fiche observée, sur la page de couverture.                       */
      .comparison-card {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 28px;
        margin: 0 0 28px;
        padding: 26px 30px;
        border: 1px solid var(--line);
        border-radius: 26px;
        background: var(--soft);
      }

      .comparison-col { text-align: center; }

      .comparison-fallback {
        grid-template-columns: 1fr;
        text-align: center;
      }

      .comparison-fallback p {
        margin: 0;
        color: #334155;
        font-size: 15px;
        font-weight: 700;
        line-height: 1.6;
      }

      .comparison-divider {
        width: 1px;
        align-self: stretch;
        background: var(--line);
      }

      .comparison-label {
        color: var(--muted);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .comparison-stars {
        margin-top: 10px;
        color: #f59e0b;
        font-size: 20px;
        letter-spacing: 0.06em;
      }

      .comparison-rating {
        margin-top: 6px;
        color: var(--ink);
        font-size: 30px;
        font-weight: 900;
        letter-spacing: -0.03em;
      }

      .comparison-meta {
        margin-top: 8px;
        color: #334155;
        font-size: 14px;
        font-weight: 780;
      }

      .comparison-note {
        margin-top: 4px;
        color: #94a3b8;
        font-size: 11px;
        font-weight: 700;
      }

      .comparison-name {
        margin-top: 8px;
        color: var(--muted);
        font-size: 13px;
        font-weight: 780;
      }

      .comparison-rank {
        margin: 0 0 28px;
        color: #334155;
        font-size: 15px;
        font-weight: 780;
      }

      .comparison-note-line { display: block; }

      /* — Point 3 (Sprint 1, 2026-07-31) : score par domaine, page "Axes    */
      /*   d'amélioration" — passthrough du Score Efficia déjà calculé.      */
      .domains-block {
        margin-bottom: 30px;
      }

      .domain-list {
        display: grid;
        gap: 14px;
        margin-top: 14px;
      }

      /* Premium Polish (retour utilisateur) — "Score par domaine" passe d'une
         ligne label/barre/valeur à un bloc empilé (en-tête, barre, phrase de
         lecture) : le pourcentage seul obligeait le lecteur à l'interpréter. */
      .domain-row {
        display: grid;
        gap: 8px;
      }

      .domain-row-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 14px;
      }

      .domain-label {
        color: #26364f;
        font-size: 14px;
        font-weight: 780;
      }

      .domain-bar-track {
        height: 10px;
        border-radius: 999px;
        background: #e8eef8;
        overflow: hidden;
      }

      .domain-bar-fill {
        height: 100%;
        border-radius: 999px;
        background: var(--blue);
      }

      .domain-value {
        color: var(--muted);
        font-size: 13px;
        font-weight: 850;
      }

      .domain-note {
        color: var(--muted);
        font-size: 13.5px;
        line-height: 1.5;
      }

      /* Point 6 (Sprint 2B) : un tronçon de timeline par horizon, sans
         changer l'apparence des cartes d'action elles-mêmes. */
      .action-group + .action-group {
        margin-top: 30px;
      }

      .action-horizon {
        margin: 0 0 16px;
      }

      /* Point 10 (Sprint 2B) : page "Votre feuille de route personnalisée" —
         très peu de texte, beaucoup d'espace, cases à cocher imprimables.
         Réutilise .column-title, .section-intro, .page, header()/footer()
         déjà existants ; seuls les éléments propres à la checklist sont
         nouveaux ici. */
      .roadmap-groups {
        display: grid;
        gap: 26px;
        margin-top: 10px;
      }

      .roadmap-horizon {
        margin: 0 0 14px;
      }

      .roadmap-list {
        display: grid;
        gap: 13px;
      }

      .roadmap-item {
        display: flex;
        align-items: flex-start;
        gap: 16px;
      }

      .roadmap-checkbox {
        flex: 0 0 26px;
        width: 26px;
        height: 26px;
        margin-top: 2px;
        border: 2px solid var(--line);
        border-radius: 8px;
        background: var(--white);
      }

      .roadmap-action {
        margin: 0;
        color: var(--ink);
        font-size: 19px;
        font-weight: 780;
        line-height: 1.4;
      }

      .roadmap-meta {
        margin: 4px 0 0;
        color: var(--muted);
        font-size: 14px;
      }

      /* Densité du rapport premium : proportions uniquement. Le diagnostic
         gratuit reste strictement isolé par le sélecteur de racine. */
      .report-shell:not(.free-diagnostic) {
        font-size: 13.6px;
        line-height: 1.44;
      }

      .report-shell:not(.free-diagnostic) .page {
        padding: 32px 34px 68px;
      }

      .report-shell:not(.free-diagnostic) h1 {
        max-width: 820px;
        font-size: clamp(38px, 4vw, 51px);
        line-height: 0.9;
      }

      .report-shell:not(.free-diagnostic) h2 {
        font-size: 27px;
        line-height: 1;
      }

      .report-shell:not(.free-diagnostic) h3 {
        font-size: 20px;
        line-height: 1.06;
      }

      .report-shell:not(.free-diagnostic) .cover-grid {
        grid-template-columns: minmax(0, 1fr) 350px;
        gap: 34px;
        padding: 30px 0 22px;
      }

      .report-shell:not(.free-diagnostic) .headline {
        max-width: 820px;
        margin-top: 16px;
        font-size: 19.5px;
        line-height: 1.4;
      }

      .report-shell:not(.free-diagnostic) .score-card {
        padding: 27px 28px 24px;
      }

      .report-shell:not(.free-diagnostic) .score-gauge-wrap {
        width: 222px;
        height: 222px;
      }

      .report-shell:not(.free-diagnostic) .score-gauge-center strong { font-size: 62px; }
      .report-shell:not(.free-diagnostic) .score-band { margin-top: 14px; font-size: 16px; }
      .report-shell:not(.free-diagnostic) .score-label { margin-bottom: 14px; font-size: 10px; }
      .report-shell:not(.free-diagnostic) .score-authority {
        max-width: 320px;
        margin-top: 12px;
        padding-top: 11px;
        font-size: 10.6px;
        line-height: 1.4;
        text-align: justify;
      }
      .report-shell:not(.free-diagnostic) .score-interpretation {
        max-width: 320px;
        margin-top: 13px;
        font-size: 12.8px;
        line-height: 1.48;
      }

      .report-shell:not(.free-diagnostic) .section-intro,
      .report-shell:not(.free-diagnostic) .section-lead { max-width: 820px; }
      /* Chromium détermine les séparations de mots du PDF à partir de la
         distance physique entre glyphes. Les graisses fortes et les
         letter-spacing négatifs des titres réduisaient parfois cette
         distance sous son seuil, alors que l'espace existait bien dans le
         HTML. Un espacement de mot explicite, limité au Premium, stabilise
         à la fois le rendu et la couche texte sans caractère artificiel. */
      .report-shell:not(.free-diagnostic) { word-spacing: normal; }
      .report-shell:not(.free-diagnostic) h1,
      .report-shell:not(.free-diagnostic) h2,
      .report-shell:not(.free-diagnostic) h3,
      .report-shell:not(.free-diagnostic) .roadmap-action,
      .report-shell:not(.free-diagnostic) th,
      .report-shell:not(.free-diagnostic) td,
      .report-shell:not(.free-diagnostic) .pack-price { word-spacing: normal; }
      .report-shell:not(.free-diagnostic) h1,
      .report-shell:not(.free-diagnostic) h2,
      .report-shell:not(.free-diagnostic) .roadmap-action { word-spacing: normal; }
      .report-shell:not(.free-diagnostic) th,
      .report-shell:not(.free-diagnostic) td { word-spacing: normal; }
      .report-shell:not(.free-diagnostic) .visibility-table { border-collapse: separate; border-spacing: 7px 0; }
      .report-shell:not(.free-diagnostic) .visibility-table th,
      .report-shell:not(.free-diagnostic) .visibility-table td { padding-left: 3px; padding-right: 3px; }
      .report-shell:not(.free-diagnostic) h1,
      .report-shell:not(.free-diagnostic) h2,
      .report-shell:not(.free-diagnostic) h3,
      .report-shell:not(.free-diagnostic) h4,
      .report-shell:not(.free-diagnostic) .roadmap-action,
      .report-shell:not(.free-diagnostic) .pack-price,
      .report-shell:not(.free-diagnostic) th,
      .report-shell:not(.free-diagnostic) td {
        letter-spacing: 0.012em;
        font-kerning: none;
        font-variant-ligatures: none;
      }
      /* En white-space normal, Chromium ne peint pas toujours un glyphe
         espace dans le PDF : il avance seulement le curseur, puis les
         extracteurs doivent deviner la séparation. pre-wrap conserve le
         caractère espace du HTML dans la couche texte tout en autorisant
         les retours à la ligne. Le contenu a déjà été nettoyé par le
         Presentation Formatter, donc aucun espace multiple n'est conservé. */
      .report-shell:not(.free-diagnostic) h1,
      .report-shell:not(.free-diagnostic) h2,
      .report-shell:not(.free-diagnostic) h3,
      .report-shell:not(.free-diagnostic) h4,
      .report-shell:not(.free-diagnostic) p,
      .report-shell:not(.free-diagnostic) li,
      .report-shell:not(.free-diagnostic) th,
      .report-shell:not(.free-diagnostic) td,
      .report-shell:not(.free-diagnostic) dt,
      .report-shell:not(.free-diagnostic) dd { white-space: normal; }
      .report-shell:not(.free-diagnostic) .section-intro { padding: 26px 0 15px; }
      .report-shell:not(.free-diagnostic) .section-lead,
      .report-shell:not(.free-diagnostic) .section-intro p:not(.eyebrow) {
        font-size: 15.3px;
        line-height: 1.48;
      }
      .report-shell:not(.free-diagnostic) .section-intro p:not(.eyebrow) { margin-top: 10px; }
      .report-shell:not(.free-diagnostic) .eyebrow { margin-bottom: 10px; font-size: 11px; }

      .report-shell:not(.free-diagnostic) .hero-card { padding: 23px; gap: 14px; }
      .report-shell:not(.free-diagnostic) .hero-card h2 { margin-bottom: 10px; font-size: 24px; }
      .report-shell:not(.free-diagnostic) .hero-card p { font-size: 15.3px; line-height: 1.5; }
      .report-shell:not(.free-diagnostic) .executive-card { padding: 27px 31px; }
      .report-shell:not(.free-diagnostic) .executive-card p:not(.letter-label) {
        max-width: 800px;
        font-size: 16px;
        line-height: 1.65;
      }
      .report-shell:not(.free-diagnostic) .executive-card p.summary-opening,
      .report-shell:not(.free-diagnostic) .executive-card p.summary-levers-intro,
      .report-shell:not(.free-diagnostic) .executive-card p.summary-closing { margin-bottom: 11px; }
      .report-shell:not(.free-diagnostic) .summary-levers { gap: 7px; margin-bottom: 14px; }
      .report-shell:not(.free-diagnostic) .summary-levers li { font-size: 15.3px; }

      .report-shell:not(.free-diagnostic) .priority-list,
      .report-shell:not(.free-diagnostic) .stack,
      .report-shell:not(.free-diagnostic) .timeline { gap: 10px; }
      .report-shell:not(.free-diagnostic) .priority-card { grid-template-columns: 120px 1fr; }
      .report-shell:not(.free-diagnostic) .priority-rank { min-height: 152px; padding: 13px; font-size: 12px; }
      .report-shell:not(.free-diagnostic) .priority-body { padding: 17px; }
      .report-shell:not(.free-diagnostic) .priority-constat,
      .report-shell:not(.free-diagnostic) .priority-block { margin-top: 8px; padding: 10px; }
      .report-shell:not(.free-diagnostic) .priority-constat p,
      .report-shell:not(.free-diagnostic) .priority-block p { margin-top: 5px; line-height: 1.4; }
      .report-shell:not(.free-diagnostic) .priority-grid { gap: 8px; margin-top: 10px; }
      .report-shell:not(.free-diagnostic) .priority-grid div { padding: 10px; }
      .report-shell:not(.free-diagnostic) .priority-grid p { margin-top: 5px; }
      .report-shell:not(.free-diagnostic) .priority-rank-rationale { margin-top: 5px; font-size: 11.5px; line-height: 1.35; }
      .report-shell:not(.free-diagnostic) .priority-effort-note { margin-top: 8px; font-size: 12px; line-height: 1.35; }
      .report-shell:not(.free-diagnostic) .priority-meta { gap: 18px; margin-top: 10px; font-size: 11px; }

      .report-shell:not(.free-diagnostic) .card-grid,
      .report-shell:not(.free-diagnostic) .split-grid,
      .report-shell:not(.free-diagnostic) .method-grid,
      .report-shell:not(.free-diagnostic) .summary-recap-grid { gap: 11px; }
      .report-shell:not(.free-diagnostic) .insight-card,
      .report-shell:not(.free-diagnostic) .method-card,
      .report-shell:not(.free-diagnostic) .summary-recap-card { padding: 15px; }
      .report-shell:not(.free-diagnostic) .insight-card .card-icon { margin-bottom: 10px; }
      .report-shell:not(.free-diagnostic) .insight-card p,
      .report-shell:not(.free-diagnostic) .method-card p { margin-top: 8px; }
      .report-shell:not(.free-diagnostic) .summary-recap-card p,
      .report-shell:not(.free-diagnostic) .summary-recap-list li { font-size: 14.5px; line-height: 1.4; }
      .report-shell:not(.free-diagnostic) .summary-recap-list { gap: 7px; }
      .report-shell:not(.free-diagnostic) .summary-closing-statement {
        max-width: 820px;
        margin-top: 16px;
        padding-top: 14px;
        font-size: 16px;
        line-height: 1.44;
      }

      .report-shell:not(.free-diagnostic) .action-group + .action-group { margin-top: 20px; }
      .report-shell:not(.free-diagnostic) .timeline { padding-left: 25px; }
      .report-shell:not(.free-diagnostic) .action-card,
      .report-shell:not(.free-diagnostic) .execution-action-card { grid-template-columns: 38px 1fr; gap: 10px; padding: 15px; }
      .report-shell:not(.free-diagnostic) .action-content dl { gap: 7px; margin-top: 10px; }
      .report-shell:not(.free-diagnostic) .action-content dl div { padding: 8px; }
      .report-shell:not(.free-diagnostic) .roadmap-groups { gap: 18px; margin-top: 7px; }
      .report-shell:not(.free-diagnostic) .roadmap-list { gap: 9px; }
      .report-shell:not(.free-diagnostic) .roadmap-item { gap: 12px; }
      .report-shell:not(.free-diagnostic) .roadmap-action { font-size: 16px; line-height: 1.3; }

      .report-shell:not(.free-diagnostic) .comparison-card {
        gap: 20px;
        margin-bottom: 19px;
        padding: 20px 24px;
      }
      .report-shell:not(.free-diagnostic) .comparison-rank { margin-bottom: 19px; font-size: 12.8px; }
      .report-shell:not(.free-diagnostic) .domains-block { margin-bottom: 21px; }
      .report-shell:not(.free-diagnostic) .domain-list { gap: 10px; margin-top: 10px; }

      .report-shell:not(.free-diagnostic) .pack-grid { gap: 13px; }
      .report-shell:not(.free-diagnostic) .pack-card { padding: 17px; }
      .report-shell:not(.free-diagnostic) .conversion-intro { padding-top: 17px; }
      .report-shell:not(.free-diagnostic) .pack-cta { margin-top: 17px; padding: 13px 19px; font-size: 13.2px; }
      .report-shell:not(.free-diagnostic) .deductible-callout { margin-bottom: 16px; padding: 22px 29px; }

      /* Justification limitée aux paragraphes demandés ; listes, tableaux et
         titres conservent leur alignement actuel. */
      .report-shell:not(.free-diagnostic) .priority-why p,
      .report-shell:not(.free-diagnostic) .executive-card p,
      .report-shell:not(.free-diagnostic) .summary-recap-card p,
      .report-shell:not(.free-diagnostic) .summary-closing-statement,
      .report-shell:not(.free-diagnostic) .method-card p,
      .report-shell:not(.free-diagnostic) .conversion-intro > p:not(.eyebrow),
      .report-shell:not(.free-diagnostic) .conversion-transition,
      .report-shell:not(.free-diagnostic) .pack-outcome,
      .report-shell:not(.free-diagnostic) .deductible-callout p,
      .report-shell:not(.free-diagnostic) .conversion-signature {
        text-align: justify;
        text-justify: inter-word;
      }

      /* ------------------------------------------------------------------ */
      /* Diagnostic Efficia gratuit — port fidèle du générateur historique   */
      /* (commit a9e3241, outil-score-efficia-auto-v5.html, archivé sous     */
      /* archive/ancien-diagnostic-efficia-v5.html). Tout est scopé sous     */
      /* .free-diagnostic : aucune règle premium ci-dessus n'est modifiée.   */
      /* Les couleurs réutilisent les tokens --green/--blue/--orange/--red   */
      /* déjà partagés (mêmes teintes que statutDomaine()/styleIndice()      */
      /* historiques : vert/bleu/orange/rouge), plutôt que de dupliquer des  */
      /* valeurs hexadécimales, pour rester cohérent avec les critères.      */
      /* ------------------------------------------------------------------ */

      /* — Pages A4 physiques (width/height/page-break), comme l'ancien      */
      /*   générateur : chaque .page est un feuillet A4 complet.            */
      /* Marge verticale corrigée : haut 13mm / bas 14mm (au lieu de 20mm),  */
      /* dans la fourchette professionnelle demandée (haut 12-16mm, bas      */
      /* 10-14mm) — ne touche pas à la marge horizontale (16mm, inchangée).  */
      .free-diagnostic .page {
        width: 210mm;
        height: 297mm;
        min-height: 0;
        margin: 0 auto 24px;
        padding: 13mm 16mm 14mm;
        border-radius: 8px;
        box-sizing: border-box;
        /* Écran uniquement : overflow visible pour pouvoir inspecter les     */
        /* débordements pendant le développement. Le print reste en hidden   */
        /* (règle explicite dans @media print ci-dessous).                   */
        overflow: visible;
      }

      /* Espace entre l'en-tête (logo + libellé) et le chapitre : le        */
      /* padding-bottom partagé (.doc-header, 30px ≈ 8mm, utilisé aussi par  */
      /* le premium) est réduit ICI uniquement pour le gratuit, sans changer */
      /* la règle .doc-header elle-même.                                    */
      .free-diagnostic .doc-header {
        padding-bottom: 14px;
      }

      /* Logo : le ratio naturel du SVG (viewBox 1536x864) est correct — le  */
      /* problème est que .brand-logo (partagé, non modifié ici) l'affiche   */
      /* en largeur:184px/height:auto SANS plafond de hauteur, ce qui rend   */
      /* le bloc logo ~103px de haut au lieu des ~52px historiques           */
      /* (.rapport-logo img,.report-logo{width:170px;height:auto;            */
      /* max-height:52px;object-fit:contain}), et gonfle donc l'en-tête sur  */
      /* les 6 pages. On restaure ici exactement ces dimensions historiques, */
      /* uniquement pour le gratuit (object-fit:contain conserve le ratio    */
      /* naturel, aucun transform/scale, aucune hauteur fixe concurrente).   */
      .free-diagnostic .brand-logo {
        width: 170px;
        height: auto;
        max-height: 52px;
        object-fit: contain;
        display: block;
      }

      .free-diagnostic h1,
      .free-diagnostic h2,
      .free-diagnostic h3 {
        overflow-wrap: anywhere;
      }

      /* Diagnostic gratuit non touché (règle absolue) : ses paragraphes
         héritaient jusqu'ici de "anywhere" via la règle générique h1,h2,h3,p
         ci-dessus (aucune règle .free-diagnostic p n'existait). Le correctif
         "mots collés" changeant cette règle générique pour le premium
         (break-word), cette déclaration explicite conserve EXACTEMENT le
         comportement précédent pour .free-diagnostic p — aucun changement,
         même indirect, sur le Diagnostic gratuit. Le Diagnostic gratuit
         utilise de toute façon un chemin PDF entièrement différent (capture
         d'écran page par page, jamais le rendu PDF texte natif concerné par
         ce bug), donc ce filet de sécurité est purement défensif. */
      .free-diagnostic p {
        overflow-wrap: anywhere;
      }

      /* — Chapitre (repère d'étape) : reprend .chapitre — libellé + filet    */
      /*   horizontal, distinct du .eyebrow premium (non touché).           */
      .free-diagnostic .chapitre {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 0 0 6px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--blue);
      }

      .free-diagnostic .chapitre::after {
        content: "";
        flex: 1;
        height: 1px;
        background: var(--line);
      }

      .free-diagnostic h1 {
        font-size: clamp(30px, 3.4vw, 40px);
        line-height: 1.05;
        letter-spacing: -0.03em;
        margin: 0 0 8px;
      }

      .free-diagnostic h2 {
        font-size: 22px;
        line-height: 1.15;
      }

      .free-diagnostic .rapport-subtitle {
        margin-top: 4px;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }

      .free-diagnostic .rapport-note {
        margin-top: 10px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
      }

      .free-diagnostic .next-hint {
        margin-top: 10px;
        text-align: right;
        font-size: 11px;
        font-weight: 700;
        color: var(--muted);
      }

      .free-diagnostic .next-hint b { color: var(--blue); font-weight: 800; }

      /* — Statuts (indices / domaines) : couleurs partagées avec les        */
      /*   critères (status-compliant etc.), seuils historiques exacts.     */
      .status-good { border-color: #c8ead5; background: var(--green-soft); }
      .status-good .index-label,
      .status-good .index-value,
      .status-good .ligne { color: var(--green); }
      .status-good .barre-rempli { background: var(--green); }
      .status-good .statut-domaine,
      .status-good .index-status { color: var(--green); background: var(--green-soft); }

      .status-ok { border-color: #bfdbfe; background: var(--blue-soft); }
      .status-ok .index-label,
      .status-ok .index-value,
      .status-ok .ligne { color: var(--blue); }
      .status-ok .barre-rempli { background: var(--blue); }
      .status-ok .statut-domaine,
      .status-ok .index-status { color: var(--blue); background: var(--blue-soft); }

      .status-warn { border-color: #fed7aa; background: var(--orange-soft); }
      .status-warn .index-label,
      .status-warn .index-value,
      .status-warn .ligne { color: var(--orange); }
      .status-warn .barre-rempli { background: var(--orange); }
      .status-warn .statut-domaine,
      .status-warn .index-status { color: var(--orange); background: var(--orange-soft); }

      .status-bad { border-color: #fecaca; background: #fef2f2; }
      .status-bad .index-label,
      .status-bad .index-value,
      .status-bad .ligne { color: var(--red); }
      .status-bad .barre-rempli { background: var(--red); }
      .status-bad .statut-domaine,
      .status-bad .index-status { color: var(--red); background: #fef2f2; }

      /* — Page 1 : score-hero (jauge + verdict), repris de .score-hero. */
      .free-diagnostic .score-hero {
        display: grid;
        grid-template-columns: 190px 1fr;
        gap: 22px;
        align-items: center;
        margin-top: 10px;
      }

      .free-diagnostic .score-gauge-wrap {
        width: 170px;
        height: 170px;
      }

      .free-diagnostic .score-potential {
        margin-top: 6px;
        text-align: center;
        color: var(--muted);
        font-size: 12px;
        font-weight: 800;
      }

      .free-diagnostic .score-potential span { color: var(--ink); }

      .free-diagnostic .score-mini-story {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-top: 4px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 800;
      }

      .free-diagnostic .score-mini-story b { color: var(--ink); font-size: 15px; }

      .free-diagnostic .score-level {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        padding: 6px 12px;
        font-size: 11px;
        font-weight: 800;
        background: var(--soft);
        border: 1px solid var(--line);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .free-diagnostic .score-level i {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
      }

      .free-diagnostic .score-direct {
        margin-top: 7px;
        font-size: 16px;
        font-weight: 800;
        line-height: 1.38;
        color: var(--ink);
      }

      .free-diagnostic .hero-analysis-text {
        margin-top: 7px;
        font-size: 12.5px;
        line-height: 1.5;
        color: #44546a;
      }

      .free-diagnostic .index-row {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-top: 10px;
      }

      .free-diagnostic .index-card {
        padding: 12px 14px;
        text-align: center;
        border: 1px solid var(--line);
        background: var(--white);
        border-radius: 14px;
      }

      .free-diagnostic .index-label {
        display: block;
        color: var(--muted);
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .free-diagnostic .index-value {
        display: block;
        margin-top: 6px;
        font-size: 24px;
        letter-spacing: -0.03em;
      }

      .free-diagnostic .index-value small {
        display: inline;
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
      }

      .free-diagnostic .index-status {
        display: inline-block;
        margin-top: 6px;
        padding: 2px 9px;
        border-radius: 999px;
        font-size: 9px;
        font-weight: 850;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      /* — "Ce qu'il faut en retenir" : .meaning-box / .summary-line, repris  */
      /*   à l'identique de significationV2().                              */
      .free-diagnostic .meaning-box {
        margin-top: 9px;
        padding: 11px 14px;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: var(--soft);
      }

      .free-diagnostic .meaning-box h3 { font-size: 14px; margin-bottom: 6px; }

      .free-diagnostic .meaning-box ul {
        display: grid;
        gap: 3px;
        margin: 6px 0 0;
        padding: 0;
        list-style: none;
      }

      .free-diagnostic .summary-line {
        display: flex;
        gap: 9px;
        align-items: flex-start;
        font-size: 12px;
        line-height: 1.4;
        color: #26364f;
      }

      .free-diagnostic .summary-icon {
        flex: 0 0 auto;
        min-width: 16px;
        height: 16px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 900;
        font-size: 10px;
        margin-top: 1px;
      }

      .free-diagnostic .summary-icon--ok { color: var(--green); background: var(--green-soft); }
      .free-diagnostic .summary-icon--warning { color: var(--orange); background: var(--orange-soft); }
      .free-diagnostic .summary-icon--unknown { color: var(--muted); background: var(--line); }

      .free-diagnostic .methode-note {
        margin-top: 8px;
        padding-top: 6px;
        border-top: 1px solid var(--line);
        color: var(--muted);
        font-size: 10.5px;
        line-height: 1.5;
      }

      /* — Page 2 : jauges de domaine, repris de .barre-cat/.statut-domaine/  */
      /*   .barre-fond/.barre-rempli (statutDomaine()).                      */
      .free-diagnostic .domain-list {
        display: grid;
        gap: 10px;
        margin-top: 16px;
      }

      .free-diagnostic .barre-cat {
        padding: 10px 14px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--white);
      }

      .free-diagnostic .ligne {
        display: grid;
        grid-template-columns: 1fr auto auto;
        gap: 10px;
        align-items: center;
        font-size: 13px;
        font-weight: 800;
        color: #26364f;
      }

      .free-diagnostic .statut-domaine {
        border-radius: 999px;
        padding: 3px 10px;
        font-size: 10px;
        font-weight: 850;
        text-align: center;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }

      .free-diagnostic .barre-fond {
        margin-top: 7px;
        height: 9px;
        border-radius: 999px;
        background: #e8eef8;
        overflow: hidden;
      }

      .free-diagnostic .barre-rempli {
        height: 100%;
        border-radius: 999px;
        background: var(--blue);
      }

      /* — Page 3 : synthèse des critères, repris de .chk-grid/.chk-rubrique/ */
      /*   .chk-item/.chk-ic/.chk-compteur/.chk-legend (checklistHtml()).     */
      .free-diagnostic .chk-compteur {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin: 9px 0 1px;
      }

      .free-diagnostic .count-tag {
        padding: 6px 13px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 850;
        border: 1px solid var(--line);
      }

      .status-compliant { color: var(--green); background: var(--green-soft); border-color: #c8ead5; }
      .status-partial { color: var(--orange); background: var(--orange-soft); border-color: #fed7aa; }
      .status-deficient { color: var(--red); background: #fef2f2; border-color: #fecaca; }
      .status-not_verified { color: var(--muted); background: var(--soft); border-color: var(--line); }

      .free-diagnostic .chk-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 11px;
        margin-top: 10px;
      }

      .free-diagnostic .chk-rubrique {
        padding: 10px 13px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--white);
      }

      .free-diagnostic .chk-rubrique h3 {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 8px;
        font-size: 12.5px;
        margin-bottom: 8px;
        color: var(--ink);
      }

      .free-diagnostic .chk-rubrique h3 span {
        font-size: 10px;
        font-weight: 700;
        color: var(--muted);
      }

      .free-diagnostic .chk-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        font-size: 11px;
        line-height: 1.38;
        color: #334155;
        padding: 3px 0;
      }

      .free-diagnostic .chk-ic {
        flex: 0 0 auto;
        width: 14px;
        height: 14px;
        min-width: 14px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 9px;
        font-weight: 900;
        margin-top: 1px;
      }

      .free-diagnostic .chk-ic.chk-ok { color: var(--green); background: var(--green-soft); }
      .free-diagnostic .chk-ic.chk-warn { color: var(--orange); background: var(--orange-soft); }
      .free-diagnostic .chk-ic.chk-ko { color: var(--red); background: #fef2f2; }
      .free-diagnostic .chk-ic.chk-unknown { color: var(--muted); background: var(--soft); }

      .free-diagnostic .chk-legend {
        margin-top: 7px;
        padding: 6px 10px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--soft);
        color: var(--muted);
        font-size: 10.5px;
      }

      .free-diagnostic .chk-legend .chk-ok { color: var(--green); font-weight: 900; }
      .free-diagnostic .chk-legend .chk-warn { color: var(--orange); font-weight: 900; }
      .free-diagnostic .chk-legend .chk-ko { color: var(--red); font-weight: 900; }
      .free-diagnostic .chk-legend .chk-unknown { color: var(--muted); font-weight: 900; }

      /* — Pages 4/5 : cartes de priorité, reprises de .priority-card/         */
      /*   .priority-kicker/.priority-title/.priority-flow/.priority-step*/   */
      /*   .priority-arrow/.priority-resultat/.priority-time (rendrePriorite()). */
      .free-diagnostic .priority-list {
        display: grid;
        gap: 8px;
      }

      /* Valeurs par défaut = historique .page-priorites (page 4, 2 cartes). */
      /* .page-benefits (page 5, 1 carte) reçoit les valeurs plus généreuses */
      /* de l'historique .page-plan un peu plus bas.                        */
      .free-diagnostic .priority-card {
        border: 1px solid var(--line);
        background: var(--white);
        border-radius: 16px;
        padding: 10px 14px;
        margin-top: 4px;
      }

      .free-diagnostic .page-benefits .priority-card {
        padding: 14px 16px;
        margin-top: 6px;
      }

      .free-diagnostic .priority-card-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        margin-bottom: 6px;
      }

      .free-diagnostic .page-benefits .priority-card-head {
        margin-bottom: 10px;
      }

      .free-diagnostic .priority-kicker {
        display: inline-flex;
        border-radius: 999px;
        background: var(--blue-soft);
        color: var(--blue);
        border: 1px solid #dce8fa;
        padding: 4px 10px;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .free-diagnostic .priority-kicker--impact {
        background: var(--soft);
        color: var(--muted);
        border-color: var(--line);
      }

      .free-diagnostic .priority-title {
        margin: 0 0 3px;
        font-size: 17px;
        font-weight: 850;
        line-height: 1.2;
        letter-spacing: -0.02em;
        color: var(--ink);
      }

      .free-diagnostic .page-benefits .priority-title {
        margin: 0 0 6px;
      }

      .free-diagnostic .priority-flow {
        display: grid;
        gap: 3px;
      }

      .free-diagnostic .priority-step {
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 7px 11px;
        background: #fbfcfe;
      }

      .free-diagnostic .page-benefits .priority-step {
        padding: 9px 12px;
      }

      .free-diagnostic .priority-step--observation {
        background: var(--blue-soft);
        border-left: 4px solid var(--blue);
      }

      .free-diagnostic .priority-step--action {
        background: var(--green-soft);
        border-left: 4px solid var(--green);
      }

      .free-diagnostic .priority-step-label {
        font-size: 9.5px;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 3px;
      }

      .free-diagnostic .page-benefits .priority-step-label {
        margin-bottom: 4px;
      }

      .free-diagnostic .priority-step--observation .priority-step-label { color: var(--blue); }
      .free-diagnostic .priority-step--action .priority-step-label { color: var(--green); }

      .free-diagnostic .priority-step p {
        margin: 0;
        font-size: 11.5px;
        line-height: 1.38;
        color: #44546a;
      }

      .free-diagnostic .page-benefits .priority-step p {
        line-height: 1.45;
      }

      .free-diagnostic .priority-step--action p { color: var(--ink); font-weight: 700; }

      .free-diagnostic .priority-arrow {
        display: flex;
        justify-content: center;
        color: #b9c6d8;
        font-weight: 700;
        padding: 0;
      }

      .free-diagnostic .page-benefits .priority-arrow {
        padding: 1px 0;
      }

      .free-diagnostic .priority-resultat {
        margin: 4px 0 0;
        font-size: 10.5px;
        line-height: 1.38;
        color: #44546a;
        font-weight: 500;
      }

      .free-diagnostic .page-benefits .priority-resultat {
        margin-top: 5px;
        line-height: 1.45;
      }

      .free-diagnostic .priority-resultat b { color: var(--ink); font-weight: 800; }

      .free-diagnostic .priority-time {
        display: block;
        margin-top: 4px;
        color: var(--muted);
        font-size: 9.5px;
        font-weight: 700;
      }

      .free-diagnostic .page-benefits .priority-time {
        margin-top: 6px;
      }

      /* — Page 5 : bénéfices + rappel des limites, repris de .benefit-grid/  */
      /*   .benefit-card et .paid-audit-box/.teaser-grid/.teaser-more.        */
      .free-diagnostic .section-h2 {
        margin: 12px 0 5px;
        font-size: 15px;
      }

      .free-diagnostic .benefit-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-top: 8px;
      }

      .free-diagnostic .benefit-card {
        border: 1px solid var(--line);
        background: #fbfcfe;
        border-radius: 12px;
        padding: 12px 14px;
        font-size: 11px;
        color: #5b6b81;
        line-height: 1.4;
      }

      .free-diagnostic .benefit-card b {
        display: flex;
        gap: 6px;
        align-items: center;
        color: var(--ink);
        font-size: 12px;
        margin-bottom: 4px;
      }

      .free-diagnostic .benefit-card b svg { color: var(--blue); flex: 0 0 auto; }

      .free-diagnostic .paid-audit-box {
        margin-top: 11px;
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: linear-gradient(180deg, #fbfdff, #f4f8fe);
        color: #44546a;
        font-size: 11.5px;
        line-height: 1.5;
      }

      .free-diagnostic .paid-audit-box h3 {
        font-size: 13.5px;
        color: var(--ink);
        margin-bottom: 7px;
      }

      .free-diagnostic .teaser-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 5px 18px;
        margin-top: 8px;
      }

      .free-diagnostic .teaser-grid span {
        display: flex;
        gap: 6px;
        align-items: baseline;
        font-size: 10.5px;
        color: #44546a;
      }

      .free-diagnostic .teaser-grid span::before {
        content: "✓";
        color: var(--green);
        font-weight: 900;
        font-size: 9px;
      }

      .free-diagnostic .teaser-more {
        margin-top: 8px;
        font-size: 10.5px;
        font-style: italic;
        color: var(--muted);
      }

      /* — Page 6 : projection + offres, reprises de .projection-grid/       */
      /*   .proj-col/.proj-fleche et .offer-grid/.offer-card.                 */
      .free-diagnostic .projection-grid {
        display: grid;
        grid-template-columns: 1fr 50px 1fr;
        align-items: center;
        gap: 12px;
        margin-top: 7px;
        padding: 8px;
        border: 1px solid var(--line);
        border-radius: 13px;
        background: var(--green-soft);
      }

      .free-diagnostic .proj-col { text-align: center; }

      .free-diagnostic .proj-col span {
        display: block;
        color: var(--muted);
        font-size: 10.5px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .free-diagnostic .proj-col strong {
        display: block;
        margin-top: 6px;
        font-size: 26px;
        letter-spacing: -0.03em;
      }

      .free-diagnostic .proj-fleche {
        display: flex;
        justify-content: center;
        color: var(--green);
      }

      .free-diagnostic .choice-note {
        margin-top: 5px;
        padding: 6px 10px;
        border: 1px solid var(--line);
        background: #fbfcfe;
        border-radius: 12px;
        text-align: center;
        color: #44546a;
        font-size: 11.5px;
        font-weight: 700;
      }

      .free-diagnostic .offer-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 5px;
      }

      .free-diagnostic .offer-card {
        padding: 12px 13px;
      }

      .free-diagnostic .offer-recommended {
        border-color: var(--blue);
        box-shadow: 0 18px 54px rgba(37, 99, 235, 0.12);
      }

      .free-diagnostic .offer-badge {
        display: inline-flex;
        padding: 4px 10px;
        border-radius: 999px;
        background: var(--blue-soft);
        color: var(--blue);
        font-size: 10px;
        font-weight: 850;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .free-diagnostic .offer-card h3 {
        margin-top: 5px;
        font-size: 17px;
      }

      .free-diagnostic .offer-price {
        margin-top: 4px;
        font-size: 26px;
        font-weight: 900;
        letter-spacing: -0.03em;
        color: var(--ink);
      }

      .free-diagnostic .offer-features {
        display: grid;
        gap: 6px;
        margin: 8px 0 0;
        padding: 0;
        list-style: none;
      }

      .free-diagnostic .offer-features li {
        display: flex;
        gap: 8px;
        align-items: center;
        color: #26364f;
        font-size: 11px;
        font-weight: 700;
      }

      .free-diagnostic .offer-features svg { color: var(--blue); flex: 0 0 auto; }

      .free-diagnostic .offer-cta {
        margin-top: 8px;
        padding: 7px 14px;
        border-radius: 12px;
        background: var(--blue);
        color: #ffffff;
        text-align: center;
        font-size: 11.5px;
        font-weight: 850;
      }

      .free-diagnostic .bloc-item {
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 11px 14px;
        background: var(--white);
      }

      .free-diagnostic .bloc-item .t { font-weight: 800; font-size: 12px; color: var(--ink); }
      .free-diagnostic .bloc-item .d { color: #5b6b81; font-size: 11.5px; margin-top: 4px; line-height: 1.5; }

      @media (max-width: 900px) {
        .page {
          width: min(100% - 24px, 760px);
          min-height: auto;
          padding: 28px;
          border-radius: 24px;
        }

        .doc-footer {
          position: static;
          margin-top: 38px;
        }

        .cover-grid,
        .cover-bottom,
        .split-grid,
        .card-grid,
        .priority-card,
        .action-content dl,
        .index-row,
        .offer-grid,
        .pack-grid {
          grid-template-columns: 1fr;
        }

        h1 { font-size: 42px; }
        h2 { font-size: 28px; }

        .free-diagnostic .page {
          width: 100%;
          height: auto;
        }

        .free-diagnostic .score-hero,
        .free-diagnostic .chk-grid,
        .free-diagnostic .benefit-grid,
        .free-diagnostic .projection-grid,
        .free-diagnostic .offer-grid {
          grid-template-columns: 1fr;
        }
      }

      @page {
        size: A4;
        margin: 12mm;
      }

      @media print {
        body {
          background: #ffffff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .page {
          width: 100%;
          min-height: calc(297mm - 24mm);
          margin: 0;
          padding: 12mm 12mm 24mm;
          border: 0;
          border-radius: 0;
          box-shadow: none;
          page-break-after: always;
          break-after: page;
        }

        /* Cause réelle des 11 pages physiques au lieu de 6 : la règle @page   */
        /* ci-dessous (margin: 12mm, partagée avec le premium, non modifiée)   */
        /* réduit la zone imprimable à 297mm − 24mm = 273mm. La règle de base  */
        /* ci-dessus fixe .free-diagnostic .page à 297mm plein — un feuillet   */
        /* qui ne tient donc jamais dans la zone imprimable réelle, d'où le    */
        /* débordement sur une seconde feuille à CHAQUE page logique. Le       */
        /* premium n'a pas ce problème : son .page d'impression utilise déjà   */
        /* min-height: calc(297mm - 24mm). On applique la même compensation    */
        /* ici, sans toucher à @page (partagé) ni à la règle premium.          */
        .free-diagnostic .page {
          height: calc(297mm - 24mm);
          max-height: calc(297mm - 24mm);
          margin: 0;
          border: none;
          border-radius: 0;
          box-shadow: none;
          page-break-after: always;
          break-after: page;
          /* Explicite en print : la base écran passe désormais à overflow:   */
          /* visible (sécurité de dev pour inspecter les débordements), donc  */
          /* ce blocage doit être réaffirmé ici pour l'impression/PDF.        */
          overflow: hidden;
        }

        .page:last-child {
          page-break-after: auto;
          break-after: auto;
        }

        /* La couverture Premium peut exceptionnellement occuper deux
           feuilles physiques. Son break-after explicite ajoutait alors une
           troisième feuille vide dans Chromium. Sa min-height conserve le
           saut naturel lorsqu'elle tient sur une page. */
        .report-shell:not(.free-diagnostic) .cover-page {
          page-break-after: auto;
          break-after: auto;
        }
        .report-shell:not(.free-diagnostic) .axes-page .section-intro { padding-top: 16px; padding-bottom: 8px; }
        .report-shell:not(.free-diagnostic) .axes-page .domain-row { padding: 5px 0; }
        .report-shell:not(.free-diagnostic) .axes-page .doc-footer { bottom: 8mm; }

        .priority-card,
        .insight-card,
        .action-card,
        .method-card,
        .hero-card,
        .score-card,
        .index-card,
        .criteria-domain-card,
        .offer-card,
        .summary-recap-card,
        .pack-card,
        .deductible-callout,
        .priority-grid div,
        .free-diagnostic .barre-cat,
        .free-diagnostic .chk-rubrique,
        .free-diagnostic .meaning-box,
        .free-diagnostic .priority-card,
        .free-diagnostic .priority-step,
        .free-diagnostic .paid-audit-box,
        .free-diagnostic .projection-grid,
        .free-diagnostic .benefit-card {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .free-diagnostic h1,
        .free-diagnostic h2,
        .free-diagnostic h3 {
          break-after: avoid;
          page-break-after: avoid;
        }

        /* Sprint 4 (consolidation) — objectif 5 : les blocs ajoutés depuis les
           sprints 1/2B/3 (comparaison visuelle, score par domaine, feuille de
           route) n'avaient pas encore les mêmes garde-fous d'impression que
           les cartes ci-dessus. Additif uniquement, mêmes propriétés déjà
           utilisées plus haut — aucune charte, couleur ou police modifiée. */
        .comparison-card,
        .domain-row,
        .roadmap-item {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        /* Premium Polish — objectif 7 : "Pourquoi c'est important" et
           "Preuve" (désormais chacun un bloc pleine largeur, cf.
           .priority-block) ne doivent jamais être coupés en deux entre le
           label et le texte, ni entre deux pages. */
        .priority-constat,
        .priority-block {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        /* Un sous-titre d'horizon du plan d'action ou de la feuille de route
           ne doit jamais se retrouver seul en bas de page, séparé de sa
           première action. */
        .action-horizon,
        .roadmap-horizon {
          break-after: avoid;
          page-break-after: avoid;
        }

        /* Même protection anti-titre-orphelin que le Diagnostic gratuit
           (ci-dessus), appliquée au premium uniquement — :not(.free-diagnostic)
           garantit qu'aucune règle du Diagnostic gratuit n'est modifiée ici. */
        .report-shell:not(.free-diagnostic) h2,
        .report-shell:not(.free-diagnostic) h3 {
          break-after: avoid;
          page-break-after: avoid;
        }

        .report-shell:not(.free-diagnostic) p {
          orphans: 3;
          widows: 3;
        }

        .doc-footer {
          position: absolute;
          left: 12mm;
          right: 12mm;
          bottom: 8mm;
        }

        .free-diagnostic .doc-footer {
          left: 8mm;
          right: 8mm;
          bottom: 4mm;
        }
      }
    </style>
  `;
}
