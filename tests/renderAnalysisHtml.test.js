import test from "node:test";
import assert from "node:assert/strict";
import { renderAnalysisHtml } from "../functions/lib/renderAnalysisHtml.js";

function makeDocumentModel(overrides = {}) {
  return {
    composerVersion: "1.0.0",
    generatedAt: "2026-07-24T07:00:00.000Z",
    locale: "fr",
    hero: {
      businessName: "La Planche des Saveurs",
      category: "restaurant",
      city: "Dinant",
      date: "24 juillet 2026",
      score: 80,
      scoreBand: "Solide",
      headline: "Votre établissement inspire déjà confiance. Le principal enjeu est maintenant de rendre cette réputation plus visible au bon moment.",
      improvementPotential: {
        title: "Potentiel d'amélioration",
        score: 48,
        label: "Modéré",
        stars: 3,
        driversTitle: "Ce qui explique ce potentiel",
        drivers: [
          { signal: "position", label: "Visibilité locale" },
          { signal: "description", label: "Description" },
        ],
        note: "Estimation interne destinée à orienter les priorités.",
      },
    },
    executiveSummary: {
      text: "Votre établissement bénéficie déjà d'une réputation solide. Les principaux gains se situent désormais au niveau de votre visibilité locale.",
    },
    strengths: [
      {
        id: "FORCE_REVIEWS",
        signal: "reviews",
        title: "Votre réputation est portée par un volume d'avis solide",
        message: "Lorsqu'un prospect compare plusieurs entreprises affichées côte à côte, ce volume d'avis augmente vos chances d'être choisi.",
        evidence: { value: 449, competitorMedian: 340, unit: "avis", source: "Observation + Benchmark" },
      },
    ],
    weaknesses: [
      {
        id: "WEAK_POSITION",
        signal: "position",
        title: "Votre visibilité locale peut progresser",
        message: "Votre fiche n'apparaît pas dans les trois premiers résultats, là où partent souvent les premiers contacts.",
        evidence: { value: 4, competitorMedian: null, unit: "position", source: "Observation" },
      },
    ],
    opportunities: [
      {
        id: "OPP_DESCRIPTION",
        signal: "description",
        title: "Votre description peut mieux guider le choix",
        message: "Une description plus claire peut aider le prospect à comprendre pourquoi vous contacter.",
        evidence: { value: 0, competitorMedian: null, unit: "caractères", source: "Observation" },
      },
    ],
    priorities: [
      {
        rank: 1,
        id: "WEAK_POSITION",
        signal: "position",
        title: "Renforcer la visibilité locale",
        reasoning: "Être visible dans les premiers résultats augmente les chances d'être contacté au moment où le besoin est exprimé.",
        severity: "high",
        evidence: { value: 4, competitorMedian: null, unit: "position", source: "Observation" },
        actionability: { estimatedTime: "30 à 45 minutes" },
      },
    ],
    actionPlan: [
      {
        order: 1,
        id: "OPP_DESCRIPTION",
        action: "Clarifier la description de la fiche",
        difficulty: "easy",
        estimatedTime: "20 à 30 minutes",
        canEfficiaAutomate: true,
        impactType: "conversion",
      },
    ],
    whyNow: {
      text: "Chaque semaine où votre fiche reste dans cette configuration, une partie des internautes peut contacter une entreprise mieux positionnée.",
    },
    footer: {
      methodology: "Analyse issue des observations publiques · comparaison à 3 concurrents locaux.",
      disclaimer: "Efficia Digital n'est pas affilié à Google. Le Potentiel d'amélioration est une estimation interne, pas une garantie de résultat.",
      versions: {
        reasoning: "1.0.0",
        composer: "1.0.0",
      },
    },
    ...overrides,
  };
}

