> Historique de conception : les descriptions de mise en page et de validation ci-dessous correspondent à des étapes antérieures. Voir `diagnostic-client-v5.md` pour le contrat courant et le bilan complet avant PR.

# Diagnostic client v2 — contrat et limites

## Rang : `observed` n'est pas synonyme d'organique

`functions/lib/benchmarkEngine.js` calcule des comparaisons de métriques ; il ne certifie pas le type de classement. Le contrat décisif est dans `functions/lib/collectCompetitors.js` : `rankedPlaces` exclut les annonces identifiées ; `positionKind` vaut `organic` si le fournisseur fournit une classification des annonces, et `observed` sinon. `sponsoredResultsExcluded: 0` signifie zéro annonce identifiée, pas preuve de leur absence.

La classification accepte `observed` comme organique uniquement avec une preuve explicite `rankEvidence.organicResultsOnly === true`. Ce marqueur n'est pas ajouté aux données historiques. Le snapshot réel Sarland contient `observed`, rang 1, index fournisseur 0, sans cette preuve : le profil reste indéterminé. Le client lit néanmoins son premier rang observé, la requête, la date et la réserve sur les annonces. Passer arbitrairement Sarland en A affaiblirait le garde-fou demandé.

Les nouvelles collectes conservent le rang normalisé individuel AVANT exclusion de la cible et qualification métier, ainsi que la comparabilité métier. `business.competitors` transmet ces métadonnées. Les anciens rangs manquants restent nuls ; l'ordre du panel n'est jamais utilisé pour les reconstituer.

## Preuves opérateur

Les radios des critères possèdent une option « Non vérifiable ». Cette réponse est enregistrée avec points null et restaurée explicitement, sans conversion à zéro. Une réponse ferme à un contrôle public crée une preuve datée du jour ; un intervalle reste `partial` et conserve son libellé, sans inventer de date exacte. Les réponses historiques explicitement manuelles sont migrées avec la date du brouillon (date du snapshot pour le rejeu Sarland). Les choix automatiques ne sont pas présentés comme des vérifications de l'opérateur. Le statut de revendication n'est pas déduit d'une observation publique ; les deux modes de localisation conservent leur contrôle spécifique.

Les preuves explicites déjà enregistrées sont conservées. Une nouvelle réponse remplace la preuve du critère ; la réponse Non vérifiable invalide la preuve précédente. La conversion ne modifie ni le barème ni les points de la réponse.

Les questions composées restent limitées à leur sens : « Absents / faux » ne devient pas « aucun horaire », « Un seul » ne désigne pas arbitrairement le téléphone ou le site. Les preuves précises de Sarland permettent en revanche de décrire l'absence des horaires habituels et du lien de site.

## Texte client et export

Les détails internes restent dans le brouillon et les preuves : valeur, source, URL, fiabilité, date complète et opérateur. Le client reçoit une seule source courte par constat, avec une date JJ/MM/AAAA. Le lint vérifie les blocs personnalisables et toute la surface textuelle du rapport ; la validation du DOM empêche aussi un ajout technique après rendu. Les liens commerciaux cliquables restent des annotations PDF, sans URL imprimée.

Les points d'appui occupent toute la largeur. Seuls les textes inférieurs à 12 CSS px sont relevés à 12 px (9 pt), sans aplatir la hiérarchie typographique.

Reproduction locale : `node scripts/render-diagnostic-evidence-controls.mjs --real-sarland`. Le script charge `output/sarland-reel/finalisation-reelle.json` sans le modifier, utilise les API de transport simulées du harnais local, puis exécute réellement `telechargerPDF` → `preparerRenduDiagnosticGratuit` → html2canvas → jsPDF. L'interception de `save` récupère uniquement les octets du PDF ; elle ne remplace pas le rendu. Toutes les requêtes métier sont interceptées, aucune nouvelle collecte ni écriture distante. Le contrôle JSON conserve score, preuves, priorités, lint, dimensions et appels du rejeu.
