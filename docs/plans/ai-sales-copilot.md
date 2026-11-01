# AI Sales Copilot — implementation and rollout

2026-10-31. Four manually requested Sales operations only. No Discovery, outreach automation, Instagram or Support implementation. No real AI/provider or commercial Telegram message was sent during implementation, and no database migration was applied.

## Readiness and audit

Read root/API/web/shared guidance, product boundaries, runtime/cache standards, design-system documents and prior CRM audit, Inbox2, notifications, workflow and AI infrastructure plans. Grace mapped current services, Knuth reviewed bounded work and Parnas established architecture/size baseline. Existing five API TypeScript errors were reproduced before edits: three System Bot environment-enum errors and two Telegram Accounts unknown-channel errors. They remain outside this slice; this module cannot be declared production-ready while the global build remains invalid.

The existing Operations AI Gateway owns model selection, token count, strict JSON transport, concurrency, actual usage, immutable Decimal tariffs, budgets/reservations and uncertain-charge reconciliation. CRM owns context, prompts, transient generated text and human approval. Consumer Finance/Groshly accounting is unchanged. Shared Chat UI remains neutral; Copilot composes the CRM thread's existing composer slot.

## End-to-end contract

Shared contracts: `packages/shared/src/types/telegram-crm-copilot.ts`. Authenticated routes under `/telegram-crm/conversations/:id/copilot`:

| Method/path | Purpose |
|---|---|
|GET root|At most5 current-author recent drafts; latest freshness recheck, no writes|
|GET `/context`|Explicit bounded context inspection; selected product IDs and optional notes|
|POST `/generate`|One requested category/tone/language, dated operation ID, selected products and processing attestation|
|PATCH `/drafts/:draftId`|Explicit SAVE, APPROVE or DISCARD with optimistic revision|

Generation: current workspace/own-or-any access → existing saved draft replay before context rebuilding → processing/eligibility checks → bounded context → locked unique draft claim → fresh authorization/context recheck → existing Gateway → fresh post-call authorization/context check → validated/sanitized CRM result persistence. No transaction surrounds network activity. A failed CRM result write leaves the claim; replay never silently pays again. Known admission/config/budget rejections are actionable FAILED results, while actual provider/settlement uncertainty stays UNKNOWN. No automatic model fallback, language detection call or prerequisite conversation-analysis call.

The four categories are SALES_FIRST_DRAFT, SALES_REPLY_SUGGESTION, SALES_FOLLOW_UP and SALES_CONVERSATION_ANALYSIS. NATURAL is default; CONSULTATIVE and DIRECT adjust style without authorizing pressure. AUTO uses the customer's language with Ukrainian fallback; explicit Ukrainian/Russian/English overrides are supported. Model choice remains solely the existing category configuration; no automatic upgrade.

## Source processing and permissions

Importing a CRM contact is not permission to disclose its content to an AI provider. The separate backend gate `INTERNAL_AI_SALES_PROCESSING_ENABLED` defaults off. It must be enabled only after organizational/provider/data-source approval. `INTERNAL_AI_SALES_PROCESSING_GRANTS` is a reviewed JSON array of at most100 bounded records:

```json
[{"workspaceId":"reviewed-workspace-id","contactIds":["reviewed-contact-id"],"reference":"policy:approved-source-record","notesAllowed":false,"expiresAt":"2026-11-30T00:00:00.000Z"}]
```

This is an example with synthetic IDs, not a configured grant. Missing, malformed, expired, wrong-workspace/contact/reference or insufficient notes scope denies processing. No wildcard contacts. Maximum64KiB configuration and100 contact IDs/record. Administrators maintain grants through the existing backend deployment configuration, after reviewing the external evidence referenced by `policy:` or `consent:`. References must not contain secrets or message text. Grants are an explicit organizational attestation, not an automated legal determination. A manager separately acknowledges the source basis and supplies the exact approved reference per operation. A plausible reference or checkbox alone grants nothing.

