import test from "node:test";
import assert from "node:assert/strict";

import {
  buildExecutionPlan,
  confirmReadyExecutionPlanReview,
  countPendingExecutionReview,
  executionPlanApprovalIssues,
  normalizeExecutionPlanReview,
  rebuildDuplicatedExecutionPlanReview,
} from "../functions/lib/executionPlanBuilder.js";
import { resolveReportCity, runComposerForAnalysis } from "../functions/lib/auditComposition.js";
import { detectExecutionSector } from "../functions/lib/executionPlaybooks.js";
import { buildDocumentModelFromAnalysis } from "../functions/lib/documentModelFromAnalysis.js";
import { addPreviewToolbar, buildAuditPdfFilename, buildControlPdfTitle } from "../functions/lib/pdfRenderer.js";
import { buildConstat, formatOrdinal } from "../functions/lib/presentationFormatter.js";
import { applyReportCommercialPolicy, resolveReportCommercialPolicy } from "../functions/lib/reportCommercialPolicy.js";
import { renderAnalysisHtml } from "../functions/lib/renderAnalysisHtml.js";
import { buildScoreCatalog } from "../functions/lib/score-efficia/scoreCatalog.js";
import { QUESTIONNAIRE_VERSION } from "../functions/lib/score-efficia/questionnaireRules.js";

function model(overrides = {}) {
  return {
    reportType: "premium",
    hero: { businessName: "Entreprise Test", category: "Restaurant", city: "Luxembourg", score: 70 },
    strengths: [{ title: "Une note rassurante" }],
    priorities: [
      { rank: 1, id: "P-DESC", signal: "description", title: "Clarifier la description", reasoning: "La description est trop courte.", actionability: { estimatedTime: "30 min" } },
      { rank: 2, id: "P-PHOTOS", signal: "photos", title: "Renforcer les photos", reasoning: "Le volume de photos reste limité.", actionability: { estimatedTime: "1 h" } },
      { rank: 3, id: "P-REVIEWS", signal: "reviews", title: "Structurer les avis", reasoning: "Les avis peuvent être mieux suivis.", actionability: { estimatedTime: "20 min" } },
      { rank: 4, id: "P-EXTRA", signal: "posts", title: "Priorité supplémentaire", reasoning: "Ne doit pas être détaillée." },
    ],
    weaknesses: [], opportunities: [], actionPlan: [], footer: {}, vocabulary: {},
    ...overrides,
  };
}

function analysis(overrides = {}) {
  return {
    reportType: "premium",
    business: {
      name: "Entreprise Test", ville: "Luxembourg", activity: "Restaurant",
      rating: 4.6, reviews: 18, photosCount: 7, descriptionLength: 0, localPosition: 0,
      searchQuery: "restaurant luxembourg",
      normalized: { category: "Restaurant", description: "", subtypes: ["Restaurant"] },
    },
    manualReview: {},
    ...overrides,
  };
}

test("le plan conserve exactement les trois premières priorités et leur ordre", () => {
  const plan = buildExecutionPlan({ analysis: analysis(), documentModel: model() });
  assert.deepEqual(plan.actions.map((item) => item.id), ["P-DESC", "P-PHOTOS", "P-REVIEWS"]);
  assert.deepEqual(plan.actions.map((item) => item.rank), [1, 2, 3]);
});

test("les playbooks couvrent restaurant, artisan, garage, profession libérale et fallback", () => {
  assert.equal(detectExecutionSector("Restaurant"), "restaurant");
  assert.equal(detectExecutionSector("Électricien"), "artisan");
  assert.equal(detectExecutionSector("Garage automobile"), "garage");
  assert.equal(detectExecutionSector("Cabinet comptable"), "liberal");
  assert.equal(detectExecutionSector("Activité inconnue"), "generic");
});

test("description absente ou courte : proposition prudente à confirmer ; suffisante : texte observé approuvé", () => {
  const absent = buildExecutionPlan({ analysis: analysis(), documentModel: model() });
  assert.equal(absent.description.status, "needs_confirmation");
  assert.match(absent.description.text, /doivent être confirmées avant publication/);
  assert.equal(absent.approved.description, null);

  const short = buildExecutionPlan({ analysis: analysis({ business: { ...analysis().business, descriptionLength: 120 } }), documentModel: model() });
  assert.equal(short.description.status, "needs_confirmation");

  const publicDescription = "Description publique suffisamment longue et vérifiée. ".repeat(11);
  const sufficient = buildExecutionPlan({
    analysis: analysis({ business: { ...analysis().business, descriptionLength: publicDescription.length, normalized: { category: "Restaurant", description: publicDescription } } }),
    documentModel: model(),
  });
  assert.equal(sufficient.description.status, "approved");
  assert.equal(sufficient.approved.description.text, publicDescription.trim());
});

