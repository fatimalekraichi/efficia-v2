import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSessionCookie } from "../functions/admin/_shared.js";
import { onRequestPost, __test__ } from "../functions/api/admin/audits.js";

const TOKEN = "connector-token";
const ADMIN_SECRET = "admin-secret";

const analysisRow = {
  analysis_id: "analysis-123",
  status: "awaiting_review",
  report_type: "premium",
  nom: "La Planche des Saveurs",
  ville: "Dinant",
  activity: "restaurant",
  name: "La Planche des Saveurs",
  rating: 4.6,
  reviews: 449,
  photos_count: 623,
  description_length: 0,
  local_position: 4,
  competitors_json: "[]",
  benchmark_score: 88,
  avg_rating: 4.7,
  avg_reviews: 340,
  avg_photos: 234,
  rating_gap: -0.1,
  reviews_gap: 109,
  photos_gap: 389,
  rating_percentile: 17,
  reviews_percentile: 100,
  photos_percentile: 100,
  top_competitor_name: "Concurrent",
  top_competitor_rating: 4.8,
  top_competitor_reviews: 324,
  benchmark_completed_at: "2026-07-24T07:00:30.000Z",
  knowledge_json: null,
  reasoning_json: null,
  document_model_json: null,
  created_at: "2026-07-24T07:00:00.000Z",
  updated_at: "2026-07-24T07:01:00.000Z",
  knowledge_completed_at: "2026-07-24T07:01:00.000Z",
  reasoning_completed_at: "2026-07-24T07:01:30.000Z",
  composer_completed_at: "2026-07-24T07:02:00.000Z",
};

function makeDb(row = analysisRow) {
  return {
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
}

function makeOrderDb({ order, task, analysis = analysisRow } = {}) {
  const writes = [];
  const db = {
    writes,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM orders")) return order || null;
              if (sql.includes("FROM order_tasks")) return task || null;
              if (sql.includes("FROM analyses")) return analysis || null;
              return null;
            },
            async run() {
              writes.push({ sql, args });
              return { success: true };
            },
          };
        },
      };
    },
  };
  return db;
}

function makeDbWithFailingAnalysisRead(error) {
  const db = makeOrderDb();
  return {
    ...db,
    prepare(sql) {
      if (sql.includes("FROM analyses")) {
        return {
          bind() {
            return {
              async first() {
                throw error;
              },
              async run() {
                db.writes.push({ sql, args: [] });
                return { success: true };
              },
            };
          },
        };
      }
      return db.prepare(sql);
    },
  };
}

async function makeAdminCookie() {
  const setCookie = await createSessionCookie({ ADMIN_SESSION_SECRET: ADMIN_SECRET });
  return setCookie.split(";")[0];
}

