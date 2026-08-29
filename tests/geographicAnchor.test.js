// Mission "ancrage géographique automatique", corrigée par la mission
// "corriger la méthode d'ancrage géographique de la recherche
// concurrentielle" — tests unitaires purs pour :
//  - resolveGeographicAnchorLocality (SYNCHRONE) : l'IDENTITÉ de la localité
//    (ville/code postal/pays) déterminée uniquement à partir de données déjà
//    vérifiées côté serveur — jamais une coordonnée, jamais l'adresse ou les
//    coordonnées propres à l'entreprise analysée ;
//  - resolveGeographicAnchor (ASYNCHRONE) : le POINT neutre (coordonnées)
//    mesuré au centre de cette localité via geocoding — jamais celui de
//    l'entreprise analysée. AUCUN repli : un geocoding qui échoue ou dont la
//    réponse ne valide pas strictement (ville/code postal/pays incohérents,
//    coordonnées absentes) bloque entièrement (ok:false) — jamais un simple
//    paramètre "region" transmis en remplacement.
//
// Cas réel de référence : Computelec, Le Sart 18/3, 6840 Neufchâteau,
// Belgique — location_link réel observé lors de l'identification de la
// fiche (Appel A Outscraper). Position automatique observée 3e alors qu'une
// recherche manuelle affiche 7e : la cause exacte était la mesure du
// classement depuis l'épingle Google Maps propre à Computelec plutôt que
// depuis le centre de sa localité.
import assert from "node:assert/strict";
import test from "node:test";

import { extractCoordinatesFromLocationLink } from "../functions/lib/googleMapsUrl.js";
import {
  resolveGeographicAnchor, resolveGeographicAnchorLocality, buildGeographicAnchorRecord,
} from "../functions/lib/geographicAnchor.js";

const COMPUTELEC_LOCATION_LINK = "https://www.google.com/maps/place/Computelec/@49.816779999999994,5.449034,14z/data=!4m8!1m2!2m1!1sComputelec!3m4!1s0x821e9402e9f2375b:0x3706196cb9aab69b!8m2!3d49.816779999999994!4d5.449034";
// Épingle propre à Computelec — sert dans ces tests UNIQUEMENT à prouver
// qu'elle n'est jamais utilisée comme point de mesure (voir garantie 1).
const COMPUTELEC_OWN_COORDINATES = "49.816779999999994,5.449034";
// Centre neutre de Neufchâteau (Belgique) tel que renvoyé par le geocoding
// simulé dans ces tests — délibérément différent de l'épingle ci-dessus.
const NEUFCHATEAU_BE_CENTER = { lat: 49.8419, lng: 5.4342, city: "Neufchâteau", postalCode: "6840" };
const NEUFCHATEAU_FR_CENTER = { lat: 48.3538, lng: 5.6975, city: "Neufchâteau", postalCode: "88300" };

// Simule l'endpoint officiel Outscraper Geocoding (GET
// https://api.outscraper.com/geocoding) : renvoie un résultat qui VALIDE
// strictement (city/postal_code/country_code cohérents) contre le centre
// attendu pour la région demandée — sinon aucun résultat exploitable,
// jamais un point deviné.
function fakeGeocodingFetch(centersByRegion) {
  return async (input) => {
    const url = new URL(String(input));
    const region = url.searchParams.get("region");
    const center = centersByRegion[region];
    if (!center) return Response.json({ data: [[]] });
    return Response.json({
      data: [[{
        latitude: center.lat, longitude: center.lng,
        city: center.city, postal_code: center.postalCode, country_code: region,
      }]],
    });
  };
}

// --- Extraction de coordonnées depuis un location_link (googleMapsUrl.js) ---
// Toujours utilisée ailleurs (vérification Google Maps affichée à l'admin,
// voir freeDiagnosticProductionLink.js::buildGoogleMapsVerificationLink) —
// mais plus jamais comme source de l'ancrage géographique (voir garantie 1
// ci-dessous).

