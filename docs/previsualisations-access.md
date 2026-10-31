# Protéger les prévisualisations Efficia avec Cloudflare Access

Documentation consultée le 31 octobre 2026. Configuration à effectuer dans le compte propriétaire du projet Pages ; aucun réglage Access n'a été modifié par cette branche.

Cloudflare propose une formule Zero Trust gratuite jusqu'à 50 utilisateurs, selon la page tarifaire consultée. Vérifier les conditions affichées pour votre compte avant de confirmer le plan. Pour Fatima seule, Access peut être utilisé avec un code temporaire reçu par e-mail. Ce mécanisme évite de partager un mot de passe fixe.

1. Ouvrir le projet existant dans Workers & Pages, puis Settings → General → Enable access policy.
2. Ouvrir l'application Access correspondante dans Zero Trust et vérifier son périmètre : **prévisualisations uniquement**, notamment les URL avec hash et les alias de branches. Ne pas ajouter `efficiadigital.com`, ni son domaine personnalisé, ni le hostname Pages principal de production.
3. Choisir One-time PIN comme méthode de connexion. Créer une politique Allow avec l'adresse exacte `contact@efficiadigital.com`. Ne pas utiliser une règle Everyone ou un domaine e-mail trop large.
4. Tester une URL de prévisualisation dans une fenêtre privée non authentifiée : elle doit demander une connexion avant d'afficher article, image ou autre ressource. Vérifier ensuite l'accès avec l'adresse autorisée et le refus d'une autre adresse. Tester l'URL avec hash **et** l'alias de branche.
5. Vérifier séparément que le domaine de production reste accessible sans connexion.

L'option Pages protège les prévisualisations, pas automatiquement le domaine Pages principal ni les domaines personnalisés. Les anciens déploiements avec hash peuvent rester accessibles : vérifier que la règle les couvre également. `noindex, nofollow` empêche de solliciter l'indexation ; ce n'est pas une protection contre la lecture par une personne possédant l'URL.

Pour les vérifications automatisées n8n, prévoir plus tard un Service Token Access dédié à la seule application de prévisualisation. Ne pas mettre ce token dans une URL ou une PR. Cette branche n'accorde pas cet accès.

Sources officielles :

- https://developers.cloudflare.com/pages/configuration/preview-deployments/
- https://www.cloudflare.com/plans/zero-trust-services/
- https://www.cloudflare.com/plans/
- https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
- https://developers.cloudflare.com/pages/platform/known-issues/
