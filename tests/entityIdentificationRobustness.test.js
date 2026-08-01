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

const { nameSimilarity, computeConfidence, MIN_CONFIDENCE, HIGH_CONFIDENCE_THRESHOLD } = __test__;

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
      // serait exactement la régression de la mission précédente.
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

test("même ville, activités différentes : un mot de secteur partagé (générique) ne suffit jamais à confondre deux entreprises distinctes", async () => {
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

test("même activité, villes différentes : la ville confirmée différente écarte net l'homonyme, même avec un nom rigoureusement identique", async () => {
  const restore = mockFetchOnce({
    data: [[
      { name: "Garage Martin", place_id: "place-virton", city: "Virton" },
    ]],
  });
  try {
    const result = await collectFiche({ nom: "Garage Martin", ville: "Arlon", apiKey: "key" });
    assert.equal(result.ok, false);
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
      result.confidence >= HIGH_CONFIDENCE_THRESHOLD,
      `"Boulangerie Petit ${form}" devrait rester une correspondance quasi parfaite (confiance obtenue : ${result.confidence})`,
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

test("régression explicite Beauty House Ophélie -> Beauty A : jamais auto-sélectionné, jamais rejeté silencieusement — validation manuelle obligatoire", async () => {
  // Reproduit fidèlement le cas réel observé sur la campagne des 20 audits
  // (tmp/beta-audits-20/16-beauty-house-ophelie/) : Outscraper ne renvoie
  // qu'un seul candidat plausible, "Beauty A", même ville (Aubange). Sous
  // l'ancien système à deux paliers, la confiance (0,503) dépassait le seuil
  // minimal et l'audit était produit à tort sur "Beauty A". Avec le système
  // à trois paliers, cette confiance est trop faible pour l'auto-sélection
  // (seuil 0,95) : l'audit doit être bloqué en attente de validation
  // humaine, jamais produit automatiquement sur la mauvaise entreprise.
  const restore = mockFetchOnce({
    data: [[
      { name: "Beauty A", place_id: "place-beauty-a", city: "Aubange" },
    ]],
  });
  try {
    const result = await collectFiche({ nom: "Beauty House Ophélie", ville: "Aubange", apiKey: "key" });
    assert.equal(result.ok, false, "ne doit jamais être auto-accepté (ok:true) pour ce cas");
    assert.equal(result.error, "AMBIGUOUS_CANDIDATES");
    assert.equal(result.message, "Nous avons trouvé plusieurs entreprises pouvant correspondre.");
    const beautyA = result.candidates.find((c) => c.placeId === "place-beauty-a");
    assert.ok(beautyA, "Beauty A doit rester proposée comme candidate plausible pour validation humaine");
    assert.ok(beautyA.confidence >= MIN_CONFIDENCE && beautyA.confidence < HIGH_CONFIDENCE_THRESHOLD);
  } finally {
    restore();
  }
});

test("régression explicite Beauty House Ophélie -> Beauty A : une fois l'administrateur confirmé sur \"Beauty A\" via selectedPlaceId, la collecte utilise ce choix explicite", async () => {
  // Objectif 2 : après validation humaine, le pipeline continue normalement
  // avec le candidat explicitement choisi (même s'il n'aurait jamais été
  // retenu automatiquement) — le choix humain prime toujours.
  const restore = mockFetchOnce({
    data: [[
      { name: "Beauty A", place_id: "place-beauty-a", city: "Aubange" },
    ]],
  });
  try {
    const result = await collectFiche({
      nom: "Beauty House Ophélie",
      ville: "Aubange",
      apiKey: "key",
      selectedPlaceId: "place-beauty-a",
    });
    assert.equal(result.ok, true);
    assert.equal(result.tier, "manual");
    assert.equal(result.fiche.place_id, "place-beauty-a");
  } finally {
    restore();
  }
});
