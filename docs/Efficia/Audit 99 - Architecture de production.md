---
titre: Audit Efficia™ 99 € — Architecture de production (< 10 min de travail humain)
statut: actif
version_methode: v5
maj: 2026-07-17
refs: [Audit 99 - Cartographie de production, Pipeline d'analyse Efficia]
role: Référence opérationnelle — industrialiser la fabrication de l'audit pour la rendre rentable et scalable, sous 10 minutes de travail humain, sans dégrader l'expérience client.
---

# Audit Efficia™ 99 € — Architecture de production

> **Question à laquelle ce document répond :** *comment fabriquer un audit premium en moins de 10 minutes de travail humain, à des centaines d'exemplaires par mois, sans casser la qualité perçue ?*
>
> Suite du document « Cartographie de production ». Celui-ci ne parle plus du **contenu** de l'audit mais de sa **chaîne de fabrication**. Réflexion Lean / Product Operations, pas technique. Aucun code.

---

## 0. Le principe directeur

Le budget est une contrainte, pas un objectif mouvant : **10 minutes = 600 secondes de travail humain par audit, maximum.** Tout ce qui consomme ce budget doit être justifié par une des deux seules raisons valables :

1. **Ça crée de la valeur que seul un humain peut créer** (jugement, personnalisation, nommage d'un concurrent, arbitrage de cohérence).
2. **Ça évite un risque critique** (un chiffre faux, un mauvais concurrent, une fiche mal identifiée → crédibilité détruite).

Toute seconde humaine qui ne relève d'aucune des deux est du gaspillage (au sens Lean : *muda*) et doit être automatisée, supprimée, ou reportée.

**Règle Lean n°1 — l'humain ne produit pas, il décide.** La machine produit un audit à 100 % pré-rempli ; l'humain ne fait que **valider et arbitrer**, jamais saisir de zéro. Si un opérateur tape plus de deux phrases, le process est mal conçu.

**Règle Lean n°2 — le doute coûte plus cher que l'erreur rare.** Un contrôle qui oblige l'opérateur à « aller vérifier dans le compte Google » à chaque audit coûte des minutes. Mieux vaut un défaut par défaut assumé (donnée marquée « non vérifiée ») qu'une vérification systématique qui ne change rien 9 fois sur 10.

**Règle Lean n°3 — la validation est par exception.** L'opérateur ne relit pas tout : il relit ce que la machine **signale** comme incertain (faible confiance IA, benchmark fragile, score atypique). Le reste passe sans relecture.

---

## 1. Analyse par donnée — temps humain et décision

Reprise de chaque donnée de l'audit, notée sur le temps humain qu'elle coûte et sur ce qu'on en fait. Les temps sont exprimés **par audit**, en secondes de travail humain réellement nécessaire (pas le temps machine).

**Légende décision :** `Auto` = 100 % automatique, 0 s humain · `Valider` = pré-rempli, contrôle rapide · `Humain` = jugement requis · `Cut` = supprimer du payant · `Pack` = reporter dans le Pack 349 €.

| Élément | Source | Valeur client | Automatisable ? | Temps humain (s) | Supprimable ? | Reportable Pack ? | Risque si non vérifié | Décision finale |
|---|---|---|---|---|---|---|---|---|
| Identification de la bonne fiche | Google | Forte | Partiel | 15 | Non | Non | Critique | **Valider** |
| Note moyenne | Google | Forte | Oui | 0 | Non | Non | Moyen | **Auto** |
| Nombre d'avis | Google | Forte | Oui | 0 | Non | Non | Moyen | **Auto** |
| Récence dernier avis | Outscraper | Forte | Oui | 0 | Non | Non | Faible | **Auto** |
| Taux de réponse aux avis | Outscraper | Forte | Oui | 0 | Non | Non | Faible | **Auto** |
| Nombre réel de photos | Outscraper | Forte | Oui | 0 | Non | Non | Faible | **Auto** |
| Récence des photos | Outscraper/Humain | Forte | Partiel | 20 | Non | Oui | Moyen | **Pack** |
| Longueur de description | Outscraper | Moyenne | Oui | 0 | Non | Non | Faible | **Auto** |
| Fiche revendiquée | Outscraper | Forte | Oui | 0 | Non | Non | Élevé | **Auto** |
| Catégorie principale | Google | Forte | Oui | 5 | Non | Non | Élevé | **Valider** |
| Catégories secondaires | Outscraper/Humain | Forte | Partiel | 30 | Non | Oui | Moyen | **Pack** |
| Services listés | Google/Humain | Forte | Partiel | 30 | Non | Oui | Moyen | **Pack** |
| Horaires renseignés | Google | Moyenne | Oui | 0 | Non | Non | Faible | **Auto** |
| Lien réservation/devis | Outscraper | Moyenne | Oui | 0 | Oui | Non | Faible | **Auto** |
| Position sur recherche cible | Outscraper | Forte | Oui | 10 | Non | Non | Élevé | **Valider** |
| Q/R (FAQ) | Humain | Forte | Non | 40 | Oui | Oui | Moyen | **Pack** |
| Publications récentes | Humain | Moyenne | Non | 40 | Oui | Oui | Faible | **Pack** |
| Score Efficia /100 | Calcul | Forte | Oui | 5 | Non | Non | Élevé | **Valider** |
| 3 indices prospect | Calcul | Forte | Oui | 0 | Non | Non | Moyen | **Auto** |
| 6 scores de domaine | Calcul | Forte | Oui | 0 | Non | Non | Moyen | **Auto** |
| Score projeté | Calcul | Forte | Oui | 5 | Non | Non | Élevé | **Valider** |
| Benchmark : concurrents nommés | Outscraper/Humain | Forte | Partiel | 45 | Non | Non | Élevé | **Humain** |
| Benchmark : moyennes (note/avis/photos) | Benchmark | Forte | Oui | 0 | Non | Non | Moyen | **Auto** |
| Texte d'intro personnalisé | IA | Forte | Partiel | 30 | Non | Non | Élevé | **Valider** |
| Constats observés (par priorité) | IA/Calcul | Forte | Partiel | 45 | Non | Non | Élevé | **Valider** |
| Recommandations (le « comment ») | IA/REC | Forte | Partiel | 60 | Non | Non | Élevé | **Valider** |
| Résumé narratif | IA | Moyenne | Oui | 15 | Oui | Non | Moyen | **Valider** |
| Effort estimé (minutes) | Calcul | Moyenne | Oui | 0 | Oui | Non | Faible | **Auto** |
| Forces de la fiche | Calcul/IA | Moyenne | Oui | 5 | Non | Non | Faible | **Valider** |
| Points « à confirmer » (internes) | Humain | Faible→Forte | Non | 60 | Oui | Oui | Moyen | **Pack** |
| Contrôle de cohérence global | Humain | — (qualité) | Non | 45 | Non | Non | Critique | **Humain** |
| Génération + envoi PDF | Calcul | — | Oui | 15 | Non | Non | Moyen | **Valider** |

**Somme du temps humain — scénario « tout vérifier » (naïf) :** ≈ **11 min 45 s** (705 s). → au-dessus du budget.

**Somme après décisions ci-dessus (Pack + Cut retirés du parcours payant standard) :** ≈ **6 min 15 s** (375 s). → sous le budget, avec marge.

> **Le levier n°1 saute aux yeux :** tout ce qui exige d'entrer dans le compte Google du client (récence photos, catégories/services fins, Q/R, publications, résolution des « à confirmer ») pèse **~4 minutes à lui seul**. Ces tâches sont à **reporter dans le Pack 349 €** — où l'accès au compte est de toute façon nécessaire pour exécuter les optimisations. L'audit 99 € s'appuie sur ce qui est observable de l'extérieur (déjà scrapé), le Pack sur l'interne.

---

## 2. Analyse par étape de production

Six étapes, du paiement à la livraison. Pour chacune : temps humain, actions humaines, actions automatiques, temps économisable (par automatisation ou suppression).

### Étape 1 — Réception de la commande

- **Temps humain estimé :** 0 s (cible) — actuellement ~30 s si déclenchement manuel.
- **Actions humaines :** aucune (cible).
- **Actions automatiques :** paiement Stripe → webhook → création commande + tâche + contexte pré-rempli (entreprise, ville, URL, offre) → apparition dans le back-office.
- **Temps économisable :** ~30 s — supprimer toute création/ouverture manuelle ; la tâche doit s'auto-créer et se pré-remplir.

### Étape 2 — Chargement des données

- **Temps humain estimé :** ~25 s (identification fiche + confirmation position).
- **Actions humaines :** confirmer que la fiche identifiée est la bonne (si ambiguïté) ; vérifier que la recherche testée est pertinente.
- **Actions automatiques :** appels Google + Outscraper, calcul du Score Efficia, des indices, des scores de domaine, du benchmark, sélection des priorités — le tout pré-rempli à l'arrivée de l'opérateur.
- **Temps économisable :** ~15 s — désambiguïsation automatique quand l'URL Google Business est fournie à l'achat (elle l'est déjà dans le contexte de commande) → plus de choix manuel de fiche.

### Étape 3 — Analyse IA

- **Temps humain estimé :** 0 s (production) — l'IA rédige seule.
- **Actions humaines :** aucune pendant la génération.
- **Actions automatiques :** rédaction de l'intro personnalisée, des constats, des recommandations (le « comment »), du résumé — à partir du référentiel et des variables du dossier, avec un **score de confiance** par bloc.
- **Temps économisable :** déjà optimal ; le gain se joue en étape 4 (qualité de la génération = moins de correction).

### Étape 4 — Contrôle humain (le cœur du temps humain)

- **Temps humain estimé :** ~4 min (240 s) — c'est ici que se concentre l'essentiel du travail.
- **Actions humaines :** valider/ajuster l'intro, les constats et les recommandations signalés en faible confiance ; nommer/valider les concurrents du benchmark ; contrôle de cohérence global ; arbitrage des cas atypiques (score très haut/bas, données manquantes).
- **Actions automatiques :** pré-remplissage total, signalement des blocs à faible confiance, détection des incohérences (force ↔ manque), détection du seuil « personnalisation insuffisante ».
- **Temps économisable :** ~90 s — passer d'une relecture **exhaustive** à une relecture **par exception** (ne relire que ce que la machine signale). C'est le principal gisement de gain après le report des tâches internes vers le Pack.

### Étape 5 — PDF

- **Temps humain estimé :** ~10 s (déclenchement + coup d'œil final).
- **Actions humaines :** lancer la génération, vérifier d'un regard que la mise en page est correcte (6 pages, rien qui déborde).
- **Actions automatiques :** rendu, contrôle automatique du nombre de pages et du débordement, nommage normalisé, archivage.
- **Temps économisable :** ~10 s — un contrôle de mise en page 100 % automatique (déjà partiellement en place) rend le coup d'œil facultatif.

### Étape 6 — Livraison

- **Temps humain estimé :** ~15 s (relecture de l'e-mail, envoi).
- **Actions humaines :** valider l'envoi.
- **Actions automatiques :** e-mail pré-rédigé avec PDF joint, mise à jour du statut de la tâche (`sent`), maintien du contact dans le bon groupe MailerLite.
- **Temps économisable :** ~15 s — envoi en un clic depuis le back-office, sans quitter l'outil ni rédiger l'e-mail.

### Récapitulatif des temps

| Étape | Temps humain (cible) |
|---|---|
| 1 · Réception | 0 s |
| 2 · Chargement | 25 s |
| 3 · Analyse IA | 0 s |
| 4 · Contrôle humain | 240 s |
| 5 · PDF | 10 s |
| 6 · Livraison | 15 s |
| **Total cible** | **≈ 4 min 50 s (290 s)** |

### Temps minimum / moyen / maximum

- **Minimum (~2 min 30 s / 150 s)** — audit « propre » : fiche bien identifiée, benchmark fiable, IA haute confiance sur tous les blocs, aucun cas atypique. L'opérateur valide en bloc.
- **Moyen (~4 min 50 s / 290 s)** — cas courant : 1-2 blocs IA à ajuster, benchmark à confirmer, un coup d'œil cohérence.
- **Maximum (~8 min / 480 s)** — cas difficile : fiche ambiguë, benchmark à reconstruire manuellement, plusieurs blocs IA à réécrire, données limites. **Reste sous les 10 min**, ce qui valide l'architecture même dans le pire cas raisonnable.

> Au-delà de 8 min, la règle doit être : **on ne s'acharne pas.** Un dossier qui dépasse est un dossier « personnalisation insuffisante » (données trop pauvres) → il doit être routé vers un traitement d'exception, pas absorbé dans le flux standard.

---

## 3. Tout ce qui dépasse 30 s de travail humain

Quatre postes concentrent le temps. Pour chacun : pourquoi c'est long, comment l'automatiser, comment le simplifier, et la valeur client réelle.

### 3.1 Contrôle / validation des recommandations (~60 s)

- **Pourquoi c'est long :** c'est le cœur de valeur ; l'opérateur doit s'assurer que le « comment » est juste et applicable.
- **Automatisation :** générer les recommandations depuis le référentiel (REC liées aux CTL non conformes) plutôt que par texte libre → l'IA assemble, ne « crée » pas → moins d'erreurs à corriger.
- **Simplification :** validation par exception (ne relire que les recos à faible confiance) ; recos à trous standardisées.
- **Valeur client :** **Forte** — c'est ce que le client paie. **À conserver**, mais rendre la validation plus rapide, pas la supprimer.

### 3.2 Benchmark concurrentiel — concurrents nommés (~45 s)

- **Pourquoi c'est long :** vérifier que les concurrents proposés sont du bon métier et de la bonne zone ; un mauvais concurrent ruine la crédibilité.
- **Automatisation :** meilleure requête de classement (activité + ville normalisées), filtrage automatique des hors-catégorie, pré-sélection des 3 plus proches.
- **Simplification :** proposer 3 concurrents pré-validés, l'opérateur confirme d'un clic ou en écarte un.
- **Valeur client :** **Forte** — nommer un concurrent réel est un pic de valeur perçue. **À conserver**, automatiser la pré-sélection.

### 3.3 Constats observés par priorité (~45 s)

- **Pourquoi c'est long :** les constats doivent être chiffrés, exacts et cohérents avec le reste.
- **Automatisation :** constats générés depuis les OBS du référentiel avec conditions sur les variables → chiffres toujours justes par construction.
- **Simplification :** relecture par exception ; format figé « observé → impact prospect ».
- **Valeur client :** **Forte.** **À conserver.**

### 3.4 Contrôle de cohérence global (~45 s)

- **Pourquoi c'est long :** vérifier qu'aucune contradiction (force page 2 / manque page 4), que rien ne choque.
- **Automatisation :** détection automatique des contradictions (une donnée ne peut être force et manque) → l'opérateur ne voit que les alertes.
- **Simplification :** transformer une relecture en revue d'une liste d'alertes (0 alerte = validation immédiate).
- **Valeur client :** indirecte (**qualité / crédibilité**), risque **critique** si négligée. **À conserver**, mais outiller pour tomber sous 15 s dans les cas propres.

> **Les tâches internes (Q/R, publications, catégories/services fins, récence photos, résolution des « à confirmer »)** dépassent aussi 30 s chacune — elles ne figurent pas ici car la **décision est de les sortir** de l'audit 99 € (report Pack). Les maintenir dans le 99 € ferait exploser le budget temps pour une valeur que le Pack délivre mieux.

---

## 4. Analyse 80/20

### 4.1 Les 20 % de contrôles qui créent 80 % de la valeur perçue

Ceux qui répondent à « ils ont vraiment regardé MA fiche et je sais quoi faire » :

1. **Position sur la recherche cible** (+ concurrents nommés) — le « où j'en suis » que le client ne peut pas mesurer seul.
2. **Note + volume d'avis vs concurrents** — la comparaison qui pique.
3. **Récence et taux de réponse aux avis** — signal de sérieux, très parlant.
4. **Nombre réel de photos vs concurrents** — visuel, immédiat.
5. **Les 3 priorités avec leur « comment »** — la transformation du constat en action.
6. **Le Score Efficia + sa décomposition** — le verdict mémorable.

Ces six familles portent l'essentiel de la valeur perçue **et** sont majoritairement automatisables (données déjà scrapées). C'est le socle non négociable.

### 4.2 Les contrôles longs que le client ne remarquera probablement jamais

- Résolution exhaustive des points « à confirmer » internes.
- Récence fine des photos, inventaire détaillé des services, présence de Q/R, historique des publications.
- Micro-critères techniques (attributs secondaires, complétude de champs mineurs).

Ils prennent des minutes (accès au compte) pour un effet marginal sur la perception d'un **audit**. Leur place naturelle est le **Pack** (là où on agit vraiment sur la fiche), pas l'audit.

### 4.3 Ce qui peut être supprimé sans baisser la qualité perçue

- Le teaser « 40 critères » et les cartes d'offres avec boutons d'achat (déjà acté dans la cartographie — vente dans un produit payé).
- Le QR code.
- Le résumé narratif long s'il double le contenu des priorités (le condenser).
- La note « 2h30 pour tout refaire » (persuasion).
- Tout micro-contrôle interne non visible de l'extérieur, dans le cadre du 99 €.

---

## 5. Architecture opérationnelle cible

### 5.1 Workflow minute par minute (cas moyen, ~5 min)

- **00:00 — Réception (automatique).** Le paiement crée la tâche pré-remplie ; l'opérateur ouvre un dossier déjà chargé. *(0 s humain)*
- **00:00–00:25 — Chargement & cadrage.** Données Google/Outscraper déjà là, scores calculés, benchmark et priorités pré-remplis. L'opérateur confirme la fiche et la recherche testée. *(25 s)*
- **00:25–00:30 — Vue d'ensemble.** Coup d'œil au score, aux indices, aux alertes de cohérence (idéalement zéro). *(5 s)*
- **00:30–02:30 — Validation du récit.** Relecture **par exception** de l'intro, des constats et des recommandations : seuls les blocs signalés « faible confiance » sont ajustés. *(120 s)*
- **02:30–03:15 — Benchmark.** Confirmer les 3 concurrents pré-sélectionnés (ou en écarter un). *(45 s)*
- **03:15–04:00 — Cohérence & arbitrages.** Traiter les alertes éventuelles ; décider si le dossier est « livrable » ou « personnalisation insuffisante ». *(45 s)*
- **04:00–04:15 — PDF.** Générer ; contrôle de mise en page automatique. *(15 s)*
- **04:15–04:30 — Livraison.** Valider l'e-mail pré-rédigé, envoyer, statut `sent`. *(15 s)*

**Total ≈ 4 min 30 s – 5 min**, largement sous les 10 minutes.

### 5.2 Tâches à automatiser en priorité (par ordre de ROI)

1. **Désambiguïsation de la fiche via l'URL Google fournie à l'achat** (supprime le choix manuel). — gain sûr, risque nul.
2. **Génération par exception + score de confiance par bloc IA** (relecture ciblée). — plus gros gain de temps sur l'étape 4.
3. **Pré-sélection filtrée des concurrents** (bon métier/zone). — sécurise le benchmark et le raccourcit.
4. **Détecteur d'incohérences** (force/manque, chiffres non tracés). — transforme la relecture en revue d'alertes.
5. **Envoi en un clic** (e-mail pré-rédigé + statut). — supprime une micro-tâche récurrente.

### 5.3 Tâches à supprimer

- Toute création/ouverture manuelle de dossier.
- Le choix manuel de fiche quand l'URL est connue.
- La relecture exhaustive systématique (→ par exception).
- Les contrôles internes détaillés dans le périmètre 99 € (→ Pack).
- Les contenus de vente dans le PDF payant.

### 5.4 Tâches à conserver absolument (le travail humain justifié)

- **Validation des concurrents nommés** — risque critique, valeur forte.
- **Arbitrage de cohérence** — la garantie « aucun audit contradictoire ne part ».
- **Validation des recommandations à faible confiance** — le cœur de valeur.
- **Décision livrable / personnalisation insuffisante** — protège la marque.

Ces quatre tâches sont irréductiblement humaines : elles engagent le jugement et la responsabilité. Les industrialiser signifie les **outiller pour aller vite**, jamais les supprimer.

---

## 6. KPI opérationnels

Tableau de bord cible pour piloter la machine à l'échelle. *(Les valeurs monétaires sont des estimations à valider avec les coûts réels — voir hypothèses.)*

| KPI | Cible | Commentaire |
|---|---|---|
| Temps moyen de production (humain) | ≤ 5 min | Cœur du modèle ; alerte si dérive > 7 min. |
| Temps moyen de validation (étape 4) | ≤ 3 min | Le poste le plus sensible ; suivi par blocs corrigés. |
| Taux d'intervention humaine | ≤ 100 % des blocs signalés | Mesuré comme « blocs modifiés / blocs générés » ; cible < 20 %. |
| Taux de dossiers « exception » | ≤ 10 % | Dossiers dépassant 8 min ou « personnalisation insuffisante ». |
| Débit par opérateur | ≥ 10 audits / heure de production nette | À budget 5 min + marges. |
| Coût variable par audit | ~8–12 € | Voir décomposition ci-dessous. |
| Marge brute par audit | ~85–90 % | Sur prix 99 €. |
| Temps économisable restant | Suivi trimestriel | Écart entre temps réel et temps cible. |

### Décomposition du coût variable par audit (estimation)

| Poste | Estimation | Note |
|---|---|---|
| Travail humain (5 min à ~30 €/h chargé) | ~2,50 € | Principal levier de scalabilité. |
| Frais Stripe (~1,4 % + 0,25 € en UE) | ~1,60 € | Sur 99 €. |
| Outscraper (scraping fiche + avis + classement) | ~1–3 € | À confirmer selon volume/forfait. |
| API Google Places | ~0,10–0,50 € | Recherche + détails. |
| IA (génération encadrée) | ~0,05–0,20 € | Faible. |
| Infra (Workers, D1, e-mail) | ~négligeable | Coût marginal quasi nul. |
| **Total estimé** | **~6–8 €** | **Marge brute ~90 %.** |

> **Hypothèses à valider :** taux horaire chargé de l'opérateur, tarif Outscraper réel au volume, frais Stripe exacts selon le contrat. Ces chiffres servent à raisonner, pas à comptabiliser.

**Lecture business :** à ~90 % de marge brute et 5 min de travail humain, le facteur limitant n'est pas le coût mais **le temps humain de validation**. Chaque minute gagnée à l'étape 4 augmente directement le débit et la marge. C'est là que doit se concentrer l'investissement d'automatisation.

---

## 7. Recommandations critiques (sans détour)

1. **Sortez toute l'analyse interne du 99 €.** Q/R, publications, catégories/services fins, récence photos, résolution des « à confirmer » : ~4 min de travail humain pour une valeur que le **Pack** délivre mieux. Les garder dans l'audit, c'est saboter la rentabilité pour un gain de perception quasi nul. **Report Pack, décision ferme.**
2. **Passez d'une relecture exhaustive à une relecture par exception.** Sans score de confiance par bloc, l'opérateur relit tout « par sécurité » → c'est le gaspillage n°1. C'est l'automatisation à plus haut ROI.
3. **Garantissez le benchmark, mais pré-sélectionnez-le.** Ne jamais livrer sans comparaison, mais ne jamais faire chercher les concurrents à la main non plus : la machine propose, l'humain confirme.
4. **Supprimez la vente du produit payant.** Elle ne coûte pas de temps de production mais dégrade l'expérience et brouille la valeur. Décision déjà prise dans la cartographie, à appliquer.
5. **Instituez la règle « on ne s'acharne pas ».** Un dossier > 8 min sort du flux standard. Sans cette règle, la moyenne dérive et la scalabilité s'effondre sur les 10 % de cas difficiles.
6. **Ne cherchez pas à descendre sous 4 min.** En dessous, on rognerait sur les quatre tâches humaines justifiées (concurrents, cohérence, recos, décision livrable) — c'est-à-dire précisément ce qui protège la qualité premium et la marque. **L'objectif n'est pas 0 minute, c'est 0 minute gaspillée.**

---

## 7 bis. Évaluation des recommandations (impact / coût / décision)

Chaque recommandation de ce document est notée sur trois axes : **Impact client** (faible / moyen / fort), **Coût de production** (faible / moyen / élevé — coût pour *nous*, en temps et en mise en place), **Décision** (Conserver / Automatiser / Simplifier / Supprimer).

Lecture : on **Automatise** ce qui a un impact fort mais un coût de production élevé s'il reste manuel ; on **Simplifie** ce qui garde de la valeur mais coûte trop cher tel quel ; on **Supprime** ce qui a un impact faible ou nul ; on **Conserve** le travail humain à impact fort et coût maîtrisé.

### Recommandations d'automatisation

| Recommandation | Impact client | Coût de production | Décision |
|---|---|---|---|
| Désambiguïsation de la fiche via l'URL Google d'achat | Moyen | Faible | **Automatiser** |
| Génération par exception + score de confiance par bloc IA | Fort | Élevé | **Automatiser** |
| Pré-sélection filtrée des concurrents (métier/zone) | Fort | Moyen | **Automatiser** |
| Détecteur automatique d'incohérences | Fort | Moyen | **Automatiser** |
| Envoi en un clic (e-mail pré-rédigé + statut) | Faible | Faible | **Automatiser** |

### Recommandations de simplification / suppression

| Recommandation | Impact client | Coût de production | Décision |
|---|---|---|---|
| Relecture exhaustive → relecture par exception | Fort | Faible | **Simplifier** |
| Benchmark garanti mais pré-sélectionné (machine propose, humain confirme) | Fort | Moyen | **Simplifier** |
| Création/ouverture manuelle de dossier | Faible | Faible | **Supprimer** |
| Choix manuel de fiche quand l'URL est connue | Moyen | Faible | **Supprimer** |
| Analyse interne (Q/R, publications, catégories/services fins, récence photos) dans le 99 € | Moyen | Élevé | **Supprimer** (report Pack) |
| Résolution exhaustive des « à confirmer » dans le 99 € | Faible | Élevé | **Supprimer** (report Pack) |
| Contenus de vente dans le PDF payant (teaser, cartes d'offres, DIY/Pack) | Faible | Faible | **Supprimer** |
| Note « 2h30 pour tout refaire » | Faible | Faible | **Supprimer** |
| QR code | Faible | Faible | **Supprimer** |
| Résumé narratif long doublant les priorités | Moyen | Faible | **Simplifier** (condenser) |

### Recommandations à conserver (travail humain justifié)

| Recommandation | Impact client | Coût de production | Décision |
|---|---|---|---|
| Validation des concurrents nommés | Fort | Moyen | **Conserver** |
| Arbitrage de cohérence global | Fort | Moyen | **Conserver** (outiller pour accélérer) |
| Validation des recommandations à faible confiance | Fort | Moyen | **Conserver** |
| Décision « livrable » vs « personnalisation insuffisante » | Fort | Faible | **Conserver** |
| Règle « on ne s'acharne pas » (dossier > 8 min → exception) | Moyen | Faible | **Conserver** |
| Plancher de 4 min (ne pas rogner sous le minimum humain) | Fort | Faible | **Conserver** |

> **Ce que la grille révèle :** les seules recommandations à **impact fort ET coût élevé** (« génération par exception », analyse interne) sont exactement celles où se joue la bataille — on **automatise** la première (dans le 99 €) et on **déplace** la seconde (vers le Pack). Tout le reste est soit du gain facile (impact faible, coût faible → supprimer), soit du travail humain à protéger (impact fort, coût maîtrisé → conserver).

---

## 8. En une phrase

**La machine produit un audit fini à 100 %, l'humain ne fait que trancher quatre décisions à valeur ajoutée (concurrents nommés, cohérence, recommandations incertaines, dossier livrable ou non) en moins de 5 minutes — tout le reste est automatisé, supprimé, ou reporté dans le Pack, pour une marge brute de ~90 % industrialisable à des centaines d'audits par mois.**
