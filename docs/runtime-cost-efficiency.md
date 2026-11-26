# Runtime cost efficiency

### Workspace notification linking

The settings page checks connection status only while a user-initiated link is valid and the page is visible. It checks every four seconds for the first minute and every fifteen seconds afterwards, stops on confirmation or expiry, and refreshes on return to the page. Each check reads one workspace; avatar downloads are cached for five minutes (failed lookups for twenty seconds). Idle pages and the other 100 channels do not trigger this work. There are no recurring server jobs, extra database writes, or retained photo records.

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

### AI Posting Autopilot activity

The channel's Autopilot status response reads up to ten recent runs, with up to
eight recorded stages per run, from the existing workspace and channel index.
The same read serves page entry, return to the tab and the refresh action.
The journal reuses stored run and stage records. Opening it for one channel
does the same amount of work whether the workspace has two channels or 100.

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

### Ad campaign request tracking

Cross-channel tracking keeps its scope and opening counters separately from the
campaign's acquisition links. The scheduled workspace channel sync attaches
newly available destinations in one batch and forces an invite refresh only for
channels with tracked links. The existing sync reads up to 12 tracked links per
channel that were missing from the catalog or had incomplete counters. Each
fallback requests a one-row importer page when Telegram omits an aggregate.
There is no additional timer or idle poll. Existing invite snapshots are reused
for attribution and completed tracking windows keep their historical counters.

### Workspace creative encyclopedia

The Ads header loads the encyclopedia only when opened. The list reads up to 20
creatives per section and batches comment and attachment metadata with the page.
Copying all sections walks the same cursor pages without downloading file bytes.
Files are fetched individually when a user opens a preview. The workload is the
same with 2 or 100 channels, with no polling, background writes, or external
calls. Neon can idle between interactions and Railway has no additional
resident processes.

Entries and mentor comments remain as workspace knowledge until their entry or
workspace is deleted. A single private attachment per entry is capped at 10 MiB
and stored separately from list metadata. For 100 entries, attachment storage
is bounded at 1,000 MiB before database overhead. Deletion cascades to the file
and comments. There is no automatic expiry of user-created notes.

### Dashboard acquisition and sales

The period summary uses the existing dashboard cache and stored Telegram
observations. It does not start timers, fetch Telegram history remotely, or add
writes or retained records. For 100 channels, channel and source lookups are
batched. The traffic query uses the workspace/invite-link/time index for one
baseline and a date range per link. It sends one aggregate per measured link
back to the API. The all-time view reads the available observation history, so
its cost grows with stored snapshots. Sales counts are grouped in PostgreSQL. A second workspace-scoped aggregate reads posted receipts for seller revenue only when the viewer may access both finance and sales. Idle dashboards add no polling or connection activity.

The capital chart reuses the member finance allocation in a fixed batch of
workspace reads, with income limited to the selected period and no member
timeline load. Historical contributions are needed to attribute each receipt
to the investors present on that date. The account total reuses the balances
already in the dashboard response and adds no client request.

### Publication coverage notifications

A subscribed workspace has one indexed due timestamp. The existing due-driven
task reads at most 30 due workspaces per execution. It uses one active-channel
read and one batched booking summary for all included channels in each workspace.
At 100 channels that is still one batched booking summary. Telegram receives
at most one message per coverage threshold per 15 channels, and only when a
threshold is reached. There is one next-date write per checked workspace and
none for disabled workspaces. In-app notifications use existing retention. For a Telegram route, each
successful batch records one receipt on the workspace. A receipt keeps only
keys for that local date, so a partial failure can resume without resending
already confirmed batches. At 100 channels there are at most eight Telegram
batches across both thresholds. Autopilot sends one report per run via the
selected workspace route and reuses the existing delivery ledger, retries and
retention. The three routes are the app inbox, the workspace Telegram group
and the workspace's connected personal account. The default route is the
group. No new timers, idle polls or per-channel workers are introduced. A
channel preview does one scoped read, and a generic example needs no
channel read. Both use the delivery message format.


### Campaign invite intervals

The existing invite sync checks up to 12 tracked links per channel, including
active campaign links with complete catalog metadata. A direct campaign link
uses one bounded request for the live pending count. At 100 active channels
this is at most 1,200 direct checks per invite-sync pass. One batch read per
workspace selects at most one stale configured interval per included channel.
The existing range reader retries an interval no more than daily and paginates
within its Telegram limit. Both paths use the existing sync cadence and link
snapshot retention. Work remains idle when there are no active campaigns.

### Mentor advice and AI Posting report costs

Standalone mentor advice uses the same workspace-scoped creative page and
retention. It stores one text row and requires no System Bot session or
attachment lookup. Opening or copying a section remains bounded by the
existing cursor page size and is independent of the number of channels.

Autopilot groups the existing run-indexed AI ledger by result and operation
stage in one per-run read. Confirmed charges are split into saved or ready
drafts, unsuccessful attempts and shared planning. Unknown receipts stay
unconfirmed. The preview reuses the delivery formatter with example amounts.
There are no new timers or database wakeups while idle. For 100 active channels
the maximum remains one grouped read per run, including the fatal-run report.

### Scheduled and published Telegram confirmations

Settings reuse the workspace lookup that already chooses the notification
recipient. Channel icons and links come from the existing batched channel reads.
At 100 channels the notification still performs one recipient lookup and uses the
existing Telegram send, with the existing Unicode fallback on explicit rejection.
The website loads the sample on demand for a single selected channel. No new
worker, polling, history, or idle database activity is introduced.

### Campaign bot attribution and invite account selection

Campaign results use one batched exposure query for the destination channels
with shared bot links on the requested page. It joins recorded ad, own-channel
and mutual-promotion placements intersecting the date range. Attribution uses
stored reach when available and a proportional estimate when request timestamps
or reach are missing. Historical entries with no recorded end use the first
24 hours. Exact campaign-link counters remain separate from this estimate.

The invite-account picker checks Telegram for one selected channel on demand,
with at most three concurrent calls and a 30-second browser cache. Work scales
with connected accounts, independent of the other channels in the workspace.
There is no polling, background job or write on access checks. Existing sync
retention, write paths and idle Neon/Railway behavior remain the same.
