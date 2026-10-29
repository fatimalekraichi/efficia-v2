# Publication programmée du blog

## Fonctionnement en cinq lignes

1. Chaque article a une date de référence dans `<meta name="efficia:publish-date" content="AAAA-MM-JJ">`.
2. À chaque build, Node détermine la date du jour à Bruxelles et prépare les fichiers publics dans `dist/site`.
3. Les articles futurs disparaissent de cette copie, des cartes, du JSON-LD, du sitemap et de la liste GA4.
4. GitHub demande un nouveau build chaque jour à 05:00 UTC, soit 7 h en été et 6 h en hiver à Bruxelles.
5. L’article devient public à la fin du premier déploiement réussi à partir de sa date ; les sources restent intactes.

## État et activation — cas A, GitHub relié à Cloudflare

Le projet **efficiadigital** est relié à **fatimalekraichi/efficia-v2**, avec **main** comme branche de production. Le workflow appelle un Deploy Hook, il ne déploie pas avec Wrangler. Aucun jeton API Cloudflare n’est nécessaire pour ce workflow.

La programmation reste inactive tant que cette modification n’est pas validée, fusionnée dans `main` et que les réglages ci-dessous ne sont pas terminés. Aucun réglage distant n’est changé à l’étape A.

Depuis le 12 octobre, `main` a évolué : le contrat de déploiement `docs/lot-a-deployment.md` prévoit déjà `node scripts/package-commerce.mjs dist/site`, avec `dist/site` comme sortie. Il faut vérifier la valeur réellement affichée dans Cloudflare avant le changement. Conserver une copie des réglages Production et Preview pour pouvoir les rétablir si la validation de l’étape B échoue.

`wrangler.toml` reste identique à `main`, sans clé `pages_build_output_dir`. Les réglages, secrets et bindings Cloudflare restent gérés dans le tableau de bord. Ne pas ajouter cette clé : elle remplacerait la configuration distante. Le nouveau script peut être livré sans changer les réglages : l’ancienne commande continue de fonctionner. Tant que le filtrage n’est pas activé et vérifié, **ne pas ajouter les articles futurs au dépôt publié**.

### Réglages à effectuer vous-même

1. Dans Cloudflare, ouvrez **Workers & Pages → efficiadigital → Settings → Builds** (selon l’interface, la section peut porter le nom **Builds & deployments**).
2. Dans **Build configurations → Edit**, choisissez **Framework preset: None**, **Build command: `npm run build`**, **Build output directory: `dist/site`**. Gardez **Root directory** vide (racine du dépôt), pour que Cloudflare trouve `functions/`. Appliquez les réglages aux environnements **Production et Preview**, puis enregistrez. `wrangler.toml` ne doit pas imposer de dossier : le tableau de bord fait foi. Effectuez ce changement après la livraison validée de l’étape A, avant tout ajout d’article futur.
3. Dans **Settings → Builds → Deploy hooks → Add deploy hook**, indiquez **Deploy hook name: `publication-blog`** et **Branch to build: `main`**, puis créez le hook. Copiez son URL, sans la publier ni l’ajouter au dépôt.
4. Sur GitHub, ouvrez **fatimalekraichi/efficia-v2 → Settings → Secrets and variables → Actions → New repository secret**.
5. Dans **Name**, saisissez exactement `CLOUDFLARE_PAGES_DEPLOY_HOOK`. Collez l’URL dans **Secret**, puis cliquez sur **Add secret**.
6. Après fusion validée dans `main`, ouvrez **Actions → Publication quotidienne du blog → Run workflow**, choisissez **main**, puis **Run workflow**. Le workflow refuse de déclencher la production depuis une autre branche.
7. Vérifiez ensuite **Cloudflare → Workers & Pages → efficiadigital → Deployments** : le build doit réussir avec `npm run build` et `dist/site`. Un workflow GitHub vert confirme seulement que la demande de build a été acceptée ; il ne confirme pas la réussite finale du déploiement.

GitHub peut démarrer les tâches planifiées avec retard. La publication n’est donc pas garantie à la minute près. Un push sur `main` le jour prévu peut aussi publier l’article avant le déclenchement quotidien. Sans nouveau build réussi, le site conserve la version précédente. Sur un dépôt public inactif, GitHub peut désactiver les workflows planifiés après 60 jours : vérifiez l’onglet Actions si les déclenchements cessent.

## Programmer un article

Suivez [Ajouter un nouvel article](ajouter-un-article-blog.md). La balise de publication, les dates JSON-LD, le `<time>` visible, la carte et le `lastmod` du sitemap doivent tous correspondre. Le build refuse une date absente ou impossible, une carte manquante, un ordre incorrect ou une incohérence.

Chaque carte porte `data-blog-slug="votre-slug"` et `data-publish-date="AAAA-MM-JJ"`. Classez les cartes de la date la plus récente à la plus ancienne. Ne mettez aucun lien vers cet article dans une page qui sera publique avant lui. Les cartes et entrées du sitemap sont filtrées automatiquement ; les autres liens provoquent une erreur de calendrier.

Les articles Markdown de novembre ne sont pas encore intégrés à l’étape A. Après validation du mécanisme et des réglages, le calendrier prévu est : chauffagiste/plombier le 2 novembre 2026, prix d’un site le 6 novembre, avis Google le 10 novembre, fiche Google seul ou accompagné le 14 novembre. Le premier article garde sa date réelle du **2026-10-12**.

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

`--include-future` sert uniquement au contrôle local, et est refusé dans Cloudflare Pages. Ne configurez ni cette option ni `--today` dans la commande de build Cloudflare. Le dossier généré est recréé à chaque build. Une erreur de calendrier efface la sortie incomplète et bloque le déploiement.

## Avancer ou reculer une date

Changez la balise `efficia:publish-date`, puis alignez toutes ses copies (date visible et libellé français, JSON-LD article et liste, carte et sitemap). Réordonnez les cartes si nécessaire, lancez les tests et faites valider le changement avant de pousser. Un build à une date égale ou postérieure publiera l’article. Repousser un article déjà publié le retire du prochain build, mais n’efface pas les copies déjà indexées ou mises en cache : évitez de modifier la date réelle d’un article déjà en ligne.

## Dossiers et Functions

- `dist/site/` : seuls fichiers servis au public ; pages, assets, CSS, JS, `src/` utilisé par l’administration, `_headers`, `_redirects`, `robots.txt`, sitemap.
- `dist/functions/` : copie de contrôle des Functions, à côté des fichiers publics, jamais servie comme asset.
- `functions/` à la racine : source compilée par Cloudflare Pages et Wrangler ; ses imports restent inchangés. Les bindings D1 et secrets des déploiements restent gérés dans Cloudflare, sans modification par ce build. Ne déplacez pas la racine du projet dans `dist`.
- `.git`, `.env`, `.dev.vars`, tests, documentation et scripts de build ne sont pas copiés dans les fichiers publics. `dist/` est ignoré par Git.

## Références officielles

- [Cloudflare : Deploy Hooks et menus de création](https://developers.cloudflare.com/pages/configuration/deploy-hooks/)
- [Cloudflare : configuration du build](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Cloudflare : Functions à la racine du projet](https://developers.cloudflare.com/pages/functions/get-started/)
- [GitHub : secrets Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
- [GitHub : horaires et limites des déclenchements planifiés](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
