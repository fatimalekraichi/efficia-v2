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
  assert.match(html, /restaurant · Dinant · 24 juillet 2026/);
  assert.match(html, /80/);
  assert.match(html, /Résumé exécutif/);
  assert.match(html, /Les 3 priorités/);
  assert.match(html, /Vos points forts/);
  assert.match(html, /Ce qui limite aujourd'hui votre visibilité/);
  assert.match(html, /Plan d&#39;action/);
  assert.match(html, /Pourquoi agir maintenant/);
  assert.match(html, /@page/);
  assert.match(html, /break-inside: avoid/);
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

test("renderAnalysisHtml affiche le bloc de comparaison VOUS / Meilleure fiche observée (point 11)", () => {
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
  assert.match(html, /Concurrent anonymisé/);
  assert.match(html, /4,8\/5|4\.8\/5/);
  assert.match(html, /derrière 2 concurrents/);
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
