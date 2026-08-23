import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { renderFreeDiagnosticPdfById, renderPdfById } from "../functions/api/pdf/_shared.js";
import { addPreviewToolbar, buildAuditPdfFilename, buildControlPdfTitle } from "../functions/lib/pdfRenderer.js";
import { createSessionCookie } from "../functions/admin/_shared.js";

const TOKEN = "test-token";
const ADMIN_SECRET = "admin-secret";
const ADMIN_COOKIE = (await createSessionCookie({ ADMIN_SESSION_SECRET: ADMIN_SECRET })).split(";")[0];
const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\n%Efficia test\n");

const analysisRow = {
  analysis_id: "analysis-1",
  status: "approved",
  nom: "Garage Étoile & Fils",
  ville: "Arlon / Belgique",
  activity: "garage",
  name: "Garage Étoile & Fils",
  rating: 4.6,
  reviews: 42,
  photos_count: 18,
  competitors_json: JSON.stringify([]),
  benchmark_score: 82,
  knowledge_json: JSON.stringify({
    version: "1.0.0",
    summary: "Résumé de test.",
    strengths: [],
    weaknesses: [],
    opportunities: [],
    top_priorities: [],
  }),
  created_at: "2026-07-24T07:00:00.000Z",
  report_type: "premium",
};

function makeContext({ row = analysisRow, token = TOKEN, env = {}, draft = undefined, paid = true, manual = false } = {}) {
  let storedSnapshot = null;
  const storedDraft = draft === undefined && row ? {
    draft_id: "analysis-1",
    analysis_id: "analysis-1",
    report_type: "premium",
    answers_version: "score-efficia-questionnaire-v4",
    answers_json: JSON.stringify({
      questionnaireVersion: "score-efficia-questionnaire-v4",
      reportType: "premium",
      criteriaReview: [{ key: "horaires", value: "compliant", checklist: ["Horaires vérifiés"] }],
    }),
    current_step: "questionnaire",
  } : draft;
  const db = {
    prepare(sql) {
      const bound = (params = []) => ({
        bind(...next) { return bound(next); },
            async first() {
              if (sql.includes("JOIN orders")) {
                return paid ? { order_id: "order-1", status: "paid", offer_code: "audit", has_authorized_item: 1 } : null;
              }
              if (sql.includes("FROM order_tasks")) return null;
              if (sql.includes("audit_creation_metadata")) {
                return manual ? {
                  analysis_id: row.analysis_id,
                  creation_source: "admin_manual",
                  audit_type: "premium",
                  billing_status: "manual_unpaid",
                  request_status: "completed",
                } : null;
              }
              if (sql.includes("FROM audit_questionnaire_snapshots")) return storedSnapshot;
              if (sql.includes("FROM audit_drafts")) return storedDraft;
              return row;
            },
            async run() {
              if (sql.includes("INSERT OR IGNORE INTO audit_questionnaire_snapshots") && !storedSnapshot) {
                storedSnapshot = {
                  snapshot_id: params[0],
                  analysis_id: params[1],
                  source_draft_id: params[2],
                  report_type: params[3],
                  answers_version: params[4],
                  answers_json: params[5],
                  current_step: params[6],
                  pdf_filename: params[7],
                  finalized_at: params[8],
                };
              }
              return { success: true, meta: { changes: 1 } };
            },
      });
      return bound();
    },
    async batch(statements) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  };

  const headers = token ? { Authorization: `Bearer ${token}`, Cookie: ADMIN_COOKIE } : {};
  return {
    request: new Request("http://local.test/api/pdf/analysis-1", { headers }),
    params: { analysisId: "analysis-1" },
    env: {
      CONNECTOR_TOKEN: TOKEN,
      ADMIN_SESSION_SECRET: ADMIN_SECRET,
      ORDERS_DB: db,
      CLOUDFLARE_ACCOUNT_ID: "account-test",
      BROWSER_RENDERING_API_TOKEN: "browser-token-test",
      ...env,
    },
  };
}

test("renderPdfById retourne 401 si le token est absent", async () => {
  const response = await renderPdfById(makeContext({ token: "" }), "analysis-1");
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(json, { success: false, error: "Unauthorized." });
});

