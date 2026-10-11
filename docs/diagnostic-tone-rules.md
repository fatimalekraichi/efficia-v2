> Historique de conception : les descriptions de mise en page et de validation ci-dessous correspondent à des étapes antérieures. Voir `diagnostic-client-v5.md` pour le contrat courant et le bilan complet avant PR.

# Diagnostic Efficia — récit et preuves

## État initial

Inspection locale du 11 octobre 2026, avant modification du générateur. Base :
`main` / `0a3b5fe`, espace isolé `feat/diagnostic-evidence-narrative`.
Le dossier historique `efficia-v2`, avec ses changements non publiés, reste intact.

- Collecte : `functions/api/admin/free-diagnostic-collect/[analysisId].js`,
  `functions/lib/benchmarkEngine.js`, `functions/config/benchmark.config.js`.
  La collecte conserve notamment les champs observés, le type de position,
  la requête, la qualification concurrentielle et la date du test.
- Score : `functions/lib/score-efficia/{scoreConfig,criteriaCatalog,scoreCatalog,scoreEngine}.js`
  et moteur partagé navigateur `js/score-efficia-core.js`. Les catégories ont
  déjà un poids ; les contributions normalisées ne doivent pas être pondérées
  une deuxième fois lors du classement éditorial des actions.
- Administration et rapport gratuit : `admin/free-diagnostic-production/index.html`.
  `donneesAnalyse`, réponses et sources des critères alimentent le rapport.
  Les remplacements manuels sont conservés par les fonctions `texteEffectifRapport`
  et `textePublicationDiagnostic` et les routes `report-text-overrides`.
- Priorités : `selectionnerPrioritesDynamiques` regroupe les critères par famille,
  mélange ratio perdu, constante d'impact, caractère réparable et points perdus ;
  une règle spécifique à zéro avis peut surclasser les autres familles.
- Textes : `verdictConfianceDiagnostic`, `narrationPrioriteV3`,
  `constatObservePriorite`, `forceChiffree` et `genererRapport` dans cette page.
  Plusieurs formulations actuelles évoquent des freins aux contacts sans mesure.
- Benchmark : `statistiquesAvisConcurrents` calcule déjà une médiane des valeurs
  connues. Certaines présentations utilisent encore des moyennes pré-calculées
  et assimilent un panel incomplet à une comparaison insuffisante en général.
- Jauge : `scoreGaugeHtml`, `BANDES` et configuration de score existante.
- PDF gratuit : `preparerRenduDiagnosticGratuit`, `telechargerPDF`, html2canvas
  et jsPDF ; quatre pages fixes, avec contrôle de débordement. L'aperçu et
  l'impression passent également par la préparation du rapport.
- Le rendu serveur `functions/lib/{narrativeModel,renderAnalysisHtml,pdfRenderer}.js`
  et le rapport premium constituent des chemins distincts ; ne pas confondre
  leur scoring avec la sélection narrative du diagnostic gratuit.

## Arbitrage confirmé

L’utilisatrice a confirmé : « conserver les garde-fous du premier texte ».
Le second texte apporte la configuration centralisée, les fonctions pures,
ce document et le comparatif éditorial. Ses règles contradictoires sont écartées :
pas de profil B grâce aux avis seuls, pas de jauge recolorée selon le profil,
pas de promesse de première place, pas de date inventée et pas de conclusion
sur le nombre réel de concurrents dans une zone à partir du panel sélectionné.

## Règles et emplacements

- `js/diagnostic-tone-config.js` : seuils, profils, couleurs des badges,
  libellés, explications des six domaines, champs précis et expressions de lint.
- `js/diagnostic-evidence.js` : fonctions pures `classifyProfile`,
  `benchmarkStatistics`, `leaderForSearch`, `calculatePriority`,
  `buildDiagnosticModel` et `lintDiagnosticText`.
- `js/diagnostic-report.js` : composition des quatre pages et contrôle de leurs
  textes finaux. Les identifiants des textes personnalisables restent ceux
  du catalogue existant, notamment `priority.1.observation`.
- `admin/free-diagnostic-production/index.html` : adaptation des réponses,
  saisie des preuves, conservation des métadonnées de recherche et contrôle
  bloquant avant aperçu/impression/PDF. Le moteur premium reste distinct.

### Profil et score

A = rang organique 1 ; B = 2–3 ; C = 4–10 ; D = au-delà de 10.
Une absence confirmée ne donne D que si son périmètre est documenté.
Rang absent, zéro sans preuve d’absence, rang publicitaire ou ambigu : indéterminé.
La preuve est un test identifié par requête/date ou un rang explicitement confirmé.
Les dates ou lieux non fournis restent affichés comme non renseignés ; la ville
ciblée ne devient jamais le lieu réel du test.

La jauge continue d’appeler `scoreGaugeHtml` et ses bandes existantes.
Les calculs, poids, critères et versions du moteur de score ne sont pas modifiés.
Un rang 15 reste D même avec une excellente note ; un rang 1 reste A même
avec un faible score. Le badge et le score expriment deux informations distinctes.

