# Mise en service du diagnostic — procédure non exécutée

Document opérateur pour une intervention **ultérieure explicitement autorisée**. Aucun déploiement, appel fournisseur réel ou accès distant n’est effectué par la rédaction de cette checklist. Les PR restent en brouillon et les échecs connus doivent être arbitrés avant une mise en service.

## 1. Sauvegarder D1 et identifier le retour arrière

Depuis la racine du dépôt, avec Wrangler 4 authentifié sur le bon compte, relever le déploiement Pages de production courant et sa révision. Vérifier la base `efficia_orders` / binding `ORDERS_DB` dans `wrangler.toml` ; ne pas confondre avec `efficia-orders-preview`. Conserver la sauvegarde hors Git, dans `output/` ignoré, avec accès restreint.

```sh
mkdir -p output/backups
npx wrangler d1 export efficia_orders --remote --output "output/backups/efficia-orders-$(date +%Y%m%d-%H%M%S).sql"
npx wrangler d1 migrations list efficia_orders --remote
```

Vérifier que le fichier SQL n’est pas vide et conserver son empreinte. Aucune application en bloc des migrations anciennes avant examen du registre : l’application historique de 0012 en production n’est pas établie par le dépôt (voir `constat-migration-cgv.md`).

## 2. Appliquer et vérifier les migrations des verrous

Examiner la liste des migrations en attente. Les commandes ciblées ci-dessous exécutent le SQL mais **ne mettent pas à jour automatiquement le registre `d1_migrations`**. Consigner leur exécution et réconcilier ce registre avant toute future commande `migrations apply`, pour ne pas rejouer notamment l’ALTER TABLE de 0024. Si l’équipe utilise exclusivement le gestionnaire de migrations, préférer `npx wrangler d1 migrations apply efficia_orders --remote` uniquement après avoir vérifié que sa liste d’attente est exactement celle autorisée.

```sh
npx wrangler d1 execute efficia_orders --remote --file=migrations/0023_free_diagnostic_collection_locks.sql
npx wrangler d1 execute efficia_orders --remote --command="SELECT name FROM sqlite_master WHERE type='table' AND name='free_diagnostic_collection_locks';"
npx wrangler d1 execute efficia_orders --remote --file=migrations/0024_free_diagnostic_lock_releases.sql
npx wrangler d1 execute efficia_orders --remote --command="PRAGMA table_info(free_diagnostic_collection_locks); SELECT name FROM sqlite_master WHERE type='table' AND name='free_diagnostic_lock_releases';"
```

0024 est nécessaire à la procédure de libération et à la colonne `operation`. Ne pas rejouer 0024 si elle est déjà présente. Résultat attendu : table de verrous avec `analysis_id`, `token`, `acquired_at`, `operation`, et table du journal de libération. Ni 0023 ni 0024 ne supprime de données métier.

## 3. Mettre en service PR #3 seule

Après revue et autorisation de publication, déployer la révision serveur validée de PR #3. Les commits de préparation portent `[CF-Pages-Skip]` : leur push n’est pas une procédure de publication. Confirmer dans Pages la révision réellement active.

Sur une fiche de test explicitement autorisée pour les coûts, lancer **une seule collecte réelle** ; ne pas renvoyer la demande en cas d’attente. Vérifier le résultat, les journaux fournisseur et l’absence de doublon facturé. Vérifier sans session que les routes de gestion des verrous refusent l’accès.

Gestion d’un verrou ancien : ouvrir `/admin/collection-locks` depuis le back-office. Les verrous de plus de 15 minutes indiquent l’analyse, la date et l’opération. Vérifier que l’opération a réellement terminé chez le fournisseur avant de saisir son nom, cliquer « Libérer » et confirmer. Ne jamais libérer une opération active. La libération et le journal sont transactionnels ; aucune expiration automatique. Le journal conserve date, analyse, opération, nom déclaré et empreinte de session, jamais le cookie brut. Le compte admin étant partagé, ce nom n’est pas une identité individuellement certifiée.

## 4. Mettre en service PR #2 après PR #3

Déployer ensuite la révision rebasée de PR #2 validée par la suite combinée. Générer un diagnostic fictif via le back-office et le bouton jsPDF normal : vérifier **3 pages**, lisibilité, absence de débordement, puis les annotations cliquables **Audit, Pack et WhatsApp** et leurs destinations. Ne pas envoyer le rapport au prospect. Vérifier que le score et les preuves correspondent aux données saisies.

## 5. Retour arrière

Si le rendu échoue, revenir au déploiement Pages PR #3 précédemment validé. Si le serveur échoue, suspendre les collectes et revenir au déploiement connu avant PR #3 ; ce dernier ne possède pas le verrou, donc ne pas réautoriser les collectes concurrentes sans décision explicite. Confirmer la révision restaurée.

Conserver les tables additives et le journal : aucun DROP ni effacement des verrous pendant un retour arrière applicatif. Une restauration complète de D1 écraserait les écritures effectuées depuis la sauvegarde ; elle nécessite une analyse des données à conserver et une autorisation distincte. Ne pas importer aveuglément la sauvegarde. Ne pas libérer automatiquement les verrous résiduels.

Références de syntaxe : [Wrangler D1](https://developers.cloudflare.com/d1/wrangler-commands/) ; [transactions D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).
