# Lead Discovery autopilot — work in progress

## Goal and release status

NO-GO: the automatic end-to-end product is not complete or deployed. This change is an incremental foundation, not a production-readiness claim. The requested `ad_filter_research.zip` was not found; a local 2,700-post text export from nine sources was available. It is neither independently annotated gold nor a complete 90-day sample. No paid AI or production deployment was performed.

## Existing path and intended flow

`TelegramLeadTransportService.scan` gets one <=50-post page from the existing leased MTProto account and uses `TelegramLeadIngestService` to persist scoped observations. `TelegramLeadMonitorService` batches actual event-driven observations and recovery; it does not schedule classification. `TelegramLeadAnalysisService.analyze` presently performs explicit manual AI analysis, claims an observation/version before the gateway and preserves UNKNOWN operations. The manual path remains MANUAL. A separate internal AUTOMATIC entry point is being prepared to use the gateway automatic mode, workspace/category enablement, budgets, existing receipts and active-source checks; no automatic producer calls it yet.

The intended complete pipeline is: explicit authorized start → bounded 90-day history cursor and checkpoint → persist allowed observations → versioned deduplication → conservative prefilter → optional AUTOMATIC gateway under an explicit finite budget → literal-source contact extraction → advertiser identity/candidate → review → optional human-initiated proposal. Ongoing monitoring must enqueue the same stages only after committed ingestion and only when monitoring and processing grants remain valid. It must stop on pause, revoke, budget or unknown receipts, never send Telegram messages, and must not create fake conversations.

## Filter and reciprocity foundation

`lead-prefilter-v1` yields SAFE_SKIP only when the caller has independently verified a current, successful result for the identical content hash and supplies its ID. Otherwise missing source/message metadata returns NEEDS_METADATA, not a claim of organic content. LIKELY_AD requires a canonical third-party target plus CTA and commercial language; LIKELY_VP is only a hypothesis with explicit mutual-promotion wording and canonical third-party target. All other complete inputs require AI. These results are not integrated into a running producer and are not approved for release without labeled quality evaluation. The caller must independently prove the duplicate's workspace, permission, identity, current version and result validity; a boolean is not an authorization boundary.

`lead-reciprocity-v1` accepts only independently verified, noncatalog A→B and B→A posts with canonical numeric channel IDs, distinct evidence and creative hashes, and <=7 days between them. It emits a pending evidence pair, not confirmed human review or proof of payment/free placement. It does not fetch unapproved channels. Evidence persistence, human decisions, canonical identity resolution, durable retention and candidate integration are not implemented.

Current Telegram normalized observations store bounded text and literal URLs but not full Telegram entities, buttons, forward/media metadata or verified target identities. These must be collected through the existing transport with policy checks; missing values cannot be silently filled with false. Raw observation retention is 90 days. A durable reviewed VP relationship needs explicit workspace-scoped evidence and retention semantics before shipping.

## Costs and safeguards

No new idle polling is introduced by the pure filter/benchmark. Production design must preserve existing event-driven source monitor and lease. Existing runtime itself has lease activity; zero global idle writes is not claimed. For 100 sources × 300 posts, history requires at least 600 Telegram 50-post pages and workspace ingest quota limits new observations to 10,000 per UTC day. Full two-stage AI on every post is costly: existing documentation estimates ~62 logical DB calls and 29 mutations plus four provider HTTP calls per post, not measured network round trips; use actual budget and ledger data, never invent source costs. At 10,000 new posts/day, 90-day retention can retain 900,000 observations; existing cleanup handles at most 20,000/day globally and shares AI cleanup capacity.

## Verification and rollout

See [QA](../qa/lead-discovery-autopilot/README.md), [filter evaluation](../qa/lead-discovery-autopilot/filter-evaluation.json), [VP evaluation](../qa/lead-discovery-autopilot/vp-evaluation.json). Independent human labels and held-out sources/pairs are required before aggressive rules or claimed recall. Real AI costs, real-source classification accuracy, browser behavior, 90-day full backfill, automatic event analysis, source-level spending and durable evidence recovery remain NOT VERIFIED until implemented and exercised in authorized staging. Rollout requires a separately authorized target and coordinated migrations/configuration; rollback first disables the automatic producer and source processing, retains UNKNOWN financial receipts and evidence, and must not send outreach. No production deployment is authorized by this task.

## Local history-collection slice

The local branch adds `TelegramLeadHistoryJob` and migration `20261101160000_lead_history_job`. The workspace/source-scoped start, pause, resume and status endpoints use the existing live Telegram runtime and up to 50 posts per page. A durable cursor and short lease protect checkpoint progress; source/grant/lease are rechecked during ingestion and checkpointing, and uncertain source changes pause with gaps. A page already admitted can finish while the state is PAUSING. The frontend labels this explicitly as **history collection only** and offers manual state refresh; it never starts AI. No timer runs for an empty work queue. Startup recovery examines up to 10,000 jobs and processes at most two at a time; more than that are not fully recovered, a rollout blocker. This slice does not implement cancel or automatic analysis. The additive migration and synthetic FK/cascade behavior were checked in disposable PostgreSQL. Full historical migration-chain execution, service-level concurrency, actor-permission and channel-ownership races, and complete restart recovery still require isolated/staging acceptance; DDL comparison and unit mocks alone do not prove them.

