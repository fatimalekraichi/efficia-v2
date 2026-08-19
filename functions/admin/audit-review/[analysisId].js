import { isValidAnalysisId, loadAnalysisById } from "../../api/analysis/_shared.js";
import { normalizeText, requireAdminSession, requireOrdersDb } from "../_shared.js";

const html = (analysisId, { showLegacyFreeDiagnosticLink = false } = {}) => `<!DOCTYPE html>
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
    .review-kv { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px; }
    .review-kv div, .review-competitor { padding: 9px 13px; border: 1px solid #e2e8f0; border-radius: 14px; background: #fff; }
    .review-kv span, .review-competitor span { display: block; color: #64748b; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
    .review-kv strong, .review-competitor strong { display: block; margin-top: 3px; color: #0f172a; font-size: 13.5px; line-height: 1.35; overflow-wrap: anywhere; }
    .observation-link { display: inline-flex; align-items: center; gap: 5px; color: #2563eb; text-decoration: none; }
    .observation-link:hover, .observation-link:focus-visible { text-decoration: underline; }
    .confidence-badge { display: inline-flex; align-items: center; gap: 5px; }
    .review-competitors { display: grid; gap: 8px; margin-top: 12px; }
    .competitors-summary { margin: 10px 0 0; color: #64748b; font-weight: 800; font-size: 13px; }
    .review-competitor-actions { display: flex; gap: 14px; margin-top: 10px; color: #64748b; font-size: 13px; font-weight: 800; }
    .review-competitor-actions input { width: 16px; height: 16px; margin-right: 6px; vertical-align: -3px; }
    .review-status { margin-top: 12px; font-weight: 800; color: #64748b; }
    .review-status.is-error { color: #ef4444; }
    .review-status.is-ok { color: #16a34a; }
    .is-disabled-link { pointer-events: none; opacity: .45; }
    .review-full-width { margin-top: 24px; }
    .criteria-toolbar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin: 18px 0 14px; }
    .criteria-summary { color: #64748b; font-weight: 800; }
    .criteria-not-verified-summary { margin: 0 0 22px; padding: 12px 16px; border-radius: 14px; background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; font-weight: 800; font-size: 14px; }
    .criteria-not-verified-summary.has-pending { background: #fef2f2; border-color: #fecaca; color: #b91c1c; }
    .criteria-groups { display: grid; gap: 18px; }
    .criteria-category { border: 1px solid #e2e8f0; border-radius: 24px; background: #fff; overflow: hidden; }
    .criteria-category__head { display: flex; justify-content: space-between; gap: 16px; padding: 22px 24px; background: #f8fbff; border-bottom: 1px solid #e2e8f0; }
    .criteria-category__head h3 { margin: 0; color: #0f172a; font-size: 22px; letter-spacing: -.02em; }
    .criteria-category__head span { color: #64748b; font-size: 14px; font-weight: 900; white-space: nowrap; }
    .criteria-item { padding: 20px 24px; border-bottom: 1px solid #edf2f7; transition: background-color .15s ease, box-shadow .15s ease, padding .2s ease, border-color .2s ease; }
    .criteria-item:last-child { border-bottom: 0; }
    .criteria-precondition { padding: 20px 24px; border-bottom: 1px solid #edf2f7; background: #f8fbff; }
    .criteria-item.is-not-verified { background: #fef6f6; box-shadow: inset 0 0 0 1px #fecaca; border-radius: 12px; }
    .criteria-item.is-dependency-hidden { padding-top: 0; padding-bottom: 0; border-bottom-color: transparent; }
    .criteria-item__collapse { display: grid; grid-template-rows: 1fr; opacity: 1; transition: grid-template-rows .2s ease, opacity .2s ease; }
    .criteria-item.is-dependency-hidden .criteria-item__collapse { grid-template-rows: 0fr; opacity: 0; }
    .criteria-item__collapse-inner { overflow: hidden; min-height: 0; }
    .criteria-item__question { color: #0f172a; font-size: 17px; font-weight: 900; line-height: 1.35; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .criteria-not-verified-badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 999px; background: #fee2e2; color: #b91c1c; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .04em; }
    .criteria-item__help { margin-top: 6px; color: #64748b; font-size: 14px; font-weight: 700; line-height: 1.55; }
    .criteria-options { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
    .criteria-option { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 10px 13px; border: 1px solid #dbe4f0; border-radius: 14px; background: #fff; color: #0f172a; font-size: 14px; font-weight: 800; cursor: pointer; }
    .criteria-option input { width: 16px; height: 16px; min-height: 16px; padding: 0; accent-color: #2563eb; }
    .criteria-option:has(input:checked) { border-color: rgba(37, 99, 235, .42); background: #eff6ff; box-shadow: 0 10px 24px rgba(37, 99, 235, .07); }
    .criteria-checklist { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 14px; margin-top: 14px; padding: 14px; border: 1px solid #e2e8f0; border-radius: 16px; background: #f8fafc; }
    .criteria-checklist-title { grid-column: 1 / -1; color: #475569; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .04em; }
    .criteria-checklist label { display: flex; align-items: flex-start; gap: 9px; color: #475569; font-size: 13px; font-weight: 800; line-height: 1.4; }
    .criteria-checklist input { width: 15px; height: 15px; min-height: 15px; margin-top: 2px; padding: 0; accent-color: #2563eb; }
    .review-actions-card { margin-top: 24px; }
    .review-actions-form { display: grid; gap: 14px; }
    .review-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; }
    .review-actions__primary { min-width: 260px; }
    .review-actions__secondary { display: flex; flex-wrap: wrap; gap: 10px; }
    .execution-editor { display: grid; gap: 18px; }
    .execution-editor__group { padding: 18px; border: 1px solid #e2e8f0; border-radius: 18px; background: #f8fafc; }
    .execution-editor__group h3 { margin: 0 0 12px; color: #0f172a; }
    .execution-editor__item { display: grid; grid-template-columns: minmax(0, 1fr) 190px; gap: 10px; margin-top: 10px; padding: 12px; border-radius: 14px; background: #fff; border: 1px solid #e2e8f0; }
    .execution-editor__item textarea, .execution-editor__item input, .execution-editor__item select { width: 100%; }
    .execution-editor__item textarea { min-height: 86px; resize: vertical; }
    .execution-editor__item label { color: #475569; font-size: 12px; font-weight: 900; }
    .execution-editor__item.is-pending { border-color: #f59e0b; background: #fffbeb; }
    .execution-editor__notice { color: #92400e; font-weight: 800; }
    @media (max-width: 980px) { .review-kv { grid-template-columns: 1fr; } }
    @media (max-width: 720px) { .criteria-checklist { grid-template-columns: 1fr; } .criteria-category__head { display: block; } .criteria-category__head span { display: block; margin-top: 6px; } }
    @media (max-width: 640px) { .review-actions { flex-direction: column; align-items: stretch; } .review-actions__primary { width: 100%; } .review-actions__secondary { flex-direction: column; width: 100%; } .review-actions__secondary .admin-button { width: 100%; text-align: center; } }
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

      <section class="admin-card">
        <div class="admin-section-heading">
          <span class="admin-kicker">Données automatiques</span>
          <h2>Observation et benchmark</h2>
        </div>
        <div class="review-kv" data-review-observation></div>
        <div class="admin-section-heading" style="margin-top: 16px;">
          <span class="admin-kicker">Concurrents</span>
          <h2>Fiches observées</h2>
        </div>
        <p class="competitors-summary" data-competitors-summary></p>
        <div class="review-competitors" data-review-competitors></div>
      </section>

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
        <p class="criteria-not-verified-summary" data-criteria-not-verified-summary></p>
        <div class="criteria-groups" data-criteria-groups></div>
      </section>

      <section class="admin-card review-full-width">
        <div class="admin-section-heading">
          <span class="admin-kicker">Plan d’exécution</span>
          <h2>Livrables à valider avant publication</h2>
          <p class="admin-muted">Éditez les propositions, puis choisissez « Approuvé », « À confirmer » ou « Non applicable ». Le PDF utilise uniquement les éléments approuvés.</p>
        </div>
        <p class="execution-editor__notice" data-execution-pending></p>
        <div class="execution-editor" data-execution-editor></div>
      </section>

      <section class="admin-card review-actions-card">
        <div class="admin-section-heading">
          <span class="admin-kicker">Validation</span>
          <h2>Actions</h2>
        </div>
        <form class="review-actions-form" data-review-form>
          <div class="review-actions">
            <button class="admin-button review-actions__primary" type="submit" data-review-submit>Valider et préparer l’aperçu</button>
            <div class="review-actions__secondary">
              <button class="admin-button is-secondary" type="button" data-draft-save>Enregistrer le brouillon</button>
              <a class="admin-button is-secondary" href="#" target="_blank" rel="noopener" data-preview-link>Aperçu HTML</a>
              <button class="admin-button is-secondary" type="button" data-approve-button>Approuver le rapport</button>
              <a class="admin-button is-secondary is-disabled-link" href="#" target="_blank" rel="noopener" data-pdf-link${showLegacyFreeDiagnosticLink ? " hidden" : ""}>Générer le PDF</a>
              <a class="admin-button is-secondary" href="/admin/free-diagnostic-production/?analysisId=${encodeURIComponent(analysisId)}" data-free-diagnostic-analysis-id="${analysisId}" target="_blank" rel="noopener" data-legacy-generator-link${showLegacyFreeDiagnosticLink ? "" : " hidden"}>Ouvrir l'ancien générateur gratuit</a>
            </div>
          </div>
          <p class="admin-muted" data-draft-status></p>
          <p class="review-status" data-review-status></p>
        </form>
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
  try {
    const db = requireOrdersDb(context.env);
    const analysis = await loadAnalysisById(db, analysisId);
    showLegacyFreeDiagnosticLink = analysis?.reportType === "free";
  } catch (error) {
    console.error("audit-review: lecture reportType impossible", error);
  }

  return new Response(html(analysisId, { showLegacyFreeDiagnosticLink }), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
