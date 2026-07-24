# Knowledge Engine — Spécification v1.0

**Efficia Digital · Le moteur qui fait passer Efficia du calcul au raisonnement.**

Statut : spécification à figer avant implémentation. Cible : fonction pure implémentable par Codex, testable, déterministe.

---

## 0. Position dans le pipeline

```
Observation → Benchmark → [Knowledge Engine] → Composer → PDF
```

Le Knowledge Engine consomme la sortie d'Observation + Benchmark et produit des **constats métier** structurés. Il ne fait aucune I/O, n'appelle aucune API, ne touche pas D1. C'est une **fonction pure** :

```js
runKnowledgeEngine(input) -> output   // même input => même output
```

Principes non négociables :

- **Déterministe.** Aucune génération aléatoire. La variété des phrases vient d'une sélection *seedée* (voir §4), pas du hasard.
- **Pas de LLM.** Uniquement des règles figées et une bibliothèque de messages.
- **Sans contradiction.** Un même signal ne peut pas être à la fois force et faiblesse (voir §3.3).
- **Dégradation gracieuse.** Si le Benchmark est absent (ex. concurrents pas encore collectés), le moteur bascule sur des règles en valeur absolue et abaisse la confiance (voir §7).

---

## 1. Mission

> Transformer les données quantitatives issues de l'Observation et du Benchmark en constats métier compréhensibles par un dirigeant — forces, faiblesses, opportunités — et en désigner les trois plus importants.

Le moteur ne décrit pas des chiffres. Il **conclut**. « 449 avis » n'est pas un constat ; « votre volume d'avis vous place devant la quasi-totalité de vos concurrents » en est un.

---

## 2. Entrées (contrat d'entrée)

