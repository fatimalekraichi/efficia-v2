# Comparaison main / PR #3 / PR #2 rebasée

Exécutions locales du 11/10/2026, Node 24, Chrome local, fournisseurs simulés. Aucune collecte réelle, migration distante ou publication. PR #2 contient PR #3 par rebase.

Commande complète : `node --test --test-concurrency=1 tests/*.test.js`.

| État | Total | Réussis | Échecs | Exclusions conditionnelles existantes |
|---|---:|---:|---:|---:|
| main | 1329 | 1290 | 19 | 20 |
| PR #3 | 1363 | 1333 | 10 | 20 |
| PR #2 | 1438 | 1408 | 10 | 20 |

## Tableau nom par nom

Union des échecs des trois suites complètes, des répétitions navigateur et du rendu avant cette passe. Les trois colonnes indiquent le résultat de la suite complète ; les variations des répétitions sont détaillées plus bas. Les anciens noms mentionnant quatre pages sont conservés pour permettre la comparaison ; leurs assertions portent désormais sur trois pages.

| Test | main `0a3b5fe` | PR #3 | PR #2 rebasée |
|---|---|---|---|
| 1. un brouillon gratuit admin_manual peut relancer sa recherche | Échec | Réussi | Réussi |
| 2. un brouillon gratuit duplicate_manual peut désormais relancer sa recherche | Échec | Réussi | Réussi |
| 6. une analyse liée à une vraie demande historique reste acceptée sans métadonnée manuelle | Échec | Réussi | Réussi |
| 7. une relance de recherche reste possible après un premier PDF | Échec | Réussi | Réussi |
| 9. un échec fournisseur sur un brouillon duplicate_manual ne modifie rien partiellement | Échec | Réussi | Réussi |
| Chrome : capture, rechargement, même parcours et examen ambiguous | Échec | Échec | Échec |
| Chrome : capture, rechargement, même parcours et examen declared_absent | Échec | Échec | Échec |
| Chrome : capture, rechargement, même parcours et examen fiche trouvée | Échec | Échec | Échec |
| Chrome : capture, rechargement, même parcours et examen not_found | Échec | Échec | Échec |
| Chrome : capture, rechargement, même parcours et examen unavailable | Échec | Échec | Échec |
| Chrome : compteurs réconciliés, présence Google et catégories secondaires dans le PDF quatre pages | Réussi | Réussi | Réussi |
| Chrome V3.2 : le rapport réel restitue les valeurs, couleurs et barres photos et les panels insuffisants | Réussi | Réussi | Réussi |
| Gabbana historique : le HTML réellement composé pour telechargerPDF recalcule la synthèse automatique et préserve une personnalisation | Réussi | Réussi | Réussi |
| PDF Chrome réel : les compteurs prioritaires des pages 3 et 5 et le libellé Description restent identiques | Réussi | Réussi | Réussi |
| Selbelec real snapshot → standard reopen → PDF button, without data injection | Échec | Échec | Échec |
| V3.2 adapte les pages 4 et 5 au nombre réel de priorités et conserve le titre personnalisé de revendiquee | Réussi | Réussi | Réussi |
| activité, prénom et textes sauvegardés : aperçu et PDF attendent le brouillon puis rendent quatre pages | Réussi | Réussi | Réussi |
| analyze : la fiche analysée n'apparaît jamais dans ses propres concurrents enregistrés | Échec | Échec | Échec |
| compatibility: fields number | Réussi | Réussi | Réussi |
| la collecte serveur réutilise le même analysisId sans créer de commande ni inventer l’activité | Échec | Réussi | Réussi |
| la migration CGV historique reste inchangée et la migration suivante est additive | Échec | Échec | Échec |
| la relance réelle Bivert Alain classe Fournisseur d’électricité comme inadaptée et conserve atomiquement le reste | Échec | Réussi | Réussi |
| real save → destroy document → admin list → reopen restores every competitor field | Échec | Échec | Échec |
| smoke Chrome : le détail DNS brut persiste dans le brouillon interne et le rapport ne rend que la formulation sûre | Réussi | Réussi | Réussi |
| smoke UI/PDF : un panel électrique insuffisant ne rend ni benchmark ni concurrent hors profil | Échec | Échec | Échec |
| un échec de relance conserve intégralement les anciens résultats et le brouillon | Échec | Réussi | Réussi |
| une fiche introuvable reste awaiting_review, efface les sentinelles et ne crée aucune donnée métier annexe | Échec | Réussi | Réussi |
| éditeur V3.2 : le titre page 1, une priorité et le teasing sont persistés, restaurés et capturés par html2canvas/jsPDF | Réussi | Réussi | Réussi |

