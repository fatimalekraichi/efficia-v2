# Decision Engine

Dernière mise à jour : 2026-07-17

Ce document décrit le moteur de décision actuellement présent dans le code Efficia Digital. Il ne décrit pas une architecture cible déjà implémentée : il documente l'existant avant extraction, refactorisation ou automatisation.

Le moteur actuel se trouve principalement dans `outil-score-efficia-auto-v5.html`. Le Worker Cloudflare (`efficia-scraping-worker/src/index.js`) collecte, normalise partiellement et archive les données, mais le calcul du Score Efficia™, la sélection des priorités, la rédaction des observations et la génération PDF restent majoritairement dans l'outil HTML.

## Sources inspectées

| Type | Chemin | Rôle |
|---|---|---|
| Outil principal | `efficia-v2/outil-score-efficia-auto-v5.html` | Grille de critères, scoring, sous-scores, priorités, rédaction PDF, payload D1 |
| Copie outil Worker | `efficia-scraping-worker/outil-score-efficia-auto-v5.html` | Copie alignée de l'outil utilisée localement |
| Worker scraping / D1 | `efficia-scraping-worker/src/index.js` | Outscraper, audit provisoire, finalisation D1, knowledge stats |
| Schéma D1 initial | `efficia-scraping-worker/migrations/0001_efficia_knowledge_base.sql` | `businesses`, `audits`, `audit_metrics`, `audit_criteria`, `audit_competitors`, `interventions` |
| Knowledge stats | `efficia-scraping-worker/migrations/0002_knowledge_stats.sql` | Agrégats par scope |
| Fondations futures | `efficia-scraping-worker/migrations/0003_prepare_future_features.sql` | Tables préparatoires non exécutées par le moteur actuel |
| Versions et PDF | `efficia-scraping-worker/migrations/0004_audit_versions_and_manual_archiving.sql` | `audit_versions`, `audit_recommendations` |
| Pipeline | `efficia-v2/docs/Efficia/04 - IA/Pipeline d'analyse Efficia.md` | Référence de parcours P0 à P12 |
| Référentiel | `efficia-v2/docs/Efficia/03 - Référentiel/*` | Référentiel documentaire encore partiellement séparé du code |

## Flux réel actuel

```text
Données Google / Outscraper / saisie manuelle
→ donneesAnalyse + champs du formulaire
→ critères de GRILLE
→ points cochés automatiquement, préremplis ou manuels
→ calculScoreDetail()
→ Score Efficia™
→ indicesProspect()
→ Visibilité / Confiance / Conversion
→ selectionnerPrioritesDynamiques()
→ observation, recommandation, action, impact
→ genererRapport()
→ PDF
→ construirePayloadAuditComplete()
→ POST /audit/:publicId/complete
→ D1 : audits, audit_metrics, audit_criteria, audit_competitors, audit_versions, audit_recommendations
```

## 1. Données d'entrée

### Sources

| Source | Fonction / zone | Données produites |
|---|---|---|
| Google Places API | `analyser()` | nom, note, avis, photos partielles, catégorie, recherche locale |
| Worker Outscraper | `analyseScraping()` + `executerScraping()` | fiche, avis récents, réponses propriétaire, concurrents, position, photos totales, description |
| Saisie manuelle | champs `d-*`, `dc-*`, radios de critères | corrections manuelles, données absentes, concurrents saisis |
| Back-office | paramètres URL lus par `initialiserContexteCommandeAdmin()` | entreprise, ville, prénom, email, offre, orderId, taskId |

### Variable centrale

Dans l'outil, la variable `donneesAnalyse` centralise les observations utiles au rapport :

- `nbAvis`
- `nbPhotos`
- `note`
- `position`
- `requeteTestee`
- `concurrence`
- `concurrents`
- `descriptionLongueur`
- `dernierAvis`
- `dernierePublication`
- `nbServices`
- `nbPublications`
- `avisAnalyses`
- `reponsesProprietaire`

Limite actuelle : `donneesAnalyse` est une structure en mémoire dans le HTML. Elle n'est pas typée, pas testée isolément et mélange données observées, saisies, moyennes et état éditorial.

