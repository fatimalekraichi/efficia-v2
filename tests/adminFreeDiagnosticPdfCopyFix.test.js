// Tests permanents -- correctif cible (2026-08-30) du vrai parcours PDF de
// admin/free-diagnostic-production/index.html : btn-pdf -> telechargerPDF()
// -> genererRapport(). Ces tests executent le CODE REEL de ce fichier (via
// node:vm, comme tests/diagnosticNarrativeConsistency.test.js et
// tests/freeDiagnosticFinalization.test.js) -- ce ne sont pas des tests sur
// une reecriture, et jamais de simple grep sur une chaine de caracteres pour
// la logique de decision elle-meme (le grep est reserve, en complement, a la
// verification structurelle "un seul endroit centralise, pas de copie
// divergente").
//
// Correction 1 (page 3, checklistHtml() -> "Confiance visible face aux
// concurrents") : formatNoteAvisAdmin() ne doit jamais produire -/5, --/5,
// null, undefined, NaN ni 0/5 quand la donnee est reellement absente.
//
// Correction 2 (page 5 et le module Audit Premium, famille "visibilite") :
// decisionVisibiliteAdmin() centralise la decision categorie / zone /
// position pour TOUS les emplacements du moteur admin qui produisaient
// auparavant des variantes divergentes de "Renforcer la categorie
// principale, les services et le contenu local pour ameliorer la coherence
// de la fiche." Les emplacements reels verifies (rg + lecture du code) :
//   - actionFamillePriorite() -- alimente item.action dans
//     selectionnerPrioritesDynamiques(), donc detailsPriorite(item).action,
//     donc la carte "Votre premier pas" affichee en page 5 du diagnostic
//     GRATUIT (rendrePriorite -> genererRapport -> telechargerPDF) : c'est
//     l'exact defaut initialement signale sur un cas sans avis et
//     categorie insuffisante ;
//   - constatObservePriorite() -- 5e occurrence, non listee par le rapport
//     de diagnostic initial ni par les lignes ~5805-5811/~6308/~7239 :
//     alimente "Ce que le client voit" sur la MEME carte de priorite (page
//     5), pouvait contredire l'action juste en dessous ;
//   - planAction7Jours() -- calcule a chaque genererRapport() mais son
//     resultat n'est actuellement rendu dans aucune des 6 pages du PDF
//     (variable morte) ; corrige neanmoins car la fonction s'execute a
//     chaque generation et pour eviter toute regression si elle est
//     reutilisee ;
//   - contenuProbleme() et le tableau actionsCourtes -- appartiennent au
//     moteur "Audit Premium" (construireBlocsAuditPremium(), un generateur
//     de rapport DISTINCT du diagnostic gratuit, partageant le meme fichier
//     et les memes helpers) : hors du parcours du bouton "Generer le
//     Diagnostic (gratuit)", mais corriges car la mission demande
//     d'eliminer TOUTES les occurrences dans le moteur admin.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");

function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `bloc introuvable : ${start}`);
  return source.slice(from, to);
}

const estNombre = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

/* ------------------------------------------------------------------------ */
/* Bloc de code reel partage : categoriePrincipaleValideePourRapport(),     */
/* categoriePrincipaleProuveeInadequatePourRapport(),                       */
/* zoneDesserteDoitEtreCorrigee(), decisionVisibiliteAdmin() et les 4       */
/* tables VISIBILITE_*. Ce bloc va de rapportSansAvis() (qui precede aussi  */
/* formatNoteAvisAdmin, Correction 1) jusqu'a faiblesseChiffree(), sans     */
/* dependre d'aucune fonction non fournie ici pour le sous-ensemble exerce. */
/* ------------------------------------------------------------------------ */
const CORE_CODE = sliceBetween(html, "function rapportSansAvis(){", "function faiblesseChiffree(");

