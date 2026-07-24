import { applyToneRules } from "./toneRules.js";
import { labelForSignal } from "./vocabulary.js";

function formatEvidence(item) {
  const value = item?.evidence?.value;
  const unit = item?.evidence?.unit;
  if (value === null || value === undefined || value === "") return null;
  return unit ? `${value} ${unit}` : String(value);
}

function strengthLine(item) {
  if (item.signal === "reviews") {
    const evidence = formatEvidence(item);
    return evidence
      ? `${evidence} : une réputation visible qui rassure dès la comparaison.`
      : "Réputation : un point d'appui déjà rassurant pour les prospects.";
  }
  if (item.signal === "rating") {
    return "Note moyenne : un signal de confiance déjà visible.";
  }
  return `${labelForSignal(item.signal)} : ${item.title}.`;
}

function priorityLine(item) {
  if (item.signal === "position") {
    return "Visibilité locale : votre fiche n'apparaît pas encore dans le trio de tête observé.";
  }
  if (item.signal === "description") {
    return "Description : votre offre peut être expliquée plus clairement.";
  }
  if (item.signal === "photos") {
    return "Photos : votre activité peut être rendue plus concrète visuellement.";
  }
  return `${labelForSignal(item.signal)} : ${item.title}.`;
}

export function buildKeyFindingLine(item) {
  if (!item) return null;
  const line = item.type === "strength" ? strengthLine(item) : priorityLine(item);
  return applyToneRules(line);
}
