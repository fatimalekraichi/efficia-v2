# Configuration Cloudflare Pages — isolation Preview / Production

## URL publique

`SITE_URL` est obligatoire pour les routes de checkout et pour sélectionner les groupes MailerLite du bon environnement.

- Production : `https://efficiadigital.com`
- Preview : l’origine HTTPS exacte utilisée pour le test, sous `efficiadigital.pages.dev`, par exemple `https://<alias-ou-identifiant>.efficiadigital.pages.dev`

La valeur doit être une origine seule : aucun chemin, paramètre, fragment, identifiant ou mot de passe. L’origine de la requête doit correspondre exactement à `SITE_URL`. Les en-têtes `Origin` et `Host` ne servent pas à construire les redirections Stripe.

## Bases D1

Le fichier `wrangler.toml` est la source de vérité des bindings Pages. Les bindings racine restent ceux de Production :

- `DB` → `efficia_knowledge_base` (`deabe0a6-d130-418b-8b88-59b9ead17970`)
- `ORDERS_DB` → `efficia_orders` (`216a7d6a-56d2-4a08-b472-c3462f3280f7`)

Les bindings de déploiement Preview sont redéfinis intégralement sous `[[env.preview.d1_databases]]` :

- `DB` → `efficia-knowledge-preview` (`579fd946-f939-49d3-a43c-5c4491b2a10c`)
- `ORDERS_DB` → `efficia-orders-preview` (`09058f6c-cdb7-4a5d-bf96-8d1a67baf607`)

Les bindings D1 étant non héritables entre environnements, les deux bindings Preview doivent toujours être présents ensemble dans `env.preview`. Une Preview Pages ne doit jamais dépendre implicitement des bindings racine.

`preview_database_id` ne configure pas le binding d’un déploiement Cloudflare Pages Preview. Il reste au niveau racine uniquement pour les usages Wrangler de développement et de migrations qui consultent cet identifiant. Il ne remplace jamais `env.preview.d1_databases` et ne constitue pas une autorisation d’exécuter une commande D1 distante.

Les migrations `0001` à `0013` sont déjà appliquées à `efficia-orders-preview`. Aucune nouvelle migration ne doit être lancée dans le cadre de cette correction de configuration.

## Groupes MailerLite

Les identifiants sont séparés par environnement. Il n’existe aucun fallback de Preview vers Production ni de Production vers Preview.

### Preview

- `MAILERLITE_PREVIEW_DIAGNOSTIC_GROUP_ID`
- `MAILERLITE_PREVIEW_AUDIT_PROSPECT_GROUP_ID`
- `MAILERLITE_PREVIEW_AUDIT_CLIENT_GROUP_ID`
- `MAILERLITE_PREVIEW_VISIBILITY_PROSPECT_GROUP_ID`
- `MAILERLITE_PREVIEW_VISIBILITY_CLIENT_GROUP_ID`
- `MAILERLITE_PREVIEW_PERFORMANCE_PROSPECT_GROUP_ID`
- `MAILERLITE_PREVIEW_PERFORMANCE_CLIENT_GROUP_ID`

### Production

- `MAILERLITE_PRODUCTION_DIAGNOSTIC_GROUP_ID`
- `MAILERLITE_PRODUCTION_AUDIT_PROSPECT_GROUP_ID`
- `MAILERLITE_PRODUCTION_AUDIT_CLIENT_GROUP_ID`
- `MAILERLITE_PRODUCTION_VISIBILITY_PROSPECT_GROUP_ID`
- `MAILERLITE_PRODUCTION_VISIBILITY_CLIENT_GROUP_ID`
- `MAILERLITE_PRODUCTION_PERFORMANCE_PROSPECT_GROUP_ID`
- `MAILERLITE_PRODUCTION_PERFORMANCE_CLIENT_GROUP_ID`

Chaque valeur doit être l’identifiant d’un groupe créé dans le compte correspondant à la clé `MAILERLITE_API_KEY` de l’environnement. Les groupes Preview doivent être distincts des groupes Production.

## Stripe Preview

Les trois `STRIPE_PRICE_*` et `STRIPE_SECRET_KEY` de Preview doivent appartenir au mode Test Stripe. Après le premier déploiement Preview, enregistrer l’endpoint canonique `https://<origine-preview>/stripe-webhook`, puis configurer son `STRIPE_WEBHOOK_SECRET` dans l’environnement Preview avant tout paiement de test.
