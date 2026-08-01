import test from "node:test";
import assert from "node:assert/strict";
import { collectFiche, __test__ } from "../functions/lib/collectFiche.js";

// Mission "rendre l'identification de l'entreprise suffisamment robuste pour
// le lancement de la bêta" — Objectif 6 : couverture exhaustive des cas
// listés explicitement dans la mission (plusieurs entités au même nom,
// même ville mais activités différentes, même activité mais villes
// différentes, nom très proche, nom identique, formes juridiques, accents,
// casse, espaces, caractères spéciaux) + reproduction explicite du cas
// "Beauty House Ophélie -> Beauty A" pour garantir que cette régression
// précise ne revienne jamais.
//
// Mission "remplacer la logique actuelle de décision du pipeline
// d'identification par une logique métier déterministe" — le test n°3
// ("même activité, villes différentes") change de résultat ATTENDU :
// Objectif 1 fait désormais de la ville un critère d'élimination stricte
// plutôt qu'un simple signal pondéré — voir le commentaire du test.

const { nameSimilarity, computeConfidence, NAME_AUTO_THRESHOLD } = __test__;

function mockFetchOnce(payload) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(payload);
  return () => {
    globalThis.fetch = originalFetch;
  };
}

// --- 1. Plusieurs entités portant le même nom, dans des villes différentes -

test("homonymes : deux entreprises portent EXACTEMENT le même nom dans deux villes différentes -> seule celle de la bonne ville est retenue, quelle que soit sa position dans la liste brute", async () => {
  const restore = mockFetchOnce({
    data: [[
      // L'homonyme de la mauvaise ville est délibérément placé EN PREMIER :
      // si le code prenait encore le premier résultat sans comparer, ce
      // serait exactement la régression de la mission précédente. Mission
      // "logique métier déterministe" — Objectif 1 : cet homonyme de
      // Messancy est désormais ÉLIMINÉ (ville connue et différente), pas
      // seulement mal classé.
      { name: "Boulangerie Dupont", place_id: "place-messancy", city: "Messancy" },
      { name: "Boulangerie Dupont", place_id: "place-arlon", city: "Arlon" },
    ]],
  });
  try {
    const result = await collectFiche({ nom: "Boulangerie Dupont", ville: "Arlon", apiKey: "key" });
    assert.equal(result.ok, true);
    assert.equal(result.tier, "auto");
    assert.equal(result.fiche.place_id, "place-arlon");
    assert.equal(result.fiche.city, "Arlon");
  } finally {
    restore();
  }
});

// --- 2. Même ville, activités différentes ----------------------------------

test("même ville, activités différentes : un candidat manifestement dominant (nom quasi identique) prime sur un homonyme partiel (mot de secteur générique partagé)", async () => {
  // Mission "logique métier déterministe" — Objectif 4 (score en signal
  // secondaire) : "Garage Martin" (nom demandé, chevauchement de mots 1.0)
  // et "Coiffure Martin" (même ville, chevauchement 0.588 — élevé
  // uniquement parce que "garage"/"coiffure" sont deux mots génériques de
  // secteur peu pondérés) franchissent tous deux le seuil de proximité de
  // nom, mais l'écart entre les deux reste assez net pour que le premier
  // soit retenu automatiquement plutôt que d'imposer une validation
  // manuelle inutile.
  const restore = mockFetchOnce({
    data: [[
      { name: "Coiffure Martin", place_id: "place-coiffure", city: "Arlon" },
      { name: "Garage Martin", place_id: "place-garage", city: "Arlon" },
    ]],
  });
  try {
    const result = await collectFiche({ nom: "Garage Martin", ville: "Arlon", apiKey: "key" });
    assert.equal(result.ok, true);
    assert.equal(result.tier, "auto");
    assert.equal(result.fiche.place_id, "place-garage");
  } finally {
    restore();
  }
});

// --- 3. Même activité, villes différentes -----------------------------------

