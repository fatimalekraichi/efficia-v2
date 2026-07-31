import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runKnowledgeEngine } from "../functions/lib/knowledgeEngine.js";
import { runReasoningEngine } from "../functions/lib/reasoning-engine/reasoningEngine.js";
import { runComposer } from "../functions/lib/composer-engine/composerEngine.js";
import {
  resolveAnalysisReportType,
  resolveReportDepth,
  REPORT_TYPES,
} from "../functions/lib/reportDepth.js";
import { renderAnalysisById } from "../functions/api/render/_shared.js";

async function weakProfileInput() {
  const path = new URL("./fixtures/knowledge-weak-profile.json", import.meta.url);
  return JSON.parse(await readFile(path, "utf8"));
}

function buildBundle(reportType, knowledgeInput, knowledge) {
  const context = {
    business: {
      name: "Petit Atelier Local",
      category: "artisan",
      rating: knowledgeInput.business.rating,
      reviews: knowledgeInput.business.reviews,
      photos_count: knowledgeInput.business.photos_count,
      description_length: knowledgeInput.business.description_length,
      position: knowledgeInput.business.position,
    },
    benchmark: knowledgeInput.benchmark,
  };
  const reasoning = runReasoningEngine({
    analysisId: "petit-atelier",
    reportType,
    generatedAt: "2026-07-28T08:00:00.000Z",
    context,
    knowledge,
  });

  return {
    analysisId: "petit-atelier",
    reportType,
    generatedAt: "2026-07-28T08:00:00.000Z",
    meta: { businessName: "Petit Atelier Local", category: "artisan", city: "Namur", generatedAt: "2026-07-28T08:00:00.000Z" },
    observation: context.business,
    benchmark: context.benchmark,
    knowledge,
    reasoning,
  };
}

test("gratuit vs premium : mêmes constats sources, profondeur différente", async () => {
  const knowledgeInput = await weakProfileInput();
  const knowledgeFree = runKnowledgeEngine({ ...knowledgeInput, reportType: REPORT_TYPES.FREE });
  const knowledgePremium = runKnowledgeEngine({ ...knowledgeInput, reportType: REPORT_TYPES.PREMIUM });

  // Même pool de constats réels en amont (rien n'est inventé pour le premium) :
  // seule la profondeur retenue en aval diffère.
  assert.deepEqual(
    new Set([...knowledgeFree.weaknesses, ...knowledgeFree.opportunities].map((f) => f.id)),
    new Set([...knowledgePremium.weaknesses, ...knowledgePremium.opportunities].map((f) => f.id)),
  );

  const documentFree = runComposer(buildBundle(REPORT_TYPES.FREE, knowledgeInput, knowledgeFree));
  const documentPremium = runComposer(buildBundle(REPORT_TYPES.PREMIUM, knowledgeInput, knowledgePremium));

  // 1. Les deux documents ne sont pas identiques.
  assert.notDeepEqual(documentFree, documentPremium);

  // 2. Titre et vocabulaire corrects par palier.
  assert.equal(documentFree.reportType, "free");
  assert.equal(documentFree.vocabulary.reportLabel, "Diagnostic Efficia™");
  assert.equal(documentPremium.reportType, "premium");
  assert.equal(documentPremium.vocabulary.reportLabel, "Audit Efficia™");

  // 3. Le gratuit est réellement limité (méthode documentée : 3 priorités max).
  assert.ok(documentFree.priorities.length <= 3);

  // 4. Le premium contient davantage de profondeur (mêmes constats, pas de plafond
  // arbitraire à 3 priorités, ni sur les faiblesses/opportunités/plan d'action).
  assert.ok(documentPremium.priorities.length > documentFree.priorities.length);
  assert.ok(documentPremium.weaknesses.length + documentPremium.opportunities.length
    >= documentFree.weaknesses.length + documentFree.opportunities.length);
  assert.ok(documentPremium.actionPlan.length >= documentFree.actionPlan.length);

  // 5. Aucun changement du Score Efficia (le score vient du benchmark, pas du palier).
  assert.equal(documentFree.hero.score, documentPremium.hero.score);
  assert.equal(documentFree.hero.scoreBand, documentPremium.hero.scoreBand);

  // 6. Transition vers l'Audit Efficia présente uniquement en gratuit.
  assert.match(documentFree.vocabulary.upsellNote, /Audit Efficia/);
  assert.equal(documentPremium.vocabulary.upsellNote, "");
});