## 2. Référentiel des critères

### Constantes principales

| Élément | Fonction / constante | État |
|---|---|---|
| Configuration globale | `CONFIG` | Implémenté |
| Pondérations par catégorie | `CONFIG.poids` | Implémenté |
| Seuils métier | `CONFIG.seuils` | Implémenté |
| Checklists subjectivité | `CONFIG.checklist` | Implémenté |
| Profils sectoriels | `CONFIG.secteurs` | Implémenté |
| Temps estimés | `CONFIG.tempsTaches` | Implémenté |
| Grille de critères | `GRILLE` | Implémenté |
| Index de critères | `CRITERE_IDS` | Implémenté |

### Catégories et poids par défaut

Le total configuré est `CONFIG.totalScore = 100`.

| Catégorie | Poids par défaut |
|---|---:|
| Informations essentielles | 22 |
| Photos & visuels | 15 |
| Avis clients | 25 |
| Contenu de la fiche | 21 |
| Activité & animation | 5 |
| Visibilité locale | 12 |

### Profils sectoriels

`CONFIG.secteurs` modifie le poids des six catégories sans changer le total de 100. Exemples :

- `artisan` : avis et contenu plus importants, activité plus faible.
- `restaurant` : photos plus importantes.
- `sante` : informations essentielles très pondérées, photos plus faibles.

La détection automatique existe via `detecterProfilSecteur()`, mais le profil peut aussi être choisi manuellement. État : implémenté, mais non testé hors interface.

## 3. Attribution des points

Chaque critère de `GRILLE` possède :

- `key`
- `q`
- `aide`
- `max`
- `opts`
- `reco`
- `force`
- parfois `checklist`

Les points sont lus via `lirePoints(id)`.

### Types d'attribution

| Type | Mécanisme | État |
|---|---|---|
| Automatique | `cocher(id, points, note, "auto")` | Implémenté |
| Prérempli à confirmer | `cocher(..., "prefill")` | Implémenté |
| Manuel | radio sélectionné par l'utilisateur | Implémenté |
| Non évalué | aucun radio coché | Implémenté |

### Checklists

Les critères subjectifs peuvent être transformés en mini checklists via `majChecklist()` :

- qualité des photos ;
- qualité des réponses aux avis ;
- qualité de la description.

Règle actuelle :

- 4 à 5 cases cochées : note maximale ;
- 2 à 3 cases cochées : note intermédiaire ;
- 0 à 1 case cochée : note minimale.

État : implémenté dans l'outil. À définir côté référentiel externe.

## 4. Calcul du Score Efficia™

### Fonction principale

`calculScoreDetail()`

La formule actuelle est :

```text
Pour chaque catégorie :
  brut = somme des points obtenus sur critères évalués
  maxEvalue = somme des max des critères évalués
  pct = brut / maxEvalue si maxEvalue > 0
  pointsPonderes = pct × poidsCategorieDuProfil

Score normalisé :
  totalPondere = somme(pointsPonderes des catégories évaluées)
  poidsPrisEnCompte = somme(poidsCategorieDuProfil des catégories évaluées)
  score = totalPondere × (100 / poidsPrisEnCompte)
```

### Gestion des critères non évalués

Un critère non évalué (`lirePoints(id) === null`) :

- ne contribue pas au numérateur ;
- ne contribue pas au dénominateur de sa catégorie ;
- peut faire passer une catégorie entière en `pct = null` si aucun critère de la catégorie n'est évalué.

Conséquence : le score est normalisé sur les catégories évaluées. Ce choix évite de pénaliser directement une donnée absente, mais il peut aussi produire un score élevé avec peu de critères remplis.

### Fonction d'affichage live

`calc()` :

- appelle `calculScoreDetail()` ;
- met à jour le score live ;
- met à jour le nombre de critères restants ;
- met à jour les indicateurs internes ;
- sauvegarde localement ;
- déclenche une finalisation D1 différée via `programmerCompletionAuditEfficia()`.

État : implémenté, mais couplé à l'interface.

