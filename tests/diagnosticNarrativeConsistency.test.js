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

/* ---------------------------------------------------------------------- */
/* 11) Cas réel MK Elec (2026-08-27) — deux nouvelles incohérences :      */
/*   - page 4 "Résultat attendu" (réputation) promettait "des avis plus  */
/*     récents" alors que "Avis récents" est conforme (page 3) ;         */
/*   - page 5 priorité "Informations essentielles" citait horaires /     */
/*     coordonnées / adresse de façon générique, y compris quand ces     */
/*     critères sont conformes, et sans jamais distinguer un critère     */
/*     "à confirmer" (zone desservie) d'un défaut avéré.                 */
/* ---------------------------------------------------------------------- */
const ID_BY_KEY_TASKC = {
  recenceAvis: 1, tauxReponseAvis: 2, qualiteReponsesAvis: 3, photoRecente: 4, varietePhotos: 5,
  revendiquee: 6, horaires: 7, contact: 8, attributs: 9, adresse: 10, nap: 11, nomConforme: 12,
};
const MAX_OVERRIDES_TASKC = { 6: 3, 7: 3, 8: 3, 9: 2, 10: 2, 11: 3, 12: 2 };

function createFullPriorityHarness({ etats = {}, donneesAnalyse = {}, sansAvis = false, nonVerifiablePubliquement = false } = {}) {
  const code = sliceBetween(html, "function critereConfirmeMax(key){", "function microLivrablePriorite(item, ctx){");
  const points = {};
  Object.entries(etats).forEach(([key, etat]) => {
    const id = ID_BY_KEY_TASKC[key];
    const max = MAX_OVERRIDES_TASKC[id] || 4;
    points[id] =
      etat === "conforme" ? max :
      etat === "aConfirmer" ? Math.max(1, max - 1) :
      (etat === "insuffisant" || etat === "nonConforme") ? 0 :
      null;
  });
  const context = {
    CONFIG: { seuils: { toleranceConcurrents: 0.10 } },
    estNombre: (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)),
    fmtNote: (n) => Number(n).toFixed(1).replace(".", ","),
    nEntier: (v) => Math.round(Number(v)),
    rapportSansAvis: () => sansAvis,
    personaSecteur: () => "un particulier qui cherche un artisan",
    majusculeInitiale: (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1),
    secteurActiviteNaturel: () => "une intervention",
    localisationNonVerifiablePubliquement: () => nonVerifiablePubliquement,
    categoriePrincipaleValideePourRapport: () => true,
    zoneDesserteDoitEtreCorrigee: () => false,
    joinFr: (items) => {
      const list = items.filter(Boolean);
      if (!list.length) return "";
      if (list.length === 1) return list[0];
      return `${list.slice(0, -1).join(", ")} et ${list[list.length - 1]}`;
    },
    CRITERE_IDS: ID_BY_KEY_TASKC,
    trouverCritere: (id) => (id !== undefined && id !== null ? { max: MAX_OVERRIDES_TASKC[id] || 4 } : null),
    lirePoints: (id) => (id in points ? points[id] : null),
    donneesAnalyse,
  };
  vm.runInNewContext(code, context);
  return context;
}

const REPUTATION_ITEM = { famille: "reputation" };
const INFOS_ITEM = { famille: "infos" };
const FORBIDDEN_RECENCY = /des avis plus récents|davantage d'avis récents|manque d'avis récents|retrouver de la récence/i;

/* --- Avis (10 scénarios permanents) --- */

test("Avis 1 : note insuffisante + volume conforme + récence conforme + réponses absentes -> jamais de récence, note+réponses au centre", () => {
  const context = createFullPriorityHarness({ etats: { recenceAvis: "conforme", tauxReponseAvis: "insuffisant" } });
  const ctx = { data: { note: 3.1, nbAvis: 17, moyennesConcurrents: { avis: 12 } } };
  const premierPas = context.recommandationPriorite(REPUTATION_ITEM, ctx);
  const resultat = context.resultatAttenduPriorite(REPUTATION_ITEM, ctx);
  assert.doesNotMatch(premierPas, FORBIDDEN_RECENCY);
  assert.doesNotMatch(resultat, FORBIDDEN_RECENCY);
  assert.match(premierPas, /avis authentiques/i);
  assert.match(premierPas, /répondre aux avis visibles/i);
  assert.match(resultat, /note progressivement plus représentative/i);
  assert.match(resultat, /réponses visibles/i);
});

