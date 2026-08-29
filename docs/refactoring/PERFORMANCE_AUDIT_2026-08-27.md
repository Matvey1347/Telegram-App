# Repository-Wide Performance Audit — 2026-08-27

## Outcome and evidence rules

This first-stage audit found severe multiplicative work in browser, API,
Consumer Finance and Telegram delivery paths, plus recurring P1/P2 issues and
one P0 System Bot crash-recovery guardrail. No production optimization, schema
change, cache, job, timer, service or recurring instrumentation was added. The
new Codex agents and this plan are development-only and create zero production
load.

The highest-confidence opportunities are to remove repeated work inside one
request: Ad Sales pricing, availability and analytics; the operations dashboard;
currency graph reuse; network/campaign fan-out; and cache invalidation. These
should be fixed before considering infrastructure changes. The hard constraint
is unchanged: Neon scale-to-zero, Railway topology/resource tier and idle
database activity must not be increased.

Counts in this document are static counts of explicit Prisma client operations,
browser HTTP operations or Telegram API operations visible in the current
working tree. One Prisma call is not necessarily one physical SQL statement
when relations/adapters are involved. Counts marked “lower bound” omit work
inside downstream helpers. No representative database, production trace, APM
baseline or payload capture was supplied, so this audit makes no millisecond,
throughput or byte-reduction claim.

## Actual runtime topology

### Browser requests

```text
Browser / React Query
  -> same-origin /api
  -> Next.js rewrite (production Railway gateway)
  -> http://127.0.0.1:4000/api
  -> Nest controller / workspace guard
  -> domain service
  -> PrismaPg adapter
  -> PostgreSQL / Neon
```

Evidence: `apps/web/next.config.ts:26-35`,
`apps/web/src/lib/http/api-base.ts:46-56`, `scripts/start-railway.mjs:64-77`,
and `apps/api/src/prisma/prisma.service.ts:16-37`.

Shared React Query defaults are generally cost-conscious: four-minute stale
time, 45-minute garbage collection, focus refetch disabled, reconnect refetch
enabled and one-second persistence throttling
(`apps/web/src/providers/query-provider.tsx:12-150`). The App Shell still adds
three cold-route requests for auth, workspaces and account context. Request-
scoped `WorkspaceService` does not memoize membership internally, so nested
public use cases can repeat resolution (`apps/api/src/common/workspace.service.ts:14-39,63-118`).

### Telegram updates

```text
Telegram webhook
  -> TelegramBotRuntimeService.handleWebhook()
  -> registry + webhook authorization
  -> TelegramBotUpdateLog idempotency claim
  -> product dispatcher (Finance / Greeter / other bot application)
  -> product database and Telegram API operations
  -> TelegramBotUpdateLog final status write
```

Evidence: `apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-runtime.service.ts:386-455,663-709`.
The idempotency claim/finalize writes are required behavior and are not candidates
for removal.

The System Bot has its own handler path under
`apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-handler.service.ts`.
Its callback acknowledgement is correctly early, but best-effort typing and
repeated context resolution are serial before useful work.

### Scheduled/background work

The operations scheduler and Telegram delivery scheduler use persisted due rows
and one-shot wake timers, not an idle polling loop. A lease-renewal interval
exists only while a scheduled task is actively running. Daily analytics and
workspace sync then iterate eligible channels/campaigns and call Telegram/domain
services. The optimization target is work per run, not a new scheduler.

Evidence: `apps/api/src/domains/operations/scheduled-tasks/scheduled-task-wake-timer.ts`,
`scheduled-task-runner.service.ts:136-154`,
`apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-delivery-scheduler.ts`,
`apps/api/src/domains/telegram/telegram-sync/daily-analytics-sync.service.ts:25-174`.

### Railway and Neon

`railway.json:5-12` builds and starts one Railway service.
`scripts/start-railway.mjs:64-77` spawns the API/bot process and Next process in
that same service/allocation. CPU, RAM and network pressure from SSR/static
serving, API requests, bot webhooks and scheduled work can therefore interfere
with one another. This audit does not recommend splitting the service; removing
backend fan-out, oversized JSON and unnecessary frontend refetch is the correct
first response.

Prisma constructs one `PrismaPg` adapter from `DATABASE_URL`, connects during
Nest module initialization and disconnects during teardown
(`apps/api/src/prisma/prisma.service.ts:16-37`). The repository passes only a
connection string; it declares no application-side pool size/timeouts. The
schema does not embed a URL and CLI resolution is in
`apps/api/prisma.config.ts:11-18`. Repository evidence cannot prove whether the
deployed URL is a Neon pooled endpoint or what Neon minimum-compute/scale-to-zero
settings are active. Those are manual verification items, and the URL/value
must never be printed in logs or audit output.

### Repository coverage map

| Area inspected                    | Principal runtime evidence                                                                     | Priority outcome                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Identity/workspace                | Auth/App Shell clients, account/workspace controllers and request-scoped membership resolution | No standalone multiplicative P0; shell requests and repeated nested membership feed PERF-12 |
| Internal Finance                  | Accounts/transactions/transfers/categories/currencies/dashboard                                | PERF-04 and PERF-17; currency sync reuse remains in scheduled-work follow-up                |
| Consumer Finance                  | HTTP identity/profile, ledger, proposal/chat flows and Finance Bot adapter                     | PERF-07 and pool-critical PERF-18; remains separate from internal Finance                   |
| Growth/Ads                        | Campaign/promo/hypothesis pages and campaign/admission services                                | PERF-10, PERF-12 and PERF-17                                                                |
| Ad Sales                          | Page/modal/query cache, controller/service/checkout/lifecycle/CRM and shared contracts         | PERF-01/02/03/05/06/20/22/26                                                                |
| Telegram channels/posts/networks  | Channel pages/read services, managed posts/calendar, sync and shared MTProto adapter           | PERF-09/11/12/23/24/26                                                                      |
| Telegram bot core/Finance/Greeter | Runtime claim/finalize, users, delivery, broadcasts, expiry and product handlers               | PERF-07/19/24/25                                                                            |
| System Bot                        | Dedicated runtime, handler, connection/workspace and workflow services                         | PERF-08 and correctness PERF-21                                                             |
| Operations                        | Dashboard, scheduled due/wake/runner, logs, retention, global search/trash                     | PERF-04/11/25 and logging note below                                                        |
| Deployment/database               | Railway build/start/proxy, PrismaPg lifecycle, schema/indexes                                  | PERF-15/16/25                                                                               |

## Priority register

| ID      | Priority | Path                                                | Dominant cost                             | Static scale signal                                                                         |
| ------- | -------- | --------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| PERF-19 | P0       | Greeter broadcast materialization/delivery          | DB, Telegram, duration                    | 1,000 recipients: at least about 8,041 explicit statements and about 1M status rows         |
| PERF-17 | P0       | Serial “load all pages” plus transaction GET writes | HTTP, DB, writes, payload                 | 1,000 items can create 100 serial HTTP pages; about `13P`, `7P` writes on transaction pages |
| PERF-01 | P0       | Ad Sales products by channels                       | DB, memory, payload                       | `3 + C + 2P`; about 903 Prisma calls at 100 channels/four defaults                          |
| PERF-02 | P0       | Ad Sales availability cache miss                    | DB, CPU, memory                           | lower bound `7 + 5C + H`; about 257/258 at 50 channels                                      |
| PERF-03 | P0       | Ad Sales analytics overview                         | DB, memory, CPU                           | selected-channel path about `23 + 3I + 13K`; about 119 calls at `I=K=6`                     |
| PERF-04 | P0       | Operations dashboard                                | DB, memory, CPU, payload                  | body `8 + L + F + 2A + X`, with `0 <= X <= 2A`, plus membership                             |
| PERF-18 | P0       | Consumer Finance confirmation transaction/rates     | DB pool, latency, memory                  | up to `4M` root reads and `2M` full rate-history loads while transaction is open            |
| PERF-20 | P0       | Ad Sale placement quote preview                     | HTTP, DB, writes, latency                 | exactly `C*D` serialized POSTs per quote-key change                                         |
| PERF-21 | P0       | System Bot update crash recovery                    | correctness/availability                  | a persisted PROCESSING row is treated as duplicate forever                                  |
| PERF-22 | P0       | Paginated Ad Sale cache reconciliation              | frontend correctness/memory               | creation/update can insert the sale into every cached page                                  |
| PERF-05 | P1       | Ad Sales mutation invalidation                      | HTTP, DB, network                         | 9 base invalidations + optional detail + 4 per channel                                      |
| PERF-06 | P1       | Ad Sales list/calendar read model                   | DB, memory, payload                       | relation volume per sale; calendar arbitrarily takes first 100 sales                        |
| PERF-07 | P1       | Finance Bot established-user/account paths          | latency, DB, network                      | accounts command lower bound about `10 + U` DB operations                                   |
| PERF-08 | P1       | System Bot context bootstrap                        | latency, DB, Telegram network             | 1 callback ack + 1 typing call + 3 context DB reads before command                          |
| PERF-09 | P1       | Channel-network financial list                      | DB, CPU                                   | per-network five-source financial/pricing fan-out                                           |
| PERF-10 | P1       | Campaign admission processing                       | DB, CPU, writes                           | per-campaign snapshots, per-post baseline reads, per-batch point work                       |
| PERF-11 | P1       | Daily/workspace sync                                | DB, Telegram network, duration            | admin-link N+1 plus up to 2 statements per changed post                                     |
| PERF-12 | P1       | Heavy frontend route bootstrap                      | HTTP, payload, CPU                        | Campaigns can reach 22 cold requests at 100 channels                                        |
| PERF-13 | P1       | Oversized production boundaries                     | developer risk, build/lint cost           | 70 production files over 500 LOC; current gate fails                                        |
| PERF-23 | P1       | Managed-post collection read side effects           | DB, MTProto, writes, latency              | every GET can reconcile, repair, renumber and load full collections                         |
| PERF-24 | P1       | MTProto connection churn                            | Telegram network, CPU, scheduled duration | about 2,100-2,200/day at 100 channels and the default 120-minute metrics interval           |
| PERF-25 | P1       | Startup/scheduler reconciliation                    | startup DB/Telegram, health               | 33 serial DDL statements; Finance presentation `6 + U` Telegram calls                       |
| PERF-26 | P1       | Ad lifecycle/deletion background detail hydration   | DB, MTProto, memory                       | 20 deletions serially reload metrics/detail even when caller ignores detail                 |
| PERF-14 | P2       | UI countdowns and bounded polling                   | browser CPU; conditional HTTP             | one-second Ad Sales rerenders; two state-gated polling sites                                |
| PERF-15 | P2       | Query/index plan verification                       | DB                                        | plausible candidates exist; no production-like `EXPLAIN` baseline                           |
| PERF-16 | P2       | Shared Railway/Neon configuration verification      | CPU/RAM/network/connections               | deployed pool/resource settings unavailable in repository                                   |
| PERF-27 | P2       | Persisted React Query payload                       | browser CPU/storage/startup               | full large query objects serialized to localStorage; no byte baseline                       |
| PERF-28 | P2       | Persisted slow-path warnings                        | DB writes/storage                         | every webhook >=1s and Finance context >=500ms can enqueue a retained warning               |

