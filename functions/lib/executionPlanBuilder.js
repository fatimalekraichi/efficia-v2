import { EXECUTION_SIGNAL_PLAYBOOKS, getExecutionPlaybook } from "./executionPlaybooks.js";
import { resolveReportCity } from "./auditComposition.js";
import { normalizeCategoryLabel } from "./presentationFormatter.js";

const ALLOWED_STATUSES = new Set(["approved", "needs_confirmation", "not_applicable"]);
const OWNERS = new Set(["dirigeant", "membre de l’équipe", "photographe", "prestataire", "Efficia Digital"]);

function text(value, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function status(value, fallback = "needs_confirmation") {
  return ALLOWED_STATUSES.has(value) ? value : fallback;
}

function list(value, max = 20) {
  return Array.isArray(value) ? value.map((item) => text(item, 500)).filter(Boolean).slice(0, max) : [];
}

function first(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== "");
}

function reviewedValue(analysis, key, fallbackKey = key) {
  return first(analysis?.business?.reviewed?.[key], analysis?.business?.[fallbackKey]);
}

function knownContext(analysis = {}) {
  const normalized = analysis.business?.normalized || {};
  const category = normalizeCategoryLabel(first(reviewedValue(analysis, "category", "activity"), normalized.category, normalized.type));
  return {
    name: first(reviewedValue(analysis, "name", "name"), analysis.business?.nom),
    city: resolveReportCity(analysis),
    category,
    description: text(normalized.description, 1200),
    secondaryCategories: Array.isArray(normalized.subtypes)
      ? normalized.subtypes.map((item) => text(item, 160)).filter(Boolean)
      : [],
    services: Array.isArray(normalized.services)
      ? normalized.services.map((item) => text(typeof item === "string" ? item : item?.name, 180)).filter(Boolean)
      : [],
    reviewLink: text(normalized.review_link || normalized.reviews_link || normalized.place_review_link, 1200),
    rating: reviewedValue(analysis, "rating"),
    reviews: reviewedValue(analysis, "reviews"),
    photos: reviewedValue(analysis, "photosCount"),
    position: reviewedValue(analysis, "localPosition"),
    query: first(analysis.business?.reviewed?.searchQuery, analysis.business?.searchQuery),
    descriptionLength: Number(analysis.business?.descriptionLength ?? normalized.description?.length ?? 0),
    website: first(normalized.website, normalized.site),
    phone: first(normalized.phone, normalized.phone_number),
    hours: first(normalized.working_hours, normalized.hours),
  };
}

function factualObservation(priority, context) {
  const rawValue = priority?.evidence?.value ?? (priority.signal === "photos" ? context.photos
    : priority.signal === "reviews" ? context.reviews
      : priority.signal === "rating" ? context.rating
        : priority.signal === "position" ? context.position
          : priority.signal === "description" ? context.descriptionLength : null);
  const value = Number(rawValue);
  const reference = Number(priority?.evidence?.competitorMedian);
  if (priority.signal === "photos" && Number.isFinite(value)) {
    if (value === 0) return "Votre fiche ne dispose actuellement d’aucune photo visible. Une première série de visuels réels permettrait de montrer concrètement votre activité et de rassurer les personnes qui comparent plusieurs fiches.";
    if (value < 10) return `Votre fiche présente actuellement ${Math.round(value)} photos. Cette base reste limitée et gagnerait à montrer davantage de situations réelles liées à votre activité.`;
    if (Number.isFinite(reference) && value < reference) return `Votre galerie compte ${Math.round(value)} photos, mais reste moins fournie que le niveau médian observé autour de votre fiche. L’enrichir progressivement donnerait davantage de repères concrets au moment du choix.`;
    return `Votre galerie compte ${Math.round(value)} photos et constitue déjà une base solide. L’enjeu est surtout de la maintenir récente, variée et fidèle à l’activité réelle.`;
  }
  if (priority.signal === "description") {
    if (!context.descriptionLength) return "Aucune description n’est visible sur votre fiche Google. Un prospect ne peut donc pas comprendre immédiatement vos services, votre zone d’intervention et ce qui distingue votre entreprise.";
    return `Votre description existe, mais ses ${Math.round(context.descriptionLength)} caractères ne permettent pas encore de présenter clairement toutes les informations utiles et vérifiées.`;
  }
  if (priority.signal === "reviews" && Number.isFinite(value)) {
    if (value < 20) return `Votre fiche affiche ${Math.round(value)} avis. Ce volume peut encore manquer de recul pour une personne qui compare plusieurs établissements locaux.`;
    if (Number.isFinite(reference) && value < reference) return `Votre fiche affiche déjà ${Math.round(value)} avis, mais le panel observé présente un volume médian plus élevé. Une collecte régulière permettrait de réduire progressivement cet écart.`;
    return `Votre fiche bénéficie déjà de ${Math.round(value)} avis. La priorité consiste à maintenir une collecte régulière et des réponses personnalisées.`;
  }
  if (priority.signal === "rating" && Number.isFinite(value)) {
    if (value < 4) return `Votre note actuelle est de ${String(value.toFixed(1)).replace(".", ",")}/5. Une routine d’avis conforme et un traitement attentif des retours récents peuvent aider à la faire évoluer progressivement.`;
    if (Number.isFinite(reference) && value < reference) return `Votre note de ${String(value.toFixed(1)).replace(".", ",")}/5 est rassurante, mais reste légèrement inférieure au niveau médian du panel observé.`;
    return `Votre note de ${String(value.toFixed(1)).replace(".", ",")}/5 constitue déjà un signal de confiance. L’objectif est de la préserver grâce à des réponses régulières et personnalisées.`;
  }
  if (priority.signal === "position") {
    if (!Number.isFinite(value) || value <= 0) return "La fiche n’a pas été détectée dans la zone de résultats observée pour la recherche testée. Ce constat dépend du lieu, du moment et de l’appareil utilisés.";
    if (value > 3) return `La fiche a été observée en ${value}e position sur la recherche testée. Elle se situe donc hors des trois premiers résultats lors de ce contrôle ponctuel.`;
    return `La fiche a été observée en ${value === 1 ? "première" : `${value}e`} position sur la recherche testée. Le suivi doit vérifier la stabilité de cette visibilité selon le lieu et le moment.`;
  }
  return text(priority.reasoning, 1200);
}

