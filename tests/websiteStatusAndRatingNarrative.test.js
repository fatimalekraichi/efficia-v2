// Tests permanents — corrige les deux contradictions factuelles révélées par
// le premier diagnostic réel Morgan-Entreprise (2026-08-27) :
//   1. "3,3/5 reste nettement inférieure à 3,0/5" alors que 3,3 > 3,0 ;
//   2. "Téléphone et site web" conforme / "aucun site officiel identifiable" /
//      "aucun site web officiel disponible" affichés simultanément alors
//      qu'un site officiel est bien renseigné (morgan-entreprise.eu).
//
// Ces tests exécutent le code réel de admin/free-diagnostic-production/index.html
// (extrait via node:vm, comme tests/scoreEfficiaV5.test.js et
// tests/draftControls.test.js) : ce ne sont pas des tests sur une réécriture,
// mais sur les fonctions qui produisent effectivement le PDF gratuit.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `bloc introuvable : ${start}`);
  return source.slice(startIndex, endIndex);
}

/* ---------------------------------------------------------------------- */
/* 1) Comparaison "note propre / moyenne concurrentielle" (constatObservePriorite) */
/* ---------------------------------------------------------------------- */

function createRatingHarness() {
  const code = sliceBetween(html, "function positionNoteFaceConcurrence(", "function consequenceBusinessPriorite(");
  const context = {
    CONFIG: { seuils: { toleranceConcurrents: 0.10 } },
    estNombre: (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)),
    fmtNote: (n) => Number(n).toFixed(1).replace(".", ","),
    nEntier: (v) => Math.round(Number(v)),
    rapportSansAvis: () => false,
  };
  vm.runInNewContext(code, context);
  return context;
}

function reputationConstat({ note, nbAvis, noteC }) {
  const context = createRatingHarness();
  const item = { famille: "reputation" };
  const ctx = { data: { note, nbAvis, moyennesConcurrents: { note: noteC } } };
  return context.constatObservePriorite(item, ctx);
}

test("positionNoteFaceConcurrence : note propre supérieure => jamais 'inférieure'", () => {
  const context = createRatingHarness();
  assert.equal(context.positionNoteFaceConcurrence(3.3, 3.0), "superieure");
});

test("positionNoteFaceConcurrence : note propre nettement inférieure (hors tolérance)", () => {
  const context = createRatingHarness();
  assert.equal(context.positionNoteFaceConcurrence(2.0, 3.0), "inferieure");
});

test("positionNoteFaceConcurrence : note propre inférieure mais dans la tolérance métier => comparable", () => {
  const context = createRatingHarness();
  // 2,8 / 3,0 = 0.933 > 0.90 (tolérance 10 %) : ne doit pas être qualifiée "d'inférieure".
  assert.equal(context.positionNoteFaceConcurrence(2.8, 3.0), "comparable");
});

test("positionNoteFaceConcurrence : notes égales => comparable", () => {
  const context = createRatingHarness();
  assert.equal(context.positionNoteFaceConcurrence(3.0, 3.0), "comparable");
});

test("cas Morgan (3,3 vs 3,0) : phrase exacte, jamais 'inférieure', avantage relatif conservé", () => {
  const texte = reputationConstat({ note: 3.3, nbAvis: 10, noteC: 3.0 });
  assert.equal(
    texte,
    "Votre note de 3,3/5 est légèrement supérieure à la moyenne des concurrents observés, mais elle reste sous le niveau qui rassure généralement un nouveau client.",
  );
  assert.doesNotMatch(texte, /inférieure/);
});

test("note supérieure à la concurrence mais faible en valeur absolue (cas générique, pas seulement Morgan)", () => {
  const texte = reputationConstat({ note: 3.9, nbAvis: 12, noteC: 3.5 });
  assert.equal(
    texte,
    "Votre note de 3,9/5 est légèrement supérieure à la moyenne des concurrents observés, mais elle reste sous le niveau qui rassure généralement un nouveau client.",
  );
});

test("note propre nettement inférieure : la phrase 'inférieure' reste disponible et correcte", () => {
  const texte = reputationConstat({ note: 2.0, nbAvis: 10, noteC: 3.0 });
  assert.equal(
    texte,
    "Votre fiche dispose de 10 avis. En revanche, votre note de 2,0/5 reste nettement inférieure à la moyenne concurrentielle observée de 3,0/5.",
  );
});

test("note propre comparable (légèrement sous la moyenne, dans la tolérance)", () => {
  const texte = reputationConstat({ note: 2.8, nbAvis: 10, noteC: 3.0 });
  assert.equal(
    texte,
    "Votre note de 2,8/5 est comparable à la moyenne des concurrents observés (3,0/5), mais elle reste sous le niveau qui rassure généralement un nouveau client.",
  );
});

