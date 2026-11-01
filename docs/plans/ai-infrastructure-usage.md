# AI infrastructure, usage and cost control

Implemented 2026-10-31. Infrastructure only: no Copilot, discovery, qualification producer or Support conversation flow is enabled. No provider request or production migration was performed during implementation.

## Audit and boundaries

Existing live OpenAI integration and `FinanceAiUsage`/`FinanceAiProviderConfig` belong to consumer Finance/Groshly (`products/finance/api/ai`). Their profile/bot contracts and cost helpers do not provide internal workspace reservations, immutable pricing or operation deduplication. They are unchanged. The new internal gateway belongs to Operations, using shared Prisma, request-scoped workspace authorization, transaction advisory locks, configuration and the existing daily operational-history cleanup. It imports no consumer Finance implementation. Grace, Knuth and Parnas mapped these paths before edits; Turing reviewed integration afterwards.

Read prerequisites included root/API/web/shared agent guidance, product boundaries, runtime/cache efficiency, design system, and the audit/Inbox/notifications/sales-workflow plans. Existing five API TypeScript errors were reproduced before edits and remain unchanged afterwards.

## Contract and execution

`packages/shared/src/types/ai-configuration.ts` and `ai-usage.ts` define the registry/configuration and safe read DTOs. Server callers use `AiGateway.execute({userId,workspaceId,category,operationId,mode,input,businessObjectId?,signal?})`; there is deliberately no HTTP execute endpoint. `operations.executeAi` and the selected workspace are required; SALES/LEAD categories additionally require CRM view permission. Support is an independent category and does not borrow CRM permissions.

Flow: authorize → acquire one of eight process slots (immediate refusal, no queue) → workspace advisory-lock transaction → deduplicate, check flags/limits, reserve four budget buckets and create operation → commit → provider input-token counter → bounded generation → advisory-lock settlement transaction → return safe operation metadata and transient validated result. Transactions never wrap network calls. Request-scoped authorization does not turn the concurrency pool into a per-request pool.

