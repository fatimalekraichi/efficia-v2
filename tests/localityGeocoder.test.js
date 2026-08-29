// Mission "corriger la méthode d'ancrage géographique" — tests unitaires
// purs pour resolveLocalityCenter (localityGeocoder.js) : le point neutre
// (centre de localité) n'est JAMAIS dérivé d'une entreprise — uniquement
// d'une ville/code postal/pays déjà vérifiés côté serveur — et n'est JAMAIS
// accepté sans validation stricte de la réponse du fournisseur. Aucun
// repli : un échec, un timeout, une réponse vide, des coordonnées absentes
// ou une réponse incohérente avec la localité demandée bloquent
// entièrement (ok:false), jamais une coordonnée devinée ni un simple
// paramètre "region" en remplacement.
import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveLocalityCenter, buildLocalityGeocodingQuery, LOCALITY_CENTER_ERROR,
} from "../functions/lib/localityGeocoder.js";

const NEUFCHATEAU_BE = { postalCode: "6840", city: "Neufchâteau", countryName: "Belgique", countryCode: "BE" };

test("buildLocalityGeocodingQuery combine postalCode/city/countryName, jamais une adresse ou un nom d'entreprise", () => {
  assert.equal(
    buildLocalityGeocodingQuery({ postalCode: "6840", city: "Neufchâteau", countryName: "Belgique" }),
    "6840 Neufchâteau Belgique",
  );
  assert.equal(buildLocalityGeocodingQuery({ city: "Bruxelles" }), "Bruxelles");
  assert.equal(buildLocalityGeocodingQuery({}), "");
});

test("resolveLocalityCenter interroge l'endpoint officiel exact GET https://api.outscraper.com/geocoding — jamais un endpoint construit différemment", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = null;
  let capturedHeaders = null;
  let capturedMethod = null;
  globalThis.fetch = async (input, init) => {
    capturedUrl = new URL(String(input));
    capturedHeaders = init.headers;
    capturedMethod = init.method;
    return Response.json({
      data: [[{ latitude: 49.8419, longitude: 5.4342, city: "Neufchâteau", postal_code: "6840", country_code: "BE" }]],
    });
  };
  try {
    const result = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "test-key" });
    assert.equal(result.ok, true);
    assert.equal(result.lat, 49.8419);
    assert.equal(result.lng, 5.4342);
    assert.equal(result.source, "outscraper_geocoding");
    assert.equal(capturedMethod, "GET");
    // Endpoint officiel exact — hôte ET chemin, jamais celui (inventé) de la
    // version précédente (api.app.outscraper.com/maps/geocoding).
    assert.equal(capturedUrl.origin, "https://api.outscraper.com");
    assert.equal(capturedUrl.pathname, "/geocoding");
    assert.notEqual(capturedUrl.hostname, "api.app.outscraper.com");
    assert.equal(capturedUrl.searchParams.get("query"), "6840 Neufchâteau Belgique");
    assert.equal(capturedUrl.searchParams.get("region"), "BE");
    assert.equal(capturedHeaders["X-API-KEY"], "test-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolveLocalityCenter bloque (ok:false) sans ville ou sans région reconnue — jamais un geocoding tenté à l'aveugle", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; return Response.json({}); };
  try {
    const noCity = await resolveLocalityCenter({ postalCode: "6840", countryCode: "BE", apiKey: "test-key" });
    assert.equal(noCity.ok, false);
    assert.equal(noCity.code, LOCALITY_CENTER_ERROR.MISSING_LOCALITY);
    const noRegion = await resolveLocalityCenter({ postalCode: "6840", city: "Neufchâteau", apiKey: "test-key" });
    assert.equal(noRegion.ok, false);
    assert.equal(noRegion.code, LOCALITY_CENTER_ERROR.MISSING_LOCALITY);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolveLocalityCenter bloque (ok:false) sans clé API, jamais un appel envoyé sans authentification", async () => {
  const result = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "" });
  assert.equal(result.ok, false);
  assert.equal(result.code, LOCALITY_CENTER_ERROR.MISSING_API_KEY);
});

// --- Requirement 4 : couverture explicite de chaque mode d'échec ---