test("même activité, villes différentes : la ville confirmée différente élimine le candidat -> rejet immédiat (mission logique métier déterministe, Objectif 1)", async () => {
  // Changement de comportement volontaire par rapport à la mission
  // précédente ("réduire les faux négatifs"), qui proposait ce cas en
  // validation manuelle plutôt qu'un rejet. La mission "logique métier
  // déterministe" est explicite : "Si la ville est connue : Ville demandée
  // != Ville trouvée -> rejet immédiat. Le candidat doit être éliminé, il ne
  // doit même plus participer au calcul." La ville prime désormais
  // strictement sur la qualité du nom, aussi bonne soit-elle.
  const restore = mockFetchOnce({
    data: [[
      { name: "Garage Martin", place_id: "place-virton", city: "Virton" },
    ]],
  });
  try {
    const result = await collectFiche({ nom: "Garage Martin", ville: "Arlon", apiKey: "key" });
    assert.equal(result.ok, false);
    assert.equal(result.error, "No reliable business match found.");
    assert.equal(result.message, "Aucune entreprise fiable trouvée.");
  } finally {
    restore();
  }
});

// --- 4. Nom très proche mais réellement différent ---------------------------

test("nom très proche mais différent (Boucherie Marchal / Boucherie Marchand) : jamais auto-sélectionné, proposé en validation manuelle uniquement", async () => {
  const restore = mockFetchOnce({
    data: [[
      { name: "Boucherie Marchand", place_id: "place-marchand", city: "Aubange" },
    ]],
  });
  try {
    const result = await collectFiche({ nom: "Boucherie Marchal", ville: "Aubange", apiKey: "key" });
    assert.equal(result.ok, false);
    assert.equal(result.error, "AMBIGUOUS_CANDIDATES");
    assert.equal(result.candidates[0].placeId, "place-marchand");
  } finally {
    restore();
  }
});

test("nom très proche mais différent (Pharmacie Léonard / Pharmacie Leonart) : jamais auto-sélectionné", async () => {
  const restore = mockFetchOnce({
    data: [[
      { name: "Pharmacie Leonart", place_id: "place-leonart", city: "Arlon" },
    ]],
  });
  try {
    const result = await collectFiche({ nom: "Pharmacie Léonard", ville: "Arlon", apiKey: "key" });
    assert.equal(result.ok, false);
    assert.equal(result.error, "AMBIGUOUS_CANDIDATES");
  } finally {
    restore();
  }
});

// --- 5. Nom identique --------------------------------------------------------

test("nom strictement identique + ville identique : confiance maximale, sélection automatique sans validation manuelle", async () => {
  const restore = mockFetchOnce({
    data: [[
      { name: "Électricité Générale Dupont", place_id: "place-dupont", city: "Arlon" },
    ]],
  });
  try {
    const result = await collectFiche({ nom: "Électricité Générale Dupont", ville: "Arlon", apiKey: "key" });
    assert.equal(result.ok, true);
    assert.equal(result.tier, "auto");
    assert.equal(result.confidence, 1);
  } finally {
    restore();
  }
});

// --- 6. Formes juridiques (SPRL, SRL, SA, SNC, ASBL, etc.) -----------------

test("formes juridiques : ajouter une forme juridique courante ne fait jamais chuter une correspondance sous le seuil d'auto-sélection", () => {
  const legalForms = ["SPRL", "SRL", "SA", "SNC", "ASBL", "SCRL", "SC", "BV", "NV", "GmbH"];
  for (const form of legalForms) {
    const result = computeConfidence({
      nomTrim: "Boulangerie Petit",
      villeTrim: "Messancy",
      place: { name: `Boulangerie Petit ${form}`, city: "Messancy" },
    });
    assert.ok(
      result.nameOverlap >= NAME_AUTO_THRESHOLD,
      `"Boulangerie Petit ${form}" devrait rester une correspondance auto-sélectionnable (nameOverlap obtenu : ${result.nameOverlap})`,
    );
  }
});

// --- 7. Accents --------------------------------------------------------------

test("accents : la comparaison de noms est insensible aux accents", () => {
  assert.ok(nameSimilarity("Électricité Générale", "Electricite Generale") > 0.95);
  assert.ok(nameSimilarity("Café de la Gare", "Cafe de la Gare") > 0.9);
});

// --- 8. Casse ------------------------------------------------------------------

