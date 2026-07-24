# Reasoning Engine — Spécification v1.0

**Efficia Digital · Le moteur qui explique. Là où le Knowledge dit *quoi*, le Reasoning dit *pourquoi c'est important pour cette entreprise*.**

Statut : spécification à figer avant implémentation. Cible : fonction pure, déterministe, sans LLM, implémentable par Codex.

---

## 0. Position dans le pipeline

```
Observation → Benchmark → Knowledge → [Reasoning] → Composer → PDF
```

- **Knowledge** produit des constats : `{ id, signal, type, severity, businessImpact(catégorie), message, priority }`.
- **Reasoning** prend chaque constat et le transforme en **raisonnement de consultant** : cause → conséquence Google → conséquence business → angle concurrentiel → priorité, sous forme d'un objet riche que le Composer pourra restituer en court, long, carte, PDF ou dashboard.

Le Reasoning n'invente aucun signal : il **approfondit** ceux que le Knowledge a déjà validés.

> Note de nommage : le Knowledge expose `businessImpact` comme **catégorie** (`trust`/`visibility`/`conversion`). Dans le Reasoning, cette catégorie est reportée sous le nom **`impactType`**, et le champ **`businessImpact`** devient le **texte** de la conséquence business. Cette convention évite toute ambiguïté pour l'implémentation.

---

## 1. Mission

> Répondre, pour chaque signal, à la question : **« Pourquoi est-ce important pour cette entreprise, et pourquoi un concurrent mieux optimisé gagnerait-il le client à votre place ? »**

Interdiction absolue de la phrase générique. On ne produit jamais :

> « Votre fiche manque d'une description. »

On produit :

> « Votre fiche ne donne pratiquement aucune information permettant à Google ou à un prospect de comprendre votre valeur ajoutée. Lorsque plusieurs établissements proposent un service similaire, cette absence d'explication réduit votre capacité à convaincre avant même le premier contact. »

On passe du **constat** à l'**explication métier**.

---

## 2. Le modèle en 5 niveaux

Chaque signal traverse toujours la même chaîne de réflexion — structure stable, valable pour tous les signaux (description, photos, avis, catégories, horaires, position…).

```
Signal
   ↓
Cause              (pourquoi ce signal est dans cet état / ce qu'il implique techniquement)
   ↓
Conséquence Google (effet sur l'algorithme / la pertinence / le classement local)
   ↓
Conséquence Business (effet sur clics, appels, clients, CA — qualitatif, sans chiffres en v1)
   ↓
Priorité           (haute / moyenne / basse, dérivée de façon uniforme)
```

Traversant les niveaux Business, un **6ᵉ ingrédient obligatoire** : l'**angle concurrentiel** — la réponse implicite à « pourquoi le concurrent mieux optimisé gagne ». C'est le vrai différenciateur (§6), et il est intégré au raisonnement, pas optionnel.

Exemple (description vide) :

```
Signal            → Description vide
Cause             → Google dispose de peu de contexte sur les spécialités de l'établissement.
Conséquence Google→ Moins de pertinence sur certaines recherches locales.
Conséquence Bus.  → Moins de clics qualifiés, davantage de prospects qui choisissent un concurrent.
Priorité          → Haute
```

---

## 3. Entrées (contrat d'entrée)

