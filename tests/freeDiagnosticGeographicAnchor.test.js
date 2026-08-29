// Mission "ancrage géographique automatique de la recherche concurrentielle
// du diagnostic gratuit". Cas réel de référence :
//   Entreprise : Computelec — Le Sart 18/3, 6840 Neufchâteau, Belgique.
//   Requête admin : "Électricien Neufchâteau" (sans code postal ni pays).
//   Sans ancrage, Outscraper renvoie principalement des entreprises de
//   Neufchâteau (Vosges, France) ; avec l'ancrage automatique résolu à
//   partir des données déjà vérifiées côté serveur, la recherche fournisseur
//   est biaisée vers la Belgique — sans jamais réécrire la requête visible.
//
// Ces tests couvrent, via le vrai handler HTTP (onRequestPost) et une base
// D1 en mémoire réelle (mêmes migrations que la production) :
//  1. "Électricien Neufchâteau" reste la requête visible ;
//  2. Computelec ancrée automatiquement à Neufchâteau 6840, Belgique ;
//  3. l'ancrage réellement envoyé au fournisseur est distinct de la requête
//     affichée (séparation obligatoire) — c'est ce mécanisme qui garantit
//     qu'aucune entreprise des Vosges n'apparaît dans le panel belge ;
//  6. une requête personnalisée n'est jamais remplacée par une longue
//     chaîne enrichie ;
//  7. la duplication duplicate_manual conserve l'ancrage ;
//  8. l'absence d'ancrage bloque proprement la génération (pas d'appel
//     fournisseur, pas d'écriture partielle) ;
//  9. un échec fournisseur (une fois l'ancrage résolu) ne modifie rien
//     partiellement ;
//  10. le moteur de score n'est jamais touché par cette mission ;
//  11. aucun secret ni paramètre sensible n'est exposé au navigateur.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

import { createSessionCookie } from "../functions/admin/_shared.js";
import { onRequestPost as collectDiagnostic } from "../functions/api/admin/free-diagnostic-collect/[analysisId].js";
import { onRequestPatch as approveDiagnostic } from "../functions/api/admin/audit-review/[analysisId].js";
import { GRILLE } from "../functions/lib/score-efficia/criteriaCatalog.js";

const ADMIN_SECRET = "geo-anchor-test-secret";
const ANALYSIS_ID = "analysis-geo-anchor-computelec";
const migrations = [
  "0001_orders_tasks.sql", "0002_audit_production_tracking.sql", "0003_analyses.sql",
  "0004_analysis_competitors.sql", "0005_analysis_benchmark.sql", "0006_analysis_knowledge.sql",
  "0007_analysis_reasoning_composer.sql", "0008_order_analysis_link.sql", "0009_manual_review_gate.sql",
  "0010_analysis_report_type.sql", "0011_score_efficia_historical.sql", "0012_order_cgv_acceptance.sql",
  "0013_diagnostic_requests.sql", "0014_audit_drafts.sql", "0016_admin_manual_audits.sql",
];

const COMPUTELEC_LOCATION_LINK = "https://www.google.com/maps/place/Computelec/@49.816779999999994,5.449034,14z/data=!4m8!1m2!2m1!1sComputelec!3m4!1s0x821e9402e9f2375b:0x3706196cb9aab69b!8m2!3d49.816779999999994!4d5.449034";

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
      all: async () => ({ results: database.prepare(sql).all(...params) }),
      first: async () => database.prepare(sql).get(...params) || null,
      run: async () => database.prepare(sql).run(...params),
    });
    return bound();
  }
}

function seedAnalysis(db, {
  analysisId = ANALYSIS_ID, status = "awaiting_review", companyName = "Computelec", city = "Neufchâteau",
} = {}) {
  const now = "2026-08-27T09:00:00.000Z";
  db.sqlite.prepare(`
    INSERT INTO analyses (
      analysis_id, nom, ville, query, activity, status, created_at, updated_at, report_type
    ) VALUES (?, ?, 'Non renseignée', ?, 'Électricien', ?, ?, ?, 'free')
  `).run(analysisId, companyName, `${companyName} ${city}`, status, now, now);
}

function seedManualMetadata(db, analysisId, { creationSource = "admin_manual", auditType = "free" } = {}) {
  const now = "2026-08-27T09:05:00.000Z";
  db.sqlite.prepare(`
    INSERT INTO audit_creation_metadata (
      idempotency_key, analysis_id, creation_source, audit_type,
      billing_status, request_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'not_applicable', 'completed', ?, ?)
  `).run(`meta-${analysisId}`, analysisId, creationSource, auditType, now, now);
}

// Reproduit la fiche identifiée à l'Appel A (collectFiche/mapPlace) telle
// qu'elle serait réellement persistée après la mission "ancrage
// géographique" (latitude/longitude/postal_code/country/country_code
// désormais capturés — voir functions/lib/collectFiche.js).
function marksInitialCollection(db, analysisId = ANALYSIS_ID, {
  companyName = "Computelec", city = "Neufchâteau", geo = {},
} = {}) {
  const fiche = JSON.stringify({
    name: companyName, place_id: "place-computelec", city, category: "Électricien",
    location_link: geo.locationLink || "",
    latitude: geo.latitude ?? null, longitude: geo.longitude ?? null,
    postal_code: geo.postalCode || "", country: geo.country || "", country_code: geo.countryCode || "",
  });
  const normalized = JSON.stringify({
    name: companyName, place_id: "place-computelec", city, category: "Électricien", observed_fields: [],
    location_link: geo.locationLink || "",
    latitude: geo.latitude ?? null, longitude: geo.longitude ?? null,
    postal_code: geo.postalCode || "", country: geo.country || "", country_code: geo.countryCode || "",
  });
  db.sqlite.prepare(`
    UPDATE analyses
    SET name = ?, place_id = 'place-computelec', rating = 4.7, reviews = 22, photos_count = 9,
        description_length = 40, fiche_json = ?, normalized_json = ?
    WHERE analysis_id = ?
  `).run(companyName, fiche, normalized, analysisId);
}

