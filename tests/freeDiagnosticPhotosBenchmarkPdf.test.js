import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const generator = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
const css = generator.match(/<style>([\s\S]*?)<\/style>/u)?.[1] || "";
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const hasChrome = existsSync(chrome);
const CDN_URLS = [
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
];

// Ce sont les deux fonctions réellement appelées par genererRapport() pour
// la ligne de benchmark de la page 2. Les extraire du générateur évite toute
// réécriture de la logique dans le test.
const benchmarkRenderer = generator.match(/function benchmarkLignes\(\)\{[\s\S]*?(?=\nfunction ecartsExpliquesHtml\()/u)?.[0];
assert.ok(benchmarkRenderer, "renderer de benchmark page 2 introuvable");

async function cdnsReachable() {
  try {
    const responses = await Promise.all(CDN_URLS.map(async (url) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        return await fetch(url, { method: "HEAD", signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
    }));
    return responses.every((response) => response.ok);
  } catch {
    return false;
  }
}

function benchmarkPdfFixture() {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><style>${css}</style></head>
<body>
  <div id="rapport-contenu">
    <div class="page page-benchmark">
      <header class="rapport-header report-header"><span class="rapport-logo">Efficia Digital</span><span class="rap-etiquette">Diagnostic Efficia™</span></header>
      <div class="chapitre">Étape 2 · Pourquoi ce score</div>
      <h1 class="rapport-title">Pourquoi obtenez-vous ce score ?</h1>
      <section id="benchmark"></section>
      <div class="pied"><span>Efficia Digital — Diagnostic Efficia™</span><span class="pagination-rapport">Page 2/6</span></div>
    </div>
  </div>
  <output id="pdf-result"></output>
  <script src="${CDN_URLS[0]}"></script>
  <script src="${CDN_URLS[1]}"></script>
  <script>
    const donneesAnalyse = {
      nbPhotos: 19,
      moyennesConcurrents: { photos: 19 },
      concurrents: [{ label: "Concurrent 1" }, { label: "Concurrent 2" }, { label: "Concurrent 3" }],
      concurrence: null,
    };
    const estNombre = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
    const nEntier = value => Math.round(Number(value));
    const fmtNote = value => Number(value).toFixed(1).replace(".", ",");
    ${benchmarkRenderer}

    addEventListener("load", async () => {
      const result = {};
      try {
        document.querySelector("#benchmark").innerHTML = benchmarkTableHtml();
        const photoRow = [...document.querySelectorAll(".bench-row")].find((row) => row.firstElementChild?.textContent === "Photos");
        result.photoRow = photoRow?.textContent.replace(/\s+/g, " ").trim() || "";
        // Le badge est le texte réellement peint dans la ligne capturée. On
        // l'isole aussi du reste de la ligne pour ne pas dépendre des espaces
        // que Chromium restitue dans --dump-dom.
        result.photoStatus = photoRow?.querySelector(".bench-ecart")?.innerHTML.trim() || "";
        result.containsAverage = result.photoStatus === "Dans la moyenne";
        result.containsReinforce = result.photoStatus === "À renforcer";

        // Même capture raster que telechargerPDF() : la preuve textuelle est
        // lue sur le DOM de la page réellement capturée, puis le PDF est créé.
        const page = document.querySelector("#rapport-contenu .page");
        const canvas = await window.html2canvas(page, {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          backgroundColor: "#ffffff",
        });
        const Pdf = window.jspdf?.jsPDF || window.jsPDF;
        const pdf = new Pdf({ unit: "mm", format: "a4", orientation: "portrait" });
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.98), "JPEG", 0, 0, 210, 297);
        result.pdfPages = pdf.internal.getNumberOfPages();
        result.pdfBytes = pdf.output("blob").size;
      } catch (error) {
        result.error = String(error?.message || error);
      }
      document.querySelector("#pdf-result").textContent = JSON.stringify(result);
    });
  <\/script>
</body></html>`;
}

test("intégration PDF réelle page 2 : 19 photos contre 19 en moyenne affiche Dans la moyenne", { skip: !hasChrome }, async (t) => {
  if (!(await cdnsReachable())) {
    t.skip("CDN jsPDF/html2canvas injoignable depuis cet environnement");
    return;
  }

  const directory = mkdtempSync(join(tmpdir(), "efficia-photos-benchmark-pdf-"));
  try {
    const htmlPath = join(directory, "photos-19-19.html");
    writeFileSync(htmlPath, benchmarkPdfFixture());
    const output = execFileSync(chrome, [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--virtual-time-budget=30000",
      "--dump-dom",
      pathToFileURL(htmlPath).href,
    ], { encoding: "utf8", maxBuffer: 20_000_000, timeout: 45_000 });
    const encoded = output.match(/<output id="pdf-result">([^<]*)<\/output>/u)?.[1];
    assert.ok(encoded, "résultat de génération PDF absent du DOM");
    const result = JSON.parse(encoded.replaceAll("&quot;", '"'));
    assert.equal(result.error, undefined, `génération PDF en échec : ${result.error}`);
    assert.match(result.photoRow, /19/u);
    assert.equal(result.photoStatus, "Dans la moyenne");
    assert.equal(result.containsAverage, true, "le rendu page 2 doit contenir « Dans la moyenne »");
    assert.equal(result.containsReinforce, false, "la ligne Photos ne doit pas contenir « À renforcer »");
    assert.equal(result.pdfPages, 1, "la capture de la page 2 doit produire une page PDF");
    assert.ok(result.pdfBytes > 0, "le PDF capturé est vide");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
