import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { collectPageResultWithIsolatedChrome } from "./chromeHeadlessHarness.js";
const ANALYSIS_ID = "analysis-report-text";
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export async function runAdminBrowserHarness(harnessSource, fixtureOverrides = {}, options = {}) {
  const fixture = {
    analysisId: ANALYSIS_ID,
    context: {
      company: "Entreprise Test",
      city: "Arlon",
      activity: "Électricien",
      scoringVersion: "score-efficia-v5",
      collectionAvailable: false,
      premiumAllowed: false,
    },
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
        "d-zone-pays": "BE",
      },
      observedData: { nbAvis: 5, nbPhotos: 3, note: 4.2, concurrents: [] },
      responses: {},
    },
    overrides: [{ fieldId: "summary.general", customText: "Texte persistant après rechargement", needsReview: false }],
    ...fixtureOverrides,
  };
  const source = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8")
    .replace('<script src="/js/diagnostic-pdf-filename.js?v=1"></script>', `<script>${readFileSync(new URL("../js/diagnostic-pdf-filename.js", import.meta.url), "utf8")}</script>`)
    .replace(
      '<script src="/js/score-efficia-core.js?v=1"></script>',
      `<script>${readFileSync(new URL("../js/score-efficia-core.js", import.meta.url), "utf8")}</script>`,
    )
    .replace(
      '<script src="/js/questionnaire-finalization.js?v=7ee0654"></script>',
      `<script>${readFileSync(new URL("../js/questionnaire-finalization.js", import.meta.url), "utf8")}</script>`,
    )
    .replace(
      '<script src="/src/decision-engine/criteria.catalog.js?v=4"></script>',
      `<script>${readFileSync(new URL("../src/decision-engine/criteria.catalog.js", import.meta.url), "utf8")}</script>`,
    );
  const marker = "<script>\n/* ============ CONFIG SCORE EFFICIA™";
  const fetchFixture = `<script>
    window.__workflowFixture = ${JSON.stringify(fixture).replaceAll("</", "<\\/")};
    window.__workflowFetchCalls = [];
    window.fetch = async (input, options = {}) => {
      const url = String(input);
      window.__workflowFetchCalls.push({ url, method: options.method || "GET", body: options.body || null });
      const json = (body, status = 200) => new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
      });
      if (url.includes("/api/admin/free-diagnostic-context/")) return json({
        success: true,
        context: window.__workflowFixture.context
      });
      if (url.includes("/api/admin/audit-drafts/")) return json({
        success: true,
        ...(function(){
          if((options.method || "GET") === "PUT") {
            const payload = JSON.parse(options.body || "{}");
            window.__workflowFixture.answers = payload.answers || window.__workflowFixture.answers;
          }
          return { draft: {
            reportType: "free",
            currentStep: "questionnaire",
            updatedAt: "2026-08-30T10:00:00.000Z",
            answers: window.__workflowFixture.answers
          }};
        })()
      });
      if (url.includes("/api/admin/report-text-overrides/")) {
        if ((options.method || "GET") === "PUT") {
          const payload = JSON.parse(options.body || "{}");
          const current = new Map((window.__workflowFixture.overrides || []).map(item => [item.fieldId, item]));
          (payload.restoredFieldIds || []).forEach(fieldId => current.delete(fieldId));
          (payload.overrides || []).forEach(item => current.set(item.fieldId, {
            fieldId: item.fieldId,
            customText: item.text,
            automaticText: item.automaticText,
            weeklyReview: item.weeklyReview,
            anomalyCategory: item.anomalyCategory,
            needsReview: false,
          }));
          window.__workflowFixture.overrides = [...current.values()];
        }
        return json({
          success: true,
          catalog: window.__workflowFixture.catalog || [{ id: "summary.general", label: "Synthèse générale", section: "Page 1", maxLength: 380 }],
          overrides: window.__workflowFixture.overrides
        });
      }
      if (url.includes("/api/admin/audit-snapshots/")) return json({ success: true });
      if (url.includes("/admin/tasks/")) return json({ success: true });
      if (url.includes("/api/admin/free-diagnostic-collect/") && window.__workflowFixture.refreshResponse) return json(window.__workflowFixture.refreshResponse);
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
      url: `${pathToFileURL(htmlPath).href}?analysisId=${fixture.analysisId}`,
      profileDir: join(directory, "chrome-profile"),
      phase: "parcours navigateur des textes personnalisés",
      timeout: options.timeout || 15_000,
      resultWait: options.resultWait || 8_000,
      selector: "#workflow-browser-result",
    });
    assert.ok(result, "résultat du parcours navigateur absent");
    return JSON.parse(result);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}


const adminSource = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
export const reviewBenchmarkCode = adminSource.slice(adminSource.indexOf("function statistiquesAvisConcurrents("), adminSource.indexOf("function texteConsultantPage1("));
export const reviewProblemCode = adminSource.slice(adminSource.indexOf("function problemeReputation("), adminSource.indexOf("function premierPasReputation("));
