// Régressions du renderer réellement capturé par telechargerPDF() pour le
// Diagnostic gratuit. Les fonctions sont extraites du fichier admin de
// production : aucun modèle narratif parallèle n'est reconstitué ici.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { GRILLE } from "../functions/lib/score-efficia/criteriaCatalog.js";

const source = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");

function between(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `bloc introuvable : ${start}`);
  return source.slice(from, to);
}

const narrativeSeedCode = between("function normaliserGraineNarrative(value){", "function buildPhotoContext(");

function createNarrativeHarness({ analysisId = "analysis-demo", enterprise = "Atelier Démo", data = {} } = {}) {
  const context = {
    Math,
    String,
    Array,
    document: { getElementById: (id) => id === "p-entreprise" ? { value: enterprise } : null },
    analysisIdDepuisUrl: () => analysisId,
    estTexte: (value) => typeof value === "string" && value.trim().length > 0,
    estNombre: (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)),
    nEntier: (value) => Math.round(Number(value)),
    donneesAnalyse: data,
    personaSecteur: () => "un prospect",
    rechercheNaturelleClient: () => "un artisan",
    nomCourtRapport: (value) => String(value || "").trim(),
    signauxActuelsPage1: () => [],
    joinFr: (items) => items.join(" et "),
    libelleRechercheRapport: (value) => String(value),
  };
  vm.runInNewContext(narrativeSeedCode, context);
  return context;
}

test("graine narrative : même fiche, même bloc et même branche donnent toujours le même texte", () => {
  const context = createNarrativeHarness({ analysisId: "3e9e8564-0c68-4e0c-9fea-a76c4c8babc9" });
  const variants = ["variante A", "variante B", "variante C", "variante D"];
  const first = context.choisirVarianteNarrative("priority.offer.title", "default", variants);
  for (let i = 0; i < 20; i += 1) {
    assert.equal(context.choisirVarianteNarrative("priority.offer.title", "default", variants), first);
  }
  assert.notEqual(
    context.choisirVarianteNarrative("priority.offer.title", "default", variants),
    context.choisirVarianteNarrative("priority.offer.action", "default", variants),
    "la graine inclut le bloc pour éviter une synchronisation artificielle",
  );
});

test("graine narrative : des entreprises de la même branche disposent de variantes réellement différentes", () => {
  const variants = ["variante A", "variante B", "variante C", "variante D"];
  const selected = new Set();
  for (let i = 0; i < 40; i += 1) {
    const context = createNarrativeHarness({ analysisId: "", enterprise: `Entreprise locale ${i}` });
    selected.add(context.choisirVarianteNarrative("priority.offer.title", "default", variants));
  }
  assert.ok(selected.size >= 3, `variantes obtenues : ${[...selected].join(", ")}`);
});

test("introduction réelle : salutation fiable, stabilité et absence de placeholders", () => {
  const context = createNarrativeHarness({
    analysisId: "bd8dca89-4f76-49b2-b783-d3a599d5a60d",
    enterprise: "Électricité Exemple",
    data: { position: 0, requeteTestee: null },
  });
  const build = (contact, score) => context.texteConsultantPage1({
    contact,
    entreprise: "Électricité Exemple",
    activite: "Électricien",
    ville: "Arlon",
    score,
    scoreProjete: score + 15,
    priorites: [{}, {}, {}],
  });
  const withoutContact = build("", 44);
  const withContact = build("Léa", 65);
  assert.equal(withoutContact, build("", 44), "un diagnostic régénéré conserve son introduction");
  assert.match(withoutContact, /^Bonjour,/u);
  assert.match(withContact, /^Bonjour Léa,/u);
  for (const text of [withoutContact, withContact, build("", 86)]) {
    assert.doesNotMatch(text, /\{(?:Prénom|Entreprise|Ville|Métier)\}|undefined|null/iu);
  }
});

test("toutes les variantes d’introduction laissent l’avertissement qualité au seul bloc gris", () => {
  const context = createNarrativeHarness({ enterprise: "VL ÉLEC" });
  const forbidden = /qualité (?:de votre travail|réelle de votre travail|de vos prestations)|savoir-faire|sans remettre en cause|ne porte pas de jugement|ne permettent pas de juger/iu;
  for (const score of [44, 65, 86]) {
    for (let index = 0; index < 3; index += 1) {
      context.choisirVarianteNarrative = (_blockId, _branch, variants) => variants[index];
      const text = context.texteConsultantPage1({
        contact: "",
        entreprise: "VL ÉLEC",
        activite: "Électricien",
        ville: "Bertrix",
        score,
        scoreProjete: score,
        priorites: [{}, {}, {}],
      });
      assert.doesNotMatch(text, forbidden, `${score}/${index}: ${text}`);
      assert.doesNotMatch(text, /\s{2,}|\.\s*\./u, `${score}/${index}: ponctuation invalide`);
    }
  }
  const scopeNote = "Ce score évalue uniquement la manière dont votre fiche Google présente et rassure aujourd'hui un client potentiel. Il ne juge ni la qualité de votre travail ni votre savoir-faire.";
  assert.equal(source.split(scopeNote).length - 1, 1, "l’avertissement gris demeure unique");
});

