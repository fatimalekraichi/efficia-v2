import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { collectPageResultWithIsolatedChrome } from "./chromeHeadlessHarness.js";

import { createSessionCookie } from "../functions/admin/_shared.js";
import { onRequestPut as putDraft } from "../functions/api/admin/audit-drafts/[draftId].js";
import {
  onRequestGet as getOverrides,
  onRequestPut as putOverrides,
} from "../functions/api/admin/report-text-overrides/[analysisId].js";
import { buildEffectiveDocumentModelFromAnalysis } from "../functions/lib/documentModelFromAnalysis.js";
import {
  REPORT_NARRATIVE_LIMIT_POLICY,
  REPORT_NARRATIVE_TITLE_LIMIT_POLICY,
  REPORT_NARRATIVE_FIELDS,
  applyReportNarrativeOverrides,
  markReportNarrativeOverridesForCurrentContext,
  reportNarrativeTextMaxLength,
  serializeReportNarrativeContext,
} from "../functions/lib/reportNarrativeOverrides.js";
import { renderFreeDiagnosticHtml } from "../functions/lib/renderAnalysisHtml.js";

const SECRET = "report-text-test-secret";
const ANALYSIS_ID = "analysis-report-text";
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const migrations = [
  "0003_analyses.sql",
  "0004_analysis_competitors.sql",
  "0006_analysis_knowledge.sql",
  "0007_analysis_reasoning_composer.sql",
  "0009_manual_review_gate.sql",
  "0010_analysis_report_type.sql",
  "0011_score_efficia_historical.sql",
  "0014_audit_drafts.sql",
  "0015_audit_questionnaire_snapshots.sql",
  "0018_report_narrative_overrides.sql",
];

class LocalD1 {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    migrations.forEach((name) => this.sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8")));
  }