Le Reasoning reçoit la **sortie du Knowledge** + le **contexte** (les mêmes données qu'a vues le Knowledge, nécessaires pour remplir les templates avec les vrais chiffres) :

```jsonc
{
  "analysisId": "uuid",            // seed déterministe (phrasing)
  "context": { /* business + benchmark : cf. Knowledge Engine §2 */ },
  "knowledge": { /* sortie complète du Knowledge Engine : strengths, weaknesses, opportunities, top_priorities */ }
}
```

Le Reasoning enrichit **tous** les constats du Knowledge (forces comprises). L'angle concurrentiel s'applique surtout aux `weaknesses`/`opportunities` (« pourquoi on vous prend le client ») ; pour les `strengths`, il s'inverse (« pourquoi cet atout vous fait choisir »).

---

## 4. Les cinq bibliothèques

Architecture (dans `src/reasoning-engine/`) :

```
reasoningEngine.js
      ├── causes.js
      ├── googleImpacts.js
      ├── businessImpacts.js
      ├── reasoningTemplates.js
      ├── priorities.js
      └── actionability.js
```

Chaque bibliothèque est indexée par **`signal`** (et parfois par `type`), avec **2 à 3 variantes** de formulation. Sélection déterministe : `index = hash(analysisId + libName + signal) % variantes.length`. **Un signal sans entrée dans une bibliothèque ne produit PAS de raisonnement générique — il ne produit rien.** C'est ce qui garantit « jamais de phrase générique ».

### 4.1 `causes.js` — pourquoi ce signal est dans cet état

```js
export const causes = {
  description: [
    "Votre fiche ne fournit presque aucun texte décrivant vos spécialités, votre zone ou ce qui vous distingue.",
    "L'espace de description, que Google et les clients lisent en premier, est quasiment vide."
  ],
  photos: [
    "Votre galerie compte peu de visuels au regard de ce que publient les fiches de votre catégorie.",
    "Peu de photos sont disponibles pour se faire une idée concrète de votre établissement."
  ],
  reviews: [ /* … */ ],
  position: [ /* … */ ]
  // etc.
};
```

### 4.2 `googleImpacts.js` — effet sur l'algorithme / la pertinence

```js
export const googleImpacts = {
  description: [
    "Avec peu de contexte, Google associe moins bien votre fiche aux recherches précises de vos clients.",
    "Ce manque d'information réduit la pertinence de votre fiche sur certaines requêtes locales."
  ],
  photos: [
    "Les fiches riches en photos reçoivent davantage d'interactions, un signal que Google valorise.",
  ],
  // …
};
```

### 4.3 `businessImpacts.js` — effet business + facette comparative (le différenciateur)

Deux facettes par signal : `direct` (la conséquence business) et `comparative` (pourquoi un concurrent mieux optimisé gagne). Le template combine les deux.

```js
export const businessImpacts = {
  description: {
    direct: [
      "Un prospect qui ne comprend pas rapidement votre offre passe à la fiche suivante.",
    ],
    comparative: [
      "Face à un concurrent qui explique clairement ses spécialités, votre fiche paraît moins convaincante à budget et qualité égaux.",
    ]
  },
  photos: {
    direct: [
      "Une galerie pauvre donne moins envie de pousser la porte ou de décrocher le téléphone.",
    ],
    comparative: [
      "Quand un internaute compare plusieurs établissements affichés côte à côte, il se décide en quelques secondes ; une galerie peu fournie laisse la place à ceux qui montrent leurs plats, leur ambiance et leur salle. Même avec une bonne réputation, vous risquez d'être moins souvent choisi."
    ]
  }
  // …
};
```

### 4.4 `reasoningTemplates.js` — assemblage homogène (court / long)

Les templates assemblent cause + googleImpact + businessImpact.direct + businessImpact.comparative en un paragraphe cohérent, en deux longueurs. Ils ne contiennent **pas** de contenu métier (celui-ci vient des autres bibliothèques) : uniquement la structure rédactionnelle et les liaisons.

```js
export const reasoningTemplates = {
  short: (p) => `${p.businessImpactDirect} ${p.comparative}`,
  long:  (p) => `${p.cause} ${p.googleImpact} ${p.businessImpactDirect} ${p.comparative}`
};
```

Placeholders : `{name}`, `{reviews}`, `{photos}`, `{competitor_median_photos}`, `{top_competitor_name}`, `{position}`, `{description_length}` — remplacés à partir de `context`.

### 4.5 `priorities.js` — calcul uniforme (source unique, partagée avec le Knowledge)

`priorities.js` centralise **la formule de priorité ET la dérivation de severity** — importée à la fois par le Knowledge et le Reasoning, pour qu'il n'existe qu'une seule définition.

```js
export function computePriority({ base_weight, magnitude, confidenceFactor }) { /* … */ }
export function severityFromPriority(priority) { /* critical|high|medium|low, cf. Knowledge §3.4 */ }
export function priorityLabel(priority) { /* "Haute" | "Moyenne" | "Basse" */ }
```

Le Reasoning **hérite** la `priority` du constat Knowledge (pas de recalcul divergent) et se contente d'en dériver le libellé `Haute/Moyenne/Basse`.

### 4.6 `actionability.js` — faisabilité de l'action (pour le futur plan d'action)

Indexée par `signal`, elle décrit **l'effort pour corriger** le signal, afin que le Composer puisse plus tard bâtir un plan d'action : le client peut-il le faire seul ? faut-il un accès admin ? 10 minutes ou 3 heures ? Efficia peut-il l'automatiser ?

```js
export const actionability = {
  description: { difficulty: "easy",   estimatedTime: "15–20 min", requiresGoogleAccess: true,  requiresProfessional: false, canEfficiaAutomate: true },
  categories:  { difficulty: "easy",   estimatedTime: "10 min",    requiresGoogleAccess: true,  requiresProfessional: false, canEfficiaAutomate: true },
  photos:      { difficulty: "medium", estimatedTime: "30–60 min", requiresGoogleAccess: true,  requiresProfessional: false, canEfficiaAutomate: false }, // le client doit fournir les visuels
  posts:       { difficulty: "easy",   estimatedTime: "15 min / sem", requiresGoogleAccess: true, requiresProfessional: false, canEfficiaAutomate: true },
  position:    { difficulty: "medium", estimatedTime: "variable",  requiresGoogleAccess: true,  requiresProfessional: false, canEfficiaAutomate: true },
  reviews:     { difficulty: "hard",   estimatedTime: "en continu", requiresGoogleAccess: false, requiresProfessional: false, canEfficiaAutomate: true }, // parcours de collecte
  rating:      { difficulty: "hard",   estimatedTime: "long terme", requiresGoogleAccess: false, requiresProfessional: false, canEfficiaAutomate: false } // dépend de l'expérience réelle
};
```

Champs : `difficulty` ∈ `easy` | `medium` | `hard` ; `estimatedTime` (chaîne lisible) ; `requiresGoogleAccess` (accès propriétaire à la fiche nécessaire) ; `requiresProfessional` (compétence externe requise) ; `canEfficiaAutomate` (Efficia peut le prendre en charge — utile pour orienter vers le Pack).

**Portée :** l'`actionability` est émise pour les `weaknesses` et `opportunities` (il y a une action à mener). Pour une `strength`, il n'y a pas d'action corrective → `actionability: null` (le Composer n'en tirera pas de tâche).

