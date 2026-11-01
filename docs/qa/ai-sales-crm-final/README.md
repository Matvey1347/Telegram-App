# AI Sales CRM final integration QA — stage 11

2026-11-01 Europe/Warsaw. **Production decision: NO-GO.** This audit completes the available local checks and fixes; it is not production acceptance. No production deployment/migration, real customer Telegram send, live collection or paid AI evaluation was performed.

- [Architecture/status/readiness report](../../plans/ai-sales-crm-release-readiness.md)
- [Staged rollout and physical-device checklist](release-checklist.md)
- [Actual feature flags/defaults/permissions](feature-flags.md)
- [Neon/Railway/AI measured-versus-estimated audit](performance-audit.md)
- [Failure classification and exact cases](failure-classification.md)
- [Migration execution and reproduction](migrations/README.md)
- [Exact stage11 changed files](changed-files.txt), [command evidence](verification.txt)

## Final gates

| Gate | Status | Actual result |
| --- | --- | --- |
| Focused API integration |PASSED |138 suites /1083 tests |
| Focused frontend integration |PASSED |55 files /409 tests; additional Clients selector regression1/1 |
| Full API Jest (Node20.19.0 and22.22.2) |FAILED |504 passed /13 failed suites;3300 passed /23 failed tests;517 suites /3323 tests; final summary and exit1 |
| Full web after runner correction |FAILED |357 passed /19 failed files;1809 passed /29 failed tests;376 files /1838 tests; final summary and exit1 |
| Shared typecheck/build |PASSED |Both commands completed |
| API typecheck/build |PASSED |All five original TypeScript errors fixed; final Nest build successful |
| Web typecheck/build |PASSED |Final source build and typecheck successful |
| Prisma validate/generate |PASSED |Existing unrelated SetNull warning remains |
| Actual representative forward migrations |PASSED |New disposable PostgreSQL17,196 migration chain including9new stages, zero Prisma drift; actual FK/unique/partial/cascade/preservation probes |
| Empty clean migration chain |BLOCKED |Historical hardcoded Workspace precondition fails23503; no historical SQL changed |
| Production/sanitized snapshot compatibility |NOT RUN |Local synthetic fixture is not a target production snapshot |
| Scoped lint |PASSED with explicit inherited exception |Changed API/web paths clean except existing Accounts production file31errors/9warnings; no new scoped debt |
| Full web lint |FAILED |142errors/168warnings, inherited debt |
| Normal/strict architecture |FAILED |16/16 policy tests pass;22 normal /28 strict inherited violations; no threshold increased |
| Browser mock QA |PASSED |35/35 checks, six widths,25 screenshots, zero page errors |
| Offline AI harnesses |PASSED |48 Copilot +60 qualification synthetic scenarios validated; six harness guard tests; three migration-script guards |
| Real Telegram/provider/Push |NOT RUN |Requires approved staging/test identities and separate paid budget where applicable |
| Physical iPhone/PWA |REQUIRES MANUAL QA |No actual device used |
| Production-like SQL/RSS/CPU/p95/locks/storage |NOT RUN |No invented measurements; migration probes are not load tests |
| Whitespace/delta ownership |PASSED |Diff check and exact before-hash manifest; other uncommitted stages preserved |