  prepare(sql) {
    const database = this.sqlite;
    const bound = (params = []) => ({
      bind: (...next) => bound(next),
      first: async () => database.prepare(sql).get(...params) || null,
      all: async () => ({ results: database.prepare(sql).all(...params) }),
      run: async () => {
        const result = database.prepare(sql).run(...params);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    });
    return bound();
  }

  async batch(statements) {
    this.sqlite.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

function baseDocumentModel() {
  const priority = (rank) => ({
    rank,
    title: `Priorité ${rank}`,
    observed: `Observation automatique ${rank}`,
    prospectView: `Impact automatique ${rank}`,
    firstAction: `Action automatique ${rank}`,
    expectedResult: `Résultat automatique ${rank}`,
    estimatedTime: "20 minutes",
    impact: "conversion",
  });
  return {
    reportType: "free",
    vocabulary: { reportLabel: "Diagnostic Efficia™" },
    hero: { businessName: "Entreprise Test", category: "Électricien", city: "Arlon", score: 42 },
    executiveSummary: { text: "Synthèse automatique" },
    strengths: [
      { message: "Force automatique 1", title: "Force 1" },
      { message: "Force automatique 2", title: "Force 2" },
    ],
    freeDiagnostic: {
      band: { nom: "À renforcer", couleur: "#d97706", verdict: "Verdict" },
      indices: {},
      domains: [],
      criteriaSummary: { total: 0, totalScored: 0, counts: {}, byDomain: [], summaries: [] },
      priorities: [priority(1), priority(2), priority(3)],
    },
    footer: {},
  };
}

const LONGEST_AUTOMATIC_NARRATIVE_TEXTS = Object.freeze({
  "summary.general": `Bonjour ${"C".repeat(100)},\nLa fiche Google de ${"E".repeat(41)} ne donne pas encore à un client qui la découvre suffisamment de raisons de lui faire confiance. Aujourd'hui, un prospect qui compare des entreprises de ${"V".repeat(120)} découvre une note de 1,8/5 sur 999999 avis, peu de preuves visuelles et un site officiel encore très peu renseigné. Ces éléments peuvent créer un doute au moment de choisir une entreprise comme la vôtre autour de ${"V".repeat(120)}. La situation n'est pas figée. Trois actions ciblées peuvent déjà rendre la fiche plus claire, plus rassurante et plus convaincante.`,
  "weaknesses.summary": "Votre score ne s’explique pas uniquement par un seul point. Plusieurs signaux incomplets s’ajoutent et rendent le choix moins évident pour un nouveau client.",
  "strength.1": `Position 1 sur « ${"R".repeat(55)} » — votre fiche figure dans le top 3 organique, hors annonces sponsorisées.`,
  "strength.2": `Position 1 sur « ${"R".repeat(55)} » — votre fiche figure dans le top 3 organique, hors annonces sponsorisées.`,
  "priority.observation": "Votre entreprise est bien visible sur Google, mais une personne qui clique sur votre site arrive actuellement sur une page d’erreur. Elle peut alors revenir immédiatement aux résultats Google et contacter un concurrent.",
  "priority.impact": "Il peut se demander si le site est encore en construction ou si les informations présentées sont à jour, puis revenir aux résultats Google pour contacter un concurrent.",
  "priority.first_action": "Remplacer le contenu par défaut ou inachevé par une présentation claire de l’entreprise, les services proposés, la zone d’intervention et les coordonnées de contact.",
  "priority.expected_result": "un site à nouveau accessible et cohérent avec la fiche Google, qui ne fait plus perdre de prospects.",
  "priority.title": `Priorité détaillée pour ${"T".repeat(85)}`,
  "priority.action_example": "Bonjour [Prénom], merci d’avoir pris le temps de partager votre expérience. Votre retour est important pour nous. [Ajoutez ensuite une réponse personnelle liée à son commentaire.]",
  "conclusion.commercial": `Vous pouvez appliquer ces trois priorités vous-même, ou confier à Efficia l'ensemble des optimisations de la fiche de ${"E".repeat(180)}.`,
});

function longestAutomaticText(fieldId) {
  if (fieldId.startsWith("priority.")) {
    return LONGEST_AUTOMATIC_NARRATIVE_TEXTS[`priority.${fieldId.split(".").at(-1)}`];
  }
  return LONGEST_AUTOMATIC_NARRATIVE_TEXTS[fieldId];
}

async function runAdminBrowserHarness(harnessSource) {
  const source = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8")
    .replace(
      '<script src="/js/score-efficia-core.js?v=1"></script>',
      `<script>${readFileSync(new URL("../js/score-efficia-core.js", import.meta.url), "utf8")}</script>`,
    )
    .replace(
      '<script src="/js/questionnaire-finalization.js"></script>',
      `<script>${readFileSync(new URL("../js/questionnaire-finalization.js", import.meta.url), "utf8")}</script>`,
    )
    .replace(
      '<script src="/src/decision-engine/criteria.catalog.js?v=4"></script>',
      `<script>${readFileSync(new URL("../src/decision-engine/criteria.catalog.js", import.meta.url), "utf8")}</script>`,
    );
  const marker = "<script>\n/* ============ CONFIG SCORE EFFICIA™";
  const fetchFixture = `<script>
    window.__workflowFetchCalls = [];
    window.fetch = async (input, options = {}) => {
      const url = String(input);
      window.__workflowFetchCalls.push({ url, method: options.method || "GET" });
      const json = (body, status = 200) => new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
      });
      if (url.includes("/api/admin/free-diagnostic-context/")) return json({
        success: true,
        context: {
          company: "Entreprise Test",
          city: "Arlon",
          activity: "Électricien",
          scoringVersion: "score-efficia-v5",
          collectionAvailable: false,
          premiumAllowed: false
        }
      });
      if (url.includes("/api/admin/audit-drafts/")) return json({
        success: true,
        draft: {
          reportType: "free",
          currentStep: "questionnaire",
          updatedAt: "2026-08-30T10:00:00.000Z",
          answers: {
            questionnaireVersion: "score-efficia-questionnaire-v4",
            profileKey: "default",
            fields: {
              "p-entreprise": "Entreprise Test",
              "p-ville": "Arlon",
              "p-activite": "Électricien",
              "p-contact": "Test interne",
              "d-requete": "Électricien Arlon",
              "d-zone-recherche": "Arlon",
              "d-zone-pays": "BE"
            },
            observedData: { nbAvis: 5, nbPhotos: 3, note: 4.2, concurrents: [] },
            responses: {}
          }
        }
      });
      if (url.includes("/api/admin/report-text-overrides/")) return json({
        success: true,
        catalog: [{ id: "summary.general", label: "Synthèse générale", section: "Page 1", maxLength: 380 }],
        overrides: [{ fieldId: "summary.general", customText: "Texte persistant après rechargement", needsReview: false }]
      });
      if (url.includes("/api/admin/free-diagnostic-collect/")) return json({
        success: false,
        error: "SEARCH_REFRESH_FAILED",
        message: "Fixture de relance"
      }, 502);
      return json({ success: false, error: "UNEXPECTED_TEST_REQUEST", url }, 500);
    };
  </script>`;
  const withFetchFixture = source.replace(marker, `${fetchFixture}\n${marker}`);
  const closingBodyIndex = withFetchFixture.lastIndexOf("</body>");
  assert.ok(closingBodyIndex > 0, "balise body finale absente");
  const instrumented = `${withFetchFixture.slice(0, closingBodyIndex)}<output id="workflow-browser-result"></output><script>${harnessSource}</script>${withFetchFixture.slice(closingBodyIndex)}`;
  const directory = mkdtempSync(join(tmpdir(), "efficia-report-workflow-"));
  try {
    const htmlPath = join(directory, "workflow.html");
    writeFileSync(htmlPath, instrumented);
    const result = await collectPageResultWithIsolatedChrome({
      chrome: CHROME,
      url: `${pathToFileURL(htmlPath).href}?analysisId=${ANALYSIS_ID}`,
      profileDir: join(directory, "chrome-profile"),
      phase: "parcours navigateur des textes personnalisés",
      timeout: 15_000,
      selector: "#workflow-browser-result",
    });
    assert.ok(result, "résultat du parcours navigateur absent");
    return JSON.parse(result);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function setup() {
  const db = new LocalD1();
  const now = "2026-08-30T10:00:00.000Z";
  const documentModel = baseDocumentModel();
  db.sqlite.prepare(`
    INSERT INTO analyses (
      analysis_id, nom, ville, query, status, created_at, updated_at, report_type,
      document_model_json
    ) VALUES (?, 'Entreprise Test', 'Arlon', 'électricien Arlon', 'approved', ?, ?, 'free', ?)
  `).run(ANALYSIS_ID, now, now, JSON.stringify(documentModel));
  db.sqlite.prepare(`
    INSERT INTO audit_drafts (
      draft_id, analysis_id, status, report_type, answers_version,
      answers_json, current_step, created_at, updated_at
    ) VALUES (?, ?, 'draft', 'free', 'score-efficia-questionnaire-v4', ?, 'questionnaire', ?, ?)
  `).run(ANALYSIS_ID, ANALYSIS_ID, JSON.stringify({ questionnaireVersion: "score-efficia-questionnaire-v4", responses: {} }), now, now);
  const cookie = (await createSessionCookie({ ADMIN_SESSION_SECRET: SECRET })).split(";")[0];
  return { db, cookie, documentModel };
}

function context(db, cookie, { method = "GET", body = null, authenticated = true } = {}) {
  return {
    request: new Request(`https://local.test/api/admin/report-text-overrides/${ANALYSIS_ID}`, {
      method,
      headers: {
        ...(authenticated ? { Cookie: cookie } : {}),
        ...(body ? { "Content-Type": "application/json", Origin: "https://local.test" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    params: { analysisId: ANALYSIS_ID },
    env: { ADMIN_SESSION_SECRET: SECRET, ORDERS_DB: db },
  };
}

async function saveSummary(db, cookie, text = "Synthèse personnalisée", extra = {}) {
  return putOverrides(context(db, cookie, {
    method: "PUT",
    body: {
      analysisId: ANALYSIS_ID,
      overrides: [{
        fieldId: "summary.general",
        text,
        automaticText: "Synthèse automatique",
        weeklyReview: false,
        anomalyCategory: "autre",
        ...extra,
      }],
      restoredFieldIds: [],
    },
  }));
}

async function saveDraft(db, cookie, responses = {}) {
  return putDraft({
    request: new Request(`https://local.test/api/admin/audit-drafts/${ANALYSIS_ID}`, {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        analysisId: ANALYSIS_ID,
        reportType: "free",
        currentStep: "questionnaire",
        answers: { questionnaireVersion: "score-efficia-questionnaire-v4", responses },
      }),
    }),
    params: { draftId: ANALYSIS_ID },
    env: { ADMIN_SESSION_SECRET: SECRET, ORDERS_DB: db },
  });
}

test("sans remplacement, le modèle et le rendu restent strictement inchangés", () => {
  const model = baseDocumentModel();
  assert.equal(applyReportNarrativeOverrides(model, []), model);
  assert.equal(renderFreeDiagnosticHtml(applyReportNarrativeOverrides(model, [])), renderFreeDiagnosticHtml(model));
});

test("un remplacement autorisé est persisté, relu et signalable pour la revue hebdomadaire", async () => {
  const { db, cookie } = await setup();
  const saved = await saveSummary(db, cookie, "Synthèse éditoriale validée", {
    weeklyReview: true,
    anomalyCategory: "mauvaise adaptation au secteur",
  });
  assert.equal(saved.status, 200);
  const read = await getOverrides(context(db, cookie));
  const body = await read.json();
  assert.equal(body.overrides[0].customText, "Synthèse éditoriale validée");
  assert.equal(body.overrides[0].weeklyReview, true);
  assert.equal(body.overrides[0].anomalyCategory, "mauvaise adaptation au secteur");
  const weekly = db.sqlite.prepare(`
    SELECT a.nom, o.analysis_id, o.field_id, o.automatic_text_snapshot,
           o.custom_text, o.anomaly_category, o.updated_at, o.generator_version
    FROM report_narrative_overrides o
    JOIN analyses a ON a.analysis_id = o.analysis_id
    WHERE o.review_weekly = 1
  `).all();
  assert.equal(weekly.length, 1);
  assert.equal(weekly[0].nom, "Entreprise Test");
});

test("la liste blanche serveur refuse score, faits et structures inattendues", async () => {
  const { db, cookie } = await setup();
  for (const fieldId of ["score.total", "facts.google_rating", "facts.review_count", "facts.local_position", "questionnaire.horaires"]) {
    const unauthorized = await putOverrides(context(db, cookie, {
      method: "PUT",
      body: {
        analysisId: ANALYSIS_ID,
        overrides: [{ fieldId, text: "100", automaticText: "42", weeklyReview: false, anomalyCategory: "autre" }],
        restoredFieldIds: [],
      },
    }));
    assert.equal(unauthorized.status, 403, fieldId);
    assert.equal((await unauthorized.json()).error, "UNAUTHORIZED_FIELD_ID", fieldId);
  }

  const unexpected = await putOverrides(context(db, cookie, {
    method: "PUT",
    body: { analysisId: ANALYSIS_ID, overrides: [], restoredFieldIds: [], score: 100 },
  }));
  assert.equal(unexpected.status, 400);
  assert.equal((await unexpected.json()).error, "INVALID_PAYLOAD_STRUCTURE");
});

test("la limite centralisée ajoute la marge requise à chaque texte automatique et refuse seulement le dépassement réel", async () => {
  const { db, cookie } = await setup();
  const fieldId = "priority.1.observation";
  const automaticText = longestAutomaticText(fieldId);
  const max = reportNarrativeTextMaxLength(fieldId, automaticText);
  const response = await putOverrides(context(db, cookie, {
    method: "PUT",
    body: {
      analysisId: ANALYSIS_ID,
      overrides: [{
        fieldId,
        text: "x".repeat(max + 1),
        automaticText,
        weeklyReview: false,
        anomalyCategory: "autre",
      }],
      restoredFieldIds: [],
    },
  }));
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, "TEXT_TOO_LONG");
  assert.ok(max >= automaticText.length + Math.max(Math.ceil(automaticText.length * .25), 50));
  assert.equal(REPORT_NARRATIVE_LIMIT_POLICY.minimumMaxLength, 400);
});

test("les titres des trois priorités suivent leur plafond éditorial dédié", () => {
  const automaticTitle = longestAutomaticText("priority.1.title");
  const maxLength = reportNarrativeTextMaxLength("priority.1.title", automaticTitle);
  assert.equal(REPORT_NARRATIVE_FIELDS["priority.1.title"].minimumMaxLength, 120);
  assert.equal(REPORT_NARRATIVE_TITLE_LIMIT_POLICY.minimumHeadroom, 25);
  assert.equal(maxLength, Math.max(120, automaticTitle.length + Math.max(Math.ceil(automaticTitle.length * .25), 25)));
});

test("chaque bloc éditable accepte, persiste et recharge son texte automatique le plus long avec une marge supplémentaire", async () => {
  const { db, cookie } = await setup();
  const overrides = Object.keys(REPORT_NARRATIVE_FIELDS).map((fieldId) => {
    const automaticText = longestAutomaticText(fieldId);
    const maxLength = reportNarrativeTextMaxLength(fieldId, automaticText);
    const text = `${automaticText} +`;
    assert.ok(text.length <= maxLength, `${fieldId} doit accepter un texte légèrement plus long que l'automatique`);
    const field = REPORT_NARRATIVE_FIELDS[fieldId];
    assert.ok(maxLength >= automaticText.length + Math.max(Math.ceil(automaticText.length * field.headroomRatio), field.minimumHeadroom), fieldId);
    return { fieldId, text, automaticText, weeklyReview: false, anomalyCategory: "autre" };
  });
  const saved = await putOverrides(context(db, cookie, {
    method: "PUT",
    body: { analysisId: ANALYSIS_ID, overrides, restoredFieldIds: [] },
  }));
  assert.equal(saved.status, 200);
  const reloaded = await (await getOverrides(context(db, cookie))).json();
  assert.equal(reloaded.overrides.length, Object.keys(REPORT_NARRATIVE_FIELDS).length);
  for (const override of overrides) {
    const persisted = reloaded.overrides.find((item) => item.fieldId === override.fieldId);
    assert.equal(persisted?.customText, override.text, `${override.fieldId} doit être identique après rechargement`);
    assert.equal(persisted?.automaticText, override.automaticText, `${override.fieldId} doit conserver son instantané automatique`);
  }
});

test("les titres personnalisés des trois priorités sont persistés, utilisés dans le PDF et restaurables", async () => {
  const { db, cookie, documentModel } = await setup();
  const overrides = [1, 2, 3].map((rank) => ({
    fieldId: `priority.${rank}.title`,
    text: `Titre personnalisé prioritaire ${rank}`,
    automaticText: `Titre automatique prioritaire ${rank}`,
    weeklyReview: false,
    anomalyCategory: "autre",
  }));
  const saved = await putOverrides(context(db, cookie, {
    method: "PUT",
    body: { analysisId: ANALYSIS_ID, overrides, restoredFieldIds: [] },
  }));
  assert.equal(saved.status, 200);
  const reloaded = await (await getOverrides(context(db, cookie))).json();
  assert.deepEqual(reloaded.overrides.map((item) => item.fieldId), overrides.map((item) => item.fieldId));

  const effective = await buildEffectiveDocumentModelFromAnalysis(db, { analysisId: ANALYSIS_ID, documentModel });
  assert.deepEqual(effective.freeDiagnostic.priorities.map((item) => item.title), overrides.map((item) => item.text));
  assert.match(renderFreeDiagnosticHtml(effective), /Titre personnalisé prioritaire 1/);

  const restored = await putOverrides(context(db, cookie, {
    method: "PUT",
    body: { analysisId: ANALYSIS_ID, overrides: [], restoredFieldIds: ["priority.2.title"] },
  }));
  assert.equal(restored.status, 200);
  const newerAutomatic = {
    ...documentModel,
    freeDiagnostic: {
      ...documentModel.freeDiagnostic,
      priorities: documentModel.freeDiagnostic.priorities.map((item) => ({ ...item })),
    },
  };
  newerAutomatic.freeDiagnostic.priorities[1].title = "Titre automatique courant";
  const restoredModel = await buildEffectiveDocumentModelFromAnalysis(db, { analysisId: ANALYSIS_ID, documentModel: newerAutomatic });
  assert.equal(restoredModel.freeDiagnostic.priorities[0].title, "Titre personnalisé prioritaire 1");
  assert.equal(restoredModel.freeDiagnostic.priorities[1].title, "Titre automatique courant");
  assert.equal(applyReportNarrativeOverrides(documentModel, []).freeDiagnostic.priorities[2].title, "Priorité 3");
});

test("le modèle de réponse aux avis universel reste éditable et ne présume pas un avis négatif", () => {
  const universal = LONGEST_AUTOMATIC_NARRATIVE_TEXTS["priority.action_example"];
  const model = applyReportNarrativeOverrides(baseDocumentModel(), [{
    fieldId: "priority.1.action_example",
    customText: universal,
  }]);
  const html = renderFreeDiagnosticHtml(model);
  assert.match(html, /Bonjour \[Prénom\], merci d’avoir pris le temps de partager votre expérience/);
  assert.match(html, /Exemple ou aide d’action/);
  const adminSource = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
  assert.match(adminSource, /Votre retour est important pour nous/);
  assert.doesNotMatch(adminSource, /Nous sommes désolés qu'elle n'ait pas répondu à vos attentes/);
});

test("le benchmark photos affiche Dans la moyenne à l'égalité exacte", () => {
  const source = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
  const match = source.match(/function benchmarkLignes\(\)\{[\s\S]*?\n\}\nfunction benchmarkTableHtml/u);
  assert.ok(match, "benchmarkLignes doit rester une fonction isolée testable");
  const factory = new Function("estNombre", "nEntier", "fmtNote", "donneesAnalyse", `${match[0].replace(/\nfunction benchmarkTableHtml$/u, "")}\nreturn benchmarkLignes();`);
  const lignes = factory(
    (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)),
    (value) => Math.round(Number(value)),
    (value) => String(value),
    { nbPhotos: 19, moyennesConcurrents: { photos: 19 }, concurrence: null },
  );
  assert.equal(lignes.find((item) => item.label === "Photos")?.statut, "Dans la moyenne");
});

test("les textes proches de leur nouvelle limite restent dans les pages PDF 1, 4 et 5 sans franchir le footer", { skip: !existsSync(CHROME), timeout: 45_000 }, async () => {
  const scenarios = [
    ["summary.general", "page 1"],
    ["priority.1.title", "page 4 titre"],
    ["priority.1.observation", "page 4"],
    ["priority.3.title", "page 5 titre"],
    ["priority.3.first_action", "page 5"],
  ];
  for (const [fieldId, pageLabel] of scenarios) {
    const automaticText = longestAutomaticText(fieldId);
    const maxLength = reportNarrativeTextMaxLength(fieldId, automaticText);
    const seed = `OVR-${fieldId} formulation claire et lisible. `;
    const customText = seed.repeat(Math.ceil(maxLength / seed.length)).slice(0, maxLength);
    const report = renderFreeDiagnosticHtml(applyReportNarrativeOverrides(baseDocumentModel(), [{ fieldId, customText }]));
    const instrumented = report.replace("</body>", `<output id="override-layout-result"></output><script>
    addEventListener("load", () => {
      const pages = [...document.querySelectorAll(".page")];
      // Les titres de priorité sont rendus dans un heading ; les inclure
      // permet de vérifier le même garde-fou de pagination que pour les
      // paragraphes et listes personnalisables.
      const editable = [...document.querySelectorAll("p, li, h1, h2, h3")].filter((element) => element.textContent.includes("OVR-"));
      const outside = editable.flatMap((element) => {
        const page = element.closest(".page");
        const footer = page?.querySelector(".doc-footer");
        if (!page || !footer) return [{ reason:"missing-container", text:element.textContent.slice(0, 40) }];
        const rect = element.getBoundingClientRect();
        const pageRect = page.getBoundingClientRect();
        const footerRect = footer.getBoundingClientRect();
        const bad = rect.top < pageRect.top - 0.5
          || rect.left < pageRect.left - 0.5
          || rect.right > pageRect.right + 0.5
          || rect.bottom > footerRect.top - 4;
        return bad ? [{ reason:"outside-safe-area", bottom:rect.bottom, footerTop:footerRect.top, text:element.textContent.slice(0, 40) }] : [];
      });
      document.querySelector("#override-layout-result").textContent = JSON.stringify({ pageCount:pages.length, editableCount:editable.length, outside });
    });
  <\/script></body>`);
    const directory = mkdtempSync(join(tmpdir(), "efficia-report-overrides-layout-"));
    try {
      const htmlPath = join(directory, "maxima.html");
      writeFileSync(htmlPath, instrumented);
      const result = await collectPageResultWithIsolatedChrome({
        chrome: CHROME,
        url: pathToFileURL(htmlPath).href,
        profileDir: join(directory, "chrome-profile"),
        phase: `textes personnalisés / ${pageLabel}`,
        timeout: 15_000,
        selector: "#override-layout-result",
      });
      assert.ok(result, `${pageLabel} : mesures DOM absentes`);
      const layout = JSON.parse(result);
      assert.equal(layout.pageCount, 6, pageLabel);
      assert.ok(layout.editableCount >= 1, `${pageLabel} : bloc personnalisé introuvable dans le PDF`);
      assert.deepEqual(layout.outside, [], pageLabel);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

test("après un rechargement complet, l’éditeur s’ouvre sans génération PDF et affiche les textes persistés", { skip: !existsSync(CHROME), timeout: 25_000 }, async () => {
  const result = await runAdminBrowserHarness(`
    (async () => {
      try {
        for (let attempt = 0; attempt < 50 && !document.getElementById("p-entreprise")?.value; attempt += 1) {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        const opened = await ouvrirEditeurTextesRapport();
        const card = document.querySelector('[data-report-text-field="summary.general"]');
        window.__workflowFetchCalls.length = 0;
        const customText = card?.querySelector("[data-custom-text]");
        customText.value = "Texte persistant après rechargement";
        customText.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 1400));
        document.getElementById("workflow-browser-result").textContent = JSON.stringify({
          opened,
          dialogOpen: document.getElementById("dialog-textes-rapport").open,
          customText: customText?.value || null,
          automaticText: card?.querySelector(".report-text-auto")?.textContent || null,
          reviewBadgeDisplay: getComputedStyle(card?.querySelector("[data-review-badge]")).display,
          pdfRequests: window.__workflowFetchCalls.filter(item => /\\/(?:api\\/)?(?:pdf|render)\\//.test(item.url)).length,
          draftWrites: window.__workflowFetchCalls.filter(item => item.method === "PUT" && item.url.includes("/api/admin/audit-drafts/")).length,
          pageReviewWarning: !document.getElementById("alerte-textes-personnalises").hidden
        });
      } catch (error) {
        document.getElementById("workflow-browser-result").textContent = JSON.stringify({ error: String(error?.stack || error) });
      }
    })();
  `);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.opened, true);
  assert.equal(result.dialogOpen, true);
  assert.equal(result.customText, "Texte persistant après rechargement");
  assert.match(result.automaticText, /Texte automatique/);
  assert.equal(result.reviewBadgeDisplay, "none");
  assert.equal(result.pdfRequests, 0);
  assert.equal(result.draftWrites, 0);
  assert.equal(result.pageReviewWarning, false);
});

test("un clic réel sur la relance concurrentielle appelle exactement une fois l’endpoint existant", { skip: !existsSync(CHROME), timeout: 25_000 }, async () => {
  const result = await runAdminBrowserHarness(`
    (async () => {
      try {
        for (let attempt = 0; attempt < 50 && !document.getElementById("d-requete")?.value; attempt += 1) {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        document.getElementById("btn-relancer-recherche").click();
        await new Promise(resolve => setTimeout(resolve, 100));
        document.getElementById("workflow-browser-result").textContent = JSON.stringify({
          calls: window.__workflowFetchCalls.filter(item => item.url.includes("/api/admin/free-diagnostic-collect/")),
          buttonText: document.getElementById("btn-relancer-recherche").textContent
        });
      } catch (error) {
        document.getElementById("workflow-browser-result").textContent = JSON.stringify({ error: String(error?.stack || error) });
      }
    })();
  `);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].method, "POST");
  assert.match(result.calls[0].url, new RegExp(`/api/admin/free-diagnostic-collect/${ANALYSIS_ID}$`));
  assert.equal(result.buttonText, "Relancer l’analyse sur cette recherche");
});

test("le HTML ou JavaScript personnalisé est rendu comme texte échappé", () => {
  const model = applyReportNarrativeOverrides(baseDocumentModel(), [{
    fieldId: "summary.general",
    customText: "<script>alert(1)</script>",
  }]);
  const html = renderFreeDiagnosticHtml(model);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test("l’aperçu et le PDF serveur utilisent la même construction effective", async () => {
  const { db, cookie, documentModel } = await setup();
  assert.equal((await saveSummary(db, cookie)).status, 200);
  const analysis = { analysisId: ANALYSIS_ID, documentModel };
  const effective = await buildEffectiveDocumentModelFromAnalysis(db, analysis);
  const html = renderFreeDiagnosticHtml(effective);
  assert.match(html, /Synthèse personnalisée/);

  const previewSource = readFileSync(new URL("../functions/api/render/_shared.js", import.meta.url), "utf8");
  const pdfSource = readFileSync(new URL("../functions/api/pdf/_shared.js", import.meta.url), "utf8");
  assert.match(previewSource, /buildEffectiveDocumentModelFromAnalysis\(db, analysis\)/);
  assert.match(pdfSource, /buildEffectiveDocumentModelFromAnalysis\((db|verified\.db), analysis\)/);
});

test("une régénération conserve le remplacement et la restauration réactive l’automatique actuel", async () => {
  const { db, cookie, documentModel } = await setup();
  assert.equal((await saveSummary(db, cookie)).status, 200);
  const first = await buildEffectiveDocumentModelFromAnalysis(db, { analysisId: ANALYSIS_ID, documentModel });
  const second = await buildEffectiveDocumentModelFromAnalysis(db, { analysisId: ANALYSIS_ID, documentModel });
  assert.equal(first.executiveSummary.text, "Synthèse personnalisée");
  assert.equal(second.executiveSummary.text, "Synthèse personnalisée");

  const restored = await putOverrides(context(db, cookie, {
    method: "PUT",
    body: { analysisId: ANALYSIS_ID, overrides: [], restoredFieldIds: ["summary.general"] },
  }));
  assert.equal(restored.status, 200);
  const newerAutomatic = { ...documentModel, executiveSummary: { text: "Nouvelle synthèse automatique" } };
  const effective = await buildEffectiveDocumentModelFromAnalysis(db, { analysisId: ANALYSIS_ID, documentModel: newerAutomatic });
  assert.equal(effective.executiveSummary.text, "Nouvelle synthèse automatique");
});

test("le contexte narratif canonique ignore l’ordre des clés et les métadonnées de génération", async () => {
  assert.equal(
    serializeReportNarrativeContext({ b: 2, a: { y: 2, x: 1 } }),
    serializeReportNarrativeContext({ a: { x: 1, y: 2 }, b: 2 }),
  );
  const { db, cookie } = await setup();
  assert.equal((await saveSummary(db, cookie)).status, 200);
  db.sqlite.prepare("UPDATE analyses SET status = 'pdf_generated', updated_at = ? WHERE analysis_id = ?")
    .run("2026-08-30T11:00:00.000Z", ANALYSIS_ID);
  await markReportNarrativeOverridesForCurrentContext(db, ANALYSIS_ID);
  const body = await (await getOverrides(context(db, cookie))).json();
  assert.equal(body.overrides[0].needsReview, false);
  assert.equal(body.overrides[0].customText, "Synthèse personnalisée");
});

test("un rechargement et un GET identique ne marquent jamais le texte À revérifier", async () => {
  const { db, cookie } = await setup();
  assert.equal((await saveSummary(db, cookie)).status, 200);
  for (let reload = 0; reload < 2; reload += 1) {
    const body = await (await getOverrides(context(db, cookie))).json();
    assert.equal(body.overrides[0].needsReview, false);
    assert.equal(body.overrides[0].customText, "Synthèse personnalisée");
  }
});

test("une sauvegarde de brouillon métier identique laisse needs_review à faux", async () => {
  const { db, cookie } = await setup();
  assert.equal((await saveSummary(db, cookie)).status, 200);
  assert.equal((await saveDraft(db, cookie, {})).status, 200);
  const body = await (await getOverrides(context(db, cookie))).json();
  assert.equal(body.overrides[0].needsReview, false);
  assert.equal(body.overrides[0].customText, "Synthèse personnalisée");
});

test("une modification du questionnaire conserve les textes et les marque À revérifier", async () => {
  const { db, cookie } = await setup();
  assert.equal((await saveSummary(db, cookie)).status, 200);
  const draftResponse = await saveDraft(db, cookie, { horaires: { points: 0 } });
  assert.equal(draftResponse.status, 200);
  const body = await (await getOverrides(context(db, cookie))).json();
  assert.equal(body.overrides[0].customText, "Synthèse personnalisée");
  assert.equal(body.overrides[0].needsReview, true);
});

test("une relance concurrentielle conserve les textes et les marque À revérifier", async () => {
  const { db, cookie } = await setup();
  assert.equal((await saveSummary(db, cookie)).status, 200);
  db.sqlite.prepare("UPDATE analyses SET search_query = ? WHERE analysis_id = ?")
    .run("électricien Bruxelles", ANALYSIS_ID);
  await markReportNarrativeOverridesForCurrentContext(db, ANALYSIS_ID);
  const body = await (await getOverrides(context(db, cookie))).json();
  assert.equal(body.overrides[0].customText, "Synthèse personnalisée");
  assert.equal(body.overrides[0].needsReview, true);
  const refreshSource = readFileSync(new URL("../functions/api/admin/free-diagnostic-collect/[analysisId].js", import.meta.url), "utf8");
  assert.match(refreshSource, /markReportNarrativeOverridesForCurrentContext\(db, analysisId\)/);
});

test("la route conserve l’authentification admin et la protection same-origin", async () => {
  const { db, cookie } = await setup();
  assert.equal((await getOverrides(context(db, cookie, { authenticated: false }))).status, 401);
  const request = context(db, cookie, {
    method: "PUT",
    body: { analysisId: ANALYSIS_ID, overrides: [], restoredFieldIds: [] },
  });
  request.request = new Request(request.request.url, {
    method: "PUT",
    headers: { Cookie: cookie, "Content-Type": "application/json", Origin: "https://evil.test" },
    body: JSON.stringify({ analysisId: ANALYSIS_ID, overrides: [], restoredFieldIds: [] }),
  });
  assert.equal((await putOverrides(request)).status, 403);
});

test("le back-office expose uniquement l’éditeur narratif et l’avertissement de revérification", () => {
  const html = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
  assert.match(html, /✏️ Modifier les textes du rapport/);
  assert.match(html, /Certaines données ont changé\. Vérifiez les textes personnalisés avant de générer le rapport\./);
  assert.match(html, /Copier le texte automatique/);
  assert.match(html, /Supprimer la personnalisation/);
  assert.match(html, /Ajouter aux problèmes à examiner cette semaine/);
  assert.doesNotMatch(html, /data-report-text-field="score|data-report-text-field="rating|data-report-text-field="reviews/);
});
