import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  extractActionLinkEvidence,
} from "../functions/lib/actionLinkEvidence.js";
import { normalizeProviderRank } from "../functions/lib/collectCompetitors.js";
import {
  AUTO_EVIDENCE_CONTRACTS,
  buildScorePrefill,
  classifyCompetitiveAttractiveness,
  classifyLocalRank,
} from "../functions/lib/score-efficia/scoreCatalog.js";

const html = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
const route = readFileSync(new URL("../functions/api/admin/free-diagnostic-collect/[analysisId].js", import.meta.url), "utf8");
const criteriaCatalog = readFileSync(new URL("../functions/lib/score-efficia/criteriaCatalog.js", import.meta.url), "utf8");
const scoreCatalogSource = readFileSync(new URL("../functions/lib/score-efficia/scoreCatalog.js", import.meta.url), "utf8");

function analysis({ actionFields, position = 4, rankContext, rating = 1.8, reviews = 5, averageRating = 4.8, averageReviews = 11 } = {}){
  const actionEvidence = extractActionLinkEvidence(actionFields || {});
  const normalized = {
    name:"Bivert Alain",
    place_id:"place-bivert",
    category:"Fournisseur d'électricité",
    confirmed_activity:"Électricien",
    observed_fields:["category", ...(actionEvidence.availability === "available" ? ["action_links"] : [])],
    action_links_status:actionEvidence.availability,
    action_links:actionEvidence.links,
    ...(rankContext ? { search_rank_context:rankContext } : {}),
  };
  return {
    business:{
      name:"Bivert Alain",
      placeId:"place-bivert",
      normalized,
      fiche:normalized,
      rating,
      reviews,
      photosCount:1,
      descriptionLength:null,
      localPosition:position,
      competitors:[
        { name:"AS pro elec", rating:4.4, reviews:7, photos_count:0 },
        { name:"Moris Wilfried", rating:5, reviews:5, photos_count:1 },
        { name:"Electrolux95", rating:5, reviews:20, photos_count:2 },
      ],
    },
    benchmark:{ averages:{ rating:averageRating, reviews:averageReviews, photos:1 }, gaps:{ rating:-3, reviews:-6, photos:0 } },
  };
}

function criterion(prefill, key){
  return prefill.criteria.find((item) => item.key === key);
}

test("seulement des annuaires externes ne prouve aucun lien d'action direct et donne Manquants", () => {
  const prefill = buildScorePrefill(analysis({ actionFields:{
    reservation_links:["https://heures.be/bivert", "https://www.infobel.com/fr/belgium/bivert"],
    booking_appointment_link:"https://www.starofservice.be/pro/bivert",
  }}), { verifiedCategoryEvidence:true });
  const action = criterion(prefill, "liensAction");
  assert.equal(action.label, "Manquants");
  assert.equal(action.points, 0);
  assert.equal(action.evidence.directLinks, 0);
  assert.deepEqual(action.evidence.links.map((link) => link.status), ["annuaire", "annuaire", "annuaire"]);
});

test("TAF Square sans contact direct donne Manquants", () => {
  const action = criterion(buildScorePrefill(analysis({ actionFields:{
    reservation_links:["https://www.tafsquare.com/fr/prestataire/bivert-alain"],
  }}), { verifiedCategoryEvidence:true }), "liensAction");
  assert.equal(action.label, "Manquants");
  assert.equal(action.points, 0);
  assert.equal(action.evidence.links[0].status, "annuaire");
});

test("une véritable URL fournisseur de prise de rendez-vous donne Oui", () => {
  const action = criterion(buildScorePrefill(analysis({ actionFields:{
    booking_appointment_link:"https://calendly.com/bivert/rendez-vous",
  }}), { verifiedCategoryEvidence:true }), "liensAction");
  assert.equal(action.label, "Oui");
  assert.equal(action.points, 4);
  assert.equal(action.evidence.links[0].type, "rendez-vous");
});