function factualTitle(priority, context) {
  const value = Number(priority?.evidence?.value ?? (priority.signal === "rating" ? context.rating : priority.signal === "position" ? context.position : null));
  const reference = Number(priority?.evidence?.competitorMedian);
  if (priority.signal === "rating" && Number.isFinite(value)) {
    if (value >= 4 && Number.isFinite(reference) && value < reference) return "Votre note reste rassurante, mais elle est inférieure à celle du panel observé";
    if (value >= 4) return "Votre note constitue déjà un signal de confiance à préserver";
    return "Votre note peut être renforcée progressivement grâce aux retours clients récents";
  }
  if (priority.signal === "position" && (!Number.isFinite(value) || value <= 0)) return "La fiche n’a pas été détectée dans la zone de résultats observée";
  return text(priority.title, 300);
}

function conservativeDescription(context) {
  if (!context.name || !context.category || !context.city) return "";
  const services = context.services.length
    ? ` Les prestations actuellement vérifiées comprennent : ${context.services.join(", ")}.`
    : " Les prestations exactes doivent être confirmées avant publication afin que le texte reste fidèle à l’activité réelle.";
  return `${context.name} est une fiche Google Business associée à la catégorie « ${context.category} » à ${context.city}. Cette description proposée doit présenter clairement l’activité, les prestations réellement assurées et les informations utiles aux personnes qui recherchent l’entreprise.${services} Avant publication, vérifiez chaque formulation, complétez uniquement avec des éléments factuels et retirez toute information qui ne correspond pas à la situation actuelle. L’objectif est d’offrir une présentation naturelle, lisible et précise, sans promesse de résultat ni accumulation artificielle de mots-clés.`.slice(0, 700).trim();
}

function approvedItem(item) {
  return item && item.status === "approved" && text(item.text || item.label || item.subject || item.title);
}

function normalizeEditableItem(item, fallback = {}) {
  const source = typeof item === "string" ? { text: item, label: fallback.label, status: "approved" } : item;
  return {
    ...fallback,
    ...source,
    status: status(source?.status, fallback.status),
    text: text(source?.text ?? fallback.text, 5000),
    label: text(source?.label ?? fallback.label, 500),
    subject: text(source?.subject ?? fallback.subject, 500),
    title: text(source?.title ?? fallback.title, 500),
  };
}

function buildActionCards(documentModel, review, context) {
  const overrides = new Map((review?.actions || []).map((item) => [item?.id, item]));
  return (Array.isArray(documentModel?.priorities) ? documentModel.priorities : []).slice(0, 3).map((priority, index) => {
    const playbook = EXECUTION_SIGNAL_PLAYBOOKS[priority.signal] || {
      outcome: "Réaliser et contrôler cette priorité au cours des 30 prochains jours.",
      owner: "dirigeant",
      metric: "vues",
      doneWhen: "L’action approuvée est réalisée et son résultat est contrôlé dans la fiche publique.",
      steps: ["Relisez le constat observé.", "Vérifiez les informations nécessaires.", "Réalisez l’action approuvée.", "Contrôlez le résultat dans la fiche publique.", "Notez la date de réalisation.", "Revenez sur l’indicateur dans 30 jours."],
    };
    const override = overrides.get(priority.id) || {};
    return {
      rank: index + 1,
      id: priority.id,
      signal: priority.signal,
      title: factualTitle(priority, context),
      observed: factualObservation(priority, context),
      objective30Days: text(override.objective30Days, 600) || playbook.outcome,
      steps: list(override.steps, 10).length ? list(override.steps, 10) : playbook.steps,
      deliverable: text(override.deliverable, 1600),
      deliverableStatus: status(override.deliverableStatus),
      owner: OWNERS.has(override.owner) ? override.owner : playbook.owner,
      estimatedTime: first(priority.actionability?.estimatedTime, override.estimatedTime, null),
      doneWhen: text(override.doneWhen, 600) || playbook.doneWhen,
      metric: text(override.metric, 120) || playbook.metric,
      status: status(override.status),
    };
  });
}

function descriptionGuidance(playbook, context, needed) {
  if (!needed) return null;
  return {
    status: "generated_recommendation",
    title: "Structure recommandée pour votre description",
    objective: "Présenter clairement l’activité et les informations vérifiées qui aident une personne à comprendre la fiche avant une prise de contact.",
    fields: playbook.descriptionFields || ["activité principale à confirmer", "zone desservie à confirmer", "élément différenciant à confirmer"],
    outline: ["Ouverture : activité principale et localisation.", "Développement : prestations, produits ou spécialités uniquement s’ils sont vérifiés.", "Réassurance : type de clientèle et élément différenciant à confirmer.", "Conclusion : modalité de prise de contact vérifiée."],
    missing: [!context.services.length ? "prestations ou spécialités à confirmer" : null, "zone desservie à confirmer", "élément différenciant à confirmer"].filter(Boolean),
    packNote: "Dans le Pack Visibilité Google, Efficia rédige avec vous une description complète, optimisée pour votre activité, puis l’intègre à votre fiche après validation.",
  };
}

