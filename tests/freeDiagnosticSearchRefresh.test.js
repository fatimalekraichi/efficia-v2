import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
const route = readFileSync(new URL("../functions/api/admin/free-diagnostic-collect/[analysisId].js", import.meta.url), "utf8");
const collector = readFileSync(new URL("../functions/lib/collectCompetitors.js", import.meta.url), "utf8");
const scoreEngine = readFileSync(new URL("../functions/lib/score-efficia/scoreEngine.js", import.meta.url), "utf8");

test("l’activité Électricien et la ville Attert composent la proposition attendue", () => {
  assert.match(html, /function composerRequeteProposee\(\)[\s\S]*\[activite, ville\]\.filter\(Boolean\)\.join\(" "\)/);
  assert.equal(["Électricien", "Attert"].filter(Boolean).join(" "), "Électricien Attert");
});

test("une recherche personnalisée n’est jamais écrasée silencieusement", () => {
  assert.match(html, /if\(!requetePersonnalisee\) input\.value = composerRequeteProposee\(\)/);
  assert.match(html, /requetePersonnalisee = normaliserRecherche\(input\?\.value\) !== normaliserRecherche\(composerRequeteProposee\(\)\)/);
});

test("la relance envoie exactement identité, ville, activité et recherche au backend admin", () => {
  assert.match(html, /JSON\.stringify\(\{operation:"refresh_search", analysisId, company, city, activity, searchQuery\}\)/);
  assert.match(route, /payload\?\.operation !== "refresh_search"/);
  assert.match(route, /requete: payload\.searchQuery/);
});

test("la position et les trois concurrents proviennent exclusivement de la réponse serveur", () => {
  assert.match(html, /position:estNombre\(business\.localPosition\)/);
  assert.match(html, /business\.competitors\.slice\(0, 3\)\.map/);
  assert.doesNotMatch(html, /function relancerAnalyseRecherche[\s\S]*Math\.random/);
});

test("les moyennes et comparaisons dépendantes sont recalculées avec le nouveau panel", () => {
  assert.match(html, /function calculerComparaisonsRecherche\(concurrents\)/);
  assert.match(html, /moyennesConcurrents:\{note, avis, photos:moyenne\("photos"\), services:moyenne\("services"\), pubs:moyenne\("pubs"\)\}/);
  assert.match(route, /benchmarkEngine\(\{/);
});

test("la demande historique et les réponses manuelles ne sont pas remplacées par la relance", () => {
  const refreshFunction = html.slice(html.indexOf("function appliquerResultatsRecherche"), html.indexOf("async function relancerAnalyseRecherche"));
  assert.doesNotMatch(refreshFunction, /commande-admin-liee|efficiaAdminOrderContext|appliquerReponses|p-contact/);
  assert.match(html, /Activité : \$\{escapeHtml\(contexte\.activity/);
  assert.match(html, /criteresTouchesManuellement\.has\(criterion\.id\)/);
  assert.match(html, /reponses\[cr\.key\]\.statut === "manuelle"/);
});

test("la catégorie Google observée reste distincte de l’activité confirmée", () => {
  assert.match(route, /normalizedWithContext = addSearchResultContext\(normalized, result\)/);
  const refreshSql = route.slice(route.indexOf("async function refreshSearchAnalysis"), route.indexOf("async function clearFailedCollection"));
  assert.doesNotMatch(refreshSql, /SET[^`]*activity\s*=/);
});

test("une recherche modifiée déclenche l’avertissement exact et désactive la génération", () => {
  assert.ok(html.includes("La recherche a été modifiée. Relancez l’analyse avant de générer le diagnostic."));
  assert.match(html, /document\.querySelectorAll\("\[data-report-generation\]"\)[\s\S]*button\.disabled = stale/);
  assert.match(html, /if\(typeof mettreAJourEtatRecherche === "function" && mettreAJourEtatRecherche\(\)\)/);
});

test("une relance réussie mémorise requête analysée, horodatage et requête affichée", () => {
  assert.match(html, /derniereRequeteAnalysee:actualQuery/);
  assert.match(html, /derniereAnalyseRechercheAt:analyzedAt \|\| business\.searchAnalyzedAt/);
  assert.match(html, /requeteAffichee:actualQuery/);
});

test("un échec conserve les résultats précédents et maintient l’état périmé", () => {
  const refresh = html.slice(html.indexOf("async function relancerAnalyseRecherche"), html.indexOf("function collecterReponses"));
  assert.match(refresh, /appliquerResultatsRecherche\(data\.business/);
  assert.match(refresh, /catch\(error\)[\s\S]*Les résultats précédents sont conservés et restent signalés comme périmés/);
  assert.doesNotMatch(refresh.slice(refresh.indexOf("catch(error)")), /donneesAnalyse\s*=/);
});

test("le double clic est neutralisé côté client", () => {
  assert.match(html, /async function relancerAnalyseRecherche\(\)\{\s*if\(relanceRechercheEnCours\) return/);
  assert.match(html, /relanceRechercheEnCours = true/);
});

test("aucun secret fournisseur n’est exposé au navigateur", () => {
  assert.doesNotMatch(html, /OUTSCRAPER_API_KEY|X-API-KEY|api\.outscraper\.com/i);
  assert.match(route, /apiKey: context\.env\.OUTSCRAPER_API_KEY/);
  assert.match(collector, /headers: \{ "X-API-KEY": key/);
});

test("le moteur de score partagé reste inchangé et la relance ne crée pas de formule concurrente", () => {
  assert.ok(scoreEngine.length > 0);
  assert.doesNotMatch(route, /function calculateScore|SCORING_VERSION|BENCHMARK_WEIGHTS/);
  assert.match(route, /benchmarkEngine/);
});

test("les intitulés concurrents longs restent contenus à l’écran et dans le rapport PDF", () => {
  assert.match(html, /\.conc-grid input\{[^}]*min-width:0/);
  assert.match(html, /\.concurrence-row span\{[^}]*overflow-wrap:anywhere/);
  assert.doesNotMatch(html, /\.conc-grid[^}]*overflow:hidden/);
});
