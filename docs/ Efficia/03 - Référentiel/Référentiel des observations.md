---
id: REF-OBS
titre: Référentiel des observations
statut: squelette
version_methode: v5
maj: 2026-07-16
---


# Référentiel des observations (OBS)

> **Rôle unique :** registre des constats types. Une observation = un texte client + ses **conditions de déclenchement** structurées (données + résultat de contrôles). C'est ici que vivent les phrases « Ce que nous avons observé ».

## Modèle de fiche OBS

```yaml
id: OBS-000
controles: [CTL-000]
conditions: ""            # expression sur les variables (voir 04 - IA/Variables.md)
texte_client: ""          # avec variables {{nb_avis}}, {{ville}}…
texte_repli: ""           # version sans données chiffrées
ton: constat              # constat | force | risque
statut: brouillon
depuis_version: v5
```

## Registre

| ID | Résumé | Contrôles | Statut |
|---|---|---|---|
| OBS-001 | _À compléter._ | — | squelette |