test("un Premium manuel transféré v4 utilise partout la ville administrative confirmée", () => {
  const transferredPremium = analysis({
    analysisId: "premium-manual-from-free-v4",
    business: {
      ...analysis().business,
      name: "ME ELEC",
      nom: "ME ELEC",
      ville: "Arlon",
      activity: "Électricien",
      reviewed: {
        name: "ME ELEC",
        city: "Non renseignée",
        category: "Électricien",
      },
      normalized: {
        category: "Électricien",
        description: "",
        subtypes: ["Électricien"],
      },
    },
    manualReview: {
      questionnaireVersion: QUESTIONNAIRE_VERSION,
      confirmedCity: "Arlon",
      importedFromFree: {
        sourceAnalysisId: "free-source-v4",
        sourceSnapshotId: "snapshot-free-v4",
      },
    },
  });

  const composed = runComposerForAnalysis(transferredPremium).output;
  const documentModel = applyReportCommercialPolicy(
    buildDocumentModelFromAnalysis({ ...transferredPremium, documentModel: composed }),
    resolveReportCommercialPolicy("premium", "admin_manual"),
  );
  const finalHtml = addPreviewToolbar(renderAnalysisHtml(documentModel), transferredPremium.analysisId, "approved", {
    reportType: "premium",
    requestedAnalysisId: transferredPremium.analysisId,
    finalPdfTitle: buildAuditPdfFilename(transferredPremium, "2026-08-23"),
  });
  const controlHtml = addPreviewToolbar(renderAnalysisHtml(documentModel), transferredPremium.analysisId, "preview_ready", {
    reportType: "premium",
    requestedAnalysisId: transferredPremium.analysisId,
    controlPdfTitle: buildControlPdfTitle(transferredPremium, "2026-08-23"),
  });
  const serializedReport = JSON.stringify(documentModel);
  const visibleFinalHtml = finalHtml
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  const catalog = buildScoreCatalog();
  const criteria = catalog.categories.flatMap((category) => category.criteria);

  for (const sentinel of ["Non renseignée", "Non-renseignee", "Non renseigné", "Inconnue", "Unknown", "  "]) {
    assert.equal(resolveReportCity({ business: { reviewed: { city: sentinel } } }), null);
  }
  assert.equal(resolveReportCity(transferredPremium), "Arlon");
  assert.equal(documentModel.hero.city, "Arlon");
  assert.equal(documentModel.executionPlan.context.city, "Arlon");
  assert.match(documentModel.executionPlan.description.text, /« Électricien » à Arlon\./);
  assert.doesNotMatch(serializedReport, /Non renseignée/i);
  assert.doesNotMatch(visibleFinalHtml, /Non renseignée/i);
  assert.equal(
    buildAuditPdfFilename(transferredPremium, "2026-08-23"),
    "Audit-Efficia-Premium_ME-ELEC_Arlon_2026-08-23.pdf",
  );
  assert.doesNotMatch(finalHtml, /DOCUMENT DE CONTRÔLE — NON APPROUVÉ/);
  assert.match(controlHtml, /DOCUMENT DE CONTRÔLE — NON APPROUVÉ/);
  assert.doesNotMatch(visibleFinalHtml, /Diagnostic gratuit|offert|99 € déjà investis|intégralement déduits/i);
  assert.equal(QUESTIONNAIRE_VERSION, "score-efficia-questionnaire-v4");
  assert.equal(criteria.length, 29);
  assert.equal(criteria.reduce((sum, criterion) => sum + criterion.max, 0), 100);
});

test("une description déjà approuvée reste immuable et nécessite une nouvelle version pour être corrigée", () => {
  const approvedText = "ME ELEC est une fiche Google Business associée à la catégorie « Électricien » à Non renseignée.";
  const approvedAnalysis = analysis({
    business: {
      ...analysis().business,
      name: "ME ELEC",
      ville: "Arlon",
      activity: "Électricien",
      reviewed: { city: "Non renseignée", category: "Électricien" },
    },
    manualReview: {
      confirmedCity: "Arlon",
      executionPlan: { description: { text: approvedText, status: "approved" } },
    },
  });

  const plan = buildExecutionPlan({ analysis: approvedAnalysis, documentModel: model() });
  assert.equal(plan.context.city, "Arlon");
  assert.equal(plan.description.text, approvedText);
  assert.equal(plan.description.status, "approved");
});