async function cookie() {
  return (await createSessionCookie({ ADMIN_SESSION_SECRET: ADMIN_SECRET })).split(";")[0];
}

async function context(db, analysisId = ANALYSIS_ID, { authenticated = true, body = {} } = {}) {
  return {
    request: new Request(`https://preview.local/api/admin/free-diagnostic-collect/${analysisId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authenticated ? { Cookie: await cookie() } : {}),
      },
      body: JSON.stringify(body),
    }),
    params: { analysisId },
    env: {
      ADMIN_SESSION_SECRET: ADMIN_SECRET,
      ORDERS_DB: db,
      OUTSCRAPER_API_KEY: "simulated-provider-key",
    },
  };
}

function refreshBody(overrides = {}) {
  return {
    operation: "refresh_search",
    analysisId: ANALYSIS_ID,
    company: "Computelec",
    city: "Neufchâteau",
    activity: "Électricien",
    searchQuery: "Électricien Neufchâteau",
    ...overrides,
  };
}

// Correctif "corriger la méthode d'ancrage géographique" — le point neutre
// (centre de la localité Neufchâteau/6840/Belgique, résolu par geocoding)
// est délibérément DIFFÉRENT de l'épingle propre à Computelec
// (49.816779999999994,5.449034, voir COMPUTELEC_LOCATION_LINK) : la preuve
// même que le classement n'est plus mesuré depuis l'entreprise analysée.
const NEUFCHATEAU_BE_CENTER = {
  lat: 49.8419, lng: 5.4342, city: "Neufchâteau", postalCode: "6840", countryCode: "BE",
};

// Réponse de geocoding réaliste — doit inclure city/postal_code/country_code
// pour satisfaire la validation stricte de resolveLocalityCenter
// (localityGeocoder.js) : un point sans ces champs cohérents avec la
// localité attendue est désormais rejeté (plus de repli silencieux).
function geocodingResponseFor(center) {
  return Response.json({
    data: [[{
      latitude: center.lat, longitude: center.lng,
      city: center.city, postal_code: center.postalCode, country_code: center.countryCode,
    }]],
  });
}

// L'endpoint réel de geocoding (https://api.outscraper.com/geocoding) est
// sur un hôte différent de celui de la recherche concurrentielle
// (api.app.outscraper.com/maps/search-v3) — voir localityGeocoder.js. Le
// routage des fixtures se fait donc par hostname, jamais par pathname.
function isGeocodingRequest(url) {
  return url.hostname === "api.outscraper.com";
}

// Capture la requête réellement envoyée au fournisseur pour la recherche
// concurrentielle (URL complète, donc les paramètres query/coordinates/
// region) — jamais celle du geocoding préalable (voir resolveLocalityCenter,
// localityGeocoder.js), qui répond séparément avec le centre neutre de la
// localité — tout en simulant une réponse Outscraper réaliste où Computelec
// apparaît en 9e position (cas réel).
function installProviderFixtureCapturingRequest(onRequest, { center = NEUFCHATEAU_BE_CENTER } = {}) {
  const originalFetch = globalThis.fetch;
  const before = Array.from({ length: 8 }, (_, index) => ({
    name: `Concurrent BE ${index + 1}`, place_id: `place-be-${index}`, rating: 4.1, reviews: 12, city: "Neufchâteau",
  }));
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (isGeocodingRequest(url)) return geocodingResponseFor(center);
    onRequest(String(input));
    return Response.json({
      data: [[
        ...before,
        { name: "Computelec", place_id: "place-computelec", rating: 4.7, reviews: 22, photos_count: 9, city: "Neufchâteau" },
      ]],
    });
  };
  return () => { globalThis.fetch = originalFetch; };
}

// Simule un échec du FOURNISSEUR DE RECHERCHE (search-v3) une fois
// l'ancrage géographique déjà résolu avec succès — le geocoding (hôte
// distinct) continue de répondre correctement, pour isoler précisément le
// cas "l'ancrage est connu, mais Outscraper échoue ensuite sur la
// recherche concurrentielle elle-même" (test 9), distinct du cas "le
// geocoding lui-même échoue" (couvert par tests/localityGeocoder.test.js
// et tests/geographicAnchor.test.js).
function installFailingProviderFixture({ center = NEUFCHATEAU_BE_CENTER } = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (isGeocodingRequest(url)) return geocodingResponseFor(center);
    return new Response("provider-down", { status: 500 });
  };
  return () => { globalThis.fetch = originalFetch; };
}

// --- 1 & 6. La requête visible/personnalisée n'est jamais réécrite ---

test("1&6. « Électricien Neufchâteau » reste la requête visible et n’est jamais enrichie", async () => {
  const db = new LocalD1();
  seedAnalysis(db);
  seedManualMetadata(db, ANALYSIS_ID);
  marksInitialCollection(db, ANALYSIS_ID, {
    geo: { locationLink: COMPUTELEC_LOCATION_LINK, postalCode: "6840", country: "Belgique", countryCode: "BE" },
  });
  let capturedUrl = "";
  const restoreFetch = installProviderFixtureCapturingRequest((url) => { capturedUrl = url; });
  try {
    const response = await collectDiagnostic(await context(db, ANALYSIS_ID, { body: refreshBody() }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.business.searchQuery, "Électricien Neufchâteau");
    const sentQuery = new URL(capturedUrl).searchParams.get("query");
    assert.equal(sentQuery, "Électricien Neufchâteau");
    assert.doesNotMatch(sentQuery, /6840|Belgique|Belgium/);
  } finally {
    restoreFetch();
  }
});

// --- 2. Computelec ancrée automatiquement à Neufchâteau 6840, Belgique ---

test("2. Computelec est ancrée automatiquement à Neufchâteau 6840, Belgique", async () => {
  const db = new LocalD1();
  seedAnalysis(db);
  seedManualMetadata(db, ANALYSIS_ID);
  marksInitialCollection(db, ANALYSIS_ID, {
    geo: { locationLink: COMPUTELEC_LOCATION_LINK, postalCode: "6840", country: "Belgique", countryCode: "BE" },
  });
  let capturedUrl = "";
  const restoreFetch = installProviderFixtureCapturingRequest((url) => { capturedUrl = url; });
  try {
    const response = await collectDiagnostic(await context(db, ANALYSIS_ID, { body: refreshBody() }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.business.geographicAnchor.label, "6840 Neufchâteau, Belgique");
    assert.equal(body.business.geographicAnchor.tier, 1);
    assert.equal(body.business.geographicAnchor.region, "BE");
    const params = new URL(capturedUrl).searchParams;
    // Le centre neutre de Neufchâteau (geocoding de la localité) — jamais
    // l'épingle propre à Computelec (49.816779999999994,5.449034) : c'est la
    // preuve directe du correctif "corriger la méthode d'ancrage
    // géographique" (l'entreprise analysée n'est plus jamais le point de mesure).
    assert.equal(params.get("coordinates"), "49.8419,5.4342");
    assert.notEqual(params.get("coordinates"), "49.816779999999994,5.449034");
    assert.equal(params.get("region"), "BE");
  } finally {
    restoreFetch();
  }
});

// --- 2bis. La collecte concurrentielle automatique INITIALE (création, ---
// --- pas uniquement refresh_search) utilise le même résolveur/les mêmes ---
// --- règles que la relance. -----------------------------------------------
// Point 2 (revue) : preuve directe, par un test d'intégration appelant le
// VRAI onRequestPost sans jamais passer par `operation: "refresh_search"`,
// que la première collecte (celle déclenchée automatiquement après une
// demande de diagnostic gratuit) résout aussi l'ancrage géographique via
// `resolveGeographicAnchor`, transmet `coordinates`/`region` à Outscraper
// pour l'Appel B (recherche concurrentielle), et persiste
// `normalized_json.geographic_anchor` via le même `buildGeographicAnchorRecord`
// que `refreshSearchAnalysis` — jamais une seconde implémentation
// divergente. La requête visible reste "Électricien Neufchâteau", jamais
// enrichie du code postal ou du pays, exactement comme pour la relance.

function seedDiagnosticRequest(db, analysisId = ANALYSIS_ID, {
  companyName = "Computelec", city = "Neufchâteau",
} = {}) {
  const now = "2026-08-27T08:55:00.000Z";
  db.sqlite.prepare(`
    INSERT INTO diagnostic_requests (
      request_id, idempotency_key, analysis_id, first_name, email, company_name, city,
      google_business_url, status, mailerlite_status, created_at, updated_at
    ) VALUES (?, ?, ?, 'Fatima', 'fatima@example.com', ?, ?, NULL, 'awaiting_review', 'synced', ?, ?)
  `).run(`request-${analysisId}`, `idem-${analysisId}`, analysisId, companyName, city, now, now);
}

// Distingue l'Appel A (identification, requête "Computelec Neufchâteau")
// de l'Appel B (recherche concurrentielle, requête "Électricien
// Neufchâteau") par le paramètre `query` — même principe que
// `installProviderFixture` dans tests/freeDiagnosticAdminSecurity.test.js.
// L'Appel A renvoie une fiche géo-riche (location_link Google Maps réel de
// Computelec, code postal, pays) : c'est cette fiche fraîchement identifiée
// — jamais un ancrage saisi ou deviné — qui doit ensuite alimenter l'Appel B.
function installInitialCollectionProviderFixture(onCompetitorRequest, { center = NEUFCHATEAU_BE_CENTER } = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (isGeocodingRequest(url)) return geocodingResponseFor(center);
    const query = url.searchParams.get("query") || "";
    if (query === "Computelec Neufchâteau") {
      return Response.json({
        data: [[{
          name: "Computelec", place_id: "place-computelec", rating: 4.7, reviews: 22, photos_count: 9,
          city: "Neufchâteau", category: "Électricien",
          location_link: COMPUTELEC_LOCATION_LINK,
          postal_code: "6840", country: "Belgique", country_code: "BE",
        }]],
      });
    }
    onCompetitorRequest(url.toString());
    const before = Array.from({ length: 3 }, (_, index) => ({
      name: `Concurrent BE ${index + 1}`, place_id: `place-be-${index}`, rating: 4.1, reviews: 12, city: "Neufchâteau",
    }));
    return Response.json({
      data: [[
        ...before,
        { name: "Computelec", place_id: "place-computelec", rating: 4.7, reviews: 22, photos_count: 9, city: "Neufchâteau" },
      ]],
    });
  };
  return () => { globalThis.fetch = originalFetch; };
}

test("2bis. la collecte automatique INITIALE (pas une relance) résout aussi l’ancrage et envoie coordinates/region au fournisseur", async () => {
  const db = new LocalD1();
  seedAnalysis(db, { companyName: "Computelec", city: "Neufchâteau" });
  seedDiagnosticRequest(db, ANALYSIS_ID, { companyName: "Computelec", city: "Neufchâteau" });
  let capturedCompetitorUrl = "";
  const restoreFetch = installInitialCollectionProviderFixture((url) => { capturedCompetitorUrl = url; });
  try {
    // Aucun `operation: "refresh_search"` ici : c'est bien le chemin de
    // création/collecte automatique initiale qui est exercé, pas la relance.
    const response = await collectDiagnostic(await context(db, ANALYSIS_ID, { body: {} }));
    const body = await response.json();
    assert.equal(response.status, 200);

    // Requête visible inchangée, jamais enrichie du code postal/pays.
    assert.equal(body.business.searchQuery, "Électricien Neufchâteau");

    // L'Appel B a bien reçu coordinates/region résolus côté serveur — le
    // payload client envoyé ici était `{}` : rien de tout cela ne peut donc
    // provenir du navigateur.
    assert.notEqual(capturedCompetitorUrl, "");
    const params = new URL(capturedCompetitorUrl).searchParams;
    assert.equal(params.get("query"), "Électricien Neufchâteau");
    // Le centre neutre de Neufchâteau (geocoding de la localité) — jamais
    // l'épingle propre à Computelec (49.816779999999994,5.449034) : c'est la
    // preuve directe du correctif "corriger la méthode d'ancrage
    // géographique" (l'entreprise analysée n'est plus jamais le point de mesure).
    assert.equal(params.get("coordinates"), "49.8419,5.4342");
    assert.notEqual(params.get("coordinates"), "49.816779999999994,5.449034");
    assert.equal(params.get("region"), "BE");
    assert.doesNotMatch(params.get("query"), /6840|Belgique|Belgium/);

    // Ancrage mémorisé dès la création, via le même constructeur que la
    // relance (buildGeographicAnchorRecord) — mêmes tier/region/label.
    assert.ok(body.business.geographicAnchor);
    assert.equal(body.business.geographicAnchor.tier, 1);
    assert.equal(body.business.geographicAnchor.region, "BE");
    assert.equal(body.business.geographicAnchor.label, "6840 Neufchâteau, Belgique");
    assert.equal(body.business.geographicAnchorStale, false);

    // Preuve directe en base (pas seulement dans la réponse HTTP) :
    // normalized_json contient geographic_anchor dès cette toute première
    // collecte, avant toute relance.
    const row = db.sqlite.prepare("SELECT normalized_json FROM analyses WHERE analysis_id = ?").get(ANALYSIS_ID);
    const persisted = JSON.parse(row.normalized_json);
    assert.ok(persisted.geographic_anchor);
    assert.equal(persisted.geographic_anchor.region, "BE");
    assert.equal(persisted.geographic_anchor.tier, 1);
  } finally {
    restoreFetch();
  }
});

// --- 3. Séparation obligatoire : requête affichée / requête fournisseur / ancrage / date ---
// C'est ce mécanisme (query jamais modifiée + coordinates/region distincts)
// qui garantit qu'aucune entreprise des Vosges (France) ne peut apparaître
// dans le panel : la recherche fournisseur est biaisée vers la Belgique par
// un paramètre séparé, jamais par un texte de requête concaténé.

test("3. la requête affichée, la requête fournisseur, l’ancrage et la date sont distincts et tous exposés", async () => {
  const db = new LocalD1();
  seedAnalysis(db);
  seedManualMetadata(db, ANALYSIS_ID);
  marksInitialCollection(db, ANALYSIS_ID, {
    geo: { locationLink: COMPUTELEC_LOCATION_LINK, postalCode: "6840", country: "Belgique", countryCode: "BE" },
  });
  const restoreFetch = installProviderFixtureCapturingRequest(() => {});
  try {
    const response = await collectDiagnostic(await context(db, ANALYSIS_ID, { body: refreshBody() }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.business.searchQuery, "Électricien Neufchâteau");
    assert.equal(body.business.geographicAnchor.label, "6840 Neufchâteau, Belgique");
    assert.ok(body.searchAnalyzedAt);
    assert.notEqual(body.business.searchQuery, body.business.geographicAnchor.label);
    // Aucune entreprise « des Vosges » (panel entièrement contrôlé par le
    // test) ne peut se glisser dans le panel retenu, car la sélection reste
    // strictement celle renvoyée par le fournisseur, lui-même interrogé avec
    // l'ancrage belge (vérifié ci-dessus, test 2).
    assert.ok(body.business.competitors.every((c) => !/vosges|88300/i.test(c.name)));
  } finally {
    restoreFetch();
  }
});

// --- 7. Duplication duplicate_manual : l'ancrage est conservé ---

test("7. un brouillon duplicate_manual copié depuis une analyse ancrée conserve l’ancrage et peut relancer sa recherche", async () => {
  const db = new LocalD1();
  seedAnalysis(db, { analysisId: "source-computelec" });
  seedManualMetadata(db, "source-computelec", { creationSource: "admin_manual" });
  marksInitialCollection(db, "source-computelec", {
    geo: { locationLink: COMPUTELEC_LOCATION_LINK, postalCode: "6840", country: "Belgique", countryCode: "BE" },
  });

  // Reproduit exactement la copie de colonnes utilisée par
  // duplicateQuestionnaireSnapshot() (auditQuestionnaireSnapshots.js) pour
  // fiche_json/normalized_json/status/report_type — sans reconstituer tout
  // le mécanisme de snapshot de questionnaire, hors sujet de cette mission.
  const duplicatedId = "duplicate-computelec";
  const now = "2026-08-27T10:00:00.000Z";
  db.sqlite.prepare(`
    INSERT INTO analyses (
      analysis_id, nom, ville, query, place_id, name, rating, reviews,
      photos_count, description_length, status, fiche_json, normalized_json,
      created_at, updated_at, activity, report_type
    )
    SELECT ?, nom, ville, query, place_id, name, rating, reviews,
      photos_count, description_length, 'awaiting_review', fiche_json, normalized_json,
      ?, ?, activity, report_type
    FROM analyses WHERE analysis_id = ?
  `).run(duplicatedId, now, now, "source-computelec");
  seedManualMetadata(db, duplicatedId, { creationSource: "duplicate_manual" });

  const copiedRow = db.sqlite.prepare("SELECT normalized_json FROM analyses WHERE analysis_id = ?").get(duplicatedId);
  assert.match(copiedRow.normalized_json, /"postal_code":"6840"/);
  assert.match(copiedRow.normalized_json, /"country_code":"BE"/);
  assert.ok(copiedRow.normalized_json.includes(COMPUTELEC_LOCATION_LINK));

  let capturedUrl = "";
  const restoreFetch = installProviderFixtureCapturingRequest((url) => { capturedUrl = url; });
  try {
    const response = await collectDiagnostic(await context(db, duplicatedId, {
      body: refreshBody({ analysisId: duplicatedId }),
    }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.business.geographicAnchor.label, "6840 Neufchâteau, Belgique");
    assert.equal(new URL(capturedUrl).searchParams.get("region"), "BE");
  } finally {
    restoreFetch();
  }
});

// --- 8. Absence d'ancrage : blocage propre, jamais un appel fournisseur ambigu ---

test("8. sans aucune donnée géographique fiable, la relance est bloquée avant tout appel fournisseur", async () => {
  const db = new LocalD1();
  seedAnalysis(db);
  seedManualMetadata(db, ANALYSIS_ID);
  marksInitialCollection(db, ANALYSIS_ID); // aucune donnée geo (geo = {})
  const beforeAnalysis = db.sqlite.prepare("SELECT * FROM analyses WHERE analysis_id = ?").get(ANALYSIS_ID);
  let providerCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { providerCalled = true; return Response.json({ data: [[]] }); };
  try {
    const response = await collectDiagnostic(await context(db, ANALYSIS_ID, { body: refreshBody() }));
    const body = await response.json();
    assert.equal(response.status, 409);
    assert.equal(body.error, "GEOGRAPHIC_ANCHOR_UNAVAILABLE");
    assert.equal(
      body.message,
      "La zone géographique n’a pas pu être déterminée automatiquement. Vérifiez la fiche avant de relancer l’analyse.",
    );
    assert.equal(providerCalled, false, "le fournisseur ne doit jamais être appelé sans ancrage fiable");
    assert.deepEqual(db.sqlite.prepare("SELECT * FROM analyses WHERE analysis_id = ?").get(ANALYSIS_ID), beforeAnalysis);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("8bis. un code postal seul, sans pays reconnaissable, reste bloqué (jamais un ancrage deviné)", async () => {
  const db = new LocalD1();
  seedAnalysis(db);
  seedManualMetadata(db, ANALYSIS_ID);
  marksInitialCollection(db, ANALYSIS_ID, { geo: { postalCode: "6840" } });
  const response = await collectDiagnostic(await context(db, ANALYSIS_ID, { body: refreshBody() }));
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.error, "GEOGRAPHIC_ANCHOR_UNAVAILABLE");
});

// --- 8ter. Localité connue MAIS geocoding en échec : distinct de 8/8bis ---
// (localité totalement inconnue) — ici ville/code postal/pays sont bien
// identifiés côté serveur, mais le point neutre lui-même ne peut pas être
// obtenu (fournisseur de geocoding en erreur). Preuve directe qu'il n'existe
// plus AUCUN repli (ni "region seul", ni coordonnées de l'entreprise) :
// zéro appel à la recherche concurrentielle, zéro écriture DB, blocage net.
test("8ter. localité connue mais geocoding du centre en échec : bloqué, aucun appel à la recherche concurrentielle, aucune écriture DB", async () => {
  const db = new LocalD1();
  seedAnalysis(db);
  seedManualMetadata(db, ANALYSIS_ID);
  marksInitialCollection(db, ANALYSIS_ID, {
    geo: { locationLink: COMPUTELEC_LOCATION_LINK, postalCode: "6840", country: "Belgique", countryCode: "BE" },
  });
  const beforeAnalysis = db.sqlite.prepare("SELECT * FROM analyses WHERE analysis_id = ?").get(ANALYSIS_ID);
  let competitorSearchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (isGeocodingRequest(url)) return new Response("geocoding-down", { status: 500 });
    competitorSearchCalled = true;
    return Response.json({ data: [[]] });
  };
  try {
    const response = await collectDiagnostic(await context(db, ANALYSIS_ID, { body: refreshBody() }));
    const body = await response.json();
    assert.equal(response.status, 409);
    assert.equal(body.error, "GEOGRAPHIC_ANCHOR_UNAVAILABLE");
    assert.equal(
      competitorSearchCalled, false,
      "la localité étant connue mais le centre geocodé indisponible, la recherche concurrentielle ne doit jamais être appelée",
    );
    assert.deepEqual(db.sqlite.prepare("SELECT * FROM analyses WHERE analysis_id = ?").get(ANALYSIS_ID), beforeAnalysis);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- 9. Échec fournisseur (ancrage résolu) : aucune mise à jour partielle ---

test("9. un échec fournisseur après résolution de l’ancrage ne modifie rien partiellement", async () => {
  const db = new LocalD1();
  seedAnalysis(db);
  seedManualMetadata(db, ANALYSIS_ID);
  marksInitialCollection(db, ANALYSIS_ID, {
    geo: { locationLink: COMPUTELEC_LOCATION_LINK, postalCode: "6840", country: "Belgique", countryCode: "BE" },
  });
  const beforeAnalysis = db.sqlite.prepare("SELECT * FROM analyses WHERE analysis_id = ?").get(ANALYSIS_ID);
  const restoreFetch = installFailingProviderFixture();
  try {
    const response = await collectDiagnostic(await context(db, ANALYSIS_ID, { body: refreshBody() }));
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.error, "SEARCH_REFRESH_FAILED");
    assert.deepEqual(db.sqlite.prepare("SELECT * FROM analyses WHERE analysis_id = ?").get(ANALYSIS_ID), beforeAnalysis);
  } finally {
    restoreFetch();
  }
});

// --- 10. Aucun changement du moteur de score ---

test("10. la mission « ancrage géographique » ne touche ni le moteur de score ni ses seuils", () => {
  const benchmarkEngine = readFileSync(new URL("../functions/lib/benchmarkEngine.js", import.meta.url), "utf8");
  const scoreEngine = readFileSync(new URL("../functions/lib/score-efficia/scoreEngine.js", import.meta.url), "utf8");
  const geoAnchor = readFileSync(new URL("../functions/lib/geographicAnchor.js", import.meta.url), "utf8");
  const route = readFileSync(new URL("../functions/api/admin/free-diagnostic-collect/[analysisId].js", import.meta.url), "utf8");
  assert.ok(benchmarkEngine.length > 0);
  assert.ok(scoreEngine.length > 0);
  assert.doesNotMatch(geoAnchor, /score|poids|seuil|questionnaire|prix/i);
  assert.match(route, /benchmarkEngine\(\{/);
  assert.doesNotMatch(route, /function calculateScore|SCORING_VERSION\s*=|BENCHMARK_WEIGHTS/);
});

// --- 11. Aucun secret ni paramètre sensible côté navigateur ---

test("11. aucun secret fournisseur ni coordonnée brute n’est exposé au navigateur", () => {
  const html = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
  const collector = readFileSync(new URL("../functions/lib/collectCompetitors.js", import.meta.url), "utf8");
  assert.doesNotMatch(html, /OUTSCRAPER_API_KEY|X-API-KEY|api\.outscraper\.com|coordinates=|latitude|longitude/i);
  assert.match(collector, /url\.searchParams\.set\("coordinates"/);
  assert.match(collector, /headers: \{ "X-API-KEY": key/);
  // Seul le libellé humain (« Zone automatiquement détectée : ... », « Zone
  // utilisée pour la dernière analyse : ... », « Zone actuellement
  // détectée : ... », « Dernière zone analysée : ... ») est exposé côté
  // client, jamais les coordonnées brutes qui l'ont produit (Point 4,
  // revue : plusieurs libellés distincts désormais, jamais la même
  // formulation unique qu'avant).
  assert.match(html, /Zone automatiquement détectée : \$\{liveLabel\}/);
  assert.match(html, /Zone utilisée pour la dernière analyse : \$\{persistedLabel\}/);
  assert.match(html, /Zone actuellement détectée : \$\{liveLabel\}/);
  assert.match(html, /Dernière zone analysée : \$\{persistedLabel\}/);
});

// --- Test réel / reproductible : Computelec de bout en bout ---

test("réel — Computelec : requête visible « Électricien Neufchâteau », recherche fournisseur ancrée en Belgique, position 9 restituée telle quelle", async () => {
  const db = new LocalD1();
  seedAnalysis(db);
  seedManualMetadata(db, ANALYSIS_ID);
  marksInitialCollection(db, ANALYSIS_ID, {
    geo: { locationLink: COMPUTELEC_LOCATION_LINK, postalCode: "6840", country: "Belgique", countryCode: "BE" },
  });
  let capturedUrl = "";
  const restoreFetch = installProviderFixtureCapturingRequest((url) => { capturedUrl = url; });
  try {
    const response = await collectDiagnostic(await context(db, ANALYSIS_ID, { body: refreshBody() }));
    const body = await response.json();
    assert.equal(response.status, 200);
    // Requête visible/admin inchangée.
    assert.equal(body.business.searchQuery, "Électricien Neufchâteau");
    // Ancrage réellement utilisé : Belgique, jamais mélangé à la requête.
    const params = new URL(capturedUrl).searchParams;
    assert.equal(params.get("query"), "Électricien Neufchâteau");
    // Le centre neutre de Neufchâteau (geocoding de la localité) — jamais
    // l'épingle propre à Computelec (49.816779999999994,5.449034) : c'est la
    // preuve directe du correctif "corriger la méthode d'ancrage
    // géographique" (l'entreprise analysée n'est plus jamais le point de mesure).
    assert.equal(params.get("coordinates"), "49.8419,5.4342");
    assert.notEqual(params.get("coordinates"), "49.816779999999994,5.449034");
    assert.equal(params.get("region"), "BE");
    assert.equal(body.business.geographicAnchor.label, "6840 Neufchâteau, Belgique");
    // Position réellement obtenue (9e, fixture ci-dessus) restituée telle
    // quelle — jamais forcée à coïncider avec une position antérieure.
    assert.equal(body.business.localPosition, 9);
    // Le panel retenu (top 3) ne contient que des concurrents belges du
    // fournisseur ancré en Belgique — jamais une entreprise des Vosges.
    assert.equal(body.business.competitors.length, 3);
    assert.deepEqual(body.business.competitors.map((c) => c.name), ["Concurrent BE 1", "Concurrent BE 2", "Concurrent BE 3"]);
    assert.ok(body.business.competitors.every((c) => !/vosges|88300/i.test(c.name)));
  } finally {
    restoreFetch();
  }
});

// --- Point 3 (revue) : l'approbation manuelle (audit-review, branche non ---
// --- Premium de approveAnalysis) ne doit pas non plus permettre de ---
// --- contourner la règle d'ancrage géographique du diagnostic gratuit, ---
// --- même si ce chemin n'est normalement jamais emprunté par ---
// --- l'interface du diagnostic gratuit (défense en profondeur : rien ---
// --- n'empêche un client d'appeler directement PATCH .../audit-review/{id}). ---

function completeManualReviewFree() {
  return {
    questionnaireVersion: "score-efficia-questionnaire-v4",
    photoPresence: "present",
    reviewsPresence: "present",
    locationMode: "storefront",
    addressVerification: "exact",
    criteriaReview: GRILLE.flatMap((category) => category.criteres.map((criterion) => ({
      key: criterion.key,
      question: criterion.q,
      value: criterion.key === "nap" ? "no_website" : "compliant",
    }))),
  };
}

async function patchContext(db, analysisId = ANALYSIS_ID, { body = {} } = {}) {
  return {
    request: new Request(`https://preview.local/api/admin/audit-review/${analysisId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://preview.local",
        Cookie: await cookie(),
      },
      body: JSON.stringify(body),
    }),
    params: { analysisId },
    env: { ADMIN_SESSION_SECRET: ADMIN_SECRET, ORDERS_DB: db },
  };
}

