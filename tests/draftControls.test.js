import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const legacyHtml = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
const premiumHtml = readFileSync(new URL("../functions/admin/audit-review/[analysisId].js", import.meta.url), "utf8");
const premiumScript = readFileSync(new URL("../js/admin-audit-review.js", import.meta.url), "utf8");

const REQUIRED_STATES = [
  "Modifications non enregistrées",
  "Enregistrement…",
  "Brouillon enregistré à",
  "Échec de l’enregistrement — Réessayer",
];

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `bloc introuvable : ${start}`);
  return source.slice(startIndex, endIndex);
}

function createPremiumHarness(response) {
  const status = { dataset: {}, textContent: "" };
  const button = { disabled: false };
  let scheduled = null;
  let fetchCalls = 0;
  const context = {
    currentAnalysis: { reportType: "premium", manualReview: {} },
    readOnlyMode: false,
    draftSaveInFlight: false,
    draftManualSaveQueued: false,
    draftSaveTimer: null,
    draftStatus: status,
    draftSaveButton: button,
    analysisId: "analysis-test-123",
    collectPayload: () => ({ criteriaReview: [] }),
    redirectToLogin: () => {},
    fetch: async () => { fetchCalls += 1; return response; },
    window: {
      clearTimeout: () => {},
      setTimeout: (callback, delay) => { scheduled = { callback, delay }; return 1; },
    },
    Intl,
    Date,
    encodeURIComponent,
  };
  const code = sliceBetween(premiumScript, "function formatDraftTime", "async function restoreDraft");
  vm.runInNewContext(`${code}\nglobalThis.draftApi = { saveDraft, scheduleDraftSave };`, context);
  return { context, status, button, getFetchCalls: () => fetchCalls, getScheduled: () => scheduled };
}

function createLegacyHarness(response) {
  const status = { dataset: {}, textContent: "" };
  const button = { disabled: false };
  let scheduled = null;
  let fetchCalls = 0;
  const document = { getElementById: (id) => id === "btn-brouillon-d1" ? button : status };
  const context = {
    timerBrouillonD1: null,
    sauvegardeBrouillonD1EnCours: false,
    sauvegardeBrouillonD1Relancee: false,
    auditPublicIdActif: "analysis-test-123",
    modeLectureSeule: () => false,
    analysisIdDepuisUrl: () => "analysis-test-123",
    payloadBrouillonD1: () => ({ responses: {} }),
    fetch: async () => { fetchCalls += 1; return response; },
    document,
    window: {
      location: { href: "" },
      clearTimeout: () => {},
      setTimeout: (callback, delay) => { scheduled = { callback, delay }; return 1; },
    },
    Intl,
    Date,
    encodeURIComponent,
  };
  const stateCode = sliceBetween(legacyHtml, "function majEtatBrouillonD1", "function champsBrouillonD1");
  const saveCode = sliceBetween(legacyHtml, "async function enregistrerBrouillonD1", "async function restaurerBrouillonD1");
  vm.runInNewContext(`${stateCode}\n${saveCode}\nglobalThis.draftApi = { enregistrerBrouillonD1, programmerSauvegardeBrouillonD1 };`, context);
  return { context, status, button, getFetchCalls: () => fetchCalls, getScheduled: () => scheduled };
}

test("les questionnaires gratuit et Premium affichent chacun un contrôle de brouillon persistant", () => {
  const freeToolbar = sliceBetween(legacyHtml, '<div class="score-flottant">', '<div class="conteneur">');
  const prospectCard = sliceBetween(legacyHtml, '<div class="conteneur">', '<div class="carte">\n      <h2 style="margin-bottom:6px">Données observées');
  assert.equal((legacyHtml.match(/id="btn-brouillon-d1"/g) || []).length, 1);
  assert.equal((premiumHtml.match(/data-draft-save/g) || []).length, 1);
  assert.match(freeToolbar, /score-actions[\s\S]*Générer le Diagnostic \(gratuit\)[\s\S]*Aperçu avant impression[\s\S]*Enregistrer le brouillon/);
  assert.match(freeToolbar, /id="statut-brouillon-d1"[\s\S]*role="status" aria-live="polite"/);
  assert.doesNotMatch(prospectCard, /Enregistrer le brouillon|btn-brouillon-d1|statut-brouillon-d1/);
  assert.match(premiumHtml, /audit-draft-toolbar[\s\S]*data-draft-save>Enregistrer le brouillon/);
  assert.match(legacyHtml, /role="status" aria-live="polite"/);
  assert.match(premiumHtml, /role="status" aria-live="polite"/);
});