test("une duplication reconstruit tous les contenus générés avec la ville et l’identifiant de la copie", () => {
  const sourceAnalysisId = "premium-source-finalized";
  const copyAnalysisId = "premium-copy-editable";
  const staleSentence = "ME ELEC est une fiche Google Business associée à la catégorie « Électricien » à Non renseignée.";
  const inherited = {
    description: { text: staleSentence, status: "approved", analysisId: sourceAnalysisId },
    categoryItems: [{ id: "category-1", label: "Ancienne catégorie", status: "approved", analysisId: sourceAnalysisId }],
    serviceItems: [{ id: "service-1", text: "Ancien service généré", status: "approved", analysisId: sourceAnalysisId }],
    photos: [{ id: "photo-1", subject: "Ancienne photo", text: staleSentence, objective: "Ancien objectif", status: "approved", analysisId: sourceAnalysisId }],
    reviewMessages: { sms: { id: "sms", text: staleSentence, status: "approved", analysisId: sourceAnalysisId } },
    reviewResponses: [{ id: "response-1", text: staleSentence, status: "approved", analysisId: sourceAnalysisId }],
    reviewLink: "https://g.page/r/me-elec/review",
    reviewLinkStatus: "approved",
    posts: [{ id: "post-1", title: "Ancienne publication", text: staleSentence, status: "approved", analysisId: sourceAnalysisId }],
    actions: [{ id: "P-DESC", objective30Days: staleSentence, status: "approved", analysisId: sourceAnalysisId }],
  };
  const duplicated = analysis({
    analysisId: copyAnalysisId,
    business: {
      ...analysis().business,
      name: "ME ELEC",
      nom: "ME ELEC",
      ville: "Non-renseignee",
      activity: "Électricien",
      reviewed: { name: "ME ELEC", city: "Non renseignée", category: "Électricien" },
      normalized: { category: "Électricien", description: "", subtypes: ["Électricien"] },
    },
    manualReview: {
      questionnaireVersion: QUESTIONNAIRE_VERSION,
      confirmedCity: "Arlon",
      responses: { websiteConsistency: { value: "no_website", points: 0, checklist: ["Absence vérifiée"] } },
    },
  });
  const freshModel = buildDocumentModelFromAnalysis({
    ...duplicated,
    documentModel: runComposerForAnalysis(duplicated).output,
  });
  const rebuilt = rebuildDuplicatedExecutionPlanReview(freshModel.executionPlan, inherited, {
    analysisId: copyAnalysisId,
  });
  const confirmed = confirmReadyExecutionPlanReview(rebuilt, { analysisId: copyAnalysisId });
  const serialized = JSON.stringify(confirmed.review);

  assert.equal(confirmed.blocking.length, 0);
  assert.match(confirmed.review.description.text, /« Électricien » à Arlon\./);
  assert.doesNotMatch(serialized, /Non renseignée|Non-renseignee|Ancien service généré|Ancienne publication/);
  assert.equal(confirmed.review.reviewLink, inherited.reviewLink);
  assert.equal(confirmed.review.reviewLinkStatus, "approved");
  const generatedItems = [
    confirmed.review.description,
    ...confirmed.review.categoryItems,
    ...confirmed.review.serviceItems,
    ...confirmed.review.photos,
    ...Object.values(confirmed.review.reviewMessages),
    ...confirmed.review.reviewResponses,
    ...confirmed.review.posts,
    ...confirmed.review.actions,
  ];
  assert.ok(generatedItems.length > 0);
  assert.ok(generatedItems.every((item) => item.analysisId === copyAnalysisId));
  assert.ok(generatedItems.every((item) => item.analysisId !== sourceAnalysisId));

  const approvedCopy = {
    ...duplicated,
    manualReview: { ...duplicated.manualReview, executionPlan: confirmed.review },
  };
  const finalModel = applyReportCommercialPolicy(
    buildDocumentModelFromAnalysis({
      ...approvedCopy,
      documentModel: runComposerForAnalysis(approvedCopy).output,
    }),
    resolveReportCommercialPolicy("premium", "admin_manual"),
  );
  const finalHtml = addPreviewToolbar(renderAnalysisHtml(finalModel), copyAnalysisId, "approved", {
    reportType: "premium",
    requestedAnalysisId: copyAnalysisId,
    finalPdfTitle: buildAuditPdfFilename(approvedCopy, "2026-08-23"),
  });
  const controlHtml = addPreviewToolbar(renderAnalysisHtml(finalModel), copyAnalysisId, "preview_ready", {
    reportType: "premium",
    requestedAnalysisId: copyAnalysisId,
    controlPdfTitle: buildControlPdfTitle(approvedCopy, "2026-08-23"),
  });
  const visibleFinalHtml = finalHtml
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  assert.doesNotMatch(finalHtml, /Non renseignée|Non-renseignee|DOCUMENT DE CONTRÔLE — NON APPROUVÉ/);
  assert.doesNotMatch(visibleFinalHtml, /Diagnostic gratuit|offert|99 € déjà investis|intégralement déduits/i);
  assert.match(controlHtml, /DOCUMENT DE CONTRÔLE — NON APPROUVÉ/);
  assert.equal(buildAuditPdfFilename(approvedCopy, "2026-08-23"), "Audit-Efficia-Premium_ME-ELEC_Arlon_2026-08-23.pdf");
});

