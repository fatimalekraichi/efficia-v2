import test from "node:test";
import assert from "node:assert/strict";
import { collectCompetitors } from "../functions/lib/collectCompetitors.js";

// Bug corrigé — "l'entreprise est présente dans ses propres concurrents" :
// avant ce correctif, seul le place_id était comparé, et uniquement quand
// placeIdCible était renseigné (sinon aucune exclusion n'avait lieu). Ces
// tests couvrent les trois identifiants désormais comparés (place_id, CID,
// URL Google) ainsi que le cas où plus aucun concurrent ne subsiste après
// exclusion.

function mockFetchOnce(payload) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(payload);
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
