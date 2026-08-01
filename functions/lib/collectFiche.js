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

// Seuil minimal de confiance en dessous duquel on refuse d'utiliser un
// résultat plutôt que de risquer une mauvaise identification. Calibré sur
// les 20 audits réels de la campagne de test (voir
// tests/collectFiche.test.js) : sépare le cas le plus net (nom totalement
// différent, ex. "Shrader Electric LLC" pour "Électricité Schroeder Eric",
// confiance ≈ 0.24) des correspondances légitimes les plus faibles observées
// (ex. "Entreprise Hubermont" pour "Hubermont Philippe", confiance ≈ 0.32).
const MIN_CONFIDENCE = 0.25;

// Mission "rendre l'identification suffisamment robuste pour la bêta" —
// Objectif 1 : en dessous de ce seuil, la sélection automatique n'est plus
// autorisée, même si elle dépasse MIN_CONFIDENCE. Entre les deux seuils, un
// candidat est "plausible" mais pas certain (ex. "Beauty A" pour "Beauty
// House Ophélie" : même ville, nom partiellement proche, confiance
// suffisante pour ne pas être rejeté, très insuffisante pour être accepté
// sans vérification) — Objectif 2 : validation humaine obligatoire dans cet
// intervalle, jamais de choix arbitraire.
const HIGH_CONFIDENCE_THRESHOLD = 0.95;

function toNumberOrNull(v) {
  return v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
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
  if (cityScore < 0) {
    // Rejet net : ville connue et confirmée différente de celle demandée,
    // quelle que soit la ressemblance du nom.
    return { nameScore, cityScore: 0, confidence: 0, cityMismatch: true, components: [] };
  }

  const components = [
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

  return { nameScore, cityScore, confidence, components };
}

// Objectif 2 — "ne jamais prendre automatiquement le premier" : on note
// chaque candidat renvoyé par Outscraper et on retient le mieux noté, jamais
// le premier de la liste par défaut.
function rankCandidates({ nomTrim, villeTrim, places, attendu }) {
  return places
    .map((place) => ({ place, ...computeConfidence({ nomTrim, villeTrim, place, attendu }) }))
    .sort((a, b) => b.confidence - a.confidence);
}

// Objectif 1/3 — trois paliers de décision, jamais un choix arbitraire entre
// les deux seuils :
//  - confidence >= HIGH_CONFIDENCE_THRESHOLD -> sélection automatique
//  - MIN_CONFIDENCE <= confidence < HIGH_CONFIDENCE_THRESHOLD -> ambigu,
//    validation humaine obligatoire (Objectif 2)
//  - confidence < MIN_CONFIDENCE -> rejet net, "Aucune entreprise fiable
//    trouvée." (Objectif 3)
function classifyConfidence(confidence) {
  if (confidence >= HIGH_CONFIDENCE_THRESHOLD) return "auto";
  if (confidence >= MIN_CONFIDENCE) return "ambiguous";
  return "rejected";
}

// Extraction + normalisation de la première fiche (mêmes champs que la sortie publique actuelle).
function mapPlace(place) {
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
  };
}

