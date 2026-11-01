# Neon / Railway / AI evidence

No production or staging load was generated. The disposable PostgreSQL exercise proves migration/constraint behavior on synthetic rows, not representative query performance. No production connection string was used. SQL counts below are source-level logical calls, not measured physical SQL round trips.

## Observed versus estimated

| Item | Actual observation / status | Source or follow-up |
| --- | --- | --- |
| PostgreSQL migrations/constraints |Executed on new local PostgreSQL17, forward fixture passed, drift0; clean-empty chain failed |[Migration evidence](migrations/README.md) |
| API/web build and tests |Executed; exact status in main QA and command evidence |[QA](README.md), [failure classification](failure-classification.md) |
| Browser layout/network |Fixture-intercepted checks; no feature idle writes/provider calls; not production latency |[Browser report](browser-report.json) |
| Neon SQL count/time/p50/p95/BUFFERS |NOT MEASURED |Controlled staging, representative cardinality and concurrent roles required |
| Pool/connections/storage/lock contention |NOT MEASURED |PrismaPg is constructed with connectionString only; no explicit pool cap/timeouts configured in repository |
| Railway idle CPU/RSS/socket/egress/latency |NOT MEASURED |Existing account lease/socket/SSE baseline must be captured before enabling features |
| Paid model quality/tokens/actual USD |NOT RUN |No approved provider evaluation/budget supplied; offline corpus checks are not generated-output quality scores |

[Prisma pool boundary](../../../apps/api/src/prisma/prisma.service.ts), [runtime lease](../../../apps/api/src/domains/telegram/telegram-crm/telegram-crm-runtime-lease.service.ts), [runtime queue policy](../../../apps/api/src/domains/telegram/telegram-crm/telegram-crm-runtime.policy.ts).

## Idle and concurrency

An enabled CRM runtime holds one shared persistent lease renewed every30s, TTL90s: approximately2,880 renewal writes/day even at0 messages. This is once for the runtime, not per account/conversation. It protects the StringSession and must not be removed to claim Neon sleep. Stopping the last account currently does not release the lease; shutdown does. Disable/drain all accounts and restart for rollback; serialized last-account lease lifecycle remains P2.

New manual/AI features add no recurring history polling, AI invocation, Redis/cache deployment, worker or per-conversation MTProto connection. Feature-disabled execution is default-deny, while existing daily cleanup still performs bounded maintenance queries even if tables are empty; empty cleanup deletes zero rows. Accounts/sources are bounded in the existing runtime/registry. An idle disabled feature is not proof that the whole application has zero DB traffic.

Fresh SSE delivery now performs one membership/role read plus up to two batched current-resource owner reads per nonempty at-most100-event authorization batch/client. No idle authorization timer/query is added. The queue holds at most512 waiting events plus one at-most100 active batch per connection; overflow closes for existing reconnect reconciliation. For isolated bursts at100/1,000 messages/day, the upper logical read estimate is300/3,000 per visible client, or1,500/15,000 with five clients; multiple emitted events can coalesce; larger bursts split into100-event authorization batches. The512 waiting-event limit accommodates the existing100-update post-commit fanout without routinely closing the stream. These are extra security-boundary reads, not a claim that the entire incoming-message path costs three queries. Measure fanout/pool contention; initial pilot should limit concurrent visible clients rather than promise arbitrary SSE scale.

Fresh manual send and locked merge add explicit authorization refreshes. Merge refresh currently uses the ordinary request-scoped Prisma loader while its transaction holds row locks; saturated pool contention/deadlock behavior needs staging concurrency validation. DNC/price/budget/permission safety was not weakened to reduce calls.

## Workload scenarios

| Work/day | Gateway~24 logical calls/op | Conversation Copilot~56/op | Qualification/draft~54–69/op | Classify+extract~62/material |
| --- | ---: | ---: | ---: | ---: |
|50 |1,200 |2,800 |2,700–3,450 |3,100 |
|500 |12,000 |28,000 |27,000–34,500 |31,000 |
|2,000 |48,000 |112,000 |108,000–138,000 |124,000 |

Producer estimates already include Gateway work: do not sum the Gateway column again. Each successful operation ordinarily makes token-count and generation requests:100/1,000/4,000 provider HTTP requests for50/500/2,000 operations, before failures. Explicit Analyze can request two operations/material; qualification and first draft are separately explicit. Defaults are zero automatic paid calls. Current source guards may add constant reads beyond older estimates.

For100/1,000 daily incoming messages, work follows existing bounded batches, notification policy and visible consumers. Sparse events do not all form full100-message batches. Inspect actual emitted SQL; no measured per-message DB count/p50/p95 is asserted. Message history remains50-row cursor pages, no refetchInterval; unchanged metadata snapshots avoid writes. Edits/reactions re-read only affected Telegram IDs, never all history.

