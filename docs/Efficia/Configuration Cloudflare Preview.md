# Configuration Cloudflare Pages — isolation Preview / Production

## URL publique

`SITE_URL` est obligatoire pour les routes de checkout et pour sélectionner les groupes MailerLite du bon environnement.

- Production : `https://efficiadigital.com`
- Preview : l’origine HTTPS exacte utilisée pour le test, sous `efficiadigital.pages.dev`, par exemple `https://<alias-ou-identifiant>.efficiadigital.pages.dev`

La valeur doit être une origine seule : aucun chemin, paramètre, fragment, identifiant ou mot de passe. L’origine de la requête doit correspondre exactement à `SITE_URL`. Les en-têtes `Origin` et `Host` ne servent pas à construire les redirections Stripe.

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
