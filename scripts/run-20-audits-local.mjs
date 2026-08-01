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

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
  const created = await jsonFetch(`${BASE_URL}/api/admin/audits`, {
    cookie,
    method: "POST",
    body: { companyName: company.companyName, city: company.city, reportType: "premium" },
  });
  log.stages.create = { status: created.status, ok: created.ok, body: created.data };
  if (!created.ok || !created.data?.success) {
    log.verdictHint = "FAIL";
    writeFileSync(path.join(dir, "run-log.json"), JSON.stringify(log, null, 2));
    return log;
  }
  const analysisId = created.data.analysisId;
  log.analysisId = analysisId;

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

  // Contrôle A (partiel, automatisable) : catégorie principale ≠ nom d'entreprise
  const category = analysis.category || analysis.observation?.category || "";
  log.checks.categoryEqualsName = category
    && category.trim().toLowerCase() === company.companyName.trim().toLowerCase();

  // Contrôle A (partiel) : l'entreprise analysée absente de ses propres concurrents
  const competitors = Array.isArray(analysis.competitors) ? analysis.competitors
    : Array.isArray(analysis.benchmark?.competitors) ? analysis.benchmark.competitors : [];
  const targetPlaceId = analysis.placeId || analysis.observation?.placeId || null;
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
    log.checks.knownRegressions = KNOWN_REGRESSIONS.filter((needle) => html.includes(needle));

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

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Cible : ${BASE_URL}`);
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

  writeFileSync(path.join(OUT_DIR, "_summary.json"), JSON.stringify(results, null, 2));

  console.log("\n=== Résumé ===");
  for (const r of results) {
    console.log(`${String(r.company.n).padStart(2, "0")}. ${r.company.companyName.padEnd(30)} ${r.verdictHint}`);
  }
  console.log(`\nFichiers écrits dans : ${OUT_DIR}`);
  console.log("Aucun commit, aucun push, aucune modification du moteur n'a été effectué par ce script.");
}

main().catch((error) => {
  console.error("Échec du script :", error);
  process.exit(1);
});
