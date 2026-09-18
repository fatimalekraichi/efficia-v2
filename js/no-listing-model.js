import {validateReportNarrativeText} from './report-narrative-fields.js';
import './diagnostic-pdf-filename.js';
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
export function cityWithDe(city) {
  const value=String(city).trim();
  // H is not always mute: only elide known mute-H place names, not every H.
  const muteH=/^(huy|hyères|hélécine)$/iu.test(value);
  return /^[aeiouyàâäéèêëîïôöùûüÿœæ]/iu.test(value)||muteH?`d’${value}`:`de ${value}`;
}
export function panelFacts(collection) {
  const panel=collection?.status==='success' && Array.isArray(collection.competitors)?collection.competitors:[];
  const reviews=panel.map(c=>c.reviews).filter(v=>Number.isInteger(v)&&v>=0);
  const ratings=panel.map(c=>c.rating).filter(v=>typeof v==='number'&&Number.isFinite(v)&&v>=1&&v<=5);
  const range=values=>values.length?{min:Math.min(...values),max:Math.max(...values),known:values.length}:null;
  return {count:panel.length,reviewed:reviews.filter(v=>v>0).length,reviewTotal:reviews.length?reviews.reduce((sum,n)=>sum+n,0):null,reviews:range(reviews),ratings:range(ratings)};
}
export function reviewEvidenceSentence(collection) {
  const {reviews,reviewTotal}=panelFacts(collection);
  if (!reviews) return 'Le nombre d’avis des fiches observées n’est pas disponible.';
  if (reviews.known===1) return `La seule fiche observée dont le nombre d’avis est disponible affiche ${reviewTotal} avis.`;
  const subject=`Les ${reviews.known} fiches observées dont le nombre d’avis est disponible`;
  return reviews.min===reviews.max
    ? `${subject} affichent chacune ${reviews.min} avis.`
    : `${subject} cumulent ${reviewTotal} avis.`;
}
export function defaultPriorities(data, observation = null) {
  const competitors = observation?.competitors || [];
  const evidence = `Nous n’avons pas identifié de fiche Google correspondant clairement à ${data.company} pour « ${data.query} » dans les résultats analysés.` + (competitors.length
    ? ` Pour votre activité (${data.activity}), ${competitors.length} ${competitors.length===1?'fiche pertinente a été observée':'fiches pertinentes ont été observées'} dans la zone ${cityWithDe(data.searchCity)}.`
    : ' Aucune fiche concurrente qualifiée et vérifiable n’a été retenue.');
  const reviewEvidence = reviewEvidenceSentence(observation) + ' Une nouvelle fiche partira sans historique d’avis. Solliciter dès le départ des retours authentiques permettra de construire progressivement ces repères.';
  return [
    {title:'Créer et faire valider votre fiche Google',finding:evidence,
      actions:`Vérifier d’abord dans Google Maps si une fiche de votre entreprise doit être récupérée. Si une fiche existe, demander sa gestion plutôt qu’en créer une seconde. Sinon, créer la fiche avec votre activité, les informations réelles de votre entreprise à ${data.city} et suivre la procédure de validation proposée par Google. Respecter les conditions d’éligibilité de Google.`,
      benefit:'Permettre aux personnes qui recherchent votre activité de trouver des informations officielles sur votre entreprise.'},
    {title:'Présenter clairement vos services et vos coordonnées',finding:data.website
      ? `Le site ${data.website} est déjà indiqué comme point de contact pour ${data.company}. Une fiche Google permettrait d’y associer téléphone, horaires, services et zone desservie.`
      : `Aucun site web n’est renseigné pour ${data.company} dans ce dossier. Une fiche Google permettrait de présenter votre activité (${data.activity}) à ${data.city}, vos services et vos coordonnées.`,
      actions:`Choisir la catégorie principale correspondant à votre activité${/^(électricien|electricien|electrician)$/i.test(data.activity.trim()) ? ' d’électricien' : ` (${data.activity})`}. Renseigner les services, les coordonnées, les horaires et la zone réellement desservie autour ${cityWithDe(data.city)}${data.website ? ', ainsi que le site web indiqué' : ''}. N’afficher une adresse que si les clients y sont reçus. Ajouter des photos représentatives de votre travail.`,
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

export function panelReviewSentence(collection) {
  const {count,reviewTotal,reviews}=panelFacts(collection);
  if(!count)return 'Aucune fiche concurrente qualifiée et vérifiable n’a été retenue pour cette recherche.';
  if(!reviews)return 'Le nombre d’avis des fiches présentées n’est pas disponible.';
  const subject=reviews.known===count
    ? count===1?'La fiche présentée':`Les ${count===3?'trois':count} fiches présentées`
    : reviews.known===1?'La fiche dont le nombre d’avis est renseigné':`Les ${reviews.known} fiches dont le nombre d’avis est renseigné`;
  return `${subject} ${reviews.known===1?'compte':'cumulent'} ${reviewTotal} avis ${reviewTotal===1?'client':'clients'}.${reviewTotal>0?' Ces avis peuvent aider un prospect à comparer les professionnels.':''}`;
}

export const NO_LISTING_TEXT_FIELDS = Object.freeze({
  'page1.verdict_title':'Page 1 · Titre du bloc Votre priorité',
  'summary.general':'Page 1 · Texte du bloc Votre priorité',
  'page2.comparison_intro':'Page 2 · Résumé sous les concurrents',
});
export function automaticReportTexts(data) {
  const {collection,company=''}=data, facts=panelFacts(collection);
  const query=collection?.query;
  const observation=collection?.status==='success'
    ? `${query?`Sur la recherche « ${query} », `:''}${panelReviewSentence(collection).replace(/^Les /,'les ').replace(/^La /,'la ').replace('Ces avis peuvent aider un prospect à comparer les professionnels.','Ces avis donnent aux internautes des repères pour choisir qui contacter.')}`
    : 'Les résultats de la recherche locale restent à vérifier.';
  const ratings=facts.ratings;
  const note=v=>v.toFixed(1).replace('.',',');
  const ratingRange=ratings?(ratings.min===ratings.max?note(ratings.min):`${note(ratings.min)} à ${note(ratings.max)}`):'';
  return {
    'page1.verdict_title':data.absenceContext==='confirmed'?'Votre priorité : créer et optimiser votre fiche Google':data.absenceContext==='declared'?'Absence de fiche déclarée':'',
    'summary.general':`${company} : nous n’avons pas identifié de fiche Google lui correspondant clairement dans les résultats analysés. ${observation} Votre prochaine étape : une fiche complète qui présente vos services et facilite la prise de contact.`,
    'page2.comparison_intro':reviewEvidenceSentence(collection)+(company && facts.reviewTotal>0?` Ces avis${ratings?` et les notes disponibles (${ratingRange}/5)`:''} constituent des repères visibles que ${company} ne peut pas encore présenter via une fiche identifiée dans notre analyse.`:''),
  };
}
export function effectiveReportText(data,fieldId,automaticText) {
  return data.reportTextOverrides?.[fieldId]?.customText ?? automaticText;
}
// As in the standard editor: blank removes the override, the automatic text is retained separately.
export function saveReportTextOverrides(data,values) {
  if(!values || typeof values!=='object' || Array.isArray(values))throw Error('INVALID_TEXT');
  const automatic=automaticReportTexts(data), result={};
  for(const [fieldId,value] of Object.entries(values)) {
    if(!Object.hasOwn(NO_LISTING_TEXT_FIELDS,fieldId))throw Error('INVALID_TEXT');
    if(typeof value!=='string')throw Error('INVALID_TEXT');
    if(!value.trim())continue;
    const validated=validateReportNarrativeText(fieldId,value,automatic[fieldId]);
    if(!validated.ok)throw Error('INVALID_TEXT');
    result[fieldId]={customText:validated.text,automaticText:automatic[fieldId],needsReview:false};
  }
  return result;
}
export function markNoListingTextsForReview(data) {
  const automatic=automaticReportTexts(data);
  return Object.fromEntries(Object.entries(data.reportTextOverrides || {}).map(([id,item])=>[id,{
    ...item,needsReview:item.needsReview || item.automaticText!==automatic[id],
  }]));
}
export function noListingPdfFilename(data,date=new Date()) {
  return globalThis.EfficiaPdfFilename.buildEfficiaPdfFilename({businessName:data.company,city:data.city,
    analysisDate:date,analysisVersion:data.version || 1,prefix:'Fiche-Diagnostic'});
}