test("Avis 2 : note insuffisante + volume conforme + récence insuffisante + réponses absentes -> la récence peut apparaître, étayée", () => {
  const context = createFullPriorityHarness({ etats: { recenceAvis: "insuffisant", tauxReponseAvis: "insuffisant" } });
  const ctx = { data: { note: 3.4, nbAvis: 15, moyennesConcurrents: { avis: 10 } } };
  const resultat = context.resultatAttenduPriorite(REPUTATION_ITEM, ctx);
  assert.match(resultat, /avis plus récents/i);
  assert.match(resultat, /note progressivement plus représentative/i);
});

test("Avis 3 : note insuffisante + volume insuffisant + récence conforme + réponses conformes -> seule la note est visée", () => {
  const context = createFullPriorityHarness({ etats: { recenceAvis: "conforme", tauxReponseAvis: "conforme" } });
  const ctx = { data: { note: 3.8, nbAvis: 4, moyennesConcurrents: { avis: 20 } } };
  const premierPas = context.recommandationPriorite(REPUTATION_ITEM, ctx);
  const resultat = context.resultatAttenduPriorite(REPUTATION_ITEM, ctx);
  assert.doesNotMatch(premierPas, FORBIDDEN_RECENCY);
  assert.doesNotMatch(premierPas, /répondre aux avis visibles/i);
  assert.doesNotMatch(resultat, /réponses visibles|avis plus récents/i);
  assert.match(resultat, /note progressivement plus représentative/i);
});

test("Avis 4 : note conforme + volume conforme + récence conforme + réponses conformes -> aucune critique, formulation positive", () => {
  const context = createFullPriorityHarness({ etats: { recenceAvis: "conforme", tauxReponseAvis: "conforme" } });
  const ctx = { data: { note: 4.7, nbAvis: 30, moyennesConcurrents: { avis: 10 } } };
  const premierPas = context.recommandationPriorite(REPUTATION_ITEM, ctx);
  const resultat = context.resultatAttenduPriorite(REPUTATION_ITEM, ctx);
  assert.doesNotMatch(premierPas, FORBIDDEN_RECENCY);
  assert.doesNotMatch(resultat, /note progressivement plus représentative|réponses visibles|avis plus récents/i);
  assert.match(resultat, /continue de rassurer/i);
});

test("Avis 5 : aucun avis -> branche dédiée rapportSansAvis, jamais la logique evidence-driven", () => {
  const context = createFullPriorityHarness({ sansAvis: true });
  const ctx = { data: {} };
  const premierPas = context.recommandationPriorite(REPUTATION_ITEM, ctx);
  const resultat = context.resultatAttenduPriorite(REPUTATION_ITEM, ctx);
  assert.match(premierPas, /premiers avis authentiques/i);
  assert.match(resultat, /premiers avis authentiques/i);
});

test("Avis 11 : aucun avis — constat et conséquence business utilisent le texte exact requis, sans aucune critique de récence", () => {
  // Corrige les deux maladresses éditoriales "aucun avis" (consequenceReputation) :
  // avant ce correctif, le champ "Ce qu'il peut penser" affirmait "sans aucun avis
  // récent" alors qu'il n'existe précisément AUCUN avis — laissant entendre que des
  // avis plus anciens pourraient exister. Le texte ne doit jamais mentionner la
  // récence dans ce cas : il n'y a rien dont la récence puisse être jugée.
  const context = createFullPriorityHarness({ sansAvis: true });
  const ctx = { data: {} };
  const constat = context.constatObservePriorite(REPUTATION_ITEM, ctx);
  const consequence = context.consequenceBusinessPriorite(REPUTATION_ITEM, ctx);
  const premierPas = context.recommandationPriorite(REPUTATION_ITEM, ctx);
  const resultat = context.resultatAttenduPriorite(REPUTATION_ITEM, ctx);
  assert.equal(constat, "Votre fiche ne présente actuellement aucun avis client.");
  assert.equal(consequence, "Sans avis client visible, un prospect ne dispose d'aucun retour d'expérience pour se rassurer avant de vous contacter.");
  assert.match(premierPas, /premiers avis authentiques/i);
  assert.match(resultat, /premiers avis authentiques/i);
  for (const texte of [constat, consequence, premierPas, resultat]) {
    assert.doesNotMatch(texte, /avis récent|avis plus récent/i, texte);
  }
});

