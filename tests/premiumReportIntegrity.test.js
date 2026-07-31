import test from "node:test";
import assert from "node:assert/strict";
import { renderAnalysisHtml } from "../functions/lib/renderAnalysisHtml.js";

// Sprint 4 (consolidation) — objectif 8 : tests de consolidation. Ces tests ne
// vérifient aucune nouvelle règle métier, aucun nouveau score, aucune nouvelle
// priorité : ils vérifient uniquement que le rendu HTML du rapport premium
// reste cohérent, robuste et sans artefact (undefined/null/[object Object]),
// quel que soit le nombre de priorités, de forces, ou l'absence de certaines
// métadonnées.

function baseModel(overrides = {}) {
  return {
    composerVersion: "1.0.0",
    generatedAt: "2026-07-24T07:00:00.000Z",
    locale: "fr",
    hero: { businessName: "Le Test", improvementPotential: {} },
    executiveSummary: {},
    strengths: [],
    weaknesses: [],
    opportunities: [],
    priorities: [],
    actionPlan: [],
    whyNow: {},
    footer: { versions: {} },
    ...overrides,
  };
}

function priority(id, signal, overrides = {}) {
  return {
    rank: 1,
    id,
    signal,
    title: `Titre ${id}`,
    reasoning: `Raisonnement pour ${id}.`,
    severity: "medium",
    evidence: { value: 3 },
    actionability: { difficulty: "medium", estimatedTime: "30–60 min" },
    ...overrides,
  };
}

// Aucune valeur "undefined", "null" (littéral), "[object Object]" ou "NaN" ne
// doit jamais apparaître dans le texte visible, quel que soit le cas limite.
const FORBIDDEN_PATTERNS = [/undefined/i, /\bnull\b/i, /\[object Object\]/i, /NaN/];

function visibleText(html) {
  return html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ");
}

function assertNoForbiddenArtifacts(html, label) {
  const text = visibleText(html);
  for (const pattern of FORBIDDEN_PATTERNS) {
    assert.doesNotMatch(text, pattern, `${label} : artefact interdit détecté (${pattern})`);
  }
}