test("la reconstruction d’une copie suit un changement de ville et refuse d’inventer une ville absente", () => {
  const inherited = {
    description: { text: "Description historique à Arlon", status: "approved" },
    posts: [{ id: "post-1", text: "Publication historique à Arlon", status: "approved" }],
  };
  const withCity = analysis({
    analysisId: "copy-namur",
    business: {
      ...analysis().business,
      name: "Entreprise Test",
      activity: "Électricien",
      reviewed: { city: "Non renseignée", category: "Électricien" },
      normalized: { category: "Électricien", description: "", subtypes: ["Électricien"] },
    },
    manualReview: { confirmedCity: "Namur" },
  });
  const withCityModel = buildDocumentModelFromAnalysis({ ...withCity, documentModel: runComposerForAnalysis(withCity).output });
  const rebuiltWithCity = rebuildDuplicatedExecutionPlanReview(withCityModel.executionPlan, inherited, { analysisId: withCity.analysisId });
  assert.match(rebuiltWithCity.description.text, /à Namur\./);
  assert.doesNotMatch(JSON.stringify(rebuiltWithCity), /historique à Arlon/);

  const withoutCity = analysis({
    analysisId: "copy-without-city",
    business: {
      ...analysis().business,
      ville: "Non-renseignee",
      reviewed: { city: "Unknown", category: "Électricien" },
      normalized: { category: "Électricien", description: "", subtypes: ["Électricien"] },
    },
    manualReview: { confirmedCity: "" },
  });
  const withoutCityModel = buildDocumentModelFromAnalysis({ ...withoutCity, documentModel: runComposerForAnalysis(withoutCity).output });
  const rebuiltWithoutCity = rebuildDuplicatedExecutionPlanReview(withoutCityModel.executionPlan, inherited, { analysisId: withoutCity.analysisId });
  const confirmation = confirmReadyExecutionPlanReview(rebuiltWithoutCity, { analysisId: withoutCity.analysisId });
  assert.equal(rebuiltWithoutCity.description.text, "");
  assert.ok(confirmation.blocking.includes("Description proposée"));
  assert.doesNotMatch(JSON.stringify(rebuiltWithoutCity), /Non renseignée|Non-renseignee|Unknown|historique à Arlon/);
});

test("aucun service, attribut, publication ou lien d’avis n’est inventé", () => {
  const plan = buildExecutionPlan({ analysis: analysis(), documentModel: model() });
  assert.equal(plan.approved.serviceItems.length, 0);
  assert.equal(plan.approved.posts.length, 0);
  assert.equal(plan.approved.reviewLink, null);
  assert.deepEqual(plan.profileMap.attributes, []);
  assert.ok(plan.posts.every((item) => item.status === "needs_confirmation"));
});

test("un lien d’avis n’entre dans le PDF qu’après validation explicite", () => {
  const unapproved = buildExecutionPlan({ analysis: analysis({ manualReview: { executionPlan: { reviewLink: "https://g.page/r/test/review", reviewLinkStatus: "needs_confirmation" } } }), documentModel: model() });
  assert.equal(unapproved.approved.reviewLink, null);
  const approved = buildExecutionPlan({ analysis: analysis({ manualReview: { executionPlan: { reviewLink: "https://g.page/r/test/review", reviewLinkStatus: "approved" } } }), documentModel: model() });
  assert.equal(approved.approved.reviewLink, "https://g.page/r/test/review");
});

test("la normalisation de validation admin refuse les statuts inconnus et borne les listes", () => {
  const normalized = normalizeExecutionPlanReview({
    description: { text: "Texte vérifié", status: "approved" },
    photos: Array.from({ length: 20 }, (_, index) => ({ subject: `Photo ${index}`, status: "invalid" })),
  });
  assert.equal(normalized.description.status, "approved");
  assert.equal(normalized.photos.length, 12);
  assert.ok(normalized.photos.every((item) => item.status === "needs_confirmation"));
});

test("l’approbation humaine peut détecter tous les éléments encore à confirmer", () => {
  assert.ok(countPendingExecutionReview({ description: { text: "Brouillon", status: "needs_confirmation" } }) > 0);
  assert.equal(countPendingExecutionReview({
    description: { text: "Validé", status: "approved" },
    reviewLinkStatus: "not_applicable",
    reviewMessages: {
      sms: { status: "not_applicable" }, email: { status: "not_applicable" }, oral: { status: "not_applicable" },
    },
  }), 0);
});

test("la confirmation globale approuve les contenus ordinaires complets en une action", () => {
  const result = confirmReadyExecutionPlanReview({
    description: { id: "description", text: "Description factuelle complète", status: "needs_confirmation" },
    categoryItems: [{ id: "category", label: "Électricien", status: "needs_confirmation" }],
    photos: [{ id: "photo", subject: "Équipe", text: "Plan horizontal", objective: "Montrer le savoir-faire", status: "needs_confirmation" }],
    reviewMessages: {
      sms: { id: "sms", text: "Message factuel", status: "needs_confirmation" },
      email: { status: "not_applicable" },
      oral: { status: "not_applicable" },
    },
    reviewLink: "https://example.test/review",
    reviewLinkStatus: "needs_confirmation",
  });

  assert.equal(result.blocking.length, 0);
  assert.equal(result.confirmedCount, 5);
  assert.equal(result.review.description.status, "approved");
  assert.equal(result.review.categoryItems[0].status, "approved");
  assert.equal(result.review.photos[0].status, "approved");
  assert.equal(result.review.reviewMessages.sms.status, "approved");
  assert.equal(result.review.reviewLinkStatus, "approved");
});