test("renderPdfById retourne 404 si l'analyse n'existe pas", async () => {
  const response = await renderPdfById(makeContext({ row: null }), "analysis-missing");
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(json, { success: false, error: "Analysis not found." });
});

test("renderPdfById refuse la génération avant approbation", async () => {
  const response = await renderPdfById(makeContext({
    row: {
      ...analysisRow,
      status: "preview_ready",
    },
  }), "analysis-1");
  const json = await response.json();

  assert.equal(response.status, 409);
  assert.equal(json.error, "REPORT_NOT_APPROVED");
});

test("renderPdfById refuse une analyse chargée avec un analysisId discordant", async () => {
  const response = await renderPdfById(makeContext({
    row: { ...analysisRow, analysis_id: "analysis-other" },
  }), "analysis-1");

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { success: false, error: "ANALYSIS_ID_MISMATCH" });
});

test("le PDF serveur non configuré renvoie uniquement un code stable et une référence non sensible", async () => {
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args.join(" "));
  try {
    const response = await renderPdfById(makeContext({
      env: { CLOUDFLARE_ACCOUNT_ID: "", BROWSER_RENDERING_API_TOKEN: "" },
    }), "analysis-1");
    const body = await response.json();

    assert.equal(response.status, 501);
    assert.equal(body.error, "PDF_RENDERER_NOT_CONFIGURED");
    assert.match(body.reference, /^[0-9a-f-]{36}$/i);
    assert.doesNotMatch(body.message, /CLOUDFLARE_ACCOUNT_ID|BROWSER_RENDERING_API_TOKEN/);
    assert.match(logs.join("\n"), /PDF_RENDERER_NOT_CONFIGURED/);
  } finally {
    console.error = originalError;
  }
});

test("renderPdfById retourne un PDF et un nom de fichier nettoyé", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /browser-rendering\/pdf$/);
    assert.equal(init.method, "POST");
    assert.equal(init.headers.Authorization, "Bearer browser-token-test");
    assert.match(init.body, /Garage Étoile &amp; Fils/);
    return new Response(PDF_BYTES, {
      status: 200,
      headers: { "Content-Type": "application/pdf" },
    });
  };

  try {
    const response = await renderPdfById(makeContext(), "analysis-1");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const signature = new TextDecoder().decode(bytes.slice(0, 5));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "application/pdf");
    assert.match(
      response.headers.get("Content-Disposition"),
      /attachment; filename="Audit-Efficia-Premium_Garage-Etoile-Fils_Arlon-Belgique_\d{4}-\d{2}-\d{2}\.pdf"/,
    );
    assert.equal(signature, "%PDF-");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("PDF Premium manuel : même identité que l’aperçu et aucune déduction inventée", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    assert.match(init.body, /Audit Efficia Premium/);
    assert.match(init.body, /Audit Google Business/);
    assert.doesNotMatch(init.body, /99 € déjà investis/);
    assert.doesNotMatch(init.body, /intégralement déduits/);
    assert.doesNotMatch(init.body, /Diagnostic Efficia™/);
    return new Response(PDF_BYTES, { status: 200, headers: { "Content-Type": "application/pdf" } });
  };

  try {
    const response = await renderPdfById(makeContext({ paid: false, manual: true }), "analysis-1");
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("renderPdfById refuse un appel direct Premium sans paiement lié", async () => {
  const context = makeContext();
  context.env.ORDERS_DB.prepare = (sql) => ({
    bind: () => ({
      first: async () => sql.includes("JOIN orders") ? null : analysisRow,
      run: async () => ({ success: true }),
    }),
  });
  const response = await renderPdfById(context, "analysis-1");
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { success: false, error: "PREMIUM_NOT_AUTHORIZED" });
});

test("le générateur Diagnostic gratuit refuse une analyse Premium côté serveur", async () => {
  const response = await renderFreeDiagnosticPdfById(makeContext(), "analysis-1");
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    success: false,
    error: "FREE_DIAGNOSTIC_REQUIRED",
  });
});