`C` = selected channels, `P` = returned products or paginated pages where the
finding defines it, `H` = optional managed-post metrics hydration call, `I` =
inventory channels, `K` = selected channel analytics (maximum six), `A` =
accounts, `L` = the optional dashboard invite-link lookup, `F` = distinct
non-identity dashboard campaign currency pairs, `X` = dashboard account FX
reads (`0 <= X <= 2A`), `D` = selected dates, `M` = confirmed Finance operations
(maximum ten), and `U` = users or distinct non-default account currencies as
defined by the finding.

By worst static scaling rather than observed frequency, the top five are:
Greeter delivery's quadratic status rows and at least about 8,041 statements at
1,000 recipients; serial all-page transaction reads and writes; product
pricing's roughly 903 calls at 100 channels; dashboard's maximum identified
path of about `409 + L + F` calls at 100 accounts; and availability's roughly
257/258 at 50 channels. Analytics overview follows at about 119 lower-bound
operations for six inventory and six comparison channels. Production frequency
and latency are unknown, so this is an implementation priority signal rather
than a claim about current p95 impact.

## Detailed findings

### PERF-01 — Ad Sales product pricing repeats channel history per product (P0)

1. **Files:** `apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales.service.ts:527-572,732-855,883-950,2561-2619`; `apps/api/prisma/schema.prisma:1487-1516,4163-4176`.
2. **Runtime path:** Ad Sale modal/detail -> `listProductsByChannels()` -> default products -> each product -> `buildProductPricingPreview()` -> product/window -> `computeExpectedViewsForWindow()` -> `loadPricingPosts()` -> post metric snapshots -> Neon.
3. **Why slow:** every product reloads its channel and up to 60 posts, and hydrates every metric snapshot relation for those posts. The same channel history is repeated for products whose only difference is pricing/window policy. The GET path also reads defaults once per channel and may `createMany` missing defaults.
4. **Affected resources:** request latency, Neon query/row load, Railway CPU and memory, Prisma serialization and response payload.
5. **Current operations:** one browser HTTP call and zero Telegram calls. The explicit Prisma-call model is approximately `3 + C + 2P`, plus up to one `createMany` for each channel missing defaults. With four defaults per channel this is about 12 calls at 1 channel, 93 at 10, 453 at 50 and 903 at 100.
6. **Scaling:** linear in products and channels, with row/memory amplification from unbounded snapshots per sampled post. Concurrent `Promise.all` shortens a serial waterfall but does not remove the database fan-out.
7. **Proposed fix:** resolve authorization/channels/products once; batch bounded posts and only the required snapshot observations for all channels; group by channel; compute all product windows from the request-scoped source. Materialize defaults in existing setup/bootstrap ownership, not a read.
8. **Correctness risk:** high around 24h/48h/72h/7d fallback semantics, manual/default price modes, insufficient samples and workspace isolation.
9. **Tests required:** operation-count fixtures for 1/10/50/100 channels; pricing equivalence for each window/fallback; zero writes on established GET; first-time default initialization through its explicit command; missing/deleted/inactive channel boundaries.
10. **Expected effect:** replace product-count database fan-out and repeated snapshot hydration with a small bounded set of reads; no wall-clock claim until measured.
11. **Recurring usage:** decreases Neon queries/rows and Railway CPU/RAM/network per request; adds no idle or recurring work.

### PERF-02 — availability combines N+1 reads, repeated settings and read-path writes (P0)

1. **Files:** `apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales.service.ts:621-681,1582-1637,3091-3504`; related models in `apps/api/prisma/schema.prisma:1487-1550,1691-1760`.
2. **Runtime path:** Ad Sales calendar/inventory -> availability HTTP endpoint -> channels/default products/placements/posts -> per channel policy -> workspace-settings resolver -> per channel pricing preview -> slot engine -> response.
3. **Why slow:** products, policy/settings and pricing are resolved inside the channel loop. Workspace settings use `upsert({ update: {} })`, turning a pure read into a possible insert/unchanged-state write. Nested day/slot code repeatedly filters placement/post arrays instead of grouped maps.
4. **Affected resources:** latency, Neon reads/writes, Railway CPU/memory and cache-miss payload preparation.
5. **Current operations:** one browser HTTP call, zero Telegram calls. With defaults already present, the explicit lower bound is `7 + 5C + H`: about 12/13 calls at 1 channel, 57/58 at 10 and 257/258 at the endpoint limit of 50. Missing defaults add up to `C` writes; a selected network adds another lookup.
6. **Scaling:** DB work is linear with channels and CPU can approach `C * days * slots * array-size` because of repeated filtering. The endpoint permits 50 channels and up to 93 days.
7. **Proposed fix:** load workspace settings/timezone once with read semantics; batch policies/products/channels/placements/posts/snapshots; group once by channel/date/product; derive slots from maps. Retain the existing short in-process cache only as a duplicate-request shield, not as the fix.
8. **Correctness risk:** high for timezone/DST, policy inheritance, organic/ad collision, network selection, past slots and managed/Telegram post state.
9. **Tests required:** 1/10/50-channel operation counts; zero-write GET; 93-day and DST boundaries; inherited/explicit policies; duplicate/collision behavior; managed metrics hydration; cache hit/miss equivalence and workspace isolation.
10. **Expected effect:** bounded database round trips, no unchanged-state write, lower allocation/filter CPU; no invented latency figure.
11. **Recurring usage:** lowers Neon/Railway use on calendar/inventory requests and does not add a job, cache service or refresh loop.

### PERF-03 — analytics overview reloads the same source range for each card (P0)

1. **Files:** `apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales.service.ts:1887-2015,3506-3683,3984-4032,4158-4400`.
2. **Runtime path:** Ad Sales analytics tab -> overview -> summary + revenue series + inventory + alerts + selected channel analytics -> repeated `adAnalyticsDataset()`/inventory/pricing reads -> Neon.
3. **Why slow:** `adAnalyticsDataset()` sequentially loads placements, payments and channels. Summary loads current and previous data; revenue reloads current; alerts reloads current and calls inventory again; each channel analytics reloads a channel-specific dataset and inventory/pricing context. All-time sources are not row-bounded.
4. **Affected resources:** latency, Neon row/query load, Railway memory/CPU and JSON serialization.
5. **Current operations:** one browser HTTP call, zero Telegram calls. The overview invokes `adAnalyticsDataset()` `4 + K` times. At six selected channels that is ten invocations and about 30 Prisma calls for datasets alone. With explicit channel IDs, the established-path estimate is approximately `23 + 3I + 13K`; at `I=K=6`, about 119 operations. Without channel IDs it is about `25 + 3I`; all-time adds three. Missing policies/defaults add conditional reads or writes. The same current workspace/range is fetched three times before channel cards.
6. **Scaling:** linear in selected channels and source rows; all-time memory/payload work grows with the complete placement/payment history.
7. **Proposed fix:** one authorized overview use case resolves the range once, loads current source once and a deliberate previous source/aggregate once, then derives summary/revenue/alerts/channel rollups. Load inventory/pricing once. Use specialized aggregates when they materially reduce rows instead of forcing a giant SQL query.
8. **Correctness risk:** high for period comparison, payment allocation, status/date inclusion, mixed currencies, channel attribution and all-time behavior.
9. **Tests required:** assert one current-source load; output equivalence for empty/current/previous/all-time/mixed-currency data; maximum channel selection; inventory/alert consistency; authorization/workspace boundaries.
10. **Expected effect:** removes repeated current-range hydration and duplicate inventory work; actual memory/time delta requires representative data.
11. **Recurring usage:** lowers per-overview Neon reads and Railway CPU/RAM; no materialized view, refresh task or persistent cache.

### PERF-04 — operations dashboard hydrates lifetime data and fans out per account (P0)

1. **Files:** `apps/api/src/domains/operations/dashboard/dashboard.service.ts:38-49,93-213,215-290,386-466`; `apps/api/src/common/currency-conversion.service.ts:19-101`; `apps/web/src/app/(internal)/page.tsx:114-119`.
2. **Runtime path:** internal dashboard -> summary HTTP request -> eight broad finance/growth datasets -> in-memory date filtering/series -> account loop -> two transfer aggregates and two currency conversions per account -> exchange-rate table -> response.
3. **Why slow:** even a normal 30-day request loads lifetime non-deleted transactions, campaigns/invite links and investments, then filters in JavaScript. Each account performs two transfer aggregate calls and up to two conversions; each conversion reloads all exchange-rate rows for the workspace. All-time defaults start in 2000 and can build roughly 9,700 daily buckets as of this audit date.
4. **Affected resources:** latency, Neon reads/rows, Railway CPU/RAM and response payload.
5. **Current operations:** the body is `8 + L + F + 2A + X`, where `L` is the optional invite-link lookup, `F` is the number of distinct non-identity campaign currency pairs and `0 <= X <= 2A` is account FX reads. Membership adds one, so the maximum identified API path is `9 + L + F + 4A`, or `409 + L + F` at 100 accounts. The browser also starts currency settings and rates alongside the dashboard request.
6. **Scaling:** financial/growth row volume scales with workspace lifetime; operations scale linearly with accounts; daily output scales with requested days.
7. **Proposed fix:** push date predicates and appropriate aggregates to PostgreSQL; group transfers for all accounts; load/build one request-scoped rate graph; bound series point density while preserving totals/range; keep compact card read models.
8. **Correctness risk:** high for income/expense signs, transfers, archived/deleted records, selected invite links, stale rates, currencies and all-time totals.
9. **Tests required:** 30-day versus lifetime row-selection assertions; 1/100-account Prisma counts; mixed-currency/stale-rate fixtures; transfers and campaign/investment totals; bounded all-time series with equivalent totals; workspace isolation.
10. **Expected effect:** bounded query count by account and far fewer rows/allocations for common periods; no latency number until benchmarked.
11. **Recurring usage:** reduces Neon and shared Railway load on every dashboard visit; no background precomputation or telemetry.

### PERF-05 — Ad Sales mutations invalidate unrelated query roots (P1)

1. **Files:** `apps/web/src/lib/features/growth/telegram-ad-sales-query.ts:14-132`; `apps/web/src/components/features/growth/ad-sales/ad-sales-page.tsx:794-809,870-876,932-940`; `apps/web/src/lib/features/growth/telegram-ad-sales-query.test.ts`.
2. **Runtime path:** sale/placement/payment mutation -> authoritative sale response -> local cache upsert -> broad invalidation -> React Query refetch of every active matching observer -> backend fan-out above.
3. **Why slow:** the helper invalidates the entire Ad Sales root plus analytics, availability, dashboard, transactions, accounts, channel list, currency settings/rates, detail and four channel-scoped families. Checkout first patches the sale and immediately invalidates it. Currency configuration cannot become stale from a sale mutation.
4. **Affected resources:** frontend work, HTTP/network, backend/Neon load and user-visible post-mutation settling.
5. **Current operations:** 9 base invalidation calls, optional detail, plus 4 per channel. At 50 placements this is up to 210 cache invalidation operations; actual HTTP refetch count depends on mounted observers/cache state and has no captured baseline.
6. **Scaling:** invalidation work scales with placements and active queries; the root match can mark unrelated preferences/settings/products/CRM data stale.
7. **Proposed fix:** define a mutation/staleness matrix. Reconcile authoritative sale responses into exact detail and matching list pages. Invalidate only derived sales/calendar/availability/analytics; add accounts/transactions/dashboard only for payment changes and managed-post/channel summaries only for scheduling/publish/delete changes.
8. **Correctness risk:** medium-high: under-invalidation can show stale finance, availability or Telegram state; filtered/paginated list insertion needs membership logic.
9. **Tests required:** exact query-key effects for content, schedule, status, payment create/update/void, attach/publish/delete and failure recovery; filtered pages; workspace switch; prove settings/rates/channel list are untouched.
10. **Expected effect:** fewer duplicate HTTP/backend requests and faster stable UI after mutation; measure with API-client counters.
11. **Recurring usage:** decreases request/Neon/Railway use; adds no polling or cache server.

