// Tests permanents — corrige quatre incohérences narratives supplémentaires
// révélées par le cas réel MK Elec (Électricien, Saint-Léger, 2026-08-27) :
//   2. "Il peut hésiter... trop peu d'éléments récents" affiché alors que
//      les avis récents sont conformes (le vrai problème est la note et
//      l'absence de réponses, pas la récence) ;
//   3. "Faute de visuels suffisants..." affiché alors que le volume de
//      photos est supérieur à la moyenne concurrentielle (le vrai problème
//      est l'actualité des photos, pas le volume) ;
//   4. Exemples de photos recommandées toujours automobiles ("véhicules
//      pris en charge"), y compris pour un électricien ;
//   5. Synthèse "Confiance visible face aux concurrents" concluant
//      "Derrière" de façon absolue malgré des signaux mixtes (note
//      inférieure mais volume d'avis supérieur).
//
// Ces tests exécutent le code réel de admin/free-diagnostic-production/index.html
// (extrait via node:vm, comme tests/scoreEfficiaV5.test.js et
// tests/websiteStatusAndRatingNarrative.test.js) et le vrai module
// functions/lib/score-efficia/scoreCatalog.js — ce ne sont pas des tests sur
// une réécriture, mais sur les fonctions qui produisent effectivement le PDF
// gratuit.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import {
  buildScoreCatalog,
  buildScorePrefill,
  classifyCompetitiveAttractiveness,
} from "../functions/lib/score-efficia/scoreCatalog.js";
import { GRILLE } from "../functions/lib/score-efficia/criteriaCatalog.js";
import { LEGACY_SCORING_VERSION, SCORING_VERSION, resolveScoringVersion } from "../functions/lib/score-efficia/scoreConfig.js";
import { calculateScoreDetail } from "../functions/lib/score-efficia/scoreEngine.js";

const html = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `bloc introuvable : ${start}`);
  return source.slice(startIndex, endIndex);
}

/* ---------------------------------------------------------------------- */
/* Données du cas réel MK Elec (Électricien, Saint-Léger)                 */
/* ---------------------------------------------------------------------- */
const MK_ELEC = {
  note: 3.1,
  nbAvis: 17,
  moyenneNoteConcurrents: 5.0,
  moyenneAvisConcurrents: 12,
  nbPhotos: 8,
  moyennePhotosConcurrents: 3,
  activite: "Électricien",
  position: 4,
};

/* ---------------------------------------------------------------------- */
/* Harnais 1 — critereConfirmeMax / etatCritere / consequenceReputation / */
/* consequencePhotos / consequenceBusinessPriorite / sectorisation photos */
/* ---------------------------------------------------------------------- */
const ID_BY_KEY = { recenceAvis: 1, tauxReponseAvis: 2, qualiteReponsesAvis: 3, photoRecente: 4, varietePhotos: 5 };
const MAX_PAR_ID = 4;

function createPriorityHarness({ etats = {}, donneesAnalyse = {} } = {}) {
  const code = sliceBetween(html, "function critereConfirmeMax(key){", "function resultatAttenduPriorite(item, ctx){");
  const points = {};
  Object.entries(etats).forEach(([key, etat]) => {
    const id = ID_BY_KEY[key];
    points[id] = etat === "conforme" ? MAX_PAR_ID : etat === "insuffisant" ? 0 : null;
  });
  const context = {
    CONFIG: { seuils: { toleranceConcurrents: 0.10 } },
    estNombre: (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)),
    fmtNote: (n) => Number(n).toFixed(1).replace(".", ","),
    nEntier: (v) => Math.round(Number(v)),
    rapportSansAvis: () => false,
    personaSecteur: () => "un particulier qui cherche un artisan",
    majusculeInitiale: (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1),
    CRITERE_IDS: ID_BY_KEY,
    trouverCritere: (id) => (id !== undefined && id !== null ? { max: MAX_PAR_ID } : null),
    lirePoints: (id) => (id in points ? points[id] : null),
    // prioritePhotosPorteSurActualite lit la variable globale donneesAnalyse
    // (et non un paramètre ctx) : on la fournit ici pour rester fidèle au
    // code réel de l'admin (aucune réécriture de cette fonction existante).
    donneesAnalyse,
  };
  vm.runInNewContext(code, context);
  return context;
}