---

## 5. Assemblage d'un raisonnement

Pour chaque constat du Knowledge :

1. Récupérer `signal`, `type`, `severity`, `priority`, `impactType`, et les données de `context`.
2. Sélectionner (seedé) une variante de `cause`, `googleImpact`, `businessImpacts[signal].direct` et `.comparative`.
3. Remplir les placeholders avec les vrais chiffres de `context`.
4. Constituer **`logic`** (`cause`, `googleImpact`, `businessImpact`, `competitiveAngle`) — les sorties des bibliothèques.
5. Constituer **`evidence`** (§7.1) à partir d'Observation + Benchmark (jamais de chiffre inventé).
6. Assembler **`presentation.short`** / **`presentation.long`** via `reasoningTemplates`, à partir de `logic` uniquement.
7. Constituer **`actionability`** (§4.6) pour les faiblesses/opportunités (`null` pour les forces).
8. Dériver `priorityLabel`, calculer `confidence` (§8), puis émettre l'objet riche (§7).

Si un signal n'a pas d'entrée dans les bibliothèques requises → **le constat est reporté tel quel du Knowledge, sans raisonnement** (jamais de remplissage générique).

---

## 6. Le différenciateur concurrentiel (traitement explicite)

Chaque raisonnement doit répondre implicitement à : **« Pourquoi un concurrent mieux optimisé gagnerait-il le client à votre place ? »** C'est la facette `comparative` de `businessImpacts.js`, **obligatoire** dans la version longue.