## 5. Sous-scores Visibilité, Confiance, Conversion

### Fonction principale

`indicesProspect()`

Elle appelle `scoreCriteres(keys)`, qui calcule :

```text
sous_score = points_obtenus_sur_criteres_mesures / max_des_criteres_mesures × 100
```

### Critères utilisés

| Sous-score | Critères |
|---|---|
| Visibilité | `categoriePrincipale`, `categoriesSecondaires`, `nap`, `classementLocal`, `recherchesSpecifiques`, `publicationRecente`, `rythmePublication`, `recenceAvis` |
| Confiance | `noteMoyenne`, `volumeAvis`, `tauxReponseAvis`, `qualiteReponsesAvis`, `qualitePhotos`, `contact`, `adresse`, `nap` |
| Conversion | `descriptionRemplie`, `descriptionQualite`, `servicesPresents`, `servicesDecrits`, `liensAction`, `questionsReponses`, `varietePhotos` |

Gestion des absences : mêmes règles que le score global. Si aucun critère d'un sous-score n'est évalué, le sous-score vaut `null` et l'interface affiche `Non mesuré`.

État : implémenté. Limite : les sous-scores ne sont pas configurés dans `CONFIG`, mais codés en dur dans `indicesProspect()`.

## 6. Comparaison concurrentielle

### Sources

- Google Places dans `analyser()` pour une comparaison simple.
- Outscraper dans `analyseScraping()` / Worker pour concurrents et position.
- Saisie manuelle dans les champs `dc-*`.

### Règles identifiées

- `CONFIG.seuils.toleranceConcurrents = 0.10`
- `CONFIG.seuils.toleranceNoteConcurrents = 0.15`
- `CONFIG.seuils.ecartNotePenalisant = 0.30`

La comparaison sert notamment à :

- volume d'avis ;
- attractivité vs concurrents ;
- benchmark PDF anonymisé ;
- observations de priorité réputation/photos.

État : partiellement implémenté. Les noms des concurrents existent encore dans les données internes (`donneesAnalyse.concurrents`) mais le PDF vise une restitution anonymisée.

## 7. Sélection des priorités

### Fonction principale

`selectionnerPrioritesDynamiques(candidats)`

### Familles de priorités

`FAMILLES_PRIORITES` :

- `offre`
- `reputation`
- `visibilite`
- `photos`
- `infos`
- `activite`

Chaque famille possède :

- une liste de critères ;
- un impact ;
- une action générique.

### Formule actuelle

Pour chaque critère avec points perdus :

```text
ratioPerdu = pointsPerdus / maxCritere
reparable = 1 si CONFIG.tempsTaches contient le critère, sinon 0.55
scorePriorite = ratioPerdu × 5 + impactFamille + reparable + pointsPerdus × 0.25
```

Ensuite :

1. le meilleur critère est conservé par famille ;
2. les familles sont triées par `scorePriorite` décroissant ;
3. les trois premières sont retenues ;
4. chaque priorité est enrichie avec `detailsPriorite()`.

État : implémenté. Limite : les coefficients `5`, `1`, `0.55`, `0.25` sont codés en dur.

## 8. Observations, recommandations et actions

### Fonctions éditoriales principales

| Rôle | Fonction |
|---|---|
| Titre de priorité | `titrePriorite()` |
| Recommandation | `recommandationPriorite()` |
| Observation factuelle | `constatObservePriorite()` |
| Conséquence business | `consequenceBusinessPriorite()` |
| Résultat attendu | `resultatAttenduPriorite()` |
| Niveau d'impact | `niveauImpactPriorite()` |
| Temps estimé | `tempsPriorite()` |
| Bloc HTML priorité | `rendrePriorite()` |

### Cas particulier photos

`prioritePhotosPorteSurActualite()` évite de recommander davantage de photos lorsque le volume est comparable ou supérieur à la moyenne concurrentielle. Dans ce cas, la priorité devient l'actualisation des photos.

État : implémenté suite aux derniers ajustements. Risque : règle intégrée au rendu éditorial, pas au moteur de scoring.

### Recommandations stockées en D1

