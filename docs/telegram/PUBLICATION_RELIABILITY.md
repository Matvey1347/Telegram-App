# Advertising and VP publication reliability

Advertising and mutual promotion are revenue-critical. The accepted UTC instant
and target channels are the publication contract. Analytics, cleanup, identity
repair and bot confirmations must not postpone dispatch. A missing baseline is
missing analytical data, not grounds to defer an accepted publication.

## Incident findings (2026-11-13)

Seven advertising placements were due at 16:30 UTC. The shared reconciliation
execution had remained RUNNING since 16:10, renewing its task lease indefinitely.
After process restart, the last lease expired at 16:46. Six remaining messages
were accepted at 16:46:05–19; all seven managed posts and placements were then
PUBLISHED. This establishes task-level head-of-line blocking; the precise stalled
remote operation was not identified. Restart restored service, not the defect.

## Implementation

- Independent due task dispatch keeps the next persisted wake armed while other
  task definitions run. In-flight configs are excluded to prevent busy loops.
- Generic LOCAL delivery has a separate task and lease from reconciliation and
  deletion. Folder VP publication has a separate lane from baseline/finalization.
- LOCAL work excludes folder VP deliveries so two lanes cannot send the same post.
- Atomic per-post claims remain authoritative; channels use a bounded pool of
  five with sequential delivery inside each channel. Native schedules await
  observed Telegram confirmation instead of being blindly sent a second time.
- Scheduled and stale-recovery deadlines are queried separately; an old
  PUBLISHING record must not hide a newer SCHEDULED deadline.

## Required regression gates

Run the scheduler, due predicate, managed reconciliation, VP lifecycle,
publication journal and Telegram transport tests before changing these paths.
Cover stalled maintenance while another deadline becomes due; pending analytics;
native confirmation pending alongside a LOCAL send; channel failure isolation;
claim rejection; local runtime exclusion; future timestamps; restart recovery;
and an old recovery deadline preceding a newer scheduled message.

Manual QA on an authorized test channel: schedule ads and folder/direct VP at the
same future instant; verify Telegram message IDs, accepted timestamps, placement
statuses and notification status. Repeat with maintenance stalled and a channel
permission failure. Do not create real public posts as an unsolicited test.

## Remaining limits and release status

This change does not prove an absolute delivery guarantee. Telegram outages,
permission removal, rate limits and a request accepted remotely before its
response is lost require explicit handling. A long-lived publisher promise can
still hold its publication lane after the current bounded batch; do not release
its live send and retry on a Promise.race timeout. A cancellation-safe preflight
and ambiguous-send reconciliation audit remains a release requirement for a
claim of comprehensive reliability. FAILED local deliveries currently leave the automatic queue; a durable typed
attempt/outcome model is still required to distinguish definite rejection from
an accepted send with lost response, schedule retries, and reconcile before
resending. Blindly requeueing FAILED would risk duplicate paid advertising.

Exact server acceptance time also includes
Telegram/network latency; the system must dispatch at the requested instant and
record observed acceptance truthfully.

No schema, external API contract, frontend polling or additional process is
introduced. Due reads use existing status/time indexes. At 100 due channels,
100 messages still require approximately 100 send operations plus media and
existing persistence; pool concurrency reduces serial latency, not operation
count. New task configs add constant metadata and actual-due reads; idle work
must stay disarmed. Existing operational history retention applies. No new
telemetry or RAM baseline service is added.
