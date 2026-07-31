import { isValidAnalysisId, loadAnalysisById } from "../../api/analysis/_shared.js";
import { normalizeText, requireAdminSession, requireOrdersDb } from "../_shared.js";
import { buildFreeDiagnosticProductionQuery, loadOrderContextForAnalysis } from "../../lib/freeDiagnosticProductionLink.js";

const html = (analysisId, { showLegacyFreeDiagnosticLink = false, freeDiagnosticProductionQuery = "" } = {}) => `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Validation audit | Efficia Digital</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="icon" href="/assets/favicon/favicon.ico" sizes="any">
  <link rel="stylesheet" href="/css/reset.css">
  <link rel="stylesheet" href="/css/variables.css">
  <link rel="stylesheet" href="/css/admin.css">
  <style>
    .review-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(340px, 0.85fr); gap: 24px; align-items: start; }
    .review-kv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .review-kv div, .review-competitor { padding: 14px 16px; border: 1px solid #e2e8f0; border-radius: 18px; background: #fff; }
    .review-kv span, .review-competitor span { display: block; color: #64748b; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
    .review-kv strong, .review-competitor strong { display: block; margin-top: 5px; color: #0f172a; font-size: 15px; line-height: 1.45; overflow-wrap: anywhere; }
    .review-controls { display: grid; gap: 16px; }
    .review-controls select, .review-controls input, .review-controls textarea { width: 100%; min-height: 52px; border: 1px solid #dbe4f0; border-radius: 16px; padding: 0 16px; font: inherit; color: #0f172a; background: #fff; }
    .review-controls textarea { min-height: 120px; padding: 14px 16px; resize: vertical; }
    .review-controls label > span { display: block; margin-bottom: 7px; font-weight: 800; color: #0f172a; }
    .review-report-choice { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; border: 0; padding: 0; margin: 0; }
    .review-report-choice legend { grid-column: 1 / -1; padding: 0; font-weight: 800; color: #0f172a; }
    .review-report-choice label { display: flex; gap: 10px; align-items: flex-start; padding: 14px 16px; border: 1px solid #dbe4f0; border-radius: 16px; background: #fff; cursor: pointer; }
    .review-report-choice input { width: 16px; height: 16px; min-height: 16px; margin-top: 3px; padding: 0; accent-color: #2563eb; }
    .review-report-choice strong { display: block; color: #0f172a; font-size: 15px; line-height: 1.3; }
    .review-report-choice small { display: block; margin-top: 3px; color: #64748b; font-weight: 700; line-height: 1.35; }
    .review-report-choice label:has(input:checked) { border-color: rgba(37, 99, 235, .38); background: #f8fbff; box-shadow: 0 10px 26px rgba(37, 99, 235, .07); }
    .review-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .review-competitors { display: grid; gap: 10px; margin-top: 16px; }
    .review-competitor-actions { display: flex; gap: 14px; margin-top: 10px; color: #64748b; font-size: 13px; font-weight: 800; }
    .review-competitor-actions input { width: 16px; height: 16px; margin-right: 6px; vertical-align: -3px; }
    .review-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 18px; }
    .review-status { margin-top: 12px; font-weight: 800; color: #64748b; }
    .review-status.is-error { color: #ef4444; }
    .review-status.is-ok { color: #16a34a; }
    .is-disabled-link { pointer-events: none; opacity: .45; }
    .review-full-width { margin-top: 24px; }
    .criteria-toolbar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin: 18px 0 22px; }
    .criteria-summary { color: #64748b; font-weight: 800; }
    .criteria-groups { display: grid; gap: 18px; }
    .criteria-category { border: 1px solid #e2e8f0; border-radius: 24px; background: #fff; overflow: hidden; }
    .criteria-category__head { display: flex; justify-content: space-between; gap: 16px; padding: 22px 24px; background: #f8fbff; border-bottom: 1px solid #e2e8f0; }
    .criteria-category__head h3 { margin: 0; color: #0f172a; font-size: 22px; letter-spacing: -.02em; }
    .criteria-category__head span { color: #64748b; font-size: 14px; font-weight: 900; white-space: nowrap; }
    .criteria-item { padding: 20px 24px; border-bottom: 1px solid #edf2f7; }
    .criteria-item:last-child { border-bottom: 0; }
    .criteria-item__question { color: #0f172a; font-size: 17px; font-weight: 900; line-height: 1.35; }
    .criteria-item__help { margin-top: 6px; color: #64748b; font-size: 14px; font-weight: 700; line-height: 1.55; }
    .criteria-options { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
    .criteria-option { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 10px 13px; border: 1px solid #dbe4f0; border-radius: 14px; background: #fff; color: #0f172a; font-size: 14px; font-weight: 800; cursor: pointer; }
    .criteria-option input { width: 16px; height: 16px; min-height: 16px; padding: 0; accent-color: #2563eb; }
    .criteria-option:has(input:checked) { border-color: rgba(37, 99, 235, .42); background: #eff6ff; box-shadow: 0 10px 24px rgba(37, 99, 235, .07); }
    .criteria-checklist { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 14px; margin-top: 14px; padding: 14px; border: 1px solid #e2e8f0; border-radius: 16px; background: #f8fafc; }
    .criteria-checklist-title { grid-column: 1 / -1; color: #475569; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .04em; }
    .criteria-checklist label { display: flex; align-items: flex-start; gap: 9px; color: #475569; font-size: 13px; font-weight: 800; line-height: 1.4; }
    .criteria-checklist input { width: 15px; height: 15px; min-height: 15px; margin-top: 2px; padding: 0; accent-color: #2563eb; }
    @media (max-width: 980px) { .review-grid, .review-two, .review-kv, .review-report-choice { grid-template-columns: 1fr; } }
    @media (max-width: 720px) { .criteria-checklist { grid-template-columns: 1fr; } .criteria-category__head { display: block; } .criteria-category__head span { display: block; margin-top: 6px; } }
  </style>
</head>
<body class="admin-page" data-analysis-id="${analysisId}">
  <header class="admin-header">
    <div class="admin-header__inner">
      <a class="admin-brand" href="/admin" aria-label="Efficia Digital admin">
        <img src="/assets/logo/logo-efficia-web.png" alt="Efficia Digital">
      </a>
      <nav class="admin-nav">
        <a class="admin-button is-secondary" href="/admin">Commandes</a>
        <button class="admin-button is-danger" type="button" data-admin-logout>Déconnexion</button>
      </nav>
    </div>
  </header>

  <main class="admin-main">
    <div class="admin-layout">
      <section class="admin-title">
        <div>
          <span class="admin-kicker">Validation humaine</span>
          <h1>Contrôler l’audit avant rédaction</h1>
          <p>Vérifiez les données automatiques, confirmez les points visuels et préparez l’aperçu avant approbation du PDF.</p>
        </div>
      </section>

      <div class="review-grid">
        <section class="admin-card">
          <div class="admin-section-heading">
            <span class="admin-kicker">Données automatiques</span>
            <h2>Observation et benchmark</h2>
          </div>
          <div class="review-kv" data-review-observation></div>
          <div class="admin-section-heading" style="margin-top: 24px;">
            <span class="admin-kicker">Concurrents</span>
            <h2>Fiches observées</h2>
          </div>
          <div class="review-competitors" data-review-competitors></div>
        </section>

        <section class="admin-card">
          <div class="admin-section-heading">
            <span class="admin-kicker">Contrôles manuels</span>
            <h2>Corrections et confirmations</h2>
          </div>
          <form class="review-controls" data-review-form>
            <fieldset class="review-report-choice">
              <legend>Type de rapport</legend>
              <label>
                <input type="radio" name="reportType" value="free">
                <span>
                  <strong>Diagnostic gratuit</strong>
                  <small>Version courte pour un premier retour client.</small>
                </span>
              </label>
              <label>
                <input type="radio" name="reportType" value="premium" checked>
                <span>
                  <strong>Audit Premium 99 €</strong>
                  <small>Version complète à contrôler avant livraison.</small>
                </span>
              </label>
            </fieldset>
            <div class="review-two">
              <label><span>Description</span><select name="descriptionStatus"></select></label>
              <label><span>Qualité des photos</span><select name="photoQuality"></select></label>
              <label><span>Pertinence des photos</span><select name="photoRelevance"></select></label>
              <label><span>Réponses aux avis</span><select name="reviewResponseStatus"></select></label>
              <label><span>Complétude de la fiche</span><select name="profileCompleteness"></select></label>
              <label><span>Pertinence catégorie</span><select name="categoryRelevance"></select></label>
              <label><span>Exactitude horaires</span><select name="hoursAccuracy"></select></label>
              <label><span>Cohérence visuelle</span><select name="visualConsistency"></select></label>
            </div>
            <div class="review-two">
              <label><span>Ville confirmée</span><input name="confirmedCity" type="text"></label>
              <label><span>Catégorie confirmée</span><input name="confirmedCategory" type="text"></label>
              <label><span>Position confirmée</span><input name="confirmedPosition" type="number" min="0" step="1"></label>
              <label><span>Requête confirmée</span><input name="confirmedQuery" type="text"></label>
            </div>
            <label><span>Notes internes</span><textarea name="manualNotes"></textarea></label>
            <div class="review-actions">
              <button class="admin-button" type="submit" data-review-submit>Valider et préparer l’aperçu</button>
              <a class="admin-button is-secondary" href="#" target="_blank" rel="noopener" data-preview-link>Aperçu HTML</a>
              <button class="admin-button is-secondary" type="button" data-approve-button>Approuver le rapport</button>
              <a class="admin-button is-secondary is-disabled-link" href="#" target="_blank" rel="noopener" data-pdf-link${showLegacyFreeDiagnosticLink ? " hidden" : ""}>Générer le PDF</a>
              <a class="admin-button is-secondary" href="/admin/free-diagnostic-production/${freeDiagnosticProductionQuery ? `?${freeDiagnosticProductionQuery}` : ""}" data-free-diagnostic-query="${freeDiagnosticProductionQuery}" target="_blank" rel="noopener" data-legacy-generator-link${showLegacyFreeDiagnosticLink ? "" : " hidden"}>Ouvrir l'ancien générateur gratuit</a>
            </div>
            <p class="review-status" data-review-status></p>
          </form>
        </section>
      </div>

      <section class="admin-card review-full-width">
        <div class="admin-section-heading">
          <span class="admin-kicker">Contrôle détaillé</span>
          <h2>Critères Efficia à vérifier</h2>
          <p class="admin-muted">Retrouvez une grille complète proche de l’ancien outil. Ces choix servent à sécuriser la validation humaine, sans clé API dans le navigateur et sans calcul local du score.</p>
        </div>
        <div class="criteria-toolbar">
          <div class="criteria-summary" data-criteria-summary>0 critère renseigné</div>
          <button class="admin-button is-secondary" type="button" data-fill-unknown>Marquer les non vérifiés</button>
        </div>
        <div class="criteria-groups" data-criteria-groups></div>
      </section>
    </div>
  </main>

  <script src="/js/admin-audit-review.js"></script>
</body>
</html>`;

