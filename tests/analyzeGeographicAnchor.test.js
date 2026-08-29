// Mission "étendre le correctif d'ancrage géographique à /api/analyze".
//
// Cas réel découvert en Preview (analysisId b612daa1-7c1a-4842-bc48-
// 122f4106dca2, conservé tel quel comme preuve du bug initial — jamais
// réutilisé ici) : le bouton « Nouvel audit » du back-office (formulaire
// admin/new-audit) ne passe PAS par free-diagnostic-collect/[analysisId].js
// pour sa toute première collecte. Il passe par functions/api/admin/
// audits.js, qui appelle en HTTP interne functions/api/analyze.js (étape
// "observation" du pipeline) — un point d'entrée resté hors du périmètre
// de la mission "ancrage géographique" jusqu'à cette correction : la
// recherche concurrentielle y était lancée sans coordinates ni region,
// sans même le bug d'origine (coordonnées de l'entreprise) — simplement
// aucune protection géographique du tout.
//
// Ces tests exercent le VRAI parcours HTTP interne audits.js -> analyze.js
// (via le vrai onRequestPost des deux fichiers, jamais un stub qui
// remplacerait analyze.js — voir installRealPipelineRouter ci-dessous),
// avec une base D1 en mémoire réelle (mêmes migrations que la production).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { createSessionCookie } from "../functions/admin/_shared.js";
import { onRequestPost as createAudit } from "../functions/api/admin/audits.js";
import { onRequestPost as analyze } from "../functions/api/analyze.js";
import { onRequestPost as benchmark } from "../functions/api/benchmark.js";

const ADMIN_SECRET = "analyze-geo-anchor-test-secret";
const CONNECTOR_TOKEN = "analyze-geo-anchor-connector-token";
const OUTSCRAPER_KEY = "analyze-geo-anchor-outscraper-key";
const PREVIEW_ORIGIN = "https://branch.efficiadigital.pages.dev";

const migrations = [
  "0001_orders_tasks.sql", "0002_audit_production_tracking.sql", "0003_analyses.sql",
  "0004_analysis_competitors.sql", "0005_analysis_benchmark.sql", "0006_analysis_knowledge.sql",
  "0007_analysis_reasoning_composer.sql", "0008_order_analysis_link.sql", "0009_manual_review_gate.sql",
  "0010_analysis_report_type.sql", "0011_score_efficia_historical.sql", "0012_order_cgv_acceptance.sql",
  "0013_diagnostic_requests.sql", "0014_audit_drafts.sql", "0015_audit_questionnaire_snapshots.sql",
  "0016_admin_manual_audits.sql",
];

class LocalD1 {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    migrations.forEach((name) => {
      this.sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
    });
  }

  prepare(sql) {
    const database = this.sqlite;
    const bound = (params = []) => ({
      bind: (...nextParams) => bound(nextParams),
      first: async () => database.prepare(sql).get(...params) || null,
      all: async () => ({ results: database.prepare(sql).all(...params) }),
      run: async () => {
        const result = database.prepare(sql).run(...params);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    });
    return bound();
  }

  row(analysisId) {
    return this.sqlite.prepare("SELECT * FROM analyses WHERE analysis_id = ?").get(analysisId);
  }
}

async function cookie() {
  return (await createSessionCookie({ ADMIN_SESSION_SECRET: ADMIN_SECRET })).split(";")[0];
}

async function auditsContext(db, body) {
  return {
    request: new Request(`${PREVIEW_ORIGIN}/api/admin/audits`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: PREVIEW_ORIGIN, Cookie: await cookie() },
      body: JSON.stringify(body),
    }),
    env: { ADMIN_SESSION_SECRET: ADMIN_SECRET, CONNECTOR_TOKEN, ORDERS_DB: db },
  };
}

// Reproduit exactement le cas réel Computelec : Le Sart 18/3, 6840
// Neufchâteau, Belgique — épingle propre à Computelec (49.816779999999994,
// 5.449034, voir COMPUTELEC_LOCATION_LINK dans les autres suites de cette
// mission) délibérément DIFFÉRENTE du centre neutre de Neufchâteau utilisé
// pour mesurer le classement.
const COMPUTELEC_FICHE = {
  name: "Computelec",
  place_id: "place-computelec",
  category: "Électricien",
  type: "Électricien",
  city: "Neufchâteau",
  postal_code: "6840",
  country: "Belgique",
  country_code: "BE",
  latitude: 49.816779999999994,
  longitude: 5.449034,
  location_link: "https://www.google.com/maps/place/Computelec/@49.816779999999994,5.449034,14z",
  rating: 4.7,
  reviews: 22,
  photos_count: 9,
};
const NEUFCHATEAU_CENTER = { lat: 49.8419, lng: 5.4342 };

