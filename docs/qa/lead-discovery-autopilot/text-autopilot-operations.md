# Text discovery operations

`INTERNAL_LEAD_DISCOVERY_RECOVERY_MODE=manual` leaves discovery history,
monitoring, and queue recovery idle. It does not disable ordinary CRM or the
existing MTProto runtime. Keep this mode until the enabled sources and their
workspace grants have been reviewed. Other CRM work remains independent.

`normal` enables existing bounded event-driven monitoring and queue recovery.
On startup it recovers *all* enabled sources, not just one: before switching,
inspect each enabled source, actor, binding, grants, queue and AI category
settings. A source may be resumed only with its processing authorization.
Disabled automatic AI categories send text-inconclusive observations to review;
no provider call is made. UNKNOWN/RUNNING AI operations are not reclaimed.
The local development API refuses automatic recovery against a remote database
unless it runs inside a Railway environment. Local tests use loopback Postgres.

For a separately approved activation, set the variable to `normal` with the
service's intended deployment, confirm one runtime lease and inspect queue and
candidate counts. Startup can catch up accumulated work across enabled sources.
Return to `manual` and redeploy/restart the same version to stop automatic
recovery; this does not cancel work already in flight. Inspect claims and AI
ledger before deciding how to reconcile interrupted work. Do not reset queue
statuses, receipts, reservations or checkpoints. Restoring an older application
version may not support manual mode; verify its startup behavior before rollback.

Public channel description and at most one accessible pinned post are read via
the existing live handle. Private or protected content is not accessed. Bot,
website and social profile links are contact points, not proof of a contact or
identity. Evidence and contacts are retained with the existing 90-day candidate
and observation policy. No scheduler or idle polling is added. At 100 active
channels the current executor limits concurrency to two source drains, with
batches of at most 50; public profile resolution uses the existing shared rate
limiter. Each inconclusive text post reads AI category settings before entering
review. Actual Telegram and database work scales with admitted posts rather than
channel count alone; monitor Railway connection/CPU and Neon query volume before
raising concurrency.