function photoGuidance(playbook) {
  const describe = (subject) => {
    const value = subject.toLowerCase();
    if (/façade|enseigne/.test(value)) return { objective: "Permettre d’identifier clairement l’établissement depuis la rue.", framing: "Plan horizontal, façade et enseigne entièrement visibles, avec une lumière naturelle." };
    if (/entrée|accès/.test(value)) return { objective: "Rassurer sur l’accès et montrer le parcours d’arrivée.", framing: "Point de vue d’un visiteur approchant l’entrée, accès dégagé et repères visibles." };
    if (/salle|accueil|bureau|espace/.test(value)) return { objective: "Donner un aperçu fidèle de l’environnement dans lequel la personne sera accueillie.", framing: "Plan large, espace rangé et lumineux, sans donnée personnelle visible." };
    if (/équipe|portrait/.test(value)) return { objective: "Humaniser la fiche et montrer les personnes qui représentent réellement l’activité.", framing: "Plan naturel, personnes consentantes, arrière-plan simple." };
    if (/dessert/.test(value)) return { objective: "Illustrer la diversité de la carte avec un dessert réellement proposé.", framing: "Dessert net au centre du cadre, lumière naturelle et présentation fidèle au service réel." };
    if (/boisson/.test(value)) return { objective: "Compléter l’aperçu de l’expérience avec une boisson réellement proposée.", framing: "Verre ou contenant net, décor sobre et présentation fidèle à la réalité." };
    if (/plat/.test(value)) return { objective: "Mettre en avant l’offre principale à travers un plat réellement proposé.", framing: "Plat net, cadrage rapproché et lumière naturelle, sans mise en scène trompeuse." };
    if (/produit|rayon/.test(value)) return { objective: "Illustrer concrètement un produit réellement proposé sans créer de promesse non vérifiée.", framing: "Sujet principal net, lumière naturelle, présentation fidèle à ce qui est réellement proposé." };
    if (/intervention|résultat|travaux|réalisation/.test(value)) return { objective: "Montrer le déroulement ou le résultat concret d’un travail réel.", framing: "Plan suffisamment large pour comprendre le contexte, sans adresse ni donnée client visible." };
    if (/matériel|outil|équipement|technique/.test(value)) return { objective: "Apporter un repère concret sur la méthode ou les moyens réellement utilisés.", framing: "Détail net en situation réelle, sans marque mise en avant artificiellement." };
    if (/accès|stationnement|signalétique/.test(value)) return { objective: "Faciliter l’arrivée et réduire les hésitations pratiques avant une visite.", framing: "Point de vue proche de celui d’un visiteur, accès et repères clairement visibles." };
    return { objective: "Apporter une preuve visuelle supplémentaire, réelle et utile au moment de choisir.", framing: "Plan simple, lumineux et fidèle à la réalité, sans donnée confidentielle." };
  };
  const restaurantEssentials = ["Façade et enseigne", "Entrée depuis la rue", "Salle dans son état réel", "Un plat réellement proposé", "Un dessert réellement proposé", "Une boisson réellement proposée"];
  const subjects = restaurantEssentials.every((subject) => playbook.photoSubjects.includes(subject))
    ? restaurantEssentials
    : playbook.photoSubjects.slice(0, 6);
  return subjects.map((subject, index) => ({
    id: `photo-guide-${index + 1}`, subject, ...describe(subject),
    priority: index < 4 ? "Haute" : "Normale", week: (index % 4) + 1, status: "generated_recommendation",
  }));
}

function reviewGuidance(playbook) {
  const audience = playbook.sector === "restaurant" ? "établissement" : playbook.sector === "artisan" ? "entreprise" : "équipe";
  return {
    status: "generated_recommendation",
    positive: `Merci [prénom] pour votre retour. Nous sommes heureux que vous ayez apprécié [élément précis mentionné dans l’avis]. Toute l’équipe de notre ${audience} vous remercie pour votre confiance et sera ravie de vous accueillir à nouveau.`,
    negative: "Bonjour [prénom], merci d’avoir pris le temps de partager votre expérience. Nous regrettons qu’elle n’ait pas répondu à vos attentes. Afin de mieux comprendre la situation et de pouvoir vous répondre précisément, nous vous invitons à poursuivre l’échange en privé via [coordonnée validée].",
    usage: "Ces modèles servent de base. Une bonne réponse doit reprendre un élément précis de l’avis afin d’éviter une impression automatisée.",
    avoid: ["Ne pas contester agressivement l’avis.", "Ne pas révéler d’information personnelle.", "Ne pas reconnaître automatiquement une faute.", "Ne pas promettre de remboursement ou de geste commercial non validé."],
    packNote: "Dans le Pack Visibilité Google, Efficia adapte les modèles à votre établissement et prépare votre système de réponse. Dans le Pack Performance, les réponses peuvent être personnalisées et suivies dans le temps.",
  };
}