export async function collectFiche({
  nom, ville, queryOverride, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS,
  // Objectif 2 — quand l'administrateur a déjà choisi un candidat parmi une
  // liste ambiguë (voir functions/api/analyze.js), on redemande les mêmes
  // candidats à Outscraper et on utilise directement celui dont le place_id
  // correspond, sans repasser par le score de confiance : un choix humain
  // explicite prime toujours sur le calcul automatique.
  selectedPlaceId,
  // Objectif 4 — signaux optionnels supplémentaires, voir computeConfidence.
  attendu,
} = {}) {
  const nomTrim = (nom || "").trim();
  const villeTrim = (ville || "").trim();
  const directQuery = (queryOverride || "").trim();
  if (!directQuery && (!nomTrim || !villeTrim)) {
    return { ok: false, code: 400, error: "Missing required parameters: nom, ville." };
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
      ? firstQuery.filter((item) => item && typeof item === "object")
      : (firstQuery && typeof firstQuery === "object" ? [firstQuery] : []);
  }

  // Objectif 5 (logs de diagnostic temporaires, à retirer une fois le
  // correctif validé sur la campagne réelle) : visibilité brute -> choisi.
  console.log("collectFiche:raw-candidates", {
    query,
    count: candidates.length,
    names: candidates.map((c) => c.name || "(sans nom)"),
  });

  if (!candidates.length) {
    return { ok: false, code: 404, error: "No business found." };
  }

  // Objectif 2 — un administrateur a déjà tranché parmi une liste ambiguë
  // précédemment présentée : on l'utilise directement, sans repasser par le
  // score. Prime sur tout le reste (y compris le mode URL ci-dessous).
  if (selectedPlaceId) {
    const chosen = candidates.find((c) => (c.place_id || "") === selectedPlaceId);
    console.log("collectFiche:manual-selection", {
      query,
      selectedPlaceId,
      found: Boolean(chosen),
      name: chosen?.name || null,
    });
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
    console.log("collectFiche:selected-without-scoring", { name: candidates[0].name || "(sans nom)" });
    return { ok: true, fiche: mapPlace(candidates[0]), tier: "auto" };
  }

  // Objectif 1/2/3 : on note chaque candidat (nom + ville [+ signaux
  // optionnels]) et on retient le mieux classé — jamais automatiquement le
  // premier de la liste — puis on applique les trois paliers de décision.
  const ranked = rankCandidates({ nomTrim, villeTrim, places: candidates, attendu });
  const best = ranked[0];
  const tier = classifyConfidence(best.confidence);

  // Objectif 5 — journal de décision : entreprise demandée, candidats et
  // leur score, entreprise retenue (ou non), raison de la décision ou du
  // rejet. Pensé pour être lisible directement dans les logs serveur.
  const reason = tier === "auto"
    ? `confiance ${best.confidence.toFixed(3)} >= seuil de sélection automatique ${HIGH_CONFIDENCE_THRESHOLD} -> sélection automatique.`
    : tier === "ambiguous"
      ? `confiance ${best.confidence.toFixed(3)} entre le seuil minimal ${MIN_CONFIDENCE} et le seuil automatique ${HIGH_CONFIDENCE_THRESHOLD} -> validation humaine requise.`
      : `confiance ${best.confidence.toFixed(3)} < seuil minimal ${MIN_CONFIDENCE} -> aucune entreprise fiable trouvée.`;

  console.log("collectFiche:decision-log", {
    requested: { nom: nomTrim, ville: villeTrim },
    candidates: ranked.map((entry) => ({
      name: entry.place.name || "(sans nom)",
      place_id: entry.place.place_id || null,
      nameScore: Number(entry.nameScore.toFixed(3)),
      cityScore: entry.cityScore,
      confidence: Number(entry.confidence.toFixed(3)),
      cityMismatch: Boolean(entry.cityMismatch),
    })),
    tier,
    selected: tier === "auto" ? (best.place.name || "(sans nom)") : null,
    reason,
  });

  if (tier === "rejected") {
    return {
      ok: false,
      code: 404,
      error: "No reliable business match found.",
      message: "Aucune entreprise fiable trouvée.",
      confidence: best.confidence,
      reason,
    };
  }

  if (tier === "ambiguous") {
    // Objectif 2 — jamais de choix arbitraire : on relaie tous les
    // candidats plausibles (confiance >= MIN_CONFIDENCE) pour validation
    // humaine côté interface d'administration.
    return {
      ok: false,
      code: 409,
      error: "AMBIGUOUS_CANDIDATES",
      message: "Nous avons trouvé plusieurs entreprises pouvant correspondre.",
      reason,
      candidates: ranked
        .filter((entry) => entry.confidence >= MIN_CONFIDENCE)
        .map((entry) => ({
          placeId: entry.place.place_id || "",
          name: entry.place.name || "",
          city: entry.place.city || entry.place.borough || entry.place.county || "",
          address: entry.place.address || entry.place.full_address || "",
          rating: toNumberOrNull(entry.place.rating),
          reviews: toNumberOrNull(entry.place.reviews),
          confidence: Number(entry.confidence.toFixed(3)),
        })),
    };
  }

  return { ok: true, fiche: mapPlace(best.place), confidence: best.confidence, tier: "auto", reason };
}

export const __test__ = {
  nameSimilarity,
  citySimilarity,
  computeConfidence,
  rankCandidates,
  classifyConfidence,
  normalizeForCompare,
  phoneSimilarity,
  siteSimilarity,
  MIN_CONFIDENCE,
  HIGH_CONFIDENCE_THRESHOLD,
  CANDIDATE_LIMIT,
};