function installRealPipelineRouter({
  db, fiche = COMPUTELEC_FICHE, competitors = [], geocodingOk = true, geocodingCenter = NEUFCHATEAU_CENTER,
}) {
  const originalFetch = globalThis.fetch;
  const calls = { geocoding: 0, competitorSearch: 0, businessLookup: 0 };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));

    // Étape "observation" du pipeline (audits.js -> analyze.js) : appel HTTP
    // interne réel, jamais stubbé — c'est exactement le chemin exercé par le
    // bouton « Nouvel audit » du back-office.
    if (url.pathname === "/api/analyze") {
      return analyze({
        request: new Request(url, options),
        env: { CONNECTOR_TOKEN, OUTSCRAPER_API_KEY: OUTSCRAPER_KEY, ORDERS_DB: db },
      });
    }
    if (url.pathname === "/api/benchmark") {
      return benchmark({
        request: new Request(url, options),
        env: { CONNECTOR_TOKEN, ORDERS_DB: db },
      });
    }

    // Geocoding du centre neutre de la localité — hôte distinct
    // (api.outscraper.com) de la recherche d'identification/concurrentielle
    // (api.app.outscraper.com), voir localityGeocoder.js.
    if (url.hostname === "api.outscraper.com") {
      calls.geocoding += 1;
      if (!geocodingOk) return new Response("geocoding-down", { status: 500 });
      return Response.json({
        data: [[{
          latitude: geocodingCenter.lat, longitude: geocodingCenter.lng,
          city: fiche.city, postal_code: fiche.postal_code, country_code: fiche.country_code,
        }]],
      });
    }

    // Identification (Appel A, organizationsPerQueryLimit=5) vs recherche
    // concurrentielle (Appel B, organizationsPerQueryLimit=10) — même
    // distinction que collectFiche.js/collectCompetitors.js.
    const isCompetitorRequest = url.searchParams.get("organizationsPerQueryLimit") === "10";
    if (isCompetitorRequest) {
      calls.competitorSearch += 1;
      return Response.json({ data: [competitors] });
    }
    calls.businessLookup += 1;
    return Response.json({ data: [[fiche]] });
  };
  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

function competitorsPanel() {
  return [
    { name: "Concurrent BE 1", place_id: "place-be-1", rating: 4.1, reviews: 12, city: "Neufchâteau" },
    { name: "Concurrent BE 2", place_id: "place-be-2", rating: 4.0, reviews: 10, city: "Neufchâteau" },
    { name: "Concurrent BE 3", place_id: "place-be-3", rating: 3.9, reviews: 8, city: "Neufchâteau" },
    // Pas de champ "rank" fournisseur ici : la position observée doit donc
    // provenir de l'index brut renvoyé par Outscraper (aucune classification
    // sponsorisée dans ce panel), position 1-based = index + 1 = 4.
    { ...COMPUTELEC_FICHE },
  ];
}

function newAuditPayload(idempotencyKey) {
  return {
    operation: "create_manual_audit",
    reportType: "free",
    idempotencyKey,
    companyName: "Computelec",
    city: "Neufchâteau",
  };
}

test("succès — ancrage neutre mémorisé, requête visible inchangée, coordonnées distinctes de l'épingle de Computelec", async () => {
  const db = new LocalD1();
  const router = installRealPipelineRouter({ db, competitors: competitorsPanel() });
  try {
    const response = await createAudit(await auditsContext(db, newAuditPayload("analyze-geo-anchor-000001")));
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.success, true);
    assert.equal(body.created, true);

    const row = db.row(body.analysisId);
    assert.ok(row, "la ligne doit exister en base");

    // Requête visible : jamais réécrite, jamais enrichie du code postal ou du pays.
    assert.equal(row.search_query, "Électricien Neufchâteau");
    assert.doesNotMatch(row.search_query, /6840|Belgique|Belgium/);

    const normalized = JSON.parse(row.normalized_json);
    assert.ok(normalized.geographic_anchor, "geographic_anchor doit être mémorisé");
    assert.equal(normalized.geographic_anchor.tier, 1);
    assert.equal(normalized.geographic_anchor.region, "BE");
    assert.equal(normalized.geographic_anchor.coordinates, "49.8419,5.4342");
    // Preuve directe : jamais l'épingle propre à Computelec.
    assert.notEqual(normalized.geographic_anchor.coordinates, "49.816779999999994,5.449034");
    assert.equal(normalized.geographic_anchor.locality.city, "Neufchâteau");
    assert.equal(normalized.geographic_anchor.locality.postalCode, "6840");
    assert.equal(normalized.geographic_anchor.locality.countryCode, "BE");

    // La recherche a bien eu lieu (position et concurrents réellement écrits).
    assert.ok(row.local_position !== null);
    assert.ok(JSON.parse(row.competitors_json).length > 0);
    // La fiche analysée ne doit jamais apparaître dans ses propres concurrents.
    assert.ok(!JSON.parse(row.competitors_json).some((c) => c.place_id === "place-computelec"));

    assert.equal(router.calls.geocoding, 1);
    assert.equal(router.calls.competitorSearch, 1);
  } finally {
    router.restore();
  }
});

