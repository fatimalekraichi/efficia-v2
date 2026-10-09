# Rapport — conversion mobile, passe du 9 octobre 2026

Branche : `conversion-mobile-oct2026`. Worktree : `../efficia-conversion-mobile`. Base `9a8ad69`, vérifiée comme correspondant au site en ligne du 8 octobre (arborescence, menu, cookies et GA4). Les différences Cloudflare de protection des adresses e-mail sont attendues. Le bundle du 7 octobre n’a pas été utilisé. Les modifications non commitées du dossier `efficia-v2` restent intactes.

Le worktree repose sur la copie Git indépendante `../efficia-conversion-base.git`, après deux échecs de création dans le dépôt original (`mmap failed`). Les cinq phases antérieures restent dans l’historique : `7f6afe4`, `c1af377`, `c7ab910`, `f1bc658`, `9ca9d1a`.

## Corrections de cette passe

- `02adac3` : sur-titre exact de l’accueil ; blocs de réalisation identiques et minimaux dans `index.html` et `site-internet-electricien.html` ; suppression des paragraphes, listes et mention d’anonymat. `css/conversion.css` limite les captures mobiles à 480 px, avec cadrage en haut, coins arrondis et ombre légère. Deux WebP remplacés.
- `1b61664` : gratuité rétablie dans les titres, boutons, badges, textes et étapes du formulaire de `optimisation-google-business.html`. FAQ visible et JSON-LD avec la réponse exacte demandée ; comparatif « Diagnostic gratuit ». `functions/diagnostic-gratuit.js` retrouve exactement les métadonnées de `9a8ad69`. Assertions correspondantes de `tests/publicDiagnosticLanding.test.js` actualisées. Dates du sitemap au 9 octobre pour l’accueil, la page Google et la page électricien. La route Function reste hors sitemap comme auparavant.
- `79cf53b` : résultats des contrôles de dimensions dans `docs/conversion-mobile/controles-20261009.json`.
- Rapport et preuve visuelle actualisés dans le commit documentaire final, identifiable par `git log -1`.

Ces corrections remplacent les choix du 8 octobre concernant l’anonymisation et le retrait du mot « gratuit ». H1, formulaires, ancres, prix, consentement et mesure restent conservés.

## Nouvelles captures

Site client accessible. Nom et logo visibles, aucun floutage ni masquage. Premier écran après chargement complet, images chargées, réseau au repos pendant plus de 500 ms et attente supplémentaire d’au moins une seconde. Aucun bandeau cookies présent.

- Mobile : viewport 390 × 844, user agent mobile, densité 2 ; WebP 780 × 1688, **58 334 octets**.
- Ordinateur : viewport 1440 × 900, densité 1 ; WebP 1440 × 900, **90 116 octets**.

Qualité 80, sans EXIF, XMP ni profil ICC ; les deux fichiers sont inférieurs à 150 Ko et ont été inspectés visuellement. Export Chromium/CDP pour le mobile ; export natif du navigateur pour l’ordinateur afin d’éviter un agrandissement incorrect de l’export CDP. PNG intermédiaires supprimés, aucun script de capture ajouté au dépôt. Aucun lien ni URL du site client dans le HTML, CSS ou JS public.

## Vérifications

- **90 tests ciblés réussis, 0 échec, 0 ignoré** : openaiAds, technicalSeoRoutes, privacyAnalytics, publicDiagnosticLanding, auditGoogleBusinessPage, siteRequest, environmentIsolation, ga4Consent et contactConversion.
- Premier passage concurrent : 89/90, un dépassement du délai de démarrage de Chrome. Relance complète avec `--test-concurrency=1` : 90/90, sans modification du harnais ni des assertions pour contourner cet incident.
- Tests serveur et navigateur en environnement local/simulé, sans envoi réel de formulaire. Consentement, retrait, absence de scripts après refus, événements de contact et données génériques vérifiés dans le harnais. GA4 reste désactivé sur localhost et les previews : aucune réception réelle GA4 revendiquée.
- 16 nouvelles mesures : accueil, électricien, Google et contact aux formats 375 × 667, 390 × 844, 768 × 1024 et 1280 × 800. Aucun débordement horizontal. Les 32 mesures des huit pages de la passe initiale restent dans `docs/conversion-mobile/pages-viewports.json`.
- À 375 × 667, la première carte commence à **469,1 px** ; elle est visible sans scroll. Bandeau cookies : **111,6 px**. Captures : **480 px** sur les deux formats mobiles. Safe area physique non simulée.
- Barre visible après 500 px sur mobile, masquée pendant les préférences, absente sur Contact et masquée à 1280 px après scroll. Réouverture du panneau par « Gérer mes cookies » vérifiée ; aucun script de mesure externe chargé après refus.
- 11 JSON-LD valides ; sitemap XML valide ; `git diff --check` sans erreur. « Diagnostic gratuit » absent de l’accueil, de Services et des menus. La réponse HTTP de la Function est couverte par les tests.
- Recherche des textes interdits : uniquement dénégations de classement et clauses légales/confidentialité préexistantes dans les pages publiques ; aucun métier médical de la fondatrice, aucune promesse de classement. Les correspondances de l’outil admin ne sont pas du texte marketing public.

![Accueil corrigé à 375 px](docs/conversion-mobile/accueil-375-20261009.png)

## Prévisualisation

Déploiement demandé : `npx wrangler pages deploy . --project-name efficiadigital --branch conversion-mobile-oct2026`.

URL immuable vérifiée : https://525f9666.efficiadigital.pages.dev

Alias de branche : https://conversion-mobile-oct2026.efficiadigital.pages.dev

Déploiement applicatif : commit `79cf53b`. Les quatre routes `/`, `/site-internet-electricien`, `/optimisation-google-business`, `/diagnostic-gratuit` répondent **HTTP 200** ; `/js/conversion.js` répond **200** et son contenu est identique au fichier local. La réponse de la Function contient « Diagnostic gratuit ». Preuve dans `docs/conversion-mobile/preview-http-20261009.json`. L’accueil a aussi été inspecté dans le navigateur sur cette URL.

Une première requête Python a reçu 403 ; les cinq contrôles curl et le navigateur ont ensuite réussi, sans modifier les protections. Le commit documentaire final est postérieur au déploiement ; seuls ce rapport et les preuves de contrôle y sont ajoutés, sans changement du site déployé.

La production est sur `main`, commit `9a8ad69`. Aucun déploiement de production ni push Git demandé ou exécuté.

## En attente de Fatima

Uniquement `GBP_URL`, vide dans `js/conversion.js`. Le lien et l’ajout à `sameAs` restent masqués jusqu’à réception de l’URL réelle. Aucun autre accord demandé.

## Écarts et limites

Aucun écart fonctionnel prévu. L’export ordinateur a utilisé la capture native du navigateur après correction d’un problème d’échelle CDP. Aucun framework, CDN ou dépendance npm permanente ajouté. `npx` utilise son cache temporaire pour Wrangler. Pas de test physique Safari/iPhone, d’e-mail réel ni de transaction.
