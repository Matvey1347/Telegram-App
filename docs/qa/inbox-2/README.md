# Inbox 2.0 verification

Date: 2026-10-30. Screenshots show the production React components with test-only customer fixtures based on the supplied prototype. All browser API traffic was intercepted. There were zero real Telegram sends and no database access from the browser run.

## Browser evidence

- Desktop: [1440 px](screenshots/desktop-1440.png), [1024 px](screenshots/desktop-1024.png).
- Mobile: [390 px list](screenshots/mobile-390-list.png), [390 px thread](screenshots/mobile-390-thread.png), [390 px details](screenshots/mobile-390-details.png), [320 px thread](screenshots/mobile-320-thread.png).
- [Machine-readable checks](browser-report.json): widths 320/390/768/1024/1440, no document horizontal overflow, no page JavaScript errors; fullscreen details only at <=768.
- Browser Back, details open/close, unsent draft restoration, unavailable actions and a reduced visual viewport with the composer visible were exercised. [Keyboard-sized viewport](screenshots/mobile-390-keyboard-viewport.png). Real mobile OS keyboard/PWA installation remains manual QA.
- The existing user-owned local web server was reused; it was not stopped. A separate attempted Next dev startup exited because the existing server held the lock. The QA browser was closed. No API/runtime server was started by this task.

## Automated checks

- Shared typecheck/build: pass.
- API typecheck/build and focused lint: pass.
- API focused suites: 5 suites / 48 tests pass, including formatted replay, copied @handle, compact cursor/authorization, cache exclusion, live edits and SSE filtering.
- Web focused suites: 11 suites / 78 tests pass, including mock Support capabilities, 100/1,000 rows, mobile layout, drafts/retries, permissions, filter entry, retained cursor tails and workspace stream changes.
- Web typecheck/build: pass. Focused changed-file ESLint: pass after fixing a ref read during render.
- Full web lint: existing repository failures; initial run 146 errors/168 warnings included the now-fixed new ref-render error. No changed-file lint errors remain.
- Full web tests: existing configuration also discovers backend Finance `.spec.ts` under a jsdom Vitest runner; final full run 96 failed/336 passed files and 32 failed/1585 passed tests, plus 2 unhandled errors. All changed Inbox suites pass in the focused rerun. Remaining errors include untouched Finance import/runner failures and existing contact action modal/provider failures. Do not describe this gate as green.
- Full API test run did not produce a final summary: existing development-connection-drain timer called process.exit(0) after 14 unrelated failing suites had appeared. Shell exit 0 does not establish a passing test suite.
- Architecture: 16/16 policy tests pass; source scan reports the same 20 pre-existing errors as preflight. No new exception, raised threshold, shrinking baseline or new Inbox violation. The strict architecture gate was also run and fails on existing large-file/import debt with transitional allowances disabled.

Production DB/Telegram delivery and multi-replica SSE were not exercised. See [implementation and manual steps](../../plans/crm-inbox-2.md).
