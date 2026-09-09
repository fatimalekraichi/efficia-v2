import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { collectCompetitors } from "../functions/lib/collectCompetitors.js";
import { benchmarkEngine } from "../functions/lib/benchmarkEngine.js";
import { buildFreeDiagnosticCollectionState } from "../functions/lib/freeDiagnosticProductionLink.js";
import { collectPageResultWithIsolatedChrome } from "./chromeHeadlessHarness.js";
import {
  buildScorePrefill,
  classifyReviewVolume,
} from "../functions/lib/score-efficia/scoreCatalog.js";

const html = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
const route = readFileSync(new URL("../functions/api/admin/free-diagnostic-collect/[analysisId].js", import.meta.url), "utf8");
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function runQualifiedCompetitorsBrowserSmoke(harnessSource) {
  const source = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8")
    .replace(
      '<script src="/js/score-efficia-core.js?v=1"></script>',
      `<script>${readFileSync(new URL("../js/score-efficia-core.js", import.meta.url), "utf8")}</script>`,
    )
    .replace(
      '<script src="/js/questionnaire-finalization.js?v=7ee0654"></script>',
      `<script>${readFileSync(new URL("../js/questionnaire-finalization.js", import.meta.url), "utf8")}</script>`,
    )
    .replace(
      '<script src="/src/decision-engine/criteria.catalog.js?v=4"></script>',
      `<script>${readFileSync(new URL("../src/decision-engine/criteria.catalog.js", import.meta.url), "utf8")}</script>`,
    );
  const marker = "<script>\n/* ============ CONFIG SCORE EFFICIA™";
  assert.ok(source.includes(marker), "point d'instrumentation du renderer absent");
  const fetchFixture = `<script>
    window.fetch = async (input, options = {}) => {
      const url = String(input);
      const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers:{"Content-Type":"application/json"} });
      if(url.includes("/api/admin/free-diagnostic-context/")) return json({ success:true, context:{ company:"MBGE Marville Benjamin Électricien", city:"Wibrin", activity:"Électricien", collectionAvailable:false, premiumAllowed:false } });
      if(url.includes("/api/admin/audit-drafts/")) return json({ success:true, draft:{ reportType:"free", currentStep:"questionnaire", updatedAt:"2026-09-09T10:00:00.000Z", answers:{ questionnaireVersion:"score-efficia-questionnaire-v4", profileKey:"default", fields:{ "p-entreprise":"MBGE Marville Benjamin Électricien", "p-ville":"Wibrin", "p-activite":"Électricien", "d-requete":"Électricien Houffalize" }, observedData:{}, responses:{} } } });
      if(url.includes("/api/admin/report-text-overrides/")) return json({ success:true, catalog:[], overrides:[] });
      if(url.includes("/api/admin/audit-snapshots/") || url.includes("/admin/tasks/")) return json({ success:true });
      return json({ success:false, error:"UNEXPECTED_TEST_REQUEST", url }, 500);
    };
  </script>`;
  const instrumentedSource = source.replace(marker, `${fetchFixture}\n${marker}`);
  const closingBody = instrumentedSource.lastIndexOf("</body>");
  assert.ok(closingBody > 0, "balise body finale absente");
  const instrumented = `${instrumentedSource.slice(0, closingBody)}<output id="qualified-competitors-smoke-result"></output><script>${harnessSource}</script>${instrumentedSource.slice(closingBody)}`;
  const directory = mkdtempSync(join(tmpdir(), "efficia-qualified-competitors-"));
  try {
    const page = join(directory, "smoke.html");
    writeFileSync(page, instrumented);
    const output = await collectPageResultWithIsolatedChrome({
      chrome: CHROME,
      url: `${pathToFileURL(page).href}?analysisId=qualified-competitors-smoke`,
      profileDir: join(directory, "chrome-profile"),
      phase: "smoke concurrents qualifiés",
      timeout: 30_000,
      resultWait: 20_000,
      selector: "#qualified-competitors-smoke-result",
    });
    return JSON.parse(output);
  } finally {
    rmSync(directory, { recursive:true, force:true });
  }
}

function decision(reviews, competitorReviews) {
  return classifyReviewVolume({
    reviews,
    competitors:competitorReviews.map((value) => ({ reviews:value })),
  });
}