function personalizedOverview(context, actions) {
  const facts = [];
  if (Number.isFinite(Number(context.rating))) facts.push(`une note de ${String(Number(context.rating).toFixed(1)).replace(".", ",")}/5`);
  if (Number.isFinite(Number(context.reviews))) facts.push(`${Math.round(Number(context.reviews))} avis`);
  if (Number.isFinite(Number(context.photos))) facts.push(`${Math.round(Number(context.photos))} photo${Number(context.photos) === 1 ? "" : "s"}`);
  const location = context.city ? ` à ${context.city}` : "";
  const labels = { position: "la visibilité sur la recherche testée", reviews: "le volume et le suivi des avis", rating: "la note moyenne", photos: "la galerie photos", description: "la description", categories: "les catégories" };
  const priorities = actions.slice(0, 2).map((item) => labels[item.signal]).filter(Boolean).join(" et ");
  return `${context.name || "Votre fiche"}${location} affiche actuellement ${facts.join(", ") || "plusieurs informations publiques vérifiables"}. Les principaux leviers identifiés concernent ${priorities || "la présentation et la visibilité de la fiche"}.`;
}

function strengthSummary(context) {
  const rating = Number(context.rating);
  const reviews = Number(context.reviews);
  const photos = Number(context.photos);
  const parts = [];
  if (Number.isFinite(rating) && Number.isFinite(reviews)) {
    if (reviews >= 50) parts.push(`Votre note de ${String(rating.toFixed(1)).replace(".", ",")}/5 et vos ${Math.round(reviews)} avis constituent déjà une base de confiance solide.`);
    else if (reviews > 0) parts.push(`Votre note de ${String(rating.toFixed(1)).replace(".", ",")}/5 est positive. Malgré un volume encore limité, les premiers avis constituent une base utile pour développer votre crédibilité locale.`);
  } else if (Number.isFinite(rating)) parts.push(`Votre note de ${String(rating.toFixed(1)).replace(".", ",")}/5 constitue déjà un signal positif.`);
  if (Number.isFinite(photos) && photos > 0) parts.push(`Votre fiche dispose également de ${Math.round(photos)} photo${photos === 1 ? "" : "s"}, ce qui donne un premier aperçu concret de l’établissement.`);
  return parts.join(" ") || "La fiche est publiée et fournit déjà un premier point de contact aux personnes qui recherchent l’établissement.";
}

function nextRatingTarget(rating, reviews) {
  const current = Number(rating);
  const count = Number(reviews);
  if (!Number.isFinite(current) || !Number.isFinite(count) || count < 0 || current >= 4.8) return null;
  const target = Math.min(4.8, Math.round((current + 0.1) * 10) / 10);
  const needed = Math.ceil(count * (target - current) / (5 - target));
  if (!Number.isFinite(needed) || needed < 1 || needed > Math.max(50, Math.ceil(count * 0.35))) return null;
  return { target, needed };
}

function defaultReviewResponses(context) {
  const name = context.name || "notre entreprise";
  return [
    { id: "positive-1", label: "Avis positif - modèle 1", text: `Merci pour votre retour et votre confiance envers ${name}. Nous sommes heureux que votre expérience ait été positive.` },
    { id: "positive-2", label: "Avis positif - modèle 2", text: "Merci d’avoir pris le temps de partager votre expérience. Votre message est précieux pour notre équipe." },
    { id: "positive-detailed", label: "Avis positif détaillé", text: "Merci pour ce retour détaillé. Nous sommes ravis que les éléments que vous mentionnez aient contribué à une expérience positive. Au plaisir de vous accueillir à nouveau." },
    { id: "negative-1", label: "Avis négatif - modèle 1", text: "Merci d’avoir partagé votre retour. Nous sommes désolés que votre expérience n’ait pas répondu à vos attentes et souhaitons comprendre précisément ce qui s’est passé." },
    { id: "negative-2", label: "Avis négatif - modèle 2", text: "Nous prenons votre remarque au sérieux. Votre retour va être examiné avec l’équipe afin d’identifier les améliorations nécessaires." },
    { id: "private", label: "Poursuivre en privé", text: "Afin de pouvoir vérifier la situation sans exposer vos informations personnelles, nous vous invitons à nous contacter directement par les coordonnées publiques de la fiche." },
  ];
}

function photoDrafts(playbook, review) {
  const saved = Array.isArray(review?.photos) ? review.photos : [];
  return playbook.photoSubjects.slice(0, 12).map((subject, index) => normalizeEditableItem(saved[index], {
    id: `photo-${index + 1}`,
    subject,
    label: subject,
    text: "Plan net et fidèle à la réalité, sans élément confidentiel.",
    objective: "Aider une personne à comprendre l’entreprise avant de la contacter.",
    priority: index < 4 ? "haute" : "normale",
    week: (index % 4) + 1,
    status: "needs_confirmation",
  }));
}

function postDrafts(context, review) {
  const saved = Array.isArray(review?.posts) ? review.posts : [];
  const briefs = [
    "Présenter une prestation ou un produit réellement proposé.",
    "Montrer les coulisses ou l’équipe avec son accord.",
    "Partager une information pratique vérifiée.",
    "Mettre en avant un élément réel qui rassure avant la prise de contact.",
  ];
  return briefs.map((brief, index) => normalizeEditableItem(saved[index], {
    id: `post-${index + 1}`,
    title: `Publication semaine ${index + 1}`,
    text: brief,
    photoType: index === 1 ? "Photo réelle des coulisses ou de l’équipe" : "Photo réelle liée au sujet",
    objective: index === 3 ? "Réassurance" : "Activité de la fiche",
    week: index + 1,
    status: "needs_confirmation",
  }));
}

