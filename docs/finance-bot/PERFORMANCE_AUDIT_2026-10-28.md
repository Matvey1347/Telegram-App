# Finance performance audit — 2026-10-28

## Scope and baseline limits

Finance is in a transitional state after Tasks 1–2. The standalone Next host renders the current Groshly UI, but authenticated startup, history, obligations and AI still call the Nexeloq consumer Finance API. The standalone Finance API has only foundation ledger, identity and billing routes. Independence from Nexeloq therefore cannot be verified or claimed for the complete product.

No representative authenticated staging session, seeded Finance database, SQL trace or browser Web Vitals run was available. LCP, INP, authenticated TTFB, backend p50/p95, SQL durations, and end-to-end route latency remain **unmeasured**. Do not infer them from build time or unit-test time.

The baseline source waterfall is:

1. `/` without a cached bot ID: `GET /api/finance/context`; `/finance/[botId]` skips this request.
2. Telegram/bootstrap or browser session: `POST /finance-bots/:botId/startup` on Nexeloq, then profile read and parallel account/category reads.
3. After authenticated startup, history plus debts, regular payments and investments load as four API reads in parallel. Login approval alone polls every 1.5 seconds while pending; there is no general Finance idle polling.

The initial `/` and `/finance/[botId]` client-reference manifests before this change each referenced six JS chunks: **492,055 raw bytes / 145,871 gzip bytes**. This counts the unique JS files in the manifest, not transfer headers, CSS, images or later dynamic chunks. The current monolithic Groshly UI source is about 203 KB uncompressed JSX and 125 KB CSS, so route-level code splitting needs a separate measured refactor.

## Changes and measured post-change facts

| Path | Change | Evidence | User latency result |
| --- | --- | --- | --- |
| Accounts, startup, dashboard and AI context that use `FinanceLedgerService.accounts` | Start account list, three grouped sums and optional profile read together; index grouped results once before building account views. | Same four primary SQL reads, optional profile read only when context is missing; DB dependency waves before rate preparation drop from two or three to one. Account assembly changes from repeated scans per account to linear work in account and grouped-row counts. | No authenticated DB timing available. |
| Web startup cache | Stop persisting the startup snapshot, which cannot be shown before server session verification. Dehydrate/persist only when a persisted query changes. | Provider unit tests cover the persistence predicate. Cache buster v3 discards the prior snapshot once. | Storage bytes and main-thread time not measured on a user dataset. |
| First-route JS | No UI bundle split in this change. | After build: six manifest JS chunks, **492,102 raw / 145,884 gzip bytes** for `/` and `/finance/[botId]` (+47 raw / +13 gzip). | No JS transfer improvement claimed. |

After the change, five warm localhost `curl` samples against the production Next server measured **HTML-only TTFB** p50: `/` 1.15 ms, `/finance/test-bot` 3.39 ms, `/view/home` 2.71 ms, `/view/history` 2.00 ms, `/view/accounts` 2.08 ms, `/view/analytics` 1.68 ms, `/view/recurring` 1.81 ms, `/view/subscription` 1.71 ms, `/view/ai` 1.65 ms. First requests were higher (up to 35.94 ms for the bot route). These unauthenticated local responses do not call Finance API and are not user-visible page-load benchmarks; there is no comparable pre-change TTFB series.

## Staging benchmark required before further optimization

Use the same authenticated profiles and environment for before/after runs: empty, about 100 and 10,000 transactions; 1, 20 and 100 accounts; representative debts, recurring payments and investments. For entry, home, transactions, accounts, analytics, planning, billing and AI, capture navigation TTFB/LCP/INP, JS/CSS transfer and parse, request waterfall, response bytes, server p50/p95, Prisma query count/duration and `EXPLAIN (ANALYZE, BUFFERS)` for slow reads. Include cold and warm starts and a browser login. The AI timing stream and opt-in probe are described in `AI_PERFORMANCE_AUDIT.md`.

Likely next bottlenecks to validate: eight parallel analytics aggregates over similar transaction ranges; repeated ownership checks in investment detail; substring history search without a proven trigram index; 1.5-second pending-login reads; and the shared Groshly UI bundle. Add an index or service only after the plans show a need. Finance balances must continue to refresh from the server after authentication and external changes.

## Runtime cost and manual QA

This change adds no network request, SQL query, timer, polling, background job, database write, or persistent log. At idle, even with 100 channels, it creates no Finance work. Concurrent grouped reads can increase instantaneous DB pool pressure under active load; compare p95 and pool waits on staging before rollout. Local cache writes are reduced, and no cache retention period is lengthened.

Manual QA: sign in by Telegram and browser, verify accounts with income, expense and both transfer directions in mixed currencies, verify startup balances against transaction history, switch identity and bot, reopen after an external transaction, test Billing and AI screens, and check loading/error/empty states. Keep Nexeloq running for the current consumer Finance routes until the standalone cutover is complete.