test("Avis 12 : contraste permanent — 'aucun avis' (récence hors-sujet) reste distinct d'avis existants mais anciens (récence autorisée)", () => {
  // "Aucun avis" : la récence n'a pas de sens à évoquer (rien à dater).
  const sansAvis = createFullPriorityHarness({ sansAvis: true });
  const consequenceSansAvis = sansAvis.consequenceBusinessPriorite(REPUTATION_ITEM, { data: {} });
  assert.doesNotMatch(consequenceSansAvis, /récen/i);
  assert.doesNotMatch(consequenceSansAvis, /avis récent|avis plus récent/i);

  // "Avis existants mais anciens" : des avis existent (recenceAvis insuffisant,
  // nbAvis > 0) — la formulation peut alors signaler l'absence de récence, mais
  // doit rester construite sur un volume d'avis réellement observé.
  const avisAnciens = createFullPriorityHarness({ etats: { recenceAvis: "insuffisant", tauxReponseAvis: "insuffisant" } });
  const ctxAnciens = { data: { note: 3.4, nbAvis: 15, moyennesConcurrents: { avis: 10 } } };
  const resultatAnciens = avisAnciens.resultatAttenduPriorite(REPUTATION_ITEM, ctxAnciens);
  assert.match(resultatAnciens, /avis plus récents/i);
  assert.notEqual(consequenceSansAvis, avisAnciens.consequenceBusinessPriorite(REPUTATION_ITEM, ctxAnciens));
});

test("Avis 6 : avis récents conformes -> jamais de formulation de manque de récence (recommandation + résultat)", () => {
  const scenarios = [
    { recenceAvis: "conforme", tauxReponseAvis: "conforme", note: 4.9, nbAvis: 25 },
    { recenceAvis: "conforme", tauxReponseAvis: "insuffisant", note: 3.0, nbAvis: 6 },
    { recenceAvis: "conforme", note: 4.0, nbAvis: 9 },
  ];
  for (const scenario of scenarios) {
    const context = createFullPriorityHarness({ etats: scenario });
    const ctx = { data: { note: scenario.note, nbAvis: scenario.nbAvis } };
    assert.doesNotMatch(context.recommandationPriorite(REPUTATION_ITEM, ctx), FORBIDDEN_RECENCY, JSON.stringify(scenario));
    assert.doesNotMatch(context.resultatAttenduPriorite(REPUTATION_ITEM, ctx), FORBIDDEN_RECENCY, JSON.stringify(scenario));
  }
});

test("Avis 7 : avis récents insuffisants -> une recommandation liée à la récence peut apparaître", () => {
  const context = createFullPriorityHarness({ etats: { recenceAvis: "insuffisant", tauxReponseAvis: "conforme" } });
  const ctx = { data: { note: 4.5, nbAvis: 20 } };
  const premierPas = context.recommandationPriorite(REPUTATION_ITEM, ctx);
  assert.match(premierPas, /récence/i);
});

test("Avis 8 : réponses conformes -> jamais de critique des réponses", () => {
  const context = createFullPriorityHarness({ etats: { tauxReponseAvis: "conforme", recenceAvis: "conforme" } });
  const ctx = { data: { note: 3.9, nbAvis: 10 } };
  const premierPas = context.recommandationPriorite(REPUTATION_ITEM, ctx);
  const resultat = context.resultatAttenduPriorite(REPUTATION_ITEM, ctx);
  assert.doesNotMatch(premierPas, /répondre aux avis visibles/i);
  assert.doesNotMatch(resultat, /réponses visibles/i);
});

