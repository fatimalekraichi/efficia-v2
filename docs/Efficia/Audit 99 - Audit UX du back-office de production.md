---
titre: Audit UX du back-office de production (Audit 99 €)
statut: actif
version_methode: v5
maj: 2026-07-17
refs: [Audit 99 - Architecture de production, Audit 99 - Roadmap MVP et backlog]
role: Rapport d'audit UX — simuler un opérateur de la commande à la livraison, cartographier chaque clic, chaque saisie, chaque friction et chaque risque, puis recommander un parcours fluide. Aucun code.
---

# Audit UX — back-office de production Efficia™

> **Méthode :** parcours simulé d'un opérateur (« Sonia ») produisant un audit à partir d'une commande Stripe déjà payée, jusqu'à la livraison. Chaque clic, saisie et manipulation est relevé, avec sa friction et son risque. Objectif : un parcours fluide, sans rien casser du code existant.
>
> **Périmètre observé :** liste des commandes (`/admin`), détail commande (`/admin-order`), outil de production (`outil-score…`), livraison e-mail. **État actuel : fonctionnel mais artisanal** — le parcours marche, mais il repose sur la mémoire et la rigueur de l'opérateur, pas sur des garde-fous.

---

## 1. Résumé exécutif

Le back-office **fait le travail**, mais le parcours est **fragmenté** : deux applications distinctes (back-office et outil de production) dans deux onglets, une livraison entièrement manuelle, et des statuts qui se chevauchent. Un opérateur entraîné y arrive ; un opérateur pressé ou nouveau y commettra des erreurs.

**Les trois frictions majeures :**

1. **La livraison est un trou noir.** Le PDF se télécharge sur le disque de l'opérateur ; l'e-mail au client est écrit à la main, pièce jointe cherchée à la main. C'est le plus gros risque d'erreur (mauvais fichier, mauvais client, oubli) et le plus gros vol de temps.
2. **Les statuts se dédoublent et se contredisent.** « Marquer comme terminé » (tâche) et « Marquer dossier terminé » (production) font la même chose ; rien n'empêche de marquer « audit envoyé » avant même d'avoir généré le PDF. L'état du dossier n'est pas fiable.
3. **L'opérateur ressaisit et devine.** L'activité n'est jamais pré-remplie, la bonne fiche Google doit être choisie à la main, et rien ne signale un dossier « trop pauvre pour être livré ».

**Verdict :** aucune de ces frictions n'exige de gros développement. Ce sont surtout des problèmes de **séquencement, de feedback et de garde-fous** — le cœur d'un travail UX.

---

## 2. Le parcours réel, clic par clic

Persona : **Sonia**, opératrice. Elle vient de voir une notification « nouvelle commande payée ». Chaque action est numérotée ; les frictions sont notées 🟡 (gêne), 🟠 (risque), 🔴 (risque grave).

### Phase A — Trouver la commande (`/admin`)

1. Sonia ouvre `/admin` (si déconnectée : login → **saisie mot de passe**). 🟡 *Pas de lien direct « commande → production » depuis une notification ; il faut passer par la liste.*
2. Elle scanne la liste, éventuellement **filtre** (recherche / statut / offre / environnement) — **1 à 4 saisies**. 🟡 *Rien ne met en avant « les commandes à produire maintenant » : la file de travail n'est pas priorisée.*
3. Elle repère la ligne, clique dessus (ou sur 👁). **1 clic.** 🟠 *La ligne entière et trois icônes (👁 voir, 🌍 Google, ✉️ envoyer) sont cliquables : un ✉️ cliqué par erreur peut marquer l'audit « envoyé » (voir Phase E).*

### Phase B — Cadrer le dossier (`/admin-order`)

4. La page commande se charge : cartes Client, Tâche interne, Production. Sonia lit les infos. 🟡 *Beaucoup de champs techniques (Session Stripe, Payment Intent) mélangés aux infos utiles à la production → bruit visuel.*
5. Elle clique **« Commencer »** (statut tâche → `in_progress`). **1 clic.** 🟠 *Aucun retour visuel de succès (pas de toast) : la page se re-rend silencieusement. Sonia n'est pas sûre que ça a marché.*
6. Elle clique **« Produire l'audit »** → l'outil s'ouvre **dans un nouvel onglet**. **1 clic.** 🟡 *Changement de contexte : elle jongle désormais entre deux onglets.*

