// Mission "ancrage géographique automatique" — tests unitaires purs pour :
//  - l'extraction de coordonnées depuis un location_link Google Maps déjà
//    connu (plusieurs formats réellement observés) ;
//  - la résolution de l'ancrage géographique selon l'ordre de priorité
//    imposé : 1) location_link, 2) latitude/longitude déjà capturées à
//    l'identification initiale, 3) pays connu (adresse/code postal/pays),
//    4) aucun ancrage fiable -> jamais d'invention.
//
// Cas réel de référence : Computelec, Le Sart 18/3, 6840 Neufchâteau,
// Belgique — location_link réel observé lors de l'identification de la
// fiche (Appel A Outscraper).
import assert from "node:assert/strict";
import test from "node:test";

import { extractCoordinatesFromLocationLink } from "../functions/lib/googleMapsUrl.js";
import { resolveGeographicAnchor } from "../functions/lib/geographicAnchor.js";

const COMPUTELEC_LOCATION_LINK = "https://www.google.com/maps/place/Computelec/@49.816779999999994,5.449034,14z/data=!4m8!1m2!2m1!1sComputelec!3m4!1s0x821e9402e9f2375b:0x3706196cb9aab69b!8m2!3d49.816779999999994!4d5.449034";

// --- 5. Extraction des coordonnées depuis les différents formats de location_link ---

test("extractCoordinatesFromLocationLink lit le format !3d!4d (épingle du lieu) — cas réel Computelec", () => {
  const result = extractCoordinatesFromLocationLink(COMPUTELEC_LOCATION_LINK);
  assert.ok(result);
  assert.equal(result.lat, 49.816779999999994);
  assert.equal(result.lng, 5.449034);
  assert.equal(result.source, "location_link_pin");
});

test("extractCoordinatesFromLocationLink lit le format @lat,lng,zoom quand !3d/!4d est absent", () => {
  const result = extractCoordinatesFromLocationLink("https://www.google.com/maps/place/X/@50.8503,4.3517,15z");
  assert.ok(result);
  assert.equal(result.lat, 50.8503);
  assert.equal(result.lng, 4.3517);
  assert.equal(result.source, "location_link_map_center");
});

test("extractCoordinatesFromLocationLink lit le format ?q=lat,lng", () => {
  const result = extractCoordinatesFromLocationLink("https://www.google.com/maps?api=1&q=49.8168,5.4490");
  assert.ok(result);
  assert.equal(result.lat, 49.8168);
  assert.equal(result.lng, 5.449);
  assert.equal(result.source, "location_link_query_param");
});

test("extractCoordinatesFromLocationLink lit le format &ll=lat,lng", () => {
  const result = extractCoordinatesFromLocationLink("https://maps.google.com/maps?ll=48.8566,2.3522&z=14");
  assert.ok(result);
  assert.equal(result.lat, 48.8566);
  assert.equal(result.lng, 2.3522);
});

test("extractCoordinatesFromLocationLink renvoie null sans invention pour une URL sans coordonnées, une chaîne vide ou une valeur non-URL", () => {
  assert.equal(extractCoordinatesFromLocationLink("https://www.google.com/maps/place/Computelec/data=!4m2"), null);
  assert.equal(extractCoordinatesFromLocationLink(""), null);
  assert.equal(extractCoordinatesFromLocationLink(null), null);
  assert.equal(extractCoordinatesFromLocationLink("pas une URL"), null);
});

test("extractCoordinatesFromLocationLink rejette des coordonnées hors plage plausible", () => {
  assert.equal(extractCoordinatesFromLocationLink("https://www.google.com/maps/@999,999,14z"), null);
});

// --- Résolution de l'ancrage : ordre de priorité strict ---

test("priorité 1 : coordonnées du location_link préférées même si latitude/longitude bruts sont aussi présents", () => {
  const anchor = resolveGeographicAnchor({
    normalized: {
      location_link: COMPUTELEC_LOCATION_LINK,
      latitude: 0, longitude: 0, // valeurs bidon : ne doivent jamais être utilisées si le lien est exploitable
      postal_code: "6840", city: "Neufchâteau", country: "Belgique", country_code: "BE",
    },
    fiche: {},
  });
  assert.equal(anchor.ok, true);
  assert.equal(anchor.tier, 1);
  assert.equal(anchor.coordinates, "49.816779999999994,5.449034");
  assert.equal(anchor.region, "BE");
  assert.equal(anchor.label, "6840 Neufchâteau, Belgique");
});

test("priorité 2 : latitude/longitude de l'identification initiale utilisées quand aucun location_link exploitable n'existe", () => {
  const anchor = resolveGeographicAnchor({
    normalized: { location_link: "", latitude: 49.8168, longitude: 5.449, postal_code: "6840", city: "Neufchâteau", country_code: "BE" },
    fiche: {},
  });
  assert.equal(anchor.ok, true);
  assert.equal(anchor.tier, 2);
  assert.equal(anchor.coordinates, "49.8168,5.449");
  assert.equal(anchor.source, "initial_identification");
});

test("priorité 3 : pays connu (adresse/code postal/pays) utilisé comme paramètre region, sans coordonnée inventée", () => {
  const anchor = resolveGeographicAnchor({
    normalized: { postal_code: "6840", city: "Neufchâteau", country: "Belgique" },
    fiche: {},
  });
  assert.equal(anchor.ok, true);
  assert.equal(anchor.tier, 3);
  assert.equal(anchor.coordinates, null);
  assert.equal(anchor.region, "BE");
});