function volumeCriterion(reviews, competitorReviews) {
  return buildScorePrefill({
    business:{
      reviews,
      competitors:competitorReviews.map((value, index) => ({ name:`Concurrent ${index + 1}`, reviews:value })),
      normalized:{},
    },
    benchmark:{ averages:{} },
  }, { verifiedCategoryEvidence:true }).criteria.find((criterion) => criterion.key === "volumeAvis");
}

test("volume d'avis strictement supérieur à 110 % donne Supérieur (5)", () => {
  const result = decision(111, [100, 100, 100]);
  assert.equal(result.status, "superior");
  assert.equal(volumeCriterion(111, [100, 100, 100]).points, 5);
});

test("les limites exactes de 90 % et 110 % donnent Comparable (3)", () => {
  for (const reviews of [90, 110]) {
    const result = decision(reviews, [100, 100, 100]);
    assert.equal(result.status, "comparable");
    assert.equal(volumeCriterion(reviews, [100, 100, 100]).points, 3);
  }
});

test("volume strictement inférieur à 90 % donne Inférieur (0)", () => {
  const result = decision(89, [100, 100, 100]);
  assert.equal(result.status, "inferior");
  assert.equal(volumeCriterion(89, [100, 100, 100]).points, 0);
});

test("moyenne nulle : une fiche positive est Supérieure et une fiche nulle est Comparable", () => {
  assert.equal(decision(1, [0, 0, 0]).status, "superior");
  assert.equal(decision(0, [0, 0, 0]).status, "comparable");
});

test("moins de trois volumes concurrents valides reste À confirmer sans point", () => {
  const result = classifyReviewVolume({ reviews:10, competitors:[{ reviews:5 }, { reviews:"inconnu" }, { reviews:20 }] });
  assert.equal(result.status, "unknown");
  const criterion = buildScorePrefill({
    business:{ reviews:10, competitors:[{ reviews:5 }, { reviews:null }, { reviews:20 }], normalized:{} },
    benchmark:{ averages:{ reviews:12 } },
  }, { verifiedCategoryEvidence:true }).criteria.find((item) => item.key === "volumeAvis");
  assert.equal(criterion.value, "not_verified");
  assert.equal(criterion.points, null);
  const missingTarget = volumeCriterion(null, [5, 7, 20]);
  assert.equal(missingTarget.value, "not_verified");
  assert.equal(missingTarget.points, null);
});

test("un panel qualifié et versionné insuffisant ne calcule ni moyenne, ni confiance visible, ni benchmark PDF", () => {
  const competitors = [
    { name:"Électricien A", rating:4.9, reviews:20, photos_count:8 },
    { name:"Électricien B", rating:4.8, reviews:12, photos_count:5 },
  ];
  const benchmark = benchmarkEngine({
    rating:3.5,
    reviews:4,
    photos_count:2,
    competitors_json:JSON.stringify(competitors),
  }, { minimumCompetitors:3 });
  assert.equal(benchmark.competitor_count, 2);
  assert.equal(benchmark.avg_rating, null);
  assert.equal(benchmark.avg_reviews, null);

  const prefill = buildScorePrefill({
    business:{ rating:3.5, reviews:4, competitors, normalized:{} },
    benchmark:{ averages:{ rating:4.9, reviews:20 } },
  }, { verifiedCategoryEvidence:true });
  const volume = prefill.criteria.find((criterion) => criterion.key === "volumeAvis");
  const confidence = prefill.criteria.find((criterion) => criterion.key === "attractiviteConcurrents");
  assert.equal(volume.points, null);
  assert.equal(confidence.points, null);

  const state = buildFreeDiagnosticCollectionState({
    business:{ name:"Fiche test", placeId:"place-test", rating:3.5, reviews:4, competitors, normalized:{ competitor_qualification_version:1 } },
    benchmark:{ averages:{ rating:4.9, reviews:20, photos:8 } },
  });
  const restoredConfidence = state.scorePrefill.criteria.find((criterion) => criterion.key === "attractiviteConcurrents");
  assert.equal(restoredConfidence.points, null);
  assert.equal(restoredConfidence.evidence.averageRating, null);
  assert.equal(restoredConfidence.evidence.averageReviews, null);
  assert.match(html, /Panel concurrentiel insuffisant pour comparaison\./);
  assert.match(html, /concurrents\.length !== 3/);
  assert.match(route, /minimumCompetitors: 3/);
});

