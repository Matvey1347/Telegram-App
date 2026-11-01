# AI Sales Copilot QA and handoff

2026-10-31. [Architecture, policies, migration, prompts, rollout/rollback](../../plans/ai-sales-copilot.md). [Owned file manifest](changed-files.json). Existing unrelated worktree edits were preserved. This handoff does not declare production readiness: global API compilation remains blocked and no real staging database/provider/Telegram integration was executed.

## Gates

| Check | Result |
|---|---|
| Focused API, CRM/Gateway/authorization/cache/retention regressions |22 suites,274 tests passed|
| Focused frontend |5 files,46 tests passed;21 new Copilot/provenance tests and25 prior regressions|
| Shared typecheck/build |Passed|
| Prisma generate/validate |Passed; additive migration generated, not applied. Existing SetNull/required-field schema warning remains outside this slice.|
| API typecheck/build |Exactly five pre-existing errors, reproduced before editing; no new errors|
| Web typecheck/build |Passed|
| API/web scoped lint |Passed|
| i18n |Passed:1504 canonical keys;400 indirect-use warnings|
| Architecture normal/strict |Policy16/16;23/28 source violations, identical lists to preflight; no new violation or allowance/threshold edit|
| `git diff --check` and owned-path whitespace |Passed|
| Browser |Six widths, no viewport overflow/page errors; all APIs intercepted|
| Offline benchmark harness |48 scenarios validated without network;2 harness safety tests passed|

The five API errors are System Bot branding environment enum mismatches at49/56/57 and Telegram Accounts `existingChannels:unknown` at855/877. Logs before/after: `/tmp/ai-sales-copilot-api-typecheck-baseline.log`, `...-final.log`, `/tmp/ai-sales-copilot-api-build-final.log`. They are owned by parallel workstreams and were not suppressed or repaired here.

Full web run for this stage:348 passed/96 failed files;1714 passed/32 failed tests;2 unhandled errors. Outside-slice failures include consumer Finance alias resolution and existing CRM contact mocks missing `iconsApi.createCustom`. Full lint:145 errors/168warnings outside the clean scoped slice. This diagnosis is not a measured pre-task full-suite baseline.

Full API run was attempted. It reported outside-slice Finance/billing/Telegram failures and was interrupted by existing development connection-drain test code invoking `process.exit(0)`. Its zero shell exit is not a successful full-suite result; no complete count is available. Focused tests are the reliable scoped evidence. All Copilot/provider test traffic was mocked; no paid calls or commercial sends.

Session logs: `/tmp/ai-sales-copilot-api-focused-final.log`, `/tmp/ai-sales-copilot-api-full.log`, `/tmp/ai-sales-copilot-scoped-lint-final.log`, `/tmp/ai-sales-copilot-architecture-{baseline,final}{,-strict}.log`, `/tmp/ai-sales-copilot-benchmark-tests.log`, `/tmp/ada-copilot-{tests,typecheck,build,lint,i18n,full-tests,full-lint}.log`. Durable summaries are here and in the browser report; temporary logs may expire.

## Coverage and independent review

Happy/failure/regression coverage includes default-deny processing grants, workspace/contact/reference/notes/expiry scope, ownership and permissions, DNC/closed/archive, selected product prices/currencies/CPM, package-price aliases and spelled/free amounts, natural clarification, untrusted source/prompt injection, bounded context, schema validation, disabled flags, insufficient budgets, actual/unknown usage, operation identity conflicts and concurrent replay, claim/result persistence, no paid hidden retry, draft expiry and retained receipt replay, save/repeated-approval no-ops, revision/hash binding, current messages/prices/merge/status/permissions at approval/send, canonical manual key/provenance, abort propagation/listener cleanup, ordinary manual input with AI unavailable, narrow cache/realtime reconciliation, drawer focus and responsive composer.

The [48-case evaluation dataset](evaluation-scenarios.json) is synthetic, reproducible and includes human business-quality criteria. Deterministic tests check real policy/transport boundaries; they are not measured live-model quality scores. Human evaluation must assess factuality, current prices/currencies, relevance, useful personalization, naturalness, refusal, next action, length and repeated pitch avoidance before enabling real data.