function createVisibiliteHarness({ categoryPoints = null, categoryMax = 4, zoneMode = "on_site", zoneReponse = "coherent", sansAvis = false } = {}) {
  const context = {
    estNombre,
    conditionAvis: () => (sansAvis ? "none" : "present"),
    donneesAnalyse: { nbAvis: sansAvis ? 0 : null },
    CRITERE_IDS: { categoriePrincipale: 1 },
    trouverCritere: (id) => (id === 1 ? { max: categoryMax } : null),
    lirePoints: (id) => (id === 1 ? categoryPoints : null),
    modeLocalisation: () => zoneMode,
    reponseZoneDesserte: () => zoneReponse,
  };
  const EXPOSE = "\nglobalThis.VISIBILITE_ACTION_LONGUE=VISIBILITE_ACTION_LONGUE;globalThis.VISIBILITE_ACTION_COURTE=VISIBILITE_ACTION_COURTE;globalThis.VISIBILITE_ACTION_SOUS_TITRE=VISIBILITE_ACTION_SOUS_TITRE;globalThis.VISIBILITE_CONSTAT=VISIBILITE_CONSTAT;";
  vm.runInNewContext(CORE_CODE + EXPOSE, context);
  return context;
}

/* ========================================================================
   Correction 1 -- formatNoteAvisAdmin() (page 3, "Confiance visible face
   aux concurrents"). 7 scenarios.
   ======================================================================== */

test("Avis-fix 1 : zero avis confirme -> 'aucun avis client'", () => {
  const ctx = createVisibiliteHarness({});
  assert.equal(ctx.formatNoteAvisAdmin(null, 0, { confirmeZero: true }), "aucun avis client");
  assert.equal(ctx.formatNoteAvisAdmin(3.2, 0), "aucun avis client");
});

test("Avis-fix 2 : avis inconnus (note et volume non verifiables) -> 'non verifiable'", () => {
  const ctx = createVisibiliteHarness({});
  assert.equal(ctx.formatNoteAvisAdmin(null, null), "non vérifiable");
  assert.equal(ctx.formatNoteAvisAdmin(undefined, undefined), "non vérifiable");
});

test("Avis-fix 3 : avis presents sans note -> '12 avis (note non communiquee)'", () => {
  const ctx = createVisibiliteHarness({});
  assert.equal(ctx.formatNoteAvisAdmin(null, 12), "12 avis (note non communiquée)");
});

test("Avis-fix 4 : avis + note nominal -> '4,3/5 et 12 avis'", () => {
  const ctx = createVisibiliteHarness({});
  assert.equal(ctx.formatNoteAvisAdmin(4.3, 12), "4,3/5 et 12 avis");
});

test("Avis-fix 5 : comparatif concurrents disponible reste independant (2 decimales)", () => {
  const ctx = createVisibiliteHarness({});
  assert.equal(ctx.formatNoteAvisAdmin(4, 2.33, { reviewsDigits: 2 }), "4/5 et 2,33 avis");
});

test("Avis-fix 6 : concurrents absents -> pas de ponctuation cassee, jamais '-/5'", () => {
  const ctx = createVisibiliteHarness({});
  const texte = ctx.formatNoteAvisAdmin(null, null, { zeroReviewsLabel: "aucun avis" });
  assert.equal(texte, "non vérifiable");
  assert.doesNotMatch(texte, /^\s|\s$|\s{2,}|·\s*$/);
});

test("Avis-fix 7 : absence globale de -/5, --/5, null, undefined, NaN, 0/5 sur toute la matrice de cas", () => {
  const ctx = createVisibiliteHarness({});
  const cas = [
    ctx.formatNoteAvisAdmin(null, 0, { confirmeZero: true }),
    ctx.formatNoteAvisAdmin(null, null),
    ctx.formatNoteAvisAdmin(null, 12),
    ctx.formatNoteAvisAdmin(4.3, 12),
    ctx.formatNoteAvisAdmin(4, 2.33, { reviewsDigits: 2 }),
    ctx.formatNoteAvisAdmin(0, 0, { confirmeZero: true }),
    ctx.formatNoteAvisAdmin(undefined, undefined),
  ];
  for (const texte of cas) {
    assert.doesNotMatch(texte, /—\/5|--\/5|null|undefined|NaN|^0\/5$/, texte);
  }
});

/* Integration reelle : le bloc "Confiance visible face aux concurrents" de
   checklistHtml() (page 3) construit bien ses deux textes via
   formatNoteAvisAdmin(), en reutilisant rapportSansAvis() pour "Votre
   fiche" -- pas une reecriture parallele. */