### PERF-06 — sales list is still detail-heavy and calendar is not range-complete (P1)

1. **Files:** `apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales.service.ts:1081-1217,5480-5539`; `apps/web/src/components/features/growth/ad-sales/ad-sales-page.tsx:349-416,684-741`; `packages/shared/src/types/telegram-ad-sales.ts`.
2. **Runtime path:** sales/calendar tab -> paginated list endpoint -> sale list relation include -> placements/managed IDs/Telegram metrics/payment allocations/payments/member -> mapper -> shared full sale contract -> browser filtering/calendar derivation; detail modal separately calls detail endpoint.
3. **Why slow:** the list relation shape still transfers every placement and multiple payment/allocation/metric relations per sale even when a surface needs summaries. Calendar requests page 1 with `pageSize=100` rather than a date-bounded calendar contract, so later historical rows can be missed. Sales search filters only the current 25-row page client-side despite presenting itself as complete-history search.
4. **Affected resources:** Neon relation reads, API memory/serialization, network payload and browser parsing/memory; calendar completeness is also a correctness concern.
5. **Current operations:** list+count run in a transaction plus optional managed-metric hydration and advertiser lookup. The explicit call count is modest, but relation rows/payload scale with every placement/payment/allocation under each returned sale. Exact bytes were not captured.
6. **Scaling:** multiplicative relation volume per page; calendar coverage is capped by creation-order page size rather than requested date range.
7. **Proposed fix:** synchronized shared sales-row and date-bounded calendar read models with explicit `select`s; preserve compact nested placement/payment/member/icon summaries; leave complete edit data on detail; do not introduce frontend per-row joins.
8. **Correctness risk:** high because table actions/totals/status, calendar timers and modal seeds consume different subsets of the current full type.
9. **Tests required:** field-use/contract tests for table/calendar/detail/modals; more-than-100-sales range regression; server search beyond page 1; pagination/date boundaries; payment/status/timer summaries; payload excludes heavy media/technical fields; zero N+1 HTTP.
10. **Expected effect:** fewer DB relation rows and smaller serialized/list payloads while restoring range-complete calendar behavior.
11. **Recurring usage:** lowers Neon/Railway/network work on list/calendar reads; no recurring work added.

### PERF-07 — Finance Bot repeats actor/profile work and account views reload rate graphs (P1)

1. **Files:** `apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-runtime.service.ts:386-455,663-709`; `apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-users.service.ts:31-140`; `apps/api/src/domains/telegram/telegram-bots/finance/finance-bot.service.ts:69-113,545-717`; `apps/api/src/domains/telegram/consumer-finance/identity/finance-context.service.ts:153-195`; `apps/api/src/domains/telegram/consumer-finance/ledger/finance-ledger.service.ts:65-177`; `apps/api/src/common/currency-conversion.service.ts:19-101`.
2. **Runtime path:** Telegram update -> runtime claim -> callback ack if present -> user find/update-if-changed -> finance profile find/create-if-new -> command -> account/category/ledger/rate reads -> Telegram response -> runtime finalize.
3. **Why slow:** established users pay serial actor then profile lookups before command selection. The accounts view runs accounts + three aggregates + profile/workspace resolution, then sequentially calls conversion once per distinct currency; each conversion loads the workspace's complete rate history.
4. **Affected resources:** bot time-to-response, Neon reads, Railway CPU/memory and Telegram network critical path.
5. **Current operations:** an established quick proposal with registry cache hit/unchanged actor is up to 7 reads + 3 writes + 1 Telegram send; callback adds an acknowledgement and hourly actor touch can add one write. Established `/expense` has at least claim, user, profile, active accounts, flow-state persistence and finalize before presentation. `/accounts` is about `10 + U` DB operations including claim/finalize and one useful send. Required idempotency/log writes must remain.
6. **Scaling:** base latency is sequential per update; accounts DB work grows with distinct currencies and exchange-rate history, not just accounts.
7. **Proposed fix:** purpose-built established-actor/profile bootstrap that reads both context pieces together where possible and preserves conditional user updates/atomic first-use creation. Pass profile currency/workspace to ledger reads and build one request-scoped exchange-rate graph. Never cache mutable financial state across updates.
8. **Correctness risk:** high for first-use races/default creation, hourly activity touches, identity changes, bot/runtime scoping, finance freshness and callback idempotency.
9. **Tests required:** operation order/count for help/expense/accounts/callback; established unchanged user performs no user write; changed/new user behavior; concurrent profile creation; mixed/stale rates; runtime duplicate/finalize behavior and Telegram failures.
10. **Expected effect:** fewer serial reads before useful response and one rate-source load per command.
11. **Recurring usage:** lowers Neon/CPU per update; no stale financial cache, worker or extra Telegram call.

### PERF-08 — System Bot blocks on typing and resolves the connection twice (P1)

1. **Files:** `apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-handler.service.ts:87-160,322-417`; `apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-connections.service.ts:407-458`; corresponding specs under `apps/api/src/domains/telegram/telegram-system-bot`.
2. **Runtime path:** callback ack -> awaited `sendChatAction('typing')` -> enabled-connection query -> current-workspace helper re-reads connection -> membership/workspace query -> command -> Telegram response.
3. **Why slow:** best-effort typing is serial network I/O before authorization/useful action. Current workspace resolution re-reads the connection just obtained. `/help` and some menu actions resolve full workspace context before branches that do not need it.
4. **Affected resources:** time-to-first-useful Telegram action, DB reads and Telegram network.
5. **Current operations:** end-to-end `/help` is about 3 reads + 2 runtime writes with typing+reply; default/start/workspace menus are about 5 reads + 2 writes; generic text is about 9 reads + 2 writes because four workflow/draft probes and menu reads are serial. A normal callback adds an early acknowledgement, so typical callback paths have acknowledgement+typing+response Telegram calls. `/start` already bypasses the common handler context path.
6. **Scaling:** constant per update but high-frequency and serial; Telegram latency compounds DB latency.
7. **Proposed fix:** classify commands/callbacks by no context, connection only or membership/workspace. Reuse the authorized connection in current-workspace resolution. Skip typing for fast paths or dispatch it best-effort without awaiting it where safe.
8. **Correctness risk:** high around disabled connection, switched/deleted workspace membership, private-chat enforcement and callback response order.
9. **Tests required:** callback acknowledgement remains first; typing failure/latency does not block useful action; help has zero context reads; connection-only/workspace commands load exactly required context; stale membership rejected; switch-workspace behavior preserved.
10. **Expected effect:** removes one Telegram network wait and up to three unnecessary DB reads from context-free paths, and one duplicate connection read from workspace paths.
11. **Recurring usage:** decreases Telegram/API/Neon work per command; no background activity.

### PERF-09 — network list recomputes financial sources for each network (P1)

1. **Files:** `apps/api/src/domains/telegram/telegram-channel-networks/telegram-channel-networks.service.ts:189-398`; `apps/api/src/domains/telegram/telegram-channels/telegram-channel-financial-read.service.ts:27-137`.
2. **Runtime path:** channels or Ad Sales network selector -> network list -> each custom network -> financial read -> five Prisma datasets plus pricing windows -> response; system “all channels” network has a separate read path.
3. **Why slow:** `Promise.all(networks.map(enrichNetwork))` hides per-network database fan-out. Networks often overlap channels, so the same transactions/campaigns/ad-sales/pricing sources are re-read.
4. **Affected resources:** endpoint latency, Neon queries/rows, Railway CPU/memory and selector mount cost.
5. **Current operations:** list has base network/member reads; each custom network invokes at least five financial datasets plus pricing work. Exact lower-level pricing calls vary, so the safe expression is `base + G * (5 + pricing)` plus a separate system-network calculation; one browser HTTP, no Telegram calls.
6. **Scaling:** linear in networks and duplicated further by channel overlap.
7. **Proposed fix:** load the union of visible channels and all required financial/pricing sources once, group by channel, then derive network totals. Retain one response and workspace-scoped membership checks.
8. **Correctness risk:** medium-high for double counting, system-network membership, mixed currency and archived channels.
9. **Tests required:** 1/100 networks with overlap; one source load; system/custom totals; no double counting; empty/archived members; currency/pricing equivalence and workspace isolation.
10. **Expected effect:** database calls bounded independently of network count; row processing follows unique channels rather than repeated membership.
11. **Recurring usage:** lowers Neon/Railway work; no persistent network summary/cache.

### PERF-10 — campaign admission analytics nests campaign, event, post and batch queries (P1)

1. **Files:** `apps/api/src/domains/growth/ad-campaigns/ad-campaign-admission-analytics.service.ts:135-218,552-607,610-690,744-805`; `apps/api/src/domains/telegram/telegram-sync/daily-analytics-sync.service.ts:120-149`.
2. **Runtime path:** daily/manual campaign recalculation -> campaigns -> per campaign invite snapshots -> detected events -> batch creation/baseline -> per tracked post latest/earliest metric snapshot -> window reconciliation -> per batch view-point creation.
3. **Why slow:** snapshots are queried per campaign; baseline snapshots per post (with a second fallback query); reconciliation performs changed updates and delete calls per batch; then each batch reloads its own data/metric timestamp.
4. **Affected resources:** scheduled-run duration, Neon reads/writes, Railway CPU/memory and contention with web/API in the shared allocation.
5. **Current operations:** at minimum one campaigns query plus one snapshot query per campaign, with additional work per detected event, up to two queries per baseline post, per-batch reconciliation operations and per-batch view-point reads/writes. The exact event/batch count is data-dependent and has no captured production baseline.
6. **Scaling:** multiplicative in campaigns, invite events, tracked posts and admission batches.
7. **Proposed fix:** batch snapshots for selected campaigns; group in memory; fetch latest-before-cutoff/earliest-after-start for all candidate posts using bounded set queries/window functions; compute changed reconciliation sets and use bounded transactions/set operations; keep attribution semantics explicit.
8. **Correctness risk:** very high for fingerprints/idempotency, attribution windows, earliest-observed fallback, cumulative joins and changed-only writes.
9. **Tests required:** existing admission characterization plus operation counts; multiple simultaneous campaigns; bootstrap deltas; same-start windows; no-change rerun performs no writes; fallback snapshots; partial failure and transaction behavior.
10. **Expected effect:** removes campaign/post/batch query multiplication and shortens daily runs; must be proven on representative fixtures.
11. **Recurring usage:** lowers existing daily/manual Neon/Railway work; no new refresh job or materialized view.

### PERF-11 — sync runs batch poorly and query admin links per channel (P1)