test("Avis 9 : réponses absentes -> une recommandation de réponse personnalisée doit apparaître", () => {
  const context = createFullPriorityHarness({ etats: { tauxReponseAvis: "insuffisant", recenceAvis: "conforme" } });
  const ctx = { data: { note: 4.4, nbAvis: 18 } };
  const premierPas = context.recommandationPriorite(REPUTATION_ITEM, ctx);
  assert.match(premierPas, /message personnalisé/i);
});

test("Avis 10 : cas exact MK Elec -> textes exacts requis sur les 4 champs, jamais de formulation de récence manquante", () => {
  const context = createFullPriorityHarness({ etats: { recenceAvis: "conforme", tauxReponseAvis: "insuffisant" } });
  const ctx = { data: { note: MK_ELEC.note, nbAvis: MK_ELEC.nbAvis, moyennesConcurrents: { avis: MK_ELEC.moyenneAvisConcurrents, note: MK_ELEC.moyenneNoteConcurrents } } };
  const constat = context.constatObservePriorite(REPUTATION_ITEM, ctx);
  const prospect = context.consequenceBusinessPriorite(REPUTATION_ITEM, ctx);
  const premierPas = context.recommandationPriorite(REPUTATION_ITEM, ctx);
  const resultat = context.resultatAttenduPriorite(REPUTATION_ITEM, ctx);
  assert.equal(constat, "Votre fiche dispose de 17 avis. En revanche, votre note de 3,1/5 reste nettement inférieure à la moyenne concurrentielle observée de 5,0/5.");
  assert.equal(prospect, "Malgré un volume d'avis supérieur à la moyenne, la note de 3,1/5 et l'absence de réponses visibles peuvent créer un doute au moment de choisir l'entreprise.");
  assert.equal(premierPas, "Mettre en place un parcours éthique de collecte de nouveaux avis authentiques auprès de clients réellement servis et répondre aux avis visibles avec un message personnalisé.");
  assert.equal(resultat, "une note progressivement plus représentative de la qualité réelle de votre travail, des réponses visibles et une fiche plus rassurante au premier regard.");
  for (const texte of [constat, prospect, premierPas, resultat]) {
    assert.doesNotMatch(texte, FORBIDDEN_RECENCY, texte);
  }
});

/* --- Informations essentielles (12 scénarios permanents) --- */

test("Infos 11 : seuls les attributs sont non conformes -> titre, constat et premier pas exacts (MK Elec)", () => {
  const context = createFullPriorityHarness({
    etats: { revendiquee: "conforme", horaires: "conforme", contact: "conforme", attributs: "nonConforme", adresse: "conforme", nap: "conforme", nomConforme: "conforme" },
  });
  assert.equal(context.titrePriorite(INFOS_ITEM), "Compléter les attributs utiles de votre fiche");
  assert.equal(context.constatObservePriorite(INFOS_ITEM, { data: {} }), "Certains attributs utiles à votre activité, comme les modalités d'accès ou de paiement lorsqu'elles s'appliquent, ne sont pas renseignés sur votre fiche Google.");
  assert.equal(context.recommandationPriorite(INFOS_ITEM, { data: {} }), "Vérifier dans votre compte Google Business les attributs réellement applicables à votre activité et compléter ceux qui manquent.");
  assert.equal(context.actionFamillePriorite({ key: "infos" }), "Vérifier dans votre compte Google Business les attributs réellement applicables à votre activité et compléter ceux qui manquent.");
});

test("Infos 12 : seuls les horaires sont non conformes -> titre et constat centrés sur les horaires uniquement", () => {
  const context = createFullPriorityHarness({
    etats: { revendiquee: "conforme", horaires: "nonConforme", contact: "conforme", attributs: "conforme", adresse: "conforme", nap: "conforme", nomConforme: "conforme" },
  });
  assert.equal(context.titrePriorite(INFOS_ITEM), "Compléter vos horaires");
  assert.match(context.constatObservePriorite(INFOS_ITEM, { data: {} }), /horaires/i);
  assert.doesNotMatch(context.constatObservePriorite(INFOS_ITEM, { data: {} }), /attributs|cohérence|zone desservie|adresse/i);
});

