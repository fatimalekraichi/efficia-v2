import test from "node:test";
import assert from "node:assert/strict";
import { businessImpacts } from "../functions/lib/reasoning-engine/businessImpacts.js";
import { respectsToneRules } from "../functions/lib/composer-engine/toneRules.js";

// Sprint 3 — objectif 2 ("renforcer les points forts") : chaque signal doit
// désormais expliquer POURQUOI le point fort est un avantage, pas seulement
// CE QUI est constaté. Vérifie le contenu ajouté à businessImpacts.js
// directement (indépendant de la sélection hash-based de pickVariant, qui
// varie selon l'analysisId).

const SIGNALS = ["description", "photos", "reviews", "rating", "position", "categories"];

test("chaque signal porte désormais une variante 'strength' qui explique l'avantage concurrentiel", () => {
  for (const signal of SIGNALS) {
    const variants = businessImpacts[signal]?.comparative?.strength || [];
    const hasWhyVariant = variants.some((text) => /avantage concurrentiel/i.test(text));
    assert.ok(hasWhyVariant, `${signal} devrait avoir une variante 'avantage concurrentiel'`);
  }
});

test("les variantes existantes ne sont jamais supprimées (additif uniquement)", () => {
  // Chaque signal doit conserver au moins ses 2 variantes historiques en plus
  // de la nouvelle : aucune régression par remplacement.
  for (const signal of SIGNALS) {
    const variants = businessImpacts[signal]?.comparative?.strength || [];
    assert.ok(variants.length >= 3, `${signal} devrait avoir au moins 3 variantes strength (2 historiques + 1 nouvelle)`);
  }
});

test("les nouvelles variantes respectent les règles de ton (jamais alarmiste, jamais vendeur)", () => {
  for (const signal of SIGNALS) {
    const variants = businessImpacts[signal]?.comparative?.strength || [];
    for (const text of variants) {
      assert.equal(respectsToneRules(text), true, `${signal} : "${text}" viole les règles de ton`);
    }
  }
});