test("la confirmation globale conserve les refus et bloque les contenus vides, conflictuels ou mal structurés", () => {
  const result = confirmReadyExecutionPlanReview({
    description: { id: "description", text: "", status: "needs_confirmation" },
    categoryItems: [
      { id: "refused", label: "Refus explicite", status: "not_applicable" },
      { id: "foreign", label: "Autre audit", status: "needs_confirmation", analysisId: "analysis-other" },
    ],
    serviceItems: [
      { id: "conflict", text: "Service", status: "needs_confirmation", conflict: "À arbitrer" },
      { id: "rejected", text: "Contenu explicitement refusé", status: "needs_confirmation", rejected: true },
    ],
    photos: [{ id: "photo", subject: "Équipe", text: "", objective: "Preuve", status: "needs_confirmation" }],
    reviewMessages: { sms: { status: "not_applicable" }, email: { status: "not_applicable" }, oral: { status: "not_applicable" } },
    reviewLink: "javascript:alert(1)",
    reviewLinkStatus: "needs_confirmation",
  }, { analysisId: "analysis-current" });

  assert.equal(result.review.categoryItems[0].status, "not_applicable");
  assert.equal(result.confirmedCount, 0);
  assert.deepEqual(result.blocking, [
    "Description proposée",
    "Catégorie 2",
    "Service 1",
    "Service 2",
    "Photo 1",
    "Lien direct d’avis",
  ]);
  assert.deepEqual(result.blockingDetails.map((item) => item.code), [
    "required_content_missing",
    "analysis_id_mismatch",
    "generation_conflict",
    "content_refused",
    "incomplete_structure",
    "invalid_url",
  ]);
  assert.equal(result.blockingDetails[1].group, "categoryItems");
  assert.equal(result.blockingDetails[1].id, "foreign");
});

test("la reconstruction classe un lien d’avis réellement absent comme non applicable", () => {
  const freshPlan = buildExecutionPlan({ analysis: analysis(), documentModel: model() });
  const rebuilt = rebuildDuplicatedExecutionPlanReview(freshPlan, {}, { analysisId: "copy-without-review-link" });
  const confirmation = confirmReadyExecutionPlanReview(rebuilt, { analysisId: "copy-without-review-link" });

  assert.equal(rebuilt.reviewLink, "");
  assert.equal(rebuilt.reviewLinkStatus, "not_applicable");
  assert.equal(confirmation.blocking.includes("Lien direct d’avis"), false);
  assert.equal(confirmation.review.reviewLinkStatus, "not_applicable");
});

test("le document final contient le plan enrichi mais jamais les contenus non validés", () => {
  const base = analysis({ documentModel: model(), manualReview: { executionPlan: {
    description: { text: "DESCRIPTION VALIDÉE UNIQUE", status: "approved" },
    posts: [{ title: "POST NON VALIDÉ", text: "Contenu faux à ne pas publier", status: "needs_confirmation" }],
  } } });
  const document = buildDocumentModelFromAnalysis(base);
  const html = renderAnalysisHtml(document);
  assert.match(html, /Votre plan d’exécution sur 30 jours/);
  assert.match(html, /DESCRIPTION VALIDÉE UNIQUE/);
  assert.doesNotMatch(html, /Contenu faux à ne pas publier/);
  assert.doesNotMatch(html, /<h2>Votre feuille de route personnalisée<\/h2>/);
  assert.match(html, /Comment mesurer les progrès dans 30 jours/);
});

test("position zéro ou absente : aucun ordinal trompeur ; position normale conservée", () => {
  assert.equal(formatOrdinal(0), null);
  assert.equal(formatOrdinal(null), null);
  assert.equal(formatOrdinal(7), "7e");
  assert.match(buildConstat({ signal: "position", evidence: { value: 0 } }), /n’a pas été détectée/);
  assert.match(buildConstat({ signal: "position", evidence: { value: 7 } }), /7e position/);
});

test("les statistiques indisponibles ne sont jamais affichées comme zéro", () => {
  const empty = analysis({ business: { ...analysis().business, rating: null, reviews: null, photosCount: null } });
  const plan = buildExecutionPlan({ analysis: empty, documentModel: model() });
  assert.ok(plan.measurement.every((row) => row.today !== 0));
  assert.ok(plan.measurement.some((row) => row.today === "À relever"));
});

test("aucun fallback générique interdit ne subsiste", () => {
  const unknown = model({ priorities: [{ id: "UNKNOWN", signal: "unknown", title: "Action inconnue", reasoning: "Constat." }] });
  const plan = buildExecutionPlan({ analysis: analysis(), documentModel: unknown });
  assert.doesNotMatch(JSON.stringify(plan), /Transformer cette priorité en action vérifiable/);
});