test("extractCoordinatesFromLocationLink lit le format !3d!4d (épingle du lieu) — cas réel Computelec", () => {
  const result = extractCoordinatesFromLocationLink(COMPUTELEC_LOCATION_LINK);
  assert.ok(result);
  assert.equal(result.lat, 49.816779999999994);
  assert.equal(result.lng, 5.449034);
  assert.equal(result.source, "location_link_pin");
});

test("extractCoordinatesFromLocationLink renvoie null sans invention pour une URL sans coordonnées, une chaîne vide ou une valeur non-URL", () => {
  assert.equal(extractCoordinatesFromLocationLink("https://www.google.com/maps/place/Computelec/data=!4m2"), null);
  assert.equal(extractCoordinatesFromLocationLink(""), null);
  assert.equal(extractCoordinatesFromLocationLink(null), null);
  assert.equal(extractCoordinatesFromLocationLink("pas une URL"), null);
});

// --- resolveGeographicAnchorLocality (SYNCHRONE) : identité de la localité ---

test("resolveGeographicAnchorLocality résout ville/code postal/pays uniquement à partir des données serveur, jamais une coordonnée", () => {
  const locality = resolveGeographicAnchorLocality({
    normalized: {
      location_link: COMPUTELEC_LOCATION_LINK, latitude: 12.34, longitude: 56.78, // jamais lues ici
      postal_code: "6840", city: "Neufchâteau", country: "Belgique", country_code: "BE",
    },
    fiche: {},
  });
  assert.equal(locality.ok, true);
  assert.equal(locality.region, "BE");
  assert.equal(locality.city, "Neufchâteau");
  assert.equal(locality.postalCode, "6840");
  assert.equal(locality.label, "6840 Neufchâteau, Belgique");
  // Aucune coordonnée dans l'objet renvoyé : cette étape ne connaît que
  // l'identité de la localité, jamais un point géographique.
  assert.equal("coordinates" in locality, false);
});

test("resolveGeographicAnchorLocality : ville seule sans pays reconnaissable reste non fiable (jamais de région devinée)", () => {
  const locality = resolveGeographicAnchorLocality({ normalized: { postal_code: "6840", city: "Neufchâteau" }, fiche: {} });
  assert.equal(locality.ok, false);
});

test("resolveGeographicAnchorLocality : pays sans ville reste non fiable", () => {
  const locality = resolveGeographicAnchorLocality({ normalized: { country_code: "BE" }, fiche: {} });
  assert.equal(locality.ok, false);
});

test("resolveGeographicAnchorLocality : aucune donnée -> non fiable", () => {
  const locality = resolveGeographicAnchorLocality({ normalized: {}, fiche: {} });
  assert.equal(locality.ok, false);
});

test("resolveGeographicAnchorLocality : le repli fiche est utilisé uniquement quand normalized ne renseigne rien", () => {
  const locality = resolveGeographicAnchorLocality({
    normalized: {},
    fiche: { postal_code: "6840", city: "Neufchâteau", country_code: "BE" },
  });
  assert.equal(locality.ok, true);
  assert.equal(locality.region, "BE");
});

// --- resolveGeographicAnchor (ASYNCHRONE) : point neutre mesuré au centre ---
// --- de la localité, jamais aux coordonnées de l'entreprise analysée ---