test("premium report integrity : rapport complet représentatif, invariants principaux", () => {
  const model = baseModel({
    hero: {
      businessName: "La Planche des Saveurs",
      category: "restaurant",
      city: "Dinant",
      date: "24 juillet 2026",
      score: 80,
      scoreBand: "Solide",
      headline: "Votre établissement inspire déjà confiance.",
      comparison: {
        you: { label: "Vous", rating: 4.6, reviews: 449, photos: 10 },
        best: { label: "Meilleure fiche observée", name: "Concurrent anonymisé", rating: 4.8, reviews: 324, photos: 234, photosLabel: "Meilleure fiche observée", photosIsEstimate: false },
      },
      rank: { aheadCount: 1, totalCompetitors: 3, text: "Vous êtes actuellement derrière 1 concurrent sur cette recherche (sur 3 observés)." },
      improvementPotential: { title: "Potentiel d'amélioration", score: 48, label: "Modéré", stars: 3, timeframe: "Nécessite plusieurs améliorations progressives.", driversTitle: "Vos principaux leviers", drivers: [{ signal: "position", label: "Visibilité locale" }], note: "Estimation interne." },
    },
    domains: [
      { key: "reputation", label: "Réputation", points: 18, max: 20, pct: 0.9 },
      { key: "visibilite", label: "Visibilité", points: 8, max: 20, pct: 0.4 },
    ],
    executiveSummary: {
      text: "Résumé de repli.",
      opening: "Votre établissement bénéficie déjà d'une réputation solide.",
      leversIntro: "Aujourd'hui, les principaux leviers qui limitent votre visibilité sont :",
      leversList: ["la visibilité locale", "le volume d'avis"],
      leversClosing: "Les recommandations de ce rapport se concentrent sur ces priorités.",
    },
    strengths: [
      { id: "FORCE_REVIEWS", signal: "reviews", title: "Réputation solide", message: "Votre volume d'avis rassure les prospects.", evidence: { value: 449, competitorMedian: 340, unit: "avis" } },
    ],
    weaknesses: [
      { id: "WEAK_PHOTOS", signal: "photos", title: "Galerie à renforcer", message: "Peu de photos récentes.", evidence: { value: 2, unit: "photos" } },
    ],
    opportunities: [
      { id: "OPP_CATEGORIES", signal: "categories", title: "Catégories à préciser", message: "Le cadrage peut être affiné.", evidence: { value: 1, unit: "catégories" } },
    ],
    // WEAK_POSITION est à la fois une priorité ET (avant dédoublonnage) une
    // faiblesse : elle ne doit apparaître qu'une seule fois, en détail, sur la
    // page Priorités (voir test dédié plus bas).
    priorities: [
      priority("WEAK_POSITION", "position", { rank: 1, title: "Renforcer la visibilité locale" }),
      priority("OPP_DESCRIPTION", "description", { rank: 2, title: "Clarifier la description", evidence: { value: 0 } }),
    ],
    actionPlan: [
      { order: 1, id: "OPP_DESCRIPTION", action: "Clarifier la description", difficulty: "easy", estimatedTime: "15–20 min", impactType: "conversion" },
      { order: 2, id: "WEAK_POSITION", action: "Améliorer le classement local", difficulty: "medium", estimatedTime: "variable", impactType: "visibility" },
      { order: 3, id: "WEAK_REVIEWS", action: "Obtenir davantage d'avis", difficulty: "hard", estimatedTime: "en continu", impactType: "trust" },
    ],
    whyNow: { text: "Chaque semaine compte." },
    footer: { methodology: "Analyse issue des observations publiques.", disclaimer: "Efficia Digital n'est pas affilié à Google.", versions: { reasoning: "1.0.0", composer: "1.0.0" } },
  });

  const html = renderAnalysisHtml(model);

  assertNoForbiddenArtifacts(html, "rapport complet");

  // Ordre des sections (objectif 4) : couverture → points forts → axes
  // d'amélioration → priorités détaillées → plan d'action → feuille de route
  // → méthodologie.
  const order = [
    "La Planche des Saveurs",
    "Ce qui joue déjà en votre faveur",
    "Ce qui limite aujourd'hui votre visibilité",
    "Les actions qui méritent votre attention en premier",
    "Un plan d'action simple à suivre",
    // Cette chaîne apparaît aussi dans un commentaire CSS (styles()) : on
    // cible ici le titre réel de la page pour éviter le faux positif.
    "<h2>Votre feuille de route personnalisée</h2>",
    "Pourquoi agir maintenant",
  ];
  const indices = order.map((needle) => html.indexOf(needle));
  for (const index of indices) assert.ok(index > -1, "chaque section attendue doit être présente");
  for (let i = 1; i < indices.length; i += 1) {
    assert.ok(indices[i] > indices[i - 1], `"${order[i]}" doit apparaître après "${order[i - 1]}"`);
  }
});

test("premium report integrity : une même finding (priorité + faiblesse) n'apparaît qu'une fois en détail", () => {
  const model = baseModel({
    weaknesses: [
      { id: "WEAK_POSITION", signal: "position", title: "Titre faiblesse", message: "Message faiblesse jamais affiché en double.", evidence: { value: 4 } },
    ],
    priorities: [priority("WEAK_POSITION", "position", { title: "Titre priorité" })],
  });

  const html = renderAnalysisHtml(model);

  // Le message court de la faiblesse ne doit pas être dupliqué sur la page
  // "Axes d'amélioration" puisque WEAK_POSITION est déjà traitée en détail
  // sur la page Priorités.
  assert.doesNotMatch(html, /Message faiblesse jamais affiché en double/);
  // La priorité, elle, reste bien affichée (aucune information perdue).
  assert.match(html, /Titre priorité/);
});

test("premium report integrity : la finding reste affichée en faiblesse quand elle n'est pas une priorité", () => {
  const model = baseModel({
    weaknesses: [
      { id: "WEAK_OTHER", signal: "photos", title: "Titre faiblesse indépendante", message: "Message faiblesse indépendante.", evidence: { value: 1 } },
    ],
    priorities: [priority("WEAK_POSITION", "position")],
  });

  const html = renderAnalysisHtml(model);

  assert.match(html, /Titre faiblesse indépendante/);
});

