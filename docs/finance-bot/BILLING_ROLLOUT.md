# Finance FREE + PLUS billing rollout

## Ownership and compatibility

The independent Finance API and its database own new Stripe Checkout,
subscription state, payment facts, and Finance entitlements. Stripe credentials
belong only in that API's environment or secret manager. The Nexeloq Bot Billing
records remain historical source data. Do not delete `BotSubscription`,
`BotSubscriptionGrant`, `BotPlanPrice`, `BotBillingEvent`, or encrypted provider
configuration during this rollout. Do not copy provider secrets to Finance.

Map an active legacy `PRO` or `ULTIMATE` subscription or unrevoked gift to the
single PLUS entitlement. Preserve its original plan code, paid-through date,
cancel setting, Stripe subscription and customer IDs, price ID, provider mode,
and source record ID as audit data. A gift grants PLUS with zero monetary
payment; it must never produce a payment-success fact. Existing recurring
subscriptions retain their historical Stripe Price IDs and billing terms until
the customer explicitly changes them. Before moving renewal ownership, verify
that the Finance LIVE Stripe key can retrieve those subscriptions in the same
Stripe account and that their webhook events reach the Finance endpoint. A
copied database row alone does not transfer a Stripe subscription or its
renewal notifications. Keep the old webhook active until every legacy
subscription is reconciled. A TEST subscription cannot grant LIVE
access. FREE remains the fallback when no confirmed PLUS entitlement is valid.

## Preparation

1. Record the current Nexeloq and Finance migration versions and take verified
   database backups. `pnpm --filter finance-api migration:backup-source` creates
   a read-only Finance-scoped archive and SHA-256 manifest; store a copy outside
   the deployment filesystem. Do not put the archive in source control.
2. Restore both databases to staging and verify the backup checksum and table
   counts. Run the Finance schema migration in staging before importing rights.
3. Run the legacy billing import in dry-run mode. Reconcile counts by source
   subscription ID and distinguish paid, gifted, expired, and TEST rows. Verify
   that a repeat import reports no new records. Examine a sample of PRO,
   ULTIMATE, canceled-but-paid-through, past-due, and indefinite gift users.
4. Configure separate TEST/LIVE Stripe keys, webhook signing secrets, and
   callback endpoints in the Finance API environment. Use a distinct webhook
   endpoint for each mode. Do not expose these through Nexeloq Admin or web ENV.
5. Run `billing:sync` with its dry-run option in TEST, inspect the proposed
   Products/Prices, then execute it. Repeat and verify zero new objects. Test a
   price change: it must create a new Price mapping while retaining the old ID.

## Cutover

Enable the Finance billing UI only after the independent Finance API can
authenticate Finance users and answer its own billing catalog. Keep legacy
Nexeloq billing reads available during reconciliation. Route new Checkout only
to Finance. Verify the exact configured webhook mode against `event.livemode`.
Do not infer payment from Checkout success redirects; show a pending state and
refresh the Finance API read model after webhook confirmation.

Use Stripe test clocks or a controlled TEST account to verify the paid 3-day
introductory period, its transition to 179 UAH monthly, renewals, payment
failure/recovery, cancel/resume, refund, duplicate and out-of-order webhooks,
and two concurrent Checkout requests. The introductory offer is once per
Finance user even after cancellation. Confirm the visible disclosure before
the user starts Checkout.

Stripe's [Subscription Schedules guide](https://docs.stripe.com/billing/subscriptions/subscription-schedules)
supports a paid introductory price followed by a regular monthly phase. The
Checkout session starts the paid three-day recurring Price; after its
subscription is confirmed, a schedule changes that existing subscription to
the monthly Price at the phase boundary. A free `trial_end` would not charge
7 UAH and is unsuitable. Stripe's [currency guide](https://docs.stripe.com/currencies)
also makes the minimum non-zero charge depend on the merchant's settlement
currency. Verify that this account can actually collect 7 UAH in TEST and LIVE
before enabling INTRO; UAH presentment alone does not prove that amount works.

## Rollback

Disable new Finance Checkout at the API/configuration boundary and restore the
previous website route. Keep receiving and recording signed Stripe events for
subscriptions already created; turning off webhooks would lose renewals and
refunds. Do not revert a schema migration by dropping financial rows. Restore
from the verified backup only for a disaster, with a reconciliation of Stripe
invoices and events that occurred after the backup. Historical Nexeloq
subscriptions continue on their original Stripe prices unless each customer
is migrated or canceled through a deliberate, auditable process.

## Payment facts for future referrals

Persist invoice/payment/Stripe event identifiers, currency, invoiced amount,
internal bonus amount, confirmed cash amount, refund/chargeback amount, and
subscription status. A future partner commission may use only confirmed cash
net of refunds/chargebacks. This phase creates no partner or customer-referral
ledger. Retain compact financial facts for audit; bound UI history pages and do
not persist full webhook payloads or introduce billing polling.

## Local verification and environment

The Finance API alone reads `FINANCE_STRIPE_MODE=TEST|LIVE`,
`FINANCE_STRIPE_TEST_SECRET_KEY`, `FINANCE_STRIPE_TEST_WEBHOOK_SECRET`,
`FINANCE_STRIPE_LIVE_SECRET_KEY`, and
`FINANCE_STRIPE_LIVE_WEBHOOK_SECRET`. Keep both modes' keys and webhook
endpoints distinct. `FINANCE_WEB_PUBLIC_URL` supplies Checkout return and
Portal URLs. Store values in `products/finance/.env.local` for local work or in
the Finance API deployment secret manager. Never put them in `NEXT_PUBLIC_*`,
Nexeloq Admin, a test fixture, or a command's printed output.

Run Finance Prisma generation, validation, typecheck, tests, and build from
the repository root with `pnpm --filter finance-api <script>`. Run the Finance
Web tests, typecheck, lint, and build with
`pnpm --filter @telegram-system/finance-web <script>`. Launch the Finance API
and Web locally only with TEST credentials and a TEST Stripe webhook forwarding
to `/api/finance/billing/webhooks/stripe/TEST`; stop both servers afterward.

Manual QA in TEST:

- Check a new FREE user sees exactly four PLUS periods, identical PLUS rights,
  and the explicit 7 UAH now / 179 UAH monthly disclosure before Checkout.
- Start two Checkout requests at once for the same user. Only one should
  succeed. Abandon an introductory Checkout and verify it can be tried again
  after expiry; after a paid intro, verify it cannot be reused.
- Complete each paid period and verify the entitlement appears only after the
  signed payment/subscription webhook, not after the success redirect.
- Advance a Stripe test clock across three days, one month, three months, and
  one year; check phase change, renewal invoice, price, period end, and access.
- Deliver the same webhook twice, then deliver subscription and invoice events
  out of order. Check one payment fact per event/invoice and the latest Stripe
  status in Finance.
- Fail and recover a renewal, cancel and resume before period end, and expire a
  canceled subscription. Confirm Portal uses the mode-matched customer.
- Create partial/full refunds and a chargeback. Check monetary facts, net cash,
  user-facing history, and the entitlement policy. Confirm a gifted PLUS has
  no payment-success fact.
- Verify TEST events cannot alter LIVE state and an invalid signature is
  rejected. Turn off Nexeloq and confirm existing Finance sessions can still
  read billing and receive webhooks. Check API responses and logs for secrets.