test("priorité 4 : aucun ancrage fiable -> avertissement, jamais une localisation inventée", () => {
  const anchor = resolveGeographicAnchor({ normalized: {}, fiche: {} });
  assert.equal(anchor.ok, false);
  assert.equal(anchor.tier, 0);
  assert.equal(anchor.coordinates, null);
  assert.equal(anchor.region, null);
  assert.equal(anchor.label, null);
});

test("priorité 4 : un code postal seul sans pays reconnaissable ne fabrique jamais un ancrage", () => {
  // Un code postal seul ne permet de déduire ni des coordonnées ni un pays
  // fiable sans deviner — ce cas doit rester tier 0, pas un tier 3 inventé.
  const anchor = resolveGeographicAnchor({ normalized: { postal_code: "6840", city: "Neufchâteau" }, fiche: {} });
  assert.equal(anchor.ok, false);
  assert.equal(anchor.tier, 0);
});

// --- 4. Ville homonyme France/Belgique correctement différenciée ---

test("ville homonyme Neufchâteau (Belgique vs Vosges/France) : ancrages résolus distincts", () => {
  const belge = resolveGeographicAnchor({
    normalized: {
      location_link: COMPUTELEC_LOCATION_LINK,
      postal_code: "6840", city: "Neufchâteau", country: "Belgique", country_code: "BE",
    },
    fiche: {},
  });
  const francaise = resolveGeographicAnchor({
    normalized: {
      location_link: "https://www.google.com/maps/place/X/@48.3538,5.6975,14z/data=!3d48.3538!4d5.6975",
      postal_code: "88300", city: "Neufchâteau", country: "France", country_code: "FR",
    },
    fiche: {},
  });
  assert.equal(belge.ok, true);
  assert.equal(francaise.ok, true);
  assert.equal(belge.region, "BE");
  assert.equal(francaise.region, "FR");
  assert.notEqual(belge.coordinates, francaise.coordinates);
  assert.notEqual(belge.label, francaise.label);
});

test("le repli fiche est utilisé uniquement quand normalized ne renseigne rien", () => {
  const anchor = resolveGeographicAnchor({
    normalized: {},
    fiche: { location_link: COMPUTELEC_LOCATION_LINK, postal_code: "6840", city: "Neufchâteau", country_code: "BE" },
  });
  assert.equal(anchor.ok, true);
  assert.equal(anchor.tier, 1);
});

// --- Ancrage analysé vs ancrage actuellement détecté (jamais confondus) ---
// buildFreeDiagnosticCollectionState() persiste "l'ancrage analysé"
// (normalized.geographic_anchor, figé au moment de la dernière recherche
// réussie) séparément de "l'ancrage actuellement détecté" (recalculé en
// direct à partir de l'état courant de la fiche) — voir
// freeDiagnosticProductionLink.js. Une ancienne analyse ne doit jamais être
// présentée comme correspondant à de nouvelles coordonnées.
test("geographicAnchorStale reste false quand l'ancrage analysé correspond toujours à l'état actuel de la fiche", async () => {
  const { buildFreeDiagnosticCollectionState } = await import("../functions/lib/freeDiagnosticProductionLink.js");
  const analysis = {
    business: {
      name: "Computelec", placeId: "place-computelec", competitors: [],
      normalized: {
        name: "Computelec", place_id: "place-computelec", city: "Neufchâteau",
        location_link: COMPUTELEC_LOCATION_LINK,
        postal_code: "6840", country: "Belgique", country_code: "BE",
        geographic_anchor: {
          tier: 1, source: "location_link_pin", region: "BE",
          label: "6840 Neufchâteau, Belgique", coordinates: "49.816779999999994,5.449034",
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

test("geographicAnchorStale devient true quand la fiche a évolué depuis la dernière recherche (nouvelles coordonnées)", async () => {
  const { buildFreeDiagnosticCollectionState } = await import("../functions/lib/freeDiagnosticProductionLink.js");
  const analysis = {
    business: {
      name: "Computelec", placeId: "place-computelec", competitors: [],
      normalized: {
        name: "Computelec", place_id: "place-computelec", city: "Neufchâteau",
        // location_link mis à jour depuis la dernière recherche analysée —
        // nouvelles coordonnées jamais utilisées pour la recherche actuelle.
        location_link: "https://www.google.com/maps/place/X/@50.85,4.35,14z/data=!3d50.85!4d4.35",
        postal_code: "6840", country: "Belgique", country_code: "BE",
        geographic_anchor: {
          tier: 1, source: "location_link_pin", region: "BE",
          label: "6840 Neufchâteau, Belgique", coordinates: "49.816779999999994,5.449034",
          resolvedAt: "2026-08-27T09:00:00.000Z",
        },
      },
      fiche: {},
    },
  };
  const state = buildFreeDiagnosticCollectionState(analysis);
  // Le libellé affiché reste celui de l'analyse réellement effectuée —
  // jamais réécrit silencieusement avec les nouvelles coordonnées.
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
      // Ni searchQuery, ni localPosition, ni concurrents : aucune recherche
      // concurrentielle n'a jamais été lancée pour cette analyse.
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