Current focused API tests pass on default Node24.18.0. Some complete Node24 full runs returned real red summaries, while later parallel and sequential full attempts crashed with SIGSEGV in native V8 GC without a summary. Those are environment/runner failures, never passes. Both installed Node22.22.2 and the exact .nvmrc20.19.0 run the unchanged pnpm script with the same complete red summary. The temporary official Node20 archive was checksum-verified and removed; pinned-runtime API typecheck/build and web build passed. Node20 is EOL according to the [official release schedule](https://nodejs.org/en/about/previous-releases); selecting and verifying an aligned supported runtime remains a release prerequisite. Global runtime/configuration was not changed. [Diagnostics](runtime-diagnostics.json). The original drain-test forced exit was removed from test infrastructure without changing production shutdown.

Vitest previously collected75 product backend suites under jsdom. The corrected runner targets product web code; all75 backend suites were actually executed by API Jest, including their remaining failures. [Runner ownership proof](runner-ownership.json). No backend test was deleted or hidden. The remaining API/web failing files are unchanged versus the stage11 baseline; this establishes attribution, not acceptable business behavior. Financial-rate, parser fidelity and other assertions still require owning-domain triage.

## Fixes and integration evidence

- Typed Prisma runtime enum and explicit raw channel-import read model removed five original API build errors. Accounts file shrank985→984; existing unsafe legacy lint debt was preserved, not expanded.
- Three CRM fixture failures now follow actual import-settings and compact sales-summary contracts. Drain test uses fake timers/injected exit so full Jest is trustworthy.
- Manual send refreshes current permission after runtime wait; merge refreshes locked current owners; SSE authorizes bounded event bursts against current membership/current resource owners. Queue overflow closes for reconciliation; idle creates no auth query. New Copilot fixture was updated for the security boundary and retested.
- All sensitive CRM/legacy Sales server responses bypass response cache; fresh authorization cannot be skipped by cached workflow/activity data.
- Copilot cleanup preserves UNKNOWN/GENERATING and candidate cleanup protects parents of unresolved qualification/draft claims, preserving financial/domain recovery evidence. True concurrent expiry/claim races remain an actual PostgreSQL stress acceptance item.
- UI distinguishes definitive4xx from UNKNOWN, blocks imperative blind text resend, resets AI query family with workspace changes and uses compact mobile AI Usage period cards. Clients sorting test now interacts with the actual shared custom selector; no user behavior was weakened to make a fixture green.
- Independent Turing review passed12suites/81tests, then2suites/11tests for final stream/runner changes (overlapping subsets), inspected new security/lifecycle code, and found no unresolved known newly introduced production P1/P2; final fixture corrections were then verified in integration runs. Grace and Knuth/Parnas mapped actual runtime/structure/cost before integration.

The final React checklist verified the narrow provider/UI changes: no added hooks/effects, polling, eager media or request waterfalls; workspace query-family and UNKNOWN guards have behavior regressions. Detailed source/test links are in the main report; exact API/web failures and case titles are retained in [api-failures.json](api-failures.json) and [web-failures.json](web-failures.json).

## Scenario evidence A–G

| Scenario | Local evidence | External acceptance |
| --- | --- | --- |
|A Telegram inbound→store→SSE/Inbox/unread→notification→manual reply→reconnect |Runtime/batch/read/manual/SSE/notification mock suites; browser thread/navigation |NOT RUN with real MTProto test peer |
|B Reply/edit/delete/react/forward/rich/media/voice/UNKNOWN |Shared transport/action/receipt/store/read-snapshot tests and browser controls/lazy media |Native provider/device restrictions require staging |
|C Sales/status/purchases/package/follow-up/DNC/merge |Workflow/task/recipient/purchase/merge regressions, existing screens |Real due notification/privacy and pool contention require staging |
|D Source→ingest/classify/extract/dedup/review/link/export |Policy/ingest/monitor/evidence/export suites |Approved real source access/coverage/recovery NOT RUN |
|E Qualification→decision→proposal→approve/fresh Copy |Preparation/schema/risk/current-source/identity tests; offline corpus |Human-labeled model quality/cost NOT RUN |
|F Copilot→budget→draft→approval/current guard→manual send→Usage |Gateway/admission/ledger/context/send provenance tests, Usage browser fixtures |Actual provider receipt/quality and controlled send NOT RUN |
|G Instagram-only/combined client→manual facts/AI Copy/profile/follow-up |Canonical manual identity/activity/task and lead tests from focused gate |Manager staging acceptance; no Direct transport exists |

## Browser / mobile

[Machine report](browser-report.json). Widths320/360/390/768/1024/1440; all35 checks pass. Thread, reply/edit/delete, attachment preview, explicit audio-file fallback, lazy media, details/Back, UNKNOWN verification, Copilot collapse/expand and AI Usage/config/held-receipt navigation were tested with intercepted fixture APIs. No real AI/provider/Telegram send. All displayed USD/token values are synthetic fixtures, not observed costs.

Root visually inspected [expanded Copilot at390×520](screenshots/copilot-expanded-keyboard-390.png) and [Usage320](screenshots/usage-320.png). Existing collapsed/lazy Copilot and30dvh content bound already keep the composer reachable; no full chat redesign was needed. Usage cards now use two mobile columns. A short viewport is not proof of physical iOS keyboard, microphone, file picker or installed-PWA Push behavior.

Screenshot index:

- Threads: [320](screenshots/thread-320.png), [360](screenshots/thread-360.png), [390](screenshots/thread-390.png), [768](screenshots/thread-768.png), [1024](screenshots/thread-1024.png), [1440](screenshots/thread-1440.png)
- Navigation: [list](screenshots/list-390.png), [details](screenshots/details-390.png), [keyboard](screenshots/keyboard-390.png), [expanded Copilot](screenshots/copilot-expanded-keyboard-390.png)
- Actions/media: [reply](screenshots/reply-1440.png), [edit](screenshots/edit-1440.png), [delete](screenshots/delete-320.png), [media](screenshots/media-1440.png), [attachment](screenshots/attachment-390.png), [voice fallback](screenshots/voice-fallback-390.png)
- Usage: [320](screenshots/usage-320.png), [360](screenshots/usage-360.png), [390](screenshots/usage-390.png), [768](screenshots/usage-768.png), [1024](screenshots/usage-1024.png), [1440](screenshots/usage-1440.png), [held](screenshots/held-320.png), [config320](screenshots/config-320.png), [config1440](screenshots/config-1440.png)

## Runtime, cleanup and handoff

Existing connected CRM runtime renews one lease every30s (~2880writes/day); last-account stop does not release it until shutdown. This remains P2, with deliberate drain/restart mitigation rather than an unsafe one-line release. Fresh SSE adds event-driven authorization reads per burst/client, not idle polling. Discovery global retention/recovery/analytics and media bounds are quantified in the performance audit; arbitrary SaaS capacity is not claimed.

The disposable PostgreSQL cluster was started only for this audit, then stopped and removed. Browsers were closed. No task-owned API/web dev server was started; existing localhost was left untouched. No production database, customer, paid provider or external source collection was used.

Before any rollout, execute the unchecked staging/device/provider/performance items in [release-checklist.md](release-checklist.md), resolve red gate disposition and historical bootstrap policy, and review exact flags/grants/budget. Retain DNC, canonical history, unknown paid/remote receipts and tombstones during rollback. This handoff authorizes no production action.
