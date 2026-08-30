import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
const sharedSource = readFileSync(new URL("../js/questionnaire-finalization.js", import.meta.url), "utf8");
const modernSource = readFileSync(new URL("../js/admin-audit-review.js", import.meta.url), "utf8");
const modernHtmlSource = readFileSync(new URL("../functions/admin/audit-review/[analysisId].js", import.meta.url), "utf8");

function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `bloc introuvable : ${start}`);
  return source.slice(from, to);
}

function createElement({ hidden = false } = {}) {
  const classes = new Set();
  const attributes = new Map();
  return {
    hidden,
    classList: {
      add: (value) => classes.add(value),
      remove: (value) => classes.delete(value),
      contains: (value) => classes.has(value),
    },
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: (key) => attributes.delete(key),
    scrollIntoView() {},
    querySelector() { return null; },
  };
}

function createLegacyHarness({ criteria, hidden = [], nonApplicable = [], selected = {}, location = {}, collected = true }) {
  const elements = new Map(criteria.map((criterion) => [criterion.id, createElement()]));
  const locationElement = createElement();
  locationElement.querySelector = () => ({ focus() {} });
  const scoreLive = { textContent: "" };
  const provisional = { hidden: true };
  const counter = { textContent: "" };
  const status = { textContent: "", className: "" };
  const document = {
    getElementById(id) {
      if (id === "score-live") return scoreLive;
      if (id === "score-provisoire") return provisional;
      if (id === "compteur-restant") return counter;
      if (id === "statut") return status;
      if (id === "indicateurs-internes") return { style: {}, innerHTML: "" };
      if (id === "btn-analyser") return createElement();
      if (id.startsWith("crit-")) return elements.get(Number(id.slice(5))) || null;
      return null;
    },
    querySelector(selector) {
      if (selector === "[data-location-criterion]") return locationElement;
      const match = selector.match(/^input\[name="c(\d+)"\]:checked$/);
      return match ? (selected[Number(match[1])] ?? null) : null;
    },
    querySelectorAll(selector) {
      if (selector === ".finalisation-manquante") return [];
      return [];
    },
  };
  const state = {
    mode: location.mode || "unknown",
    address: location.address || "unknown",
    serviceArea: location.serviceArea || "unknown",
  };
  const context = {
    document,
    GRILLE: [{ criteres: criteria }],
    collecteDiagnosticValidee: collected,
    modeLocalisation: () => state.mode,
    reponseAdresse: () => state.address,
    reponseZoneDesserte: () => state.serviceArea,
    critereEstMasque: (criterion) => hidden.includes(criterion.key),
    critereEstNonApplicable: (criterion) => nonApplicable.includes(criterion.key),
    calculScoreDetail: () => ({ total: 42, repondus: 29, totalCrit: 29 }),
    mettreAJourIndicateursInternes() {},
    sauvegarderDiagnostic() {},
    statut(message, type) { status.textContent = message; status.className = type; },
    globalThis: null,
  };
  context.globalThis = context;
  vm.runInNewContext(sharedSource, context);
  context.localisationNonVerifiablePubliquement = () => context.EfficiaQuestionnaireFinalization.hasPubliclyUnverifiableServiceArea({
    locationMode: state.mode,
    serviceAreaVerification: state.serviceArea,
  });
  const listCode = sliceBetween(html, "function listerElementsRestantsPourFinalisation()", "function calc()");
  const calcCode = sliceBetween(html, "function calc()", "function statsScore()");
  const validationCode = sliceBetween(html, "function questionnairePretPourFinalisation()", "function slugPDF(");
  vm.runInNewContext(`${listCode}\n${calcCode}\n${validationCode}\nglobalThis.api={listerElementsRestantsPourFinalisation,calc,questionnairePretPourFinalisation};`, context);
  return { context, state, counter, status, provisional };
}

const relevantCriteria = [
  { id: 8, key: "nomConforme", q: "Conformité du nom de la fiche" },
  { id: 11, key: "photoRecente", q: "Photo récente" },
  { id: 12, key: "varietePhotos", q: "Variété des photos" },
  { id: 13, key: "qualitePhotos", q: "Qualité des photos" },
  { id: 17, key: "tauxReponseAvis", q: "Réponses aux avis" },
  { id: 18, key: "qualiteReponsesAvis", q: "Qualité des réponses" },
  { id: 20, key: "descriptionQualite", q: "Qualité de la description" },
  { id: 22, key: "servicesDecrits", q: "Description des services" },
  { id: 26, key: "rythmePublication", q: "Rythme de publication" },
];