function reviewSystem(context, review) {
  const link = text(review?.reviewLink || context.reviewLink, 1200);
  return {
    reviewLink: { value: link, status: link ? status(review?.reviewLinkStatus) : "needs_confirmation" },
    messages: [
      normalizeEditableItem(review?.reviewMessages?.sms, { id: "sms", label: "WhatsApp / SMS", text: `Merci d’avoir fait confiance à ${context.name || "notre entreprise"}. Si vous le souhaitez, vous pouvez partager votre expérience sur Google via le lien validé ci-dessous.`, status: "needs_confirmation" }),
      normalizeEditableItem(review?.reviewMessages?.email, { id: "email", label: "E-mail", text: `Merci pour votre confiance. Votre retour peut aider d’autres personnes à mieux comprendre leur expérience avec ${context.name || "notre entreprise"}. Si vous souhaitez laisser un avis Google, utilisez le lien validé ci-dessous.`, status: "needs_confirmation" }),
      normalizeEditableItem(review?.reviewMessages?.oral, { id: "oral", label: "Phrase sur place", text: "Si vous souhaitez partager votre expérience, nous pouvons vous envoyer notre lien d’avis Google.", status: "needs_confirmation" }),
    ],
    responseTemplates: defaultReviewResponses(context).map((fallback, index) => normalizeEditableItem(review?.reviewResponses?.[index], { ...fallback, status: "needs_confirmation" })),
    routine: ["Demander un avis uniquement après une expérience réelle.", "Ne proposer aucune récompense.", "Vérifier les nouveaux avis deux fois par semaine.", "Personnaliser la première phrase de chaque réponse.", "Traiter calmement les critiques et poursuivre en privé si nécessaire.", "Noter le nombre de nouveaux avis chaque semaine."],
  };
}

function measurement(context) {
  const unavailable = "À relever";
  return [
    ["Recherches", unavailable], ["Vues Maps", unavailable], ["Appels", unavailable],
    ["Clics vers le site", unavailable], ["Itinéraires", unavailable], ["Réservations", unavailable],
    ["Nombre total d’avis", context.reviews ?? unavailable], ["Note moyenne", context.rating ?? unavailable],
    ["Nombre total de photos", context.photos ?? unavailable], ["Nouveaux avis pendant les 30 jours", "À mesurer"],
    ["Nouvelles photos publiées pendant les 30 jours", "À mesurer"],
  ].map(([indicator, today]) => ({ indicator, today, day30: "", evolution: "" }));
}

function visibilityLevers(context, description, categoryItems, serviceItems, photos, reviews) {
  const row = (id, label, current, action, itemStatus = "approved", owner = "dirigeant") => ({ id, label, current, action, status: itemStatus, owner, doneWhen: `${label} contrôlé dans la fiche publique.` });
  return [
    row("main-category", "Catégorie principale", context.category || "Non vérifiée", context.category ? "À conserver si elle correspond toujours à l’activité réelle" : "À confirmer avant ajout", context.category ? "approved" : "needs_confirmation"),
    row("secondary-categories", "Catégories secondaires", context.secondaryCategories.join(", ") || "Non vérifiées", context.secondaryCategories.length ? "Contrôler leur pertinence" : "À vérifier", context.secondaryCategories.length ? "approved" : "needs_confirmation"),
    row("services", "Services", context.services.join(", ") || "Non vérifiés", context.services.length ? "Conserver uniquement les services réellement proposés" : "À confirmer avant ajout", serviceItems.some((item) => item.status === "approved") ? "approved" : "needs_confirmation"),
    row("description", "Description", context.description ? "Présente" : "Absente", description.status === "approved" ? "Publier ou conserver le texte approuvé" : "Valider le texte avant publication", description.status),
    row("hours", "Horaires", context.hours ? "Présents" : "Non vérifiés", context.hours ? "Vérifier leur exactitude" : "À relever", context.hours ? "approved" : "needs_confirmation"),
    row("phone", "Téléphone", context.phone || "Non vérifié", context.phone ? "Vérifier qu’il est joignable" : "À relever", context.phone ? "approved" : "needs_confirmation"),
    row("website", "Site internet", context.website || "Non vérifié", context.website ? "Vérifier le lien" : "À relever", context.website ? "approved" : "needs_confirmation"),
    row("photos", "Photos", context.photos ?? "Non relevé", photos.some((item) => item.status === "approved") ? "Publier les premières photos approuvées" : "Valider la liste avant prise de vue", photos.some((item) => item.status === "approved") ? "approved" : "needs_confirmation", "membre de l’équipe"),
    row("reviews", "Réponses aux avis", "À vérifier", reviews.responseTemplates.some((item) => item.status === "approved") ? "Utiliser les modèles approuvés en les personnalisant" : "Valider les modèles de réponse", reviews.responseTemplates.some((item) => item.status === "approved") ? "approved" : "needs_confirmation", "membre de l’équipe"),
  ];
}

const DELIVERABLE_BY_SIGNAL = { description: "description", photos: "photos", reviews: "reviews", rating: "reviews", categories: "profile", position: "visibility", posts: "posts" };

