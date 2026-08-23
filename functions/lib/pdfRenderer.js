import { resolveReportCity } from "./auditComposition.js";

export function sanitizeFilenamePart(value) {
  const cleaned = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return cleaned || "Analyse";
}

export function formatDateForFilename(date = new Date()) {
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

export function buildAuditPdfFilename(analysis, date = new Date()) {
  const business = analysis?.business || {};
  const name = sanitizeFilenamePart(business.name || business.nom || analysis?.analysisId);
  const city = sanitizeFilenamePart(resolveReportCity(analysis) || "Non-renseignee");
  const fileDate = formatDateForFilename(date);
  if (analysis?.reportType === "premium") {
    return `Audit-Efficia-Premium_${name}_${city}_${fileDate}.pdf`;
  }
  return `Audit-Efficia-${name}-${fileDate}.pdf`;
}

export function buildControlPdfTitle(analysis, date = new Date()) {
  const business = analysis?.business || {};
  const name = sanitizeFilenamePart(business.name || business.nom || analysis?.analysisId);
  const city = sanitizeFilenamePart(resolveReportCity(analysis) || "Non-renseignee");
  const fileDate = formatDateForFilename(date);
  return `CONTROLE-NON-APPROUVE_Audit-Efficia_${name}_${city}_${fileDate}.pdf`;
}

export function addPdfPrintStyles(html) {
  const css = `
    <style id="efficia-pdf-print-css">
      @page {
        size: A4;
        margin: 12mm;
      }

      @media print {
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .card,
        .section,
        .panel,
        .metric,
        .score-card,
        table,
        tr,
        li,
        section,
        .priority-item {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .no-print {
          display: none !important;
        }
      }
    </style>
  `;

  if (html.includes("</head>")) return html.replace("</head>", `${css}</head>`);
  return `${css}${html}`;
}

export function addPreviewToolbar(html, analysisId, status = "", options = {}) {
  const safeAnalysisId = encodeURIComponent(String(analysisId || "latest"));
  const approved = status === "approved" || status === "pdf_generated";
  const controlPdfAvailable = status === "preview_ready"
    && options.reportType === "premium"
    && options.requestedAnalysisId === analysisId;
  const controlPdfTitle = options.controlPdfTitle || buildControlPdfTitle({ analysisId });
  const finalPdfTitle = options.finalPdfTitle || buildAuditPdfFilename({ analysisId, reportType: options.reportType });
  const controlPdfButton = controlPdfAvailable ? `
      <button type="button" data-efficia-control-pdf data-efficia-control-title="${controlPdfTitle}">Exporter le PDF de contrôle</button>
  ` : "";
  const controlPdfMarker = controlPdfAvailable
    ? `<div class="efficia-control-print-watermark" aria-hidden="true">DOCUMENT DE CONTRÔLE — NON APPROUVÉ</div>`
    : "";
  const controlPdfNotice = controlPdfAvailable ? `
    <p class="efficia-control-print-notice">Version de contrôle destinée à la vérification interne. Ne pas transmettre au client.</p>
  ` : "";
  const controlPdfScript = controlPdfAvailable ? `
      document.addEventListener("click", (event) => {
        const button = event.target.closest("[data-efficia-control-pdf]");
        if (!button) return;
        const originalTitle = document.title;
        document.title = button.dataset.efficiaControlTitle;
        try {
          window.print();
        } finally {
          document.title = originalTitle;
        }
      });
  ` : "";
  const controlPdfCss = controlPdfAvailable ? `
      .report-shell .page {
        position: relative;
      }

      .efficia-control-print-watermark {
        position: absolute;
        top: 6px;
        right: 18px;
        z-index: 20;
        padding: 3px 8px;
        border: 1px solid #b91c1c;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.94);
        color: #b91c1c;
        font: 900 9px/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
        letter-spacing: 0.06em;
        white-space: nowrap;
      }

      .efficia-control-print-notice {
        position: relative;
        z-index: 10;
        margin: 30px 0 18px;
        padding: 8px 12px;
        border-left: 3px solid #b91c1c;
        background: #fff7f7;
        color: #7f1d1d;
        font: 800 9px/1.3 Inter, ui-sans-serif, system-ui, sans-serif;
      }

      @media screen and (max-width: 600px) {
        .efficia-control-print-watermark {
          left: 8px;
          right: 8px;
          max-width: calc(100% - 16px);
          font-size: 7px;
          text-align: center;
          white-space: normal;
        }

        .efficia-control-print-notice {
          margin-top: 42px;
          text-align: center;
          overflow-wrap: anywhere;
        }
      }

      @media print {
        .efficia-control-print-watermark {
          position: absolute;
          top: 2mm;
          right: 12mm;
          z-index: 1000;
          display: block;
          padding: 1mm 2mm;
          border: 0.3mm solid #b91c1c;
          border-radius: 999px;
          background: #ffffff;
          color: #b91c1c;
          font: 900 7pt/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
          letter-spacing: 0.06em;
          white-space: nowrap;
        }

        .report-shell .page:first-child > .efficia-control-print-watermark {
          position: relative;
          top: auto;
          right: auto;
          width: max-content;
          margin: 0 0 7mm auto;
        }

        .efficia-control-print-notice {
          margin: 0 0 5mm;
          padding: 2mm 3mm;
          break-inside: avoid;
          page-break-inside: avoid;
          font-size: 7pt;
        }
      }
  ` : "";
  const toolbar = `
    <div class="efficia-preview-toolbar no-print">
      ${approved ? "" : `<a href="/admin/audit-review/${safeAnalysisId}" data-efficia-return-modifications>Retourner aux modifications</a>`}
      ${controlPdfButton}
      <button type="button" data-efficia-approve-and-download="${safeAnalysisId}" data-efficia-approval-complete="${approved ? "true" : "false"}" data-efficia-final-print-fallback="false" data-efficia-final-title="${finalPdfTitle}">${approved ? "Télécharger à nouveau le PDF final" : "Approuver et télécharger le PDF final"}</button>
      <a href="/admin" data-efficia-dashboard-link ${approved ? "" : "hidden"}>Retour au tableau de bord</a>
      <strong data-efficia-completion-status ${approved ? "" : "hidden"}>${approved ? "Audit terminé" : ""}</strong>
      <p data-efficia-approval-status role="status" aria-live="polite"></p>
    </div>
    <script>
      ${controlPdfScript}

      const setEfficiaPrintMode = (mode) => {
        document.documentElement.dataset.efficiaPrintMode = mode;
      };
      const activateEfficiaFinalPrintMode = () => {
        setEfficiaPrintMode("final-print");
        document.querySelector("[data-efficia-control-pdf]")?.remove();
        document.querySelector("[data-efficia-return-modifications]")?.remove();
        document.querySelectorAll(".efficia-control-print-watermark, .efficia-control-print-notice")
          .forEach((element) => element.remove());
      };
      const printEfficiaFinalPdf = (button, status) => {
        activateEfficiaFinalPrintMode();
        const originalTitle = document.title;
        document.title = button.dataset.efficiaFinalTitle;
        try {
          window.print();
          if (status) status.textContent = "";
        } catch {
          if (status) status.textContent = "Le téléchargement automatique n’est pas disponible sur cet environnement. Cliquez sur « Enregistrer le PDF final » pour ouvrir l’enregistrement via Chrome.";
        } finally {
          document.title = originalTitle;
        }
      };
      setEfficiaPrintMode(${controlPdfAvailable ? '"control-print"' : approved ? '"final-print"' : '"preview"'});

      document.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-efficia-approve-and-download]");
        if (!button || button.disabled) return;
        const status = document.querySelector("[data-efficia-approval-status]");
        const analysisId = button.dataset.efficiaApproveAndDownload;
        let approvalComplete = button.dataset.efficiaApprovalComplete === "true";
        if (button.dataset.efficiaFinalPrintFallback === "true") {
          printEfficiaFinalPdf(button, status);
          return;
        }
        button.disabled = true;
        try {
          if (!approvalComplete) {
            button.textContent = "Approbation...";
            if (status) status.textContent = "Approbation du rapport...";
            const approvalResponse = await fetch("/api/admin/audit-review/" + analysisId, {
              method: "PATCH",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "approve", analysisId: analysisId })
            });
            const approvalData = await approvalResponse.json().catch(() => ({}));
            if (!approvalResponse.ok || !approvalData.success) {
              const reference = approvalData.reference ? " Référence : " + approvalData.reference + "." : "";
              throw new Error((approvalData.message || "Le rapport n’a pas pu être approuvé.") + reference);
            }
            approvalComplete = true;
            button.dataset.efficiaApprovalComplete = "true";
            const completionStatus = document.querySelector("[data-efficia-completion-status]");
            if (completionStatus) {
              completionStatus.hidden = false;
              completionStatus.textContent = "Audit terminé";
            }
            const dashboardLink = document.querySelector("[data-efficia-dashboard-link]");
            if (dashboardLink) dashboardLink.hidden = false;
            activateEfficiaFinalPrintMode();
          }

          button.textContent = "Préparation du PDF final...";
          if (status) status.textContent = "Génération du PDF final...";
          const pdfResponse = await fetch("/api/pdf/" + analysisId, { credentials: "same-origin" });
          if (!pdfResponse.ok) {
            const pdfError = await pdfResponse.json().catch(() => null);
            if (pdfResponse.status === 501 && pdfError?.error === "PDF_RENDERER_NOT_CONFIGURED") {
              button.dataset.efficiaFinalPrintFallback = "true";
              button.textContent = "Enregistrer le PDF final";
              printEfficiaFinalPdf(button, status);
              return;
            }
            throw new Error(pdfError?.message || "Le PDF final n’a pas pu être téléchargé.");
          }
          const pdf = await pdfResponse.blob();
          const disposition = pdfResponse.headers.get("Content-Disposition") || "";
          const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
          const filename = filenameMatch ? filenameMatch[1] : "Audit-Efficia-Premium.pdf";
          const objectUrl = URL.createObjectURL(pdf);
          const link = document.createElement("a");
          link.href = objectUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
          if (status) status.textContent = "Audit terminé. PDF final téléchargé.";
        } catch (error) {
          if (status) status.textContent = error.message || "L’opération n’a pas pu aboutir.";
        } finally {
          button.disabled = false;
          button.textContent = button.dataset.efficiaFinalPrintFallback === "true"
            ? "Enregistrer le PDF final"
            : approvalComplete
              ? "Télécharger à nouveau le PDF final"
              : "Approuver et télécharger le PDF final";
        }
      });
    </script>
    <style id="efficia-preview-toolbar-css">
      .efficia-preview-toolbar {
        position: sticky;
        top: 0;
        z-index: 50;
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 10px;
        padding: 12px;
        background: rgba(248, 251, 255, 0.92);
        border-bottom: 1px solid #e2e8f0;
        backdrop-filter: blur(14px);
      }

      .efficia-preview-toolbar button,
      .efficia-preview-toolbar a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 42px;
        padding: 0 18px;
        border: 1px solid #bfdbfe;
        border-radius: 999px;
        background: #2563eb;
        color: #ffffff;
        font: 800 14px/1 Inter, ui-sans-serif, system-ui, sans-serif;
        text-decoration: none;
        box-shadow: 0 12px 28px rgba(37, 99, 235, 0.18);
        cursor: pointer;
      }

      .efficia-preview-toolbar a {
        background: #ffffff;
        color: #2563eb;
        box-shadow: none;
      }

      .efficia-preview-toolbar a.is-disabled {
        pointer-events: none;
        opacity: 0.45;
      }

      .efficia-preview-toolbar button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      @media screen and (max-width: 600px) {
        .efficia-preview-toolbar {
          position: static;
          width: 100vw;
          max-width: 100vw;
          gap: 6px;
          padding: 8px;
        }

        .efficia-preview-toolbar button,
        .efficia-preview-toolbar a {
          flex: 1 1 100%;
          min-width: 0;
          min-height: 44px;
          padding: 7px 9px;
          font-size: 12px;
          line-height: 1.15;
          text-align: center;
          white-space: normal;
          overflow-wrap: anywhere;
        }

        .report-shell,
        .report-shell .page {
          width: 100% !important;
          max-width: 100% !important;
          padding-right: 16px !important;
          padding-left: 16px !important;
        }
      }

      ${controlPdfCss}

      [data-efficia-approval-status] {
        flex-basis: 100%;
        margin: 0;
        color: #b91c1c;
        text-align: center;
        font: 800 13px/1.4 Inter, ui-sans-serif, system-ui, sans-serif;
      }
    </style>
  `;

  let firstPage = true;
  const reportHtml = controlPdfAvailable
    ? html.replace(
      /(<(?:section|div)\b[^>]*\bclass=["'][^"']*\bpage\b[^"']*["'][^>]*>)/gi,
      (openingTag) => {
        const pageHeader = `${controlPdfMarker}${firstPage ? controlPdfNotice : ""}`;
        firstPage = false;
        return `${openingTag}${pageHeader}`;
      },
    )
    : html;
  if (/<body(?:\s[^>]*)?>/i.test(reportHtml)) {
    return reportHtml.replace(/<body(?:\s[^>]*)?>/i, (openingTag) => `${openingTag}${toolbar}`);
  }
  return `${toolbar}${reportHtml}`;
}

function getBrowserRenderingConfig(env = {}) {
  return {
    accountId: env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || "",
    apiToken: env.BROWSER_RENDERING_API_TOKEN || env.CLOUDFLARE_BROWSER_RENDERING_TOKEN || "",
  };
}

export function assertBrowserRenderingConfig(env = {}) {
  const { accountId, apiToken } = getBrowserRenderingConfig(env);
  if (!accountId || !apiToken) {
    const reference = crypto.randomUUID();
    console.error(JSON.stringify({
      message: "pdf renderer not configured",
      error: "PDF_RENDERER_NOT_CONFIGURED",
      reference,
      missing: [
        ...(!accountId ? ["CLOUDFLARE_ACCOUNT_ID"] : []),
        ...(!apiToken ? ["BROWSER_RENDERING_API_TOKEN"] : []),
      ],
    }));
    return {
      ok: false,
      error: "PDF_RENDERER_NOT_CONFIGURED",
      message: "Le téléchargement automatique du PDF n’est pas disponible sur cet environnement.",
      reference,
    };
  }
  return { ok: true, accountId, apiToken };
}

export async function renderPdfWithCloudflareBrowserRun({ html, env, fetchImpl = fetch }) {
  const config = assertBrowserRenderingConfig(env);
  if (!config.ok) return config;

  const response = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/browser-rendering/pdf`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        html: addPdfPrintStyles(html),
        format: "A4",
        printBackground: true,
        margin: {
          top: "12mm",
          right: "12mm",
          bottom: "12mm",
          left: "12mm",
        },
      }),
    },
  );

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    console.error("pdf-renderer: Cloudflare Browser Run error", {
      status: response.status,
      statusText: response.statusText,
      message: message.slice(0, 300),
    });
    return {
      ok: false,
      error: "PDF_RENDERING_FAILED",
      status: response.status,
      message: "La génération PDF a échoué.",
    };
  }

  const pdf = await response.arrayBuffer();
  return { ok: true, pdf };
}

/* ============================================================================
 * Diagnostic Efficia™ (gratuit) — chemin PDF dédié, capture page par page.
 *
 * Contexte : le pipeline historique (outil-score-efficia-auto-v5.html,
 * commit a9e3241) ne déléguait JAMAIS la pagination au moteur d'impression.
 * Chacune des 6 div .page (déjà dimensionnées en 210×297mm par le CSS) était
 * capturée individuellement (html2canvas) puis assemblée en image plein
 * feuillet dans le PDF (jsPDF, addImage(...,0,0,210,297)) — une div .page =
 * une page PDF, garanti par construction, sans aucune repagination CSS.
 * validerMiseEnPageRapport() mesurait en plus le DOM réellement rendu avant
 * toute génération et bloquait si un contenu débordait.
 *
 * Cette section reproduit fidèlement cette architecture au-dessus du Browser
 * Rendering API déjà utilisé par renderPdfWithCloudflareBrowserRun ci-dessus
 * (REST, comme dans le projet — pas de binding Worker) :
 *   1. /scrape  — mesure chaque page + son pied de page + ses enfants directs
 *      (équivalent du offsetTop/offsetHeight historique ; getBoundingClientRect
 *      des enfants n'est PAS affecté par overflow:hidden du parent, ce qui
 *      permet de détecter un débordement réel même invisible à l'écran).
 *   2. /screenshot (selector) — une capture par page, à sa taille réelle.
 *   3. Assemblage en PDF via un écrivain minimal (buildImageOnlyPdf), sans
 *      dépendance ajoutée : voir justification dans le rapport de mission.
 *
 * Le renderer premium (renderPdfWithCloudflareBrowserRun, PDF natif Chromium
 * via /pdf) n'est ni modifié ni appelé par ce chemin.
 * ========================================================================= */

const FREE_DIAGNOSTIC_PAGE_COUNT = 6;
const FREE_DIAGNOSTIC_PAGE_ATTR = "data-free-page";
const FREE_DIAGNOSTIC_ALL_PAGES_SELECTOR = ".free-diagnostic .page";
// Tolérance identique à l'ancien validerMiseEnPageRapport() :
// `if(contentBottom > footerTop - 12)`.
const FREE_DIAGNOSTIC_FOOTER_TOLERANCE_PX = 12;

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;

// Exportées (avec la constante de nombre de pages et le sélecteur global) pour
// que les tests puissent construire des fixtures /scrape réalistes sans
// dupliquer le format des sélecteurs.
export function freeDiagnosticPageSelector(pageIndex) {
  return `${FREE_DIAGNOSTIC_ALL_PAGES_SELECTOR}[${FREE_DIAGNOSTIC_PAGE_ATTR}="${pageIndex}"]`;
}

export function freeDiagnosticFooterSelector(pageIndex) {
  return `${freeDiagnosticPageSelector(pageIndex)} .doc-footer`;
}

export function freeDiagnosticContentChildrenSelector(pageIndex) {
  return `${freeDiagnosticPageSelector(pageIndex)} > *:not(.doc-footer)`;
}

export { FREE_DIAGNOSTIC_PAGE_COUNT, FREE_DIAGNOSTIC_ALL_PAGES_SELECTOR };

/**
 * Étape 1 (mesure) — interroge le Browser Rendering /scrape pour obtenir,
 * pour chacune des 6 pages attendues : sa propre boîte (top/height), la
 * boîte de son pied de page (.doc-footer), et la boîte de chacun de ses
 * enfants directs (hors pied de page), en une seule requête.
 */
export async function measureFreeDiagnosticLayout({ html, env, fetchImpl = fetch }) {
  const config = assertBrowserRenderingConfig(env);
  if (!config.ok) return config;

  const elements = [{ selector: FREE_DIAGNOSTIC_ALL_PAGES_SELECTOR }];
  for (let index = 1; index <= FREE_DIAGNOSTIC_PAGE_COUNT; index += 1) {
    elements.push({ selector: freeDiagnosticPageSelector(index) });
    elements.push({ selector: freeDiagnosticFooterSelector(index) });
    elements.push({ selector: freeDiagnosticContentChildrenSelector(index) });
  }

  const response = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/browser-rendering/scrape`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        html,
        elements,
        viewport: { width: 900, height: 1300 },
      }),
    },
  );

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    console.error("pdf-renderer: free-diagnostic scrape error", {
      status: response.status,
      message: message.slice(0, 300),
    });
    return {
      ok: false,
      error: "PDF_RENDERING_FAILED",
      status: response.status,
      message: "La mesure de mise en page du Diagnostic gratuit a échoué.",
    };
  }

  const payload = await response.json();
  return { ok: true, scrape: payload };
}

