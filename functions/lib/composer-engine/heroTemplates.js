import { applyToneRules } from "./toneRules.js";

function scoreLevel(score) {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 50) return "medium";
  return "low";
}

const HERO_TEMPLATES = {
  excellent: {
    reviews: {
      position: "Votre établissement inspire déjà confiance. La prochaine étape est de devenir l'un des premiers choix sur Google.",
      default: "Votre établissement dispose déjà d'une base très solide. Les prochaines optimisations servent surtout à défendre et amplifier cette avance.",
    },
    default: "Votre fiche présente de très bons signaux. L'enjeu est maintenant de transformer cette avance en visibilité durable.",
  },
  good: {
    reviews: {
      position: "Votre établissement inspire déjà confiance. Le principal enjeu est maintenant de rendre cette réputation plus visible au bon moment.",
      description: "Votre réputation rassure déjà. Une fiche plus claire peut maintenant aider davantage de prospects à comprendre pourquoi vous choisir.",
      photos: "Votre réputation est déjà un atout. Des preuves visuelles plus récentes peuvent rendre cette confiance encore plus concrète.",
      default: "Votre établissement inspire déjà confiance. Les meilleurs gains se situent désormais dans la clarté et la visibilité de votre fiche.",
    },
    default: "Votre fiche possède de bonnes bases. Les optimisations prioritaires peuvent rendre votre présence Google plus lisible et plus convaincante.",
  },
  medium: {
    reviews: {
      position: "Votre entreprise dispose déjà d'un signal de confiance utile. La priorité est de mieux le faire apparaître dans les recherches locales.",
      default: "Votre fiche montre déjà des points rassurants. Plusieurs ajustements peuvent encore améliorer sa capacité à déclencher un contact.",
    },
    default: "Votre fiche présente une base exploitable. Les priorités identifiées peuvent améliorer sa visibilité et sa capacité à rassurer.",
  },
  low: {
    default: "Votre fiche peut devenir un levier plus clair pour attirer des clients. Les premières actions doivent renforcer sa visibilité et sa crédibilité.",
  },
};

export function buildHeroHeadline({ score, topStrength, topPriority } = {}) {
  const level = scoreLevel(Number(score) || 0);
  const strengthSignal = topStrength?.signal || "default";
  const prioritySignal = topPriority?.signal || "default";
  const group = HERO_TEMPLATES[level] || HERO_TEMPLATES.medium;
  const byStrength = group[strengthSignal] || group.default;
  const template = typeof byStrength === "string"
    ? byStrength
    : byStrength[prioritySignal] || byStrength.default;
  return applyToneRules(template);
}