Grace mapped actual services; Knuth audited bounded reads/writes/retention; Parnas compared final architecture against preflight; Turing cleared final integration and the last financial-clarification delta with no remaining P1/P2 findings. Independent subsets included131 tests,43 final send/lifecycle regressions and91 tests after the final policy adjustment (overlapping subsets, not additive totals). Financial language checks remain conservative safeguards with false positives and incomplete semantic coverage, requiring explicit human review. They do not prove arbitrary text factually true.

## Browser artifacts

[Browser report](browser-report.json):320/360/390/768/1024/1440px, explicit-open queries, no automatic generation/send, overwrite confirmation, edit/reapproval, mobile Escape/focus return and keyboard-size layout. All API routes, including shared shell/System Bot POSTs, were intercepted. Screenshots contain labeled synthetic fixtures and are not real generated output/statistics.

- [Desktop Copilot](screenshots/copilot-1440.png)
- [Mobile Copilot](screenshots/copilot-320.png)
- [Mobile details](screenshots/details-320.png)
- [Keyboard-sized viewport](screenshots/keyboard-390.png)

At390×520px the Send control bottom is507px; the AI section scrolls internally and preserves composer space. This is synthetic Chromium viewport QA, not a physical iOS/Android keyboard test. Integrator visually inspected desktop and keyboard screenshots. The browser was closed. No server/background process was started by this task; the pre-existing localhost3000 server was reused with interception and left untouched.

## Source-level cost assessment

Counts are Prisma/raw method calls, not measured SQL round trips, DB plans, latency, RSS or billing. Authorization graph loads and transaction protocol are excluded below. Full context C=8: conversation access1, workflow conversation/current task2, latest messages1, selected products1, purchase contact preflight/page2, notes1. C=7 without notes. Context is rebuilt three times around the draft claim/provider security boundary. Initial generation additionally loads one authorization graph and forces two graph reloads; AI-derived send forces one reload alongside ordinary request authorization.

| Action | Calls with C=8 | Logical mutations | Provider HTTP |
|---|---:|---:|---:|
| Successful new generation, including existing Gateway |56 (`32+3C`)|13 (11 ledger+claim/save2)|2 (counter+generation)|
| Saved-draft operation replay |≤3|0|0|
| Empty first Copilot open |2|0|0|
| Latest draft reopen/freshness |11|0|0|
| Explicit context/details |8|0|0|
| Existing catalog cursor page |2|0|0|
| Changed SAVE or DISCARD |6|1|0|
| Unchanged SAVE |3|0|0|
| APPROVE |14|1|0|
| Repeated unchanged APPROVE |11|0|0|
| AI send overhead above ordinary sender |11|1 SENT update|0|
| Verified manual-send replay |1 conditional SENT update|0 or1|0|

Generation breakdown: initial access/replay2, three contexts24, locked claim4, existing Gateway24, result save1, usage read1. Without notes:53 calls. One approval and one successful send per generation add25 calls/two mutations, plus ordinary Telegram manual-send work and authorization. Reopens/details/catalog are explicit extra reads; catalog pages retain the existing bounded network overview, while generation uses narrow selected-product reads.

| Generations/day | Generation calls/day | Logical mutations/day | Provider HTTP/day | Draft rows at7-day TTL |
|---:|---:|---:|---:|---:|
|0|0|0|0|0|
|50|2,800|650|100|350|
|500|28,000|6,500|1,000|3,500|
|2,000|112,000|26,000|4,000|14,000|

Actual draft rows are additionally capped at20/conversation/author. Policy/DNC denial before claim takes approximately5 calls with no committed mutation/provider call; retained-draft cap or a duplicate found inside claim takes approximately5+C. Provider timeout/missing usage can use about52 calls/nine mutations while retaining reservations. Invalid output with priced usage retains normal ledger costs. Settlement/result-save uncertainty depends on actual commit outcome; the saved claim prevents a silent second generation.

Idle and100-channel estimate: zero Copilot execution/read/write/provider work per uptime or chat switch, zero new queue/worker/MTProto connection/timer/deployment. Existing daily maintenance adds one bounded10k-row draft DELETE, including one empty query when there are no drafts; it does not independently wake Neon. No retention refund of unknown ledger charges. Three context builds are an explicit correctness-over-cost choice. A future indexed revision/snapshot optimization should be a separate change with race/price/permission regressions; ledger financial correctness must remain intact.

## Manual staging acceptance

