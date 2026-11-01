# CRM sales workflow verification

Date: 2026-10-31. Production React Inbox components were exercised in headless Google Chrome on the existing user-owned `localhost:3000` server. Every API request (including System Bot POSTs and CRM PATCHes) was intercepted with test-only fixtures. Zero real API/Telegram/commercial messages or push requests were sent. No migration was applied. The browser was closed; the existing server was left running and no runtime/API server was started by this task.

## Browser evidence

- Desktop client panel: [1440px](screenshots/details-1440.png), [1024px](screenshots/details-1024.png).
- Fullscreen mobile details: [390px](screenshots/details-390.png), [320px](screenshots/details-320.png).
- [Purchases and separate currencies](screenshots/purchases-320.png), [current packages](screenshots/packages-320.png).
- [Mobile actions](screenshots/mobile-actions-320.png), [desktop context menu](screenshots/desktop-context-menu-1440.png).
- [Follow-up form](screenshots/follow-up-form-320.png), [calendar inside native top layer](screenshots/follow-up-calendar-320.png), [keyboard-sized viewport](screenshots/follow-up-keyboard-viewport-320.png).
- [Browser report](browser-report.json): zero document overflow at320/390/1024/1440, zero page errors, no purchase/catalog request before expansion. Explicit status and reminder changes use intercepted mutations. Calendar Escape preserves the form and restores focus; action menu/viewport controls are usable.

The keyboard-sized viewport is a desktop browser simulation. Physical iPhone/Android keyboard, installed PWA and Telegram/provider delivery require the manual acceptance steps in the [implementation plan](../../plans/crm-sales-workflow.md).

## Automated coverage

Final focused API: **33 suites /271 tests pass**. Final focused web: **20 suites /158 tests pass**. The two overlap/supersede individual agent runs; do not add their totals together.

| Scenario | Coverage |
| --- | --- |
| Reply/waiting/due/manual transitions | Shared attention policy through API tests; manual reset, sticky decisions, inactive/archive and timestamp equality boundaries |
| Concurrent incoming/outgoing | Monotonic manual-send compact SQL regression plus existing batch writer/store ordering/replay tests |
| DNC and ownership at actual send | Queued handle relink/unlinked→DNC, current viewing scope, own-only permissions, no send on denial |
| Follow-up lifecycle | Schedule exact dedup, reschedule, snooze, cancel, complete, repeated/no-op commands, foreign links, current locked-contact view/edit ownership |
| Notification occurrence | Due replay/current occurrence, stale published group dismissal, exact origin preservation, archived/relinked/disabled/DNC/CLOSED veto, existing bounded push delivery regressions |
| Manual attention versus due filter | Due INTERESTED/HUMAN_REVIEW retained, terminal clients excluded; unread separate from reply requirement |
| Currency/purchase correctness | Multiple placements/currencies, Decimal precision, incomplete legacy links, cursor timestamp ties, million-sale aggregate fixture without Node history loading, placement/currency caps |
| Package context | Existing products only, missing prices/CPM quote required, seven-channel composition, inactive/foreign restrictions, truncation and permission failures |
| UI/cache | Authoritative status/reminder reconciliation, filtered membership, scoped realtime/reconnect, safe deal return path, exact purchase invalidation after sale/payment/placement changes |
| Shared Chat isolation | Neutral presentation/capability tests and generic context callback; CRM business logic stays in feature adapters |
| Nested mobile controls | Actual Select/CustomSelect/DateInput inside native dialog/shared Modal, popup containment, Escape before parent close, focused calendar return, Tab wrapping after reparent, scroll restoration when entire drawer unmounts |
| Idle behavior | Empty/no-op service tests and read-only source cost audit; no new poll/cron/worker/AI/runtime |

No live PostgreSQL migration/EXPLAIN or financial/Telegram integration call was performed. SQL budgets are source-level estimates, not production performance/billing measurements.

## Gates and repository debt