test("les quatre états accessibles sont implémentés dans les deux questionnaires", () => {
  for (const label of REQUIRED_STATES) {
    assert.ok(legacyHtml.includes(label), `état gratuit absent : ${label}`);
    assert.ok(premiumHtml.includes(label) || premiumScript.includes(label), `état Premium absent : ${label}`);
  }
  assert.match(legacyHtml, /majEtatBrouillonD1\("saving"\)/);
  assert.match(legacyHtml, /majEtatBrouillonD1\("saved", data\.draft\.updatedAt\)/);
  assert.match(legacyHtml, /catch\{\s*majEtatBrouillonD1\("error"\)/);
  assert.match(premiumScript, /setDraftState\("saving"\)/);
  assert.match(premiumScript, /setDraftState\("saved", data\.draft\.updatedAt\)/);
  assert.match(premiumScript, /catch \{\s*setDraftState\("error"\)/);
});

test("le clic manuel et l’autosauvegarde réutilisent la même fonction sans faux succès HTTP", () => {
  assert.match(legacyHtml, /onclick="enregistrerBrouillonD1\(true\)"/);
  assert.match(legacyHtml, /setTimeout\(\(\) => enregistrerBrouillonD1\(false\), 1200\)/);
  assert.match(premiumScript, /draftSaveButton\?\.addEventListener\("click", \(\) => saveDraft\(\{ manual: true \}\)\)/);
  assert.match(premiumScript, /setTimeout\(\(\) => saveDraft\(\), 1200\)/);

  const legacyFailureGuard = legacyHtml.indexOf("if(!response.ok || !data.success) throw new Error(\"draft_save_failed\")");
  const legacySuccess = legacyHtml.indexOf('majEtatBrouillonD1("saved", data.draft.updatedAt)', legacyFailureGuard);
  assert.ok(legacyFailureGuard >= 0 && legacySuccess > legacyFailureGuard);
  const premiumFailureGuard = premiumScript.indexOf('if (!response.ok || !data.success) throw new Error("DRAFT_SAVE_FAILED")');
  const premiumSuccess = premiumScript.indexOf('setDraftState("saved", data.draft.updatedAt)', premiumFailureGuard);
  assert.ok(premiumFailureGuard >= 0 && premiumSuccess > premiumFailureGuard);
});

test("les sauvegardes manuelles et temporisées exécutent réellement le même PUT et reflètent les erreurs HTTP", async () => {
  for (const makeHarness of [createPremiumHarness, createLegacyHarness]) {
    const success = makeHarness({ ok: true, status: 200, json: async () => ({ success: true, draft: { updatedAt: "2026-08-19T18:45:00.000Z" } }) });
    const successApi = success.context.draftApi;
    if (successApi.saveDraft) await successApi.saveDraft({ manual: true });
    else await successApi.enregistrerBrouillonD1(true);
    assert.equal(success.getFetchCalls(), 1);
    assert.equal(success.status.dataset.state, "saved");
    assert.match(success.status.textContent, /^Brouillon enregistré à \d{2}:\d{2}$/);

    if (successApi.scheduleDraftSave) successApi.scheduleDraftSave();
    else successApi.programmerSauvegardeBrouillonD1();
    assert.equal(success.getScheduled().delay, 1200);
    await success.getScheduled().callback();
    assert.equal(success.getFetchCalls(), 2);

    const failure = makeHarness({ ok: false, status: 500, json: async () => ({ success: false }) });
    const failureApi = failure.context.draftApi;
    if (failureApi.saveDraft) await failureApi.saveDraft({ manual: true });
    else await failureApi.enregistrerBrouillonD1(true);
    assert.equal(failure.status.dataset.state, "error");
    assert.equal(failure.status.textContent, "Échec de l’enregistrement — Réessayer");
    assert.equal(failure.button.disabled, false);
  }
});

test("les barres de sauvegarde restent utilisables sur petit écran", () => {
  assert.match(legacyHtml, /@media \(max-width:640px\)[\s\S]*\.score-flottant[\s\S]*\.score-actions[\s\S]*grid-template-columns:1fr/);
  assert.match(legacyHtml, /\.score-actions \.btn:focus-visible/);
  assert.match(premiumHtml, /@media \(max-width: 640px\)[\s\S]*\.audit-draft-toolbar \.admin-button \{ width: 100%; \}/);
});
