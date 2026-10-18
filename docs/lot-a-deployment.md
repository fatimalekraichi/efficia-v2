# Lot A deployment contract

Runtime is the published ef970ddd85cdf3198d4062fe9e6a7d1f41c3b900 release.
Pages production branch: main. Build: `node scripts/package-commerce.mjs dist/site`; output: `dist/site`; Functions remain at repository root `functions/`.
The root Wrangler file is local-only (no pages_build_output_dir). Dashboard variables, encrypted secrets and bindings remain authoritative. Do not add that key without a full configuration migration.
The build packages files only: no migration, Worker deployment, email or event replay.
The independent Worker configuration records the already-active production values and cron */5 * * * *. Git push does not redeploy this Worker. Secrets stay in Cloudflare; never commit them.
Migrations 0025, 0027 and 0028 were applied on 2026-10-17. Never blindly apply migration 0026 (lot B) or replay old orders.
Preserve cutover 1792270731; confirmations=true, owner=server_only, checkout=true, card only. COMMERCE_REMINDERS_ENABLED=false.

## Next legitimate order (do not create a test purchase)
1. Compare the Stripe session/order identity and confirmed payment status.
2. Verify the corresponding Clients group and removal from the pending-payment group.
3. Verify one transactional confirmation; distinguish provider acceptance from inbox reception.
4. Verify only useful MailerLite welcome instructions, no second payment confirmation.
5. Check Worker backlog/errors and Clients/STOP protections; do not move existing workflow contacts.

## Rollback
Suspend new sessions if required, retaining Stripe ingestion and additive data. Disable confirmations before investigating suspected duplicate sends. Do not reset uncertain sending states or drop migrations. Prefer a forward fix; assess newly created sessions before reverting runtime. Never reset the cutover or activate J+1.

Group identifiers and COMMERCE_GROUP_REGISTRY remain in Cloudflare. Worker configs use keep_vars=true to retain them; never deploy to a new environment before provisioning its separate registry and secrets. Public review files contain contracts only, no subscriber observations or test mailbox.