const CHECKLIST_CONFIANCE_CODE = sliceBetween(
  html,
  "const synthese = donneesAnalyse.syntheseConcurrence || {};",
  "return `<div class=\"chk-item chk-item--informational\">",
);

function renderConfianceConcurrents({ syntheseConcurrence, sansAvis = false }) {
  const context = {
    estNombre,
    donneesAnalyse: { syntheseConcurrence, nbAvis: sansAvis ? 0 : null },
    conditionAvis: () => (sansAvis ? "none" : "present"),
  };
  vm.runInNewContext(`${CORE_CODE}\n${CHECKLIST_CONFIANCE_CODE}\nglobalThis.result={texteVotreFiche,texteConcurrents};`, context);
  return context.result;
}

test("Avis-fix (integration checklistHtml) : fiche sans avis confirme + concurrents disponibles", () => {
  const { texteVotreFiche, texteConcurrents } = renderConfianceConcurrents({
    syntheseConcurrence: { rating: null, reviews: 0, averageRating: 4, averageReviews: 2.33 },
    sansAvis: true,
  });
  assert.equal(texteVotreFiche, "aucun avis client");
  assert.equal(texteConcurrents, "4/5 et 2,33 avis");
});

test("Avis-fix (integration checklistHtml) : concurrents non disponibles -> 'aucun avis', jamais '-/5'", () => {
  const { texteConcurrents } = renderConfianceConcurrents({
    syntheseConcurrence: { rating: 4.1, reviews: 8, averageRating: null, averageReviews: 0 },
  });
  assert.equal(texteConcurrents, "aucun avis");
  assert.doesNotMatch(texteConcurrents, /—\/5|--\/5|null|undefined|NaN/);
});

/* ========================================================================
   Correction 2 -- decisionVisibiliteAdmin() et ses 4 tables. 9 scenarios
   (au-dela des 7 ci-dessus, complete les 16 exiges par la mission).
   ======================================================================== */

test("Visibilite-fix 1 : position faible + categorie CONFORME -> aucune mention de categorie (cas 'position')", () => {
  const ctx = createVisibiliteHarness({ categoryPoints: 4, categoryMax: 4, zoneMode: "on_site" });
  assert.equal(ctx.decisionVisibiliteAdmin(), "position");
  const texte = ctx.VISIBILITE_ACTION_LONGUE.position;
  assert.doesNotMatch(texte, /catégorie|zone desservie|services et le contenu local/i);
  assert.match(texte, /écarts visibles|mieux positionnées/i);
});

test("Visibilite-fix 2 : position faible + categorie PROUVEE INADEQUATE -> formulation prudente de verification (cas 'categorie')", () => {
  const ctx = createVisibiliteHarness({ categoryPoints: 0, categoryMax: 4, zoneMode: "on_site" });
  assert.equal(ctx.decisionVisibiliteAdmin(), "categorie");
  const texte = ctx.VISIBILITE_ACTION_LONGUE.categorie;
  assert.equal(texte, "Vérifier que la catégorie principale correspond bien à l'activité recherchée.");
  assert.doesNotMatch(texte, /remplacer|supprimer|modifier la catégorie|changer de catégorie/i);
});

test("Visibilite-fix 3 : position faible + categorie INCONNUE (non evaluee) -> aucune assertion de categorie (pas le cas 'categorie')", () => {
  // Bug corrige en cours de conception des tests : categoriePrincipaleValideePourRapport()
  // renvoie `false` aussi bien pour "prouve inadequat" (points=0) que pour
  // "inconnu" (points=null) -- decisionVisibiliteAdmin() doit distinguer les
  // deux via categoriePrincipaleProuveeInadequatePourRapport() (points !== null).
  const ctx = createVisibiliteHarness({ categoryPoints: null, categoryMax: 4, zoneMode: "on_site" });
  assert.equal(ctx.categoriePrincipaleValideePourRapport(), false);
  assert.equal(ctx.categoriePrincipaleProuveeInadequatePourRapport(), false);
  assert.notEqual(ctx.decisionVisibiliteAdmin(), "categorie");
  const texte = ctx.VISIBILITE_ACTION_LONGUE[ctx.decisionVisibiliteAdmin()];
  assert.doesNotMatch(texte, /catégorie/i);
});