test("Point 3f. l’approbation directe (contournement de l’UI) d’un diagnostic gratuit est aussi refusée sans ancrage géographique confirmé", async () => {
  const db = new LocalD1();
  seedAnalysis(db, { companyName: "Ancienne Fiche", city: "Bruxelles" });
  db.sqlite.prepare(`
    UPDATE analyses
    SET fiche_json = ?, normalized_json = ?, search_query = ?, local_position = ?,
        competitors_json = ?, manual_review_json = ?
    WHERE analysis_id = ?
  `).run(
    JSON.stringify({ name: "Ancienne Fiche", city: "Bruxelles" }),
    // Résultats concurrentiels déjà présents, aucun geographic_anchor mémorisé.
    JSON.stringify({ name: "Ancienne Fiche", city: "Bruxelles" }),
    "Plombier Bruxelles",
    4,
    JSON.stringify([{ name: "Concurrent", rating: 4.2, reviews: 10 }]),
    JSON.stringify(completeManualReviewFree()),
    ANALYSIS_ID,
  );
  const response = await approveDiagnostic(await patchContext(db, ANALYSIS_ID, { body: { action: "approve" } }));
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.error, "GEOGRAPHIC_ANCHOR_MISSING_FOR_EXISTING_RESULTS");
  assert.equal(
    db.sqlite.prepare("SELECT status FROM analyses WHERE analysis_id = ?").get(ANALYSIS_ID).status,
    "awaiting_review",
  );
});

