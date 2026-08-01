import test from "node:test";
import assert from "node:assert/strict";
import { collectFiche, __test__ } from "../functions/lib/collectFiche.js";

// Mission "remplacer la logique actuelle de décision du pipeline
// d'identification par une logique métier déterministe" — tests dédiés à
// decideOutcome() et à son usage dans collectFiche(). Remplace intégralement
// les tests de la mission précédente ("réduire les faux négatifs"), bâtis
// autour de decideTier() (écart de confiance + seuils), qui n'existe plus :
// la décision repose désormais sur des règles métier appliquées dans un
// ordre fixe (ville, puis nombre de candidats plausibles), le score de
// confiance ne servant plus qu'à trier/départager (Objectif 4).
//
// Nom de fichier conservé pour la continuité de l'historique de mission —
// le contenu couvre maintenant decideOutcome(), pas decideTier().

const {
  decideOutcome, computeConfidence, NAME_AUTO_THRESHOLD, DOMINANT_NAME_OVERLAP, DOMINANT_GAP,
} = __test__;

function mockFetchOnce(payload) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(payload);
  return () => {
    globalThis.fetch = originalFetch;
  };
}

// --- decideOutcome : tests unitaires directs sur des candidats fabriqués ---

function fakeEntry({ nameOverlap = 0, cityMismatch = false, nameScore = nameOverlap, confidence = nameOverlap }) {
  return { nameOverlap, nameScore, cityMismatch, confidence, place: { name: "peu importe" }, cityScore: 0 };
}

test("decideOutcome — Objectif 1 : tous les candidats en ville confirmée différente sont éliminés -> rejet immédiat", () => {
  const ranked = [fakeEntry({ nameOverlap: 0.95, cityMismatch: true }), fakeEntry({ nameOverlap: 0.90, cityMismatch: true })];
  const { tier, survivingCount } = decideOutcome(ranked);
  assert.equal(tier, "rejected");
  assert.equal(survivingCount, 0);
});

test("decideOutcome — Objectif 2 : un seul candidat après élimination de ville, nom raisonnablement proche -> automatique", () => {
  const ranked = [fakeEntry({ nameOverlap: 0.72 }), fakeEntry({ nameOverlap: 0.30, cityMismatch: true })];
  const { tier, best } = decideOutcome(ranked);
  assert.equal(tier, "auto");
  assert.equal(best.nameOverlap, 0.72);
});

test("decideOutcome — Objectif 2 : un seul candidat survivant mais nom trop éloigné -> validation manuelle (jamais un rejet arbitraire, Objectif 4)", () => {
  const ranked = [fakeEntry({ nameOverlap: 0.10 })];
  const { tier, candidates } = decideOutcome(ranked);
  assert.equal(tier, "ambiguous");
  assert.equal(candidates.length, 1);
});

test("decideOutcome — Objectif 3 : plusieurs candidats au nom également proche -> validation manuelle (ex. AS Pro Elec, deux établissements homonymes)", () => {
  const ranked = [fakeEntry({ nameOverlap: 1.0 }), fakeEntry({ nameOverlap: 1.0 })];
  const { tier, candidates, plausibleCount } = decideOutcome(ranked);
  assert.equal(tier, "ambiguous");
  assert.equal(plausibleCount, 2);
  assert.equal(candidates.length, 2);
});

test("decideOutcome — Objectif 4 (score en signal secondaire) : un candidat nettement dominant parmi plusieurs plausibles est retenu automatiquement", () => {
  const ranked = [
    fakeEntry({ nameOverlap: DOMINANT_NAME_OVERLAP }),
    fakeEntry({ nameOverlap: DOMINANT_NAME_OVERLAP - DOMINANT_GAP - 0.01 }),
  ];
  const { tier, best } = decideOutcome(ranked);
  assert.equal(tier, "auto");
  assert.equal(best.nameOverlap, DOMINANT_NAME_OVERLAP);
});

test("decideOutcome — pas de dominance si l'écart est trop faible, même au-dessus du seuil de nom", () => {
  const ranked = [
    fakeEntry({ nameOverlap: DOMINANT_NAME_OVERLAP }),
    fakeEntry({ nameOverlap: DOMINANT_NAME_OVERLAP - DOMINANT_GAP + 0.05 }),
  ];
  const { tier } = decideOutcome(ranked);
  assert.equal(tier, "ambiguous");
});

