// Configuration centralisée et UNIQUE de la profondeur/vocabulaire par reportType.
// Consommée par knowledgeEngine.js, composer-engine/{composerEngine,selection,narrativeModel}.js
// et renderAnalysisHtml.js. Aucune autre copie de ces plafonds ne doit exister ailleurs.
//
// Ne modifie ni Observation, ni Benchmark, ni le Score Efficia, ni les 29 critères,
// ni les pondérations : ce fichier ne pilote que la sélection/présentation des
// constats produits en aval par Knowledge/Reasoning/Composer.

export const REPORT_TYPES = { FREE: "free", PREMIUM: "premium" };

// Le diagnostic gratuit reprend EXACTEMENT les plafonds déjà en vigueur aujourd'hui
// (COMPOSER_CONFIG.caps + le "top 3" historique de Knowledge). Ce n'est pas une
// invention : le document IA-003 "Pipeline d'analyse Efficia" (P6, "Sélection
// éditoriale") documente déjà le choix des 3 priorités comme la méthode du
// diagnostic gratuit ("Entrée A"). Le gratuit ne change donc pas de comportement.
const FREE_PROFILE = {
  reportType: REPORT_TYPES.FREE,
  caps: {
    strengths: 3,
    weaknesses: 3,
    opportunities: 5,
    priorities: 3,
    keyFindings: 3,
    actionPlan: 5,
  },
  vocabulary: {
    reportLabel: "Diagnostic Efficia™",
    eyebrow: "Diagnostic Google Business",
    prioritiesTitle: "Les 3 priorités",
    // Transition naturelle vers l'Audit Efficia (Cartographie de production §6.2/§6.3),
    // affichée uniquement si le renderer choisit de l'exploiter (repli sur "" sinon).
    upsellNote: "Ce diagnostic met en lumière les leviers prioritaires identifiés sur votre fiche. L'Audit Efficia™ (99 €) approfondit l'analyse : il transmet l'ensemble des constats pertinents et le plan d'action complet prévu par la méthode.",
  },
};

// L'Audit Efficia à 99 € : mêmes forces (les documents produit ne différencient pas
// ce point), mais aucun plafond arbitraire sur les faiblesses/opportunités/priorités/
// plan d'action — cf. "Audit 99 - Cartographie de production.md" §4.2/§5.1 :
// "l'audit 99€ doit livrer toutes les recommandations correspondant aux critères
// non conformes, ordonnées par priorité". `null` = pas de plafond (borné uniquement
// par les constats réellement disponibles, jamais par une valeur inventée).
const PREMIUM_PROFILE = {
  reportType: REPORT_TYPES.PREMIUM,
  caps: {
    strengths: 3,
    weaknesses: null,
    opportunities: null,
    priorities: null,
    keyFindings: 3,
    actionPlan: null,
  },
  vocabulary: {
    reportLabel: "Audit Efficia™",
    eyebrow: "Audit Google Business",
    prioritiesTitle: "Vos priorités",
    upsellNote: "",
  },
};

export const REPORT_DEPTH_PROFILES = {
  [REPORT_TYPES.FREE]: FREE_PROFILE,
  [REPORT_TYPES.PREMIUM]: PREMIUM_PROFILE,
};

// Résolution "moteur pur" : utilisée par knowledgeEngine.js / composerEngine.js.
// Défaut sûr = profil GRATUIT (comportement historique inchangé) lorsque reportType
// est omis — c'est le cas de tous les appels directs existants (tests unitaires,
// appels sans contexte d'analyse). Seule la valeur explicite "premium" active le
// profil étendu.
export function resolveReportDepth(reportType) {
  return reportType === REPORT_TYPES.PREMIUM ? PREMIUM_PROFILE : FREE_PROFILE;
}

// Résolution "métier" : utilisée aux points d'entrée qui lisent une analyse
// persistée (Knowledge, Reasoning, Composer, renderer). Comportement de repli
// DOCUMENTÉ pour les analyses historiques : si reportType est absent ou invalide
// (colonne report_type NULL — analyses antérieures à la migration
// 0010_analysis_report_type.sql, ou toute autre valeur inattendue), l'analyse est
// traitée comme "premium".
//
// Ce choix a été révisé à l'introduction du renderer gratuit dédié (Sprint
// Composer → HTML, Étape B) : "free" ne pilote plus seulement des plafonds et du
// vocabulaire, il sélectionne désormais une STRUCTURE de document entièrement
// différente (renderFreeDiagnosticHtml, 6 pages, sections inédites). Retenir
// "free" par défaut ferait basculer une analyse historique ou orpheline — qui
// n'a jamais eu de freeDiagnostic renseigné — vers une page potentiellement vide
// (band/indices/domains/criteriaSummary null). Retenir "premium" par défaut
// préserve au contraire EXACTEMENT le rendu déjà connu (renderPremiumAuditHtml,
// la seule structure qui existait avant cette évolution) pour toute analyse qui
// n'a pas explicitement choisi "free". Seule une valeur explicite "free" (choisie
// par un humain via la validation manuelle) fait basculer une analyse vers le
// Diagnostic Efficia gratuit.
export function resolveAnalysisReportType(reportType) {
  return reportType === REPORT_TYPES.FREE ? REPORT_TYPES.FREE : REPORT_TYPES.PREMIUM;
}