test("une véritable URL fournisseur de demande de devis donne Oui", () => {
  const action = criterion(buildScorePrefill(analysis({ actionFields:{
    request_quote_link:"https://bivert.example/demander-un-devis",
  }}), { verifiedCategoryEvidence:true }), "liensAction");
  assert.equal(action.label, "Oui");
  assert.equal(action.points, 4);
  assert.equal(action.evidence.links[0].type, "devis");
});

test("un champ fournisseur CTA absent reste À confirmer sans sélection", () => {
  const action = criterion(buildScorePrefill(analysis(), { verifiedCategoryEvidence:true }), "liensAction");
  assert.equal(action.value, "not_verified");
  assert.equal(action.points, null);
  assert.equal(action.source, "unknown");
});

test("site, téléphone, URL Maps et résultats Web ne prouvent jamais un lien d'action", () => {
  const evidence = extractActionLinkEvidence({
    phone:"+32 495 27 60 80",
    site:"https://example.com",
    location_link:"https://www.google.com/maps/place/Bivert",
    organic_results:[{ link:"https://heures.be/bivert" }],
    web_results:[{ link:"https://starofservice.be/bivert" }],
  });
  assert.equal(evidence.availability, "unavailable");
  assert.deepEqual(evidence.links, []);
});

test("Non applicable à l'activité n'est jamais sélectionné automatiquement", () => {
  const cases = [
    buildScorePrefill(analysis(), { verifiedCategoryEvidence:true }),
    buildScorePrefill(analysis({ actionFields:{ order_links:[] } }), { verifiedCategoryEvidence:true }),
    buildScorePrefill(analysis({ actionFields:{ order_links:["https://example.com/order"] } }), { verifiedCategoryEvidence:true }),
  ];
  assert.deepEqual(cases.map((prefill) => criterion(prefill, "liensAction")?.label), ["Non vérifié", "Manquants", "Oui"]);
  assert.doesNotMatch(scoreCatalogSource, /optionForKey\("liensAction",\s*1/);
});

test("position brute one-based 4 donne Visible en 1re page", () => {
  assert.deepEqual(normalizeProviderRank({ position:4 }, 3), {
    rawRank:4,
    normalizedOneBasedRank:4,
    source:"provider_position_one_based",
  });
  assert.deepEqual(classifyLocalRank(4), { status:"first_page", optionIndex:1 });
});

test("index fournisseur zero-based 3 est normalisé une seule fois en position 4", () => {
  assert.deepEqual(normalizeProviderRank({ rank:3 }, 3), {
    rawRank:3,
    normalizedOneBasedRank:4,
    source:"provider_rank_zero_based",
  });
});

test("un marqueur sans rang listé n'est jamais une preuve de Top 3", () => {
  const rank = normalizeProviderRank({ map_marker:true }, 2);
  assert.equal(rank.normalizedOneBasedRank, null);
  assert.equal(classifyLocalRank(rank.normalizedOneBasedRank).status, "unknown");
});

test("les positions humaines 1, 2 et 3 donnent exclusivement Top 3", () => {
  assert.deepEqual([1, 2, 3].map((position) => classifyLocalRank(position).status), ["top3", "top3", "top3"]);
});

test("Bivert en position normalisée 4 donne Visible en 1re page", () => {
  const prefill = buildScorePrefill(analysis({
    actionFields:{ reservation_links:[] },
    position:4,
    rankContext:{ raw_rank:3, normalized_one_based_rank:4, source:"provider_rank_zero_based" },
  }), { verifiedCategoryEvidence:true });
  const rank = criterion(prefill, "classementLocal");
  assert.equal(rank.label, "Visible en 1re page");
  assert.equal(rank.points, 3);
  assert.equal(rank.evidence.rawRank, 3);
});

test("Bivert 1,8/5 et 5 avis face à 4,8/5 et 11 avis est Derrière", () => {
  const decision = classifyCompetitiveAttractiveness({ rating:1.8, reviews:5, averageRating:4.8, averageReviews:11 });
  assert.equal(decision.status, "behind");
  assert.equal(decision.optionIndex, 2);
  const attractiveness = criterion(buildScorePrefill(analysis(), { verifiedCategoryEvidence:true }), "attractiviteConcurrents");
  assert.equal(attractiveness.label, "Derrière");
  assert.equal(attractiveness.points, null);
  assert.equal(attractiveness.scored, false);
});

test("les valeurs décimales françaises avec virgule suivent le même calcul", () => {
  const decision = classifyCompetitiveAttractiveness({ rating:"1,8", reviews:"5", averageRating:"4,8", averageReviews:"11" });
  assert.equal(decision.status, "behind");
});

test("des benchmarks incomplets donnent À confirmer, jamais Comparable", () => {
  const decision = classifyCompetitiveAttractiveness({ rating:4.8, reviews:10, averageRating:null, averageReviews:11 });
  assert.equal(decision.status, "unknown");
  assert.equal(decision.optionIndex, null);
  const attractiveness = criterion(buildScorePrefill(analysis({ averageRating:null }), { verifiedCategoryEvidence:true }), "attractiviteConcurrents");
  assert.equal(attractiveness.value, "not_verified");
  assert.equal(attractiveness.points, null);
});

test("la relance recalcule les benchmarks avant de reconstruire les réponses AUTO", () => {
  const refresh = route.slice(route.indexOf("async function refreshSearchAnalysis"), route.indexOf("async function clearFailedCollection"));
  assert.ok(refresh.indexOf("const benchmark = benchmarkEngine") < refresh.indexOf("const state = buildFreeDiagnosticCollectionState"));
  assert.match(html, /\["classementLocal", "categoriePrincipale", "categoriesSecondaires", "liensAction", "volumeAvis"\]/);
});

test("chaque critère AUTO du diagnostic possède un contrat de preuve permanent", () => {
  assert.deepEqual(Object.keys(AUTO_EVIDENCE_CONTRACTS), [
    "categoriePrincipale", "categoriesSecondaires", "horaires", "contact", "liensAction",
    "nombrePhotos", "noteMoyenne", "volumeAvis", "descriptionRemplie", "servicesPresents",
    "classementLocal", "attractiviteConcurrents",
  ]);
  assert.match(html, /const CRITERES_AUTOMATIQUES_A_PREUVE = new Set/);
});

test("les preuves absentes ne sélectionnent aucune réponse AUTO et n'attribuent aucun point", () => {
  const prefill = buildScorePrefill({ business:{ normalized:{}, competitors:[] }, benchmark:{ averages:{} } }, { verifiedCategoryEvidence:true });
  Object.keys(AUTO_EVIDENCE_CONTRACTS).forEach((key) => {
    const item = criterion(prefill, key);
    assert.equal(item?.points, null, `${key} ne doit recevoir aucun point sans preuve`);
    assert.equal(item?.value, "not_verified", `${key} doit rester à confirmer sans preuve`);
  });
});

test("les blocs de preuve CTA, rang et concurrence sont affichés près des critères", () => {
  assert.match(html, /id="action-links-evidence"/);
  assert.match(html, /id="local-rank-evidence"/);
  assert.match(html, /id="competitive-evidence"/);
  assert.match(html, /position observée/i);
  assert.match(html, /moyenne concurrentielle/i);
});

test("le score Bivert ne reçoit pas les quatre points des liens d'action", () => {
  const action = criterion(buildScorePrefill(analysis({ actionFields:{ reservation_links:[] } }), { verifiedCategoryEvidence:true }), "liensAction");
  assert.equal(action.points, 0);
  assert.notEqual(action.points, 4);
});

test("les poids et options CTA, classement et attractivité restent inchangés", () => {
  assert.match(criteriaCatalog, /opts:\[\["Oui",CONFIG\.poids\.contenu\.liensAction\],\["Non applicable à l'activité",CONFIG\.poids\.contenu\.liensAction\],\["Manquants",0\]\]/);
  assert.match(criteriaCatalog, /opts:\[\["Top 3",CONFIG\.poids\.visibilite\.classement\],\["Visible en 1re page",3\],\["Absente",0\]\]/);
  assert.match(criteriaCatalog, /opts:\[\["Devant",CONFIG\.poids\.visibilite\.attractivite\],\["Comparable",2\],\["Derrière",0\]\]/);
});
