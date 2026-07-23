# Contrat JSON du Worker — champs à renvoyer pour activer les points 1-2-3

Le générateur (`construireBlocsAuditPremium`) consomme désormais tout ce qui suit **avec dégradation gracieuse** : chaque champ absent est simplement ignoré, rien ne casse. Voici ce que le Worker doit ajouter à sa réponse pour débloquer chaque fonctionnalité.

## Outscraper — noms de champs acceptés nativement

Le générateur accepte désormais **directement les noms de champs Outscraper** : ton Worker peut transmettre la sortie Outscraper presque telle quelle, sans renommer.

| Besoin | Champ Outscraper accepté | Alias canonique aussi accepté |
|---|---|---|
| Note | `rating` | `note` |
| Nombre d'avis | `reviews` | `nbAvis` |
| Nombre de photos | `photos_count` | `nbPhotos` |
| Description (texte) | `description` | — |
| Photos de la fiche | `photos_sample[].photo_url` (ou `photo_url_big`) | `photoUrls[]` |
| Textes des avis | `reviews_data[].review_text` | `avis.textes[]` |
| Concurrents | `name`, `rating`, `reviews`, `photos_count`, `photo` | `label`, `note`, `avis`, `photos`, `image` |

À **calculer / fournir par le Worker** (Outscraper ne les donne pas directement) :

- `position` + `requete` — l'ordre dans la recherche locale (via l'ordre des résultats Outscraper Google Maps Search, ou un SERP).
- `fiche.nbServices`, `fiche.nbPublications` — parse de l'onglet Services / des posts.
- `screenshotUrl` — capture de la recherche Google (service de screenshot, pas Outscraper).
- `avis.avecReponseProprietaire` / `avis.analysés` — se comptent depuis `reviews_data[].owner_answer`.

Les champs concurrents non fournis par Outscraper (`services`, `pubs`) restent simplement absents : le générateur les traite comme non mesurés (aucune ligne de comparaison trompeuse n'est affichée).

## Point 3 — Benchmark photos & moyennes concurrentes ✅ marche déjà

Aucun changement Worker requis. Le générateur calcule maintenant `moyennesConcurrents` (photos, avis, services, pubs, note) à partir du tableau `concurrents[]` que le Worker renvoie déjà. Il suffit que chaque concurrent porte ses champs numériques :

```json
"concurrents": [
  { "label": "Concurrent A", "note": 4.6, "avis": 410, "photos": 32, "services": 8, "pubs": 5 },
  { "label": "Concurrent B", "note": 4.5, "avis": 388, "photos": 28 }
]
```

Dès que `photos` est présent chez les concurrents, la ligne « Photos » apparaît dans le benchmark et l'observation « déclic » sur l'écart photos s'active.

## Point 2 — Services & Publications (supprime les « à confirmer »)

Ajouter à l'objet `fiche` :

```json
"fiche": {
  "nbServices": 6,
  "nbPublications": 4
}
```

`nbServices` alimente le critère *services présents* (domaine Contenu). `nbPublications` (ou `posts`) alimente *publication récente* et *rythme de publication* (domaine Activité). Ces deux domaines cessent alors de sortir en « À confirmer ».

## Point 1 — Texte des avis + description (la page « déclic »)

C'est le levier de valeur. Le Worker doit renvoyer **le texte** (il ne renvoie aujourd'hui que des compteurs) :

```json
"fiche": {
  "description": "Restaurant convivial proposant des plats faits maison…"
},
"avis": {
  "textes": [
    "Magnifique terrasse au bord de l'eau",
    "Service au top et terrasse agréable",
    "Belle terrasse, accueil chaleureux"
  ]
}
```

- `fiche.description` = le **texte** de la description Google (pas seulement sa longueur).
- `avis.textes` = un tableau des textes des N derniers avis (10-20 suffisent). Alternative acceptée : `avisTextes` à la racine.

Le générateur en tire automatiquement les mots que les clients répètent (≥ 3 fois, hors mots vides) **absents de la description**, et produit une observation du type :

> « Vos clients reviennent souvent sur « terrasse » (5 fois) dans leurs avis — ce mot n'apparaît pourtant nulle part dans votre description Google. »

## Résumé des observations « déclic » et de leurs prérequis

| Observation | Données requises | Statut |
|---|---|---|
| Mots des avis absents de la description | `avis.textes` + `fiche.description` | à ajouter au Worker |
| Position ≥ 2ᵉ malgré plus d'avis que la moyenne | `position` + `concurrents[].avis` | **marche déjà** |
| Écart de photos vs concurrents | `nbPhotos` + `concurrents[].photos` | **marche déjà** |

## Preuves visuelles (images) — le levier de la V4(2)

Le générateur affiche désormais trois blocs d'images, **silencieux si les URLs sont absentes**. Le Worker doit renvoyer des **URLs d'images** (pas les binaires) :

```json
"fiche": {
  "photoUrls": ["https://…/1.jpg", "https://…/2.jpg", "…jusqu'à 5"]
},
"screenshotUrl": "https://…/recherche-google.png",
"concurrents": [
  { "label": "Le Sanglier des Ardennes", "note": 4.6, "avis": 410, "photos": 34, "image": "https://…/concA.jpg" }
]
```

- `fiche.photoUrls` = les 5 premières photos de la fiche → section « Vos photos, telles qu'un client les voit » (avec l'écart vs concurrents).
- `screenshotUrl` (ou `captureRecherche`) = capture de la recherche Google locale → section « Ce que voit un client qui vous cherche » (position annotée).
- `concurrents[].image` = une photo représentative par concurrent → section « Vos concurrents, côte à côte » (visuel + note + avis + photos).

Chaque URL doit être une image `https://` directement affichable (`<img src>`). Aucune n'est obligatoire : le bloc correspondant n'apparaît que si l'URL est fournie.

## Rappel conformité (inchangé)

La `position` et l'identification des concurrents viennent d'une lecture des résultats Google — à industrialiser via un fournisseur SERP licencié (SerpApi / DataForSEO / Outscraper) plutôt qu'un scraping direct, contraire aux ToS. Stocker des métriques dérivées (compteurs, moyennes), pas le contenu brut Google au-delà des durées autorisées. Les textes d'avis servent à l'analyse en mémoire : n'en persister que des agrégats, pas l'identité des auteurs.
