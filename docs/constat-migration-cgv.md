# Constat CGV — aucune correction appliquée

Le fichier `migrations/0012_order_cgv_acceptance.sql` n’a pas été modifié depuis sa création par `55eb952`, le 18/08/2026 à 14:26:34 +0200 (auteur Git : fatimalekraichi). Son SHA-256 est toujours `3f73ac365c4a5d59d77c740c005327745385172c0fbde992c77a2a5fefe5d7e2`, exactement celui du test. L’assertion d’immutabilité réussit.

L’échec de `tests/cgvPurchaseFlow.test.js:313` vient de la seconde assertion : `slice(-7)` doit selon le test renvoyer les migrations 0012 à 0018. Cette liste a été actualisée par `015d86d` le 30/08/2026 puis n’a pas suivi l’ajout de 0019 à 0022 sur main, ni 0023/0024 sur la branche serveur. Une nouvelle migration additive suffit donc à faire échouer ce test, sans modification de 0012.

Le document `docs/Efficia/Configuration Cloudflare Preview.md:28` indique que 0001 à 0013 ont été appliquées à la base **preview**. Le dépôt ne fournit pas, dans les éléments trouvés, de preuve d’application de 0012 en **production**. La présence du code sur main ne prouve pas qu’une commande D1 a été exécutée. Statut production : **non vérifié**, aucun accès distant effectué.

Décision à prendre : autoriser ultérieurement le remplacement de l’assertion « sept dernières migrations exactement » par un contrôle des migrations historiques attendues et de leur caractère additif, en conservant le contrôle d’empreinte de 0012. Ni le test ni la migration CGV ne sont corrigés dans ces PR à cette étape. Avant toute application distante, vérifier l’historique réel des migrations dans une intervention séparément autorisée.