1. **Files:** `apps/api/src/domains/telegram/telegram-sync/daily-analytics-sync.service.ts:52-160`; `apps/api/src/domains/telegram/telegram-sync/telegram-workspace-sync-tasks.service.ts:18-118`; `apps/api/src/domains/telegram/telegram-channels/telegram-post-metrics.service.ts:182-365`; `apps/api/src/domains/finance/currencies/currencies.service.ts:235-358`; `apps/api/src/common/run-bounded.ts`.
2. **Runtime path:** existing scheduled/manual run -> all requested workspaces -> eligible channels -> post metrics/per-post persistence/day aggregates -> per-channel admin link -> broadcast stats/Telegram API -> campaigns; currency task -> each workspace -> repeated external base-rate fetch/discovery/persistence.
3. **Why slow:** workspaces/channels/campaigns are processed sequentially; admin link is queried inside channel loops. Changed post metrics can perform up to two per-post statements plus per-day aggregates. Currency sync can fetch the same external base/day data separately per workspace. Total eligible work shares the Railway allocation with interactive traffic.
4. **Affected resources:** run duration, Neon queries, Telegram network, shared Railway CPU/RAM/network and interactive latency during a run.
5. **Current operations:** one workspace list, one channel list and one campaign list per workspace, plus one admin-link query for every stats-enabled channel and all downstream work. At 100 channels, admin links alone add 100 calls. With 100 changed posts on each of 100 channels, the post/snapshot portion can approach 20,000 per-post statements before day aggregates; this is a worst-case control-flow estimate.
6. **Scaling:** linear in eligible workspaces/channels/campaigns and changed posts, with repeated external rate sources by workspace; serial network waits extend duration. Daily eligibility legitimately includes all configured channels, so a new polling/due system is not proposed.
7. **Proposed fix:** query eligible channels across scope once where practical, batch first admin links, bulk changed post/snapshot persistence and affected-day aggregates, and use existing bounded concurrency with rate-limit/failure isolation. Coalesce identical external currency responses within one existing run while persisting workspace-specific results. Preserve one scheduler and changed-only semantics.
8. **Correctness risk:** high for Telegram flood limits, per-channel ordering, partial-failure accounting, canonical snapshot ownership and run status.
9. **Tests required:** 100-channel admin-link and 100-post operation counts; bounded maximum concurrency; one channel failure isolation; Telegram rate-limit retry semantics; unchanged metrics create no writes; post/audience snapshot de-duplication; identical currency base/day fetch reuse; run counters/status.
10. **Expected effect:** removes admin-link N+1 and reduces serial idle time without unbounded concurrency.
11. **Recurring usage:** lowers existing scheduled Neon work and duration; no additional schedule, worker or heartbeat.

### PERF-12 — heavy routes eagerly fetch data for inactive views (P1)

1. **Files:** `apps/web/src/app/(internal)/(growth)/ad-campaigns/page.tsx:134-160`; `apps/web/src/components/features/growth/ad-sales/ad-sales-page.tsx:280-416`; `apps/web/src/app/(internal)/(telegram)/telegram-channels/page.tsx:1728-1767`; `apps/web/src/app/(internal)/(telegram)/telegram/channels/[id]/page.tsx:364-469`; `apps/web/src/app/(internal)/(telegram)/telegram-posts/page.tsx`.
2. **Runtime path:** route mount -> multiple independent React Query observers -> same-origin HTTP -> several backend use cases, some of which fan out as documented above -> hydration/render.
3. **Why slow:** default Ad Campaigns starts several serial all-page chains and inactive-view data; hypotheses/promos are fetched even while campaigns are active. Ad Sales starts settings/rates/list plus all channel pages and extra calendar/analytics sources. Telegram channels starts 5 broad requests. Channel detail starts 7 base requests plus up to 3 persisted-open sections. Ad Sales analytics silently truncates selected channel IDs to six without a matching UI limit.
4. **Affected resources:** initial request concurrency, browser/network, backend/Neon work, JSON parse/memory and rerender load.
5. **Current operations:** static initial counts above; exact cache-hit/network counts depend on navigation history and have not been captured in a browser harness. Modal/detail queries are generally gated in Ad Sales, which should be preserved.
6. **Scaling:** route cost compounds backend fan-out and payload size; hidden datasets grow with workspace entities even if not displayed.
7. **Proposed fix:** gate inactive tab/modal queries, consolidate only genuinely co-rendered compact bootstrap data, reuse canonical query keys and seed detail from list summaries without duplicating requests. Never replace one backend response with row-by-row frontend joins.
8. **Correctness risk:** medium for tab switching, deep links, stale data, loading/error/empty states and workspace switches.
9. **Tests required:** API-client request counters per route/tab; hidden view zero requests until shown; no duplicate on tab return within freshness contract; deep-link/modal behavior; explicit analytics channel-selection limit or full selected output; loading/error/empty states; workspace-key isolation.
10. **Expected effect:** fewer initial HTTP/backend requests and less unused payload; browser timing must be measured after backend fixes.
11. **Recurring usage:** lowers user-driven Railway/Neon/network work; no higher refetch frequency.

### PERF-13 — oversized files now block safe optimization and the architecture gate (P1)

1. **Files:** the 70 current production files reported by `pnpm architecture:check`, led by the file-size table below; `scripts/check-architecture.mjs`.
2. **Runtime path:** not a direct production request; the structural debt crosses the exact hot paths above, making characterization, ownership and bounded edits harder and increasing build/lint/review cost.
3. **Why slow:** single files combine routing/query state/UI/domain calculation/persistence/network concerns; several grew past shrinking-only ceilings, and eight-plus files violate a hard limit without a valid allowance.
4. **Affected resources:** engineering/change latency and regression risk primarily; large client components also raise compiler/module parse and browser bundle risk, but no bundle attribution was measured.
5. **Current operations:** 70 production files exceed 500 checker lines. The architecture policy tests pass, but the checker fails on growth, hard-limit, stale-exception and one product-boundary issue. This audit does not change a ceiling.
6. **Scaling:** every feature edit increases coupled test/review surface; performance fixes inside 7,543/8,564-line owners are difficult to isolate.
7. **Proposed fix:** extract characterized use cases/components in the decomposition order below, keep stable facades/contracts, and lower/remove ceilings as files shrink. Do not split by arbitrary line ranges.
8. **Correctness risk:** high if stateful React closures or Prisma/Telegram transaction boundaries are moved mechanically.
9. **Tests required:** existing characterization suites plus facade/export parity, query-key behavior, operation counts, static import cycles and architecture checks after each extraction.
10. **Expected effect:** safer independent optimization and smaller compilation/review units; no runtime speed claim without bundle/CPU evidence.
11. **Recurring usage:** structural extraction itself must be runtime-neutral and add no process, request, query or timer.

### PERF-14 — countdown renders exist, while network polling is bounded to active state (P2)

1. **Files:** `apps/web/src/components/features/growth/ad-sales/ad-sales-sales-tab.tsx:224-239`; `apps/web/src/components/features/growth/ad-sales/ad-sales-sale-details-modal.tsx:81-103,527-541`; `apps/web/src/components/features/finance/consumer-finance/consumer-finance-login.tsx:33-48`; `apps/web/src/components/features/telegram/telegram-bots/greeter/greeter-broadcasts-section.tsx:51-60`.
2. **Runtime path:** visible countdowns -> one-second state updates -> rerender; pending browser login -> 1.5-second approval request; scheduled/processing Greeter broadcasts -> 5-second list refetch.
3. **Why slow:** sales-list countdown state rerenders the containing list every second while any future timer exists. The two HTTP polling sites consume backend work only during explicit pending/active states.
4. **Affected resources:** browser CPU/rendering; conditional HTTP/Neon work for the two polling workflows.
5. **Current operations:** one local one-second interval per mounted relevant component (and local fallback countdowns where no shared time is passed); login polls every 1.5 seconds only while pending; broadcasts every 5 seconds only while an item is scheduled/processing.
6. **Scaling:** countdown render cost grows with displayed rows; network polling is state-duration dependent and becomes zero after terminal state/unmount.
7. **Proposed fix:** profile before changing; if material, isolate a shared clock/countdown leaf so the list does not rerender. Keep the two bounded polling exceptions, add maximum/terminal/error behavior if missing, and do not introduce general refresh polling.
8. **Correctness risk:** low-medium around countdown boundary actions, background tabs and login/broadcast completion.
9. **Tests required:** interval cleanup, no polling in terminal/idle state, completion transition, due-time refresh and countdown display boundary.
10. **Expected effect:** possible browser CPU/render reduction; current polling is not an idle-system P0 and has no measured production cost.
11. **Recurring usage:** proposed isolation lowers browser work; no new backend requests. Existing state-gated polling remains unchanged unless measurement justifies a bounded refinement.

### PERF-15 — indexes must follow refactored predicates and measured plans (P2)

1. **Files:** `apps/api/prisma/schema.prisma:1487-1760,2049-2103,2785-2806,4163-4193`; list/availability/analytics query sites above.
2. **Runtime path:** Prisma filters/orderings -> PostgreSQL planner -> Neon index/heap reads.
3. **Why slow:** several hot queries have plausible index gaps, but current dominant cost is duplicate calls/rows. For example, sales default pagination orders within a workspace by creation/id while the closest composite includes status; rate graph queries load a workspace history; latest snapshots use the existing `[telegramPostId,collectedAt]` index.
4. **Affected resources:** Neon CPU/I/O and query latency.
5. **Current operations:** no production-like `EXPLAIN (ANALYZE, BUFFERS)` or row distributions are available. Existing indexes already cover many placement dates/statuses and snapshot lookup prefixes.
6. **Scaling:** missing/misaligned plans matter as rows grow, but extra indexes also increase every write/storage and can transfer cost.
7. **Proposed fix:** land read-model/batching changes first, then capture sanitized representative plans. Evaluate—not blindly add—`TelegramAdSale(workspaceId, createdAt, id)` and specialized latest-rate access; keep only plan-proven, non-duplicate indexes and migrate schema+SQL together.
8. **Correctness risk:** low for reads but medium operational risk from migration locks/build time and write amplification.
9. **Tests required:** before/after plans, migration on production-like volume, Prisma generation/validation, exact predicate/order coverage, duplicate-index audit and normal domain regression tests.
10. **Expected effect:** unknown until plans are measured; no speedup is claimed here.
11. **Recurring usage:** a proven index may reduce read cost but increase write/storage cost; accept only when net recurring Neon cost is justified without changing compute tier.

### PERF-16 — shared deployment and unknown production pool settings need verification (P2)

1. **Files:** `railway.json`; `scripts/start-railway.mjs`; `apps/web/next.config.ts`; `apps/api/src/prisma/prisma.service.ts`; `apps/api/prisma.config.ts`.
2. **Runtime path:** one Railway container supervisor -> Next + API/bots; browser `/api` proxy -> API; API PrismaPg -> deployed PostgreSQL URL.
3. **Why slow:** expensive SSR/API/bot/scheduled work competes in one allocation. A non-pooled or incorrectly limited production Neon URL could amplify connection overhead, but the repository does not expose deployed values.
4. **Affected resources:** Railway CPU/RAM/network and Neon connections/compute.
5. **Current operations:** one Railway service starts two child processes. App code supplies only `connectionString`; no explicit pool limits are visible. Deployed connection count/queueing is unknown.
6. **Scaling:** concurrent web/API/bot/jobs share one resource envelope; connection behavior scales with process concurrency and adapter defaults/environment.
7. **Proposed fix:** keep one service; first remove work in P0/P1 slices. Manually verify the deployed hostname is the intended Neon pooled endpoint, pool parameters are compatible with one API process, scale-to-zero remains enabled and minimum compute/resource tiers are unchanged. Never print the URL.
8. **Correctness risk:** high if deployment settings are changed blindly; no change is authorized by this audit.
9. **Tests required:** deployment artifact/start/health tests; graceful two-child shutdown; local proxy; controlled connection-concurrency observation without credentials; post-change smoke only if a human approves configuration changes.
10. **Expected effect:** verification prevents connection/topology mistakes; no performance claim without production evidence.
11. **Recurring usage:** no change. Adding services, replicas, higher compute, minimum compute or always-on workers is explicitly rejected.

