---
titre: Audit Efficia™ 99 € — Roadmap MVP & backlog de lancement
statut: actif
version_methode: v5
maj: 2026-07-17
refs: [Audit 99 - Cartographie de production, Audit 99 - Architecture de production, Pipeline d'analyse Efficia]
role: Plan d'action produit — le plus petit système capable de vendre un premier audit à 99 €, puis la trajectoire d'industrialisation.
---

# Audit Efficia™ 99 € — Roadmap MVP & backlog

> **Objectif :** passer de la réflexion à l'exécution. Ce document n'est pas une réflexion de plus : c'est un plan pilotable dès aujourd'hui pour lancer le premier audit vendable en ~2 semaines.
>
> **Principe directeur, appliqué à chaque ligne :** *« Est-ce indispensable pour vendre le premier audit ? »* Si non → version ultérieure. Sans exception.

---

## 0. État des lieux — ce qui existe DÉJÀ (à lire en premier)

Avant de planifier quoi que ce soit, la vérité qui change tout le raisonnement : **le plus gros est déjà construit.** La V1 n'est pas un développement, c'est un **assemblage**.

| Brique | État | Conséquence pour le MVP |
|---|---|---|
| Site public + pages d'offres | Existe | Rien à faire. |
| Paiement Stripe (checkout) | Existe | Rien à faire. |
| Webhook → commande + tâche | Existe | À **fiabiliser**, pas à construire. |
| Deux bases (`efficia_orders`, `efficia_knowledge_base`) | Existent | Rien à faire. |
| Back-office : login, liste commandes, détail commande | Existe (section « Production de l'audit ») | À **connecter** au flux opérateur. |
| Statuts de tâche (`todo`→…→`sent`) | Existent | Rien à faire. |
| Récupération Google + Outscraper | Existe | Rien à faire. |
| Moteur de Score Efficia | Existe | Rien à faire. |
| Génération PDF (6 pages) | Existe | À **adapter** au contenu payant. |
| Synchronisation MailerLite | Existe | Rien à faire pour vendre. |

> **Conclusion brutale :** il est probablement possible de vendre le premier audit **sans écrire beaucoup de code neuf**. Le travail de V1 est : (1) fiabiliser la chaîne existante, (2) brancher l'opérateur sur l'outil de production, (3) livrer le PDF au client — la livraison pouvant être **manuelle** au départ. Tout le reste est de la V2+.

---

## 1. La roadmap en 5 versions

Chaque version répond à une intention unique. On ne passe à la suivante que lorsque la précédente tourne en production réelle.

### Version 1 — « Vendre le premier audit » (cible : ~2 semaines)

- **Objectif :** encaisser 99 €, produire un audit premium, le livrer à un vrai client, de façon fiable — même si une partie est manuelle.
- **Fonctionnalités :** chaîne paiement→commande fiable ; ouverture de l'outil de production depuis le back-office avec le contexte pré-rempli ; production de l'audit par l'opérateur ; génération du PDF ; livraison (manuelle) au client ; suivi du statut dans le back-office.
- **Dépendances :** aucune nouvelle — s'appuie sur l'existant.
- **Complexité :** faible à moyenne (assemblage + fiabilisation).
- **Valeur apportée :** **la seule qui compte au départ** — prouver que quelqu'un paie et reçoit un livrable qui vaut 99 €.
- **Pourquoi ici et pas avant :** c'est le point de départ. Tout le reste est prématuré tant qu'un vrai client n'a pas payé.

### Version 2 — « Gagner du temps » (après ~10-20 audits vendus)

- **Objectif :** réduire le temps humain par audit vers la cible < 5 min (voir Architecture de production).
- **Fonctionnalités :** génération IA du récit (intro, constats, recommandations) ; relecture par exception (score de confiance par bloc) ; pré-sélection automatique des concurrents ; envoi e-mail du PDF en un clic depuis le back-office.
- **Dépendances :** V1 en production ; volume suffisant pour savoir où le temps se perd réellement.
- **Complexité :** moyenne.
- **Valeur apportée :** marge et débit — chaque minute gagnée augmente la rentabilité.
- **Pourquoi ici et pas avant :** on n'optimise pas un process qu'on n'a pas encore fait tourner. Les vrais goulots ne se voient qu'après les premiers audits.

### Version 3 — « Industrialiser » (après ~50 audits)

- **Objectif :** rendre la production répétable et sûre à volume régulier.
- **Fonctionnalités :** stockage du PDF (archivage durable) ; détecteur d'incohérences ; règle « personnalisation insuffisante » automatique ; historique complet et rejouable des audits ; envoi transactionnel fiabilisé.
- **Dépendances :** V2 ; process stabilisé.
- **Complexité :** moyenne à élevée.
- **Valeur apportée :** fiabilité et traçabilité à l'échelle ; moins d'erreurs.
- **Pourquoi ici et pas avant :** l'industrialisation n'a de sens qu'une fois le produit et le process figés.

### Version 4 — « Scaler » (centaines/mois)

- **Objectif :** absorber le volume sans dégrader la qualité ni exploser le temps humain.
- **Fonctionnalités :** file de production multi-opérateurs ; tableau de bord KPI (temps, taux d'intervention, marge) ; gestion des cas d'exception ; automatisation de la désambiguïsation de fiche.
- **Dépendances :** V3 ; besoin de débit avéré.
- **Complexité :** élevée.
- **Valeur apportée :** capacité de croissance.
- **Pourquoi ici et pas avant :** on ne dimensionne une usine qu'une fois la demande prouvée.

### Version 5 — « Optimisations avancées »

- **Objectif :** raffiner qualité et conversion.
- **Fonctionnalités :** benchmark enrichi, personnalisation sectorielle poussée, tests A/B du PDF, boucle de télémétrie (quelles recos sont le plus suivies), pré-remplissage prédictif.
- **Dépendances :** V4 ; données d'usage.
- **Complexité :** élevée.
- **Valeur apportée :** avantage concurrentiel durable.
- **Pourquoi ici et pas avant :** ce sont des optimisations de second ordre ; elles n'ont de valeur qu'à la marge, une fois le reste solide.

---

## 2. Version 1 en détail — développements nécessaires

Liste exhaustive de ce qu'il faut faire pour vendre le premier audit. Tout ce qui n'y figure pas est **hors V1**.

### DEV-1 · Fiabiliser la chaîne paiement → commande → tâche

- **Description :** garantir qu'un paiement crée toujours une commande et une tâche visibles au back-office, sans doublon, avec le contexte (entreprise, ville, URL Google, e-mail, offre).
- **Pourquoi indispensable :** sans commande fiable, pas de production. C'est le socle.
- **Entrées :** événement Stripe `checkout.session.completed`.
- **Sorties :** commande `paid` + tâche `todo` pré-remplie.
- **Interface concernée :** webhook, `efficia_orders`, liste back-office.
- **Priorité :** **Critique.**
- **Temps estimé :** 0,5–1 j (test end-to-end + correctifs, la logique existe).
- **Risques :** webhook non testé en conditions réelles ; métadonnées incomplètes (URL absente).

### DEV-2 · Ouvrir l'outil de production depuis le back-office avec contexte

- **Description :** depuis le détail d'une commande, un bouton ouvre l'outil de score pré-rempli (entreprise, ville, activité, `orderId`, `taskId`).
- **Pourquoi indispensable :** c'est le pont entre « commande reçue » et « audit produit ». Sans lui, l'opérateur ressaisit tout.
- **Entrées :** contexte de la commande.
- **Sorties :** outil de score ouvert et pré-rempli.
- **Interface concernée :** `admin-order`, outil de score.
- **Priorité :** **Critique.**
- **Temps estimé :** 0,5 j (le passage de contexte par URL existe déjà en partie).
- **Risques :** paramètres mal transmis ; désambiguïsation de fiche si l'URL manque.

### DEV-3 · Adapter le PDF au contenu payant (dé-teaser minimal)

- **Description :** version « payante » du PDF : retirer les blocs de vente (teaser 40 critères, deux cartes d'offres + boutons, comparatif DIY/Pack), renommer « Diagnostic » → « Audit », livrer l'ensemble des priorités disponibles plutôt que 3.
- **Pourquoi indispensable :** le client a payé ; lui revendre l'audit dans l'audit détruit la valeur. C'est le minimum pour que le livrable « vaille » 99 €.
- **Entrées :** données et scores déjà calculés.
- **Sorties :** PDF payant crédible.
- **Interface concernée :** générateur PDF / outil de score.
- **Priorité :** **Critique.**
- **Temps estimé :** 1–2 j.
- **Risques :** mise en page (nombre de pages variable si plus de priorités) ; garder un rendu premium.

### DEV-4 · Boucle de statut de production

- **Description :** l'opérateur fait avancer la tâche (`in_progress` → `pdf_generated` → `sent`) depuis le back-office ; le `pdf_filename` est enregistré.
- **Pourquoi indispensable :** savoir où en est chaque commande, ne rien oublier, prouver la livraison.
- **Entrées :** actions opérateur.
- **Sorties :** statuts et horodatages à jour.
- **Interface concernée :** `admin-order`, `efficia_orders`.
- **Priorité :** **Haute.**
- **Temps estimé :** 0,5 j (l'endpoint PATCH existe).
- **Risques :** faible.

### DEV-5 · Livraison au client (MANUELLE en V1)

- **Description :** l'opérateur télécharge le PDF et l'envoie au client par e-mail (Gmail), avec un modèle de message court. Marquer la tâche `sent`.
- **Pourquoi indispensable :** sans livraison, pas de produit. Mais l'automatiser n'est **pas** indispensable pour le premier audit → manuel.
- **Entrées :** PDF généré, e-mail client (dans la commande).
- **Sorties :** e-mail envoyé, statut `sent`.
- **Interface concernée :** back-office (info client) + client e-mail.
- **Priorité :** **Critique** (l'acte), **mais 0 dev** (manuel).
- **Temps estimé :** 0 j (procédure, pas développement) — rédiger un modèle d'e-mail.
- **Risques :** oubli d'envoi (mitigé par le statut `sent`).

### DEV-6 · Procédure opérateur écrite (runbook V1)

- **Description :** fiche d'une page : comment produire un audit de A à Z (ouvrir la commande → produire → vérifier → générer → envoyer → marquer envoyé).
- **Pourquoi indispensable :** garantir la reproductibilité dès le premier audit, même sans automatisation.
- **Entrées :** —
- **Sorties :** runbook.
- **Interface concernée :** documentation.
- **Priorité :** **Haute.**
- **Temps estimé :** 0,5 j.
- **Risques :** aucun.

**Total V1 estimé : ~4 à 6 jours de travail effectif** — donc réaliste en ~2 semaines calendaires avec tests réels.

### Ce qui peut être SUPPRIMÉ de la V1

- Génération IA du texte → **V2** (en V1, l'opérateur rédige/ajuste à la main les quelques blocs personnalisés).
- Envoi e-mail automatisé → **V2** (manuel en V1).
- Stockage/archivage du PDF (R2) → **V3** (en V1, le fichier vit chez l'opérateur + `pdf_filename` en base).
- Détecteur d'incohérences, score de confiance, pré-sélection concurrents → **V2/V3**.
- Tableau de bord KPI → **V4**.
- Multi-opérateurs, file de production → **V4**.
- Benchmark « garanti » automatique → **V2** (en V1, l'opérateur relève 3 concurrents à la main si besoin).
- Résolution des points « à confirmer » internes → **hors audit** (report Pack, décision déjà actée).

---

## 3. Le plus petit système capable de vendre un audit à 99 €

> Un client paie sur le site → une commande apparaît au back-office → l'opérateur ouvre l'outil pré-rempli, produit l'audit et génère un PDF payant crédible → il l'envoie par e-mail au client → il marque la commande « envoyée ».

Rien d'autre. Pas d'IA, pas d'envoi automatique, pas de stockage cloud du PDF, pas de KPI. **Cinq actions, dont une seule création de valeur humaine (produire l'audit), le reste étant déjà en place.**

---

## 4. Backlog de lancement (format startup)

### EPIC A — Encaisser et enregistrer une commande

**Feature A1 — Chaîne paiement fiable**
- *User story :* « En tant que client, quand je paie 99 €, je veux que ma commande soit enregistrée pour être sûr d'être pris en charge. »
- *Critères d'acceptation :* un paiement réussi crée exactement une commande `paid` et une tâche `todo` ; le contexte (entreprise, ville, URL, e-mail, offre) est présent ; un webhook rejoué ne crée pas de doublon.
- *Priorité :* Critique · *Dépendances :* — (existant à tester).

### EPIC B — Produire l'audit

**Feature B1 — Ouverture de l'outil avec contexte**
- *User story :* « En tant qu'opérateur, je veux ouvrir l'outil de production déjà rempli avec les infos de la commande pour ne rien ressaisir. »
- *Critères :* un bouton depuis le détail commande ouvre l'outil ; entreprise/ville/activité/`orderId`/`taskId` sont pré-remplis ; la fiche est retrouvée (ou choisissable si ambiguë).
- *Priorité :* Critique · *Dépendances :* A1.

**Feature B2 — PDF payant**
- *User story :* « En tant que client ayant payé, je veux un audit complet sans qu'on me revende l'audit, pour sentir que j'en ai pour mon argent. »
- *Critères :* aucun bloc de vente (teaser, cartes d'offres, DIY/Pack) ; titre « Audit » ; toutes les priorités disponibles listées ; rendu 6 pages (ou plus) sans débordement ; nom de fichier normalisé.
- *Priorité :* Critique · *Dépendances :* B1.

### EPIC C — Livrer et suivre

**Feature C1 — Livraison manuelle**
- *User story :* « En tant qu'opérateur, je veux envoyer le PDF au client par e-mail avec un message type pour livrer proprement. »
- *Critères :* modèle d'e-mail disponible ; e-mail client visible au back-office ; envoi effectué ; tâche passée à `sent`.
- *Priorité :* Critique · *Dépendances :* B2.

**Feature C2 — Suivi de production**
- *User story :* « En tant qu'opérateur, je veux voir l'état de chaque commande pour ne rien oublier et prouver la livraison. »
- *Critères :* statut visible et modifiable (`todo`→`in_progress`→`pdf_generated`→`sent`) ; `pdf_filename` et horodatages enregistrés ; liste filtrable par statut.
- *Priorité :* Haute · *Dépendances :* A1.

### EPIC D — Fiabilité opérationnelle

**Feature D1 — Runbook opérateur**
- *User story :* « En tant qu'opérateur (même remplaçant), je veux une procédure claire pour produire un audit identique à chaque fois. »
- *Critères :* fiche d'une page, testée sur un audit réel de bout en bout.
- *Priorité :* Haute · *Dépendances :* B2, C1.

---

## 5. Checklist de lancement

Le premier audit est « vendable » quand **toutes** ces cases sont cochées, sur un vrai test end-to-end (paiement test puis paiement réel) :

- ☐ Le paiement 99 € fonctionne (Stripe, en réel).
- ☐ La commande est enregistrée (`paid`) au back-office.
- ☐ Une tâche `todo` est créée avec le contexte complet.
- ☐ Les données Google + Outscraper sont récupérées pour la fiche.
- ☐ Le Score Efficia est calculé.
- ☐ L'outil de production s'ouvre pré-rempli depuis la commande.
- ☐ Le PDF « payant » est généré (sans blocs de vente, titre « Audit »).
- ☐ Le PDF est nommé correctement et son nom est enregistré en base.
- ☐ La commande/tâche est visible et suivie au back-office.
- ☐ La validation manuelle est faite (cohérence, chiffres, concurrents).
- ☐ Le PDF est envoyé au client par e-mail.
- ☐ La tâche est marquée `sent` (preuve de livraison).
- ☐ L'historique de la commande est consultable après coup.
- ☐ Le runbook a été suivi tel quel au moins une fois.

---

## 6. Ce que nous NE développerons PAS avant d'avoir vendu les 50 premiers audits

Section volontairement sévère. Tout ce qui suit est **interdit de développement** avant 50 audits vendus — non parce que c'est inutile, mais parce que ce n'est pas ce qui fait vendre le 1er ni le 50e audit.

- **Aucune génération IA automatisée du rapport.** Tant que le volume est faible, l'opérateur ajuste à la main. On n'automatise pas une rédaction qu'on n'a pas encore stabilisée manuellement.
- **Aucun envoi e-mail automatique / transactionnel.** L'envoi manuel suffit à 50 audits. Automatiser trop tôt = fiabiliser un truc qu'on ne maîtrise pas encore.
- **Aucun stockage cloud du PDF (R2, etc.).** `pdf_filename` + fichier local suffisent. L'archivage durable est un problème de V3.
- **Aucun tableau de bord KPI.** À 50 audits, un tableur ou un coup d'œil au back-office suffit. Les KPI sophistiqués sont un luxe de V4.
- **Aucune file multi-opérateurs.** Une personne produit. Le multi-opérateur est un problème qu'on *rêve* d'avoir.
- **Aucun détecteur d'incohérences / score de confiance.** La relecture humaine intégrale est acceptable à faible volume ; l'outillage vient quand le temps devient le goulot.
- **Aucune résolution des « à confirmer » internes dans le 99 €.** Décision déjà actée : report Pack. Ne pas rouvrir le débat.
- **Aucune refonte du moteur de score, du référentiel, ni du Decision Engine.** Ils existent et fonctionnent « assez bien ». On ne touche pas au cœur avant d'avoir un vrai signal client.
- **Aucun benchmark automatique « garanti ».** En V1/V2, l'opérateur complète à la main si le scraping est faible.
- **Aucune personnalisation sectorielle avancée, aucun A/B test, aucune télémétrie.** Optimisations de V5.

> **Règle d'or du lancement :** si une idée n'aide pas à vendre ou livrer l'un des 50 premiers audits, elle va dans ce document, pas dans le sprint. On préfère lancer dans deux semaines un système simple et robuste plutôt que dans six mois un système parfait.

---

## 7. En une phrase

**La V1 n'est pas un développement, c'est un assemblage : fiabiliser la chaîne de paiement existante, brancher l'opérateur sur l'outil déjà construit, livrer un PDF dé-commercialisé à la main — cinq actions, ~5 jours de travail, zéro fonctionnalité superflue — pour encaisser le premier vrai 99 € en deux semaines.**
