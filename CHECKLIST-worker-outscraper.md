# Checklist d'implémentation — Worker Outscraper

**But :** le Worker Cloudflare orchestre Outscraper (+ 1-2 sources annexes) et renvoie **un seul JSON** au format attendu par le générateur. Le générateur consomme déjà les noms natifs Outscraper (`rating`, `reviews`, `photos_sample`, `reviews_data`, concurrents `name/photo/…`) : ton Worker a donc surtout à **assembler**, peu à transformer.

Endpoint appelé par l'outil (existant) :
`GET {url-connecteur}/?nom=…&ville=…&activite=…` avec `Authorization: Bearer {token}`.

---

## 0. Prérequis

- [ ] Clé API Outscraper stockée en **secret Worker** (`wrangler secret put OUTSCRAPER_API_KEY`) — jamais dans le navigateur.
- [ ] Jeton d'accès du connecteur (`Authorization: Bearer`) vérifié au début du handler.
- [ ] D1 ou KV disponible pour le cache (tu as déjà D1).
- [ ] Appels Outscraper en **synchrone** pour une fiche unique (`async=false`) afin de rester dans le temps de réponse du Worker ; sinon polling `request_id`.

---

## 1. Les appels Outscraper (2 à 3 appels)

**Appel A — la fiche cible** (`Google Maps Search`, query = `nom + " " + ville`, limit=1)
→ objet place complet : `name`, `rating`, `reviews`, `photos_count`, `photos_sample[]`, `description`, `working_hours`, `place_id`, `subtypes`…
*(vérifie les noms exacts dans ta réponse réelle : `photos_sample[].photo_url`, `description`.)*

**Appel B — le pack local / concurrents** (`Google Maps Search`, query = `activite + " " + ville`, limit=5-10)
→ **liste ordonnée** de places. Sert à deux choses :
- `position` = rang (1-based) du `place_id` cible dans cette liste (0 / absent si hors liste).
- `concurrents[]` = les autres places (top 3), avec `name`, `rating`, `reviews`, `photos_count`, `photo`.

**Appel C — les avis (pour la découverte)** (`Google Maps Reviews`, `place_id` cible, `reviews_limit=15-20`, `sort=newest`)
→ `reviews_data[]` avec `review_text`, `owner_answer`, `review_datetime_utc`.

---

## 2. Mapping champ par champ → contrat JSON

| Champ de sortie | Source | Comment |
|---|---|---|
| `fiche.rating` | Appel A `rating` | tel quel |
| `fiche.reviews` | Appel A `reviews` | tel quel |
| `fiche.photos_count` | Appel A `photos_count` | tel quel |
| `fiche.description` | Appel A `description` | **texte** (pas la longueur) |
| `fiche.photos_sample` | Appel A `photos_sample` | garder `[{photo_url}]` (5 premiers) |
| `avis.reviews_data` | Appel C | garder `[{review_text, owner_answer, review_datetime_utc}]` |
| `avis.avecReponseProprietaire` | Appel C | compter les `owner_answer` non vides |
| `avis.analysés` | Appel C | = nombre d'avis récupérés |
| `avis.dernierAvisTimestamp` | Appel C | max `review_datetime_utc` → epoch (s) |
| `position` + `requete` | Appel B | rang de la cible + la requête testée |
| `concurrents[]` | Appel B | `{name, rating, reviews, photos_count, photo}` (top 3, hors cible) |
| `fiche.revendiquee` | Appel A | si Outscraper expose un flag « claimed/verified » ; sinon omettre |
| `fiche.nbSousCategories` | Appel A `subtypes` | nombre de sous-catégories |

Le générateur remplit le reste (score, benchmark, découverte, images) à partir de ça.

---

## 3. Les 4 points « durs » (à décider explicitement)