test("decideOutcome — sécurité structurelle (Objectif 6) : un candidat en ville confirmée différente n'est JAMAIS automatique, même avec un nameOverlap fabriqué à 1.0", () => {
  // Ne dépend pas du calibrage du score de nom : même un nom parfait ne peut
  // pas contourner l'élimination de ville — cityMismatch=true retire
  // structurellement le candidat de `surviving` avant même le calcul des
  // candidats plausibles.
  const ranked = [fakeEntry({ nameOverlap: 1.0, cityMismatch: true }), fakeEntry({ nameOverlap: 0.05 })];
  const { tier } = decideOutcome(ranked);
  assert.notEqual(tier, "auto");
});

// --- Ville différente : rejet immédiat (Objectif 1) -------------------------

test("ville différente : un candidat au nom identique mais en ville confirmée différente est éliminé -> rejet immédiat (mission logique métier déterministe)", async () => {
  // Changement de comportement assumé par rapport à la mission précédente
  // ("réduire les faux négatifs"), qui proposait ce cas en validation
  // manuelle. Reproduit l'exemple explicite de la mission : Messancy
  // demandé, Steinfort trouvé (cas réel "Sanidubru").
  const restore = mockFetchOnce({
    data: [[{ name: "Sanidubru Chauffage Sanitaire", place_id: "place-x", city: "Steinfort" }]],
  });
  try {
    const result = await collectFiche({ nom: "Sanidubru Chauffage Sanitaire", ville: "Messancy", apiKey: "key" });
    assert.equal(result.ok, false);
    assert.equal(result.error, "No reliable business match found.");
    assert.equal(result.message, "Aucune entreprise fiable trouvée.");
  } finally {
    restore();
  }
});

// --- Même nom : reste une sélection automatique -----------------------------

test("même nom, même ville : reste une sélection automatique sans validation manuelle (non-régression)", async () => {
  const restore = mockFetchOnce({
    data: [[{ name: "Menuiserie Grosjean", place_id: "place-y", city: "Arlon" }]],
  });
  try {
    const result = await collectFiche({ nom: "Menuiserie Grosjean", ville: "Arlon", apiKey: "key" });
    assert.equal(result.ok, true);
    assert.equal(result.tier, "auto");
  } finally {
    restore();
  }
});

// --- Objectif 2 : variantes normales explicitement citées par la mission ---

test("Objectif 2 — \"Garage Auto Claude\" -> \"Auto Claude\" : variante normale, sélection automatique, aucune validation manuelle", async () => {
  const restore = mockFetchOnce({
    data: [[{ name: "Auto Claude", place_id: "place-auto-claude", city: "Aubange" }]],
  });
  try {
    const result = await collectFiche({ nom: "Garage Auto Claude", ville: "Aubange", apiKey: "key" });
    assert.equal(result.ok, true);
    assert.equal(result.tier, "auto");
    assert.equal(result.fiche.place_id, "place-auto-claude");
  } finally {
    restore();
  }
});

test("Objectif 2 — \"Garage R.G. Pneus\" -> \"Garage R.G. Pneus (Régis Gofflot)\" : variante normale, sélection automatique", async () => {
  const restore = mockFetchOnce({
    data: [[{ name: "Garage R.G. Pneus (Régis Gofflot)", place_id: "place-rg-pneus", city: "Saint-Léger" }]],
  });
  try {
    const result = await collectFiche({ nom: "Garage R.G. Pneus", ville: "Saint-Léger", apiKey: "key" });
    assert.equal(result.ok, true);
    assert.equal(result.tier, "auto");
    assert.equal(result.fiche.place_id, "place-rg-pneus");
  } finally {
    restore();
  }
});

test("Objectif 2 — \"Taverne Chez Tony & Lucy\" -> \"La Taverne - Tony & Lucy Café\" : variante normale, sélection automatique", async () => {
  const restore = mockFetchOnce({
    data: [[{ name: "La Taverne - Tony & Lucy Café", place_id: "place-taverne", city: "Arlon" }]],
  });
  try {
    const result = await collectFiche({ nom: "Taverne Chez Tony & Lucy", ville: "Arlon", apiKey: "key" });
    assert.equal(result.ok, true);
    assert.equal(result.tier, "auto");
    assert.equal(result.fiche.place_id, "place-taverne");
  } finally {
    restore();
  }
});