test("introduction VL ÉLEC : la variante concernée remplace la répétition par le manque de repères", () => {
  const context = createNarrativeHarness({ enterprise: "VL ÉLEC" });
  context.personaSecteur = () => "un client";
  context.signauxActuelsPage1 = () => ["une note de 1,0/5 basée sur un seul avis et peu de preuves visuelles"];
  context.choisirVarianteNarrative = (_blockId, _branch, variants) => variants[2];
  const text = context.texteConsultantPage1({
    contact: "",
    entreprise: "VL ÉLEC",
    activite: "Électricien",
    ville: "Bertrix",
    score: 44,
    scoreProjete: 44,
    priorites: [{}, {}, {}],
  });
  assert.equal(text, "Bonjour,<br>La présentation visible de VL ÉLEC ne permet pas encore à un nouveau prospect de comprendre et de vérifier l'essentiel avec confiance. Aujourd'hui, un client de Bertrix découvre une note de 1,0/5 basée sur un seul avis et peu de preuves visuelles. Ce manque de repères peut ralentir un premier contact. La situation n'est pas figée. Trois actions ciblées peuvent déjà rendre la fiche plus claire, plus rassurante et plus convaincante.");
});

test("Conversion : les contacts présents ne sont jamais décrits comme absents lorsque l’offre ou les liens d’action manquent", () => {
  const code = between("function conversionSousScoreEstIncomplet(d = donneesAnalyse){", "function indicesProspectHtml(){");
  const context = { estNombre: (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) };
  vm.runInNewContext(`${code}\nglobalThis.result=conversionSousScoreEstIncomplet;`, context);
  const business = {
    descriptionLongueur: 0,
    nbServices: 0,
    statutLiensAction: "available",
    liensAction: [],
    telephone: "+32 000 00 00 00",
    siteWeb: "https://example.test",
  };
  assert.equal(context.result(business), true);
  assert.match(source, /Description, services et liens d’action : plusieurs éléments permettant de comprendre l’offre et de faciliter la prise de contact sont absents ou non renseignés\./u);
  assert.doesNotMatch(source, /Description, services, liens de contact/u);
});

test("conclusion page 2 : une note de 1,0/5 utilise la formulation universelle", () => {
  const code = between("function phraseTransitionPage2(categoriesTriees){", "/* ============ PAGE 3 : CHECKLIST DES POINTS ANALYSÉS ============ */");
  const context = {};
  vm.runInNewContext(`${code}\nglobalThis.result=phraseTransitionPage2;`, context);
  const expected = "Votre score ne s’explique pas uniquement par un seul point. Plusieurs signaux incomplets s’ajoutent et rendent le choix moins évident pour un nouveau client.";
  assert.equal(context.result([{ pct: 0, cat: { cat: "Avis" } }]), expected);
  assert.equal(context.result([{ pct: 0, cat: { cat: "Avis" } }, { pct: 0, cat: { cat: "Contenu" } }]), expected);
  assert.doesNotMatch(source, /pas diminué par un seul défaut majeur/u);
});

test("moyenne d'avis : l'arrondi n'est qu'un affichage narratif et conserve les notes indépendantes", () => {
  const context = createNarrativeHarness();
  const rawAverage = 5.33;
  assert.equal(context.moyenneAvisAffichee(rawAverage), "environ 5 avis");
  assert.equal(rawAverage, 5.33, "la valeur exacte servant aux comparaisons n'est pas modifiée");
  assert.match(source, /fmtNote\(d\.note\).*\/5/u, "les notes Google restent rendues via leur formatteur dédié");
});

test("catalogue et score restent hors du correctif narratif : 29 critères", () => {
  assert.equal(GRILLE.flatMap((category) => category.criteres).length, 29);
  assert.doesNotMatch(source, /Math\.random\s*\(/u);
  assert.match(source, /function choisirVarianteNarrative\(/u);
});

test("CTA PDF : le renderer de production ajoute deux annotations cliquables aux coordonnées A4 des boutons", () => {
  const code = `${between("function isValidPaymentUrl(url)", "function couleurScore(score){")}\n${between("function ajouterLiensPdfPourPage(pdf, page){", "/* ================= AUDIT EFFICIA PREMIUM")}`;
  const context = { URL, globalThis: null };
  context.globalThis = context;
  vm.runInNewContext(`${code}\nglobalThis.addLinks=ajouterLiensPdfPourPage;`, context);
  const links = [];
  const page = {
    getBoundingClientRect: () => ({ left: 100, top: 200, width: 1000, height: 1400 }),
    querySelectorAll: () => [
      { getAttribute: () => "https://www.efficiadigital.com/achat?offre=audit", getBoundingClientRect: () => ({ left: 200, top: 900, width: 400, height: 80 }) },
      { getAttribute: () => "https://www.efficiadigital.com/achat?offre=visibility", getBoundingClientRect: () => ({ left: 600, top: 1080, width: 400, height: 80 }) },
    ],
  };
  context.addLinks({ link: (...args) => links.push(args) }, page);
  assert.deepEqual(JSON.parse(JSON.stringify(links)), [
    [21, 148.5, 84, 16.97142857142857, { url: "https://www.efficiadigital.com/achat?offre=audit" }],
    [105, 186.68571428571428, 84, 16.97142857142857, { url: "https://www.efficiadigital.com/achat?offre=visibility" }],
  ]);
});