OpenAI adapter uses Responses with strict fixed JSON schemas/AJV runtime validation, `store:false`, `background:false`, no tools, default service tier, disabled truncation and reasoning `none`. Input is capped at256KiB and configured token count; response at512KiB; input cap32768, output8000, timeout60s maximum. Exact model input is counted with the same payload via the [input-token endpoint](https://developers.openai.com/api/docs/guides/token-counting), after reservation. This sends input externally too and must be covered by the future use case's approved data basis. Counter output is not used as actual billed generation usage.

Provider failures become bounded error categories; private prompts, generated outputs, credentials and raw provider bodies are not logged or stored in telemetry. A SHA-256 request fingerprint detects conflicting reuse, not a stored transcript. HTTP read DTOs exclude actor, fingerprint, provider request ID, configuration snapshots and reconciliation evidence.

## Models and tariffs

Initial assignments: LEAD_AD_CLASSIFICATION, LEAD_CONTACT_EXTRACTION, LEAD_QUALIFICATION use `gpt-6-luna`; SALES_FIRST_DRAFT, SALES_REPLY_SUGGESTION, SALES_FOLLOW_UP, SALES_CONVERSATION_ANALYSIS and SUPPORT_ASSISTANT use `gpt-5.4-mini-2026-03-17`. These are provisional economical/personalization assignments; no quality benchmark or account availability was asserted. Every category and automatic flag defaults off; budgets default null; normal defaults are8k input/1k output (analysis2k),30s, concurrency2.

USD per million text tokens, verified against official documentation on2026-10-31:

| Model | Input | Cached read | Cache write | Output |
|---|---:|---:|---:|---:|
| [gpt-6-luna](https://developers.openai.com/api/docs/models/gpt-6-luna) |0.10|0.01|0.125|0.50|
| [gpt-5.4-mini snapshot](https://developers.openai.com/api/docs/models/gpt-5.4-mini) |0.75|0.075|unknown|4.50|

The registry version is `openai-standard-2026-10-31`; effectiveAt is this application's tariff activation date, not a claim about historical provider prices. Cache writes replace ordinary input billing, and reasoning tokens are already within output. Additional billing units, unknown cache-write rates, missing usage or a different returned model make pricing unknown and retain the reservation. See [pricing](https://developers.openai.com/api/docs/pricing), [caching](https://developers.openai.com/api/docs/guides/prompt-caching), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and [reasoning](https://developers.openai.com/api/docs/guides/reasoning).

Update prices only in the backend registry after checking official sources, recording a new version/activation date and regression fixtures. Do not silently rewrite old rows: each operation freezes its price/configuration snapshot. There is no client-controlled model URL, tariff, schema or prompt override. Standard short text/default tier only; tools, alternate service tiers and extended-context tariffs require explicit adapter/pricing work first. Returned model must match the configured ID exactly. An alias returning another snapshot fails closed; a separately authorized staging receipt check is required before future activation, followed by a verified pinned ID/price update if necessary.

## Accounting, deduplication and budgets

Money uses Decimal(24,12), USD only, and fixed12-place strings at API boundaries; counters use BigInt strings for aggregates. Usage includes input/output/cached-read/cache-write/reasoning/total and duration/status/error. Cached/reasoning subsets are validated; no character-based token estimation or floating point accumulation. Unknown cost stays null. Known-cost aggregates explicitly report unpriced/unknown usage counts; their average uses priced requests only. Failed calls can still be charged.

Operation ID is `YYYY-MM-DD:UUID`. A new ID must have today's UTC date. Workspace+ID is unique; matching retries return metadata without another provider call, conflicting payloads fail. Replays do not recover generated content: the future business use case must own result persistence. Details/replay window90days; after deletion an old ID still cannot become a new request because of its date prefix. No external exactly-once guarantee is claimed.

Workspace daily/monthly/max-request budgets are mandatory for manual admission; category caps can further restrict them. Automatic admission also requires both automatic flags and category daily/monthly budgets. Four lazily created UTC day/month buckets track workspace and category spend+reservations. Reservation uses conservative configured input/output maximums and cache-write exposure. Concurrent admission/setting changes/settlement share one workspace lock. Hard limits refuse before provider access; soft warnings come from used+reserved versus configured percentage. Config reads do not initialize rows, and unchanged edits do not write.

Limits:8 live operations/workspace, configured category limit<=8,8 network executions/process and32 unresolved operations/workspace. Provider timeout, missing/unpriced usage or settlement-write uncertainty retain the hold; deadlines never refund money automatically. No automatic retries. All-age held-operation mode makes old holds discoverable outside ordinary90-day filters. Administrators with `operations.manageAi` can reconcile UNKNOWN or stale RUNNING using independently verified actual USD and an opaque `invoice:`, `provider:` or `audit:` reference. This is an audited attestation, not a provider lookup; never infer zero from a timeout. Reconciliation is atomic, retracts the prior unknown rollup and prevents a second release. Actual over-reservation costs remain recorded and block later admissions when limits are exceeded.

## API, persistence and UI

Routes under `/operations/ai`: GET/PATCH config; PATCH categories/:category; GET usage; GET operations (cursor, maximum50); POST operations/:id/reconcile. Usage/history require `operations.viewAiUsage`; settings require `operations.manageAi`. Config-only managers can reach configuration without usage visibility. Workspace filters must match the selected authorized workspace; switch workspaces through the existing switcher. AI routes bypass the generic response cache to preserve current permission/configuration semantics.

Migration `20261031150000_internal_ai_infrastructure` adds AiWorkspaceConfig, AiCategoryConfig, AiOperation, AiBudgetPeriod and AiUsageDaily, with workspace FKs, uniqueness, read/cleanup indexes and nonnegative checks. It does not alter Finance tables. Prisma generation was run; migration was not applied to any database.

Settings → AI Usage contains fixed-period summaries, <=90-day UTC filters, daily chart, feature/model distributions, token breakdown, averages, budget balances/trend, cursor history and role-gated settings/reconciliation. Loading/empty/error/unpriced states are explicit. CRM navigation opens a lazy Sales-only monthly summary with category averages and dashboard link; no row or chat-switch requests. Config is fetched only on its tab. Workspace-aware query keys and mutation invalidation reuse the shared client patterns. No polling, focus-refetch provider work or production demo values.

## Source-level runtime cost

These are operation counts and capacity estimates, not Neon/Railway billing measurements. Existing authorization membership reads are cached per request and are additional to the counts below. Successful execution uses two bounded transactions: admission reads operation/config/category/three counts plus four bucket upserts; writes one operation and four reservation increments. Settlement reads one operation and mutates it, four buckets and one compact cube row. Period creation adds at most four bucket inserts. Admission makes16 Prisma/raw calls and priced settlement8, excluding authorization and transaction protocol; the SQL emitted by a Prisma upsert is runtime-dependent; logical steady-state row mutations are11/request, plus initialization. No unchanged config writes. Provider has one counter and at most one generation HTTP request; no retries.

| AI requests/day | DB calls/day | Steady mutations/day | Provider HTTP/day | Details after90days |
|---:|---:|---:|---:|---:|
|0|0|0|0|0|
|100|2,400|1,100|200|9,000|
|1,000|24,000|11,000|2,000|90,000|
|10,000|240,000|110,000|20,000|900,000|

Cube size depends on occupied workspace/day/category/model/status combinations, not calls. Dashboard uses one SQL aggregate over compact daily cubes plus at most32 outstanding raw operations, one outstanding-count query, workspace configuration and current budget rows (four logical queries; fifth with category configuration). It never loads raw90-day history into Node. First dashboard surface adds one cursor-page SQL read; next page adds one. Config tab adds two reads; CRM surface one dashboard request. No idle/channel-count dependence, so100 idle Telegram channels add zero AI execution queries, writes or network calls. No new connection pool, worker, Redis, cron or Railway deployment. Existing daily maintenance can wake Neon already; this slice does not independently wake it.

Retention reuses `operational_history.cleanup`: three bounded DELETE statements, at most20,000 rows/table/day, no drain loop. At zero AI this means three empty maintenance queries/day during the existing scheduled wake and zero deleted rows. Settled details, daily cubes and empty-reservation old periods expire after90days. UNKNOWN/RUNNING and their cube/budget anchors remain for explicit reconciliation;32/workspace admission cap bounds holds. The20k limit is global per table, not per workspace; many newly active workspaces or monthly budget rollover can temporarily accumulate old budget rows. Cleanup capacity covers10k new detail rows/day with2x headroom. Repeated backlog beyond20k expired rows/day requires operational review; capacity is not a promise for arbitrary workspace fanout. Cube retention protects old UNKNOWN dimensions to allow safe late retraction. No infinite prompt logs. Eight bounded concurrent responses cap raw response payloads near4MiB/process plus parsing/input/object overhead; this is a source bound, not measured total RSS.

## Setup, rollout and rollback

1. Review and apply this migration to a local/staging database using the existing deployment migration procedure; regenerate Prisma/build shared. Do not apply production implicitly.
2. Configure backend-only `INTERNAL_AI_OPENAI_API_KEY` through the deployment's secret manager. Never use NEXT_PUBLIC or copy a Finance key automatically. Deployment `INTERNAL_AI_ENABLED` defaults false unless exactly `true`; configured status exposes only a boolean. No startup request validates the secret.
3. Grant view/manage/execute permissions separately. Verify current workspace isolation and config-only roles. Set explicit workspace budgets/max request cost, then per-category limits/model. Keep all producer flags off: this stage has no producer even when configuration is enabled.
4. Verify tariffs/model receipts and data-source/privacy basis before any separately authorized future live smoke. No live test is part of this delivery. Follow the QA checklist and inspect query plans/retention lag on staging volumes.
5. Future rollout enables one approved server use case/category at a time after prompt-injection evaluation, consent/data minimization, domain permissions, quality/cost evaluation and result-persistence/idempotency integration. Telegram content is untrusted data; schema validation alone is not an injection defense. Gateway has no tools or Telegram-send capability.

Rollback: disable workspace/category flags and/or `INTERNAL_AI_ENABLED`; retain operation/budget data and held reservations for verified settlement. Roll back application code with the additive tables left intact; do not drop financial evidence or refund unresolved holds. Stop future producers before code rollback. A destructive down migration is intentionally absent. Consumer Finance continues on its own configuration and accounting.

Evidence, manual QA, screenshots and exact changed-file manifest: [QA handoff](../qa/ai-infrastructure/README.md).
