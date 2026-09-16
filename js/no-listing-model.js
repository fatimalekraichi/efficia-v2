// Shared by the authenticated API, editor and PDF. Never invokes the score engine.
export const PRIORITY_FIELDS = Object.freeze({title:120, finding:900, actions:1400, benefit:700});
export const ABSENCE_CONTEXTS = Object.freeze({
  declared: 'Le demandeur déclare ne pas avoir de fiche Google. Cette déclaration ne constitue pas une vérification indépendante.',
  confirmed: 'L’absence de fiche Google a été confirmée manuellement pour ce dossier.',
});
export function plainText(value, max, required = true) {
  if (typeof value !== 'string' || value.length > max || /[<>\u0000-\u0008]/.test(value)) throw Error('INVALID_TEXT');
  const text = value.trim();
  if (required && !text) throw Error('REQUIRED_FIELD');
  return text;
}
export function normalizeIdentity(input) {
  const identity = {};
  for (const [key,max] of Object.entries({company:180,activity:140,city:160,countryCode:2,searchCity:160,searchCountryCode:2,query:300})) {
    identity[key] = plainText(input[key],max);
  }
  if (!['BE','FR','LU','CH','NL','DE'].includes(identity.countryCode)
    || !['BE','FR','LU','CH','NL','DE'].includes(identity.searchCountryCode)) throw Error('COUNTRY_REQUIRED');
  if (!Object.hasOwn(ABSENCE_CONTEXTS,input.absenceContext)) throw Error('ABSENCE_CONFIRMATION_REQUIRED');
  identity.absenceContext = input.absenceContext;
  identity.website = plainText(input.website || '',500,false);
  if (identity.website) {
    let url;
    try { url = new URL(identity.website); } catch { throw Error('INVALID_WEBSITE'); }
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw Error('INVALID_WEBSITE');
  }
  return identity;
}
export function searchIdentity(data) {
  return JSON.stringify(['company','activity','searchCity','searchCountryCode','query'].map(key=>data[key]));
}
export function defaultPriorities(data, observation = null) {
  const competitors = observation?.competitors || [];
  const evidence = competitors.length
    ? `Lors de la recherche « ${data.query} », ${competitors.length} ${competitors.length === 1 ? 'fiche pertinente a été observée' : 'fiches pertinentes ont été observées'} dans la zone de ${data.searchCity}.`
    : 'La recherche n’a pas fourni de fiche concurrente qualifiée et vérifiable.';
  const reviewed = competitors.filter(c=>Number.isInteger(c.reviews) && c.reviews > 0);
  const reviewEvidence = reviewed.length
    ? `Parmi les fiches observées, ${reviewed[0].name} affiche ${reviewed[0].reviews} avis.`
    : 'Le nombre d’avis des concurrents ne permet pas ici de définir une référence fiable.';
  return [
    {title:'Créer et faire valider votre fiche Google',finding:evidence,
      actions:`Vérifier d’abord dans Google Maps si une fiche de votre entreprise doit être récupérée. Si une fiche existe, demander sa gestion plutôt qu’en créer une seconde. Sinon, créer la fiche avec votre activité, les informations réelles de votre entreprise à ${data.city} et suivre la procédure de validation proposée par Google. Respecter les conditions d’éligibilité de Google.`,
      benefit:'Permettre aux personnes qui recherchent votre activité de trouver des informations officielles sur votre entreprise.'},
    {title:'Présenter clairement vos services et vos coordonnées',finding:'Une fiche complète permettra de présenter vos services et les informations utiles pour contacter votre entreprise.',
      actions:`Choisir la catégorie principale correspondant à votre activité${/^(électricien|electricien|electrician)$/i.test(data.activity.trim()) ? ' d’électricien' : ` (${data.activity})`}. Renseigner les services, les coordonnées, les horaires et la zone réellement desservie autour de ${data.city}. N’afficher une adresse que si les clients y sont reçus. Ajouter des photos représentatives de votre travail.${data.website ? ' Relier le site officiel indiqué dans ce dossier.' : ''}`,
      benefit:'Aider un prospect à comprendre ce que vous proposez et comment vous contacter.'},
    {title:'Demander régulièrement des avis authentiques',finding:reviewEvidence,
      actions:'Après une prestation, proposer au client de partager librement son expérience avec le lien d’avis Google. Ne pas sélectionner uniquement les clients satisfaits. Ne proposer aucune contrepartie et ne publier aucun faux avis. Répondre avec courtoisie aux avis reçus.',
      benefit:'Donner aux futurs clients des retours d’expérience utiles pour mieux connaître votre entreprise.'},
  ];
}
export function validatePriorities(priorities) {
  if (!Array.isArray(priorities) || priorities.length !== 3) throw Error('THREE_PRIORITIES_REQUIRED');
  return priorities.map(p=>Object.fromEntries(Object.entries(PRIORITY_FIELDS).map(([key,max])=>[key,plainText(p?.[key],max)])));
}
export function reportReady(data) {
  return data?.collection?.status === 'success' && data.collection.searchIdentity === searchIdentity(data)
    && Array.isArray(data.collection.competitors) && Boolean(data.collection.observedAt);
}