## Répétitions navigateur

Deux passages supplémentaires, séquentiels, pour chaque état. Liste de fichiers sélectionnée par présence du harness Chrome ou de `CHROME`/`runAdminBrowserHarness`/`runBrowser` dans les fichiers `.test.js`. Aucun test n’a été désactivé.

| État | Passage 1 (réussis / échecs) | Passage 2 (réussis / échecs) |
|---|---|---|
| main | 108 / 8 | 107 / 9 |
| PR #3 | 108 / 8 | 108 / 8 |
| PR #2 | 115 / 8 | 114 / 9 |

Variations constatées entre suite complète et les deux passages navigateur :
- main — Chrome V3.2 : le rapport réel restitue les valeurs, couleurs et barres photos et les panels insuffisants : réussi, réussi, échec. À considérer instable ; aucune correction revendiquée sans reproduction causale.
- PR #2 — compatibility: fields number : réussi, réussi, échec. À considérer instable ; aucune correction revendiquée sans reproduction causale.

Détail de l’instabilité d’environnement observée sur PR #2 : `compatibility: fields number` a subi un arrêt de Chrome par `SIGKILL` après 36 ms, avant la création de DevToolsActivePort et avant le chargement de l’application. Le premier passage était réussi ; aucune assertion applicative n’a échoué lors de cet arrêt. Aucun retry automatique ni skip ajouté.

## Régressions du rendu et contrôles adaptés

| Cas | Correction / justification précise |
|---|---|
| Site inaccessible, erreur serveur, DNS | Régression de code corrigée : conserver le type de problème dans la preuve normalisée, choisir le constat et l’action correspondants. Le rendu ne transforme plus une panne en incohérence de coordonnées ; aucune réponse technique brute n’est exposée. Test dédié ajouté. |
| Compteurs réconciliés | Nouveau sélecteur `.checks-line` ; nombres comparés exactement au modèle de preuves, total et restauration contrôlés. Les inconnus restent inclus dans le total, sans devenir des défauts. |
| Benchmark photos | Tableau déplacé page 1 ; trois pages et nouvelle légende validées, valeurs numériques et invariance du score conservées. |
| Gabbana historique | La phrase méthodologique supprimée volontairement est attendue zéro fois ; texte courant exact, personnalisation, panne serveur, liens et géométrie toujours contrôlés. |
| Nombre de priorités et titre personnalisé | Sélecteurs page 2 / `.priority-short` et `.priority-expanded` ; assertions exactes 0, 1, 2 priorités secondaires et titre personnalisé conservées. |
| Compteurs PDF et teaser | Vérifier défauts + points à renforcer = priorités affichées + reste, contre le modèle et le DOM ; PDF réel toujours trois pages. |
| Attente du chargement dans le test éditeur | Le premier passage combiné avait 11 échecs : ce test avait capturé le tableau avant la restauration des faits (Non renseigné), puis le comparait au tableau chargé (4,2 / 5 avis / 3 photos). Attendre initialisationContexteAdminPromise remplace l’attente du seul nom de l’entreprise. Les assertions de stabilité restent inchangées. |
| Éditeur narratif | La fixture « Description : 0 caractère observé. » enfreignait le lint client validé. Remplacée par une phrase française étayée par la même preuve ; persistance, restauration, capture et score restent vérifiés. |
| Aperçu puis téléchargement | Trois captures et trois pages jsPDF attendues au lieu de quatre, conformément au format demandé ; fichier non vide, état des boutons et textes sauvegardés restent vérifiés. |
| Fiabilité DNS | La preuve reste `partial` en interne ; « Observation partielle » doit être absente du PDF conformément à la séparation preuve/texte client. |

Aucun échec propre à PR #2 ne doit être masqué par le total global : le tableau permet de le voir nom par nom. Les échecs communs à main ne sont pas corrigés ici. Le test CGV est conservé en échec sur instruction ; voir [constat CGV](constat-migration-cgv.md).

La procédure de mise en service et de retour arrière figure dans [la checklist](mise-en-service-diagnostic.md).