test("le compteur et la validation utilisent la même liste structurée", () => {
  const selected = Object.fromEntries(relevantCriteria.map((criterion) => [criterion.id, { value: "0" }]));
  const harness = createLegacyHarness({ criteria: relevantCriteria, selected, location: { mode: "unknown" } });
  const remaining = harness.context.api.listerElementsRestantsPourFinalisation();
  assert.deepEqual(JSON.parse(JSON.stringify(remaining.map(({ id, type, label, reason }) => ({ id, type, label, reason })))), [{
    id: "locationMode",
    type: "required_context",
    label: "Mode d’activité à confirmer",
    reason: "location_mode_missing",
  }]);
  harness.context.api.calc();
  assert.equal(harness.counter.textContent, "1 élément(s) restant à vérifier");
  assert.equal(harness.context.api.questionnairePretPourFinalisation(), false);
  assert.match(harness.status.textContent, /Mode d’activité à confirmer/);

  harness.state.mode = "storefront";
  harness.state.address = "exact";
  assert.equal(harness.context.api.listerElementsRestantsPourFinalisation().length, 0);
  harness.context.api.calc();
  assert.equal(harness.counter.textContent, "✓ Tous les éléments sont renseignés");
  assert.equal(harness.context.api.questionnairePretPourFinalisation(), true);
});

test("les critères masqués et non applicables ne restent ni comptés ni bloquants", () => {
  const hidden = ["photoRecente", "varietePhotos", "qualitePhotos", "qualiteReponsesAvis", "descriptionQualite", "servicesDecrits", "rythmePublication"];
  const nonApplicable = ["tauxReponseAvis"];
  const harness = createLegacyHarness({
    criteria: relevantCriteria,
    hidden,
    nonApplicable,
    selected: { 8: { value: "0" } },
    location: { mode: "storefront", address: "inaccurate" },
  });
  assert.equal(harness.context.api.listerElementsRestantsPourFinalisation().length, 0);
  harness.context.api.calc();
  assert.equal(harness.counter.textContent, "✓ Tous les éléments sont renseignés");
  assert.equal(harness.context.api.questionnairePretPourFinalisation(), true);
});

test("nomConforme reste obligatoire et une réponse à zéro est valide", () => {
  const criterion = relevantCriteria.filter((item) => item.key === "nomConforme");
  const harness = createLegacyHarness({ criteria: criterion, location: { mode: "storefront", address: "exact" } });
  assert.deepEqual(Array.from(harness.context.api.listerElementsRestantsPourFinalisation(), (item) => item.id), ["nomConforme"]);
  harness.context.document.querySelector = (selector) => selector === 'input[name="c8"]:checked' ? { value: "0" } : (selector === "[data-location-criterion]" ? createElement() : null);
  assert.equal(harness.context.api.listerElementsRestantsPourFinalisation().length, 0);
});

test("une zone non vérifiable est complète, vaut zéro et marque le score provisoire", () => {
  const selected = Object.fromEntries(relevantCriteria.map((criterion) => [criterion.id, { value: "0" }]));
  const harness = createLegacyHarness({
    criteria: relevantCriteria,
    selected,
    location: { mode: "service_area", serviceArea: "not_verifiable" },
  });
  assert.equal(harness.context.api.listerElementsRestantsPourFinalisation().length, 0);
  harness.context.api.calc();
  assert.equal(harness.counter.textContent, "✓ Tous les éléments sont renseignés");
  assert.equal(harness.provisional.hidden, false);
  assert.equal(harness.context.api.questionnairePretPourFinalisation(), true);

  harness.state.serviceArea = "coherent";
  harness.context.api.calc();
  assert.equal(harness.provisional.hidden, true);
});