- Pour une **faiblesse/opportunité** : la facette explique comment un concurrent mieux optimisé capte le client (ex. photos, description).
- Pour une **force** : la facette s'inverse — pourquoi cet atout fait que *vous* gagnez l'arbitrage.

C'est ce composant, pas la longueur du texte, qui donne la sensation « analyse de consultant ».

---

## 7. Sortie JSON (objet riche)

L'objet racine porte **`reasoningVersion`** (traçabilité par audit) et un tableau `reasonings` aligné 1:1 sur les constats du Knowledge. La **logique** (le raisonnement) et la **présentation** (la rédaction) sont **séparées** : demain, le PDF, un dashboard, une API, un chatbot ou un email pourront réécrire `presentation` sans jamais toucher à `logic`.

```jsonc
{
  "reasoningVersion": "1.0.0",
  "generatedAt": "2026-07-23T…",
  "reasonings": [
    {
      "id": "WEAK_DESCRIPTION",
      "signal": "description",
      "type": "weakness",
      "impactType": "conversion",      // catégorie héritée du Knowledge (ex-businessImpact)
      "title": "Description absente",

      "logic": {
        "cause": "Google dispose de peu de contexte sur vos spécialités.",
        "googleImpact": "Moins de pertinence sur certaines recherches locales.",
        "businessImpact": "Moins de clics qualifiés, et davantage de prospects qui choisissent un concurrent.",
        "competitiveAngle": "Face à un concurrent qui explique clairement ses spécialités, votre fiche convainc moins, à qualité égale."
      },

      "evidence": {
        "metric": "description_length",
        "value": 0,
        "competitorMedian": 640,
        "unit": "caractères",
        "source": "Observation + Benchmark"
      },

      "actionability": {
        "difficulty": "easy",
        "estimatedTime": "15–20 min",
        "requiresGoogleAccess": true,
        "requiresProfessional": false,
        "canEfficiaAutomate": true
      },

      "presentation": {
        "short": "Moins de clics qualifiés… Face à un concurrent qui explique clairement…",
        "long":  "Votre fiche ne fournit presque aucun texte… Avec peu de contexte, Google… Un prospect qui ne comprend pas… Face à un concurrent qui explique clairement…"
      },

      "confidence": 0.94,
      "priority": 9,
      "priorityLabel": "Haute",
      "severity": "critical"
    }
  ]
}
```

Le Composer choisit `presentation.short` / `presentation.long`, recompose une carte à partir des slots de `logic` + `evidence`, et s'appuie sur `actionability` pour bâtir le plan d'action (faisabilité, temps, automatisable par Efficia).

### 7.1 Evidence Layer — chaque raisonnement s'appuie sur une preuve

Chaque raisonnement porte une `evidence` : la donnée chiffrée qui le fonde. Elle transforme le raisonnement en **affirmation → preuve**, ce qui rend le PDF nettement plus crédible. Elle vient d'Observation (la valeur de la fiche) et du Benchmark (la référence concurrente).

```jsonc
"evidence": {
  "metric": "description_length",   // le signal mesuré
  "value": 0,                       // valeur de la fiche (Observation)
  "competitorMedian": 640,          // référence concurrente (Benchmark) | null
  "unit": "caractères",             // libellé d'unité | null
  "source": "Observation + Benchmark"
}
```

Table `metric` par signal : `description → description_length` · `photos → photos_count` · `reviews → reviews` · `rating → rating` · `position → position` · `categories → secondary_categories`. `competitorMedian = benchmark.competitor_median[signal]` s'il existe, sinon `null` (mode absolu). Si la valeur d'Observation manque, `value = null` : le raisonnement peut exister mais sans preuve chiffrée — le Composer l'affiche alors sans le bloc preuve. **Jamais de chiffre inventé.**

---

## 8. Confidence (0–1)

Dérivée de la confiance du Benchmark et de la complétude des données du signal :

```
confidence = base(confidence_benchmark) × completude_signal
base : established → 0.95 · estimated → 0.80 · indicative → 0.60
completude_signal : 1.0 si toutes les données du signal présentes ; abaissée sinon (ex. pas de médiane concurrente pour un signal comparatif → 0.85)
```

