# Contrat JSON du Worker — champs à renvoyer pour activer les points 1-2-3

Le générateur (`construireBlocsAuditPremium`) consomme désormais tout ce qui suit **avec dégradation gracieuse** : chaque champ absent est simplement ignoré, rien ne casse. Voici ce que le Worker doit ajouter à sa réponse pour débloquer chaque fonctionnalité.

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

## Rappel conformité (inchangé)

La `position` et l'identification des concurrents viennent d'une lecture des résultats Google — à industrialiser via un fournisseur SERP licencié (SerpApi / DataForSEO / Outscraper) plutôt qu'un scraping direct, contraire aux ToS. Stocker des métriques dérivées (compteurs, moyennes), pas le contenu brut Google au-delà des durées autorisées. Les textes d'avis servent à l'analyse en mémoire : n'en persister que des agrégats, pas l'identité des auteurs.