// --- Point 4 (revue) : quatre à cinq états de libellé, jamais mélangés ---
// --- (ex. jamais "Zone automatiquement détectée : <ancienne zone>" en ---
// --- même temps qu'un avertissement disant que la zone actuelle est ---
// --- absente/différente — c'était le défaut exact signalé). Exécute la ---
// --- VRAIE fonction actualiserZoneGeographique() extraite du fichier ---
// --- HTML/JS de production (pas une réimplémentation), dans un contexte ---
// --- vm minimal.

function extractActualiserZoneGeographique() {
  const html = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
  const start = html.indexOf("function actualiserZoneGeographique(business = {}){");
  const end = html.indexOf("function proposerRequeteDepuisActivite(){", start);
  if (start < 0 || end <= start) throw new Error("actualiserZoneGeographique introuvable dans index.html");
  return html.slice(start, end);
}

function runActualiserZoneGeographique(business) {
  const derniere = { hidden: true, textContent: "" };
  const detectee = { hidden: true, textContent: "" };
  const elements = { "zone-geo-derniere": derniere, "zone-geo-detectee": detectee };
  const donneesAnalyse = {};
  const context = {
    document: { getElementById: (id) => elements[id] || null },
    donneesAnalyse,
    business,
    console,
  };
  context.globalThis = context;
  vm.runInNewContext(`${extractActualiserZoneGeographique()}
actualiserZoneGeographique(business);`, context);
  return { derniere, detectee, donneesAnalyse };
}

