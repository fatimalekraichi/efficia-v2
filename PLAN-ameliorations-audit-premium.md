# Plan d'améliorations — Audit Efficia™ premium (99 €)

Document de travail, à valider avant toute modification de code. Aucun fichier n'a été touché pour produire ce plan (recherche seule dans `functions/lib/`).

**Mise à jour du 2026-07-31 (v2)** : les points 1, 3, 7 et 11 sont désormais traités comme un seul chantier — **Sprint 1 « Constats irréfutables »** — car ils répondent tous à la même question (rendre chaque constat impossible à contester) et partagent les mêmes données (benchmark, topCompetitor, evidence). Point 11 renommé "Meilleure fiche observée" (au lieu de "Meilleur concurrent", plus neutre). Nouveau point 14 (justification du classement). Sprint "points forts" renommé "Renforcer la crédibilité". Point 8 déplacé en tout dernier (Sprint 6, documentation).

Portée : uniquement le pipeline **premium** (`Knowledge → Reasoning → Composer → renderAnalysisHtml.js → pdfRenderer.js`). Le **Diagnostic gratuit** (`outil-score-efficia-auto-v5.html`, `/admin/free-diagnostic-production/`, `renderFreeDiagnosticHtml`) n'est concerné par **aucun** des 14 points et ne doit pas être touché.

Ne changent jamais, sur aucun des 14 points : le Score Efficia (`scoreEngine.js`), les 29 critères et leurs pondérations (`score-efficia/criteriaCatalog.js`), le schéma D1 (aucune migration, sauf Option B du point 11 si explicitement choisie), les routes `/api/pdf/{analysisId}` et Cloudflare Browser Rendering (`pdfRenderer.js`), le Diagnostic gratuit.

---

## 1. Preuves concrètes (priorité absolue)

*Fait partie du Sprint 1 « Constats irréfutables », avec les points 3, 7 et 11 (même données, même objectif : rendre chaque constat impossible à contester).*

**Constat** : la carte "Preuve" n'affiche que `valeur · référence observée` (ex. `4.1/5 · référence observée : 4.7/5`). La moyenne des 3 concurrents, la meilleure note observée et le nombre de concurrents devant/derrière ne sont pas montrés, alors qu'ils sont déjà calculés en amont.

**Cause racine** : `functions/lib/reasoning-engine/evidence.js` (`buildEvidence()`) ne renvoie que `{value, competitorMedian, unit, source}`. Or `analysisReader.js` (lignes 55-75) et `functions/lib/auditComposition.js` (`buildBenchmarkContext`) exposent déjà `benchmark.topCompetitor.{name,rating,reviews}` et `benchmark.percentiles.{rating,reviews,photos}` — ces données existent, elles ne sont simplement pas transmises jusqu'à la carte.

**Modification proposée** :
- Étendre `buildEvidence(signal, context)` pour ajouter, quand la donnée existe : `topCompetitor: {name, value}` (uniquement rating/reviews, `topCompetitor` n'a pas de photos) et `percentileRank` (rating/reviews/photos).
- Étendre `evidenceLine()` dans `renderAnalysisHtml.js` pour afficher 3 lignes courtes au lieu d'une seule : *Vous* / *Moyenne concurrents* / *Meilleure observée (nom)*.
- Aucun nouveau calcul : uniquement du passthrough de données déjà en base.

**Fichiers touchés** : `functions/lib/reasoning-engine/evidence.js`, `functions/lib/renderAnalysisHtml.js` (`evidenceLine`, `priorityCard`, `issueCard`, CSS de la grille "Preuve").

**Avant** → `4.1 /5 · référence observée : 4.7 /5`
**Après** → `Vous : 4.1/5 · Moyenne 3 concurrents : 4.7/5 · Meilleure observée : 4.9/5 (nom du concurrent)`

**Risque** : aucun concurrent connu (panel vide) → repli sur l'affichage actuel (déjà géré par les `present()` checks existants).

---

## 2. Différencier la structure des 5 priorités

**Constat** : les pages Priorité 1 à 5 utilisent exactement la même grille (Pourquoi c'est important / Preuve / Impact / Temps), avec un texte généré par la même formule pour chaque signal, ce qui donne une impression répétitive après 2-3 pages.

**Cause racine** : `functions/lib/reasoning-engine/reasoningTemplates.js` concatène toujours `cause + googleImpact + businessImpact + competitiveAngle` dans le même ordre, quel que soit le rang de la priorité ; `priorityCard()` (renderAnalysisHtml.js) rend systématiquement la même grille à 4 cases.

**Modification proposée (option retenue, additive)** : ajouter un petit "angle" au-dessus du texte existant (sans réécrire le texte de Reasoning), dérivé de `item.impactType` (trust/visibility/conversion/completeness) et du rang : ex. rang 1 + trust → *"Pourquoi vous perdez des clients"* ; visibility → *"Ce que Google comprend"* ; conversion → *"Ce que voit votre prospect"*. Nouveau fichier `functions/lib/composer-engine/priorityFraming.js` (table de correspondance impactType → libellé d'angle, rotation simple par rang pour éviter la répétition si deux priorités partagent le même impactType).

**Option alternative (plus lourde, non retenue par défaut)** : refonte complète de la mise en page de chaque carte de priorité selon son rang — demanderait une validation design séparée avant implémentation, car cela touche la charte visuelle au-delà d'un simple ajout de libellé.

**Fichiers touchés** : nouveau `functions/lib/composer-engine/priorityFraming.js`, `functions/lib/composer-engine/narrativeModel.js` (`priorityCard()` : ajoute `angle`), `functions/lib/renderAnalysisHtml.js` (`priorityCard()` : affiche l'angle), CSS.

**Risque** : aucun — n'affecte ni le classement des priorités (`selectPriorities` dans `selection.js` reste inchangé) ni le texte de fond.

---

## 3. Davantage de chiffres

*Fait partie du Sprint 1 « Constats irréfutables ». La phrase "Vous êtes actuellement derrière 3 concurrents sur cette recherche" (rang exact, ci-dessous) s'affiche directement sous le bloc de comparaison visuelle du point 11.*

**Constat** : il manque le nombre de concurrents devant/derrière, l'écart de note/avis/photos affiché explicitement, et un score par domaine visible en dehors du Diagnostic gratuit.

**Cause racine / disponibilité des données** :
- Écarts (`rating_gap`, `reviews_gap`, `photos_gap`) et percentiles : déjà en base, déjà dans `benchmark.gaps`/`benchmark.percentiles` → réutilisables directement via le point 1.
- Score par domaine (6 domaines du Score Efficia) : déjà calculé et déjà formaté par `buildDomains()` dans `functions/lib/composer-engine/narrativeModel.js`, mais cette fonction n'alimente aujourd'hui QUE `freeDiagnostic.domains` (Diagnostic gratuit) — jamais le modèle premium public.
- Rang exact parmi les concurrents ("3 devant, 1 derrière") : nécessite la liste brute des concurrents (actuellement non transmise à Composer, seulement l'agrégat `topCompetitor`/`averages`). Nouveau calcul mineur nécessaire (tri des notes/avis déjà collectés, aucune nouvelle collecte).

**Modification proposée** :
- Exporter `buildDomains()` (déjà écrite, aucune réécriture) et l'utiliser aussi dans le modèle premium (`buildNarrativeModel()` ajoute `domains` au niveau racine, à côté de `strengths`/`weaknesses`).
- Ajouter un mini-tableau "Score par domaine" sur la page "Axes d'amélioration" (`limitsSection()`).
- Ajouter dans `auditComposition.js` (`buildBenchmarkContext`) le nombre de concurrents avec note/avis inférieurs et supérieurs au client (tri simple de `analysis.business.competitors`, déjà lu par ailleurs pour l'admin) ; exposer `benchmark.rank = {aheadCount, behindCount, totalCompetitors}` ; l'afficher dans `evidenceLine()` à côté de la preuve.

**Fichiers touchés** : `functions/lib/composer-engine/narrativeModel.js`, `functions/lib/auditComposition.js`, `functions/lib/renderAnalysisHtml.js` (`limitsSection`, `evidenceLine`).

**Risque** : le calcul de rang suppose que `analysis.business.competitors` est bien transmis jusqu'à Composer — à vérifier en implémentation (aujourd'hui utilisé par `js/admin-audit-review.js` côté admin, mais pas forcément par `auditComposition.js`).

---

## 4. Renforcer la crédibilité (renommé le 2026-07-31 — anciennement "Garantir 2-3 points forts")

*L'objectif réel n'est pas d'afficher trois compliments : c'est que le lecteur pense "l'audit est équilibré, pas seulement négatif". Le contenu du point reste identique, seul le titre et l'intention affichée changent.*

**Constat** : "Aucun point fort prioritaire à afficher." Pour un profil faible (score 37/100, note 4.1, 8 avis, 1 photo, 0 caractère de description), c'est le cas le plus fréquent et le moins acceptable des 14 points.

**Cause racine, vérifiée précisément** : `functions/lib/knowledgeRules.js` ne contient que 6 règles de type `"strength"`, toutes fondées sur une comparaison concurrentielle favorable (note/avis/position/photos élevés, ou score global ≥ 60 en repli — `functions/lib/knowledgeConfig.js`, `KNOWLEDGE_THRESHOLDS.score.positiveFloor = 60`). Un profil faible sur tous les signaux ET sous le seuil de repli (37 < 60) ne déclenche **aucune** règle : `knowledgeEngine.js` renvoie `strengths: []`, `selectComposerItems()` (`composer-engine/selection.js`) ne peut rien sélectionner, `strengthsSection()` (`renderAnalysisHtml.js`) affiche le message vide.

Or les 29 critères de la grille de validation manuelle (`compliant`/`partial`/`deficient`/`not_verified`, déjà saisis en admin) contiennent presque toujours 2-3 critères `compliant` même sur une fiche globalement faible (téléphone présent, horaires complets, catégorie précise...). Cette source n'est aujourd'hui jamais lue par Knowledge.

**Modification proposée** :
1. `functions/api/knowledge/_shared.js` (`buildKnowledgeInput`) : ajouter la lecture de `reviewed_score_json.criteria` (ou `score_inputs_json`, déjà en base, déjà lu ailleurs par `functions/lib/analysisReader.js`) et l'exposer en `input.criteria` (liste `{key, status}`).
2. `functions/lib/knowledgeRules.js` : ajouter 3-4 nouvelles règles `type: "strength"`, `min_confidence: "indicative"` (fonctionnent même sans benchmark), déclenchées sur `input.criteria` plutôt que sur un écart concurrentiel — ex. `FORCE_CONTACT` (signal `contact`, critère `contact` compliant), `FORCE_HOURS` (signal `hours`, critère `horaires` compliant), `FORCE_CATEGORY_PRECISE` (réutilise le signal `categories` déjà existant), `FORCE_CLAIMED` (signal `claimed`, critère `revendiquee` compliant). `base_weight` volontairement bas (~3, sous `FORCE_RESPONSE` à 4) pour ne jamais passer devant un vrai point fort concurrentiel quand il existe.
3. Nouveaux signaux (`contact`, `hours`, `claimed`) : ajouter les entrées correspondantes dans `causes.js`, `googleImpacts.js`, `businessImpacts.js` (type `strength` uniquement — Reasoning exige les 4 bibliothèques pour ne pas rejeter le constat, cf. `hasRequiredLibraries()` dans `reasoningEngine.js`), `knowledgeConfig.js` (`BUSINESS_IMPACT_BY_SIGNAL`), `knowledgeMessages.js` (message associé), `composer-engine/vocabulary.js` (libellé d'affichage).

**Fichiers touchés** : `functions/api/knowledge/_shared.js`, `functions/lib/knowledgeRules.js`, `functions/lib/knowledgeConfig.js`, `functions/lib/knowledgeMessages.js`, `functions/lib/reasoning-engine/causes.js`, `functions/lib/reasoning-engine/businessImpacts.js`, `functions/lib/reasoning-engine/googleImpacts.js`, `functions/lib/composer-engine/vocabulary.js`.

**Avant** → `Aucun point fort prioritaire à afficher.`
**Après (exemple)** → `✓ Catégorie pertinente` · `✓ Téléphone et site présents` · `✓ Horaires complets`

**Risque / garde-fou** : c'est la modification la plus large des 10 (8 fichiers, nouveaux signaux). Elle touche Knowledge, explicitement protégé dans les missions précédentes — à valider explicitement avant implémentation. Le poids volontairement bas évite qu'un point fort "cosmétique" masque un vrai signal fort quand il existe ; aucun impact sur le Score Efficia ni sur les 29 critères eux-mêmes (lecture seule de statuts déjà saisis).

**Ajustement de ton (retour du 2026-07-31)** : ne pas présenter ces points forts comme une liste de fragments isolés ("Téléphone présent" / "Horaires présents" / "Catégorie présente") — l'effet recherché n'est pas "on a désespérément trouvé trois points positifs". Chaque message généré par `knowledgeMessages.js` pour ces nouvelles règles doit être une phrase complète et chaleureuse, introduite par une phrase d'ouverture commune (déjà proche de l'existant dans `strengthsSection()` : "Ces points constituent une base de confiance...").

**Avant (rejeté)** → `Téléphone présent` · `Horaires présents` · `Catégorie présente`
**Après (retenu)** → *Votre fiche possède déjà plusieurs bases solides :*
`✓ catégorie correctement définie` · `✓ téléphone facilement accessible` · `✓ horaires complets`

---

## 5. Résumé exécutif plus direct

**Constat** : le résumé actuel est correct mais dilué dans un seul paragraphe ("Le principal levier concerne votre note moyenne..."). Le format souhaité isole clairement 2-3 leviers en liste.

**Cause racine** : `functions/lib/composer-engine/summaryTemplates.js` (`buildExecutiveSummary`) construit un texte unique par concaténation de 3 phrases fixes, sans notion de liste.

**Modification proposée** : ajouter un champ `leversList: string[]` au résultat de `buildExecutiveSummary()` (les 2-3 premières priorités, via `labelForSignal()` déjà existant dans `vocabulary.js`), en plus du texte actuel (conservé pour compatibilité). `heroSection()` (`renderAnalysisHtml.js`) affiche la liste à puces après la phrase d'ouverture quand `leversList.length > 1`.

**Fichiers touchés** : `functions/lib/composer-engine/summaryTemplates.js`, `functions/lib/composer-engine/narrativeModel.js` (passthrough), `functions/lib/renderAnalysisHtml.js` (`heroSection`), CSS.

**Risque** : aucun — purement additif, le texte actuel reste le repli si `leversList` est vide.

---

## 6. Plan d'action : regrouper par horizon ("cette semaine" / "ce mois" / "à surveiller")

**Constat** : le plan d'action est numéroté 1 à 5 sans notion de calendrier.

**Cause racine** : `selectActionPlan()` (`composer-engine/selection.js`) calcule déjà `difficulty` et `estimatedTime` (via `actionability.js` : `easy/medium/hard`, `"15–20 min"`, `"30–60 min"`, `"variable"`, `"en continu"`, `"long terme"`) mais `actionPlanSection()` (renderAnalysisHtml.js) les affiche en timeline plate, sans regroupement.

**Modification proposée** : nouvelle fonction déterministe `bucketForAction({difficulty, estimatedTime})` (ex. dans un nouveau `functions/lib/composer-engine/actionPlanGrouping.js`) : easy + temps court → *Cette semaine* ; medium → *Ce mois-ci* ; hard/variable/en continu → *À surveiller*. Le classement existant (`composeScore`, priorité × facilité) n'est pas modifié : seul l'étiquetage/regroupement d'affichage change. `actionPlanSection()` insère un `<h3>` de section à chaque changement de bucket au lieu d'une timeline continue.

**Fichiers touchés** : nouveau `functions/lib/composer-engine/actionPlanGrouping.js`, `functions/lib/renderAnalysisHtml.js` (`actionPlanSection`), CSS.

**Risque** : aucun — l'ordre des actions (déjà trié par `composeScore`) est préservé, seul l'habillage visuel change.

---

## 7. Vocabulaire plus concret

*Fait partie du Sprint 1 « Constats irréfutables ». C'est la phrase qui vient juste après le bloc de comparaison du point 11 : "Beaucoup d'internautes éliminent une fiche affichant 4,1 lorsqu'une autre affiche 4,9 avant même de lire les avis." — même exemple que celui déjà validé le 2026-07-31, désormais rattaché explicitement à cet enchaînement.*

**Constat** : certaines phrases restent génériques ("La note influence la confiance immédiate..."). Le style souhaité utilise les chiffres réels dans la phrase ("...une fiche affichant 4,1 lorsqu'une autre affiche 4,7...").

**Cause racine** : `causes.js`/`businessImpacts.js`/`googleImpacts.js` proposent déjà 2 variantes par signal/type, choisies au hasard déterministe (`pickVariant()` dans `reasoningEngine.js`) — mais `replacePlaceholders()` (même fichier) ne supporte que `{name, reviews, photos, competitor_median_photos, top_competitor_name, position, description_length}`, pas `{rating}` ni `{competitor_median_rating}`.

**Modification proposée** :
- Ajouter `rating` et `competitor_median_rating` (et `top_competitor_rating`) à la table `replacements` de `replacePlaceholders()`.
- Ajouter 1-2 variantes supplémentaires, plus concrètes, dans `causes.rating.weakness` / `businessImpacts.rating.direct.weakness` (en plus des variantes existantes, jamais en remplacement) — ex. *"Beaucoup d'internautes éliminent inconsciemment une fiche affichant {rating}/5 lorsqu'une autre affiche {competitor_median_rating}/5, avant même de lire les avis."*
- Étendre progressivement aux autres signaux si le rendu est validé.

**Fichiers touchés** : `functions/lib/reasoning-engine/reasoningEngine.js` (`replacePlaceholders`), `functions/lib/reasoning-engine/causes.js`, `functions/lib/reasoning-engine/businessImpacts.js`.

**Risque** : toute nouvelle variante doit rester conforme à `toneRules.js` (`respectsToneRules()` déjà disponible pour vérification automatique en test).

---

## 8. Encadré méthodologie

**Constat** : la page Méthodologie est propre mais sans encadré rassurant explicite sur le périmètre de l'analyse.

**Cause racine** : `model.footer.disclaimer` (construit dans `narrativeModel.js`) contient déjà une phrase proche ("Analyse fondée sur l'état public de la fiche Google Business... Efficia Digital n'est pas affilié à Google...") mais elle n'est pas isolée visuellement.

**Modification proposée** : ajouter la phrase demandée ("Cet audit est basé exclusivement sur les informations publiques visibles sur votre fiche Google Business et leur comparaison avec des entreprises comparables.") comme encadré distinct (`<aside class="method-callout">`) dans `methodologySection()`, à côté (et non à la place) des 3 cartes existantes.

**Fichiers touchés** : `functions/lib/renderAnalysisHtml.js` (`methodologySection`), CSS.

**Risque** : aucun.

---

## 9. Potentiel d'amélioration plus exploitable

**Constat** : le bloc actuel (score, étoiles, libellé "Élevé") est déjà proche du souhait ; il manque une phrase de cadrage temporel ("Accessible avec des optimisations réalisables en moins de deux mois.").

**Cause racine** : `COMPOSER_CONFIG.improvementPotential.bands` (`composer-engine/composerConfig.js`) définit `{min, stars, label}` par palier mais aucun champ de délai.

**Modification proposée** : ajouter un champ `timeframe` à chaque palier de `bands` (ex. "Très élevé" → *"Accessible rapidement avec des actions ciblées."* ; "Faible" → *"Nécessite un travail de fond sur plusieurs mois."*). `calculateImprovementPotential()` (`improvementPotential.js`) le renvoie ; `heroSection()` (renderAnalysisHtml.js) l'affiche sous le score.

**Fichiers touchés** : `functions/lib/composer-engine/composerConfig.js`, `functions/lib/composer-engine/improvementPotential.js`, `functions/lib/renderAnalysisHtml.js` (`heroSection`).

**Risque** : aucun — n'affecte pas le calcul du score de potentiel (`gap/weakCount/gain/ease`), seulement son habillage textuel.

---

## 10. Nouvelle page "Votre feuille de route personnalisée"

**Constat** : il manque une dernière page de synthèse actionnable, au format calendrier, qui laisse une impression de clarté immédiate.

**Modification proposée** : cette page réutilise directement le regroupement du point 6 (aucune nouvelle sélection/priorisation) : nouvelle fonction `roadmapSection(model)` dans `renderAnalysisHtml.js`, insérée entre `actionPlanSection` et `methodologySection` dans `renderPremiumAuditHtml()`, affichant les mêmes actions déjà triées, sous forme de checklist groupée "Cette semaine / Ce mois-ci / Le mois prochain" (mapping direct des 3 buckets du point 6).

**Fichiers touchés** : `functions/lib/renderAnalysisHtml.js` (nouvelle fonction + insertion dans la liste des sections), CSS.

**Dépendance** : doit être implémenté après (ou avec) le point 6, dont il réutilise directement le regroupement.

**Risque** : une page PDF supplémentaire → vérifier la pagination `pdfRenderer.js` (Cloudflare Browser Rendering) avec un test de génération réel avant validation finale, sans modifier `pdfRenderer.js` lui-même (le renderer HTML reste la seule source de pages).

---

## 11. Comparaison visuelle VOUS / Meilleure fiche observée (nouveau, ajouté le 2026-07-31 — renommé le 2026-07-31)

*Fait partie du Sprint 1 « Constats irréfutables ».*

**Constat** : une phrase ("Votre note est inférieure") demande un effort de lecture. Un bloc visuel côte-à-côte (étoiles, note, avis, photos) se comprend en une seconde, sans phrase.

**Libellé (révisé)** : "Meilleure fiche observée", et non "Meilleur concurrent" — plus neutre, car la fiche la plus forte du panel n'est pas toujours perçue par le client comme son concurrent principal. Aucun changement technique : `findTopCompetitor()` (`benchmarkEngine.js`, trié par note puis avis) reste la même logique, seul le libellé affiché change.

**Données disponibles** : `business.rating/reviews/photos_count` (déjà exposés par `buildBusinessContext`) et `benchmark.topCompetitor.{name,rating,reviews}` (déjà en base) donnent 2 des 3 lignes du mockup (note, avis) pour une seule et même fiche réelle et nommée.

**Point de vigilance sur les photos** : `topCompetitor` ne porte pas de nombre de photos — cette colonne n'existe pas en D1 (`functions/api/benchmark.js` n'écrit que `top_competitor_name/rating/reviews`). Deux options, à trancher avant l'implémentation :
- **Option A (retenue par défaut, sans migration)** : la ligne "photos" de la colonne comparative affiche la **moyenne des concurrents** (`benchmark.competitor_median.photos`, déjà disponible), avec un libellé honnête ("Moyenne concurrents" et non "Meilleure fiche observée") pour cette ligne précise — les 2 autres lignes (note, avis) restent bien celles de la meilleure fiche observée, nommée.
- **Option B (plus cohérente visuellement, nécessite une migration D1)** : ajouter une colonne `top_competitor_photos_count`, calculée dans `findTopCompetitor()`/`benchmarkEngine.js` et écrite par `functions/api/benchmark.js`, pour avoir une seule fiche réelle sur les 3 lignes. Implique une migration D1 — à ne faire que sur validation explicite, puisque c'est la seule des 14 modifications qui toucherait le schéma.

**Modification proposée** : nouveau `functions/lib/composer-engine/comparisonCard.js` (construit `{you:{rating,reviews,photos}, best:{name,rating,reviews,photos}}`), branché dans `narrativeModel.js` (`hero.comparison`), rendu dans `heroSection()` (renderAnalysisHtml.js), à côté du score gauge — c'est la première chose lue, comme demandé. Le rang exact (point 3, "vous êtes derrière N concurrents") s'affiche juste en dessous de ce bloc, et la phrase concrète (point 7, "Beaucoup d'internautes éliminent...") juste après.

**Fichiers touchés** : nouveau `functions/lib/composer-engine/comparisonCard.js`, `functions/lib/composer-engine/narrativeModel.js`, `functions/lib/renderAnalysisHtml.js` (`heroSection`), CSS. (+ éventuellement `functions/lib/benchmarkEngine.js`, `functions/api/benchmark.js`, une migration si Option B est choisie.)

---

## 14. Justifier pourquoi une priorité est classée en premier (nouveau, ajouté le 2026-07-31)

**Constat** : les priorités sont numérotées 1, 2, 3... mais rien n'explique au lecteur pourquoi ce classement précis. Un court encart "Pourquoi cette priorité est en premier ?" (étoiles + 3 lignes courtes : impact potentiel, effort, rapidité d'effet) justifie visuellement le rang sans nouvelle donnée.

**Données déjà disponibles** : exactement les mêmes que le point 13 — `item.severity` (impact), `item.actionability.difficulty` (effort) — plus `item.actionability.estimatedTime`, déjà utilisé par le regroupement du point 6, pour la ligne "effet visible rapidement / à moyen terme / sur la durée". Aucun nouveau calcul, ni changement du classement lui-même (`selectPriorities()` dans `selection.js` reste inchangé) : uniquement une mise en mots du classement déjà produit.

**Modification proposée** : dans `functions/lib/composer-engine/priorityFraming.js` (partagé avec les points 2 et 13), ajouter `buildRankJustification(item)` → `{stars, impactLine, effortLine, speedLine}` (ex. `severity: "critical"` → "Impact potentiel très élevé" ; `difficulty: "medium"` → "Effort raisonnable" ; `estimatedTime` court → "Effet visible rapidement"). Affiché dans `priorityCard()` (renderAnalysisHtml.js) uniquement pour la priorité n°1 (rang le plus fort), sous forme d'encart distinct "Pourquoi cette priorité est en premier ?".

**Fichiers touchés** : `functions/lib/composer-engine/priorityFraming.js` (même fichier que les points 2/13 — même sprint), `functions/lib/renderAnalysisHtml.js` (`priorityCard`), CSS.

**Risque** : aucun — texte dérivé de données déjà calculées, n'affecte pas le classement.

---

## 12. Reasoning orienté psychologie du prospect (nouveau, ajouté le 2026-07-31 — sprint séparé, après le point 4)

**Constat du 2026-07-31** : l'audit explique aujourd'hui *ce qui ne va pas* techniquement ("Votre nombre d'avis est faible"), mais pas *pourquoi le prospect agit ainsi* ("Un internaute qui compare trois cardiologues en moins d'une minute retiendra souvent celui qui affiche le plus d'avis, même sans lire leur contenu."). C'est un changement de philosophie du moteur Reasoning, pas une simple correction de copie — d'où un sprint dédié, après le point 4.

**Cause racine** : `causes.js` / `businessImpacts.js` / `googleImpacts.js` restent aujourd'hui centrés sur le signal technique et sa conséquence directe. Le "pourquoi psychologique" (biais de comparaison rapide, heuristique de choix, aversion à l'incertitude) n'est présent nulle part dans les 3 bibliothèques.

**Modification proposée (portée à confirmer en sprint dédié)** : ajouter, pour chaque signal existant (rating, reviews, photos, position, description, categories), une nouvelle variante de `businessImpacts.<signal>.direct.weakness/opportunity` qui décrit le comportement du prospect plutôt que le fait technique — dans l'esprit de l'exemple donné, en respectant `toneRules.js` (jamais alarmiste) et en utilisant les nouveaux placeholders numériques du point 7 (`{rating}`, `{competitor_median_rating}`, etc.) pour rester concret. Ce n'est pas un remplacement des variantes existantes (qui restent valides et continuent d'être piochées par `pickVariant()`), mais un troisième registre de phrasé ajouté à la rotation.

**Fichiers touchés** : `functions/lib/reasoning-engine/businessImpacts.js` (principalement), `functions/lib/reasoning-engine/causes.js` (si besoin), `functions/lib/reasoning-engine/reasoningEngine.js` (placeholders additionnels si de nouveaux signaux numériques sont référencés).

**Risque** : c'est le point le plus subjectif à valider (ton juste, pas trop "psychologisant") — prévoir une relecture qualitative avant de généraliser à tous les signaux ; commencer par 1 seul signal (rating, déjà préparé par le point 7) avant d'étendre.

**Vision (note du 2026-07-31)** : c'est le point identifié comme le plus différenciant à terme — passer d'un audit qui *observe* ("vous avez peu d'avis") à un audit qui *explique le comportement du prospect* ("un patient qui cherche un cardiologue compare souvent plusieurs fiches en moins d'une minute ; le nombre d'avis agit comme un raccourci mental..."). Ce n'est plus une observation ni une recommandation : c'est une explication du comportement humain. Objectif visé : que cette explication devienne la signature reconnaissable des audits Efficia Digital, au-delà de la seule copie du signal "rating".

---

## 13. Effort / Impact en étoiles sur chaque priorité (nouveau, ajouté le 2026-07-31)

**Constat** : "Impact : Critique" et le temps estimé sont déjà affichés en texte dans `priorityCard()`, mais une lecture en étoiles ("Effort ⭐⭐☆☆☆" / "Impact ★★★★★") se saisit plus vite qu'un mot.

**Données déjà disponibles** : `item.severity` (critical/high/medium/low, déjà calculé par `severityFromPriority()` dans `knowledgeEngine.js`/`priorities.js`) et `item.actionability.difficulty` (easy/medium/hard/variable, déjà dans `actionability.js`). Aucun nouveau calcul : uniquement 2 tables de correspondance vers une échelle 1-5 étoiles, réutilisant la fonction `stars()` déjà écrite dans `renderAnalysisHtml.js`.

**Modification proposée** : dans le même fichier que le point 2 (`functions/lib/composer-engine/priorityFraming.js`), ajouter `IMPACT_STARS_BY_SEVERITY` (critical→5, high→4, medium→3, low→2) et `EFFORT_STARS_BY_DIFFICULTY` (easy→1, medium→3, hard→5, variable→3 — ici plus d'étoiles = plus d'effort, sens inverse de l'impact). `priorityCard()` (renderAnalysisHtml.js) affiche les deux lignes d'étoiles sous la grille existante, sans supprimer les libellés texte actuels (accessibilité).

**Fichiers touchés** : `functions/lib/composer-engine/priorityFraming.js` (partagé avec le point 2 — même sprint), `functions/lib/renderAnalysisHtml.js` (`priorityCard`), CSS.

---

## Sprints (ordre final validé le 2026-07-31, v2)

**Sprint 1 — « Constats irréfutables »** : points **1** (preuves concrètes), **3** (davantage de chiffres, dont le rang exact), **7** (vocabulaire concret), **11** (comparaison visuelle VOUS / Meilleure fiche observée). Traités comme un seul chantier : même question ("comment rendre chaque constat impossible à contester"), mêmes données (benchmark, topCompetitor, evidence). Enchaînement visé sur la page : bloc de comparaison (11) → rang exact (3) → preuve détaillée (1) → phrase concrète avec les vrais chiffres (7).

**Sprint 2 — « Résumé + feuille de route »** : points **5** (résumé exécutif en liste), **6** (regroupement du plan d'action par horizon), **10** (feuille de route personnalisée). Le point 10 réutilise directement le regroupement du point 6.

**Sprint 3 — « Priorités »** : points **2** (angles de priorité), **9** (délai du potentiel), **13** (étoiles effort/impact), **14** (justification du rang n°1). Regroupés car 2, 13 et 14 modifient le même composant (`priorityCard()` / `priorityFraming.js`).

**Sprint 4 — « Renforcer la crédibilité »** : point **4** seul (ton révisé, cf. section dédiée). Changement le plus large (Knowledge + Reasoning + nouveaux signaux) — fait une fois les sprints précédents stabilisés et testés.

**Sprint 5 — « Psychologie du prospect »** : point **12** seul. Portée à confirmer signal par signal, en commençant par `rating` avant généralisation — identifié comme le point le plus différenciant à terme (cf. section dédiée).

**Sprint 6 — « Documentation »** : point **8** (encadré méthodologie), volontairement en dernier — utile et rapide à faire, mais sans impact sur la valeur perçue ou la conversion, contrairement aux 5 sprints précédents.

## Tests à étendre (existants, aucun nouveau framework)

- `tests/knowledgeEngine.test.js` — nouvelles règles du point 4 (au moins un cas "profil faible sur tous les signaux quantitatifs mais avec 2-3 critères compliant" → vérifier `strengths.length >= 2`).
- `tests/reasoningEngine.test.js` — nouveaux signaux (point 4), nouveaux placeholders (point 7, réutilisés au point 12), nouvelle forme d'`evidence` avec `topCompetitor`/`percentileRank` (point 1).
- `tests/composerEngine.test.js` — `leversList` (point 5), `timeframe` (point 9), regroupement du plan d'action (point 6), `hero.comparison` (point 11), étoiles effort/impact (point 13).
- `tests/renderAnalysisHtml.test.js` — nouvelle page (point 10), nouvel encadré (point 8), nouvel angle de priorité (point 2), nouveau tableau de domaines (point 3), nouveau bloc de comparaison visuelle (point 11), nouvelles lignes d'étoiles (point 13).

Aucun test du Diagnostic gratuit (`tests/freeDiagnosticModel.test.js`, `tests/renderFreeDiagnosticHtml.test.js`) n'est concerné.

## Ce qui ne change sur aucun des 14 points

Score Efficia (`scoreEngine.js`), grille des 29 critères et pondérations (`score-efficia/criteriaCatalog.js`), schéma D1/migrations (sauf si l'Option B du point 11 est explicitement choisie), `pdfRenderer.js` et la route `/api/pdf/{analysisId}`, Cloudflare Browser Rendering, le Diagnostic gratuit dans son intégralité.