// --- Objectif 3 : cas réellement ambigu explicitement cité par la mission --

test("Objectif 3 — \"AS Pro Elec\" : deux établissements distincts, même nom, même ville -> validation manuelle avec les deux candidats", async () => {
  const restore = mockFetchOnce({
    data: [[
      { name: "AS Pro Elec", place_id: "place-as-1", city: "Arlon" },
      { name: "AS Pro Elec", place_id: "place-as-2", city: "Arlon" },
    ]],
  });
  try {
    const result = await collectFiche({ nom: "AS Pro Elec", ville: "Arlon", apiKey: "key" });
    assert.equal(result.ok, false);
    assert.equal(result.error, "AMBIGUOUS_CANDIDATES");
    assert.equal(result.candidates.length, 2);
    assert.ok(result.candidates.some((c) => c.placeId === "place-as-1"));
    assert.ok(result.candidates.some((c) => c.placeId === "place-as-2"));
  } finally {
    restore();
  }
});

// --- Reproductions explicites demandées par la mission ----------------------

test("Beauty House Ophélie -> Beauty A : reste en validation manuelle, jamais automatique (garde-fou Objectif 6, non-régression)", async () => {
  const restore = mockFetchOnce({
    data: [[{ name: "Beauty A", place_id: "place-beauty-a", city: "Aubange" }]],
  });
  try {
    const result = await collectFiche({ nom: "Beauty House Ophélie", ville: "Aubange", apiKey: "key" });
    assert.equal(result.ok, false);
    assert.equal(result.error, "AMBIGUOUS_CANDIDATES");
  } finally {
    restore();
  }
});

test("Électricité Schroeder Eric -> Shrader Electric LLC : reste en validation manuelle, jamais automatique ni rejeté silencieusement (garde-fou Objectif 6, non-régression)", async () => {
  const restore = mockFetchOnce({
    data: [[{ name: "Shrader Electric LLC", place_id: "place-shrader", city: "" }]],
  });
  try {
    const result = await collectFiche({ nom: "Électricité Schroeder Eric", ville: "Attert", apiKey: "key" });
    assert.equal(result.ok, false);
    assert.equal(result.error, "AMBIGUOUS_CANDIDATES");
  } finally {
    restore();
  }
});

// --- computeConfidence : la ville confirmée différente ne remet plus à 0 ---

test("computeConfidence : ville confirmée différente -- un bon score de nom reste visible, cityMismatch=true signale l'élimination à venir dans decideOutcome", () => {
  const strongName = computeConfidence({
    nomTrim: "Sanidubru",
    villeTrim: "Messancy",
    place: { name: "SANIDUBRU", city: "Steinfort" },
  });
  assert.equal(strongName.cityMismatch, true);
  assert.ok(strongName.confidence > 0.5);
  assert.ok(strongName.nameOverlap > NAME_AUTO_THRESHOLD, "le nom seul resterait auto-sélectionnable — c'est bien la ville qui élimine ce candidat, pas le nom");
});

test("computeConfidence : ville confirmée différente ET nom sans rapport -- reste sous le seuil de proximité de nom", () => {
  const noMatch = computeConfidence({
    nomTrim: "Sanidubru",
    villeTrim: "Messancy",
    place: { name: "Institut Kiné Wellness", city: "Steinfort" },
  });
  assert.equal(noMatch.cityMismatch, true);
  assert.ok(noMatch.nameOverlap < NAME_AUTO_THRESHOLD);
});

// --- Garantit que les constantes existent et sont dans un ordre cohérent ---

test("constantes de décision : ordre cohérent (NAME_AUTO_THRESHOLD < DOMINANT_NAME_OVERLAP, DOMINANT_GAP > 0)", () => {
  assert.ok(NAME_AUTO_THRESHOLD > 0 && NAME_AUTO_THRESHOLD < 1);
  assert.ok(NAME_AUTO_THRESHOLD < DOMINANT_NAME_OVERLAP);
  assert.ok(DOMINANT_GAP > 0 && DOMINANT_GAP < 1);
});