`collecterRecommandationsAudit()` extrait les trois priorités retenues et prépare :

- `key`
- `title`
- `impact`
- `observation`
- `recommendation`
- `firstAction`
- `estimatedTime`
- `priorityRank`

État : implémenté récemment dans le payload d'archivage. À valider en D1 après migration.

## 9. Projection du score

### Fonction principale

`scoreProjetePack()`

Elle utilise `PACK_CRITERES`, c'est-à-dire les critères considérés directement corrigeables par le Pack.

Règle :

- les critères non évalués sont ignorés ;
- les critères inclus dans `PACK_CRITERES` sont projetés à leur valeur maximale ;
- les autres critères conservent leurs points actuels ;
- la même logique de pondération par profil est appliquée ;
- le score projeté est plafonné à 97.

État : implémenté. Limite : `PACK_CRITERES` est codé dans le HTML et n'est pas versionné séparément.

## 10. Données envoyées à D1

### Fonction côté outil

`construirePayloadAuditComplete(options)`

Champs envoyés actuellement :

- `requestName`
- `requestCity`
- `requestActivity`
- `testedQuery`
- `source`
- `environment`
- `orderId`
- `manualOverridesJson`
- `scoreEfficia`
- `visibilityScore`
- `trustScore`
- `conversionScore`
- `sectorProfile`
- `scoringVersion`
- `auditStatus`
- `pdfFilename`
- `criteria`
- `metrics`
- `competitors`
- `recommendations`

### Route Worker

`POST /audit/:publicId/complete`

Fonctions :

- `validerPayloadComplete()`
- `handleCompleteAudit()`

Tables touchées :

- `audits`
- `audit_versions`
- `audit_criteria`
- `audit_metrics`
- `audit_competitors`
- `audit_recommendations`
- `knowledge_stats` indirectement via Knowledge Engine.

### Critères D1

Chaque critère est stocké avec :

- `evaluation_status` : `compliant`, `partial`, `deficient`, `not_evaluated`
- `verification_status` : `observed`, `manually_confirmed`, `inferred`, `not_verified`, `unavailable`
- `points_awarded`
- `max_points`

Règle critique implémentée dans le schéma : si `evaluation_status = not_evaluated`, alors `verification_status = not_verified` et `points_awarded IS NULL`.

## 11. Cartographie du code

| Élément fonctionnel | Fichier | Fonction / constante | État |
|---|---|---|---|
| Configuration scoring | `outil-score-efficia-auto-v5.html` | `CONFIG` | Implémenté |
| Grille de critères | `outil-score-efficia-auto-v5.html` | `GRILLE` | Implémenté |
| Pondération sectorielle | `outil-score-efficia-auto-v5.html` | `CONFIG.secteurs`, `obtenirProfilActif()` | Implémenté |
| Détection secteur | `outil-score-efficia-auto-v5.html` | `detecterProfilSecteur()` | Partiellement implémenté |
| Score global | `outil-score-efficia-auto-v5.html` | `calculScoreDetail()` | Implémenté |
| Score live | `outil-score-efficia-auto-v5.html` | `calc()` | Implémenté mais couplé UI |
| Sous-score visibilité | `outil-score-efficia-auto-v5.html` | `indicesProspect()` | Implémenté |
| Sous-score confiance | `outil-score-efficia-auto-v5.html` | `indicesProspect()` | Implémenté |
| Sous-score conversion | `outil-score-efficia-auto-v5.html` | `indicesProspect()` | Implémenté |
| Critères non évalués | `outil-score-efficia-auto-v5.html` + D1 | `lirePoints()`, `statutEvaluationCritere()` | Implémenté |
| Statut de vérification | `outil-score-efficia-auto-v5.html` | `statutVerificationCritere()` | Implémenté |
| Priorités | `outil-score-efficia-auto-v5.html` | `selectionnerPrioritesDynamiques()` | Implémenté |
| Observations | `outil-score-efficia-auto-v5.html` | `constatObservePriorite()` | Implémenté |
| Recommandations | `outil-score-efficia-auto-v5.html` | `recommandationPriorite()` | Implémenté |
| Actions immédiates | `outil-score-efficia-auto-v5.html` | `detailsPriorite()`, `actionPhotosPriorite()` | Implémenté |
| Projection Pack | `outil-score-efficia-auto-v5.html` | `scoreProjetePack()`, `PACK_CRITERES` | Implémenté |
| Payload D1 | `outil-score-efficia-auto-v5.html` | `construirePayloadAuditComplete()` | Implémenté récemment |
| Audit provisoire scraping | `efficia-scraping-worker/src/index.js` | `archiverAuditProvisoire()` | Implémenté |
| Audit manuel provisoire | `efficia-scraping-worker/src/index.js` | `handleCreateProvisionalAudit()` | Implémenté récemment |
| Finalisation D1 | `efficia-scraping-worker/src/index.js` | `handleCompleteAudit()` | Implémenté |
| Knowledge stats | `efficia-scraping-worker/src/index.js` | `mettreAJourKnowledgeApresCompletion()` | Implémenté partiellement |
| Règles IA futures | migrations D1 | `knowledge_rules`, `ai_insights` | Présent dans la structure, absent du moteur |