test("premium report integrity : comportement correct avec zéro, une, deux et cinq priorités", () => {
  // Sprint 5 (finition éditoriale, objectif 7) : une section entièrement
  // vide (aucune priorité) n'affiche plus une page avec un titre et une
  // phrase de repli isolée — la page "Priorités" est omise en totalité. Le
  // rapport reste "complet" en ne montrant que des pages qui ont un vrai
  // contenu (cf. aussi les tests dédiés pour strengths/actionPlan ci-dessous).
  for (const count of [0, 1, 2, 5]) {
    const priorities = Array.from({ length: count }, (_, index) =>
      priority(`P${index}`, ["rating", "reviews", "photos", "description", "categories"][index % 5], { rank: index + 1 }));
    const html = renderAnalysisHtml(baseModel({ priorities }));

    assertNoForbiddenArtifacts(html, `priorities=${count}`);
    if (count === 0) {
      assert.doesNotMatch(html, /Les actions qui méritent votre attention en premier/);
    } else {
      assert.match(html, /Les actions qui méritent votre attention en premier/);
      for (let index = 0; index < count; index += 1) {
        assert.match(html, new RegExp(`Titre P${index}`));
      }
    }
  }
});

test("premium report integrity : aucune force, puis une seule force", () => {
  // Sprint 5 (objectif 7) : page "Vos points forts" omise en totalité quand
  // strengths est vide, plutôt que montrée avec une phrase de repli.
  const withoutStrengths = renderAnalysisHtml(baseModel({ strengths: [] }));
  assert.doesNotMatch(withoutStrengths, /Ce qui joue déjà en votre faveur/);
  assertNoForbiddenArtifacts(withoutStrengths, "0 force");

  const withOneStrength = renderAnalysisHtml(baseModel({
    strengths: [{ id: "F1", signal: "rating", title: "Titre force", message: "Message force.", evidence: { value: 4.5 } }],
  }));
  assert.match(withOneStrength, /Ce qui joue déjà en votre faveur/);
  assert.match(withOneStrength, /Titre force/);
  assertNoForbiddenArtifacts(withOneStrength, "1 force");
});

test("premium report integrity : plan d'action et feuille de route omis en totalité si vides (Sprint 5, objectif 7)", () => {
  const html = renderAnalysisHtml(baseModel({ actionPlan: [] }));

  assertNoForbiddenArtifacts(html, "actionPlan vide");
  assert.doesNotMatch(html, /Un plan d'action simple à suivre/);
  // Chaîne ciblée sur le titre réel (et non une simple recherche de
  // sous-chaîne) : "Votre feuille de route personnalisée" apparaît aussi
  // dans un commentaire CSS de styles() (Sprint 2B), toujours présent dans
  // le <style>, qu'il y ait ou non une page "Feuille de route".
  assert.doesNotMatch(html, /<h2>Votre feuille de route personnalisée<\/h2>/);
  assert.doesNotMatch(html, /<span class="roadmap-checkbox"/);
});

test("premium report integrity : repli sobre quand difficulté, temps ou impact sont absents", () => {
  const html = renderAnalysisHtml(baseModel({
    priorities: [priority("P1", "rating", { severity: null, actionability: {}, evidence: {} })],
    actionPlan: [{ order: 1, id: "P1", action: "Action sans métadonnées" }],
  }));

  assertNoForbiddenArtifacts(html, "métadonnées absentes");
  assert.match(html, /Non disponible/);
});

test("premium report integrity : signal inconnu ne produit aucun texte inventé", () => {
  const html = renderAnalysisHtml(baseModel({
    priorities: [priority("P1", "signal_totalement_inconnu")],
  }));

  assertNoForbiddenArtifacts(html, "signal inconnu");
  assert.doesNotMatch(html, /<div class="priority-constat">/);
  assert.doesNotMatch(html, /<p class="eyebrow priority-angle">/);
});

test("premium report integrity : textes et noms très longs ne cassent pas le rendu", () => {
  const longText = "Établissement ".repeat(40).trim();
  const html = renderAnalysisHtml(baseModel({
    hero: { businessName: longText, category: longText, city: longText, improvementPotential: {} },
    priorities: [priority("P1", "description", { title: longText, reasoning: longText })],
  }));

  assertNoForbiddenArtifacts(html, "textes longs");
  assert.match(html, new RegExp(longText.slice(0, 30)));
});

test("premium report integrity : échappement des contenus externes conservé (aucune régression)", () => {
  const html = renderAnalysisHtml(baseModel({
    hero: { businessName: "<script>alert(1)</script>", improvementPotential: {} },
    priorities: [priority("P1", "rating", { title: "<img src=x onerror=alert(1)>" })],
  }));

  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
  assertNoForbiddenArtifacts(html, "échappement");
});
