// Campagne de test — 20 Audits Premium Efficia™ (99 €), environnement LOCAL uniquement.
//
// À LANCER SUR TA MACHINE (pas dans le sandbox Cowork — l'accès réseau vers
// Outscraper y est bloqué par l'allowlist du proxy).
//
// PRÉ-REQUIS (à faire une seule fois, dans un premier terminal, à la racine
// du projet efficia-v2) :
//
//   npx wrangler pages dev . --port 8788
//
// N'AJOUTE JAMAIS --remote ni --d1-remote à cette commande : par défaut,
// wrangler pages dev utilise l'émulation D1 locale (fichiers sous
// .wrangler/state/v3/d1/...), jamais la base de production. .dev.vars
// (ignoré par git) fournit OUTSCRAPER_API_KEY/CONNECTOR_TOKEN/ADMIN_PASSWORD/
// ADMIN_SESSION_SECRET en local. Aucun code Stripe ni aucun envoi d'email
// n'est déclenché par ce parcours (admin/new-audit → analyze → review →
// approve → render) : vérifié dans functions/api/admin/audits.js et
// functions/api/admin/audit-review/[analysisId].js avant d'écrire ce script.
//
// Puis, dans un second terminal, à la racine du projet :
//
//   node scripts/run-20-audits-local.mjs
//
// Ce script ne fait AUCUN commit, AUCUN push, AUCUNE écriture git. Il ne
// modifie ni le moteur, ni les templates, ni les scores : il observe et
// documente uniquement, dans tmp/beta-audits-20/ (déjà dans .gitignore).

import { readFileSync, mkdirSync, writeFileSync, existsSync, copyFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { __test__ as collectFicheInternals } from "../functions/lib/collectFiche.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BASE_URL = process.env.EFFICIA_LOCAL_URL || "http://localhost:8788";
const OUT_DIR = path.join(ROOT, "tmp", "beta-audits-20");

// --- Sécurité : refuser explicitement toute autre cible que localhost -----
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE_URL)) {
  console.error(`Cible refusée (${BASE_URL}) : ce script ne doit jamais viser autre chose que localhost.`);
  process.exit(1);
}

// --- Lecture du mot de passe admin local, jamais en dur dans ce fichier ---
function readAdminPassword() {
  const devVarsPath = path.join(ROOT, ".dev.vars");
  const content = readFileSync(devVarsPath, "utf8");
  const match = content.match(/^ADMIN_PASSWORD=(.*)$/m);
  if (!match) throw new Error("ADMIN_PASSWORD introuvable dans .dev.vars — vérifie le fichier local.");
  return match[1].trim();
}

// --- Les 20 entreprises de la campagne (mission "20 Audits Premium") ------
const COMPANIES = [
  { n: 1, companyName: "AS Pro Elec", city: "Arlon", secteur: "Électricien" },
  { n: 2, companyName: "Électricité Schroeder Eric", city: "Attert", secteur: "Électricien" },
  { n: 3, companyName: "Hubermont Philippe", city: "Halanzy", secteur: "Électricien" },
  { n: 4, companyName: "Sanidubru", city: "Messancy", secteur: "Plomberie/chauffage" },
  { n: 5, companyName: "Bati Renov", city: "Messancy", secteur: "Rénovation/chauffage" },
  { n: 6, companyName: "CDV Construction", city: "Arlon", secteur: "Construction/rénovation" },
  { n: 7, companyName: "Garage Auto Claude", city: "Aubange", secteur: "Garage" },
  { n: 8, companyName: "Garage R.G. Pneus", city: "Saint-Léger", secteur: "Garage/pneus" },
  { n: 9, companyName: "Garage Pneus M. Courtois", city: "Aubange", secteur: "Garage/pneus" },
  { n: 10, companyName: "Carrosserie Pinto", city: "Aubange", secteur: "Carrosserie" },
  { n: 11, companyName: "Taverne Chez Tony & Lucy", city: "Arlon", secteur: "Restaurant" },
  { n: 12, companyName: "Hoppy Messancy", city: "Messancy", secteur: "Restaurant" },
  { n: 13, companyName: "La Régalade", city: "Arlon", secteur: "Restaurant" },
  { n: 14, companyName: "Saveurs d'Asie", city: "Arlon", secteur: "Restaurant" },
  { n: 15, companyName: "Beauty A", city: "Aubange", secteur: "Institut de beauté" },
  { n: 16, companyName: "Beauty House Ophélie", city: "Aubange", secteur: "Institut de beauté" },
  { n: 17, companyName: "Cabinet Kineos", city: "Arlon", secteur: "Kinésithérapie" },
  { n: 18, companyName: "Kiné Plus Weyler", city: "Arlon", secteur: "Kinésithérapie" },
  { n: 19, companyName: "Jorge & Georges Entreprise", city: "Aubange", secteur: "Construction" },
  { n: 20, companyName: "MRG Elec", city: "Aubange", secteur: "Électricité et équipements" },
];

