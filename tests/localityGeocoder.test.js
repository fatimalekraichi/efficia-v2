// Mission "corriger la méthode d'ancrage géographique" — tests unitaires
// purs pour resolveLocalityCenter (localityGeocoder.js) : le point neutre
// (centre de localité) n'est JAMAIS dérivé d'une entreprise — uniquement
// d'une ville/code postal/pays déjà vérifiés côté serveur — et n'est JAMAIS
// accepté sans validation stricte de la réponse du fournisseur. Aucun
// repli : un échec, un timeout, une réponse vide, des coordonnées absentes
// ou une réponse incohérente avec la localité demandée bloquent
// entièrement (ok:false), jamais une coordonnée devinée ni un simple
// paramètre "region" en remplacement.
//
// Revue (2026-08-29, cas réel Computelec 604d91ab en Preview) — le contrat
// officiel Outscraper (https://docs.outscraper.com/endpoints/geocoding/)
// documente une réponse plate `data: [{...}]` où `country_code` N'EST PAS
// garanti (l'exemple officiel ne comporte que `country` en toutes lettres).
// L'ancienne validation exigeait pourtant toujours `country_code`, rejetant
// à tort des réponses par ailleurs correctes. Les tests ci-dessous
// reproduisent ce contrat officiel tel quel (jamais un schéma inventé), et
// couvrent désormais aussi le format plat SANS country_code, le repli sur
// `country` (nom), et la réponse HTTP 202 "Pending".
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
  assert.equal(
    buildLocalityGeocodingQuery({ city: "Luxembourg", countryName: "Luxembourg", countryCode: "LU" }),
    "Luxembourg City Luxembourg",
  );
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
    assert.equal(result.code, LOCALITY_CENTER_ERROR.HTTP_ERROR);
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
    assert.equal(empty.code, LOCALITY_CENTER_ERROR.EMPTY_RESULT);
  } finally {
    globalThis.fetch = originalFetch;
  }
  globalThis.fetch = async () => Response.json({ data: [[]] });
  try {
    const emptyData = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "k" });
    assert.equal(emptyData.ok, false);
    assert.equal(emptyData.code, LOCALITY_CENTER_ERROR.EMPTY_RESULT);
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
    assert.equal(result.code, LOCALITY_CENTER_ERROR.COUNTRY_MISMATCH);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("country_code présent mais incorrect — un nom de pays par ailleurs correct ne rattrape jamais la réponse", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    // country_code "FR" incorrect, mais country "Belgique" (correct) présent
    // malgré tout dans la réponse : ne doit jamais sauver la validation.
    data: [{
      latitude: 48.3538, longitude: 5.6975, city: "Neufchâteau", postal_code: "88300",
      country_code: "FR", country: "Belgique",
    }],
  });
  try {
    const result = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "k" });
    assert.equal(result.ok, false);
    assert.equal(result.code, LOCALITY_CENTER_ERROR.COUNTRY_MISMATCH);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("country_code totalement absent de la réponse — jamais accepté par défaut quand country (nom) est également absent", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    data: [[{ latitude: 49.8419, longitude: 5.4342, city: "Neufchâteau", postal_code: "6840" }]],
  });
  try {
    const result = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "k" });
    assert.equal(result.ok, false);
    assert.equal(result.code, LOCALITY_CENTER_ERROR.COUNTRY_MISMATCH);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("country (nom) incompatible quand country_code est absent — rejeté, jamais une coïncidence supposée", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    data: [{ latitude: 48.3538, longitude: 5.6975, city: "Neufchâteau", postal_code: "88300", country: "France" }],
  });
  try {
    const result = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "k" });
    assert.equal(result.ok, false);
    assert.equal(result.code, LOCALITY_CENTER_ERROR.COUNTRY_MISMATCH);
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
    assert.equal(result.code, LOCALITY_CENTER_ERROR.POSTAL_CODE_MISMATCH);
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
    assert.equal(wrongCity.code, LOCALITY_CENTER_ERROR.CITY_MISMATCH);
  } finally {
    globalThis.fetch = originalFetch;
  }
  globalThis.fetch = async () => Response.json({
    data: [[{ latitude: 49.8419, longitude: 5.4342, postal_code: "6840", country_code: "BE" }]],
  });
  try {
    const noCity = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "k" });
    assert.equal(noCity.ok, false);
    assert.equal(noCity.code, LOCALITY_CENTER_ERROR.CITY_MISMATCH);
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
    assert.equal(result.code, LOCALITY_CENTER_ERROR.COUNTRY_MISMATCH);
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

// --- Contrat officiel Outscraper (https://docs.outscraper.com/endpoints/geocoding/) ---
// Reproduit tel quel le format documenté, jamais un schéma inventé pour
// faire passer les tests : réponse plate, `data: [{...}]` (un seul objet,
// jamais un tableau imbriqué), `country_code` NON garanti.