### Phase C — Produire l'audit (outil de score)

7. À l'ouverture, entreprise / ville / contact sont **pré-remplis** ✅. Le bloc « Commande liée » affiche les IDs et le lien de la fiche Google (si fourni).
8. Sonia doit **saisir l'activité** (non transmise par la commande). **1 saisie.** 🟠 *Re-saisie systématique ; une activité vague dégrade le classement et les concurrents.*
9. Première utilisation sur ce poste : elle doit **renseigner l'URL du connecteur + le jeton + la clé API Google** (mémorisés ensuite). **0 à 3 saisies.** 🔴 *Si un champ est vide/expiré, l'analyse échoue avec un message technique ; rien ne vérifie ces prérequis en amont.*
10. Elle clique **« Analyser automatiquement »** (Google). **1 clic.** Si plusieurs fiches : elle doit **choisir la bonne**. **0 à 1 clic.** 🔴 *Risque de sélectionner un homonyme → tout l'audit porte sur la mauvaise entreprise.*
11. Elle clique **« Analyse approfondie »** (scraping). **1 clic.** 🟠 *Étape distincte et facile à oublier : sans elle, pas de photos réelles, position ni concurrents → audit appauvri.*
12. Elle **vérifie les critères surlignés** (« à confirmer »), en corrige certains à la main. **N clics / saisies.** 🟠 *Aucune indication de ce qui est obligatoire vs optionnel ; la complétude dépend du jugement.*
13. Elle clique **« Télécharger le PDF »**. **1 clic.** Le PDF part **sur le disque** ; en coulisse, l'audit est finalisé et le statut back-office passe à `pdf_generated`. 🟠 *Le fichier se noie parmi d'autres téléchargements aux noms proches ; aucun aperçu intégré.*

### Phase D — Contrôler et faire avancer les statuts (`/admin-order`)

14. Sonia revient sur l'onglet back-office et **rafraîchit** pour voir le nouveau statut. **1 clic.** 🟡 *Pas de synchronisation automatique entre l'outil et la page commande.*
15. Elle clique **« Marquer PDF vérifié »**. **1 clic.** 🟠 *Rien ne garantit qu'elle a réellement rouvert le PDF ; le bouton n'exige aucune preuve.*
16. (Optionnel) elle écrit une **note interne** puis clique **« Sauvegarder les notes »**. **1 saisie + 1 clic.**

### Phase E — Livrer (manuel)