async function makeContext(body, { cookie, db = makeDb() } = {}) {
  return {
    request: new Request("http://local.test/api/admin/audits", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
    env: {
      ADMIN_SESSION_SECRET: ADMIN_SECRET,
      CONNECTOR_TOKEN: TOKEN,
      ORDERS_DB: db,
    },
  };
}

test("admin audit launcher refuse une requête sans session admin", async () => {
  const response = await onRequestPost(await makeContext({
    googleBusinessUrl: "https://www.google.com/maps/place/La+Planche+des+Saveurs/",
  }));

  assert.equal(response.status, 401);
});

test("admin audit launcher refuse une URL Google absente ou invalide, sauf si Nom + Ville sont renseignés", async () => {
  const cookie = await makeAdminCookie();
  const missing = await onRequestPost(await makeContext({ googleBusinessUrl: "" }, { cookie }));
  const invalid = await onRequestPost(await makeContext({ googleBusinessUrl: "https://example.com" }, { cookie }));
  // Mission "améliorer la validation du formulaire" — Nom seul (sans ville) ne
  // suffit pas à remplacer l'URL : les deux modes restent des voies
  // distinctes et complètes (URL seule, ou Nom ET Ville ensemble).
  const nameOnly = await onRequestPost(await makeContext({ googleBusinessUrl: "", companyName: "Garage Central" }, { cookie }));

  assert.equal(missing.status, 400);
  assert.equal(invalid.status, 400);
  assert.equal(nameOnly.status, 400);
});

test("admin audit launcher accepte Nom + Ville sans aucune URL Google (Mode 2)", async () => {
  const cookie = await makeAdminCookie();
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const pathname = new URL(url).pathname;
    const body = JSON.parse(options.body || "{}");
    calls.push({ pathname, body });
    if (pathname === "/api/analyze") {
      assert.deepEqual(body, {
        nom: "Garage Central",
        ville: "Arlon",
        activite: "Garage Central",
      });
      return Response.json({ analysisId: "analysis-123", status: "collected" });
    }
    return Response.json({ success: true, status: "completed" });
  };

  try {
    const response = await onRequestPost(await makeContext({
      googleBusinessUrl: "",
      companyName: "Garage Central",
      city: "Arlon",
      reportType: "free",
    }, { cookie }));
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.success, true);
    assert.deepEqual(calls.map((call) => call.pathname), [
      "/api/analyze",
      "/api/benchmark",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin audit launcher collecte observation et benchmark puis retourne la validation", async () => {
  const cookie = await makeAdminCookie();
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const pathname = new URL(url).pathname;
    calls.push({ pathname, authorization: options.headers.Authorization });
    if (pathname === "/api/analyze") {
      return Response.json({ analysisId: "analysis-123", status: "collected" });
    }
    return Response.json({ success: true, status: "completed" });
  };

  try {
    const response = await onRequestPost(await makeContext({
      googleBusinessUrl: "https://www.google.com/maps/place/La+Planche+des+Saveurs/",
      companyName: "La Planche des Saveurs",
      city: "Dinant",
      email: "fatima@example.com",
      reportType: "free",
    }, { cookie }));
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.success, true);
    assert.equal(json.status, "awaiting_review");
    assert.equal(json.reportType, "free");
    assert.equal(json.analysisId, "analysis-123");
    assert.equal(json.analysis.score, 88);
    assert.equal(json.analysis.reportType, "premium");
    assert.equal(json.analysis.hasDocumentModel, false);
    assert.equal(json.links.review, "/admin/audit-review/analysis-123");
    assert.equal(json.links.report, "/api/render/analysis-123");
    assert.equal(json.links.data, "/api/analysis/analysis-123");
    assert.deepEqual(calls.map((call) => call.pathname), [
      "/api/analyze",
      "/api/benchmark",
    ]);
    assert.ok(calls.every((call) => call.authorization === `Bearer ${TOKEN}`));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin audit launcher charge une commande, préremplit le pipeline et associe l'analyse à la tâche", async () => {
  const cookie = await makeAdminCookie();
  const order = {
    order_id: "order-123",
    email: "client@example.com",
    customer_name: "Julie Martin",
    first_name: "Julie",
    company_name: "Garage Central",
    city: "Arlon",
    google_business_url: "https://www.google.com/maps/place/Garage+Central/",
    offer_code: "audit",
    offer_name: "Audit fiche Google",
    status: "paid",
  };
  const task = {
    task_id: "task-123",
    order_id: "order-123",
    status: "in_progress",
    notes: "Priorité client",
  };
  const db = makeOrderDb({ order, task });
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const pathname = new URL(url).pathname;
    const body = JSON.parse(options.body || "{}");
    calls.push({ pathname, body });
    if (pathname === "/api/analyze") {
      assert.deepEqual(body, {
        nom: "Garage Central",
        ville: "Arlon",
        activite: "Garage Central",
      });
      return Response.json({ analysisId: "analysis-123", status: "collected" });
    }
    return Response.json({ success: true, status: "completed" });
  };

  try {
    const response = await onRequestPost(await makeContext({
      orderId: "order-123",
    }, { cookie, db }));
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.success, true);
    assert.equal(json.order.orderId, "order-123");
    assert.equal(json.order.taskId, "task-123");
    assert.equal(json.order.status, "in_progress");
    assert.equal(json.status, "awaiting_review");
    assert.equal(json.reportType, "premium");
    assert.equal(json.links.review, "/admin/audit-review/analysis-123");
    assert.equal(json.links.order, "/admin-order?id=order-123");
    assert.ok(db.writes.some((write) => write.sql.includes("UPDATE analyses") && write.args.includes("order-123")));
    assert.ok(db.writes.some((write) => write.sql.includes("UPDATE order_tasks") && write.args.includes("analysis-123")));
    assert.deepEqual(calls.map((call) => call.pathname), [
      "/api/analyze",
      "/api/benchmark",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin audit launcher retourne 404 si orderId est inconnu", async () => {
  const cookie = await makeAdminCookie();
  const response = await onRequestPost(await makeContext({
    orderId: "missing-order",
    googleBusinessUrl: "https://www.google.com/maps/place/Garage+Central/",
  }, { cookie, db: makeOrderDb({ order: null }) }));
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(json, { success: false, error: "ORDER_NOT_FOUND" });
});

test("admin audit launcher indique la migration manquante si la relecture D1 échoue", async () => {
  const cookie = await makeAdminCookie();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === "/api/analyze") {
      return Response.json({ analysisId: "analysis-123", status: "collected" });
    }
    return Response.json({ success: true, status: "completed" });
  };

  try {
    const response = await onRequestPost(await makeContext({
      googleBusinessUrl: "https://www.google.com/maps/place/La+Planche+des+Saveurs/",
      companyName: "La Planche des Saveurs",
      city: "Dinant",
      reportType: "free",
    }, {
      cookie,
      db: makeDbWithFailingAnalysisRead(new Error("D1_ERROR: no such column: score_inputs_json")),
    }));
    const json = await response.json();

    assert.equal(response.status, 500);
    assert.equal(json.success, false);
    assert.equal(json.error, "MISSING_D1_MIGRATION");
    assert.equal(json.stage, "review");
    assert.equal(json.message, "La base locale n’est pas à jour. Appliquez la migration 0011_score_efficia_historical.sql, puis relancez l’audit.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin audit launcher refuse un Premium sans commande payée admissible avant le pipeline", async () => {
  const cookie = await makeAdminCookie();
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return Response.json({ success: true });
  };
  try {
    const response = await onRequestPost(await makeContext({
      googleBusinessUrl: "https://www.google.com/maps/place/Garage+Central/",
      reportType: "premium",
    }, { cookie }));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { success: false, error: "PREMIUM_NOT_AUTHORIZED" });
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("l'ancien outil ne contient plus de clés, connecteur ou logique locale d'analyse", async () => {
  const html = await readFile(new URL("../outil-score-efficia-auto-v5.html", import.meta.url), "utf8");

  assert.doesNotMatch(html, /cle-api|token-connecteur|url-connecteur|efficia_api_key|efficia_token_connecteur/i);
  assert.doesNotMatch(html, /Outscraper|Places API|html2pdf|calculScoreDetail|GRILLE/i);
  assert.match(html, /\/admin\/new-audit\//);
});

test("le formulaire \"Nouvel audit\" accepte deux façons équivalentes d'identifier l'entreprise (URL, ou Nom + Ville)", async () => {
  const html = await readFile(new URL("../admin/new-audit/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../js/admin-new-audit.js", import.meta.url), "utf8");

  // HTML — aucun `required` statique sur l'URL : les deux modes sont
  // équivalents, la contrainte est désormais gérée dynamiquement par le JS.
  // `novalidate` désactive l'infobulle native du navigateur au profit du
  // message explicite affiché dans [data-admin-audit-error].
  assert.match(html, /<form class="admin-form admin-audit-form" data-admin-audit-form novalidate>/);
  assert.doesNotMatch(html, /name="googleBusinessUrl"[^>]*required/, "l'URL ne doit plus être required de façon statique");

  // JS — la validation accepte (URL) OU (Nom ET Ville), avec un message
  // explicite plutôt que "Veuillez renseigner ce champ.", et les attributs
  // required/aria-required sont recalculés dynamiquement.
  assert.match(script, /hasIdentification/);
  assert.match(script, /Veuillez renseigner soit l.URL Google Business, soit le nom de l.entreprise et sa ville\./);
  assert.doesNotMatch(script, /Veuillez renseigner ce champ/);
  assert.match(script, /function updateRequiredState/);
  assert.match(script, /urlField\.required = urlRequired/);
  assert.match(script, /nameField\.required = nameCityRequired/);
  assert.match(script, /cityField\.required = nameCityRequired/);
});

test("la nouvelle interface bloque les doubles soumissions et n'expose aucun secret", async () => {
  const html = await readFile(new URL("../admin/new-audit/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../js/admin-new-audit.js", import.meta.url), "utf8");
  const combined = `${html}\n${script}`;

  assert.match(combined, /Générer l’audit/);
  assert.match(combined, /Diagnostic gratuit/);
  assert.match(combined, /Audit Premium 99 €/);
  assert.match(script, /reportType/);
  assert.match(html, /data-order-context/);
  assert.match(script, /\/admin\/orders\/\$\{encodeURIComponent\(orderId\)\}/);
  assert.match(script, /\/admin-order\?id=/);
  assert.match(script, /let isSubmitting = false/);
  assert.match(script, /if \(isSubmitting\) return/);
  assert.match(script, /submitButton\.disabled = true/);
  assert.doesNotMatch(combined, /OUTSCRAPER|CONNECTOR_TOKEN|GOOGLE_API|localStorage|efficia_api_key|token-connecteur/i);
});

test("le bouton Commencer redirige vers /admin/new-audit avec seulement orderId", async () => {
  const detailHtml = await readFile(new URL("../admin-order.html", import.meta.url), "utf8");
  const detailScript = await readFile(new URL("../js/admin-order.js", import.meta.url), "utf8");

  assert.match(detailHtml, /data-start-audit/);
  assert.match(detailScript, /status:\s*"in_progress"/);
  assert.match(detailScript, /\/admin\/new-audit\/\?\$\{params\.toString\(\)\}/);
  assert.doesNotMatch(detailScript, /companyName: order\.company_name/);
  assert.doesNotMatch(detailScript, /CONNECTOR_TOKEN|OUTSCRAPER|GOOGLE_API/i);
});

test("extrait un nom lisible depuis une URL Google Maps quand c'est possible", () => {
  const parsed = __test__.extractBusinessNameFromGoogleUrl("https://www.google.com/maps/place/La+Planche+des+Saveurs/@50.0,4.0");
  const prepared = __test__.buildPipelineInput({
    googleBusinessUrl: "https://www.google.com/maps/place/La+Planche+des+Saveurs/@50.0,4.0",
    city: "Dinant",
  });

  assert.equal(parsed, "La Planche des Saveurs");
  assert.equal(prepared.ok, true);
  assert.deepEqual(prepared.pipelineInput, {
    nom: "La Planche des Saveurs",
    ville: "Dinant",
    activite: "La Planche des Saveurs",
  });
});

test("admin audit launcher conserve une URL Google sans ville pour l'observation", () => {
  const googleBusinessUrl = "https://www.google.com/maps/place/Arzani+Wafa+(Dr)/@49.6042636,5.824801,11z/";
  const prepared = __test__.buildPipelineInput({
    googleBusinessUrl,
  });

  assert.equal(prepared.ok, true);
  assert.deepEqual(prepared.pipelineInput, {
    nom: "Arzani Wafa (Dr)",
    ville: "Non renseignée",
    activite: "",
    googleBusinessUrl,
  });
});

test("buildPipelineInput accepte Nom + Ville sans URL (Mode 2)", () => {
  const prepared = __test__.buildPipelineInput({
    googleBusinessUrl: "",
    companyName: "Garage Central",
    city: "Arlon",
  });

  assert.equal(prepared.ok, true);
  assert.deepEqual(prepared.pipelineInput, {
    nom: "Garage Central",
    ville: "Arlon",
    activite: "Garage Central",
  });
});

test("buildPipelineInput refuse Nom seul (sans Ville) et sans URL", () => {
  const prepared = __test__.buildPipelineInput({
    googleBusinessUrl: "",
    companyName: "Garage Central",
  });

  assert.equal(prepared.ok, false);
  assert.equal(prepared.status, 400);
  assert.equal(prepared.error, "INVALID_GOOGLE_BUSINESS_URL");
});

test("buildPipelineInput refuse Ville seule (sans Nom) et sans URL", () => {
  const prepared = __test__.buildPipelineInput({
    googleBusinessUrl: "",
    city: "Arlon",
  });

  assert.equal(prepared.ok, false);
  assert.equal(prepared.status, 400);
});

test("buildPipelineInput continue d'accepter l'URL seule (Mode 1, comportement inchangé)", () => {
  const googleBusinessUrl = "https://www.google.com/maps/place/Garage+Central/";
  const prepared = __test__.buildPipelineInput({
    googleBusinessUrl,
  });

  assert.equal(prepared.ok, true);
  assert.equal(prepared.pipelineInput.nom, "Garage Central");
  assert.equal(prepared.pipelineInput.googleBusinessUrl, googleBusinessUrl);
  assert.equal(prepared.pipelineInput.observationQuery, undefined);
});

test("normalise le type de rapport", () => {
  assert.equal(__test__.normalizeReportType("free"), "free");
  assert.equal(__test__.normalizeReportType("premium"), "premium");
  assert.equal(__test__.normalizeReportType("autre"), "premium");
  assert.equal(__test__.normalizeReportType(null, { offer_name: "Diagnostic gratuit" }), "free");
});
