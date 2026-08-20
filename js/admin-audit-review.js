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
const draftSaveButton = document.querySelector("[data-draft-save]");
const draftStatus = document.querySelector("[data-draft-status]");
const logoutButtons = document.querySelectorAll("[data-admin-logout]");

let currentAnalysis = null;
let currentCriteriaGroups = null;
let currentPrefillCriteria = new Map();
let currentPrefillConditions = {};
let currentLegacyLocationReview = null;
let draftSaveTimer = null;
let draftSaveInFlight = false;
let draftManualSaveQueued = false;

const REPORT_TYPE_LABELS = {
  free: "Diagnostic gratuit",
  premium: "Audit Premium 99 €",
};

const CRITERIA_VALUES = new Set(["compliant", "partial", "deficient", "not_verified", "no_reviews", "no_photos"]);
const QUESTIONNAIRE_VERSION = "score-efficia-questionnaire-v4";
const PHOTO_DEPENDENT_KEYS = ["photoRecente", "varietePhotos", "qualitePhotos"];
const REVIEW_DEPENDENT_KEYS = ["volumeAvis", "recenceAvis", "tauxReponseAvis", "qualiteReponsesAvis"];
const NO_REVIEWS_HIDDEN_KEYS = ["volumeAvis", "recenceAvis", "qualiteReponsesAvis"];

