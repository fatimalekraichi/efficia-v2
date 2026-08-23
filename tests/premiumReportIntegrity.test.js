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
  const text = visibleText(html.replace(/<!--[\s\S]*?-->/g, ""));
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

/* -------------------------------------------------------------------------- */
/* Mission "page finale de conversion" (versions successives) — page          */
/* "Et maintenant ?", ajoutée après "En résumé". Contenu entièrement fixe ou  */
/* dérivé de model.priorities (jamais recalculé, jamais un nouveau           */
/* diagnostic) : les tests vérifient uniquement présence, ordre et l'absence */
/* des mots interdits — jamais une règle métier, jamais un calcul.           */
/*                                                                            */
/* Mission "simplifier et optimiser la dernière page" — dernière révision :  */
/* la page passe de 7 blocs à 5, un seul message par bloc (objectif 5).      */
/* L'ancien comparatif de temps en deux colonnes et le bloc "Pourquoi        */
/* confier cette mission à Efficia Digital ?"/"Pourquoi certains             */
/* choisissent..." sont supprimés (objectifs 2 et 7) : les huit pages        */
/* précédentes démontrent déjà l'expertise, ces blocs n'apportaient plus     */
/* d'information réelle. L'encadré des 99 € est reformulé (objectif 3) et la */
/* page se referme sur une seule phrase de conclusion (objectif 6). Les      */
/* assertions ci-dessous sont mises à jour en conséquence (même page,        */
/* contenu explicitement remplacé par cette mission — aucun autre test       */
/* n'est touché).                                                            */
/* -------------------------------------------------------------------------- */