const ANCHOR_BE = { tier: 1, source: "location_link", region: "BE", label: "6840 Neufchâteau, Belgique", coordinates: "49.816779999999994,5.449034" };
const ANCHOR_FR = { tier: 3, source: "server_address_data", region: "FR", label: "88300 Neufchâteau, France", coordinates: null };

test("Point 4 état 1 — ancrage analysé à jour : une seule ligne « Zone utilisée pour la dernière analyse », aucun avertissement possible", () => {
  const { derniere, detectee, donneesAnalyse } = runActualiserZoneGeographique({
    geographicAnchor: ANCHOR_BE, geographicAnchorLive: ANCHOR_BE, geographicAnchorStale: false, geographicAnchorIssue: null,
  });
  assert.equal(derniere.hidden, true);
  assert.equal(detectee.hidden, false);
  assert.equal(detectee.textContent, "Zone utilisée pour la dernière analyse : 6840 Neufchâteau, Belgique");
  assert.equal(donneesAnalyse.zoneGeographiqueStale, false);
  assert.equal(donneesAnalyse.zoneGeographiqueIssue, null);
});

test("Point 4 état 2 — nouvelle zone détectée et vérifiable : « Dernière zone analysée » PUIS « Zone actuellement détectée », jamais l’inverse ni fusionnées", () => {
  const { derniere, detectee, donneesAnalyse } = runActualiserZoneGeographique({
    geographicAnchor: ANCHOR_BE, geographicAnchorLive: ANCHOR_FR, geographicAnchorStale: true, geographicAnchorIssue: "GEOGRAPHIC_ANCHOR_STALE",
  });
  assert.equal(derniere.hidden, false);
  assert.equal(derniere.textContent, "Dernière zone analysée : 6840 Neufchâteau, Belgique");
  assert.equal(detectee.hidden, false);
  assert.equal(detectee.textContent, "Zone actuellement détectée : 88300 Neufchâteau, France");
  // Jamais le libellé "à jour" de l'état 1 dans un état périmé.
  assert.doesNotMatch(detectee.textContent, /Zone utilisée pour la dernière analyse/);
  assert.equal(donneesAnalyse.zoneGeographiqueStale, true);
});