// --- Anciennes régressions à détecter explicitement (jamais corriger ici) --
const KNOWN_REGRESSIONS = [
  "Surla", "Surle", "contre0", "renforceraitla", "peutfaire", "patient,votre", "photos,contre",
];
const FORBIDDEN_PATTERNS = [/undefined/i, /\bnull\b/i, /NaN/, /\[object Object\]/i];

function slugify(value) {
  return String(value)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function loginAdmin() {
  const password = readAdminPassword();
  const response = await fetch(`${BASE_URL}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(`Échec login admin (${response.status}) : ${JSON.stringify(data)}`);
  }
  const setCookie = response.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];
  if (!cookie) throw new Error("Login admin OK mais aucun cookie de session reçu.");
  return cookie;
}

async function jsonFetch(url, { cookie, method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function runOne(cookie, company) {
  const slug = `${String(company.n).padStart(2, "0")}-${slugify(company.companyName)}`;
  const dir = path.join(OUT_DIR, slug);
  mkdirSync(dir, { recursive: true });

  const log = { company, stages: {}, checks: {}, verdictHint: null };

  // 1) Créer l'audit Premium (Mode 2 : nom + ville, comme demandé par la mission)
  const basePayload = { companyName: company.companyName, city: company.city, reportType: "premium" };
  let created = await jsonFetch(`${BASE_URL}/api/admin/audits`, { cookie, method: "POST", body: basePayload });
  log.stages.create = { status: created.status, ok: created.ok, body: created.data };

  // Objectif 2 (mission "rendre l'identification suffisamment robuste") —
  // plusieurs entreprises sont plausibles, aucune ne dépasse le seuil de
  // sélection automatique : aucune analyse n'a été créée. Ce script tourne
  // sans surveillance (pas d'administrateur humain disponible pendant la
  // campagne) ; pour pouvoir quand même mesurer le pipeline de bout en bout,
  // on SIMULE la validation manuelle en choisissant explicitement le
  // meilleur candidat (celui de plus haute confiance, déjà trié ainsi par
  // collectFiche) — exactement le même mécanisme qu'un clic "Confirmer la
  // sélection" dans l'interface d'administration. C'est documenté
  // distinctement (validation: "manuelle (simulée)") : en usage réel, ce
  // choix serait fait par un humain, jamais automatiquement.
  //
  // Mission "logique métier déterministe" — Objectif 5 : on renvoie le
  // candidat COMPLET (`selectedCandidate: bestCandidate.raw`), pas seulement
  // son place_id — cause exacte du bug SELECTED_CANDIDATE_NOT_FOUND observé
  // sur "Beauty House Ophélie" (Outscraper ne renvoyait pas les mêmes
  // résultats entre le premier appel et cette relance identique). En passant
  // le candidat déjà reçu, collectFiche() n'a plus besoin de rappeler
  // Outscraper du tout pour cette confirmation.
  log.identification = { validation: "automatique", confidence: null, tier: null };
  if (!created.ok || !created.data?.success) {
    if (created.data?.error === "AMBIGUOUS_CANDIDATES") {
      const candidates = Array.isArray(created.data.candidates) ? created.data.candidates : [];
      log.ambiguousCandidates = candidates;
      if (!candidates.length) {
        log.verdictHint = "FAIL (AMBIGUOUS_CANDIDATES sans candidat — incohérent)";
        writeFileSync(path.join(dir, "run-log.json"), JSON.stringify(log, null, 2));
        return log;
      }
      const bestCandidate = candidates[0]; // déjà trié par confiance décroissante
      log.identification.validation = "manuelle (simulée par le script — voir commentaire ci-dessus)";
      log.identification.chosenAmongCandidates = candidates.map((c) => `${c.name} (${c.city || "?"}, ${Math.round((c.confidence || 0) * 100)}%)`);
      created = await jsonFetch(`${BASE_URL}/api/admin/audits`, {
        cookie,
        method: "POST",
        body: {
          ...basePayload,
          selectedPlaceId: bestCandidate.placeId,
          ...(bestCandidate.raw ? { selectedCandidate: bestCandidate.raw } : {}),
        },
      });
      log.stages.createAfterManualSelection = { status: created.status, ok: created.ok, body: created.data };
    }
  }

  if (!created.ok || !created.data?.success) {
    // Objectif 3 (collectFiche.js) : un rejet "Aucune entreprise fiable
    // trouvée." remonte ici comme un échec de l'étape "observation" — ce
    // n'est PAS un crash, c'est le comportement de sécurité demandé par la
    // mission. On le distingue explicitement plutôt que de tout étiqueter
    // "FAIL".
    const upstreamMessage = created.data?.message || "";
    log.verdictHint = upstreamMessage.includes("Aucune entreprise fiable")
      ? "AUCUNE ENTREPRISE FIABLE TROUVÉE (rejet volontaire — à relire)"
      : "FAIL";
    writeFileSync(path.join(dir, "run-log.json"), JSON.stringify(log, null, 2));
    return log;
  }
  const analysisId = created.data.analysisId;
  log.analysisId = analysisId;
  // Objectif 7 — score de confiance + palier de décision remontés par
  // /api/analyze -> /api/admin/audits (voir functions/api/analyze.js et
  // functions/api/admin/audits.js), pour la comparaison demandée : entité
  // demandée -> entité retenue -> confiance -> validation auto/manuelle -> verdict.
  if (created.data.identification) {
    log.identification.confidence = created.data.identification.confidence;
    log.identification.tier = created.data.identification.tier;
    if (created.data.identification.tier === "manual" && log.identification.validation === "automatique") {
      log.identification.validation = "manuelle (simulée par le script)";
    }
  }

  // 2) Charger l'écran de validation (observation + concurrents bruts)
  const review = await jsonFetch(`${BASE_URL}/api/admin/audit-review/${analysisId}`, { cookie });
  log.stages.review = { status: review.status, ok: review.ok };
  writeFileSync(path.join(dir, "observation.json"), JSON.stringify(review.data, null, 2));
  if (!review.ok || !review.data?.success) {
    log.verdictHint = "FAIL";
    writeFileSync(path.join(dir, "run-log.json"), JSON.stringify(log, null, 2));
    return log;
  }
  const analysis = review.data.analysis || {};
  // Correctif (mission "corriger les deux problèmes critiques", constat de
  // départ) : la structure réelle renvoyée par GET
  // /api/admin/audit-review/:id place les données de collecte sous
  // analysis.business.*, jamais analysis.* directement ni
  // analysis.benchmark.competitors. La précédente version de ce script lisait
  // le mauvais chemin et rapportait "competitorCount: 0" pour les 20 audits
  // alors que le benchmark était en réalité correctement rempli à chaque
  // fois (3 concurrents, aucun self-match) — voir RAPPORT-*.md pour le détail.
  const business = analysis.business || {};

  // Objectif 7 — nom retenu par Outscraper vs nom demandé, fusionné avec le
  // score de confiance / palier de décision déjà déposés dans log.identification
  // plus haut (ne jamais écraser cet objet : confidence/tier/validation y
  // ont été renseignés avant même de connaître l'entité finalement retenue).
  Object.assign(log.identification, {
    requested: company.companyName,
    resolved: business.name || null,
    requestedCity: company.city,
    resolvedCity: business.fiche?.city || business.fiche?.borough || null,
  });

  // Contrôle A (partiel, automatisable) : catégorie principale ≠ nom d'entreprise
  const category = business.activity || "";
  log.checks.categoryEqualsName = Boolean(category)
    && category.trim().toLowerCase() === company.companyName.trim().toLowerCase();

  // Contrôle A (partiel) : l'entreprise analysée absente de ses propres concurrents
  const competitors = Array.isArray(business.competitors) ? business.competitors : [];
  const targetPlaceId = business.placeId || null;
  const selfInCompetitors = competitors.some((c) => (
    (targetPlaceId && c.place_id && c.place_id === targetPlaceId)
    || (c.name && c.name.trim().toLowerCase() === company.companyName.trim().toLowerCase())
  ));
  log.checks.selfInCompetitors = selfInCompetitors;
  log.checks.competitorCount = competitors.length;
  log.checks.duplicateCompetitors = competitors.length
    !== new Set(competitors.map((c) => c.place_id || c.name)).size;

  // 3) Valider (déclenche knowledge → reasoning → composer) — on accepte les
  //    données auto-détectées telles quelles (pas de correction manuelle ici,
  //    cette mission observe le pipeline tel qu'il se comporte réellement).
  const completed = await jsonFetch(`${BASE_URL}/api/admin/audit-review/${analysisId}`, {
    cookie,
    method: "PATCH",
    body: { action: "complete_review" },
  });
  log.stages.completeReview = { status: completed.status, ok: completed.ok, stages: completed.data?.stages };
  if (!completed.ok || !completed.data?.success) {
    log.verdictHint = "FAIL";
    log.stages.completeReview.body = completed.data;
    writeFileSync(path.join(dir, "run-log.json"), JSON.stringify(log, null, 2));
    return log;
  }

  // 4) Approuver
  const approved = await jsonFetch(`${BASE_URL}/api/admin/audit-review/${analysisId}`, {
    cookie,
    method: "PATCH",
    body: { action: "approve" },
  });
  log.stages.approve = { status: approved.status, ok: approved.ok };

  // 5) Aperçu HTML complet
  const htmlResponse = await fetch(`${BASE_URL}/api/render/${analysisId}`, { headers: { Cookie: cookie } });
  const html = await htmlResponse.text();
  log.stages.render = { status: htmlResponse.status, ok: htmlResponse.ok, bytes: html.length };
  if (htmlResponse.ok) {
    writeFileSync(path.join(dir, "preview.html"), html);

    const visible = html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ");
    log.checks.forbiddenPatterns = FORBIDDEN_PATTERNS
      .filter((re) => re.test(visible))
      .map((re) => re.toString());
    // Mission "préparer définitivement Efficia Digital pour la phase bêta" —
    // Objectif 1 : bug corrigé ici. Ce test comparait auparavant contre
    // `html` (le document COMPLET, styles et commentaires inclus), jamais
    // contre `visible` (le texte réellement affiché, styles/balises retirés)
    // — utilisé correctement juste au-dessus pour forbiddenPatterns. Or le
    // template HTML contient, dans un bloc <style>, un commentaire de
    // développeur qui DOCUMENTE le bug historique déjà corrigé ("mots collés
    // dans le PDF (\"Surla\", \"contre0\", \"renforceraitla\"...)") : en
    // cherchant dans `html` plutôt que `visible`, ce test se déclenchait sur
    // son propre changelog interne, présent identiquement dans CHAQUE audit
    // généré, jamais sur une vraie régression dans le contenu affiché.
    // `knownRegressions` ne contient donc désormais que les motifs
    // réellement détectés dans le texte visible par le lecteur du rapport.
    log.checks.knownRegressions = KNOWN_REGRESSIONS.filter((needle) => visible.includes(needle));

    const pages = (html.match(/<section class="page[^"]*"/g) || []).length;
    log.checks.pageCount = pages;

    // Pack Visibilité / Pack Performance : prix et mention de déduction
    log.checks.hasPackVisibilite349 = /Pack Visibilité Google/.test(html) && /349\s*€/.test(html);
    log.checks.hasPackPerformance499 = /Pack Performance/.test(html) && /499\s*€/.test(html);
    log.checks.hasDeductionMention = /99\s*€.*(déduit|déduits)/s.test(html)
      || /(déduit|déduits).*99\s*€/s.test(html);
  }

  // 6) PDF local — attendu absent si CLOUDFLARE_ACCOUNT_ID /
  //    BROWSER_RENDERING_API_TOKEN ne sont pas dans .dev.vars (non requis
  //    pour cette campagne, la présentation HTML fait foi).
  const pdfResponse = await fetch(`${BASE_URL}/api/pdf/${analysisId}`, { headers: { Cookie: cookie } });
  log.stages.pdf = { status: pdfResponse.status, ok: pdfResponse.ok };
  if (pdfResponse.ok && (pdfResponse.headers.get("content-type") || "").includes("pdf")) {
    const buffer = Buffer.from(await pdfResponse.arrayBuffer());
    writeFileSync(path.join(dir, "audit.pdf"), buffer);
    log.stages.pdf.saved = true;
  } else {
    log.stages.pdf.body = await pdfResponse.json().catch(() => null);
    log.stages.pdf.saved = false;
  }

  const anomalyFree = !log.checks.categoryEqualsName
    && !log.checks.selfInCompetitors
    && !log.checks.duplicateCompetitors
    && (log.checks.forbiddenPatterns || []).length === 0
    && (log.checks.knownRegressions || []).length === 0;
  log.verdictHint = anomalyFree ? "PASS (automatique — à relire qualitativement)" : "ANOMALIE DÉTECTÉE — voir checks";

  writeFileSync(path.join(dir, "run-log.json"), JSON.stringify(log, null, 2));
  return log;
}

// Mission "réduire les faux négatifs du pipeline d'identification sans
// réintroduire les faux positifs" — Objectif 6 : comparer Campagne 1 (avant
// tout correctif) -> Campagne 2 (score de confiance + validation manuelle) ->
// Campagne 3 (celle-ci). Un simple fichier ".previous" écrasé à chaque
// relance perdait l'historique au-delà d'une génération — remplacé par des
// archives numérotées (_summary.campaign-N.json), jamais réécrites une fois
// créées.
function listCampaignArchives() {
  if (!existsSync(OUT_DIR)) return [];
  return readdirSync(OUT_DIR)
    .map((file) => {
      const match = file.match(/^_summary\.campaign-(\d+)\.json$/);
      return match ? { n: Number(match[1]), file } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.n - b.n);
}

// Migration ponctuelle depuis l'ancien schéma à un seul cran
// (_summary.json / _summary.previous.json) : ne s'exécute que si aucune
// archive numérotée n'existe encore, pour ne jamais écraser un historique
// déjà migré.
function migrateLegacySummariesIfNeeded() {
  const archives = listCampaignArchives();
  if (archives.length) return archives;

  const legacyPrevious = path.join(OUT_DIR, "_summary.previous.json");
  const legacyCurrent = path.join(OUT_DIR, "_summary.json");
  let n = 1;
  if (existsSync(legacyPrevious)) {
    copyFileSync(legacyPrevious, path.join(OUT_DIR, `_summary.campaign-${n}.json`));
    n += 1;
  }
  if (existsSync(legacyCurrent)) {
    copyFileSync(legacyCurrent, path.join(OUT_DIR, `_summary.campaign-${n}.json`));
  }
  return listCampaignArchives();
}

function loadCampaignArchive(entry) {
  try {
    return JSON.parse(readFileSync(path.join(OUT_DIR, entry.file), "utf8"));
  } catch {
    return null;
  }
}

function entryFor(campaignResults, companyNumber) {
  if (!Array.isArray(campaignResults)) return null;
  return campaignResults.find((r) => r.company?.n === companyNumber) || null;
}

// Objectif 6 — "mauvaise identification" ne peut pas être jugée de façon
// fiable par un simple score de similarité texte : plusieurs résolutions
// légitimes ont un nameScore brut faible (ex. "Garage Pneus M. Courtois" ->
// "Garage PNEUS Courtois SRL - Aubange - 1,2,3 AutoService", ou "Kiné Plus
// Weyler" -> "Kineplus sprl") alors qu'elles sont correctes une fois la
// ville et le contexte pris en compte — un tel seuil générait de nombreux
// faux positifs lors des essais de calibration de ce script. On ne
// comptabilise donc ici QUE les cas déjà identifiés et confirmés comme de
// mauvaises identifications lors des missions précédentes (voir les
// rapports de mission antérieurs) ; toute autre entité retenue est laissée à
// la relecture humaine (colonne "entité retenue" du tableau imprimé), jamais
// jugée automatiquement.
const KNOWN_BAD_MATCHES = [
  { requested: "Électricité Schroeder Eric", wrongResolvedIncludes: "shrader electric" },
  { requested: "CDV Construction", wrongResolvedIncludes: "cdg construction" },
  { requested: "Beauty House Ophélie", wrongResolvedIncludes: "beauty a" },
];

// Compatible avec l'ancien format de log (Campagne 1, avant l'introduction du
// champ `identification` à la mission "rendre l'identification robuste") :
// le nom retenu y était accessible sous stages.create.body.analysis.businessName.
function resolvedNameOf(entry) {
  return entry.identification?.resolved
    || entry.stages?.create?.body?.analysis?.businessName
    || null;
}

function classifyOutcome(entry) {
  if (!entry) return "inconnu";
  const verdict = entry.verdictHint || "";
  if (verdict.includes("AUCUNE ENTREPRISE FIABLE")) return "rejet";
  const resolved = resolvedNameOf(entry);
  const requested = entry.company?.companyName;
  if (!entry.analysisId || !resolved) return "échec technique";
  const knownBad = KNOWN_BAD_MATCHES.some((k) => (
    k.requested === requested && resolved.toLowerCase().includes(k.wrongResolvedIncludes)
  ));
  if (knownBad) return "mauvaise identification (confirmée)";
  const validation = entry.identification?.validation || "";
  if (validation.includes("manuelle")) return "validation manuelle";
  return "PASS";
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const priorArchives = migrateLegacySummariesIfNeeded();
  const thisCampaignNumber = priorArchives.length ? priorArchives[priorArchives.length - 1].n + 1 : 1;
  const immediatelyPrevious = priorArchives.length
    ? loadCampaignArchive(priorArchives[priorArchives.length - 1])
    : null;

  console.log(`Cible : ${BASE_URL}`);
  console.log(`Campagne n°${thisCampaignNumber} (${priorArchives.length} campagne(s) antérieure(s) archivée(s))`);
  console.log("Connexion admin...");
  const cookie = await loginAdmin();
  console.log("OK. Lancement des 20 audits Premium (Mode Nom + Ville)...\n");

  const results = [];
  for (const company of COMPANIES) {
    console.log(`[${company.n}/20] ${company.companyName} — ${company.city}`);
    try {
      const log = await runOne(cookie, company);
      console.log(`  -> ${log.verdictHint}`);
      results.push(log);
    } catch (error) {
      console.log(`  -> ERREUR: ${error.message}`);
      results.push({ company, error: error.message, verdictHint: "FAIL" });
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  // "Latest" pointer (comportement historique, gardé pour compatibilité) +
  // archive numérotée permanente, jamais réécrite par une relance future.
  writeFileSync(path.join(OUT_DIR, "_summary.json"), JSON.stringify(results, null, 2));
  writeFileSync(path.join(OUT_DIR, `_summary.campaign-${thisCampaignNumber}.json`), JSON.stringify(results, null, 2));

  // Objectif 7 — pour chaque audit : entité demandée -> entité retenue ->
  // score de confiance -> validation automatique/manuelle -> verdict, et
  // comparaison explicite avec la campagne immédiatement précédente.
  console.log("\n=== Résumé — identification (campagne courante) ===");
  const comparison = [];
  for (const r of results) {
    const previous = entryFor(immediatelyPrevious, r.company.n);
    const confidencePct = Number.isFinite(r.identification?.confidence)
      ? `${Math.round(r.identification.confidence * 100)}%`
      : "—";
    const entry = {
      n: r.company.n,
      requested: r.company.companyName,
      requestedCity: r.company.city,
      resolved: resolvedNameOf(r),
      confidence: r.identification?.confidence ?? null,
      tier: r.identification?.tier || null,
      validation: r.identification?.validation || (r.verdictHint?.includes("AUCUNE ENTREPRISE") ? "aucune (rejet)" : "—"),
      verdict: r.verdictHint,
      outcome: classifyOutcome(r),
      previousResolved: previous ? resolvedNameOf(previous) : null,
      changedVsPrevious: Boolean(previous) && resolvedNameOf(previous) !== resolvedNameOf(r),
    };
    comparison.push(entry);
    console.log(
      `${String(entry.n).padStart(2, "0")}. ${entry.requested.padEnd(30)} -> ${(entry.resolved || "—").padEnd(30)} `
      + `| confiance=${confidencePct.padEnd(5)} | validation=${entry.validation.padEnd(35)} | ${entry.outcome}`,
    );
    if (previous) {
      const marker = entry.changedVsPrevious ? "CHANGÉ" : "identique";
      console.log(`     campagne précédente -> "${entry.previousResolved || "—"}" (${marker})`);
    }
  }
  writeFileSync(path.join(OUT_DIR, "_comparison.json"), JSON.stringify(comparison, null, 2));

  // Objectif 6 — tableau comparatif PASS / validation manuelle / rejet /
  // mauvaise identification, sur TOUTES les campagnes archivées + celle-ci.
  const allGenerations = [
    ...priorArchives.map((a) => ({ n: a.n, results: loadCampaignArchive(a) })),
    { n: thisCampaignNumber, results },
  ];
  console.log("\n=== Objectif 6 — comparaison entre campagnes ===");
  const counts = allGenerations.map(({ n, results: gen }) => {
    const outcomes = (gen || []).map((r) => classifyOutcome(r));
    const count = (label) => outcomes.filter((o) => o === label).length;
    return {
      campaign: n,
      total: outcomes.length,
      pass: count("PASS"),
      validationManuelle: count("validation manuelle"),
      rejet: count("rejet"),
      mauvaiseIdentification: count("mauvaise identification (confirmée)"),
      echecTechnique: count("échec technique"),
    };
  });
  for (const c of counts) {
    console.log(
      `Campagne ${c.campaign} (${c.total}/20) — PASS: ${c.pass} | validation manuelle: ${c.validationManuelle} `
      + `| rejet: ${c.rejet} | mauvaise identification: ${c.mauvaiseIdentification} | échec technique: ${c.echecTechnique}`,
    );
  }
  writeFileSync(path.join(OUT_DIR, "_comparison-all-campaigns.json"), JSON.stringify(counts, null, 2));

  console.log(`\nFichiers écrits dans : ${OUT_DIR}`);
  console.log(`Archive de cette campagne : _summary.campaign-${thisCampaignNumber}.json`);
  console.log("Comparaison détaillée (campagne courante) : _comparison.json");
  console.log("Comparaison PASS/manuel/rejet/mauvaise identification (toutes campagnes) : _comparison-all-campaigns.json");
  console.log("Aucun commit, aucun push, aucune modification du moteur n'a été effectué par ce script.");
}

main().catch((error) => {
  console.error("Échec du script :", error);
  process.exit(1);
});
