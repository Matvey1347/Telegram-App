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

The complete recovery implementation, including the plaintext-normalization regression, is deployed and production-verified below.

The incident also exposed an exclusive-session deadlock: a live CRM connection
held the account lease for its entire lifetime, while channel operations waited
for that same lease. The shared Telegram session factory now lends separate
caller views of one physical connection. Ordinary completion releases only its
view, preserving CRM updates; cancellation closes the physical transport,
invalidates stale views and notifies CRM's existing recovery callback. A new
connection must await confirmed shutdown. Unconfirmed shutdown retains ownership.
Read cleanup has a five-second waiting bound without releasing the live lease.
This reuses the existing CRM socket and adds no idle socket, timer or DB work.

The authenticated `GET :id/recovery-managed-posts-snapshot` returns bounded
read-only evidence: each connected linked sender's full queue, one published
history, explicit per-account errors and its completeness flag. It never runs
the legacy scheduled-media import. It uses three scoped reads plus the existing
workspace lookup, one Telegram queue request per linked account, and one history
request; 100 independently inspected channels scale to 100 such operations,
without background work. Do not interpret a failed queue as empty.

Explicit retry IDs are deduplicated. Already-drafted or verified-published posts
retain their completed outcomes. Failed, missing and out-of-scope IDs remain
visible failures instead of silently disappearing from a successful empty batch.

Confirmed future native messages with every stored ID present at the saved UTC
second are preserved before claim admission. They produce the explicit
`NATIVE_SCHEDULE_PRESERVED` outcome and additive `nativelyScheduledCount`, without
claims, revisions, cancellation, image downloads or uploads. This prevents a
healthy Telegram queue from depending again on an expired/oversized source image.
Missing entries alone are repaired after complete absence checks; the exact-post
claim context skips cancellation of IDs already proven absent. Remote ID aliases
are rejected across all publishing accounts within the channel.

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

## Historical verification — 2026-11-17

Local focused API and frontend tests, API/web type checks and builds passed.
The architecture check retains repository-wide violations, including existing
publisher size debt. Production deployment observed on 2026-11-17:
`5dcda2b2-a79c-45a6-bc17-71d2646a306b`, commit `52f7ed5`, SUCCESS.
Public health returned 200; the protected plan endpoint returned 401 without
credentials. These checks do not verify an authenticated reschedule or this
unreleased implementation.

## Historical acceptance notes — 2026-11-17

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

## Production verification — 2026-11-19

Clean release branch: `codex/channel-recovery-production`, independent of the
unreleased avatar work in the original checkout. Deployment
`b34b58bc-1c12-4b8b-ade2-0291bc35ee65` (`d8084a90`) reached SUCCESS and health HTTP 200.
A complete read-only Telegram snapshot and scoped database inventory agree:
67 future native posts/messages, no orphan IDs, aliases, dated failures or
content/date mismatches. Together with today's confirmed publication they cover
34 days, November 19–December 22, two posts per day in Europe/Warsaw. Regular slots
are 08:10 / 19:10; today's catch-up slot was 10:10. Telegram message 5234 was observed
published at 09:10:33Z (10:10:33 Warsaw), then synchronized to the managed post.
The evening native slot is 18:10Z (19:10 Warsaw).

Thirteen genuinely absent failed schedules were restored through the canonical
API after complete queue/history checks. One failed record already matched
Telegram message 5233 from November18; it was linked/verified, never resent.
The existing manual-link endpoint retained its old future timestamp; a bounded
workspace/channel/ID/status/message-ID guarded metadata update corrected only
that ordinary post's publication timestamp to the observed 18:49:45Z. It excludes
ads, VP and batch deliveries. Subsequent API verification reports VERIFIED.
An unused draft fills that already-published content's November 20 evening slot.

The real batch then preserved 66 confirmed schedules and restored one missing
native entry in 17,540 ms, with zero failures. A second complete batch preserved
all 67 in 5,985 ms, performed no replacements and returned zero failures.

Validation: API/web builds and types, targeted UI tests, snapshot/recovery tests,
transport/CRM sharing tests and publication deadline regressions passed. The original checkout full
API run retained 14 unrelated failing suites (604 passed); a later clean-checkout
full rerun terminated with process exit 139 before completing. Targeted identity,
recovery and deadline suites pass. General lint/architecture/release
checks retain existing repository debt. AI dry-run/execute/check passed with
zero pending receipts; no unknown reserve was invented or released. No main,
master or production Git ref was pushed while the general release gate fails.
The explicit production deployment uses the clean reviewed release branch.

Manual QA reproduction: open Telegram → Scheduled Messages for this channel;
check today's 19:10 Warsaw slot and two slots per day through December 22. Open
message 5234 to confirm the morning publication. Run the existing reschedule
modal again: confirmed entries must show native preservation, with zero sends,
zero removals and zero errors. Do not use the older media-import sync stream
as a read-only verification operation.

Telegram visible text is not managed markup: literal placeholders such as
`№___` must survive comparison. The final regression decodes stored markup
once and only normalizes whitespace/case in already-visible remote text.
This prevents a published template post from remaining falsely scheduled or
being replaced after an early manual publication.

Final normalization deployment `198945a4-79b9-4ff6-9529-c149b5ebf4af`
(commit `596a3ff9`) reached SUCCESS; previous deployment was removed. Fresh
production health is HTTP 200. Identity/recovery focused tests: 72 passed;
publication deadline regressions: 102 passed. No temporary API/web server was
started. All local verification commands have finished.

The 09:50 UTC read found two newly added native messages (5026/5027), absent
from the earlier 09:12 snapshot and from all channel managed-post records. Their
November 20 slots are 12:10 and 17:10 Europe/Warsaw. One visible message is channel
promotion copy. They are not duplicates or replacements sent by recovery. The owner confirmed
these are separate advertising/manual posts; they remain untouched. All 67 regular future
posts still match IDs, content and UTC dates, with no aliases or dated failures.

Owner follow-up: preserve advertising and manually created messages from the
other service. Production configuration confirms `tgManage770` is connected,
active, publication-enabled and the sole priority publisher. The publishing
capabilities endpoint selects its source ID with `isFallback:false`; the
selector's 12 regression tests pass. Existing accepted schedules retain their
original source metadata (15 current regular schedules use tgManage770, 52 the
previous account), while new/recovered native sends prefer tgManage770. No
healthy message was cancelled merely to change metadata. All 67 regular posts
were positively verified by ID, UTC date and content through tgManage770's
complete queue. A secondary-account queue read failed on this observation; no
absence/replacement was inferred from that error. The priority account's queue
and history succeeded.
