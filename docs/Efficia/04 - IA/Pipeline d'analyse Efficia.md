---
id: IA-003
titre: Pipeline d'analyse Efficia — spécification fonctionnelle
statut: actif
version_methode: v5
maj: 2026-07-17
refs: [IA-002, IA-004, REF-CTL, REF-SEC, MET-001, VIS-003]
---

# Pipeline d'analyse Efficia™ — spécification fonctionnelle

> **Rôle unique :** décrire fonctionnellement chaque étape du traitement d'un audit, depuis la saisie de l'URL Google Business (ou l'arrivée d'une commande payée) jusqu'à l'enregistrement final en base et la génération du PDF. Aucun code : les faits de la méthode vivent dans `03 - Référentiel`, les variables dans `Variables.md`, les critères de qualité dans `Génération des audits.md`.

Chaque étape est décrite selon six axes constants : **objectif**, **entrées**, **sorties**, **erreurs possibles**, **composants impliqués**, **données persistées**.

---

## Vue d'ensemble

```
   Entrée A : prospection            Entrée B : commande payée
   (opérateur saisit l'URL)          (site → Stripe → webhook → tâche)
            │                                   │
            └───────────────┬───────────────────┘
                            ▼
   P1 Saisie & qualification ─► P2 Analyse Google ─► P3 Collecte scraping
                            │
   P4 Normalisation ─► P5 Scoring ─► P6 Sélection ─► P7 Rédaction (IA)
                            │
   P8 Contrôle qualité ─► P9 Génération PDF ─► P10 Revue ─► P11 Livraison
                            │
                     P12 Enregistrement final & archivage
```

### Composants du système

| Composant | Rôle dans le pipeline |
|---|---|
| **Site public** (`achat.html`, `index.html`) | Point d'entrée des commandes ; formulaire d'identité + choix d'offre. |
| **`prepare-checkout`** (Pages Function) | Valide l'identité, enregistre le prospect dans MailerLite (groupe « paiement en cours »), crée la session Stripe Checkout. |
| **Stripe** | Paiement ; source de vérité du « payé ». Renvoie vers `paiement-reussi.html`. |
| **`stripe-webhook`** (Pages Function) | Vérifie la signature, transforme un paiement en **commande + tâche de production**, déplace le contact du groupe Prospect vers le groupe Client MailerLite. |
| **Back-office admin** (`admin*.html`, `functions/admin/*`) | Pilotage : liste des commandes/tâches, suivi de production, mise à jour des statuts. Protégé par session signée. |
| **Outil de score** (`outil-score-efficia-auto-v5.html`) | Poste de travail de l'opérateur : analyse Google, scraping, scoring, rédaction, génération du PDF. |
| **API Google (Places / Maps JS)** | Première source publique : fiche, note, avis visibles, catégories, photos, horaires. |
| **Worker de scraping** (`efficia-scraping-worker`) | Connecteur privé : collecte approfondie via Outscraper + archivage dans `efficia_knowledge_base`. |
| **Outscraper** | Source de scraping : revendication, comptage réel des photos, description, réponses aux avis, classement local, concurrents. |
| **D1 `efficia_knowledge_base`** (binding `DB`) | Dossiers d'analyse : entreprises, audits, métriques, critères, concurrents, versions PDF, recommandations, agrégats du moteur de connaissance. |
| **D1 `efficia_orders`** (binding `ORDERS_DB`) | Commandes, lignes de commande, tâches de production et suivi PDF. |
| **IA** | Rédaction assistée des audits, encadrée par les prompts et le référentiel. |
| **Générateur PDF** (jsPDF + html2canvas, navigateur) | Rendu du livrable final, 6 pages A4. |
| **MailerLite** | Segmentation e-mail : groupes Prospects / Clients par offre, séquences de suivi. |

### Les deux bases, trois sources de vérité disjointes

- **Le paiement fait foi chez Stripe.**
- **La production fait foi dans `efficia_orders`** (commande, tâche, statuts, horodatages PDF).
- **L'analyse fait foi dans `efficia_knowledge_base`** (données collectées, scores, versions d'audit).