function applyDeliverableIntegrity(actions, approved, visibility, guidance = {}) {
  const available = {
    description: Boolean(approved.description || guidance.description), photos: approved.photos.length >= 8 || guidance.photos?.length >= 6,
    reviews: (approved.reviewMessages.length >= 3 && approved.reviewResponses.length >= 6 && Boolean(approved.reviewLink)) || Boolean(guidance.reviews),
    profile: approved.categoryItems.length + approved.serviceItems.length > 1,
    posts: approved.posts.length > 0, visibility: visibility.some((item) => item.status === "approved"),
  };
  return actions.map((action) => {
    const deliverableRef = DELIVERABLE_BY_SIGNAL[action.signal] || null;
    const hasDeliverable = deliverableRef ? available[deliverableRef] : true;
    let steps = action.steps;
    const readyToPublish = deliverableRef === "description" ? Boolean(approved.description)
      : deliverableRef === "photos" ? approved.photos.length >= 8
        : deliverableRef === "reviews" ? approved.reviewMessages.length >= 3 && approved.reviewResponses.length >= 6 && Boolean(approved.reviewLink)
          : hasDeliverable;
    if (!hasDeliverable) {
      const replacements = {
        description: ["Rédigez un texte factuel de 450 à 700 caractères à partir des seules informations vérifiées.", "Faites valider chaque information avant publication."],
        photos: ["Relevez huit sujets réels et photographiables dans l’entreprise.", "Faites valider la liste avant d’organiser la prise de vue."],
        reviews: ["Récupérez et testez le lien direct d’avis.", "Faites valider les messages et modèles de réponse avant utilisation."],
        profile: ["Relevez les catégories et services actuellement visibles.", "Faites confirmer chaque modification avant de l’appliquer."],
        posts: ["Listez quatre informations réelles pouvant faire l’objet d’une publication.", "Faites valider les textes avant planification."],
      };
      steps = replacements[deliverableRef] || steps;
    } else if (!readyToPublish && deliverableRef === "description") {
      steps = ["Utilisez la structure recommandée comme trame.", "Confirmez les informations indiquées comme manquantes avant de rédiger le texte définitif."];
    } else if (!readyToPublish && deliverableRef === "photos") {
      steps = ["Parcourez la liste sectorielle proposée dans ce rapport.", "Retenez uniquement les sujets qui existent réellement dans l’établissement.", "Adaptez le cadrage puis planifiez les prises de vue sur quatre semaines."];
    } else if (!readyToPublish && deliverableRef === "reviews") {
      steps = ["Adaptez les deux modèles de réponse à votre ton.", "Personnalisez chaque réponse avec un élément précis de l’avis.", "Récupérez et testez séparément le lien direct d’avis avant toute demande d’avis."];
    }
    return {
      ...action,
      steps,
      deliverableRef,
      hasDeliverable,
      deliverableMode: readyToPublish ? "approved" : hasDeliverable ? "recommendation" : "missing",
      doneWhen: readyToPublish ? action.doneWhen : hasDeliverable ? "La recommandation est adaptée aux informations réelles et les éléments restant à confirmer sont relevés." : "Les informations nécessaires sont relevées et le livrable est prêt à être validé dans le back-office.",
    };
  });
}

export function buildExecutionPlan({ analysis = {}, documentModel = {} } = {}) {
  if ((documentModel.reportType || analysis.reportType) === "free") return null;
  const context = knownContext(analysis);
  const review = analysis.manualReview?.executionPlan || {};
  const playbook = getExecutionPlaybook(context.category);
  const descriptionNeeded = Number(analysis.business?.descriptionLength ?? context.description.length) < 450;
  const description = normalizeEditableItem(review.description, {
    id: "description",
    label: "Description proposée",
    text: descriptionNeeded ? conservativeDescription(context) : context.description,
    status: descriptionNeeded ? "needs_confirmation" : "approved",
  });
  const categoryItems = [
    normalizeEditableItem(review.categoryItems?.[0], { id: "main-category", label: context.category || "Catégorie principale à confirmer", text: context.category || "", status: context.category ? "approved" : "needs_confirmation" }),
    ...context.secondaryCategories.map((label, index) => normalizeEditableItem(review.categoryItems?.[index + 1], { id: `secondary-${index + 1}`, label, text: label, status: "approved" })),
  ];
  const serviceItems = context.services.map((label, index) => normalizeEditableItem(review.serviceItems?.[index], { id: `service-${index + 1}`, label, text: label, status: "approved" }));
  if (!serviceItems.length) serviceItems.push(normalizeEditableItem(review.serviceItems?.[0], { id: "services-to-confirm", label: "Services ou prestations à confirmer", text: "", status: "needs_confirmation" }));

  const actionCards = buildActionCards(documentModel, review, context);
  const photos = photoDrafts(playbook, review);
  const posts = postDrafts(context, review);
  const reviews = reviewSystem(context, review);
  const selectedSignals = new Set(actionCards.map((item) => item.signal));
  const guidance = {
    description: descriptionGuidance(playbook, context, descriptionNeeded),
    photos: selectedSignals.has("photos") ? photoGuidance(playbook) : [],
    reviews: selectedSignals.has("reviews") || selectedSignals.has("rating") ? reviewGuidance(playbook) : null,
  };
  const ratingEstimate = nextRatingTarget(context.rating, context.reviews);
  const controlDate = new Date();
  controlDate.setUTCDate(controlDate.getUTCDate() + 30);

  const approved = {
    description: approvedItem(description) ? description : null,
    categoryItems: categoryItems.filter(approvedItem), serviceItems: serviceItems.filter(approvedItem),
    photos: photos.filter(approvedItem), reviewMessages: reviews.messages.filter(approvedItem),
    reviewResponses: reviews.responseTemplates.filter((item) => item.status === "approved" && item.text),
    reviewLink: reviews.reviewLink.status === "approved" && reviews.reviewLink.value ? reviews.reviewLink.value : null,
    posts: posts.filter(approvedItem),
  };
  const visibility = visibilityLevers(context, description, categoryItems, serviceItems, photos, reviews);
  const integrityActions = applyDeliverableIntegrity(actionCards, approved, visibility, guidance);
  return {
    version: "1.0.0",
    sector: playbook.sector,
    context,
    outcomes: integrityActions.map((item) => item.objective30Days), actions: integrityActions,
    description,
    profileMap: { categoryItems, serviceItems, attributes: list(review.attributes, 12).map((label, index) => ({ id: `attribute-${index + 1}`, label, status: "approved" })) },
    photos,
    reviews: { ...reviews, ratingEstimate, currentRating: context.rating, currentReviews: context.reviews },
    visibility,
    guidance,
    personalizedOverview: personalizedOverview(context, actionCards),
    strengthSummary: strengthSummary(context),
    posts,
    calendar: integrityActions.map((item, index) => ({ week: Math.min(index + 1, 4), title: item.title, actions: item.steps.slice(0, 3), owner: item.owner, estimatedTime: item.estimatedTime, doneWhen: item.doneWhen })),
    measurement: measurement(context),
    summary: {
      strength: documentModel.strengths?.[0]?.title || null,
      blockers: actionCards.map((item) => item.title),
      firstAction: actionCards[0]?.steps?.[0] || null,
      controlDate: controlDate.toISOString().slice(0, 10),
    },
    approved,
    integrity: { valid: integrityActions.every((item) => item.hasDeliverable), missing: integrityActions.filter((item) => !item.hasDeliverable).map((item) => `${item.title} : livrable ${item.deliverableRef} manquant`) },
    pendingConfirmationCount: [description, ...categoryItems, ...serviceItems, ...photos, ...reviews.messages, ...reviews.responseTemplates, ...posts, ...integrityActions]
      .filter((item) => item.status === "needs_confirmation").length + (reviews.reviewLink.status === "needs_confirmation" ? 1 : 0),
  };
}

