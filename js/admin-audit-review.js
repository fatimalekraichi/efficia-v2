const analysisId = document.body.dataset.analysisId;
const observationBox = document.querySelector("[data-review-observation]");
const competitorsBox = document.querySelector("[data-review-competitors]");
const form = document.querySelector("[data-review-form]");
const submitButton = document.querySelector("[data-review-submit]");
const approveButton = document.querySelector("[data-approve-button]");
const previewLink = document.querySelector("[data-preview-link]");
const pdfLink = document.querySelector("[data-pdf-link]");
const statusBox = document.querySelector("[data-review-status]");
const criteriaGroupsBox = document.querySelector("[data-criteria-groups]");
const criteriaSummaryBox = document.querySelector("[data-criteria-summary]");
const fillUnknownButton = document.querySelector("[data-fill-unknown]");
const logoutButtons = document.querySelectorAll("[data-admin-logout]");

let currentAnalysis = null;
let currentCriteriaGroups = null;
let currentPrefillCriteria = new Map();

const REPORT_TYPE_LABELS = {
  free: "Diagnostic gratuit",
  premium: "Audit Premium 99 €",
};

const OPTIONS = {
  descriptionStatus: [
    ["unknown", "À confirmer"],
    ["absent", "Absente"],
    ["too_short", "Trop courte"],
    ["acceptable", "Acceptable"],
    ["strong", "Solide"],
  ],
  photoQuality: [
    ["unknown", "À confirmer"],
    ["poor", "Faible"],
    ["average", "Correcte"],
    ["good", "Bonne"],
    ["excellent", "Excellente"],
  ],
  photoRelevance: [
    ["unknown", "À confirmer"],
    ["poor", "Faible"],
    ["average", "Correcte"],
    ["good", "Bonne"],
  ],
  reviewResponseStatus: [
    ["unknown", "À confirmer"],
    ["none", "Aucune réponse observée"],
    ["irregular", "Réponses irrégulières"],
    ["systematic", "Réponses systématiques"],
  ],
  profileCompleteness: [
    ["unknown", "À confirmer"],
    ["incomplete", "Incomplète"],
    ["average", "Correcte"],
    ["complete", "Complète"],
  ],
  categoryRelevance: [
    ["unknown", "À confirmer"],
    ["poor", "Faible"],
    ["acceptable", "Acceptable"],
    ["strong", "Solide"],
  ],
  hoursAccuracy: [
    ["unknown", "À confirmer"],
    ["incorrect", "Incorrects"],
    ["uncertain", "Incertain"],
    ["correct", "Corrects"],
  ],
  visualConsistency: [
    ["unknown", "À confirmer"],
    ["poor", "Faible"],
    ["average", "Correcte"],
    ["strong", "Solide"],
  ],
};

const CRITERIA_VALUES = new Set(["compliant", "partial", "deficient", "not_verified"]);

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

function setSelectOptions() {
  Object.entries(OPTIONS).forEach(([name, options]) => {
    const select = form?.elements?.[name];
    if (!select) return;
    select.innerHTML = options
      .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
      .join("");
  });
}

function reportTypeLabel(value) {
  return REPORT_TYPE_LABELS[value] || REPORT_TYPE_LABELS.premium;
}