function findSelectorResults(scrapeResult, selector) {
  const entry = (scrapeResult || []).find((item) => item.selector === selector);
  return entry?.results || [];
}

/**
 * Normalise la réponse brute de /scrape en une structure exploitable :
 * { totalPageCount, pages: [{ index, found, top, height, footerFound,
 *   footerTop, contentBottom }] }.
 * Pure — ne fait aucun appel réseau, testable isolément.
 */
export function parseFreeDiagnosticLayout(scrapePayload) {
  const result = scrapePayload?.result || [];
  const totalPageCount = findSelectorResults(result, FREE_DIAGNOSTIC_ALL_PAGES_SELECTOR).length;

  const pages = [];
  for (let index = 1; index <= FREE_DIAGNOSTIC_PAGE_COUNT; index += 1) {
    const pageResults = findSelectorResults(result, freeDiagnosticPageSelector(index));
    const footerResults = findSelectorResults(result, freeDiagnosticFooterSelector(index));
    const contentResults = findSelectorResults(result, freeDiagnosticContentChildrenSelector(index));

    const page = pageResults[0] || null;
    const footer = footerResults[0] || null;
    const contentBottom = contentResults.reduce(
      (max, item) => Math.max(max, Number(item.top || 0) + Number(item.height || 0)),
      0,
    );

    pages.push({
      index,
      found: Boolean(page),
      top: page ? Number(page.top) : null,
      height: page ? Number(page.height) : null,
      footerFound: Boolean(footer),
      footerTop: footer ? Number(footer.top) : null,
      contentBottom,
    });
  }

  return { totalPageCount, pages };
}