test("casse : la comparaison de noms est insensible à la casse", () => {
  assert.ok(nameSimilarity("GARAGE DUPONT", "garage dupont") > 0.95);
  assert.ok(nameSimilarity("Beauty House Ophélie", "BEAUTY HOUSE OPHÉLIE") > 0.95);
});

// --- 9. Espaces ------------------------------------------------------------------

test("espaces : espaces multiples, en début ou en fin, n'affectent pas la comparaison", () => {
  assert.ok(nameSimilarity("Garage   Dupont", "Garage Dupont") > 0.95);
  assert.ok(nameSimilarity("  Garage Dupont  ", "Garage Dupont") > 0.95);
});

// --- 10. Caractères spéciaux ------------------------------------------------------

test("caractères spéciaux : ponctuation, esperluette et tirets n'affectent pas la comparaison", () => {
  assert.ok(nameSimilarity("Garage Dupont & Fils", "Garage Dupont Fils") > 0.95);
  assert.ok(nameSimilarity("Auto-École Martin", "Auto Ecole Martin") > 0.95);
});

// --- 11. Reproduction explicite du cas cité par la mission ------------------

test("régression explicite Beauty House Ophélie -> Beauty A + Pura Vida Institut : jamais auto-sélectionné, jamais rejeté silencieusement — validation manuelle avec les deux candidats réels", async () => {
  // Reproduit fidèlement le cas réel observé sur la campagne des 20 audits
  // (tmp/beta-audits-20/16-beauty-house-ophelie/) : Outscraper renvoie deux
  // candidats plausibles par la ville (Aubange), "Beauty A" et "Pura Vida
  // Institut", aucun des deux avec un nom suffisamment proche pour trancher
  // seul (nameOverlap Beauty A = 0,25, Pura Vida = 0 — tous deux sous
  // NAME_AUTO_THRESHOLD). Mission "logique métier déterministe" — Objectif 4
  // (le rejet reste l'exception) : les DEUX candidats réels sont proposés à
  // la validation humaine plutôt qu'un rejet arbitraire ou un choix
  // automatique risqué.
  const restore = mockFetchOnce({
    data: [[
      { name: "Beauty A", place_id: "place-beauty-a", city: "Aubange" },
      { name: "Pura Vida Institut", place_id: "place-pura-vida", city: "Aubange" },
    ]],
  });
  try {
    const result = await collectFiche({ nom: "Beauty House Ophélie", ville: "Aubange", apiKey: "key" });
    assert.equal(result.ok, false, "ne doit jamais être auto-accepté (ok:true) pour ce cas");
    assert.equal(result.error, "AMBIGUOUS_CANDIDATES");
    assert.equal(result.message, "Nous avons trouvé plusieurs entreprises pouvant correspondre.");
    const beautyA = result.candidates.find((c) => c.placeId === "place-beauty-a");
    const puraVida = result.candidates.find((c) => c.placeId === "place-pura-vida");
    assert.ok(beautyA, "Beauty A doit rester proposée comme candidate plausible pour validation humaine");
    assert.ok(puraVida, "Pura Vida Institut doit aussi être proposée — pas de rejet arbitraire d'une des deux options réelles");
    // Objectif 5 : chaque candidat porte sa fiche complète (`raw`), pour
    // permettre une confirmation manuelle sans jamais rappeler Outscraper.
    assert.equal(beautyA.raw.place_id, "place-beauty-a");
    assert.equal(puraVida.raw.place_id, "place-pura-vida");
  } finally {
    restore();
  }
});

test("régression explicite Beauty House Ophélie -> Beauty A : une fois l'administrateur confirmé via selectedCandidate, la collecte utilise ce choix explicite sans aucun nouvel appel réseau", async () => {
  // Objectif 2/5 : après validation humaine, le pipeline continue
  // normalement avec le candidat explicitement choisi (même s'il n'aurait
  // jamais été retenu automatiquement) — le choix humain prime toujours, et
  // ne dépend plus d'un second appel à Outscraper (cause du bug
  // SELECTED_CANDIDATE_NOT_FOUND observé sur la campagne réelle).
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
    assert.equal(result.fiche.place_id, "place-beauty-a");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
