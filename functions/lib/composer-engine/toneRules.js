export const TONE_RULES = {
  principles: [
    "positif",
    "pédagogique",
    "orienté décision",
    "jamais culpabilisant",
    "jamais alarmiste",
    "jamais vendeur",
  ],
  forbiddenPatterns: [
    /votre fiche est mauvaise/i,
    /vous perdez des clients/i,
    /catastroph/i,
    /urgent/i,
    /grave/i,
  ],
  replacements: [
    {
      pattern: /votre fiche est mauvaise/gi,
      value: "plusieurs optimisations peuvent encore améliorer votre visibilité",
    },
    {
      pattern: /vous perdez des clients/gi,
      value: "certains prospects peuvent choisir une fiche plus visible ou plus claire",
    },
  ],
};

export function applyToneRules(text) {
  let output = String(text || "").replace(/\s+/g, " ").trim();
  for (const replacement of TONE_RULES.replacements) {
    output = output.replace(replacement.pattern, replacement.value);
  }
  return output;
}

export function respectsToneRules(text) {
  return !TONE_RULES.forbiddenPatterns.some((pattern) => pattern.test(String(text || "")));
}
