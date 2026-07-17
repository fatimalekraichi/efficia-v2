---
id: IA-002
titre: Dictionnaire des variables
statut: squelette
version_methode: v5
maj: 2026-07-16
---


# Dictionnaire des variables (VAR)

> **Rôle unique :** définir chaque variable circulant dans le pipeline — nom canonique, type, source, caractère obligatoire, repli si absente. Toute variable citée dans une OBS, un prompt ou un modèle doit exister ici.

## Modèle

| Champ | Contenu |
|---|---|
| ID | VAR-slug |
| Type | nombre / texte / date / liste / booléen |
| Source | scraping (champ), saisie, calcul |
| Obligatoire | oui / non |
| Repli si absente | _À compléter._ |

## Registre initial

| ID | Type | Source | Obligatoire |
|---|---|---|---|
| VAR-entreprise | texte | saisie | oui |
| VAR-ville | texte | saisie | oui |
| VAR-activite | texte | saisie | oui |
| VAR-note | nombre | scraping | non |
| VAR-nb-avis | nombre | scraping | non |
| VAR-nb-photos | nombre | scraping | non |
| VAR-position | nombre | scraping | non |
| VAR-requete-testee | texte | scraping | non |
| VAR-nb-services | nombre | scraping | non |
| VAR-longueur-description | nombre | scraping | non |
| VAR-concurrents-avis-moyenne | nombre | scraping | non |
| _À compléter._ | | | |
