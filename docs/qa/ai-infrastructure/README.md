# Internal AI infrastructure QA — 2026-10-31

Implementation and source-level cost assessment: [plan](../../plans/ai-infrastructure-usage.md). Exact owned paths: [changed-files.json](changed-files.json). Other worktree changes predate or are concurrent with this slice and are not attributed to it. Shared host files preserve those edits.

## Results

| Gate | Result |
|---|---|
| Focused API: `pnpm --filter api test -- --runInBand --testPathPatterns='operations/ai\|scheduled-task-executor\|response-cache.interceptor'` |7 suites,81 tests passed; independent Turing rerun also81 passed|
| Focused web: AI infrastructure, CRM navigation, workspace tools |3 files,19 tests passed (14 AI-specific)|
| Shared build/typecheck |Passed|
| Prisma generation |Passed; migration generated but not applied|
| API typecheck/build |Blocked by exactly the same five preflight errors; no new AI errors|
| Web typecheck/build |Passed|
| API/web scoped lint |Passed|
| i18n check |Passed;10 namespaces,1440 canonical keys;336 indirect-use warnings|
| Normal/strict architecture |16/16 policy tests;23/28 source violations, identical lists to preflight; no new AI violation or threshold changes|
| `git diff --check` |Passed|
| Browser responsive mocked QA |320,360,390,768,1024,1440px; no page errors or horizontal page overflow|

API's five errors: `system-bot-branding-startup.service.ts`49/56/57 (`environment:string` versus enum); `telegram-user-accounts.service.ts`855/877 (`existingChannels:unknown`). They were reproduced before editing. No unrelated fix was made.

Full web run:346 files passed,96 failed;1690 tests passed,32 failed;2 unhandled errors. Failures include existing consumer-Finance alias resolution and CRM-contact mocks lacking `iconsApi.createCustom`. No new AI test fails. This is an outside-slice diagnosis, not a measured pre-task full-suite baseline. Full web lint:146 errors/168 warnings outside the scoped clean slice.

Full API run was attempted as required by repository guidance. It reported unrelated Finance/billing/Telegram failures and was cut short by existing `development-connection-drain` test code invoking `process.exit(0)`; a zero shell exit is not a successful full-suite result. No reliable full-suite count was produced. Focused results above are authoritative for this slice. No production key, database, Telegram send or provider generation was used.

Local full logs are `/tmp/ai-infrastructure-api-focused.log`, `/tmp/ai-infrastructure-api-full.log`, `/tmp/ai-infrastructure-api-typecheck-final.log`, `/tmp/ai-infrastructure-api-build-final.log`, `/tmp/ai-infrastructure-api-scoped-lint-final.log`, `/tmp/ai-infrastructure-architecture-final.log`, `/tmp/ai-infrastructure-architecture-final-strict.log`, `/tmp/ada-ai-tests.log`, `/tmp/ada-ai-typecheck.log`, `/tmp/ada-ai-build.log`, `/tmp/ada-ai-full-tests.log` and `/tmp/ada-ai-lint.log`. Temporary logs are session evidence; durable gate summary is this document and the browser report.

## Coverage and review

Mocked tests cover model assignment/price precision and cached/reasoning usage; malformed/missing/unsupported usage; provider error/timeout/abort; invalid JSON and schema refusal; strict model receipts; operation replays/conflicts/concurrent admission; reservation exhaustion/day-month boundaries; budget configuration and no-op writes; unauthorized and cross-workspace access; disabled flags; Support isolation; settlement uncertainty/manual reconciliation; safe metadata; SQL aggregation/cursors/date caps; old held-operation discovery/retention and UTC handling; response-cache exclusion; UI loading/error/empty/unpriced states and exact decimal formatting.

Grace mapped the runtime, Knuth audited costs, Parnas checked structure before/after and Turing cleared the final integration without remaining P1/P2 findings. Review fixes preserve old UNKNOWN cube anchors, expose held operations outside date retention, use matching32768 input bounds, reject empty models and prevent generic response caching of sensitive AI routes. The code uses request-triggered work only; tests and source review confirm no AI startup call, polling or recurring budget writes.

## Browser artifacts

All API routes, including shared shell routes, were intercepted. Numbers in screenshots are explicit QA fixtures, not production statistics. [Browser report](browser-report.json) records widths, errors, held-operation discovery, lazy configuration and reconciliation checks. Zero provider calls. Desktop/mobile layouts were also visually inspected by the integrator.

- [Desktop dashboard](screenshots/usage-1440.png)
- [Mobile dashboard](screenshots/usage-320.png)
- [Desktop configuration](screenshots/config-1440.png)
- [Mobile configuration](screenshots/config-320.png)
- [All-age held operations](screenshots/held-320.png)

The browser was closed. No dev server or background process was started by this task; the existing localhost3000 server was reused and left running.

## Manual acceptance before deployment

1. Apply the additive migration only to a reviewed staging database and run the normal build. Keep deployment/workspace/category/automatic flags disabled. Open Settings → AI Usage with no rows: expect zero known totals, no provider requests and no configuration insert.
2. Switch between two workspaces and roles with view-only, manage-only and no AI privileges. Verify cached surfaces switch keys, manage-only can configure without usage visibility, and direct foreign-workspace requests fail. Confirm secrets/private payloads never appear in responses or telemetry.
3. On intercepted/staging fixtures, apply <=90-day UTC category/model/status filters, inspect chart totals and unknown warnings, follow a cursor, then exercise empty/error/loading. Check12-decimal monetary values and no cross-currency accumulation.
4. Save valid workspace/category limits, repeat unchanged values and verify no writes. Try empty/unknown model, invalid money, excess input/output/concurrency and unsupported fields: expect rejection. Confirm missing budgets/disabled flags block admission before any counter/provider call using mocks.
5. Use mocked parallel equal/different operation IDs and small budgets. Verify one admitted call, no duplicate charge, four held balances, timeout/DB uncertainty retained and no retry. Compare day/month rollover. Do not equate provider timeout with zero spend.
6. Open all-age held operations, including an aged UNKNOWN outside90days; verify it is discoverable and its hold/cube survives cleanup. Reconcile only against independently verified invoice/provider evidence; confirm a second reconciliation is rejected and budget/cube values remain consistent.
7. Open/close the CRM cost summary and change conversations: one lazy Sales read, cached reuse and no per-chat/row calls. Configuration should load only when its tab opens.
8. At320/390px check filters, charts, settings and horizontally scrollable request table; ensure controls and reconciliation remain accessible. Verify both EN/RU and keyboard access.
9. On staging volumes inspect SQL plans and daily cleanup lag. Three maintenance deletes are globally limited to20k rows/table/day;100 idle channels add no AI work. Model receipt/account access and prices need a separately authorized live smoke before a future producer is enabled; this delivery intentionally did not perform one.

Rollout, backend key names, tariff maintenance, source-level0/100/1k/10k estimates and safe rollback are detailed in the plan. Prompt injection/privacy basis, actual provider receipt validation, quality evaluation and business-result persistence remain prerequisites for future Copilot/Discovery/Support work.
