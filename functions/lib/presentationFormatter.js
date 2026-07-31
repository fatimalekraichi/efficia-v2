// Sprint 5 (finition éditoriale, 2026-07-31) — module unique de présentation.
//
// Architecture demandée par la mission :
//   Business logic → Knowledge → Reasoning → Composer → Presentation Formatter
//   → renderAnalysisHtml
//
// Ce module ne contient AUCUNE règle métier : il ne recalcule aucun score, ne
// modifie aucune priorité, ne change aucun classement, ne prend aucune
// décision. Il reçoit des données déjà calculées (par Knowledge, Reasoning,
// Composer) et les présente correctement : formats français, pluriels,
// ordinaux, typographie, vocabulaire sectoriel, mise en prose des preuves.
//
// Seul consommateur à ce jour : functions/lib/renderAnalysisHtml.js, et
// uniquement pour la partie Audit premium (renderPremiumAuditHtml). Le
// Diagnostic gratuit (renderFreeDiagnosticHtml) continue d'utiliser ses
// propres helpers historiques (safeText/safeNumber) : ce module ne les
// remplace pas et ne les modifie pas.

function present(value) {
  return value !== null && value !== undefined && value !== "";
}

/* -------------------------------------------------------------------------- */
/* Objectif 1 — typographie : normalisation défensive, jamais de correction   */
/* texte par texte. On ne corrige que ce qui est mécaniquement détectable :   */
/* espaces multiples, ponctuation collée au mot suivant, espace avant une     */
/* ponctuation simple, ponctuation répétée. On ne tente jamais de "deviner"   */
/* un mot collé à un autre (ex. "Surle") : ce cas n'est pas détectable sans   */
/* risquer de casser un mot légitime — il doit être corrigé à la source si    */
/* une occurrence réelle est trouvée dans les gabarits Knowledge/Reasoning.   */
/* -------------------------------------------------------------------------- */
export function cleanTypography(text) {
  if (text === null || text === undefined) return text;
  return String(text)
    // espaces multiples (y compris retours à la ligne) → un seul espace
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    // ponctuation répétée ("..", ",,", "::") → une seule occurrence. Fait
    // AVANT l'ajout d'espace ci-dessous : sinon deux ponctuations adjacentes
    // ("un mot,, un autre") se retrouveraient séparées par l'espace ajouté
    // ("un mot, , un autre") et ne seraient plus détectées comme adjacentes.
    .replace(/([,.;:!?]){2,}/g, "$1")
    // Espace avant une ponctuation simple ("," ".") → supprimé. Ne touche
    // volontairement PAS aux deux-points/point-virgule : ce document utilise
    // déjà, de façon établie et validée (summaryTemplates.js : "...sont :"),
    // la convention typographique française classique qui place un espace
    // avant ces signes doubles — la conserver, pas la corriger.
    .replace(/\s+([,.])/g, "$1")
    // ponctuation immédiatement suivie d'une lettre (ou d'un chiffre non
    // décimal) sans espace → espace ajouté ("photos,contre" → "photos, contre")
    .replace(/([,;:])(?=[^\s\d])/g, "$1 ")
    .trim();
}

// Premium Polish — objectif 9 (relecture éditoriale globale) : Composer
// assemble parfois, pour un même texte, deux fragments Reasoning indépendants
// (googleImpacts.js + businessImpacts.js) qui restent chacun pertinents pris
// séparément, mais qui, une fois mis bout à bout dans CETTE combinaison
// précise, se lisent comme une répétition ("Une galerie mieux alimentée
// donne... indices concrets. Une galerie mieux actualisée peut donner...
// preuves concrètes..."). On ne touche à aucune des deux bibliothèques
// Reasoning (chaque fragment reste utile dans d'autres combinaisons) : on
// fusionne uniquement, en aval, cette paire EXACTE et RÉPERTORIÉE en une
// phrase unique. Toute autre combinaison, non répertoriée, reste inchangée
// par sécurité — même principe de repli sûr que ENTERPRISE_PHRASE_FIXES.
const KNOWN_REDUNDANT_SENTENCE_PAIRS = [
  [
    /Une galerie mieux alimentée donne à Google et aux utilisateurs davantage d'indices concrets\.\s*Une galerie mieux actualisée peut donner davantage de preuves concrètes au moment du choix\./gi,
    "Une galerie mieux alimentée donne à Google et aux utilisateurs davantage de preuves concrètes au moment du choix.",
  ],
];

