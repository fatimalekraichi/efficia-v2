---
id: IA-003
titre: Pipeline de production
statut: squelette
version_methode: v5
maj: 2026-07-16
---


# Pipeline de production d'un audit

> **Rôle unique :** décrire la chaîne exécutable, de la commande client au PDF livré — étapes, systèmes, artefacts, contrôles qualité. La méthode (le pourquoi) vit dans 02 ; les faits dans 03.

## Vue d'ensemble

```
Commande → Collecte (worker/Outscraper) → Normalisation (Variables)
        → Scoring (CTL × SEC) → Sélection (OBS/REC, priorités)
        → Génération (PRM + MOD) → Contrôle qualité → Livraison
```

## Étapes

### 1. Collecte
_À compléter — systèmes : worker Cloudflare, Outscraper ; gestion des erreurs et retries._

### 2. Normalisation
_À compléter — mapping données brutes → variables (Variables.md)._

### 3. Scoring
_À compléter — évaluation des CTL, pondérations SEC, calcul des scores par pilier._

### 4. Sélection
_À compléter — règles de choix des observations et des 3 priorités (cohérence : jamais deux constats contradictoires)._

### 5. Génération
_À compléter — assemblage prompt (PRM) + modèle (MOD) + bundle référentiel._

### 6. Contrôle qualité
_À compléter — critères d'acceptation (Génération des audits.md), jeux de tests gelés._

## Artefacts par étape
_À compléter._