test("timeout — le fournisseur ne répond jamais dans le délai imparti", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url, { signal } = {}) => new Promise((resolve, reject) => {
    signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });
  try {
    const result = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "k", timeoutMs: 5 });
    assert.equal(result.ok, false);
    assert.equal(result.code, LOCALITY_CENTER_ERROR.TIMEOUT);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("erreur HTTP — le fournisseur répond avec un statut d'erreur", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("down", { status: 500 });
  try {
    const result = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "k" });
    assert.equal(result.ok, false);
    assert.equal(result.code, LOCALITY_CENTER_ERROR.REQUEST_FAILED);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("réponse vide — corps de réponse vide ou sans résultat exploitable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("", { status: 200 });
  try {
    const empty = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "k" });
    assert.equal(empty.ok, false);
    assert.equal(empty.code, LOCALITY_CENTER_ERROR.EMPTY_RESPONSE);
  } finally {
    globalThis.fetch = originalFetch;
  }
  globalThis.fetch = async () => Response.json({ data: [[]] });
  try {
    const emptyData = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "k" });
    assert.equal(emptyData.ok, false);
    assert.equal(emptyData.code, LOCALITY_CENTER_ERROR.EMPTY_RESPONSE);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("coordonnées absentes — un résultat existe mais sans latitude/longitude exploitables", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    data: [[{ city: "Neufchâteau", postal_code: "6840", country_code: "BE" }]],
  });
  try {
    const result = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "k" });
    assert.equal(result.ok, false);
    assert.equal(result.code, LOCALITY_CENTER_ERROR.NOT_FOUND);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mauvais pays — country_code de la réponse différent du pays attendu, jamais accepté", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    data: [[{ latitude: 48.3538, longitude: 5.6975, city: "Neufchâteau", postal_code: "88300", country_code: "FR" }]],
  });
  try {
    const result = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "k" });
    assert.equal(result.ok, false);
    assert.equal(result.code, LOCALITY_CENTER_ERROR.LOCALITY_MISMATCH);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("country_code absent de la réponse — jamais accepté par défaut", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    data: [[{ latitude: 49.8419, longitude: 5.4342, city: "Neufchâteau", postal_code: "6840" }]],
  });
  try {
    const result = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "k" });
    assert.equal(result.ok, false);
    assert.equal(result.code, LOCALITY_CENTER_ERROR.LOCALITY_MISMATCH);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mauvais code postal — postal_code de la réponse différent de celui attendu, jamais accepté", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    data: [[{ latitude: 49.8419, longitude: 5.4342, city: "Neufchâteau", postal_code: "1000", country_code: "BE" }]],
  });
  try {
    const result = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "k" });
    assert.equal(result.ok, false);
    assert.equal(result.code, LOCALITY_CENTER_ERROR.LOCALITY_MISMATCH);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ville incompatible — city de la réponse différente ou absente, jamais accepté", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    data: [[{ latitude: 50.85, longitude: 4.35, city: "Bruxelles", postal_code: "6840", country_code: "BE" }]],
  });
  try {
    const wrongCity = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "k" });
    assert.equal(wrongCity.ok, false);
    assert.equal(wrongCity.code, LOCALITY_CENTER_ERROR.LOCALITY_MISMATCH);
  } finally {
    globalThis.fetch = originalFetch;
  }
  globalThis.fetch = async () => Response.json({
    data: [[{ latitude: 49.8419, longitude: 5.4342, postal_code: "6840", country_code: "BE" }]],
  });
  try {
    const noCity = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "k" });
    assert.equal(noCity.ok, false);
    assert.equal(noCity.code, LOCALITY_CENTER_ERROR.LOCALITY_MISMATCH);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("localité homonyme (Neufchâteau France répond à une requête Neufchâteau Belgique) — rejetée sur le country_code, jamais confondue", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    data: [[{
      latitude: 48.3538, longitude: 5.6975, city: "Neufchâteau", postal_code: "88300", country_code: "FR",
    }]],
  });
  try {
    const result = await resolveLocalityCenter({
      postalCode: "6840", city: "Neufchâteau", countryName: "Belgique", countryCode: "BE", apiKey: "k",
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, LOCALITY_CENTER_ERROR.LOCALITY_MISMATCH);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("réponse non JSON — jamais interprétée comme un succès", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("<html>pas du JSON</html>", { status: 200 });
  try {
    const result = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "k" });
    assert.equal(result.ok, false);
    assert.equal(result.code, LOCALITY_CENTER_ERROR.INVALID_RESPONSE);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("succès — postal_code absent de la réponse (fournisseur ne le renvoie pas) n'empêche pas la validation quand ville et pays concordent", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    data: [[{ latitude: 49.8419, longitude: 5.4342, city: "Neufchâteau", country_code: "BE" }]],
  });
  try {
    const result = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "k" });
    assert.equal(result.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