/**
 * Étape 1 bis (garde-fou) — équivalent de l'historique validerMiseEnPageRapport()
 * + de la vérification `pages.length !== 6` de telechargerPDF(). Pure.
 *
 * Bloque si :
 *  - le nombre de pages détectées n'est pas exactement 6 ;
 *  - le contenu d'une page dépasse la boîte propre de la page (équivalent
 *    scrollHeight > clientHeight — getBoundingClientRect() des enfants n'est
 *    pas affecté par l'overflow:hidden du parent, donc un débordement réel
 *    reste mesurable même s'il est visuellement clippé) ;
 *  - le contenu d'une page passe sous son pied de page (même tolérance de
 *    12px que l'ancien outil).
 */
export function validateFreeDiagnosticLayout(layout) {
  const { totalPageCount, pages } = layout;

  if (totalPageCount !== FREE_DIAGNOSTIC_PAGE_COUNT) {
    return {
      ok: false,
      error: "FREE_DIAGNOSTIC_LAYOUT_OVERFLOW",
      reason: "PAGE_COUNT_MISMATCH",
      message: `Le Diagnostic gratuit doit contenir exactement ${FREE_DIAGNOSTIC_PAGE_COUNT} pages ; ${totalPageCount} détectée(s).`,
      expectedPages: FREE_DIAGNOSTIC_PAGE_COUNT,
      actualPages: totalPageCount,
      pages: [],
    };
  }

  const brokenPages = [];
  for (const page of pages) {
    if (!page.found) {
      brokenPages.push({ page: page.index, issue: "PAGE_NOT_FOUND" });
      continue;
    }
    if (!page.footerFound) {
      brokenPages.push({ page: page.index, issue: "FOOTER_NOT_FOUND" });
      continue;
    }

    const pageBottom = page.top + page.height;
    if (page.contentBottom > pageBottom + 0.5) {
      brokenPages.push({
        page: page.index,
        issue: "CONTENT_EXCEEDS_PAGE_BOX",
        contentBottom: page.contentBottom,
        pageBottom,
      });
      continue;
    }

    if (page.contentBottom > page.footerTop - FREE_DIAGNOSTIC_FOOTER_TOLERANCE_PX) {
      brokenPages.push({
        page: page.index,
        issue: "CONTENT_UNDER_FOOTER",
        contentBottom: page.contentBottom,
        footerTop: page.footerTop,
      });
    }
  }

  if (brokenPages.length) {
    return {
      ok: false,
      error: "FREE_DIAGNOSTIC_LAYOUT_OVERFLOW",
      reason: "CONTENT_OVERFLOW",
      message: `Débordement détecté sur la ou les page(s) ${brokenPages.map((b) => b.page).join(", ")}.`,
      pages: brokenPages,
    };
  }

  return { ok: true };
}