### PERF-17 — serial “load every page” multiplies HTTP and transaction GETs provision defaults (P0)

1. **Files:** `apps/web/src/lib/api.ts:572-605`; callers across Finance/Growth/Telegram clients; `apps/web/src/app/(internal)/(finance)/categories/page.tsx:54-63,114-130`; `apps/api/src/domains/finance/transactions/transactions.service.ts:426-524`; `apps/api/src/domains/finance/finance-categories/finance-categories.service.ts:46-241`.
2. **Runtime path:** route/list query -> `getAllPaginatedItems()` -> first ten-row page -> serial HTTP request for every remaining page -> each transaction list request -> membership -> `ensureSystemCategories()` -> repeated upserts -> list/count/heavy relations -> browser-side aggregate/filter.
3. **Why slow:** a shared helper silently converts ordinary list calls into a sequential waterfall over the complete dataset. Categories downloads all transactions of a type merely to calculate counts/totals. Every transaction page also provisions seven system categories even on established read traffic.
4. **Affected resources:** route latency, browser/API network, Neon reads/writes, Railway serialization/CPU/memory and payload.
5. **Current operations:** if `N` rows use the backend default page size ten, `P=ceil(N/10)` serial HTTP requests result. A nonempty established transaction page is approximately 13 explicit Prisma operations: membership, nine system-category operations, list/count and purchased-channel attachment; about seven are upsert/write attempts, and duplicate cleanup can add more. At 1,000 transactions this is 100 serial requests, about 1,300 operations and about 700 write attempts. Counts are static estimates, not timings.
6. **Scaling:** linear in total historical rows and strictly serial in pages. Search-driven list queries can overlap because query functions do not pass React Query's abort signal; transaction search is not debounced.
7. **Proposed fix:** make lists explicitly paginated at the UI boundary, add purpose-built server aggregates for category/dashboard summaries, and batch compact selectors only where a bounded full set is truly required. Provision system categories during workspace setup/migration with an explicit idempotent owner; make GET pure.
8. **Correctness risk:** high for legacy workspaces missing defaults, aggregate filters/date/type semantics, sort/search and UI selection components that currently assume a complete array.
9. **Tests required:** established transaction GET performs zero writes; first-time workspace setup contains all defaults; 1/100/1,000-row HTTP/Prisma count tests; server aggregate equivalence; pagination/search/sort; cancellation/debounce and workspace isolation.
10. **Expected effect:** removes serial full-history downloads and hundreds of repeated write attempts from common reads; no wall-clock claim until browser/API measurement.
11. **Recurring usage:** materially decreases Neon writes/reads, Railway work and network payload; adds no precompute job or refresh loop.

### PERF-18 — Finance confirmation queries the root pool and full rate history while a transaction is open (P0)

1. **Files:** `apps/api/src/domains/telegram/consumer-finance/chat-flows/finance-proposal.service.ts:91-178`; `apps/api/src/domains/telegram/consumer-finance/ledger/finance-ledger.service.ts:187-279,671-739`; `apps/api/src/common/currency-conversion.service.ts:19-101`; `apps/api/prisma/schema.prisma:4178-4193`.
2. **Runtime path:** Finance proposal confirm -> interactive Prisma transaction/claim -> up to ten operations -> account/category reads on transaction client -> valuation/default snapshot -> root `PrismaService` workspace lookup and exchange-rate history queries -> transaction create -> finalize proposal.
3. **Why slow:** the transaction holds one connection while valuation helpers use the root client, potentially waiting for additional pool connections. `valuation()` and `legacyDefaultSnapshot()` run in parallel and each can re-resolve workspace plus load every workspace rate row; this repeats for every operation. This is a small-pool starvation/deadlock-shaped risk, even though no PostgreSQL lock deadlock was measured.
4. **Affected resources:** Finance confirmation latency/availability, DB pool occupancy, Neon rows/I/O and Railway memory/CPU.
5. **Current operations:** for `M <= 10` confirmed operations, conversions can add up to `4M` root Prisma reads and `2M` full-rate-history hydrations while the transaction remains open, on top of proposal claim/account/category/item/create writes. At `M=10`, that is up to 40 extra reads and 20 full histories.
6. **Scaling:** linear in operations and multiplicative in rate-history rows; concurrency can exhaust a small adapter pool and hold transactions longer.
7. **Proposed fix:** thread the existing `ProfileContext.workspaceId` through proposal confirmation instead of narrowing it away; resolve the exact current/historical rate source once before the interactive transaction, with bounded latest-per-pair/as-of semantics; pass an immutable request-scoped rate resolver/snapshots into transaction writes. Batch account/category validation where semantics allow.
8. **Correctness risk:** very high for historical as-of rates, current-versus-past cutoff, USD/default dual valuation, atomic multi-operation confirmation, duplicate confirmation and workspace/product isolation.
9. **Tests required:** `M=1/10` operation counts; constrained-pool concurrency integration; current/historical/missing/stale rate fixtures; duplicate confirm; rollback; values identical before/after; no root Prisma calls from inside transaction callback.
10. **Expected effect:** shorter transaction/pool occupancy and bounded rate-row hydration; representative concurrency measurement is required before quantifying latency.
11. **Recurring usage:** decreases Neon reads and Railway/pool pressure per Finance write; no cross-request financial cache or increased compute.

### PERF-19 — Greeter broadcast delivery has quadratic reconciliation and serial materialization (P0)

1. **Files:** `apps/api/src/domains/telegram/telegram-bots/greeter/greeter-broadcast.service.ts:253-418`; `apps/api/src/domains/telegram/telegram-bots/greeter/greeter-broadcast-audience.service.ts:24-106`; `apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-delivery.service.ts:144-155,205-266,292-335,430-456`.
2. **Runtime path:** due broadcast -> unbounded audience -> recipient `createMany` -> first 250 recipients -> per recipient enqueue then link -> delivery wake -> batch find -> per-delivery CAS claim -> serial Telegram send -> three finalization writes -> reload recipient and every status for that broadcast after every send.
3. **Why slow:** delivery claiming is one read plus `N` sequential claims, recipient queueing is roughly two sequential statements each, and terminal reconciliation scans all `B` recipient statuses after every completed delivery. The last pattern is Θ(`B²`) rows.
4. **Affected resources:** scheduled duration, Neon statements/rows, Telegram throughput, shared Railway CPU/RAM/network and potential interactive interference.
5. **Current operations:** after recipients are queued, delivery is approximately `ceil(B/25) + 6B + 1` explicit DB statements, plus `B` Telegram sends and approximately `B²` status rows read. Queue/link materialization adds roughly `2B` statements, so a 1,000-recipient successful end-to-end path is at least about 8,041 statements, 1,000 sends and 1,000,000 status rows, before dispatch/audience overhead. Audience resolution and `createMany(B)` also repeat for each 250-recipient dispatch wave.
6. **Scaling:** statements are linear but status-row processing is quadratic; sends are intentionally rate-limited/serial today.
7. **Proposed fix:** atomic bounded claim using PostgreSQL row locking/update-returning semantics; cursor/batch audience materialization; grouped status counts or atomic terminal counters; reconcile once per touched broadcast/batch rather than every delivery. Keep bounded Telegram concurrency and lease/cancel races explicit.
8. **Correctness risk:** very high for exactly-once idempotency, expired lease reclaim, cancellation after enqueue, blocked users, partial failures and multi-process claims.
9. **Tests required:** PostgreSQL concurrency for atomic claims; 1/25/1,000-recipient count/row scaling; crash/lease reclaim; cancel races; duplicate audience; blocked/missing chat; exact final status/counters; Telegram retry-after/failure isolation.
10. **Expected effect:** change recipient-status work from quadratic to linear/bounded and drastically reduce statements; Telegram sends remain one per recipient by product requirement.
11. **Recurring usage:** lowers existing Neon/Railway delivery work; does not add a worker, queue service, heartbeat or faster polling.

### PERF-20 — Ad Sale modal serially POSTs and persists one quote per placement (P0)

1. **Files:** `apps/web/src/components/features/growth/ad-sales/ad-sale-modal.tsx:497-556,609-711`; `apps/web/src/lib/features/growth/telegram-ad-sales-api.ts:394-401`; `apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales.controller.ts:224-230`; `apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales.service.ts:2938-3055`.
2. **Runtime path:** selected channels x dates -> placement drafts -> quote-key effect -> `for ... of` awaited POST per placement -> membership/channel/product/pricing posts/snapshots -> guaranteed `TelegramAdPriceSnapshot.create`; an info-level application log is conditional on logging configuration and is dropped at the production-default warn minimum -> next placement.
3. **Why slow:** every reactive quote-key change produces exactly one serialized round trip per valid placement. Each backend call repeats authorization/channel/product/pricing work from PERF-01 and persists a price snapshot even though the user may still be editing the draft.
4. **Affected resources:** modal time-to-stable-price, browser/API network, Neon reads/writes/storage and Railway CPU/memory; configured info-log persistence can add writes but is not the default.
5. **Current operations:** exactly `Q=C*D` serial HTTP POSTs per quote-key change, up to 100 channels times selected dates. Each successful quote has at least membership, channel, optional product, pricing source and one snapshot write; fallback pricing can repeat preview reads. Exact DB total is data-dependent.
6. **Scaling:** multiplicative in channels and dates and serial in network latency; repeated edits/currency/time changes create new waves and snapshots.
7. **Proposed fix:** add one workspace-scoped bulk quote/preview use case with a server-validated placement/channel cap, bounded pricing posts and bounded snapshot selection. Return keyed results and per-item failures under a response-size contract; do not wrap the whole batch in one long transaction. Characterize whether draft snapshots are required; if not, persist the accepted quote at checkout. If required, batch them deliberately once per request.
8. **Correctness risk:** high for per-placement warnings/fallbacks, user edits while a response is in flight, cancellation/stale response suppression, currencies and auditable snapshot identity.
9. **Tests required:** `C*D=1/100/contract-maximum` one-HTTP assertion and over-limit rejection before hydration; bounded post/snapshot rows and response shape; partial failure; response-key ordering; abort/stale key; same quote values; snapshot retention semantics; workspace/channel/product authorization and checkout link.
10. **Expected effect:** one HTTP request and bounded pricing-source reads replace serialized placement waterfalls; DB write reduction depends on the approved snapshot contract.
11. **Recurring usage:** lowers user-driven network/Neon/Railway work; no persistent cache or background quote refresh.