test("Point 4 état 3 — zone actuelle non vérifiable (ancienne analyse existante) : « Dernière zone analysée » seule, jamais une nouvelle zone inventée", () => {
  const { derniere, detectee, donneesAnalyse } = runActualiserZoneGeographique({
    geographicAnchor: ANCHOR_BE, geographicAnchorLive: null, geographicAnchorStale: true, geographicAnchorIssue: "GEOGRAPHIC_ANCHOR_STALE",
  });
  assert.equal(derniere.hidden, false);
  assert.equal(derniere.textContent, "Dernière zone analysée : 6840 Neufchâteau, Belgique");
  // Aucune "zone actuellement détectée" fabriquée : rien à afficher, jamais un libellé vide/inventé.
  assert.equal(detectee.hidden, true);
  assert.equal(donneesAnalyse.zoneGeographiqueLive, null);
});

test("Point 4 état 4 — aucune analyse concurrentielle encore effectuée : « Zone automatiquement détectée » seule, jamais présentée comme périmée", () => {
  const { derniere, detectee, donneesAnalyse } = runActualiserZoneGeographique({
    geographicAnchor: null, geographicAnchorLive: ANCHOR_BE, geographicAnchorStale: false, geographicAnchorIssue: null,
  });
  assert.equal(derniere.hidden, true);
  assert.equal(detectee.hidden, false);
  assert.equal(detectee.textContent, "Zone automatiquement détectée : 6840 Neufchâteau, Belgique");
  assert.equal(donneesAnalyse.zoneGeographiqueStale, false);
});

