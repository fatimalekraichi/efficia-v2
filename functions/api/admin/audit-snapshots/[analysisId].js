import { isValidAnalysisId, loadAnalysisById } from "../../analysis/_shared.js";
import { jsonResponse, normalizeText, requireAdminSession, requireOrdersDb } from "../../../admin/_shared.js";
import {
  duplicateQuestionnaireSnapshot,
  finalizeQuestionnaireSnapshot,
  loadQuestionnaireSnapshot,
} from "../../../lib/auditQuestionnaireSnapshots.js";
import { evaluateGeographicAnchorReadiness } from "../../../lib/geographicAnchor.js";

async function readPayload(request) {
  try { return await request.json(); } catch { return null; }
}

async function authorizedContext(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return { response: auth.response };
  const analysisId = normalizeText(context.params.analysisId);
  if (!isValidAnalysisId(analysisId)) {
    return { response: jsonResponse({ success: false, error: "INVALID_ANALYSIS_ID" }, 400) };
  }
  return { analysisId, db: requireOrdersDb(context.env) };
}

// Mission "ancrage géographique automatique" (Point 3, revue) — la
// finalisation du questionnaire (action "finalize") est le seul point
// d'écriture serveur qui marque un diagnostic gratuit comme terminé
// (analyses.status = 'pdf_generated' — voir finalizeQuestionnaireSnapshot).
// C'est aussi la porte d'entrée du transfert Premium manuel
// (audit-premium-transfers.js n'accepte que status = 'pdf_generated' avec
// un snapshot déjà figé). Bloquer ici, côté serveur, avant tout appel à
// finalizeQuestionnaireSnapshot (donc avant toute écriture), suffit à
// protéger l'ensemble de la chaîne "finalisation -> approbation -> transfert
// Premium" — sans dépendre d'un bouton désactivé côté navigateur, et sans
// jamais laisser une écriture partielle en cas de refus.
// Le PDF lui-même est généré 100% côté navigateur (html2canvas + jsPDF,
// aucun octet ne transite par le serveur) : aucun endpoint ne peut donc
// empêcher le rendu local du fichier. Ce que le serveur peut et doit
// garantir, c'est qu'un diagnostic gratuit ne peut jamais être ENREGISTRÉ
// comme terminé/livré (statut, snapshot, éligibilité au transfert Premium)
// tant que la zone géographique qui a produit les résultats affichés n'est
// pas confirmée à jour.
const GEOGRAPHIC_ANCHOR_FINALIZATION_MESSAGES = {
  GEOGRAPHIC_ANCHOR_MISSING_FOR_EXISTING_RESULTS:
    "La zone géographique utilisée pour la dernière recherche n’a pas pu être confirmée. Relancez l’analyse avant de finaliser le diagnostic.",
  GEOGRAPHIC_ANCHOR_STALE:
    "La zone géographique détectée a changé depuis la dernière analyse de recherche. Relancez l’analyse avant de finaliser le diagnostic.",
  SEARCH_QUERY_STALE:
    "La requête affichée diffère de la dernière recherche analysée. Relancez l’analyse avant de finaliser le diagnostic.",
};

function geographicAnchorFinalizationFailure(code) {
  return jsonResponse({
    success: false,
    error: code,
    message: GEOGRAPHIC_ANCHOR_FINALIZATION_MESSAGES[code]
      || "La zone géographique de cette analyse doit être reconfirmée avant de finaliser le diagnostic.",
  }, 409, { "Cache-Control": "no-store" });
}

export async function onRequestGet(context) {
  const authorized = await authorizedContext(context);
  if (authorized.response) return authorized.response;
  const snapshot = await loadQuestionnaireSnapshot(authorized.db, authorized.analysisId);
  if (!snapshot) {
    return jsonResponse({
      success: false,
      error: "QUESTIONNAIRE_SNAPSHOT_NOT_FOUND",
      message: "Aucune sauvegarde finale du questionnaire n’existe pour cet audit.",
    }, 404);
  }
  return jsonResponse({ success: true, snapshot }, 200, { "Cache-Control": "no-store" });
}

export async function onRequestPost(context) {
  const authorized = await authorizedContext(context);
  if (authorized.response) return authorized.response;
  const payload = await readPayload(context.request);
  const action = normalizeText(payload?.action);

  if (action === "finalize") {
    const analysis = await loadAnalysisById(authorized.db, authorized.analysisId);
    if (!analysis) return jsonResponse({ success: false, error: "ANALYSIS_NOT_FOUND" }, 404);
    // Uniquement pour le diagnostic gratuit (mission "ancrage géographique
    // automatique") : le Premium n'utilise pas cette recherche
    // concurrentielle ancrée automatiquement et ne doit jamais être
    // impacté par cette règle.
    if (analysis.reportType === "free") {
      const readiness = evaluateGeographicAnchorReadiness({
        normalized: analysis.business?.normalized || {},
        fiche: analysis.business?.fiche || {},
        business: analysis.business || {},
        benchmarkAverages: analysis.benchmark?.averages || {},
        displayedSearchQuery: payload?.displayedSearchQuery !== undefined
          ? normalizeText(payload.displayedSearchQuery)
          : undefined,
      });
      if (!readiness.ok) {
        console.error("audit-snapshots: finalisation refusée (ancrage géographique)", {
          phase: "geographic_anchor_finalization",
          analysis_id: authorized.analysisId,
          code: readiness.code,
        });
        return geographicAnchorFinalizationFailure(readiness.code);
      }
    }
    const result = await finalizeQuestionnaireSnapshot(authorized.db, authorized.analysisId, {
      pdfFilename: normalizeText(payload?.pdfFilename).slice(0, 240),
    });
    if (!result.ok) {
      return jsonResponse({
        success: false,
        error: result.error,
        message: "Aucune sauvegarde du questionnaire n’existe : le PDF n’a pas finalisé l’audit.",
      }, 409);
    }
    return jsonResponse({ success: true, snapshot: result.snapshot, created: result.created });
  }

  if (action === "duplicate") {
    const idempotencyKey = normalizeText(payload?.idempotencyKey);
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey)) {
      return jsonResponse({ success: false, error: "INVALID_IDEMPOTENCY_KEY" }, 400);
    }
    const result = await duplicateQuestionnaireSnapshot(
      authorized.db,
      authorized.analysisId,
      idempotencyKey,
    );
    if (!result.ok) {
      const status = result.error === "ANALYSIS_NOT_FOUND" ? 404 : 409;
      return jsonResponse({ success: false, error: result.error }, status);
    }
    return jsonResponse({ success: true, duplicate: result }, result.created ? 201 : 200);
  }

  return jsonResponse({ success: false, error: "INVALID_ACTION" }, 400);
}