2026-11-01 Business workspace rollout: a reviewed grant may instead use `"scope":"WORKSPACE"` with no `contactIds`. This covers all current and future CRM contacts in that one workspace. The context API returns its reference, so the chat UI no longer asks each manager to copy environment variables or enter the reference per conversation. Other workspaces remain blocked. Notes still require `notesAllowed:true`; the Business grant keeps notes disabled. AI workspace/category budgets and manual send approval still apply.

CRM visibility and own/any ownership apply to all reads; `operations.executeAi` applies to generation and existing Gateway admission; commercial eligibility excludes DNC, CLOSED, archived/inactive/unlinked clients. Selected catalog/purchase data retain Sales permissions. Notes require explicit includeNotes and the grant's notes scope. Follow-up requires an active task and no detected recent refusal. The prompt treats all messages/notes/descriptions as untrusted data. No new source crawling or public-data verification is performed.

Authorization is memoized normally. A new explicit `WorkspaceAuthorizationService.refresh` reloads the graph at external-work security boundaries: before Gateway admission, after generation and immediately before an AI-derived manual send. It is not a timer/refetch loop. Permissions can still change after the final check; no atomic transaction spans Telegram/provider networking. This is a bounded network-ready recheck, not an impossible distributed atomic guarantee.

## Bounded context and freshness

The context builder reuses existing workflow, compact message, selected-product and purchase services rather than loading full contact financial detail or importing Telegram history. Caps:20 recent text messages,350 UTF-8 bytes/message,5 recent linked purchases without lifetime aggregates,5 selected products and3 explicitly included notes; full serialized context<=24KiB. Compact contact/source fields are bounded. No N+1 per message, catalog materialization, inventory booking query, markRead or new MTProto session. Missing/truncated data is explicit; selected-product absence never becomes an invented quote.

Fingerprint includes current contact/account/peer/ownership/archive/status identity, actual bounded message text/edits, effective task occurrence and selected actual product prices/constraints. Dynamic `asOf` timestamps are excluded from the freshness hash; the prompt separately receives the actual current UTC time to interpret elapsed time. Products describe current channel placements; networks have no canonical fixed package total. CPM is not a flat price, currencies are never combined, minimum price does not authorize discounts, and no availability/statistics/conversion guarantee is inferred. Historical purchases are not current tariff evidence.

Latest draft is rebuilt/compared on explicit Copilot reopen, and generation compares context again after the provider returns. Older retained drafts require review rather than five parallel deep context rebuilds. Approval and send always check current context, contact identity, DNC/archive/ownership and selected prices. Stale results can be inspected but cannot be sent as previously approved. Generation never changes sales status, tasks or sales records.

## Prompt and structured outputs

CRM trusted instructions are `sales-copilot-v1`; only untrusted JSON facts/options enter provider input. Generic Gateway now accepts optional trusted instructions and fingerprints them while preserving fingerprints for old callers with no instructions. Counter and generation receive identical payloads, including instructions/schema. Combined input byte bound remains256KiB; all existing time/token/memory limits remain. No send/tools capability is present.

