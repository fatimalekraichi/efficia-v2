import test from "node:test";
import assert from "node:assert/strict";
import { addSearchResultContext, collectCompetitors } from "../functions/lib/collectCompetitors.js";

// Bug corrigé — "l'entreprise est présente dans ses propres concurrents" :
// avant ce correctif, seul le place_id était comparé, et uniquement quand
// placeIdCible était renseigné (sinon aucune exclusion n'avait lieu). Ces
// tests couvrent les trois identifiants désormais comparés (place_id, CID,
// URL Google) ainsi que le cas où plus aucun concurrent ne subsiste après
// exclusion.

function mockFetchOnce(payload) {
  const originalFetch = globalThis.fetch;
  const withReviewVolumes = {
    ...payload,
    data: Array.isArray(payload?.data) ? payload.data.map((query) => Array.isArray(query)
      ? query.map((place) => Object.prototype.hasOwnProperty.call(place, "reviews") ? place : { ...place, reviews:0 })
      : query) : payload?.data,
  };
  globalThis.fetch = async () => Response.json(withReviewVolumes);
  return () => {
    globalThis.fetch = originalFetch;
  };
}

test("collectCompetitors exclut la fiche analysée par place_id", async () => {
  const restore = mockFetchOnce({
    data: [[
      { name: "AS Pro Elec", place_id: "place-target" },
      { name: "Concurrent A", place_id: "place-a" },
    ]],
  });
  try {
    const result = await collectCompetitors({
      activite: "Électricien",
      ville: "Metz",
      placeIdCible: "place-target",
      apiKey: "key",
    });
    assert.equal(result.ok, true);
    assert.equal(result.concurrents.length, 1);
    assert.equal(result.concurrents[0].name, "Concurrent A");
  } finally {
    restore();
  }
});

test("collectCompetitors exclut la fiche analysée par CID même si le place_id diffère", async () => {
  const restore = mockFetchOnce({
    data: [[
      { name: "AS Pro Elec (doublon)", place_id: "place-different", cid: "cid-123" },
      { name: "Concurrent A", place_id: "place-a", cid: "cid-a" },
    ]],
  });
  try {
    const result = await collectCompetitors({
      activite: "Électricien",
      ville: "Metz",
      placeIdCible: "place-target", // ne correspond à aucun résultat brut ici
      cidCible: "cid-123",
      apiKey: "key",
    });
    assert.equal(result.ok, true);
    assert.equal(result.concurrents.length, 1);
    assert.equal(result.concurrents[0].name, "Concurrent A");
  } finally {
    restore();
  }
});

test("collectCompetitors exclut la fiche analysée par URL Google même si place_id et CID diffèrent", async () => {
  const restore = mockFetchOnce({
    data: [[
      { name: "AS Pro Elec (doublon)", place_id: "place-different", location_link: "https://maps.google.com/?cid=999" },
      { name: "Concurrent A", place_id: "place-a" },
    ]],
  });
  try {
    const result = await collectCompetitors({
      activite: "Électricien",
      ville: "Metz",
      urlCible: "https://maps.google.com/?cid=999",
      apiKey: "key",
    });
    assert.equal(result.ok, true);
    assert.equal(result.concurrents.length, 1);
    assert.equal(result.concurrents[0].name, "Concurrent A");
  } finally {
    restore();
  }
});

test("collectCompetitors ignore la casse/les espaces lors de la comparaison d'URL", async () => {
  const restore = mockFetchOnce({
    data: [[
      { name: "AS Pro Elec (doublon)", place_id: "place-different", location_link: "  HTTPS://Maps.Google.com/?cid=999  " },
      { name: "Concurrent A", place_id: "place-a" },
    ]],
  });
  try {
    const result = await collectCompetitors({
      activite: "Électricien",
      ville: "Metz",
      urlCible: "https://maps.google.com/?cid=999",
      apiKey: "key",
    });
    assert.equal(result.concurrents.length, 1);
    assert.equal(result.concurrents[0].name, "Concurrent A");
  } finally {
    restore();
  }
});

