# CRM notification Settings browser smoke

Date: 2026-10-31. The production React Settings page was checked in headless Google Chrome against the existing user-owned `localhost:3000` web server. All API requests, including POST and PATCH, were intercepted and answered with test-only fixtures. Browser permission and subscription methods were guarded against real use.

- [Desktop Settings, 1440 px](screenshots/settings-desktop-1440.png): incoming CRM alerts and message previews initially off, CRM master and follow-up on, future AI Leads disabled, test disabled while global browser Push is off.
- [Mobile Settings, 390 px](screenshots/settings-mobile-390.png): incoming alerts and preview enabled through two explicit preference clicks; controls and descriptions wrap within the viewport. Mutation feedback was dismissed before capture.
- [Machine-readable browser report](browser-report.json): no horizontal document overflow at either width, no page JavaScript errors, no permission requests, no device subscription attempts, no real API/Push delivery and no Inbox fetches.
- The two intercepted mutation bodies were `{ "crmIncomingMessagesEnabled": true }` and `{ "crmMessagePreviewEnabled": true }`. Each change updated its authoritative controls and triggered the scoped notification unread read.

The QA browser was closed. The existing web server was left running; no API/runtime server was started. This browser smoke does not exercise actual Web Push provider/OS delivery or installation on a physical iPhone.

## Automated checks

- Shared typecheck/build and Prisma client generation: pass. Database migration was not applied.
- API focused integration/regression run: **25 suites /151 tests pass** after the dispatch freshness fix. Includes Operations store/publisher/preferences/test action/permissions, CRM projection/eligibility/grouping, due/follow-up rules, read races, batch writer and manual-send regressions.
- Web focused run: **13 suites /96 tests pass**, including the final extra foreground/background worker scenarios. Includes notification settings/API/query/SSE, Service Worker, workspace navigation, expired-auth routing and CRM read-result cache updates. Worker coverage is22 passing tests.
- API and web typecheck/build: pass. Shared build/typecheck: pass. Scoped changed-file ESLint: pass for API and web. EN/RU i18n parity: **1,277 canonical keys**, pass (233 existing indirect/unused-key warnings).
- `git diff --check`: pass.
- Full API lint: **7,418 errors /423 warnings** in repository code outside this task's changed paths; no errors in the task paths in that run. Focused lint remains the slice gate.
- Full web lint: **145 errors /168 warnings**, matching existing repository debt after the earlier Inbox ref fix; no errors in this task's changed paths.
- Full web tests: **96 failed /338 passed files;32 failed /1,636 passed tests;2 unhandled errors**. Same failure-file/test counts as the Inbox baseline. Existing Vitest configuration discovers backend Finance specs under jsdom; additional existing template/contact/modal/provider failures remain. This is not a green full-suite gate.
- Full API tests again ended without a final Jest summary: an existing development-connection-drain timer invoked `process.exit(0)` after14 unrelated failed suites were printed. Exit0 is not evidence of passing tests. Failures include unchanged dialog-batch mock configuration, contact-sales summary, System Bot, import and Finance suites, as in the prior Inbox baseline.
- Architecture normal: **16/16 policy tests pass;20 pre-existing source errors**. Strict: **16/16 policy tests pass;26 existing source errors** with transitional allowances ignored. No new notification file violates the checker; thresholds and allowances were unchanged.
- Grace/Knuth/Parnas preflight and Parnas/Turing final review were completed. Turing's queued stale-privacy/eligibility P1 was fixed and re-reviewed without a remaining blocker.

Reproduce focused API tests:

```sh
pnpm --filter api test -- --runInBand --testPathPatterns='operations-notification|operations-web-push|telegram-crm-(incoming-notification|internal-notification|notification-|follow-up-|message-batch-writer|batch-store|read.service|manual-send)'
```

Reproduce focused web tests:

```sh
pnpm --filter web exec vitest run src/components/features/operations/notifications src/lib/features/operations/operations-notifications-api.test.ts src/lib/features/operations/operations-notifications-query.test.ts src/lib/pwa src/components/features/identity/auth/protected-route.test.tsx src/lib/features/workspace/workspace-route-access.test.ts src/components/features/growth/ad-sales/crm/crm-navigation.test.tsx src/components/features/growth/ad-sales/crm/use-crm-thread.test.tsx
```

## Scenario coverage and limits

| Requested scenario | Evidence |
| --- | --- |
| New inbound; burst; source replay | Incoming projector, batch/store SQL contract and publisher tests; grouped cache updates |
| Already read; concurrent incoming/read | Domain delivery policy, batch-store same-batch read and manual read watermark/tail regressions |
| Active exact chat, another foreground chat, background tab | Worker scenarios retain delivery without visibility-only suppression; actual OS display remains manual |
| Closed PWA | Worker opens exact safe target with no existing windows; actual installed-device delivery remains manual |
|2–5 devices; no subscription | Push fanout tests assert one claim and shared ready-cohort read, bounded subscription selection |
| Denied permission | Settings tests assert explicit-only permission request, denied status and no automatic subscribe |
| Workspace/own-only | Recipient/permission/domain-policy tests; foreign-workspace stream rejection, coordinator membership checks |
| Opt-out/privacy change while queued | Saturated-queue tests mutate master/incoming/preview, read/expiry/access/subscription/domain eligibility and claim token before capacity is released |
| Notification click; expired session | Worker target/focus/navigation-failure cases, ProtectedRoute/login target preservation and coordinator tests |
| Follow-up reminder/replay | Current task occurrence, completion/snooze/archive, preferences and recipient tests; due and dispatch share eligibility rules |
| Lost subscription/provider failure |404/410 batched deactivation,429/500 no retry, queue saturation/age/capacity release tests |
| Future Support mock | Generic policy registry accepts separate mock domain; generic private payload and Worker mock Support tests have no CRM UI assumptions |

All external push calls are mocked in automated tests. The [delivery plan](../../plans/crm-notifications-pwa.md) documents physical iPhone steps, costs, supported-browser sources, rollout/rollback and known best-effort limitations. [Changed-file inventory](changed-files.json) is scoped against the task-start hashes, preserving earlier Inbox and unrelated Finance changes.
