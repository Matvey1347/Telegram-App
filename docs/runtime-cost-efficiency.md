# Runtime cost efficiency

This is the production engineering standard for Neon and Railway. Cost must
follow useful work, not application uptime or the number of rows stored.

## Core principles

- An idle system should approach zero useful compute and zero database activity.
- Prefer event-driven or due-driven work over polling. No work means no write.
- Stored entities do not justify a worker per entity: process only enabled,
  relevant workspaces/channels and use bounded batches.
- Manual and automatic operations are separate flows. Correctness, workspace
  isolation, idempotency and restart recovery come first; then choose the
  cheapest correct implementation.

## Required review before implementation

Review cron/interval/timer/persistent connections, frontend refetch, queues,
DB writes and histories, persisted logs, external/Telegram calls, egress,
large read models, N+1, repeated upserts and unbounded table growth. State why
the work is necessary, what happens when it is empty, and how it is disabled.

## Workload model

Calculate workload units before applying provider prices:

```text
runsPerDay = 1440 / intervalMinutes
dailyExecutions = runsPerDay × activeWorkspaces × activeChannels
dailyDbOperations = dailyExecutions × averageDbOperationsPerExecution
monthlyDbOperations = dailyDbOperations × 30
work = runs × activeChannels × postsPerChannel × operationsPerPost
```

Estimate DB wakeups/reads/writes, rows scanned/created, external calls, CPU,
RAM baseline and egress for 1 workspace/2 channels, 1/100, and (when SaaS-wide)
10/1000. Provider prices change; apply current rates only after this workload
estimate.

## Neon and Railway checks

Any Postgres query can prevent Neon scale-to-zero. Do not use heartbeat queries,
1–5 minute empty polling, frequent `findMany` across tenants, or writes when
state is unchanged. Use indexes, selective bounded scans and batches. Histories
need retention and snapshots need a product reason.

For Railway, account for timer/CPU loops, RAM baseline, long-lived Telegram/API
connections, reconnect storms, JSON work, egress and disabled workers that are
still alive. Reuse connections inside a bounded operation and keep services
able to sleep or move to a serverless-style runtime later.

## Background job standard

Every job documents why it is background rather than event-driven, its minimum
frequency, empty-run DB query count, `nextDueAt` source, restart recovery,
idempotency, duplicate-worker protection, 100/1000-entity behavior, automatic
disable condition and result retention. A new one-minute polling job is
prohibited without explicit technical justification.

Persist the next due occurrence and arm one timer to it. On bootstrap load the
nearest due work, execute due/missed occurrences with leases/claims, then
recompute the next wake. Re-arm after config changes. A timer is acceptable;
a recurring database query that merely asks whether work appeared is not.

Job output is one aggregate summary (considered, skipped, processed, changed,
failures, duration), not an INFO record per item.

## Database, logging and retention

**Unchanged state means no write.** This applies to metrics, sync results,
snapshots, caches, heartbeats and logs. PostgreSQL is not a dumping ground for
ordinary INFO logs. Keep audit, financial/security events, warnings, errors and
explicit operational events; successful HTTP completions and interval telemetry
are console/provider-only unless an opt-in diagnostic setting is enabled.

In-process resource monitors may sample frequently, but persist only threshold
transitions, a hysteresis-based recovery, and a throttled reminder. Log buffers
arm a one-shot flush only while entries are queued; an empty buffer must not
keep a recurring timer alive.

Every append-only table specifies purpose, owner/time index, projected growth,
retention, aggregation/downsampling and cleanup. Batch cleanup and avoid
per-row scans.

For bounded external metric windows, batch-read the persisted rows by their
incoming identifiers, compare in memory, and write/snapshot only changed or
new rows. Do not infer that every historical row absent from a recent window
has changed; recalculate aggregates only for dates touched by a real change.

### Telegram sync history policy

`TelegramPostMetricSnapshot` remains because campaign, placement and admission
analytics consume its time series. It is written only when an incoming post
metric changes; retention or downsampling requires an equivalent aggregate for
those consumers. `TelegramChannelAudienceSnapshot` is created by changed post
metrics, or by daily analytics only when post-metrics is not selected.
`TelegramChannelDataSource` records meaningful source-status transitions;
identical SUCCESS metadata is suppressed while failures remain auditable.
Scheduled batch success is represented by its task run summary, not a
per-channel PostgreSQL INFO log.

Before adding metric-history retention, preserve the query windows used by ad
sales placement analytics and campaign admission analytics (`metricSnapshots`
and raw `TelegramPostMetricSnapshot` SQL). The next retention migration must
first replace those reads with daily aggregates, then retain raw snapshots for
the verified maximum attribution window plus a safety margin; it must run from
the daily maintenance task in bounded batches, never from a frequent poll.

## Frontend rules

Do not add `refetchInterval`, duplicate polling, per-row detail requests,
N+1 HTTP, broad domain invalidation, or heavy collection models without need.
Use shared narrow query keys and server-provided compact read models. Frontend
polling is backend cost and must pass the same review.

## Required handoff

Cost-sensitive handoffs include: idle behavior; recurring jobs; estimated DB
queries/writes and external requests; 100-channel estimate; table/retention
impact; Railway CPU/RAM/network impact; cost reductions made; and any remaining
correctness-over-cost tradeoff.