test("collectCompetitors renvoie une liste vide (jamais une erreur) si tous les résultats bruts sont la fiche analysée", async () => {
  const restore = mockFetchOnce({
    data: [[
      { name: "AS Pro Elec", place_id: "place-target" },
    ]],
  });
  try {
    const result = await collectCompetitors({
      activite: "Électricien",
      ville: "Metz",
      placeIdCible: "place-target",
      apiKey: "key",
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.concurrents, []);
  } finally {
    restore();
  }
});

test("collectCompetitors conserve le comportement historique quand aucun identifiant cible n'est fourni", async () => {
  const restore = mockFetchOnce({
    data: [[
      { name: "Concurrent A", place_id: "place-a" },
      { name: "Concurrent B", place_id: "place-b" },
    ]],
  });
  try {
    const result = await collectCompetitors({
      activite: "Électricien",
      ville: "Metz",
      apiKey: "key",
    });
    assert.equal(result.ok, true);
    assert.equal(result.concurrents.length, 2);
  } finally {
    restore();
  }
});

// Mission "corriger les deux problèmes critiques" — Objectif 6 (tests de
// non-régression), à partir de deux cas explicitement nommés dans la
// mission. Le diagnostic (Objectif 3) a montré que le "competitorCount = 0
// systématique" observé sur les 20 audits réels n'était PAS un bug de
// collectCompetitors() : c'était une erreur de lecture du script de
// diagnostic (tmp/beta-audits-20/), qui lisait analysis.competitors au lieu
// de analysis.business.competitors — les 20 audits réels avaient bien 3
// concurrents chacun, self-exclusion correcte. Ces deux tests fixent
// explicitement ce comportement pour AS Pro Elec (l'exemple cité par la
// mission), en plus de la couverture générique déjà présente ci-dessus.

test("AS Pro Elec n'est jamais comparé à lui-même dans son propre benchmark", async () => {
  const restore = mockFetchOnce({
    data: [[
      { name: "AS Pro Elec", place_id: "place-as-pro-elec" },
      { name: "Electrolux95", place_id: "place-electrolux95" },
      { name: "Electromania Ioan Cupsan", place_id: "place-electromania" },
    ]],
  });
  try {
    const result = await collectCompetitors({
      activite: "Électricien",
      ville: "Arlon",
      placeIdCible: "place-as-pro-elec",
      apiKey: "key",
    });
    assert.equal(result.ok, true);
    assert.ok(
      !result.concurrents.some((c) => c.place_id === "place-as-pro-elec" || c.name === "AS Pro Elec"),
      "AS Pro Elec ne doit jamais apparaître dans ses propres concurrents",
    );
    assert.equal(result.concurrents.length, 2);
  } finally {
    restore();
  }
});

test("le benchmark contient bien des concurrents lorsqu'ils existent réellement dans les résultats bruts (pas de vidage systématique)", async () => {
  const restore = mockFetchOnce({
    data: [[
      { name: "AS Pro Elec", place_id: "place-as-pro-elec" },
      { name: "Entreprise Hubermont", place_id: "place-hubermont" },
    ]],
  });
  try {
    const result = await collectCompetitors({
      activite: "Électricien",
      ville: "Arlon",
      placeIdCible: "place-as-pro-elec",
      apiKey: "key",
    });
    assert.equal(result.ok, true);
    assert.equal(result.concurrents.length, 1);
    assert.equal(result.concurrents[0].name, "Entreprise Hubermont");
  } finally {
    restore();
  }
});

test("une annonce sponsorisée est exclue avant le calcul de la position et du top 3 organiques", async () => {
  const restore = mockFetchOnce({
    data: [[
      { name: "Mr Fixer Renovations Repairs", place_id: "ad-1", sponsored: true, reviews: 999 },
      { name: "Marce Emmanuel", place_id: "organic-1", sponsored: false, reviews: 30 },
      { name: "Haïm Rousselle Électricité", place_id: "target", sponsored: false, reviews: 0 },
      { name: "Ousteland Vincent Cornil", place_id: "organic-3", sponsored: false, reviews: 18 },
      { name: "Concurrent organique 4", place_id: "organic-4", sponsored: false, reviews: 12 },
    ]],
  });
  try {
    const result = await collectCompetitors({
      activite: "Électricien",
      ville: "Audun-le-Tiche",
      placeIdCible: "target",
      apiKey: "key",
      suppressSensitiveLogs: true,
    });
    assert.equal(result.position, 2);
    assert.equal(result.positionKind, "organic");
    assert.equal(result.sponsoredResultsExcluded, 1);
    assert.deepEqual(result.concurrents.map((item) => item.name), [
      "Marce Emmanuel",
      "Ousteland Vincent Cornil",
      "Concurrent organique 4",
    ]);
    assert.equal(result.concurrents.some((item) => item.name === "Mr Fixer Renovations Repairs"), false);
  } finally {
    restore();
  }
});

test("plusieurs annonces sponsorisées sont toutes exclues du classement et des concurrents", async () => {
  const restore = mockFetchOnce({
    data: [[
      { name: "Annonce A", place_id: "ad-a", isAd: true },
      { name: "Annonce B", place_id: "ad-b", result_type: "Sponsored" },
      { name: "Cible", place_id: "target", isAd: false },
      { name: "Concurrent A", place_id: "organic-a", isAd: false },
    ]],
  });
  try {
    const result = await collectCompetitors({ activite: "Garage", ville: "Arlon", placeIdCible: "target", apiKey: "key", suppressSensitiveLogs: true });
    assert.equal(result.position, 1);
    assert.equal(result.sponsoredResultsExcluded, 2);
    assert.deepEqual(result.concurrents.map((item) => item.name), ["Concurrent A"]);
  } finally {
    restore();
  }
});

test("sans donnée publicitaire disponible, la position historique est conservée sans déduction arbitraire", async () => {
  const restore = mockFetchOnce({
    data: [[
      { name: "Résultat A", place_id: "a" },
      { name: "Cible", place_id: "target" },
      { name: "Résultat B", place_id: "b" },
    ]],
  });
  try {
    const result = await collectCompetitors({ activite: "Garage", ville: "Arlon", placeIdCible: "target", apiKey: "key", suppressSensitiveLogs: true });
    assert.equal(result.position, 2);
    assert.equal(result.positionKind, "observed");
    assert.equal(result.sponsoredResultsExcluded, 0);
    assert.deepEqual(result.concurrents.map((item) => item.name), ["Résultat A", "Résultat B"]);
  } finally {
    restore();
  }
});

test("le nom d'une entreprise ne suffit jamais à la classer comme annonce", async () => {
  const restore = mockFetchOnce({ data: [[
    { name: "Sponsorisé Électricité", place_id: "target" },
    { name: "Concurrent", place_id: "c" },
  ]] });
  try {
    const result = await collectCompetitors({ activite: "Électricien", ville: "Metz", placeIdCible: "target", apiKey: "key", suppressSensitiveLogs: true });
    assert.equal(result.position, 1);
    assert.equal(result.positionKind, "observed");
  } finally {
    restore();
  }
});

test("la métadonnée organique n'est persistée que lorsque la classification publicitaire est disponible", () => {
  assert.deepEqual(addSearchResultContext({ name: "Cible" }, {
    positionKind: "organic",
    sponsoredResultsExcluded: 1,
  }), {
    name: "Cible",
    search_result_context: { position_kind: "organic", sponsored_results_excluded: 1 },
  });
  assert.deepEqual(addSearchResultContext({ name: "Cible" }, {
    positionKind: "observed",
    sponsoredResultsExcluded: 0,
  }), { name: "Cible" });
});

test("une recherche personnalisée est transmise au fournisseur sans être reconstruite côté client", async () => {
  const originalFetch = globalThis.fetch;
  let receivedQuery = "";
  globalThis.fetch = async (input) => {
    receivedQuery = new URL(String(input)).searchParams.get("query") || "";
    return Response.json({ data: [[{ name: "Concurrent", place_id: "other", reviews:0 }]] });
  };
  try {
    const result = await collectCompetitors({
      activite: "Électricien",
      ville: "Attert",
      requete: "Dépannage électricien agréé Attert",
      apiKey: "fixture-key",
    });
    assert.equal(result.ok, true);
    assert.equal(receivedQuery, "Dépannage électricien agréé Attert");
    assert.equal(result.requete, "Dépannage électricien agréé Attert");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
