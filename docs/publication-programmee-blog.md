# Publication programmée du blog

## Fonctionnement en cinq lignes

1. Chaque article a une date de référence dans `<meta name="efficia:publish-date" content="AAAA-MM-JJ">`.
2. À chaque build, le packaging commerce prépare `dist/site`, puis le générateur Markdown prépare les articles, et le filtre détermine la date du jour à Bruxelles.
3. Les articles futurs disparaissent de cette copie, des cartes, du JSON-LD, du sitemap et de la liste GA4.
4. GitHub demande un nouveau build chaque jour à 05:00 UTC, soit 7 h en été et 6 h en hiver à Bruxelles.
5. L’article devient public à la fin du premier déploiement réussi à partir de sa date ; les sources restent intactes.

## État et activation — cas A, GitHub relié à Cloudflare

Le projet **efficiadigital** est relié à **fatimalekraichi/efficia-v2**, avec **main** comme branche de production. Le workflow appelle un Deploy Hook, il ne déploie pas avec Wrangler. Aucun jeton API Cloudflare n’est nécessaire pour ce workflow.

La publication programmée est déjà active. Le Deploy Hook `publication-blog` et le secret GitHub `CLOUDFLARE_PAGES_DEPLOY_HOOK` existent : ne pas les recréer.

La transition Markdown reste en attente de validation. La commande Cloudflare actuelle est `node scripts/package-commerce.mjs dist/site && node scripts/publish-blog.mjs --site=dist/site`. Après accord et fusion de la partie A, ajouter le générateur entre les deux commandes, en Production et Preview :

```sh
node scripts/package-commerce.mjs dist/site && node scripts/build-articles.mjs --site=dist/site && node scripts/publish-blog.mjs --site=dist/site
```

Conserver la sortie `dist/site`, la racine vide et les bindings/secrets actuels. Ne pas ajouter `pages_build_output_dir` dans `wrangler.toml`. Vérifier ensuite le succès du déploiement Cloudflare et les URL publiques ; un workflow GitHub vert confirme seulement la demande de build, pas le déploiement final.

GitHub peut démarrer les tâches planifiées avec retard. La publication n’est donc pas garantie à la minute près. Un push sur `main` le jour prévu peut aussi publier l’article avant le déclenchement quotidien. Sans nouveau build réussi, le site conserve la version précédente. Sur un dépôt public inactif, GitHub peut désactiver les workflows planifiés après 60 jours : vérifiez l’onglet Actions si les déclenchements cessent.

## Programmer un article

Suivez [Ajouter un nouvel article](ajouter-un-article-blog.md). La balise de publication, les dates JSON-LD, le `<time>` visible, la carte et le `lastmod` du sitemap doivent tous correspondre. Le build refuse une date absente ou impossible, une carte manquante, un ordre incorrect ou une incohérence.

Chaque carte porte `data-blog-slug="votre-slug"` et `data-publish-date="AAAA-MM-JJ"`. Le générateur classe les cartes de la date la plus récente à la plus ancienne. Ne mettez aucun lien vers cet article dans une page qui sera publique avant lui. Les cartes et entrées du sitemap sont filtrées automatiquement ; les autres liens provoquent une erreur de calendrier.

Calendrier validé le 30 octobre 2026 : premier article le 12 octobre, chauffagistes/plombiers le 30 octobre, prix du site le 3 novembre, avis Google le 7 novembre, fiche Google soi-même ou confiée le 11 novembre.

## Vérifier ou relancer

Dans **GitHub → Actions → Publication quotidienne du blog**, ouvrez l’exécution du jour. En cas d’échec, lisez le message, vérifiez le secret puis relancez depuis **Run workflow → main**. Consultez également les logs du build dans **Cloudflare → Deployments** : ils listent les articles publiés et programmés.

Après le déploiement, ouvrez `/blog`, l’URL de l’article et `/sitemap.xml`. Avant sa date, la page de l’article doit répondre 404, sa carte et son JSON-LD doivent être absents. Les images seules peuvent rester des assets accessibles ; le texte de l’article n’est pas publié. Les brouillons d’un dépôt GitHub public restent consultables sur GitHub : ce mécanisme contrôle le site, pas la confidentialité du dépôt.

