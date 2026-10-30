# Format des articles Markdown

## Contrat pour n8n

Créer uniquement trois fichiers dans `contenus/blog/<slug>/` : `article.md`, `une.png`, `illustration.png`. Les PNG doivent être des images paysage 1536 × 1024 px. Aucun HTML à modifier, aucune dépendance npm à installer.

La PR déclenche `Images et validation du blog Markdown`. Il produit les WebP (1536 × 1024 et 768 × 512), le JPEG Open Graph (1200 × 630), Instagram (1080 × 1350) et Google (1200 × 900) dans `assets/images/blog/`. Le workflow committe uniquement ces images sur la branche de la PR. Il ne fusionne rien. Les recadrages JPEG sont centrés ; les WebP visent moins de 150 000 octets, avec avertissement si la cible est dépassée à qualité 52.

## En-tête complet

```yaml
---
slug: "exemple-article-artisan"
title_seo: "Un titre utile pour les artisans | Efficia"
meta_description: "Découvrez les éléments à vérifier pour présenter votre activité aux clients de votre région, avec une méthode simple et des exemples concrets."
h1: "Un titre utile pour les artisans"
extrait: "Ce que vous allez apprendre en lisant cet article."
categorie: "Fiche Google"
auteur: "Fatima Lekraichi"
date_publication: "2026-12-01"
temps_lecture: "7 min"
mot_cle_principal: "fiche Google artisan"
mots_cles_secondaires: "visibilité artisan, fiche Google Business, clients locaux"
alt_une: "Artisan consultant sa fiche sur un ordinateur"
alt_illustration: "Liste des informations à vérifier sur une fiche"
illustration_apres: "Les informations à vérifier"
statut: "brouillon"
---

Un paragraphe d’introduction.

## Les informations à vérifier

Le texte de cette section.
```

Tous les champs sont des chaînes obligatoires pour un article `valide`. Les guillemets doubles suivent l’échappement JSON (`\"` pour une citation), les apostrophes simples YAML sont également acceptées (`''` pour une apostrophe interne). Une valeur et une clé par ligne ; pas de listes YAML, objets, alias, tags, blocs multilignes ou clés dupliquées. Les mots-clés secondaires sont séparés par des virgules dans une seule chaîne.

Le dossier et le champ `slug` doivent être identiques : lettres minuscules ASCII, chiffres et tirets entre mots. Aucun autre fichier ou sous-dossier ne doit être ajouté par n8n. La date doit exister et respecter `AAAA-MM-JJ`. Le générateur refuse les champs inconnus et les slugs incohérents.

`statut: brouillon` exclut l’article de la génération et retire une éventuelle ancienne page générée, sa carte, son JSON-LD, son URL du sitemap et son entrée GA4. Un brouillon peut être incomplet ; seuls son en-tête lisible, son slug et son statut sont nécessaires. Un lien provenant d’un article valide vers un brouillon bloque le build.

`statut: valide` ne signifie pas publication immédiate : `publish-blog.mjs` applique ensuite la date de publication, selon Europe/Brussels. Les images peuvent rester publiques ; les Markdown et PNG sources ne sont jamais copiés dans le site. Un dépôt GitHub public ne rend pas les brouillons confidentiels.

## Markdown accepté

- Paragraphes, titres `##` et `###`. Le H1 vient uniquement du champ `h1`.
- Gras `**texte**`, italique `*texte*`, code en ligne entre accents graves.
- Liens `[libellé](/contact)` : chemins absolus du site, ancres, HTTPS/HTTP, `mailto:` et `tel:`. Pas d’URL relative, de JavaScript ni d’URL commençant par `//`.
- Listes simples `- élément` ou `1. élément`, sans imbrication ni indentation.
- Listes visuelles `- [ ] élément` : cases non interactives ; ne pas mélanger cases et éléments ordinaires dans une même liste.
- Citations `> texte`, avec paragraphes séparés par une ligne `>` vide.
- Tableaux à barres verticales et séparateur `|---|---|` : même nombre de colonnes à chaque ligne. Pas de barre verticale dans le contenu d’une cellule. Seul le tableau défile horizontalement sur mobile.
- Une section finale `## Sources` ou `## Sources des prix cités`, affichée en plus petit.

Pas de HTML brut, d’images Markdown, de titres soulignés, de blocs de code, de notes, de liens par référence ou d’extensions Markdown. Ce sous-ensemble est volontairement explicite et testé, sans bibliothèque npm supplémentaire.

`illustration_apres` doit désigner le texte rendu exact d’un titre ou le début d’un paragraphe de premier niveau, avec une seule correspondance. L’image est insérée immédiatement après ce bloc. Choisir un passage distinctif ; une correspondance absente ou ambiguë bloque le build. Pour les cinq articles migrés seulement, les positions historiques (après tableaux, liste, citation et troisième image du premier article) sont conservées dans `scripts/blog/migration.json`.

## Contrôles bloquants

- `title_seo` : au maximum 65 caractères Unicode, suffixe inclus.
- `meta_description` : de 120 à 160 caractères Unicode.
- Pas de point d’exclamation ni de `garanti`, `garantie`, `explosez`, `n°1`, `SEO local`, `taux de conversion` dans les textes éditoriaux ou alternatives.
- Montants non nuls en euros suivis de `TTC` (par exemple `79 € TTC`). **0 € et 0,00 € sont exemptés**, conformément à la validation éditoriale du 30 octobre 2026.
- Chaque lien interne doit exister, chaque ancre doit être présente. Un article ne peut pas lier un article dont la date est postérieure à la sienne, même si les deux sont déjà publiés au jour du build.
- Images présentes et dimensions vérifiées par lecture des en-têtes PNG/WebP/JPEG. Pour les nouveaux articles, les deux PNG et les sept dérivés sont requis.
- Aucun lien symbolique dans les contenus ni dans le package généré.

Ces contrôles ne prouvent pas la véracité des affirmations, des prix externes ou des règles de Google. La validation éditoriale humaine demeure nécessaire. Les cinq articles migrés respectent les mêmes contrôles, sans exception de longueur ou de prix non nul.

## Build et prévisualisation

```sh
node scripts/package-commerce.mjs dist/site && node scripts/build-articles.mjs --site=dist/site && node scripts/publish-blog.mjs --site=dist/site
```

Le générateur lit les Markdown et son gabarit dans le dépôt, puis écrit uniquement les articles, `blog.html`, `sitemap.xml` et `js/ga4.js` dans le package. Il ne recopie pas les pages commerce ni les Functions et ne restaure pas ce que le packaging a exclu. Il valide l’ensemble avant d’écrire. Les fichiers `blog/*.html` constituent une sortie générée : un fichier dont le dossier source a disparu est supprimé.

`node scripts/build-articles.mjs --write-sources` régénère les fichiers HTML suivis par Git pour les tests et les captures locales. Cette option est refusée sur Cloudflare (`CF_PAGES`). Les sorties sont déterministes et idempotentes. Ne pas modifier manuellement ces sorties : modifier le Markdown ou le gabarit partagé `scripts/templates/article.html`.

Pour l’aperçu local des articles futurs, terminer le build par `--include-future` sur **publish-blog.mjs** seulement. Les brouillons restent ignorés. Une future automatisation de validation devra produire un aperçu privé distinct si elle doit montrer un brouillon avant approbation ; ne pas rendre les brouillons publics pour contourner ce contrôle.

## Migration et calendrier conservé

Les WebP et JPEG Open Graph historiques restent inchangés ; les PNG et formats sociaux ne sont pas exigés pour ces cinq articles. Ne pas convertir de nouveau les WebP en PNG. Pour publier ces articles historiques sur les réseaux, préparer séparément leurs formats sociaux avant leur utilisation par n8n.

- 12 octobre 2026 : fiche Google ou site internet.
- 30 octobre 2026 : chauffagistes/plombiers.
- 3 novembre 2026 : prix d’un site artisan.
- 7 novembre 2026 : avis Google.
- 11 novembre 2026 : fiche Google soi-même ou confiée.

Les textes sont conservés, hormis les titles, la méta-description et les quatre insertions `TTC` expressément approuvés le 30 octobre. Les H1, extraits, images et dates n’ont pas changé.
