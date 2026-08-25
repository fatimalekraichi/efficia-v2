import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyPrimaryCategory,
  classifySecondaryCategories,
} from "../functions/lib/categoryEvidence.js";
import {
  buildFreeDiagnosticCollectionState,
  buildGoogleMapsVerificationLink,
} from "../functions/lib/freeDiagnosticProductionLink.js";
import { buildScorePrefill } from "../functions/lib/score-efficia/scoreCatalog.js";

const html = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
const scoreConfig = readFileSync(new URL("../functions/lib/score-efficia/scoreConfig.js", import.meta.url), "utf8");
const criteriaCatalog = readFileSync(new URL("../functions/lib/score-efficia/criteriaCatalog.js", import.meta.url), "utf8");

function analysis({
  activity = "Électricien",
  category = "Électricien",
  subtypes,
  observedFields = ["category"],
  locationLink = "https://www.google.com/maps/place/Bivert-Alain",
} = {}) {
  const normalized = {
    name: "Bivert Alain",
    place_id: "place-bivert-alain",
    city: "Attert",
    confirmed_activity: activity,
    category,
    location_link: locationLink,
    observed_fields: observedFields,
    ...(subtypes !== undefined ? { subtypes } : {}),
  };
  return {
    business: {
      name: "Bivert Alain",
      ville: "Attert",
      activity: category,
      placeId: "place-bivert-alain",
      normalized,
      fiche: normalized,
      competitors: [],
      searchQuery: "Électricien Attert",
      localPosition: 1,
    },
    benchmark: { averages: {}, gaps: {} },
    timestamps: { updatedAt: "2026-08-25T12:00:00.000Z" },
  };
}

function criterion(prefill, key) {
  return prefill.criteria.find((item) => item.key === key);
}

test("Électricien et Électricien donnent Précise", () => {
  assert.deepEqual(classifyPrimaryCategory("Électricien", "Électricien"), { status: "precise", points: 4 });
});

test("Électricien et Fournisseur d’électricité donnent Inadaptée / générique", () => {
  assert.deepEqual(classifyPrimaryCategory("Électricien", "Fournisseur d’électricité"), { status: "incompatible", points: 0 });
});

test("une catégorie principale absente reste À confirmer", () => {
  const primary = criterion(buildScorePrefill(analysis({ category: "" }), { verifiedCategoryEvidence: true }), "categoriePrincipale");
  assert.equal(primary.value, "not_verified");
  assert.equal(primary.points, null);
  assert.equal(primary.source, "unknown");
});

test("des catégories secondaires pertinentes explicitement retournées donnent Oui", () => {
  const decision = classifySecondaryCategories({
    activity: "Électricien",
    primaryCategory: "Électricien",
    secondaryCategories: ["Électricien", "Service d’installation électrique"],
    availability: "available",
  });
  assert.equal(decision.status, "relevant");
  assert.equal(decision.points, 2);
});

test("une liste secondaire complète mais vide donne Non / incomplètes", () => {
  const secondary = criterion(buildScorePrefill(analysis({ subtypes: [], observedFields: ["category", "subtypes"] }), { verifiedCategoryEvidence: true }), "categoriesSecondaires");
  assert.equal(secondary.label, "Non / incomplètes");
  assert.equal(secondary.points, 0);
});

test("un champ secondaire absent reste À confirmer et jamais Oui", () => {
  const secondary = criterion(buildScorePrefill(analysis(), { verifiedCategoryEvidence: true }), "categoriesSecondaires");
  assert.equal(secondary.value, "not_verified");
  assert.equal(secondary.points, null);
});

test("des catégories secondaires explicitement non pertinentes donnent Non / incomplètes", () => {
  const secondary = criterion(buildScorePrefill(analysis({
    subtypes: ["Électricien", "Plombier"],
    observedFields: ["category", "subtypes"],
  }), { verifiedCategoryEvidence: true }), "categoriesSecondaires");
  assert.equal(secondary.label, "Non / incomplètes");
  assert.equal(secondary.points, 0);
});

