# Finance PLUS billing rollout

The standalone Finance API owns its Stripe keys and webhook endpoint. Nexeloq Admin does not configure or receive these secrets. Billing is disabled when `FINANCE_STRIPE_MODE` is unset. The Finance API and database must be running; Nexeloq is not needed for new Finance Checkout after users have Finance sessions.

The independent Finance host is still a foundation: its current ledger/identity routes do not yet expose all consumer Finance paid features. The older hosted consumer API still has PRO/ULTIMATE capability gates and a Stars purchase route. Do not treat this billing slice as a complete FREE/PLUS product cutover until those feature gates and legacy UI are migrated or retired with equivalent access checks.

## Environment

Set in the Finance API secret manager only:

- `FINANCE_STRIPE_MODE=TEST` or `LIVE`
- `FINANCE_STRIPE_TEST_SECRET_KEY=sk_test_...` and `FINANCE_STRIPE_TEST_WEBHOOK_SECRET=whsec_...`
- `FINANCE_STRIPE_LIVE_SECRET_KEY=sk_live_...` and `FINANCE_STRIPE_LIVE_WEBHOOK_SECRET=whsec_...`
- `FINANCE_WEB_PUBLIC_URL=https://<Finance website>` for Checkout returns, CORS and cookie origin checks
- Existing `FINANCE_DATABASE_URL`, Finance session/bootstrap signing keys, and bot tokens

Do not send these values to the web build, Nexeloq Admin, logs or repository. Production Finance bot selection rejects Stripe TEST. Configure the Stripe webhook for `https://<Finance API>/api/finance/billing/webhooks/stripe/LIVE` (or `/TEST`), with `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`, `refund.created`, `refund.updated`, and `charge.dispute.created`. The endpoint verifies raw-body signatures and event mode. Refunds affect confirmed cash only after Stripe marks them succeeded.

The Finance Mini App can establish a first-party Finance session by posting `{financeBotId, initData}` to `/api/finance/session/telegram-browser`; the API validates Telegram's HMAC and recent `auth_date`, then sets a secure HttpOnly cookie. Browser-only users need a separate authenticated login bridge before standalone billing can be used. Existing Nexeloq cookies are not trusted by this API.

## Catalog and migration

Run the additive Finance API Prisma migration after backing up the Finance database. No existing rows are deleted. Then run:

```sh
pnpm --filter finance-api billing:sync -- --mode=TEST
pnpm --filter finance-api billing:sync -- --mode=TEST --apply --confirm-finance-stripe-sync
```

Repeat separately for LIVE after validating account minimums and objects. Dry-run reads Finance DB only. Apply takes a PostgreSQL advisory lock per mode, creates missing Products/Prices, and retains old price rows/IDs when amounts change. Stripe Price lookup keys are checked against currency, amount, interval and product. Sync is explicit and is never a startup dependency.

Before migrating legacy rights, make a fresh source backup with `pnpm --filter finance-api migration:backup-source`. Verify the `.sha256` sidecar. The backup includes plan prices, grants and provider subscriptions; keep it encrypted/restricted. Import via:

```sh
pnpm --filter finance-api billing:import-legacy -- --backup=.finance-backups/<file>.json.gz
pnpm --filter finance-api billing:import-legacy -- --backup=.finance-backups/<file>.json.gz --apply --confirm-legacy-billing-import
```

The importer requires matching standalone Finance bot/user/profile identities, is additive and idempotent by legacy subscription ID, preserves gifts and paid periods, and archives compact historical billing facts. Historical cash is marked unverified (zero confirmed cash); gifts do not create payment success. It does not use cross-database SQL.

**Legacy Stripe cutover is a separate rollout gate.** Imported subscription IDs can belong to a different Stripe account/webhook endpoint. Do not switch old recurring users to Finance-only billing until the same-account key, webhook ownership, event routing and subscription reconciliation are proven in TEST and staged LIVE. Imported active rights remain through their recorded period; renewal after that requires this cutover or a separate reconciliation path. Keep the source backup and old event endpoint until reconciled. Rollback is to disable `FINANCE_STRIPE_MODE` and revert traffic to the prior Finance surface; do not delete prices, payments or subscriptions.

## Manual QA before LIVE

1. Validate that the Stripe account accepts a 7 UAH charge; Stripe minimums depend on settlement currency. Verify all four prices in TEST and LIVE separately.
2. Start each Checkout, verify the selected amount, currency, recurring disclosure, return URL, and that the redirect itself never grants PLUS.
3. Pay the 7 UAH introductory Checkout and inspect its Subscription Schedule: first 3-day paid phase, then 179 UAH monthly phase; advance a TEST clock through the transition and renewal. Verify no free trial is used.
4. Deliver duplicate and out-of-order webhooks. Confirm one payment fact per event and access only from confirmed subscription/payment state.
5. Attempt two simultaneous Checkouts, abandon an intro Checkout, then retry. Confirm intro is unavailable only after successful paid redemption.
6. Test payment failure/recovery, period-end cancel/resume, portal, full and partial refunds, dispute, gifts, legacy paid period, and TEST/LIVE isolation.
7. Stop Nexeloq and repeat Finance login, catalog and Checkout with the standalone Finance API.

No LIVE charge, deployment, or database migration is performed by this source change.