test("Infos 13 : seule la cohérence fiche/site (nap) est non conforme", () => {
  const context = createFullPriorityHarness({
    etats: { revendiquee: "conforme", horaires: "conforme", contact: "conforme", attributs: "conforme", adresse: "conforme", nap: "nonConforme", nomConforme: "conforme" },
  });
  assert.equal(context.titrePriorite(INFOS_ITEM), "Aligner votre fiche avec votre site");
  assert.match(context.constatObservePriorite(INFOS_ITEM, { data: {} }), /diffèrent entre la fiche et le site/i);
  assert.doesNotMatch(context.constatObservePriorite(INFOS_ITEM, { data: {} }), /horaires|attributs/i);
});

test("Infos 14 : attributs ET horaires non conformes -> les deux sont regroupés, titre générique", () => {
  const context = createFullPriorityHarness({
    etats: { revendiquee: "conforme", horaires: "nonConforme", contact: "conforme", attributs: "nonConforme", adresse: "conforme", nap: "conforme", nomConforme: "conforme" },
  });
  assert.equal(context.titrePriorite(INFOS_ITEM), "Sécuriser les informations essentielles");
  const constat = context.constatObservePriorite(INFOS_ITEM, { data: {} });
  assert.match(constat, /horaires/i);
  assert.match(constat, /attributs/i);
  const premierPas = context.recommandationPriorite(INFOS_ITEM, { data: {} });
  assert.match(premierPas, /horaires/i);
  assert.match(premierPas, /attributs/i);
});

test("Infos 15 : tous les critères sont conformes -> aucune critique, formulation neutre", () => {
  const context = createFullPriorityHarness({
    etats: { revendiquee: "conforme", horaires: "conforme", contact: "conforme", attributs: "conforme", adresse: "conforme", nap: "conforme", nomConforme: "conforme" },
  });
  assert.equal(context.titrePriorite(INFOS_ITEM), "Sécuriser les informations essentielles");
  assert.doesNotMatch(context.constatObservePriorite(INFOS_ITEM, { data: {} }), /horaires|attributs|cohérence|diffèrent|zone desservie/i);
});

test("Infos 16 : zone desservie 'à confirmer' + tout le reste conforme -> jamais un défaut avéré", () => {
  const context = createFullPriorityHarness({
    etats: { revendiquee: "conforme", horaires: "conforme", contact: "conforme", attributs: "conforme", adresse: "aConfirmer", nap: "conforme", nomConforme: "conforme" },
  });
  const constat = context.constatObservePriorite(INFOS_ITEM, { data: {} });
  assert.doesNotMatch(constat, /non conforme|défaut|manquant|absent/i);
  assert.match(constat, /confirmer/i);
  assert.equal(context.defautsInfos().length, 0);
});

test("Infos 17 : zone desservie 'à confirmer' + attributs non conformes -> seuls les attributs sont cités comme défaut", () => {
  const context = createFullPriorityHarness({
    etats: { revendiquee: "conforme", horaires: "conforme", contact: "conforme", attributs: "nonConforme", adresse: "aConfirmer", nap: "conforme", nomConforme: "conforme" },
  });
  assert.equal(context.titrePriorite(INFOS_ITEM), "Compléter les attributs utiles de votre fiche");
  const constat = context.constatObservePriorite(INFOS_ITEM, { data: {} });
  assert.match(constat, /attributs/i);
  assert.doesNotMatch(constat, /zone desservie/i);
  assert.equal(context.defautsInfos().length, 1);
  assert.equal(context.defautsInfos()[0], "attributs");
});

test("Infos 18 : téléphone/site (contact) conformes -> jamais cités comme problème", () => {
  const context = createFullPriorityHarness({
    etats: { revendiquee: "conforme", horaires: "nonConforme", contact: "conforme", attributs: "nonConforme", adresse: "conforme", nap: "conforme", nomConforme: "conforme" },
  });
  const texts = [
    context.titrePriorite(INFOS_ITEM),
    context.constatObservePriorite(INFOS_ITEM, { data: {} }),
    context.recommandationPriorite(INFOS_ITEM, { data: {} }),
  ].join(" ");
  assert.doesNotMatch(texts, /téléphone|site web/i);
});