## 12. Écarts entre le pipeline documenté et le code actuel

| Sujet | Pipeline / intention | Code actuel | État |
|---|---|---|---|
| Critères à confirmer exclus du score | Oui | `calculScoreDetail()` ignore les critères non cochés | Implémenté |
| Données absentes en `NULL` et non zéro | Oui | Worker utilise `null` via `nombre(... nullable)` et `metric()` ; outil mélange parfois `0` pour certains champs Google | Partiellement implémenté |
| Trois sous-scores | Oui | `indicesProspect()` | Implémenté |
| Trois priorités | Oui | `selectionnerPrioritesDynamiques().slice(0,3)` | Implémenté |
| Sélection par points perdus, impact, réparabilité | Oui | formule codée dans `selectionnerPrioritesDynamiques()` | Implémenté |
| Versionnement scoring | Oui | `SCORING_VERSION = "score-efficia-v4"` | Implémenté mais non centralisé |
| Versionnement PDF | Oui | `audit_versions` et nom fichier `Vx` | Implémenté récemment, à valider |
| Enregistrement `audit_criteria` | Oui | `handleCompleteAudit()` | Implémenté |
| Enregistrement `audit_metrics` | Oui | scraping + payload final | Implémenté récemment |
| Enregistrement `audit_versions` | Oui | migration `0004`, `handleCompleteAudit()` | Implémenté récemment |
| Enregistrement `audit_recommendations` | Oui | migration `0004`, payload final | Implémenté récemment |
| Moteur de recommandations autonome | Prévu | règles éditoriales dans HTML | Présent dans le rendu, absent comme moteur séparé |
| Tests de non-régression | Prévu implicitement | Aucun test automatisé identifié | À définir |
| Exécution côté Worker/API | Souhaitable | scoring dans HTML | Absent du code actuel |

## 13. Incohérences et limites actuelles

1. Le moteur de décision est intégré au HTML. Le scoring, l'éditorial, le PDF et l'archivage sont très couplés.
2. Les sous-scores sont codés en dur dans `indicesProspect()` et non dans `CONFIG`.
3. Les coefficients de sélection des priorités sont codés en dur.
4. La documentation référentielle existe, mais le code utilise son propre référentiel `GRILLE`.
5. Le Worker archive et agrège, mais ne calcule pas encore le score.
6. Certaines données Google peuvent devenir `0` dans l'outil lorsque l'API retourne une absence, alors que le pipeline demande `NULL` pour absence réelle.
7. Le Knowledge Engine agrège les scores seulement lors de la completion et évite les doubles comptages via `wasAlreadyCompleted`, mais la logique d'agrégats reste simple.
8. Les critères manuels sont stockés comme `manually_confirmed`, mais l'historique précis des corrections avant/après n'est pas encore un modèle dédié.
9. Les textes de recommandations sont générés par fonctions JavaScript, pas par un référentiel versionné.
10. Aucun test automatique ne garantit qu'un même jeu de données donnera le même score après modification.

