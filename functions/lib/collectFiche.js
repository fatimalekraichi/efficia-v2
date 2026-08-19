import { hasGoogleMapsHost, resolveGoogleMapsUrl } from "./googleMapsUrl.js";

// Logique de collecte Outscraper (Appel A), partagée par /api/outscraper et /api/analyze.
// Ne dépend d'AUCUN objet Request/Response : reçoit { nom, ville, apiKey }, renvoie un
// résultat structuré :
//   succès -> { ok: true, fiche: {...} }
//   erreur -> { ok: false, code: <statut HTTP suggéré>, error: "...", status?: <statut amont> }

const OUTSCRAPER_HOST = "https://api.app.outscraper.com";
const OUTSCRAPER_SEARCH_PATH = "/maps/search-v3";
const DEFAULT_TIMEOUT_MS = 25000;

// Objectif 2 (mission "corriger les deux problèmes critiques") — avant ce
// correctif, organizationsPerQueryLimit=1 : Outscraper ne renvoyait qu'UN
// SEUL résultat, jamais comparé à rien, pris tel quel. C'est la cause exacte
// du bug d'identification (Objectif 1) : "Électricité Schroeder Eric" ->
// "Shrader Electric LLC", "CDV Construction" -> "CDG Construction", "Beauty
// House Ophélie" -> "Beauty A" — dans les trois cas, aucune alternative
// n'était jamais examinée. On demande désormais plusieurs candidats et on
// choisit celui qui ressemble le plus à ce qui a été demandé.
const CANDIDATE_LIMIT = 5;

// Mission "remplacer la logique actuelle de décision du pipeline
// d'identification par une logique métier déterministe" — la décision ne
// repose plus d'abord sur un score de confiance (seuils/écarts), mais sur
// des règles métier appliquées dans un ordre fixe (voir decideOutcome
// ci-dessous). Le score de confiance reste calculé (computeConfidence,
// rankCandidates) mais ne sert plus qu'à trier/afficher les candidats —
// Objectif 4.
//
// NAME_AUTO_THRESHOLD — Objectif 2 : "un seul candidat restant, ville
// cohérente, nom raisonnablement proche" -> sélection automatique, sans
// validation manuelle. Basé sur `nameOverlap` (chevauchement de mots seul,
// voir computeConfidence) plutôt que sur le score de confiance complet.
// Calibré sur les variantes normales citées explicitement par la mission
// (candidat unique, ville déjà cohérente à ce stade — l'élimination de ville
// a lieu AVANT ce seuil, voir Objectif 1) :
//   "Garage Auto Claude" / "Auto Claude"                          -> 0.794
//   "Garage R.G. Pneus" / "Garage R.G. Pneus (Régis Gofflot)"     -> 0.574
//   "Taverne Chez Tony & Lucy" / "La Taverne - Tony & Lucy Café"  -> 0.500
// contre des noms proches mais réellement différents, qui ne doivent JAMAIS
// être auto-sélectionnés (une seule lettre change le nom propre) :
//   "Boucherie Marchal" / "Boucherie Marchand"                    -> 0.333
//   "Pharmacie Léonard" / "Pharmacie Leonart"                     -> 0.333
// Marge nette de chaque côté (0,333 -> 0,500) : seuil posé à 0.45.
const NAME_AUTO_THRESHOLD = 0.45;

// DOMINANT_NAME_OVERLAP / DOMINANT_GAP — quand plusieurs candidats
// franchissent NAME_AUTO_THRESHOLD (donc, en théorie, Règle 3 : validation
// manuelle), un seul peut malgré tout se détacher si nettement des autres
// qu'il s'agit en pratique du même cas que la Règle 2 — le score de
// confiance sert alors de signal SECONDAIRE de départage (Objectif 4),
// jamais de critère principal. Exemple réel de calibrage : "Garage Martin"
// (recherché "Garage Martin", nameOverlap 1.0) et "Coiffure Martin" (même
// ville, nameOverlap 0.588 — chevauchement élevé uniquement parce que
// "garage" et "coiffure" sont tous deux des mots génériques de secteur, donc
// peu pondérés) ne doivent pas déclencher une validation manuelle inutile :
// le premier est un candidat manifestement dominant. À l'inverse, "AS Pro
// Elec" (deux établissements distincts, nameOverlap 1.0 chacun puisque le
// nom est strictement identique) ne doit JAMAIS être détecté comme dominant
// (écart nul) — reste un cas réellement ambigu (Objectif 3).
const DOMINANT_NAME_OVERLAP = 0.90;
const DOMINANT_GAP = 0.30;