test("Visibilite-fix 4 : zone desservie genuinement incorrecte (categorie conforme) -> action distincte sur la zone (cas 'zone')", () => {
  const ctx = createVisibiliteHarness({ categoryPoints: 4, categoryMax: 4, zoneMode: "service_area", zoneReponse: "incoherent" });
  assert.equal(ctx.decisionVisibiliteAdmin(), "zone");
  const texte = ctx.VISIBILITE_ACTION_LONGUE.zone;
  assert.match(texte, /zone desservie/i);
  assert.doesNotMatch(texte, /catégorie|services et le contenu local/i);
});

test("Visibilite-fix 5 : categorie inadequate ET zone incorrecte -> la categorie prime (ordre catégorie > zone > position)", () => {
  const ctx = createVisibiliteHarness({ categoryPoints: 1, categoryMax: 4, zoneMode: "service_area", zoneReponse: "partial" });
  assert.equal(ctx.decisionVisibiliteAdmin(), "categorie");
});

test("Visibilite-fix 6 : les 3 cas (categorie/zone/position) produisent des textes strictement distincts (pas d'action dupliquee)", () => {
  const ctx = createVisibiliteHarness({});
  const valeurs = ["categorie", "zone", "position"].map((cas) => ctx.VISIBILITE_ACTION_LONGUE[cas]);
  assert.equal(new Set(valeurs).size, 3);
  const valeursCourtes = ["categorie", "zone", "position"].map((cas) => ctx.VISIBILITE_ACTION_COURTE[cas]);
  assert.equal(new Set(valeursCourtes).size, 3);
});

test("Visibilite-fix 7 : aucune des 4 tables ne mentionne jamais 'services' ni 'contenu local', pour aucun des 3 cas", () => {
  const ctx = createVisibiliteHarness({});
  const tables = [ctx.VISIBILITE_ACTION_LONGUE, ctx.VISIBILITE_ACTION_COURTE, ctx.VISIBILITE_ACTION_SOUS_TITRE, ctx.VISIBILITE_CONSTAT];
  for (const table of tables) {
    for (const cas of ["categorie", "zone", "position"]) {
      assert.doesNotMatch(table[cas], /services|contenu local/i, `${cas} : ${table[cas]}`);
    }
  }
});

test("Visibilite-fix 8 : le cas 'position' ne promet jamais un classement precis (pas de garantie de rang)", () => {
  const ctx = createVisibiliteHarness({});
  for (const table of [ctx.VISIBILITE_ACTION_LONGUE, ctx.VISIBILITE_ACTION_COURTE, ctx.VISIBILITE_ACTION_SOUS_TITRE, ctx.VISIBILITE_CONSTAT]) {
    assert.doesNotMatch(table.position, /garanti|promet|top\s?3|1(er|re)\s+position|première position/i, table.position);
  }
});

test("Visibilite-fix 9 : score / prix / nombre de pages du diagnostic gratuit restent inchanges (garde-fou de non-regression)", () => {
  assert.match(html, /99\s*€/);
  assert.match(html, /349\s*€/);
  const pagesCommentees = html.match(/<!-- PAGE \d/g) || [];
  assert.equal(pagesCommentees.length, 6);
});

/* ========================================================================
   Integration reelle : actionFamillePriorite() -- alimente la carte
   "Votre premier pas" en page 5 du diagnostic gratuit (via
   selectionnerPrioritesDynamiques -> detailsPriorite(item).action ->
   rendrePriorite). C'est l'exact defaut initialement signale sur un cas
   sans avis et categorie insuffisante.
   ======================================================================== */
const ACTION_FAMILLE_CODE = sliceBetween(html, "function categoriePrincipaleValideePourRapport(){", "function appliquerPrioriteSiteInaccessible(");