test("repli documenté : reportType absent ou inconnu se comporte comme le premium historique (Étape B : évite une page free vide)", () => {
  assert.equal(resolveAnalysisReportType(undefined), "premium");
  assert.equal(resolveAnalysisReportType(null), "premium");
  assert.equal(resolveAnalysisReportType("garbage"), "premium");
  assert.equal(resolveAnalysisReportType("free"), "free");

  // Résolution "moteur pur" (knowledgeEngine/composerEngine appelés directement,
  // sans reportType) : reste au profil gratuit historique — comportement
  // inchangé, sans lien avec le choix de renderer.
  assert.equal(resolveReportDepth(undefined).reportType, "free");
  assert.equal(resolveReportDepth("premium").reportType, "premium");
});

test("les moteurs appelés sans reportType conservent le comportement historique (rétrocompatibilité)", async () => {
  const knowledgeInput = await weakProfileInput();
  // Aucun reportType transmis, comme le font tous les appels directs existants.
  const output = runKnowledgeEngine(knowledgeInput);
  assert.ok(output.top_priorities.length <= 3);
});

const TOKEN = "test-token";

function makeRenderContext(row) {
  const db = {
    prepare() {
      return {
        bind() {
          return { async first() { return row; } };
        },
        async first() { return row; },
      };
    },
  };
  return {
    request: new Request("http://local.test/api/render/analysis-1", {
      headers: { Authorization: `Bearer ${TOKEN}` },
    }),
    params: { analysisId: "analysis-1" },
    env: { CONNECTOR_TOKEN: TOKEN, ADMIN_SESSION_SECRET: "admin-secret", ORDERS_DB: db },
  };
}

test("aperçu prématuré : /api/render signale la génération en cours au lieu d'un document vide", async () => {
  const row = {
    analysis_id: "analysis-1",
    status: "preview_ready",
    nom: "Petit Atelier Local",
    name: "Petit Atelier Local",
    created_at: "2026-07-28T08:00:00.000Z",
    updated_at: "2026-07-28T08:00:00.000Z",
    // Ni knowledge_json ni document_model_json : la fenêtre de course exacte
    // identifiée dans saveManualReview() / runPostReviewPipeline().
    knowledge_json: null,
    reasoning_json: null,
    document_model_json: null,
  };

  const response = await renderAnalysisById(makeRenderContext(row), "analysis-1");
  const json = await response.json();

  assert.equal(response.status, 202);
  assert.equal(json.error, "GENERATION_IN_PROGRESS");
});

test("aperçu prématuré : ne bloque pas le recalcul légitime quand knowledge est déjà disponible", async () => {
  const row = {
    analysis_id: "analysis-1",
    status: "preview_ready",
    nom: "Petit Atelier Local",
    name: "Petit Atelier Local",
    created_at: "2026-07-28T08:00:00.000Z",
    updated_at: "2026-07-28T08:00:00.000Z",
    knowledge_json: JSON.stringify({
      confidence: "established",
      strengths: [],
      weaknesses: [{ id: "WEAK_POSITION", signal: "position", businessImpact: "visibility", priority: 9, severity: "high", message: "Votre fiche n'apparaît pas dans les trois premiers résultats." }],
      opportunities: [],
      top_priorities: [{ id: "WEAK_POSITION", signal: "position", businessImpact: "visibility", priority: 9, severity: "high", message: "Votre fiche n'apparaît pas dans les trois premiers résultats." }],
    }),
    reasoning_json: null,
    document_model_json: null,
  };

  const response = await renderAnalysisById(makeRenderContext(row), "analysis-1");
  assert.equal(response.status, 200);
});