Discovery limits:1,000 sources/workspace,10,000 active sources/process,1,000 pending source/message identities,100/batch; automatic reconnect recovery20 sources/account/pass and two accounts concurrently.100/1,000-source configurations require explicit recovery of excess GAP sources and do not prove complete NO_ADS_30D coverage. Daily ingest cap10,000 observations/workspace; retention90days, global observation cleanup20,000/day. One saturated workspace can retain roughly900,000 observations; three saturated workspaces create30,000/day against20,000 cleanup after expiry, a10,000/day backlog. Two saturated workspaces leave no headroom. Source analytics/derived filtering scans retained evidence and JSONB/lateral aggregates despite paginated responses; no speculative cache was added.

[Lead policy](../../../apps/api/src/domains/telegram/telegram-crm/lead-discovery/lead-policy.service.ts), [monitor](../../../apps/api/src/domains/telegram/telegram-crm/lead-discovery/lead-monitor.service.ts), [retention](../../../apps/api/src/domains/telegram/telegram-crm/lead-discovery/lead-retention.service.ts), [source metrics](../../../apps/api/src/domains/telegram/telegram-crm/lead-discovery/lead-source-metrics.ts).

Media:10MiB per request, two admitted transfers/process before multipart buffering, shared transport boundtwo, one upload worker. Two chunked downloads may transiently hold about40MiB payload during concatenation plus unmeasured SDK/HTTP/Node overhead.100/1,000 full10MiB uploads/day imply approximately0.98/9.77GiB Telegram-bound payload; a lazy download once adds equivalent Telegram inbound and browser-bound response payload. Small100KiB files are100×less payload. Byte caps do not measure decoded image/audio RAM. No blobs in PostgreSQL, runtime FFmpeg, eager media loading or unbounded upload queue.

Push bounds:8 concurrent deliveries,100 groups,500 queued, five subscriptions/user,30s max queue age,10s timeout. Those are configured bounds, not measured successful fanout latency. Financial/RUNNING/UNKNOWN receipts stay held; cleanup does not declare unknown usage free.

## AI registry and honest quality comparison

Public documentation checked2026-11-01: the repository registry matches published standard unit rates and the listed mini snapshot. This does not verify the deployment account's access, quota, billing region or actual receipt. Sources: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [GPT-5.4 Mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini). The provider explicitly uses standard/default tier, text-only strict structured output, no tools, no background/store and no automatic retry.

| Model in registry | Input /cached input /output USD per1M | Cache-write unit rate | Runtime access/receipt |
| --- | --- | --- | --- |
|`gpt-6-luna` |0.10 /0.01 /0.50 |0.125 (configured standard rate) |NOT RUN |
|`gpt-5.4-mini-2026-03-17` |0.75 /0.075 /4.50 |Unpriced/unsupported registry dimension, never fabricated |NOT RUN |

The source rates are not actual USD/operation. Request token counts/output length, cache dimensions, provider-reported model/tier and billing modifiers require approved receipts. Budget reservation and unknown/unpriced tests protect accounting conservatively; no paid request was made to validate current model access.

Offline harnesses validated48 Copilot and60 qualification synthetic scenarios, plus six harness guard tests. This validates corpus shape/safety gates, not generated-text accuracy/naturalness. No model was selected/migrated based on mocked quality.

| Category | Accuracy | Naturalness | Personalization | Business relevance | Unsupported claims | Average actual tokens | Actual USD/op |
| --- | --- | --- | --- | --- | --- | --- | --- |
|Conversation Copilot |NOT RUN |NOT RUN |NOT RUN |NOT RUN |NOT RUN |NOT RUN |NOT RUN |
|Lead classify/extract |NOT RUN |N/A extraction |NOT RUN |NOT RUN |NOT RUN |NOT RUN |NOT RUN |
|Qualification |NOT RUN |N/A scoring |NOT RUN |NOT RUN |NOT RUN |NOT RUN |NOT RUN |
|First proposal |NOT RUN |NOT RUN |NOT RUN |NOT RUN |NOT RUN |NOT RUN |NOT RUN |

Execute only offline scripts by default. Paid harness mode requires separately approved staging URL, synthetic fixture mapping, explicit acknowledgement, budget and human rubric. Prompt-injection/schema/unsupported-price tests pass locally; real quality remains unapproved.

## Controlled pilot and measurement plan

Until measured, proposed ceiling is one reviewed workspace, at most20 monitored sources/account (automatic recovery bound), one API runtime instance and at most five visible CRM SSE clients. Existing10k/workspace ingest cap then leaves2× global observation-cleanup capacity before other workspaces; keep all other source grants absent. This is an operational rollout restriction, not a new server-enforced global quota or a claim that a real pilot has passed. Pause on evidence gaps, cleanup backlog, unknown receipt accumulation, pool/lock pressure or budget holds.

Staging measurement must record: endpoint SQL count and server duration distribution; EXPLAIN(ANALYZE,BUFFERS) for inbox, source analytics, context and reservation SQL; table/index size; connections and transaction waits;24h0-event lease/CPU/RSS/socket/SSE baseline;100/1,000 messages/day;100/1,000 sources with explicit GAP handling;50/500/2,000 explicitly authorized AI operations; two-transfer media burst. Use representative synthetic data and approved credentials only. No threshold or cost-saving percentage is invented without baseline observations.