// Questions conditionnelles : une sous-question n'a de sens que si la
// question parente a une réponse précise. Elle est retirée complètement de
// l'affichage (pas seulement désactivée) quand la valeur du parent est dans
// "hideWhen". Toute réponse masquée est effacée : elle ne participe plus au
// score, au brouillon ni au rapport, et ne réapparaît pas silencieusement.
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
    points: 24,
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
      {
        key: "nomConforme",
        question: "Le nom de la fiche correspond-il au nom réel de l’entreprise, sans ajout artificiel de mots-clés ?",
        help: "Comparer avec l’enseigne, le site officiel et les mentions légales. Ne pas pénaliser une ville, un métier ou un service lorsqu’il fait réellement partie du nom commercial utilisé par l’entreprise.",
        options: [
          ["compliant", "Conforme au nom réel", 2],
          ["partial", "Douteux / légèrement surchargé", 1],
          ["deficient", "Ajouts artificiels manifestes", 0],
          ["not_verified", "Non vérifié"],
        ],
      },
    ],
  },
  {
    category: "Photos et visuels",
    points: 15,
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
          ["no_photos", "Aucune photo", 0],
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
    points: 25,
    criteria: [
      {
        key: "noteMoyenne",
        question: "Quelle est la note moyenne ?",
        help: "Comparer la note à la moyenne des concurrents observés.",
        options: [
          ["compliant", "Très rassurante"],
          ["partial", "Correcte"],
          ["deficient", "À renforcer"],
          ["no_reviews", "Aucun avis"],
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
        question: "L’établissement répond-il aux avis ?",
        help: "Ne confirmer que si un taux ou une observation fiable existe.",
        options: [
          ["compliant", "Réponses régulières"],
          ["partial", "Réponses irrégulières"],
          ["deficient", "Aucune réponse"],
          ["no_reviews", "Non applicable — aucun avis", 0],
          ["not_verified", "Non vérifié"],
        ],
      },
      {
        key: "qualiteReponsesAvis",
        question: "Les réponses sont-elles personnalisées et professionnelles ?",
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
    points: 21,
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
    points: 5,
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
    points: 10,
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
  currentPrefillConditions = analysis?.scorePrefill?.conditions || {};
}

function locationCriterionHtml() {
  return `<article class="criteria-item" data-criteria-key="adresse" data-location-criterion>
    <div class="criteria-item__question">Comment l’entreprise reçoit-elle ses clients ? <span class="criteria-not-verified-badge" data-not-verified-badge hidden>À vérifier manuellement</span></div>
    <div class="criteria-item__help">Ce choix détermine le contrôle de localisation applicable et n’ajoute aucun point.</div>
    <div class="criteria-options" data-location-modes>
      <label class="criteria-option"><input type="radio" name="condition:locationMode" value="storefront"><span>Les clients se rendent à l’adresse</span></label>
      <label class="criteria-option"><input type="radio" name="condition:locationMode" value="service_area"><span>L’entreprise se déplace uniquement chez les clients</span></label>
      <label class="criteria-option"><input type="radio" name="condition:locationMode" value="hybrid"><span>Les deux</span></label>
    </div>
    <div data-location-control="address" hidden inert>
      <div class="criteria-item__question">L’adresse et l’épingle Google Maps sont-elles exactes ?</div>
      <div class="criteria-item__help">Vérifier l’adresse publique et la position de l’épingle sur Google Maps.</div>
      <div class="criteria-options">
        <label class="criteria-option"><input type="radio" name="location:address" value="exact"><span>Exactes</span></label>
        <label class="criteria-option"><input type="radio" name="location:address" value="inaccurate"><span>Erreur ou imprécision</span></label>
        <label class="criteria-option"><input type="radio" name="location:address" value="not_verifiable"><span>Non vérifiable publiquement</span></label>
      </div>
    </div>
    <div data-location-control="service_area" hidden inert>
      <div class="criteria-item__question">La zone desservie est-elle renseignée et cohérente ?</div>
      <div class="criteria-item__help">Sur la fiche publique, rechercher “Zone desservie” ou “Dessert…”. Avec un accès propriétaire : Modifier le profil → Localisation → Zone desservie.</div>
      <div class="criteria-options">
        <label class="criteria-option"><input type="radio" name="location:serviceArea" value="coherent"><span>Renseignée et cohérente</span></label>
        <label class="criteria-option"><input type="radio" name="location:serviceArea" value="partial"><span>Partielle ou imprécise</span></label>
        <label class="criteria-option"><input type="radio" name="location:serviceArea" value="incoherent"><span>Absente ou incohérente</span></label>
        <label class="criteria-option"><input type="radio" name="location:serviceArea" value="not_verifiable"><span>Non vérifiable publiquement</span></label>
      </div>
    </div>
    <p class="criteria-item__help" data-location-confirmation hidden>Cette information doit être confirmée avant la finalisation. Aucune anomalie n’est déduite automatiquement.</p>
    <p class="criteria-item__help" data-legacy-location hidden>Ancienne réponse conservée pour la lecture. Sélectionnez le mode d’activité avant toute nouvelle finalisation.</p>
  </article>`;
}

function renderCriteriaReview() {
  if (!criteriaGroupsBox) return;

  criteriaGroupsBox.innerHTML = getCriteriaGroups().map((group) => `
    <section class="criteria-category">
      <div class="criteria-category__head">
        <h3>${escapeHtml(getGroupLabel(group))}</h3>
        <span>${escapeHtml(getGroupPoints(group))} points</span>
      </div>
      ${group.precondition ? `
        <div class="criteria-precondition" data-questionnaire-condition="${escapeHtml(group.precondition.key)}">
          <div class="criteria-item__question">${escapeHtml(group.precondition.question)}</div>
          <div class="criteria-options">
            ${group.precondition.options.map((option) => `
              <label class="criteria-option">
                <input type="radio" name="condition:${escapeHtml(group.precondition.key)}" value="${escapeHtml(option.value)}">
                <span>${escapeHtml(option.label)}</span>
              </label>
            `).join("")}
          </div>
        </div>
      ` : ""}
      ${getGroupCriteria(group).map((criterion) => {
        if (criterion.key === "adresse") return locationCriterionHtml();
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

  criteriaGroupsBox.onchange = () => {
    updateCriteriaSummary();
    scheduleDraftSave();
  };
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
  const services = getServices(normalized);

  add("categoriePrincipale", primaryCategory ? "compliant" : "not_verified");
  add("categoriesSecondaires", secondaryCategories.length > 1 ? "compliant" : "not_verified");
  add("horaires", workingHours ? "compliant" : "not_verified");
  add("contact", contactWasObserved ? (phone && website ? "compliant" : (phone || website ? "partial" : "deficient")) : "not_verified");
  // Le mode d'accueil et la conformité de la localisation ne sont jamais
  // déduits de la seule présence ou absence d'une adresse publique.
  add("adresse", "not_verified");
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
  add("nomConforme", "not_verified");

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

function fillCriteriaFromAnalysis(analysis, draftReview = null) {
  const activeReview = draftReview || analysis.manualReview || {};
  const savedCriteria = new Map((activeReview.criteriaReview || [])
    .filter((item) => item?.key)
    .map((item) => [item.key, item]));
  const fallbackAutoCriteria = new Map(buildAutoCriteriaReview(analysis)
    .filter((item) => item?.key)
    .map((item) => [item.key, item]));

  const photoPresence = activeReview.photoPresence || currentPrefillConditions.photoPresence || "unknown";
  const reviewsPresence = activeReview.reviewsPresence || currentPrefillConditions.reviewsPresence || "unknown";
  const locationMode = activeReview.locationMode || "unknown";
  if (photoPresence === "none") {
    const noPhotosRadio = criteriaGroupsBox?.querySelector('input[name="criterion:nombrePhotos"][value="no_photos"]');
    if (noPhotosRadio) noPhotosRadio.checked = true;
  }
  if (reviewsPresence === "none") {
    const noReviewsRadio = criteriaGroupsBox?.querySelector('input[name="criterion:noteMoyenne"][value="no_reviews"]');
    if (noReviewsRadio) noReviewsRadio.checked = true;
  }
  const locationModeRadio = criteriaGroupsBox?.querySelector(`input[name="condition:locationMode"][value="${locationMode}"]`);
  if (locationModeRadio) locationModeRadio.checked = true;
  const addressRadio = criteriaGroupsBox?.querySelector(`input[name="location:address"][value="${activeReview.addressVerification}"]`);
  if (addressRadio) addressRadio.checked = true;
  const serviceAreaRadio = criteriaGroupsBox?.querySelector(`input[name="location:serviceArea"][value="${activeReview.serviceAreaVerification}"]`);
  if (serviceAreaRadio) serviceAreaRadio.checked = true;
  currentLegacyLocationReview = locationMode === "unknown" ? (savedCriteria.get("adresse") || null) : null;
  const legacyNotice = criteriaGroupsBox?.querySelector("[data-legacy-location]");
  if (legacyNotice) legacyNotice.hidden = !currentLegacyLocationReview;

  getCriteriaGroups().forEach((group) => {
    getGroupCriteria(group).forEach((criterion) => {
      if (criterion.key === "adresse") return;
      if (reviewsPresence === "none" && criterion.key === "noteMoyenne") return;
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
      if (criterion.key === "adresse") return;
      const criterionItem = criteriaGroupsBox?.querySelector(`[data-criteria-key="${criterion.key}"]`);
      if (criterionItem?.classList.contains("is-dependency-hidden")) return;
      const selected = criteriaGroupsBox?.querySelector(`input[name="criterion:${criterion.key}"]:checked`);
      const checklist = [...(criteriaGroupsBox?.querySelectorAll(`[data-criteria-checklist="${criterion.key}"]:checked`) || [])]
        .map((input) => input.value);

      if (!selected && !checklist.length) return;

      if (["no_reviews", "no_photos"].includes(selected?.value)) return;
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

  if (collectQuestionnaireConditions().locationMode === "unknown" && currentLegacyLocationReview) {
    criteria.push(currentLegacyLocationReview);
  }

  return criteria;
}

function collectQuestionnaireConditions() {
  const photoSelection = criteriaGroupsBox?.querySelector('input[name="criterion:nombrePhotos"]:checked')?.value;
  const photoPresence = photoSelection === "no_photos" ? "none" : (photoSelection && photoSelection !== "not_verified" ? "present" : "unknown");
  const noteSelection = criteriaGroupsBox?.querySelector('input[name="criterion:noteMoyenne"]:checked')?.value;
  return {
    photoPresence,
    reviewsPresence: noteSelection === "no_reviews" ? "none" : (noteSelection && noteSelection !== "not_verified" ? "present" : "unknown"),
    locationMode: criteriaGroupsBox?.querySelector('input[name="condition:locationMode"]:checked')?.value || "unknown",
    addressVerification: criteriaGroupsBox?.querySelector('input[name="location:address"]:checked')?.value || "unknown",
    serviceAreaVerification: criteriaGroupsBox?.querySelector('input[name="location:serviceArea"]:checked')?.value || "unknown",
  };
}

function updateLocationControls() {
  const conditions = collectQuestionnaireConditions();
  const addressApplicable = ["storefront", "hybrid"].includes(conditions.locationMode);
  const serviceAreaApplicable = ["service_area", "hybrid"].includes(conditions.locationMode);
  for (const [key, applicable] of [["address", addressApplicable], ["service_area", serviceAreaApplicable]]) {
    const block = criteriaGroupsBox?.querySelector(`[data-location-control="${key}"]`);
    if (!block) continue;
    if (!applicable) block.querySelectorAll('input[type="radio"]').forEach((input) => { input.checked = false; });
    block.hidden = !applicable;
    block.toggleAttribute("inert", !applicable);
  }
  const refreshed = collectQuestionnaireConditions();
  const unresolved = (addressApplicable && ["unknown", "not_verifiable"].includes(refreshed.addressVerification))
    || (serviceAreaApplicable && ["unknown", "not_verifiable"].includes(refreshed.serviceAreaVerification));
  const confirmation = criteriaGroupsBox?.querySelector("[data-location-confirmation]");
  if (confirmation) confirmation.hidden = !unresolved;
}

function clearCriterionAnswer(key) {
  criteriaGroupsBox?.querySelectorAll(`input[name="criterion:${key}"], [data-criteria-checklist="${key}"]`).forEach((input) => {
    input.checked = false;
  });
}

function updateNoReviewsResponseControl(noReviews) {
  const inputs = [...(criteriaGroupsBox?.querySelectorAll('input[name="criterion:tauxReponseAvis"]') || [])];
  const notApplicable = inputs.find((input) => input.value === "no_reviews");
  inputs.forEach((input) => {
    const isNotApplicable = input === notApplicable;
    input.disabled = noReviews ? !isNotApplicable : isNotApplicable;
    if (noReviews && !isNotApplicable) input.checked = false;
    if (!noReviews && isNotApplicable) input.checked = false;
    if (isNotApplicable) input.closest("label")?.toggleAttribute("hidden", !noReviews);
  });
  if (noReviews && notApplicable) notApplicable.checked = true;
}

function setCriterionHidden(key, hidden) {
  const item = criteriaGroupsBox?.querySelector(`[data-criteria-key="${key}"]`);
  if (!item) return;
  if (hidden) clearCriterionAnswer(key);
  item.classList.toggle("is-dependency-hidden", hidden);
  item.toggleAttribute("inert", hidden);
  item.setAttribute("aria-hidden", hidden ? "true" : "false");
}

// Surbrillance des critères "Non vérifié" : purement visuelle, ne touche ni
// à la valeur du critère ni à son calcul (score inchangé, mêmes 29 critères).
function updateNotVerifiedHighlights() {
  if (!criteriaGroupsBox) return 0;
  let notVerifiedCount = 0;

  criteriaGroupsBox.querySelectorAll("[data-criteria-key]").forEach((item) => {
    const key = item.dataset.criteriaKey;
    if (key === "adresse") {
      const conditions = collectQuestionnaireConditions();
      const isNotVerified = conditions.locationMode === "unknown"
        || (["storefront", "hybrid"].includes(conditions.locationMode) && ["unknown", "not_verifiable"].includes(conditions.addressVerification))
        || (["service_area", "hybrid"].includes(conditions.locationMode) && ["unknown", "not_verifiable"].includes(conditions.serviceAreaVerification));
      item.classList.toggle("is-not-verified", isNotVerified);
      const badge = item.querySelector("[data-not-verified-badge]");
      if (badge) badge.hidden = !isNotVerified;
      if (isNotVerified) notVerifiedCount += 1;
      return;
    }
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

function updateCriteriaDependencies() {
  if (!criteriaGroupsBox) return;

  updateLocationControls();

  const conditions = collectQuestionnaireConditions();
  updateNoReviewsResponseControl(conditions.reviewsPresence === "none");
  const conditionallyHidden = new Set([
    ...(conditions.photoPresence === "none" ? PHOTO_DEPENDENT_KEYS : []),
    ...(conditions.reviewsPresence === "none" ? NO_REVIEWS_HIDDEN_KEYS : []),
  ]);
  PHOTO_DEPENDENT_KEYS.forEach((key) => setCriterionHidden(key, conditionallyHidden.has(key)));
  REVIEW_DEPENDENT_KEYS.forEach((key) => setCriterionHidden(key, conditionallyHidden.has(key)));

  CRITERIA_DEPENDENCIES.forEach(({ parent, child, hideWhen }) => {
    const parentSelected = criteriaGroupsBox.querySelector(`input[name="criterion:${parent}"]:checked`);
    const shouldHide = Boolean(parentSelected) && hideWhen.includes(parentSelected.value);
    setCriterionHidden(child, shouldHide || conditionallyHidden.has(child));
  });
}

function updateCriteriaSummary() {
  updateCriteriaDependencies();
  updateNotVerifiedHighlights();
  if (!criteriaSummaryBox) return;
  const visibleItems = [...(criteriaGroupsBox?.querySelectorAll("[data-criteria-key]") || [])]
    .filter((item) => !item.classList.contains("is-dependency-hidden"));
  const total = visibleItems.length;
  const location = collectQuestionnaireConditions();
  const locationAnswered = location.locationMode !== "unknown"
    && (!["storefront", "hybrid"].includes(location.locationMode) || ["exact", "inaccurate"].includes(location.addressVerification))
    && (!["service_area", "hybrid"].includes(location.locationMode) || ["coherent", "partial", "incoherent"].includes(location.serviceAreaVerification));
  const answered = visibleItems.filter((item) => item.dataset.criteriaKey === "adresse"
    ? locationAnswered
    : item.querySelector("[data-criteria-option]:checked")).length;
  const notVerified = visibleItems.filter((item) => item.dataset.criteriaKey === "adresse"
    ? !locationAnswered
    : item.querySelector('[data-criteria-option]:checked[value="not_verified"]')).length;
  criteriaSummaryBox.textContent = `${answered}/${total} critères renseignés${notVerified ? ` · ${notVerified} non vérifiés` : ""}`;
}

function listerElementsRestantsPourFinalisation() {
  const moteur = globalThis.EfficiaQuestionnaireFinalization;
  if (!moteur) throw new Error("QUESTIONNAIRE_FINALIZATION_UNAVAILABLE");
  const location = collectQuestionnaireConditions();
  const locationElement = criteriaGroupsBox?.querySelector("[data-location-criterion]");
  const requiredContexts = [
    {
      id: "locationMode",
      label: "Mode d’activité à confirmer",
      complete: ["storefront", "service_area", "hybrid"].includes(location.locationMode),
      element: locationElement,
      focusTarget: locationElement?.querySelector('input[name="condition:locationMode"]'),
      reason: "location_mode_missing",
    },
    {
      id: "addressVerification",
      label: "Adresse et épingle Google Maps à confirmer",
      required: ["storefront", "hybrid"].includes(location.locationMode),
      complete: ["exact", "inaccurate"].includes(location.addressVerification),
      element: locationElement?.querySelector('[data-location-control="address"]') || locationElement,
      focusTarget: locationElement?.querySelector('input[name="location:address"]'),
      reason: "address_verification_missing",
    },
    {
      id: "serviceAreaVerification",
      label: "Zone desservie à confirmer",
      required: ["service_area", "hybrid"].includes(location.locationMode),
      complete: ["coherent", "partial", "incoherent"].includes(location.serviceAreaVerification),
      element: locationElement?.querySelector('[data-location-control="service_area"]') || locationElement,
      focusTarget: locationElement?.querySelector('input[name="location:serviceArea"]'),
      reason: "service_area_verification_missing",
    },
  ];
  const criteria = [...(criteriaGroupsBox?.querySelectorAll("[data-criteria-key]") || [])]
    .filter((item) => item.dataset.criteriaKey !== "adresse")
    .map((item) => {
      const selected = item.querySelector("[data-criteria-option]:checked");
      const question = item.querySelector(".criteria-item__question");
      return {
        id: item.dataset.criteriaKey,
        label: question?.firstChild?.textContent?.trim() || item.dataset.criteriaKey,
        applicable: !item.classList.contains("is-dependency-hidden"),
        answered: Boolean(selected) && selected.value !== "not_verified",
        element: item,
        focusTarget: item.querySelector("[data-criteria-option]"),
        reason: selected?.value === "not_verified" ? "criterion_not_verified" : "criterion_response_missing",
      };
    });
  return moteur.listerElementsRestantsPourFinalisation({ criteria, requiredContexts });
}

function mettreEnEvidencePremierElementRestant(elements) {
  criteriaGroupsBox?.querySelectorAll(".finalisation-manquante").forEach((element) => {
    element.classList.remove("finalisation-manquante");
    element.removeAttribute("aria-invalid");
  });
  const first = elements.find((item) => item.element && !item.element.hidden);
  if (!first) return;
  first.element.classList.add("finalisation-manquante");
  first.element.setAttribute("aria-invalid", "true");
  first.element.scrollIntoView?.({ behavior: "smooth", block: "center" });
  first.focusTarget?.focus?.({ preventScroll: true });
}

function markUnansweredCriteriaAsNotVerified() {
  getCriteriaGroups().forEach((group) => {
    getGroupCriteria(group).forEach((criterion) => {
      if (criterion.key === "adresse") return;
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
  scheduleDraftSave();
});

executionEditor?.addEventListener("input", scheduleDraftSave);

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

function restoreExecutionPlan(review) {
  if (!review || !executionEditor) return;
  executionEditor.querySelectorAll("[data-execution-item]").forEach((node) => {
    const group = node.dataset.executionGroup;
    const id = node.dataset.executionId;
    const index = Number(node.dataset.executionIndex);
    let item = null;
    if (group === "description") item = review.description;
    else if (group === "reviewLink") item = { text: review.reviewLink, status: review.reviewLinkStatus };
    else if (group === "reviewMessages") item = review.reviewMessages?.[id];
    else if (Array.isArray(review[group])) {
      item = review[group].find((entry) => entry?.id === id) || review[group][index];
    }
    if (!item) return;

    const valueKey = node.dataset.executionValueKey || "text";
    const valueField = node.querySelector("[data-execution-value]");
    if (valueField) valueField.value = item[valueKey] ?? item.text ?? "";
    node.querySelectorAll("[data-execution-detail]").forEach((field) => {
      field.value = item[field.dataset.executionDetail] ?? "";
    });
    const statusField = node.querySelector("[data-execution-status]");
    if (statusField && item.status in EXECUTION_STATUS_LABELS) statusField.value = item.status;
    node.classList.toggle("is-pending", statusField?.value === "needs_confirmation");
  });
}

function restoreCompetitorSelection(answers) {
  const confirmed = new Set(answers?.confirmedCompetitorIds || []);
  const excluded = new Set(answers?.excludedCompetitorIds || []);
  competitorsBox?.querySelectorAll("[data-competitor-id]").forEach((row) => {
    const id = row.dataset.competitorId;
    const confirm = row.querySelector("[data-confirm-competitor]");
    const exclude = row.querySelector("[data-exclude-competitor]");
    if (confirm) confirm.checked = confirmed.has(id) && !excluded.has(id);
    if (exclude) exclude.checked = excluded.has(id);
  });
  updateCompetitorsSummary();
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
      legacyGeneratorLink.href = `${window.location.origin}/admin/free-diagnostic-production/?analysisId=${encodeURIComponent(analysis.analysisId || analysisId)}`;
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
  await restoreDraft();
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
    questionnaireVersion: QUESTIONNAIRE_VERSION,
    ...collectQuestionnaireConditions(),
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

function formatDraftTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function setDraftState(state, updatedAt = null) {
  if (!draftStatus) return;
  draftStatus.dataset.state = state;
  if (state === "saving") draftStatus.textContent = "Enregistrement…";
  else if (state === "saved") draftStatus.textContent = `Brouillon enregistré à ${formatDraftTime(updatedAt)}`;
  else if (state === "error") draftStatus.textContent = "Échec de l’enregistrement — Réessayer";
  else draftStatus.textContent = "Modifications non enregistrées";
}

async function saveDraft({ manual = false } = {}) {
  if (!currentAnalysis) return;
  if (manual) window.clearTimeout(draftSaveTimer);
  if (draftSaveInFlight) {
    if (manual) draftManualSaveQueued = true;
    return;
  }
  draftSaveInFlight = true;
  if (draftSaveButton) draftSaveButton.disabled = true;
  setDraftState("saving");
  try {
    const reportType = currentAnalysis.manualReview?.reportType || currentAnalysis.reportType || "premium";
    const response = await fetch(`/api/admin/audit-drafts/${encodeURIComponent(analysisId)}`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        analysisId,
        reportType,
        currentStep: "questionnaire",
        answers: collectPayload(),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) return redirectToLogin();
    if (!response.ok || !data.success) throw new Error("DRAFT_SAVE_FAILED");
    setDraftState("saved", data.draft.updatedAt);
  } catch {
    setDraftState("error");
  } finally {
    draftSaveInFlight = false;
    if (draftSaveButton) draftSaveButton.disabled = false;
    if (draftManualSaveQueued) {
      draftManualSaveQueued = false;
      saveDraft({ manual: true });
    }
  }
}

function scheduleDraftSave() {
  if (!currentAnalysis) return;
  setDraftState("dirty");
  window.clearTimeout(draftSaveTimer);
  draftSaveTimer = window.setTimeout(() => saveDraft(), 1200);
}

async function restoreDraft() {
  const response = await fetch(`/api/admin/audit-drafts/${encodeURIComponent(analysisId)}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (response.status === 401) return redirectToLogin();
  if (response.status === 404) return;
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || data.draft?.currentStep !== "questionnaire") return;
  const answers = data.draft.answers;
  if (!answers || answers.reportType !== (currentAnalysis.reportType || "premium")) return;
  fillCriteriaFromAnalysis(currentAnalysis, answers);
  restoreCompetitorSelection(answers);
  restoreExecutionPlan(answers.executionPlan);
  setDraftState("saved", data.draft.updatedAt);
}

async function saveReview(event) {
  event.preventDefault();
  const incomplete = listerElementsRestantsPourFinalisation();
  if (incomplete.length) {
    setStatus(globalThis.EfficiaQuestionnaireFinalization.formaterResumeElementsRestants(incomplete), "error");
    mettreEnEvidencePremierElementRestant(incomplete);
    return;
  }
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
      if (data.error === "INCOMPLETE_QUESTIONNAIRE") {
        throw new Error("Complétez toutes les questions visibles avant de préparer l’aperçu.");
      }
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
    if (draftStatus) draftStatus.textContent = "Brouillon finalisé.";
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
draftSaveButton?.addEventListener("click", () => saveDraft({ manual: true }));
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