1. Review/apply all preceding CRM/AI migrations and `20261031180000_crm_ai_sales_copilot` only to a designated staging database. Keep flags off. Resolve the five global build errors through their owners; obtain a valid build before declaring readiness. Never run against missing tables.
2. With no grants and flags disabled, verify manual chat remains usable and opening/switching chats causes no AI requests/writes. Open Copilot explicitly: saved/empty state only. Verify source processing is denied even with a syntactically plausible reference.
3. Configure reviewed grants with exact workspace/contact/reference/expiry and notes scope, plus existing model flags and explicit budgets. Try another workspace, owner, contact, expired grant, missing execute permission and notes without scope. Expect denial before provider disclosure. Never treat a checkbox/reference as legal verification.
4. On mocked/staging synthetic fixtures invoke all four categories, three tones and UK/RU/EN/AUTO. Verify at most one generation plus one counter, fixed schemas, current fact references, missing facts, safe reasons and priced/unknown metadata. Refusal/DNC/follow-up-without-task must not produce outreach.
5. Test fixed single-channel quote versus unknown package/CPM/mixed currencies, discount, statistics, dates and results. Unsupported numeric/spelled/free claims must require review and fail approval; a natural price clarification must remain usable. Inspect model output personally rather than relying on usedFacts alone.
6. Double-click Generate, replay same ID/options, change options with the same ID, use two operators, simulate provider timeout, budget rejection and result-save failure. Confirm bounded draft claim, correct ledger/hold, actionable failure or uncertainty and no implicit paid retry. Retry after TTL must not create a fresh paid operation.
7. Save/edit/approve and repeat unchanged approval: no extra version/write/key. Insert with existing composer text and pending canonical local drafts: require confirmation. Restore local state and retry an old failed bubble; do not clear newer edited content. Edited approved text must require reapproval.
8. During generation/approval/send change incoming text, product price, owner, DNC/archive/contact link or permissions. Check STALE/REVIEW_REQUIRED and current rejection. Send only by the human's ordinary Send control. Confirm canonical key/provenance, same Telegram random ID on retries, and successful receipt replay after draft cleanup without a new send.
9. Check cursor history, one latest freshness read on explicit reopen, no per-row AI requests, no polling and narrow affected cache updates. Follow-up recommendation must not create tasks/status/sales without the existing separate manager action.
10. Check320/360/390/768/1024/1440px, keyboard/focus/Escape, EN/RU labels, stop-waiting/uncertainty and ordinary input during AI failure. Test actual iOS/Android keyboard separately; synthetic viewport evidence is insufficient for physical-device acceptance.
11. Inspect staging query plans/retention lag at projected volume. Verify7-day expiry and one bounded daily pass; stopped/uncertain drafts never refund usage. Optional paid benchmark instructions follow. No commercial message should be sent by the quality harness.

## Voluntary live quality benchmark

Offline: `node scripts/ai-sales-copilot-benchmark.mjs` validates48 scenarios without network. Safety harness: `node --test scripts/ai-sales-copilot-benchmark.test.mjs`.

Live prerequisites: valid migrated staging build, approved synthetic seeded conversations representing the scenario data, reviewed source grants, provider key/model access, category flags/budgets and an expressly authorized spend. Prepare a private JSON mapping with `syntheticDataApproved:true`, matching `workspaceId` and `cases` keyed by dataset scenario IDs; each case has `conversationId`, `productIds`, `processingReference`, optional `includeNotes`/`processingBasis`. The script does not seed, modify customer history, approve drafts or send Telegram messages.

Set backend-stage API URL/token/workspace only in the shell environment: CRM_COPILOT_BENCHMARK_BASE_URL, CRM_COPILOT_BENCHMARK_TOKEN, CRM_COPILOT_BENCHMARK_WORKSPACE_ID, CRM_COPILOT_BENCHMARK_ALLOW_PAID=`APPROVED_SYNTHETIC_STAGING_AND_PAID_CALLS`. URL must be local or explicitly staging-labelled HTTPS. Then invoke `node scripts/ai-sales-copilot-benchmark.mjs --live --mapping /private/seeded-mapping.json --output /private/quality-report.json --limit 1`.

Calls are serial, bounded1..48, no automatic retry/model fallback and stop on rejection/unknown charges. Output file permissions0600; keep it private and score against the rubric manually. Do not commit tokens or reports with real personal data. No live invocation was performed for this delivery. Enable a real manager cohort only after source/privacy approval, valid build/migration integration and human-reviewed quality results. Rollout/rollback are in the architecture plan.