For comparison only, applying the existing two-stage logical-call estimates to every post gives the following naive workload; none of these numbers is a measured network round trip or a prediction that calls will be made:

| Posts | Telegram pages at 50/page (minimum) | Estimated AI logical DB calls | Estimated AI DB mutations | Provider HTTP requests including token count |
| --- | ---: | ---: | ---: | ---: |
| 100 | 2 | 6,200 | 2,900 | 400 |
| 500 | 10 | 31,000 | 14,500 | 2,000 |
| 1,000 | 20 | 62,000 | 29,000 | 4,000 |

Actual USD cost, tokens, safe-skip reduction, query count and duration have not been measured for this pipeline; they depend on configured model, usage, cache, evidence and verified classification. Do not use these work estimates as a billing total.

## Remaining producer design (not implemented)

A viable continuation needs a workspace/source/observation queue keyed by `(observationId, contentHash, processingVersion)`, actor and binding revision, with durable pending/running/paused/unknown/done states. Enqueue must be atomic with committed ingest for both history and realtime, with bounded event-driven drain, claim token/deadline, restart recovery, and no retry of uncertain paid operations. A budget, permission or UNKNOWN result must pause the source before another paid attempt. This is not wired: source-binding A→B→A, actor permission changes, own-channel insertion and pause-versus-provider dispatch lack a proven common authorization/fencing boundary. These must be designed and tested in PostgreSQL before connecting the existing internal AUTOMATIC method to a producer.

Continued local work adds migration `20261101170000_lead_source_binding_revision`, a database-triggered revision for semantic source changes. A stale A→B→A source snapshot is now rejected, without treating ordinary checkpoint updates as binding changes; this does not solve grant configuration, actor permission or owned-channel catalog races. The MTProto adapter extracts bounded structural metadata in memory, explicitly flags truncation/unsupported content and avoids fetching media; no persistence or AI transmission of potentially sensitive entity URLs has been enabled.

A local-only initial outbox foundation is now present ([details and limitations](../qa/lead-discovery-autopilot/outbox-foundation.md)). It records `WAIT_AUTH_RECHECK` metadata only for opted-in sources and does not run a consumer or AI; opt-in has no public switch yet. Source and workspace caps record overflow, but recovery and diagnosis are not exposed. Preflight failures transactionally record a gap. A bounded reconciliation service and cursor exist, but no automatic invocation or cross-instance wake is connected. These are blockers to enabling a producer, not a functioning automatic analysis pipeline.

The local reconciliation service marks gaps on failed preflight, overflow and source binding change; it scans at most 100 retained observations per explicit call using a snapshot and cursor, with generation fencing and no advancement when capacity is full. A source-binding trigger removes only stale WAIT_AUTH_RECHECK hints; AI receipts and observations remain. This service is not yet a running producer, and no automatic wake or AI dispatch is enabled.

## 12C continuation: release blockers

The current AI ledger stores the outcome status and accounting but not the provider result. A crash after successful settlement and before the observation is updated therefore leaves a charged operation whose result cannot be replayed. A new paid operation must not be created automatically; durable bounded output storage coordinated with settlement, or a verified provider retrieval mechanism, is needed before transparent recovery. The current no-contact path also does not create an advertiser: extraction is gated on `hasContact`, candidate creation requires contacts, and candidate identity is derived from contacts. A verified advertiser identity and explicit evidence relationship are needed to support a useful contactless candidate without duplicates or invented leads.

Source binding revision does not serialize workspace role/membership changes, process-local grant changes, or concurrent insertion into the owned-channel catalog. An authorization admission boundary must cover all relevant writers and dispatch across API instances. In-flight external calls cannot be assumed free or cancellable after a revoke. A consumer, durable cross-instance wake, budget-stop UI, source-attributed spending and reciprocal evidence persistence remain unimplemented. Do not expose the current history-only button as full analysis.

The user subsequently supplied the 210 AI-assisted dev judgments as pasted TSV with embedded newlines. All 210 distinct IDs matched the trusted dev manifest and source/split checks. The AI judgments disagree with the earlier offline heuristics on 99 items; neither set is human gold and neither is the production prefilter. A local ignored disagreement CSV preserves both reasons for review. No rule was promoted based solely on these labels. Holdout data must not be used to tune rules. No paid provider call or production migration is authorized by this continuation.

## Reciprocal promotion evidence

Directed promotion evidence is stored only for a single allowed canonical target when the saved classification cites a literal promotional reference. The existing seven-day matcher pairs two distinct observations; identical creative is not sufficient to reject a pair. A pair records two posts, not payment terms. Reads recheck both observations, source bindings, identity and grants; stale or revoked evidence is not presented as current. Evidence follows the observation's retention and is deleted with it. Processing remains event-driven and makes no additional Telegram or AI request for matching.

## Durable gateway results

Lead classification and extraction opt in to a versioned, output-only Gateway result capped at 64 KiB. The result is inserted in the same transaction as the financial settlement and is scoped through its operation receipt, fingerprint, business object and model. Recovery reuses the same operation only after the current source grant and queue claim are checked; UNKNOWN, missing, expired or conflicting receipts never trigger an automatic paid replay. The daily bounded AI retention pass removes outputs after the operation's 90-day expiry, including outputs attached to unresolved financial receipts, while preserving the receipts and reservations required for reconciliation. Provider responses use `store: false`: a crash after external processing but before the settlement transaction commits cannot be reconstructed from the provider and remains uncertain.
