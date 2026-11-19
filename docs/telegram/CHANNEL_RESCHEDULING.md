# Ordinary channel post rescheduling

## 2026-11-19 bulk recovery repair

The modal submits up to 100 candidates per stream (72 posts use one request).
The operation reads the complete original sender queue once, and reuses one
published-history read per connected reader. Scheduled IDs are never queried
as published IDs. Failed-ID retries retain outcomes and use a fresh snapshot.
Malformed or partial queue responses fail explicitly instead of becoming empty.

Missing future native entries require the original sender's complete queue,
complete publication history since creation, no matching published/orphan queue
content, no partial IDs, and no delivery journal or publication evidence.
Early manual Telegram publication and truncated history block replacement.
Overlapping stored queue IDs fail before mutation. Overdue uncertainty remains
visible rather than authorizing replay. External Telegram edits may race an
operation snapshot; final queue verification is required after recovery.

Expired connection waiters now leave the session queue without releasing a live
predecessor. Claim and transport checkpoints reject elapsed scheduled times,
including after media preparation. No additional polling, worker, persisted
cache, retention or idle database work is introduced. For one sender and 72
posts, queue reads fall from up to 72 connections to one, and history is read
once when required. At 100 channels, read work scales with actual sender
accounts, while replacement/media calls and existing claim/revision writes
still scale with changed posts. Railway process/RAM baseline is unchanged;
bounded request memory holds at most the operation candidates, queue and 500
history messages. History beyond that cap fails closed for missing-future repair.

Release and production execution verification are pending for this revision.

The incident also exposed an exclusive-session deadlock: a live CRM connection
held the account lease for its entire lifetime, while channel operations waited
for that same lease. The shared Telegram session factory now lends separate
caller views of one physical connection. Ordinary completion releases only its
view, preserving CRM updates; cancellation closes the physical transport,
invalidates stale views and notifies CRM's existing recovery callback. A new
connection must await confirmed shutdown. Unconfirmed shutdown retains ownership.
Read cleanup has a five-second waiting bound without releasing the live lease.
This reuses the existing CRM socket and adds no idle socket, timer or DB work.

The existing recovery controller, rescheduler and publisher remain the single
workflow. Candidate reads and claim admission exclude ad placements, folder VP
and batch deliveries. Final stream results include per-post outcomes; the modal
retains both successes and failures and retries failed IDs.

Native queues belong to the original sending account. An alternate account can
read published channel history, but an empty queue from that account does not
prove the original schedule was cancelled. Recovery therefore blocks future
native replacement when the original queue cannot be inspected. A unique
published-content identity can still synchronize an overdue post using another
connected reader. A missing match in the bounded history never proves absence.
An overdue native post returns to drafts only when its original queue still
confirms every stored scheduled ID, allowing cancellation before drafting.

Future LOCAL schedules remain unchanged. Overdue LOCAL posts enter history
verification and can return to drafts only with no journal or delivery evidence.
Partial/uncertain LOCAL sends require the canonical delivery reconciliation.

Rescheduling uses the existing per-post claim columns, a two-minute lease and a
one-minute abort signal for native publishing. The publisher checks ownership
before cancellation and replacement; a timed-out preparation cannot start a
new send. An uncertain native result retains the lease and must recheck original
queue IDs before retrying. Claim cleanup failure is a per-post error.

Cost: no polling, new process, schema or persisted history is added. Future LOCAL
preservation performs no writes. For 100 native posts, work is bounded by their
existing per-account queue batches, 100 claims and at most 100 replacement
operations plus cancellation/media work. Leases add claim/release writes only
during an explicit operation; idle Neon and Railway work is unchanged.

## Verification status

Local focused API and frontend tests, API/web type checks and builds passed.
The architecture check retains repository-wide violations, including existing
publisher size debt. Production deployment observed on 2026-11-17:
`5dcda2b2-a79c-45a6-bc17-71d2646a306b`, commit `52f7ed5`, SUCCESS.
Public health returned 200; the protected plan endpoint returned 401 without
credentials. These checks do not verify an authenticated reschedule or this
unreleased implementation.

## Remaining acceptance checks

Provide explicit private test channel/workspace IDs and protected credentials.
Schedule ordinary text/media posts plus an ad and VP control. Run the existing
stream endpoint, inspect each outcome, queue IDs, original UTC timestamps and DB
statuses. Repeat success, disconnect original sender, simulate lost responses,
and run concurrent requests. Confirm ad/VP records stay unchanged. Read the
complete stream response rather than treating HTTP 200 as operation success.

Full blocked-account replacement needs proof of authority over the original
account-scoped queue. This implementation deliberately reports an error when
that proof is unavailable. Authenticated production plan GET returned 200 for Business / Test 2.
Two own fixture posts were created. Initial non-stream scheduling returned 500;
Railway logs show a proxy socket hang up to the internal API on port 4000.
A second schedule-stream attempt ended in a network failure before a confirmed
result. Both fixtures were deleted through the canonical API (HTTP 200);
no test deals were created. This does not establish successful Telegram
rescheduling. The source changes have not been deployed; do not describe
production as fixed.