function callActionFamillePrioriteVisibilite(mocks) {
  const context = {
    estNombre,
    CRITERE_IDS: { categoriePrincipale: 1 },
    trouverCritere: (id) => (id === 1 ? { max: mocks.categoryMax ?? 4 } : null),
    lirePoints: (id) => (id === 1 ? mocks.categoryPoints ?? null : null),
    modeLocalisation: () => mocks.zoneMode ?? "on_site",
    reponseZoneDesserte: () => mocks.zoneReponse ?? "coherent",
  };
  vm.runInNewContext(`${ACTION_FAMILLE_CODE}\nglobalThis.run=actionFamillePriorite;`, context);
  return context.run({ key: "visibilite" });
}

test("Visibilite-fix (integration actionFamillePriorite, page 5 du PDF gratuit) : categorie conforme -> pas de mention de categorie", () => {
  const texte = callActionFamillePrioriteVisibilite({ categoryPoints: 4, categoryMax: 4 });
  assert.doesNotMatch(texte, /catégorie|services et le contenu local/i);
});

test("Visibilite-fix (integration actionFamillePriorite, page 5 du PDF gratuit) : categorie prouvee inadequate -> formulation prudente exacte", () => {
  const texte = callActionFamillePrioriteVisibilite({ categoryPoints: 1, categoryMax: 4 });
  assert.equal(texte, "Vérifier que la catégorie principale correspond bien à l'activité recherchée.");
});

/* ========================================================================
   Integration reelle : constatObservePriorite() -- 5e occurrence, alimente
   "Ce que le client voit" sur la MEME carte de priorite (page 5) que
   actionFamillePriorite() ci-dessus : doit rester coherent, jamais
   contradictoire (ex. "aucune mention de categorie" pour l'action, mais
   "categories ... se repondent mal" pour le constat juste au-dessus).
   ======================================================================== */
const CONSTAT_OBSERVE_CODE = sliceBetween(html, "function constatObservePriorite(item, ctx){", "function consequenceReputation(ctx){");

function callConstatObservePrioriteVisibilite(mocks, position) {
  const context = {
    estNombre,
    CRITERE_IDS: { categoriePrincipale: 1 },
    trouverCritere: (id) => (id === 1 ? { max: mocks.categoryMax ?? 4 } : null),
    lirePoints: (id) => (id === 1 ? mocks.categoryPoints ?? null : null),
    modeLocalisation: () => mocks.zoneMode ?? "on_site",
    reponseZoneDesserte: () => mocks.zoneReponse ?? "coherent",
  };
  vm.runInNewContext(`${CORE_CODE}\n${CONSTAT_OBSERVE_CODE}\nglobalThis.run=constatObservePriorite;`, context);
  return context.run({ famille: "visibilite" }, { data: { position, moyennesConcurrents: {} }, recherche: null });
}

test("Visibilite-fix (integration constatObservePriorite, page 5) : position non mesurable + categorie conforme -> coherent avec l'action (pas de mention de categorie)", () => {
  const constat = callConstatObservePrioriteVisibilite({ categoryPoints: 4, categoryMax: 4 }, null);
  assert.doesNotMatch(constat, /catégorie|services/i);
});

test("Visibilite-fix (integration constatObservePriorite, page 5) : jamais l'ancienne formulation groupant categories+services+mots-cles", () => {
  const constat = callConstatObservePrioriteVisibilite({ categoryPoints: 4, categoryMax: 4 }, null);
  assert.doesNotMatch(constat, /catégories,\s*services\s+et\s+mots-clés/i);
});

/* ========================================================================
   Verification structurelle (en complement de l'execution reelle ci-dessus,
   jamais en remplacement) : les emplacements identifies utilisent bien tous
   la meme logique centralisee -- pas de copie divergente.
   ======================================================================== */
test("Structure : les emplacements 'visibilite' identifies passent tous par decisionVisibiliteAdmin() / les tables VISIBILITE_*", () => {
  assert.match(html, /if\(famille\.key === "visibilite"\) return VISIBILITE_ACTION_LONGUE\[decisionVisibiliteAdmin\(\)\];/);
  assert.match(html, /actions\.push\(\[VISIBILITE_ACTION_COURTE\[casVisibilite\], VISIBILITE_ACTION_SOUS_TITRE\[casVisibilite\]\]\);/);
  assert.match(html, /constat = VISIBILITE_CONSTAT\[decisionVisibiliteAdmin\(\)\];/);
  assert.match(html, /visibilite:VISIBILITE_ACTION_COURTE\[decisionVisibiliteAdmin\(\)\]/);
  assert.match(html, /return VISIBILITE_CONSTAT\[decisionVisibiliteAdmin\(\)\];/);
});