test("échec du géocodage — aucun appel à la recherche concurrentielle, aucune donnée de classement écrite", async () => {
  const db = new LocalD1();
  const router = installRealPipelineRouter({ db, competitors: competitorsPanel(), geocodingOk: false });
  try {
    const response = await createAudit(await auditsContext(db, newAuditPayload("analyze-geo-anchor-000002")));
    const body = await response.json();
    // L'identification de la fiche reste possible (utile pour la validation
    // manuelle) même sans ancrage — comme free-diagnostic-collect/
    // [analysisId].js pour sa collecte initiale : ce n'est pas un blocage
    // total de la création, seulement de la recherche concurrentielle.
    assert.equal(response.status, 200, JSON.stringify(body));

    const row = db.row(body.analysisId);
    assert.ok(row, "la fiche identifiée doit malgré tout être enregistrée");

    // Aucune donnée de classement trompeuse : ni requête testée, ni position,
    // ni concurrents, ni ancrage mémorisé.
    assert.equal(row.search_query, null);
    assert.equal(row.local_position, null);
    assert.deepEqual(JSON.parse(row.competitors_json), []);
    const normalized = JSON.parse(row.normalized_json);
    assert.equal(normalized.geographic_anchor, undefined);

    // Preuve directe : la recherche concurrentielle n'a jamais été appelée.
    assert.equal(router.calls.geocoding, 1, "le geocoding doit avoir été tenté une fois");
    assert.equal(router.calls.competitorSearch, 0, "aucun appel à la recherche concurrentielle après un échec de geocoding");
  } finally {
    router.restore();
  }
});

test("échec du géocodage — jamais un repli vers les coordonnées de Computelec ni vers un paramètre region seul", async () => {
  const db = new LocalD1();
  // Réponse de geocoding incohérente avec la localité attendue (mauvais
  // pays) plutôt qu'une erreur HTTP : preuve que la validation stricte du
  // résultat (pas seulement l'échec réseau) bloque aussi ce chemin.
  const originalFetch = globalThis.fetch;
  let competitorSearchCalled = false;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/analyze") {
      return analyze({
        request: new Request(url, options),
        env: { CONNECTOR_TOKEN, OUTSCRAPER_API_KEY: OUTSCRAPER_KEY, ORDERS_DB: db },
      });
    }
    if (url.pathname === "/api/benchmark") {
      return benchmark({ request: new Request(url, options), env: { CONNECTOR_TOKEN, ORDERS_DB: db } });
    }
    if (url.hostname === "api.outscraper.com") {
      // Localité homonyme : Neufchâteau (France, 88300) renvoyée pour une
      // requête concernant Neufchâteau (Belgique, 6840).
      return Response.json({
        data: [[{ latitude: 48.3568, longitude: 5.6961, city: "Neufchâteau", postal_code: "88300", country_code: "FR" }]],
      });
    }
    const isCompetitorRequest = url.searchParams.get("organizationsPerQueryLimit") === "10";
    if (isCompetitorRequest) {
      competitorSearchCalled = true;
      return Response.json({ data: [competitorsPanel()] });
    }
    return Response.json({ data: [[COMPUTELEC_FICHE]] });
  };
  try {
    const response = await createAudit(await auditsContext(db, newAuditPayload("analyze-geo-anchor-000003")));
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));

    const row = db.row(body.analysisId);
    assert.equal(row.search_query, null);
    assert.equal(row.local_position, null);
    assert.deepEqual(JSON.parse(row.competitors_json), []);
    assert.equal(competitorSearchCalled, false);

    const normalized = JSON.parse(row.normalized_json);
    assert.equal(normalized.geographic_anchor, undefined);
    // Jamais les coordonnées propres à Computelec en secours.
    assert.notEqual(normalized.latitude, 49.816779999999994);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