function toNumberOrNull(v) {
  return v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
}

function isUsablePlaceCandidate(place) {
  if (!place || typeof place !== "object") return false;
  const name = String(place.name || "").trim();
  if (!name) return false;
  const placeId = String(place.place_id || "").trim();
  return !placeId || !/^__[^_]+(?:_[^_]+)*__$/.test(placeId);
}

// --- Objectif 2 : score de confiance entre l'entreprise demandée et une ----
// --- fiche Google candidate. Aucune dépendance externe (comparaison texte --
// --- déterministe uniquement). -------------------------------------------
function stripDiacritics(value) {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Formes juridiques fréquentes en Belgique/France/zone testée : ignorées
// dans la comparaison de noms, sinon elles diluent la vraie similarité
// (ex. "Garage Pneus Courtois SRL" vs "Garage Pneus M. Courtois"). Objectif 4
// (mission "rendre l'identification suffisamment robuste") — liste étendue.
const LEGAL_FORM_SUFFIXES = new Set([
  "sprl", "srl", "sa", "sc", "scrl", "scs", "snc", "asbl", "vzw", "gie", "sca",
  "llc", "inc", "ltd", "gmbh", "eurl", "sasu", "sas", "bv", "nv", "ets", "ei", "eirl",
]);

// Objectif 4 — "mots significatifs du nom" : les mots de secteur d'activité
// (garage, construction, restaurant...) sont fréquents entre CONCURRENTS du
// même secteur et donc peu discriminants pour identifier UNE entreprise
// précise — deux garages partagent le mot "garage", ça ne prouve rien sur
// leur identité. Les mots distinctifs (noms propres, enseignes) comptent
// donc davantage dans la similarité. Liste non exhaustive, construite à
// partir des secteurs réellement rencontrés sur la campagne de 20 audits ;
// un mot absent de cette liste garde son poids plein par défaut (repli sûr :
// ne jamais sous-noter un mot qu'on ne reconnaît pas).
const GENERIC_BUSINESS_WORDS = new Set([
  "garage", "construction", "entreprise", "cabinet", "atelier", "societe", "service", "services",
  "magasin", "boutique", "restaurant", "cafe", "bar", "institut", "salon", "menuiserie",
  "renovation", "renov", "electricite", "electricien", "plomberie", "plombier", "chauffage",
  "chauffagiste", "carrosserie", "pneu", "pneus", "auto", "autos", "automobile", "batiment",
  "peinture", "couverture", "toiture", "kine", "kinesitherapie", "kinesitherapeute",
  "osteopathe", "beaute", "esthetique", "esthetician", "coiffure", "taverne", "brasserie",
  "pizzeria", "snack", "traiteur", "sanitaire", "chauffagistes",
]);
const GENERIC_WORD_WEIGHT = 0.35;

function normalizeForCompare(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !LEGAL_FORM_SUFFIXES.has(token))
    .join(" ")
    .trim();
}

function tokenize(value) {
  return normalizeForCompare(value).split(/\s+/).filter(Boolean);
}

// Chevauchement de mots pondéré : un mot générique de secteur compte pour
// GENERIC_WORD_WEIGHT, un mot distinctif (nom propre, enseigne) compte pour
// 1 — pour que "CDV" / "CDG" (mots distinctifs différents) pèse davantage
// que "Construction" partagé par les deux (mot générique).
function tokenOverlapRatio(a, b) {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (!tokensA.size || !tokensB.size) return 0;
  const weightOf = (token) => (GENERIC_BUSINESS_WORDS.has(token) ? GENERIC_WORD_WEIGHT : 1);
  const allTokens = new Set([...tokensA, ...tokensB]);
  let intersectionWeight = 0;
  let unionWeight = 0;
  for (const token of allTokens) {
    const weight = weightOf(token);
    unionWeight += weight;
    if (tokensA.has(token) && tokensB.has(token)) intersectionWeight += weight;
  }
  return unionWeight ? intersectionWeight / unionWeight : 0;
}

function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const rows = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) rows[i][0] = i;
  for (let j = 0; j <= n; j += 1) rows[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      rows[i][j] = a[i - 1] === b[j - 1]
        ? rows[i - 1][j - 1]
        : 1 + Math.min(rows[i - 1][j - 1], rows[i - 1][j], rows[i][j - 1]);
    }
  }
  return rows[m][n];
}

