// Vérifie dans le fichier PDF produit (pas seulement dans le DOM) que les
// boutons de la dernière page gardent leurs annotations cliquables après la
// capture raster html2canvas effectuée par telechargerPDF().
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const source = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const python = "/Users/fatima/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const hasPrerequisites = existsSync(chrome) && existsSync(python);
const JSPDF = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

function between(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `bloc introuvable : ${start}`);
  return source.slice(from, to);
}

async function cdnReachable() {
  try {
    const response = await fetch(JSPDF, { method: "HEAD", signal: AbortSignal.timeout(4_000) });
    return response.ok;
  } catch {
    return false;
  }
}

function fixture() {
  const code = `${between("function isValidPaymentUrl(url)", "function couleurScore(score){")}\n${between("function ajouterLiensPdfPourPage(pdf, page){", "/* ================= AUDIT EFFICIA PREMIUM")}`;
  return `<!doctype html><meta charset="utf-8">
<style>.page{position:relative;width:1000px;height:1400px;background:#fff}.payment-button{display:block;width:400px;height:80px;margin:120px 0 0 100px}</style>
<main class="page"><a class="payment-button" data-pdf-link="payment" href="https://www.efficiadigital.com/achat?offre=audit">Je veux savoir quoi corriger en premier</a><a class="payment-button" data-pdf-link="payment" href="https://www.efficiadigital.com/achat?offre=visibility">Optimiser ma fiche maintenant</a></main>
<output id="result"></output><script src="${JSPDF}"></script><script>
${code}
addEventListener("load", () => {
  try {
    const pdf = new window.jspdf.jsPDF({unit:"mm", format:"a4", orientation:"portrait"});
    // telechargerPDF() ajoute d'abord la page rasterisée, puis appelle cette
    // fonction. Une image blanche suffit ici pour isoler l'annotation réelle.
    pdf.addImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL7wgAAAABJRU5ErkJggg==", "PNG", 0, 0, 210, 297);
    ajouterLiensPdfPourPage(pdf, document.querySelector(".page"));
    document.querySelector("#result").textContent = pdf.output("datauristring");
  } catch (error) { document.querySelector("#result").textContent = "ERROR:" + String(error?.message || error); }
});
</script>`;
}

test("PDF réel page 6 : les deux CTA possèdent des annotations URI valides", { skip: !hasPrerequisites }, async (t) => {
  if (!(await cdnReachable())) {
    t.skip("CDN jsPDF injoignable depuis cet environnement");
    return;
  }
  const directory = mkdtempSync(join(tmpdir(), "efficia-pdf-cta-"));
  try {
    const htmlPath = join(directory, "cta.html");
    const pdfPath = join(directory, "cta.pdf");
    writeFileSync(htmlPath, fixture());
    const dump = execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", "--virtual-time-budget=20000", "--dump-dom", pathToFileURL(htmlPath).href], { encoding: "utf8", timeout: 35_000, maxBuffer: 20_000_000 });
    const dataUri = dump.match(/<output id="result">([^<]*)<\/output>/u)?.[1]?.replaceAll("&amp;", "&");
    assert.ok(dataUri && !dataUri.startsWith("ERROR:"), `génération jsPDF en échec : ${dataUri}`);
    writeFileSync(pdfPath, Buffer.from(dataUri.split(",", 2)[1], "base64"));
    const inspected = execFileSync(python, ["-c", `
import json
from pypdf import PdfReader
reader = PdfReader(${JSON.stringify(pdfPath)})
annotations = reader.pages[0].get("/Annots", [])
urls = []
for annotation in annotations:
    value = annotation.get_object()
    action = value.get("/A") or {}
    if action.get("/S") == "/URI": urls.append(str(action.get("/URI")))
print(json.dumps(urls))
`], { encoding: "utf8" });
    assert.deepEqual(JSON.parse(inspected), [
      "https://www.efficiadigital.com/achat?offre=audit",
      "https://www.efficiadigital.com/achat?offre=visibility",
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
