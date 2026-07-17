---
id: REF-CTL
titre: Référentiel des contrôles
statut: squelette
version_methode: v5
maj: 2026-07-16
---


# Référentiel des contrôles (CTL)

> **Rôle unique :** registre des points de contrôle. Un contrôle = une vérification atomique, rattachée à exactement un indicateur, avec ses seuils et sa source de donnée.

## Modèle de fiche CTL

```yaml
id: CTL-000
indicateur: IND-000
libelle: ""
question: ""            # formulation opérateur / IA
seuils:
  conforme: ""
  a_ameliorer: ""
  prioritaire: ""
poids: { defaut: 0 }     # surcharges sectorielles dans SEC-*
source_donnee: ""        # champ scraping / vérification manuelle
verifiable_exterieur: true
observations: []         # OBS-…
recommandations: []      # REC-…
statut: brouillon
depuis_version: v5
```

## Registre

| ID | Libellé | Indicateur | Statut |
|---|---|---|---|
| CTL-001 | _À compléter._ | — | squelette |

_Le registre est complété au fur et à mesure ; objectif : ~150 contrôles._