test("la description proposée est complète, bornée et non publiée avant validation", () => {
  const plan = buildExecutionPlan({ analysis: analysis(), documentModel: model() });
  assert.ok(plan.description.text.length >= 450 && plan.description.text.length <= 700);
  assert.equal(plan.description.status, "needs_confirmation");
  assert.equal(plan.approved.description, null);
  assert.doesNotMatch(plan.description.text, /https?:\/\//);
});

test("la liste photo contient 6 à 10 sujets sectoriels avec cadrage, objectif, priorité et semaine", () => {
  const restaurant = buildExecutionPlan({ analysis: analysis(), documentModel: model() });
  assert.ok(restaurant.guidance.photos.length >= 6 && restaurant.guidance.photos.length <= 10);
  assert.ok(restaurant.photos.every((item) => item.subject && item.text && item.objective && item.priority && item.week >= 1 && item.week <= 4));
  const artisan = buildExecutionPlan({ analysis: analysis({ business: { ...analysis().business, activity: "Électricien", normalized: { category: "Électricien" } } }), documentModel: model() });
  assert.equal(artisan.sector, "artisan");
  assert.match(artisan.photos.map((item) => item.subject).join(" "), /Intervention|Véhicule/);
});

test("une note rassurante inférieure au panel reçoit un titre cohérent et non alarmiste", () => {
  const ratingModel = model({ priorities: [{ id: "R", signal: "rating", title: "Votre note vous dessert", evidence: { value: 4.4, competitorMedian: 4.7 }, reasoning: "Ancien texte." }] });
  const plan = buildExecutionPlan({ analysis: analysis({ business: { ...analysis().business, rating: 4.4 } }), documentModel: ratingModel });
  assert.match(plan.actions[0].title, /reste rassurante/);
  assert.doesNotMatch(plan.actions[0].title, /dessert|handicap/i);
});

test("la synthèse des forces ne reprend aucun frein", () => {
  const strong = buildExecutionPlan({ analysis: analysis({ business: { ...analysis().business, rating: 4.5, reviews: 175, photosCount: 34 } }), documentModel: model() });
  assert.match(strong.strengthSummary, /4,5\/5 et vos 175 avis constituent déjà une base de confiance solide/);
  assert.match(strong.strengthSummary, /34 photos/);
  assert.doesNotMatch(strong.strengthSummary, /limite|écart|frein|inférieur/i);

  const early = buildExecutionPlan({ analysis: analysis({ business: { ...analysis().business, rating: 4.4, reviews: 7, photosCount: 0 } }), documentModel: model() });
  assert.match(early.strengthSummary, /premiers avis constituent une base utile/);
});

test("les recommandations restaurant différencient façade, entrée, plat, dessert et boisson", () => {
  const plan = buildExecutionPlan({ analysis: analysis(), documentModel: model() });
  const rows = plan.guidance.photos;
  const by = (pattern) => rows.find((item) => pattern.test(item.subject));
  assert.match(by(/Façade/).objective, /identifier/);
  assert.match(by(/Entrée/).objective, /accès|arrivée/);
  assert.notEqual(by(/Façade/).objective, by(/Entrée/).objective);
  assert.match(by(/plat/i).objective, /offre principale/);
  assert.match(by(/dessert/i).objective, /diversité/);
  assert.match(by(/boisson/i).objective, /expérience/);
});

test("le système d’avis fournit trois messages, six réponses, une routine et exige un lien approuvé", () => {
  const plan = buildExecutionPlan({ analysis: analysis(), documentModel: model() });
  assert.equal(plan.reviews.messages.length, 3);
  assert.equal(plan.reviews.responseTemplates.length, 6);
  assert.ok(plan.reviews.routine.length >= 6);
  assert.equal(plan.approved.reviewLink, null);
  assert.equal(plan.actions.find((item) => item.signal === "reviews").hasDeliverable, true);
  assert.equal(plan.actions.find((item) => item.signal === "reviews").deliverableMode, "recommendation");
  assert.doesNotMatch(plan.actions.find((item) => item.signal === "reviews").steps.join(" "), /message approuvé/);
});

test("le playbook note moyenne produit une estimation mathématique prudente", () => {
  const ratingModel = model({ priorities: [{ id: "RATING", signal: "rating", title: "Améliorer la note", reasoning: "Note à suivre." }] });
  const plan = buildExecutionPlan({ analysis: analysis({ business: { ...analysis().business, rating: 4.2, reviews: 100 } }), documentModel: ratingModel });
  assert.match(plan.actions[0].objective30Days, /note moyenne/);
  assert.deepEqual(plan.reviews.ratingEstimate, { target: 4.3, needed: 15 });
  const disproportionate = buildExecutionPlan({ analysis: analysis({ business: { ...analysis().business, rating: 4.7, reviews: 10000 } }), documentModel: ratingModel });
  assert.equal(disproportionate.reviews.ratingEstimate, null);
});

test("une priorité visibilité contient des leviers contrôlables en plus de la mesure", () => {
  const positionModel = model({ priorities: [{ id: "POSITION", signal: "position", title: "Visibilité", reasoning: "Position variable." }] });
  const plan = buildExecutionPlan({ analysis: analysis(), documentModel: positionModel });
  assert.ok(plan.visibility.length >= 8);
  assert.ok(plan.visibility.some((row) => row.label === "Catégorie principale"));
  assert.ok(plan.visibility.some((row) => row.label === "Description"));
  assert.match(plan.actions[0].steps.join(" "), /leviers|informations essentielles/i);
});

test("le tableau J0 distingue les totaux historiques des nouveaux éléments", () => {
  const plan = buildExecutionPlan({ analysis: analysis(), documentModel: model() });
  assert.equal(plan.measurement.find((row) => row.indicator === "Nombre total d’avis").today, 18);
  assert.equal(plan.measurement.find((row) => row.indicator === "Nombre total de photos").today, 7);
  assert.equal(plan.measurement.find((row) => row.indicator === "Nouveaux avis pendant les 30 jours").today, "À mesurer");
  assert.ok(plan.measurement.every((row) => row.day30 === ""));
});

test("chaque référence de livrable est rendue ou remplacée par une préparation autonome", () => {
  const draft = buildExecutionPlan({ analysis: analysis(), documentModel: model() });
  assert.equal(draft.integrity.valid, true);
  assert.ok(draft.actions.every((item) => !item.steps.join(" ").match(/liste approuvée|message approuvé|texte approuvé/)));

  const review = {
    description: { text: "Description factuelle approuvée. ".repeat(20), status: "approved" },
    photos: Array.from({ length: 8 }, (_, i) => ({ id: `photo-${i + 1}`, subject: `Sujet vérifié ${i + 1}`, text: "Plan horizontal", objective: "Montrer un élément réel", priority: "haute", week: i % 4 + 1, status: "approved" })),
    reviewMessages: Object.fromEntries(["sms", "email", "oral"].map((id) => [id, { id, label: id, text: `Message ${id}`, status: "approved" }])),
    reviewResponses: Array.from({ length: 6 }, (_, i) => ({ id: `response-${i + 1}`, label: `Réponse ${i + 1}`, text: `Réponse approuvée ${i + 1}`, status: "approved" })),
    reviewLink: "https://g.page/r/test/review", reviewLinkStatus: "approved",
    actions: model().priorities.slice(0, 3).map((p) => ({ id: p.id, status: "approved" })),
  };
  const approvedPlan = buildExecutionPlan({ analysis: analysis({ manualReview: { executionPlan: review } }), documentModel: model() });
  assert.equal(approvedPlan.integrity.valid, true);
  const html = renderAnalysisHtml({ ...model(), executionPlan: approvedPlan });
  assert.match(html, /Les photos à réaliser ce mois-ci/);
  assert.match(html, /Votre système d’avis prêt à utiliser/);
  assert.match(html, /Votre description Google prête à publier/);
});

test("l’approbation Premium est bloquée si un livrable manque ou reste à confirmer", () => {
  const plan = buildExecutionPlan({ analysis: analysis(), documentModel: model() });
  const issues = executionPlanApprovalIssues(plan, { description: { status: "needs_confirmation" } });
  assert.ok(issues.some((item) => /confirmer/.test(item)));
  assert.deepEqual(executionPlanApprovalIssues({ ...plan, integrity: { valid: true, missing: [] } }, {
    description: { status: "approved" }, reviewLinkStatus: "not_applicable",
    reviewMessages: { sms: { status: "not_applicable" }, email: { status: "not_applicable" }, oral: { status: "not_applicable" } },
  }), []);
});

test("une description absente génère une structure sectorielle visible mais non définitive", () => {
  const plan = buildExecutionPlan({ analysis: analysis(), documentModel: model() });
  assert.equal(plan.guidance.description.status, "generated_recommendation");
  assert.match(plan.guidance.description.title, /Structure recommandée/);
  assert.ok(plan.guidance.description.fields.some((item) => /cuisine|spécialités/.test(item)));
  assert.equal(plan.approved.description, null);
});

test("les recommandations photos sont sectorielles et le fallback reste prudent", () => {
  const restaurant = buildExecutionPlan({ analysis: analysis(), documentModel: model() });
  assert.ok(restaurant.guidance.photos.some((item) => /plat|salle|façade/i.test(item.subject)));
  const artisan = buildExecutionPlan({ analysis: analysis({ business: { ...analysis().business, activity: "Électricien", normalized: { category: "Électricien" } } }), documentModel: model() });
  assert.ok(artisan.guidance.photos.some((item) => /intervention|véhicule/i.test(item.subject)));
  const unknown = buildExecutionPlan({ analysis: analysis({ business: { ...analysis().business, activity: "Activité inconnue", normalized: { category: "Activité inconnue" } } }), documentModel: model() });
  assert.ok(unknown.guidance.photos.every((item) => !/plat|tableau électrique|certification|terrasse/i.test(item.subject)));
});

test("deux modèles d’avis prudents sont générés sans reconnaissance automatique de faute", () => {
  const plan = buildExecutionPlan({ analysis: analysis(), documentModel: model() });
  assert.match(plan.guidance.reviews.positive, /Merci/);
  assert.match(plan.guidance.reviews.negative, /poursuivre l’échange en privé/);
  assert.doesNotMatch(`${plan.guidance.reviews.positive} ${plan.guidance.reviews.negative}`, /nous avons commis|notre faute|remboursement garanti/i);
});

test("les recommandations non définitives restent visibles, les brouillons non approuvés restent masqués", () => {
  const base = analysis({ documentModel: model(), manualReview: { executionPlan: { description: { text: "BROUILLON SECRET", status: "needs_confirmation" } } } });
  const html = renderAnalysisHtml(buildDocumentModelFromAnalysis(base));
  assert.match(html, /Structure recommandée pour votre description/);
  assert.match(html, /Les photos à ajouter en priorité/);
  assert.match(html, /Deux bases pour répondre aux avis/);
  assert.match(html, /Audit Premium/);
  assert.match(html, /Pack Visibilité Google/);
  assert.match(html, /Pack Performance/);
  assert.doesNotMatch(html, /BROUILLON SECRET/);
});

test("les observations factuelles ne contredisent jamais les valeurs brutes", () => {
  const zero = buildExecutionPlan({ analysis: analysis({ business: { ...analysis().business, photosCount: 0, descriptionLength: 0 } }), documentModel: model() });
  const photo = zero.actions.find((item) => item.signal === "photos").observed;
  const description = zero.actions.find((item) => item.signal === "description").observed;
  assert.match(photo, /aucune photo visible/);
  assert.doesNotMatch(photo, /base utile|galerie solide/i);
  assert.match(description, /aucune description/i);
  assert.doesNotMatch(description, /description existe/i);
});

test("le rendu n’affiche pas deux fois le titre d’une fiche d’action", () => {
  const plan = buildExecutionPlan({ analysis: analysis(), documentModel: model() });
  const html = renderAnalysisHtml({ ...model(), executionPlan: plan });
  assert.doesNotMatch(html, /<h2>Clarifier la description<\/h2>[\s\S]{0,300}<h3>Clarifier la description<\/h3>/);
});

test("le HTML Premium conserve les espaces sensibles jusque dans les titres et tarifs", () => {
  const plan = buildExecutionPlan({ analysis: analysis(), documentModel: model() });
  const html = renderAnalysisHtml({ ...model({ hero: { ...model().hero, businessName: "Restaurant Chan Sàrl" } }), executionPlan: plan });
  for (const expected of ["Restaurant Chan Sàrl", "sur 30 jours", "Comment mesurer les progrès dans 30 jours", "Cadre de lecture", "Ce qu'il faut retenir", "Votre audit est terminé", "Je souhaite gagner du temps", "Je souhaite aller plus loin", "349 €", "499 €", "99 €"]) {
    assert.match(html, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  for (const forbidden of ["ChanSàrl", "sur30jours", "mesurerles", "dans30jours", "Cadrede", "fautretenir", "estterminé", "gagnerdutemps", "allerplus", "349€", "499€", "99€"]) {
    assert.doesNotMatch(html, new RegExp(forbidden, "i"));
  }
  assert.match(html, /letter-spacing:\s*0\.012em/);
});

test("la couverture sépare la fiche de référence de la moyenne photos et traite la position zéro sans classement implicite", () => {
  const baseModel = model({
    hero: {
      ...model().hero,
      comparison: {
        you: { label: "Vous", rating: 4.5, reviews: 175, photos: 34 },
        best: { label: "Meilleure fiche observée", name: "Kore Ristorante", rating: 4.7, reviews: 510, photos: 518.67, photosLabel: "Moyenne concurrents", photosIsEstimate: true },
      },
      rank: { aheadCount: 3, totalCompetitors: 3, text: "Vous êtes derrière 3 concurrents." },
    },
    priorities: [{ id: "P", signal: "position", title: "Visibilité", evidence: { value: 0 }, reasoning: "Non détectée." }],
  });
  const plan = buildExecutionPlan({ analysis: analysis({ business: { ...analysis().business, localPosition: 0 } }), documentModel: baseModel });
  const html = renderAnalysisHtml({ ...baseModel, executionPlan: plan });
  assert.match(html, /Kore Ristorante/);
  assert.doesNotMatch(html, /510 avis[^<]*·[^<]*photo/);
  assert.match(html, /Repère du panel : environ 519 photos en moyenne/);
  assert.match(html, /La fiche n’a pas été détectée dans la zone de résultats observée\. Les trois concurrents analysés apparaissaient avant elle/);
  assert.doesNotMatch(html, /Vous êtes derrière 3 concurrents/);
});

test("la liste commerciale reprend uniquement les trois actions réellement détaillées", () => {
  const three = model({ priorities: [
    { id: "POS", signal: "position", title: "Visibilité", reasoning: "Position." },
    { id: "PHO", signal: "photos", title: "Photos", reasoning: "Photos." },
    { id: "DES", signal: "description", title: "Description", reasoning: "Description." },
    { id: "REV", signal: "reviews", title: "Avis hors périmètre", reasoning: "Avis." },
  ] });
  const plan = buildExecutionPlan({ analysis: analysis(), documentModel: three });
  const html = renderAnalysisHtml({ ...three, executionPlan: plan });
  const commercial = html.slice(html.indexOf("Ce que nous corrigeons, identifié dans ce rapport"));
  assert.match(commercial, />Visibilité</);
  assert.match(commercial, />Galerie photos</);
  assert.match(commercial, />Description</);
  assert.doesNotMatch(commercial, />Avis</);
});