test("une réponse manuelle préexistante n’est pas écrasée par une relance", () => {
  assert.match(html, /criteresTouchesManuellement\.has\(criterion\.id\)[\s\S]*manualConflicts\.push/);
  assert.match(html, /saved\.source === "manual" \|\| saved\.statut === "manuelle"/);
});

test("une ancienne réponse automatique de catégorie est recalculée après changement d’activité", () => {
  assert.match(html, /\["classementLocal", "attractiviteConcurrents", "categoriePrincipale", "categoriesSecondaires", "liensAction"\]/);
  assert.match(html, /\(cr\.key === "categoriePrincipale" \|\| cr\.key === "categoriesSecondaires"\) && !savedManual\) return/);
});

test("le bouton utilise prioritairement l’URL exacte Google Maps", () => {
  const link = buildGoogleMapsVerificationLink({
    locationLink: "https://www.google.com/maps/place/Bivert-Alain",
    placeId: "place-bivert-alain",
  });
  assert.equal(link.mode, "exact");
  assert.equal(link.source, "location_link");
  assert.equal(link.url, "https://www.google.com/maps/place/Bivert-Alain");
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
});

test("la recherche Maps de secours est correctement encodée et signalée", () => {
  const link = buildGoogleMapsVerificationLink({ company: "Bivert Alain & Fils", city: "Attert" });
  assert.equal(link.mode, "fallback");
  assert.equal(new URL(link.url).searchParams.get("query"), "Bivert Alain & Fils Attert");
  assert.match(html, /Recherche Maps de secours/);
});

test("les URL dangereuses sont rejetées au profit d’un lien sûr", () => {
  const link = buildGoogleMapsVerificationLink({
    locationLink: "javascript:alert(1)",
    company: "Bivert Alain",
    city: "Attert",
  });
  assert.equal(link.mode, "fallback");
  assert.equal(new URL(link.url).protocol, "https:");
  assert.equal(new URL(link.url).hostname, "www.google.com");
  assert.match(html, /function urlGoogleMapsSure\(value\)/);
});

test("le brouillon conserve la source et les autres réponses", () => {
  assert.match(html, /\{points:p, value:selected\?\.dataset\.special \|\| statutEvaluationCritere\(cr, p\), statut, source,/);
  const apply = html.slice(html.indexOf("function appliquerReponses"), html.indexOf("function donneesIndicateursInternes"));
  assert.doesNotMatch(apply, /delete reponses|reponses\s*=\s*\{\}/);
});

test("les catégories longues restent visibles sans masquage", () => {
  assert.match(html, /\.category-evidence\{[^}]*overflow-wrap:anywhere/);
  assert.doesNotMatch(html, /\.category-evidence\{[^}]*overflow:hidden/);
});

test("le cas Bivert Alain affiche la catégorie observée incompatible et laisse les secondaires À confirmer", () => {
  const state = buildFreeDiagnosticCollectionState(analysis({
    category: "Fournisseur d’électricité",
    observedFields: ["category"],
  }));
  assert.equal(state.business.company, "Bivert Alain");
  assert.equal(state.business.confirmedActivity, "Électricien");
  assert.equal(state.business.observedPrimaryCategory, "Fournisseur d’électricité");
  assert.equal(criterion(state.scorePrefill, "categoriePrincipale").label, "Inadaptée / générique");
  assert.equal(criterion(state.scorePrefill, "categoriesSecondaires").value, "not_verified");
  assert.equal(state.business.mapsVerification.mode, "exact");
});

test("les poids et options du moteur de score restent inchangés", () => {
  assert.match(scoreConfig, /categoriePrincipale:\s*4,\s*categoriesSecondaires:\s*2/);
  assert.match(criteriaCatalog, /opts:\[\["Précise",CONFIG\.poids\.informations\.categoriePrincipale\],\["Approximative",2\],\["Inadaptée \/ générique",0\]\]/);
  assert.match(criteriaCatalog, /opts:\[\["Oui",CONFIG\.poids\.informations\.categoriesSecondaires\],\["Non \/ incomplètes",0\]\]/);
});
