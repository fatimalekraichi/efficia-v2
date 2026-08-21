import { loadAnalysisById } from "../analysis/_shared.js";
import { jsonResponse, normalizeText, onOptions, requireAdminSession, requireOrdersDb, requireSameOriginMutation } from "../../admin/_shared.js";
import { loadPaidPremiumOrder } from "../../lib/premiumAuthorization.js";
import {
  completeManualAuditCreation,
  failManualAuditCreation,
  reserveManualAuditCreation,
} from "../../lib/auditCreationMetadata.js";

const GOOGLE_HOST_PATTERN = /(^|\.)google\.[a-z.]+$/i;
const GOOGLE_MAPS_HOST_PATTERN = /(^|\.)googleapis\.com$|(^|\.)goo\.gl$|(^|\.)maps\.app\.goo\.gl$/i;
const REPORT_TYPES = new Set(["free", "premium"]);
const AUDIT_OPERATIONS = Object.freeze({
  manual: "create_manual_audit",
  commercial: "create_commercial_audit",
});

function isValidGoogleBusinessUrl(value) {
  const raw = normalizeText(value);
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    return GOOGLE_HOST_PATTERN.test(host)
      || GOOGLE_MAPS_HOST_PATTERN.test(host)
      || host.includes("google.com")
      || host.includes("googleusercontent.com");
  } catch {
    return false;
  }
}

function cleanInput(value, maxLength = 240) {
  return normalizeText(value).slice(0, maxLength);
}

function normalizeReportType(value, order = {}) {
  const clean = cleanInput(value, 40).toLowerCase();
  if (REPORT_TYPES.has(clean)) return clean;

  const orderText = `${order.offer_code || ""} ${order.offer_name || ""}`.toLowerCase();
  if (orderText.includes("diagnostic") || orderText.includes("gratuit") || orderText.includes("free")) return "free";
  return "premium";
}

async function loadOrderContext(db, orderId) {
  const cleanOrderId = cleanInput(orderId, 120);
  if (!cleanOrderId) return null;

  const order = await db.prepare(`
    SELECT *
    FROM orders
    WHERE order_id = ?
    LIMIT 1
  `).bind(cleanOrderId).first();

  if (!order) return null;

  const task = await db.prepare(`
    SELECT *
    FROM order_tasks
    WHERE order_id = ?
    ORDER BY created_at ASC
    LIMIT 1
  `).bind(cleanOrderId).first();

  return { order, task };
}

function extractBusinessNameFromGoogleUrl(value) {
  try {
    const parsed = new URL(value);
    const query = parsed.searchParams.get("q") || parsed.searchParams.get("query");
    if (query) return cleanInput(query.replace(/\+/g, " "), 180);

    const segments = parsed.pathname
      .split("/")
      .map((segment) => decodeURIComponent(segment.replace(/\+/g, " ")).trim())
      .filter(Boolean);
    const placeIndex = segments.findIndex((segment) => segment.toLowerCase() === "place");
    if (placeIndex >= 0 && segments[placeIndex + 1]) return cleanInput(segments[placeIndex + 1], 180);
  } catch {
    return "";
  }
  return "";
}