### PERF-21 — System Bot cannot reclaim an update left PROCESSING by a crash (P0 correctness guardrail)

1. **Files:** `apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-runtime.service.ts:66-127`; compare generic bot reclaim in `apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-runtime.service.ts:663-708`; System Bot runtime specs.
2. **Runtime path:** System Bot webhook -> create unique update log -> handler -> process crashes before final status -> Telegram retries -> unique violation -> existing row lookup -> unconditional `DUPLICATE` -> useful action never runs.
3. **Why slow:** this is not a latency optimization; it is a correctness precondition. A permanently stuck idempotency claim loses an update and makes retries return quickly but incorrectly.
4. **Affected resources:** bot availability/correctness and support/retry behavior; DB operations are small.
5. **Current operations:** normal update has one claim write and one finalize write. A duplicate retry adds one lookup. There is zero stale-claim CAS/reclaim operation in the System Bot path.
6. **Scaling:** one crash window can affect any in-flight update; impact scales with deploy/crash concurrency, not tenant rows.
7. **Proposed fix:** mirror the generic runtime's bounded stale-PROCESSING reclaim using an atomic age/status CAS while retaining terminal duplicates. Decide and test the safe timeout; never optimize away claim/finalize.
8. **Correctness risk:** very high because too-early reclaim can double-execute finance/post/workspace actions, while no reclaim loses them.
9. **Tests required:** crash-stale reclaim, fresh PROCESSING duplicate, PROCESSED/FAILED duplicate, concurrent reclaim winner, idempotent command side effects and workspace/secret isolation.
10. **Expected effect:** restores eventual processing after a crash; it is not claimed as a speedup.
11. **Recurring usage:** normal path unchanged; one CAS only on stale retry, with no polling or heartbeat.

### PERF-22 — Ad Sale cache upsert inserts an item into every cached page (P0 correctness guardrail)

1. **Files:** `apps/web/src/lib/features/growth/telegram-ad-sales-query.ts:60-89`; `apps/web/src/lib/features/growth/telegram-ad-sales-query.test.ts:41-64`; paginated sales queries in `apps/web/src/components/features/growth/ad-sales/ad-sales-page.tsx:349-408`.
2. **Runtime path:** authoritative create/update response -> `setQueriesData` for every key under sales -> if item absent, prepend and increment total on that page -> render/search/calendar cache.
3. **Why slow:** every cached page is traversed/rewritten, and absence is treated as creation membership. A created or updated sale can appear at the front of page 2+ or in a nonmatching filtered scope. Replicating `totalItems` across pages of the same matching scope is valid metadata; incrementing unrelated scopes or inserting the entity into every page is the corruption.
4. **Affected resources:** frontend correctness, cache memory/renders and later refetch churn; indirect backend load when invalidation repairs the corruption.
5. **Current operations:** one detail cache write plus one transformation per cached sales query. With `R` cached pages/scopes, up to `R` arrays are rebuilt and every absent page is mutated; HTTP count is zero until the subsequent broad invalidation.
6. **Scaling:** linear in cached pages and scopes; correctness degrades with pagination/filter diversity.
7. **Proposed fix:** compare old/new scope membership on update: replace containing pages, remove proven nonmatches, and narrowly invalidate scopes whose membership/order cannot be derived. On create, insert only into page 1 of scopes whose server filter/order membership can be proven; otherwise invalidate that exact collection. Reconcile per-scope totals once and keep detail exact.
8. **Correctness risk:** high for page totals/order, status/advertiser/calendar scopes and delete/move between filters.
9. **Tests required:** page 1/page 2 creation and update; old/new filter membership and reorder; item absent/present; same-scope versus unrelated-scope totals; deletion/status transition; calendar cache; authoritative response followed by narrow invalidation.
10. **Expected effect:** correct pagination with less cache rewriting and less need for repair refetches.
11. **Recurring usage:** lowers browser/refetch work; no backend/cache infrastructure change.

### PERF-23 — managed-post collection/calendar GETs can reconcile, repair and write before reading (P1)

1. **Files:** `apps/api/src/domains/telegram/telegram-channels/telegram-managed-post-query.service.ts:116-170,219-331`; `apps/api/src/domains/telegram/telegram-channels/telegram-managed-post-auto-repair.service.ts:25-251`; `apps/api/src/domains/telegram/telegram-channels/telegram-post-group.store.ts:386-403`; `apps/api/src/domains/telegram/telegram-channels/telegram-managed-post-calendar.service.ts:22-167`; frontend `apps/web/src/app/(internal)/(telegram)/telegram-posts/page.tsx:1070-1181`.
2. **Runtime path:** Posts editor/calendar query -> managed-post GET -> due reconciliation -> auto-repair (possible MTProto/writes) -> numbering normalization -> load all managed and Telegram posts -> combine detail objects. Calendar runs reconciliation before checking its 15-second cache.
3. **Why slow:** read requests own maintenance side effects and full unpaginated collections. A cache hit can still perform DB/MTProto work before the cache lookup. Calendar results invalidate/refetch managed posts and all groups, creating self-induced duplicate reads on initial/month navigation.
4. **Affected resources:** page latency, Neon reads/writes, MTProto network, Railway memory/payload and frontend request volume.
5. **Current operations:** at least workspace/channel resolution, reconciliation, repair/normalization checks and two full post collections; exact writes/Telegram calls depend on drift. Frontend calendar can add one managed-post GET plus another serial all-groups chain per response.
6. **Scaling:** grows with all posts/groups in the channel and drift needing repair; cache cannot shield pre-cache work.
7. **Proposed fix:** move repair/reconciliation to existing due/event ownership and make GET pure; check calendar cache before source reads; add paginated/status/range-specific read models; remove unconditional calendar-success invalidation when authoritative result can update exact cache.
8. **Correctness risk:** very high for due publish/delete timing, remote/local drift, numbering, group ordering and fresh calendar state.
9. **Tests required:** pure GET/no writes/no MTProto; cache hit zero DB source calls; due worker/event convergence; drift repair; pagination/range; calendar initial/month request counts; no lost due refresh.
10. **Expected effect:** removes maintenance from interactive reads and bounds payloads; due work remains in existing runtime owners.
11. **Recurring usage:** lowers request Neon/Telegram work and does not add a scheduler/poller.

### PERF-24 — MTProto public operations repeatedly connect and disconnect (P1)

1. **Files:** `apps/api/src/telegram/shared/telegram-mtproto.client.ts:543-607` and public operations around `1837-2007,3277-3580`; `apps/api/src/domains/telegram/telegram-channels/telegram-channel-sync.orchestrator.ts:115-405`; `apps/api/src/domains/operations/scheduled-tasks/scheduled-task-registry.service.ts:30-112`.
2. **Runtime path:** channel sync/task -> individual historical/posts/invites/stats/media MTProto helper -> create/connect client -> operation -> disconnect -> next helper repeats for same account/channel/run.
3. **Why slow:** full sync performs approximately six or seven session handshakes per channel; historical selection can fetch posts and all invites even when only one source was requested. Frequent metrics/stats tasks repeat short-lived connections.
4. **Affected resources:** Telegram latency/network, Railway CPU/RAM/network, task duration and flood/session risk.
5. **Current operations:** let `S` be full-sync connections per channel (about six or seven) and `m` the editable metrics interval in minutes (1-1,440). The schedule/control-flow estimate is `(S + 3 + 1440/m) * C` short-lived connections per day. At `C=100` and the default `m=120`, this is about 2,100-2,200; the deployed interval and selection are unknown, so this is not a production measurement or upper bound.
6. **Scaling:** linear in channels times selected operations/frequency; handshakes and authentication dominate small data operations.
7. **Proposed fix:** operation-scoped client/session reuse for one account/channel sync pipeline with `finally` disconnect, explicit requested historical selectors, and bounded concurrency by account. Do not create an unsafe global always-connected client.
8. **Correctness risk:** very high for session concurrency, flood waits, account authorization, disconnect on error and entity cache scope.
9. **Tests required:** client-create/connect/disconnect counts at 1/100 channels; posts-only/invites-only selectors; failure cleanup; bounded concurrency; flood-wait/session invalidation and result equivalence.
10. **Expected effect:** far fewer Telegram handshakes and shorter existing sync runs; actual latency needs controlled Telegram measurement.
11. **Recurring usage:** lowers Railway network/CPU and Telegram connection churn; no always-on session/worker.

### PERF-25 — deployment startup and scheduler reconciliation perform broad no-work activity (P1)

1. **Files:** `apps/api/src/common/schema-bootstrap.service.ts:8-217`; `apps/api/src/common/common.module.ts`; `apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-runtime.service.ts:56-74,457-545`; `apps/api/src/domains/telegram/telegram-bots/finance/finance-telegram-presentation.service.ts:90-92`; `apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-runtime-presentation.service.ts:20-45`; `apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-runtime-user-presentation.service.ts:24-66`; `apps/api/src/domains/operations/scheduled-tasks/scheduled-tasks.service.ts:72-160,302-390`; `apps/api/src/domains/operations/scheduled-tasks/due-task-schedule.ts`.
2. **Runtime path:** Railway API boot -> runtime schema bootstrap DDL -> scheduled-task default upserts/recovery/rearm -> bot runtime load -> webhook/presentation reconciliation -> Finance commands/menu -> all reachable users -> per-chat menu; active tick -> execute due key -> refresh all due families.
3. **Why slow:** migrations already run in Railway predeploy, yet boot executes 33 serial defensive DDL statements. Finance presentation makes fixed global calls and per-user menu calls on every reconciliation. Scheduler startup/list materializes defaults with upserts; after a tick it refreshes five due families regardless of the key that ran.
4. **Affected resources:** Railway health/start time, Neon wake/DDL/write load, Telegram network, deploy reliability and shared service restart fate.
5. **Current operations:** 33 serial DDL statements per API boot. Finance presentation is `6 + U` Telegram calls plus conditional webhook work for `U` reachable users. Scheduler startup is approximately 30 Prisma calls/seven upserts; a due tick rearm is about 22 reads across five families by static derivation.
6. **Scaling:** presentation grows with reachable bot users; task configuration grows with workspaces; deploys/restarts repeat all work even if configuration is unchanged.
7. **Proposed fix:** make migrations the schema owner and retain only an explicitly justified compatibility check; version/fingerprint presentation and keep per-user reconciliation off health-critical boot using existing due/manual ownership; materialize defaults explicitly and rearm only affected due keys with bounded pages.
8. **Correctness risk:** high for safe deploys across schema versions, webhook/menu consistency, due-task wake correctness and Neon sleeping startup.
9. **Tests required:** Railway artifact/predeploy/start/health; schema compatibility from supported previous migration; presentation version changes/unchanged zero calls; user batches/failure; scheduler startup/list zero unchanged writes; affected-key rearm and missed-due recovery.
10. **Expected effect:** less cold-start DB/Telegram work and faster path to health; no startup time is claimed without deployment measurement.
11. **Recurring usage:** lowers deploy/restart and tick load; no new daemon, polling, heartbeat or persistence beyond an approved existing-version field if required.

### PERF-26 — Ad placement lifecycle/deletion hydrates heavy detail in bounded background batches (P1)

