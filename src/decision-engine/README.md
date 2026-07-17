# Catalogue des critères Efficia

`criteria.catalog.js` est désormais le référentiel unique de la grille de
critères du Score Efficia™.

Règles :

- ne pas dupliquer `GRILLE` ailleurs dans le projet ;
- ne pas modifier les catégories, clés, ordres, textes ou points sans décision
  métier explicite ;
- exécuter les tests de non-régression avant et après toute modification :

```bash
node --test tests/decision-engine/decision-engine.test.mjs
```

Les snapshots des tests protègent le comportement actuel du moteur. Ils ne
doivent pas être régénérés uniquement pour faire passer les tests.
