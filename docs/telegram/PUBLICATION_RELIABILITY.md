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

## Durable recovery and remote uncertainty

Each immediate send now has an immutable post/ordinal/payload/source identity.
The journal persists STARTED before the network request and ACKED with accepted
Telegram IDs before the next operation. A partial prefix cannot authorize replay
of an uncertain follow-up. Explicit Telegram 429 rejection stores retry_after;
other definite 4xx responses become actionable BLOCKED failures. Network failure,
5xx, lost responses and failed acknowledgement persistence are UNKNOWN and enter
remote identity reconciliation, never blind resend. Authenticated manual retry
can reset only definite rejected operations in its workspace/channel.

Per-post claims and a dispatch context fence replace whole-batch waiting.
A 30-second dispatch deadline aborts the transport and fences preparation that
resumes later. Fencing is rechecked after the database ownership read and before
each new remote operation; cancelled/ended VP is excluded. An already-started
request remains journaled as uncertain until its outcome is recovered. The next
channel/batch does not await that promise. MTProto cancellation closes its
connection and checks cancellation before subsequent sends; Bot requests retain
real fetch abort deadlines. Post-publication emoji repair cannot hold dispatch.

Failed recoverable VP posts also retain an independent LOCAL recovery driver,
even if one sibling permanently fails. Retry eligibility respects folder
cancellation and end time. Definitive rejected operations honor persisted retry
dates; preflight retries back off to fifteen minutes. Ambiguous recovery checks
are spaced five minutes apart. No background empty polling is added.

Delivery cannot be guaranteed while Telegram is unavailable or permissions are
removed. Bot API has no client idempotency key or arbitrary history read; if a
response is lost and a connected account cannot prove a unique remote match,
the failure stays visible and is not resent speculatively. Server dispatch time
and Telegram acceptance time are recorded separately; network latency and
Telegram rate limits cannot be represented as exact zero-latency acceptance.

## Migration and verification

The additive migration creates operation journals and per-post claim/retry
metadata. Legacy active LOCAL sends are backfilled as UNKNOWN with expired
claims so rollout recovers them without interpreting an empty journal as no-send.
Migrations and schema verification passed on a disposable PostgreSQL database.
Real two-client integration tests prove atomic ownership, lost-response safety,
429 continuation without prefix duplication and single publisher ownership.
The Nest module dependency smoke test also passes without production secrets.

The schema change is additive; external API contracts, frontend polling and
process count are unchanged. Journals are retained with their managed post and
cascade on its deletion; accepted operation evidence must outlive retries. Due reads use existing status/time indexes. At 100 due channels,
100 messages still require approximately 100 send operations plus media and
existing persistence; independent dispatch reduces serial latency, not operation count. New task configs add constant metadata and actual-due reads; idle work
must stay disarmed. Existing operational history retention applies. No new
telemetry or RAM baseline service is added.

## Production release evidence — 2026-11-13

Merged implementation PR #3 and claim recovery PR #4 into main. Railway
deployment `d685c0b6-e92e-4162-9a59-c615b783c359` for commit
`73a8c3293c09178c63f08003de847cc998e85afe` reached SUCCESS; the migration is
applied and public API health returns HTTP 200. Both deadline tasks are enabled.

Canonical production smoke in existing private Test channels scheduled one
ad and one folder VP at 21:58:20.647 UTC. Telegram acknowledgements were recorded
after 4,178 ms and 4,543 ms respectively, with one message ID per post; the ad
placement and VP delivery both became PUBLISHED. Four future VP fixture posts
were cancelled. An earlier rollout smoke also published both (4,579/5,233 ms);
its cleanup incorrectly attempted the unpublished-ad cancellation action after
publication. The smoke script now cancels only unpublished placements. Published
test artifacts were removed separately with fixture/private-channel guards.
The original Mira deal retains all seven post and placement PUBLISHED statuses.

Verification: 218 focused tests plus four real PostgreSQL integration tests;
API types/build, module DI and focused new-file lint passed. Full suite and
architecture retain unrelated existing failures documented in the execution
plan. The disposable PostgreSQL container was stopped. No dev server remains.

QA reproduction: set explicit SMOKE_WORKSPACE_ID and two distinct private test
channel IDs, inject production variables using Railway run, and execute the
guarded smoke script. It creates zero-value fixture placements, validates
message IDs and placement states, and cancels future VP work. Run only with the
explicit publish-private-test-only guard, never against a customer channel.