1. **Files:** `apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales.service.ts:7036-7167,7354-7410`; `apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-placement-metrics.ts:14-90`; `apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-placement-lifecycle.service.ts:13-70`; `apps/api/src/domains/operations/scheduled-tasks/scheduled-task-executor.service.ts:58-69`.
2. **Runtime path:** existing due task -> up to 100 lifecycle or 20 deletion placements -> per placement reload sale/managed/Telegram relations -> load all metric snapshots and select nearest in JS -> remote delete -> local transaction -> return full sale detail that batch caller ignores.
3. **Why slow:** bounded batches still do serial per-placement reads and full metric history hydration. Background callers pay rich interactive-detail mapping after each successful deletion. Placements from the same sale/channel/source are not grouped.
4. **Affected resources:** scheduled duration, Neon reads/rows, MTProto/Bot API network, Railway memory/CPU and interference.
5. **Current operations:** lifecycle can process 100 rows and perform roughly two per-placement statements in the simple path; deletion handles 20 serially with heavy relation/metric/detail work and one remote operation each. Exact count depends on state and is not fully derivable without helper instrumentation.
6. **Scaling:** linear in due placements and metric-history length, with repeated sale/channel/source hydration.
7. **Proposed fix:** a compact background outcome mode; batch necessary placement/sale/managed state; query bounded nearest/latest snapshots in set operations; group transport where Telegram semantics allow; preserve remote-delete-before-local-terminal ordering.
8. **Correctness risk:** very high for remote/local compensation, idempotency, planned delete, missing post, metrics cutoff and sale cache/detail contracts.
9. **Tests required:** 20-deletion/100-lifecycle counts; zero full-detail calls in background; bounded snapshots; same-sale grouping; remote success/local failure compensation; retries/missing posts and due-index `EXPLAIN`.
10. **Expected effect:** fewer background DB rows/calls and allocations while preserving bounded task work.
11. **Recurring usage:** lowers existing scheduled Neon/Railway/Telegram work; no new task or faster frequency.

### PERF-27 — persisted React Query state can serialize very large feature payloads (P2)

1. **Files:** `apps/web/src/providers/query-provider.tsx:12-150`; large managed-post/channel/campaign/product query families and the route files above.
2. **Runtime path:** React Query success/update -> persistence throttle -> synchronous localStorage serialization -> next startup read/parse/hydrate -> component cache observers.
3. **Why slow:** the persistence allowlist includes full channels, managed posts, groups, notes, campaigns and products; large text/images/multi-page arrays can be serialized on the main thread and retained for 45 minutes. No byte cap/measurement is documented.
4. **Affected resources:** browser main-thread CPU, memory, localStorage quota and startup hydration.
5. **Current operations:** at most one persistence write per one-second throttle while cache changes, plus startup read/parse. Exact bytes and time are not captured.
6. **Scaling:** serialized work grows with cached entity count and payload depth, especially full managed posts and multi-page arrays.
7. **Proposed fix:** add development-only byte/timing measurement; persist only compact, stable, workspace-scoped data that materially improves navigation; exclude heavy/volatile detail and multi-page collections or persist normalized summaries. Preserve security/privacy constraints.
8. **Correctness risk:** medium for offline-like navigation expectations, stale workspace data, version migration and hydration flashes.
9. **Tests required:** persistence allowlist and workspace key/version; quota/parse failure fallback; excluded heavy families; no duplicate HTTP beyond the defined stale contract; measure representative payload bytes before/after.
10. **Expected effect:** potentially lower browser serialization/startup cost; no improvement is claimed without the byte/timing baseline.
11. **Recurring usage:** browser-only reduction; must not increase backend refetch volume, so exclusions require appropriate stale-time/dedup tests.

### PERF-28 — ordinary slow-path warnings become retained database writes (P2)

1. **Files:** `apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-runtime.service.ts:426-438`; `apps/api/src/domains/telegram/telegram-bots/finance/finance-bot-observability.ts:5-13`; `apps/api/src/domains/operations/application-logs/application-logger.service.ts:62-75,95-203`; `apps/api/src/domains/operations/application-logs/application-log-writer.service.ts:64-149`; `apps/api/src/domains/operations/application-logs/application-logging.config.ts`.
2. **Runtime path:** successful webhook/context crosses fixed duration threshold -> Nest warning -> application logger -> in-memory batch -> Prisma application-log insert -> retention cleanup.
3. **Why slow:** production defaults persist warnings. Legitimately slow AI/voice/Telegram paths can therefore turn successful request latency into recurring DB writes, even when no operator action follows.
4. **Affected resources:** Neon writes/storage/retention deletes and minor Railway queue/serialization work.
5. **Current operations:** at most one slow-webhook warning per generic webhook and one slow-context warning per Finance update crossing its threshold, batched with other logs. Actual rate and batch/write count are unknown; normal successful HTTP DB logging is otherwise disabled by default.
6. **Scaling:** linear in slow update volume; fixed thresholds may classify expected external-network work as warnings.
7. **Proposed fix:** first measure existing warning cardinality from authorized read-only logs. Retain errors and actionable slow stages; if noisy, use process-local bounded sampling or console-only detail and persist a small actionable subset. Do not add aggregates, telemetry tables or recurring writes.
8. **Correctness risk:** medium operational risk: over-reduction can hide regressions/security failures; logging must continue sanitizing tokens/invite references.
9. **Tests required:** production minimum-level behavior; batching/retention; threshold/sampling bounds; errors always retained; sensitive-data redaction; zero log when below threshold.
10. **Expected effect:** unknown until cardinality is measured; potential reduction in successful-request log writes/storage.
11. **Recurring usage:** can only decrease existing usage. No new telemetry, job or retention extension is allowed.

## Frontend request/cache audit summary

- A cold internal route also pays three shared shell requests: `/auth/me`,
  `/workspaces` and `/account/me` (`apps/web/src/hooks/use-auth.ts:26-31`,
  `apps/web/src/components/layout/app-shell.tsx:72-79`). Route counts below are
  additional unless explicitly called total.
- `getAllPaginatedItems()` uses ten-row backend pages and awaits every page
  serially. At 100 channels, a cold Campaigns route is at least 22 total HTTP
  requests if the other lists fit one page; Ad Sales Sales is 16 total and
  Calendar/Analytics is 18 total. These are control-flow counts, not traces.
- Ad Sales has useful gating for accounts, System Bot connection, products and
  detail data. Preserve it. Its weak point is broad post-mutation invalidation
  and use of a full sales list as a calendar source. Its modal also serializes
  one quote POST per placement, and current cache reconciliation corrupts
  paginated membership.
- Ad Campaigns always starts selected workspace, currencies, performance,
  advertising people and all-page chains for channels/accounts/campaigns/
  hypotheses/promos; hypotheses and promos are inactive-view data. Two closed
  campaign modals also mount account/people queries (deduped by key, but still
  unnecessary). Its 2,490-line page makes lifecycle hard to test.
- Telegram channels launches channel list, network financial list, currency
  settings, rates and advertising people regardless of selected top-level tab;
  the channel response is fixed at 100 and the UI has no pagination.
- Channel detail launches analytics, detail, audience, financial summary,
  audience snapshots, settings and rates, then up to three persisted-open
  sections. A compact composite overview may be valid only if all seven outputs
  are always rendered; otherwise gate by section. Do not replace them with
  client N+1.
- Posts editor loads channel selection, managed posts, emoji packs, members and
  all post-group/prompt-note pages. Calendar adds calendar+availability, then
  invalidates managed posts/groups after each response; Groups retains editor-
  only sources. Split route bundles and query ownership before tuning renders.
- MTProto account panels start one closed-modal channel-access query per account;
  network detail loads all selectable channels for a closed edit modal. Gate
  both by interaction.
- Only two `refetchInterval` sites exist under `apps/web/src`: Finance browser
  login while approval is pending, and Greeter broadcasts while scheduled or
  processing. Neither polls while idle. Managed-post due refresh uses one-shot
  timers/retries rather than interval polling.
- No browser timing, bundle analyzer or captured payload baseline was available.
  Slice P-00 must record request count and response bytes/shapes locally before
  claiming frontend improvement.

## Backend/database/bot audit summary

- Read-path writes occur in Ad Sales default-product and workspace-setting
  resolution, internal transaction system-category provisioning, managed-post
  repair/normalization and scheduled-task default materialization. These must
  move to explicit setup/due-work ownership.
- The largest repeated hydration is `TelegramPost.metricSnapshots`: pricing
  loads all snapshots for up to 60 posts per product, while batch latest-window
  selection can preserve semantics with much less data.
- Currency conversion builds a well-bounded in-memory graph once per method
  call, but callers invoke it repeatedly. The graph should be request-scoped,
  not globally cached, because financial/rate freshness must remain explicit.
  Consumer Finance confirmation must also resolve rates before opening the
  interactive transaction rather than querying the root pool from inside it.
- Bot runtime update claim/finalize, callback acknowledgement and durable
  delivery claims are correctness work, not waste. Optimize around them. The
  System Bot runtime is missing the generic runtime's stale-PROCESSING reclaim
  and must gain a concurrency-safe crash-recovery test before handler tuning.
- System Bot and Finance Bot have purpose-built bootstrap opportunities without
  sharing internal Finance and Consumer Finance implementations across product
  boundaries.
- Greeter broadcast reconciliation is the strongest bot multiplicative path:
  whole-recipient status scans after every delivery produce quadratic rows.
- MTProto clients should be reused only within a bounded sync operation; a
  globally connected session would transfer cost/risk and violates the intent.
- Existing due schedulers are one-shot/persisted rather than polling. Daily sync
  is expected recurring product work; reduce its per-run fan-out and writes
  instead of adding another worker/schedule.
- No transaction was proven to remain open over a Telegram/AI network call in
  the mandatory paths. One Consumer Finance transaction does remain open over
  root-pool database/rate hydration; fix that and keep external network calls
  outside transactions as a regression check.
- API boot executes 33 serial compatibility DDL statements after Railway's
  predeploy migrations, and Finance presentation can issue `6 + U` Telegram
  calls. Version-gate or move unchanged reconciliation off the health-critical
  path without adding an always-on worker.

## File-size audit from the current working tree

The checker counts physical lines with the same method as
`scripts/check-architecture.mjs`. `pnpm architecture:check` reports 70 production
files above 500 lines and currently fails. “Grown” means the file exceeds its
shrinking-only allowance; “hard” means it has no sufficient allowance and is
over its applicable hard policy. Existing tests are named as coverage assets,
not proof that every extraction seam is characterized.

