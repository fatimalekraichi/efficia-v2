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
// (nom + ville) + décision par règles métier déterministes (voir
// decisionStrategyRuleBased.test.js pour les tests dédiés à decideOutcome).
//
// Mission "remplacer la logique actuelle de décision du pipeline
// d'identification par une logique métier déterministe" — plusieurs tests
// ci-dessous ont changé de résultat ATTENDU par rapport à la mission
// précédente ("réduire les faux négatifs") : la ville prime désormais
// strictement (Objectif 1), un candidat dont la ville est connue et
// confirmée différente est ÉLIMINÉ plutôt que proposé en validation
// manuelle. Chaque changement est documenté dans le commentaire du test
// concerné.

const { computeConfidence, rankCandidates, nameSimilarity, citySimilarity, NAME_AUTO_THRESHOLD } = __test__;

function mockFetchOnce(payload) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(payload);
  return () => {
    globalThis.fetch = originalFetch;
  };
}

test("collectFiche : ne prend jamais automatiquement le premier résultat sans vérification de similarité", async () => {
  // Le premier résultat brut renvoyé par Outscraper est un homonyme éloigné
  // ET dans une autre ville (Objectif 1 : éliminé d'office), le second est
  // la correspondance réelle, seule survivante -> sélection automatique
  // (Objectif 2 : candidat unique, ville cohérente, nom identique).
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

test("collectFiche : une entreprise dont le nom diffère fortement (Shrader Electric LLC) n'est jamais choisie automatiquement pour Électricité Schroeder Eric — reste en validation manuelle", async () => {
  // Reproduit le cas réel observé (campagne des 20 audits) : Outscraper ne
  // renvoie qu'un seul candidat, sans rapport avec le nom demandé, mais avec
  // une ville inconnue côté candidat (donc pas d'élimination de ville
  // possible ici — Objectif 1 ne s'applique que si les DEUX villes sont
  // connues). Mission "logique métier déterministe" — Objectif 4 : le rejet
  // reste l'exception ; un candidat existe réellement, il est donc proposé en
  // validation manuelle plutôt que rejeté d'office, mais son nom trop
  // éloigné (nameScore très inférieur à NAME_AUTO_THRESHOLD) l'empêche à
  // jamais d'être sélectionné seul automatiquement (Objectif 6, sécurité).
  const restore = mockFetchOnce({
    data: [[
      { name: "Shrader Electric LLC", place_id: "place-shrader", city: "" },
    ]],
  });
  try {
    const result = await collectFiche({ nom: "Électricité Schroeder Eric", ville: "Attert", apiKey: "key" });
    assert.equal(result.ok, false);
    assert.equal(result.error, "AMBIGUOUS_CANDIDATES");
    const found = result.candidates.find((c) => c.placeId === "place-shrader");
    assert.ok(found, "Shrader Electric LLC doit rester proposée en validation manuelle, jamais rejetée silencieusement ni sélectionnée seule");
  } finally {
    restore();
  }
});

test("collectFiche : une entreprise dont la ville est connue et confirmée différente est éliminée -> rejet immédiat (Objectif 1)", async () => {
  // Reproduit le cas réel "CDV Construction" (Arlon) -> "CDG Construction"
  // (Virton), exemple explicite de la mission "logique métier déterministe" :
  // "Si la ville est connue : Ville demandée != Ville trouvée -> rejet
  // immédiat. Le candidat doit être éliminé, il ne doit même plus participer
  // au calcul." Changement de comportement volontaire par rapport à la
  // mission précédente ("réduire les faux négatifs"), qui proposait ce cas
  // en validation manuelle plutôt qu'un rejet : ici, la ville prime
  // strictement sur la qualité du nom, aussi bonne soit-elle.
  const restore = mockFetchOnce({
    data: [[
      { name: "CDG Construction", place_id: "place-cdg", city: "Virton" },
    ]],
  });
  try {
    const result = await collectFiche({ nom: "CDV Construction", ville: "Arlon", apiKey: "key" });
    assert.equal(result.ok, false);
    assert.equal(result.error, "No reliable business match found.");
    assert.equal(result.message, "Aucune entreprise fiable trouvée.");
  } finally {
    restore();
  }
});

test("collectFiche : une correspondance légitime mais formulée différemment (nom éloigné, même ville) reste proposée en validation manuelle", async () => {
  // Garde-fou : le score de confiance ne doit pas devenir si strict qu'il
  // REJETTE une correspondance réelle (raison sociale complète, casse
  // différente, forme juridique en plus, adresse ajoutée). nameScore ici
  // (~0,29) reste sous NAME_AUTO_THRESHOLD (0,40) : pas de sélection
  // automatique, mais la ville est cohérente (Aubange = Aubange), donc le
  // candidat n'est jamais éliminé — validation humaine (Objectif 3/4).
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
  } finally {
    restore();
  }
});

test("collectFiche : une correspondance quasi parfaite (nom identique, ville identique) est auto-sélectionnée sans validation manuelle", async () => {
  // Candidat unique, ville cohérente, nom quasi identique -> Objectif 2 :
  // sélection automatique, aucune validation manuelle.
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

test("collectFiche : selectedCandidate déjà connu -> utilisé directement, sans aucun appel réseau (Objectif 5)", async () => {
  // Mission "logique métier déterministe" — Objectif 5 : quand le candidat
  // complet est déjà fourni (cas d'une confirmation manuelle après une
  // réponse AMBIGUOUS_CANDIDATES précédente), collectFiche() ne doit RIEN
  // appeler côté réseau — le test le prouve en faisant échouer fetch s'il
  // est appelé.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("fetch ne doit jamais être appelé quand selectedCandidate est fourni");
  };
  try {
    const selectedCandidate = { place_id: "place-beauty-a", name: "Beauty A", city: "Aubange" };
    const result = await collectFiche({
      nom: "Beauty House Ophélie",
      ville: "Aubange",
      apiKey: "key",
      selectedPlaceId: "place-beauty-a",
      selectedCandidate,
    });
    assert.equal(result.ok, true);
    assert.equal(result.tier, "manual");
    assert.equal(result.confidence, null);
    assert.deepEqual(result.fiche, selectedCandidate);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- Tests unitaires du score de confiance lui-même ------------------------

test("score de confiance : ville confirmée différente => cityMismatch=true, mais le nom reste visible et non écrasé (mission logique métier déterministe)", () => {
  // computeConfidence() ne plafonne plus ni ne zéro la confiance en cas de
  // divergence de ville : elle se contente de signaler `cityMismatch`, que
  // decideOutcome() utilise ensuite pour ÉLIMINER le candidat (Objectif 1).
  // Séparation des responsabilités : computeConfidence mesure, decideOutcome
  // décide.
  const identicalName = computeConfidence({
    nomTrim: "CDV Construction",
    villeTrim: "Arlon",
    place: { name: "CDV Construction", city: "Virton" },
  });
  assert.equal(identicalName.cityMismatch, true);
  assert.ok(identicalName.confidence > 0.5, "un nom identique reste un signal fort dans le score, même si la ville diverge");
});

test("score de confiance : ville absente côté Outscraper => neutre, ne pénalise pas une correspondance de nom forte", () => {
  const result = computeConfidence({
    nomTrim: "AS Pro Elec",
    villeTrim: "Arlon",
    place: { name: "AS pro elec", city: "" },
  });
  assert.equal(result.cityMismatch, false);
  assert.ok(result.confidence > 0.5);
});

test("nameSimilarity : robuste à la casse, aux accents et à la forme juridique", () => {
  assert.ok(nameSimilarity("Sanidubru", "SANIDUBRU") > 0.9);
  assert.ok(nameSimilarity("Garage Auto Claude", "Auto Claude") > NAME_AUTO_THRESHOLD);
});

test("nameOverlap (Objectif 2) : sépare une reformulation légitime d'un nom propre réellement différent — là où nameSimilarity seul s'y trompe", () => {
  // Calibrage réel : nameSimilarity("Boucherie Marchal", "Boucherie Marchand")
  // = 0,556, PLUS ÉLEVÉ que nameSimilarity("Garage R.G. Pneus", "Garage R.G.
  // Pneus (Régis Gofflot)") = 0,558 (quasiment égal) — alors que le premier
  // couple désigne deux commerces différents (un seul caractère change le nom
  // propre) et le second la même entreprise reformulée. tokenOverlapRatio
  // (nameOverlap), qui ignore la proximité lettre à lettre, sépare nettement
  // les deux cas.
  const { tokenOverlapRatio } = __test__;
  const legitimateReformulation = tokenOverlapRatio("Garage R.G. Pneus", "Garage R.G. Pneus (Régis Gofflot)");
  const differentBusiness = tokenOverlapRatio("Boucherie Marchal", "Boucherie Marchand");
  assert.ok(legitimateReformulation >= NAME_AUTO_THRESHOLD, "la reformulation légitime doit franchir le seuil d'auto-sélection");
  assert.ok(differentBusiness < NAME_AUTO_THRESHOLD, "le nom propre différent ne doit jamais franchir le seuil d'auto-sélection");
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
