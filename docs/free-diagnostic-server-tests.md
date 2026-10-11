# Diagnostic gratuit — audit des tests serveur

Branche `fix/free-diagnostic-server-tests`, issue de `main` / `0a3b5fe`.
Tests locaux uniquement : SQLite en mémoire et réponses fournisseur simulées.
Aucune collecte réelle, migration distante, publication ou donnée réelle ajoutée.

## Les neuf échecs demandés

Les noms ci-dessous sont ceux des tests. Les lignes correspondent à cette branche.
`collect` désigne `functions/api/admin/free-diagnostic-collect/[analysisId].js`.
Les assertions de résultat, notamment HTTP, sont conservées.

| Test | Attendu / obtenu avant | Classe | Cause et correction | Code exécuté ; test | État final |
|---|---|---|---|---|---|
| la collecte serveur réutilise le même analysisId sans créer de commande ni inventer l’activité | HTTP 200 / 200 ; 6 critères automatiques / 4 | C | Concurrents fictifs sans catégorie : panel exclu. Ajouter leur catégorie cohérente, sans modifier le score ni l’attente de 6 critères. | `functions/lib/collectCompetitors.js:157`, `:504` ; `functions/lib/freeDiagnosticProductionLink.js:164` ; `tests/freeDiagnosticAdminSecurity.test.js:274` | Réussi |
| la relance réelle Bivert Alain classe Fournisseur d’électricité comme inadaptée et conserve atomiquement le reste | 200 / 409 | B, complément C | Ancienne requête sans zone explicitement confirmée ; catégories manquantes des concurrents fictifs. Renseigner zone et catégories. | `collect:287` ; `tests/freeDiagnosticAdminSecurity.test.js:394` | Réussi |
| un échec de relance conserve intégralement les anciens résultats et le brouillon | 502 / 409 | B, complément C | Zone absente ; géocodeur fictif renvoyant Bruxelles pour Attert. Confirmer Attert et aligner le mock, pour atteindre réellement l’échec fournisseur. | `collect:287`, `:319` ; `tests/freeDiagnosticAdminSecurity.test.js:498` | Réussi |
| une fiche introuvable reste awaiting_review, efface les sentinelles et ne crée aucune donnée métier annexe | 404 / 502 | C | Le mock simulait une erreur technique, pas une liste vide. Fournir `data: [[]]` ; conserver les assertions de nettoyage. | `functions/lib/collectFiche.js:597` ; `collect:598` ; `tests/freeDiagnosticAdminSecurity.test.js:549` | Réussi |
| 1. un brouillon gratuit admin_manual peut relancer sa recherche | 200 / 409 | B | Ajouter la zone confirmée au constructeur partagé `refreshBody`. | `collect:287` ; `tests/freeDiagnosticDuplicateAuthorization.test.js:214` | Réussi |
| 2. un brouillon gratuit duplicate_manual peut désormais relancer sa recherche | 200 / 409 | B | Même ancien contrat de requête. | `collect:287` ; `tests/freeDiagnosticDuplicateAuthorization.test.js:230` | Réussi |
| 6. une analyse liée à une vraie demande historique reste acceptée sans métadonnée manuelle | 200 / 409 | B | Même ancien contrat ; autorisation historique inchangée. | `collect:287`, `:516` ; `tests/freeDiagnosticDuplicateAuthorization.test.js:281` | Réussi |
| 7. une relance de recherche reste possible après un premier PDF | 200 / 409 | B | Même ancien contrat ; statut PDF toujours admissible pour une relance explicite. | `collect:508`, `:287` ; `tests/freeDiagnosticDuplicateAuthorization.test.js:296` | Réussi |
| 9. un échec fournisseur sur un brouillon duplicate_manual ne modifie rien partiellement | 502 / 409 | B | Même ancien contrat : atteindre le mock fournisseur en fournissant la zone confirmée. | `collect:287`, `:319` ; `tests/freeDiagnosticDuplicateAuthorization.test.js:334` | Réussi |

## Historique et intention vérifiée

Historique complet récupéré avant analyse ; `git blame 0a3b5fe` et `git log -S` sur les symboles concernés.
Dans les neuf cas, **le code a changé après les tests**. Auteur enregistré : `fatimalekraichi`.

| Cas | Dernière modification pertinente du test | Changement du code plus récent et preuve d’intention |
|---|---|---|
| Critères automatiques | `02876e7a`, 25/08/2026, assertion de 6 critères ; fichier remanié jusqu’à `777ab33`, 29/08 | `3617cd2`, 09/09, qualification par activité ; `e5dd70a`, 09/09, rejet des panels historiques non qualifiés. Recherche `-S qualifyCompetitor`, `-S competitor_qualification_version`. |
| Relance catégorie inadaptée | `02876e7a` et `11318871`, 25/08 ; fixture géographique `777ab33`, 29/08 | `23f7bcd`, 08/09, sépare ville de l’entreprise et zone de recherche, supprime le repli implicite et exige `confirmedSearchZone`. Ses tests géographiques et back-office évoluent ensemble. Catégories : `3617cd2`, 09/09. |
| Échec atomique | `6eaf3c62`, 25/08 ; fixture géographique `777ab33`, 29/08 | `23f7bcd`, même exigence explicite. Recherche `-S confirmedSearchZone`, puis lecture du diff et des tests du commit. |
| Fiche introuvable | `7680a773`, 19/08 ; fixture géographique `777ab33`, 29/08 | `0c771e4`, 15/09, distinction liste vide / indisponibilité technique. Recherche `-S 'const empty = data.length'`. |
| admin_manual | `30ad3beb`, 28/08 | `23f7bcd`, 08/09, zone explicite. |
| duplicate_manual | `30ad3beb`, 28/08 | `23f7bcd`, 08/09, zone explicite. |
| Demande historique | `30ad3beb`, 28/08 | `23f7bcd`, 08/09, zone explicite. |
| Relance après PDF | `baa4325e`, 30/08, relance après PDF volontairement autorisée | `23f7bcd`, 08/09, zone explicite, sans suppression de cette autorisation. |
| Échec fournisseur duplicate_manual | `30ad3beb`, 28/08 | `23f7bcd`, 08/09, zone explicite. |