Objet unique, tous champs typés. `null` autorisé partout : une donnée absente désactive les règles qui en dépendent (jamais d'invention).

```jsonc
{
  "analysisId": "uuid",              // sert de seed déterministe pour le phrasing
  "business": {
    "name": "La planche des saveurs",
    "category": "restaurant",        // catégorie primaire normalisée
    "rating": 4.6,                   // note moyenne (0–5) | null
    "reviews": 449,                  // nombre d'avis | null
    "photos_count": 10,              // nombre de photos | null
    "has_description": true,         // description présente | null
    "description_length": 92,        // caractères (0–750) | null
    "secondary_categories": 1,       // nb de catégories secondaires | null
    "position": 2,                   // rang local observé (1..n, 0 = non visible) | null
    "last_review_age_days": 9,       // ancienneté du dernier avis | null
    "owner_response_rate": 0.78      // 0–1, part d'avis avec réponse proprio | null
  },
  "benchmark": {                     // peut être null (mode absolu, voir §7)
    "benchmark_score": 90,           // score global 0–100 | null
    "panel_size": 3,                 // nb de concurrents comparés
    "confidence": "established",      // "established" | "estimated" | "indicative"
    "percentiles": {                 // position 0–100 de la fiche dans le panel
      "rating": 55, "reviews": 92, "photos": 20
    },
    "gaps": {                        // signé = fiche − médiane concurrents
      "rating": 0.0, "reviews": 53, "photos": -21
    },
    "competitor_median": { "rating": 4.6, "reviews": 396, "photos": 31 },
    "top_competitor": { "name": "Le Sanglier des Ardennes", "rating": 4.6, "reviews": 410, "photos": 34 }
  }
}
```

Provenance : `business.*` vient d'Observation ; `benchmark.*` vient du Benchmark Engine (Appel B). `confidence` pilote la pondération (§5) et le ton (le Composer).

---

## 3. Règles d'interprétation

### 3.1 Modèle d'une règle

Chaque règle est une ligne d'une table, définie **une seule fois** :

```
{ id, when(input) -> bool, type, signal, base_weight, min_confidence, magnitude(input), message_group }
```

- `type` ∈ `strength` | `weakness` | `opportunity`
- `signal` : le levier concerné (`reviews`, `rating`, `photos`, `description`, `position`, `posts`, `categories`, `global`). Sert à la résolution de conflit (§3.3).
- `base_weight` : impact métier (0–10).
- `min_confidence` : confiance minimale requise pour émettre la règle (`established` > `estimated` > `indicative`).
- `magnitude(input)` : intensité 0.5–1.5 (à quel point le seuil est dépassé) — alimente la priorité (§5).
- `message_group` : renvoie vers la bibliothèque (§4).

Deux champs supplémentaires sont ajoutés à **chaque constat en sortie**, mais **dérivés** (jamais définis règle par règle) : `businessImpact` (dérivé du `signal`, §3.4) et `severity` (dérivée de la `priority`, §3.4/§5).

### 3.2 Table des règles v1

**Forces (relatives — nécessitent le Benchmark)**

| id | condition | signal | weight | msg |
|---|---|---|---|---|
| FORCE_REVIEWS | `percentiles.reviews > 85` | reviews | 9 | FORCE_REVIEWS |
| FORCE_RATING | `rating >= 4.5 && gaps.rating >= -0.05` | rating | 9 | FORCE_RATING |
| FORCE_POSITION | `position >= 1 && position <= 3` | position | 8 | FORCE_POSITION |
| FORCE_PHOTOS | `gaps.photos > 0 && percentiles.photos > 70` | photos | 5 | FORCE_PHOTOS |
| FORCE_SCORE | `benchmark_score >= 90` | global | 7 | FORCE_SCORE |
| FORCE_RESPONSE | `owner_response_rate >= 0.8` | reviews | 4 | FORCE_RESPONSE |

**Faiblesses (liabilités actuelles sur des signaux de confiance / visibilité)**

| id | condition | signal | weight | msg |
|---|---|---|---|---|
| WEAK_RATING | `gaps.rating <= -0.2 || rating < 4.0` | rating | 10 | WEAK_RATING |
| WEAK_REVIEWS | `percentiles.reviews < 25 || gaps.reviews <= -competitor_median.reviews*0.4` | reviews | 9 | WEAK_REVIEWS |
| WEAK_POSITION | `position > 3 || position === 0` | position | 9 | WEAK_POSITION |
| WEAK_RECENCY | `last_review_age_days > 120` | reviews | 6 | WEAK_RECENCY |

**Opportunités (leviers remplissables à fort upside)**

| id | condition | signal | weight | msg |
|---|---|---|---|---|
| OPP_PHOTOS | `gaps.photos < -competitor_median.photos*0.3` (ou `photos_count < 15` en mode absolu) | photos | 7 | OPP_PHOTOS |
| OPP_DESCRIPTION | `!has_description || description_length < 250` | description | 6 | OPP_DESCRIPTION |
| OPP_CATEGORIES | `secondary_categories === 0` | categories | 5 | OPP_CATEGORIES |
| OPP_REVIEWS_FLOW | `percentiles.reviews between 25..60` | reviews | 5 | OPP_REVIEWS_FLOW |
| OPP_RESPONSE | `owner_response_rate < 0.5` | reviews | 4 | OPP_RESPONSE |

*(Les seuils sont la référence unique. Toute évolution se fait ici, jamais dans le code d'appel.)*

### 3.3 Résolution de conflit (règle d'or)

**Un signal produit au plus UN constat.** Si plusieurs règles du même `signal` matchent :

1. Priorité au type selon l'avantage réel : si la fiche **devance** la concurrence sur ce signal (`gap >= 0` ou percentile élevé) → seul un `strength` peut sortir ; jamais de `weakness`/`opportunity` sur ce signal.
2. Sinon, garder la règle au `base_weight × magnitude` le plus élevé.

C'est la garantie qui a manqué historiquement (réputation affichée à la fois en force et en frein). À implémenter comme une passe de déduplication par `signal` après évaluation.

### 3.4 Gravité et impact métier (deux champs dérivés, calculés une seule fois)

**`businessImpact`** — dérivé du `signal` via une table unique, pour que l'**Economic Impact Engine** (à venir) trouve les constats déjà classés par effet, sans réanalyse. Valeurs alignées sur les trois piliers du parcours prospect :

| signal | businessImpact |
|---|---|
| `reviews`, `rating` | `trust` |
| `position`, `categories`, `posts` | `visibility` |
| `photos`, `description` | `conversion` |
| `global` (benchmark_score) | `global` |

**`severity`** — dérivée de la `priority` (§5), pour que le **Composer** étiquette naturellement (« Point critique », « À améliorer rapidement », « Opportunité intéressante ») sans jamais recalculer :

| priority | severity |
|---|---|
| ≥ 9 | `critical` |
| 6.5 – 8.99 | `high` |
| 4 – 6.49 | `medium` |
| < 4 | `low` |

Mapping indicatif côté Composer (label = `type` × `severity`, à figer plus tard dans la spec Composer) : `weakness + critical` → « Point critique » · `weakness/opportunity + high` → « À améliorer rapidement » · `opportunity + medium/low` → « Opportunité intéressante » · `strength + critical/high` → « Atout majeur ». Le Knowledge Engine se contente de **produire** `severity` et `businessImpact` ; il n'écrit pas ces libellés.

---

## 4. Bibliothèque de messages

Chaque `message_group` a **2 à 4 formulations**, en langage dirigeant (jamais de jargon SEO). Placeholders entre `{}` remplacés par les valeurs d'entrée.

**Sélection déterministe :** `index = hash(analysisId + message_group) % formulations.length`. Même audit → mêmes phrases (reproductible) ; audits différents → variété.

Placeholders disponibles : `{reviews}`, `{rating}`, `{photos}`, `{competitor_median_reviews}`, `{competitor_median_photos}`, `{top_competitor_name}`, `{position}`, `{gap_photos}`, `{description_length}`.

```
FORCE_REVIEWS
  01 · Vous disposez d'un nombre d'avis supérieur à la quasi-totalité de vos concurrents.
  02 · Votre réputation est portée par un volume d'avis exceptionnel ({reviews} avis).
  03 · Avec {reviews} avis, vous dominez votre zone sur le signal que les clients regardent en premier.

FORCE_RATING
  01 · Votre note de {rating}/5 est un vrai capital de confiance — la chose la plus longue à construire, et vous l'avez déjà.
  02 · Vous tenez une note de {rating}/5, au niveau des meilleures fiches de votre zone.

FORCE_POSITION
  01 · Votre fiche ressort dans le trio de tête des recherches locales (position {position}).
  02 · Vous êtes déjà visible là où se prennent les décisions : dans les premiers résultats.

FORCE_PHOTOS
  01 · Votre galerie est mieux fournie que celle de vos concurrents directs.
  02 · Vous montrez davantage votre activité en images que la plupart des fiches de votre zone.

FORCE_SCORE
  01 · Votre fiche obtient une performance globale excellente.
  02 · Sur l'ensemble des critères, votre fiche fait partie des mieux tenues de votre zone.

FORCE_RESPONSE
  01 · Vous répondez à la grande majorité de vos avis : une relation client visible et rassurante.

WEAK_RATING
  01 · Votre note ({rating}/5) reste en retrait par rapport aux fiches concurrentes de votre zone.
  02 · Sur le premier critère que compare un client, votre note vous dessert aujourd'hui.

WEAK_REVIEWS
  01 · Votre volume d'avis reste inférieur à celui de vos concurrents (médiane : {competitor_median_reviews}).
  02 · Face à des fiches plus fournies, votre nombre d'avis peut faire hésiter un client au moment de choisir.

WEAK_POSITION
  01 · Votre fiche n'apparaît pas dans les trois premiers résultats — là où partent l'essentiel des appels.
  02 · Sur la recherche testée, des concurrents captent des clients avant même que votre fiche soit vue.

WEAK_RECENCY
  01 · Vos avis les plus récents datent : une fiche dont les avis s'arrêtent laisse un doute sur l'activité.

OPP_PHOTOS
  01 · Vos concurrents publient en moyenne {competitor_median_photos} photos, contre {photos} chez vous : une marge visible à combler.
  02 · Ajouter des photos rapproche votre fiche de ce que montrent les fiches qui vous devancent.

OPP_DESCRIPTION
  01 · Votre description est presque vide ({description_length} caractères sur 750) : l'espace qui explique pourquoi vous choisir est inexploité.
  02 · Une description travaillée aiderait un client à comprendre votre offre avant même d'appeler.

OPP_CATEGORIES
  01 · Aucune catégorie secondaire n'est renseignée : vous passez à côté de recherches où vous pourriez apparaître.

OPP_REVIEWS_FLOW
  01 · Votre réputation est correcte mais peut être consolidée par un flux d'avis plus régulier.

OPP_RESPONSE
  01 · Répondre plus systématiquement aux avis renforcerait la confiance des clients qui hésitent.
```

*(La bibliothèque est extensible ; chaque ajout garde le format `GROUPE / NN · texte`.)*

---

## 5. Priorisation

Question à laquelle le moteur doit répondre : **quels sont les trois points les plus importants à dire au client ?**

Score de priorité par constat :

```
priority = base_weight × magnitude × confidence_factor
confidence_factor = { established: 1.0, estimated: 0.8, indicative: 0.6 }
```

Chaque constat porte ensuite une `severity` dérivée de sa `priority` selon les bandes de §3.4 — calculée ici, jamais recalculée en aval.

- **`top_priorities`** = les **3** constats de plus haute priorité pris parmi `weaknesses ∪ opportunities` (ce sont les leviers actionnables). Tri décroissant, égalité départagée par `base_weight` puis ordre de la table.
- **`strengths`** = triées par `base_weight × magnitude`, on garde les **4** premières (pour « valoriser avant de critiquer »). Elles ne comptent pas dans les 3 priorités.
- **Plancher de valorisation :** si aucune force ne matche, émettre `FORCE_SCORE` dégradé ou, à défaut, un message neutre positif — ne jamais rendre `strengths` vide si `benchmark_score >= 60`.

`magnitude` par signal (exemples) : reviews → `clamp(|percentile-50|/50 + 0.5, .5, 1.5)` ; rating → proportionnelle à `|gaps.rating|` ; photos → proportionnelle à `|gaps.photos| / competitor_median.photos`.

---

## 6. Sortie JSON

```jsonc
{
  "version": "1.0",
  "confidence": "established",
  "strengths": [
    { "id": "FORCE_REVIEWS", "signal": "reviews", "businessImpact": "trust", "weight": 9, "priority": 9.0, "severity": "critical", "message": "Avec 449 avis, vous dominez votre zone…" }
  ],
  "weaknesses": [
    { "id": "WEAK_POSITION", "signal": "position", "businessImpact": "visibility", "weight": 9, "priority": 9.0, "severity": "critical", "message": "Votre fiche n'apparaît pas dans les trois premiers résultats…" }
  ],
  "opportunities": [
    { "id": "OPP_PHOTOS", "signal": "photos", "businessImpact": "conversion", "weight": 7, "priority": 7.3, "severity": "high", "message": "Vos concurrents publient en moyenne 31 photos, contre 10 chez vous…" }
  ],
  "top_priorities": [
    { "id": "WEAK_POSITION", "signal": "position", "businessImpact": "visibility", "priority": 9.0, "severity": "critical", "message": "…" },
    { "id": "OPP_PHOTOS", "signal": "photos", "businessImpact": "conversion", "priority": 7.3, "severity": "high", "message": "…" },
    { "id": "OPP_DESCRIPTION", "signal": "description", "businessImpact": "conversion", "priority": 6.0, "severity": "medium", "message": "…" }
  ],
  "summary": "La planche des saveurs obtient une performance globale excellente (90/100). Votre volume d'avis vous place devant vos concurrents ; le principal levier est votre visibilité sur les recherches locales."
}
```

**Génération du `summary` (déterministe, template) :**

```
{name} obtient {band_phrase} ({benchmark_score}/100). {top_strength.message court}. Le principal levier : {top_priority.message court}.
band_phrase : ≥90 « une performance globale excellente » · 75–89 « une base solide » · 50–74 « une base perfectible » · <50 « un potentiel encore sous-exploité »
```

---

## 7. Cas limites & dégradation

- **`benchmark` absent** (Appel B pas encore fait) → `confidence = "indicative"`, désactiver les règles relatives (`FORCE_REVIEWS`, `WEAK_REVIEWS` relatif, `FORCE_PHOTOS`, `OPP_PHOTOS` relatif…) et activer leurs variantes **en valeur absolue** (déjà prévues : `photos_count < 15`, `rating < 4.0`, etc.). Le moteur reste utile dès aujourd'hui avec le seul Appel A.
- **Signal `null`** → toutes les règles qui le lisent sont ignorées (jamais de constat inventé).
- **Aucune faiblesse/opportunité** → `top_priorities` peut contenir < 3 éléments ; le Composer bascule alors sur un angle « défendre l'avance » (cf. cas fiche saine).
- **Confiance sous `min_confidence`** d'une règle → règle non émise.

---

## 8. Versioning & tests

- Champs de version : `rules_version` et `messages_version` (constantes exportées). Toute modif de seuil ou de message incrémente la version concernée.
- **Fonction pure testable** : `runKnowledgeEngine(input)`. Fournir un jeu de fixtures (dont le cas « La planche des saveurs ») avec sortie attendue.
- **Tests d'acceptation minimaux** :
  1. Même input → sortie identique (déterminisme, y compris le phrasing).
  2. Jamais de contradiction : aucun `signal` présent à la fois dans `strengths` et dans `weaknesses`/`opportunities`.
  3. `top_priorities.length <= 3` et tirées uniquement de `weaknesses ∪ opportunities`.
  4. Cas « La planche » (449 avis, note 4,6, 10 photos, position 2, concurrents ~396 avis / ~31 photos) → force sur les avis, opportunité sur les photos, **pas** de faiblesse sur la réputation.
  5. Mode sans benchmark → aucune règle relative émise, confiance `indicative`.
  6. Chaque constat porte un `businessImpact` ∈ {`trust`, `visibility`, `conversion`, `global`} et une `severity` ∈ {`critical`, `high`, `medium`, `low`} cohérente avec les bandes de priorité (§3.4).

---

## 9. Ce que cette étape change

Jusqu'ici Efficia **collecte et compare**. À partir du Knowledge Engine, il **conclut** : il désigne les forces, les faiblesses, les opportunités et, surtout, les trois choses à dire en premier. C'est le passage d'un tableau de chiffres à un audit qui donne du sens — et la base sur laquelle le Composer écrira le rapport.