export async function onRequestGet(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return new Response("", { status: 302, headers: { Location: "/admin-login" } });

  const analysisId = normalizeText(context.params.analysisId);
  if (!isValidAnalysisId(analysisId)) {
    return new Response("Analyse invalide.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  // Le lien "Ouvrir l'ancien générateur gratuit" ne doit apparaître que pour
  // les analyses au format gratuit (reportType === "free"). Une erreur de
  // lecture ici ne doit pas empêcher l'affichage de la page de validation
  // elle-même : le lien est simplement masqué par défaut.
  let showLegacyFreeDiagnosticLink = false;
  let freeDiagnosticProductionQuery = "";
  try {
    const db = requireOrdersDb(context.env);
    const analysis = await loadAnalysisById(db, analysisId);
    showLegacyFreeDiagnosticLink = analysis?.reportType === "free";
    if (showLegacyFreeDiagnosticLink) {
      const orderContext = await loadOrderContextForAnalysis(db, analysisId);
      freeDiagnosticProductionQuery = buildFreeDiagnosticProductionQuery(analysis, orderContext);
    }
  } catch (error) {
    console.error("audit-review: lecture reportType impossible", error);
  }

  return new Response(html(analysisId, { showLegacyFreeDiagnosticLink, freeDiagnosticProductionQuery }), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