Pour vérifier localement :

```sh
npm run test:blog
npm run test:publish-blog
npm run build -- --today=2026-10-13
npm run build -- --today=2026-10-14
npm run build -- --include-future
```

`--include-future` sert uniquement au contrôle local, et est refusé dans Cloudflare Pages. Ne configurez ni cette option ni `--today` dans la commande de build Cloudflare. Le packaging crée le dossier exclusivement et refuse de réutiliser un `dist/site` existant. Pour refaire un build local, déplacer ou supprimer uniquement ce dossier généré avant de relancer. Le filtre ne recopie aucun fichier source : il lit le package et ne modifie que les pages futures, les cartes/JSON-LD, le sitemap et la liste GA4. Une erreur de calendrier est détectée avant toute écriture et bloque le déploiement sans écraser le package.

## Avancer ou reculer une date

Modifier uniquement `date_publication` dans le Markdown ; le générateur aligne les dates visibles, métadonnées, cartes et sitemap. Faire valider avant de pousser. Repousser un article déjà publié le retire du prochain build, sans effacer les copies indexées ou mises en cache.

## Commande combinée et fichiers préservés

Commande exacte à mettre dans Cloudflare (Production et Preview), sortie `dist/site` :

```sh
node scripts/package-commerce.mjs dist/site && node scripts/build-articles.mjs --site=dist/site && node scripts/publish-blog.mjs --site=dist/site
```

`npm run build` est un raccourci strictement identique. Le `&&` interdit le filtrage si le packaging échoue et empêche le déploiement si le filtre échoue. Aucun nouveau contenu n'est ajouté avant validation de cette chaîne.

Le packaging commerce conserve son comportement ; seule l’exclusion du nouveau dossier source `contenus/` est ajoutée pour éviter de servir les PNG et brouillons. Il conserve ses choix de copie et d'exclusion : le filtre n'ajoute pas de fichier que le packaging a exclu, et ne remplace pas ses pages, assets, en-têtes ou Functions. Cloudflare continue de compiler `functions/` à la racine, avec les mêmes imports, bindings et secrets gérés dans le tableau de bord. `wrangler.toml` reste local-only, sans `pages_build_output_dir`.

Un test ajoute des fichiers et modifie des pages, une image et une Function uniquement dans le package, puis vérifie leurs empreintes après filtrage. Il vérifie aussi qu'un fichier volontairement absent du package n'est pas recopié depuis les sources.

## Références officielles

- [Cloudflare : Deploy Hooks et menus de création](https://developers.cloudflare.com/pages/configuration/deploy-hooks/)
- [Cloudflare : configuration du build](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Cloudflare : Functions à la racine du projet](https://developers.cloudflare.com/pages/functions/get-started/)
- [GitHub : secrets Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
- [GitHub : horaires et limites des déclenchements planifiés](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

## Transition Markdown — à faire après validation de la partie A

La commande actuelle en production reste `node scripts/package-commerce.mjs dist/site && node scripts/publish-blog.mjs --site=dist/site` jusqu’à votre accord. La branche `feat/blog-markdown` contient les instantanés HTML régénérés, ce qui permet de vérifier la compatibilité de cet ancien build en prévisualisation. La nouvelle chaîne complète est testée localement et en CI.

Après accord : fusionner la partie A dans main, puis ajouter `node scripts/build-articles.mjs --site=dist/site` entre packaging et filtrage dans les réglages Cloudflare Production et Preview. Conserver `dist/site` comme sortie et la racine vide. Ne pas ajouter de clé `pages_build_output_dir` dans wrangler.toml. Vérifier un déploiement réussi avec les trois commandes avant de commencer la partie B ou d’ajouter un article uniquement en Markdown.

Le workflow images ne publie que les dérivés, avec un token d’écriture dans un job séparé qui n’exécute aucun code de PR. Les pushes de GITHUB_TOKEN ne relancent pas automatiquement Actions : le job attache donc le check `Blog Markdown validé` au commit exact composé du parent testé et des assets testés. La fusion doit aussi attendre le succès Cloudflare sur ce commit. Si la branche avance entre-temps, le job refuse la mise à jour.

Référence : https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow
