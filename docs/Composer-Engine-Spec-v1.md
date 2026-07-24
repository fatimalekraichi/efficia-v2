# Composer Engine — Spécification v1.0

**Efficia Digital · La pièce que le client voit. Le Composer transforme les données techniques en une histoire logique et convaincante — sans jamais refaire l'analyse.**

Statut : spécification à figer avant implémentation. Cible : fonction pure, déterministe, sans LLM, source unique pour HTML / PDF / dashboard / API / Word.

---

## 0. Position dans le pipeline

```
Observation → Benchmark → Knowledge → Reasoning → [Composer] → (HTML · PDF · Dashboard · API · Word)
```

Le client ne verra jamais le JSON du Knowledge ni du Reasoning. Il verra **le document final**. Le Composer est donc responsable de l'expérience — mais il ne produit **aucune nouvelle analyse**. Il répond à une seule question :

> **« Dans quel ordre, et avec quelle sélection, faut-il raconter cette analyse pour convaincre le dirigeant ? »**

Sélection, hiérarchisation, mise en récit, composition de quelques textes de liaison (résumé, accroche, « pourquoi maintenant »), calcul du Potentiel d'amélioration. Rien d'autre.

---

## 1. Responsabilités

Le Composer **fait** :

- **Sélectionner** : parmi 12 forces / 18 opportunités / 7 faiblesses, ne garder que ce qui crée de la valeur (ex. 3 forces, 3 faiblesses, 5 opportunités, 3 priorités, 5 actions). *Un PDF n'affiche pas 37 cartes.*
- **Hiérarchiser** : ordonner par priorité/sévérité déjà calculées en amont.
- **Mettre en récit** : ranger les blocs dans un ordre narratif qui convainc.
- **Composer** des textes de liaison (executive summary, accroche hero, « pourquoi agir maintenant ») à partir de **données existantes**, via templates.
- **Calculer** le Potentiel d'amélioration (§6).
- **Émettre** un document model JSON unique.

Le Composer **ne fait pas** :

- Recalculer un score, un gap, une priorité, une severity (tout vient de l'amont).
- Réécrire un raisonnement (il réutilise `reasoning.presentation`).
- Inventer un chiffre, une phrase générique, une promesse de résultat.

---

## 2. Contrat d'entrée

Un bundle regroupant les sorties des quatre couches :

```jsonc
{
  "analysisId": "uuid",
  "meta": { "businessName": "La planche des saveurs", "category": "restaurant", "city": "Dinant", "generatedAt": "2026-07-23T…" },
  "observation": { /* fiche : name, rating, reviews, photos_count, description, photos_sample[], … */ },
  "benchmark":   { /* benchmark_score, percentiles, gaps, competitor_median, top_competitor, confidence, panel_size */ },
  "knowledge":   { /* strengths[], weaknesses[], opportunities[], top_priorities[], summary, confidence */ },
  "reasoning":   { "reasoningVersion": "1.0.0", "reasonings": [ /* objets riches : logic, evidence, actionability, presentation, priority, severity, … */ ] }
}
```

Le Composer s'appuie surtout sur `reasoning.reasonings` (déjà rédigés et chiffrés), sur `benchmark` (score + potentiel), et sur `observation` (identité + visuels : `photos_sample`, `name`, `city`).

---

## 3. Contrat de sortie (document model)

Source **unique** pour toutes les surfaces de rendu. Le rendu (HTML/PDF/…) ne fait que mettre en forme ; il ne décide plus de la sélection ni de l'ordre.

```jsonc
{
  "composerVersion": "1.0.0",
  "generatedAt": "2026-07-23T…",
  "locale": "fr",

  "hero": {
    "businessName": "La planche des saveurs",
    "category": "restaurant", "city": "Dinant", "date": "23 juillet 2026",
    "score": 90, "scoreBand": "Excellente",
    "improvementPotential": {
      "score": 68, "stars": 4, "label": "Élevé",
      "drivers": [ { "label": "Visibilité locale" }, { "label": "Description" }, { "label": "Galerie photos" } ],
      "note": "Estimation interne — pas une promesse de résultat."
    },
    "headline": "Une fiche solide, avec une marge de progression claire sur votre visibilité."
  },

  "executiveSummary": {
    "text": "La planche des saveurs obtient un score de 90/100… Votre volume d'avis vous place devant vos concurrents ; le principal levier est votre visibilité locale.",
    "confidence": "established"
  },

  "insights": [   // 2–3 grandes idées : une synthèse mémorable, jamais un simple constat
    { "type": "trust", "title": "Votre réputation est déjà un avantage concurrentiel.",
      "text": "Avec 449 avis et une note de 4,6/5, vous inspirez plus confiance que la plupart de vos concurrents.",
      "basedOn": ["FORCE_REVIEWS", "FORCE_RATING"] },
    { "type": "visibility", "title": "Votre principal frein aujourd'hui, c'est la visibilité.",
      "text": "Malgré cette réputation, votre position et votre description limitent votre présence locale : vous inspirez confiance, mais vous êtes encore trop peu vu.",
      "basedOn": ["WEAK_POSITION", "OPP_DESCRIPTION"] }
  ],

  "keyFindings": [   // synthèse scannable : 1 atout majeur + les 2 priorités
    { "kind": "strength", "id": "FORCE_REVIEWS", "line": "449 avis — devant la quasi-totalité de vos concurrents." },
    { "kind": "priority", "id": "WEAK_POSITION", "line": "Visibilité : vous n'êtes pas dans le trio de tête local." }
  ],

  "strengths":     [ /* ≤3 cartes : id, title, message, evidence */ ],
  "weaknesses":    [ /* ≤3 cartes : id, title, reasoning.long, evidence, competitiveAngle, severity */ ],
  "opportunities": [ /* ≤5 cartes : id, title, reasoning.short, evidence, actionability */ ],

  "priorities": [    // « Les 3 priorités » — développées
    { "rank": 1, "id": "WEAK_POSITION", "title": "…", "reasoning": "…(long)…", "evidence": {…}, "severity": "critical", "actionability": {…} }
  ],

  "actionPlan": [    // ≤5 actions, séquencées (quick wins d'abord)
    { "order": 1, "id": "OPP_DESCRIPTION", "action": "Rédiger une description qui explique vos spécialités et votre zone.",
      "difficulty": "easy", "estimatedTime": "15–20 min", "requiresGoogleAccess": true, "canEfficiaAutomate": true, "impactType": "conversion" }
  ],

  "whyNow": { "text": "Chaque semaine sans correction, des prospects choisissent un concurrent mieux optimisé. Les points ci-dessus sont ceux où vous perdez aujourd'hui des clients." },

  "footer": {
    "disclaimer": "Analyse fondée sur l'état public de la fiche Google Business au 23 juillet 2026. Efficia Digital n'est pas affilié à Google. Le Potentiel d'amélioration est une estimation interne, pas une garantie de résultat.",
    "methodology": "N points de contrôle · comparaison à {panel_size} concurrents locaux.",
    "versions": { "reasoning": "1.0.0", "composer": "1.0.0" }
  }
}
```

---

## 4. Règles de sélection et de hiérarchisation

C'est le cœur du Composer. La hiérarchisation est de la **composition**, pas de l'analyse : elle réutilise `priority` / `severity` / `weight` calculés en amont.

| Bloc | Source | Tri | Plafond |
|---|---|---|---|
| `strengths` | knowledge.strengths + reasoning | `weight` décroissant | **3** |
| `weaknesses` | reasonings type=weakness | `priority` décroissant | **3** |
| `opportunities` | reasonings type=opportunity | `priority` décroissant | **5** |
| `priorities` | knowledge.top_priorities (weaknesses ∪ opportunities) | `priority` décroissant | **3** |
| `keyFindings` | 1 top `strength` + 2 top `priorities` | mixte | **3** |
| `actionPlan` | items sélectionnés ayant une `actionability` | score de composition (voir ci-dessous) | **5** |
| `insights` | patterns sur la vue par pilier (trust/visibility/conversion) | pertinence (priorité combinée des constats synthétisés) | **2–3** |

**Score de composition de l'`actionPlan`** (séquencement, pas ré-analyse) : `compose = priority × easeFactor`, où `easeFactor` = `easy:1.2 · medium:1.0 · hard:0.8`. On ouvre par un **quick win** (haute priorité × haute facilité) pour créer l'élan, puis on ordonne par `compose` décroissant.

**Règles transverses :**

- **Déduplication par `signal`** : un même signal n'apparaît qu'une fois dans les cartes (pas à la fois en `weaknesses` et `opportunities`). Le type au `priority` le plus élevé gagne.
- **Cohérence anti-contradiction** : un `signal` présent dans `strengths` ne peut apparaître ni en `weaknesses` ni en `opportunities` (garantie déjà posée en amont — le Composer la respecte, ne la réintroduit pas).
- **Plancher de valorisation** : `strengths` n'est jamais vide si `benchmark_score ≥ 60` ; on ouvre toujours par du positif.
- **Cas fiche saine** : si `priorities` est vide (aucune faiblesse/opportunité notable), le Composer bascule l'angle sur « défendre votre avance » (le `headline` et `whyNow` changent de registre), et l'`actionPlan` devient un plan d'entretien.

### 4.1 Insights — la synthèse en grandes idées

Le dirigeant ne retient pas 12 cartes ; il retient une phrase : « Je suis crédible, mais pas assez visible. » Les `insights` produisent 2 à 3 de ces phrases. **Ce ne sont pas de nouvelles analyses** : chacun synthétise plusieurs constats existants en une idée mémorable.

Exemple : `449 avis` + `4ᵉ position` + `description faible` → *« Vous inspirez confiance, mais vous êtes encore trop peu visible. »* C'est une idée, pas un constat.

Génération (déterministe, via `insights.js`) :

1. **Vue par pilier** — à partir des `impactType` des constats (`trust` / `visibility` / `conversion`), déterminer pour chaque pilier s'il penche « force » ou « frein » (somme des `priority` des constats du pilier, par type).
2. **Bibliothèque de patterns** `insightPatterns`, chacun conditionné sur cette vue :
   - trust fort + visibility faible → « Vous inspirez confiance, mais vous êtes encore trop peu visible. »
   - visibility fort + conversion faible → « On vous trouve, mais votre fiche convertit mal. »
   - conversion faible dominante → « Vous perdez surtout des clients au moment de la comparaison. »
   - trust fort sans frein majeur → « Votre réputation est déjà un avantage concurrentiel. »
3. **Sélection** des 2-3 patterns les plus pertinents (priorité combinée des constats qu'ils synthétisent). Jamais davantage.

Contraintes : un insight référence **≥ 2 constats existants** via `basedOn` (sinon c'est un simple constat, pas une idée) ; `type` ∈ `competitive` | `trust` | `visibility` | `conversion` ; `title` = une phrase ; `text` = 1-2 phrases composées par template sur les constats liés (aucun chiffre inventé). Aucun pattern ne matche → `insights: []` (jamais de remplissage).

---

## 5. Le modèle de rapport (récit)

On raconte une histoire ; les sections ne sont pas une liste plate. Ordre narratif et correspondance avec le document model :

```
Executive Summary                          → executiveSummary (+ hero)
        ▼
Les grandes idées (Insights)               → insights
        ▼
Les 3 priorités                            → priorities   (accroche : keyFindings)
        ▼
Vos points forts                           → strengths
        ▼
Ce qui limite aujourd'hui votre visibilité → weaknesses (+ opportunities)
        ▼
Plan d'action priorisé                     → actionPlan
        ▼
Pourquoi agir maintenant                   → whyNow
        ▼
(mentions & méthode)                       → footer
```

Le hero (couverture) porte le score, la bande, le **Potentiel d'amélioration** et une accroche. La longueur totale suit le contenu (pas de gabarit fixe), mais l'architecture narrative reste constante.

---

## 6. Le Potentiel d'amélioration (indicateur différenciant)

Communique qu'il existe une **marge de progression significative** — présenté explicitement comme **estimation interne, jamais comme une promesse de résultat**.

Score 0–100, déterministe, combinaison de quatre facteurs normalisés 0–100 :

```
improvementPotential =
    0.35 × gapFactor        // ampleur des écarts défavorables vs concurrents (moyenne des |gaps| négatifs normalisés)
  + 0.25 × weakCountFactor  // nombre de signaux faibles (weaknesses + opportunities), plafonné
  + 0.20 × gainFactor       // importance des leviers (somme des priority des top items, normalisée)
  + 0.20 × easeFactor       // facilité moyenne des corrections retenues (easy>medium>hard) — la marge réaliste
clamp(0, 100)
```

Mapping vers l'affichage :

| score | étoiles | label |
|---|---|---|
| ≥ 80 | ★★★★★ | Très élevé |
| 60–79 | ★★★★ | Élevé |
| 40–59 | ★★★ | Modéré |
| 20–39 | ★★ | Limité |
| < 20 | ★ | Faible |

**Rendre le score explicable** : le champ `improvementPotential.drivers` liste les **2-3 leviers** qui alimentent le plus le potentiel (ex. « Visibilité locale », « Description », « Galerie photos »), dérivés des faiblesses/opportunités de plus forte contribution. Le client voit ainsi *pourquoi* le potentiel est ce qu'il est — le score cesse d'être abstrait :

```
Potentiel d'amélioration : Très élevé
Pourquoi ?  ✓ Visibilité locale   ✓ Description   ✓ Galerie photos
```

Un score **bas** n'est pas négatif : il signifie une fiche déjà excellente (le Composer bascule alors sur « défendre l'avance »). Le champ porte toujours une `note` de cadrage (« Estimation interne — pas une promesse de résultat »). Sans Benchmark, `gapFactor` est neutralisé et le potentiel s'appuie sur les facteurs absolus, avec confiance abaissée.

---

## 7. Principes de rédaction

- **Ne jamais refaire l'analyse.** Le Composer réutilise `reasoning.presentation` pour les cartes ; il ne compose lui-même que : `hero.headline`, `executiveSummary.text`, `whyNow.text`, les `keyFindings.line`, les `insights` — tous par **templates sur données existantes**.
- **Les Insights synthétisent, ils n'analysent pas** : chaque insight recombine ≥ 2 constats existants (`basedOn`) en une idée mémorable ; il ne calcule aucune métrique nouvelle.
- **Jamais de chiffre inventé ni de phrase générique.** Les textes composés ne citent que des valeurs présentes dans le bundle.
- **Valoriser avant de critiquer** : on ouvre par les forces (plancher de valorisation).
- **Voix unique**, langage dirigeant (confiance / visibilité / clients), jamais de jargon — cohérente avec le Reasoning.
- **Longueur adaptative mais premium** : le contenu varie, l'exigence de qualité et de densité reste constante ; jamais de remplissage.
- **Honnêteté** : le Potentiel d'amélioration et tout élément estimé sont cadrés comme tels ; aucune promesse.
- **Modulation par la confiance** : quand `confidence` est basse, le ton se fait plus prudent (« semble », « probablement ») — le Composer lit `confidence`, il ne la recalcule pas.

---

## 8. Pureté, déterminisme, dégradation, versioning

- **Fonction pure** : `runComposer(bundle) -> documentModel`. Aucune I/O. Même bundle → même document (sélection, ordre et textes identiques ; phrasing seedé par `analysisId`).
- **Pas de LLM.**
- **Dégradation gracieuse** : bloc sans donnée (ex. pas de concurrents → pas d'`evidence.competitorMedian`) → la carte s'affiche sans ce sous-élément ; jamais de crash, jamais d'invention.
- **`composerVersion`** (SemVer) recopiée dans la sortie et dans `footer.versions`, pour la traçabilité par audit.

Architecture proposée (`src/composer-engine/`) :

```
composerEngine.js
      ├── selection.js            // caps, tris, déduplication
      ├── insights.js             // patterns par pilier → 2-3 grandes idées (synthèse)
      ├── narrativeModel.js       // ordre des sections → document model
      ├── summaryTemplates.js     // hero, executiveSummary, whyNow, keyFindings
      └── improvementPotential.js // calcul du potentiel + drivers + mapping étoiles
```

---

## 9. Tests d'acceptation

1. **Déterminisme** : même bundle → document identique.
2. **Aucune ré-analyse** : tout `score`/`priority`/`severity`/`evidence` de la sortie est égal à celui de l'entrée (le Composer ne les modifie pas).
3. **Plafonds respectés** : `strengths ≤ 3`, `opportunities ≤ 5`, `priorities ≤ 3`, `actionPlan ≤ 5`.
4. **Anti-contradiction** : aucun `signal` présent à la fois dans `strengths` et dans `weaknesses`/`opportunities`.
5. **Plancher de valorisation** : `strengths` non vide si `benchmark_score ≥ 60`.
6. **Action plan** : ouvre par un quick win ; chaque item porte `difficulty`, `estimatedTime`, `canEfficiaAutomate`.
7. **Potentiel** : `improvementPotential.score` déterministe, `stars` cohérent avec le mapping, `note` de cadrage toujours présente.
8. **Cas « La planche »** : `strengths` mène sur les avis ; `priorities` mène sur la visibilité ; **pas** de faiblesse réputation ; `actionPlan` commence par une action facile et à fort impact.
9. **Traçabilité** : `composerVersion` en racine et dans `footer.versions`.
10. **Textes composés** : `executiveSummary`, `hero.headline`, `whyNow`, `keyFindings` ne citent que des valeurs présentes dans le bundle (aucune donnée orpheline).
11. **Insights** : ≤ 3 ; chaque insight référence ≥ 2 constats existants (`basedOn`) ; aucun chiffre absent du bundle ; déterministe ; `insights: []` si aucun pattern ne matche.
12. **Potentiel explicable** : `improvementPotential.drivers` présent (≤ 3), dérivé des faiblesses/opportunités de plus forte contribution au score.

---

## 10. Ce que cette étape change

Observation collecte, Benchmark compare, Knowledge conclut, Reasoning explique. Le Composer, lui, **décide comment tout cela est raconté** — et c'est ce que le client ressent. En séparant strictement la composition de l'analyse, on obtient une source unique, déterministe et versionnée, qui alimente aujourd'hui le PDF et demain le dashboard, l'API ou l'export Word sans jamais retoucher le raisonnement. C'est la dernière brique qui transforme un empilement de moteurs en **produit**.
