const analysisId = document.body.dataset.analysisId;
const observationBox = document.querySelector("[data-review-observation]");
const competitorsBox = document.querySelector("[data-review-competitors]");
const competitorsSummaryBox = document.querySelector("[data-competitors-summary]");
const form = document.querySelector("[data-review-form]");
const submitButton = document.querySelector("[data-review-submit]");
const approveButton = document.querySelector("[data-approve-button]");
const previewLink = document.querySelector("[data-preview-link]");
const pdfLink = document.querySelector("[data-pdf-link]");
const legacyGeneratorLink = document.querySelector("[data-legacy-generator-link]");
const statusBox = document.querySelector("[data-review-status]");
const criteriaGroupsBox = document.querySelector("[data-criteria-groups]");
const criteriaSummaryBox = document.querySelector("[data-criteria-summary]");
const criteriaNotVerifiedSummaryBox = document.querySelector("[data-criteria-not-verified-summary]");
const fillUnknownButton = document.querySelector("[data-fill-unknown]");
const executionEditor = document.querySelector("[data-execution-editor]");
const executionPending = document.querySelector("[data-execution-pending]");
const logoutButtons = document.querySelectorAll("[data-admin-logout]");

let currentAnalysis = null;
let currentCriteriaGroups = null;
let currentPrefillCriteria = new Map();

const REPORT_TYPE_LABELS = {
  free: "Diagnostic gratuit",
  premium: "Audit Premium 99 €",
};

const CRITERIA_VALUES = new Set(["compliant", "partial", "deficient", "not_verified"]);

// Questions conditionnelles : une sous-question n'a de sens que si la
// question parente a une réponse précise. Elle est retirée complètement de
// l'affichage (pas seulement désactivée) quand la valeur du parent est dans
// "hideWhen" — mais son input reste dans le DOM (donc sa valeur n'est ni
// perdue ni resoumise différemment) afin qu'elle soit restaurée telle quelle
// si l'utilisateur change à nouveau la réponse parente. Purement visuel :
// aucun impact sur le calcul du score ni sur les 29 critères eux-mêmes.
const CRITERIA_DEPENDENCIES = [
  // Avis : seul "Aucune réponse" (Rarement / jamais) rend la question sur la
  // qualité des réponses sans objet. "Réponses irrégulières" (Une partie) et
  // "Non vérifié" doivent au contraire afficher la sous-question (une partie
  // des avis a des réponses à qualifier, ou une vérification manuelle reste
  // à faire).
  { parent: "tauxReponseAvis", child: "qualiteReponsesAvis", hideWhen: ["deficient"] },
  // Description : "Absente" (Vide) -> la question sur la qualité du contenu
  // de la description n'a plus de sens.
  { parent: "descriptionRemplie", child: "descriptionQualite", hideWhen: ["deficient"] },
  // Services / produits : "Non" -> la question sur la qualité de leur
  // description n'a plus de sens.
  { parent: "servicesPresents", child: "servicesDecrits", hideWhen: ["deficient"] },
  // Publications : "Plus ancien ou jamais" (plus de 3 mois / jamais) -> la
  // question sur le rythme de publication n'a plus de sens.
  { parent: "publicationRecente", child: "rythmePublication", hideWhen: ["deficient"] },
];