export function collapseKnownRedundancies(text) {
  if (!present(text)) return text;
  let result = String(text);
  for (const [pattern, replacement] of KNOWN_REDUNDANT_SENTENCE_PAIRS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Objectif 2 — formats français : séparateur décimal virgule, pluriels,      */
/* ordinaux. Un seul helper par usage, jamais dupliqué ailleurs.              */
/* -------------------------------------------------------------------------- */

// Nombre "générique" : entier → aucune décimale ("449"), non-entier → une
// décimale, arrondie, virgule française ("58,3").
export function formatFrenchNumber(value, { decimals = 1 } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const rounded = Number.isInteger(number) ? number : Number(number.toFixed(decimals));
  return String(rounded).replace(".", ",");
}

// Note Google (rating) : toujours une décimale, même sur une valeur entière
// ("4,0/5"), pour rester cohérent avec la façon dont une note est toujours
// perçue (jamais "4/5" qui laisserait croire à une note entière arrondie).
export function formatRatingDisplay(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number.toFixed(1).replace(".", ",");
}

// Ordinal français simple : 1 → "1er", tout le reste → "Ne" ("9e", "4e").
export function formatOrdinal(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  const rounded = Math.round(number);
  return rounded === 1 ? "1er" : `${rounded}e`;
}

// Accord pluriel simple : 1 (exactement) → singulier, tout le reste
// (0, 2, 2.5…) → pluriel — règle standard du français.
export function pluralizeNoun(count, singular, plural = `${singular}s`) {
  const number = Number(count);
  if (!Number.isFinite(number)) return plural;
  return Math.abs(number) === 1 ? singular : plural;
}

// "1 photo" / "2 photos" / "58,3 avis" — nombre + accord, en un seul appel.
export function formatCount(count, singular, plural = `${singular}s`) {
  const formatted = formatFrenchNumber(count);
  if (formatted === null) return null;
  return `${formatted} ${pluralizeNoun(count, singular, plural)}`;
}

// Formatage propre à chaque signal connu (unité + pluriel + ordinal déjà
// définis dans evidence.js, jamais recalculés ici — seule la présentation
// change) : "4,1/5", "58,3 avis", "1 photo", "12,7 photos", "9e position".
const SIGNAL_VALUE_FORMATTERS = {
  rating: (value) => {
    const formatted = formatRatingDisplay(value);
    return formatted === null ? null : `${formatted}/5`;
  },
  reviews: (value) => formatCount(value, "avis", "avis"),
  photos: (value) => formatCount(value, "photo", "photos"),
  description: (value) => formatCount(value, "caractère", "caractères"),
  categories: (value) => formatCount(value, "catégorie secondaire", "catégories secondaires"),
  position: (value) => {
    const ordinal = formatOrdinal(value);
    return ordinal === null ? null : `${ordinal} position`;
  },
};

export function formatSignalValue(signal, value) {
  const formatter = SIGNAL_VALUE_FORMATTERS[signal];
  if (!formatter) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return formatter(number);
}

/* -------------------------------------------------------------------------- */
/* Objectif 3 — vocabulaire sectoriel : détection déterministe (aucune IA,    */
/* aucun LLM) à partir de la seule catégorie Google déjà disponible dans le   */
/* modèle (hero.category). Secteur inconnu ⇒ vocabulaire générique conservé.  */
/* -------------------------------------------------------------------------- */

function normalizeForMatch(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const SECTOR_KEYWORDS = {
  medical: [
    "medecin", "docteur", "cabinet medical", "cabinet dentaire", "dentiste",
    "clinique", "medecine", "cardiolog", "kinesitherap", "dermatolog",
    "ophtalmolog", "pediatr", "chirurgien", "infirmier", "orthophoniste",
    "psycholog", "gynecolog", "generaliste", "osteopathe", "sage-femme",
    "podolog", "veterinaire",
  ],
  restaurant: [
    "restaurant", "brasserie", "cafe", "pizzeria", "traiteur", "bar a",
    "bistrot", "creperie", "kebab", "boulangerie", "patisserie",
    "salon de the",
  ],
  legal: ["avocat", "notaire", "huissier", "cabinet d'avocats", "juridique"],
  artisan: [
    "plombier", "electricien", "menuisier", "macon", "artisan",
    "peintre en batiment", "couvreur", "serrurier", "chauffagiste",
    "carreleur", "vitrier",
  ],
};

// Vocabulaire générique → vocabulaire adapté. Un remplacement mot-à-mot n'est
// sûr que si le mot de remplacement a EXACTEMENT le même genre ET le même
// nombre que le mot générique — sinon les accords déjà écrits dans la
// phrase (déterminant, adjectif, verbe) se retrouvent faux, ce qu'un
// remplacement déterministe ne peut pas corriger sans réanalyser toute la
// phrase (hors périmètre : "aucune IA").
//
// Vérifié sur le texte réel (causes.js/businessImpacts.js/googleImpacts.js/
// heroTemplates.js/whyNowTemplates.js/knowledgeMessages.js) :
//  - "client"/"patient" : même genre (masculin), même comportement singulier/
//    pluriel dans toutes les occurrences trouvées → remplacement mot-à-mot
//    sûr (SIMPLE_WORD_MAPPING_BY_SECTOR ci-dessous).
//  - "offre" (féminin singulier) : remplacé par un mot également féminin ET
//    du même nombre que l'occurrence trouvée → remplacement mot-à-mot sûr,
//    avec correction de l'euphonie "son/ma" (OFFER_EUPHONIC_DETERMINERS).
//  - "entreprise" (féminin) → "cabinet" (masculin) et "contact" (masculin) →
//    "prise de rendez-vous" (féminin) : un remplacement mot-à-mot casserait
//    l'accord d'un déterminant, d'un adjectif ou d'un participe DANS LA
//    MÊME phrase à chaque occurrence trouvée (ex. "l'entreprise est
//    pertinente" → resterait au féminin ; "prendre contact" est une
//    locution figée que "prendre prise de rendez-vous" rendrait absurde).
//    Ces deux mots restent donc demandés par la mission, mais traités
//    phrase par phrase : chaque occurrence RÉELLE et RÉPERTORIÉE de la
//    bibliothèque Reasoning/Composer actuelle est corrigée dans son
//    intégralité, déterminant et accords compris (ENTERPRISE_PHRASE_FIXES /
//    CONTACT_PHRASE_FIXES ci-dessous), plutôt qu'un mot isolé. Toute
//    occurrence future non répertoriée reste inchangée par sécurité (repli
//    sûr : le mot générique plutôt qu'un accord faux).
const SIMPLE_WORD_MAPPING_BY_SECTOR = {
  medical: {
    client: "patient",
    clients: "patients",
    offre: "spécialité",
    offres: "spécialités",
  },
  restaurant: {
    offre: "cuisine",
    offres: "cuisine",
  },
  legal: {
    offre: "pratique",
    offres: "pratiques",
  },
  artisan: {
    offre: "prestation",
    offres: "prestations",
  },
};

// "son/ton/mon" (formes masculines) sont utilisés en français devant "offre"
// uniquement pour l'euphonie (mot féminin commençant par une voyelle) — pas
// parce qu'"offre" serait masculin. Comme tous les mots de remplacement
// ci-dessus commencent par une consonne, le déterminant doit redevenir
// "sa/ta/ma" (ex. "son offre" → "sa spécialité", jamais "son spécialité").
// Traité à part, avant le remplacement mot-à-mot générique ci-dessus.
const OFFER_EUPHONIC_DETERMINERS = [
  [/\bson offre\b/gi, "sa"],
  [/\bton offre\b/gi, "ta"],
  [/\bmon offre\b/gi, "ma"],
];

// Chaque paire ci-dessous correspond à une phrase RÉELLEMENT trouvée dans
// businessImpacts.js/googleImpacts.js/heroTemplates.js/whyNowTemplates.js —
// vérifiée une par une pour rester grammaticalement correcte une fois
// "entreprise" (féminin) devenu "cabinet" (masculin) ou "établissement"
// (masculin, restaurant).
//
// Retour utilisateur (relecture) : "il peut contacter une autre entreprise
// avant de découvrir la vôtre" (businessImpacts.js) était jusqu'ici
// volontairement exclue, car corriger seulement "entreprise" y aurait laissé
// le pronom "la vôtre" (plus loin dans la même phrase) au féminin, en
// désaccord avec "cabinet"/"établissement" (masculins). Plutôt qu'un
// remplacement mot à mot, la PHRASE ENTIÈRE est réécrite ci-dessous (pronom
// inclus : "la vôtre" → "le vôtre"), ce qui lève le risque d'accord signalé
// à l'époque — toujours phrase par phrase, jamais de règle générique.
const ENTERPRISE_PHRASE_FIXES = {
  medical: [
    ["le sérieux de l'entreprise", "le sérieux du cabinet"],
    ["plusieurs entreprises apparaissent", "plusieurs cabinets apparaissent"],
    ["plusieurs entreprises affichées", "plusieurs cabinets affichés"],
    ["comparent plusieurs entreprises", "comparent plusieurs cabinets"],
    ["compare plusieurs entreprises", "compare plusieurs cabinets"],
    ["même si l'entreprise est pertinente", "même si le cabinet est pertinent"],
    ["que votre entreprise est déjà choisie", "que votre cabinet est déjà choisi"],
    ["votre entreprise dispose déjà", "votre cabinet dispose déjà"],
    ["si votre entreprise répond vraiment", "si votre cabinet répond vraiment"],
    ["contacter une entreprise mieux positionnée", "contacter un cabinet mieux positionné"],
    [
      "il peut contacter une autre entreprise avant de découvrir la vôtre",
      "il peut prendre rendez-vous dans un autre cabinet avant de découvrir le vôtre",
    ],
  ],
  restaurant: [
    ["compare plusieurs entreprises", "compare plusieurs établissements"],
    ["comparent plusieurs entreprises", "comparent plusieurs établissements"],
    [
      "il peut contacter une autre entreprise avant de découvrir la vôtre",
      "il peut choisir un autre établissement avant de découvrir le vôtre",
    ],
  ],
};

// Même principe pour "contact" (masculin) → "prise de rendez-vous"
// (féminin) : chaque tournure réellement trouvée est corrigée dans son
// intégralité (déterminant, adjectif, y compris les locutions figées comme
// "prendre contact" → "prendre rendez-vous", pas "prendre prise de
// rendez-vous"). Les entrées les plus spécifiques sont listées avant les
// plus générales pour être appliquées en premier (ex. "...contacts
// qualifiés" avant "...en contacts" tout court).
const CONTACT_PHRASE_FIXES = {
  medical: [
    ["consultations en contacts qualifiés", "consultations en prises de rendez-vous qualifiées"],
    ["davantage de consultations en contacts", "davantage de consultations en prises de rendez-vous"],
    ["capter le contact avant vous", "capter la demande de rendez-vous avant vous"],
    ["capter le contact avant que", "capter la prise de rendez-vous avant que"],
    ["avant le premier contact", "avant la première prise de rendez-vous"],
    ["son premier contact", "sa première prise de rendez-vous"],
    ["de prendre contact", "de prendre rendez-vous"],
    ["freiner le contact", "freiner la prise de rendez-vous"],
    ["une partie des contacts", "une partie des prises de rendez-vous"],
    ["les premiers contacts", "les premières prises de rendez-vous"],
    ["des contacts plus qualifiés", "des prises de rendez-vous plus qualifiées"],
    ["déclencher un contact", "déclencher une prise de rendez-vous"],
  ],
  // Premium Polish — objectif 9 (relecture éditoriale) : "consultations en
  // contacts qualifiés" (businessImpacts.js) est un jargon générique qui ne
  // sonne pas naturel pour un restaurant ("consultations", "contacts
  // qualifiés" évoquent un vocabulaire B2B/commercial, pas la restauration).
  // Même principe que ci-dessus : uniquement les tournures réellement
  // trouvées dans la bibliothèque actuelle, remplacées phrase par phrase.
  restaurant: [
    ["consultations en contacts qualifiés", "visites en réservations"],
    ["davantage de consultations en contacts", "davantage de visites en réservations"],
  ],
};

export function detectSector({ category } = {}) {
  const haystack = normalizeForMatch(category);
  if (!haystack) return null;
  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    if (keywords.some((keyword) => haystack.includes(keyword))) return sector;
  }
  return null;
}

function matchCase(source, replacement) {
  if (source[0] && source[0] === source[0].toUpperCase() && source[0] !== source[0].toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyPhraseFixes(text, sector, fixesBySector) {
  const fixes = sector ? fixesBySector[sector] : null;
  if (!fixes) return text;
  let result = text;
  for (const [source, target] of fixes) {
    const pattern = new RegExp(escapeRegExp(source), "gi");
    result = result.replace(pattern, (match) => matchCase(match, target));
  }
  return result;
}

export function adaptVocabulary(text, sector) {
  if (!sector || !present(text)) return text;
  let result = String(text);

  result = applyPhraseFixes(result, sector, ENTERPRISE_PHRASE_FIXES);
  result = applyPhraseFixes(result, sector, CONTACT_PHRASE_FIXES);

  const simpleMapping = SIMPLE_WORD_MAPPING_BY_SECTOR[sector];
  if (simpleMapping) {
    const singularOffer = simpleMapping.offre;
    if (singularOffer) {
      for (const [pattern, feminineDeterminer] of OFFER_EUPHONIC_DETERMINERS) {
        result = result.replace(pattern, (match) => matchCase(match, `${feminineDeterminer} ${singularOffer}`));
      }
    }

    for (const [generic, specific] of Object.entries(simpleMapping)) {
      const pattern = new RegExp(`\\b${generic}\\b`, "gi");
      result = result.replace(pattern, (match) => matchCase(match, specific));
    }
  }

  return result;
}

// Premium Polish — objectif 3 : la mission liste explicitement "conversion
// commerciale" parmi les mots à ne jamais employer pour un cabinet médical.
// Le libellé "Conversion" (traduction déjà existante de item.impactType
// "conversion", dans LABEL_TRANSLATIONS de renderAnalysisHtml.js — partagée
// avec le Diagnostic gratuit, donc non modifiée) est corrigé ici, en aval,
// uniquement pour les cartes premium qui appellent explicitement ce helper.
const IMPACT_LABEL_OVERRIDE_BY_SECTOR = {
  medical: { Conversion: "Prise de rendez-vous" },
};

export function adaptImpactLabel(label, sector) {
  const overrides = sector ? IMPACT_LABEL_OVERRIDE_BY_SECTOR[sector] : null;
  if (!overrides || !present(label)) return label;
  return overrides[label] || label;
}

/* -------------------------------------------------------------------------- */
/* Objectifs 1, 3 et 4 (migré depuis composer-engine/priorityFraming.js,      */
/* Sprint 3) — angle psychologique, Constat factuel, note effort/impact.      */
/* Aucune donnée recalculée : tout part de item.signal / item.evidence.value  */
/* / item.actionability déjà produits par Reasoning/Composer. Seule la        */
/* présentation change ici par rapport à la version Sprint 3 : les valeurs    */
/* numériques passent désormais par formatSignalValue (virgule française,     */
/* pluriel, ordinal) au lieu d'une concaténation brute.                       */
/* -------------------------------------------------------------------------- */

// Premium Polish — objectif 2 : ces angles s'affichaient jusqu'ici sous forme
// d'intitulés courts et abstraits ("CONFIANCE AVANT LE CLIC"), qui, une fois
// mis en capitales par le CSS (.eyebrow), ressemblaient à des étiquettes
// générées par un moteur plutôt qu'à une phrase qu'un consultant écrirait.
// Remplacés par des phrases complètes, concrètes, non sensationnalistes —
// et qui passent par adaptVocabulary() (via presentableText, au niveau du
// renderer) exactement comme item.title/item.reasoning : "clients" y devient
// "patients" pour le secteur médical, etc.
const SIGNAL_ANGLES = {
  rating: "Pourquoi votre note influence le premier choix de vos clients",
  reviews: "Le nombre d'avis reste l'un des signaux de confiance les plus regardés par vos clients",
  photos: "Vos photos aident vos clients à se projeter avant même de vous contacter",
  description: "Une description claire permet à vos clients de comprendre votre activité en quelques secondes",
  categories: "Ce que Google retient de votre activité détermine qui vous trouve",
  position: "Être visible au bon moment fait souvent la différence pour vos clients",
};

export function angleForSignal(signal) {
  return SIGNAL_ANGLES[signal] || null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const CONSTAT_BUILDERS = {
  rating: (value) => `Actuellement, votre note moyenne est de ${formatSignalValue("rating", value)}.`,
  reviews: (value) => `Actuellement, votre fiche compte ${formatSignalValue("reviews", value)}.`,
  photos: (value) => (value > 0
    ? `Actuellement, votre fiche présente ${formatSignalValue("photos", value)}.`
    : "Actuellement, votre fiche ne présente aucune photo."),
  description: (value) => (value > 0
    ? `Actuellement, votre description compte ${formatSignalValue("description", value)}.`
    : "Actuellement, votre fiche ne comporte aucune description."),
  categories: (value) => (value > 0
    ? `Actuellement, votre fiche référence ${formatSignalValue("categories", value)}.`
    : "Actuellement, votre fiche ne référence aucune catégorie secondaire."),
  position: (value) => `Actuellement, votre fiche apparaît en ${formatSignalValue("position", value)} sur la recherche testée.`,
};

export function buildConstat(item = {}) {
  const builder = CONSTAT_BUILDERS[item.signal];
  const value = toNumber(item.evidence?.value);
  if (!builder || value === null) return null;
  return builder(value);
}

const OPEN_ENDED_TIMES = new Set(["variable", "en continu", "long terme"]);

export function buildEffortImpactNote({ difficulty, estimatedTime } = {}) {
  const time = String(estimatedTime || "").trim().toLowerCase();

  if (OPEN_ENDED_TIMES.has(time)) {
    return "Cette amélioration se construit progressivement, mais elle renforce votre crédibilité sur la durée.";
  }
  if (difficulty === "hard") {
    return "Cette action demande davantage de temps, mais produit généralement un effet durable.";
  }
  if (difficulty === "medium") {
    return "Cette action demande un peu plus de temps, mais l'effet se voit rapidement sur votre fiche.";
  }
  if (difficulty === "easy") {
    return "Quelques minutes peuvent suffire à améliorer un élément pourtant très visible.";
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Objectifs 5 et 8 — preuve enrichie : la preuve ne se limite plus à une     */
/* juxtaposition de nombres ("Vous : 8 / Moyenne : 58,3"), elle raconte le    */
/* même fait en phrases ("Votre fiche affiche actuellement 8 avis. Les       */
/* concurrents analysés en affichent 58,3 en moyenne."). Aucune donnée        */
/* nouvelle : uniquement evidence.value / evidence.competitorMedian /         */
/* evidence.topCompetitor, déjà calculés par evidence.js (non modifié).       */
/*                                                                            */
/* { includeYou: false } permet d'omettre la phrase "vous" quand elle est     */
/* déjà dite ailleurs sur la même carte (le Constat de priorityCard) — pour   */
/* éviter de répéter mot pour mot la même valeur deux fois sur une seule      */
/* carte (objectifs 1 et 9).                                                 */
/* -------------------------------------------------------------------------- */

const EVIDENCE_YOU_INTRO = {
  rating: (value) => `Votre note moyenne est actuellement de ${value}.`,
  reviews: (value) => `Votre fiche affiche actuellement ${value}.`,
  photos: (value, rawValue) => (rawValue > 0
    ? `Votre galerie contient actuellement ${value}.`
    : "Votre galerie ne contient actuellement aucune photo."),
  description: (value, rawValue) => (rawValue > 0
    ? `Votre description compte actuellement ${value}.`
    : "Votre fiche ne comporte actuellement aucune description."),
  categories: (value, rawValue) => (rawValue > 0
    ? `Votre fiche référence actuellement ${value}.`
    : "Votre fiche ne référence actuellement aucune catégorie secondaire."),
  position: (value) => `Votre fiche apparaît actuellement en ${value}.`,
};

const EVIDENCE_MEDIAN_INTRO = {
  rating: (value) => `Les concurrents analysés affichent en moyenne ${value}.`,
  reviews: (value) => `Les concurrents analysés en affichent ${value} en moyenne.`,
  photos: (value) => `Les concurrents analysés en présentent ${value} en moyenne.`,
  description: (value) => `Les concurrents analysés utilisent en moyenne ${value}.`,
  categories: (value) => `Les concurrents analysés en référencent ${value} en moyenne.`,
  position: (value) => `En moyenne, les concurrents analysés se positionnent en position ${value}.`,
};

const EVIDENCE_BEST_INTRO = {
  rating: (value, name) => `La meilleure fiche observée affiche ${value}${name}.`,
  reviews: (value, name) => `La meilleure fiche observée en compte ${value}${name}.`,
  photos: (value, name) => `La meilleure fiche observée en présente ${value}${name}.`,
  description: (value, name) => `La meilleure fiche observée compte ${value}${name}.`,
  categories: (value, name) => `La meilleure fiche observée en référence ${value}${name}.`,
  position: (value, name) => `La meilleure fiche observée apparaît en ${value}${name}.`,
};

// Premium Polish — objectif 5 : le benchmark doit "nourrir le raisonnement",
// pas seulement juxtaposer deux nombres. Un écart de "8 avis" contre "58,3"
// est difficile à interpréter instantanément ; "soit près de sept fois
// plus" se comprend immédiatement. Aucune nouvelle donnée : une simple
// division des deux valeurs déjà connues (evidence.value,
// evidence.competitorMedian), jamais affichée si le rapport n'est pas assez
// net pour être un multiple entier lisible (entre 1 et 2, ou au-delà de 10,
// "X,XX fois plus" serait un chiffre artificiel, pas plus lisible que les
// deux valeurs brutes).
const FRENCH_SMALL_MULTIPLIERS = ["zéro", "une", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix"];

function multiplierPhrase(value, competitorMedian) {
  const base = Number(value);
  const other = Number(competitorMedian);
  if (!Number.isFinite(base) || !Number.isFinite(other) || base <= 0 || other <= 0) return null;

  const ratio = other / base;
  if (ratio >= 1.5) {
    const rounded = Math.round(ratio);
    if (rounded >= 2 && rounded <= 10) return `soit près de ${FRENCH_SMALL_MULTIPLIERS[rounded]} fois plus`;
    if (rounded > 10) return "soit nettement plus";
    return null;
  }
  if (ratio <= 0.67) {
    const invertedRounded = Math.round(1 / ratio);
    if (invertedRounded >= 2 && invertedRounded <= 10) return `soit près de ${FRENCH_SMALL_MULTIPLIERS[invertedRounded]} fois moins`;
    if (invertedRounded > 10) return "soit nettement moins";
    return null;
  }
  return null;
}

export function buildEvidenceNarrative(evidence, signal, { includeYou = true } = {}) {
  if (!evidence) return null;
  const youBuilder = EVIDENCE_YOU_INTRO[signal];
  const medianBuilder = EVIDENCE_MEDIAN_INTRO[signal];
  const bestBuilder = EVIDENCE_BEST_INTRO[signal];
  if (!youBuilder || !medianBuilder || !bestBuilder) return null;

  const sentences = [];

  if (includeYou && present(evidence.value)) {
    const youFormatted = formatSignalValue(signal, evidence.value);
    if (youFormatted) sentences.push(youBuilder(youFormatted, Number(evidence.value)));
  }

  if (present(evidence.competitorMedian)) {
    // La position moyenne d'un panel n'est pas un rang unique observable :
    // on affiche un nombre simple ("position 4,3"), jamais un faux ordinal
    // ("4,3e"), qui n'aurait pas de sens sur une moyenne. Le multiplicateur
    // n'a pas non plus de sens pour un rang (un rang plus bas est meilleur,
    // le rapport s'interpréterait à l'envers) : réservé aux autres signaux.
    const medianFormatted = signal === "position"
      ? formatFrenchNumber(evidence.competitorMedian)
      : formatSignalValue(signal, evidence.competitorMedian);
    if (medianFormatted) {
      let sentence = medianBuilder(medianFormatted);
      if (signal !== "position" && present(evidence.value)) {
        const multiplier = multiplierPhrase(evidence.value, evidence.competitorMedian);
        if (multiplier) sentence = sentence.replace(/\.$/, `, ${multiplier}.`);
      }
      sentences.push(sentence);
    }
  }

  const bestValue = evidence.topCompetitor && present(evidence.topCompetitor.value)
    ? evidence.topCompetitor.value
    : null;
  if (bestValue !== null) {
    const bestFormatted = formatSignalValue(signal, bestValue);
    if (bestFormatted) {
      const name = evidence.topCompetitor?.name ? ` (${evidence.topCompetitor.name})` : "";
      sentences.push(bestBuilder(bestFormatted, name));
    }
  }

  if (!sentences.length) return null;
  return cleanTypography(sentences.join(" "));
}

// Premium Polish (retour utilisateur) — objectif "preuves plus visuelles" :
// une mini-jauge "Vous / Concurrents" à côté de la phrase de preuve, pour que
// l'écart se voie immédiatement, sans lecture. Aucune donnée nouvelle :
// mêmes deux valeurs déjà utilisées par buildEvidenceNarrative()
// (evidence.value, evidence.competitorMedian) — uniquement une largeur en %
// dérivée de leur rapport. Volontairement omis pour le signal "position" :
// une valeur plus basse y est meilleure, une barre plus longue = plus
// mauvais s'y lirait à l'envers et induirait le lecteur en erreur.
export function evidenceBarData(evidence, signal) {
  if (!evidence || signal === "position") return null;
  const youValue = toNumber(evidence.value);
  const competitorValue = toNumber(evidence.competitorMedian);
  if (youValue === null || competitorValue === null || youValue < 0 || competitorValue < 0) return null;

  const youLabel = formatSignalValue(signal, youValue);
  const competitorLabel = formatSignalValue(signal, competitorValue);
  if (!youLabel || !competitorLabel) return null;

  const max = Math.max(youValue, competitorValue) || 1;
  // Largeur minimale de 4 % : une valeur à 0 reste visible comme un trait,
  // jamais totalement invisible (le lecteur doit voir qu'il y a une barre,
  // pas croire à une case vide/cassée).
  const youPct = Math.max(4, Math.round((youValue / max) * 100));
  const competitorPct = Math.max(4, Math.round((competitorValue / max) * 100));

  return { youLabel, competitorLabel, youPct, competitorPct };
}

// Premium Polish (retour utilisateur) — objectif "couverture adaptée au
// score" : le paragraphe sous la jauge de la page de couverture (hero.score,
// déjà calculé par Composer/scoreEngine, jamais recalculé ici) restait
// jusqu'ici identique quel que soit le résultat, ce qui sonnait faux pour un
// score faible ("vous faites déjà mieux que..." serait trop flatteur à
// 30/100). Trois registres, mêmes seuils que ceux demandés : rassurer sous
// 40, valoriser une base déjà solide entre 40 et 70, valoriser l'acquis et
// parler d'optimisation fine au-delà de 70.
export function scoreInterpretationNote(score) {
  const value = toNumber(score);
  if (value === null) {
    return "Les recommandations de ce rapport visent à renforcer votre visibilité et votre crédibilité sur Google.";
  }
  if (value > 70) {
    return "Vous faites déjà mieux que de nombreux établissements comparables. Les recommandations de ce rapport relèvent désormais surtout de l'optimisation fine.";
  }
  if (value >= 40) {
    return "Vous disposez déjà d'une base solide. Les recommandations de ce rapport visent à combler l'écart qui vous sépare encore des meilleures fiches de votre secteur.";
  }
  return "Rien n'est figé : chaque recommandation de ce rapport a été choisie pour rester simple à mettre en place, sans bouleverser votre organisation actuelle.";
}

// Premium Polish (retour utilisateur) — objectif "benchmark plus lisible" :
// un repère "Top X %" à partir de evidence.percentileRank, DÉJÀ calculé par
// benchmarkEngine.js (functions/lib/reasoning-engine/evidence.js) pour
// rating/reviews/photos — jamais recalculé ici, seulement mis en mots.
// percentileRank = part du panel que vous surpassez (plus haut = meilleur),
// donc valable uniquement pour ces trois signaux (absent ailleurs, evidence.js
// ne le calcule pas pour position/description/categories — cette fonction
// renvoie alors naturellement null, sans qu'il soit nécessaire de re-tester
// le signal ici).
// Premium Polish (retour utilisateur) — objectif "score par domaine plus
// lisible" : une courte phrase sous chaque barre, pour ne pas laisser le
// lecteur interpréter seul un pourcentage. Générique et valable pour
// n'importe quel domaine (Réputation, Visibilité, Photos, Contenu...) :
// aucune affirmation propre à un domaine précis n'est inventée (on ne dit
// jamais, par exemple, "vos concurrents ont plus de photos" pour le domaine
// Photos — cette donnée n'est pas connue à ce niveau), seulement une lecture
// du pourcentage déjà calculé par scoreEngine.js (buildDomains(),
// narrativeModel.js, non modifiés).
// Premium Polish (retour utilisateur) — objectif "pourquoi cet ordre" : une
// phrase courte expliquant le classement, pour que le lecteur comprenne
// immédiatement pourquoi une priorité arrive avant une autre. Construite
// uniquement à partir de item.rank/item.severity/item.actionability.difficulty
// (déjà calculés par Composer, jamais recalculés ici) — sans jamais prétendre
// connaître le détail exact de la formule de classement de Composer : une
// lecture prudente et honnête des deux mêmes informations déjà affichées sur
// la carte (Impact, Difficulté), jamais une nouvelle affirmation.
export function buildRankRationale(item = {}) {
  const rank = Number(item.rank);
  if (!Number.isFinite(rank)) return null;
  const difficulty = item.actionability?.difficulty;

  if (rank === 1) {
    return difficulty === "easy"
      ? "Cette priorité arrive en tête : peu d'effort suffit ici pour un impact déjà visible."
      : "Cette priorité arrive en tête car son impact sur votre visibilité est le plus déterminant parmi les axes identifiés.";
  }
  return "Cette priorité vient ensuite : son effet reste réel, mais moins urgent que la précédente.";
}

// Premium Polish (retour utilisateur) — objectif "conclusion plus mémorable" :
// une dernière phrase, plus personnelle, en clôture de la page "En résumé".
// Sectorisée comme IMPACT_LABEL_OVERRIDE_BY_SECTOR (repli générique par
// défaut, un texte dédié seulement quand la mission l'a explicitement
// demandé) — jamais une nouvelle affirmation sur les données du rapport,
// uniquement une phrase de cadrage générale, vraie pour n'importe quel audit
// Efficia (le rapport ne porte que sur la présentation Google, jamais sur la
// qualité réelle de l'activité).
const CLOSING_STATEMENT_BY_SECTOR = {
  medical: "La qualité de votre prise en charge existe déjà. Ce rapport a pour objectif d'aider vos futurs patients à la percevoir plus facilement avant leur premier rendez-vous.",
};

const DEFAULT_CLOSING_STATEMENT = "L'objectif n'est pas de transformer votre activité, mais de faire en sorte que votre fiche Google reflète pleinement la qualité de votre établissement.";

export function buildClosingStatement(sector) {
  return (sector && CLOSING_STATEMENT_BY_SECTOR[sector]) || DEFAULT_CLOSING_STATEMENT;
}

export function domainQualitativeNote(pct, label) {
  if (!present(pct) || !present(label)) return null;
  const value = Number(pct);
  if (!Number.isFinite(value)) return null;
  if (value >= 0.8) return `${label} est un point fort solide de votre fiche.`;
  if (value >= 0.6) return `${label} est à un bon niveau, avec une marge de progression.`;
  if (value >= 0.4) return `${label} mérite d'être renforcé : l'écart avec vos concurrents est visible.`;
  return `${label} est aujourd'hui le point le plus prioritaire de votre fiche.`;
}

export function benchmarkPositionLabel(percentileRank) {
  const value = toNumber(percentileRank);
  if (value === null) return null;
  if (value >= 90) return "Vous faites partie des mieux placés sur ce point (top 10 %).";
  if (value >= 75) return "Vous vous situez dans le premier quart sur ce point (top 25 %).";
  if (value >= 50) return "Vous vous situez au-dessus de la moyenne sur ce point.";
  if (value >= 25) return "Vous vous situez en dessous de la moyenne sur ce point.";
  return "Vous faites partie des moins bien placés sur ce point.";
}
