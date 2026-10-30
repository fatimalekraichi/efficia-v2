# Ajouter un article au blog

1. Créer `contenus/blog/<slug>/article.md`, `une.png` et `illustration.png`. Utiliser le [format complet](format-article-blog.md), avec `statut: brouillon`, et deux PNG 1536 × 1024.
2. Ouvrir une PR vers `main`. Le workflow `Images et validation du blog Markdown` convertit les images et les committe sur la même branche (PR du même dépôt uniquement). Pour une PR provenant d’un fork, le workflow vérifie mais n’a pas de droit de commit ; un mainteneur doit reprendre les assets dans une branche du dépôt.
3. Relire et valider le texte, les faits, les images et la date. Passer `statut` à `valide`. Le workflow valide la génération, les images et les tests. Le contrôle `Blog Markdown validé` porte sur le commit exact après ajout des images. Un nouveau commit humain exige une nouvelle validation. Le workflow ne fusionne jamais une PR et ne publie aucun réseau social.
4. Vérifier le build et l’aperçu. Les articles futurs sont volontairement absents de l’aperçu Cloudflare normal. En local, avec les outils d’images installés :

```sh
node scripts/convert-blog-images.mjs
node scripts/build-articles.mjs --write-sources
npm run test:build-articles
npm run test:blog
npm run test:publish-blog
node --test tests/technicalSeoRoutes.test.js
npm run build -- --include-future
```

Supprimer ou déplacer uniquement le `dist/site` généré avant de refaire un build. `--include-future` reste interdit sur Cloudflare. Les brouillons ne sont jamais inclus.

5. Faire valider la PR, puis la fusionner. La commande Cloudflare doit d’abord avoir été mise à jour, après accord, selon [Publication programmée](publication-programmee-blog.md). Le workflow quotidien reconstruit le site ; l’article devient visible à partir de sa date lors du premier build réussi.

Aucune modification manuelle de `blog.html`, du sitemap, du JSON-LD, de GA4 ou de la liste des tests SEO n’est nécessaire. `--write-sources` peut mettre à jour les instantanés HTML du dépôt pour les revues ; le build Cloudflare génère lui-même la sortie à partir des Markdown.

Le convertisseur utilise `cwebp` et ImageMagick (`convert`) ; sur les runners Ubuntu, le workflow installe `webp imagemagick` via apt. Aucune dépendance npm n’est ajoutée.
