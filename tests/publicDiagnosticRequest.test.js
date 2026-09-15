import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

import { createSessionCookie } from "../functions/admin/_shared.js";
import { onRequestGet as getDiagnosticContext } from "../functions/api/admin/free-diagnostic-context/[analysisId].js";
import { onRequestPost as analyze } from "../functions/api/analyze.js";
import { onRequestPost as benchmark } from "../functions/api/benchmark.js";
import { normalizeDiagnosticSubmission } from "../functions/lib/diagnosticRequests.js";
import { onRequestPost as subscribe } from "../functions/subscribe.js";
import { onRequestGet as listDiagnostics } from "../functions/api/admin/diagnostic-requests.js";
import { finalizeQuestionnaireSnapshot } from "../functions/lib/auditQuestionnaireSnapshots.js";

const TOKEN = "local-connector-token";
const ADMIN_SECRET = "local-admin-secret";
const PREVIEW_ORIGIN = "https://branch.efficiadigital.pages.dev";
const KEY_ONE = "51ed6ee4-2860-4dd2-a108-f241e5c608c9";
const KEY_TWO = "442cb8e3-6f49-46df-93bb-103c5df1f1fb";
const migrationNames = [
  "0001_orders_tasks.sql",
  "0002_audit_production_tracking.sql",
  "0003_analyses.sql",
  "0004_analysis_competitors.sql",
  "0005_analysis_benchmark.sql",
  "0006_analysis_knowledge.sql",
  "0007_analysis_reasoning_composer.sql",
  "0008_order_analysis_link.sql",
  "0009_manual_review_gate.sql",
  "0010_analysis_report_type.sql",
  "0011_score_efficia_historical.sql",
  "0012_order_cgv_acceptance.sql",
  "0013_diagnostic_requests.sql",
  "0019_diagnostic_lead_captures.sql",
  "0020_diagnostic_manual_review.sql",
];

class LocalD1 {
  constructor({ failBatch = false } = {}) {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    migrationNames.forEach((name) => {
      this.sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
    });
    this.failBatch = failBatch;
    this.boundStatements = [];
  }