/**
 * Étape 2 (capture) — une requête /screenshot par page, ciblée par sélecteur
 * (data-free-page), à la taille réelle du bloc .page, fond blanc, ×2 pour
 * une résolution suffisante (équivalent du scale:2 d'html2canvas). Aucune
 * transformation n'est appliquée après capture : le ratio est celui du
 * rendu réel de la page.
 */
export async function captureFreeDiagnosticPageScreenshot({ html, pageIndex, env, fetchImpl = fetch }) {
  const config = assertBrowserRenderingConfig(env);
  if (!config.ok) return config;

  const response = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/browser-rendering/screenshot`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        html,
        selector: freeDiagnosticPageSelector(pageIndex),
        viewport: { width: 900, height: 1300, deviceScaleFactor: 2 },
        screenshotOptions: { type: "jpeg", quality: 98, omitBackground: false },
      }),
    },
  );

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    console.error("pdf-renderer: free-diagnostic screenshot error", {
      pageIndex,
      status: response.status,
      message: message.slice(0, 300),
    });
    return {
      ok: false,
      error: "PDF_RENDERING_FAILED",
      status: response.status,
      message: `La capture de la page ${pageIndex} du Diagnostic gratuit a échoué.`,
    };
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  return { ok: true, bytes };
}

/**
 * Lit les dimensions (et le nombre de composants de couleur) d'un JPEG en
 * parcourant ses marqueurs, jusqu'au premier marqueur SOFn. Aucune
 * dépendance : les données JPEG brutes sont ensuite embarquées telles
 * quelles dans le PDF (filtre /DCTDecode), sans ré-encodage.
 */
export function readJpegInfo(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("invalid_jpeg_data");
  }

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];

    // Marqueurs sans segment de longueur (bourrage, RST0-7, SOI/EOI).
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }

    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const isSofMarker = marker >= 0xc0 && marker <= 0xcf
      && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isSofMarker) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      const components = bytes[offset + 9];
      return { width, height, components };
    }

    offset += 2 + length;
  }

  throw new Error("jpeg_sof_not_found");
}

function textToBytes(text) {
  return new TextEncoder().encode(text);
}

function concatByteArrays(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    out.set(chunk, position);
    position += chunk.length;
  }
  return out;
}

/**
 * Étape 3 (assemblage) — écrivain PDF minimal, sans dépendance : chaque
 * page JPEG est embarquée telle quelle (filtre /DCTDecode, aucun
 * ré-encodage) dans un feuillet A4 (595.28×841.89pt = 210×297mm), image
 * positionnée en (0,0) et dimensionnée à la pleine page — reproduction
 * directe de l'historique `pdf.addImage(canvas.toDataURL(...), "JPEG", 0,
 * 0, 210, 297)`. Voir le rapport de mission pour la justification de ne pas
 * ajouter de dépendance (jsPDF/pdf-lib) pour ceci.
 */
export function buildImageOnlyPdf(jpegPages) {
  if (!Array.isArray(jpegPages) || jpegPages.length === 0) {
    throw new Error("no_pages_to_assemble");
  }

  const order = [];
  const kidsRefs = [];
  for (let i = 0; i < jpegPages.length; i += 1) {
    kidsRefs.push(`${3 + i * 3} 0 R`);
  }

  order.push({
    num: 1,
    chunks: [textToBytes(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`)],
  });
  order.push({
    num: 2,
    chunks: [textToBytes(
      `2 0 obj\n<< /Type /Pages /Kids [${kidsRefs.join(" ")}] /Count ${jpegPages.length} `
      + `/MediaBox [0 0 ${A4_WIDTH_PT} ${A4_HEIGHT_PT}] >>\nendobj\n`,
    )],
  });

  jpegPages.forEach((jpeg, i) => {
    if (!(jpeg instanceof Uint8Array) || jpeg.length < 4) {
      throw new Error(`invalid_jpeg_page_${i + 1}`);
    }
    const info = readJpegInfo(jpeg);
    const colorSpace = info.components === 1 ? "/DeviceGray" : info.components === 4 ? "/DeviceCMYK" : "/DeviceRGB";

    const pageNum = 3 + i * 3;
    const contentsNum = 4 + i * 3;
    const imageNum = 5 + i * 3;

    const contentStream = textToBytes(`q ${A4_WIDTH_PT} 0 0 ${A4_HEIGHT_PT} 0 0 cm /Im0 Do Q`);

    order.push({
      num: pageNum,
      chunks: [textToBytes(
        `${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_WIDTH_PT} ${A4_HEIGHT_PT}] `
        + `/Resources << /ProcSet [/PDF /ImageC] /XObject << /Im0 ${imageNum} 0 R >> >> `
        + `/Contents ${contentsNum} 0 R >>\nendobj\n`,
      )],
    });
    order.push({
      num: contentsNum,
      chunks: [
        textToBytes(`${contentsNum} 0 obj\n<< /Length ${contentStream.length} >>\nstream\n`),
        contentStream,
        textToBytes(`\nendstream\nendobj\n`),
      ],
    });
    order.push({
      num: imageNum,
      chunks: [
        textToBytes(
          `${imageNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} `
          + `/ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
        ),
        jpeg,
        textToBytes(`\nendstream\nendobj\n`),
      ],
    });
  });

  const header = concatByteArrays([
    textToBytes("%PDF-1.4\n%"),
    new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3]),
    textToBytes("\n"),
  ]);

  const fileChunks = [header];
  let cursor = header.length;
  const offsets = new Map();
  for (const entry of order) {
    offsets.set(entry.num, cursor);
    for (const chunk of entry.chunks) {
      fileChunks.push(chunk);
      cursor += chunk.length;
    }
  }

  const totalObjects = order.length;
  const xrefStart = cursor;
  let xref = `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= totalObjects; n += 1) {
    xref += `${String(offsets.get(n)).padStart(10, "0")} 00000 n \n`;
  }
  fileChunks.push(textToBytes(xref));

  fileChunks.push(textToBytes(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`,
  ));

  return concatByteArrays(fileChunks);
}

/**
 * Orchestrateur du chemin PDF dédié au Diagnostic gratuit : mesure → garde-fou
 * → capture des 6 pages → assemblage. Retourne la même forme de résultat que
 * renderPdfWithCloudflareBrowserRun ({ok:true, pdf} ou {ok:false, error, ...})
 * pour rester interchangeable côté appelant (functions/api/pdf/_shared.js).
 */
export async function renderFreeDiagnosticPdf({ html, env, fetchImpl = fetch }) {
  const config = assertBrowserRenderingConfig(env);
  if (!config.ok) return config;

  const measured = await measureFreeDiagnosticLayout({ html, env, fetchImpl });
  if (!measured.ok) return measured;

  const layout = parseFreeDiagnosticLayout(measured.scrape);
  const validation = validateFreeDiagnosticLayout(layout);
  if (!validation.ok) return validation;

  const jpegPages = [];
  for (let index = 1; index <= FREE_DIAGNOSTIC_PAGE_COUNT; index += 1) {
    const capture = await captureFreeDiagnosticPageScreenshot({ html, pageIndex: index, env, fetchImpl });
    if (!capture.ok) return capture;
    jpegPages.push(capture.bytes);
  }

  let pdf;
  try {
    pdf = buildImageOnlyPdf(jpegPages);
  } catch (e) {
    console.error("pdf-renderer: free-diagnostic assembly error", e);
    return {
      ok: false,
      error: "PDF_RENDERING_FAILED",
      message: "L'assemblage du PDF du Diagnostic gratuit a échoué.",
    };
  }

  return { ok: true, pdf };
}