export function normalizeExecutionPlanReview(value = {}) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    description: normalizeEditableItem(input.description),
    categoryItems: (Array.isArray(input.categoryItems) ? input.categoryItems : []).slice(0, 12).map(normalizeEditableItem),
    serviceItems: (Array.isArray(input.serviceItems) ? input.serviceItems : []).slice(0, 30).map(normalizeEditableItem),
    photos: (Array.isArray(input.photos) ? input.photos : []).slice(0, 12).map(normalizeEditableItem),
    reviewMessages: {
      sms: normalizeEditableItem(input.reviewMessages?.sms),
      email: normalizeEditableItem(input.reviewMessages?.email),
      oral: normalizeEditableItem(input.reviewMessages?.oral),
    },
    reviewResponses: (Array.isArray(input.reviewResponses) ? input.reviewResponses : []).slice(0, 8).map(normalizeEditableItem),
    reviewLink: text(input.reviewLink, 1200),
    reviewLinkStatus: status(input.reviewLinkStatus),
    posts: (Array.isArray(input.posts) ? input.posts : []).slice(0, 4).map(normalizeEditableItem),
    attributes: list(input.attributes, 12),
    actions: (Array.isArray(input.actions) ? input.actions : []).slice(0, 3).map((item) => ({
      id: text(item?.id, 160), objective30Days: text(item?.objective30Days, 600), steps: list(item?.steps, 10),
      status: status(item?.status),
      analysisId: text(item?.analysisId || item?.analysis_id, 160),
      blocking: item?.blocking === true, blocked: item?.blocked === true,
      refused: item?.refused === true, rejected: item?.rejected === true,
      error: text(item?.error, 500), conflict: text(item?.conflict, 500),
      deliverable: text(item?.deliverable, 1600), deliverableStatus: status(item?.deliverableStatus),
      owner: OWNERS.has(item?.owner) ? item.owner : "dirigeant", estimatedTime: text(item?.estimatedTime, 120),
      doneWhen: text(item?.doneWhen, 600), metric: text(item?.metric, 120),
    })),
  };
}

function attachAnalysisId(item, analysisId) {
  return item && typeof item === "object" ? { ...item, analysisId } : item;
}

export function rebuildDuplicatedExecutionPlanReview(plan = {}, inherited = {}, { analysisId = "" } = {}) {
  const messages = Array.isArray(plan.reviews?.messages) ? plan.reviews.messages : [];
  const inheritedLink = text(inherited?.reviewLink, 1200);
  const inheritedLinkApproved = inherited?.reviewLinkStatus === "approved" && hasHttpUrl(inheritedLink);
  const rebuiltLink = text(plan.reviews?.reviewLink?.value, 1200);
  const review = {
    description: attachAnalysisId(plan.description, analysisId),
    categoryItems: (plan.profileMap?.categoryItems || []).map((item) => attachAnalysisId(item, analysisId)),
    serviceItems: (plan.profileMap?.serviceItems || []).map((item) => attachAnalysisId(item, analysisId)),
    photos: (plan.photos || []).map((item) => attachAnalysisId(item, analysisId)),
    reviewMessages: Object.fromEntries(messages.map((item) => [
      item.id,
      attachAnalysisId(item, analysisId),
    ])),
    reviewResponses: (plan.reviews?.responseTemplates || []).map((item) => attachAnalysisId(item, analysisId)),
    reviewLink: inheritedLinkApproved ? inheritedLink : rebuiltLink,
    reviewLinkStatus: inheritedLinkApproved
      ? "approved"
      : (rebuiltLink ? status(plan.reviews?.reviewLink?.status) : "not_applicable"),
    posts: (plan.posts || []).map((item) => attachAnalysisId(item, analysisId)),
    attributes: list(plan.profileMap?.attributes?.map((item) => item?.label), 12),
    actions: (plan.actions || []).map((item) => attachAnalysisId(item, analysisId)),
  };
  return normalizeExecutionPlanReview(review);
}

function hasExecutionBlockingSignal(item) {
  return Boolean(
    item?.blocking === true
    || item?.blocked === true
    || item?.refused === true
    || item?.rejected === true
    || text(item?.error, 500)
    || text(item?.conflict, 500)
  );
}

