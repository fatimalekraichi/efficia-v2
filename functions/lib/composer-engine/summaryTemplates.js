import { applyToneRules } from "./toneRules.js";
import { labelForSignal, vocabularyForImpact } from "./vocabulary.js";

function evidenceValue(item) {
  const value = item?.evidence?.value;
  const unit = item?.evidence?.unit;
  if (value === null || value === undefined || value === "") return null;
  return unit ? `${value} ${unit}` : String(value);
}

function strengthSentence(strength) {
  if (!strength) {
    return "Votre fiche présente déjà certains éléments utiles pour construire une présence Google plus solide.";
  }
  if (strength.signal === "reviews") {
    const value = evidenceValue(strength);
    return value
      ? `Votre établissement bénéficie déjà d'une réputation solide, avec ${value} visibles sur votre fiche.`
      : "Votre établissement bénéficie déjà d'une réputation visible qui peut rassurer les prospects.";
  }
  if (strength.signal === "rating") {
    return "Votre note moyenne constitue déjà un signal rassurant au moment de la comparaison.";
  }
  if (strength.signal === "position") {
    return "Votre visibilité locale constitue déjà un point d'appui intéressant.";
  }
  return `${strength.title}.`;
}

function prioritySentence(priority) {
  if (!priority) {
    return "L'enjeu consiste surtout à maintenir ces signaux et à continuer d'actualiser votre fiche.";
  }
  const impact = vocabularyForImpact(priority.impactType);
  if (priority.signal === "position") {
    return "En revanche, votre visibilité dans les résultats locaux limite encore le nombre de prospects qui découvrent votre fiche.";
  }
  if (priority.signal === "description") {
    return "En revanche, votre description limite encore la capacité de la fiche à expliquer clairement pourquoi vous choisir.";
  }
  if (priority.signal === "photos") {
    return "En revanche, vos visuels peuvent encore mieux montrer votre activité et rendre la fiche plus concrète.";
  }
  return `En revanche, le principal levier concerne votre ${labelForSignal(priority.signal)}, afin de ${impact.benefit}.`;
}

function actionSentence(priorities = []) {
  if (!priorities.length) {
    return "Les recommandations présentées dans ce rapport visent à protéger cette avance et à garder une fiche active.";
  }
  const labels = priorities.slice(0, 2).map((item) => {
    const label = labelForSignal(item.signal);
    return /^[aeiouéèêàâîïôùûh]/i.test(label) ? `l'${label}` : `la ${label}`;
  }).join(" et ");
  return `Les recommandations présentées dans ce rapport se concentrent sur ${labels}, les leviers offrant aujourd'hui le meilleur rapport entre effort et impact potentiel.`;
}

// Point 5 du plan (2026-07-31, Sprint 2A) : mêmes libellés que labelForSignal()
// (vocabulary.js), avec le même article défini que celui déjà utilisé par
// actionSentence() ci-dessus (repris à l'identique, non modifié).
function leverLabel(signal) {
  const label = labelForSignal(signal);
  return /^[aeiouéèêàâîïôùûh]/i.test(label) ? `l'${label}` : `la ${label}`;
}

const LEVERS_INTRO = "Aujourd'hui, les principaux leviers qui limitent votre visibilité sont :";
const LEVERS_CLOSING = "Les recommandations de ce rapport se concentrent sur ces priorités, car elles offrent aujourd'hui le meilleur rapport entre effort et impact potentiel.";

export function buildExecutiveSummary({ strengths = [], priorities = [], confidence = null } = {}) {
  const opening = strengthSentence(strengths[0]);
  const text = [
    opening,
    prioritySentence(priorities[0]),
    actionSentence(priorities),
  ].join(" ");

  // Synthèse en liste, générée uniquement à partir des priorités déjà
  // calculées (jamais de libellé écrit en dur) : les 2-3 premiers leviers,
  // affichés par heroSection() quand la liste compte au moins 2 éléments.
  // Le paragraphe `text` ci-dessus reste inchangé et sert de repli sinon.
  const leversList = priorities.length >= 2
    ? priorities.slice(0, 3).map((item) => leverLabel(item.signal))
    : [];

  return {
    text: applyToneRules(text),
    confidence,
    opening: applyToneRules(opening),
    leversIntro: applyToneRules(LEVERS_INTRO),
    leversList,
    leversClosing: leversList.length ? applyToneRules(LEVERS_CLOSING) : null,
  };
}