/* ---------------------------------------------------------------------- */
/* 2) Avis récents conformes : ne jamais évoquer un manque de récence     */
/* ---------------------------------------------------------------------- */

test("cas MK Elec : avis récents conformes, note faible, réponses insuffisantes -> texte exact requis", () => {
  const context = createPriorityHarness({ etats: { recenceAvis: "conforme", tauxReponseAvis: "insuffisant" } });
  const ctx = {
    data: {
      note: MK_ELEC.note,
      nbAvis: MK_ELEC.nbAvis,
      moyennesConcurrents: { avis: MK_ELEC.moyenneAvisConcurrents, note: MK_ELEC.moyenneNoteConcurrents },
    },
  };
  const texte = context.consequenceBusinessPriorite({ famille: "reputation" }, ctx);
  assert.equal(
    texte,
    "Malgré un volume d'avis supérieur à la moyenne, la note de 3,1/5 et l'absence de réponses visibles peuvent créer un doute au moment de choisir l'entreprise.",
  );
  assert.doesNotMatch(texte, /trop peu d'éléments récents/);
});

test("avis récents conformes (règle permanente) : quel que soit le reste, jamais 'trop peu d'éléments récents'", () => {
  const scenarios = [
    { etats: { recenceAvis: "conforme", tauxReponseAvis: "conforme" }, data: { note: 4.6, nbAvis: 30, moyennesConcurrents: { avis: 10 } } },
    { etats: { recenceAvis: "conforme" }, data: { note: 3.1, nbAvis: 5, moyennesConcurrents: { avis: 20 } } },
    { etats: { recenceAvis: "conforme", tauxReponseAvis: "insuffisant" }, data: { note: 4.8, nbAvis: 40, moyennesConcurrents: { avis: 5 } } },
  ];
  for (const scenario of scenarios) {
    const context = createPriorityHarness({ etats: scenario.etats });
    const texte = context.consequenceBusinessPriorite({ famille: "reputation" }, { data: scenario.data });
    assert.doesNotMatch(texte, /trop peu d'éléments récents/, JSON.stringify(scenario));
  }
});

test("avis récents insuffisants (recenceAvis non conforme) : la phrase de récence reste disponible et correcte", () => {
  const context = createPriorityHarness({ etats: { recenceAvis: "insuffisant" } });
  const texte = context.consequenceBusinessPriorite({ famille: "reputation" }, { data: { note: 3.5, nbAvis: 8 } });
  assert.equal(
    texte,
    "Il peut hésiter à contacter l'entreprise, car il dispose de trop peu d'éléments récents pour se rassurer pleinement.",
  );
});

/* ---------------------------------------------------------------------- */
/* 3) Photos : volume supérieur mais anciennes -> jamais "insuffisantes"  */
/* ---------------------------------------------------------------------- */

test("cas MK Elec : 8 photos vs 3 en moyenne (volume supérieur), photos récentes non conforme -> texte exact requis", () => {
  const donnees = { nbPhotos: MK_ELEC.nbPhotos, moyennesConcurrents: { photos: MK_ELEC.moyennePhotosConcurrents } };
  const context = createPriorityHarness({ etats: { photoRecente: "insuffisant" }, donneesAnalyse: donnees });
  const item = { famille: "photos", critere: { key: "photoRecente" } };
  const ctx = { data: donnees };
  const texte = context.consequenceBusinessPriorite(item, ctx);
  assert.equal(
    texte,
    "Si les photos ne sont pas récentes, le client peut se demander si la fiche reflète encore l'activité actuelle.",
  );
  assert.doesNotMatch(texte, /visuels insuffisants|Faute de visuels suffisants|trop peu pour montrer/i);
});

test("photos : volume insuffisant et actualité correcte ou inconnue -> texte historique de volume conservé", () => {
  const donnees = { nbPhotos: 2, moyennesConcurrents: { photos: 10 } };
  const context = createPriorityHarness({ etats: { photoRecente: "conforme" }, donneesAnalyse: donnees });
  const item = { famille: "photos", critere: { key: "varietePhotos" } };
  const ctx = { data: donnees };
  const texte = context.consequenceBusinessPriorite(item, ctx);
  assert.equal(
    texte,
    "Faute de visuels suffisants, il peut avoir plus de mal à se projeter et préférer une fiche qui montre plus clairement le travail réalisé.",
  );
});

test("photos : volume insuffisant ET photos anciennes -> texte distinct combinant les deux, sans confondre les causes", () => {
  const donnees = { nbPhotos: 2, moyennesConcurrents: { photos: 10 } };
  const context = createPriorityHarness({ etats: { photoRecente: "insuffisant" }, donneesAnalyse: donnees });
  const item = { famille: "photos", critere: { key: "varietePhotos" } };
  const ctx = { data: donnees };
  const texte = context.consequenceBusinessPriorite(item, ctx);
  assert.match(texte, /trop peu de photos/);
  assert.match(texte, /récent/);
});

test("photos : données insuffisantes (volume inconnu) -> formulation prudente, pas d'affirmation de volume", () => {
  const context = createPriorityHarness({ etats: {}, donneesAnalyse: {} });
  const item = { famille: "photos", critere: { key: "varietePhotos" } };
  const ctx = { data: {} };
  const texte = context.consequenceBusinessPriorite(item, ctx);
  assert.doesNotMatch(texte, /Faute de visuels suffisants/);
});

test("invariant : la narration photos ne qualifie jamais le volume d'insuffisant quand il est supérieur ou comparable", () => {
  const donnees = { nbPhotos: 8, moyennesConcurrents: { photos: 8 } };
  const context = createPriorityHarness({ etats: { photoRecente: "conforme" }, donneesAnalyse: donnees });
  const item = { famille: "photos", critere: { key: "photoRecente" } };
  // Volume comparable (8 vs 8*0.9=7.2 <= 8) : ne doit jamais dire "Faute de visuels suffisants".
  const ctx = { data: donnees };
  const texte = context.consequenceBusinessPriorite(item, ctx);
  assert.doesNotMatch(texte, /Faute de visuels suffisants/);
});

/* ---------------------------------------------------------------------- */
/* 4) Exemples de photos adaptés au secteur                                */
/* ---------------------------------------------------------------------- */

test("cas MK Elec : électricien -> exemples électricité, jamais 'véhicules pris en charge'", () => {
  const context = createPriorityHarness();
  const ctx = { activite: MK_ELEC.activite, recherche: "", data: {} };
  const texte = context.exemplesPhotosSectoriels(ctx);
  assert.equal(
    texte,
    "Ajouter 4 à 6 photos récentes de chantiers, tableaux électriques, installations, éclairages, réalisations avant/après, équipe ou véhicules d'intervention.",
  );
  assert.doesNotMatch(texte, /véhicules pris en charge/);
});

test("garage / automobile : les exemples automobiles restent autorisés", () => {
  const context = createPriorityHarness();
  const ctx = { activite: "Garage automobile", recherche: "", data: {} };
  const texte = context.exemplesPhotosSectoriels(ctx);
  assert.match(texte, /véhicules pris en charge/);
});

test("secteur inconnu : texte générique sûr, jamais une recommandation automobile", () => {
  const context = createPriorityHarness();
  const ctx = { activite: "Conseil en gestion", recherche: "", data: {} };
  const texte = context.exemplesPhotosSectoriels(ctx);
  assert.equal(
    texte,
    "Ajouter 4 à 6 photos récentes de réalisations, des locaux, de l'équipe, des équipements ou d'exemples du travail effectué.",
  );
  assert.doesNotMatch(texte, /véhicules pris en charge/);
});

test("restaurant : exemples de restauration", () => {
  const context = createPriorityHarness();
  const ctx = { activite: "Restaurant italien", recherche: "", data: {} };
  const texte = context.exemplesPhotosSectoriels(ctx);
  assert.match(texte, /plats/);
});

test("ordre de priorité : activité confirmée l'emporte sur la requête locale en cas de conflit", () => {
  const context = createPriorityHarness();
  const ctx = { activite: "Restaurant", recherche: "électricien Saint-Léger", data: {} };
  const texte = context.exemplesPhotosSectoriels(ctx);
  assert.match(texte, /plats/);
});

test("ordre de priorité : à défaut d'activité confirmée, la requête locale est utilisée", () => {
  const context = createPriorityHarness();
  const ctx = { activite: "", recherche: "électricien Saint-Léger", data: {} };
  const texte = context.exemplesPhotosSectoriels(ctx);
  assert.match(texte, /tableaux électriques/);
});

test("ordre de priorité : à défaut d'activité et de requête, la catégorie normalisée est utilisée", () => {
  const context = createPriorityHarness();
  const ctx = { activite: "", recherche: "", data: { categoriePrincipaleObservee: "Garage automobile" } };
  const texte = context.exemplesPhotosSectoriels(ctx);
  assert.match(texte, /véhicules pris en charge/);
});

test("secteur électricien reconnu même sans accent en amont (normalisation)", () => {
  const context = createPriorityHarness();
  const ctx = { activite: "Electricien", recherche: "", data: {} };
  const texte = context.exemplesPhotosSectoriels(ctx);
  assert.match(texte, /tableaux électriques/);
});

/* ---------------------------------------------------------------------- */
/* 5) Synthèse concurrentielle "Confiance visible face aux concurrents"   */
/* ---------------------------------------------------------------------- */

function createSyntheseHarness() {
  const code = sliceBetween(html, "const LIBELLES_CONFIANCE_CONCURRENCE = {", "function actualiserPreuvesAutomatiques(business = {}, scorePrefill = {}){");
  const context = {};
  vm.runInNewContext(code, context);
  return context;
}

function libelleSynthese({ rating, reviews, averageRating, averageReviews }) {
  const decision = classifyCompetitiveAttractiveness({ rating, reviews, averageRating, averageReviews });
  const context = createSyntheseHarness();
  return {
    status: decision.synthesisStatus,
    label: context.libelleConfianceConcurrence(decision.synthesisStatus, decision.ratingSignal, decision.reviewsSignal),
  };
}

test("cas MK Elec : note inférieure (3,1 vs 5,0) mais volume d'avis supérieur (17 vs 12) -> conclusion Contrastée exacte requise", () => {
  const { status, label } = libelleSynthese({ rating: MK_ELEC.note, reviews: MK_ELEC.nbAvis, averageRating: MK_ELEC.moyenneNoteConcurrents, averageReviews: MK_ELEC.moyenneAvisConcurrents });
  assert.equal(status, "contrasted");
  assert.equal(label, "Confiance visible contrastée : volume d'avis supérieur, mais note nettement inférieure.");
});

test("synthèse concurrentielle : les deux signaux supérieurs -> Devant", () => {
  const { label } = libelleSynthese({ rating: 4.8, reviews: 20, averageRating: 4.0, averageReviews: 10 });
  assert.equal(label, "Devant");
});

test("synthèse concurrentielle : les deux signaux inférieurs -> Derrière", () => {
  const { label } = libelleSynthese({ rating: 3.0, reviews: 5, averageRating: 4.5, averageReviews: 15 });
  assert.equal(label, "Derrière");
});

test("synthèse concurrentielle : les deux signaux comparables -> Comparable", () => {
  const { label } = libelleSynthese({ rating: 4.0, reviews: 10, averageRating: 4.1, averageReviews: 10.5 });
  assert.equal(label, "Comparable");
});

test("synthèse concurrentielle : note inférieure et volume supérieur -> Contrastée", () => {
  const { label } = libelleSynthese({ rating: 3.0, reviews: 30, averageRating: 4.5, averageReviews: 10 });
  assert.match(label, /^Confiance visible contrastée/);
});

test("synthèse concurrentielle : note supérieure et volume inférieur -> Contrastée", () => {
  const { label } = libelleSynthese({ rating: 4.8, reviews: 3, averageRating: 4.0, averageReviews: 20 });
  assert.match(label, /^Confiance visible contrastée/);
});

test("synthèse concurrentielle : signal comparable combiné à un signal supérieur -> Contrastée (jamais une conclusion absolue)", () => {
  const { label } = libelleSynthese({ rating: 4.8, reviews: 10, averageRating: 4.0, averageReviews: 10.2 });
  assert.match(label, /^Confiance visible contrastée/);
});

test("synthèse concurrentielle : signal comparable combiné à un signal inférieur -> Contrastée (jamais une conclusion absolue)", () => {
  const { label } = libelleSynthese({ rating: 3.0, reviews: 10, averageRating: 4.5, averageReviews: 10.2 });
  assert.match(label, /^Confiance visible contrastée/);
});

test("synthèse concurrentielle : données manquantes -> À confirmer", () => {
  const { label } = libelleSynthese({ rating: 4.0, reviews: 10, averageRating: null, averageReviews: null });
  assert.equal(label, "À confirmer");
});

/* ---------------------------------------------------------------------- */
/* 6) La synthèse reste strictement informative : aucun effet sur le score */
/* ---------------------------------------------------------------------- */

test("la synthèse 'Contrastée' n'ajoute aucun critère noté et ne ressuscite pas l'ancien critère attractiviteConcurrents", () => {
  const catalog = buildScoreCatalog(SCORING_VERSION);
  const criteria = catalog.categories.flatMap((category) => category.criteria);
  assert.equal(criteria.filter((criterion) => criterion.scored).length, 28);
  assert.equal(criteria.filter((criterion) => criterion.informational).length, 1);
  const summary = criteria.find((criterion) => criterion.key === "attractiviteConcurrents");
  assert.deepEqual(summary.options, []);
  assert.equal(summary.max, 0);
});

test("prefill v5 d'un cas 'contrasté' (type MK Elec) : points null, non noté, informational", () => {
  const analysis = {
    business: {
      rating: MK_ELEC.note,
      reviews: MK_ELEC.nbAvis,
      competitors: [{ reviews: 5 }, { reviews: 12 }, { reviews: 20 }],
      normalized: {},
    },
    benchmark: { averages: { rating: MK_ELEC.moyenneNoteConcurrents, reviews: MK_ELEC.moyenneAvisConcurrents } },
  };
  const summary = buildScorePrefill(analysis, { scoringVersion: SCORING_VERSION }).criteria
    .find((criterion) => criterion.key === "attractiviteConcurrents");
  assert.equal(summary.points, null);
  assert.equal(summary.scored, false);
  assert.equal(summary.informational, true);
  assert.equal(summary.evidence.synthesisStatus, "contrasted");
});

test("le score v5 est strictement identique quelle que soit la valeur brute stockée pour attractiviteConcurrents (y compris un cas contrasté)", () => {
  const base = Object.fromEntries(GRILLE.flatMap((category) => category.criteres).map((criterion) => [criterion.key, criterion.max]));
  const ahead = calculateScoreDetail({ ...base, attractiviteConcurrents: 4 }, "artisan", SCORING_VERSION);
  const behind = calculateScoreDetail({ ...base, attractiviteConcurrents: 0 }, "artisan", SCORING_VERSION);
  const comparable = calculateScoreDetail({ ...base, attractiviteConcurrents: 2 }, "artisan", SCORING_VERSION);
  const missing = calculateScoreDetail({ ...base, attractiviteConcurrents: null }, "artisan", SCORING_VERSION);
  assert.equal(ahead.total, behind.total);
  assert.equal(behind.total, comparable.total);
  assert.equal(comparable.total, missing.total);
});

/* ---------------------------------------------------------------------- */
/* 9) Compatibilité historique v4 : la grille notée n'a pas bougé          */
/* ---------------------------------------------------------------------- */

test("la grille historique v4 (opts Devant/Comparable/Derrière et leurs points) reste inchangée", () => {
  const criteriaCatalog = readFileSync(new URL("../functions/lib/score-efficia/criteriaCatalog.js", import.meta.url), "utf8");
  assert.match(criteriaCatalog, /opts:\[\["Devant",CONFIG\.poids\.visibilite\.attractivite\],\["Comparable",2\],\["Derrière",0\]\]/);
});
/* ---------------------------------------------------------------------- */
/* 10) Versionnage de l'affichage de la synthèse concurrentielle           */
/*     Invariant : v4/historique -> conclusion et score historiques ;      */
/*     v5 -> synthesisStatus ; historique sans version -> repli v4 strict. */
/* ---------------------------------------------------------------------- */

// Analyse MK Elec avec EXACTEMENT les mêmes preuves concurrentielles
// (rating 3,1 vs 5,0 ; reviews 17 vs 12) pour les 3 scénarios, afin que seule
// la version de scoring fasse varier la conclusion affichée.
function mkElecAnalysis() {
  return {
    business: {
      rating: MK_ELEC.note,
      reviews: MK_ELEC.nbAvis,
      competitors: [{ reviews: 5 }, { reviews: 12 }, { reviews: 20 }],
      normalized: {},
    },
    benchmark: { averages: { rating: MK_ELEC.moyenneNoteConcurrents, reviews: MK_ELEC.moyenneAvisConcurrents } },
  };
}

function createRenderHarness() {
  const code = sliceBetween(
    html,
    "const LIBELLES_CONFIANCE_CONCURRENCE = {",
    "function appliquerPreRemplissageDiagnosticGratuit(scorePrefill){",
  );
  const store = new Map();
  const node = () => ({
    _text: "",
    set textContent(value) { this._text = value; },
    get textContent() { return this._text; },
    replaceChildren() {},
    appendChild() {},
  });
  const document = {
    getElementById(id) {
      if (!store.has(id)) store.set(id, node());
      return store.get(id);
    },
    createElement() { return node(); },
  };
  const context = {
    document,
    donneesAnalyse: {},
    estNombre: (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)),
    LEGACY_SCORING_VERSION,
    scoringVersionActif: SCORING_VERSION,
  };
  vm.runInNewContext(code, context);
  return { context, textOf: (id) => store.get(id)?.textContent };
}

function renderSynthese({ scorePrefillVersion, activeVersion, business = {} }) {
  const scorePrefill = buildScorePrefill(mkElecAnalysis(), { scoringVersion: scorePrefillVersion });
  const { context, textOf } = createRenderHarness();
  context.scoringVersionActif = activeVersion;
  context.actualiserPreuvesAutomatiques(business, scorePrefill);
  return { conclusion: textOf("competitive-decision"), syntheseLabel: context.donneesAnalyse.syntheseConcurrence?.label, scorePrefill };
}

test("rendu — scoringVersion v4 explicite : conclusion ET score historiques conservés, jamais la synthèse v5", () => {
  const { conclusion, syntheseLabel, scorePrefill } = renderSynthese({
    scorePrefillVersion: LEGACY_SCORING_VERSION,
    activeVersion: LEGACY_SCORING_VERSION,
  });
  // Logique historique (OR) : rating 3,1/5,0 est nettement sous la tolérance -> "Derrière", inchangé.
  assert.equal(conclusion, "Derrière");
  assert.equal(syntheseLabel, "Derrière");
  assert.doesNotMatch(conclusion, /Contrastée/);

  const summary = scorePrefill.criteria.find((criterion) => criterion.key === "attractiviteConcurrents");
  // Score historique v4 : buildScorePrefill ne pose scored/informational que pour v5
  // (voir le bloc de dérogation dans scoreCatalog.js) — en v4 le critère garde son
  // vrai point issu des options de la grille (comportement inchangé, non affecté
  // par les champs additifs synthesisStatus/ratingSignal/reviewsSignal).
  assert.equal(summary.scored, undefined);
  assert.equal(summary.informational, undefined);
  assert.equal(summary.points, 0);
  assert.equal(summary.label, "Derrière");
  const base = Object.fromEntries(GRILLE.flatMap((category) => category.criteres).map((criterion) => [criterion.key, criterion.max]));
  // Tous les critères au maximum sauf attractiviteConcurrents (mis à 0, comme
  // le renvoie réellement buildScorePrefill pour ce cas "Derrière") : preuve
  // que le calcul historique tourne sans erreur et reflète fidèlement ce
  // point, ni plus ni moins — comportement identique à avant ce correctif.
  const legacyTotal = calculateScoreDetail({ ...base, attractiviteConcurrents: summary.points }, "artisan", LEGACY_SCORING_VERSION).total;
  const legacyTotalWithMaxAttractivite = calculateScoreDetail(base, "artisan", LEGACY_SCORING_VERSION).total;
  assert.equal(Math.round(legacyTotalWithMaxAttractivite), 100);
  assert.ok(legacyTotal < legacyTotalWithMaxAttractivite);
});

test("rendu — scoringVersion v5 explicite : conclusion Contrastée exacte, score v5 inchangé", () => {
  const { conclusion, syntheseLabel, scorePrefill } = renderSynthese({
    scorePrefillVersion: SCORING_VERSION,
    activeVersion: SCORING_VERSION,
  });
  assert.equal(conclusion, "Confiance visible contrastée : volume d'avis supérieur, mais note nettement inférieure.");
  assert.equal(syntheseLabel, conclusion);

  const summary = scorePrefill.criteria.find((criterion) => criterion.key === "attractiviteConcurrents");
  assert.equal(summary.points, null);
  assert.equal(summary.scored, false);
  assert.equal(summary.informational, true);
  const base = Object.fromEntries(GRILLE.flatMap((category) => category.criteres).map((criterion) => [criterion.key, criterion.max]));
  const v5Total = calculateScoreDetail({ ...base, attractiviteConcurrents: null }, "artisan", SCORING_VERSION).total;
  assert.equal(Math.round(v5Total), 100);
});

test("rendu — analyse historique sans scoringVersion : repli v4 strict, jamais synthesisStatus", () => {
  // Reproduit exactement la résolution serveur réelle (functions/lib/freeDiagnosticProductionLink.js) :
  // resolveScoringVersion(analysis.scoringVersion, { historicalFallback: true }).
  const resolved = resolveScoringVersion(undefined, { historicalFallback: true });
  assert.equal(resolved, LEGACY_SCORING_VERSION);
  const { conclusion, syntheseLabel } = renderSynthese({ scorePrefillVersion: resolved, activeVersion: resolved });
  assert.equal(conclusion, "Derrière");
  assert.equal(syntheseLabel, "Derrière");
  assert.doesNotMatch(conclusion, /Contrastée/);
});

test("garde-fou explicite : même si le prefill sous-jacent est v5, scoringVersionActif=v4 impose la conclusion historique", () => {
  // Vérifie que l'affichage suit scoringVersionActif (source de vérité unique côté admin),
  // pas la version utilisée pour construire scorePrefill — pour couvrir tout futur cas de
  // désynchronisation entre les deux.
  const { conclusion } = renderSynthese({ scorePrefillVersion: SCORING_VERSION, activeVersion: LEGACY_SCORING_VERSION });
  assert.equal(conclusion, "Derrière");
  assert.doesNotMatch(conclusion, /Contrastée/);
});