  prepare(sql) {
    const database = this.sqlite;
    const makeBound = (params = []) => ({
      bind: (...nextParams) => {
        this.boundStatements.push({ sql, params: nextParams });
        return makeBound(nextParams);
      },
      first: async () => database.prepare(sql).get(...params) || null,
      all: async () => ({ results: database.prepare(sql).all(...params) }),
      run: async () => {
        const result = database.prepare(sql).run(...params);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
      _run: () => database.prepare(sql).run(...params),
    });
    return makeBound();
  }

  async batch(statements) {
    if (this.failBatch) throw new Error("local_batch_failure");
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement._run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  count(table) {
    return Number(this.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
  }

  first(sql, ...params) {
    return this.sqlite.prepare(sql).get(...params) || null;
  }
}

const diagnosticPayload = (idempotencyKey = KEY_ONE) => ({
  step: "diagnostic_request",
  idempotency_key: idempotencyKey,
  first_name: "Fatima",
  email: "FATIMA@EXAMPLE.COM",
  company_name: "Entreprise Test",
  google_business_url: "",
  city: "Bruxelles",
  source: "Score Efficia gratuit",
});

const urlOnlyDiagnosticPayload = () => ({
  ...diagnosticPayload(KEY_TWO),
  company_name: "",
  city: "",
  google_business_url: "https://www.google.com/maps/place/Entreprise+Test",
});

const makeSubscribeContext = (db, payload) => ({
  request: new Request(`${PREVIEW_ORIGIN}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }),
  env: {
    SITE_URL: PREVIEW_ORIGIN,
    CONNECTOR_TOKEN: TOKEN,
    OUTSCRAPER_API_KEY: "local-outscraper-key",
    MAILERLITE_API_KEY: "local-mailerlite-key",
    MAILERLITE_PREVIEW_DIAGNOSTIC_GROUP_ID: "preview-diagnostic",
    ORDERS_DB: db,
  },
});

function installFetchRouter({
  db,
  mailerLiteOk = true,
  mailerLiteStatuses = [],
  mailerLiteSubscriber = null,
  mailerLiteLookupResponse = null,
  benchmarkOk = true,
  sparseBusiness = false,
  transformAnalyzeBody = null,
  analyzeEnv = {},
  analyzeError = null,
  analyzeBoundaryResponse = null,
  providerResponse = null,
}) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let subscriber = mailerLiteSubscriber ? structuredClone(mailerLiteSubscriber) : null;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    calls.push({ url: url.href, options });
    if (url.pathname === "/api/analyze") {
      if (analyzeError) throw analyzeError;
      if (analyzeBoundaryResponse) return analyzeBoundaryResponse();
      const requestOptions = transformAnalyzeBody
        ? { ...options, body: JSON.stringify(transformAnalyzeBody(JSON.parse(options.body))) }
        : options;
      return analyze({
        request: new Request(url, requestOptions),
        env: {
          CONNECTOR_TOKEN: TOKEN,
          OUTSCRAPER_API_KEY: "local-outscraper-key",
          ORDERS_DB: db,
          ...analyzeEnv,
        },
      });
    }
    if (url.pathname === "/api/benchmark") {
      if (!benchmarkOk) return Response.json({ error: "local_benchmark_failure" }, { status: 500 });
      return benchmark({
        request: new Request(url, options),
        env: { CONNECTOR_TOKEN: TOKEN, ORDERS_DB: db },
      });
    }
    if (url.hostname === "connect.mailerlite.com") {
      if (!options.method || options.method === "GET") {
        if (mailerLiteLookupResponse) return mailerLiteLookupResponse();
        return subscriber ? Response.json({ data: subscriber }) : new Response(null, { status: 404 });
      }
      assert.equal(options.method, "POST");
      assert.equal(url.pathname, "/api/subscribers");
      const status = mailerLiteStatuses.shift() ?? (mailerLiteOk ? 200 : 500);
      if (status >= 400) return new Response(null, { status });
      const incoming = JSON.parse(options.body);
      subscriber ||= { id: "local-subscriber", email: incoming.email, status: "active", fields: {}, groups: [] };
      Object.assign(subscriber.fields, incoming.fields);
      if (incoming.status) subscriber.status = incoming.status;
      if (incoming.resubscribe) subscriber.status = "active";
      for (const group of incoming.groups || []) if (!subscriber.groups.includes(group)) subscriber.groups.push(group);
      return Response.json({ data: subscriber }, { status });
    }
    if (url.hostname.includes("outscraper")) {
      if (providerResponse) return providerResponse();
      const isCompetitorRequest = url.searchParams.get("organizationsPerQueryLimit") === "10";
      const business = sparseBusiness
        ? { name: "Entreprise Test" }
        : {
            name: "Entreprise Test",
            place_id: "place-local-test",
            category: "Consultant",
            city: "Bruxelles",
            rating: 4.7,
            reviews: 18,
          };
      return Response.json({ data: [isCompetitorRequest ? [] : [business]] });
    }
    throw new Error(`Unexpected local URL: ${url.href}`);
  };
  return {
    calls,
    subscriber: () => structuredClone(subscriber),
    restore: () => { globalThis.fetch = originalFetch; },
  };
}

test("la migration crée les contraintes et la relation attendues", () => {
  const db = new LocalD1();
  const columns = db.sqlite.prepare("PRAGMA table_info(diagnostic_requests)").all().map((row) => row.name);
  assert.deepEqual(columns, [
    "request_id", "idempotency_key", "analysis_id", "first_name", "email",
    "company_name", "city", "google_business_url", "status", "mailerlite_status",
    "created_at", "updated_at",
  ]);
  assert.throws(() => db.sqlite.prepare(`
    INSERT INTO diagnostic_requests (
      request_id, idempotency_key, analysis_id, first_name, email, status,
      mailerlite_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'awaiting_review', 'pending', ?, ?)
  `).run("request-orphan", KEY_ONE, "missing-analysis", "Fatima", "fatima@example.com", "2026-08-18", "2026-08-18"), /FOREIGN KEY/);

  const insertAnalysis = db.sqlite.prepare(`
    INSERT INTO analyses (analysis_id, nom, ville, query, status, created_at, updated_at, report_type)
    VALUES (?, 'Entreprise', 'Bruxelles', 'Entreprise Bruxelles', 'awaiting_review', ?, ?, 'free')
  `);
  insertAnalysis.run("analysis-one", "2026-08-18", "2026-08-18");
  insertAnalysis.run("analysis-two", "2026-08-18", "2026-08-18");
  const insertRequest = db.sqlite.prepare(`
    INSERT INTO diagnostic_requests (
      request_id, idempotency_key, analysis_id, first_name, email, created_at, updated_at
    ) VALUES (?, ?, ?, 'Fatima', 'fatima@example.com', '2026-08-18', '2026-08-18')
  `);
  insertRequest.run("request-one", KEY_ONE, "analysis-one");
  assert.throws(() => insertRequest.run("request-two", KEY_ONE, "analysis-two"), /UNIQUE/);
  assert.throws(() => insertRequest.run("request-three", KEY_TWO, "analysis-one"), /UNIQUE/);
});

test("une recherche réussie sans résultat conserve la demande complète sans analyse inventée", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db, providerResponse: () => Response.json({ data: [[]] }) });
  try {
    await subscribe(makeSubscribeContext(db, capturePayload()));
    const response = await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.success, true);
    assert.equal(result.reviewReason, "not_found");
    assert.equal(result.analysisId, undefined);
    const listing = await diagnosticsInAdmin(db);
    assert.equal(listing.diagnostics.length, 1);
    assert.equal(listing.diagnostics[0].company, "Entreprise Test");
    assert.equal(listing.diagnostics[0].status, "manual_review");
    assert.equal(db.count("analyses"), 0);
    assert.equal(router.calls.some(c => new URL(c.url).pathname === "/api/benchmark"), false);
  } finally { router.restore(); db.sqlite.close(); }
});

for (const scenario of [
  { name: "aucun résultat", reason: "not_found", response: () => Response.json({ data: [[]] }) },
  { name: "timeout fournisseur", reason: "unavailable", response: () => { throw new DOMException("simulated timeout", "AbortError"); } },
  { name: "erreur HTTP fournisseur", reason: "unavailable", response: () => new Response("technical failure", {status:503}) },
  { name: "réponse invalide", reason: "unavailable", response: () => Response.json({}) },
  { name: "recherche en attente", reason: "unavailable", response: () => Response.json({status:"Pending",data:[]}) },
  { name: "résultats ambigus", reason: "ambiguous", response: () => Response.json({data:[[
    {name:"Entreprise Test",city:"Bruxelles",place_id:"candidate-one"},
    {name:"Entreprise Test",city:"Bruxelles",place_id:"candidate-two"},
  ]]}) },
  { name: "absence déclarée", reason: "declared_absent", declared: true, response: () => {throw Error("provider must not be called");} },
]) {
  test(`demande manuelle : ${scenario.name}, persistance et reprise sans faux score`, async () => {
    const db = new LocalD1();
    const router = installFetchRouter({db, providerResponse:scenario.response,
      mailerLiteSubscriber:{id:"local-existing",status:"unsubscribed",fields:{audit_status:"audit envoyé"},groups:["existing"]}});
    const payload = {...diagnosticPayload(),country_code:"BE",declared_no_listing:Boolean(scenario.declared)};
    try {
      await subscribe(makeSubscribeContext(db,capturePayload()));
      const first = await subscribe(makeSubscribeContext(db,payload));
      assert.equal(first.status,200);
      const result=await first.json();
      assert.equal(result.reviewReason,scenario.reason);
      assert.equal(result.status,"manual_review");
      assert.equal(result.analysisId,undefined);
      assert.equal(result.requestId,KEY_ONE);
      const providerCount=router.calls.filter(c=>c.url.includes('outscraper')).length;
      for (const response of await Promise.all([subscribe(makeSubscribeContext(db,payload)),subscribe(makeSubscribeContext(db,payload))])) {
        assert.deepEqual(await response.json(),result);
      }
      await subscribe(makeSubscribeContext(db,capturePayload()));
      assert.equal(router.calls.filter(c=>c.url.includes('outscraper')).length,providerCount);
      if(scenario.declared) assert.equal(providerCount,0);
      const listing=await diagnosticsInAdmin(db);
      assert.equal(listing.pendingCount,1);
      assert.equal(listing.diagnostics.length,1);
      assert.equal(listing.diagnostics[0].reviewReason,scenario.reason);
      assert.equal(listing.diagnostics[0].countryCode,"BE");
      assert.equal(listing.diagnostics[0].company,"Entreprise Test");
      assert.equal(listing.diagnostics[0].email,"fatima@example.com");
      assert.equal(listing.diagnostics[0].analysisId,null);
      assert.equal(db.count("analyses"),0);
      assert.equal(db.count("diagnostic_requests"),0);
      assert.equal(db.count("diagnostic_lead_captures"),1);
      assert.equal(router.calls.some(c=>new URL(c.url).pathname==='/api/benchmark'),false);
      assert.equal(router.subscriber().status,"unsubscribed");
      assert.equal(router.subscriber().fields.audit_status,"audit envoyé");
      assert.deepEqual(router.subscriber().groups,["existing"]);
      for(const call of router.calls.filter(c=>c.url.includes('mailerlite') && c.options.method==='POST')){
        const sent=JSON.parse(call.options.body);
        for(const key of ['groups','status','resubscribe']) assert.equal(sent[key],undefined);
      }
    } finally {router.restore();db.sqlite.close();}
  });
}

test("échec du stockage de la demande manuelle : aucune confirmation, capture toujours visible", async () => {
  const db=new LocalD1(); const router=installFetchRouter({db,providerResponse:()=>Response.json({data:[]})});
  try {
    await subscribe(makeSubscribeContext(db,capturePayload()));
    db.sqlite.exec("CREATE TRIGGER fail_manual BEFORE UPDATE OF request_details_json ON diagnostic_lead_captures BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END");
    const response=await subscribe(makeSubscribeContext(db,diagnosticPayload()));
    assert.equal(response.status,502);
    assert.equal((await response.json()).success,false);
    const listing=await diagnosticsInAdmin(db);
    assert.equal(listing.diagnostics[0].status,"incomplete");
    assert.equal(db.count('analyses'),0);
  } finally {router.restore();db.sqlite.close();}
});

for (const providerCountry of ['BE', 'FR', null]) {
  test(`pays facultatif : recherche BE, fournisseur ${providerCountry}, sans homonyme accepté à tort`, async () => {
    const db = new LocalD1();
    const router = installFetchRouter({db,providerResponse:()=>Response.json({data:[[
      {name:'Entreprise Test',city:'Bruxelles',country_code:providerCountry,place_id:'local-company',category:'Consultant'},
    ]]})});
    try {
      const response=await subscribe(makeSubscribeContext(db,{...diagnosticPayload(),country_code:'Belgique'}));
      const result=await response.json();
      assert.equal(response.status,200);
      assert.equal(result.status,providerCountry==='BE'?'awaiting_review':'manual_review');
      assert.equal(db.count('analyses'),providerCountry==='BE'?1:0);
      if(providerCountry!=='BE') assert.equal(result.reviewReason,'unresolved');
      const call=router.calls.find(c=>c.url.includes('outscraper'));
      assert.equal(new URL(call.url).searchParams.get('query'),'Entreprise Test Bruxelles BE');
    } finally {router.restore();db.sqlite.close();}
  });
}

for (const mailerLiteStatuses of [[422,200],[500,500]]) {
  test(`demande sans fiche conservée avec synchronisation ${mailerLiteStatuses[1]===200?'partielle':'en échec'}`, async () => {
    const partial=mailerLiteStatuses[1]===200;
    const db=new LocalD1();const router=installFetchRouter({db,mailerLiteStatuses:[...mailerLiteStatuses]});
    try {
      const response=await subscribe(makeSubscribeContext(db,{...diagnosticPayload(),declared_no_listing:true}));
      const result=await response.json();
      assert.equal(response.status,200);assert.equal(result.success,true);
      assert.equal(result.reviewReason,'declared_absent');
      assert.ok(result.warning);
      const listing=await diagnosticsInAdmin(db);
      assert.equal(listing.diagnostics.length,1);
      assert.equal(listing.diagnostics[0].mailerLiteStatus,partial?'partial':'failed');
      assert.equal(db.count('analyses'),0);
    } finally {router.restore();db.sqlite.close();}
  });
}

test("deux finalisations simultanées sans fiche conservent une seule demande et aucun score", async () => {
  const db=new LocalD1();const router=installFetchRouter({db,providerResponse:()=>Response.json({data:[]})});
  try {
    await subscribe(makeSubscribeContext(db,capturePayload()));
    const responses=await Promise.all([subscribe(makeSubscribeContext(db,diagnosticPayload())),subscribe(makeSubscribeContext(db,diagnosticPayload()))]);
    for(const response of responses){assert.equal(response.status,200);assert.equal((await response.json()).success,true);}
    assert.equal(db.count('diagnostic_lead_captures'),1);
    assert.equal((await diagnosticsInAdmin(db)).diagnostics.length,1);
    assert.equal(db.count('analyses'),0);
  } finally {router.restore();db.sqlite.close();}
});

test("la validation borne les champs et refuse une URL Google falsifiée", () => {
  const invalid = normalizeDiagnosticSubmission({
    ...diagnosticPayload(),
    google_business_url: "https://google.com.evil.example/maps/place/Test",
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error, "INVALID_GOOGLE_BUSINESS_URL");

  const valid = normalizeDiagnosticSubmission({
    ...diagnosticPayload(),
    first_name: "F".repeat(140),
    email: "FATIMA@EXAMPLE.COM",
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.data.firstName.length, 100);
  assert.equal(valid.data.email, "fatima@example.com");
});

test("une soumission publique crée exactement une analyse gratuite et reste idempotente", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db });
  try {
    const firstResponse = await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    const first = await firstResponse.json();
    assert.equal(firstResponse.status, 200);
    assert.equal(first.success, true);
    assert.equal(first.status, "awaiting_review");
    assert.match(first.analysisId, /^[0-9a-f-]{36}$/i);
    assert.equal(db.count("analyses"), 1);
    assert.equal(db.count("diagnostic_requests"), 1);
    assert.equal(db.count("orders"), 0);
    assert.equal(db.count("order_tasks"), 0);

    const analysis = db.first("SELECT status, report_type, scoring_version, benchmark_completed_at, document_model_json, pdf_generated_at FROM analyses");
    assert.equal(analysis.status, "awaiting_review");
    assert.equal(analysis.report_type, "free");
    assert.equal(analysis.scoring_version, "score-efficia-v5");
    assert.ok(analysis.benchmark_completed_at);
    assert.equal(analysis.document_model_json, null);
    assert.equal(analysis.pdf_generated_at, null);
    const request = db.first("SELECT email, status, mailerlite_status FROM diagnostic_requests");
    assert.equal(request.email, "fatima@example.com");
    assert.equal(request.status, "awaiting_review");
    assert.equal(request.mailerlite_status, "synced");
    assert.equal(marketingPayloads(router)[0].groups, undefined);
    assert.equal(first.group_id, undefined);

    const duplicateResponse = await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    const duplicate = await duplicateResponse.json();
    assert.equal(duplicate.analysisId, first.analysisId);
    assert.equal(db.count("analyses"), 1);
    assert.equal(db.count("diagnostic_requests"), 1);
    assert.equal(marketingPayloads(router).length, 1);

    const laterResponse = await subscribe(makeSubscribeContext(db, diagnosticPayload(KEY_TWO)));
    assert.equal(laterResponse.status, 200);
    assert.equal(db.count("analyses"), 2);
    assert.equal(db.count("diagnostic_requests"), 2);
  } finally {
    router.restore();
  }
});

// Régressions du parcours public ; services externes entièrement simulés.
const capturePayload = () => ({
  step: "lead_capture", first_name: "Fatima", email: "fatima@example.com",
  idempotency_key: KEY_ONE,
  audit_status: "lead capturé", source: "Score Efficia gratuit",
});
const marketingPayloads = (router) => router.calls
  .filter(({ url, options }) => new URL(url).hostname === "connect.mailerlite.com" && options.method === "POST")
  .map(({ options }) => JSON.parse(options.body));
async function diagnosticsInAdmin(db, query = "") {
  const cookie = (await createSessionCookie({ ADMIN_SESSION_SECRET: ADMIN_SECRET })).split(";")[0];
  const response = await listDiagnostics({
    request: new Request(`${PREVIEW_ORIGIN}/api/admin/diagnostic-requests${query}`, { headers: { Cookie: cookie } }),
    env: { ADMIN_SESSION_SECRET: ADMIN_SECRET, ORDERS_DB: db },
  });
  assert.equal(response.status, 200);
  return response.json();
}

test("capture seule : aucun groupe ni statut forcé, aucune fausse demande Efficia", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db });
  try {
    assert.equal((await subscribe(makeSubscribeContext(db, capturePayload()))).status, 200);
    assert.equal(db.count("analyses"), 0);
    assert.equal(db.count("diagnostic_requests"), 0);
    const listing = await diagnosticsInAdmin(db);
    assert.equal(db.count("diagnostic_lead_captures"), 1);
    assert.equal(listing.pendingCount, 1);
    assert.equal(listing.diagnostics.length, 1);
    assert.equal(listing.diagnostics[0].status, "incomplete");
    assert.equal(listing.diagnostics[0].analysisId, null);
    assert.equal(listing.diagnostics[0].company, null);
    assert.equal(router.calls.length, 1);
    assert.deepEqual(marketingPayloads(router)[0], {
      email: "fatima@example.com",
      fields: { name: "Fatima", source: "Score Efficia gratuit" },
    });
  } finally { router.restore(); db.sqlite.close(); }
});

test("capture persistée, reprise et demande complète enrichissent une seule ligne sans fusion par e-mail", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db });
  try {
    const captures = await Promise.all([subscribe(makeSubscribeContext(db, capturePayload())), subscribe(makeSubscribeContext(db, capturePayload()))]);
    assert.ok(captures.every(response => response.status === 200));
    assert.equal(db.count("diagnostic_lead_captures"), 1);
    let listing = await diagnosticsInAdmin(db);
    assert.equal(listing.pendingCount, 1);
    assert.equal(listing.diagnostics[0].status, "incomplete");
    assert.equal(listing.diagnostics[0].email, "fatima@example.com");
    const resumed = await subscribe(makeSubscribeContext(db, capturePayload()));
    assert.equal(resumed.status, 200);
    assert.equal((await diagnosticsInAdmin(db)).diagnostics.length, 1);
    assert.equal((await subscribe(makeSubscribeContext(db, diagnosticPayload()))).status, 200);
    listing = await diagnosticsInAdmin(db);
    assert.equal(listing.pendingCount, 1);
    assert.equal(listing.diagnostics.length, 1);
    assert.equal(listing.diagnostics[0].status, "awaiting_review");
    assert.equal(listing.diagnostics[0].company, "Entreprise Test");
    assert.ok(listing.diagnostics[0].analysisId);
    await subscribe(makeSubscribeContext(db, { ...capturePayload(), idempotency_key: KEY_TWO }));
    listing = await diagnosticsInAdmin(db);
    assert.equal(listing.pendingCount, 2, "a separate journey for the same email stays separate");
    assert.equal(listing.diagnostics.length, 2);
    db.sqlite.exec("UPDATE diagnostic_requests SET status = 'completed'");
    assert.equal((await diagnosticsInAdmin(db)).pendingCount, 1, "completion never resurrects the original capture");
  } finally { router.restore(); db.sqlite.close(); }
});

for (const missingKey of [false, true]) {
  test(`capture Efficia survives failed MailerLite (missing API key=${missingKey})`, async () => {
    const db = new LocalD1();
    const router = installFetchRouter({ db, mailerLiteOk: false });
    try {
      const context = makeSubscribeContext(db, capturePayload());
      if (missingKey) delete context.env.MAILERLITE_API_KEY;
      const response = await subscribe(context);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).success, true);
      const listing = await diagnosticsInAdmin(db);
      assert.equal(listing.pendingCount, 1);
      assert.equal(listing.diagnostics[0].mailerLiteStatus, "failed");
      assert.equal(db.count("analyses"), 0);
    } finally { router.restore(); db.sqlite.close(); }
  });
}

test("un échec d'insertion Efficia n'annonce aucun succès ni synchronisation distante", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db });
  try {
    db.sqlite.exec("CREATE TRIGGER refuse_capture BEFORE INSERT ON diagnostic_lead_captures BEGIN SELECT RAISE(ABORT, 'storage_failure'); END");
    const response = await subscribe(makeSubscribeContext(db, capturePayload()));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).success, false);
    assert.equal(db.count("diagnostic_lead_captures"), 0);
    assert.equal(router.calls.length, 0);
  } finally { router.restore(); db.sqlite.close(); }
});

test("capture : clé obligatoire et synchronisation partielle conservée dans Efficia", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db, mailerLiteStatuses: [422, 200] });
  try {
    for (const key of ["", "invalid"]) {
      assert.equal((await subscribe(makeSubscribeContext(db, { ...capturePayload(), idempotency_key: key }))).status, 400);
    }
    assert.equal(router.calls.length, 0);
    const response = await subscribe(makeSubscribeContext(db, capturePayload()));
    assert.equal((await response.json()).warning, "Marketing synchronization incomplete.");
    assert.equal((await diagnosticsInAdmin(db)).diagnostics[0].mailerLiteStatus, "partial");
    for (const payload of marketingPayloads(router)) {
      assert.equal(payload.groups, undefined);
      assert.equal(payload.status, undefined);
      assert.equal(payload.resubscribe, undefined);
      assert.equal(payload.fields.audit_status, undefined);
    }
  } finally { router.restore(); db.sqlite.close(); }
});

test("une clé de parcours ne peut pas être réaffectée à un autre contact", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db });
  try {
    await subscribe(makeSubscribeContext(db, capturePayload()));
    const before = router.calls.length;
    for (const payload of [capturePayload(), diagnosticPayload()]) {
      assert.equal((await subscribe(makeSubscribeContext(db, { ...payload, email: "other@example.com" }))).status, 409);
    }
    assert.equal(router.calls.length, before);
    assert.equal(db.first("SELECT email FROM diagnostic_lead_captures").email, "fatima@example.com");
    assert.equal(db.count("analyses"), 0);
  } finally { router.restore(); db.sqlite.close(); }
});

for (const scenario of [
  { name: "étape 2 invalide", payload: { company_name: "", city: "" }, expectedHttp: 400, rows: 0 },
  { name: "analyse en erreur", routerOptions: { analyzeBoundaryResponse: () => Response.json({ error_code: "COLLECTION_FAILED" }, { status: 500 }) }, expectedHttp: 502, rows: 0 },
  { name: "stockage Efficia en erreur", failBatch: true, expectedHttp: 502, rows: 0 },
  { name: "benchmark en erreur après stockage", routerOptions: { benchmarkOk: false }, expectedHttp: 502, rows: 1 },
]) {
  test(`investigation : après capture réussie, ${scenario.name} conserve le contact capturé`, async () => {
    const db = new LocalD1({ failBatch: scenario.failBatch });
    const router = installFetchRouter({ db, ...scenario.routerOptions });
    try {
      assert.equal((await subscribe(makeSubscribeContext(db, capturePayload()))).status, 200);
      const response = await subscribe(makeSubscribeContext(db, { ...diagnosticPayload(), ...scenario.payload }));
      assert.equal(response.status, scenario.expectedHttp);
      assert.equal(db.count("analyses"), scenario.rows);
      assert.equal(db.count("diagnostic_requests"), scenario.rows);
      assert.equal((await diagnosticsInAdmin(db)).diagnostics.length, 1);
      assert.equal(db.count("diagnostic_lead_captures"), 1);
      assert.equal((await diagnosticsInAdmin(db)).diagnostics[0].status, scenario.rows ? "awaiting_review" : "incomplete");
      assert.equal(marketingPayloads(router).length, 1);
      assert.equal(marketingPayloads(router)[0].fields.audit_status, undefined);
      if (scenario.rows) assert.equal(db.first("SELECT mailerlite_status FROM diagnostic_requests").mailerlite_status, "pending");
    } finally { router.restore(); db.sqlite.close(); }
  });
}

test("le repli sans champs métier signale une synchronisation partielle, sans groupe ni réactivation", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db, mailerLiteStatuses: [200, 422, 200] });
  try {
    await subscribe(makeSubscribeContext(db, capturePayload()));
    const response = await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).warning, "Marketing synchronization incomplete.");
    assert.equal((await diagnosticsInAdmin(db)).diagnostics.length, 1);
    assert.equal(db.first("SELECT mailerlite_status FROM diagnostic_requests").mailerlite_status, "partial");
    const payloads = marketingPayloads(router);
    assert.equal(payloads.length, 3);
    assert.equal(payloads[0].fields.audit_status, undefined);
    assert.equal(payloads[1].fields.audit_status, "diagnostic demandé");
    assert.deepEqual(payloads[2].fields, { name: "Fatima" });
    for (const p of payloads) {
      assert.equal(p.groups, undefined);
      assert.equal(p.status, undefined);
      assert.equal(p.resubscribe, undefined);
    }
    // A partial sync must not short-circuit a retry as if it were fully synced.
    await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    assert.equal(db.count("diagnostic_requests"), 1);
    assert.equal(db.first("SELECT mailerlite_status FROM diagnostic_requests").mailerlite_status, "synced");
    assert.equal(router.subscriber().fields.audit_status, "diagnostic demandé");
  } finally { router.restore(); db.sqlite.close(); }
});

test("reprendre la première étape ne régresse pas audit_status après une demande complète", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db });
  try {
    await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    await subscribe(makeSubscribeContext(db, capturePayload()));
    assert.equal(db.count("diagnostic_requests"), 1);
    assert.equal((await diagnosticsInAdmin(db)).diagnostics.length, 1);
    assert.deepEqual(marketingPayloads(router).map(p => p.fields.audit_status), ["diagnostic demandé", undefined]);
    assert.equal(router.subscriber().fields.audit_status, "diagnostic demandé");
  } finally { router.restore(); db.sqlite.close(); }
});

for (const subscriptionStatus of ["active", "unsubscribed", "unconfirmed", "bounced", "junk"]) {
  for (const fallback of [false, true]) {
    test(`capture et demande préservent ${subscriptionStatus}, les groupes et le statut avancé (repli=${fallback})`, async () => {
      const db = new LocalD1();
      const router = installFetchRouter({
        db,
        mailerLiteSubscriber: { id: "existing", status: subscriptionStatus, fields: { audit_status: "diagnostic envoyé" }, groups: ["existing-group"] },
        mailerLiteStatuses: fallback ? [422, 200, 422, 200] : [],
      });
      try {
        for (const payload of [capturePayload(), { ...diagnosticPayload(), audit_status: "lead capturé" }]) {
          const response = await subscribe(makeSubscribeContext(db, payload));
          assert.equal(response.status, 200);
          const body = await response.json();
          assert.equal(body.warning, fallback ? "Marketing synchronization incomplete." : undefined);
          assert.equal(router.subscriber().status, subscriptionStatus);
          assert.equal(router.subscriber().fields.audit_status, "diagnostic envoyé");
          assert.deepEqual(router.subscriber().groups, ["existing-group"]);
        }
        for (const payload of marketingPayloads(router)) {
          for (const field of ["status", "resubscribe", "groups"]) assert.equal(Object.hasOwn(payload, field), false);
          assert.equal(Object.hasOwn(payload.fields, "audit_status"), false);
        }
        assert.equal(db.first("SELECT mailerlite_status FROM diagnostic_requests").mailerlite_status, fallback ? "partial" : "synced");
      } finally { router.restore(); db.sqlite.close(); }
    });
  }
}

for (const previous of [null, "", "lead capturé", "diagnostic demandé", "pdf_generated", "statut manuel à conserver"]) {
  test(`la demande complète respecte le statut existant ${JSON.stringify(previous)} et ignore le statut client`, async () => {
    const db = new LocalD1();
    const router = installFetchRouter({ db, mailerLiteSubscriber: { id: "existing", status: "active", fields: { audit_status: previous } } });
    try {
      await subscribe(makeSubscribeContext(db, { ...diagnosticPayload(), audit_status: "diagnostic envoyé" }));
      const advances = [null, "", "lead capturé"].includes(previous);
      assert.equal(router.subscriber().fields.audit_status, advances ? "diagnostic demandé" : previous);
      assert.equal(Object.hasOwn(marketingPayloads(router)[0].fields, "audit_status"), advances);
    } finally { router.restore(); db.sqlite.close(); }
  });
}

for (const lookup of [
  { name: "HTTP 503", respond: () => new Response(null, { status: 503 }) },
  { name: "réponse mal formée", respond: () => Response.json({ data: {} }) },
  { name: "JSON invalide", respond: () => new Response("not-json") },
  { name: "réseau indisponible", respond: () => { throw new Error("local-only failure"); } },
]) {
  test(`lecture MailerLite impossible (${lookup.name}) : demande conservée, aucune écriture distante aveugle`, async () => {
    const db = new LocalD1();
    const router = installFetchRouter({ db, mailerLiteLookupResponse: lookup.respond });
    try {
      const response = await subscribe(makeSubscribeContext(db, diagnosticPayload()));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).warning, "Marketing synchronization unavailable.");
      assert.equal(db.count("diagnostic_requests"), 1);
      assert.equal(db.first("SELECT mailerlite_status FROM diagnostic_requests").mailerlite_status, "failed");
      assert.equal(marketingPayloads(router).length, 0);
    } finally { router.restore(); db.sqlite.close(); }
  });
}

test("une capture livrée tardivement ne remplace jamais le statut d'une demande finalisée entre-temps", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db });
  try {
    await subscribe(makeSubscribeContext(db, capturePayload()));
    const delayedCapture = structuredClone(marketingPayloads(router)[0]);
    await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    const current = router.subscriber();
    Object.assign(current.fields, delayedCapture.fields);
    assert.equal(current.fields.audit_status, "diagnostic demandé");
    assert.equal(Object.hasOwn(delayedCapture.fields, "audit_status"), false);
  } finally { router.restore(); db.sqlite.close(); }
});

test("le groupe diagnostic n'est plus requis ni transmis, même si une ancienne configuration est présente", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db });
  try {
    for (const payload of [capturePayload(), diagnosticPayload()]) {
      const context = makeSubscribeContext(db, payload);
      delete context.env.MAILERLITE_PREVIEW_DIAGNOSTIC_GROUP_ID;
      const response = await subscribe(context);
      assert.equal(response.status, 200);
    }
    assert.ok(marketingPayloads(router).every(p => !Object.hasOwn(p, "groups")));
    assert.deepEqual(router.subscriber().groups, []);
  } finally { router.restore(); db.sqlite.close(); }
});

test("la synchronisation partielle remonte depuis D1 jusqu'au libellé réel du back-office", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db, mailerLiteStatuses: [422, 200] });
  try {
    await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    const { diagnostics } = await diagnosticsInAdmin(db);
    assert.equal(diagnostics[0].mailerLiteStatus, "partial");
    const source = readFileSync(new URL("../js/admin.js", import.meta.url), "utf8");
    const context = vm.createContext({ diagnosticsBody: { innerHTML: "" },
      escapeHtml: String, formatDate: String, diagnosticStatusLabels: {}, reportTypeLabels: {} });
    vm.runInContext(source.slice(source.indexOf("const mailerLiteStatusLabels ="), source.indexOf("const reportTypeLabels ="))
      + source.slice(source.indexOf("const buildFreeDiagnosticToolUrl ="), source.indexOf("const draftResumeUrl ="))
      + "\nthis.renderDiagnostics = renderDiagnostics;", context);
    context.renderDiagnostics(diagnostics);
    assert.match(context.diagnosticsBody.innerHTML, /Synchronisation partielle/);
    assert.doesNotMatch(context.diagnosticsBody.innerHTML, />Synchronisé</);
  } finally { router.restore(); db.sqlite.close(); }
});

test("investigation : finaliser un PDF gratuit n'envoie aucun e-mail et ne synchronise pas MailerLite", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db });
  try {
    const created = await (await subscribe(makeSubscribeContext(db, diagnosticPayload()))).json();
    for (const name of ["0014_audit_drafts.sql", "0015_audit_questionnaire_snapshots.sql"]) {
      db.sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
    }
    db.sqlite.prepare(`INSERT INTO audit_drafts (draft_id, analysis_id, status, report_type,
      answers_version, answers_json, current_step, created_at, updated_at)
      VALUES (?, ?, 'draft', 'free', 'score-efficia-questionnaire-v2', ?, 'questionnaire', ?, ?)`)
      .run("draft-investigation", created.analysisId, JSON.stringify({ questionnaireVersion: "score-efficia-questionnaire-v2", reponses: {} }), "2026-09-15T10:00:00.000Z", "2026-09-15T10:00:00.000Z");
    const callsBefore = router.calls.length;
    assert.equal((await finalizeQuestionnaireSnapshot(db, created.analysisId, { pdfFilename: "test-local.pdf" })).ok, true);
    assert.equal(db.first("SELECT status FROM analyses").status, "pdf_generated");
    assert.equal(db.first("SELECT status FROM diagnostic_requests").status, "awaiting_review");
    assert.equal(router.calls.length, callsBefore);
    assert.equal(marketingPayloads(router).at(-1).fields.audit_status, "diagnostic demandé");
    assert.equal(db.count("order_tasks"), 0);
  } finally { router.restore(); db.sqlite.close(); }
});

test("investigation : la liste gratuite ignore les filtres Stripe et peut masquer les demandes au-delà de la limite", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db });
  try {
    const older = await (await subscribe(makeSubscribeContext(db, diagnosticPayload()))).json();
    db.sqlite.prepare("UPDATE diagnostic_requests SET created_at = '2026-09-01T10:00:00.000Z'").run();
    await subscribe(makeSubscribeContext(db, diagnosticPayload(KEY_TWO)));
    const limited = await diagnosticsInAdmin(db, "?limit=1&search=inconnu&status=completed&environment=live");
    assert.equal(limited.pendingCount, 2);
    assert.equal(limited.diagnostics.length, 1);
    assert.notEqual(limited.diagnostics[0].analysisId, older.analysisId);
    assert.equal((await diagnosticsInAdmin(db, "?limit=100")).diagnostics.length, 2);
  } finally { router.restore(); db.sqlite.close(); }
});

test("investigation : ouvrir le mailto marque une intention, pas le résultat de livraison d'un e-mail", async () => {
  const source = readFileSync(new URL("../js/admin.js", import.meta.url), "utf8");
  const helper = source.slice(source.indexOf("const markEmailSent ="), source.indexOf("const loadOrders ="));
  assert.match(helper, /^const markEmailSent = async/);
  // Le résultat d'un logiciel de messagerie externe n'est jamais transmis au site.
  // On ne simule donc pas un transport SMTP inexistant : seul le clic est observable.
  for (const delivery of ["success", "failure", "cancelled"]) {
    const calls = [];
    const context = vm.createContext({ fetch: async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return Response.json({ success: true }); } });
    vm.runInContext(`${helper}\nthis.markEmailSent = markEmailSent;`, context);
    await context.markEmailSent({ taskId: "local-task", currentStatus: "pdf_generated", currentNotes: "" });
    assert.equal(calls.length, 1, delivery);
    assert.equal(calls[0].url, "/admin/tasks/local-task");
    assert.equal(calls[0].body.status, "pdf_generated");
    assert.match(calls[0].body.notes, /\[audit_email_sent\] Audit ouvert pour envoi/);
    assert.equal(calls[0].body.sent_at, undefined);
  }
});

test("subscribe respecte le contrat POST réel de /api/analyze pour les deux parcours", async () => {
  for (const payload of [diagnosticPayload(), urlOnlyDiagnosticPayload()]) {
    const db = new LocalD1();
    const router = installFetchRouter({ db });
    try {
      const response = await subscribe(makeSubscribeContext(db, payload));
      assert.equal(response.status, 200);

      const call = router.calls.find(({ url }) => new URL(url).pathname === "/api/analyze");
      assert.ok(call);
      assert.equal(call.url, `${PREVIEW_ORIGIN}/api/analyze`);
      assert.equal(call.options.method, "POST");
      const headers = new Headers(call.options.headers);
      assert.equal(headers.get("Authorization"), `Bearer ${TOKEN}`);
      assert.equal(headers.get("Content-Type"), "application/json");
      assert.equal(headers.get("Accept"), "application/json");

      const body = JSON.parse(call.options.body);
      assert.deepEqual(Object.keys(body).sort(), [
        "activite", "diagnosticRequest", "googleBusinessUrl", "nom", "ville",
      ]);
      assert.equal(body.activite, "");
      assert.equal(typeof body.nom, "string");
      assert.equal(typeof body.ville, "string");
      assert.equal(typeof body.googleBusinessUrl, "string");
      assert.deepEqual(Object.keys(body.diagnosticRequest).sort(), [
        "city", "companyName", "email", "firstName", "googleBusinessUrl",
        "idempotencyKey", "requestId",
      ]);
      assert.match(body.diagnosticRequest.requestId, /^[0-9a-f-]{36}$/i);

      if (payload.google_business_url) {
        assert.equal(body.nom, "");
        assert.equal(body.ville, "");
        assert.equal(body.googleBusinessUrl, payload.google_business_url);
      } else {
        assert.equal(body.nom, payload.company_name);
        assert.equal(body.ville, payload.city);
        assert.equal(body.googleBusinessUrl, "");
      }
    } finally {
      router.restore();
    }
  }
});

test("l’intégration détecte un nom de champ incorrect et un champ obligatoire absent", async () => {
  const cases = [
    {
      payload: urlOnlyDiagnosticPayload(),
      transformAnalyzeBody: (body) => {
        const { googleBusinessUrl, ...wrongBody } = body;
        return { ...wrongBody, google_business_link: googleBusinessUrl };
      },
    },
    {
      payload: diagnosticPayload(),
      transformAnalyzeBody: ({ ville, ...body }) => body,
    },
  ];

  for (const scenario of cases) {
    const db = new LocalD1();
    const router = installFetchRouter({ db, transformAnalyzeBody: scenario.transformAnalyzeBody });
    const originalError = console.error;
    const errorCalls = [];
    console.error = (...values) => errorCalls.push(values);
    try {
      const response = await subscribe(makeSubscribeContext(db, scenario.payload));
      assert.equal(response.status, 502);
      assert.equal(db.count("analyses"), 0);
      assert.equal(db.count("diagnostic_requests"), 0);
      const boundaryLog = errorCalls.find(([message]) => message === "Diagnostic request failed.");
      assert.ok(boundaryLog);
      assert.equal(boundaryLog[1].phase, "analysis_request");
      assert.equal(boundaryLog[1].http_status, 400);
      assert.equal(boundaryLog[1].error_code, "MISSING_ANALYSIS_INPUT");
    } finally {
      console.error = originalError;
      router.restore();
    }
  }
});

test("l’intégration conserve un statut 500 et un code fermé renvoyés par /api/analyze", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db, analyzeEnv: { ORDERS_DB: undefined } });
  const originalError = console.error;
  const errorCalls = [];
  console.error = (...values) => errorCalls.push(values);
  try {
    const response = await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    assert.equal(response.status, 502);
    const boundaryLog = errorCalls.find(([message]) => message === "Diagnostic request failed.");
    assert.ok(boundaryLog);
    assert.equal(boundaryLog[1].phase, "analysis_request");
    assert.equal(boundaryLog[1].http_status, 500);
    assert.equal(boundaryLog[1].error_code, "D1_BINDING_MISSING");
    assert.deepEqual(boundaryLog[1].error, { name: null, message: null, cause_message: null });
  } finally {
    console.error = originalError;
    router.restore();
  }
});

test("une ancienne réponse ambiguë non classifiée reste une erreur explicite sans faux succès", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({
    db,
    analyzeBoundaryResponse: () => Response.json({
      error: "AMBIGUOUS_CANDIDATES",
      error_code: "AMBIGUOUS_CANDIDATES",
      candidates: [{ name: "Donnée fournisseur non publique" }],
    }, { status: 409 }),
  });
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      success: false,
      error: "Une erreur est survenue. Merci de réessayer dans quelques instants.",
      error_code: "AMBIGUOUS_CANDIDATES",
    });
    assert.equal(db.count("analyses"), 0);
    assert.equal(db.count("diagnostic_requests"), 0);

    const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
    assert.match(app, /data\?\.error_code === "AMBIGUOUS_CANDIDATES"/);
    assert.match(app, /error\?\.code === "AMBIGUOUS_CANDIDATES"[\s\S]*ambiguousCandidatesMessage[\s\S]*Une erreur est survenue\. Merci de réessayer dans quelques instants\./);
    assert.match(
      app,
      /Plusieurs fiches correspondent à votre recherche\. Indiquez le lien exact de votre fiche Google Business ou précisez davantage le nom de l’entreprise\./,
    );
  } finally {
    console.error = originalError;
    router.restore();
  }
});

test("l’intégration conserve une exception de transport sûre à la frontière analyze", async () => {
  const db = new LocalD1();
  const cause = new Error(`cause pour ${KEY_ONE} à Bruxelles`);
  const analyzeError = new TypeError(
    "transport pour FATIMA@EXAMPLE.COM, Fatima et Entreprise Test via https://www.google.com/maps/place/Test",
    { cause },
  );
  const router = installFetchRouter({ db, analyzeError });
  const originalError = console.error;
  const errorCalls = [];
  console.error = (...values) => errorCalls.push(values);
  try {
    const response = await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    assert.equal(response.status, 502);
    const boundaryLog = errorCalls.find(([message]) => message === "Diagnostic request failed.");
    assert.ok(boundaryLog);
    assert.equal(boundaryLog[1].phase, "analysis_request");
    assert.equal(boundaryLog[1].http_status, null);
    assert.equal(boundaryLog[1].error_code, "ANALYZE_FETCH_FAILED");
    assert.equal(boundaryLog[1].error.name, "TypeError");
    assert.match(boundaryLog[1].error.message, /\[redacted\]/);
    assert.match(boundaryLog[1].error.cause_message, /\[redacted-id\]/);
    assert.doesNotMatch(
      JSON.stringify(errorCalls),
      /Fatima|fatima@example\.com|Entreprise Test|Bruxelles|google\.com|51ed6ee4/i,
    );
  } finally {
    console.error = originalError;
    router.restore();
  }
});

test("la frontière conserve un refus HTTP non JSON sans journaliser sa réponse brute", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({
    db,
    analyzeBoundaryResponse: () => new Response("<html>access denied</html>", {
      status: 403,
      headers: { "Content-Type": "text/html" },
    }),
  });
  const originalError = console.error;
  const errorCalls = [];
  console.error = (...values) => errorCalls.push(values);
  try {
    const response = await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    assert.equal(response.status, 502);
    const boundaryLog = errorCalls.find(([message]) => message === "Diagnostic request failed.");
    assert.ok(boundaryLog);
    assert.equal(boundaryLog[1].phase, "analysis_request");
    assert.equal(boundaryLog[1].http_status, 403);
    assert.equal(boundaryLog[1].error_code, "ANALYZE_FORBIDDEN");
    assert.doesNotMatch(JSON.stringify(errorCalls), /access denied|<html>/i);
  } finally {
    console.error = originalError;
    router.restore();
  }
});

test("un échec D1 empêche la confirmation et ne laisse aucune analyse orpheline", async () => {
  const db = new LocalD1({ failBatch: true });
  const router = installFetchRouter({ db });
  const originalError = console.error;
  const errorCalls = [];
  console.error = (...values) => errorCalls.push(values);
  try {
    const response = await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    const data = await response.json();
    assert.equal(response.status, 502);
    assert.deepEqual(data, {
      success: false,
      error: "Une erreur est survenue. Merci de réessayer dans quelques instants.",
    });
    assert.equal(db.count("analyses"), 0);
    assert.equal(db.count("diagnostic_requests"), 0);
    assert.equal(db.count("orders"), 0);
    assert.equal(db.count("order_tasks"), 0);
    assert.equal(router.calls.some(({ url }) => url.includes("connect.mailerlite.com")), false);

    const d1Log = errorCalls.find(([message]) => message === "analyze: D1 persistence failed");
    assert.ok(d1Log);
    assert.deepEqual(Object.keys(d1Log[1]).sort(), ["cause_message", "message", "name", "phase"]);
    assert.equal(d1Log[1].phase, "atomic_batch");
    assert.equal(d1Log[1].name, "Error");
    assert.equal(d1Log[1].message, "local_batch_failure");
    const boundaryLog = errorCalls.find(([message]) => message === "Diagnostic request failed.");
    assert.ok(boundaryLog);
    assert.equal(boundaryLog[1].phase, "analysis_request");
    assert.equal(boundaryLog[1].http_status, 500);
    assert.equal(boundaryLog[1].error_code, "D1_PERSISTENCE_FAILED");
    assert.doesNotMatch(JSON.stringify(errorCalls), /Fatima|fatima@example\.com|Entreprise Test|Bruxelles/i);
  } finally {
    console.error = originalError;
    router.restore();
  }
});

test("un échec benchmark n’est pas attribué à tort à la création D1", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db, benchmarkOk: false });
  const originalError = console.error;
  const errorCalls = [];
  console.error = (...values) => errorCalls.push(values);
  try {
    const response = await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    assert.equal(response.status, 502);
    assert.equal(db.count("analyses"), 1);
    assert.equal(db.count("diagnostic_requests"), 1);
    assert.equal(router.calls.some(({ url }) => url.includes("connect.mailerlite.com")), false);
    assert.ok(errorCalls.some(([message, details]) => (
      message === "Diagnostic request failed." && details?.phase === "benchmark_request"
    )));
    assert.equal(errorCalls.some(([message]) => /D1 analysis creation failed/.test(message)), false);
  } finally {
    console.error = originalError;
    router.restore();
  }
});

test("une URL Google Business valide suffit sans entreprise ni ville", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db });
  try {
    const response = await subscribe(makeSubscribeContext(db, urlOnlyDiagnosticPayload()));
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.success, true);
    assert.equal(db.count("analyses"), 1);
    assert.equal(db.first("SELECT google_business_url FROM diagnostic_requests").google_business_url,
      "https://www.google.com/maps/place/Entreprise+Test");
  } finally {
    router.restore();
  }
});

test("les champs D1 facultatifs absents sont liés à null dans les deux parcours", async () => {
  for (const payload of [diagnosticPayload(), urlOnlyDiagnosticPayload()]) {
    const db = new LocalD1();
    const router = installFetchRouter({ db, sparseBusiness: true });
    try {
      const response = await subscribe(makeSubscribeContext(db, payload));
      const data = await response.json();
      assert.equal(response.status, 200);
      assert.equal(data.success, true);
      assert.equal(db.count("analyses"), 1);
      assert.equal(db.count("diagnostic_requests"), 1);

      const inserts = db.boundStatements.filter(({ sql }) => /INSERT INTO (?:analyses|diagnostic_requests)/.test(sql));
      assert.equal(inserts.length, 2);
      for (const { params } of inserts) {
        assert.equal(params.includes(undefined), false);
      }

      const analysis = db.first("SELECT nom, ville, query, place_id, rating, reviews, photos_count FROM analyses");
      assert.ok(analysis.nom.trim());
      assert.ok(analysis.ville.trim());
      assert.ok(analysis.query.trim());
      assert.equal(analysis.place_id, null);
      assert.equal(analysis.rating, null);
      assert.equal(analysis.reviews, null);
      assert.equal(analysis.photos_count, null);
    } finally {
      router.restore();
    }
  }
});

test("un échec MailerLite conserve l’analyse et marque seulement sa synchronisation", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db, mailerLiteOk: false });
  try {
    const response = await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.success, true);
    assert.ok(data.analysisId);
    assert.equal(db.count("analyses"), 1);
    assert.equal(db.count("diagnostic_requests"), 1);
    assert.equal(db.first("SELECT mailerlite_status FROM diagnostic_requests").mailerlite_status, "failed");
  } finally {
    router.restore();
  }
});

test("la route admin retrouve le contexte D1 et le refuse sans session", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db });
  try {
    const created = await (await subscribe(makeSubscribeContext(db, diagnosticPayload()))).json();
    const cookie = (await createSessionCookie({ ADMIN_SESSION_SECRET: ADMIN_SECRET })).split(";")[0];
    const authenticated = await getDiagnosticContext({
      request: new Request(`https://local.test/api/admin/free-diagnostic-context/${created.analysisId}`, {
        headers: { Cookie: cookie },
      }),
      params: { analysisId: created.analysisId },
      env: { ADMIN_SESSION_SECRET: ADMIN_SECRET, ORDERS_DB: db },
    });
    const body = await authenticated.json();
    assert.equal(authenticated.status, 200);
    assert.equal(body.context.email, "fatima@example.com");
    assert.equal(body.context.company, "Entreprise Test");

    const unauthorized = await getDiagnosticContext({
      request: new Request(`https://local.test/api/admin/free-diagnostic-context/${created.analysisId}`),
      params: { analysisId: created.analysisId },
      env: { ADMIN_SESSION_SECRET: ADMIN_SECRET, ORDERS_DB: db },
    });
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { success: false, error: "UNAUTHORIZED" });
  } finally {
    router.restore();
  }
});

test("le navigateur ne transmet la clé et les données que dans le corps POST", async () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /idempotency_key: getDiagnosticIdempotencyKey\(\)/);
  assert.match(app, /window\.crypto\.randomUUID\(\)/);
  assert.doesNotMatch(app, /URLSearchParams[\s\S]{0,300}(?:idempotency|firstName|email|company|city|googleBusiness)/);
  assert.match(app, /await Promise\.all\(\[submitLeadRequest\(payload\), wait\(650\)\]\);[\s\S]*diagnostic_submitted[\s\S]*showStep\(3\);[\s\S]*diagnostic_confirmation_view/);
  assert.doesNotMatch(app, /trackAnalyticsEvent\?\.\("diagnostic_result_view"\)/);
});

test("le parcours public ne journalise aucune donnée personnelle", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db });
  const originalLog = console.log;
  const originalError = console.error;
  const logs = [];
  console.log = (...values) => logs.push(values.join(" "));
  console.error = (...values) => logs.push(values.join(" "));
  try {
    const response = await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    assert.equal(response.status, 200);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    router.restore();
  }
  const output = logs.join("\n");
  assert.doesNotMatch(output, /Fatima|fatima@example\.com|Entreprise Test|Bruxelles/i);
});
