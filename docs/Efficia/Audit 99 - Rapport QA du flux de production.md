---
titre: Rapport QA — flux de production de l'Audit 99 €
statut: actif
version_methode: v5
maj: 2026-07-17
refs: [Audit 99 - Roadmap MVP et backlog, Audit 99 - Audit UX du back-office de production, Pipeline d'analyse Efficia]
role: Rapport de contrôle — vérifier toute la chaîne, du paiement à la livraison, et statuer sur la capacité à vendre un premier audit. Aucun code modifié.
---

# Rapport QA — flux de production de l'Audit 99 €

> **Objectif :** simuler un client qui achète un Audit à 99 €, suivre le parcours jusqu'à la livraison, contrôler chaque étape (OK / Warning / Erreur) et statuer : *le système est-il prêt à vendre un premier audit à un vrai client ?*
>
> **Nature de l'audit :** vérification **statique du code** de la chaîne (parcours, contrats de données, points de rupture). Je n'ai pas exécuté de paiement Stripe réel ni appelé les endpoints déployés. Les points dépendant de la **configuration de production** (variables d'environnement, webhook enregistré chez Stripe, worker de scraping déployé, opérateur connecté) sont marqués **« à confirmer en réel »** et ne peuvent pas être validés depuis le code seul.

---

## 0. Vue d'ensemble

| Étape | Statut global | Commentaire |
|---|---|---|
| 1. Paiement Stripe | 🟢 OK (code) / 🟡 config à confirmer | Chemin `achat.html` complet ; MailerLite bloquant avant paiement. |
| 2. Webhook | 🟢 OK (code) / 🟡 config à confirmer | Commande + tâche idempotentes ; dépend du secret + événement enregistré. |
| 3. Back-office | 🟢 OK | Commande affichée, bouton « Produire l'audit » fonctionnel. |
| 4. Outil de production | 🟡 Warnings | Pré-remplissage OK sauf activité ; scraping et Google dépendent de prérequis opérateur. |
| 5. PDF | 🟠 Warning produit | Généré et nommé correctement, mais contenu = diagnostic gratuit (pages de vente) pour un client payant. |
| 6. Livraison | 🟡 Warnings | Envoi manuel possible ; statut « envoyé » non prouvé. |

**Aucun bug de code strictement bloquant** pour encaisser et livrer un premier audit, **à condition que la configuration de production soit correcte**. Le principal problème n'est pas technique mais **produit** : le PDF livré est encore le diagnostic gratuit.

---

## 1. Paiement Stripe

**Chemin réel vérifié :** les CTA d'offres d'`index.html` pointent vers `achat.html?offre=audit` → `purchase.js` → `POST /prepare-checkout`. C'est le bon chemin.

| Contrôle | Statut |
|---|---|
| Formulaire capture identité (nom, email, entreprise) + lien Google **ou** ville | 🟢 OK |
| Validation (offre connue, prix `price_`, email valide, entreprise requise) | 🟢 OK |
| Métadonnées Stripe transmises (`product_code`, `product_name`, `customer_name`, `company_name`, `google_business_url`, `city`, `source`) | 🟢 OK |
| Clés/prix Stripe configurés (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_AUDIT`) | 🟡 À confirmer en réel |
| Paiement accepté et redirection vers `paiement-reussi` | 🟡 À confirmer en réel |

**Warning 1.1 — MailerLite bloquant avant le paiement.**
- *Cause :* `prepare-checkout` enregistre le prospect dans MailerLite **avant** de créer la session Stripe ; si le groupe est introuvable ou l'API échoue, il renvoie 502 et **aucune session de paiement n'est créée**.
- *Impact :* une panne ou une mauvaise config MailerLite **bloque toutes les ventes**, alors que MailerLite n'est pas essentiel à l'encaissement.
- *Priorité :* **Haute.**
- *Solution :* rendre l'enregistrement MailerLite non bloquant à ce stade (tenter, journaliser, continuer vers Stripe même en cas d'échec) ; rattraper la synchro plus tard.

**Warning 1.2 — L'activité n'est pas capturée à l'achat.**
- *Cause :* le formulaire `achat.html` ne comporte pas de champ « activité / métier ».
- *Impact :* la commande ne porte pas l'activité → l'opérateur doit la saisir dans l'outil ; une activité imprécise dégrade le classement local et le benchmark.
- *Priorité :* **Moyenne.**
- *Solution :* ajouter un champ activité (ou catégorie) au formulaire d'achat et le propager en métadonnée.

**Warning 1.3 — Endpoint `/create-checkout-session` dormant mais actif.**
- *Cause :* cet endpoint (métadonnées pauvres : ni entreprise, ni ville, ni URL) existe toujours, `PAYMENTS_ENABLED = true`, mais **aucun bouton ne l'appelle** (aucun `data-checkout-product` dans les pages).
- *Impact :* nul aujourd'hui ; **piège futur** — si un lien pointe un jour dessus, il créera des commandes incomplètes.
- *Priorité :* **Faible.**
- *Solution :* désactiver ou supprimer cet endpoint, ou le faire converger vers `prepare-checkout`.

---

## 2. Webhook

| Contrôle | Statut |
|---|---|
| Vérification de signature HMAC Stripe | 🟢 OK |
| Création d'une commande (`orders`, statut `paid`) | 🟢 OK |
| Création d'une ligne de commande (`order_items`) | 🟢 OK |
| Création d'une tâche (`order_tasks`, statut `todo`, titre selon offre) | 🟢 OK |
| Idempotence (session rejouée → pas de doublon, `INSERT OR IGNORE`) | 🟢 OK |
| Échec de persistance → 500 volontaire pour rejouer | 🟢 OK |
| Déplacement MailerLite Prospect → Client, non bloquant | 🟢 OK |
| Secret webhook + événement `checkout.session.completed` enregistrés chez Stripe | 🟡 À confirmer en réel |

**Warning 2.1 — Dépendance à la configuration Stripe.**
- *Cause :* sans `STRIPE_WEBHOOK_SECRET` défini et sans webhook enregistré côté Stripe pour `checkout.session.completed`, aucun ordre n'est créé.
- *Impact :* **paiement encaissé mais aucune commande au back-office** → dossier invisible, client non livré. C'est le scénario le plus dangereux de toute la chaîne.
- *Priorité :* **Critique (config).**
- *Solution :* vérifier en réel qu'un paiement test crée bien une commande ; mettre en place une alerte si un paiement Stripe n'a pas d'ordre correspondant.

**Warning 2.2 — Mapping prix → offre à confirmer.**
- *Cause :* le webhook identifie le produit par `product_code` de métadonnée, sinon par Price ID (`STRIPE_PRICE_AUDIT`…). Un mauvais Price ID en environnement → produit non reconnu → 500 (rejeu).
- *Impact :* commande non créée tant que la config n'est pas juste.
- *Priorité :* **Haute (config).**
- *Solution :* vérifier la correspondance Price ID ↔ offre dans l'environnement de production.

---

## 3. Back-office

| Contrôle | Statut |
|---|---|
| Authentification admin (session signée, page login) | 🟢 OK |
| La commande apparaît dans la liste `/admin` | 🟢 OK |
| Filtres (recherche, statut, offre, environnement) | 🟢 OK |
| Détail commande : infos client (nom, entreprise, ville, email, offre, montant, dates) | 🟢 OK |
| Section « Production » : entreprise, ville, prénom, email, Order ID, Task ID, statut, PDF | 🟢 OK |
| Bouton « Produire l'audit » construit l'URL avec tous les paramètres (dont URL Google) | 🟢 OK |
| Bouton désactivé si aucune tâche liée | 🟢 OK |

**Warning 3.1 — Bouton inopérant si la tâche manque.**
- *Cause :* `Produire l'audit` n'est actif que si une tâche existe (créée par le webhook). Si le webhook a échoué (cf. 2.1), pas de tâche → bouton désactivé.
- *Impact :* l'opérateur ne peut pas produire ; symptôme d'un problème amont.
- *Priorité :* **Moyenne.**
- *Solution :* afficher un message explicite « aucune tâche — vérifier le webhook » plutôt qu'un bouton muet.

---

## 4. Outil de production

| Contrôle | Statut |
|---|---|
| Pré-remplissage entreprise / ville / contact | 🟢 OK |
| Pré-remplissage activité | 🔴 Absent (non transmis) |
| Affichage du contexte commande + lien fiche Google | 🟢 OK |
| Récupération Google (Places) | 🟡 Dépend de la clé API + désambiguïsation manuelle |
| Récupération Outscraper (scraping approfondi) | 🟡 Dépend du worker + jeton + clé Outscraper |
| Calcul du Score Efficia | 🟢 OK (inchangé) |
| Priorités (sélection dynamique) | 🟢 OK |
| Données concurrentielles (benchmark) | 🟡 Non garanties si le scraping échoue |

**Warning 4.1 — Activité à ressaisir.** (voir 1.2) — *Priorité Moyenne.*

**Warning 4.2 — Prérequis opérateur non vérifiés.**
- *Cause :* l'outil a besoin de l'URL du connecteur + jeton + clé API Google (mémorisés localement). Rien ne vérifie leur présence/validité avant de lancer.
- *Impact :* échec en cours d'analyse avec message technique ; perte de temps, confusion.
- *Priorité :* **Haute.**
- *Solution :* contrôle des prérequis à l'ouverture, message clair, et une procédure opérateur qui les fixe une fois pour toutes.

**Warning 4.3 — Désambiguïsation manuelle de la fiche.**
- *Cause :* la fiche est résolue par recherche nom + ville ; en cas d'homonymes, l'opérateur choisit à la main. L'URL Google transmise sert de lien d'aide, pas de résolution automatique.
- *Impact :* **risque d'audit sur la mauvaise entreprise** (erreur critique de crédibilité).
- *Priorité :* **Haute.**
- *Solution :* résoudre la fiche à partir de l'URL Google fournie + confirmation explicite.

**Warning 4.4 — Étape scraping distincte et oubliable.**
- *Cause :* « Analyser » (Google) et « Analyse approfondie » (Outscraper) sont deux actions séparées.
- *Impact :* sans le scraping, ni photos réelles, ni position, ni concurrents → audit appauvri.
- *Priorité :* **Moyenne.**
- *Solution :* enchaîner les deux, ou bloquer la génération tant que le scraping n'a pas tourné.

**Warning 4.5 — Benchmark concurrentiel non garanti.**
- *Cause :* si le scraping échoue ou renvoie des concurrents peu fiables, le PDF masque la comparaison.
- *Impact :* un audit **payant** peut sortir sans la donnée que le client ne peut pas obtenir seul (perte de valeur).
- *Priorité :* **Haute (produit).**
- *Solution :* garantir le benchmark (relevé manuel de secours), décision déjà actée dans la cartographie.

---

## 5. PDF

| Contrôle | Statut |
|---|---|
| Le PDF est généré (6 pages, contrôle de mise en page) | 🟢 OK |
| Nom de fichier normalisé `Score-Efficia_<Entreprise>_<Ville>_<AAAA-MM-JJ>_V<n>.pdf` | 🟢 OK |
| Nom enregistré côté back-office (`pdf_filename`) | 🟢 OK (si opérateur connecté, cf. 6.2) |
| Les données correspondent à la commande (entreprise/ville) | 🟢 OK (si fiche bien résolue, cf. 4.3) |
| Contenu digne d'un produit **payant** | 🟠 Non |

**Warning 5.1 — Le PDF livré est le diagnostic GRATUIT.**
- *Cause :* le rendu actuel est le diagnostic 6 pages, titré « Diagnostic Efficia™ », avec les pages de vente (teaser « 40 critères », deux cartes d'offres + boutons d'achat, comparatif DIY/Pack). Le développement `DEV-3` (version payante) n'est pas fait.
- *Impact :* un client qui a **payé 99 €** reçoit un document qui lui **revend l'audit** et se présente comme « gratuit ». Dissonance forte avec la promesse premium ; risque d'insatisfaction / remboursement.
- *Priorité :* **Haute (produit) — bloquant pour la promesse « premium », pas pour l'acte de vente.**
- *Solution :* appliquer `DEV-3` : retirer les blocs de vente, renommer « Audit », livrer l'ensemble des priorités.

**Warning 5.2 — Le PDF n'est pas archivé.**
- *Cause :* le fichier est téléchargé sur le poste de l'opérateur ; seul son nom est stocké.
- *Impact :* impossible de retrouver/prouver un livrable a posteriori ; risque d'envoyer le mauvais fichier.
- *Priorité :* **Moyenne** (acceptable en MVP, à traiter en V3).
- *Solution :* archivage du PDF ; en attendant, convention de nommage stricte respectée.

---

## 6. Livraison

| Contrôle | Statut |
|---|---|
| L'e-mail manuel peut être envoyé (PDF téléchargé + Gmail) | 🟢 OK (manuel) |
| Statut `pdf_generated` mis à jour automatiquement depuis l'outil | 🟡 Conditionné à une session admin active |
| Statuts `pdf_reviewed` / `sent` / `completed` mis à jour depuis le back-office | 🟢 OK |
| Preuve d'envoi réelle | 🔴 Absente |

**Warning 6.1 — Livraison entièrement manuelle.**
- *Cause :* pas d'envoi assisté ; l'opérateur récupère le PDF, rédige l'e-mail, joint le fichier.
- *Impact :* risque de mauvais fichier / mauvais destinataire / oubli ; pas de modèle.
- *Priorité :* **Haute (UX/risque).**
- *Solution :* modèle d'e-mail pré-rempli (quick win) ; envoi assisté avec PDF rattaché (V2).

**Warning 6.2 — Mise à jour `pdf_generated` silencieuse si non connecté.**
- *Cause :* l'outil met à jour le statut via `PATCH /admin/tasks/:id`, qui exige une session admin dans le même navigateur ; sinon 401 silencieux.
- *Impact :* PDF produit mais statut resté à `in_progress` → suivi faussé.
- *Priorité :* **Moyenne.**
- *Solution :* signaler à l'opérateur si la mise à jour a échoué (feedback), s'assurer qu'il est connecté.

**Warning 6.3 — Statut « envoyé » déclaratif.**
- *Cause :* « Marquer audit envoyé » (et l'icône ✉️ de la liste) posent le statut sans preuve d'envoi.
- *Impact :* un dossier peut être « clos » sans que le client ait reçu quoi que ce soit.
- *Priorité :* **Haute.**
- *Solution :* lier le statut « envoyé » à l'acte d'envoi (V2) ; à défaut, discipline opérateur + note.

---

## 7. Synthèse

### 7.1 Checklist complète

- 🟢 Le paiement 99 € est correctement câblé (chemin `achat.html`) — *config Stripe à confirmer en réel.*
- 🟢 Les métadonnées (entreprise, ville, URL Google, offre) sont transmises.
- 🟢 Le webhook crée commande + tâche, de façon idempotente — *secret + événement à confirmer en réel.*
- 🟢 La commande apparaît au back-office avec toutes les infos.
- 🟢 Le bouton « Produire l'audit » ouvre l'outil pré-rempli (sauf activité).
- 🟢 Le Score Efficia, les priorités et le PDF sont générés.
- 🟢 Le PDF est nommé et rattaché à la commande.
- 🟡 L'activité n'est pas transmise (ressaisie).
- 🟡 Google/Outscraper dépendent de prérequis opérateur non vérifiés.
- 🟡 Le benchmark n'est pas garanti.
- 🟠 Le PDF livré est le diagnostic gratuit (pages de vente).
- 🟡 La livraison est manuelle, le statut « envoyé » non prouvé.
- 🟡 Le PDF n'est pas archivé.

### 7.2 Bugs bloquants

Au sens strict « empêche de vendre/livrer un premier audit » :

1. **(Config) Webhook non opérationnel** → paiement sans commande (2.1/2.2). **Bloquant tant que non vérifié en réel.**
2. **(Produit) PDF = diagnostic gratuit avec pages de vente** (5.1). **Bloquant pour la promesse premium** : livrable non conforme à ce qu'on vend 99 €.

*Aucun autre bug ne bloque l'acte technique de vente/livraison.*

### 7.3 Bugs mineurs

- Endpoint `/create-checkout-session` dormant (1.3).
- Bouton « Produire » muet si tâche absente (3.1).
- Mise à jour de statut silencieuse si non connecté (6.2).

### 7.4 Améliorations UX

- Modèle d'e-mail de livraison pré-rempli.
- Feedback visuel sur les changements de statut.
- Un seul fil de statut ordonné et verrouillé.
- Vue « À produire » priorisée.
- Contrôle des prérequis à l'ouverture de l'outil.
*(Détail complet : « Audit UX du back-office de production ».)*

### 7.5 Améliorations produit

- **`DEV-3` : PDF payant** (retirer la vente, renommer « Audit », livrer toutes les priorités) — priorité n°1.
- Benchmark concurrentiel garanti et nommé.
- Capturer l'activité à l'achat.

### 7.6 Améliorations techniques

- Rendre MailerLite non bloquant à l'achat (1.1).
- Alerte « paiement sans commande » (réconciliation Stripe ↔ `orders`).
- Résolution de la fiche via l'URL Google (fiabilité, 4.3).
- Archivage du PDF (5.2).
- Retirer/rediriger `/create-checkout-session` (1.3).

---

## 8. Conclusion — le système est-il prêt à vendre un premier audit ?

**Techniquement : oui, sous conditions.** La chaîne est complète et cohérente dans le code — paiement, webhook, commande, tâche, back-office, production, PDF, suivi. **Deux vérifications de configuration doivent être faites en conditions réelles avant toute vente** : (1) qu'un paiement test crée bien une commande (webhook opérationnel), (2) que les prérequis de l'outil (connecteur, jeton, clé Google) sont en place. Ce sont des vérifications de déploiement, pas des développements.

**Sur la promesse « premium » : pas encore.** Le seul vrai obstacle produit est le **PDF, qui reste le diagnostic gratuit avec ses pages de vente**. Livrer ce document à un client ayant payé 99 € crée une dissonance qui menace la satisfaction et invite au remboursement. **`DEV-3` (PDF payant) doit être fait avant la première vente réelle.**

**Recommandation :** avant de vendre le premier audit, traiter dans l'ordre : (1) confirmer le webhook en réel, (2) faire `DEV-3` (PDF payant), (3) fixer les prérequis opérateur + un modèle d'e-mail de livraison. Avec ces trois points, le système est prêt à livrer un premier audit crédible à un vrai client. Les autres améliorations (envoi assisté, benchmark garanti, activité à l'achat, archivage) relèvent de la V2 et **ne doivent pas retarder le lancement**.

> **En une phrase :** la machine est prête à encaisser et livrer ; il reste à **prouver le webhook en réel** et à **cesser de livrer le PDF gratuit à un client payant** — deux actions ciblées, pas un chantier.