function buildPipelineInput(payload, orderContext = null) {
  const order = orderContext?.order || {};
  const task = orderContext?.task || {};
  const googleBusinessUrl = cleanInput(
    payload?.googleBusinessUrl || payload?.google_business_url || order.google_business_url,
    2000,
  );
  const companyName = cleanInput(payload?.companyName || payload?.company_name || order.company_name, 180);
  const city = cleanInput(payload?.city || payload?.ville || order.city, 120);
  const email = cleanInput(payload?.email || payload?.prospectEmail || order.email, 180);
  const internalNotes = cleanInput(payload?.internalNotes || payload?.notes || task.notes, 2000);
  const orderId = cleanInput(payload?.orderId || payload?.order_id || order.order_id, 120);
  const taskId = cleanInput(payload?.taskId || payload?.task_id || task.task_id, 120);
  const reportType = normalizeReportType(payload?.reportType || payload?.report_type, order);

  // Deux façons équivalentes d'identifier l'entreprise (formulaire "Nouvel
  // audit") : l'URL Google Business seule, ou le Nom + la Ville. On ne
  // rejette la requête que si NI l'une NI l'autre n'est disponible — jamais
  // l'URL seule comme avant. Le reste de cette fonction sait déjà construire
  // un pipelineInput valide à partir de Nom+Ville seuls (branche `hasCity`
  // ci-dessous, inchangée) : le seul verrou à lever était ce garde-fou.
  const hasValidUrl = isValidGoogleBusinessUrl(googleBusinessUrl);
  const hasCompanyAndCity = Boolean(companyName) && Boolean(city);

  if (!hasValidUrl && !hasCompanyAndCity) {
    return {
      ok: false,
      status: 400,
      error: "INVALID_GOOGLE_BUSINESS_URL",
      message: "Renseignez une URL Google Maps ou Google Business valide, ou un nom d'entreprise et une ville.",
    };
  }

  const inferredName = hasValidUrl ? extractBusinessNameFromGoogleUrl(googleBusinessUrl) : "";
  const nom = companyName || inferredName || googleBusinessUrl || "Entreprise sans nom";
  const hasCity = Boolean(city);
  const ville = city || "Non renseignée";
  const activite = hasCity ? (companyName || inferredName || "entreprise locale") : "";
  // Objectif 2 (mission "rendre l'identification suffisamment robuste") — un
  // administrateur a déjà choisi un candidat parmi une liste ambiguë
  // présentée par un appel précédent à cette même route ; on le relaie tel
  // quel jusqu'à collectFiche() via /api/analyze.
  const selectedPlaceId = cleanInput(payload?.selectedPlaceId, 200);
  // Mission "logique métier déterministe" — Objectif 5 : le candidat complet
  // (champ `raw` de la réponse AMBIGUOUS_CANDIDATES, renvoyé tel quel par le
  // client) est relayé sans transformation — c'est un objet fiche déjà
  // normalisé par collectFiche()/mapPlace(), pas un champ texte à nettoyer.
  const selectedCandidate = payload?.selectedCandidate && typeof payload.selectedCandidate === "object"
    ? payload.selectedCandidate
    : null;
  const pipelineInput = {
    nom,
    ville,
    activite,
  };
  if (selectedPlaceId) pipelineInput.selectedPlaceId = selectedPlaceId;
  if (selectedCandidate) pipelineInput.selectedCandidate = selectedCandidate;

  // En mode URL seule, conserver l'URL comme requête d'observation. Utiliser
  // le nom extrait avec la ville sentinelle "Non renseignée" ferait traiter
  // cette dernière comme une vraie ville et éliminerait le bon candidat.
  if (!hasCity && hasValidUrl) {
    pipelineInput.googleBusinessUrl = googleBusinessUrl;
  } else if (!hasCity && companyName) {
    pipelineInput.observationQuery = companyName;
  }

  return {
    ok: true,
    requestMetadata: {
      googleBusinessUrl,
      companyName,
      city,
      email,
      internalNotes,
      orderId,
      taskId,
      reportType,
    },
    pipelineInput,
  };
}

async function attachAnalysisToOrder(db, { analysisId, orderId, taskId, notes }) {
  if (!analysisId || !orderId) return null;

  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE analyses
    SET order_id = ?, updated_at = ?
    WHERE analysis_id = ?
  `).bind(orderId, now, analysisId).run();

  const resolvedTask = taskId
    ? { task_id: taskId }
    : await db.prepare(`
      SELECT task_id
      FROM order_tasks
      WHERE order_id = ?
      ORDER BY created_at ASC
      LIMIT 1
    `).bind(orderId).first();

  if (!resolvedTask?.task_id) return null;

  const hasNotes = notes !== undefined && notes !== null;
  await db.prepare(`
    UPDATE order_tasks
    SET
      status = 'in_progress',
      analysis_id = ?,
      notes = CASE WHEN ? = 1 THEN ? ELSE notes END,
      updated_at = ?
    WHERE task_id = ?
  `).bind(
    analysisId,
    hasNotes ? 1 : 0,
    hasNotes ? notes : "",
    now,
    resolvedTask.task_id,
  ).run();

  return resolvedTask.task_id;
}

async function markAwaitingReview(db, analysisId, reportType = "premium") {
  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE analyses
    SET status = 'awaiting_review', report_type = ?, updated_at = ?
    WHERE analysis_id = ?
  `).bind(normalizeReportType(reportType), now, analysisId).run();
}

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function endpointForStage(origin, stage) {
  if (stage === "observation") return `${origin}/api/analyze`;
  if (stage === "benchmark") return `${origin}/api/benchmark`;
  if (stage === "knowledge") return `${origin}/api/knowledge`;
  if (stage === "reasoning") return `${origin}/api/reasoning`;
  if (stage === "composer") return `${origin}/api/composer`;
  throw new Error(`Unknown pipeline stage: ${stage}`);
}