function levenshteinRatio(a, b) {
  const normalizedA = normalizeForCompare(a);
  const normalizedB = normalizeForCompare(b);
  const maxLen = Math.max(normalizedA.length, normalizedB.length);
  if (!maxLen) return 1;
  return 1 - (levenshteinDistance(normalizedA, normalizedB) / maxLen);
}

// Combine deux mesures complémentaires : le chevauchement de mots (robuste
// aux réordonnancements et aux mots en plus/en moins, ex. "Garage Auto
// Claude" / "Auto Claude") et la distance d'édition normalisée (robuste aux
// variations de casse/accents/ponctuation, ex. "AS Pro Elec" / "AS pro
// elec"). Ni l'une ni l'autre seule ne suffit sur les 20 cas réels testés.
function nameSimilarity(a, b) {
  return (0.6 * tokenOverlapRatio(a, b)) + (0.4 * levenshteinRatio(a, b));
}

// Les champs "city" renvoyés par Outscraper sont fréquemment vides (observé
// sur la campagne réelle : place.city === "" pour la quasi-totalité des 20
// fiches collectées). Une ville candidate absente ne doit donc jamais faire
// chuter la confiance à zéro — seule une VRAIE divergence (ville connue et
// différente de celle demandée) doit pénaliser. -1 signale précisément ce
// cas (ville connue ET différente) pour permettre un rejet net dans
// computeConfidence ci-dessous (Objectif 6 : "une entreprise dont la ville
// diffère n'est jamais retenue" — vérifié sur la campagne réelle : c'est
// exactement ce qui distingue "CDG Construction" (ville détectée "Virton")
// de "CDV Construction" demandée à Arlon — la seule similarité de nom ne
// suffisait pas à l'écarter, la ville si).
function citySimilarity(villeTrim, place) {
  const requested = normalizeForCompare(villeTrim);
  if (!requested) return 0.5;
  const candidateCity = normalizeForCompare(place.city || place.borough || place.county || "");
  if (candidateCity) {
    const matches = candidateCity === requested
      || candidateCity.includes(requested)
      || requested.includes(candidateCity);
    return matches ? 1 : -1;
  }
  // Adresse présente mais sans le champ "city" structuré : un indice
  // supplémentaire seulement si elle CONTIENT la ville demandée (signal
  // positif fiable) — son absence dans l'adresse ne prouve rien (formats
  // d'adresse variables, code postal seul, etc.), donc pas de rejet net ici.
  const candidateAddress = normalizeForCompare(place.address || place.full_address || "");
  if (candidateAddress && candidateAddress.includes(requested)) return 1;
  return 0.5;
}

// Objectif 4 — téléphone et site, "lorsque c'est disponible" : aujourd'hui
// aucune interface n'envoie ces valeurs attendues (Mode 2 du formulaire
// "Nouvel audit" ne collecte que nom + ville), donc ces fonctions ne sont
// jamais exercées en pratique pour l'instant — mais le pipeline sait déjà
// les exploiter dès qu'une source (commande liée, futur champ du
// formulaire) les fournira, sans qu'il faille retoucher le score.
function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  // Ignore un éventuel préfixe international (00/+) déjà retiré par \D, on
  // compare seulement les 9 derniers chiffres (numéro national) : évite un
  // faux rejet entre "+32 495 81 04 90" et "0495 81 04 90".
  return digits.slice(-9);
}

function phoneSimilarity(expected, candidatePhone) {
  const expectedDigits = normalizePhone(expected);
  const candidateDigits = normalizePhone(candidatePhone);
  if (!expectedDigits || !candidateDigits) return null;
  return expectedDigits === candidateDigits ? 1 : 0;
}