test("page finale de conversion : apparaît après \"En résumé\", tient sur UNE seule page, dans l'ordre attendu", () => {
  const html = renderAnalysisHtml(baseModel({
    priorities: [
      priority("P1", "description", { rank: 1 }),
      priority("P2", "photos", { rank: 2 }),
      priority("P3", "position", { rank: 3 }),
    ],
  }));

  assertNoForbiddenArtifacts(html, "page de conversion");

  const enResumeIndex = html.indexOf("Ce qu'il faut retenir de cette analyse");
  const introIndex = html.indexOf("<h2>Votre audit est terminé.</h2>");
  assert.ok(enResumeIndex > -1, "la page \"En résumé\" doit être présente");
  assert.ok(introIndex > -1, "la page \"Et maintenant ?\" doit être présente");
  assert.ok(introIndex > enResumeIndex, "\"Et maintenant ?\" doit apparaître après \"En résumé\"");

  // Une seule page pour toute la conversion.
  const closingStart = html.indexOf("Quelle que soit votre décision");
  assert.ok(closingStart > -1, "la phrase de clôture doit être présente");
  const conversionHtml = html.slice(html.lastIndexOf("<section", introIndex), html.indexOf("</section>", closingStart) + 10);
  const pageCount = (conversionHtml.match(/<section class="page/g) || []).length;
  assert.equal(pageCount, 1, "la conversion doit tenir sur une seule page");

  // Bloc 1 — la page raconte d'abord ce que LE LECTEUR sait déjà (récapitulatif
  // en quatre points, dérivé des catégories déjà lues, jamais un nouveau
  // diagnostic), avant de parler des deux possibilités puis des packs.
  const recapIndex = html.indexOf("Aujourd'hui, vous savez exactement");
  const choicesLabelIndex = html.indexOf("Vous avez maintenant deux possibilités");
  assert.ok(recapIndex > introIndex, "le récapitulatif doit apparaître juste après l'intro");
  assert.match(html, /ce qui fonctionne déjà/);
  assert.match(html, /ce qui limite votre visibilité/);
  assert.match(html, /ce qui mérite d'être amélioré/);
  assert.match(html, /dans quel ordre agir/);
  assert.ok(choicesLabelIndex > recapIndex, "les deux possibilités doivent apparaître après le récapitulatif (le lecteur avant l'offre)");
  assert.doesNotMatch(html, /Option 1/, "les anciennes grandes cartes de choix ne doivent plus exister");
  assert.doesNotMatch(html, /Option 2/);

  // Bloc 2 — une seule phrase de transition vers les packs.
  const transitionIndex = html.indexOf("Vous disposez maintenant du plan complet");
  const packGridIndex = html.indexOf("<div class=\"pack-grid\">");
  assert.ok(transitionIndex > choicesLabelIndex, "la phrase de transition doit apparaître après le bloc de choix");
  assert.ok(packGridIndex > transitionIndex, "les packs doivent apparaître après la phrase de transition");
  assert.doesNotMatch(html, /Faire soi-même/, "l'ancien comparatif de temps en deux colonnes ne doit plus exister");

  // Bloc 3 — packs : le grand titre est une intention du lecteur, le nom du
  // pack redevient un repère secondaire en petit, le résultat renvoie
  // explicitement à CE rapport (jamais une formule de brochure générique).
  assert.match(html, /Je souhaite gagner du temps/);
  assert.match(html, /Je souhaite aller plus loin/);
  assert.match(html, /Pack Visibilité Google/);
  assert.match(html, /Pack Performance/);
  assert.match(html, /349 €/);
  assert.match(html, /Le plus choisi/);
  assert.match(html, /499 €/);
  assert.match(html, /Solution complète/);
  assert.match(html, /En plus du Pack Visibilité/);
  assert.match(html, /Efficia applique à votre place la description, les catégories, les services/);
  assert.doesNotMatch(html, /Votre fiche sera optimisée/, "jamais une formule de brochure générique");

  const pack1Index = html.indexOf("Je souhaite gagner du temps");
  const productName1Index = html.indexOf("Pack Visibilité Google");
  const outcome1Index = html.indexOf("Efficia applique à votre place la description");
  const findingsLabel1Index = html.indexOf("Ce que nous corrigeons, identifié dans ce rapport");
  assert.ok(productName1Index > pack1Index, "le nom du pack doit apparaître sous le titre-intention");
  assert.ok(outcome1Index > productName1Index, "le résultat attendu doit suivre le nom du pack");
  assert.ok(findingsLabel1Index > outcome1Index, "le résultat attendu doit précéder la liste des prestations");

  // Bénéfices dérivés des priorités réelles du rapport (ici
  // description/photos/position), jamais une liste générique.
  assert.match(html, /Description/);
  assert.match(html, /Galerie photos/);
  assert.match(html, /Visibilité/);
  for (const forbiddenPromise of [/plus de clients/i, /plus de chiffre d'affaires/i, /première position Google/i]) {
    assert.doesNotMatch(html, forbiddenPromise);
  }

  // CTA plus naturels, une intention plutôt qu'un intitulé de bouton générique.
  assert.match(html, /Commencer avec le Pack Visibilité/);
  assert.match(html, /Je choisis cette solution/);
  assert.doesNotMatch(html, /Choisir le Pack Visibilité/, "l'ancien intitulé de CTA ne doit plus exister");
  assert.doesNotMatch(html, /Choisir le Pack Performance/, "l'ancien intitulé de CTA ne doit plus exister");

  // Bloc 4 — encadré de déduction (inchangé, déjà validé).
  assert.match(html, /Votre Audit Premium n'est pas une dépense perdue/);
  assert.match(html, /les 99 € déjà investis seront intégralement déduits/);

  // Les blocs "Pourquoi confier..."/"Pourquoi certains choisissent..."
  // restent supprimés, et aucun langage commercial ne doit apparaître.
  assert.doesNotMatch(html, /Pourquoi confier cette mission à Efficia Digital/);
  assert.doesNotMatch(html, /Pourquoi certains choisissent de nous confier ces optimisations/);
  for (const salesLanguage of [/nous sommes les meilleurs/i, /choisissez-nous/i, /profitez de/i]) {
    assert.doesNotMatch(html, salesLanguage, "aucun langage commercial");
  }

  // Bloc 5 — une conclusion plus humaine, avec signature, jamais une
  // injonction à décider maintenant.
  assert.match(html, /Quelle que soit votre décision, cet audit reste votre feuille de route/);
  assert.match(html, /Si vous préférez nous confier cette mission dans les 30 prochains jours/);
  const signatureIndex = html.indexOf("Merci de votre confiance.");
  assert.ok(signatureIndex > closingStart, "la signature doit suivre la phrase de clôture");
  assert.match(html, /L'équipe Efficia Digital/);
});

test("page finale de conversion : sans priorité disponible, repli générique sobre (aucun diagnostic inventé)", () => {
  const html = renderAnalysisHtml(baseModel({ priorities: [] }));
  assertNoForbiddenArtifacts(html, "page de conversion sans priorité");
  assert.match(html, /Ce que nous corrigeons, identifié dans ce rapport/);
  assert.match(html, /Visibilité/);
});

test("Premium manuel : ne prétend jamais que 99 € ont été payés ou investis", () => {
  const html = renderAnalysisHtml(baseModel({
    commercialPolicy: {
      reportKind: "premium",
      billingKind: "manual_unpaid",
      canMentionPaidAuditDeduction: false,
    },
  }));
  const text = visibleText(html);

  assert.match(text, /Audit Efficia Premium/);
  assert.doesNotMatch(text, /99 € déjà (?:payés|investis)/);
  assert.doesNotMatch(text, /intégralement déduits/);
  assert.doesNotMatch(text, /Diagnostic Efficia/);
  assert.doesNotMatch(text, /Diagnostic Google Business/);
  assert.match(text, /cet audit reste votre feuille de route pour améliorer progressivement votre visibilité sur Google/);
});

test("page finale de conversion : jamais les mots interdits (réduction/promotion/remise/offre exceptionnelle), toujours \"déduit\"", () => {
  const html = renderAnalysisHtml(baseModel());
  const text = visibleText(html).toLowerCase();

  for (const forbidden of ["réduction", "promotion", "remise", "offre exceptionnelle"]) {
    assert.doesNotMatch(text, new RegExp(forbidden), `le mot "${forbidden}" ne doit jamais apparaître`);
  }
  assert.match(text, /déduit/);
});

test("page finale de conversion : n'utilise aucune classe CSS scopée .free-diagnostic (Diagnostic gratuit non touché)", () => {
  const html = renderAnalysisHtml(baseModel());
  const start = html.indexOf("<h2>Votre audit est terminé.</h2>");
  const end = html.indexOf("Quelle que soit votre décision");
  const section = html.slice(html.lastIndexOf("<section", start), html.indexOf("</section>", end));
  assert.doesNotMatch(section, /free-diagnostic/);
});

/* -------------------------------------------------------------------------- */
/* Mission "dernières corrections de qualité avant la bêta", objectifs 1 et 2 */
/* — bug corrigé : mots collés dans le PDF ("Surla", "contre0",              */
/* "renforceraitla"...) et dernière page dont le texte s'affichait un mot par */
/* ligne. Cause identifiée : `overflow-wrap: anywhere` sur h1/h2/h3/p         */
/* (voir renderAnalysisHtml.js) — un comportement instable spécifiquement    */
/* entre le rendu écran et le rendu PDF natif de Chromium. Remplacé par      */
/* `break-word` pour le rapport premium ; le Diagnostic gratuit (règle       */
/* absolue, jamais modifié) conserve explicitement son comportement exact    */
/* d'avant ce correctif via une règle .free-diagnostic p dédiée.             */
/* -------------------------------------------------------------------------- */

test("rapport premium : n'utilise plus overflow-wrap: anywhere sur le texte courant (cause du bug \"mots collés\")", () => {
  const html = renderAnalysisHtml(baseModel());
  assert.match(html, /h1, h2, h3, p \{ overflow-wrap: break-word; \}/);
  assert.doesNotMatch(html, /h1, h2, h3, p \{ overflow-wrap: anywhere; \}/);
});

test("Diagnostic gratuit : conserve exactement son comportement overflow-wrap précédent (non touché par le correctif premium)", () => {
  const html = renderAnalysisHtml(baseModel());
  assert.match(html, /\.free-diagnostic h1,\s*\.free-diagnostic h2,\s*\.free-diagnostic h3 \{\s*overflow-wrap: anywhere;\s*\}/);
  assert.match(html, /\.free-diagnostic p \{\s*overflow-wrap: anywhere;\s*\}/);
});
