# GA4 G-1V7NDZGLG4

Installation réservée aux pages publiques des domaines HTTPS efficiadigital.com et www.efficiadigital.com. Les prévisualisations et chemins internes sont exclus.

Le module `js/ga4.js` est chargé avant le consentement sur chaque page publique. Il ne charge la balise distante qu’après accord audience. La version du choix est renouvelée pour annoncer Google Analytics. La désactivation bloque les événements, purge la file et supprime les cookies GA4 accessibles ; aucun ping de refus n’est envoyé.

- `page_view` : une seule fois par document ; `send_page_view: false` empêche la vue implicite de configuration.
- `contact_click` : `contact_method` limité à phone, email ou whatsapp.
- `generate_lead` : `form_name` limité à diagnostic, site_request ou contact. Seulement après réponse serveur positive, jamais sur un clic Envoyer seul.
- URL et titre limités à des constantes publiques ; aucun paramètre/fragment, referrer, texte de lien, contenu de formulaire ni identifiant de demande dans les événements.
- Le SDK traite des identifiants pseudonymes et des données techniques ; il ne s’agit pas d’une mesure anonyme.

Le 8 octobre 2026, le flux Web 15817804484 de la propriété 555196191 a été vérifié dans Google Analytics : ID G-1V7NDZGLG4. Les mesures améliorées ont été désactivées dans cette interface avant la publication. Ne pas les réactiver ni ajouter une seconde balise sans revalider doublons et confidentialité. Google peut produire des événements techniques de session en plus des événements explicitement commandés par le site.

La livraison repart de la production 7b633a468bc2cfff883d6afc53b12d2b3af10eb8. Elle conserve les pages et le bandeau existants et ajoute seulement leur raccordement GA4, notamment sur les pages Contact, Services, À propos et Optimisation Google Business apparues depuis la préparation initiale. Le diagnostic dynamique hérite de la page Optimisation Google Business.

Validation prépublication : 106 tests réussis (`ga4Consent`, `privacyAnalytics`, `siteRequest`, `publicDiagnosticRequest`) et `git diff --check`. Les 11 tests de `publicDiagnosticLanding` nécessitant Miniflare ne s’exécutent pas dans cette copie sans dépendances ; le diagnostic dynamique sera contrôlé en production. Les tests locaux ne constituent pas une preuve de réception dans GA4.

La vérification réelle se fait dans les requêtes réseau du navigateur puis dans Rapports → Temps réel ou Administration → DebugView. Une réponse HTTP de collecte ne prouve pas à elle seule l’affichage dans GA4. Les formulaires Contact et Refonte utilisent Hostinger et envoient un véritable e-mail lorsqu’ils confirment le succès ; toute validation réelle doit employer des données explicitement marquées comme test.
