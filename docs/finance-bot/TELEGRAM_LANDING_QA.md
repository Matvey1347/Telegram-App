# Finance Telegram and landing QA (2026-10-28)

## Runtime inventory

- The legacy `products/finance/bot` adapter still runs inside Nexeloq API. It handles `/start`, `/expense`, `/income`, `/recent`, `/accounts`, `/categories`, `/transfer`, `/assistant`, `/settings`, `/help`, plus `/analytics`, `/plus`, `/support`, `/paysupport`, and `/terms`.
- The reply keyboard keeps nine actions in five compact rows. The Telegram menu button opens Finance Web. Inline callbacks cover transaction/account/category/transfer flows, confirmation/cancellation, language, and recurring payment confirmation. Unknown `fin:` callbacks receive an unavailable response.
- Existing Stars pre-checkout and successful payment handlers remain for previously issued Telegram invoices. They do not initiate Stripe Checkout.
- The older Nexeloq Finance billing screen now shows paid access, existing subscriptions, history, and renewal cancellation without the PRO/ULTIMATE offer grid. Its Stripe, Stars, and portal endpoints reject new requests. Other older upgrade prompts still refer to legacy entitlements and require the Task 1 migration before rollout.
- Existing Stripe subscribers cannot update cards through the old Portal during this cutover. The UI provides the current legal contact for payment recovery. Restore self-service through an authenticated external Finance Web session before production rollout; do not re-enable a general Portal inside a Mini App.
- The independent Finance API currently persists Telegram webhook updates but does not dispatch bot commands. Full independence of bot operation from Nexeloq remains a separate runtime cutover.

## Digital purchase boundary

Telegram requires in-bot and Mini App digital purchases to use Stars. Finance therefore exposes subscription status/history and renewal cancellation in its Mini App, but hides Stripe Checkout and the Stripe portal there. The Finance API rejects Checkout and portal requests from signed `TELEGRAM_MINI_APP` sessions. Tokens without an explicit external surface also fail closed. A verified browser login/session bridge and a production review of the standalone domain are required before enabling website Checkout for users.

The landing displays the central Finance offer amounts: 7 UAH for 3 days, then automatically 179 UAH monthly; 179 UAH monthly; 399 UAH quarterly; 1099 UAH yearly. The first offer is one use per user according to the billing catalog. Landing CTAs go to registration, not directly to payment.

## Smoke and manual QA

1. In UA and EN, send each registered bot command. Check that `/analytics` opens analytics, `/plus` opens subscription status, `/support` and `/paysupport` show the contact, and `/terms` opens Finance legal pages only when `FINANCE_WEB_PUBLIC_URL` is configured. Check `/expense`, `/income`, `/transfer`, and `/assistant` through success and error flows.
2. Press each reply keyboard and inline button. Confirm callbacks are acknowledged and have a result or an explicit error. Open old `?screen=billing`, `transactions`, `regular-payments`, and `settings` links in standalone Finance and check the intended screen.
3. In Telegram Mini App, open PLUS. Confirm four prices and introductory renewal disclosure, current status, history and cancellation. Confirm there is no Checkout or Stripe portal control. Attempt the API `checkout` and `portal` endpoints with a signed Mini App session and expect 403.
4. In an external browser, check landing links, registration, legal pages, preview frames, 320/768/1024/1440 px layouts, focus order, dark theme and UA/EN text. Verify billing offers against the Finance catalog. The CustomEvents `finance:pricing_view`, `finance:registration_start`, and `finance:checkout_start` are integration hooks only; no analytics destination is connected yet.
5. Before a live launch, verify the Stripe 7 UAH minimum against the account's UAH payout settings, complete the external browser identity bridge, complete legacy PRO/ULTIMATE entitlement migration, and test real Telegram delivery and billing in isolated TEST environments.

No live Telegram, Stripe, or production traffic was exercised by the repository tests.
