import test from "node:test";
import assert from "node:assert/strict";
import { renderPdfById } from "../functions/api/pdf/_shared.js";
import { buildAuditPdfFilename } from "../functions/lib/pdfRenderer.js";

const TOKEN = "test-token";
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
};

function makeContext({ row = analysisRow, token = TOKEN, env = {} } = {}) {
  const db = {
    prepare() {
      return {
        bind() {
          return {
            async first() {
              return row;
            },
            async run() {
              return { success: true };
            },
          };
        },
      };
    },
  };

  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return {
    request: new Request("http://local.test/api/pdf/analysis-1", { headers }),
    params: { analysisId: "analysis-1" },
    env: {
      CONNECTOR_TOKEN: TOKEN,
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
      /attachment; filename="Audit-Efficia-Garage-Etoile-Fils-\d{4}-\d{2}-\d{2}\.pdf"/,
    );
    assert.equal(signature, "%PDF-");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("buildAuditPdfFilename nettoie les caractères spéciaux", () => {
  assert.equal(
    buildAuditPdfFilename({
      business: { name: "Garage Étoile & Fils" },
    }, "2026-07-24"),
    "Audit-Efficia-Garage-Etoile-Fils-2026-07-24.pdf",
  );
});
