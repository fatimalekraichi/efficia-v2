import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_HTML = path.resolve(__dirname, "../../outil-score-efficia-auto-v5.html");

const PACK_CRITERES = [
  "revendiquee", "categoriePrincipale", "categoriesSecondaires", "horaires", "contact", "adresse", "attributs", "nap",
  "logoCouverture", "nombrePhotos", "photoRecente", "varietePhotos", "qualitePhotos",
  "tauxReponseAvis", "qualiteReponsesAvis",
  "descriptionRemplie", "descriptionQualite", "servicesPresents", "servicesDecrits", "questionsReponses", "liensAction"
];

const FAMILLES_PRIORITES = [
  { key: "offre", label: "Offre et services", criteres: ["servicesPresents", "servicesDecrits", "descriptionRemplie", "descriptionQualite", "questionsReponses", "liensAction"], impact: 5 },
  { key: "reputation", label: "Réputation client", criteres: ["volumeAvis", "tauxReponseAvis", "qualiteReponsesAvis", "recenceAvis", "noteMoyenne"], impact: 5 },
  { key: "visibilite", label: "Visibilité locale", criteres: ["classementLocal", "recherchesSpecifiques", "categoriePrincipale", "categoriesSecondaires", "nap"], impact: 4.5 },
  { key: "photos", label: "Photos et preuves visuelles", criteres: ["nombrePhotos", "varietePhotos", "qualitePhotos", "photoRecente", "logoCouverture"], impact: 3.8 },
  { key: "infos", label: "Informations essentielles", criteres: ["revendiquee", "horaires", "contact", "adresse", "attributs"], impact: 4 },
  { key: "activite", label: "Activité visible", criteres: ["publicationRecente", "rythmePublication"], impact: 2.8 }
];

function scanLiteral(source, startIndex, open, close) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = startIndex; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        i++;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }

    if (char === "/" && next === "/") {
      lineComment = true;
      i++;
      continue;
    }

    if (char === "/" && next === "*") {
      blockComment = true;
      i++;
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === open) depth++;
    if (char === close) depth--;
    if (depth === 0 && i >= startIndex) return source.slice(startIndex, i + 1);
  }

  throw new Error(`Impossible d'extraire le bloc ${open}${close}.`);
}

function extractConstLiteral(source, constName, open, close) {
  const declaration = `const ${constName}`;
  const declarationIndex = source.indexOf(declaration);
  if (declarationIndex === -1) throw new Error(`Constante ${constName} introuvable.`);
  const literalStart = source.indexOf(open, declarationIndex);
  if (literalStart === -1) throw new Error(`Début de ${constName} introuvable.`);
  return scanLiteral(source, literalStart, open, close);
}

function loadEngineConstants() {
  const html = fs.readFileSync(ENGINE_HTML, "utf8");
  const configSource = extractConstLiteral(html, "CONFIG", "{", "}");
  const grilleSource = extractConstLiteral(html, "GRILLE", "[", "]");
  const scoringMatch = html.match(/const\s+SCORING_VERSION\s*=\s*["']([^"']+)["']/);
  const context = { console, Math, String, Number };

  vm.runInNewContext(
    `
      const CONFIG = ${configSource};
      const GRILLE = ${grilleSource};
      globalThis.__EFF = {
        CONFIG,
        GRILLE,
        SCORING_VERSION: ${JSON.stringify(scoringMatch?.[1] || "unknown")}
      };
    `,
    context
  );

  const { CONFIG, GRILLE, SCORING_VERSION } = context.__EFF;
  const CRITERE_IDS = {};
  let idx = 0;
  GRILLE.forEach(cat => {
    cat.criteres.forEach(cr => {
      cr.id = idx;
      if (cr.key) CRITERE_IDS[cr.key] = idx;
      idx++;
    });
  });

  return { CONFIG, GRILLE, CRITERE_IDS, SCORING_VERSION };
}