function setReportType(value) {
  const reportType = REPORT_TYPE_LABELS[value] ? value : "premium";
  const field = form?.querySelector(`input[name="reportType"][value="${reportType}"]`);
  if (field) field.checked = true;
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

function fillFormFromAnalysis(analysis) {
  const review = analysis.manualReview || {};
  setReportType(review.reportType || analysis.reportType || "premium");

  Object.keys(OPTIONS).forEach((name) => {
    const field = form?.elements?.[name];
    if (field) field.value = review[name] || "unknown";
  });

  ["manualNotes", "confirmedCity", "confirmedCategory", "confirmedPosition", "confirmedQuery"].forEach((name) => {
    const field = form?.elements?.[name];
    if (!field) return;
    field.value = review[name] ?? "";
  });
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
          <div class="criteria-item__question">${escapeHtml(getCriterionQuestion(criterion))}</div>
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

  const primaryCategory = getNormalizedValue(normalized, ["category", "type"]) || business.activity;
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

function updateCriteriaSummary() {
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

function renderObservation(analysis) {
  const business = analysis.business || {};
  const benchmark = analysis.benchmark || {};
  const normalized = business.normalized || {};
  const competitors = business.competitors || [];
  // "location_link" est la clé réelle renvoyée par Outscraper (et stockée telle quelle) pour le lien Google Maps.
  const secondaryCategoriesList = Array.isArray(normalized.categories) && normalized.categories.length
    ? normalized.categories
    : (Array.isArray(normalized.subtypes) && normalized.subtypes.length ? normalized.subtypes : null);
  const rows = [
    ["Nom", business.name || business.nom],
    ["Type de rapport", reportTypeLabel(analysis.manualReview?.reportType || analysis.reportType)],
    ["URL Google", normalized.google_url || normalized.url || normalized.place_link || normalized.location_link],
    ["Ville", business.ville],
    ["Catégorie principale", business.activity || normalized.category || normalized.type],
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
    ["Confiance benchmark", benchmark.reviewed?.benchmarkConfidence || benchmark.confidence || "—"],
  ];

  observationBox.innerHTML = rows.map(([label, value]) => `
    <div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(display(value))}</strong>
    </div>
  `).join("");
}

function renderCompetitors(analysis) {
  const competitors = analysis.business?.competitors || [];
  if (!competitors.length) {
    competitorsBox.innerHTML = "<p class=\"admin-muted\">Aucun concurrent fiable enregistré.</p>";
    return;
  }

  const review = analysis.manualReview || {};
  const excluded = new Set(review.excludedCompetitorIds || []);
  const confirmed = new Set(review.confirmedCompetitorIds || []);

  competitorsBox.innerHTML = competitors.map((competitor, index) => {
    const id = competitor.place_id || competitor.name || `competitor-${index}`;
    return `
      <article class="review-competitor" data-competitor-id="${escapeHtml(id)}">
        <span>Concurrent ${index + 1}</span>
        <strong>${escapeHtml(display(competitor.name))}</strong>
        <p>${escapeHtml(display(competitor.rating))} · ${escapeHtml(display(competitor.reviews))} avis · ${escapeHtml(display(competitor.photos_count))} photos</p>
        <div class="review-competitor-actions">
          <label><input type="checkbox" data-confirm-competitor value="${escapeHtml(id)}" ${confirmed.has(id) ? "checked" : ""}>Confirmer</label>
          <label><input type="checkbox" data-exclude-competitor value="${escapeHtml(id)}" ${excluded.has(id) ? "checked" : ""}>Exclure</label>
        </div>
      </article>
    `;
  }).join("");
}

function updateLinks(analysis) {
  const id = encodeURIComponent(analysis.analysisId || analysisId);
  previewLink.href = `/api/render/${id}`;
  pdfLink.href = `/api/pdf/${id}`;
  const canGeneratePdf = analysis.status === "approved" || analysis.status === "pdf_generated";
  pdfLink.classList.toggle("is-disabled-link", !canGeneratePdf);
  pdfLink.setAttribute("aria-disabled", canGeneratePdf ? "false" : "true");
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
  fillFormFromAnalysis(currentAnalysis);
  fillCriteriaFromAnalysis(currentAnalysis);
  updateLinks(currentAnalysis);
  setStatus(currentAnalysis.status === "approved" ? "Rapport approuvé." : "Analyse prête à être validée.");
}

function collectPayload() {
  const data = new FormData(form);
  const confirmedCompetitorIds = [...document.querySelectorAll("[data-confirm-competitor]:checked")].map((input) => input.value);
  const excludedCompetitorIds = [...document.querySelectorAll("[data-exclude-competitor]:checked")].map((input) => input.value);

  return {
    action: "complete_review",
    reportType: data.get("reportType") || "premium",
    descriptionStatus: data.get("descriptionStatus"),
    photoQuality: data.get("photoQuality"),
    photoRelevance: data.get("photoRelevance"),
    reviewResponseStatus: data.get("reviewResponseStatus"),
    profileCompleteness: data.get("profileCompleteness"),
    categoryRelevance: data.get("categoryRelevance"),
    hoursAccuracy: data.get("hoursAccuracy"),
    visualConsistency: data.get("visualConsistency"),
    manualNotes: data.get("manualNotes"),
    confirmedCity: data.get("confirmedCity"),
    confirmedCategory: data.get("confirmedCategory"),
    confirmedPosition: data.get("confirmedPosition"),
    confirmedQuery: data.get("confirmedQuery"),
    confirmedCompetitorIds,
    excludedCompetitorIds,
    criteriaReview: collectCriteriaReview(),
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
    fillFormFromAnalysis(currentAnalysis);
    fillCriteriaFromAnalysis(currentAnalysis);
    renderObservation(currentAnalysis);
    renderCompetitors(currentAnalysis);
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
      throw new Error(data.error || "Impossible d’approuver le rapport.");
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
setSelectOptions();
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