17. Elle ouvre sa messagerie (Gmail), **rédige** un e-mail au client, **joint** le PDF récupéré dans les téléchargements, **envoie**. **Plusieurs saisies + manipulations.** 🔴 *Point le plus risqué : mauvaise pièce jointe, mauvais destinataire, message réécrit à chaque fois, aucun modèle.*
18. Elle revient au back-office et clique **« Marquer audit envoyé »** (ou l'icône ✉️ depuis la liste). **1 clic.** 🔴 *Le statut « envoyé » repose sur une affirmation, pas sur un envoi réellement vérifié ; l'icône ✉️ peut marquer « envoyé » sans qu'aucun e-mail ne parte.*
19. Éventuellement **« Marquer dossier terminé »**. **1 clic.** 🟡 *Doublon avec « Marquer comme terminé » de la carte Tâche.*

### Décompte

- **Clics : ~15 à 20** selon les cas (hors saisies de production dans l'outil).
- **Saisies : 3 à 8** (activité, éventuels prérequis, corrections de critères, e-mail).
- **Changements d'onglet/app : au moins 4** (liste ↔ commande ↔ outil ↔ messagerie ↔ commande).
- **Points de rupture manuels critiques : 2** (choix de la fiche, livraison e-mail).

---

## 3. Tableau des frictions

| # | Friction | Type | Gravité | Pourquoi c'est un problème | Recommandation (sans code ici) |
|---|---|---|---|---|---|
| F1 | Livraison 100 % manuelle (PDF sur disque + e-mail à la main) | Manip. inutile + risque | 🔴 | Mauvais fichier / client / oubli ; temps perdu | Envoi assisté depuis le back-office avec modèle + PDF rattaché (V2) |
| F2 | Statut « envoyé » sans preuve d'envoi | Risque | 🔴 | L'état ment ; livraison non prouvée | Lier « envoyé » à l'acte d'envoi, pas à un bouton libre |
| F3 | Choix manuel de la fiche Google (homonymes) | Risque | 🔴 | Audit sur la mauvaise entreprise | Pré-résolution via l'URL Google transmise ; confirmation explicite |
| F4 | Prérequis (connecteur, jeton, clé API) non vérifiés | Risque | 🔴 | Échec en cours d'analyse, message technique | Vérifier les prérequis à l'ouverture et le signaler clairement |
| F5 | Activité ressaisie à chaque audit | Saisie inutile | 🟠 | Temps + risque de recherche imprécise | Capturer l'activité à l'achat, ou la déduire de la catégorie |
| F6 | Étape « Analyse approfondie » séparée et oubliable | Risque | 🟠 | Audit appauvri (pas de concurrents/position) | Enchaîner analyse Google + scraping en une action |
| F7 | Aucun feedback de succès sur les changements de statut | Friction | 🟠 | Doute, double-clic, régression | Confirmation visuelle (toast) + désactivation temporaire du bouton |
| F8 | Statuts dupliqués et non ordonnés | Confusion | 🟠 | « Terminé » ×2 ; « envoyé » possible avant PDF | Un seul fil de statut ordonné, étapes verrouillées tant que la précédente n'est pas faite |
| F9 | Deux onglets/app à jongler, pas de synchro | Friction | 🟡 | Rafraîchissements manuels, charge mentale | Retour d'état de l'outil vers la commande / rafraîchissement auto |
| F10 | File de travail non priorisée dans la liste | Friction | 🟡 | On cherche « quoi produire maintenant » | Vue « À produire » par défaut, triée par ancienneté de paiement |
| F11 | Bruit visuel (champs techniques mêlés à l'utile) | Friction | 🟡 | Lecture plus lente | Séparer « infos client/production » et « détails techniques » |
| F12 | Pas de garde-fou « personnalisation insuffisante » | Risque | 🟠 | Livraison d'un audit trop pauvre | Signaler avant génération si données minimales absentes |
| F13 | Icône ✉️ cliquable dans la liste marque « envoyé » | Risque | 🟠 | Statut changé par mégarde | Séparer « ouvrir e-mail » et « marquer envoyé » |
| F14 | PDF non stocké (vit sur le disque opérateur) | Risque | 🟡 | Introuvable plus tard, pas de preuve | Archivage du PDF (V3) ; en attendant, convention de nommage stricte |

---

## 4. Manipulations inutiles à éliminer

Ce que l'opérateur fait aujourd'hui et qui ne crée aucune valeur :

- **Ressaisir l'activité** (F5) — donnée qui devrait suivre la commande.
- **Rafraîchir manuellement** la page commande pour voir le nouveau statut (F9).
- **Chercher le PDF dans les téléchargements** puis le joindre à la main (F1).
- **Réécrire l'e-mail de livraison** à chaque fois (F1) — devrait être un modèle pré-rempli.
- **Choisir la fiche Google** alors que l'URL exacte est déjà connue (F3).
- **Cliquer deux boutons « terminé »** qui font la même chose (F8/F19).
- **Passer par la liste** pour retrouver une commande qu'on vient de payer (F10).

---

## 5. Risques d'erreur, classés

**Critiques (peuvent partir chez un client) :**

- Audit produit sur la **mauvaise fiche** (homonyme, F3).
- **Mauvais PDF** joint / **mauvais destinataire** (F1).
- Statut **« envoyé » sans envoi réel** → client jamais livré, mais dossier « clos » (F2/F13).

**Élevés (dégradent la qualité ou bloquent) :**

- **Prérequis manquants** → échec d'analyse en cours de route (F4).
- **Scraping oublié** → audit sans concurrents/position (F6).
- **Audit trop pauvre** livré faute de garde-fou (F12).

**Moyens (perte de temps, confusion) :**

- Régression de statut par **misclick** (« Revenir à À faire », F7/F8).
- PDF **introuvable** a posteriori (F14).

---

## 6. Recommandations pour un parcours fluide

Priorisées par ratio valeur / effort. **Aucune ne demande de toucher au moteur de score ni au PDF** — ce sont des améliorations de séquence, de feedback et de garde-fous.

### Quick wins (gêne forte, effort faible)

1. **Feedback visuel sur chaque action de statut** (toast « ✔ enregistré », bouton désactivé le temps de l'appel). Supprime le doute (F7).
2. **Un seul fil de statut, ordonné et verrouillé** : `À produire → En cours → PDF généré → Vérifié → Envoyé → Clos`. Masquer/verrouiller l'étape suivante tant que la précédente n'est pas faite ; supprimer le doublon « terminé » (F8).
3. **Séparer « ouvrir l'e-mail » et « marquer envoyé »** dans la liste (F13).
4. **Modèle d'e-mail de livraison pré-rempli** (destinataire, objet, corps, rappel « joindre le PDF »). Réduit F1 sans automatiser l'envoi.
5. **Vue « À produire » par défaut** dans la liste, triée par date de paiement (F10).
6. **Regrouper les champs techniques** dans une zone repliable « détails Stripe » (F11).

### Améliorations structurantes (V2/V3, plus d'effort)

7. **Envoi assisté depuis le back-office** avec le PDF rattaché automatiquement au dossier → « envoyé » devient une preuve, pas une déclaration (F1/F2/F14).
8. **Enchaîner analyse Google + scraping** en une seule action « Analyser » (F6).
9. **Contrôle des prérequis à l'ouverture de l'outil** (connecteur, jeton, clé) avec message clair avant de commencer (F4).
10. **Résolution de la fiche via l'URL Google** transmise, avec confirmation explicite « c'est bien cette fiche ? » (F3).
11. **Garde-fou « personnalisation insuffisante »** : alerte avant génération si les données minimales manquent (F12).
12. **Capturer l'activité à l'achat** pour la pré-remplir (F5).

---

## 7. Le parcours cible (happy path fluide)

Ce à quoi devrait ressembler le parcours, une fois les quick wins appliqués :

1. Sonia ouvre le back-office sur la vue **« À produire »** ; la plus ancienne commande est en haut.
2. Elle clique la commande → **« Produire l'audit »**. L'outil s'ouvre **tout pré-rempli** (y compris activité), la fiche déjà résolue via l'URL, les prérequis vérifiés.
3. Elle clique **« Analyser »** (Google + scraping enchaînés). Elle contrôle les quelques points signalés.
4. Elle clique **« Générer »**. Le PDF est produit ; le dossier passe **automatiquement** à « PDF généré » côté back-office (pas de rafraîchissement manuel).
5. Elle clique **« Vérifier »** après un coup d'œil au PDF, puis **« Envoyer »** : l'e-mail part avec le bon modèle et le bon PDF ; le statut « Envoyé » est **prouvé**.
6. Le dossier se clôt. **~6 clics, 1 seule zone de saisie (les corrections), aucune manipulation de fichier.**

Objectif : passer de **~15-20 clics + 4 changements de contexte** à **~6 clics dans un seul flux**, en éliminant les deux ruptures manuelles (choix de fiche, livraison).

---

## 8. KPI UX à suivre

- **Nombre de clics par audit** (cible : ≤ 8).
- **Nombre de changements d'onglet/app** (cible : ≤ 2).
- **Taux de dossiers « envoyé » sans PDF enregistré** (cible : 0 % — détecte F2).
- **Taux de re-production** (audit refait pour mauvaise fiche / données — détecte F3/F6).
- **Temps entre « Produire » et « Envoyé »** (proxy de fluidité).
- **Taux d'erreur de livraison signalé** (mauvais fichier / destinataire).

---

## 9. En une phrase

**Le back-office produit déjà des audits, mais il fait confiance à l'opérateur là où il devrait le guider : les trois points à corriger en priorité sont la livraison manuelle (fiabiliser et prouver l'envoi), les statuts qui se chevauchent (un seul fil ordonné et verrouillé) et les deux ruptures manuelles (choix de la fiche, prérequis) — tout le reste n'est que feedback et priorisation.**