async function callPipelineStage({ origin, connectorToken }, stage, payload) {
  const response = await fetch(endpointForStage(origin, stage), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${connectorToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await parseJsonResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      error: {
        status: response.status,
        body: data,
      },
    };
  }

  return { ok: true, data };
}

async function runCollectionForReview(pipelineInput, callStage) {
  const stages = {};
  console.log("admin-audits:observation:start");
  const observation = await callStage("observation", pipelineInput);
  if (!observation.ok) {
    stages.observation = "failed";
    return {
      status: "failed",
      stage: "observation",
      stages,
      error: observation.error,
    };
  }

  const analysisId = observation.data?.analysisId;
  stages.observation = "ok";
  console.log("admin-audits:observation:done", { analysis_id: analysisId });

  // Objectif 7 — relayer jusqu'à la réponse finale le score de confiance et
  // le palier de décision retenus par collectFiche() (voir /api/analyze),
  // pour que la campagne de test puisse rapporter, pour chaque audit :
  // entité demandée -> entité retenue -> confiance -> validation
  // automatique/manuelle -> verdict. Purement informatif : n'affecte aucune
  // écriture D1.
  const identification = {
    confidence: observation.data?.identificationConfidence ?? null,
    tier: observation.data?.identificationTier ?? null,
  };

  console.log("admin-audits:benchmark:start");
  const benchmark = await callStage("benchmark", { analysisId });
  if (!benchmark.ok) {
    stages.benchmark = "failed";
    return {
      status: "failed",
      stage: "benchmark",
      analysisId,
      stages,
      error: benchmark.error,
    };
  }

  stages.benchmark = "ok";
  console.log("admin-audits:benchmark:done", { analysis_id: analysisId });

  return {
    analysisId,
    status: "awaiting_review",
    stages,
    identification,
  };
}

function summarizeAnalysis(analysis) {
  const documentModel = analysis?.documentModel || null;
  const hero = documentModel?.hero || {};
  return {
    businessName: hero.businessName || analysis?.business?.name || analysis?.business?.nom || null,
    city: hero.city || analysis?.business?.ville || null,
    score: hero.score ?? analysis?.benchmark?.score ?? null,
    status: analysis?.status || null,
    analysisId: analysis?.analysisId || null,
    reportType: analysis?.reportType || null,
    hasDocumentModel: Boolean(documentModel),
  };
}

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || error || "");
  return message.includes("no such column") && message.includes(columnName);
}

function migrationForMissingColumn(error) {
  const migrations = [
    {
      columns: [
        "manual_review_json",
        "reviewed_observation_json",
        "reviewed_benchmark_json",
        "review_completed_at",
        "approved_at",
        "pdf_generated_at",
      ],
      migration: "0009_manual_review_gate.sql",
    },
    {
      columns: ["report_type"],
      migration: "0010_analysis_report_type.sql",
    },
    {
      columns: ["score_inputs_json", "reviewed_score_json", "scoring_version"],
      migration: "0011_score_efficia_historical.sql",
    },
  ];

  for (const group of migrations) {
    if (group.columns.some((column) => isMissingColumnError(error, column))) {
      return group.migration;
    }
  }

  return null;
}

