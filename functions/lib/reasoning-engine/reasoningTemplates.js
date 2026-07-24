export const reasoningTemplates = {
  short: ({ businessImpact, competitiveAngle }) => `${businessImpact} ${competitiveAngle}`,
  long: ({ cause, googleImpact, businessImpact, competitiveAngle }) => (
    `${cause} ${googleImpact} ${businessImpact} ${competitiveAngle}`
  ),
};