/* ---------------------------------------------------------------------- */
/* 2) Existence / accessibilité du site officiel                          */
/* ---------------------------------------------------------------------- */

function createSiteStateHarness({ url = "", etat = "", codeHttp = "", napRadioSpecial = null } = {}) {
  const code = sliceBetween(html, "function napRadioAucunSite(){", "function signauxActuelsPage1(");
  const fields = {
    "d-site-url": { value: url },
    "d-site-etat": { value: etat },
    "d-site-code": { value: codeHttp },
  };
  const napRadio = napRadioSpecial ? { dataset: { special: napRadioSpecial } } : null;
  const context = {
    CRITERE_IDS: { nap: 7 },
    document: {
      getElementById: (id) => fields[id] || null,
      querySelector: () => napRadio,
    },
  };
  vm.runInNewContext(code, context);
  return context;
}

test("aucune URL, réponse explicite 'Aucun site renseigné' => aucun site officiel", () => {
  const context = createSiteStateHarness({ etat: "aucun" });
  const etat = context.etatSiteOfficielCourant();
  assert.equal(etat.etat, "aucun");
  assert.equal(etat.url, "");
  assert.equal(context.messageEtatSiteOfficiel(etat), "Aucun site officiel n’est renseigné sur la fiche Google.");
  assert.equal(context.siteOfficielAbsent(), true);
});

test("URL présente, état non précisé => cohérence à confirmer (jamais 'aucun site officiel')", () => {
  const context = createSiteStateHarness({ url: "https://morgan-entreprise.eu", etat: "" });
  const etat = context.etatSiteOfficielCourant();
  assert.equal(etat.etat, "a_confirmer");
  const message = context.messageEtatSiteOfficiel(etat);
  assert.equal(message, "Un site officiel est renseigné, mais sa cohérence avec la fiche reste à confirmer.");
  assert.doesNotMatch(message, /[Aa]ucun site/);
  assert.equal(context.siteOfficielAbsent(), false);
});

test("URL présente et accessible => pas de message spécial, NAP évaluée normalement", () => {
  const context = createSiteStateHarness({ url: "https://morgan-entreprise.eu", etat: "accessible" });
  const etat = context.etatSiteOfficielCourant();
  assert.equal(etat.etat, "accessible");
  assert.equal(context.messageEtatSiteOfficiel(etat), null);
});

test("URL présente et inaccessible, sans code HTTP saisi => aucun code inventé", () => {
  const context = createSiteStateHarness({ url: "https://morgan-entreprise.eu", etat: "inaccessible" });
  const etat = context.etatSiteOfficielCourant();
  const message = context.messageEtatSiteOfficiel(etat);
  assert.equal(message, "Un site officiel est bien associé à l’entreprise, mais il était inaccessible lors de notre contrôle.");
  assert.doesNotMatch(message, /\d{3}/);
});

test("URL présente et inaccessible avec code HTTP 500 saisi => code repris tel quel", () => {
  const context = createSiteStateHarness({ url: "https://morgan-entreprise.eu", etat: "inaccessible", codeHttp: "500" });
  const etat = context.etatSiteOfficielCourant();
  assert.equal(
    context.messageEtatSiteOfficiel(etat),
    "Le site officiel était inaccessible lors de notre contrôle et renvoyait une erreur serveur 500.",
  );
});

test("analyse ancienne (pas de nouveau contrôle rempli), critère NAP répondu normalement => comportement historique inchangé", () => {
  const context = createSiteStateHarness({}); // aucune valeur, comme un ancien enregistrement
  assert.equal(context.etatSiteOfficielCourant(), null);
  assert.equal(context.messageEtatSiteOfficiel(null), null);
  assert.equal(context.siteOfficielAbsent(), false);
});

test("analyse ancienne où le critère NAP était répondu 'Aucun site web disponible' => rétro-compatible, toujours 'aucun site'", () => {
  const context = createSiteStateHarness({ napRadioSpecial: "no_website" });
  const etat = context.etatSiteOfficielCourant();
  assert.equal(etat.etat, "aucun");
  assert.equal(etat.url, "");
  assert.equal(context.siteOfficielAbsent(), true);
});

test("cas Morgan exact : URL connue + état inaccessible + code 500 => jamais 'aucun site officiel'", () => {
  const context = createSiteStateHarness({ url: "https://morgan-entreprise.eu", etat: "inaccessible", codeHttp: "500" });
  const etat = context.etatSiteOfficielCourant();
  const message = context.messageEtatSiteOfficiel(etat);
  assert.doesNotMatch(message, /[Aa]ucun site/);
  assert.match(message, /500/);
  assert.equal(context.siteOfficielAbsent(), false);
});

