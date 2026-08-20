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
  const counter = { textContent: "" };
  const status = { textContent: "", className: "" };
  const document = {
    getElementById(id) {
      if (id === "score-live") return scoreLive;
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
    calculScoreDetail: () => ({ total: 42, repondus: 0, totalCrit: 29 }),
    mettreAJourIndicateursInternes() {},
    sauvegarderDiagnostic() {},
    statut(message, type) { status.textContent = message; status.className = type; },
    globalThis: null,
  };
  context.globalThis = context;
  vm.runInNewContext(sharedSource, context);
  const listCode = sliceBetween(html, "function listerElementsRestantsPourFinalisation()", "function calc()");
  const calcCode = sliceBetween(html, "function calc()", "function statsScore()");
  const validationCode = sliceBetween(html, "function questionnairePretPourFinalisation()", "function slugPDF(");
  vm.runInNewContext(`${listCode}\n${calcCode}\n${validationCode}\nglobalThis.api={listerElementsRestantsPourFinalisation,calc,questionnairePretPourFinalisation};`, context);
  return { context, state, counter, status };
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
  let deletedDraft = 0;
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
    supprimerBrouillonD1ApresFinalisation: async () => { deletedDraft += 1; },
    enregistrerPdfGenereBackOffice: async () => {},
    alert: () => assert.fail("aucune alerte attendue"),
    console,
  };
  vm.runInNewContext(`${downloadCode}\nglobalThis.run=telechargerPDF;`, context);
  await context.run();
  assert.equal(composed, 1);
  assert.equal(canvasCalls, 6);
  assert.equal(savedFilename, "diagnostic-six-pages.pdf");
  assert.equal(deletedDraft, 1);
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
