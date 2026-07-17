---
id: ARC-100
titre: Règles d'archivage
statut: squelette
version_methode: v5
maj: 2026-07-17
---


# Règles d'archivage

> **Rôle unique :** définir quand et comment une version de la méthode est gelée.

1. On n'archive jamais un fichier isolé — on archive **une version complète de la méthode** (copie du Référentiel + Méthode + note de version), dans un sous-dossier `vX/`.
2. Déclencheur : toute version **majeure** (et uniquement elle).
3. Une archive est en lecture seule absolue ; toute correction se fait dans la version courante.
4. Chaque archive contient une `Note de version.md` (modèle ci-contre) reliant : version de méthode ↔ version de l'outil ↔ version du worker ↔ prompts.
5. Les audits livrés référencent leur version ; l'archive permet de rejouer/justifier n'importe quel audit passé.