Un raisonnement dont la `confidence` est faible peut être formulé plus prudemment par le Composer (« semble », « probablement »).

---

## 9. Principes non négociables

- **Pureté & déterminisme** : `runReasoningEngine(input) -> output`, aucune I/O, même entrée → même sortie (phrasing compris, via seed).
- **Pas de LLM** : tout vient des cinq bibliothèques. Les templates ne portent que la structure.
- **Jamais de phrase générique** : pas d'entrée de bibliothèque pour un signal ⇒ pas de raisonnement pour ce signal.
- **Cohérence avec le Knowledge** : mêmes `signal`/`severity`/`priority` ; aucune contradiction réintroduite.
- **Dégradation gracieuse** : sans Benchmark, la facette `comparative` bascule sur une formulation générique-de-marché (« les fiches concurrentes de votre zone… ») sans citer de chiffre, et la `confidence` baisse.
- **Logique ≠ présentation** : `logic` porte le raisonnement, `presentation` la rédaction. Toute nouvelle surface (PDF, dashboard, API, chatbot, email) réécrit `presentation` sans jamais toucher à `logic`.
- **Affirmation → preuve** : tout raisonnement chiffrable porte une `evidence` (§7.1) ; le raisonnement s'appuie sur la donnée, jamais l'inverse.

---

## 10. Versioning & tests

- Constantes exportées : `reasoning_rules_version`, `libraries_version`, et **`reasoningVersion`** (SemVer, ex. `1.0.0`). `reasoningVersion` est **recopiée dans la racine de la sortie** : chaque audit sait avec quelle version du moteur il a été produit (débogage et comparaisons entre audits simplifiés). Toute modif de bibliothèque incrémente la version.
- **Fonction pure testable** : fixtures dont « La planche des saveurs ».
- **Tests d'acceptation** :
  1. Déterminisme : même input → sortie identique (y compris `reasoning.short/long`).
  2. Traçabilité : chaque phrase émise provient d'une entrée de bibliothèque identifiable (aucun texte « orphelin »/générique).
  3. Chaque `reasoning.long` d'une faiblesse/opportunité contient une facette `competitiveAngle` non vide.
  4. `priority`, `severity`, `signal` identiques à ceux du constat Knowledge correspondant (pas de divergence).
  5. Cas « La planche » : `OPP_PHOTOS` → angle concurrentiel « comparaison côte à côte » ; `FORCE_REVIEWS` → angle inversé (« pourquoi votre volume d'avis vous fait gagner l'arbitrage »).
  6. Mode sans benchmark : aucun chiffre concurrent cité, `confidence` abaissée, aucun crash.
  7. Séparation logique/présentation : `logic` ne contient aucun élément de mise en forme ; réécrire `presentation` n'altère jamais `logic`.
  8. Preuve : chaque raisonnement chiffrable porte une `evidence` avec `metric`, `value` et `source` ; `competitorMedian` présent dès que le Benchmark existe, `null` sinon (jamais inventé).
  9. Traçabilité version : la racine de la sortie porte `reasoningVersion`, égal à la version des bibliothèques.
  10. Actionabilité : chaque `weakness`/`opportunity` porte une `actionability` complète (`difficulty`, `estimatedTime`, `requiresGoogleAccess`, `requiresProfessional`, `canEfficiaAutomate`) ; les `strength` ont `actionability: null`.

---

## 11. Ce que cette étape change

Le Knowledge répond à « qu'est-ce qui ne va pas ? ». Le Reasoning répond à « pourquoi est-ce important pour vous, et pourquoi un concurrent mieux optimisé gagnerait-il le client ? ». C'est précisément cette bascule — du constat à l'explication concurrentielle — qui fait qu'un dirigeant a l'impression de lire un consultant, pas un outil. Et grâce aux cinq bibliothèques, cette qualité reste **homogène, déterministe et maintenable** : on améliore l'analyse en éditant une bibliothèque, jamais en réécrivant du code.
