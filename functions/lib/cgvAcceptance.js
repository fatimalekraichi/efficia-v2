export const ACTIVE_CGV_VERSION = "2026-08-18";

export const CGV_ACCEPTANCE_ERROR = {
  success: false,
  error: "CGV_ACCEPTANCE_REQUIRED",
  message: "Vous devez lire et accepter les Conditions générales de vente avant de poursuivre.",
};

export const hasValidCgvAcceptance = (payload) => (
  payload?.cgv_accepted === true
  && payload?.cgv_version === ACTIVE_CGV_VERSION
);

export const createCgvAcceptanceProof = () => ({
  acceptedAt: new Date().toISOString(),
  version: ACTIVE_CGV_VERSION,
});