Aucun chevauchement : une donnée n'est maître que dans une seule base.

### États d'un dossier

**Analyse (`efficia_knowledge_base.audits.status`) :** `provisional` → `completed`.

**Production (`efficia_orders.order_tasks.status`) :** `todo` → `in_progress` → `waiting` → `pdf_generated` → `pdf_reviewed` → `sent` → `completed`.

Tout retour en arrière (donnée corrigée, contrôle qualité refusé) ramène le dossier à l'étape correspondante et invalide les états suivants.

### Principes transversaux

- **Donnée absente = valeur nulle, jamais un faux zéro.**
- **Idempotence.** Un webhook rejoué ne crée jamais deux commandes ; une finalisation d'audit rejouée ne crée aucun doublon.
- **Dégradation gracieuse.** Un échec d'archivage n'efface jamais une donnée déjà obtenue (scraping, PDF).
- **Traçabilité.** Chaque PDF est relié à une version d'analyse (V*n*), une version de méthode (v5) et des horodatages.
- **Sécurité.** Webhook signé (HMAC Stripe), Worker protégé par jeton Bearer, back-office protégé par cookie de session signé, requêtes SQL préparées.

---

## P0 — Origine du dossier

Un audit naît par l'un de deux chemins. Les deux convergent vers P1.

### Entrée A — Prospection sortante

- **Objectif :** créer un dossier de diagnostic gratuit pour démarcher un prospect.
- **Entrées :** URL (ou nom) de la fiche Google Business repérée par l'opérateur.
- **Sorties :** dossier prospect, ouvert directement dans l'outil de score.
- **Erreurs possibles :** fiche introuvable ou homonymes → l'opérateur confirme la bonne fiche avant de poursuivre.
- **Composants :** Outil de score.
- **Données persistées :** aucune à ce stade (tout est en mémoire du navigateur) ; l'identité alimentera `businesses` lors de l'archivage (P3).

### Entrée B — Commande payée

Trois sous-étapes : préparation du paiement, paiement, webhook.

#### P0.1 — Préparation du paiement (`prepare-checkout`)

- **Objectif :** capturer l'identité de l'acheteur, l'enregistrer comme prospect « paiement en cours », puis ouvrir Stripe Checkout.
- **Entrées :** payload du formulaire d'achat — `product` (`audit` / `visibility` / `performance`), `full_name`, `email`, `company_name`, et **soit** `google_business_url` **soit** `city` (si le lien est déclaré inconnu via `unknown_google_business`).
- **Traitement :** validation stricte (offre connue, prix Stripe configuré au format `price_`, e-mail valide, entreprise et nom présents, lien Google **ou** ville selon le cas) ; enregistrement du prospect dans MailerLite (groupe « Prospects - {offre} (paiement en cours) ») avec ses champs (prénom, nom, entreprise, ville, lien Google, offre choisie, statut « paiement en cours ») ; création de la session Stripe Checkout avec métadonnées (`product_code`, `product_name`, `customer_name`, `company_name`, `google_business_url`, `city`, `source`).
- **Sorties :** URL de paiement Stripe renvoyée au navigateur ; prospect présent dans MailerLite.
- **Erreurs possibles :** offre inconnue (`INVALID_PRODUCT`, 400) ; prix manquant/mal formé (`MISSING_STRIPE_PRICE` / `INVALID_STRIPE_PRICE_FORMAT`, 400) ; champs d'identité manquants (400) ; échec MailerLite (502, **bloquant ici** : pas de session Stripe sans prospect enregistré) ; échec de création Stripe (`STRIPE_CHECKOUT_FAILED`, 502).
- **Composants :** Site public, `prepare-checkout`, MailerLite, Stripe.
- **Données persistées :** **MailerLite uniquement** (prospect + champs + groupe « paiement en cours »). Rien encore en D1 : tant que le paiement n'est pas confirmé, il n'existe pas de commande.

#### P0.2 — Paiement (Stripe)