/* ---------------------------------------------------------------------- */
/* 3) Priorité "Remettre le site officiel en ligne"                       */
/* ---------------------------------------------------------------------- */

function createPriorityHarness() {
  const code = sliceBetween(html, "function appliquerPrioriteSiteInaccessible(", "function selectionnerPrioritesDynamiques(");
  const context = {};
  vm.runInNewContext(code, context);
  return context;
}

test("site inaccessible => priorité n°1 'site_officiel', photos exclues du top 3", () => {
  const context = createPriorityHarness();
  const top3p = [
    { famille: "reputation", critere: { key: "noteMoyenne" } },
    { famille: "photos", critere: { key: "nombrePhotos" } },
    { famille: "offre", critere: { key: "servicesPresents" } },
  ];
  const resultat = context.appliquerPrioriteSiteInaccessible(top3p, { etat: "inaccessible" });
  assert.equal(resultat.length, 3);
  assert.equal(resultat[0].famille, "site_officiel");
  assert.ok(!resultat.some((item) => item.famille === "photos"), "les photos ne doivent pas faire partie du top 3");
  assert.equal([resultat[1].famille, resultat[2].famille].join(","), "reputation,offre");
});

test("cas Morgan exact : ordre final réputation puis offre, site en tête", () => {
  const context = createPriorityHarness();
  const top3p = [
    { famille: "reputation", critere: { key: "noteMoyenne" } },
    { famille: "offre", critere: { key: "servicesPresents" } },
    { famille: "photos", critere: { key: "nombrePhotos" } },
  ];
  const resultat = context.appliquerPrioriteSiteInaccessible(top3p, { etat: "inaccessible" });
  assert.equal([resultat[0].famille, resultat[1].famille, resultat[2].famille].join(","), "site_officiel,reputation,offre");
});

test("site accessible ou à confirmer => aucune priorité injectée (no-op)", () => {
  const context = createPriorityHarness();
  const top3p = [{ famille: "reputation" }, { famille: "photos" }, { famille: "offre" }];
  assert.deepEqual(context.appliquerPrioriteSiteInaccessible(top3p, { etat: "accessible" }), top3p);
  assert.deepEqual(context.appliquerPrioriteSiteInaccessible(top3p, { etat: "a_confirmer" }), top3p);
  assert.deepEqual(context.appliquerPrioriteSiteInaccessible(top3p, null), top3p);
});

test("absence de doublon : une priorité 'site_officiel' déjà présente n'est jamais dupliquée", () => {
  const context = createPriorityHarness();
  const top3p = [
    { famille: "site_officiel", critere: null },
    { famille: "reputation", critere: { key: "noteMoyenne" } },
    { famille: "offre", critere: { key: "servicesPresents" } },
  ];
  const resultat = context.appliquerPrioriteSiteInaccessible(top3p, { etat: "inaccessible" });
  assert.equal(resultat.filter((item) => item.famille === "site_officiel").length, 1);
});

test("une priorité NAP (visibilité) déjà sélectionnée n'entre pas en doublon avec la priorité site", () => {
  const context = createPriorityHarness();
  const top3p = [
    { famille: "visibilite", critere: { key: "nap" } },
    { famille: "reputation", critere: { key: "noteMoyenne" } },
    { famille: "offre", critere: { key: "servicesPresents" } },
  ];
  const resultat = context.appliquerPrioriteSiteInaccessible(top3p, { etat: "inaccessible" });
  assert.ok(!resultat.some((item) => item.critere?.key === "nap"));
  assert.equal(resultat[0].famille, "site_officiel");
});

/* ---------------------------------------------------------------------- */
/* 4) Persistance (brouillon / snapshot / transfert Premium)              */
/* ---------------------------------------------------------------------- */

test("les 3 champs du contrôle site officiel sont bien persistés via champsBrouillonD1 (brouillon, snapshot et transfert Premium réutilisent le même mécanisme générique)", () => {
  const idsLine = sliceBetween(html, "function champsBrouillonD1(){", "function appliquerChampsBrouillonD1(");
  assert.match(idsLine, /"d-site-url"/);
  assert.match(idsLine, /"d-site-etat"/);
  assert.match(idsLine, /"d-site-code"/);
});

/* ---------------------------------------------------------------------- */
/* 5) Aucun impact sur le score : les fichiers de notation ne sont pas touchés */
/* ---------------------------------------------------------------------- */

test("le nouveau contrôle 'État du site officiel' est bien non noté (absent de la grille de score)", () => {
  const grilleSource = readFileSync(new URL("../functions/lib/score-efficia/criteriaCatalog.js", import.meta.url), "utf8");
  assert.doesNotMatch(grilleSource, /d-site-url|d-site-etat|d-site-code|websiteStatus/);
});