- Prisma generation, shared typecheck/build and EN/RU i18n check pass; **1,347 canonical keys** (243 indirect/unused-key warnings).
- Web typecheck/build pass. API and web focused tests pass as above.
- API scoped lint: **0 errors** in33 explicitly owned TS files. Web feature/helper scoped lint: **0 errors**; existing `primitives.tsx` has the same **5 errors /5 warnings** as HEAD (three explicit-any and two set-state-in-effect errors). Comparison confirmed identical source expressions; no new lint suppression/rule change was added. The portal fix shrinks that file.
- Latest API typecheck/build **fail on five errors in concurrently changed files outside this slice**: `telegram-bots/core/system-bot-branding-startup.service.ts` uses a string where `TelegramBotRuntimeEnvironment` is required (three errors); `telegram-user-accounts.service.ts` uses `existingChannels` typed unknown (two). These files differ from task-start hashes and were not edited by this task. Earlier API checks passed before those concurrent edits. Do not describe the final API build as green.
- Full web tests: **96 failed /345 passed files;32 failed /1,679 passed tests;2 unhandled errors**. Failure-file/test counts match the earlier Inbox/notifications baseline; existing Vitest discovery also runs backend Finance specs under jsdom. All20 focused owned/regression suites pass.
- Full API test command was run. The existing development-connection-drain timer again called `process.exit(0)` after14 unrelated failed suites were printed, preventing a final Jest summary. Shell exit0 is not a passing suite. The focused API run covers all owned behavior and relevant notification regressions.
- Normal architecture: **16/16 policy tests pass;23 source violations**. Strict: **16/16 pass;28 source violations**. Preflight was20/26. Concurrent non-CRM changes added Bot Billing/calendar-planner/stale MTProto allowance failures; no new CRM or overlay module appears in either violation list. Rules/thresholds/allowances were unchanged.
- `git diff --check`: pass.
- Grace/Knuth/Parnas preflight, Knuth/Parnas final audit and Turing integration reviews completed. Reported DNC current-link, independent read/edit scopes, exact task origin, due manual-client membership and nested overlay/focus issues were fixed and re-reviewed without a remaining blocker.

The full monorepo is not green. Existing Finance/runner/lint debt and concurrent unrelated changes are preserved. This task did not modify Finance modules.

## Reproduce focused checks

```sh
pnpm --filter api test -- --runInBand --testPathPatterns='telegram-crm-(sales-|purchase-context|package-sales|inbox-conversations|inbox-follow-up|manual-send|contact-merge|follow-up-|internal-notification|incoming-notification|batch-store|message-batch-writer|notification-)|telegram-ad-sales-crm-task|operations-(notification|web-push)|response-cache.interceptor'
pnpm --filter web exec vitest run src/components/chat src/components/ui/primitives.test.tsx src/components/ui/overlay-portal-host.test.tsx src/components/features/growth/ad-sales/crm/crm-inbox.test.tsx src/components/features/growth/ad-sales/crm/crm-inbox-details.test.tsx src/components/features/growth/ad-sales/crm/crm-inbox-sales-context.test.tsx src/components/features/growth/ad-sales/crm/crm-sales-controls.test.tsx src/components/features/growth/ad-sales/crm/crm-navigation.test.tsx src/components/features/growth/ad-sales/crm/crm-sale-return-link.test.ts src/components/features/growth/ad-sales/crm/use-crm-thread.test.tsx src/components/features/growth/ad-sales/crm/crm-message-thread.test.tsx src/components/features/growth/ad-sales/crm/crm-message-composer.test.tsx src/lib/features/growth/crm-inbox-cache.test.ts src/lib/features/growth/crm-sales-workflow-api.test.ts src/lib/features/growth/crm-sales-workflow-cache.test.ts src/lib/features/growth/use-crm-inbox-realtime.test.tsx src/lib/features/growth/telegram-ad-sales-query.test.ts src/lib/features/growth/telegram-crm-query.test.ts src/lib/features/growth/use-telegram-crm-realtime.test.tsx
pnpm --filter api typecheck
pnpm --filter api build
pnpm --filter web typecheck
pnpm --filter web build
pnpm architecture:check
ARCHITECTURE_STRICT=1 pnpm architecture:check
git diff --check
```

[Changed-file inventory](changed-files.json) lists explicitly owned paths changed against task-start hashes. It excludes prior Inbox/notifications work and unrelated concurrent edits, including other CRM files. Shared files can contain preserved earlier changes. [Delivery/workflow/cost/deployment/rollback details](../../plans/crm-sales-workflow.md).