- **Objectif :** encaisser et confirmer le paiement.
- **Entrées :** session Checkout ouverte (P0.1).
- **Sorties :** en cas de succès, redirection vers `paiement-reussi.html?session_id=…` et émission de l'événement `checkout.session.completed`.
- **Erreurs possibles :** paiement échoué (`payment_intent.payment_failed`) ou paiement asynchrone échoué (`checkout.session.async_payment_failed`) → journalisés, aucune commande créée ; le prospect reste dans le groupe « paiement en cours ».
- **Composants :** Stripe, Site public.
- **Données persistées :** côté Stripe uniquement (source de vérité du paiement).

#### P0.3 — Transformation en commande + tâche (`stripe-webhook`)

- **Objectif :** transformer un paiement confirmé en dossier de production, sans intervention manuelle, de façon idempotente.
- **Entrées :** requête webhook Stripe signée (`Stripe-Signature`) portant l'événement `checkout.session.completed` (offre, e-mail, métadonnées de P0.1).
- **Traitement :** vérification de la signature HMAC (rejet si invalide) ; identification du produit (par `product_code` de métadonnée, sinon par Price ID) ; création de la commande, de la ligne de commande et de la tâche de production en `INSERT OR IGNORE` (un même `stripe_session_id` ne crée jamais deux commandes ; un même `(order_id, task_type)` ne crée jamais deux tâches) ; puis déplacement MailerLite : retrait du groupe Prospect, ajout au groupe Client « Clients - {offre} ».
- **Sorties :** commande à l'état `paid` ; tâche de production à l'état `todo` (« Audit à réaliser », « Optimisation Google à réaliser », « Pack Performance à réaliser ») ; contact déplacé dans le groupe Client.
- **Erreurs possibles :** signature invalide (400) ; corps non-JSON (400) ; secret webhook absent (500) ; **échec de persistance de la commande → réponse 500 volontaire pour que Stripe rejoue le webhook** (garantie de non-perte) ; métadonnées incomplètes (URL absente → commande créée quand même, à qualifier) ; **échec MailerLite non bloquant** (la commande est créée, la synchronisation e-mail est seulement journalisée).
- **Composants :** Stripe, `stripe-webhook`, D1 `efficia_orders`, MailerLite.
- **Données persistées (`efficia_orders`) :**
  - `orders` : `order_id`, `stripe_session_id` (unique), `stripe_payment_intent_id`, `email`, `first_name`, `customer_name`, `company_name`, `city`, `google_business_url`, `offer_code`, `offer_name`, `amount_total`, `currency`, `status = paid`, `paid_at`, horodatages, `raw_metadata`.
  - `order_items` : `order_item_id`, `order_id`, `stripe_price_id`, `offer_code`, `offer_name`, `quantity`, `amount_total`, `currency`.
  - `order_tasks` : `task_id`, `order_id`, `task_type`, `title`, `status = todo`, `offer_code`, horodatages (les colonnes `pdf_filename`, `pdf_generated_at`, `pdf_reviewed_at`, `sent_at` restent vides jusqu'aux étapes P9-P11).

---

## P1 — Saisie et qualification

- **Objectif :** constituer l'identité complète du dossier et choisir le cadre d'analyse.
- **Entrées :** URL de la fiche ; nom de l'entreprise ; ville ; activité (sert à construire la recherche locale testée) ; prénom du contact (personnalisation) ; profil sectoriel (détecté par mots-clés, corrigeable — voir `Secteurs.md`). Pour l'entrée B, ces champs sont pré-remplis depuis le contexte de commande transmis à l'outil (entreprise, ville, contact, `orderId`, `taskId`).
- **Sorties :** dossier qualifié : identité + profil SEC retenu + recherche locale à tester (`activité + ville`).
- **Erreurs possibles :** activité absente ou vague → le test de classement (P3) perd sa pertinence ; ville absente → personnalisation dégradée ; mauvaise détection sectorielle → pondérations inadaptées (l'opérateur valide le profil affiché).
- **Composants :** Outil de score ; Back-office (contexte de commande).
- **Données persistées :** aucune en base à ce stade ; l'identité et le profil seront écrits lors de l'archivage (P3) et de la finalisation (P5-P9).

---

## P2 — Analyse automatique (API Google)

- **Objectif :** remplir automatiquement le maximum de critères à partir des données publiques directement lisibles via Google.
- **Entrées :** fiche sélectionnée + clé API Google (saisie et conservée localement par l'opérateur).
- **Traitement :** recherche de la fiche (`Place.searchByText`) ; si plusieurs candidats, l'opérateur choisit ; relevé des champs Places (note, avis visibles, photos, catégorie principale, horaires, site, téléphone) ; cochage automatique ou marquage « à vérifier » / « pré-rempli » des critères.
- **Sorties :** données observées en mémoire ; critères partiellement remplis ; message indiquant le nombre de critères automatiques.
- **Erreurs possibles :** clé absente/invalide → arrêt ; aucune fiche trouvée → message ; plusieurs fiches → choix manuel (jamais d'auto-sélection) ; quota Google → analyse auto dégradée, saisie manuelle possible.
- **Composants :** Outil de score, API Google Places.
- **Données persistées :** aucune persistance directe ; les valeurs alimentent `audit_metrics` lors de l'archivage.

---

## P3 — Collecte approfondie (scraping) et audit provisoire

- **Objectif :** compléter Google avec ce qu'il n'expose pas (revendication, comptage réel des photos, longueur de description, réponses du propriétaire, lien de réservation, classement local, concurrents), et **créer l'audit provisoire** en base.
- **Entrées :** dossier qualifié (nom, ville, activité) + jeton du connecteur. La route `GET /` du Worker déclenche le scraping ; `POST /audit/provisional` couvre les audits manuels/tests sans scraping.
- **Traitement (Worker) :** authentification Bearer ; trois relevés Outscraper (fiche ; avis récents avec réponses propriétaire et date du dernier avis ; classement local + jusqu'à 3 concurrents) ; chaque appel externe est retenté (3 tentatives, backoff) en cas d'erreur transitoire (statuts ≥ 500, dont 530, ou réponse illisible) ; résolution ou création de l'entreprise (par `place_id`, puis `google_id`, puis nom+ville normalisés — jamais de doublon) ; création de l'audit `provisional` avec une **version d'analyse** (V1, V2…) ; écriture des métriques observées et des concurrents ; mise à jour du moteur de connaissance (agrégats d'observations).
- **Sorties :** réponse enrichie (`fiche`, `avis`, `position`, `concurrents`, `requete`, `auditPublicId`, `analysisVersion`, `knowledgeBase.saved`) ; dossier à l'état d'analyse `provisional`.
- **Erreurs possibles :** 401 (jeton) ; 400 (paramètres manquants/trop longs) ; 404 (fiche introuvable) ; 500 (clé Outscraper absente ou erreur connecteur) ; Outscraper indisponible après 3 tentatives → erreur transitoire, à réessayer ; **échec D1 → le scraping est quand même renvoyé avec `knowledgeBase.saved = false`** (jamais de perte).
- **Composants :** Outil de score, Worker de scraping, Outscraper, D1 `efficia_knowledge_base`, Moteur de connaissance.
- **Données persistées (`efficia_knowledge_base`) :**
  - `businesses` : `place_id`, `google_id`, `name`, `normalized_name`, `city`, `normalized_city`, `primary_category`, `address_public`.
  - `audits` : `public_id`, `business_id`, `audit_date`, `status = provisional`, `worker_version`, `scoring_version`, `tested_query`, identité demandée, `source`, `environment`, `order_id`.
  - `audit_metrics` : une ligne par métrique observée (note, avis, photos, longueur de description, revendication, position locale, réponses propriétaire, date du dernier avis, avis analysés, sous-catégories, jours d'ouverture, nombre de concurrents), avec `source`, `verification_status`, `confidence` ; unicité `(audit_id, metric_key)`.
  - `audit_competitors` : concurrents publics (nom, note, avis, photos, position) ; unicité `(audit_id, place_id)`.
  - `knowledge_stats` : agrégats d'observations (voir P3.b).
  - **Jamais stockés :** contenu complet des avis, noms des auteurs, e-mail/nom du prospect, jeton, clé Outscraper, données privées.

### P3.b — Moteur de connaissance (observations)

- **Objectif :** agréger les observations publiques pour éviter de recalculer toute la base et préparer les comparaisons sectorielles / locales.
- **Traitement :** pour les scopes `global`, `city`, `google_category` (et `sector` après finalisation), mise à jour incrémentale de `photos_count`, `reviews_count`, `rating`, `description_length`, `competitors_count`, `local_position`.
- **Erreurs possibles :** **non bloquantes** — toute erreur du moteur est journalisée sans faire échouer l'audit ; les valeurs non finies sont ignorées.
- **Données persistées :** `knowledge_stats` — clé `(scope_type, scope_key, metric_key)`, avec `sample_count`, `value_sum`, `value_avg`, `value_min`, `value_max`, `best_value`.

---

## P4 — Normalisation et complétion

- **Objectif :** transformer les données brutes en variables canoniques fiables, et assumer explicitement l'inconnu.
- **Entrées :** données brutes (P2-P3) + compléments manuels de l'opérateur.
- **Traitement :** mapping vers le dictionnaire (`Variables.md`) ; chaque variable prend l'un de trois statuts — **présente** (observée), **absente-assumée** (texte de repli), **confirmée manuellement** (critères invérifiables de l'extérieur). Rien n'est deviné (principe P-01). **Règle des 5 données minimales :** sans position observée, note + volume d'avis, volume d'avis des concurrents, nombre de photos et longueur de description, le dossier est marqué « personnalisation insuffisante » et signalé avant toute livraison.
- **Sorties :** dossier normalisé.
- **Erreurs possibles :** valeurs incohérentes entre relevés → la plus récente fait foi, l'écart est journalisé ; unité/format inattendu → variable rejetée plutôt que devinée.
- **Composants :** Outil de score, D1 `efficia_knowledge_base`.
- **Données persistées :** variables normalisées avec statut et provenance ; ces valeurs sont transmises à la finalisation via `manual_overrides_json`.

---

## P5 — Scoring

- **Objectif :** produire une évaluation chiffrée, honnête et reproductible.
- **Entrées :** dossier normalisé + profil sectoriel.
- **Traitement :** chaque point de contrôle (CTL) est évalué — conforme / à améliorer / prioritaire / à confirmer — selon ses seuils ; pondération par le profil SEC ; agrégation en score global /100, scores par domaine et trois sous-scores prospect (Visibilité, Confiance, Conversion) ; rattachement à une bande d'interprétation. Les critères « à confirmer » sont **exclus du calcul**.
- **Sorties :** grille complète des statuts + scores.
- **Erreurs possibles :** trop de critères non évaluables → score fragile, signalé ; profil manquant → profil générique appliqué et mentionné.
- **Composants :** moteur de scoring (outil de score), D1 `efficia_knowledge_base`.
- **Données persistées (à la finalisation, P9) :** résultat de chaque contrôle (`audit_criteria`), scores agrégés (`audits` + `audit_versions`), version de méthode et version d'analyse.

---

## P6 — Sélection éditoriale

- **Objectif :** décider ce que le rapport dira — forces, trois priorités, angle du récit.
- **Entrées :** grille scorée (P5) + variables (P4).
- **Traitement :** identification des **forces** (contrôles au maximum) ; regroupement des pertes de points par **familles** ; choix des **3 priorités** par score de sélection (points perdus × impact × réparabilité) ; choix de l'**angle** (sous-score prospect le plus faible) ; calcul de la **projection** de score après correction des seuls critères maîtrisables, et du temps de correction en autonomie.
- **Règle de cohérence (bloquante) :** une donnée présentée comme avantage ne peut jamais être présentée comme manque ailleurs ; la priorité vise la dimension réellement défaillante.
- **Sorties :** plan éditorial (forces, priorités ordonnées, angle, projection).
- **Erreurs possibles :** aucune priorité significative (fiche excellente) → gabarits de consolidation ; contradictions détectées → sélection recalculée, jamais livrée en l'état.
- **Composants :** moteur de sélection (outil de score).
- **Données persistées :** recommandations retenues (`audit_recommendations`, à la finalisation).

---

## P7 — Assemblage et rédaction

- **Objectif :** produire le contenu du livrable, personnalisé et conforme à la méthode.
- **Entrées :** plan éditorial (P6), variables (P4), gabarit du livrable, et pour la rédaction assistée le bundle IA (référentiel filtré par secteur + règles de rédaction + exemples gelés — voir `Génération des audits.md`).
- **Traitement :** remplissage de chaque section ; les constats citent les valeurs observées **via variables (jamais de chiffre en dur)** ; chaque texte a une version chiffrée et un texte de repli ; vocabulaire sectorisé ; structure d'une priorité : *Ce que nous avons observé → Ce que voit un prospect → Première action + Résultat attendu*.
- **Sorties :** rapport complet rédigé.
- **Erreurs possibles :** chiffre IA non traçable vers une variable → rejet ; texte de repli manquant → section signalée ; dépassement du gabarit → reformulation courte exigée.
- **Composants :** IA (prompts), gabarits, référentiel.
- **Données persistées :** contenu généré + identifiants des OBS/REC utilisées + version des prompts (dans `manual_overrides_json` / recommandations).

---

## P8 — Contrôle qualité

- **Objectif :** garantir qu'aucun rapport contradictoire, non sourcé ou générique ne parte chez un prospect.
- **Entrées :** rapport rédigé (P7).
- **Traitement :** deux niveaux — **automatique** (critères d'acceptation de `Génération des audits.md` : zéro contradiction interne, zéro statistique non sourcée, tout chiffre traçable, aucune page débordante) ; **humain obligatoire** (relecture par l'opérateur, horodatée).
- **Sorties :** rapport contrôlé — ou renvoi motivé vers P6/P7.
- **Erreurs possibles :** refus → le dossier redescend à l'étape fautive, les états suivants sont invalidés.
- **Composants :** Back-office (revue), contrôles automatiques de l'outil.
- **Données persistées :** motifs de refus le cas échéant ; la revue formelle est tracée en P10 (`pdf_reviewed_at`).

---

## P9 — Génération du PDF et finalisation de l'audit

- **Objectif :** produire le livrable final et enregistrer définitivement l'audit (scores, critères, recommandations, version PDF).
- **Entrées :** rapport contrôlé (P8) + **version d'analyse** (bloquant : pas de version, pas de PDF ; à défaut d'`auditPublicId`, un audit provisoire est créé au préalable).
- **Traitement :** contrôle de mise en page (exactement 6 pages, contenu ne débordant pas le pied de page) ; rendu A4 page par page (jsPDF + html2canvas) avec liens cliquables ; nommage normalisé `Score-Efficia_<Entreprise>_<Ville>_<AAAA-MM-JJ>_V<n>.pdf` ; **appel `POST /audit/:publicId/complete`** (idempotent) qui passe l'audit en `completed` et écrit critères, métriques finales, concurrents, recommandations, et la ligne de version PDF ; **mise à jour du back-office** via `PATCH /admin/tasks/:taskId` avec le statut `pdf_generated` et le `pdf_filename`.
- **Sorties :** fichier PDF ; audit `completed` ; tâche de production à `pdf_generated`.
- **Erreurs possibles :** nombre de pages ≠ 6 ou débordement → génération interrompue ; librairies PDF indisponibles → repli sur l'aperçu ; version d'analyse absente et connecteur manquant → PDF généré mais « archivage D1 non confirmé » ; `POST complete` : 401 / 400 / 404 / 500 ; double appel → idempotent, aucun doublon ; back-office injoignable → PDF conservé, statut non mis à jour (message d'avertissement).
- **Composants :** Outil de score, Générateur PDF, Worker de scraping, D1 `efficia_knowledge_base`, D1 `efficia_orders`, Back-office.
- **Données persistées :**
  - `efficia_knowledge_base` : `audits` → `completed`, scores, `completed_at` ; `audit_versions` (`version_number`, scores, `pdf_filename`, `audit_status`, `environment`, `source`, `order_id`, `manual_overrides_json`, `generated_at`) ; `audit_criteria` (`points_awarded`, `max_points`, `evaluation_status`, `verification_status`) ; `audit_metrics` finales + métriques internes de classement (`rank_*`, `percentile_*`, `sample_count_*`) ; `audit_recommendations` ; `knowledge_stats` (scores agrégés — une seule fois si l'audit n'était pas déjà `completed`).
  - `efficia_orders` : `order_tasks.pdf_filename`, `order_tasks.pdf_generated_at`, `status = pdf_generated`.

---

## P10 — Revue de production

- **Objectif :** valider que le PDF généré est conforme avant envoi.
- **Entrées :** PDF généré (P9), tâche à `pdf_generated`.
- **Traitement :** relecture finale par l'opérateur dans le back-office ; passage de la tâche à `pdf_reviewed`.
- **Sorties :** tâche prête à l'envoi — ou retour à P6/P7/P9 si refus.
- **Erreurs possibles :** anomalie détectée → régénération, la date de revue précédente est invalidée.
- **Composants :** Back-office, D1 `efficia_orders`.
- **Données persistées :** `order_tasks.status = pdf_reviewed`, `order_tasks.pdf_reviewed_at`.

---

## P11 — Livraison et suivi

- **Objectif :** remettre le livrable au bon destinataire, tracer l'envoi, déclencher la suite commerciale.
- **Entrées :** PDF revu (P10), coordonnées du contact (commande ou prospect).
- **Traitement :** envoi par e-mail ; pour un diagnostic, les boutons du PDF portent les URL de conversion (audit 99 € / pack 349 €) ; passage de la tâche à `sent` ; le contact est maintenu dans le bon groupe MailerLite (prospect diagnostiqué, client audit, client pack) pour les séquences de suivi. Pour un Pack, les optimisations sont **validées par le client avant toute publication** (principe P-05).
- **Sorties :** livrable remis ; engagement tenu (Audit : rapport sous 24 h ouvrées).
- **Erreurs possibles :** e-mail invalide/non délivré → relance via une autre coordonnée, signalement ; tâche `sent` sans date d'envoi = anomalie visible au back-office.
- **Composants :** e-mail, MailerLite, Back-office, D1 `efficia_orders`.
- **Données persistées :** `order_tasks.status = sent`, `order_tasks.sent_at` ; groupe MailerLite du contact.

---

## P12 — Enregistrement final et archivage

- **Objectif :** clore le dossier en le laissant rejouable et justifiable — n'importe quel PDF émis doit pouvoir être expliqué des années plus tard.
- **Entrées :** dossier envoyé (P11).
- **Traitement :** consolidation du dossier complet — données collectées, variables, grille scorée, plan éditorial, contenu, PDF, horodatages — relié à ses versions (analyse V*n*, méthode v5, prompts). En cas d'achat ultérieur, l'audit payant repart de ce dossier dans la même version d'analyse ; la tâche passe à `completed`.
- **Sorties :** dossier clos (ou converti si une commande a suivi).
- **Erreurs possibles :** dossier incomplet à la clôture (PDF sans grille, envoi sans PDF) → anomalie bloquante remontée au back-office.
- **Composants :** D1 `efficia_knowledge_base`, D1 `efficia_orders`, archives documentaires (05).
- **Données persistées :** `order_tasks.status = completed`, `completed_at` ; l'ensemble des lignes `efficia_knowledge_base` reste la trace justificative.

---

## Récapitulatif de la persistance

### `efficia_knowledge_base` (analyse)

| Table | Contenu | Écrite en | Clé anti-doublon |
|---|---|---|---|
| `businesses` | Entreprise publique | P3 | `place_id`, `google_id`, (`normalized_name`+`normalized_city`) |
| `audits` | Audit (provisoire → complété) | P3, P9 | `public_id` |
| `audit_metrics` | Métriques observées + internes | P3, P9 | `(audit_id, metric_key)` |
| `audit_criteria` | Critères évalués | P9 | `(audit_id, criterion_key)` |
| `audit_competitors` | Concurrents publics | P3, P9 | `(audit_id, place_id)` |
| `audit_versions` | Version PDF d'un audit | P9 | `(audit_id, version_number)` |
| `audit_recommendations` | Recommandations retenues | P9 | `(audit_id, version_number, recommendation_key)` |
| `knowledge_stats` | Agrégats du moteur de connaissance | P3, P9 | `(scope_type, scope_key, metric_key)` |

### `efficia_orders` (production)

| Table | Contenu | Écrite en | Clé anti-doublon |
|---|---|---|---|
| `orders` | Commande payée | P0.3 | `order_id`, `stripe_session_id` |
| `order_items` | Ligne de commande | P0.3 | `(order_id, stripe_price_id, offer_code)` |
| `order_tasks` | Tâche de production + suivi PDF | P0.3, P9–P12 | `(order_id, task_type)` |

**Jamais stockés en D1 :** contenu complet des avis, noms des auteurs d'avis, jeton du connecteur, clé Outscraper, secrets Stripe/MailerLite, données privées non publiques.

---

## Matrice erreurs → comportement attendu

| Situation | Comportement | Donnée perdue ? |
|---|---|---|
| Signature webhook Stripe invalide | 400, rejet | Non — Stripe rejoue |
| Échec de persistance de la commande | 500 volontaire | **Non — Stripe rejoue le webhook** |
| Webhook rejoué (doublon) | `INSERT OR IGNORE`, aucun doublon | Non |
| Échec MailerLite après paiement | Journalisé, non bloquant | Non — commande créée |
| Échec MailerLite avant paiement (P0.1) | 502, **bloquant** | Pas de session Stripe créée |
| Jeton connecteur incorrect | 401 | Oui (rien produit) |
| Fiche introuvable (scraping) | 404 | Oui |
| Outscraper indisponible (≥ 500 / 530) | 3 tentatives puis erreur transitoire | Oui, réessayer |
| Échec D1 pendant le scraping | Réponse renvoyée, `saved = false` | **Non — scraping conservé côté client** |
| `POST complete` invalide / introuvable | 400 / 404 | Non |
| `POST complete` appelé deux fois | Idempotent, aucun doublon | Non |
| Erreur du moteur de connaissance | Journalisée, non bloquante | Non |
| Mise en page PDF ≠ 6 pages | Génération interrompue | Oui, à régénérer |
| Back-office injoignable après PDF | Avertissement | Non — PDF déjà produit |
| Injection SQL tentée | Requêtes préparées | Non |

---

## Garanties transverses du pipeline

1. **Traçabilité totale** — chaque PDF est relié à un dossier de données, une version d'analyse, une version de méthode et des horodatages de production.
2. **Honnêteté** — l'inconnu est affiché « à confirmer », jamais deviné ; les projections excluent le non-maîtrisable (P-01, P-03).
3. **Cohérence** — les règles bloquantes de P6/P8 rendent les contradictions internes techniquement impossibles à livrer.
4. **Idempotence des entrées** — un webhook rejoué ne crée jamais deux commandes ; une recollecte crée une nouvelle version d'analyse, jamais un écrasement.
5. **Dégradation contrôlée** — un scraping ou un PDF déjà obtenu n'est jamais perdu par un échec d'archivage ; un dossier sous le minimum de personnalisation est signalé avant livraison.
6. **Trois sources de vérité disjointes** — le paiement fait foi chez Stripe, la production dans `efficia_orders`, l'analyse dans `efficia_knowledge_base`, sans chevauchement.