function missingMigrationResponse({ error, analysisId, stages, stage = "review" }) {
  const migration = migrationForMissingColumn(error);
  if (!migration) return null;

  return jsonResponse({
    success: false,
    error: "MISSING_D1_MIGRATION",
    stage,
    analysisId,
    stages,
    message: `La base locale n’est pas à jour. Appliquez la migration ${migration}, puis relancez l’audit.`,
  }, 500);
}

export async function onRequestOptions() {
  return onOptions();
}

export async function onRequestPost(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;
  const sameOrigin = requireSameOriginMutation(context.request);
  if (!sameOrigin.ok) return sameOrigin.response;

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return jsonResponse({ success: false, error: "INVALID_JSON" }, 400);
  }

  const connectorToken = normalizeText(context.env.CONNECTOR_TOKEN);
  if (!connectorToken) {
    console.error("admin-audits: CONNECTOR_TOKEN manquant dans l'environnement.");
    return jsonResponse({ success: false, error: "SERVER_CONFIGURATION_ERROR" }, 500);
  }

  const db = requireOrdersDb(context.env);
  const orderId = cleanInput(payload?.orderId || payload?.order_id, 120);
  const operation = cleanInput(payload?.operation, 80);
  if (operation && !Object.values(AUDIT_OPERATIONS).includes(operation)) {
    return jsonResponse({ success: false, error: "INVALID_AUDIT_OPERATION" }, 400);
  }
  const isManualCreation = operation === AUDIT_OPERATIONS.manual;
  const requestedReportType = cleanInput(payload?.reportType || payload?.report_type, 40).toLowerCase();

  // Une création manuelle est une opération administrative explicite. Elle
  // n'est jamais déduite de l'absence, de la vacuité ou de la perte d'un
  // orderId commercial. Les anciens appels liés à une commande restent
  // compatibles sans champ `operation`.
  if (isManualCreation && orderId) {
    return jsonResponse({ success: false, error: "MANUAL_AUDIT_ORDER_FORBIDDEN" }, 400);
  }
  if (!isManualCreation && !orderId) {
    if (!requestedReportType || requestedReportType === "premium") {
      return jsonResponse({ success: false, error: "PREMIUM_NOT_AUTHORIZED" }, 403);
    }
    return jsonResponse({ success: false, error: "MANUAL_INTENT_REQUIRED" }, 400);
  }

  let orderContext = null;
  if (orderId) {
    orderContext = await loadOrderContext(db, orderId);
    if (!orderContext) {
      if (requestedReportType === "premium" || requestedReportType === "") {
        return jsonResponse({ success: false, error: "PREMIUM_NOT_AUTHORIZED" }, 403);
      }
      return jsonResponse({ success: false, error: "ORDER_NOT_FOUND" }, 404);
    }
  }

  const prepared = buildPipelineInput(payload, orderContext);
  if (!prepared.ok) {
    return jsonResponse({
      success: false,
      error: prepared.error,
      message: prepared.message,
    }, prepared.status);
  }

  if (isManualCreation && !REPORT_TYPES.has(cleanInput(payload?.reportType || payload?.report_type, 40).toLowerCase())) {
    return jsonResponse({ success: false, error: "AUDIT_TYPE_REQUIRED" }, 400);
  }

  const idempotencyKey = cleanInput(payload?.idempotencyKey, 100);
  if (isManualCreation && !/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey)) {
    return jsonResponse({ success: false, error: "INVALID_IDEMPOTENCY_KEY" }, 400);
  }

  if (isManualCreation) {
    let reservation;
    try {
      reservation = await reserveManualAuditCreation(db, {
        idempotencyKey,
        auditType: prepared.requestMetadata.reportType,
      });
    } catch (error) {
      const missingMigration = String(error?.message || error).includes("audit_creation_metadata");
      return jsonResponse({
        success: false,
        error: missingMigration ? "MISSING_D1_MIGRATION" : "D1_UPDATE_FAILED",
        message: missingMigration
          ? "La base locale n’est pas à jour. Appliquez la migration 0016_admin_manual_audits.sql, puis relancez."
          : "La création manuelle n’a pas pu être réservée.",
      }, 500);
    }
    if (reservation.completed) {
      const existing = await loadAnalysisById(db, reservation.analysisId);
      if (!existing) return jsonResponse({ success: false, error: "ANALYSIS_NOT_FOUND" }, 404);
      const review = prepared.requestMetadata.reportType === "free"
        ? `/admin/free-diagnostic-production?analysisId=${encodeURIComponent(reservation.analysisId)}`
        : `/admin/audit-review/${encodeURIComponent(reservation.analysisId)}`;
      return jsonResponse({
        success: true,
        created: false,
        analysisId: reservation.analysisId,
        status: existing.status,
        reportType: prepared.requestMetadata.reportType,
        stages: {},
        analysis: summarizeAnalysis(existing),
        links: { review, report: `/api/render/${encodeURIComponent(reservation.analysisId)}`, data: `/api/analysis/${encodeURIComponent(reservation.analysisId)}`, order: null },
        order: null,
      });
    }
    if (reservation.pending) return jsonResponse({ success: false, error: "CREATION_IN_PROGRESS" }, 409);
    if (!reservation.acquired) return jsonResponse({ success: false, error: "IDEMPOTENCY_CONFLICT" }, 409);
  }

  if (!isManualCreation && prepared.requestMetadata.reportType === "premium") {
    const paidOrder = await loadPaidPremiumOrder(db, prepared.requestMetadata.orderId);
    if (!paidOrder) {
      return jsonResponse({ success: false, error: "PREMIUM_NOT_AUTHORIZED" }, 403);
    }
  }

  const origin = new URL(context.request.url).origin;

  console.log("admin-audits:start", {
    // Avant cette mission, l'URL était toujours obligatoire : cette valeur
    // était donc toujours vraie. Elle reflète désormais l'état réel (Mode 1
    // vs Mode 2 — voir buildPipelineInput ci-dessus).
    has_google_url: Boolean(prepared.requestMetadata.googleBusinessUrl),
    has_company: Boolean(prepared.requestMetadata.companyName),
    has_city: Boolean(prepared.requestMetadata.city),
    report_type: prepared.requestMetadata.reportType,
  });

  const result = await runCollectionForReview(
    prepared.pipelineInput,
    (stage, stagePayload) => callPipelineStage({ origin, connectorToken }, stage, stagePayload),
  );

  if (result.status === "failed") {
    if (isManualCreation) await failManualAuditCreation(db, idempotencyKey);
    // Objectif 2 (mission "rendre l'identification suffisamment robuste") —
    // ces deux cas ne sont PAS des échecs du pipeline : ce sont des demandes
    // de décision humaine (candidats ambigus) ou une resoumission dont le
    // candidat choisi n'existe plus côté Outscraper. On les relaie tels
    // quels plutôt que de les noyer dans "PIPELINE_FAILED" — aucune analyse
    // n'a été créée dans D1 dans ces deux cas (voir functions/api/analyze.js).
    const upstreamError = result.error?.body?.error;
    if (result.stage === "observation" && upstreamError === "AMBIGUOUS_CANDIDATES") {
      console.log("admin-audits:ambiguous-candidates", { count: result.error?.body?.candidates?.length || 0 });
      return jsonResponse({
        success: false,
        error: "AMBIGUOUS_CANDIDATES",
        message: result.error?.body?.message || "Nous avons trouvé plusieurs entreprises pouvant correspondre.",
        candidates: result.error?.body?.candidates || [],
      }, 409);
    }
    if (result.stage === "observation" && upstreamError === "SELECTED_CANDIDATE_NOT_FOUND") {
      return jsonResponse({
        success: false,
        error: "SELECTED_CANDIDATE_NOT_FOUND",
        message: result.error?.body?.message || "Le candidat sélectionné n'a pas pu être retrouvé. Merci de relancer la recherche.",
      }, 409);
    }

    const upstreamMessage = result.error?.body?.message
      || result.error?.body?.error
      || result.error?.body?.success === false && "Une étape serveur a échoué."
      || null;
    console.error("admin-audits:pipeline-failed", {
      stage: result.stage,
      status: result.error?.status || null,
      upstream_error: result.error?.body?.error || null,
    });
    return jsonResponse({
      success: false,
      error: "PIPELINE_FAILED",
      stage: result.stage,
      stages: result.stages,
      message: upstreamMessage
        ? `Échec ${result.stage} : ${upstreamMessage}`
        : "Une erreur est survenue pendant la génération.",
    }, 502);
  }

  try {
    await markAwaitingReview(db, result.analysisId, prepared.requestMetadata.reportType);
    if (isManualCreation) {
      const completed = await completeManualAuditCreation(db, { idempotencyKey, analysisId: result.analysisId });
      if (!completed) throw new Error("manual_creation_metadata_not_completed");
    }
  } catch (error) {
    console.error("admin-audits:mark-awaiting-review-failed", {
      analysis_id: result.analysisId,
      missing_report_type_column: isMissingColumnError(error, "report_type"),
    });
    return jsonResponse({
      success: false,
      error: isMissingColumnError(error, "report_type")
        ? "MISSING_D1_MIGRATION"
        : "D1_UPDATE_FAILED",
      stage: "review",
      stages: result.stages,
      message: isMissingColumnError(error, "report_type")
        ? "La base locale n’est pas à jour. Appliquez la migration 0010_analysis_report_type.sql, puis relancez l’audit."
        : "L’analyse a été collectée, mais son passage en validation a échoué.",
    }, 500);
  }

  let analysis;
  try {
    analysis = await loadAnalysisById(db, result.analysisId);
  } catch (error) {
    console.error("admin-audits:analysis-read-failed", {
      analysis_id: result.analysisId,
      missing_migration: migrationForMissingColumn(error),
    });
    const migrationResponse = missingMigrationResponse({
      error,
      analysisId: result.analysisId,
      stages: result.stages,
    });
    if (migrationResponse) return migrationResponse;

    return jsonResponse({
      success: false,
      error: "D1_READ_FAILED",
      stage: "review",
      analysisId: result.analysisId,
      stages: result.stages,
      message: "L’analyse a été collectée, mais sa lecture avant validation a échoué.",
    }, 500);
  }
  if (!analysis) {
    return jsonResponse({
      success: false,
      error: "ANALYSIS_NOT_FOUND_AFTER_PIPELINE",
      analysisId: result.analysisId,
      stages: result.stages,
    }, 502);
  }

  console.log("admin-audits:success", {
    analysis_id: result.analysisId,
    awaiting_review: true,
  });

  const linkedTaskId = await attachAnalysisToOrder(db, {
    analysisId: result.analysisId,
    orderId: prepared.requestMetadata.orderId,
    taskId: prepared.requestMetadata.taskId,
    notes: prepared.requestMetadata.internalNotes,
  });

  const reviewLink = prepared.requestMetadata.reportType === "free"
    ? `/admin/free-diagnostic-production?analysisId=${encodeURIComponent(result.analysisId)}`
    : `/admin/audit-review/${encodeURIComponent(result.analysisId)}`;

  return jsonResponse({
    success: true,
    created: true,
    analysisId: result.analysisId,
    status: result.status,
    reportType: prepared.requestMetadata.reportType,
    stages: result.stages,
    identification: result.identification || null,
    analysis: summarizeAnalysis(analysis),
    links: {
      review: reviewLink,
      report: `/api/render/${encodeURIComponent(result.analysisId)}`,
      data: `/api/analysis/${encodeURIComponent(result.analysisId)}`,
      order: prepared.requestMetadata.orderId
        ? `/admin-order?id=${encodeURIComponent(prepared.requestMetadata.orderId)}`
        : null,
    },
    order: prepared.requestMetadata.orderId ? {
      orderId: prepared.requestMetadata.orderId,
      taskId: linkedTaskId || prepared.requestMetadata.taskId || null,
      status: linkedTaskId ? "in_progress" : null,
    } : null,
  });
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return onRequestOptions(context);
  return jsonResponse({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
}

export const __test__ = {
  AUDIT_OPERATIONS,
  buildPipelineInput,
  loadOrderContext,
  extractBusinessNameFromGoogleUrl,
  isValidGoogleBusinessUrl,
  normalizeReportType,
  migrationForMissingColumn,
  summarizeAnalysis,
  attachAnalysisToOrder,
  runCollectionForReview,
  markAwaitingReview,
};