test("contrat officiel — réponse plate data:[{...}] SANS country_code mais avec country:\"Belgium\" correct → succès (cause réelle du blocage Computelec 604d91ab)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    status: "Success",
    data: [{
      query: "6840 Neufchâteau Belgique",
      latitude: 49.8419,
      longitude: 5.4342,
      country: "Belgium",
      city: "Neufchâteau",
      postal_code: "6840",
    }],
  });
  try {
    const result = await resolveLocalityCenter({
      postalCode: "6840", city: "Neufchâteau", countryName: "Belgium", countryCode: "BE", apiKey: "k",
    });
    assert.equal(result.ok, true);
    assert.equal(result.lat, 49.8419);
    assert.equal(result.lng, 5.4342);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("contrat officiel — réponse plate data:[{...}] AVEC country_code:\"BE\" → succès", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    status: "Success",
    data: [{
      query: "6840 Neufchâteau Belgique",
      latitude: 49.8419,
      longitude: 5.4342,
      country: "Belgium",
      country_code: "BE",
      city: "Neufchâteau",
      postal_code: "6840",
    }],
  });
  try {
    const result = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "k" });
    assert.equal(result.ok, true);
    assert.equal(result.lat, 49.8419);
    assert.equal(result.lng, 5.4342);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ancien format imbriqué data:[[{...}]] toujours accepté par compatibilité, mais uniquement si la validation stricte passe", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    data: [[{ latitude: 49.8419, longitude: 5.4342, city: "Neufchâteau", postal_code: "6840", country_code: "BE" }]],
  });
  try {
    const result = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "k" });
    assert.equal(result.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  // La compatibilité ne dispense jamais de la validation stricte : un
  // résultat imbriqué incohérent avec la localité attendue reste rejeté.
  globalThis.fetch = async () => Response.json({
    data: [[{ latitude: 48.3538, longitude: 5.6975, city: "Neufchâteau", postal_code: "88300", country_code: "FR" }]],
  });
  try {
    const result = await resolveLocalityCenter({ ...NEUFCHATEAU_BE, apiKey: "k" });
    assert.equal(result.ok, false);
    assert.equal(result.code, LOCALITY_CENTER_ERROR.COUNTRY_MISMATCH);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HTTP 202 Pending — relit le résultat officiel de façon bornée puis valide strictement Luxembourg", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const requestId = "12345678-abcd-4abc-8abc-1234567890ab";
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), headers: init.headers });
    if (calls.length === 1) {
      return Response.json({
        id: requestId,
        status: "Pending",
        // Cette URL amont est volontairement hostile : elle ne doit jamais
        // être suivie. Le client reconstruit lui-même l'endpoint officiel.
        results_location: "https://example.invalid/private",
      }, { status: 202 });
    }
    return Response.json({
      id: requestId,
      status: "Success",
      data: [{
        query: "Luxembourg Luxembourg",
        latitude: 49.6116,
        longitude: 6.1319,
        country: "Luxembourg",
        country_code: "LU",
        city: "Luxembourg",
      }],
    });
  };
  try {
    const result = await resolveLocalityCenter({
      city: "Luxembourg", countryName: "Luxembourg", countryCode: "LU", apiKey: "k",
      pendingPollDelaysMs: [0],
    });
    assert.equal(result.ok, true);
    assert.equal(result.lat, 49.6116);
    assert.equal(result.lng, 6.1319);
    assert.equal(calls.length, 2);
    assert.equal(new URL(calls[0].url).searchParams.get("query"), "Luxembourg City Luxembourg");
    assert.equal(new URL(calls[1].url).origin, "https://api.outscraper.com");
    assert.equal(new URL(calls[1].url).pathname, `/requests/${requestId}`);
    assert.equal(calls[1].headers["X-API-KEY"], "k");
    assert.equal(calls.some(({ url }) => url.startsWith("https://example.invalid")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HTTP 202 Pending persistant — abandon borné sans succès deviné", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    return Response.json({
      id: "12345678-abcd-4abc-8abc-1234567890ab",
      status: "Pending",
      results_location: "https://api.outscraper.cloud/requests/12345678-abcd-4abc-8abc-1234567890ab",
    }, { status: 202 });
  };
  try {
    const result = await resolveLocalityCenter({
      ...NEUFCHATEAU_BE, apiKey: "k", pendingPollDelaysMs: [0, 0, 0],
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, LOCALITY_CENTER_ERROR.PENDING);
    assert.equal(callCount, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("statut 200 Pending — utilise le même polling officiel puis accepte le résultat complet", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    if (callCount < 3) {
      return Response.json({
        id: "87654321-dcba-4cba-8cba-0987654321fe",
        status: "Pending",
        results_location: "https://api.outscraper.cloud/requests/87654321-dcba-4cba-8cba-0987654321fe",
      });
    }
    return Response.json({
      id: "87654321-dcba-4cba-8cba-0987654321fe",
      status: "Success",
      data: [{
        latitude: 49.8419, longitude: 5.4342, city: "Neufchâteau", postal_code: "6840", country_code: "BE",
      }],
    });
  };
  try {
    const result = await resolveLocalityCenter({
      ...NEUFCHATEAU_BE, apiKey: "k", pendingPollDelaysMs: [0, 0],
    });
    assert.equal(result.ok, true);
    assert.equal(callCount, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Pending sans identifiant exploitable — refus contrôlé et aucune URL results_location suivie", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    return Response.json({
      id: "../secret",
      status: "Pending",
      results_location: "https://example.invalid/private",
    }, { status: 202 });
  };
  try {
    const result = await resolveLocalityCenter({
      ...NEUFCHATEAU_BE, apiKey: "k", pendingPollDelaysMs: [0],
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, LOCALITY_CENTER_ERROR.INVALID_RESPONSE);
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
