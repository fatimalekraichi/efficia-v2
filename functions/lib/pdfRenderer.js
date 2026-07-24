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
  const fileDate = formatDateForFilename(date);
  return `Audit-Efficia-${name}-${fileDate}.pdf`;
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

export function addPreviewToolbar(html, analysisId) {
  const safeAnalysisId = encodeURIComponent(String(analysisId || "latest"));
  const toolbar = `
    <div class="efficia-preview-toolbar no-print">
      <button type="button" onclick="window.print()">Télécharger le PDF</button>
      <a href="/api/pdf/${safeAnalysisId}" aria-label="Téléchargement serveur">PDF serveur</a>
    </div>
    <style id="efficia-preview-toolbar-css">
      .efficia-preview-toolbar {
        position: sticky;
        top: 0;
        z-index: 50;
        display: flex;
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
    </style>
  `;

  if (html.includes("<body>")) return html.replace("<body>", `<body>${toolbar}`);
  return `${toolbar}${html}`;
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
    return {
      ok: false,
      error: "PDF_RENDERER_NOT_CONFIGURED",
      message: "Configurez CLOUDFLARE_ACCOUNT_ID et BROWSER_RENDERING_API_TOKEN pour activer le PDF serveur.",
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