test("les deux interfaces chargent le moteur commun et ne conservent pas l’ancien calcul divergent", () => {
  assert.match(html, /<script src="\/js\/questionnaire-finalization\.js"><\/script>/);
  assert.match(modernHtmlSource, /<script src="\/js\/questionnaire-finalization\.js"><\/script>/);
  assert.match(html, /const elementsRestants = listerElementsRestantsPourFinalisation\(\)/);
  assert.doesNotMatch(html, /const restant = totalCrit - repondus/);
  assert.match(modernSource, /function listerElementsRestantsPourFinalisation\(\)/);
  assert.doesNotMatch(modernSource, /function incompleteVisibleCriteria\(\)/);
  assert.match(html, /élément\(s\) restant à vérifier/);
  assert.match(html, /Tous les éléments sont renseignés/);
  assert.match(html, /scrollIntoView/);
  assert.match(html, /async function apercuImpression\(\)\{\s*if\(!questionnairePretPourFinalisation\(\)\) return/);
  assert.match(html, /async function telechargerPDF\(\)\{[\s\S]*if\(!questionnairePretPourFinalisation\(\)\) return/);
  assert.match(html, /async function telechargerAuditPremium\(\)\{[\s\S]*if\(!questionnairePretPourFinalisation\(\)\)/);
});

test("un clic PDF complet compose six pages et atteint pdf.save", async () => {
  const downloadCode = sliceBetween(html, "async function telechargerPDF()", "</script>");
  let composed = 0;
  let canvasCalls = 0;
  let savedFilename = "";
  let savedDraft = 0;
  let finalizedSnapshot = 0;
  const pages = Array.from({ length: 6 }, () => ({}));
  class FakePdf {
    constructor() {
      this.pageCount = 1;
      this.internal = { getNumberOfPages: () => this.pageCount };
    }
    addPage() { this.pageCount += 1; }
    addImage() {}
    link() {}
    save(filename) { savedFilename = filename; }
  }
  const buttons = [{ disabled: false, textContent: "Générer le Diagnostic (gratuit)" }];
  const context = {
    document: {
      getElementById(id) {
        if (id === "btn-pdf") return buttons[0];
        if (id === "btn-pdf-rapport") return null;
        if (id === "rapport-contenu") return {};
        return null;
      },
      querySelectorAll(selector) { return selector === "#rapport-contenu .page" ? pages : []; },
    },
    questionnairePretPourFinalisation: () => true,
    assurerVersionAnalyseRapport: async () => true,
    enregistrerBrouillonD1: async () => { savedDraft += 1; return true; },
    chargerLogoRapportDataUrl: async () => {},
    genererRapport: () => { composed += 1; return true; },
    nomFichierDiagnosticPDF: () => "diagnostic-six-pages.pdf",
    dernierNomPdfGenere: "",
    assurerLibrairiesPDF: async () => ({
      jsPDFCtor: FakePdf,
      html2canvasFn: async () => { canvasCalls += 1; return { toDataURL: () => "data:image/jpeg;base64,test" }; },
    }),
    validerMiseEnPageRapport: () => ({ ok: true }),
    waitForReportImages: async () => {},
    ajouterLiensPdfPourPage: () => {},
    finaliserBrouillonD1ApresPDF: async () => { finalizedSnapshot += 1; return true; },
    enregistrerPdfGenereBackOffice: async () => {},
    alert: () => assert.fail("aucune alerte attendue"),
    console,
  };
  vm.runInNewContext(`${downloadCode}\nglobalThis.run=telechargerPDF;`, context);
  await context.run();
  assert.equal(composed, 1);
  assert.equal(canvasCalls, 6);
  assert.equal(savedFilename, "diagnostic-six-pages.pdf");
  assert.equal(savedDraft, 1);
  assert.equal(finalizedSnapshot, 1);
  assert.equal(buttons[0].disabled, false);
});

test("un élément restant bloque le PDF avant toute composition", async () => {
  const downloadCode = sliceBetween(html, "async function telechargerPDF()", "</script>");
  let composed = 0;
  const context = {
    document: { getElementById: () => null },
    questionnairePretPourFinalisation: () => false,
    genererRapport: () => { composed += 1; return true; },
    console,
  };
  vm.runInNewContext(`${downloadCode}\nglobalThis.run=telechargerPDF;`, context);
  await context.run();
  assert.equal(composed, 0);
});

test("le modèle narratif exclut les contradictions avis, top 3, catégorie et zone", () => {
  const helperCode = sliceBetween(html, "function rapportSansAvis()", "function faiblesseChiffree(");
  const selectionCode = sliceBetween(html, '/* ===== Priorit\u00e9 "Informations essentielles"', "function contexteRapport()");
  // etatCritere (utilisé par consequenceReputation/consequencePhotos, appelées
  // depuis consequenceBusinessPriorite ci-dessous) vit plus haut dans le
  // fichier, à côté de critereConfirmeMax : on l'inclut explicitement plutôt
  // que de la réécrire en mock, pour exercer le vrai code de production.
  const etatCritereCode = sliceBetween(html, "function etatCritere(key){", "function elementsIndeterminesPage5(");
  const narrativeCode = sliceBetween(html, "function recommandationPriorite", "function niveauImpactPriorite");
  const state = {
    reviewsPresence: "none",
    position: 2,
    categoryPoints: 4,
    categoryMax: 4,
    publiclyUnverifiable: true,
  };
  const criteriaForCount = [{ id: 7, key: "adresse", max: 2 }];
  // tauxReponseAvis/recenceAvis : par défaut "inconnu" (pas de mock d'id),
  // ajustables via state.reponsesPoints / state.recencePoints pour exercer
  // premierPasReputation / resultatAttenduReputation (evidence-driven :
  // jamais une recommandation sur une insuffisance non étayée).
  state.reponsesPoints = null;
  state.recencePoints = null;
  const criteresById = {
    1: { id: 1, key: "categoriePrincipale", get max() { return state.categoryMax; } },
    2: { id: 2, key: "tauxReponseAvis", max: 3 },
    3: { id: 3, key: "recenceAvis", max: 2 },
  };
  const context = {
    conditionAvis: () => state.reviewsPresence,
    donneesAnalyse: { nbAvis: 0, note: null, position: 2, moyennesConcurrents: {}, concurrence: null },
    estNombre: (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)),
    CRITERE_IDS: { categoriePrincipale: 1, tauxReponseAvis: 2, recenceAvis: 3 },
    trouverCritere: (id) => criteresById[id] || null,
    lirePoints: (id) => {
      if(id === 1) return state.categoryPoints;
      if(id === 2) return state.reponsesPoints;
      if(id === 3) return state.recencePoints;
      return 0;
    },
    modeLocalisation: () => "service_area",
    reponseZoneDesserte: () => state.publiclyUnverifiable ? "not_verifiable" : "coherent",
    critereEstNonVerifiablePubliquement: (criterion) => state.publiclyUnverifiable && criterion?.key === "adresse",
    critereEstMasque: () => false,
    critereEstNonApplicable: () => false,
    GRILLE: [{ criteres: criteriaForCount }],
    CONFIG: { tempsTaches: {} },
    detailsPriorite: (item) => ({ constat: item.critere.key, pourquoi: "Pourquoi", action: "Action", reassurance: "" }),
    actionPhotosPriorite: () => "Ajouter des photos récentes.",
    localisationNonVerifiablePubliquement: () => state.publiclyUnverifiable,
    secteurActiviteNaturel: () => "une intervention",
    fmtNote: (value) => String(value),
    nEntier: (value) => String(Math.round(Number(value))),
    prioritePhotosPorteSurActualite: () => false,
    personaSecteur: () => "un client",
    majusculeInitiale: (value) => value.charAt(0).toUpperCase() + value.slice(1),
    joinFr: (items) => {
      const list = items.filter(Boolean);
      if(!list.length) return "";
      if(list.length === 1) return list[0];
      return `${list.slice(0, -1).join(", ")} et ${list[list.length - 1]}`;
    },
    globalThis: null,
  };
  context.globalThis = context;
  vm.runInNewContext(`${helperCode}\n${etatCritereCode}\n${selectionCode}\n${narrativeCode}\nglobalThis.api={
    FAMILLES_PRIORITES, selectionnerPrioritesDynamiques, actionFamillePriorite,
    recommandationPriorite, beneficePriorite, constatObservePriorite,
    consequenceBusinessPriorite, resultatAttenduPriorite,
    compterElementsAConfirmerRapport, phraseElementsAConfirmer
  };`, context);

  const candidate = (key, max, perdu) => ({ critere: { key, max, q: key }, points: max - perdu, perdu });
  const candidates = [
    candidate("noteMoyenne", 6, 6),
    candidate("volumeAvis", 5, 5),
    candidate("classementLocal", 6, 6),
    candidate("descriptionRemplie", 4, 4),
    candidate("nombrePhotos", 3, 3),
    candidate("horaires", 3, 3),
  ];
  const selected = context.api.selectionnerPrioritesDynamiques(candidates);
  assert.equal(selected.length, 3);
  assert.equal(new Set(selected.map((item) => item.famille)).size, 3);
  assert.equal(selected.every((item) => ["reputation","offre","photos","infos","activite"].includes(item.famille)), true);
  assert.equal(selected.some((item) => item.famille === "visibilite"), false);
  assert.equal(selected.find((item) => item.famille === "reputation")?.critere.key, "noteMoyenne");

  const reputation = selected.find((item) => item.famille === "reputation");
  const reportContext = { activite: "Électricien", data: context.donneesAnalyse, recherche: "Électricien Audun-le-Tiche" };
  const texts = [
    reputation.action,
    context.api.recommandationPriorite(reputation, reportContext),
    context.api.beneficePriorite(reputation, reportContext),
    context.api.constatObservePriorite(reputation, reportContext),
    context.api.consequenceBusinessPriorite(reputation, reportContext),
    context.api.resultatAttenduPriorite(reputation, reportContext),
  ].join(" ");
  assert.match(texts, /premiers avis authentiques/i);
  assert.doesNotMatch(texts, /note moyenne|notes faibles|avis visibles|ne semblent pas recevoir de réponse/i);

  // Correctif ciblé (2026-08-30, PDF admin diagnostic gratuit) : cette
  // recommandation ne doit plus jamais mentionner "les services et le
  // contenu local" (défaut corrigé, voir decisionVisibiliteAdmin() dans
  // admin/free-diagnostic-production/index.html). Dans cet état précis du
  // harnais (catégorie principale conforme : 4/4 ; zone desservie non
  // vérifiable publiquement, donc jamais "à corriger"), le cas retenu est
  // "position" : ni catégorie ni zone ne sont mentionnées, formulation
  // neutre centrée sur l'écart de classement.
  const visibilityFamily = context.api.FAMILLES_PRIORITES.find((item) => item.key === "visibilite");
  const safeVisibilityAction = context.api.actionFamillePriorite(visibilityFamily);
  assert.doesNotMatch(safeVisibilityAction, /catégorie principale|zone desservie|services et le contenu local/i);
  assert.match(safeVisibilityAction, /écarts visibles|mieux positionnées/i);
  const offerPriority = selected.find((item) => item.famille === "offre");
  assert.doesNotMatch(context.api.resultatAttenduPriorite(offerPriority, reportContext), /où vous intervenez|zone/i);

  assert.equal(context.api.compterElementsAConfirmerRapport(), 1);
  assert.equal(context.api.phraseElementsAConfirmer(1), "1 élément reste à confirmer.");
  assert.equal(context.api.phraseElementsAConfirmer(3), "3 éléments restent à confirmer.");

  state.position = 5;
  context.donneesAnalyse.position = 5;
  assert.equal(context.api.selectionnerPrioritesDynamiques(candidates).some((item) => item.famille === "visibilite"), true);

  state.reviewsPresence = "present";
  context.donneesAnalyse.nbAvis = 12;
  context.donneesAnalyse.note = 4.1;
  // Note insuffisante ET absence de réponses avérée (0/3) : la recommandation
  // doit couvrir les deux volets, jamais un seul deviné sans preuve.
  state.reponsesPoints = 0;
  const withReviews = context.api.recommandationPriorite(reputation, reportContext);
  assert.match(withReviews, /répondre aux avis visibles/i);
  assert.match(withReviews, /avis authentiques/i);

  // Réponses non étayées (état "inconnu") : ne jamais deviner une
  // insuffisance de réponses qui n'est pas établie par les données.
  state.reponsesPoints = null;
  const withoutResponseEvidence = context.api.recommandationPriorite(reputation, reportContext);
  assert.doesNotMatch(withoutResponseEvidence, /répondre aux avis visibles/i);

  // recenceAvis conforme (2/2) : jamais une promesse "avis plus récents".
  state.recencePoints = 2;
  const resultatRecenceConforme = context.api.resultatAttenduPriorite(reputation, reportContext);
  assert.doesNotMatch(resultatRecenceConforme, /avis plus récents|davantage d'avis récents/i);

  // recenceAvis insuffisante (0/2) : une formulation liée à la récence peut
  // légitimement apparaître, car cette fois elle est étayée par les données.
  state.recencePoints = 0;
  const resultatRecenceInsuffisante = context.api.resultatAttenduPriorite(reputation, reportContext);
  assert.match(resultatRecenceInsuffisante, /avis plus récents/i);

  assert.match(html, /actionFamillePriorite\(r\.fam, r\)/);
  assert.match(html, /rapportSansAvis\(\).*noteMoyenne.*recenceAvis.*tauxReponseAvis.*qualiteReponsesAvis/s);
});