## 14. Architecture cible minimale

Objectif : extraire progressivement le moteur sans casser l'outil actuel.

Architecture cible pragmatique :

```text
decision-engine/
  criteria.catalog.js
  sector-profiles.js
  thresholds.js
  scoring-engine.js
  priority-engine.js
  editorial-engine.js
  projection-engine.js
  d1-adapter.js
  pdf-adapter.js
  fixtures/
  tests/
```

### Responsabilités

| Module cible | Responsabilité |
|---|---|
| `criteria.catalog.js` | Critères, max, catégories, options, checklists |
| `sector-profiles.js` | Pondérations par secteur |
| `thresholds.js` | Seuils et tolérances |
| `scoring-engine.js` | Score global et sous-scores |
| `priority-engine.js` | Sélection des priorités |
| `editorial-engine.js` | Observations, recommandations, actions |
| `projection-engine.js` | Score projeté Pack |
| `d1-adapter.js` | Mapping vers `audit_*` |
| `pdf-adapter.js` | Format attendu par le PDF |

Cette architecture reste compatible avec une fondatrice seule : elle évite une refonte lourde et permet d'extraire fichier par fichier.

## 15. Plan d'implémentation progressif

### Phase 1 — Tests de non-régression du score actuel

- Fichiers concernés : `outil-score-efficia-auto-v5.html`, futurs fixtures.
- Résultat attendu : 5 à 10 cas connus avec score, sous-scores et priorités attendus.
- Risque : découvrir des incohérences existantes.
- Test : même input → même score et mêmes priorités.

### Phase 2 — Extraction du référentiel des critères

- Fichiers concernés : `GRILLE`, `CONFIG`, nouveau `criteria.catalog.js`.
- Résultat attendu : l'outil lit les critères depuis un module séparé.
- Risque : casser les IDs de radios et le PDF.
- Test : nombre de critères identique, total 100, mêmes scores sur fixtures.

### Phase 3 — Extraction du moteur de scoring

- Fichiers concernés : `calculScoreDetail()`, `scoreCriteres()`, `indicesProspect()`.
- Résultat attendu : fonctions pures testables.
- Risque : changement discret de gestion des critères non évalués.
- Test : fixtures avant/après strictement identiques.

### Phase 4 — Extraction du moteur de priorités

- Fichiers concernés : `FAMILLES_PRIORITES`, `selectionnerPrioritesDynamiques()`.
- Résultat attendu : trois priorités reproductibles hors PDF.
- Risque : variation éditoriale visible dans le rapport.
- Test : mêmes familles et mêmes critères retenus.

### Phase 5 — Extraction du moteur éditorial

- Fichiers concernés : `constatObservePriorite()`, `recommandationPriorite()`, `consequenceBusinessPriorite()`, `titrePriorite()`.
- Résultat attendu : textes générés depuis un module versionné.
- Risque : textes moins naturels si extraction trop mécanique.
- Test : snapshot de blocs de recommandations.

### Phase 6 — Connexion propre D1

- Fichiers concernés : `construirePayloadAuditComplete()`, Worker `handleCompleteAudit()`.
- Résultat attendu : payload stable, documenté et validé.
- Risque : divergence entre HTML et Worker.
- Test : audit manuel, audit scraping, audit payé, retry idempotent.

### Phase 7 — Automatisation progressive

- Fichiers concernés : Worker, futur endpoint de scoring.
- Résultat attendu : le Worker peut recalculer ou vérifier le score côté serveur.
- Risque : double source de vérité si l'HTML continue de calculer différemment.
- Test : score HTML = score Worker sur les mêmes fixtures.

## 16. Première recommandation technique

La première modification de code recommandée après validation de ce document est de créer des fixtures de non-régression avant toute extraction.

Priorité :

1. capturer 5 audits réels ou réalistes ;
2. enregistrer leurs critères, données observées, score global, sous-scores et priorités ;
3. écrire un petit test qui vérifie que le score ne change pas.

Sans cette base, toute extraction du moteur risque de modifier silencieusement le Score Efficia™.