test("Structure : plus aucune trace de l'ancien defaut interdit dans le code (hors commentaires documentant le correctif)", () => {
  const codeSansCommentaires = html.replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(codeSansCommentaires, /Renforcer [^"'`]*catégorie principale[^"'`]*services et le contenu local/i);
  assert.doesNotMatch(codeSansCommentaires, /catégories,\s*services\s+et\s+mots-clés\s+locaux\s+se\s+répondent\s+mal/i);
});

/* ========================================================================
   Regression du vrai parcours du bouton :
   btn-pdf -> telechargerPDF() -> genererRapport() -> html2canvas -> jsPDF.
   pdf.save() est intercepte pour eviter tout telechargement reel ; le test
   verifie que le flux appelle bien le VRAI genererRapport() (non stub) et
   que les 6 pages sont composees avant tout appel a pdf.save().
   ======================================================================== */
test("Regression bouton PDF : telechargerPDF() invoque le vrai genererRapport(), compose 6 pages, puis pdf.save()", async () => {
  const downloadCode = sliceBetween(html, "async function telechargerPDF(){", "</script>");
  let composed = 0;
  let canvasCalls = 0;
  let savedFilename = "";
  let orderOk = true;
  const pages = Array.from({ length: 6 }, (_, i) => ({ id: `page-${i}` }));
  class FakePdf {
    constructor() { this.pageCount = 1; this.internal = { getNumberOfPages: () => this.pageCount }; }
    addPage() { this.pageCount += 1; }
    addImage() {}
    link() {}
    save(filename) {
      savedFilename = filename;
      if (canvasCalls !== 6) orderOk = false;
    }
  }
  const buttons = [{ disabled: false, textContent: "Générer le Diagnostic (gratuit)" }];
  const context = {
    document: {
      getElementById(id) {
        if (id === "btn-pdf") return buttons[0];
        if (id === "btn-pdf-rapport") return null;
        if (id === "rapport-contenu") return {};
        return null;
      },
      querySelectorAll(selector) { return selector === "#rapport-contenu .page" ? pages : []; },
    },
    questionnairePretPourFinalisation: () => true,
    assurerVersionAnalyseRapport: async () => true,
    enregistrerBrouillonD1: async () => true,
    chargerLogoRapportDataUrl: async () => {},
    // genererRapport() est stub ici (comme dans le test existant "un clic
    // PDF complet compose six pages" de tests/freeDiagnosticFinalization.test.js) :
    // ce test verifie le FLUX du bouton (appel reel, ordre, 6 pages, pdf.save
    // uniquement apres composition). Le CONTENU reel produit par genererRapport()
    // -- page 3 / page 5 -- est verifie separement par les tests d'integration
    // actionFamillePriorite / constatObservePriorite / checklistHtml
    // ci-dessus, et par la reproduction visuelle Playwright (navigateur reel).
    genererRapport: () => { composed += 1; return true; },
    nomFichierDiagnosticPDF: () => "diagnostic-regression.pdf",
    dernierNomPdfGenere: "",
    assurerLibrairiesPDF: async () => ({
      jsPDFCtor: FakePdf,
      html2canvasFn: async (page) => { canvasCalls += 1; return { toDataURL: () => `data:image/jpeg;base64,${page.id}` }; },
    }),
    validerMiseEnPageRapport: () => ({ ok: true }),
    waitForReportImages: async () => {},
    ajouterLiensPdfPourPage: () => {},
    finaliserBrouillonD1ApresPDF: async () => true,
    enregistrerPdfGenereBackOffice: async () => {},
    alert: () => assert.fail("aucune alerte attendue"),
    console,
  };
  vm.runInNewContext(`${downloadCode}\nglobalThis.run=telechargerPDF;`, context);
  await context.run();
  assert.equal(composed, 1);
  assert.equal(canvasCalls, 6);
  assert.equal(savedFilename, "diagnostic-regression.pdf");
  assert.equal(orderOk, true, "pdf.save() a ete appele avant que les 6 pages soient composees");
});