| Current LOC / status                                           | File and responsibilities                                                                                                                                                                    | Cohesive extraction seams / dependencies / coverage                                                                                                                                                                                                                  | Order                        |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 8,564; page hard 300; allowance 8,156, grown                   | `apps/web/src/app/(internal)/(telegram)/telegram-posts/page.tsx`: route/query orchestration, managed-post list/calendar, composer, groups, drag/reorder, modals, due refresh                 | Thin route + feature container; query controller; list/calendar; composer state; group manager; modals. Depends on Telegram API/query keys/editor/preview. Calendar/scheduler/numbering/export tests exist, but page-state characterization must precede extraction. | 7, after backend/read models |
| 7,543; hard 800; allowance 5,851, grown                        | `apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales.service.ts`: setup/pricing/products, availability/inventory, sales/payment mapping, analytics, automation/CRM integration | First extract pure pricing source/calculator, availability reader and analytics dataset/read models behind stable providers; then sales list/detail mapping. Many Ad Sales domain/service specs exist. Preserve Prisma transactions/workspace checks.                | 1                            |
| 4,170; page hard 300; allowance 3,969, grown                   | `apps/web/src/app/(internal)/(telegram)/telegram/channels/[id]/page.tsx`: overview analytics/audience/finance, settings, posts, invites, campaigns, sync actions                             | Thin route; overview cards; settings form; three paginated sections; mutation controller. Depends on channel/campaign/currency APIs and shared UI. Backend channel characterization exists; add page request/state tests.                                            | 6                            |
| 3,603; hard 800; allowance 3,536, grown                        | `apps/api/src/telegram/shared/telegram-mtproto.client.ts`: sessions, entity/source resolution, messages, scheduling, media, invites/stats and protocol errors                                | Keep a stable facade and split protocol operations by messages/media/invites/stats/session; do last because many domains depend on adapter semantics. `telegram-mtproto.client.spec.ts` and publish specs exist.                                                     | 10                           |
| 3,415; page hard 300; allowance 3,363, grown                   | `apps/web/src/app/(internal)/(telegram)/telegram-channels/page.tsx`: tabs, channel/network/person queries, cards/tables, import/sync, analyses and forms                                     | Thin route + tab/query container; channel lifecycle table; network manager; advertising-people panel; import/sync/analysis modals. Depends on several product APIs. Add route request-count/tab tests.                                                               | 6                            |
| 2,490; page hard 300; allowance 2,490                          | `apps/web/src/app/(internal)/(growth)/ad-campaigns/page.tsx`: campaign/promo/hypothesis tabs, eight-query bootstrap, filters/tables and many modal flows                                     | Thin route; tab-specific query containers; campaign command modals; promo/hypothesis features. Depends on growth APIs/currency/channel selectors. Campaigns-table tests exist; route request gating needs coverage.                                                  | 5                            |
| 2,194; hard 800; allowance 1,936, grown                        | `apps/web/src/components/ui/primitives.tsx`: unrelated buttons, inputs, selects, overlays/table/layout primitives                                                                            | One file per cohesive primitive family and a small compatibility barrel. High fan-in requires export parity. `primitives.test.tsx` exists; component catalog/brand guide are authoritative.                                                                          | 8                            |
| 1,859; hard 800; allowance 1,859                               | `apps/api/src/domains/growth/ad-campaigns/ad-campaigns.service.ts`: campaign reads/commands, Telegram link/channel orchestration, analytics/status                                           | Split read models, commands and external Telegram orchestration behind current controller; coordinate with admission analytics. Service/analytics specs exist.                                                                                                       | 5                            |
| 1,610; hard 800; allowance 1,122, grown                        | `apps/web/src/components/features/growth/ad-sales/ad-sales-page.tsx`: tab queries, selection/preferences, modal state, checkout and invalidation                                             | Page shell + tab query adapters; checkout controller; modal state; mutation reconciliation. Extensive Ad Sales component/query tests exist. Extract after shared contracts/invalidation matrix.                                                                      | 2                            |
| 1,343; hard 800; allowance 799, grown                          | `apps/web/src/components/features/growth/ad-sales/ad-sale-modal.tsx`: sale/payment/placement form, product/channel selection, validation and System Bot/shared-post flow                     | Form state/controller; buyer/payment section; placements editor; shared-post integration. Draft/modal/shared-post tests exist; keep submit payload contract characterized.                                                                                           | 3                            |
| 1,242; hard 800; allowance 1,243, stale lower ceiling required | `apps/web/src/components/features/growth/ad-campaigns/campaigns-table.tsx`: table formatting, sort/filter/cells, row actions and analytics modals                                            | Extract columns/cells, row actions and analytics/detail presenters; keep one table container. Component test exists. Lower the stale allowance in its own safe slice.                                                                                                | 5                            |
| 1,174; hard 800; no allowance                                  | `apps/web/src/components/features/growth/ad-sales/ad-sales-sale-details-modal.tsx`: detail presentation, editing, payments/actions and placement timers                                      | Read-only summary, edit form, payments and placement lifecycle sections; share one clock. Detail modal/action tests exist.                                                                                                                                           | 3                            |
| 579; warning over 500                                          | `apps/web/src/components/features/growth/ad-sales/ad-sales-analytics-panel.tsx`: overview query/range/channel controls and analytics card/chart composition                                  | Separate query/range controller from summary/revenue/inventory/alert presentations after the shared backend overview contract lands. Analytics output/request-count coverage is required.                                                                            | 4                            |
| 569; warning over 500                                          | `apps/web/src/components/features/growth/ad-sales/ad-sales-clients-table.tsx`: CRM advertiser table, cells, sorting/actions and responsive presentation                                      | Extract column/cell and row-action presenters while keeping the Growth-owned CRM query layer. Existing clients-table/panel tests provide a base.                                                                                                                     | 4                            |
| 533; warning over 500                                          | `apps/web/src/components/features/growth/ad-sales/ad-sales-sales-tab.tsx`: sales table, filters/actions, lifecycle/payment/metric cells and countdown clock                                  | Extract compact row presenters/action menu and a countdown leaf only after the sales-row contract is characterized. Existing sales-tab/lifecycle tests cover key behavior.                                                                                           | 3                            |

Additional current hard/growth failures that intersect performance work include
`telegram-ad-sales-crm-advertisers.service.ts` (913), Ad Sales `dto.ts` (866),
Ad Sales controller (809), transactions service (891, grown), Telegram channels
controller (880, grown), post calendar planner (845), shared Ad Sales types (882,
grown), `apps/web/src/lib/features/telegram/telegram-channels-api.ts` (966), and
`apps/web/src/lib/api.ts` (783, grown past its 400-line facade allowance).

The check also correctly reports stale allowances where files shrank; those
must be lowered/removed, not used to offset unrelated growth. It reports a
Consumer Finance product-boundary import from its icon picker into shared
Telegram System product UI; this audit does not silently waive or refactor that
unrelated production issue.

## Ordered implementation slices

The authoritative acceptance criteria are in the new performance workstream in
`PROJECT_REFACTOR_EXEC_PLAN.md`. The order is:

1. P-00: test/development-only operation-count and response-shape baselines.
2. P-01: System Bot crash reclaim, context reuse and useful-action ordering.
3. P-02: Consumer Finance profile/rate context outside interactive transactions.
4. P-03: atomic delivery claims and linear Greeter broadcast reconciliation.
5. P-04: replace serial load-all chains and make internal transaction GET pure.
6. P-05: batch Ad Sales pricing inputs and bulk placement quote previews.
7. P-06: batch availability/settings/policies and group CPU inputs.
8. P-07: share Ad Sales analytics source datasets/inventory within the request.
9. P-08: bound dashboard sources, group transfers and reuse one rate graph.
10. P-09: synchronize compact sales-row/range-calendar/search contracts.
11. P-10: repair cache pagination, narrow invalidation and gate hidden queries.
12. P-11: make managed-post/calendar GETs pure and bounded.
13. P-12: batch networks/campaigns/sync, reuse operation-scoped MTProto clients
    and compact Ad lifecycle/deletion work.
14. P-13: remove unchanged startup/schema/presentation/scheduler work.
15. P-14: only then accept schema+migration indexes that measured `EXPLAIN`
    plans prove useful.
16. P-15: finish cohesive decomposition, Parnas structural review and Turing
    integration review.

Backend and frontend write agents must receive one agreed request/response
contract and non-overlapping files. Ad Sales/MTProto extractions must shrink the
existing owners; no new god service, compatibility fork or upward baseline is
acceptable.

## Production information that remains unverified

- The deployed `DATABASE_URL` hostname/pooled-versus-direct Neon architecture,
  URL pool parameters and actual connection utilization/queueing.
- Neon scale-to-zero/minimum compute settings, compute history, query plans and
  row-count/data-distribution statistics.
- Railway CPU/RAM/network baselines, process-level attribution and whether bot/
  scheduled bursts currently affect Next/API latency.
- Browser/API p50/p95/p99 timings, route waterfall traces, cache-hit ratios,
  response bytes and JS bundle/module attribution.
- Telegram Bot API/MTProto latency/rate-limit distribution and real update mix.
- Actual tenant/channel/product/account/network/campaign/snapshot cardinalities
  and retention volumes.

These require read-only production observability or sanitized production-like
fixtures and explicit human authorization for any environment inspection. They
do not justify guessing, exposing secrets or raising infrastructure resources.

## Verification record

All commands below were run against the 2026-08-27 working tree. This audit
changes only development-agent configuration and documentation, so failures in
production TypeScript/tests are current repository baseline failures rather
than changes introduced by the audit.

| Command                                         | Result                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm architecture:check`                       | Failed after all 16 architecture-policy tests passed. The live checker reports 827 production TS/TSX files, 70 over 500 lines, 28 over 800, 17 over 1,000, 7 over 2,000, 5 over 3,000 and 9 App Router pages over 300. Current failures include grown/hard/page/facade limits, stale shrinking-only allowances and one product-boundary import. |
| `ARCHITECTURE_STRICT=1 pnpm architecture:check` | Failed on the same current oversized/boundary debt with transitional allowances disabled; all 16 policy tests passed first.                                                                                                                                                                                                                     |
| `pnpm typecheck`                                | Shared passed; API failed on seven existing spec-only type errors, so the root chain stopped before web. Direct `pnpm --filter web typecheck` passed. The API errors are in Ad Sales bot-command/checkout specs, Telegram Channels DTO, System Bot option layout and post preview.                                                              |
| `pnpm lint`                                     | Failed on current lint debt. Web reports 334 problems (181 errors, 153 warnings). A direct API error-only run, `pnpm --filter api exec eslint "{src,apps,libs,test}/**/*.ts" --quiet`, reports 6,750 errors. Shared lint passed.                                                                                                                |
| `pnpm test:api`                                 | Failed: 198/202 suites and 1,212/1,222 tests passed; 4 suites and 10 tests failed. Failures cover System Bot Ad Sale member options, Ad Sales placement time expectation, managed publication characterization and the Ad Sales bot-command executor fixture.                                                                                   |
| `pnpm test:web`                                 | Failed: 120/123 files and 532/539 tests passed; 3 files and 7 tests failed. Failures cover Ad Sale modal/menu interactions, channel economics currency controls and a Greeter React Query mock missing `keepPreviousData`.                                                                                                                      |
| `pnpm test:deployment`                          | Passed: 9/9 tests, plus Railway production artifact and Node runtime import validation.                                                                                                                                                                                                                                                         |
| `pnpm db:generate`                              | Passed with Prisma Client 7.8.0.                                                                                                                                                                                                                                                                                                                |
| `pnpm --filter api exec prisma validate`        | Passed. Prisma emitted the existing warning about `onDelete: SetNull` on a relation whose referenced field is required.                                                                                                                                                                                                                         |
| `pnpm build`                                    | Passed for shared, Nest API and the Next production build (31 static-generation pages completed).                                                                                                                                                                                                                                               |
| `git diff --check`                              | Passed.                                                                                                                                                                                                                                                                                                                                         |

The Knuth and Parnas reviews are read-only. Parnas additionally parsed all seven
agent TOMLs, verified the lifecycle wiring and confirmed that no production,
schema, architecture-checker, exception or shrinking-baseline file changed.
