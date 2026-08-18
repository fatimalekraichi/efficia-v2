# Analytics et consentement

Cloudflare Web Analytics est injecté automatiquement par Cloudflare Pages. Microsoft Clarity est chargé uniquement après consentement explicite via l’orchestrateur centralisé du site.

## Entonnoir du diagnostic public

1. Visite de la page d’entrée.
2. `diagnostic_cta_click` — clic ouvrant réellement le diagnostic.
3. `diagnostic_step_1_view` — première étape visible.
4. `diagnostic_step_1_complete` — première étape acceptée par le serveur.
5. `diagnostic_step_2_view` — seconde étape visible.
6. `diagnostic_submitted` — demande complète acceptée et analyse D1 créée.
7. `diagnostic_confirmation_view` — écran de confirmation effectivement visible.

`diagnostic_confirmation_view` ne signifie pas que le visiteur a consulté son diagnostic. L’événement `diagnostic_result_view` est réservé à un futur écran affichant réellement le résultat.

## Autres entonnoirs

### Diagnostic vers audit

1. `diagnostic_confirmation_view`
2. `audit_offer_click`
3. `begin_checkout` avec `offer_type = audit`
4. `checkout_success_view` avec `offer_type = audit`

### Page audit vers paiement

1. Visite de `/audit-google-business`
2. `audit_offer_click`
3. `begin_checkout` avec `offer_type = audit`
4. `checkout_success_view` avec `offer_type = audit`

### Packs

1. Visite de la section des offres.
2. `pack_offer_click`
3. `begin_checkout` avec `offer_type = visibility` ou `performance`
4. `checkout_success_view` avec la même offre.

Stripe et D1 restent la source fiable pour les paiements confirmés. Aucun identifiant d’analyse, de demande, de commande ou de session Stripe n’est envoyé à Clarity.