Les corrections B suivent donc une intention documentée dans les commits, et non une supposition métier. Les deux cas C réparent uniquement des simulations incohérentes.

## Contrôle de sécurité supplémentaire — classe A

Reproduction nouvelle : deux POST `refresh_search` authentifiés de la même analyse, le premier suspendu dans le fournisseur simulé. Avant correctif : **deux appels fournisseur**. Le test échoue bien sur ce comportement. Il ne s’agit pas d’un des neuf échecs historiques.

Correctif séparé : `functions/lib/diagnosticCollectionLock.js:3`, migration `0023_free_diagnostic_collection_locks.sql`, intégration `collect:541` et `:545`.
Une insertion D1 atomique par identifiant réserve l’opération avant tout appel fournisseur. La seconde requête reçoit 409. L’absence de table, une panne ou une réponse D1 non reconnue renvoie 503 et interdit le fournisseur. L’analyse initiale est relue sous verrou pour éviter une décision fondée sur un état périmé.

Tests : doubles relances et doubles collectes initiales, panne D1, résultat D1 inconnu, exception fournisseur, verrou ancien. Une collecte initiale nécessite normalement deux étapes fournisseur (fiche et panel), chacune une seule fois ; une relance en nécessite une. Le verrou est libéré en fin d’opération et après exception, sans retry automatique.

**Limites opérationnelles :** la migration est uniquement ajoutée au dépôt, jamais appliquée à distance. Elle devra précéder toute future mise en service autorisée. Un arrêt brutal peut laisser un verrou : aucune expiration automatique ne risque alors de doubler une facturation ; il faut vérifier la fin de l’opération et l’état fournisseur avant de supprimer ce verrou dans une intervention séparément autorisée. Les nouvelles relances explicites après achèvement restent autorisées, conformément à `baa4325e`. Garantir une idempotence entre deux requêtes successives après une réponse perdue demanderait un identifiant d’opération et une décision métier sur sa durée ; ce correctif ne prétend pas offrir cette garantie.

## Authentification

`tests/freeDiagnosticAdminBoundary.test.js` découvre les handlers HTTP des 13 fichiers sous `functions/api/admin` : **20 handlers**, chacun vérifié avec session absente, malformée, signée avec une autre clé et expirée. Tous répondent 401 avant accès D1 ou fetch. OPTIONS (prévol sans données) et la page de connexion ne sont pas des opérations admin authentifiées. Les tests existants conservent aussi les refus Premium sans paiement, sans demande liée ou avec un mauvais type de rapport.

Ces vérifications sont locales ; elles ne constituent pas un audit de la configuration Cloudflare déployée.

## Validation finale

Commande : `node --test --test-concurrency=1 tests/*.test.js`.

- Base `0a3b5fe` : 1329 tests, 1289 réussis, 20 échecs, 20 exclusions conditionnelles existantes.
- Branche serveur : **1355 tests, 1325 réussis, 10 échecs, 20 exclusions conditionnelles existantes**, 188 secondes.
- Sous-ensemble sécurité : **53/53 réussis**, aucun skip. Après la mise en forme du test d’authentification, ses 20 cas ont aussi été rejoués avec succès.
- `git diff --check` et recherche de secrets/contacts privés dans le diff indexé : réussis.
- Aucun test désactivé et aucune assertion HTTP assouplie.

La suite complète reste rouge : cette PR est un brouillon, sans prétention de validation globale. Les dix échecs restants sont tous observés dans la base, hors des neuf tests demandés :

| Fichier | Tests restants |
|---|---|
| `tests/analyzeCategoryMapping.test.js:219` | Exclusion de la fiche cible des concurrents (1) |
| `tests/cgvPurchaseFlow.test.js:313` | Immutabilité de la migration CGV (1) |
| `tests/competitorRestorationWorkflow.test.js:11` et `:47` | Réouverture de panel et parcours snapshot/PDF (2) |
| `tests/diagnosticJourneyBrowser.test.js:15` | Cinq variantes du parcours navigateur (5) |
| `tests/freeDiagnosticReviewVolume.test.js:281` | Panel électrique insuffisant dans UI/PDF (1) |

Un onzième échec de la base, « Chrome V3.2 : le rapport réel restitue les valeurs, couleurs et barres photos et les panels insuffisants », a réussi sur cette exécution, sans correction dédiée : résultat variable, pas correction revendiquée.

Les neuf cas ne nécessitent aucune décision métier supplémentaire. Une politique de dédoublonnage des relances successives après réponse perdue serait un travail distinct, à définir avant toute extension du correctif.
