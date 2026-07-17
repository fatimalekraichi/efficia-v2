# Tests de non-régression du Decision Engine Efficia

Ces tests protègent le comportement actuel du moteur Score Efficia sans modifier
`outil-score-efficia-auto-v5.html`.

## Commande

```bash
node --test tests/decision-engine/decision-engine.test.mjs
```

Dans l'environnement Codex actuel, la commande utilisée est :

```bash
/Users/fatima/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/decision-engine/decision-engine.test.mjs
```

## Principe

- `current-engine-harness.mjs` lit `CONFIG` et `GRILLE` directement depuis
  `outil-score-efficia-auto-v5.html`.
- Les fonctions pures du moteur sont rejouées dans un environnement de test
  isolé, sans DOM navigateur, sans Worker et sans appel réseau.
- Les fixtures JSON contiennent les entrées métier et les résultats attendus
  capturés depuis le comportement actuel.

## Fixtures couvertes

- `weak-business`
- `average-business`
- `strong-business`
- `incomplete-data`
- `restaurant-profile`
- `health-profile`
- `photos-recency`
- `pack-projection`

## Fonctions couvertes

- `calculScoreDetail()`
- `scoreCriteres()`
- `indicesProspect()`
- `selectionnerPrioritesDynamiques()`
- `scoreProjetePack()`
- statuts `evaluation_status` et `verification_status`
- mapping vers `construirePayloadAuditComplete()`

## Invariants testés

- Un critère non évalué n'est jamais transformé en zéro.
- Un critère non évalué ne pénalise pas directement son groupe.
- Une catégorie vide est exclue du poids total pris en compte.
- Les profils sectoriels totalisent 100 points.
- Le score reste entre 0 et 100.
- Le score projeté du Pack ne dépasse jamais 97.
- La sélection retourne au maximum 3 priorités.
- Une seule priorité est retenue par famille.
- `not_evaluated` donne `points_awarded = null` et
  `verification_status = not_verified`.
- Les mêmes entrées donnent toujours les mêmes sorties.

## Régénérer les snapshots

À utiliser uniquement si le comportement du moteur a été modifié
volontairement et validé :

```bash
node tests/decision-engine/generate-fixtures.mjs
```

Cette commande réécrit les fichiers JSON dans `fixtures/` avec les attendus
capturés depuis le moteur courant.
