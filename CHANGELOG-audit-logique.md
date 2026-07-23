# Corrections de logique — Audit Efficia™ premium

Fichier modifié : `outil-score-efficia-auto-v5.html` · fonction `construireBlocsAuditPremium`
Backup : `outil-score-efficia-auto-v5.html.bak-preclaude` (ou `git checkout` pour revenir en arrière)
36 lignes changées · JS validé (0 erreur de parsing) · logique testée sur données réelles.

## Ce qui a été corrigé

**1. Un avantage ne peut plus devenir un « frein ».**
C'était la contradiction majeure : pour La planche des saveurs, la réputation (449 avis vs 396, note 4,6) était affichée à la fois en point fort *et* en « frein impact élevé » avec une explication codée en dur supposant la fiche en retard. Ajout d'un détecteur `familleEnAvantageAudit()` (réputation, photos, offre, visibilité) qui compare la fiche à la moyenne des concurrents réellement collectés. Toute famille où la fiche devance la concurrence est retirée des freins. Testé : La planche → réputation et visibilité (2ᵉ = top 3) sortent des freins ; une fiche réellement en retard les conserve.

**2. Le score n'est plus présenté comme complet quand des domaines sont « à confirmer ».**
Le résumé exécutif ajoute désormais, quand c'est le cas : « Ce score est calculé sur les N domaines mesurables automatiquement ; M domaines (…) restent à confirmer et peuvent faire évoluer la note. » Plus honnête, et paradoxalement plus crédible.

**3. Les points forts ne surévaluent plus un signal où la fiche est derrière.**
« Galerie photo suffisamment fournie » et « volume d'avis favorable » ne s'affichent plus si les données concurrentes montrent la fiche en dessous. Sans données concurrentes sur ce signal, la force est conservée (on n'invente pas).

**4. Explication réputation dépendante du sens.**
Ne dit plus jamais « volume inférieur à la concurrence » quand la fiche est en réalité devant.

**5. Vocabulaire des piliers clarifié.**
Les piliers deviennent « Être trouvé / Inspirer confiance / Déclencher le contact » (verbes du parcours), pour ne plus être confondus avec le domaine « Visibilité locale ».

## Effet sur l'audit de La planche des saveurs

Avant : réputation en « frein impact élevé » (faux), position 2ᵉ en « frein impact élevé » (position pourtant bonne), score 90 sans réserve, photos 10 en point fort non relatif.
Après : réputation et visibilité restent en points forts ; le seul frein réel affiché est « Informations essentielles » (impact moyen) ; le score porte sa réserve sur les domaines non confirmés. Le rapport ne se contredit plus.

## Ce qui reste à faire (nécessite de nouvelles données, pas de la logique)

- **Recommandations pleinement spécifiques** (« il vous manque tel attribut ») → exige la capture champ par champ de la fiche.
- **Benchmark photos réel** → exige de collecter le nombre de photos de chaque concurrent (le champ existe dans l'outil : `dc-photos-1..3`, à alimenter puis afficher au lieu de moyenner).
- **Page « déclic » (analyse sémantique avis ↔ description, angles de photos)** → exige de capturer le texte des avis et les photos. C'est le passage à 149-199 €.
