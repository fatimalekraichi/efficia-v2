// Collecte concurrentielle locale Outscraper (Appel B).
// Reçoit { activite, ville, requete, placeIdCible, cidCible, urlCible, apiKey }, renvoie :
//   succès -> { ok: true, requete, position, concurrents }
//   erreur -> { ok: false, code, error, status? }
// placeIdCible/cidCible/urlCible identifient la fiche déjà analysée (Appel A) : toute fiche brute
// correspondant à l'un de ces identifiants est exclue de `concurrents` avant retour — la fiche
// analysée ne doit jamais apparaître comme son propre concurrent.

import { extractActionLinkEvidence } from "./actionLinkEvidence.js";

const OUTSCRAPER_HOST = "https://api.app.outscraper.com";
const OUTSCRAPER_SEARCH_PATH = "/maps/search-v3";
const DEFAULT_TIMEOUT_MS = 25000;

function toNumberOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const normalized = typeof v === "string" ? v.trim().replace(",", ".") : v;
  return Number.isFinite(Number(normalized)) ? Number(normalized) : null;
}

function firstPhotoUrl(place) {
  if (!place || typeof place !== "object") return "";
  if (typeof place.photo === "string" && place.photo) return place.photo;
  if (typeof place.photo_url === "string" && place.photo_url) return place.photo_url;
  if (typeof place.photo_url_big === "string" && place.photo_url_big) return place.photo_url_big;

  const collections = [place.photos_sample, place.photos, place.images].filter(Array.isArray);
  for (const collection of collections) {
    for (const item of collection) {
      if (typeof item === "string" && item) return item;
      if (item && typeof item === "object") {
        const src = item.photo_url || item.photo_url_big || item.url || item.src;
        if (typeof src === "string" && src) return src;
      }
    }
  }

  return "";
}

function mapCompetitor(place) {
  const services = Array.isArray(place.services) ? place.services.length : toNumberOrNull(place.services_count);
  const publications = Array.isArray(place.posts) ? place.posts.length : toNumberOrNull(place.posts_count);
  return {
    name: place.name || "",
    place_id: place.place_id || "",
    rating: toNumberOrNull(place.rating),
    reviews: toNumberOrNull(place.reviews),
    photos_count: toNumberOrNull(place.photos_count),
    services_count: services,
    posts_count: publications,
    photo: firstPhotoUrl(place),
  };
}

function normalizeCategoryList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function mapTargetObservation(place) {
  if (!place || typeof place !== "object") return null;
  const secondaryAvailable = Object.prototype.hasOwnProperty.call(place, "subtypes");
  const actionLinkEvidence = extractActionLinkEvidence(place);
  return {
    primaryCategory: String(place.category || place.type || "").trim(),
    secondaryCategories: secondaryAvailable ? normalizeCategoryList(place.subtypes) : [],
    secondaryCategoriesStatus: secondaryAvailable ? "available" : "unavailable",
    locationLink: String(place.location_link || "").trim(),
    placeId: String(place.place_id || "").trim(),
    cid: String(place.cid || place.google_id || place.googleId || "").trim(),
    actionLinksStatus: actionLinkEvidence.availability,
    actionLinks: actionLinkEvidence.links,
  };
}

const RANK_FIELDS = ["rank", "position", "search_rank", "search_position", "local_rank"];