All four Sales transport schemas use category-specific `*_copilot_v1` IDs and a strict object with no extra fields: suggestedMessage<=3000, reasoningSummary<=700, recommendedAction enum, customerIntent<=200, confidence0..1, usedFacts<=40 references, missingFacts/warnings<=12×300, requiresHumanReview=true, language enum, tone enum and contextVersion<=80. Lead/Support schemas retain infra-v1 and cannot accept Sales output. JSON schema validates structure, not factual truth. See [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

CRM resolves usedFacts against actual server fact IDs and matches tone/language/context version. Commercial checks conservatively reject unverified prices/currencies, package totals, discounts, statistics, availability and numeric claims. A quoted channel amount must match the selected fixed product, currency and product/channel identity. Package aliases and spelled amounts are checked too. Such output may be shown as REVIEW_REQUIRED but approval is refused until unsupported assertions are removed. This is a conservative deterministic guard, not a proof of arbitrary natural-language semantics; human review and the quality benchmark remain mandatory. False positives should be rewritten or addressed with reviewed regression fixtures, not bypassed.

Manager-facing rationale/intent/missing facts remain bounded and useful; detected copied private message/note fragments of40+ characters are redacted before persistence; this is not complete PII redaction. Model warnings cannot remove mandatory server warnings. Saved MESSAGE/NOTE facts are references/labels, not another stored transcript. Draft results are CRM business data, never usage telemetry. Source descriptions are manager-supplied untrusted context and are not labeled independently verified public evidence. [OpenAI safety guidance](https://developers.openai.com/api/docs/guides/safety-best-practices) also recommends bounded inputs, evaluation and human oversight; these do not replace local source policy.

## Draft lifecycle and human send

Additive migration `20261031180000_crm_ai_sales_copilot` adds TelegramCrmAiDraft with workspace/composite conversation FK, author, unique workspace+operation ID, category/tone/options, generated result/text, safe fact metadata, context/request hashes, revision, approval hash/time, linked usage operation and sent message ID. No copied history table, prompt log or second token ledger. Options snapshot stores source attestation and selected IDs, not the transcript.

TTL7days; maximum20 retained drafts/conversation/author; list maximum5. Unique locked claim prevents concurrent same-ID calls from reaching Gateway twice. Dated IDs remain `YYYY-MM-DD:UUID`; deleted old drafts cannot become fresh paid retries. GENERATING with missing completion eventually presents UNKNOWN read-only; no background recovery call. Expiry/staleness reads do not write. Explicit SAVE avoids unchanged writes and never saves per keystroke; revisions prevent two editors approving different text. Approval binds exact trimmed text/hash/revision and clears when saved text changes. Failed/uncertain generation requires a deliberately new operation, never an implicit retry.

Approved text inserts into the existing canonical workspace-local composer draft, with an explicit overwrite confirmation. Provenance survives restore, edits and failed-bubble retries. Editing invalidates send readiness until save/reapproval. Actual send still requires the manager's existing Send action and permission. AI sends use canonical manual idempotency key `ai:<draftId>:<revision>`; incomplete provenance/reserved keys are rejected. Stored receipt provenance must match before marking SENT. The network-ready guard checks approval/hash/revision/current source grant/context before existing manual send. Ordinary hand-written chat remains available with AI disabled and retains its existing UUID idempotency semantics. No automatic outreach or automatic follow-up scheduling is added.

## Inbox UX and cache

Compact opt-in Copilot above composer; manual composer is immediately usable. Opening a chat performs no Copilot work. Explicit Copilot open fetches saved drafts; Details/Prepare fetch bounded context; product selection uses existing cursor catalog20/page only on Prepare. No chat-row usage reads or usage polling. Costs come from the same returned Gateway operation metadata, including UNKNOWN/UNPRICED. Exact draft responses patch only the conversation/author Copilot cache; realtime invalidates affected open keys rather than the Inbox root.

Desktop details expand locally inside the current thread surface; mobile uses the shared fullscreen native details panel with focus/Escape behavior. Loading, stop-waiting, disabled-source/budget, empty, failed, uncertain and stale states are visible. Stopping the wait cannot guarantee zero provider spend; reopen recovers persisted state, and a new suggestion is an explicitly new potentially paid operation. The existing composer/editor and Shared Chat UI are reused.

## Evaluation and rollout limits

[48 synthetic scenarios](../qa/ai-sales-copilot/evaluation-scenarios.json) cover first/repeat contact, fixed/CPM/unknown/mixed prices, discount/statistics/results/date objections, refusal/DNC/follow-up, UK/RU/EN, long/incomplete history, injection, stale prices/messages/identity/permissions, duplicates, persistence uncertainty and expiry. Deterministic mocked regressions validate the server boundaries. They do not measure a model's personalization/naturalness or prove that live outputs are good.

`scripts/ai-sales-copilot-benchmark.mjs` defaults to offline dataset validation with no network. Live mode is voluntary and requires reviewed seeded synthetic staging fixtures/mapping, explicit paid-call acknowledgement, stage URL/token/workspace and a limit1..48. It calls the CRM endpoint serially, never OpenAI directly, never approves/sends and never retries/falls back. Reports are private mode0600 files; human scores remain unset. Evaluate factuality, price/currency correctness, latest-message relevance, useful personalization, naturalness, refusal, next action, brevity and repeated-pitch avoidance before enabling a real use case. No live benchmark was run.

## Runtime cost and retention

No new worker, timer loop, polling, queue, Redis, MTProto connection or Railway deployment. Zero Copilot execution work/writes/provider calls at idle or per chat switch;100 idle channels add none. Existing AI ledger remains approximately24 Prisma/raw calls and11 steady logical mutations per priced request, plus authorization/transaction protocol. Provider cost is one token-count HTTP call plus at most one generation; one click does not fan out through several models.

Additional bounded context is built before claim, immediately before generation and after it, plus explicit approval/send freshness checks. This correctness tradeoff is reported rather than hidden as a cost optimization. Detailed implemented operation counts and0/50/500/2000 estimates are in the QA handoff after final cost review. A separate safe optimization could reuse pre-claim snapshots with indexed revision checks; it needs its own race/permission/price regression evidence and must not weaken ledger locks.

Existing `operational_history.cleanup` gains one indexed DELETE pass over resolved drafts only; UNKNOWN/GENERATING recovery records are preserved (stage11 safety audit), globally maximum10,000 expired draft rows/day, no drain loop. Seven-day steady draft volume at50/500/2000 per day is350/3500/14000 before per-author/conversation caps. At0 generations maintenance adds one empty query during the existing daily wake and zero deletions, not a new Neon wake. Cleanup capacity is5× the2000/day target; sustained global expired backlog above10k/day requires review. Draft cleanup never releases uncertain financial reservations or deletes AI usage. No per-keystroke DB persistence. No total Railway RSS, latency or Neon billing reduction was measured.

## Staging rollout and rollback

1. Keep provider/master/category/automatic and source-processing flags disabled. Review all preceding migrations plus the new draft migration, then apply only to a designated staging database using the repository procedure. Do not run the application against a database missing these models. Prisma generation alone is not migration verification.
2. Resolve the five global API errors through their owning workstream and obtain a valid full API build/integration environment. Run tests/build/architecture and the manual QA checklist. Mock browser API checks are not a real DB/Telegram/provider integration test.
3. Configure the existing backend-only INTERNAL_AI_OPENAI_API_KEY and INTERNAL_AI_ENABLED under the previous infrastructure plan. Review current tariffs/model receipts and explicit budgets/max-cost limits; never auto-copy a Finance credential. Grant CRM/execute/config permissions separately.
4. Review approved source processing and configure exact workspace/contact reference grants with expiry/notes scope. Only then enable INTERNAL_AI_SALES_PROCESSING_ENABLED. Model/category flags remain explicitly managed. Do not enable automatic generation: this stage is manual-only.
5. Seed approved synthetic fixtures, exercise no-provider staging flows and migration constraints, then voluntarily authorize/run the live benchmark if appropriate. Inspect actual selected model receipts, costs and results; choose model changes only through existing configuration and comparable evaluation. No commercial send is part of that benchmark.
6. Pilot with a small authorized manager cohort after human review of benchmark results and current source policy. Monitor existing usage/held reservations, context size and retention lag; no new production monitoring service is added.

Rollback: disable Sales category/source-processing/master gates; retain usage/reservations for verified reconciliation. Existing ordinary manual chat still works. Roll back application code with additive tables left intact until reviewed privacy/retention cleanup; do not destructively drop paid-operation evidence. No live workers/processes need draining beyond active bounded requests. Public browser screenshots, test results and changed-file manifest: [QA handoff](../qa/ai-sales-copilot/README.md).