const REVIEW_CRITERIA_GROUPS = [
  {
    category: "Informations essentielles",
    points: 22,
    criteria: [
      {
        key: "revendiquee",
        question: "La fiche est-elle revendiquée et vérifiée ?",
        help: "Ouvrir la fiche sur Maps : une fiche non revendiquée affiche parfois une mention de propriété.",
        options: [
          ["compliant", "Oui"],
          ["deficient", "Non ou mention visible"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "categoriePrincipale",
        question: "La catégorie principale est-elle précise et pertinente ?",
        help: "Exemple : Boulangerie plutôt que Magasin.",
        options: [
          ["compliant", "Précise"],
          ["partial", "Approximative"],
          ["deficient", "Inadaptée ou générique"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "categoriesSecondaires",
        question: "Des catégories secondaires pertinentes sont-elles définies ?",
        help: "Comparer avec les fiches concurrentes les mieux positionnées.",
        options: [
          ["compliant", "Oui"],
          ["deficient", "Non ou incomplètes"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "horaires",
        question: "Les horaires sont-ils complets, jours fériés inclus ?",
        help: "Vérifier aussi les horaires spéciaux à venir.",
        options: [
          ["compliant", "Complets"],
          ["partial", "Partiels"],
          ["deficient", "Absents ou faux"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "contact",
        question: "Téléphone et site web sont-ils présents et corrects ?",
        help: "Tester le clic téléphone et l’ouverture du site si disponible.",
        options: [
          ["compliant", "Présents et corrects"],
          ["partial", "Partiels"],
          ["deficient", "Absents ou incorrects"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "adresse",
        question: "L’adresse et la zone desservie sont-elles cohérentes ?",
        help: "La localisation doit correspondre à l’activité et à la ville ciblée.",
        options: [
          ["compliant", "Cohérentes"],
          ["partial", "À préciser"],
          ["deficient", "Incohérentes"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "attributs",
        question: "Les attributs utiles sont-ils renseignés ?",
        help: "Accessibilité, services, options de contact ou informations spécifiques au métier.",
        options: [
          ["compliant", "Bien renseignés"],
          ["partial", "Partiels"],
          ["deficient", "Absents"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "nap",
        question: "Le nom, l’adresse et le téléphone semblent-ils cohérents ?",
        help: "Repérer les variantes évidentes ou informations contradictoires.",
        options: [
          ["compliant", "Cohérents"],
          ["partial", "À contrôler"],
          ["deficient", "Incohérents"],
          ["not_verified", "Non vérifié"],
        ],
      },
    ],
  },
  {
    category: "Photos et visuels",
    points: 12,
    criteria: [
      {
        key: "logoCouverture",
        question: "Le logo et la photo de couverture sont-ils valorisants ?",
        help: "Vérification visuelle obligatoire.",
        options: [
          ["compliant", "Valorisants"],
          ["partial", "Corrects"],
          ["deficient", "Absents ou faibles"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "nombrePhotos",
        question: "La fiche compte-t-elle au moins 10 photos ?",
        help: "Le volume seul ne suffit pas, mais il donne un premier signal de preuve visuelle.",
        options: [
          ["compliant", "10 et plus"],
          ["partial", "5 à 9"],
          ["deficient", "Moins de 5"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "photoRecente",
        question: "Une photo récente a-t-elle été ajoutée ?",
        help: "Une galerie récente montre que l’entreprise est active aujourd’hui.",
        options: [
          ["compliant", "3 mois ou moins"],
          ["partial", "3 à 6 mois"],
          ["deficient", "Plus de 6 mois"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "varietePhotos",
        question: "Les photos montrent-elles plusieurs aspects de l’activité ?",
        help: "Lieu, équipe, réalisations, produits, équipements ou contexte client.",
        options: [
          ["compliant", "Variées"],
          ["partial", "Peu variées"],
          ["deficient", "Très limitées"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "qualitePhotos",
        question: "Les photos donnent-elles une impression professionnelle ?",
        help: "Utiliser la mini check-list pour limiter la subjectivité.",
        checklist: [
          "Photos nettes",
          "Bonne luminosité",
          "Bon cadrage",
          "Résolution suffisante",
          "Absence de texte ou filigrane",
        ],
        options: [
          ["compliant", "Professionnelles"],
          ["partial", "Correctes"],
          ["deficient", "Faibles"],
          ["not_verified", "Non vérifié"],
        ],
      },
    ],
  },
  {
    category: "Avis clients",
    points: 18,
    criteria: [
      {
        key: "noteMoyenne",
        question: "La note moyenne est-elle rassurante ?",
        help: "Comparer la note à la moyenne des concurrents observés.",
        options: [
          ["compliant", "Très rassurante"],
          ["partial", "Correcte"],
          ["deficient", "À renforcer"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "volumeAvis",
        question: "Le volume d’avis est-il suffisant pour rassurer ?",
        help: "Comparer le nombre d’avis à la moyenne observée dans la zone.",
        options: [
          ["compliant", "Suffisant"],
          ["partial", "Moyen"],
          ["deficient", "Faible"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "recenceAvis",
        question: "Les avis récents montrent-ils une activité actuelle ?",
        help: "Vérifier si les derniers avis sont suffisamment récents.",
        options: [
          ["compliant", "Récents"],
          ["partial", "À surveiller"],
          ["deficient", "Trop anciens"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "tauxReponseAvis",
        question: "Les avis reçoivent-ils des réponses régulières ?",
        help: "Ne confirmer que si un taux ou une observation fiable existe.",
        options: [
          ["compliant", "Réponses régulières"],
          ["partial", "Réponses irrégulières"],
          ["deficient", "Aucune réponse"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "qualiteReponsesAvis",
        question: "Les réponses aux avis sont-elles professionnelles ?",
        help: "Vérification utile uniquement si des réponses existent.",
        checklist: [
          "Réponse personnalisée",
          "Ton professionnel",
          "Réponse utile",
          "Mention du contexte client",
          "Aucune réponse automatique visible",
        ],
        options: [
          ["compliant", "Solides"],
          ["partial", "Correctes"],
          ["deficient", "Faibles"],
          ["not_verified", "Non vérifié"],
        ],
      },
    ],
  },
  {
    category: "Contenu de la fiche",
    points: 20,
    criteria: [
      {
        key: "descriptionRemplie",
        question: "La description est-elle présente et suffisamment développée ?",
        help: "Une description à 0 caractère doit rester considérée comme absente.",
        options: [
          ["compliant", "Présente et développée"],
          ["partial", "Trop courte"],
          ["deficient", "Absente"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "descriptionQualite",
        question: "La description explique-t-elle clairement pourquoi choisir l’entreprise ?",
        help: "Utiliser la mini check-list pour éviter une appréciation trop subjective.",
        checklist: [
          "Ville ou zone mentionnée",
          "Services principaux clairs",
          "Différenciants visibles",
          "Texte lisible",
          "Appel à l’action naturel",
        ],
        options: [
          ["compliant", "Claire et convaincante"],
          ["partial", "Correcte"],
          ["deficient", "À revoir"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "servicesPresents",
        question: "Les services principaux sont-ils listés ?",
        help: "Vérifier que les services importants apparaissent dans la fiche.",
        options: [
          ["compliant", "Oui"],
          ["partial", "Partiellement"],
          ["deficient", "Non"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "servicesDecrits",
        question: "Les services sont-ils correctement décrits ?",
        help: "Un service listé sans contexte aide moins le prospect à décider.",
        options: [
          ["compliant", "Bien décrits"],
          ["partial", "Descriptions courtes"],
          ["deficient", "Non décrits"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "questionsReponses",
        question: "La fiche répond-elle aux questions fréquentes avant le contact ?",
        help: "Vérifier les questions-réponses, services, attributs et informations utiles.",
        options: [
          ["compliant", "Oui"],
          ["partial", "Partiellement"],
          ["deficient", "Non"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "liensAction",
        question: "Les liens d’action sont-ils présents et utiles ?",
        help: "Site web, itinéraire, appel, prise de rendez-vous ou action adaptée au métier.",
        options: [
          ["compliant", "Présents"],
          ["partial", "Partiels"],
          ["deficient", "Manquants"],
          ["not_verified", "Non vérifié"],
        ],
      },
    ],
  },
  {
    category: "Activité et animation",
    points: 10,
    criteria: [
      {
        key: "publicationRecente",
        question: "Une publication Google récente est-elle visible ?",
        help: "Ce critère reste secondaire, mais il peut montrer une fiche active.",
        options: [
          ["compliant", "30 jours ou moins"],
          ["partial", "Jusqu’à 90 jours"],
          ["deficient", "Plus ancien ou jamais"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "rythmePublication",
        question: "La fiche montre-t-elle un rythme d’animation cohérent ?",
        help: "Ne pas pénaliser fortement si ce point n’est pas vérifiable.",
        options: [
          ["compliant", "Régulier"],
          ["partial", "Irrégulier"],
          ["deficient", "Absent"],
          ["not_verified", "Non vérifié"],
        ],
      },
    ],
  },
  {
    category: "Visibilité locale",
    points: 18,
    criteria: [
      {
        key: "classementLocal",
        question: "La fiche apparaît-elle dans les premiers résultats de la recherche testée ?",
        help: "Utiliser la position observée uniquement si la requête et la ville sont confirmées.",
        options: [
          ["compliant", "Top 3"],
          ["partial", "Positions 4 à 10"],
          ["deficient", "Absente ou au-delà"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "attractiviteConcurrents",
        question: "La fiche paraît-elle aussi attractive que les concurrents observés ?",
        help: "Comparer la preuve visible : avis, photos, présentation, clarté.",
        options: [
          ["compliant", "Avantage"],
          ["partial", "Comparable"],
          ["deficient", "En retrait"],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "recherchesSpecifiques",
        question: "La fiche est-elle adaptée aux recherches spécifiques du métier ?",
        help: "Services, catégories et description doivent aider Google à comprendre quand l’afficher.",
        options: [
          ["compliant", "Bien adaptée"],
          ["partial", "À renforcer"],
          ["deficient", "Peu adaptée"],
          ["not_verified", "Non vérifié"],
        ],
      },
    ],
  },
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function display(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function setStatus(message = "", type = "") {
  if (!statusBox) return;
  statusBox.textContent = message;
  statusBox.classList.toggle("is-error", type === "error");
  statusBox.classList.toggle("is-ok", type === "ok");
}

function redirectToLogin() {
  window.location.href = "/admin-login";
}

function reportTypeLabel(value) {
  return REPORT_TYPE_LABELS[value] || REPORT_TYPE_LABELS.premium;
}

function getCriteriaGroups() {
  return Array.isArray(currentCriteriaGroups) && currentCriteriaGroups.length
    ? currentCriteriaGroups
    : REVIEW_CRITERIA_GROUPS;
}

function getGroupLabel(group) {
  return group.label || group.category || group.cat || "";
}

function getGroupPoints(group) {
  return group.points ?? group.pts ?? "";
}

function getGroupCriteria(group) {
  return group.criteria || group.criteres || [];
}

function getCriterionQuestion(criterion) {
  return criterion.question || criterion.q || "";
}

function getCriterionHelp(criterion) {
  return criterion.help || criterion.aide || "";
}

function getCriterionChecklist(criterion) {
  return Array.isArray(criterion.checklist) ? criterion.checklist : [];
}

function integerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeCriterionOptions(criterion) {
  const options = criterion.options || criterion.opts || [];
  return options.map((option, index) => {
    if (Array.isArray(option)) {
      const [first, second, third] = option;
      if (CRITERIA_VALUES.has(first)) {
        return {
          value: first,
          label: second,
          points: third ?? null,
          index,
        };
      }

      return {
        value: index === 0 ? "compliant" : (index === options.length - 1 ? "deficient" : "partial"),
        label: first,
        points: second ?? null,
        index,
      };
    }

    return {
      value: option.value,
      label: option.label,
      points: option.points ?? null,
      index: option.index ?? index,
    };
  }).filter((option) => option.value && option.label);
}

function setCriteriaCatalog(analysis) {
  currentCriteriaGroups = Array.isArray(analysis?.scoreCatalog?.categories)
    ? analysis.scoreCatalog.categories
    : null;
  currentPrefillCriteria = new Map((analysis?.scorePrefill?.criteria || [])
    .filter((item) => item?.key)
    .map((item) => [item.key, item]));
}

function renderCriteriaReview() {
  if (!criteriaGroupsBox) return;

  criteriaGroupsBox.innerHTML = getCriteriaGroups().map((group) => `
    <section class="criteria-category">
      <div class="criteria-category__head">
        <h3>${escapeHtml(getGroupLabel(group))}</h3>
        <span>${escapeHtml(getGroupPoints(group))} points</span>
      </div>
      ${getGroupCriteria(group).map((criterion) => {
        const checklist = getCriterionChecklist(criterion);
        return `
        <article class="criteria-item" data-criteria-key="${escapeHtml(criterion.key)}">
          <div class="criteria-item__collapse">
            <div class="criteria-item__collapse-inner">
              <div class="criteria-item__question">
                ${escapeHtml(getCriterionQuestion(criterion))}
                <span class="criteria-not-verified-badge" data-not-verified-badge hidden>À vérifier manuellement</span>
              </div>
              <div class="criteria-item__help">${escapeHtml(getCriterionHelp(criterion))}</div>
              ${checklist.length ? `
                <div class="criteria-checklist">
                  <div class="criteria-checklist-title">Mini check-list interne</div>
                  ${checklist.map((item) => `
                    <label>
                      <input type="checkbox" data-criteria-checklist="${escapeHtml(criterion.key)}" value="${escapeHtml(item)}">
                      ${escapeHtml(item)}
                    </label>
                  `).join("")}
                </div>
              ` : ""}
              <div class="criteria-options">
                ${normalizeCriterionOptions(criterion).map((option) => `
                  <label class="criteria-option">
                    <input
                      type="radio"
                      name="criterion:${escapeHtml(criterion.key)}"
                      value="${escapeHtml(option.value)}"
                      data-criteria-option="${escapeHtml(criterion.key)}"
                      data-option-index="${escapeHtml(option.index)}"
                      data-option-label="${escapeHtml(option.label)}"
                      data-option-points="${escapeHtml(option.points ?? "")}"
                    >
                    <span>${escapeHtml(option.label)}</span>
                  </label>
                `).join("")}
              </div>
            </div>
          </div>
        </article>
      `; }).join("")}
    </section>
  `).join("");

  criteriaGroupsBox.onchange = updateCriteriaSummary;
  updateCriteriaSummary();
}

function findCriterionDefinition(key) {
  for (const group of getCriteriaGroups()) {
    const criterion = getGroupCriteria(group).find((item) => item.key === key);
    if (criterion) return { group, criterion };
  }
  return null;
}

function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined && String(item).trim());
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function hasMeaningfulValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function getNormalizedValue(normalized, keys) {
  for (const key of keys) {
    if (hasMeaningfulValue(normalized?.[key])) return normalized[key];
  }
  return null;
}

function hasNormalizedKey(normalized, keys) {
  if (!normalized || typeof normalized !== "object") return false;
  return keys.some((key) => Object.prototype.hasOwnProperty.call(normalized, key));
}

function getSecondaryCategories(normalized) {
  const secondary = [
    ...asArray(normalized?.secondary_categories),
    ...asArray(normalized?.subtypes),
    ...asArray(normalized?.categories),
  ];
  return [...new Set(secondary)];
}

function getServices(normalized) {
  const value = getNormalizedValue(normalized, ["services", "service_options", "service_list"]);
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return asArray(value);
  return null;
}

function labelForCriterionValue(criterion, value, selectedOptionIndex = null) {
  const options = normalizeCriterionOptions(criterion);
  if (selectedOptionIndex !== null) {
    const selected = options.find((option) => option.index === selectedOptionIndex);
    if (selected) return selected.label;
  }
  return options.find((option) => option.value === value)?.label || "Non vérifié";
}

function createCriterionReview(key, value, checklist = [], extra = {}) {
  const definition = findCriterionDefinition(key);
  if (!definition || !CRITERIA_VALUES.has(value)) return null;
  const selectedOptionIndex = integerOrNull(extra.selectedOptionIndex);
  return {
    key,
    category: getGroupLabel(definition.group),
    question: getCriterionQuestion(definition.criterion),
    value,
    label: labelForCriterionValue(definition.criterion, value, selectedOptionIndex),
    checklist,
    selectedOptionIndex,
    points: numberOrNull(extra.points),
    source: extra.source || null,
    evidence: extra.evidence || null,
  };
}

function measuredPhotoStatus(photosCount) {
  const photos = asNumber(photosCount);
  if (photos === null) return "not_verified";
  // Seuils historiques : ≥10 = suffisant, ≥3 = moyen, <3 = insuffisant.
  if (photos >= 10) return "compliant";
  if (photos >= 3) return "partial";
  return "deficient";
}

function measuredRatingStatus(rating) {
  const value = asNumber(rating);
  if (value === null) return "not_verified";
  // Seuils historiques absolus : ≥4,5 / ≥4,0 / <4,0 (pas de tolérance concurrentielle ici).
  if (value >= 4.5) return "compliant";
  if (value >= 4) return "partial";
  return "deficient";
}

function measuredReviewsStatus(reviews, avgReviews) {
  const value = asNumber(reviews);
  const average = asNumber(avgReviews);
  if (value === null) return "not_verified";
  if (average !== null && average > 0) {
    if (value >= average * 0.9) return "compliant";
    if (value >= average * 0.5) return "partial";
    return "deficient";
  }
  if (value >= 30) return "compliant";
  if (value >= 10) return "partial";
  return "deficient";
}

function measuredDescriptionStatus(descriptionLength) {
  const length = asNumber(descriptionLength);
  if (length === null) return "not_verified";
  // Seuils historiques : ≥600 = complète, >0 = courte, 0 = vide (Absente).
  if (length >= 600) return "compliant";
  if (length > 0) return "partial";
  return "deficient";
}

function measuredPositionStatus(position) {
  const value = asNumber(position);
  if (value === null) return "not_verified";
  if (value >= 1 && value <= 3) return "compliant";
  if (value >= 4 && value <= 10) return "partial";
  return "deficient";
}

function measuredAttractivenessStatus(benchmark, competitors) {
  const competitorCount = Array.isArray(competitors) ? competitors.length : 0;
  if (!competitorCount) return "not_verified";
  const gaps = benchmark?.gaps || {};
  const ratingGap = asNumber(gaps.rating);
  const reviewsGap = asNumber(gaps.reviews);
  const photosGap = asNumber(gaps.photos);
  const observed = [ratingGap, reviewsGap, photosGap].filter((value) => value !== null);
  if (!observed.length) return "not_verified";

  let positiveSignals = 0;
  if (ratingGap !== null && ratingGap >= -0.1) positiveSignals += 1;
  if (reviewsGap !== null && reviewsGap >= 0) positiveSignals += 1;
  if (photosGap !== null && photosGap >= 0) positiveSignals += 1;

  if (positiveSignals >= 2) return "compliant";
  if (positiveSignals === 1) return "partial";
  return "deficient";
}

function buildAutoCriteriaReview(analysis) {
  const business = analysis.business || {};
  const normalized = business.normalized || {};
  const benchmark = analysis.benchmark || {};
  const competitors = Array.isArray(business.competitors) ? business.competitors : [];
  const reviews = [];
  const add = (key, value, checklist) => {
    const item = createCriterionReview(key, value, checklist);
    if (item) reviews.push(item);
  };

  // Même garde qu'en tête de fichier (buildObservationRows) : "activity" ne
  // doit jamais être traité comme une catégorie valide s'il s'agit en fait
  // du nom de l'entreprise (analyses enregistrées avant le correctif).
  const businessNameForCategoryGuard = (business.name || business.nom || "").trim().toLowerCase();
  const storedActivity = (business.activity || "").trim();
  const activityAsCategory = storedActivity && storedActivity.toLowerCase() !== businessNameForCategoryGuard
    ? storedActivity
    : "";
  const primaryCategory = getNormalizedValue(normalized, ["category", "type"]) || activityAsCategory;
  const secondaryCategories = getSecondaryCategories(normalized);
  const workingHours = getNormalizedValue(normalized, ["working_hours", "hours"]);
  const website = getNormalizedValue(normalized, ["website", "site"]);
  const phone = getNormalizedValue(normalized, ["phone", "phone_number"]);
  const contactWasObserved = hasNormalizedKey(normalized, ["website", "site", "phone", "phone_number"]);
  const address = getNormalizedValue(normalized, ["address", "full_address", "business_address", "street"]);
  const services = getServices(normalized);

  add("categoriePrincipale", primaryCategory ? "compliant" : "not_verified");
  add("categoriesSecondaires", secondaryCategories.length > 1 ? "compliant" : "not_verified");
  add("horaires", workingHours ? "compliant" : "not_verified");
  add("contact", contactWasObserved ? (phone && website ? "compliant" : (phone || website ? "partial" : "deficient")) : "not_verified");
  add("adresse", address ? "compliant" : (business.ville ? "partial" : "not_verified"));
  add("nombrePhotos", measuredPhotoStatus(business.photosCount));
  add("noteMoyenne", measuredRatingStatus(business.rating));
  add("volumeAvis", measuredReviewsStatus(business.reviews, benchmark.averages?.reviews));
  add("descriptionRemplie", measuredDescriptionStatus(business.descriptionLength));
  // Historique : la qualité de la description est une check-list visuelle → manuelle.
  add("descriptionQualite", "not_verified");
  add("servicesPresents", Array.isArray(services) ? (services.length ? "compliant" : "deficient") : "not_verified");
  add("servicesDecrits", "not_verified");
  add("liensAction", contactWasObserved ? (phone && website ? "compliant" : (phone || website ? "partial" : "deficient")) : "not_verified");
  add("classementLocal", measuredPositionStatus(business.localPosition));
  add("attractiviteConcurrents", measuredAttractivenessStatus(benchmark, competitors));
  // Historique : recherches spécifiques = test visuel en navigation privée → manuelle.
  add("recherchesSpecifiques", "not_verified");

  [
    "revendiquee",
    "attributs",
    "nap",
    "logoCouverture",
    "photoRecente",
    "varietePhotos",
    "qualitePhotos",
    "recenceAvis",
    "tauxReponseAvis",
    "qualiteReponsesAvis",
    "questionsReponses",
    "publicationRecente",
    "rythmePublication",
  ].forEach((key) => add(key, "not_verified"));

  return reviews;
}

function fillCriteriaFromAnalysis(analysis) {
  const savedCriteria = new Map((analysis.manualReview?.criteriaReview || [])
    .filter((item) => item?.key)
    .map((item) => [item.key, item]));
  const fallbackAutoCriteria = new Map(buildAutoCriteriaReview(analysis)
    .filter((item) => item?.key)
    .map((item) => [item.key, item]));

  getCriteriaGroups().forEach((group) => {
    getGroupCriteria(group).forEach((criterion) => {
      const saved = savedCriteria.get(criterion.key);
      const auto = currentPrefillCriteria.get(criterion.key) || fallbackAutoCriteria.get(criterion.key);
      const source = saved || auto;
      if (!source) return;

      const value = CRITERIA_VALUES.has(source.value) ? source.value : "not_verified";
      const sourceIndex = integerOrNull(source.selectedOptionIndex);
      const radio = sourceIndex !== null
        ? criteriaGroupsBox?.querySelector(`input[name="criterion:${criterion.key}"][data-option-index="${sourceIndex}"]`)
        : criteriaGroupsBox?.querySelector(`input[name="criterion:${criterion.key}"][value="${value}"]`);
      if (radio) radio.checked = true;

      const checklist = new Set(Array.isArray(saved?.checklist)
        ? saved.checklist
        : (Array.isArray(source.checklist) ? source.checklist : []));
      criteriaGroupsBox?.querySelectorAll(`[data-criteria-checklist="${criterion.key}"]`).forEach((checkbox) => {
        checkbox.checked = checklist.has(checkbox.value);
      });
    });
  });

  updateCriteriaSummary();
}

function collectCriteriaReview() {
  const criteria = [];

  getCriteriaGroups().forEach((group) => {
    getGroupCriteria(group).forEach((criterion) => {
      const selected = criteriaGroupsBox?.querySelector(`input[name="criterion:${criterion.key}"]:checked`);
      const checklist = [...(criteriaGroupsBox?.querySelectorAll(`[data-criteria-checklist="${criterion.key}"]:checked`) || [])]
        .map((input) => input.value);

      if (!selected && !checklist.length) return;

      const value = CRITERIA_VALUES.has(selected?.value) ? selected.value : "not_verified";
      const optionIndex = integerOrNull(selected?.dataset.optionIndex);
      const prefill = currentPrefillCriteria.get(criterion.key);

      criteria.push({
        key: criterion.key,
        category: getGroupLabel(group),
        question: getCriterionQuestion(criterion),
        value,
        label: selected?.dataset.optionLabel || labelForCriterionValue(criterion, value, optionIndex),
        checklist,
        selectedOptionIndex: optionIndex,
        points: numberOrNull(selected?.dataset.optionPoints),
        source: prefill?.source || "manual",
        evidence: prefill?.evidence || null,
      });
    });
  });

  return criteria;
}

// Surbrillance des critères "Non vérifié" : purement visuelle, ne touche ni
// à la valeur du critère ni à son calcul (score inchangé, mêmes 29 critères).
function updateNotVerifiedHighlights() {
  if (!criteriaGroupsBox) return 0;
  let notVerifiedCount = 0;

  criteriaGroupsBox.querySelectorAll("[data-criteria-key]").forEach((item) => {
    const key = item.dataset.criteriaKey;
    const selected = criteriaGroupsBox.querySelector(`input[name="criterion:${key}"]:checked`);
    const isNotVerified = selected?.value === "not_verified";
    item.classList.toggle("is-not-verified", isNotVerified);
    const badge = item.querySelector("[data-not-verified-badge]");
    if (badge) badge.hidden = !isNotVerified;
    if (isNotVerified) notVerifiedCount += 1;
  });

  if (criteriaNotVerifiedSummaryBox) {
    criteriaNotVerifiedSummaryBox.textContent = notVerifiedCount
      ? `${notVerifiedCount} critère${notVerifiedCount > 1 ? "s" : ""} nécessite${notVerifiedCount > 1 ? "nt" : ""} une vérification manuelle`
      : "Aucun critère ne nécessite de vérification manuelle";
    criteriaNotVerifiedSummaryBox.classList.toggle("has-pending", notVerifiedCount > 0);
  }

  return notVerifiedCount;
}

// Applique les règles CRITERIA_DEPENDENCIES : masque/affiche chaque
// sous-question selon la réponse actuellement sélectionnée sur sa question
// parente. La transition douce (150-250 ms) est gérée en CSS via la classe
// "is-dependency-hidden" (voir .criteria-item__collapse) ; ici on ne fait que
// basculer les classes/attributs, jamais la valeur des champs.
function updateCriteriaDependencies() {
  if (!criteriaGroupsBox) return;

  CRITERIA_DEPENDENCIES.forEach(({ parent, child, hideWhen }) => {
    const childItem = criteriaGroupsBox.querySelector(`[data-criteria-key="${child}"]`);
    if (!childItem) return;

    const parentSelected = criteriaGroupsBox.querySelector(`input[name="criterion:${parent}"]:checked`);
    const shouldHide = Boolean(parentSelected) && hideWhen.includes(parentSelected.value);

    childItem.classList.toggle("is-dependency-hidden", shouldHide);
    childItem.toggleAttribute("inert", shouldHide);
    childItem.setAttribute("aria-hidden", shouldHide ? "true" : "false");
  });
}

function updateCriteriaSummary() {
  updateNotVerifiedHighlights();
  updateCriteriaDependencies();
  if (!criteriaSummaryBox) return;
  const total = getCriteriaGroups().reduce((sum, group) => sum + getGroupCriteria(group).length, 0);
  const answered = criteriaGroupsBox?.querySelectorAll("[data-criteria-option]:checked").length || 0;
  const notVerified = criteriaGroupsBox?.querySelectorAll('[data-criteria-option]:checked[value="not_verified"]').length || 0;
  criteriaSummaryBox.textContent = `${answered}/${total} critères renseignés${notVerified ? ` · ${notVerified} non vérifiés` : ""}`;
}

function markUnansweredCriteriaAsNotVerified() {
  getCriteriaGroups().forEach((group) => {
    getGroupCriteria(group).forEach((criterion) => {
      const selected = criteriaGroupsBox?.querySelector(`input[name="criterion:${criterion.key}"]:checked`);
      if (selected) return;
      const fallback = criteriaGroupsBox?.querySelector(`input[name="criterion:${criterion.key}"][value="not_verified"]`);
      if (fallback) fallback.checked = true;
    });
  });
  updateCriteriaSummary();
}

const EXECUTION_STATUS_LABELS = {
  approved: "Approuvé",
  needs_confirmation: "À confirmer avant publication",
  not_applicable: "Non applicable",
};

function executionStatusOptions(selected) {
  return Object.entries(EXECUTION_STATUS_LABELS).map(([value, label]) =>
    `<option value="${value}" ${selected === value ? "selected" : ""}>${escapeHtml(label)}</option>`
  ).join("");
}

function executionItemHtml(group, index, item, valueKey = "text") {
  const value = item?.[valueKey] || item?.text || item?.label || item?.subject || item?.title || "";
  const pending = item?.status === "needs_confirmation";
  const details = group === "photos" ? `<label>Cadrage<textarea data-execution-detail="text">${escapeHtml(item?.text || "")}</textarea></label><label>Objectif<textarea data-execution-detail="objective">${escapeHtml(item?.objective || "")}</textarea></label>` : "";
  return `<div class="execution-editor__item${pending ? " is-pending" : ""}" data-execution-item data-execution-group="${escapeHtml(group)}" data-execution-index="${index}" data-execution-id="${escapeHtml(item?.id || "")}" data-execution-value-key="${escapeHtml(valueKey)}">
    <label>Contenu<textarea data-execution-value>${escapeHtml(value)}</textarea></label>
    ${details}
    <label>Statut<select data-execution-status>${executionStatusOptions(item?.status)}</select></label>
  </div>`;
}

function executionGroupHtml(title, group, items, valueKey = "text") {
  return `<section class="execution-editor__group"><h3>${escapeHtml(title)}</h3>${items.map((item, index) => executionItemHtml(group, index, item, valueKey)).join("")}</section>`;
}

function renderExecutionPlan(analysis) {
  if (!executionEditor) return;
  const plan = analysis.executionPlanDraft;
  if (!plan || analysis.reportType === "free") {
    executionEditor.innerHTML = "<p class=\"admin-muted\">Le plan d’exécution est réservé à l’Audit Premium.</p>";
    if (executionPending) executionPending.textContent = "";
    return;
  }
  const linkItem = { id: "review-link", text: plan.reviews?.reviewLink?.value || "", status: plan.reviews?.reviewLink?.status || "needs_confirmation" };
  executionEditor.innerHTML = [
    executionGroupHtml("Description proposée", "description", [plan.description]),
    executionGroupHtml("Catégories", "categoryItems", plan.profileMap?.categoryItems || [], "label"),
    executionGroupHtml("Services et prestations", "serviceItems", plan.profileMap?.serviceItems || [], "label"),
    executionGroupHtml("Photos du mois", "photos", plan.photos || [], "subject"),
    executionGroupHtml("Messages de demande d’avis", "reviewMessages", plan.reviews?.messages || []),
    executionGroupHtml("Modèles de réponses aux avis", "reviewResponses", plan.reviews?.responseTemplates || []),
    executionGroupHtml("Lien direct d’avis", "reviewLink", [linkItem]),
    executionGroupHtml("Quatre publications Google", "posts", plan.posts || []),
    executionGroupHtml("Objectifs à 30 jours", "actions", plan.actions || [], "objective30Days"),
  ].join("");
  const missing = plan.integrity?.missing || [];
  if (executionPending) executionPending.textContent = plan.pendingConfirmationCount || missing.length
    ? `Éléments manquants avant approbation : ${plan.pendingConfirmationCount} confirmation(s). ${missing.join(" ; ")}`
    : "Tous les éléments proposés ont un statut explicite.";
}

executionEditor?.addEventListener("change", (event) => {
  const item = event.target.closest("[data-execution-item]");
  if (item) item.classList.toggle("is-pending", item.querySelector("[data-execution-status]")?.value === "needs_confirmation");
});

function collectExecutionPlan() {
  const previous = currentAnalysis?.manualReview?.executionPlan || {};
  const result = { ...previous, description: null, categoryItems: [], serviceItems: [], photos: [], reviewMessages: {}, reviewResponses: [], posts: [], actions: [] };
  executionEditor?.querySelectorAll("[data-execution-item]").forEach((node) => {
    const group = node.dataset.executionGroup;
    const id = node.dataset.executionId;
    const valueKey = node.dataset.executionValueKey || "text";
    const value = node.querySelector("[data-execution-value]")?.value?.trim() || "";
    const previousItem = group === "reviewMessages" ? previous.reviewMessages?.[id] : (Array.isArray(previous[group]) ? previous[group].find((entry) => entry?.id === id) : null);
    const item = { ...previousItem, id, [valueKey]: value, text: value, status: node.querySelector("[data-execution-status]")?.value || "needs_confirmation" };
    node.querySelectorAll("[data-execution-detail]").forEach((field) => { item[field.dataset.executionDetail] = field.value.trim(); });
    if (group === "description") result.description = item;
    else if (group === "reviewLink") { result.reviewLink = value; result.reviewLinkStatus = item.status; }
    else if (group === "reviewMessages") result.reviewMessages[id] = item;
    else if (Array.isArray(result[group])) result[group].push(item);
  });
  return result;
}

function renderObservation(analysis) {
  const business = analysis.business || {};
  const benchmark = analysis.benchmark || {};
  const normalized = business.normalized || {};
  const competitors = business.competitors || [];
  // "location_link" est la clé réelle renvoyée par Outscraper (et stockée telle quelle) pour le lien Google Maps.
  const secondaryCategoriesList = Array.isArray(normalized.categories) && normalized.categories.length
    ? normalized.categories
    : (Array.isArray(normalized.subtypes) && normalized.subtypes.length ? normalized.subtypes : null);
  const googleUrl = normalized.google_url || normalized.url || normalized.place_link || normalized.location_link || "";
  const benchmarkConfidence = benchmark.reviewed?.benchmarkConfidence || benchmark.confidence || null;
  const observedBusinessName = business.name || business.nom || "";
  const capitalizationAlert = /\b[A-Z]{2,}\s+[a-zà-ÿ]{2,}(?:\s+[a-zà-ÿ]{2,})+/u.test(observedBusinessName)
    ? `Capitalisation à vérifier avec l’entreprise : « ${observedBusinessName} »`
    : null;

  // Bug corrigé — "Catégorie principale" ne doit jamais afficher le nom de
  // l'entreprise. Le mapping est déjà corrigé à la source (functions/api/
  // analyze.js), mais des analyses déjà enregistrées peuvent encore porter
  // cette valeur polluée en base : on l'ignore aussi ici, par sécurité.
  const businessNameForCategoryGuard = (business.name || business.nom || "").trim().toLowerCase();
  const storedActivity = (business.activity || "").trim();
  const mainCategory = storedActivity && storedActivity.toLowerCase() !== businessNameForCategoryGuard
    ? storedActivity
    : (normalized.category || normalized.type || "");

  const rows = [
    ["Nom", business.name || business.nom],
    ["Type de rapport", reportTypeLabel(analysis.manualReview?.reportType || analysis.reportType)],
    ["URL Google", { render: renderGoogleUrlValue(googleUrl) }],
    ["Ville", business.ville],
    ["Catégorie principale", mainCategory],
    ["Catégories secondaires", secondaryCategoriesList ? secondaryCategoriesList.join(", ") : normalized.secondary_categories],
    ["Note", business.rating],
    ["Nombre d’avis", business.reviews],
    ["Nombre de photos", business.photosCount],
    ["Longueur description", business.descriptionLength === 0 ? "0 caractère" : business.descriptionLength],
    ["Horaires", normalized.working_hours ? "Présents" : "À confirmer"],
    ["Site", normalized.website || normalized.site],
    ["Téléphone", normalized.phone || normalized.phone_number],
    ["Position", business.localPosition],
    ["Requête", business.searchQuery || benchmark.searchQuery],
    ["Localisation", business.ville],
    ["Concurrents valides", competitors.length],
    ["Confiance benchmark", { render: renderConfidenceBadge(benchmarkConfidence) }],
    ...(capitalizationAlert ? [["Alerte nom commercial", capitalizationAlert]] : []),
  ];

  observationBox.innerHTML = rows.map(([label, value]) => `
    <div>
      <span>${escapeHtml(label)}</span>
      ${value && typeof value === "object" && "render" in value ? value.render : `<strong>${escapeHtml(display(value))}</strong>`}
    </div>
  `).join("");
}

// Affiche un lien court plutôt que l'URL Google complète (peu lisible et peu
// utile telle quelle dans ce tableau de données).
function renderGoogleUrlValue(url) {
  if (!url) return `<strong>Non disponible</strong>`;
  return `<strong><a class="observation-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">Ouvrir la fiche Google <span aria-hidden="true">↗</span></a></strong>`;
}

const CONFIDENCE_BADGES = {
  established: { icon: "🟢", label: "Élevée" },
  high: { icon: "🟢", label: "Élevée" },
  limited: { icon: "🟡", label: "Moyenne" },
  medium: { icon: "🟡", label: "Moyenne" },
  low: { icon: "🔴", label: "Faible" },
  weak: { icon: "🔴", label: "Faible" },
  unavailable: { icon: "⚪", label: "Indisponible" },
};

// Remplace le "—" peu parlant par un badge explicite quand une confiance a
// réellement été calculée (voir computeBenchmarkConfidence côté serveur), ou
// par un message clair si aucun benchmark révisé n'existe encore.
function renderConfidenceBadge(rawValue) {
  const key = String(rawValue || "").trim().toLowerCase();
  const badge = CONFIDENCE_BADGES[key];
  if (!badge) {
    return `<strong class="confidence-badge confidence-badge--unavailable">⚪ Benchmark indisponible</strong>`;
  }
  return `<strong class="confidence-badge confidence-badge--${escapeHtml(key)}">${badge.icon} ${escapeHtml(badge.label)}</strong>`;
}

function updateCompetitorsSummary() {
  if (!competitorsSummaryBox) return;
  const total = competitorsBox?.querySelectorAll("[data-competitor-id]").length || 0;
  if (!total) {
    competitorsSummaryBox.textContent = "";
    return;
  }
  const validated = competitorsBox?.querySelectorAll("[data-confirm-competitor]:checked").length || 0;
  competitorsSummaryBox.textContent = `${validated} concurrent${validated > 1 ? "s" : ""} validé${validated > 1 ? "s" : ""} sur ${total}`;
}

function renderCompetitors(analysis) {
  const competitors = analysis.business?.competitors || [];
  if (!competitors.length) {
    // Couvre aussi bien "aucun concurrent collecté" que "tous les résultats bruts
    // correspondaient à la fiche analysée elle-même et ont donc été exclus" (voir
    // collectCompetitors.js) : dans les deux cas, la liste est vide et le message reste sobre.
    competitorsBox.innerHTML = "<p class=\"admin-muted\">Aucun concurrent pertinent trouvé.</p>";
    updateCompetitorsSummary();
    return;
  }

  const review = analysis.manualReview || {};
  const excluded = new Set(review.excludedCompetitorIds || []);
  const confirmed = new Set(review.confirmedCompetitorIds || []);

  competitorsBox.innerHTML = competitors.map((competitor, index) => {
    const id = competitor.place_id || competitor.name || `competitor-${index}`;
    // Un concurrent détecté par le benchmark est considéré valide par défaut
    // (case "Confirmer" précochée). Si une validation a déjà été enregistrée
    // pour ce concurrent (confirmé OU exclu), on respecte cette valeur telle
    // quelle plutôt que de la remplacer par le préréglage.
    const hasSavedValidation = confirmed.has(id) || excluded.has(id);
    const isExcluded = hasSavedValidation ? excluded.has(id) : false;
    const isConfirmed = isExcluded ? false : (hasSavedValidation ? confirmed.has(id) : true);
    return `
      <article class="review-competitor" data-competitor-id="${escapeHtml(id)}">
        <span>Concurrent ${index + 1}</span>
        <strong>${escapeHtml(display(competitor.name))}</strong>
        <p>${escapeHtml(display(competitor.rating))} · ${escapeHtml(display(competitor.reviews))} avis · ${escapeHtml(display(competitor.photos_count))} photos</p>
        <div class="review-competitor-actions">
          <label><input type="checkbox" data-confirm-competitor value="${escapeHtml(id)}" ${isConfirmed ? "checked" : ""}>Confirmer</label>
          <label><input type="checkbox" data-exclude-competitor value="${escapeHtml(id)}" ${isExcluded ? "checked" : ""}>Exclure</label>
        </div>
      </article>
    `;
  }).join("");

  updateCompetitorsSummary();
}

// Empêche que "Confirmer" et "Exclure" soient cochés simultanément pour un
// même concurrent, et tient le compteur "Concurrents validés" à jour à
// chaque changement. Attaché une seule fois sur le conteneur (délégation),
// donc reste actif même après un renderCompetitors() qui remplace le HTML.
competitorsBox?.addEventListener("change", (event) => {
  const target = event.target;
  if (target.matches("[data-confirm-competitor]")) {
    if (target.checked) {
      const card = target.closest("[data-competitor-id]");
      const excludeBox = card?.querySelector("[data-exclude-competitor]");
      if (excludeBox) excludeBox.checked = false;
    }
    updateCompetitorsSummary();
  } else if (target.matches("[data-exclude-competitor]")) {
    if (target.checked) {
      const card = target.closest("[data-competitor-id]");
      const confirmBox = card?.querySelector("[data-confirm-competitor]");
      if (confirmBox) confirmBox.checked = false;
    }
    updateCompetitorsSummary();
  }
});

function updateLinks(analysis) {
  const id = encodeURIComponent(analysis.analysisId || analysisId);
  previewLink.href = `/api/render/${id}`;

  // Séparation stricte gratuit / premium : le Diagnostic gratuit ne doit
  // jamais appeler /api/pdf/{analysisId} (renderer premium, Cloudflare
  // Browser Rendering). Seul l'Audit Premium conserve ce chemin, inchangé.
  const reportType = analysis.manualReview?.reportType || analysis.reportType || "premium";
  const isFree = reportType === "free";

  if (pdfLink) {
    pdfLink.hidden = isFree;
    if (isFree) {
      pdfLink.removeAttribute("href");
      pdfLink.classList.add("is-disabled-link");
      pdfLink.setAttribute("aria-disabled", "true");
    } else {
      pdfLink.href = `/api/pdf/${id}`;
      const canGeneratePdf = analysis.status === "approved" || analysis.status === "pdf_generated";
      pdfLink.classList.toggle("is-disabled-link", !canGeneratePdf);
      pdfLink.setAttribute("aria-disabled", canGeneratePdf ? "false" : "true");
    }
  }

  if (legacyGeneratorLink) {
    legacyGeneratorLink.hidden = !isFree;
    if (isFree) {
      // Le système gratuit utilise exclusivement l'ancien générateur exact de
      // main, servi statiquement depuis /admin/free-diagnostic-production/.
      // Jamais /api/pdf/{analysisId}, jamais /admin/legacy-free-diagnostic/{id}.
      const query = analysis.freeDiagnosticQuery || legacyGeneratorLink.dataset.freeDiagnosticQuery || "";
      legacyGeneratorLink.href = `${window.location.origin}/admin/free-diagnostic-production/${query ? `?${query}` : ""}`;
    }
  }
}

async function loadAnalysis() {
  setStatus("Chargement de l’analyse...");
  const response = await fetch(`/api/admin/audit-review/${encodeURIComponent(analysisId)}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    redirectToLogin();
    return;
  }
  if (!response.ok || !data.success) {
    setStatus(response.status === 404 ? "Analyse introuvable." : "Impossible de charger l’analyse.", "error");
    return;
  }

  currentAnalysis = data.analysis;
  setCriteriaCatalog(currentAnalysis);
  renderCriteriaReview();
  renderObservation(currentAnalysis);
  renderCompetitors(currentAnalysis);
  renderExecutionPlan(currentAnalysis);
  fillCriteriaFromAnalysis(currentAnalysis);
  updateLinks(currentAnalysis);
  setStatus(currentAnalysis.status === "approved" ? "Rapport approuvé." : "Analyse prête à être validée.");
}

// Ces champs (type de rapport, statuts "corrections et confirmations") ne
// sont plus éditables depuis cette page : la grille des 29 critères couvre
// ce contrôle plus précisément. On renvoie donc systématiquement la valeur
// déjà enregistrée pour l'analyse en cours, telle quelle, afin de ne jamais
// l'écraser ni casser la lecture des anciennes analyses qui la contiennent.
function collectPayload() {
  const previousReview = currentAnalysis?.manualReview || {};
  const confirmedCompetitorIds = [...document.querySelectorAll("[data-confirm-competitor]:checked")].map((input) => input.value);
  const excludedCompetitorIds = [...document.querySelectorAll("[data-exclude-competitor]:checked")].map((input) => input.value);

  return {
    action: "complete_review",
    reportType: previousReview.reportType || currentAnalysis?.reportType || "premium",
    descriptionStatus: previousReview.descriptionStatus,
    photoQuality: previousReview.photoQuality,
    photoRelevance: previousReview.photoRelevance,
    reviewResponseStatus: previousReview.reviewResponseStatus,
    profileCompleteness: previousReview.profileCompleteness,
    categoryRelevance: previousReview.categoryRelevance,
    hoursAccuracy: previousReview.hoursAccuracy,
    visualConsistency: previousReview.visualConsistency,
    manualNotes: previousReview.manualNotes,
    confirmedCity: previousReview.confirmedCity,
    confirmedCategory: previousReview.confirmedCategory,
    confirmedPosition: previousReview.confirmedPosition,
    confirmedQuery: previousReview.confirmedQuery,
    confirmedCompetitorIds,
    excludedCompetitorIds,
    criteriaReview: collectCriteriaReview(),
    executionPlan: collectExecutionPlan(),
  };
}

async function saveReview(event) {
  event.preventDefault();
  submitButton.disabled = true;
  submitButton.textContent = "Préparation de l’aperçu...";
  setStatus("Validation enregistrée. Préparation de l’aperçu...");

  try {
    const response = await fetch(`/api/admin/audit-review/${encodeURIComponent(analysisId)}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectPayload()),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      throw new Error(data.detail || data.error || "Impossible de préparer l’aperçu.");
    }
    currentAnalysis = data.analysis;
    setCriteriaCatalog(currentAnalysis);
    renderCriteriaReview();
    fillCriteriaFromAnalysis(currentAnalysis);
    renderObservation(currentAnalysis);
    renderCompetitors(currentAnalysis);
    renderExecutionPlan(currentAnalysis);
    updateLinks(currentAnalysis);
    setStatus("Aperçu prêt. Relisez le rapport avant approbation.", "ok");
  } catch (error) {
    setStatus(error.message || "Une erreur est survenue pendant la validation.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Valider et préparer l’aperçu";
  }
}

async function approveReport() {
  approveButton.disabled = true;
  approveButton.textContent = "Approbation...";
  setStatus("Approbation du rapport...");

  try {
    const response = await fetch(`/api/admin/audit-review/${encodeURIComponent(analysisId)}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      throw new Error(data.message || data.error || "Impossible d’approuver le rapport.");
    }
    currentAnalysis = { ...(currentAnalysis || {}), status: "approved" };
    updateLinks(currentAnalysis);
    setStatus("Rapport approuvé. Le PDF peut maintenant être généré.", "ok");
  } catch (error) {
    setStatus(error.message || "Une erreur est survenue pendant l’approbation.", "error");
  } finally {
    approveButton.disabled = false;
    approveButton.textContent = "Approuver le rapport";
  }
}

renderCriteriaReview();
loadAnalysis();
form?.addEventListener("submit", saveReview);
approveButton?.addEventListener("click", approveReport);
fillUnknownButton?.addEventListener("click", markUnansweredCriteriaAsNotVerified);

logoutButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    await fetch("/admin/logout", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => {});
    redirectToLogin();
  });
});