function numericRank(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = typeof value === "string" ? value.trim().replace(",", ".") : value;
  const number = Number(normalized);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function isMapMarkerOnly(place) {
  if (!place || typeof place !== "object") return false;
  if (place.is_map_marker === true || place.map_marker === true || place.marker_only === true) return true;
  const type = String(place.result_type || place.resultType || "").trim().toLowerCase();
  return type === "map_marker" || type === "marker" || type === "map-only";
}

export function normalizeProviderRank(place, zeroBasedIndex) {
  const field = RANK_FIELDS.find((key) => numericRank(place?.[key]) !== null);
  if (field) {
    const rawRank = numericRank(place[field]);
    if (rawRank === zeroBasedIndex) {
      return { rawRank, normalizedOneBasedRank: rawRank + 1, source: `provider_${field}_zero_based` };
    }
    if (rawRank === zeroBasedIndex + 1) {
      return { rawRank, normalizedOneBasedRank: rawRank, source: `provider_${field}_one_based` };
    }
    return { rawRank, normalizedOneBasedRank: null, source: `provider_${field}_ambiguous` };
  }
  if (isMapMarkerOnly(place)) {
    return { rawRank: zeroBasedIndex, normalizedOneBasedRank: null, source: "map_marker_without_list_rank" };
  }
  return {
    rawRank: zeroBasedIndex,
    normalizedOneBasedRank: zeroBasedIndex + 1,
    source: "provider_result_index_zero_based",
  };
}

function extractPlaces(payload) {
  const data = payload && payload.data;
  if (!Array.isArray(data) || !data.length) return [];
  const firstQuery = data[0];
  if (Array.isArray(firstQuery)) return firstQuery.filter(item => item && typeof item === "object");
  return firstQuery && typeof firstQuery === "object" ? [firstQuery] : [];
}

function normalizeAdLabel(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

const SPONSORED_LABELS = new Set([
  "sponsorise",
  "sponsored",
  "ad",
  "advertisement",
  "paid",
  "paid result",
  "paid_result",
]);

const SPONSORED_BOOLEAN_FIELDS = ["sponsored", "is_sponsored", "isSponsored", "is_ad", "isAd"];
const SPONSORED_VALUE_FIELDS = ["ad", "result_type", "resultType", "type", "label", "badge"];
const CLASSIFICATION_FIELDS = [...SPONSORED_BOOLEAN_FIELDS, "ad", "result_type", "resultType"];

function isExplicitTrue(value) {
  return value === true || value === 1 || normalizeAdLabel(value) === "true";
}

// Une fiche n'est publicitaire que lorsqu'un champ fournisseur explicite le
// confirme. Le nom commercial n'est jamais inspecté et aucune position n'est
// corrigée arbitrairement en l'absence de marqueur fiable.
export function isSponsoredResult(place) {
  if (!place || typeof place !== "object") return false;
  if (SPONSORED_BOOLEAN_FIELDS.some((field) => isExplicitTrue(place[field]))) return true;
  return SPONSORED_VALUE_FIELDS.some((field) => SPONSORED_LABELS.has(normalizeAdLabel(place[field])));
}

function hasSponsorshipClassification(place) {
  if (!place || typeof place !== "object") return false;
  return isSponsoredResult(place) || CLASSIFICATION_FIELDS
    .some((field) => Object.prototype.hasOwnProperty.call(place, field));
}

export function addSearchResultContext(normalized, competitorResult) {
  const base = normalized && typeof normalized === "object" ? normalized : {};
  const rankEvidence = competitorResult?.rankEvidence;
  const withRank = rankEvidence ? {
    ...base,
    search_rank_context: {
      raw_rank: rankEvidence.rawRank ?? null,
      normalized_one_based_rank: rankEvidence.normalizedOneBasedRank ?? null,
      source: String(rankEvidence.source || "unknown"),
    },
  } : base;
  if (competitorResult?.positionKind !== "organic") {
    const { search_result_context: _obsoleteSearchResultContext, ...withoutSearchResultContext } = withRank;
    return withoutSearchResultContext;
  }
  return {
    ...withRank,
    search_result_context: {
      position_kind: "organic",
      sponsored_results_excluded: Number(competitorResult.sponsoredResultsExcluded) || 0,
    },
  };
}

// Normalisation légère pour comparer deux URL Google (espaces superflus, casse) sans dépendre
// d'une éventuelle différence de tracking/paramètres mineurs entre deux appels Outscraper distincts.
function normalizeUrlForComparison(value) {
  return (value || "").trim().toLowerCase();
}

// Bug corrigé — "l'entreprise est présente dans ses propres concurrents" : avant cette fonction,
// seul le place_id était comparé, et seulement si placeIdCible était renseigné (sinon aucune
// exclusion n'avait lieu). On compare désormais aussi le CID et l'URL Google, dès que l'un OU
// l'autre identifiant cible est disponible — un concurrent brut est considéré "même fiche" dès
// qu'UN SEUL identifiant correspond.
function buildIsSameBusiness({ placeIdCible, cidCible, urlCible }) {
  const targetPlaceId = (placeIdCible || "").trim();
  const targetCid = (cidCible || "").trim();
  const targetUrl = normalizeUrlForComparison(urlCible);

  return function isSameBusiness(place) {
    if (!place || typeof place !== "object") return false;
    const placeId = (place.place_id || "").trim();
    const cid = (place.cid || place.google_id || place.googleId || "").trim();
    const url = normalizeUrlForComparison(place.location_link);

    if (targetPlaceId && placeId && placeId === targetPlaceId) return true;
    if (targetCid && cid && cid === targetCid) return true;
    if (targetUrl && url && url === targetUrl) return true;
    return false;
  };
}

function normalizeIdentityText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function competitorIdentityKeys(place) {
  const keys = [];
  const placeId = String(place?.place_id || "").trim();
  const cid = String(place?.cid || place?.google_id || place?.googleId || "").trim();
  const url = normalizeUrlForComparison(place?.location_link);
  const name = normalizeIdentityText(place?.name);
  const address = normalizeIdentityText(place?.full_address || place?.address);
  if (placeId) keys.push(`place:${placeId}`);
  if (cid) keys.push(`cid:${cid}`);
  if (url) keys.push(`url:${url}`);
  if (name) keys.push(`name-address:${name}|${address}`);
  return keys;
}

export function selectValidReviewCompetitors(places, limit = 3) {
  const selected = [];
  const seen = new Set();
  for (const place of Array.isArray(places) ? places : []) {
    const reviews = toNumberOrNull(place?.reviews);
    if (reviews === null || reviews < 0) continue;
    const identityKeys = competitorIdentityKeys(place);
    if (identityKeys.some((key) => seen.has(key))) continue;
    identityKeys.forEach((key) => seen.add(key));
    selected.push(place);
    if (selected.length >= limit) break;
  }
  return selected;
}

export async function collectCompetitors({
  activite, ville, requete: requeteExplicite, placeIdCible, cidCible, urlCible, apiKey,
  timeoutMs = DEFAULT_TIMEOUT_MS, suppressSensitiveLogs = false,
} = {}) {
  const activiteTrim = (activite || "").trim();
  const villeTrim = (ville || "").trim();
  const requeteTrim = (requeteExplicite || "").trim();
  if (!requeteTrim && (!activiteTrim || !villeTrim)) {
    return { ok: false, code: 400, error: "Missing required parameters: activite, ville." };
  }

  const key = (apiKey || "").trim();
  if (!key) {
    console.error("collectCompetitors: OUTSCRAPER_API_KEY manquant dans l'environnement.");
    return { ok: false, code: 500, error: "Server configuration error." };
  }

  const requete = requeteTrim || `${activiteTrim} ${villeTrim}`;
  const url = new URL(OUTSCRAPER_HOST + OUTSCRAPER_SEARCH_PATH);
  url.searchParams.set("query", requete);
  url.searchParams.set("organizationsPerQueryLimit", "10");
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
    console.error("collectCompetitors: appel amont échoué", err && err.name);
    return { ok: false, code: 502, error: "Outscraper request failed." };
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    console.error("collectCompetitors: réponse amont non OK", res.status);
    return { ok: false, code: 502, error: "Outscraper returned an error.", status: res.status };
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    console.error("collectCompetitors: réponse amont non JSON");
    return { ok: false, code: 502, error: "Invalid response from Outscraper." };
  }

  if (payload && typeof payload.status === "string" && payload.status.toLowerCase() === "pending") {
    console.error("collectCompetitors: réponse Pending (mode async non géré ici)");
    return { ok: false, code: 502, error: "Outscraper is processing asynchronously." };
  }

  const places = extractPlaces(payload);
  const sponsoredResults = places.filter(isSponsoredResult);
  const sponsorshipClassificationAvailable = places.some(hasSponsorshipClassification);
  const organicPlaces = places.filter((place) => !isSponsoredResult(place));
  const rankedPlaces = sponsorshipClassificationAvailable ? organicPlaces : places;
  const isSameBusiness = buildIsSameBusiness({ placeIdCible, cidCible, urlCible });
  const targetIndex = rankedPlaces.findIndex((place) => isSameBusiness(place));
  const rankEvidence = targetIndex >= 0
    ? normalizeProviderRank(rankedPlaces[targetIndex], targetIndex)
    : { rawRank: null, normalizedOneBasedRank: 0, source: "target_not_found" };
  const position = rankEvidence.normalizedOneBasedRank;

  // Objectif 5 (mission "corriger les deux problèmes critiques", logs de
  // diagnostic temporaires — à retirer une fois le correctif validé sur la
  // campagne réelle) : trace brut -> exclu -> conservé, pour objectiver ce
  // qui se passe réellement à chaque étape plutôt que de le supposer.
  if (!suppressSensitiveLogs) {
    console.log("collectCompetitors:raw-results", {
      requete,
      count: places.length,
      names: places.map((p) => p.name || "(sans nom)"),
    });
  }

  const excluded = rankedPlaces.filter((place) => isSameBusiness(place));
  const targetObservation = mapTargetObservation(excluded[0]);
  const afterExclusion = rankedPlaces.filter((place) => !isSameBusiness(place));

  if (!suppressSensitiveLogs) {
    console.log("collectCompetitors:after-self-exclusion", {
      excludedCount: excluded.length,
      excludedNames: excluded.map((p) => p.name || "(sans nom)"),
      remainingCount: afterExclusion.length,
    });
  }

  const concurrents = selectValidReviewCompetitors(afterExclusion, 3).map(mapCompetitor);

  if (!suppressSensitiveLogs) {
    console.log("collectCompetitors:retained", {
      retainedCount: concurrents.length,
      retainedNames: concurrents.map((c) => c.name || "(sans nom)"),
    });
  }

  return {
    ok: true,
    requete,
    position,
    concurrents,
    positionKind: sponsorshipClassificationAvailable ? "organic" : "observed",
    sponsoredResultsExcluded: sponsoredResults.length,
    targetObservation,
    rankEvidence,
  };
}

export const __test__ = { mapTargetObservation, isMapMarkerOnly };