test("Point 4 état 5 — résultats hérités sans ancrage jamais mémorisé : jamais de « dernière zone » inventée, jamais présenté comme « zone utilisée pour la dernière analyse »", () => {
  const { derniere, detectee, donneesAnalyse } = runActualiserZoneGeographique({
    geographicAnchor: null, geographicAnchorLive: ANCHOR_BE, geographicAnchorStale: true, geographicAnchorIssue: "GEOGRAPHIC_ANCHOR_MISSING_FOR_EXISTING_RESULTS",
  });
  assert.equal(derniere.hidden, true);
  assert.equal(detectee.hidden, false);
  assert.equal(detectee.textContent, "Zone actuellement détectée : 6840 Neufchâteau, Belgique");
  assert.doesNotMatch(detectee.textContent, /dernière analyse/);
  assert.equal(donneesAnalyse.zoneGeographiqueStale, true);
  assert.equal(donneesAnalyse.zoneGeographiqueIssue, "GEOGRAPHIC_ANCHOR_MISSING_FOR_EXISTING_RESULTS");
});

test("Point 4 — le libellé « Zone automatiquement détectée » (état 4) et un avertissement de péremption ne peuvent jamais être combinés dans la même fonction", () => {
  // Vérifie la garantie structurelle : le texte "Zone automatiquement
  // détectée" n'est produit QUE dans la branche !stale (états 1 sans label
  // -> état 4), jamais dans une branche où stale est vrai.
  const source = extractActualiserZoneGeographique();
  const staleBranchStart = source.indexOf("}else if(issue ===");
  const staleBranchSection = source.slice(staleBranchStart);
  assert.doesNotMatch(staleBranchSection, /Zone automatiquement détectée/);
});