test("Infos 19 : horaires conformes -> jamais cités comme problème", () => {
  const context = createFullPriorityHarness({
    etats: { revendiquee: "conforme", horaires: "conforme", contact: "nonConforme", attributs: "conforme", adresse: "conforme", nap: "conforme", nomConforme: "conforme" },
  });
  const texts = [
    context.titrePriorite(INFOS_ITEM),
    context.constatObservePriorite(INFOS_ITEM, { data: {} }),
    context.recommandationPriorite(INFOS_ITEM, { data: {} }),
  ].join(" ");
  assert.doesNotMatch(texts, /horaires/i);
});

test("Infos 20 : cohérence fiche/site (nap) conforme -> jamais citée comme problème", () => {
  const context = createFullPriorityHarness({
    etats: { revendiquee: "conforme", horaires: "conforme", contact: "conforme", attributs: "nonConforme", adresse: "conforme", nap: "conforme", nomConforme: "conforme" },
  });
  const texts = [
    context.titrePriorite(INFOS_ITEM),
    context.constatObservePriorite(INFOS_ITEM, { data: {} }),
    context.recommandationPriorite(INFOS_ITEM, { data: {} }),
  ].join(" ");
  assert.doesNotMatch(texts, /diffèrent entre la fiche et le site|cohérence/i);
});

test("Infos 21 : un critère 'à confirmer' n'est jamais compté parmi les défauts avérés (invariant général)", () => {
  const context = createFullPriorityHarness({
    etats: { revendiquee: "aConfirmer", horaires: "conforme", contact: "conforme", attributs: "conforme", adresse: "aConfirmer", nap: "conforme", nomConforme: "aConfirmer" },
  });
  assert.equal(context.defautsInfos().length, 0);
  assert.equal(context.elementsInfosAConfirmer().length, 3);
});

test("Infos 22 : cas exact MK Elec -> seuls les attributs cités dans la troisième priorité, textes exacts requis", () => {
  const context = createFullPriorityHarness({
    etats: { revendiquee: "conforme", horaires: "conforme", contact: "conforme", attributs: "nonConforme", adresse: "aConfirmer", nap: "conforme", nomConforme: "conforme" },
  });
  assert.equal(context.titrePriorite(INFOS_ITEM), "Compléter les attributs utiles de votre fiche");
  assert.equal(
    context.constatObservePriorite(INFOS_ITEM, { data: {} }),
    "Certains attributs utiles à votre activité, comme les modalités d'accès ou de paiement lorsqu'elles s'appliquent, ne sont pas renseignés sur votre fiche Google.",
  );
  assert.equal(
    context.consequenceBusinessPriorite(INFOS_ITEM, { data: {} }),
    "Un prospect peut manquer d'informations pratiques au moment de comparer votre entreprise avec une autre fiche plus complète.",
  );
  assert.equal(
    context.recommandationPriorite(INFOS_ITEM, { data: {} }),
    "Vérifier dans votre compte Google Business les attributs réellement applicables à votre activité et compléter ceux qui manquent.",
  );
  assert.equal(context.resultatAttenduPriorite(INFOS_ITEM, { data: {} }), "une fiche plus complète, avec moins d'incertitudes pratiques avant le premier contact.");
  const allTexts = [
    context.titrePriorite(INFOS_ITEM),
    context.constatObservePriorite(INFOS_ITEM, { data: {} }),
    context.consequenceBusinessPriorite(INFOS_ITEM, { data: {} }),
    context.recommandationPriorite(INFOS_ITEM, { data: {} }),
    context.resultatAttenduPriorite(INFOS_ITEM, { data: {} }),
  ].join(" ");
  assert.doesNotMatch(allTexts, /\bhoraires\b|\btéléphone\b|\bsite web\b|zone desservie|cohérence|\badresse\b/i);
});

