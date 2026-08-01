import test from "node:test";
import assert from "node:assert/strict";
import { collectFiche, __test__ } from "../functions/lib/collectFiche.js";

// Mission "corriger les deux problèmes critiques révélés par la campagne de
// validation de 20 Audits Premium Efficia™" — Objectif 6 (tests de
// non-régression). Cause du bug d'identification (Objectif 1) :
// organizationsPerQueryLimit=1 dans collectFiche.js ne renvoyait jamais
// qu'UN SEUL résultat, jamais comparé à rien, pris tel quel — exactement le
// cas "Électricité Schroeder Eric" -> "Shrader Electric LLC", "CDV
// Construction" -> "CDG Construction", "Beauty House Ophélie" -> "Beauty A"
// observés sur la campagne réelle (tmp/beta-audits-20/). Correctif :
// plusieurs candidats demandés (CANDIDATE_LIMIT) + score de confiance
// (nom + ville) + rejet net si aucun candidat n'est assez fiable.

const { computeConfidence, rankCandidates, nameSimilarity, citySimilarity, MIN_CONFIDENCE } = __test__;

function mockFetchOnce(payload) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(payload);
  return () => {
    globalThis.fetch = originalFetch;
  };
}

test("collectFiche : ne prend jamais automatiquement le premier résultat sans vérification de similarité", async () => {
  // Le premier résultat brut renvoyé par Outscraper est un homonyme éloigné,
  // le second est la correspondance réelle — sans score de confiance, le
  // code historique (organizationsPerQueryLimit=1) n'aurait jamais vu que le
  // premier et l'aurait accepté tel quel.
  const restore = mockFetchOnce({
    data: [[
      { name: "Autre Électricité SPRL", place_id: "place-wrong", city: "Bastogne" },
      { name: "Électricité Schroeder Eric", place_id: "place-right", city: "Attert" },
    ]],
  });
  try {
    const result = await collectFiche({ nom: "Électricité Schroeder Eric", ville: "Attert", apiKey: "key" });
    assert.equal(result.ok, true);
    assert.equal(result.fiche.place_id, "place-right");
    assert.equal(result.fiche.name, "Électricité Schroeder Eric");
  } finally {
    restore();
  }
});

test("collectFiche : une entreprise dont le nom diffère fortement (Shrader Electric LLC) n'est jamais choisie pour Électricité Schroeder Eric", async () => {
  // Reproduit le cas réel observé (campagne des 20 audits) : Outscraper ne
  // renvoie qu'un seul candidat, sans rapport avec le nom demandé.
  const restore = mockFetchOnce({
    data: [[
      { name: "Shrader Electric LLC", place_id: "place-shrader", city: "" },
    ]],
  });
  try {
    const result = await collectFiche({ nom: "Électricité Schroeder Eric", ville: "Attert", apiKey: "key" });
    assert.equal(result.ok, false);
    assert.equal(result.message, "Aucune entreprise fiable trouvée.");
  } finally {
    restore();
  }
});

test("collectFiche : une entreprise dont la ville diffère n'est jamais retenue, même avec un nom très proche", async () => {
  // Reproduit le cas réel "CDV Construction" (Arlon) -> "CDG Construction"
  // (Virton) : un seul caractère sépare les deux noms (similarité textuelle
  // élevée), mais la ville détectée contredit clairement la ville demandée.
  const restore = mockFetchOnce({
    data: [[
      { name: "CDG Construction", place_id: "place-cdg", city: "Virton" },
    ]],
  });
  try {
    const result = await collectFiche({ nom: "CDV Construction", ville: "Arlon", apiKey: "key" });
    assert.equal(result.ok, false);
    assert.equal(result.message, "Aucune entreprise fiable trouvée.");
  } finally {
    restore();
  }
});

test("collectFiche : une correspondance légitime mais formulée différemment n'est jamais rejetée à tort — elle est proposée en validation manuelle (mission robustesse)", async () => {
  // Garde-fou : le score de confiance ne doit pas devenir si strict qu'il
  // REJETTE une correspondance réelle (raison sociale complète, casse
  // différente, forme juridique en plus). Mais depuis la mission "rendre
  // l'identification suffisamment robuste pour le lancement de la bêta",
  // une correspondance non quasi-parfaite (confiance 0,506 ici, sous le
  // seuil d'auto-sélection à 0,95) n'est plus non plus acceptée d'office :
  // elle doit être proposée à validation humaine (palier "ambigu"), jamais
  // silencieusement auto-sélectionnée ni silencieusement rejetée.
  const restore = mockFetchOnce({
    data: [[
      { name: "Garage PNEUS Courtois SRL - Aubange - 1,2,3 AutoService", place_id: "place-courtois", city: "Aubange" },
    ]],
  });
  try {
    const result = await collectFiche({ nom: "Garage Pneus M. Courtois", ville: "Aubange", apiKey: "key" });
    assert.equal(result.ok, false);
    assert.equal(result.error, "AMBIGUOUS_CANDIDATES");
    assert.equal(result.message, "Nous avons trouvé plusieurs entreprises pouvant correspondre.");
    const found = result.candidates.find((c) => c.placeId === "place-courtois");
    assert.ok(found, "la bonne fiche doit figurer parmi les candidats proposés à validation manuelle");
    assert.ok(found.confidence >= MIN_CONFIDENCE);
  } finally {
    restore();
  }
});