test("la barre d’aperçu restitue l’erreur structurée dans la page", () => {
  const html = addPreviewToolbar("<!doctype html><html><body></body></html>", "analysis-1", "preview_ready");
  assert.match(html, /data-efficia-approval-status/);
  assert.match(html, /await approvalResponse\.json\(\)/);
  assert.match(html, /Référence/);
  assert.doesNotMatch(html, /alert\(/);
});

function premiumControlToolbar(status = "preview_ready", requestedAnalysisId = "analysis-1") {
  return addPreviewToolbar(
    "<!doctype html><html><head><title>Titre initial</title></head><body><main class=\"report-shell\"><section class=\"page\"></section><section class=\"page\"></section></main></body></html>",
    "analysis-1",
    status,
    {
      reportType: "premium",
      requestedAnalysisId,
      controlPdfTitle: "CONTROLE-NON-APPROUVE_Audit-Efficia_ME-ELEC_Arlon_2026-08-23.pdf",
    },
  );
}

test("la barre d’aperçu permet un PDF de contrôle uniquement sur le Premium préparé et le bon analysisId", () => {
  const html = premiumControlToolbar();

  assert.match(html, /<button[^>]+data-efficia-control-pdf[^>]*>Exporter le PDF de contrôle<\/button>/);
  assert.doesNotMatch(html, /data-efficia-control-pdf[^>]+disabled/);
  assert.match(html, /data-efficia-approve-and-download="analysis-1"[^>]*>Approuver et télécharger le PDF final<\/button>/);
  assert.match(html, /Retourner aux modifications/);
  assert.doesNotMatch(html, />Approuver le rapport<\/button>/);
  assert.doesNotMatch(html, />Générer le PDF<\/a>/);
  assert.match(html, /DOCUMENT DE CONTRÔLE — NON APPROUVÉ/);
  assert.match(html, /Version de contrôle destinée à la vérification interne\. Ne pas transmettre au client\./);

  assert.doesNotMatch(premiumControlToolbar("awaiting_review"), /<button[^>]+data-efficia-control-pdf/);
  assert.doesNotMatch(premiumControlToolbar("approved"), /<button[^>]+data-efficia-control-pdf/);
  assert.doesNotMatch(premiumControlToolbar("preview_ready", "analysis-other"), /<button[^>]+data-efficia-control-pdf/);
  assert.doesNotMatch(addPreviewToolbar("<html><body></body></html>", "analysis-1", "preview_ready", {
    reportType: "free",
    requestedAnalysisId: "analysis-1",
  }), /<button[^>]+data-efficia-control-pdf/);
});

test("le clic de contrôle appelle uniquement window.print et restaure le titre initial", async () => {
  const html = premiumControlToolbar();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  const listeners = [];
  const printedTitles = [];
  let networkCalls = 0;
  const document = {
    title: "Titre initial",
    documentElement: { dataset: {} },
    addEventListener(_type, listener) { listeners.push(listener); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  const button = {
    dataset: {
      efficiaControlTitle: "CONTROLE-NON-APPROUVE_Audit-Efficia_ME-ELEC_Arlon_2026-08-23.pdf",
    },
  };
  const event = {
    target: {
      closest(selector) {
        return selector === "[data-efficia-control-pdf]" ? button : null;
      },
    },
  };
  const window = { print() { printedTitles.push(document.title); }, location: { reload() {} } };

  vm.runInNewContext(script, {
    document,
    window,
    fetch() { networkCalls += 1; throw new Error("network call forbidden"); },
  });
  for (const listener of listeners) await listener(event);

  assert.deepEqual(printedTitles, ["CONTROLE-NON-APPROUVE_Audit-Efficia_ME-ELEC_Arlon_2026-08-23.pdf"]);
  assert.equal(document.title, "Titre initial");
  assert.equal(networkCalls, 0);
});

test("le marquage de contrôle est répété à l’impression et disparaît totalement après approbation", () => {
  const controlHtml = premiumControlToolbar();
  const approvedHtml = premiumControlToolbar("approved");

  assert.match(controlHtml, /@media print/);
  assert.match(controlHtml, /@media print \{[\s\S]*?\.efficia-control-print-watermark \{[\s\S]*?position: absolute;[\s\S]*?top: 2mm;/);
  assert.match(controlHtml, /\.report-shell \.page:first-child > \.efficia-control-print-watermark \{[\s\S]*?position: relative;[\s\S]*?margin: 0 0 7mm auto;/);
  assert.match(controlHtml, /\.efficia-control-print-notice \{[\s\S]*?margin: 0 0 5mm;/);
  assert.match(controlHtml, /<section class="page">\s*<div class="efficia-control-print-watermark"[^>]*>DOCUMENT DE CONTRÔLE — NON APPROUVÉ<\/div>\s*<p class="efficia-control-print-notice">Version de contrôle/);
  assert.equal((controlHtml.match(/class="efficia-control-print-notice"/g) || []).length, 1);
  assert.equal((controlHtml.match(/class="efficia-control-print-watermark"/g) || []).length, 2);
  assert.doesNotMatch(controlHtml, /page:first-child::before/);
  assert.match(controlHtml, /@media screen and \(max-width: 600px\)[\s\S]*?\.efficia-preview-toolbar \{[\s\S]*?width: 100vw;/);
  assert.match(controlHtml, /\.report-shell,[\s\S]*?\.report-shell \.page \{[\s\S]*?width: 100% !important;/);
  assert.match(controlHtml, /\.efficia-control-print-watermark \{[\s\S]*?max-width: calc\(100% - 16px\);/);
  assert.match(controlHtml, /class="efficia-preview-toolbar no-print"/);
  assert.doesNotMatch(approvedHtml, /DOCUMENT DE CONTRÔLE — NON APPROUVÉ/);
  assert.doesNotMatch(approvedHtml, /Version de contrôle destinée/);
  assert.doesNotMatch(approvedHtml, /<p class="efficia-control-print-notice">/);
  assert.match(approvedHtml, /data-efficia-approval-complete="true"[^>]*>Télécharger à nouveau le PDF final<\/button>/);
});

function combinedApprovalHarness({ approvalOk = true, pdfAttempts = [true], printThrows = false } = {}) {
  const html = premiumControlToolbar();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  const listeners = [];
  const status = { textContent: "" };
  const downloads = [];
  const printedTitles = [];
  const removed = [];
  const calls = [];
  let pdfIndex = 0;
  const button = {
    disabled: false,
    textContent: "Approuver et télécharger le PDF final",
    dataset: {
      efficiaApproveAndDownload: "analysis-1",
      efficiaApprovalComplete: "false",
      efficiaFinalPrintFallback: "false",
      efficiaFinalTitle: "Audit-Efficia-Premium_ME-ELEC_Arlon_2026-08-23.pdf",
    },
  };
  const present = new Set(["control-button", "return-link", "watermark", "notice"]);
  const removable = (name) => ({ remove() { present.delete(name); removed.push(name); } });
  const controlButton = removable("control-button");
  const returnLink = removable("return-link");
  const watermark = removable("watermark");
  const notice = removable("notice");
  const document = {
    title: "Titre initial",
    documentElement: { dataset: {} },
    body: { appendChild() {} },
    addEventListener(_type, listener) { listeners.push(listener); },
    querySelector(selector) {
      if (selector === "[data-efficia-approval-status]") return status;
      if (selector === "[data-efficia-control-pdf]") return present.has("control-button") ? controlButton : null;
      if (selector === "[data-efficia-return-modifications]") return present.has("return-link") ? returnLink : null;
      return null;
    },
    querySelectorAll(selector) {
      return selector === ".efficia-control-print-watermark, .efficia-control-print-notice"
        ? [present.has("watermark") ? watermark : null, present.has("notice") ? notice : null].filter(Boolean)
        : [];
    },
    createElement() {
      return {
        click() { downloads.push(this.download); },
        remove() {},
      };
    },
  };
  const event = {
    target: {
      closest(selector) {
        return selector === "[data-efficia-approve-and-download]" ? button : null;
      },
    },
  };
  const fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.startsWith("/api/admin/")) {
      return new Response(JSON.stringify(approvalOk
        ? { success: true, status: "approved" }
        : { success: false, error: "AUDIT_APPROVAL_FAILED", reference: "11111111-1111-4111-8111-111111111111" }), {
        status: approvalOk ? 200 : 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    const attempt = pdfAttempts[Math.min(pdfIndex++, pdfAttempts.length - 1)];
    if (attempt === true) {
      return new Response(new Uint8Array([37, 80, 68, 70]), { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=Audit-Efficia-Test.pdf" } });
    }
    if (attempt && typeof attempt === "object") {
      const body = attempt.invalidJson ? "not-json" : JSON.stringify({ success: false, error: attempt.error, message: attempt.message });
      return new Response(body, { status: attempt.status, headers: { "Content-Type": attempt.invalidJson ? "text/plain" : "application/json" } });
    }
    return new Response(JSON.stringify({ success: false, message: "PDF indisponible" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  };
  const sandboxUrl = { createObjectURL: () => "blob:pdf", revokeObjectURL() {} };
  vm.runInNewContext(script, {
    document,
    window: {
      print() {
        printedTitles.push(document.title);
        if (printThrows) throw new Error("print blocked");
      },
      setTimeout(callback) { callback(); },
    },
    fetch,
    URL: sandboxUrl,
  });
  return { listener: listeners.at(-1), event, button, status, downloads, calls, printedTitles, removed, document };
}

test("un clic approuve puis télécharge le PDF final", async () => {
  const harness = combinedApprovalHarness();
  await harness.listener(harness.event);

  assert.deepEqual(harness.calls.map((call) => call.url), [
    "/api/admin/audit-review/analysis-1",
    "/api/pdf/analysis-1",
  ]);
  assert.equal(JSON.parse(harness.calls[0].options.body).analysisId, "analysis-1");
  assert.deepEqual(harness.downloads, ["Audit-Efficia-Test.pdf"]);
  assert.equal(harness.button.textContent, "Télécharger à nouveau le PDF final");
  assert.equal(harness.document.documentElement.dataset.efficiaPrintMode, "final-print");
  assert.deepEqual(harness.removed, ["control-button", "return-link", "watermark", "notice"]);
});

test("le renderer absent bascule automatiquement en final-print sans marque de contrôle", async () => {
  const harness = combinedApprovalHarness({
    pdfAttempts: [{ status: 501, error: "PDF_RENDERER_NOT_CONFIGURED" }],
  });
  await harness.listener(harness.event);

  assert.deepEqual(harness.calls.map((call) => call.url), [
    "/api/admin/audit-review/analysis-1",
    "/api/pdf/analysis-1",
  ]);
  assert.deepEqual(harness.printedTitles, ["Audit-Efficia-Premium_ME-ELEC_Arlon_2026-08-23.pdf"]);
  assert.equal(harness.document.title, "Titre initial");
  assert.equal(harness.document.documentElement.dataset.efficiaPrintMode, "final-print");
  assert.equal(harness.button.dataset.efficiaApprovalComplete, "true");
  assert.equal(harness.button.dataset.efficiaFinalPrintFallback, "true");
  assert.equal(harness.button.textContent, "Enregistrer le PDF final");
  assert.deepEqual(harness.removed, ["control-button", "return-link", "watermark", "notice"]);
  assert.equal(harness.downloads.length, 0);
});

test("une nouvelle impression Chrome ne réapprouve pas et n’effectue aucune requête", async () => {
  const harness = combinedApprovalHarness({
    pdfAttempts: [{ status: 501, error: "PDF_RENDERER_NOT_CONFIGURED" }],
  });
  await harness.listener(harness.event);
  const callCount = harness.calls.length;
  await harness.listener(harness.event);

  assert.equal(harness.calls.length, callCount);
  assert.equal(harness.calls.filter((call) => call.url.startsWith("/api/admin/")).length, 1);
  assert.equal(harness.printedTitles.length, 2);
  assert.equal(harness.document.title, "Titre initial");
});

test("une impression Chrome bloquée conserve un bouton et un message utilisateur non technique", async () => {
  const harness = combinedApprovalHarness({
    pdfAttempts: [{ status: 501, error: "PDF_RENDERER_NOT_CONFIGURED" }],
    printThrows: true,
  });
  await harness.listener(harness.event);

  assert.equal(harness.button.textContent, "Enregistrer le PDF final");
  assert.equal(
    harness.status.textContent,
    "Le téléchargement automatique n’est pas disponible sur cet environnement. Cliquez sur « Enregistrer le PDF final » pour ouvrir l’enregistrement via Chrome.",
  );
  assert.doesNotMatch(harness.status.textContent, /CLOUDFLARE_ACCOUNT_ID|BROWSER_RENDERING_API_TOKEN/);
});

test("aucune erreur autre que le code 501 attendu ne déclenche le fallback Chrome", async () => {
  const failures = [
    { status: 401, error: "UNAUTHORIZED" },
    { status: 403, error: "PREMIUM_NOT_AUTHORIZED" },
    { status: 409, error: "ANALYSIS_ID_MISMATCH" },
    { status: 409, error: "REPORT_NOT_APPROVED" },
    { status: 501, error: "PDF_RENDERING_FAILED" },
    { status: 502, error: "PDF_RENDERER_NOT_CONFIGURED" },
    { status: 502, invalidJson: true },
  ];

  for (const failure of failures) {
    const harness = combinedApprovalHarness({ pdfAttempts: [failure] });
    await harness.listener(harness.event);
    assert.equal(harness.printedTitles.length, 0, `${failure.status}/${failure.error || "invalid-json"}`);
    assert.equal(harness.button.dataset.efficiaFinalPrintFallback, "false");
    assert.equal(harness.button.textContent, "Télécharger à nouveau le PDF final");
  }
});

test("aucun PDF final n’est demandé si l’approbation échoue", async () => {
  const harness = combinedApprovalHarness({ approvalOk: false });
  await harness.listener(harness.event);

  assert.equal(harness.calls.length, 1);
  assert.equal(harness.downloads.length, 0);
  assert.match(harness.status.textContent, /11111111-1111-4111-8111-111111111111/);
  assert.equal(harness.button.textContent, "Approuver et télécharger le PDF final");
});

test("un téléchargement échoué est réessayable sans nouvelle approbation", async () => {
  const harness = combinedApprovalHarness({ pdfAttempts: [false, true] });
  await harness.listener(harness.event);
  await harness.listener(harness.event);

  assert.equal(harness.calls.filter((call) => call.url.startsWith("/api/admin/")).length, 1);
  assert.equal(harness.calls.filter((call) => call.url.startsWith("/api/pdf/")).length, 2);
  assert.deepEqual(harness.downloads, ["Audit-Efficia-Test.pdf"]);
});

test("un double clic ne duplique ni l’approbation ni la génération", async () => {
  const harness = combinedApprovalHarness();
  await Promise.all([harness.listener(harness.event), harness.listener(harness.event)]);

  assert.equal(harness.calls.filter((call) => call.url.startsWith("/api/admin/")).length, 1);
  assert.equal(harness.calls.filter((call) => call.url.startsWith("/api/pdf/")).length, 1);
});

test("renderPdfById conserve le PDF non finalisé si aucun questionnaire sauvegardé n’existe", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(PDF_BYTES, { status: 200, headers: { "Content-Type": "application/pdf" } });
  try {
    const response = await renderPdfById(makeContext({ draft: null }), "analysis-1");
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error, "QUESTIONNAIRE_SNAPSHOT_UNAVAILABLE");
    assert.match(body.message, /Aucune sauvegarde du questionnaire/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("les noms de PDF sont nettoyés et le contrôle réutilise la ville du rapport", () => {
  assert.equal(
    buildAuditPdfFilename({
      business: { name: "Garage Étoile & Fils" },
    }, "2026-07-24"),
    "Audit-Efficia-Garage-Etoile-Fils-2026-07-24.pdf",
  );
  assert.equal(
    buildAuditPdfFilename({
      reportType: "premium",
      business: { name: "ME ELEC", ville: "Namur", reviewed: { city: "Arlon" } },
    }, "2026-08-23"),
    "Audit-Efficia-Premium_ME-ELEC_Arlon_2026-08-23.pdf",
  );
  assert.equal(
    buildControlPdfTitle({
      business: {
        name: "ME ÉLEC / <script>",
        ville: "Namur",
        reviewed: { city: "Arlon & Belgique" },
      },
    }, "2026-08-23"),
    "CONTROLE-NON-APPROUVE_Audit-Efficia_ME-ELEC-script_Arlon-Belgique_2026-08-23.pdf",
  );
  assert.equal(
    buildControlPdfTitle({ business: { name: "ME ELEC", ville: "Arlon" } }, "2026-08-23"),
    "CONTROLE-NON-APPROUVE_Audit-Efficia_ME-ELEC_Arlon_2026-08-23.pdf",
  );
  assert.equal(
    buildControlPdfTitle({ business: { name: "ME ELEC" } }, "2026-08-23"),
    "CONTROLE-NON-APPROUVE_Audit-Efficia_ME-ELEC_Non-renseignee_2026-08-23.pdf",
  );
});
