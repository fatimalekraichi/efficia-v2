---
titre: Audit Efficia™ 99 € — Cartographie de production
statut: actif
version_methode: v5
maj: 2026-07-17
refs: [Pipeline d'analyse Efficia, IA-004, REF-CTL, REF-SEC]
role: Référence produit — définir quelles informations produire pour fabriquer un audit premium à 99 €.
---

# Audit Efficia™ 99 € — Cartographie de production

> **Question à laquelle ce document répond :** *quelles informations devons-nous produire pour fabriquer un audit Efficia à 99 € qui justifie réellement son prix ?*
>
> Ce document est une réflexion **produit**, pas technique. Aucun code. Il sert de référence pour décider, section par section et donnée par donnée, ce qu'il faut **récupérer, calculer, demander à l'IA, vérifier soi-même, ou supprimer**.

---

## 0. La thèse produit (à lire avant le reste)

Le PDF actuel de 6 pages n'est **pas** l'audit à 99 €. C'est le **diagnostic gratuit** : un outil de vente dont le but est de créer assez de valeur perçue pour déclencher l'achat de l'Audit (99 €) ou du Pack (349 €). Sa logique est celle d'un *teaser* : il montre qu'il existe un problème, en révèle une partie, et **retient délibérément** la profondeur (« plus de 40 critères supplémentaires… »).

Un produit **payé 99 €** doit inverser cette logique. Le client a déjà acheté : il ne faut plus le convaincre, il faut le **livrer**. Chaque page consacrée à vendre, teaser ou créer de la frustration est, dans un produit payant, de la valeur en moins. C'est le principal risque du produit actuel : **livrer une version « un peu plus longue » du gratuit au lieu d'un produit de nature différente.**

Ce document distingue donc systématiquement :

- **G** = ce qui existe dans le gratuit et peut être conservé tel quel.
- **G+** = ce qui existe dans le gratuit mais doit être **approfondi** pour un produit payant.
- **NEW** = ce qui n'existe pas encore et qui **fait** la valeur des 99 €.
- **CUT** = ce qui doit **disparaître** de la version payante (vente, teasing, remplissage).

### Ce qui justifie 99 € (les 4 sources de valeur)

Un audit local premium ne vaut pas 99 € par son volume, mais par quatre choses qu'un prospect ne peut pas obtenir seul en 10 minutes :

1. **Personnalisation prouvée** — le client doit sentir « ils ont vraiment regardé MA fiche », pas un gabarit. La preuve, ce sont des chiffres réels, nommés, datés (sa note, ses avis, sa position, ses concurrents nommés).
2. **Profondeur exclusive** — l'analyse de ce qui n'est visible que de l'intérieur du compte (catégories, services, Q/R, publications, signaux de confiance) — exactement ce que le gratuit ne peut pas voir.
3. **Actionnabilité complète** — pas 3 priorités, mais **l'intégralité** des correctifs, ordonnés, chiffrés en effort, avec le « comment » concret. Le client doit pouvoir agir sans nous.
4. **Cadre de décision** — benchmark concurrentiel concret + projection réaliste, pour que le client sache *où il en est* et *ce qu'il gagne à corriger*.

Si une donnée ne sert aucune de ces quatre valeurs, elle est candidate à la suppression (**CUT**).

---

## 1. Légende des colonnes

Chaque donnée est évaluée sur les axes demandés. Abréviations utilisées dans les tableaux :

**Source :**

- `Google` — API Google Business / Places (note, avis visibles, catégorie, photos, horaires).
- `Outscraper` — scraping approfondi (revendication, comptage réel photos, description, réponses avis, classement, concurrents).
- `Calcul` — moteur de Score Efficia (scores, pondérations, projections).
- `Benchmark` — agrégation des fiches concurrentes.
- `IA` — génération de texte encadrée (constats, recommandations, résumé).
- `Humain` — saisie ou vérification par l'opérateur.

**Auto ? :** `Oui` / `Partiel` / `Non` — peut-on produire cette donnée sans intervention humaine ?

**Validation :** `Aucune` · `Contrôle rapide` · `Validation complète` · `Rédaction manuelle`.

**Risque si erronée :** `Faible` · `Moyen` · `Élevé` · `Critique` (critique = met en cause la crédibilité de tout l'audit).

**Valeur client :** `Nulle` · `Faible` · `Moyenne` · `Forte` — apport réel du point de vue du client, pas du nôtre.

**Verdict :** `Indispensable` · `Utile` · `Facultatif` · `À supprimer`.

---

## 2. Cartographie par section du PDF

Les sections suivent l'ordre du PDF actuel. Pour chacune : objectif, informations affichées, puis le détail des données selon les 10 axes.

### PAGE 1 — Votre situation aujourd'hui

#### 1.1 En-tête, logo, identité de marque · `G`

**Objectif :** poser la crédibilité et la propriété visuelle (« ceci est un vrai livrable »).
**Informations affichées :** logo Efficia, titre « Diagnostic Efficia™ » (→ à renommer « Audit Efficia™ » en payant), date.

| Donnée | Source | Auto ? | Validation | Risque | Valeur | Verdict |
|---|---|---|---|---|---|---|
| Logo / charte | Statique | Oui | Aucune | Faible | Moyenne | Indispensable |
| Titre du livrable | Statique | Oui | Contrôle rapide | Moyen | Moyenne | Indispensable |
| Date d'analyse | Calcul | Oui | Aucune | Faible | Forte | Indispensable |

> **Note payant :** le titre doit clairement dire « Audit complet », pas « Diagnostic ». Un client qui a payé ne doit jamais lire le mot « gratuit ».

#### 1.2 Bandeau d'identité de la fiche · `G` → `G+`

**Objectif :** prouver en 2 secondes qu'on parle de SA fiche.
**Informations affichées :** nom de l'entreprise, note, nombre d'avis, photos, services, position.

| Donnée | Source | Auto ? | Validation | Risque | Valeur | Verdict |
|---|---|---|---|---|---|---|
| Nom entreprise | Google/Humain | Oui | Contrôle rapide | Élevé | Forte | Indispensable |
| Note moyenne ★ | Google | Oui | Aucune | Moyen | Forte | Indispensable |
| Nombre d'avis | Google | Oui | Aucune | Moyen | Forte | Indispensable |
| Nombre de photos (réel) | Outscraper | Oui | Aucune | Moyen | Forte | Indispensable |
| Nombre de services | Google/Outscraper | Partiel | Contrôle rapide | Faible | Moyenne | Utile |
| Position locale | Outscraper | Oui | Contrôle rapide | Élevé | Forte | Indispensable |

> **Risque clé :** une position ou une note fausse ruine la crédibilité de tout l'audit (risque critique de réputation). La position doit toujours indiquer **sur quelle recherche** elle a été mesurée.

#### 1.3 Jauge Score Efficia™ + niveau · `G`

**Objectif :** donner un verdict chiffré immédiat et mémorable.
**Informations affichées :** score /100, bande d'interprétation (niveau nommé + couleur), phrase directe.

| Donnée | Source | Auto ? | Validation | Risque | Valeur | Verdict |
|---|---|---|---|---|---|---|
| Score Efficia /100 | Calcul | Oui | Contrôle rapide | Élevé | Forte | Indispensable |
| Bande / niveau | Calcul | Oui | Aucune | Moyen | Forte | Indispensable |
| Phrase directe de score | IA/Calcul | Oui | Contrôle rapide | Moyen | Moyenne | Utile |

> **Exigence payant :** le score doit être **reproductible et explicable** (voir §6). Un score « boîte noire » est acceptable en gratuit, pas à 99 € : le client doit pouvoir voir d'où viennent ses points perdus.

#### 1.4 Texte d'introduction « consultant » (personnalisé) · `G+`

**Objectif :** créer le sentiment d'un regard humain expert.
**Informations affichées :** 2-4 phrases personnalisées (nom du contact, activité, ville, score, projection).

| Donnée | Source | Auto ? | Validation | Risque | Valeur | Verdict |
|---|---|---|---|---|---|---|
| Texte intro personnalisé | IA | Partiel | Validation complète | Élevé | Forte | Indispensable |

> **Payant :** c'est un point de valeur fort *si* c'est vraiment personnalisé. Le risque est le texte « pseudo-personnalisé » (variables insérées dans un gabarit générique) : le client le détecte et la valeur s'effondre. À valider humainement à chaque audit.

#### 1.5 Indices prospect (Visibilité · Confiance · Conversion) · `G`

**Objectif :** traduire le score en trois dimensions que le prospect comprend.
**Informations affichées :** trois sous-scores /100 avec libellé.

| Donnée | Source | Auto ? | Validation | Risque | Valeur | Verdict |
|---|---|---|---|---|---|---|
| Indice Visibilité | Calcul | Oui | Aucune | Moyen | Forte | Indispensable |
| Indice Confiance | Calcul | Oui | Aucune | Moyen | Forte | Indispensable |
| Indice Conversion | Calcul | Oui | Aucune | Moyen | Forte | Indispensable |

#### 1.6 Bloc « signification » (forces / faiblesses) · `G`

**Objectif :** donner du sens au score en une lecture.
**Informations affichées :** 1-2 domaines forts, 1-2 domaines faibles.

| Donnée | Source | Auto ? | Validation | Risque | Valeur | Verdict |
|---|---|---|---|---|---|---|
| Domaines forts | Calcul | Oui | Contrôle rapide | Faible | Moyenne | Utile |
| Domaines faibles | Calcul | Oui | Contrôle rapide | Moyen | Forte | Indispensable |

#### 1.7 Note de méthode · `G`

**Objectif :** asseoir la rigueur (nombre de contrôles, recherche testée).
**Informations affichées :** nombre de points de contrôle, recherche testée, mention « état public de la fiche ».

| Donnée | Source | Auto ? | Validation | Risque | Valeur | Verdict |
|---|---|---|---|---|---|---|
| Nb de contrôles passés | Calcul | Oui | Aucune | Faible | Moyenne | Utile |
| Recherche testée | Outscraper | Oui | Contrôle rapide | Moyen | Forte | Indispensable |

> **Payant :** en gratuit cette note vante « 40+ critères de l'Audit complet » — à **supprimer** en payant (on ne vante plus, on livre). Remplacer par la méthodologie réellement appliquée.

---

### PAGE 2 — Pourquoi obtenez-vous ce score ?

#### 2.1 Benchmark concurrentiel · `G+` → cœur de valeur

**Objectif :** situer la fiche face aux concurrents réels (le « où j'en suis »).
**Informations affichées :** tableau concurrents (note, avis, photos), position relative, écarts expliqués.

| Donnée | Source | Auto ? | Validation | Risque | Valeur | Verdict |
|---|---|---|---|---|---|---|
| Concurrents (jusqu'à 3) | Outscraper/Benchmark | Oui | Validation complète | Élevé | Forte | Indispensable |
| Note moyenne concurrents | Benchmark | Oui | Contrôle rapide | Moyen | Forte | Indispensable |
| Avis moyen concurrents | Benchmark | Oui | Contrôle rapide | Moyen | Forte | Indispensable |
| Photos moyennes concurrents | Benchmark | Oui | Contrôle rapide | Moyen | Moyenne | Utile |
| Écarts expliqués (texte) | IA | Partiel | Validation complète | Élevé | Forte | Indispensable |

> **Critique :** en gratuit, le benchmark est **conditionnel** — s'il n'est pas fiable, il est masqué et remplacé par un « en résumé ». **Inacceptable dans un produit à 99 €** : le benchmark concurrentiel est l'une des rares choses que le client ne peut pas faire seul, c'est un pilier de la valeur. En payant, il doit être **garanti** : si le scraping automatique échoue, l'opérateur le construit manuellement (relevé de 3 concurrents nommés sur la recherche cible). Le fallback « pas de comparaison » doit disparaître.

#### 2.2 Répartition du score par domaine (6 domaines) · `G`

**Objectif :** montrer d'où viennent les points, domaine par domaine.
**Informations affichées :** 6 barres (domaine, points/max, statut, %).

| Donnée | Source | Auto ? | Validation | Risque | Valeur | Verdict |
|---|---|---|---|---|---|---|
| Score par domaine (×6) | Calcul | Oui | Aucune | Moyen | Forte | Indispensable |
| Statut de domaine | Calcul | Oui | Aucune | Faible | Moyenne | Utile |

#### 2.3 Bloc « En résumé » (fallback sans benchmark) · `G` → `CUT` en payant

**Objectif (gratuit) :** substitut au benchmark quand il manque.
**Verdict payant :** **À supprimer** — puisque le benchmark devient garanti (2.1), ce substitut n'a plus de raison d'être. Le garder reviendrait à admettre qu'on peut livrer sans comparaison.

---

### PAGE 3 — Ce que nous avons analysé

#### 3.1 Checklist des contrôles · `G+`

**Objectif :** prouver l'ampleur du travail (« on a vérifié tout ça »).
**Informations affichées :** liste des contrôles vérifiés, statut de chacun, points « à confirmer ».

| Donnée | Source | Auto ? | Validation | Risque | Valeur | Verdict |
|---|---|---|---|---|---|---|
| Liste des contrôles + statut | Calcul | Oui | Contrôle rapide | Moyen | Forte | Indispensable |
| Points « à confirmer » | Calcul/Humain | Partiel | Validation complète | Élevé | Faible→Forte | Utile |

> **Critique majeure du payant :** en gratuit, les points « à confirmer » sont un **argument de vente** (« vérifiables seulement depuis l'intérieur du compte → achetez l'audit »). Dans l'audit payant, laisser des dizaines de points « à confirmer » **non résolus** est un défaut de livraison : le client a payé précisément pour qu'on les confirme. **En payant, le taux de « à confirmer » doit tendre vers zéro** — c'est un indicateur qualité de l'audit. Cela implique un accès aux données internes (compte Google du client) ou une vérification manuelle documentée.

#### 3.2 Note « effort manuel ~2h30 » · `G` → `CUT`/refonte

**Objectif (gratuit) :** justifier la valeur en montrant le temps qu'il faudrait pour tout refaire.
**Verdict payant :** **argument de vente déguisé** → à supprimer ou reformuler. En payant, remplacer par la **méthodologie réelle** (quelles sources, quelle date, quelles limites) — ce qui sert l'auditabilité, pas la persuasion.

---

### PAGE 4 — Par où commencer (priorités 1-2)

#### 4.1 Forces de la fiche · `G`

**Objectif :** équilibrer le propos, éviter le rapport uniquement négatif.
**Informations affichées :** 2-3 points forts chiffrés.

| Donnée | Source | Auto ? | Validation | Risque | Valeur | Verdict |
|---|---|---|---|---|---|---|
| Forces (top 2-3) | Calcul/IA | Oui | Contrôle rapide | Faible | Moyenne | Utile |

#### 4.2 Priorités 1 et 2 (structure observation → action → résultat) · `G+`

**Objectif :** transformer le diagnostic en action.
**Informations affichées :** pour chaque priorité : ce qu'on a observé, ce que voit un prospect, première action, résultat attendu, effort.

| Donnée | Source | Auto ? | Validation | Risque | Valeur | Verdict |
|---|---|---|---|---|---|---|
| Constat observé | Calcul/IA | Partiel | Validation complète | Élevé | Forte | Indispensable |
| Impact prospect | IA | Partiel | Validation complète | Moyen | Forte | Indispensable |
| Première action | IA/REC | Partiel | Validation complète | Élevé | Forte | Indispensable |
| Résultat attendu | IA/REC | Partiel | Validation complète | Moyen | Forte | Indispensable |
| Effort estimé | Calcul | Oui | Contrôle rapide | Faible | Moyenne | Utile |

> **Critique :** limiter à **3 priorités** est la bonne stratégie pour un **gratuit** (on garde du grain à moudre pour la vente). Pour un **payant**, c'est insuffisant : le client a acheté le plan **complet**. Voir §4 (NEW) — l'audit 99 € doit livrer **toutes** les actions correctives, ordonnées, pas seulement les 3 premières.

---

### PAGE 5 — Plan d'action immédiat

#### 5.1 Priorité 3 + bénéfices attendus · `G+`

Même structure que 4.2 ; même verdict (à étendre à l'ensemble des correctifs en payant).

#### 5.2 Encart « Ce diagnostic gratuit couvre uniquement… » (teaser 40 critères) · `G` → `CUT`

**Objectif (gratuit) :** créer le manque, vendre l'audit payant.
**Verdict payant :** **À supprimer intégralement.** C'est l'exemple type de contenu qui, dans un produit payé, détruit de la valeur : on rappelle au client tout ce qu'on ne lui donne pas. Dans l'audit 99 €, ces « 40 critères supplémentaires » ne sont plus un teaser : ils **sont** le produit et doivent être livrés (voir §4).

---

### PAGE 6 — Deux façons d'améliorer votre fiche

#### 6.1 Projection de score (aujourd'hui → objectif) · `G+`

**Objectif :** montrer le gain potentiel.
**Informations affichées :** score actuel → score projeté après corrections maîtrisables.

| Donnée | Source | Auto ? | Validation | Risque | Valeur | Verdict |
|---|---|---|---|---|---|---|
| Score projeté | Calcul | Oui | Contrôle rapide | Élevé | Forte | Indispensable |
| Avertissement (pas une garantie) | Statique | Oui | Aucune | Élevé | Forte | Indispensable |

> **Risque :** une projection présentée comme une promesse de classement/CA est un risque juridique et de confiance. L'avertissement est **indispensable** et doit rester. La projection garde sa valeur en payant, mais recadrée : « score de complétude », jamais « +X clients ».

#### 6.2 Effort DIY vs Pack · `G` → `CUT`/refonte

**Objectif (gratuit) :** orienter vers le Pack 349 €.
**Verdict payant :** l'audit 99 € **peut** conserver une page « et maintenant ? » avec l'option Pack — mais **une seule**, sobre, en fin de document, pas deux pages de vente. La comparaison d'effort DIY/Pack relève de la vente : à réduire drastiquement.

#### 6.3 Cartes d'offres (Audit 99 € / Pack 349 €) + boutons paiement · `G` → `CUT` (majoritairement)

**Objectif (gratuit) :** conversion.
**Verdict payant :** **le client a déjà payé l'audit.** Afficher la carte « Audit 99 € — Recevoir mon audit » dans l'audit lui-même est absurde. À supprimer. Ne conserver éventuellement qu'**un** encart discret vers le Pack (upsell légitime), pas deux cartes de prix avec boutons d'achat.

#### 6.4 QR code, signature, mentions légales · `G`

| Donnée | Source | Auto ? | Validation | Risque | Valeur | Verdict |
|---|---|---|---|---|---|---|
| Signature / contact | Statique | Oui | Aucune | Faible | Moyenne | Indispensable |
| Mentions légales | Statique | Oui | Contrôle rapide | Moyen | Faible | Indispensable |
| QR code | Calcul | Oui | Aucune | Faible | Faible | Facultatif |

---

## 3. Cartographie des composants transverses

### 3.1 Les scores

| Score | Ce qu'il mesure | Source | Auto ? | Validation | Risque | Valeur | Verdict |
|---|---|---|---|---|---|---|---|
| Score Efficia /100 | Complétude globale de la fiche | Calcul | Oui | Contrôle rapide | Élevé | Forte | Indispensable |
| Indice Visibilité | Être trouvé | Calcul | Oui | Aucune | Moyen | Forte | Indispensable |
| Indice Confiance | Être crédible | Calcul | Oui | Aucune | Moyen | Forte | Indispensable |
| Indice Conversion | Être choisi | Calcul | Oui | Aucune | Moyen | Forte | Indispensable |
| Score par domaine (×6) | Détail par famille de critères | Calcul | Oui | Aucune | Moyen | Forte | Indispensable |
| Score projeté | Gain atteignable | Calcul | Oui | Contrôle rapide | Élevé | Forte | Indispensable |

> **Exigence transverse (payant) :** tout score affiché doit être **décomposable** — le client doit pouvoir retrouver, pour chaque score, quels critères le composent et combien de points sont perdus où. C'est la différence entre un score « marketing » et un score « d'audit ».

### 3.2 Les indicateurs / données observées

| Donnée observée | Source | Auto ? | Validation | Risque | Valeur | Verdict |
|---|---|---|---|---|---|---|
| Note moyenne | Google | Oui | Aucune | Moyen | Forte | Indispensable |
| Nombre d'avis | Google | Oui | Aucune | Moyen | Forte | Indispensable |
| Récence du dernier avis | Outscraper | Oui | Contrôle rapide | Moyen | Forte | Indispensable |
| Taux de réponse aux avis | Outscraper | Oui | Contrôle rapide | Moyen | Forte | Indispensable |
| Nombre réel de photos | Outscraper | Oui | Aucune | Moyen | Forte | Indispensable |
| Récence des photos | Outscraper/Humain | Partiel | Validation complète | Moyen | Forte | Utile |
| Longueur de description | Outscraper | Oui | Aucune | Faible | Moyenne | Utile |
| Fiche revendiquée | Outscraper | Oui | Contrôle rapide | Élevé | Forte | Indispensable |
| Catégorie principale | Google | Oui | Contrôle rapide | Élevé | Forte | Indispensable |
| Catégories secondaires | Outscraper/Humain | Partiel | Validation complète | Moyen | Forte | Utile |
| Services listés | Google/Humain | Partiel | Validation complète | Moyen | Forte | Utile |
| Horaires renseignés | Google | Oui | Aucune | Faible | Moyenne | Utile |
| Lien de réservation/devis | Outscraper | Oui | Contrôle rapide | Faible | Moyenne | Utile |
| Position sur recherche cible | Outscraper | Oui | Contrôle rapide | Élevé | Forte | Indispensable |
| Q/R (FAQ) présentes | Humain | Non | Rédaction manuelle | Moyen | Forte | Utile |
| Publications récentes | Humain | Non | Rédaction manuelle | Moyen | Moyenne | Utile |

> **Lecture stratégique :** les données `Google`/`Outscraper` en `Auto = Oui` sont le socle bon marché et fiable. Les données à forte valeur qui exigent l'humain (Q/R, publications, récence photos, catégories/services fins) sont précisément **ce qui distingue le payant** — elles coûtent du temps mais créent la profondeur exclusive. Ce sont elles qu'il faut industrialiser, pas supprimer.

### 3.3 Les recommandations

Structure cible d'**une** recommandation dans l'audit payant :

| Élément d'une reco | Source | Auto ? | Validation | Risque | Valeur | Verdict |
|---|---|---|---|---|---|---|
| Critère corrigé (lien CTL) | Calcul | Oui | Aucune | Faible | Moyenne | Indispensable |
| Constat observé (chiffré) | Calcul/IA | Partiel | Validation complète | Élevé | Forte | Indispensable |
| Pourquoi ça compte (impact prospect) | IA | Partiel | Validation complète | Moyen | Forte | Indispensable |
| Action concrète (le « comment ») | IA/REC | Partiel | Validation complète | Élevé | Forte | Indispensable |
| Résultat attendu | REC/IA | Partiel | Validation complète | Moyen | Forte | Indispensable |
| Effort (minutes) | REC/Calcul | Oui | Contrôle rapide | Faible | Moyenne | Utile |
| Niveau d'impact | REC/Calcul | Oui | Contrôle rapide | Moyen | Forte | Indispensable |
| Rang de priorité | Calcul | Oui | Contrôle rapide | Moyen | Forte | Indispensable |

> **Différence gratuit → payant :** le gratuit livre **3** recommandations. L'audit 99 € doit livrer **toutes** les recommandations correspondant aux critères non conformes, **ordonnées par priorité**, chacune avec son « comment ». C'est le cœur du produit payant. Une reco sans « comment » concret n'a pas sa place à 99 €.

### 3.4 Les graphiques

| Graphique | Rôle | Source | Auto ? | Validation | Risque | Valeur | Verdict |
|---|---|---|---|---|---|---|---|
| Jauge Score /100 | Verdict immédiat | Calcul | Oui | Aucune | Moyen | Forte | Indispensable |
| Barres par domaine (×6) | Répartition des points | Calcul | Oui | Aucune | Faible | Forte | Indispensable |
| Projection (avant → après) | Gain potentiel | Calcul | Oui | Contrôle rapide | Élevé | Forte | Indispensable |
| Tableau benchmark concurrents | Position marché | Benchmark | Oui | Validation complète | Élevé | Forte | Indispensable |
| Barres indices prospect (×3) | Traduction du score | Calcul | Oui | Aucune | Faible | Forte | Utile |

> **Critique :** aucun graphique « décoratif » ne doit subsister. Un graphique qui n'aide pas une décision (ex. un camembert de répartition sans action associée) est du remplissage. Chaque visuel doit répondre à « et donc, je fais quoi ? ».

### 3.5 Les comparaisons concurrentielles

| Comparaison | Source | Auto ? | Validation | Risque | Valeur | Verdict |
|---|---|---|---|---|---|---|
| Ma position vs concurrents (recherche cible) | Outscraper | Oui | Validation complète | Élevé | Forte | Indispensable |
| Ma note vs note moyenne | Benchmark | Oui | Contrôle rapide | Moyen | Forte | Indispensable |
| Mes avis vs volume moyen | Benchmark | Oui | Contrôle rapide | Moyen | Forte | Indispensable |
| Mes photos vs photos moyennes | Benchmark | Oui | Contrôle rapide | Faible | Moyenne | Utile |
| Concurrents nommés (nom réel) | Outscraper/Humain | Partiel | Validation complète | Élevé | Forte | Indispensable |

> **Exigence payant :** nommer au moins **un** concurrent réel change tout dans la perception (« ils connaissent mon marché »). Un benchmark anonyme (« la moyenne du secteur ») est nettement moins fort. Le risque : nommer un mauvais concurrent (hors zone, hors métier) → validation humaine obligatoire.

---

## 4. Ce que l'audit 99 € doit AJOUTER (les `NEW`)

Ce qui, dans le gratuit, n'est que teasé — et qui doit devenir le **corps** du produit payant :

1. **L'analyse interne (compte Google).** Catégories complètes, services détaillés, attributs, Q/R, publications, signaux de confiance. C'est la profondeur exclusive (valeur n°2). Exige un accès ou une saisie humaine documentée → à industrialiser.
2. **Le plan d'action intégral et ordonné.** Toutes les recommandations, pas 3 — regroupées par domaine, priorisées, chacune avec son « comment ». C'est l'actionnabilité complète (valeur n°3).
3. **Le benchmark garanti et nommé.** Toujours présent, avec concurrents réels nommés sur la recherche cible. Jamais de fallback « pas de comparaison ».
4. **La résolution des « à confirmer ».** Le taux de points non confirmés doit tendre vers zéro : c'est ce que le client paie.
5. **Une annexe méthodologique.** Sources, date, périmètre, limites. Sert l'auditabilité et la confiance (« ils assument ce qu'ils ont regardé et ce qu'ils n'ont pas pu voir »).
6. **Un fil narratif orienté client, pas orienté vente.** Le récit doit mener de « voici votre situation » à « voici votre plan », sans détour par « achetez l'audit » (déjà acheté).

---

## 5. Analyse critique — ce qui ne justifie PAS 99 €

Résumé des éléments à **supprimer ou refondre** dans la version payante, avec la raison :

| Élément actuel | Problème à 99 € | Décision |
|---|---|---|
| Teaser « 40 critères supplémentaires » (p.5) | Rappelle au client ce qu'on ne lui donne pas | **Supprimer** — le livrer à la place |
| Deux cartes d'offres + boutons d'achat (p.6) | Le client a déjà payé l'audit | **Supprimer** l'offre Audit ; réduire le Pack à un encart |
| Comparatif effort DIY vs Pack (p.6) | Argument de vente | **Réduire** à une ligne |
| Note « ~2h30 pour tout refaire » (p.3) | Persuasion, pas information | **Refondre** en méthodologie réelle |
| Fallback « En résumé » sans benchmark (p.2) | Admet qu'on peut livrer sans comparaison | **Supprimer** — benchmark garanti |
| Points « à confirmer » laissés ouverts (p.3) | Défaut de livraison payante | **Résoudre** — tendre vers zéro |
| Limitation à 3 priorités | Insuffisant pour un plan payant | **Étendre** au plan complet |
| Mot « Diagnostic » / « gratuit » partout | Dévalorise un produit payé | **Renommer** en « Audit complet » |
| QR code | Faible valeur, place perdue | **Facultatif** — supprimable |

> **Verdict d'ensemble :** en l'état, environ **1,5 page sur 6** du PDF actuel (fin p.5 + p.6) est de la vente. Dans un produit payant, cela représente ~25 % du livrable consacré à convaincre un client déjà convaincu. C'est le premier gisement de valeur à récupérer : remplacer ces pages par de la livraison (plan complet + analyse interne + benchmark nommé).

---

## 6. Contraintes de qualité du produit

Pour qu'un audit à 99 € tienne dans le temps et à l'échelle :

- **Reproductibilité.** Deux audits de la même fiche, mêmes données, même version de méthode → même score. Le score n'est pas une opinion.
- **Auditabilité.** Chaque chiffre du PDF doit être traçable jusqu'à sa source (donnée observée ou calcul). Aucune statistique non sourcée.
- **Traçabilité.** Chaque audit porte sa date, sa version de méthode, ses sources et la recherche testée.
- **Personnalisation vérifiée.** Un audit sous le minimum de données personnalisantes (position, note+avis, avis concurrents, photos, description) est signalé **avant** livraison — jamais livré générique.
- **Cohérence.** Une force affichée quelque part ne peut pas devenir un manque ailleurs ; règle bloquante à la validation.

---

## 7. Synthèse — les cinq réponses attendues

### 7.1 Quelles données faut-il RÉCUPÉRER (Google / Outscraper) ?

Note, nombre d'avis, récence du dernier avis, taux de réponse aux avis, nombre réel de photos, longueur de description, revendication, catégorie principale, horaires, lien réservation/devis, position sur la recherche cible, concurrents (note/avis/photos/nom). → **Socle automatique, fiable, bon marché.**

### 7.2 Quelles données faut-il CALCULER (moteur de score) ?

Score Efficia /100, 3 indices prospect, 6 scores de domaine, statuts de critères, projection de score, rangs/percentiles benchmark, effort estimé, sélection et ordre des priorités. → **Déterministe et reproductible.**

### 7.3 Quelles données faut-il demander à l'IA ?

Texte d'introduction personnalisé, formulation des constats, explication des écarts concurrentiels, rédaction des recommandations (le « comment »), résumé narratif. → **Toujours encadré par le référentiel et validé humainement ; jamais de chiffre inventé par l'IA.**

### 7.4 Quelles données faut-il VÉRIFIER soi-même ?

Concurrents nommés (bon métier/zone), texte d'intro personnalisé, constats et recommandations rédigés, benchmark, résolution des points « à confirmer », données internes (catégories fines, services, Q/R, publications, récence photos), cohérence globale. → **Le rôle humain est concentré sur ce qui crée la valeur exclusive et sur ce qui, si faux, tue la crédibilité.**

### 7.5 Quelles données peut-on SUPPRIMER (aucune valeur à 99 €) ?

Le teaser « 40 critères », les deux cartes d'offres avec boutons d'achat, le comparatif effort DIY/Pack, la note « 2h30 », le fallback « En résumé » sans benchmark, le QR code (facultatif), toute mention « gratuit / diagnostic ». → **~25 % du PDF actuel, à remplacer par de la livraison.**

---

## 8. En une phrase

**L'audit à 99 € ne doit pas être un diagnostic gratuit rallongé : il doit livrer exactement ce que le gratuit promet sans le donner — l'analyse interne complète, le plan d'action intégral et ordonné, et un benchmark concurrentiel nommé — en supprimant tout ce qui, dans un produit déjà payé, ne sert qu'à vendre.**