### Preuves

Chaque observation peut être conservée dans
`answers.observedData.evidence[criterionKey]` avec :

```json
{
  "criterionId": "contact",
  "field": "téléphone",
  "observedValue": "absent lors du contrôle",
  "source": "Lien ou source vérifiée par l’opérateur",
  "observedAt": "2026-10-10",
  "confidence": "certain",
  "availability": "observed",
  "relevant": true
}
```

L’exemple illustre le format, pas une observation Sarland.
`certain` produit un constat affirmatif ; `partial` ajoute explicitement
« Observation partielle » ; `uncertain` exclut le constat et la priorité.
`not_retrieved`/`unavailable` restent inconnus, même si une ancienne valeur vaut zéro.
Les mesures numériques héritées restent partielles et sourcées comme données
renseignées dans le diagnostic ; une ancienne réponse notée ne suffit pas à
prouver une absence précise. La récence exige une date valide. Les attributs et
catégories secondaires exigent une pertinence métier confirmée.

Le panneau **Preuves du diagnostic** permet de saisir le champ, la valeur,
la source, la date, la fiabilité et la pertinence. Téléphone/site et horaires
habituels/jours fériés sont distingués. L’opérateur applique la preuve puis
utilise **Enregistrer le brouillon**. Les anciens dossiers `fields: null`
continuent à être chargés. La saisie d’une preuve ne change pas les points cochés.

### Priorités

Contribution perdue = points bruts manquants × maximum normalisé précis du
domaine ÷ maximum brut évalué du domaine. Le poids du domaine intervient
**une seule fois**. Importance = cette contribution × facteur comparatif.

- 1,5 : défaut mesuré et premier comparable satisfait, ou majorité stricte
  d’au moins deux concurrents connus et comparables satisfaits.
- 1 : comparaison absente, non documentée, égalité ou majorité non établie.
- 0,5 : mesure du client supérieure au repère comparable concerné.

Les comparaisons doivent être explicitement documentées par
`evidence.comparison.comparable` et, pour les critères des pairs,
`competitor.criteria[key].comparable/satisfied`. Les compteurs du même relevé
qualifié peuvent être comparés ; les périodes et notions différentes ne sont
pas fusionnées. Aucun multiplicateur n’est déduit d’une donnée manquante.

Seuils de présentation : ≥ 4 « Priorité élevée », ≥ 2 « Priorité intermédiaire »,
sinon « À renforcer ». Ce sont des seuils éditoriaux, pas une prévision commerciale.
Le volume d’avis déjà supérieur au repère ne reçoit pas « Priorité élevée ».
Un problème distinct de récence exige sa propre preuve ; il n’est pas déduit du volume.
Tri décroissant, égalités départagées par la clé du critère ; maximum trois actions.
La version actuelle expose une action par contrôle distinct, sans regroupement
implicite. Le reliquat soustrait donc les contrôles effectivement présentés des
contrôles en défaut ou à renforcer, et sépare les non-vérifiables.

### Comparaisons

Toujours au plus trois fiches, sans nouvelle collecte de cinq entreprises.
Médiane pour le nombre d’avis ; moyenne pour les notes/photos connues ; zéro
conservé, valeurs manquantes exclues. Une note avec moins de trois avis ou un
volume inconnu porte une réserve, sans invalider les photos.
Le panel est présenté comme indicatif avec son nombre réel de fiches retenues.

Le vrai premier doit porter un rang 1 organique explicite et les mêmes requête,
date et lieu documentés. L’ordre du tableau ne vaut jamais preuve de classement.
Le profil B affiche au maximum deux écarts dont la comparabilité est attestée.
À défaut, le rapport indique l’absence d’écart documenté.
Une médiane fournie seule peut être montrée sans fabriquer les fiches individuelles,
avec la mention explicite que l’effectif n’est pas renseigné.

### Contrôle éditorial et modifications manuelles

Le lint s’applique après les remplacements manuels, avant export : gabarits,
placeholders, promesses de classement, champs ambigus, jargon dans les constats,
pronom sans antécédent, certitude incohérente, valeur non étayée, absence vs donnée
inaccessible, généralisation d’un échantillon annuel, contradictions sur le même
champ et compteurs incohérents. Les titres méthodologiques ne sont pas traités
comme des constats. L’écran donne l’identifiant du bloc et la correction attendue.

Un constat modifié exige la validation de son texte exact contre sa preuve dans
le panneau dédié (`validatedText`) ; cela ne désactive pas les contrôles de
valeurs, de contradictions ou de promesses. Les anciennes corrections marquées
à revérifier restent conservées et ne remplacent pas les textes du PDF.
Une modification du texte DOM après validation bloque aussi l’export officiel.
Ce lint déterministe ne remplace pas la vérification humaine de la réalité d’une
source saisie manuellement ni une compréhension sémantique exhaustive.

### Offres