test("Infos 23 : zone desservie 'non vérifiable publiquement' (adresse à 0 point brut) -> jamais un défaut avéré, même à 0 point", () => {
  // Régression : lorsque scoreLocalisation() renvoie 0 pour l'état "non vérifiable
  // publiquement" (distinct de l'état "incohérent", également à 0 point), la fiche
  // ne doit jamais présenter la zone desservie / l'adresse comme un défaut confirmé.
  const context = createFullPriorityHarness({
    etats: { revendiquee: "conforme", horaires: "conforme", contact: "conforme", attributs: "conforme", adresse: "nonConforme", nap: "conforme", nomConforme: "conforme" },
    nonVerifiablePubliquement: true,
  });
  const constat = context.constatObservePriorite(INFOS_ITEM, { data: {} });
  assert.doesNotMatch(constat, /non conforme|défaut|manquant|absent|corrigée|mérite d.être corrigée/i);
  assert.equal(context.defautsInfos().length, 0);
  assert.equal(context.elementsInfosAConfirmer().includes("adresse"), true);
});

test("Infos 24 : cas réel MK Elec Saint-Léger (score 45/100, PDF de référence) -> attributs seuls cités, zone desservie jamais présentée comme un défaut même à 0 point", () => {
  // Reproduit exactement le cas réel ayant révélé le bug : scoreLocalisation() renvoie 0
  // pour "Non vérifiable publiquement" (et non 1 comme pour l'état "Partielle"), ce qui
  // faisait auparavant tomber "adresse" dans la branche nonConforme et citait à tort
  // "la zone desservie ou l'adresse" dans la troisième priorité.
  const context = createFullPriorityHarness({
    etats: { revendiquee: "conforme", horaires: "conforme", contact: "conforme", attributs: "nonConforme", adresse: "nonConforme", nap: "conforme", nomConforme: "conforme" },
    nonVerifiablePubliquement: true,
  });
  assert.equal(context.titrePriorite(INFOS_ITEM), "Compléter les attributs utiles de votre fiche");
  assert.equal(
    context.constatObservePriorite(INFOS_ITEM, { data: {} }),
    "Certains attributs utiles à votre activité, comme les modalités d'accès ou de paiement lorsqu'elles s'appliquent, ne sont pas renseignés sur votre fiche Google.",
  );
  assert.equal(
    context.recommandationPriorite(INFOS_ITEM, { data: {} }),
    "Vérifier dans votre compte Google Business les attributs réellement applicables à votre activité et compléter ceux qui manquent.",
  );
  assert.equal(context.resultatAttenduPriorite(INFOS_ITEM, { data: {} }), "une fiche plus complète, avec moins d'incertitudes pratiques avant le premier contact.");
  const allTexts = [
    context.titrePriorite(INFOS_ITEM),
    context.constatObservePriorite(INFOS_ITEM, { data: {} }),
    context.consequenceBusinessPriorite(INFOS_ITEM, { data: {} }),
    context.recommandationPriorite(INFOS_ITEM, { data: {} }),
    context.resultatAttenduPriorite(INFOS_ITEM, { data: {} }),
  ].join(" ");
  assert.doesNotMatch(allTexts, /\bhoraires\b|\btéléphone\b|\bsite web\b|zone desservie|cohérence|\badresse\b/i);
});

/* ---------------------------------------------------------------------- */
/* 12) Description absente — jamais "sur votre fiche...sur votre fiche    */
/* Google" ; description présente -> jamais recommandée comme absente     */
/* ---------------------------------------------------------------------- */
const OFFRE_ITEM = { famille: "offre" };
const REPETITION_FICHE = /sur votre fiche[\s\S]{0,80}sur votre fiche google/i;

test("Offre 1 : description absente -> texte exact requis, sans répétition 'sur votre fiche...sur votre fiche Google'", () => {
  const context = createFullPriorityHarness();
  const ctx = { data: { descriptionLongueur: 0 }, recherche: "", entreprise: "" };
  const texte = context.constatObservePriorite(OFFRE_ITEM, ctx);
  assert.match(texte, /^Sur votre fiche, aucune description n’est visible\./);
  assert.doesNotMatch(texte, REPETITION_FICHE);
  assert.doesNotMatch(texte, /sur votre fiche google/i);
  const occurrences = (texte.match(/sur votre fiche/gi) || []).length;
  assert.equal(occurrences, 1, texte);
});