- [ ] **Position locale** → vient de l'ordre de l'**Appel B**. C'est fiable et légal via Outscraper (pas de scraping direct de Google). Attention : l'ordre Outscraper approxime le pack local, il n'est pas garanti identique au vrai 3-pack — le formuler comme « position observée ».
- [ ] **Services** (`fiche.nbServices`) → Outscraper ne donne pas proprement l'onglet Services. Deux options : (a) le laisser absent (le domaine « Contenu » reste « à l'optimisation », déjà géré) ; (b) un scrape dédié plus tard. **Non bloquant.**
- [ ] **Publications / posts** (`fiche.nbPublications`) → idem, pas de champ Outscraper fiable. Laisser absent pour l'instant. **Non bloquant.**
- [ ] **Capture de recherche** (`screenshotUrl`) → Outscraper ne la fournit pas. Trois choix, du plus simple au plus riche :
  1. **Ne pas l'envoyer** — les cartes concurrents (Appel B) assurent déjà la preuve « voir les concurrents ». *Recommandé pour démarrer.*
  2. **Reconstruire** un visuel « pack local » côté Efficia à partir des données (cohérent avec la charte : reconstruire, ne pas capturer l'UI Google).
  3. **Screenshot service** (Cloudflare Browser Rendering, ou une API type ScreenshotOne/urlbox) rendant l'URL Maps — ⚠️ risque CAPTCHA/ToS, à éviter à l'échelle.

---

## 4. Cache & coût

- [ ] Mettre en cache par `place_id` les réponses Outscraper des **concurrents** (Appel B) en D1/KV, TTL **quelques jours** — ils bougent lentement, ça divise le coût.
- [ ] La **cible** (Appel A + C) est rafraîchie à chaque audit (le client paie pour une photo actuelle).
- [ ] Journaliser le coût par audit (nb d'appels × tarif Outscraper) pour piloter l'unit economics.

---

## 5. Sécurité & conformité

- [ ] Clé Outscraper en secret ; jeton connecteur vérifié ; CORS restreint à ton domaine.
- [ ] Ne persister que des **métriques dérivées** (compteurs, moyennes, longueurs) — pas le contenu brut au-delà du nécessaire.
- [ ] Avis : garder les **textes** juste le temps de l'analyse ; ne pas stocker l'identité des auteurs.
- [ ] Gestion des échecs partiels : si l'Appel B ou C échoue, renvoyer quand même la fiche (Appel A) ; les sections concernées restent silencieuses côté générateur.

---

## 6. Exemple de JSON de sortie (contrat)

```json
{
  "auditPublicId": "…", "analysisVersion": 1,
  "position": 2, "requete": "restaurant dinant",
  "fiche": {
    "name": "La planche des saveurs",
    "rating": 4.6, "reviews": 449, "photos_count": 10,
    "description": "Restaurant convivial…",
    "photos_sample": [{"photo_url": "https://…/1.jpg"}, {"photo_url": "https://…/2.jpg"}],
    "nbSousCategories": 1
  },
  "avis": {
    "reviews_data": [
      {"review_text": "Magnifique terrasse…", "owner_answer": "Merci !", "review_datetime_utc": "…"}
    ],
    "avecReponseProprietaire": 31, "analysés": 40, "dernierAvisTimestamp": 1784000000
  },
  "concurrents": [
    {"name": "Le Sanglier des Ardennes", "rating": 4.6, "reviews": 410, "photos_count": 34, "photo": "https://…/a.jpg"}
  ]
}
```

---

## 7. Tests avant mise en prod

- [ ] Valider le JSON du Worker en l'injectant dans le générateur (même méthode que l'aperçu de test : `donneesAnalyse` → `construireBlocsAuditPremium`). Vérifier : découverte affichée, vignettes photos, cartes concurrents, benchmark photos, aucun « À confirmer ».
- [ ] Cas dégradés : sans `reviews_data` (pas de découverte), sans `photos_sample` (pas de vignettes), sans concurrents (pas de benchmark) → **rien ne casse**.
- [ ] Vérifier `owner_answer` → compteur de réponses correct ; `dernierAvisTimestamp` → récence correcte.

---

## 8. Ordre d'implémentation recommandé

1. [ ] Appel A (fiche) → renvoyer `rating/reviews/photos_count/description/photos_sample`. *(active : score confiance, vignettes photos, base de la découverte)*
2. [ ] Appel B (recherche) → `position` + `concurrents[]`. *(active : benchmark photos, cartes concurrents, découverte position/photos)*
3. [ ] Appel C (avis) → `reviews_data`. *(active : la découverte sémantique — le levier « 149-199 € »)*
4. [ ] Cache concurrents + journalisation coût.
5. [ ] (Optionnel) screenshot / reconstruction du pack local.
6. [ ] (Plus tard) services + posts si tu trouves une source fiable.

**Le plus fort ROI est l'Appel C** (texte des avis) : c'est lui qui allume la page « découverte ».
