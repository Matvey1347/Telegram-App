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

### AI Posting post performance

The AI Posting performance task runs hourly because 24/72/168-hour age points
need bounded capture windows. It scans only channels with AI Posting settings
and posts near those age points. A channel makes at most one existing metrics
sync call per run, and only when a target age point is due and has no in-window
snapshot; an empty run makes no MTProto calls. Each selected sync is capped by
the count of posts from the last eight days plus five (and the metrics service's
existing hard cap). Performance recomputation/backfill processes at most 500
posts per run, in batched database reads and writes, with recent posts refreshed
at most about once every 20 hours. No AI calls or frontend polling are used.


At 100 enabled channels the bounded upper case is 100 Telegram sync calls per
hour when all channels have due points, plus one settings read, one due-post
read, one post-count query, one backfill-candidate read, at most 100 channel
comparison reads, and cross-promotion lookups in chunks of 500 managed posts.
An empty no-due run has zero Telegram calls; after backfill and stale young-post
refreshes are caught up, it also has zero performance writes.
`TelegramPostPerformance` stores one durable row per
synchronized post; this is historical product data with no scheduled cleanup.
The hourly batch can write up to 500 rows while backfill is catching up, then
only stale young-post rows and posts whose target snapshot changed. This adds
bounded Postgres work and Telegram egress only at real measurement points; the
job uses the existing scheduled-task lease/lock and one aggregate run summary.

Before adding metric-history retention, preserve the query windows used by ad
sales placement analytics and campaign admission analytics (`metricSnapshots`
and raw `TelegramPostMetricSnapshot` SQL). The next retention migration must
first replace those reads with daily aggregates, then retain raw snapshots for
the verified maximum attribution window plus a safety margin; it must run from
the daily maintenance task in bounded batches, never from a frequent poll.

### Telegram post batch dispatch

System Bot post batches are admitted at no more than 50 imported posts, 100
channels, and 5,000 expanded deliveries. Import consumption and dispatch are
database-only HTTP operations; Telegram publication and expiry deletion run as
bounded, leased, due-driven work. Dispatch must not open one request, stream,
timer, or transaction per delivery, and it must never hold a database
transaction across a Telegram call.

The batch lifetime is an immutable delivery snapshot of 24, 48, 72 hours, or
permanent. Its deletion deadline starts at the confirmed publication time, not
the requested schedule time. Permanent deliveries create no deletion wake.
Frontend countdowns derive from that persisted deadline using one
visibility-aware clock and never refetch per delivery.

At the maximum 50-by-100 fan-out, expect at least 5,000 managed posts, 5,000
delivery rows, 10,000 managed-post revisions, and 5,000 Telegram publication
calls before media or long-text fan-out. Materialization therefore uses bulk
writes, worker pages are bounded, and remote deletion is grouped by workspace
and channel. Media egress scales with channel count; aggregate media/fan-out
limits must be reviewed before increasing any batch ceiling.

## Local CRM reaction previews

When a development API proxies CRM to an older runtime owner, the local System
Bot can resolve authorized reaction documents without opening a second MTProto
session. This path is disabled in production and has no polling or persistence.
Only opened chats request assets; the client batches up to five document IDs,
with one Bot API lookup and at most two file requests per uncached document.
The process cache is capped at 128 entries and 8 MiB; raw files are capped at
256 KiB and decompressed animations at 1 MiB. At 100 independently opened chats
with five unique uncached reactions each, the upper estimate is 100 lookup
calls plus 1,000 file metadata/download calls, with cache hits reducing this.
Idle Railway and Neon usage remain unchanged; there are no database writes.

## Frontend rules

Do not add `refetchInterval`, duplicate polling, per-row detail requests,
N+1 HTTP, broad domain invalidation, or heavy collection models without need.
Use shared narrow query keys and server-provided compact read models. Frontend
polling is backend cost and must pass the same review.

Long-lived browser streams must stop while their document is hidden and resume
with a narrow reconciliation read when it becomes visible. Hidden tabs must not
consume HTTP connection slots or hold duplicate realtime subscriptions.

## Required handoff

Cost-sensitive handoffs include: idle behavior; recurring jobs; estimated DB
queries/writes and external requests; 100-channel estimate; table/retention
impact; Railway CPU/RAM/network impact; cost reductions made; and any remaining
correctness-over-cost tradeoff.