test("Garantie 1 — l'entreprise ciblée n'est jamais utilisée comme point géographique, même quand ses coordonnées exactes sont connues", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeGeocodingFetch({ BE: NEUFCHATEAU_BE_CENTER });
  try {
    const anchor = await resolveGeographicAnchor({
      normalized: {
        // Coordonnées ET location_link propres à Computelec, délibérément
        // fournis pour prouver qu'ils ne sont JAMAIS lus par cette fonction.
        location_link: COMPUTELEC_LOCATION_LINK, latitude: 49.816779999999994, longitude: 5.449034,
        postal_code: "6840", city: "Neufchâteau", country: "Belgique", country_code: "BE",
      },
      fiche: {},
      apiKey: "test-key",
    });
    assert.equal(anchor.ok, true);
    assert.equal(anchor.tier, 1);
    assert.equal(anchor.coordinates, `${NEUFCHATEAU_BE_CENTER.lat},${NEUFCHATEAU_BE_CENTER.lng}`);
    assert.notEqual(anchor.coordinates, COMPUTELEC_OWN_COORDINATES);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Garantie 2 — deux entreprises différentes de la même localité utilisent exactement le même point de mesure", async () => {
  const originalFetch = globalThis.fetch;
  let geocodingCalls = 0;
  globalThis.fetch = async (input) => {
    geocodingCalls += 1;
    return fakeGeocodingFetch({ BE: NEUFCHATEAU_BE_CENTER })(input);
  };
  try {
    const localite = { postal_code: "6840", city: "Neufchâteau", country: "Belgique", country_code: "BE" };
    const computelec = await resolveGeographicAnchor({
      normalized: {
        ...localite, name: "Computelec", place_id: "place-computelec",
        location_link: COMPUTELEC_LOCATION_LINK, latitude: 49.816779999999994, longitude: 5.449034,
      },
      fiche: {},
      apiKey: "test-key",
    });
    const autreEntreprise = await resolveGeographicAnchor({
      normalized: {
        ...localite, name: "Boulangerie Dupont", place_id: "place-autre",
        // Adresse et coordonnées complètement différentes de Computelec —
        // seule la localité (ville/code postal/pays) est partagée.
        location_link: "https://www.google.com/maps/place/X/@49.83,5.42,14z/data=!3d49.83!4d5.42",
        latitude: 49.83, longitude: 5.42,
      },
      fiche: {},
      apiKey: "test-key",
    });
    assert.equal(computelec.ok, true);
    assert.equal(autreEntreprise.ok, true);
    assert.equal(computelec.coordinates, autreEntreprise.coordinates);
    assert.equal(computelec.coordinates, `${NEUFCHATEAU_BE_CENTER.lat},${NEUFCHATEAU_BE_CENTER.lng}`);
    assert.equal(geocodingCalls, 2, "chaque résolution géocode indépendamment, mais produit le même résultat pour la même localité");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Garantie 3 — Neufchâteau Belgique n'est jamais confondu avec Neufchâteau France (points et régions distincts)", async () => {
  const originalFetch = globalThis.fetch;
  const capturedQueries = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    capturedQueries.push({ region: url.searchParams.get("region"), query: url.searchParams.get("query") });
    return fakeGeocodingFetch({ BE: NEUFCHATEAU_BE_CENTER, FR: NEUFCHATEAU_FR_CENTER })(input);
  };
  try {
    const belge = await resolveGeographicAnchor({
      normalized: { postal_code: "6840", city: "Neufchâteau", country: "Belgique", country_code: "BE" },
      fiche: {},
      apiKey: "test-key",
    });
    const francaise = await resolveGeographicAnchor({
      normalized: { postal_code: "88300", city: "Neufchâteau", country: "France", country_code: "FR" },
      fiche: {},
      apiKey: "test-key",
    });
    assert.equal(belge.ok, true);
    assert.equal(francaise.ok, true);
    assert.equal(belge.region, "BE");
    assert.equal(francaise.region, "FR");
    assert.notEqual(belge.coordinates, francaise.coordinates);
    assert.equal(belge.coordinates, `${NEUFCHATEAU_BE_CENTER.lat},${NEUFCHATEAU_BE_CENTER.lng}`);
    assert.equal(francaise.coordinates, `${NEUFCHATEAU_FR_CENTER.lat},${NEUFCHATEAU_FR_CENTER.lng}`);
    // Désambiguïsation automatique : chaque requête de geocoding a bien
    // transmis le code postal ET le pays — jamais "Neufchâteau" seul, qui
    // laisserait le fournisseur deviner lequel des deux homonymes est visé.
    assert.ok(capturedQueries.some((q) => q.region === "BE" && q.query?.includes("6840")));
    assert.ok(capturedQueries.some((q) => q.region === "FR" && q.query?.includes("88300")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Garantie — le geocoding échoué BLOQUE entièrement (ok:false) : aucun repli vers un paramètre region seul, ni vers les coordonnées de l'entreprise", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("provider-down", { status: 500 });
  try {
    const anchor = await resolveGeographicAnchor({
      normalized: {
        location_link: COMPUTELEC_LOCATION_LINK, // présent, mais jamais utilisé, même en repli
        latitude: 49.816779999999994, longitude: 5.449034,
        postal_code: "6840", city: "Neufchâteau", country: "Belgique", country_code: "BE",
      },
      fiche: {},
      apiKey: "test-key",
    });
    assert.equal(anchor.ok, false);
    assert.equal(anchor.tier, 0);
    assert.equal(anchor.source, "none");
    assert.equal(anchor.coordinates, null);
    assert.notEqual(anchor.source, "region_only");
    assert.equal(anchor.locality, null);
    assert.equal(anchor.code, "GEOGRAPHIC_ANCHOR_CENTER_UNAVAILABLE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Garantie — une réponse de geocoding incohérente avec la localité attendue BLOQUE, jamais acceptée telle quelle", async () => {
  const originalFetch = globalThis.fetch;
  // Le fournisseur répond, mais avec une ville différente de celle demandée
  // (ex. panne partielle, ambiguïté du fournisseur) — jamais un point neutre
  // accepté sans validation stricte.
  globalThis.fetch = async () => Response.json({
    data: [[{ latitude: 50.85, longitude: 4.35, city: "Bruxelles", postal_code: "1000", country_code: "BE" }]],
  });
  try {
    const anchor = await resolveGeographicAnchor({
      normalized: { postal_code: "6840", city: "Neufchâteau", country: "Belgique", country_code: "BE" },
      fiche: {},
      apiKey: "test-key",
    });
    assert.equal(anchor.ok, false);
    assert.equal(anchor.coordinates, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("aucune localité fiable -> ancrage bloqué (ok:false), jamais un appel de geocoding tenté", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; return Response.json({ data: [[]] }); };
  try {
    const anchor = await resolveGeographicAnchor({ normalized: {}, fiche: {}, apiKey: "test-key" });
    assert.equal(anchor.ok, false);
    assert.equal(anchor.tier, 0);
    assert.equal(anchor.coordinates, null);
    assert.equal(anchor.locality, null);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Garantie 5 — la résolution ne lit jamais un code postal ou un pays transmis par l'appelant : uniquement normalized/fiche", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeGeocodingFetch({ BE: NEUFCHATEAU_BE_CENTER });
  try {
    // `resolveGeographicAnchor` n'accepte structurellement que { normalized,
    // fiche, apiKey, timeoutMs } — aucun paramètre "postalCode"/"country" au
    // niveau appelant ne peut donc influencer la résolution, même fourni.
    const anchor = await resolveGeographicAnchor({
      normalized: { postal_code: "6840", city: "Neufchâteau", country: "Belgique", country_code: "BE" },
      fiche: {},
      apiKey: "test-key",
      postalCode: "00000", country: "Nulle-Part", // ignorés : hors du contrat de la fonction
    });
    assert.equal(anchor.ok, true);
    assert.equal(anchor.region, "BE");
    assert.equal(anchor.label, "6840 Neufchâteau, Belgique");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("buildGeographicAnchorRecord persiste la localité, le pays, le point neutre, sa source et l'horodatage — jamais pour un ancrage non résolu", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeGeocodingFetch({ BE: NEUFCHATEAU_BE_CENTER });
  try {
    const anchor = await resolveGeographicAnchor({
      normalized: { postal_code: "6840", city: "Neufchâteau", country: "Belgique", country_code: "BE" },
      fiche: {},
      apiKey: "test-key",
    });
    const record = buildGeographicAnchorRecord(anchor, "2026-08-28T09:00:00.000Z");
    assert.deepEqual(record, {
      tier: 1,
      source: "outscraper_geocoding",
      region: "BE",
      label: "6840 Neufchâteau, Belgique",
      coordinates: "49.8419,5.4342",
      locality: { city: "Neufchâteau", postalCode: "6840", country: "Belgique", countryCode: "BE" },
      resolvedAt: "2026-08-28T09:00:00.000Z",
    });
    assert.equal(buildGeographicAnchorRecord({ ok: false }, "2026-08-28T09:00:00.000Z"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- Ancrage analysé vs ancrage actuellement détecté (jamais confondus) ---
// buildFreeDiagnosticCollectionState() persiste "l'ancrage analysé"
// (normalized.geographic_anchor, figé au moment de la dernière recherche
// réussie) séparément de "l'ancrage actuellement détecté" (identité de
// localité recalculée en direct, SYNCHRONE, à partir de l'état courant de la
// fiche) — voir freeDiagnosticProductionLink.js. Une ancienne analyse ne
// doit jamais être présentée comme correspondant à une nouvelle localité.
test("geographicAnchorStale reste false quand la localité analysée correspond toujours à l'état actuel de la fiche", async () => {
  const { buildFreeDiagnosticCollectionState } = await import("../functions/lib/freeDiagnosticProductionLink.js");
  const analysis = {
    business: {
      name: "Computelec", placeId: "place-computelec", competitors: [],
      normalized: {
        name: "Computelec", place_id: "place-computelec", city: "Neufchâteau",
        location_link: COMPUTELEC_LOCATION_LINK,
        postal_code: "6840", country: "Belgique", country_code: "BE",
        geographic_anchor: {
          tier: 1, source: "outscraper_geocoding", region: "BE",
          label: "6840 Neufchâteau, Belgique", coordinates: "49.8419,5.4342",
          locality: { city: "Neufchâteau", postalCode: "6840", country: "Belgique", countryCode: "BE" },
          resolvedAt: "2026-08-27T09:00:00.000Z",
        },
      },
      fiche: {},
    },
  };
  const state = buildFreeDiagnosticCollectionState(analysis);
  assert.equal(state.business.geographicAnchor.label, "6840 Neufchâteau, Belgique");
  assert.equal(state.business.geographicAnchorStale, false);
});

test("geographicAnchorStale devient true quand la localité de la fiche a changé depuis la dernière recherche (nouveau code postal/ville)", async () => {
  const { buildFreeDiagnosticCollectionState } = await import("../functions/lib/freeDiagnosticProductionLink.js");
  const analysis = {
    business: {
      name: "Computelec", placeId: "place-computelec", competitors: [],
      normalized: {
        name: "Computelec", place_id: "place-computelec",
        // La fiche a depuis été corrigée (nouvelle ville) sans qu'une
        // relance de recherche n'ait encore eu lieu.
        city: "Bruxelles", postal_code: "1000", country: "Belgique", country_code: "BE",
        geographic_anchor: {
          tier: 1, source: "outscraper_geocoding", region: "BE",
          label: "6840 Neufchâteau, Belgique", coordinates: "49.8419,5.4342",
          locality: { city: "Neufchâteau", postalCode: "6840", country: "Belgique", countryCode: "BE" },
          resolvedAt: "2026-08-27T09:00:00.000Z",
        },
      },
      fiche: {},
    },
  };
  const state = buildFreeDiagnosticCollectionState(analysis);
  // Le libellé affiché reste celui de l'analyse réellement effectuée —
  // jamais réécrit silencieusement avec la nouvelle localité.
  assert.equal(state.business.geographicAnchor.label, "6840 Neufchâteau, Belgique");
  assert.equal(state.business.geographicAnchorStale, true);
});

test("geographicAnchorStale reste false quand aucune analyse antérieure n'a encore résolu d'ancrage", async () => {
  const { buildFreeDiagnosticCollectionState } = await import("../functions/lib/freeDiagnosticProductionLink.js");
  const analysis = {
    business: {
      name: "Computelec", placeId: "place-computelec", competitors: [],
      normalized: { name: "Computelec", place_id: "place-computelec", city: "Neufchâteau" },
      fiche: {},
    },
  };
  const state = buildFreeDiagnosticCollectionState(analysis);
  assert.equal(state.business.geographicAnchor, null);
  assert.equal(state.business.geographicAnchorStale, false);
});

// --- Point 1 : analyses anciennes sans geographic_anchor ---
// Distinction stricte exigée : "des résultats concurrentiels existent déjà
// mais aucun ancrage n'a jamais été mémorisé" (périmé, doit bloquer) versus
// "aucune collecte n'a encore été effectuée" (normal, jamais périmé).

test("Point 1a. des résultats concurrentiels existants sans geographic_anchor sont traités comme périmés (jamais présentés comme fiables)", async () => {
  const { buildFreeDiagnosticCollectionState } = await import("../functions/lib/freeDiagnosticProductionLink.js");
  const analysis = {
    business: {
      name: "Ancienne Fiche", placeId: "place-legacy",
      searchQuery: "Plombier Bruxelles", localPosition: 4,
      competitors: [{ name: "Concurrent", rating: 4, reviews: 5 }],
      normalized: { name: "Ancienne Fiche", place_id: "place-legacy", city: "Bruxelles" }, // aucun geographic_anchor
      fiche: {},
    },
    benchmark: { averages: { rating: 4.1, reviews: 6, photos: 2 } },
  };
  const state = buildFreeDiagnosticCollectionState(analysis);
  assert.equal(state.business.geographicAnchor, null);
  assert.equal(state.business.geographicAnchorStale, true);
  assert.equal(state.business.geographicAnchorIssue, "GEOGRAPHIC_ANCHOR_MISSING_FOR_EXISTING_RESULTS");
});

test("Point 1b. aucune collecte concurrentielle encore effectuée sans geographic_anchor reste un état normal (jamais inventé comme périmé)", async () => {
  const { buildFreeDiagnosticCollectionState } = await import("../functions/lib/freeDiagnosticProductionLink.js");
  const analysis = {
    business: {
      name: "Nouvelle Fiche", placeId: "place-new",
      competitors: [],
      normalized: { name: "Nouvelle Fiche", place_id: "place-new", city: "Bruxelles" },
      fiche: {},
    },
    benchmark: { averages: {} },
  };
  const state = buildFreeDiagnosticCollectionState(analysis);
  assert.equal(state.business.geographicAnchor, null);
  assert.equal(state.business.geographicAnchorStale, false);
  assert.equal(state.business.geographicAnchorIssue, null);
});

test("Point 1c. une position seule (sans requête ni concurrent) suffit à qualifier des résultats concurrentiels existants", async () => {
  const { buildFreeDiagnosticCollectionState } = await import("../functions/lib/freeDiagnosticProductionLink.js");
  const analysis = {
    business: {
      name: "Fiche Position Seule", placeId: "place-pos-only", localPosition: 0, competitors: [],
      normalized: { name: "Fiche Position Seule", place_id: "place-pos-only", city: "Bruxelles" },
      fiche: {},
    },
    benchmark: { averages: {} },
  };
  const state = buildFreeDiagnosticCollectionState(analysis);
  assert.equal(state.business.geographicAnchorStale, true);
});

test("Point 1d. des moyennes concurrentielles seules suffisent à qualifier des résultats concurrentiels existants", async () => {
  const { buildFreeDiagnosticCollectionState } = await import("../functions/lib/freeDiagnosticProductionLink.js");
  const analysis = {
    business: {
      name: "Fiche Moyennes Seules", placeId: "place-avg-only", competitors: [],
      normalized: { name: "Fiche Moyennes Seules", place_id: "place-avg-only", city: "Bruxelles" },
      fiche: {},
    },
    benchmark: { averages: { rating: 4.2, reviews: null, photos: null } },
  };
  const state = buildFreeDiagnosticCollectionState(analysis);
  assert.equal(state.business.geographicAnchorStale, true);
});