test("un panel historique non versionné est fail closed : aucun concurrent ni benchmark ne quitte le serveur", () => {
  const historicalCompetitors = [
    { name:"Boulange / François", rating:4.9, reviews:28, photos_count:12 },
    { name:"Camperplaats Houffalize", rating:4.7, reviews:44, photos_count:9 },
    { name:"Recyparc d’Houffalize", rating:4.6, reviews:31, photos_count:7 },
  ];
  const state = buildFreeDiagnosticCollectionState({
    business:{
      name:"MBGE Marville Benjamin Électricien",
      placeId:"mbge-place",
      rating:4.1,
      reviews:8,
      competitors:historicalCompetitors,
      normalized:{},
    },
    benchmark:{ averages:{ rating:4.7, reviews:34, photos:9 } },
  });
  assert.equal(state.business.competitorQualificationStatus, "refresh_required");
  assert.equal(state.business.competitorQualificationVersion, null);
  assert.deepEqual(state.business.competitors, []);
  const volume = state.scorePrefill.criteria.find((criterion) => criterion.key === "volumeAvis");
  const confidence = state.scorePrefill.criteria.find((criterion) => criterion.key === "attractiviteConcurrents");
  assert.equal(volume.points, null);
  assert.equal(confidence.points, null);
  assert.match(html, /competitorQualificationStatus === "refresh_required"\s*&& \["volumeAvis", "attractiviteConcurrents"\]\.includes\(cr\.key\)/);
});

test("un panel versionné n'est affichable que s'il contient exactement trois concurrents qualifiés", () => {
  for (const count of [0, 1, 2, 3]) {
    const competitors = Array.from({ length:count }, (_, index) => ({
      name:`Électricien qualifié ${index + 1}`,
      rating:4.8,
      reviews:10 + index,
      photos_count:4 + index,
    }));
    const state = buildFreeDiagnosticCollectionState({
      business:{
        name:"Fiche test",
        placeId:"place-test",
        rating:4.1,
        reviews:8,
        competitors,
        normalized:{ competitor_qualification_version:1 },
      },
      benchmark:{ averages:{ rating:4.8, reviews:11, photos:5 } },
    });
    assert.equal(state.business.competitorQualificationStatus, count === 3 ? "qualified" : "insufficient");
    assert.equal(state.business.competitors.length, count);
    const volume = state.scorePrefill.criteria.find((criterion) => criterion.key === "volumeAvis");
    assert.equal(volume.points, count === 3 ? 0 : null);
  }
});