99 € TTC / 349 € TTC ; déduction de 99 € sous 30 jours conservée.
Le QR code facilite la demande d’avis authentiques ; le client transmet ses
informations, valide les contenus et sollicite ses clients. Aucun faux avis,
aucune récompense ni sélection, aucune affiliation à Google et aucune garantie
de classement, d’avis ou de résultat commercial.

## Ajouter une règle

Pour un profil, modifier la configuration puis la sélection dans `classifyProfile`
et ajouter les tests des bornes, sans toucher aux bandes de score.
Pour un lint, ajouter le motif contextualisé dans la configuration ou une règle
structurée dans `lintDiagnosticText`, avec un exemple autorisé et un interdit.
Ne pas créer une liste de mots interdits appliquée indistinctement à tout le PDF.

## Contrôles et limites Sarland

Seuls les cinq faits du premier texte sont retenus : rang 2, note 4,6,
19 avis, médiane 4 et score 49. Les détails supplémentaires contradictoires du
second texte ne deviennent pas des preuves. Pas de date du dernier avis,
d’absence de description ou de défaut d’horaires inventés. Le score 49 est
un score **fourni**, non recalculé à partir de réponses reconstituées.

Deux PDF de quatre pages sont produits par
`node scripts/render-diagnostic-evidence-controls.mjs` dans `output/pdf/` :
Sarland sur faits fournis, et exemple entièrement fictif testant trois priorités,
le profil D avec un score élevé, la médiane zéro et le benchmark incomplet.
Le comparatif `sarland-avant-apres.html` montre le verdict de l’ancien helper
au score 49 et le nouveau verdict ; il ne prétend pas reproduire un ancien PDF
client indisponible. Les HTML, JSON et PNG servent de preuves de contrôle locales.
Aucun appel réel de collecte, aucune modification de base distante, aucune
publication, aucun commit ni push ne sont nécessaires à ces contrôles.

## Résultat de validation du 11 octobre 2026

Suite finale : **447 tests, 438 réussis, 9 échecs préexistants, aucun ignoré**.
Les neuf échecs sont dans `freeDiagnosticAdminSecurity.test.js` (4) et
`freeDiagnosticDuplicateAuthorization.test.js` (5). Ils ont été reproduits à
l’identique dans une extraction indépendante de `main` / `0a3b5fe` :
27 tests serveur, 18 réussis, les mêmes 9 échecs. Ils concernent les attentes
sur la collecte et les statuts de relance (409/200/502/404), pas le nouveau rendu.
Ces fonctions serveur n’ont pas été modifiées. La suite globale n’est donc
pas annoncée entièrement verte.

Commande finale :

```sh
node --test --test-concurrency=1 tests/freeDiagnostic*.test.js tests/diagnosticNarrativeConsistency.test.js tests/adminFreeDiagnosticPdfCopyFix.test.js tests/reportNarrativeOverrides.test.js tests/scoreEfficiaV5.test.js tests/benchmarkEngine.test.js tests/diagnosticEvidence*.test.js
```

Les nouveaux tests couvrent profils/bornes, preuve absente, récence inconnue,
comparaison partielle, vrai premier, médiane zéro, priorité sans double poids,
contradictions manuelles, conservation des preuves, `fields: null`, blocage
éditorial dans Chrome et détection de modification du DOM avant export.
Les tests historiques du rendu, des textes personnalisés et des captures PDF
ont été adaptés à la nouvelle structure et aux preuves obligatoires.
Le calcul du score et le snapshot historique immuable restent validés.

Contrôles supplémentaires : syntaxe des trois modules et du script intégré,
`git diff --check`, deux vrais PDF html2canvas/jsPDF de quatre pages, contrôle
géométrique des huit pages et inspection des huit PNG finaux après conversion
avec `pdftoppm`. Pas de débordement ni chevauchement observé.

### Fichiers de code et de tests

- Générateur : `admin/free-diagnostic-production/index.html`.
- Nouveaux modules : `js/diagnostic-tone-config.js`, `js/diagnostic-evidence.js`,
  `js/diagnostic-report.js`.
- Reproduction : `scripts/render-diagnostic-evidence-controls.mjs`.
- Nouveaux tests : `tests/diagnosticEvidence.test.js`,
  `tests/diagnosticEvidenceRender.test.js`, `tests/diagnosticEvidenceBrowser.test.js`.
- Tests adaptés : `adminFreeDiagnosticPdfCopyFix`, `freeDiagnosticBrowserFixture`,
  `freeDiagnosticFinalization`, `freeDiagnosticFourPages`,
  `freeDiagnosticMethodology`, `freeDiagnosticNarrativeVariants`,
  `freeDiagnosticReviewVolume`, `freeDiagnosticTrustPriority`,
  `reportNarrativeOverrides`, `scoreEfficiaV5` dans `tests/`.

État de livraison : fichiers locaux non commités dans
`feat/diagnostic-evidence-narrative`, HEAD inchangé à `0a3b5fe`.
Aucun commit, push, merge ou déploiement ; production non modifiée.