const constants = loadEngineConstants();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createDecisionEngine(fixture = {}) {
  const CONFIG = clone(constants.CONFIG);
  const GRILLE = clone(constants.GRILLE);
  const CRITERE_IDS = {};
  GRILLE.forEach(cat => cat.criteres.forEach(cr => { CRITERE_IDS[cr.key] = cr.id; }));
  const SCORING_VERSION = constants.SCORING_VERSION;

  let profilActif = fixture.profile || "default";
  let answers = { ...(fixture.criteria || {}) };
  let verification = { ...(fixture.verification || {}) };
  let donneesAnalyse = { ...(fixture.data || {}) };

  function obtenirProfilActif() {
    return CONFIG.secteurs[profilActif] || CONFIG.secteurs.default;
  }

  function trouverCritere(idOrKey) {
    const id = typeof idOrKey === "string" ? CRITERE_IDS[idOrKey] : idOrKey;
    for (const cat of GRILLE) {
      const cr = cat.criteres.find(c => c.id === id);
      if (cr) return cr;
    }
    return null;
  }

  function lirePoints(id) {
    const cr = trouverCritere(id);
    if (!cr || !Object.prototype.hasOwnProperty.call(answers, cr.key)) return null;
    const value = answers[cr.key];
    return value === null || value === undefined || value === "" ? null : Number(value);
  }

  function calculScoreDetail() {
    const profil = obtenirProfilActif();
    let total = 0;
    let poidsPrisEnCompte = 0;
    let repondus = 0;
    let totalCrit = 0;
    const categories = [];

    GRILLE.forEach(cat => {
      let brut = 0;
      let maxEvalue = 0;
      let repondusCat = 0;
      let nonVerifiesCat = 0;

      cat.criteres.forEach(cr => {
        totalCrit++;
        const p = lirePoints(cr.id);
        if (p !== null) {
          brut += p;
          maxEvalue += cr.max;
          repondus++;
          repondusCat++;
        } else {
          nonVerifiesCat++;
        }
      });

      const poidsProfil = profil[cat.key] ?? cat.pts;
      const pct = maxEvalue ? brut / maxEvalue : null;
      const pointsPonderes = pct === null ? null : pct * poidsProfil;
      if (pct !== null) {
        total += pointsPonderes;
        poidsPrisEnCompte += poidsProfil;
      }
      categories.push({ cat, brut, maxEvalue, pct, poidsProfil, pointsPonderes, repondusCat, nonVerifiesCat });
    });

    const scoreNormalise = poidsPrisEnCompte ? total * (100 / poidsPrisEnCompte) : 0;
    return { total: Number.isFinite(scoreNormalise) ? scoreNormalise : 0, repondus, totalCrit, categories, profil };
  }

  function scoreCriteres(keys) {
    let obtenu = 0;
    let max = 0;
    keys.forEach(key => {
      const id = CRITERE_IDS[key];
      const cr = trouverCritere(id);
      const p = id !== undefined ? lirePoints(id) : null;
      if (cr && p !== null) {
        obtenu += p;
        max += cr.max;
      }
    });
    return max ? Math.round((obtenu / max) * 100) : null;
  }

  function indicesProspect() {
    return {
      visibilite: scoreCriteres(["categoriePrincipale", "categoriesSecondaires", "nap", "classementLocal", "recherchesSpecifiques", "publicationRecente", "rythmePublication", "recenceAvis"]),
      confiance: scoreCriteres(["noteMoyenne", "volumeAvis", "tauxReponseAvis", "qualiteReponsesAvis", "qualitePhotos", "contact", "adresse", "nap"]),
      conversion: scoreCriteres(["descriptionRemplie", "descriptionQualite", "servicesPresents", "servicesDecrits", "liensAction", "questionsReponses", "varietePhotos"])
    };
  }

  function statutEvaluationCritere(cr, points) {
    if (points === null) return "not_evaluated";
    if (points >= cr.max) return "compliant";
    if (points > 0) return "partial";
    return "deficient";
  }

  function statutVerificationCritere(cr) {
    if (lirePoints(cr.id) === null) return "not_verified";
    const raw = verification[cr.key] || "manual";
    if (raw === "observed" || raw === "auto" || raw === "automatique") return "observed";
    if (raw === "inferred" || raw === "prefill" || raw === "pre-remplie") return "inferred";
    if (raw === "not_verified" || raw === "unavailable") return raw;
    return "manually_confirmed";
  }

  function collecterCriteresAudit() {
    const criteria = [];
    GRILLE.forEach(cat => cat.criteres.forEach(cr => {
      const points = lirePoints(cr.id);
      const evaluationStatus = statutEvaluationCritere(cr, points);
      criteria.push({
        key: cr.key,
        label: cr.q,
        categoryKey: cat.key,
        categoryLabel: cat.cat,
        pointsAwarded: evaluationStatus === "not_evaluated" ? null : Number(points),
        maxPoints: Number(cr.max),
        evaluationStatus,
        verificationStatus: statutVerificationCritere(cr)
      });
    }));
    return criteria;
  }

  function scoreProjetePack() {
    const profil = obtenirProfilActif();
    let totalProjete = 0;
    let poidsPrisEnCompte = 0;
    let corriges = 0;
    let ameliorables = 0;

    GRILLE.forEach(cat => {
      let brut = 0;
      let maxEvalue = 0;
      cat.criteres.forEach(cr => {
        const p = lirePoints(cr.id);
        if (p === null) return;
        const fixable = PACK_CRITERES.includes(cr.key);
        if (p < cr.max) {
          ameliorables++;
          if (fixable) corriges++;
        }
        brut += fixable ? cr.max : p;
        maxEvalue += cr.max;
      });
      const poidsProfil = profil[cat.key] ?? cat.pts;
      if (maxEvalue) {
        totalProjete += (brut / maxEvalue) * poidsProfil;
        poidsPrisEnCompte += poidsProfil;
      }
    });

    const score = poidsPrisEnCompte ? totalProjete * (100 / poidsPrisEnCompte) : 0;
    return { projete: Math.min(97, Math.round(score)), corriges, ameliorables };
  }

  function selectionnerPrioritesDynamiques(candidats) {
    const parFamille = new Map();
    candidats.forEach(item => {
      const famille = FAMILLES_PRIORITES.find(f => f.criteres.includes(item.critere.key));
      if (!famille) return;
      const ratioPerdu = item.perdu / Math.max(item.critere.max, 1);
      const reparable = CONFIG.tempsTaches[item.critere.key] ? 1 : 0.55;
      const score = ratioPerdu * 5 + famille.impact + reparable + item.perdu * 0.25;
      const precedent = parFamille.get(famille.key);
      if (!precedent || score > precedent.score) {
        parFamille.set(famille.key, { ...item, famille, score });
      }
    });
    return [...parFamille.values()].sort((a, b) => b.score - a.score).slice(0, 3);
  }

  function collecterPriorites() {
    const candidats = [];
    GRILLE.forEach(cat => cat.criteres.forEach(cr => {
      const points = lirePoints(cr.id);
      if (points !== null && points < cr.max) {
        candidats.push({ critere: cr, points, perdu: cr.max - points });
      }
    }));
    return selectionnerPrioritesDynamiques(candidats).map(item => ({
      family: item.famille.key,
      criterion: item.critere.key,
      lost: item.perdu,
      score: Number(item.score.toFixed(6))
    }));
  }

  function prioritePhotosPorteSurActualite(item) {
    if (!item || item.family !== "photos") return false;
    const moyennePhotos = donneesAnalyse.moyennesConcurrents?.photos;
    if (item.criterion === "photoRecente") return true;
    return Number.isFinite(Number(donneesAnalyse.nbPhotos)) &&
      Number.isFinite(Number(moyennePhotos)) &&
      Number(donneesAnalyse.nbPhotos) >= Number(moyennePhotos) * 0.9;
  }

  function collecterMetricsAudit() {
    const map = {
      rating: ["note", "stars"],
      reviews_count: ["nbAvis", "count"],
      photos_count: ["nbPhotos", "count"],
      description_length: ["descriptionLongueur", "characters"],
      local_position: ["position", "rank"]
    };
    return Object.entries(map).flatMap(([key, [sourceKey, unit]]) => {
      const value = donneesAnalyse[sourceKey];
      if (!Number.isFinite(Number(value))) return [];
      return [{ key, numericValue: Number(value), textValue: null, booleanValue: null, unit, source: "score_efficia", verificationStatus: "manually_confirmed", rawField: sourceKey }];
    });
  }

  function construirePayloadAuditComplete(options = {}) {
    const detail = calculScoreDetail();
    const indices = indicesProspect();
    return {
      requestName: fixture.businessName || "",
      requestCity: fixture.city || "",
      requestActivity: fixture.activity || "",
      testedQuery: donneesAnalyse.requeteTestee || "",
      source: "test_fixture",
      environment: "test",
      orderId: "",
      manualOverridesJson: "{}",
      scoreEfficia: Math.round(detail.total),
      visibilityScore: indices.visibilite,
      trustScore: indices.confiance,
      conversionScore: indices.conversion,
      sectorProfile: profilActif || "default",
      scoringVersion: SCORING_VERSION,
      auditStatus: "generated",
      pdfFilename: options.pdfFilename || "",
      criteria: collecterCriteresAudit(),
      metrics: collecterMetricsAudit(),
      competitors: [],
      recommendations: collecterPriorites().slice(0, 3)
    };
  }

  function snapshot() {
    const detail = calculScoreDetail();
    const categories = detail.categories.map(category => ({
      key: category.cat.key,
      evaluated: category.repondusCat,
      unevaluated: category.nonVerifiesCat,
      maxEvaluated: category.maxEvalue,
      profileWeight: category.poidsProfil,
      weightedPoints: category.pointsPonderes === null ? null : Number(category.pointsPonderes.toFixed(6)),
      percent: category.pct === null ? null : Number(category.pct.toFixed(6))
    }));
    const criteria = collecterCriteresAudit();
    return {
      globalScore: Math.round(detail.total),
      rawScore: Number(detail.total.toFixed(6)),
      answeredCriteria: detail.repondus,
      totalCriteria: detail.totalCrit,
      evaluatedCategories: categories.filter(c => c.percent !== null).map(c => c.key),
      denominatorWeight: categories.filter(c => c.percent !== null).reduce((sum, c) => sum + c.profileWeight, 0),
      categories,
      indices: indicesProspect(),
      priorities: collecterPriorites(),
      projectedPack: scoreProjetePack(),
      criteriaStatusCounts: criteria.reduce((acc, item) => {
        acc.evaluation[item.evaluationStatus] = (acc.evaluation[item.evaluationStatus] || 0) + 1;
        acc.verification[item.verificationStatus] = (acc.verification[item.verificationStatus] || 0) + 1;
        return acc;
      }, { evaluation: {}, verification: {} }),
      payloadSummary: {
        scoreEfficia: construirePayloadAuditComplete().scoreEfficia,
        visibilityScore: construirePayloadAuditComplete().visibilityScore,
        trustScore: construirePayloadAuditComplete().trustScore,
        conversionScore: construirePayloadAuditComplete().conversionScore,
        sectorProfile: construirePayloadAuditComplete().sectorProfile,
        scoringVersion: construirePayloadAuditComplete().scoringVersion,
        criteriaCount: construirePayloadAuditComplete().criteria.length,
        metricsCount: construirePayloadAuditComplete().metrics.length,
        notEvaluatedNullPoints: construirePayloadAuditComplete().criteria
          .filter(item => item.evaluationStatus === "not_evaluated")
          .every(item => item.pointsAwarded === null && item.verificationStatus === "not_verified")
      }
    };
  }

  return {
    CONFIG,
    GRILLE,
    CRITERE_IDS,
    SCORING_VERSION,
    trouverCritere,
    lirePoints,
    calculScoreDetail,
    scoreCriteres,
    indicesProspect,
    statutEvaluationCritere,
    statutVerificationCritere,
    collecterCriteresAudit,
    selectionnerPrioritesDynamiques,
    collecterPriorites,
    scoreProjetePack,
    prioritePhotosPorteSurActualite,
    construirePayloadAuditComplete,
    snapshot
  };
}

export function loadFixture(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function fixtureDirectory() {
  return path.resolve(__dirname, "fixtures");
}