test("la collecte exclut cible, doublon, sponsorisé et volume inexploitable avant de retenir les trois premiers valides", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ data:[[ 
    { name:"Annonce", place_id:"ad", reviews:999, sponsored:true, category:"Électricien" },
    { name:"Bivert Alain", place_id:"target", reviews:5, sponsored:false, category:"Électricien" },
    { name:"Concurrent A", place_id:"a", reviews:5, sponsored:false, category:"Électricien" },
    { name:"Concurrent A dupliqué", place_id:"a", reviews:9, sponsored:false, category:"Électricien" },
    { name:"Sans avis exploitable", place_id:"invalid", reviews:"—", sponsored:false, category:"Électricien" },
    { name:"Concurrent B", place_id:"b", reviews:7, sponsored:false, category:"Électricien" },
    { name:"Concurrent C", place_id:"c", reviews:20, sponsored:false, category:"Électricien" },
    { name:"Concurrent D", place_id:"d", reviews:30, sponsored:false, category:"Électricien" },
  ]] });
  try {
    const result = await collectCompetitors({
      requete:"Électricien Attert",
      activite:"Électricien",
      ville:"Attert",
      placeIdCible:"target",
      apiKey:"fixture-key",
      suppressSensitiveLogs:true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.sponsoredResultsExcluded, 1);
    assert.deepEqual(result.concurrents.map((item) => item.name), ["Concurrent A", "Concurrent B", "Concurrent C"]);
    assert.deepEqual(result.concurrents.map((item) => item.reviews), [5, 7, 20]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cas permanent Bivert : 5 face à 5, 7 et 20 donne Inférieur (0)", () => {
  const result = decision(5, [5, 7, 20]);
  assert.equal(result.averageReviews, 32 / 3);
  assert.equal(result.ratio, 0.46875);
  assert.equal(result.status, "inferior");
  const criterion = volumeCriterion(5, [5, 7, 20]);
  assert.equal(criterion.label, "Inférieur");
  assert.equal(criterion.points, 0);
  assert.deepEqual(criterion.evidence.competitorReviews, [5, 7, 20]);
});

test("la relance recalcule et réapplique volumeAvis, conserve le manuel contradictoire et affiche sa preuve", () => {
  const refresh = html.slice(html.indexOf("function appliquerResultatsRecherche"), html.indexOf("async function relancerAnalyseRecherche"));
  assert.match(refresh, /"volumeAvis"/);
  assert.match(refresh, /criteresTouchesManuellement\.has\(criterion\.id\)/);
  assert.match(refresh, /reviewVolumeManualConflict = true/);
  assert.match(html, /Votre fiche : \$\{formatReviews\(reviewEvidence\.value\)\} avis · Concurrents/);
  assert.match(html, /comparaison avec une tolérance de 10 %/);
  assert.match(html, /id="review-volume-manual-warning"/);
});

test("la collecte initiale et la relance persistent concurrents, moyenne et version de qualification dans une seule mise à jour", () => {
  const initial = route.slice(route.indexOf("const competitorsJson = JSON.stringify(competitorData.concurrents)"));
  const refresh = route.slice(route.indexOf("async function refreshSearchAnalysis"), route.indexOf("async function clearFailedCollection"));
  for (const source of [initial, refresh]) {
    assert.match(source, /competitors_json = \?/);
    assert.match(source, /avg_reviews = \?/);
    assert.match(source, /reviews_gap = \?/);
  }
  assert.match(route, /competitor_qualification_version/);
  assert.match(route, /normalizedWithQualifiedCompetitors/);
});

test("smoke UI/PDF : un panel électrique insuffisant ne rend ni benchmark ni concurrent hors profil", { skip: !existsSync(CHROME), timeout: 60_000 }, async () => {
  const result = await runQualifiedCompetitorsBrowserSmoke(`
    (async () => {
      try {
        for(let attempt = 0; attempt < 80 && !document.getElementById("p-entreprise")?.value; attempt += 1) await new Promise(resolve => setTimeout(resolve, 25));
        const competitors = (count) => Array.from({length:count}, (_, index) => ({
          name:index === 0 ? "Boulange / François" : "Électricien qualifié " + (index + 1),
          rating:4.5,
          reviews:10 + index,
          photos_count:4 + index,
          services_count:2,
          posts_count:1,
          primary_category:"Electrician"
        }));
        const business = (count) => ({
          company:"MBGE Marville Benjamin Électricien",
          city:"Wibrin",
          activity:"Électricien",
          rating:4.1,
          reviews:8,
          photosCount:3,
          servicesCount:1,
          postsCount:0,
          localPosition:2,
          positionKind:"organic",
          searchQuery:"Électricien Houffalize",
          confirmedActivity:"Électricien",
          competitorQualificationVersion:1,
          competitorQualificationStatus:count === 3 ? "qualified" : "insufficient",
          competitors:competitors(count)
        });
        const snapshot = (count) => {
          appliquerCollecteDiagnosticGratuit(business(count), { criteria:[], conditions:{} });
          majConditionsQuestionnaire();
          calc();
          if(!genererRapport({exigerVersion:false})) throw new Error("rendu refusé pour " + count + " concurrent(s)");
          const report = document.getElementById("rapport-contenu");
          return {
            title:document.getElementById("competitor-panel-title")?.textContent || "",
            status:document.getElementById("competitor-panel-status")?.textContent || "",
            visibleRows:[...document.querySelectorAll("[data-competitor-row]")].filter(row => !row.hidden).length,
            averageRating:donneesAnalyse.moyennesConcurrents?.note ?? null,
            averageReviews:donneesAnalyse.moyennesConcurrents?.avis ?? null,
            hasComparison:donneesAnalyse.concurrence !== null,
            hasComparableBenchmark:!!report.querySelector(".v3-benchmark-row"),
            reportText:report.textContent || ""
          };
        };
        const zero = snapshot(0);
        const one = snapshot(1);
        const two = snapshot(2);
        const three = snapshot(3);
        const historical = (() => {
          appliquerCollecteDiagnosticGratuit({
            ...business(3),
            competitorQualificationVersion:null,
            competitorQualificationStatus:"refresh_required",
            competitors:[
              { name:"Boulange / François", rating:4.9, reviews:28, photos_count:12 },
              { name:"Camperplaats Houffalize", rating:4.7, reviews:44, photos_count:9 },
              { name:"Recyparc d’Houffalize", rating:4.6, reviews:31, photos_count:7 }
            ]
          }, { criteria:[], conditions:{} });
          majConditionsQuestionnaire();
          calc();
          if(!genererRapport({exigerVersion:false})) throw new Error("rendu refusé pour le panel historique");
          const report = document.getElementById("rapport-contenu");
          return {
            title:document.getElementById("competitor-panel-title")?.textContent || "",
            status:document.getElementById("competitor-panel-status")?.textContent || "",
            visibleRows:[...document.querySelectorAll("[data-competitor-row]")].filter(row => !row.hidden).length,
            averageRating:donneesAnalyse.moyennesConcurrents?.note ?? null,
            averageReviews:donneesAnalyse.moyennesConcurrents?.avis ?? null,
            hasComparison:donneesAnalyse.concurrence !== null,
            hasComparableBenchmark:!!report.querySelector(".v3-benchmark-row"),
            reportText:report.textContent || ""
          };
        })();
        const {jsPDFCtor, html2canvasFn} = await assurerLibrairiesPDF();
        if(!jsPDFCtor || !html2canvasFn) throw new Error("bibliothèques PDF absentes");
        const pages = [...document.querySelectorAll("#rapport-contenu .page")];
        const pdf = new jsPDFCtor({unit:"mm", format:"a4", orientation:"portrait"});
        let canvasCount = 0;
        for(const [index, page] of pages.entries()) {
          const canvas = await html2canvasFn(page, optionsCapturePdfDiagnostic());
          canvasCount += 1;
          if(index > 0) pdf.addPage("a4", "portrait");
          pdf.addImage(canvas.toDataURL("image/jpeg", 0.98), "JPEG", 0, 0, 210, 297);
        }
        document.getElementById("qualified-competitors-smoke-result").textContent = JSON.stringify({
          zero, one, two, three, historical,
          pdfPages:pdf.internal.getNumberOfPages(),
          canvasCount,
          pdfBytes:pdf.output("arraybuffer").byteLength
        });
      } catch(error) {
        document.getElementById("qualified-competitors-smoke-result").textContent = JSON.stringify({error:String(error?.stack || error)});
      }
    })();
  `);
  assert.equal(result.error, undefined, result.error);
  for(const [count, scenario] of [[0, result.zero], [1, result.one], [2, result.two]]) {
    assert.equal(scenario.title, "Concurrents qualifiés sur la recherche testée", `${count} concurrent(s) ne doit pas être présenté comme un Top 3`);
    assert.match(scenario.status, new RegExp(`^${count} concurrent`, "u"));
    assert.match(scenario.status, /panel concurrentiel insuffisant pour comparaison\./u);
    assert.equal(scenario.visibleRows, count);
    assert.equal(scenario.averageRating, null);
    assert.equal(scenario.averageReviews, null);
    assert.equal(scenario.hasComparison, false);
    assert.equal(scenario.hasComparableBenchmark, false);
    assert.match(scenario.reportText, /Panel concurrentiel insuffisant pour comparaison\./u);
  }
  assert.equal(result.three.title, "Top 3 concurrents qualifiés sur la recherche testée");
  assert.match(result.three.status, /3 concurrents qualifiés : comparaison concurrentielle disponible\./u);
  assert.equal(result.three.visibleRows, 3);
  assert.equal(result.historical.title, "Panel concurrentiel à actualiser");
  assert.match(result.historical.status, /Panel concurrentiel à actualiser — relance nécessaire\./u);
  assert.equal(result.historical.visibleRows, 0);
  assert.equal(result.historical.averageRating, null);
  assert.equal(result.historical.averageReviews, null);
  assert.equal(result.historical.hasComparison, false);
  assert.equal(result.historical.hasComparableBenchmark, false);
  assert.match(result.historical.reportText, /Panel concurrentiel à actualiser — relance nécessaire\./u);
  assert.doesNotMatch(result.historical.reportText, /Boulange \/ François|Camperplaats Houffalize|Recyparc d’Houffalize/u);
  assert.equal(result.pdfPages, 6);
  assert.equal(result.canvasCount, 6);
  assert.ok(result.pdfBytes > 0);
});
