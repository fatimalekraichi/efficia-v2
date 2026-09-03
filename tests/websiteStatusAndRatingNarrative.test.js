// Tests permanents — corrige les deux contradictions factuelles révélées par
// le premier diagnostic réel Morgan-Entreprise (2026-08-27) :
//   1. "3,3/5 reste nettement inférieure à 3,0/5" alors que 3,3 > 3,0 ;
//   2. "Téléphone et site web" conforme / "aucun lien vers le site officiel
//      n’est renseigné sur la fiche Google" / "aucun site web officiel disponible" affichés simultanément alors
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
    "d-site-url": { value: url, dataset: {} },
    "d-site-etat": { value: etat, dataset: {} },
    "d-site-code": { value: codeHttp, dataset: {} },
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
  context.__fields = fields;
  return context;
}

test("aucune URL, réponse explicite 'Aucun lien renseigné' => le rendu ne conclut jamais à l’absence de site officiel", () => {
  const context = createSiteStateHarness({ etat: "aucun" });
  const etat = context.etatSiteOfficielCourant();
  assert.equal(etat.etat, "aucun");
  assert.equal(etat.url, "");
  const message = context.messageEtatSiteOfficiel(etat);
  assert.equal(message, "Aucun lien vers le site officiel n’est renseigné sur la fiche Google.");
  assert.doesNotMatch(message, /aucun site officiel identifiable/i);
  assert.doesNotMatch(message, /aucun site officiel n’est renseigné/i);
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

test("URL présente et inaccessible avec code HTTP 500 saisi => erreur serveur professionnelle", () => {
  const context = createSiteStateHarness({ url: "https://morgan-entreprise.eu", etat: "inaccessible", codeHttp: "500" });
  const etat = context.etatSiteOfficielCourant();
  assert.equal(
    context.messageEtatSiteOfficiel(etat),
    "Le site officiel renvoie actuellement une erreur serveur lorsqu’un client tente de le consulter.",
  );
});

test("erreur DNS Tecelec : le message technique brut est remplacé par une formulation professionnelle", () => {
  const rawDns = "DNS records for tecelec.lu are not properly configured. Please check your DNS settings..";
  const context = createSiteStateHarness({ url: "https://tecelec.lu", etat: "inaccessible", codeHttp: rawDns });
  const etat = context.etatSiteOfficielCourant();
  const message = context.messageEtatSiteOfficiel(etat);
  assert.equal(etat.problemeTechnique, "dns");
  assert.equal(etat.codeHttp, "");
  assert.equal(etat.detailTechniqueBrut, rawDns);
  assert.equal(context.__fields["d-site-code"].value, rawDns);
  assert.equal(message, "Le site officiel était inaccessible lors de notre contrôle. La vérification indique un problème de configuration DNS à faire contrôler par le prestataire qui gère le domaine ou le site.");
  assert.doesNotMatch(message, /DNS records|tecelec\.lu|Please check|settings/i);
});

test("erreur technique inattendue : aucun détail brut, anglais ou trace ne peut être rendu", () => {
  const rawError = "TypeError: fetch failed at resolver.js:42 <img src=x onerror=alert(1)> upstream unavailable";
  const context = createSiteStateHarness({ url: "https://exemple.lu", etat: "inaccessible", codeHttp: rawError });
  const etat = context.etatSiteOfficielCourant();
  const message = context.messageEtatSiteOfficiel(etat);
  assert.equal(etat.problemeTechnique, "incident_technique");
  assert.equal(context.__fields["d-site-code"].value, rawError);
  assert.equal(message, "Le site officiel n’a pas pu être consulté lors de notre contrôle.");
  assert.doesNotMatch(message, /TypeError|resolver\.js|img|onerror|upstream|unavailable/i);
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
  assert.equal(message, "Le site officiel renvoie actuellement une erreur serveur lorsqu’un client tente de le consulter.");
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

/* ---------------------------------------------------------------------- */
/* 6) État "site accessible mais vide / inachevé" (cas réel Appel'FRED,   */
/*    Score-Efficia_Appel-FRED-electricien_Neufchateau_2026-08-27_V1.pdf) */
/*    — le diagnostic annonçait à tort un site "inaccessible / page       */
/*    d'erreur" alors qu'appelfred.com répondait avec une installation    */
/*    WordPress par défaut ("Hello world!") jamais personnalisée.         */
/* ---------------------------------------------------------------------- */

test("URL présente et état 'incomplet' => jamais confondu avec 'inaccessible' ni 'aucun'", () => {
  const context = createSiteStateHarness({ url: "https://appelfred.com/", etat: "incomplet" });
  const etat = context.etatSiteOfficielCourant();
  assert.equal(etat.etat, "incomplet");
  assert.equal(etat.url, "https://appelfred.com/");
  assert.equal(context.siteOfficielAbsent(), false);
});

test("message 'incomplet' : texte factuel exact, jamais 'erreur', 'inaccessible' ou 'page d'erreur'", () => {
  const context = createSiteStateHarness({ url: "https://appelfred.com/", etat: "incomplet" });
  const etat = context.etatSiteOfficielCourant();
  const message = context.messageEtatSiteOfficiel(etat);
  assert.equal(
    message,
    "Un site officiel est bien associé à l’entreprise, mais son contenu était encore très incomplet lors de notre contrôle.",
  );
  assert.doesNotMatch(message, /erreur|inaccessible|[Aa]ucun site/);
});

test("état 'incomplet' avec un code HTTP éventuellement saisi : le code n'apparaît jamais dans ce message (réservé à 'inaccessible')", () => {
  const context = createSiteStateHarness({ url: "https://appelfred.com/", etat: "incomplet", codeHttp: "200" });
  const etat = context.etatSiteOfficielCourant();
  const message = context.messageEtatSiteOfficiel(etat);
  assert.doesNotMatch(message, /200/);
});

test("état 'accessible' avec contenu professionnel : toujours aucun message, aucune critique (non-régression)", () => {
  const context = createSiteStateHarness({ url: "https://exemple-pro.fr", etat: "accessible" });
  const etat = context.etatSiteOfficielCourant();
  assert.equal(context.messageEtatSiteOfficiel(etat), null);
});

/* ---------------------------------------------------------------------- */
/* 7) Signal page 1 (constat d'ouverture)                                  */
/* ---------------------------------------------------------------------- */

function createPage1SignauxHarness({ url = "", etat = "", codeHttp = "", sansAvis = false } = {}) {
  const code = sliceBetween(html, "function napRadioAucunSite(){", "function nomCourtRapport(");
  const fields = {
    "d-site-url": { value: url, dataset: {} },
    "d-site-etat": { value: etat, dataset: {} },
    "d-site-code": { value: codeHttp, dataset: {} },
  };
  const context = {
    CRITERE_IDS: { nap: 7 },
    document: {
      getElementById: (id) => fields[id] || null,
      querySelector: () => null,
    },
    rapportSansAvis: () => sansAvis,
    estNombre: (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)),
    fmtNote: (n) => Number(n).toFixed(1).replace(".", ","),
    nEntier: (v) => Math.round(Number(v)),
  };
  vm.runInNewContext(code, context);
  return context;
}

test("page 1 — état 'incomplet' : signal 'un site officiel encore très peu renseigné', jamais une absence de site affirmée", () => {
  const context = createPage1SignauxHarness({ url: "https://appelfred.com/", etat: "incomplet", sansAvis: true });
  const signaux = context.signauxActuelsPage1({ nbPhotos: 2 });
  assert.ok(signaux.includes("un site officiel encore très peu renseigné"));
  assert.ok(!signaux.some((s) => /aucun site officiel/.test(s)));
});

test("page 1 — état 'aucun' : le signal indique uniquement l’absence de lien sur la fiche Google", () => {
  const context = createPage1SignauxHarness({ etat: "aucun", sansAvis: true });
  const signaux = context.signauxActuelsPage1({ nbPhotos: 2 });
  assert.ok(signaux.includes("aucun lien vers le site officiel n’est renseigné sur la fiche Google"));
  assert.ok(!signaux.some((signal) => /aucun site officiel identifiable/i.test(signal)));
  assert.ok(!signaux.some((signal) => /aucun site officiel n’est renseigné/i.test(signal)));
});

test("page 1 — état 'accessible' (contenu professionnel) : aucun signal lié au site officiel", () => {
  const context = createPage1SignauxHarness({ url: "https://exemple-pro.fr", etat: "accessible", sansAvis: true });
  const signaux = context.signauxActuelsPage1({ nbPhotos: 2 });
  assert.ok(!signaux.some((s) => /site officiel/.test(s)));
});

test("page 1 — erreur DNS brute : aucun signal d'ouverture ne peut divulguer le détail fournisseur", () => {
  const rawDns = "DNS records for tecelec.lu are not properly configured. Please check your DNS settings..";
  const context = createPage1SignauxHarness({ url: "https://tecelec.lu", etat: "inaccessible", codeHttp: rawDns, sansAvis: true });
  const htmlRendu = context.signauxActuelsPage1({ nbPhotos: 2 }).join(" ");
  assert.doesNotMatch(htmlRendu, /DNS records|tecelec\.lu|Please check|settings/i);
});

function createChecklistSiteRendererHarness(siteState) {
  const messageCode = sliceBetween(html, "function messageEtatSiteOfficiel(etatCourant){", "function ouvrirSiteOfficielDetecte()");
  const checklistCode = sliceBetween(html, "const LIBELLES_COURTS = {", "function compterCriteresApplicablesRapport()");
  const context = {
    GRILLE: [{ cat: "Informations essentielles", criteres: [{ id: 7, key: "nap", q: "Cohérence fiche/site", max: 3 }] }],
    REVIEW_DEPENDENT_KEYS: [],
    donneesAnalyse: {},
    critereEstMasque: () => false,
    rapportSansAvis: () => false,
    critereEstNote: () => true,
    critereEstNonApplicable: () => false,
    critereEstNonVerifiablePubliquement: () => false,
    lirePoints: () => 0,
    etatSiteOfficielCourant: () => siteState,
    compterElementsAConfirmerRapport: () => 0,
    phraseElementsAConfirmer: () => "",
  };
  vm.runInNewContext(`${messageCode}\n${checklistCode}`, context);
  return context;
}

test("renderer checklist page 3 : le HTML réel préparé pour le PDF remplace le détail DNS brut", () => {
  const rawDns = "DNS records for tecelec.lu are not properly configured. Please check your DNS settings..";
  const saisieInterne = createSiteStateHarness({ url: "https://tecelec.lu", etat: "inaccessible", codeHttp: rawDns });
  const context = createChecklistSiteRendererHarness(saisieInterne.etatSiteOfficielCourant());
  const htmlRendu = context.checklistHtml().html;
  assert.match(htmlRendu, /Le site officiel était inaccessible lors de notre contrôle\. La vérification indique un problème de configuration DNS/);
  assert.doesNotMatch(htmlRendu, /DNS records|tecelec\.lu|Please check|settings/i);
  assert.ok(rawDns, "fixture brute explicitement couverte");
});

test("page 1 — état 'a_confirmer' : aucun signal lié au site officiel (état non tranché, formulation prudente)", () => {
  const context = createPage1SignauxHarness({ url: "https://exemple.fr", etat: "a_confirmer", sansAvis: true });
  const signaux = context.signauxActuelsPage1({ nbPhotos: 2 });
  assert.ok(!signaux.some((s) => /site officiel/.test(s)));
});

/* ---------------------------------------------------------------------- */
/* 8) Sélection de priorité pour l'état "incomplet"                        */
/* ---------------------------------------------------------------------- */

test("site 'incomplet' => priorité n°1 'site_officiel', au même titre que 'inaccessible'", () => {
  const context = createPriorityHarness();
  const top3p = [
    { famille: "reputation", critere: { key: "noteMoyenne" } },
    { famille: "specialite", critere: { key: "descriptionRemplie" } },
  ];
  const resultat = context.appliquerPrioriteSiteInaccessible(top3p, { etat: "incomplet" });
  assert.equal(resultat[0].famille, "site_officiel");
  assert.equal([resultat[1].famille, resultat[2].famille].join(","), "reputation,specialite");
});

test("cas Appel'FRED exact : ordre final 'Finaliser le site officiel' puis réputation puis spécialité", () => {
  const context = createPriorityHarness();
  const top3p = [
    { famille: "reputation", critere: { key: "noteMoyenne" } },
    { famille: "specialite", critere: { key: "descriptionRemplie" } },
    { famille: "photos", critere: { key: "nombrePhotos" } },
  ];
  const resultat = context.appliquerPrioriteSiteInaccessible(top3p, { etat: "incomplet" });
  assert.equal([resultat[0].famille, resultat[1].famille, resultat[2].famille].join(","), "site_officiel,reputation,specialite");
});

/* ---------------------------------------------------------------------- */
/* 9) Contenu rendu de la carte priorité "site officiel"                   */
/* ---------------------------------------------------------------------- */

function createPrioriteSiteOfficielRenderHarness() {
  const code = sliceBetween(html, "function rendrePrioriteSiteOfficiel(", "function rendrePriorite(");
  const context = {};
  vm.runInNewContext(code, context);
  return context;
}

test("rendu priorité 'inaccessible' générique : action technique prudente, sans hébergeur ni journaux d’erreur", () => {
  const context = createPrioriteSiteOfficielRenderHarness();
  const htmlRendu = context.rendrePrioriteSiteOfficiel({ siteState: { etat: "inaccessible" } }, 0);
  assert.match(htmlRendu, /<h2 class="priority-title">Remettre le site officiel en ligne<\/h2>/);
  assert.match(htmlRendu, /une page d’erreur/);
  assert.match(htmlRendu, /Faire vérifier le fonctionnement technique du site/);
  assert.doesNotMatch(htmlRendu, /hébergement|journaux d’erreur|Délai dépendant/i);
});

test("rendu priorité DNS : action exacte demandée, sans détail brut ni cause d’hébergement", () => {
  const context = createPrioriteSiteOfficielRenderHarness();
  const rawDns = "The DNS records for tecelec.lu are not properly configured. Please check your DNS settings.";
  const htmlRendu = context.rendrePrioriteSiteOfficiel({ siteState: { etat: "inaccessible", problemeTechnique: "dns", detailTechniqueBrut: rawDns } }, 0);
  assert.match(htmlRendu, /Faire vérifier la configuration DNS du domaine par la personne ou le prestataire qui gère le domaine ou le site, puis tester le lien depuis la fiche Google\./);
  assert.doesNotMatch(htmlRendu, /The DNS records|Please check|hébergement|journaux d’erreur|Délai dépendant/i);
});

test("rendu priorité HTTP 500 et incident inconnu : actions distinctes, sans détail technique brut", () => {
  const context = createPrioriteSiteOfficielRenderHarness();
  const server = context.rendrePrioriteSiteOfficiel({ siteState: { etat: "inaccessible", problemeTechnique: "erreur_serveur", detailTechniqueBrut: "HTTP 500 upstream failed" } }, 0);
  const unknown = context.rendrePrioriteSiteOfficiel({ siteState: { etat: "inaccessible", problemeTechnique: "incident_technique", detailTechniqueBrut: "TypeError: fetch failed" } }, 0);
  assert.match(server, /erreur serveur/);
  assert.match(server, /Faire vérifier l’erreur serveur et le fonctionnement technique du site/);
  assert.match(unknown, /Le site officiel n’a pas pu être consulté/);
  assert.match(unknown, /Faire vérifier le fonctionnement technique du site/);
  assert.doesNotMatch(server + unknown, /upstream failed|TypeError|fetch failed/i);
});

test("rendu priorité 'incomplet' : titre et textes exacts requis (formulation technologiquement neutre), jamais 'erreur', 'page d'erreur' ni 'remettre le site en ligne'", () => {
  const context = createPrioriteSiteOfficielRenderHarness();
  const htmlRendu = context.rendrePrioriteSiteOfficiel({ siteState: { etat: "incomplet" } }, 0);
  assert.match(htmlRendu, /<h2 class="priority-title">Finaliser le site officiel<\/h2>/);
  assert.match(htmlRendu, /son contenu reste très peu renseigné et ne présente pas clairement vos services/);
  assert.match(htmlRendu, /Remplacer le contenu par défaut ou inachevé par une présentation claire/);
  assert.match(htmlRendu, /Temps variable selon les contenus à préparer\./);
  assert.doesNotMatch(htmlRendu, /page d’erreur|page d'erreur/);
  assert.doesNotMatch(htmlRendu, /erreur serveur/);
  assert.doesNotMatch(htmlRendu, /Remettre le site officiel en ligne/);
});

test("rendu priorité 'incomplet' générique : ne mentionne jamais une technologie particulière (WordPress, Wix, Squarespace, ...)", () => {
  const context = createPrioriteSiteOfficielRenderHarness();
  const htmlRendu = context.rendrePrioriteSiteOfficiel({ siteState: { etat: "incomplet" } }, 0);
  assert.doesNotMatch(htmlRendu, /WordPress/i);
  assert.doesNotMatch(htmlRendu, /Wix/i);
  assert.doesNotMatch(htmlRendu, /Squarespace/i);
  assert.doesNotMatch(htmlRendu, /Shopify|Webflow|Jimdo|Joomla|Drupal/i);
});

/* ---------------------------------------------------------------------- */
/* 10) Persistance de la réponse manuelle "incomplet" (brouillon/rechargement) */
/* ---------------------------------------------------------------------- */

function createDraftPersistenceHarness() {
  const normalizerCode = sliceBetween(html, "function normaliserErreurTechniqueSite(", "function siteOfficielAbsent()");
  const code = sliceBetween(html, "function champsBrouillonD1(){", "function restaurerLocalisation(");
  const fields = {};
  const context = {
    document: {
      getElementById: (id) => {
        if (!(id in fields)) fields[id] = { value: "", dataset: {} };
        return fields[id];
      },
    },
  };
  vm.runInNewContext(`${normalizerCode}\n${code}`, context);
  context.__fields = fields;
  return context;
}

test("persistance brouillon : une réponse manuelle 'incomplet' (URL + état) est sauvegardée puis restaurée à l'identique", () => {
  const context = createDraftPersistenceHarness();
  context.__fields["d-site-url"] = { value: "https://appelfred.com/", dataset: {} };
  context.__fields["d-site-etat"] = { value: "incomplet", dataset: {} };
  context.__fields["d-site-code"] = { value: "", dataset: {} };
  const snapshot = context.champsBrouillonD1();
  assert.equal(snapshot["d-site-etat"], "incomplet");
  assert.equal(snapshot["d-site-url"], "https://appelfred.com/");
  // Simule un rechargement de page (champs vidés), puis restauration depuis le brouillon sauvegardé.
  context.__fields["d-site-url"] = { value: "", dataset: {} };
  context.__fields["d-site-etat"] = { value: "", dataset: {} };
  context.appliquerChampsBrouillonD1(snapshot);
  assert.equal(context.__fields["d-site-url"].value, "https://appelfred.com/");
  assert.equal(context.__fields["d-site-etat"].value, "incomplet");
});

test("persistance brouillon : une erreur DNS brute reste disponible dans les données internes après sauvegarde et restauration", () => {
  const context = createDraftPersistenceHarness();
  const rawDns = "DNS records for tecelec.lu are not properly configured. Please check your DNS settings..";
  context.__fields["d-site-url"] = { value: "https://tecelec.lu", dataset: {} };
  context.__fields["d-site-etat"] = { value: "inaccessible", dataset: {} };
  context.__fields["d-site-code"] = { value: rawDns, dataset: {} };
  const snapshot = context.champsBrouillonD1();
  assert.equal(snapshot["d-site-code"], rawDns);
  context.__fields["d-site-code"] = { value: snapshot["d-site-code"], dataset: {} };
  context.appliquerChampsBrouillonD1(snapshot);
  assert.equal(context.__fields["d-site-code"].value, rawDns);
});

/* ---------------------------------------------------------------------- */
/* 11) Le nouveau contrôle 'État du site officiel' propose les 5 états exacts */
/* ---------------------------------------------------------------------- */

test("le sélecteur admin #d-site-etat distingue l’absence de lien sur la fiche Google, l'URL restant un champ séparé", () => {
  const selectBlock = sliceBetween(html, '<select id="d-site-etat"', "</select>");
  assert.match(selectBlock, /Aucun lien vers le site officiel n’est renseigné sur la fiche Google/);
  assert.match(selectBlock, /Site inaccessible ou en erreur/);
  assert.match(selectBlock, /Site accessible mais vide ou inachevé/);
  assert.match(selectBlock, /Site accessible avec un contenu professionnel/);
  assert.match(selectBlock, /À confirmer/);
  // L'URL reste un champ dédié, indépendant de l'état constaté.
  assert.match(html, /id="d-site-url"/);
});

/* ---------------------------------------------------------------------- */
/* 12) "incomplet" est un constat CONFIRMÉ (jamais "à confirmer")          */
/*     — seul "a_confirmer" doit rester le véritable état incertain,       */
/*     dans le payload JSON (evaluationStatus) et dans la checklist page 3 */
/*     (symbole affiché). Aucun impact sur le calcul du score dans les     */
/*     deux cas.                                                           */
/* ---------------------------------------------------------------------- */

function createEvaluationStatusHarness({ etat } = {}) {
  const code = sliceBetween(html, 'const special = cr.key === "adresse"', "criteria.push({");
  // points / nonApplicable / publiclyUnverifiable sont déclarés AVANT ce bloc dans le
  // fichier source (non repris ici) : fournis comme paramètres de la fonction de test.
  const wrapped = `function computeEvaluationStatus(cr, points, nonApplicable, publiclyUnverifiable){\n${code}\n  return evaluationStatus;\n}`;
  const context = {
    document: { querySelector: () => null },
    etatSiteOfficielCourant: () => (etat ? { etat, url: "https://appelfred.com/", codeHttp: "" } : null),
    statutEvaluationCritere: () => "compliant",
  };
  vm.runInNewContext(wrapped, context);
  return context.computeEvaluationStatus({ key: "nap", id: 7, max: 3 }, 3, false, false);
}

function createChecklistStatutHarness({ etat, p = 3 } = {}) {
  const code = sliceBetween(html, "const napSiteStateChk = cr.key", 'if(statut === "ok") ok++');
  // nonApplicable / publiclyUnverifiable / p sont déclarés AVANT ce bloc dans le
  // fichier source (non repris ici) : fournis comme paramètres de la fonction de test.
  const wrapped = `function computeChecklistStatut(cr, p, nonApplicable, publiclyUnverifiable){\n${code}\n  return statut;\n}`;
  const context = {
    critereEstNonApplicable: () => false,
    critereEstNonVerifiablePubliquement: () => false,
    etatSiteOfficielCourant: () => (etat ? { etat, url: "https://appelfred.com/", codeHttp: "" } : null),
    messageEtatSiteOfficiel: (e) => (e ? `message pour ${e.etat}` : null),
  };
  vm.runInNewContext(wrapped, context);
  return context.computeChecklistStatut({ key: "nap", id: 7, max: 3 }, p, false, false);
}

test("evaluationStatus : 'incomplet' et 'a_confirmer' produisent deux statuts différents", () => {
  const incomplet = createEvaluationStatusHarness({ etat: "incomplet" });
  const aConfirmer = createEvaluationStatusHarness({ etat: "a_confirmer" });
  assert.notEqual(incomplet, aConfirmer);
});

test("evaluationStatus : 'incomplet' est un constat confirmé et à améliorer ('partial'), jamais 'not_verified'", () => {
  assert.equal(createEvaluationStatusHarness({ etat: "incomplet" }), "partial");
});

test("evaluationStatus : 'a_confirmer' reste 'not_verified' — seul véritable état incertain", () => {
  assert.equal(createEvaluationStatusHarness({ etat: "a_confirmer" }), "not_verified");
});

test("checklist page 3 : 'incomplet' et 'a_confirmer' produisent deux symboles différents", () => {
  const incomplet = createChecklistStatutHarness({ etat: "incomplet" });
  const aConfirmer = createChecklistStatutHarness({ etat: "a_confirmer" });
  assert.notEqual(incomplet, aConfirmer);
});

test("checklist page 3 : 'incomplet' s'affiche en '!' (à améliorer, warn), jamais en '○' (à confirmer)", () => {
  assert.equal(createChecklistStatutHarness({ etat: "incomplet" }), "warn");
});

test("checklist page 3 : 'a_confirmer' reste '○' (unknown) — seul véritable état incertain", () => {
  assert.equal(createChecklistStatutHarness({ etat: "a_confirmer" }), "unknown");
});

test("le contrôle 'État du site officiel' n'influence jamais le calcul des points : lirePoints() ne référence ni etatSiteOfficielCourant() ni le champ #d-site-etat (score strictement inchangé, quel que soit l'état narratif retenu)", () => {
  const lirePointsSource = sliceBetween(html, "function lirePoints(id){", "const PHOTO_DEPENDENT_KEYS");
  assert.doesNotMatch(lirePointsSource, /etatSiteOfficielCourant/);
  assert.doesNotMatch(lirePointsSource, /d-site-etat/);
});

test("la priorité 'Finaliser le site officiel' reste déclenchée pour l'état 'incomplet' après ce correctif (non-régression)", () => {
  const context = createPriorityHarness();
  const top3p = [{ famille: "reputation" }, { famille: "specialite" }];
  const resultat = context.appliquerPrioriteSiteInaccessible(top3p, { etat: "incomplet" });
  assert.equal(resultat[0].famille, "site_officiel");
});

/* ---------------------------------------------------------------------- */
/* 13) "inaccessible" est également un constat CONFIRMÉ (pas "à confirmer") */
/*     — seul "a_confirmer" reste not_verified/unknown/"○" ; "accessible"   */
/*     reste conforme selon le critère existant ; "aucun" garde no_website. */
/*     Les cinq états sont vérifiés explicitement, avec confirmation que    */
/*     le score reste strictement inchangé dans tous les cas.              */
/* ---------------------------------------------------------------------- */

test("evaluationStatus : 'inaccessible' est un constat confirmé, jamais 'not_verified' — statut le plus sévère parmi les enums confirmés existants ('deficient')", () => {
  assert.equal(createEvaluationStatusHarness({ etat: "inaccessible" }), "deficient");
});

test("evaluationStatus : les cinq états produisent la correspondance attendue", () => {
  assert.equal(createEvaluationStatusHarness({ etat: "accessible" }), "compliant"); // selon le critère existant (mock: conforme)
  assert.equal(createEvaluationStatusHarness({ etat: "incomplet" }), "partial");
  assert.equal(createEvaluationStatusHarness({ etat: "inaccessible" }), "deficient");
  assert.equal(createEvaluationStatusHarness({ etat: "a_confirmer" }), "not_verified");
  assert.equal(createEvaluationStatusHarness({ etat: "aucun" }), "no_website");
});

test("checklist page 3 : 'inaccessible' est un constat confirmé, jamais '○' — symbole '✕' (ko), le plus sévère parmi les symboles existants", () => {
  assert.equal(createChecklistStatutHarness({ etat: "inaccessible" }), "ko");
});

test("checklist page 3 : les cinq états produisent le symbole attendu", () => {
  assert.equal(createChecklistStatutHarness({ etat: "accessible", p: 3 }), "ok"); // selon les points existants (p >= max)
  assert.equal(createChecklistStatutHarness({ etat: "incomplet" }), "warn");
  assert.equal(createChecklistStatutHarness({ etat: "inaccessible" }), "ko");
  assert.equal(createChecklistStatutHarness({ etat: "a_confirmer" }), "unknown");
  assert.equal(createChecklistStatutHarness({ etat: "aucun" }), "no_website");
});

test("les cinq états du site officiel n'ont toujours aucun impact sur le calcul du score (lirePoints() reste indépendant de l'état narratif, y compris 'inaccessible')", () => {
  const lirePointsSource = sliceBetween(html, "function lirePoints(id){", "const PHOTO_DEPENDENT_KEYS");
  assert.doesNotMatch(lirePointsSource, /etatSiteOfficielCourant/);
  assert.doesNotMatch(lirePointsSource, /d-site-etat/);
  // Les cinq statuts narratifs eux-mêmes ne réintroduisent aucune référence
  // à un poids ou un seuil de score : ils ne font que reformuler p/max déjà lus.
  ["accessible", "incomplet", "inaccessible", "a_confirmer", "aucun"].forEach((etat) => {
    assert.doesNotThrow(() => createEvaluationStatusHarness({ etat }));
    assert.doesNotThrow(() => createChecklistStatutHarness({ etat }));
  });
});

test("la priorité 'Finaliser le site officiel' (état 'incomplet') ne mentionne aucune technologie particulière au niveau générique — WordPress reste réservé à la personnalisation e-mail du cas réel, hors générateur", () => {
  const rendrePrioriteSource = sliceBetween(html, "function rendrePrioriteSiteOfficiel(item, index){", "function rendrePriorite(item, index, variante){");
  assert.doesNotMatch(rendrePrioriteSource, /WordPress/i);
  assert.doesNotMatch(rendrePrioriteSource, /Wix|Squarespace|Shopify|Webflow|Jimdo|Joomla|Drupal/i);
});