test("Offre 2 : description absente + services absents -> même garde-fou de non-répétition, texte combiné cohérent", () => {
  const context = createFullPriorityHarness();
  const ctx = { data: { descriptionLongueur: 0, nbServices: 0 }, recherche: "électricien Neufchâteau", entreprise: "Computelec" };
  const texte = context.constatObservePriorite(OFFRE_ITEM, ctx);
  // Le fragment "services" utilise une apostrophe droite dans le code source
  // existant ("n'est détaillé") — non réécrit ici, seule la répétition
  // "sur votre fiche...sur votre fiche Google" était dans le périmètre du correctif.
  assert.match(texte, /^Sur votre fiche, aucune description n’est visible et aucun service n'est détaillé\./);
  assert.doesNotMatch(texte, REPETITION_FICHE);
  assert.doesNotMatch(texte, /sur votre fiche google/i);
});

test("Offre 3 : description présente et complète -> jamais présentée comme absente ni recommandée à tort", () => {
  const context = createFullPriorityHarness();
  const ctx = { data: { descriptionLongueur: 650, nbServices: 5 }, recherche: "", entreprise: "" };
  const texte = context.constatObservePriorite(OFFRE_ITEM, ctx);
  assert.doesNotMatch(texte, /aucune description n’est visible/i);
  assert.doesNotMatch(texte, REPETITION_FICHE);
});

test("Offre 4 : description courte (non vide) -> formulation de brièveté, jamais confondue avec l'absence", () => {
  const context = createFullPriorityHarness();
  const ctx = { data: { descriptionLongueur: 120 }, recherche: "", entreprise: "" };
  const texte = context.constatObservePriorite(OFFRE_ITEM, ctx);
  assert.match(texte, /trop courte/i);
  assert.doesNotMatch(texte, /aucune description n’est visible/i);
  assert.doesNotMatch(texte, REPETITION_FICHE);
});

/* ---------------------------------------------------------------------- */
/* 13) Aperçu administrateur et PDF : source unique de rendu               */
/*                                                                          */
/* Les deux corrections éditoriales (avis / description) ci-dessus         */
/* couvrent constatObservePriorite() et consequenceReputation(), qui       */
/* alimentent rendrePriorite() — la seule fonction qui construit les       */
/* cartes de priorités. "Aperçu avant impression" (apercuImpression) et    */
/* le PDF (telechargerPDF / telechargerPDFNatif) appellent tous deux       */
/* genererRapport(), puis capturent ce même DOM avec html2canvas : il      */
/* n'existe pas de second chemin de génération de texte pour le PDF.       */
/* ---------------------------------------------------------------------- */
test("rendu — l'aperçu admin et le PDF partagent la même génération de rapport (aucun chemin narratif distinct)", () => {
  assert.match(html, /async function apercuImpression\(\)\{[\s\S]*?genererRapport\(\)/);
  assert.match(html, /async function telechargerPDF\(\)\{[\s\S]*?genererRapport\(\)/);
  assert.match(html, /async function telechargerPDFNatif\(filename\)\{[\s\S]*?genererRapport\(\)|function telechargerPDFNatif/);

  // telechargerPDF() est la dernière fonction déclarée dans le fichier (elle
  // est suivie directement de la fermeture </script></body></html>) : la
  // borne de fin est donc la fin du script, pas une autre déclaration de fonction.
  const pdfBlock = sliceBetween(html, "async function telechargerPDF(){", "\n</script>");
  // La capture PDF (html2canvas) ne doit reconstruire aucun texte narratif :
  // elle capture le DOM déjà produit par genererRapport() -> rendrePriorite().
  for (const fn of ["constatObservePriorite", "consequenceBusinessPriorite", "consequenceReputation", "rendrePriorite"]) {
    assert.doesNotMatch(pdfBlock, new RegExp(fn), `telechargerPDF ne doit pas appeler ${fn} directement`);
  }
  assert.match(pdfBlock, /html2canvasFn\(page/);
});
