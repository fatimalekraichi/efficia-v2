---
id: ARC-001
titre: Architecture documentaire (document normatif)
statut: squelette
version_methode: v5
maj: 2026-07-16
---


# Architecture documentaire

> **Rôle unique :** document **normatif**. Définit où vit chaque information, les conventions, le versionnement et les règles anti-doublon. En cas de conflit avec tout autre document, celui-ci l'emporte.

## 1. Rôle des cinq dossiers

| Dossier | Responsabilité unique | Ce qui lui est interdit |
|---|---|---|
| 01 - Vision | Le pourquoi de l'entreprise | Contenir un fait de la méthode |
| 02 - Méthode | Le cadre : modèle, piliers, gouvernance | Contenir un seuil ou une pondération |
| 03 - Référentiel | **Tous les faits** : indicateurs, contrôles, observations, recommandations, secteurs | Contenir de la prose stratégique |
| 04 - IA | Contrats d'entrée/sortie, prompts, pipeline | Redéfinir un fait du référentiel |
| 05 - Archives | Versions gelées | Être modifié |

## 2. Conventions d'identifiants

| Préfixe | Entité | Format | Exemple |
|---|---|---|---|
| IND | Indicateur | IND-### | IND-012 |
| CTL | Point de contrôle | CTL-### | CTL-042 |
| OBS | Observation type | OBS-### | OBS-118 |
| REC | Recommandation | REC-### | REC-063 |
| SEC | Profil secteur | SEC-slug | SEC-garage |
| PIL | Pilier | PIL-0# | PIL-03 |
| P | Principe fondateur | P-0# | P-02 |
| PRM | Prompt | PRM-### | PRM-002 |
| VAR | Variable de pipeline | VAR-slug | VAR-nb-avis |
| MOD | Modèle de livrable | MOD-slug | MOD-diagnostic |
| RFC | Proposition de modification | RFC-AAAA-MM-slug | RFC-2026-07-photos |

**Règles :** un identifiant est éternel et jamais réutilisé ; une entité supprimée passe en statut `déprécié` ; la numérotation est séquentielle sans signification cachée.

## 3. Conventions de nommage des fichiers

- Fichiers d'entités : `IND-001.md` (l'ID est le nom).
- Autres documents : nom français lisible, un rôle par fichier.
- Interdits : version dans le nom (`-v2-final`), dates (sauf RFC et archives), doublons de titre.
- Front-matter YAML obligatoire : `id`, `titre`, `statut`, `version_methode`, `maj`, `refs`.

## 4. Cycle de vie d'un document

`squelette` → `brouillon` → `actif` → `déprécié` → `archivé`.
Le statut vit dans le front-matter, jamais dans le nom du fichier.

## 5. Versionnement

1. **Fichiers :** Git (commits, tags, diffs).
2. **Méthode :** version sémantique — actuelle : **v5**. Majeure = philosophie ou structure du score (RFC + archivage complet dans 05). Mineure = ajout/modification d'entités du référentiel (entrée au Changelog).
3. **Livrables :** chaque audit émis porte la version de méthode qui l'a produit.

## 6. Règles anti-doublon

- Un seuil, un poids, un libellé n'existe que dans `03 - Référentiel`.
- La prose cite les IDs, ne recopie jamais les valeurs.
- Les artefacts IA (`04`) et les livrables sont assemblés depuis le référentiel.

## 7. Processus de modification

- Trivial (typo, clarification sans changement de sens) → modification directe + commit.
- Non trivial (seuil, poids, nouvelle entité, texte client) → RFC d'une page → décision → mise à jour du référentiel → entrée au Changelog → régénération des dérivés.