function hasHttpUrl(value) {
  try {
    const url = new URL(text(value, 1200));
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function executionBlocker(item, label, {
  expectedAnalysisId = "",
  validator = null,
  group = "",
  index = 0,
  id = "",
  incompleteStructure = false,
} = {}) {
  const itemAnalysisId = text(item?.analysisId || item?.analysis_id, 160);
  if (itemAnalysisId && itemAnalysisId !== expectedAnalysisId) {
    return { section: label, reason: "Ce contenu appartient à un autre audit.", code: "analysis_id_mismatch", group, index, id };
  }
  if (item?.refused === true || item?.rejected === true) {
    return { section: label, reason: "Ce contenu a été explicitement refusé.", code: "content_refused", group, index, id };
  }
  if (hasExecutionBlockingSignal(item)) {
    return { section: label, reason: "Un conflit ou une erreur de génération doit être résolu.", code: "generation_conflict", group, index, id };
  }
  const hasContent = validator
    ? validator(item)
    : Boolean(text(item?.text || item?.label || item?.subject || item?.title || item?.objective30Days, 5000));
  if (!hasContent) {
    return {
      section: label,
      reason: incompleteStructure ? "La structure obligatoire est incomplète." : "Le contenu obligatoire est vide.",
      code: incompleteStructure ? "incomplete_structure" : "required_content_missing",
      group,
      index,
      id,
    };
  }
  return null;
}

function confirmExecutionItem(item, label, confirmed, blocking, blockingDetails, options = {}) {
  if (!item || item.status !== "needs_confirmation") return item;
  const detail = executionBlocker(item, label, options);
  if (detail) {
    blocking.push(label);
    blockingDetails.push(detail);
    return item;
  }
  confirmed.push(label);
  return { ...item, status: "approved" };
}

export function confirmReadyExecutionPlanReview(value = {}, { analysisId = "" } = {}) {
  const review = normalizeExecutionPlanReview(value);
  const confirmed = [];
  const blocking = [];
  const blockingDetails = [];
  const mapItems = (items, groupLabel, group, validator = null, incompleteStructure = false) => items.map((item, index) =>
    confirmExecutionItem(item, `${groupLabel} ${index + 1}`, confirmed, blocking, blockingDetails, {
      validator,
      expectedAnalysisId: analysisId,
      group,
      index,
      id: text(item?.id, 160),
      incompleteStructure,
    }));

  review.description = confirmExecutionItem(
    review.description,
    "Description proposée",
    confirmed,
    blocking,
    blockingDetails,
    { validator: (item) => Boolean(text(item.text, 5000)), expectedAnalysisId: analysisId, group: "description", index: 0, id: text(review.description?.id, 160) },
  );
  review.categoryItems = mapItems(review.categoryItems, "Catégorie", "categoryItems");
  review.serviceItems = mapItems(review.serviceItems, "Service", "serviceItems");
  review.photos = mapItems(review.photos, "Photo", "photos", (item) => Boolean(
    text(item.subject, 500)
    && text(item.text, 5000)
    && text(item.objective, 1000)
  ), true);
  review.reviewMessages = Object.fromEntries(Object.entries(review.reviewMessages).map(([key, item]) => [
    key,
    confirmExecutionItem(item, `Message d’avis ${key}`, confirmed, blocking, blockingDetails, {
      expectedAnalysisId: analysisId,
      group: "reviewMessages",
      id: key,
    }),
  ]));
  review.reviewResponses = mapItems(review.reviewResponses, "Réponse aux avis", "reviewResponses");
  review.posts = mapItems(review.posts, "Publication Google", "posts");
  review.actions = mapItems(review.actions, "Objectif à 30 jours", "actions", (item) => Boolean(text(item.objective30Days, 600)));

  if (review.reviewLinkStatus === "needs_confirmation") {
    if (hasHttpUrl(review.reviewLink)) {
      review.reviewLinkStatus = "approved";
      confirmed.push("Lien direct d’avis");
    } else {
      blocking.push("Lien direct d’avis");
      blockingDetails.push({
        section: "Lien direct d’avis",
        reason: "L’adresse web renseignée n’est pas une URL HTTP ou HTTPS valide.",
        code: "invalid_url",
        group: "reviewLink",
        index: 0,
        id: "review-link",
      });
    }
  }

  return {
    review,
    confirmedCount: confirmed.length,
    confirmed,
    blocking: [...new Set(blocking)],
    blockingDetails,
  };
}

export function countPendingExecutionReview(value = {}) {
  const review = normalizeExecutionPlanReview(value);
  return [
    review.description,
    ...review.categoryItems,
    ...review.serviceItems,
    ...review.photos,
    ...Object.values(review.reviewMessages),
    ...review.reviewResponses,
    ...review.posts,
    ...review.actions,
    { status: review.reviewLinkStatus },
  ].filter((item) => item?.status === "needs_confirmation").length;
}

export function executionPlanApprovalIssues(executionPlan, review) {
  const issues = [];
  if (!review || typeof review !== "object") issues.push("Plan d’exécution non validé");
  const pending = review ? countPendingExecutionReview(review) : 0;
  if (pending) issues.push(`${pending} élément(s) à confirmer`);
  if (!executionPlan?.integrity?.valid) issues.push(...(executionPlan?.integrity?.missing || ["Livrable obligatoire manquant"]));
  if (/Transformer cette priorité en action vérifiable/i.test(JSON.stringify(executionPlan || {}))) issues.push("Fallback générique détecté");
  return [...new Set(issues)];
}