test("collectFiche : une correspondance quasi parfaite (nom identique, ville identique) est auto-sélectionnée sans validation manuelle", async () => {
  // Contre-exemple du test précédent : quand la confiance est très élevée
  // (>= HIGH_CONFIDENCE_THRESHOLD), aucune validation manuelle n'est requise
  // — l'audit continue normalement (Objectif 1).
  const restore = mockFetchOnce({
    data: [[
      { name: "Garage Pneus Courtois", place_id: "place-courtois", city: "Aubange" },
    ]],
  });
  try {
    const result = await collectFiche({ nom: "Garage Pneus Courtois", ville: "Aubange", apiKey: "key" });
    assert.equal(result.ok, true);
    assert.equal(result.fiche.place_id, "place-courtois");
  } finally {
    restore();
  }
});

test("collectFiche : aucun résultat brut -> erreur générique (comportement historique conservé)", async () => {
  const restore = mockFetchOnce({ data: [[]] });
  try {
    const result = await collectFiche({ nom: "Entreprise Inconnue", ville: "Nulle Part", apiKey: "key" });
    assert.equal(result.ok, false);
    assert.equal(result.error, "No business found.");
  } finally {
    restore();
  }
});

test("collectFiche : mode URL/observationQuery directe (sans nom+ville) conserve le comportement historique — pas de score", async () => {
  const restore = mockFetchOnce({
    data: [[
      { name: "Peu importe", place_id: "place-first" },
      { name: "Autre", place_id: "place-second" },
    ]],
  });
  try {
    const result = await collectFiche({ queryOverride: "https://maps.google.com/?cid=123", apiKey: "key" });
    assert.equal(result.ok, true);
    assert.equal(result.fiche.place_id, "place-first");
  } finally {
    restore();
  }
});

// --- Tests unitaires du score de confiance lui-même ------------------------

test("score de confiance : ville confirmée différente => rejet net (0), quelle que soit la similarité du nom", () => {
  const identicalName = computeConfidence({
    nomTrim: "CDV Construction",
    villeTrim: "Arlon",
    place: { name: "CDV Construction", city: "Virton" },
  });
  assert.equal(identicalName.confidence, 0);
});

test("score de confiance : ville absente côté Outscraper => neutre, ne pénalise pas une correspondance de nom forte", () => {
  const result = computeConfidence({
    nomTrim: "AS Pro Elec",
    villeTrim: "Arlon",
    place: { name: "AS pro elec", city: "" },
  });
  assert.ok(result.confidence >= MIN_CONFIDENCE);
});

test("nameSimilarity : robuste à la casse, aux accents et à la forme juridique", () => {
  assert.ok(nameSimilarity("Sanidubru", "SANIDUBRU") > 0.9);
  assert.ok(nameSimilarity("Garage Auto Claude", "Auto Claude") > 0.5);
});

test("citySimilarity : -1 seulement si la ville candidate est connue ET différente", () => {
  assert.equal(citySimilarity("Arlon", { city: "Virton" }), -1);
  assert.equal(citySimilarity("Arlon", { city: "" }), 0.5);
  assert.equal(citySimilarity("Arlon", { city: "Arlon" }), 1);
});

test("rankCandidates : trie par confiance décroissante, jamais par ordre d'arrivée (même quand la bonne fiche n'est pas en tête des résultats bruts)", () => {
  // Ne prouve pas que la bonne fiche est TOUJOURS présente parmi les
  // candidats renvoyés par Outscraper (limite réelle documentée dans le
  // rapport de mission, cas "Beauty A" toujours renvoyé à la place de
  // "Beauty House Ophélie" sur la campagne réelle) — prouve seulement que,
  // quand elle l'est, ce n'est plus sa position dans la liste brute qui
  // décide, mais son score de confiance.
  const ranked = rankCandidates({
    nomTrim: "Beauty House Ophélie",
    villeTrim: "Aubange",
    places: [
      { name: "Beauty A", city: "Aubange" },
      { name: "Beauty House Ophélie", city: "Aubange" },
    ],
  });
  assert.equal(ranked[0].place.name, "Beauty House Ophélie");
});