test("renderAnalysisHtml produit un document HTML complet avec les sections attendues", () => {
  const html = renderAnalysisHtml(makeDocumentModel());

  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /La Planche des Saveurs/);
  assert.match(html, /Restaurant · Dinant · 24 juillet 2026/);
  assert.match(html, /80/);
  assert.match(html, /Résumé exécutif/);
  assert.match(html, /Les 3 priorités/);
  assert.match(html, /Vos points forts/);
  assert.match(html, /Ce qui limite aujourd'hui votre visibilité/);
  assert.match(html, /Plan d&#39;action/);
  assert.match(html, /Pourquoi agir maintenant/);
  assert.match(html, /@page/);
  assert.match(html, /break-inside: avoid/);
  assert.match(html, /https:\/\/efficiadigital\.com\/assets\/logo\/logo-efficia-web\.png/);
  assert.doesNotMatch(html, /efficia-logo-gradient/);
});

test("renderAnalysisHtml affiche uniquement le documentModel et ignore les sources brutes", () => {
  const html = renderAnalysisHtml(makeDocumentModel({
    business: { name: "NE_DOIT_PAS_APPARAITRE" },
    benchmark: { score: 12 },
    knowledge: { summary: "NE_DOIT_PAS_APPARAITRE_NON_PLUS" },
    reasoning: { reasonings: [] },
  }));

  assert.match(html, /Votre établissement bénéficie déjà d&#39;une réputation solide/);
  assert.doesNotMatch(html, /NE_DOIT_PAS_APPARAITRE/);
  assert.doesNotMatch(html, /NE_DOIT_PAS_APPARAITRE_NON_PLUS/);
  assert.doesNotMatch(html, /12\/100/);
});

test("renderAnalysisHtml affiche le bloc de comparaison VOUS / fiche de référence observée", () => {
  const html = renderAnalysisHtml(makeDocumentModel({
    hero: {
      ...makeDocumentModel().hero,
      comparison: {
        you: { label: "Vous", rating: 4.6, reviews: 449, photos: 10 },
        best: {
          label: "Meilleure fiche observée",
          name: "Concurrent anonymisé",
          rating: 4.8,
          reviews: 324,
          photos: 234,
          photosLabel: "Meilleure fiche observée",
          photosIsEstimate: false,
        },
      },
      rank: { aheadCount: 2, totalCompetitors: 3, text: "Vous êtes actuellement derrière 2 concurrents sur cette recherche (sur 3 observés)." },
    },
  }));

  assert.match(html, /comparison-card/);
  assert.match(html, /Fiche de référence observée/);
  assert.doesNotMatch(html, />Meilleure fiche observée</);
  assert.match(html, /Concurrent anonymisé/);
  assert.match(html, /4,8\/5|4\.8\/5/);
  // Mission "dernières corrections de qualité avant la bêta", objectif 3 :
  // cette fixture fournit à la fois hero.rank (aheadCount/totalCompetitors)
  // ET un signal "position" avec une valeur (weaknesses[0].evidence.value:
  // 4) — la phrase pédagogique qui relie les deux remplace donc désormais la
  // simple phrase de comparaison seule (voir buildPedagogicalRankNote).
  assert.match(html, /Lors de notre recherche, votre fiche apparaissait en 4e position\./);
  assert.match(html, /Parmi les 3 concurrents analysés dans ce rapport, 2 étaient mieux classés que vous\./);
});

test("renderAnalysisHtml conserve les espaces normaux dans les noms et textes sensibles", () => {
  const html = renderAnalysisHtml(makeDocumentModel({
    hero: { ...makeDocumentModel().hero, businessName: "Garage R.G. Pneus" },
    priorities: [{
      rank: 1,
      signal: "reviews",
      title: "Votre volume d'avis reste inférieur",
      reasoning: "Répondre plus systématiquement renforcerait la confiance des clients qui hésitent.",
      evidence: { value: 10, competitorMedian: 20 },
      actionability: { difficulty: "hard", estimatedTime: "en continu" },
    }],
  }));

  for (const expected of [
    "Garage R.G. Pneus",
    "Votre volume d&#39;avis reste inférieur",
    "Répondre plus systématiquement renforcerait la confiance des clients qui hésitent.",
    "Ce qu'il faut retenir de cette analyse",
    "Votre audit est terminé.",
    "Je souhaite gagner du temps",
  ]) assert.match(html, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  for (const glued of ["GarageR.G.Pneus", "Votrevolumed&#39;avis", "Répondreplus", "Cequ&#39;ilfautretenir", "Votreauditestterminé", "souhaitegagnerdutemps"]) {
    assert.doesNotMatch(html, new RegExp(glued));
  }
  assert.match(html, /overflow-wrap: break-word/);
  assert.doesNotMatch(html, /h1, h2, h3, p \{ overflow-wrap: anywhere/);
});

test("renderAnalysisHtml formate les décimales et l'ordinal dans toutes les zones répétées", () => {
  const model = makeDocumentModel({
    actionPlan: [{ order: 1, action: "Vos concurrents publient 13.67 photos", difficulty: "easy", estimatedTime: "15 min", impactType: "visibility" }],
    priorities: [{
      rank: 1,
      signal: "reviews",
      title: "Votre volume reste inférieur à 10.33 avis",
      reasoning: "Votre note de 4.7/5 reste perfectible.",
      evidence: { value: 10, competitorMedian: 10.33 },
      actionability: { difficulty: "easy", estimatedTime: "15 min" },
    }],
    hero: { ...makeDocumentModel().hero, rank: { aheadCount: 1, totalCompetitors: 3 } },
  });
  model.weaknesses = [{ signal: "position", evidence: { value: 1 } }];
  const html = renderAnalysisHtml(model);

  assert.match(html, /environ 10 avis/);
  assert.match(html, /environ 14 photos/);
  assert.match(html, /4,7\/5/);
  assert.match(html, /première position/);
  assert.doesNotMatch(html, /10\.33|13\.67|4\.7\/5|1er position/);
});

test("renderAnalysisHtml signale aussi les moyennes et médianes déjà entières comme approximatives", () => {
  const model = makeDocumentModel({
    actionPlan: [{ order: 1, action: "Vos concurrents publient en moyenne 14 photos", difficulty: "easy", estimatedTime: "15 min", impactType: "visibility" }],
    priorities: [{
      rank: 1,
      signal: "reviews",
      title: "Votre volume reste inférieur (médiane : 286)",
      reasoning: "Écart observé.",
      evidence: { value: 10, competitorMedian: 285.7 },
      actionability: { difficulty: "easy", estimatedTime: "15 min" },
    }],
  });
  const html = renderAnalysisHtml(model);

  assert.match(html, /publient environ 14 photos en moyenne/);
  assert.match(html, /médiane : environ 286/);
  assert.match(html, /environ 286 avis/);
});

test("renderAnalysisHtml ne contredit jamais une description absente", () => {
  const priority = {
    rank: 1,
    signal: "description",
    title: "Renforcer la description",
    reasoning: "Votre description existe, mais elle peut encore mieux expliquer votre activité.",
    evidence: { value: 0 },
    actionability: { difficulty: "easy", estimatedTime: "15 min" },
  };
  const html = renderAnalysisHtml(makeDocumentModel({ priorities: [priority] }));
  assert.match(html, /ne comporte actuellement aucune description/);
  assert.doesNotMatch(html, /description existe/);
});

test("renderAnalysisHtml : sans signal \"position\" disponible, conserve la phrase de comparaison d'origine (aucune régression)", () => {
  const html = renderAnalysisHtml(makeDocumentModel({
    weaknesses: [],
    priorities: [],
    hero: {
      ...makeDocumentModel().hero,
      comparison: {
        you: { label: "Vous", rating: 4.6, reviews: 449, photos: 10 },
        best: { label: "Meilleure fiche observée", name: "Concurrent anonymisé", rating: 4.8, reviews: 324, photos: 234 },
      },
      rank: { aheadCount: 2, totalCompetitors: 3, text: "Vous êtes actuellement derrière 2 concurrents sur cette recherche (sur 3 observés)." },
    },
  }));

  assert.match(html, /derrière 2 concurrents/);
  assert.doesNotMatch(html, /Lors de notre recherche/);
});

/* -------------------------------------------------------------------------- */
/* Mission "dernières corrections de qualité avant la bêta", objectif 4 —     */
/* pour un artisan, "vos clients" (dans les angles SIGNAL_ANGLES, tous en     */
/* contexte AVANT décision) devient "vos futurs clients"/"vos prospects".     */
/* Uniquement les phrases exactes listées (ARTISAN_PROSPECT_PHRASE_FIXES,     */
/* renderAnalysisHtml.js) — jamais un remplacement aveugle de "clients".      */
/* -------------------------------------------------------------------------- */

test("secteur artisan : l'angle d'une priorité \"vos clients\" devient \"vos prospects\" (avant décision)", () => {
  const html = renderAnalysisHtml(makeDocumentModel({
    hero: { ...makeDocumentModel().hero, category: "Plombier" },
    priorities: [
      {
        rank: 1,
        id: "WEAK_POSITION",
        signal: "position",
        title: "Renforcer la visibilité locale",
        reasoning: "Être visible dans les premiers résultats augmente les chances d'être contacté.",
        severity: "high",
        evidence: { value: 4, competitorMedian: null, unit: "position", source: "Observation" },
        actionability: { estimatedTime: "30 à 45 minutes" },
      },
    ],
  }));

  assert.match(html, /Être visible au bon moment fait souvent la différence pour vos prospects/);
  assert.doesNotMatch(html, /fait souvent la différence pour vos clients/);
});

test("secteur restaurant : les angles \"vos clients\" restent inchangés (correctif limité au secteur artisan)", () => {
  const html = renderAnalysisHtml(makeDocumentModel());
  assert.match(html, /Être visible au bon moment fait souvent la différence pour vos clients/);
});

test("renderAnalysisHtml n'affiche pas le bloc de comparaison quand hero.comparison est absent", () => {
  const html = renderAnalysisHtml(makeDocumentModel());

  assert.doesNotMatch(html, /<div class="comparison-card">/);
  assert.doesNotMatch(html, /<p class="comparison-rank">/);
});

test("renderAnalysisHtml affiche le score par domaine quand model.domains est fourni (point 3)", () => {
  const html = renderAnalysisHtml(makeDocumentModel({
    domains: [
      { key: "reputation", label: "Réputation", points: 18, max: 20, pct: 0.9 },
      { key: "visibilite", label: "Visibilité", points: 10, max: 20, pct: 0.5 },
    ],
  }));

  assert.match(html, /domains-block/);
  assert.match(html, /Score par domaine/);
  assert.match(html, /Réputation/);
  assert.match(html, /90%/);
});

test("renderAnalysisHtml n'affiche pas le bloc domaines quand model.domains est absent ou vide", () => {
  const html = renderAnalysisHtml(makeDocumentModel());

  assert.doesNotMatch(html, /<div class="domains-block">/);
});

test("renderAnalysisHtml : Résumé exécutif — le double sens de \"rapport\" (document / ratio) dans la même phrase est corrigé (objectif 7)", () => {
  // Composer (summaryTemplates.js, LEVERS_CLOSING — non modifiable) produit
  // littéralement "Les recommandations de ce rapport ... le meilleur rapport
  // entre effort et impact potentiel." : deux sens différents de "rapport" à
  // quelques mots d'écart. Presentation corrige ce défaut d'écriture sans
  // toucher au module qui l'a produit.
  const html = renderAnalysisHtml(makeDocumentModel({
    executiveSummary: {
      text: "Texte de repli inchangé.",
      opening: "Votre fiche possède déjà plusieurs éléments solides.",
      leversIntro: "Aujourd'hui, les principaux leviers qui limitent votre visibilité sont :",
      leversList: ["la note moyenne", "la visibilité locale"],
      leversClosing: "Les recommandations de ce rapport se concentrent sur ces priorités, car elles offrent aujourd'hui le meilleur rapport entre effort et impact potentiel.",
    },
  }));

  assert.doesNotMatch(html, /le meilleur rapport entre effort/, "les deux sens de \"rapport\" ne doivent plus se percuter dans la même phrase");
  assert.match(html, /le meilleur équilibre entre effort et impact/);
});

test("renderAnalysisHtml affiche la synthèse en liste du résumé exécutif quand leversList est fournie (point 5)", () => {
  const html = renderAnalysisHtml(makeDocumentModel({
    executiveSummary: {
      text: "Texte de repli inchangé.",
      opening: "Votre fiche possède déjà plusieurs éléments solides.",
      leversIntro: "Aujourd'hui, les principaux leviers qui limitent votre visibilité sont :",
      leversList: ["la note moyenne", "la visibilité locale", "le volume d'avis"],
      leversClosing: "Les recommandations de ce rapport se concentrent sur ces priorités.",
    },
  }));

  assert.match(html, /summary-levers/);
  assert.match(html, /la note moyenne/);
  assert.match(html, /la visibilité locale/);
  assert.match(html, /le volume d&#39;avis/);
  assert.match(html, /principaux leviers/);
  assert.doesNotMatch(html, /Texte de repli inchangé/);
});

test("renderAnalysisHtml revient au paragraphe existant quand leversList est absente ou trop courte (repli)", () => {
  const html = renderAnalysisHtml(makeDocumentModel({
    executiveSummary: { text: "Texte de repli inchangé.", leversList: ["une seule entrée"] },
  }));

  assert.doesNotMatch(html, /<ul class="summary-levers">/);
  assert.match(html, /Texte de repli inchangé/);
});

test("renderAnalysisHtml affiche la phrase de cadrage temporel du potentiel d'amélioration (point 9)", () => {
  const html = renderAnalysisHtml(makeDocumentModel({
    hero: {
      ...makeDocumentModel().hero,
      improvementPotential: {
        ...makeDocumentModel().hero.improvementPotential,
        timeframe: "Accessible avec des optimisations réalisables en moins de deux mois.",
      },
    },
  }));

  assert.match(html, /potential-timeframe/);
  assert.match(html, /optimisations réalisables en moins de deux mois/);
});

test("renderAnalysisHtml n'affiche pas de phrase de cadrage temporel quand timeframe est absent", () => {
  const html = renderAnalysisHtml(makeDocumentModel());

  assert.doesNotMatch(html, /<p class="potential-timeframe">/);
});

test("renderAnalysisHtml regroupe le plan d'action par horizon sans changer l'ordre (point 6)", () => {
  const html = renderAnalysisHtml(makeDocumentModel({
    actionPlan: [
      { order: 1, id: "OPP_DESCRIPTION", action: "Clarifier la description de la fiche", difficulty: "easy", estimatedTime: "15–20 min", canEfficiaAutomate: true, impactType: "conversion" },
      { order: 2, id: "OPP_PHOTOS", action: "Ajouter des photos représentatives", difficulty: "medium", estimatedTime: "30–60 min", canEfficiaAutomate: false, impactType: "conversion" },
      { order: 3, id: "WEAK_REVIEWS", action: "Obtenir davantage d'avis", difficulty: "hard", estimatedTime: "en continu", canEfficiaAutomate: true, impactType: "trust" },
    ],
  }));

  const weekIndex = html.indexOf("Cette semaine");
  const monthIndex = html.indexOf("Ce mois-ci");
  const watchIndex = html.indexOf("À surveiller");
  const descriptionIndex = html.indexOf("Clarifier la description de la fiche");
  const photosIndex = html.indexOf("Ajouter des photos représentatives");
  const reviewsIndex = html.indexOf("Obtenir davantage d&#39;avis");

  assert.ok(weekIndex > -1 && monthIndex > weekIndex && watchIndex > monthIndex);
  // Chaque action apparaît sous le bon horizon, dans le même ordre que
  // model.actionPlan (aucun réordonnancement).
  assert.ok(descriptionIndex > weekIndex && descriptionIndex < monthIndex);
  assert.ok(photosIndex > monthIndex && photosIndex < watchIndex);
  assert.ok(reviewsIndex > watchIndex);
});

test("renderAnalysisHtml insère la page 'Votre feuille de route' entre le Plan d'action et la Méthodologie (point 10)", () => {
  const html = renderAnalysisHtml(makeDocumentModel());

  const actionPlanIndex = html.indexOf("Plan d&#39;action");
  const roadmapIndex = html.indexOf("<h2>Votre feuille de route personnalisée</h2>");
  const methodologyIndex = html.indexOf("<h2>Pourquoi agir maintenant</h2>");

  assert.ok(actionPlanIndex > -1);
  assert.ok(roadmapIndex > actionPlanIndex);
  assert.ok(methodologyIndex > roadmapIndex);
});

test("renderAnalysisHtml : la feuille de route reprend les mêmes actions que le plan d'action, sans aucune perte (point 10)", () => {
  const actionPlan = [
    { order: 1, id: "OPP_DESCRIPTION", action: "Clarifier la description de la fiche", difficulty: "easy", estimatedTime: "15–20 min", impactType: "conversion" },
    { order: 2, id: "WEAK_POSITION", action: "Améliorer le classement dans les résultats locaux", difficulty: "medium", estimatedTime: "variable", impactType: "visibility" },
    { order: 3, id: "WEAK_REVIEWS", action: "Obtenir davantage d'avis", difficulty: "hard", estimatedTime: "en continu", impactType: "trust" },
  ];
  const html = renderAnalysisHtml(makeDocumentModel({ actionPlan }));

  assert.match(html, /<div class="roadmap-groups">/);
  assert.match(html, /<span class="roadmap-checkbox"/);
  for (const item of actionPlan) {
    const occurrences = html.split(item.action.replace(/'/g, "&#39;")).length - 1;
    // Chaque action apparaît une fois dans le plan d'action et une fois dans
    // la feuille de route : jamais 0 (perdue), jamais plus de 2 (dupliquée).
    // Premium Polish (objectif 6) : la toute première action apparaît une
    // troisième fois, sur la nouvelle page "En résumé" ("Que faut-il faire
    // en priorité ?") — même donnée, jamais recalculée.
    const expected = item.order === 1 ? 3 : 2;
    assert.equal(occurrences, expected, `${item.action} devrait apparaître exactement ${expected} fois`);
  }
  // Difficulté, temps estimé et impact affichés sans recalcul (mêmes libellés).
  assert.match(html, /Facile · 15–20 min · Conversion/);
});

test("renderAnalysisHtml : la feuille de route est omise en totalité si aucune action (Sprint 5, objectif 7)", () => {
  // Sprint 5 (finition éditoriale, objectif 7) : une page avec seulement un
  // titre et une phrase de repli ("Aucune action à afficher.") donnait
  // l'impression d'un rapport inachevé — la page "Votre feuille de route
  // personnalisée" (et "Un plan d'action simple à suivre") est maintenant
  // omise en totalité quand il n'y a aucune action, plutôt que montrée vide.
  const html = renderAnalysisHtml(makeDocumentModel({ actionPlan: [] }));

  assert.doesNotMatch(html, /Aucune action à afficher\./);
  // Chaîne ciblée sur le titre réel : "Votre feuille de route personnalisée"
  // apparaît aussi dans un commentaire CSS de styles() (Sprint 2B), toujours
  // présent dans le <style>, qu'il y ait ou non une page "Feuille de route".
  assert.doesNotMatch(html, /<h2>Votre feuille de route personnalisée<\/h2>/);
  assert.doesNotMatch(html, /Un plan d'action simple à suivre/);
  assert.doesNotMatch(html, /<span class="roadmap-checkbox"/);
});

test("renderAnalysisHtml : chaque priorité affiche un angle, un Constat distinct et 'Pourquoi c'est important' (Sprint 3, objectifs 1 et 3)", () => {
  const html = renderAnalysisHtml(makeDocumentModel({
    priorities: [
      {
        rank: 1,
        id: "WEAK_REVIEWS",
        signal: "reviews",
        title: "Renforcer le volume d'avis",
        reasoning: "Avant de contacter une entreprise, de nombreux utilisateurs comparent rapidement le nombre d'avis disponibles.",
        severity: "high",
        evidence: { value: 8, competitorMedian: 24, unit: "avis", source: "Observation + Benchmark" },
        actionability: { difficulty: "hard", estimatedTime: "en continu" },
      },
      {
        rank: 2,
        id: "WEAK_RATING",
        signal: "rating",
        title: "Renforcer la note moyenne",
        reasoning: "Une note plus faible peut freiner la confiance immédiate.",
        severity: "medium",
        evidence: { value: 4.1, competitorMedian: 4.6, unit: "/5", source: "Observation + Benchmark" },
        actionability: { difficulty: "medium", estimatedTime: "30–60 min" },
      },
    ],
  }));

  // Premium Polish (objectif 2) : les angles sont maintenant des phrases
  // complètes et naturelles, pas des intitulés abstraits à 2-3 mots.
  assert.match(html, /<p class="eyebrow priority-angle">Le nombre d&#39;avis reste l&#39;un des signaux de confiance/);
  assert.match(html, /<p class="eyebrow priority-angle">Pourquoi votre note influence le premier choix/);
  assert.match(html, /<div class="priority-constat">/);
  assert.match(html, /Actuellement, votre fiche compte 8 avis\./);
  // Sprint 5 (finition éditoriale, objectif 2) : format français (virgule
  // décimale) pour une note — "4,1/5", jamais "4.1/5".
  assert.match(html, /Actuellement, votre note moyenne est de 4,1\/5\./);
  // "Pourquoi c'est important" (interprétation) reste affiché séparément du
  // Constat (fait) : les deux textes sont bien distincts et tous deux présents.
  assert.match(html, /Avant de contacter une entreprise, de nombreux utilisateurs comparent/);
  assert.match(html, /<p class="priority-effort-note">/);
});

test("renderAnalysisHtml : deux familles de priorités différentes produisent des angles et des Constats différents (aucune formulation générique)", () => {
  const html = renderAnalysisHtml(makeDocumentModel({
    priorities: [
      { rank: 1, id: "A", signal: "photos", title: "Photos", reasoning: "R1", severity: "medium", evidence: { value: 2 }, actionability: { difficulty: "medium", estimatedTime: "30–60 min" } },
      { rank: 2, id: "B", signal: "description", title: "Description", reasoning: "R2", severity: "low", evidence: { value: 0 }, actionability: { difficulty: "easy", estimatedTime: "15–20 min" } },
    ],
  }));

  assert.match(html, /Vos photos aident vos clients à se projeter/);
  assert.match(html, /Une description claire permet à vos clients de comprendre votre activité/);
  assert.match(html, /Actuellement, votre fiche présente 2 photos\./);
  assert.match(html, /Actuellement, votre fiche ne comporte aucune description\./);
});

test("renderAnalysisHtml : pas de régression — Pourquoi c'est important / Preuve / Impact / Temps estimé restent affichés", () => {
  const html = renderAnalysisHtml(makeDocumentModel());

  assert.match(html, /Pourquoi c'est important/);
  assert.match(html, /<span>Preuve<\/span>/);
  assert.match(html, /<span>Impact<\/span>/);
  assert.match(html, /Temps estimé/);
});

test("renderAnalysisHtml : aucun bloc Constat ni angle si le signal ou l'évidence est inconnu (repli gracieux, jamais de texte inventé)", () => {
  const html = renderAnalysisHtml(makeDocumentModel({
    priorities: [
      { rank: 1, id: "X", signal: "unknown_signal", title: "Titre", reasoning: "Texte", severity: "medium", evidence: {}, actionability: {} },
    ],
  }));

  assert.doesNotMatch(html, /<div class="priority-constat">/);
  assert.doesNotMatch(html, /<p class="eyebrow priority-angle">/);
});

test("renderAnalysisHtml échappe les contenus externes", () => {
  const html = renderAnalysisHtml(makeDocumentModel({
    hero: {
      ...makeDocumentModel().hero,
      businessName: "<script>alert('x')</script>",
    },
    executiveSummary: {
      text: "Résumé <b>important</b>",
    },
  }));

  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt;/);
  assert.match(html, /Résumé &lt;b&gt;important&lt;\/b&gt;/);
});