function extractDomain(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function siteSimilarity(expected, candidateSite) {
  const expectedDomain = extractDomain(expected);
  const candidateDomain = extractDomain(candidateSite);
  if (!expectedDomain || !candidateDomain) return null;
  return expectedDomain === candidateDomain ? 1 : 0;
}

// Objectif 4 — score de confiance déterministe, explicable, sans IA/LLM.
// `attendu` (optionnel, {categorie, telephone, site, adresse}) n'est pris en
// compte QUE lorsqu'il est fourni ET que le candidat a une valeur
// correspondante — dans tous les autres cas (aujourd'hui, systématiquement,
// voir commentaire ci-dessus), seuls le nom et la ville comptent, à
// l'identique du comportement déjà calibré sur la campagne réelle.
function computeConfidence({ nomTrim, villeTrim, place, attendu = {} }) {
  const nameScore = nameSimilarity(nomTrim, place.name || "");
  const cityScore = citySimilarity(villeTrim, place);
  const cityMismatch = cityScore < 0;

  // Ville confirmée différente : on ne l'ajoute plus comme composante de la
  // moyenne pondérée (une pénalité y noyait même les meilleurs scores de nom,
  // ex. "Sanidubru" == "SANIDUBRU" à 100 % rejeté à tort). Le nom porte seul
  // la confiance de base ; la divergence de ville est appliquée ensuite,
  // explicitement, via CITY_MISMATCH_PENALTY/CITY_MISMATCH_CAP ci-dessous.
  const components = cityMismatch
    ? [{ key: "name", score: nameScore, weight: 0.7 }]
    : [
      { key: "name", score: nameScore, weight: 0.7 },
      { key: "city", score: cityScore, weight: 0.3 },
    ];

  if (attendu.categorie) {
    const categoryScore = nameSimilarity(attendu.categorie, place.category || place.type || "");
    if (place.category || place.type) components.push({ key: "category", score: categoryScore, weight: 0.10 });
  }
  if (attendu.telephone) {
    const phoneScore = phoneSimilarity(attendu.telephone, place.phone);
    if (phoneScore !== null) components.push({ key: "phone", score: phoneScore, weight: 0.15 });
  }
  if (attendu.site) {
    const siteScore = siteSimilarity(attendu.site, place.site || place.website);
    if (siteScore !== null) components.push({ key: "site", score: siteScore, weight: 0.15 });
  }
  if (attendu.adresse) {
    const addressScore = nameSimilarity(attendu.adresse, place.address || place.full_address || "");
    if (place.address || place.full_address) components.push({ key: "address", score: addressScore, weight: 0.10 });
  }

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const confidence = totalWeight
    ? components.reduce((sum, c) => sum + (c.score * c.weight), 0) / totalWeight
    : 0;

  // Mission "logique métier déterministe" — Objectif 1 : un candidat dont la
  // ville est connue ET confirmée différente est désormais éliminé avant
  // même d'être comparé (voir decideOutcome ci-dessous), donc `confidence`
  // n'a plus besoin d'être plafonnée ici pour rester sûre : elle reste la
  // valeur brute, utile telle quelle dans les logs de diagnostic pour
  // comprendre POURQUOI un candidat a été écarté (nom réellement proche ou
  // non, indépendamment de la ville).
  //
  // `nameOverlap` (Objectif 2) — chevauchement de MOTS seul (sans la
  // composante de distance d'édition qui compose nameScore) : calibré
  // séparément car nameScore, pensé pour classer/afficher des candidats déjà
  // connus comme plausibles, se révèle trompeur pour la décision "ce nom
  // est-il une simple variante de formulation ?". Exemple réel observé lors
  // du calibrage : "Boucherie Marchal" / "Boucherie Marchand" obtient un
  // nameScore (0,556) PLUS ÉLEVÉ que "Garage R.G. Pneus" / "Garage R.G.
  // Pneus (Régis Gofflot)" (0,558 — quasiment égal), alors que le premier
  // couple désigne deux commerces différents (une seule lettre finale change
  // "Marchal" en "Marchand") et le second la même entreprise reformulée : la
  // composante de distance d'édition de nameScore récompense à tort une
  // quasi-similarité orthographique entre deux noms propres différents.
  // nameOverlap, basé uniquement sur les MOTS partagés (et non leur
  // proximité lettre à lettre), sépare nettement les deux cas (0,333 contre
  // 0,574) — voir decideOutcome pour son usage.
  const nameOverlap = tokenOverlapRatio(nomTrim, place.name || "");

  return { nameScore, nameOverlap, cityScore, confidence, cityMismatch, components };
}

// Objectif 2 — "ne jamais prendre automatiquement le premier" : on note
// chaque candidat renvoyé par Outscraper et on retient le mieux noté, jamais
// le premier de la liste par défaut.
function rankCandidates({ nomTrim, villeTrim, places, attendu }) {
  return places
    .map((place) => ({ place, ...computeConfidence({ nomTrim, villeTrim, place, attendu }) }))
    .sort((a, b) => b.confidence - a.confidence);
}

// Mission "remplacer la logique actuelle de décision du pipeline
// d'identification par une logique métier déterministe" — Objectifs 1 à 4 :
// trois règles métier appliquées DANS CET ORDRE, le score de confiance ne
// sert qu'à trier/afficher à l'intérieur de chaque règle.
//
//  Règle 1 (Objectif 1, "la ville devient prioritaire") — un candidat dont
//  la ville est connue ET confirmée différente de celle demandée est
//  ÉLIMINÉ : il ne participe même plus au calcul qui suit (ex. Arlon !=
//  Virton, Messancy != Steinfort). `cityMismatch`, posé par
//  computeConfidence/citySimilarity, signale précisément ce cas — jamais une
//  ville simplement absente côté candidat, qui reste neutre. Si TOUS les
//  candidats sont éliminés par cette règle -> rejet immédiat (aucune
//  entreprise fiable trouvée), sans même regarder les noms.
//
//  Règle 2 (Objectif 2, "un seul candidat cohérent") — parmi les survivants
//  de la Règle 1, si un seul a un nom raisonnablement proche
//  (NAME_AUTO_THRESHOLD) -> sélection AUTOMATIQUE, jamais de validation
//  manuelle pour une simple variante de formulation (ex. "Garage Auto
//  Claude" -> "Auto Claude").
//
//  Règle 3 (Objectif 3, "validation manuelle seulement pour les cas
//  réellement ambigus") — s'il reste plusieurs candidats au nom
//  raisonnablement proche (ex. "AS Pro Elec" : deux établissements distincts,
//  même nom, même ville), ou si aucun ne franchit clairement ce seuil mais
//  qu'au moins un survivant existe malgré tout (Objectif 4 : le rejet reste
//  l'exception, jamais un choix arbitraire) -> validation manuelle, avec la
//  liste réelle des candidats disponibles. Exception (Objectif 4, score en
//  signal secondaire) : si l'un des candidats plausibles se détache
//  nettement des autres (DOMINANT_NAME_OVERLAP/DOMINANT_GAP), il est traité
//  comme la Règle 2 plutôt que d'imposer une validation manuelle inutile.
function decideOutcome(ranked) {
  const surviving = ranked.filter((entry) => !entry.cityMismatch);

  if (!surviving.length) {
    return { tier: "rejected", plausibleCount: 0, survivingCount: 0 };
  }

  const plausible = surviving
    .filter((entry) => entry.nameOverlap >= NAME_AUTO_THRESHOLD)
    .sort((a, b) => b.nameOverlap - a.nameOverlap);

  if (plausible.length === 1) {
    return { tier: "auto", best: plausible[0], plausibleCount: 1, survivingCount: surviving.length };
  }

  if (plausible.length >= 2) {
    const [top, second] = plausible;
    const dominant = top.nameOverlap >= DOMINANT_NAME_OVERLAP
      && (top.nameOverlap - second.nameOverlap) >= DOMINANT_GAP;
    if (dominant) {
      return { tier: "auto", best: top, plausibleCount: plausible.length, survivingCount: surviving.length };
    }
    return { tier: "ambiguous", candidates: plausible, plausibleCount: plausible.length, survivingCount: surviving.length };
  }

  // plausible.length === 0 : ville cohérente mais aucun nom individuellement
  // assez proche pour trancher seul (ex. "Électricité Schroeder Eric" ->
  // "Shrader Electric LLC") — jamais un rejet arbitraire tant qu'un candidat
  // existe réellement : validation manuelle avec les survivants tels quels.
  return { tier: "ambiguous", candidates: surviving, plausibleCount: 0, survivingCount: surviving.length };
}

// Extraction + normalisation de la première fiche (mêmes champs que la sortie publique actuelle).
function mapPlace(place) {
  const hasAnyField = (...keys) => keys.some((key) => Object.prototype.hasOwnProperty.call(place, key));
  const observed_fields = [
    hasAnyField("description") ? "description" : null,
    hasAnyField("working_hours") ? "working_hours" : null,
    hasAnyField("subtypes") ? "subtypes" : null,
    hasAnyField("phone") ? "phone" : null,
    hasAnyField("site", "website") ? "site" : null,
    hasAnyField("address", "full_address") ? "address" : null,
    hasAnyField("services", "service_options", "service_list") ? "services" : null,
  ].filter(Boolean);
  const photos_sample = Array.isArray(place.photos_sample)
    ? place.photos_sample
        .slice(0, 5)
        .map((p) => {
          const src = typeof p === "string" ? p : (p && (p.photo_url || p.photo_url_big)) || "";
          return src ? { photo_url: src } : null;
        })
        .filter(Boolean)
    : [];

  let subtypes = [];
  if (Array.isArray(place.subtypes)) subtypes = place.subtypes.filter((s) => typeof s === "string" && s.trim());
  else if (typeof place.subtypes === "string" && place.subtypes.trim()) {
    subtypes = place.subtypes.split(",").map((s) => s.trim()).filter(Boolean);
  }

  return {
    name: place.name || "",
    place_id: place.place_id || "",
    rating: toNumberOrNull(place.rating),
    reviews: toNumberOrNull(place.reviews),
    photos_count: toNumberOrNull(place.photos_count),
    description: place.description || "",
    photos_sample,
    working_hours: place.working_hours ?? null,
    subtypes,
    location_link: place.location_link || "",
    // CID Google (identifiant unique alternatif au place_id) : utilisé pour exclure la fiche
    // analysée de ses propres concurrents (voir collectCompetitors.js). Outscraper l'expose sous
    // des noms de champ variables selon les endpoints ; on couvre les variantes connues.
    cid: place.cid || place.google_id || place.googleId || "",
    // Champs Outscraper documentés (dictionnaire Google Maps) mais jusqu'ici jamais extraits :
    // category/type (catégorie), phone (téléphone), site/website (site web), address (adresse).
    category: place.category || "",
    type: place.type || "",
    phone: place.phone || "",
    site: place.site || place.website || "",
    address: place.address || place.full_address || "",
    // Localisation : city (ville) et borough/county (repli) — permettent de déduire automatiquement
    // la ville quand elle n'a pas été saisie manuellement. Jamais utilisés pour inventer une valeur :
    // si Outscraper ne les renvoie pas, ces champs restent vides.
    city: place.city || "",
    borough: place.borough || place.county || "",
    observed_fields,
    ...(observed_fields.includes("services") ? {
      services: place.services ?? place.service_options ?? place.service_list ?? [],
    } : {}),
  };
}

export async function collectFiche({
  nom, ville, queryOverride, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS,
  // Objectif 2 (mission "rendre l'identification suffisamment robuste") —
  // conservé pour compatibilité ascendante : si un appelant ne renvoie que
  // l'identifiant (sans `selectedCandidate`, voir ci-dessous), on retombe
  // sur l'ancien comportement (redemande à Outscraper, cherche le même
  // place_id) — voir plus bas, après la collecte des candidats.
  selectedPlaceId,
  // Mission "logique métier déterministe" — Objectif 5 : quand
  // l'administrateur a déjà choisi un candidat parmi une liste ambiguë
  // précédemment présentée, le candidat COMPLET (déjà reçu dans cette même
  // liste, champ `raw` — voir plus bas) est renvoyé tel quel plutôt que son
  // seul place_id. Cause exacte du bug SELECTED_CANDIDATE_NOT_FOUND observé
  // sur "Beauty House Ophélie" : l'ancienne approche relançait une recherche
  // identique et cherchait à retrouver le même place_id — or Outscraper ne
  // garantit aucune stabilité de ses résultats entre deux appels identiques
  // consécutifs (constaté sur la campagne réelle : "Beauty A" présent dans
  // la première réponse, absent de la seconde quelques secondes plus tard).
  // Un candidat déjà vu en détail par un humain n'a plus besoin d'être
  // "retrouvé" : on l'utilise directement, sans aucun nouvel appel réseau.
  selectedCandidate,
  // Objectif 4 — signaux optionnels supplémentaires, voir computeConfidence.
  attendu,
  suppressSensitiveLogs = false,
} = {}) {
  if (isUsablePlaceCandidate(selectedCandidate)) {
    if (!suppressSensitiveLogs) {
      console.log("collectFiche:manual-selection-direct", {
        place_id: selectedCandidate.place_id,
        name: selectedCandidate.name || null,
      });
    }
    return { ok: true, fiche: selectedCandidate, confidence: null, tier: "manual" };
  }

  const nomTrim = (nom || "").trim();
  const villeTrim = (ville || "").trim();
  let directQuery = (queryOverride || "").trim();
  if (!directQuery && (!nomTrim || !villeTrim)) {
    return { ok: false, code: 400, error: "Missing required parameters: nom, ville." };
  }

  if (hasGoogleMapsHost(directQuery)) {
    const resolution = await resolveGoogleMapsUrl(directQuery);
    if (!resolution.ok) {
      return { ok: false, code: 404, error: resolution.error };
    }
    directQuery = resolution.url;
  }

  // .trim() : évite un 401 si le secret a été stocké avec un espace / retour ligne final.
  const key = (apiKey || "").trim();
  if (!key) {
    console.error("collectFiche: OUTSCRAPER_API_KEY manquant dans l'environnement.");
    return { ok: false, code: 500, error: "Server configuration error." };
  }

  const query = directQuery || `${nomTrim} ${villeTrim}`;
  const url = new URL(OUTSCRAPER_HOST + OUTSCRAPER_SEARCH_PATH);
  url.searchParams.set("query", query);
  url.searchParams.set("organizationsPerQueryLimit", String(CANDIDATE_LIMIT));
  url.searchParams.set("async", "false");
  url.searchParams.set("language", "fr");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  let bodyText;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: { "X-API-KEY": key, "Accept": "application/json" },
      signal: controller.signal,
    });
    bodyText = await res.text();
  } catch (err) {
    console.error("collectFiche: appel amont échoué", err && err.name);
    return { ok: false, code: 502, error: "Outscraper request failed." };
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    console.error("collectFiche: réponse amont non OK", res.status);
    return { ok: false, code: 502, error: "Outscraper returned an error.", status: res.status };
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    console.error("collectFiche: réponse amont non JSON");
    return { ok: false, code: 502, error: "Invalid response from Outscraper." };
  }

  if (payload && typeof payload.status === "string" && payload.status.toLowerCase() === "pending") {
    console.error("collectFiche: réponse Pending (mode async non géré ici)");
    return { ok: false, code: 502, error: "Outscraper is processing asynchronously." };
  }

  // data est un tableau par requête, de tableaux de lieux.
  const data = payload && payload.data;
  let candidates = [];
  if (Array.isArray(data) && data.length) {
    const firstQuery = data[0];
    candidates = Array.isArray(firstQuery)
      ? firstQuery.filter(isUsablePlaceCandidate)
      : (isUsablePlaceCandidate(firstQuery) ? [firstQuery] : []);
  }

  // Objectif 5 (logs de diagnostic temporaires, à retirer une fois le
  // correctif validé sur la campagne réelle) : visibilité brute -> choisi.
  if (!suppressSensitiveLogs) {
    console.log("collectFiche:raw-candidates", {
      query,
      count: candidates.length,
      names: candidates.map((c) => c.name || "(sans nom)"),
    });
  }

  if (!candidates.length) {
    return { ok: false, code: 404, error: "No business found." };
  }

  // Repli historique (voir commentaire sur `selectedCandidate` plus haut) :
  // seul le place_id a été renvoyé, sans le candidat complet — on retente
  // une recherche identique et on cherche le même identifiant. Ce chemin
  // reste possible mais expose de nouveau à la non-déterminisme d'Outscraper
  // (SELECTED_CANDIDATE_NOT_FOUND) ; tous les appelants internes (UI admin,
  // script de campagne) envoient désormais `selectedCandidate` et ne passent
  // plus par ici.
  if (selectedPlaceId) {
    const chosen = candidates.find((c) => (c.place_id || "") === selectedPlaceId);
    if (!suppressSensitiveLogs) {
      console.log("collectFiche:manual-selection", {
        query,
        selectedPlaceId,
        found: Boolean(chosen),
        name: chosen?.name || null,
      });
    }
    if (!chosen) {
      return {
        ok: false,
        code: 409,
        error: "SELECTED_CANDIDATE_NOT_FOUND",
        message: "Le candidat sélectionné n'a pas pu être retrouvé. Merci de relancer la recherche.",
      };
    }
    return { ok: true, fiche: mapPlace(chosen), confidence: null, tier: "manual" };
  }

  // Requête par URL/observationQuery directe (Mode "URL Google Business
  // seule") : aucun nom/ville de référence à comparer, on ne peut pas noter
  // les candidats — comportement historique conservé à l'identique (premier
  // résultat, déjà résolu par Outscraper à partir de l'URL elle-même).
  if (!nomTrim || !villeTrim) {
    if (!suppressSensitiveLogs) {
      console.log("collectFiche:selected-without-scoring", { name: candidates[0].name || "(sans nom)" });
    }
    return { ok: true, fiche: mapPlace(candidates[0]), tier: "auto" };
  }

  // Objectifs 1-4 : on note chaque candidat (nom + ville [+ signaux
  // optionnels]) puis on applique les règles métier déterministes (voir
  // decideOutcome ci-dessus) — la ville prime, puis le nombre de candidats
  // plausibles restants décide seul entre automatique/manuel/rejet. Le
  // classement par confiance (rankCandidates) reste utile pour trier
  // l'affichage et les logs, mais ne pilote plus la décision elle-même.
  const ranked = rankCandidates({ nomTrim, villeTrim, places: candidates, attendu });
  const outcome = decideOutcome(ranked);
  const { tier, plausibleCount, survivingCount } = outcome;

  // Objectif 5 — journal de décision : entreprise demandée, candidats et
  // leur score, ville éliminée ou non, entreprise retenue (ou non), raison
  // de la décision. Pensé pour être lisible directement dans les logs
  // serveur.
  const reason = tier === "auto"
    ? `candidat unique après élimination de ville (nameOverlap ${outcome.best.nameOverlap.toFixed(3)} >= seuil ${NAME_AUTO_THRESHOLD}) -> sélection automatique.`
    : tier === "ambiguous"
      ? `${survivingCount} candidat(s) restant(s) après élimination de ville, ${plausibleCount} au nom raisonnablement proche -> validation humaine requise.`
      : `aucun candidat ne correspond à la ville demandée (${ranked.length} candidat(s) reçu(s), tous éliminés) -> aucune entreprise fiable trouvée.`;

  if (!suppressSensitiveLogs) {
    console.log("collectFiche:decision-log", {
      requested: { nom: nomTrim, ville: villeTrim },
      candidates: ranked.map((entry) => ({
        name: entry.place.name || "(sans nom)",
        place_id: entry.place.place_id || null,
        nameScore: Number(entry.nameScore.toFixed(3)),
        nameOverlap: Number(entry.nameOverlap.toFixed(3)),
        cityScore: entry.cityScore,
        confidence: Number(entry.confidence.toFixed(3)),
        cityMismatch: Boolean(entry.cityMismatch),
      })),
      survivingCount,
      plausibleCount,
      tier,
      selected: tier === "auto" ? (outcome.best.place.name || "(sans nom)") : null,
      reason,
    });
  }

  if (tier === "rejected") {
    return {
      ok: false,
      code: 404,
      error: "No reliable business match found.",
      message: "Aucune entreprise fiable trouvée.",
      reason,
    };
  }

  if (tier === "ambiguous") {
    // Objectif 3 — jamais de choix arbitraire : on relaie les candidats
    // réellement disponibles (voir decideOutcome) pour validation humaine
    // côté interface d'administration. `raw` porte la fiche complète
    // (mêmes champs que mapPlace()) : Objectif 5, permet à l'appelant de
    // renvoyer directement `selectedCandidate` sans jamais avoir besoin de
    // rappeler Outscraper pour "retrouver" le candidat choisi.
    return {
      ok: false,
      code: 409,
      error: "AMBIGUOUS_CANDIDATES",
      message: "Nous avons trouvé plusieurs entreprises pouvant correspondre.",
      reason,
      candidates: outcome.candidates.map((entry) => ({
        placeId: entry.place.place_id || "",
        name: entry.place.name || "",
        city: entry.place.city || entry.place.borough || entry.place.county || "",
        address: entry.place.address || entry.place.full_address || "",
        rating: toNumberOrNull(entry.place.rating),
        reviews: toNumberOrNull(entry.place.reviews),
        confidence: Number(entry.confidence.toFixed(3)),
        raw: mapPlace(entry.place),
      })),
    };
  }

  return { ok: true, fiche: mapPlace(outcome.best.place), confidence: outcome.best.confidence, tier: "auto", reason };
}

export const __test__ = {
  nameSimilarity,
  citySimilarity,
  computeConfidence,
  rankCandidates,
  decideOutcome,
  normalizeForCompare,
  phoneSimilarity,
  siteSimilarity,
  tokenOverlapRatio,
  levenshteinRatio,
  NAME_AUTO_THRESHOLD,
  DOMINANT_NAME_OVERLAP,
  DOMINANT_GAP,
  CANDIDATE_LIMIT,
  isUsablePlaceCandidate,
};
