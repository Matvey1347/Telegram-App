# Lead Discovery QA — Prompt №7

Local verification on 2026-11-01. All channel/provider fixtures are synthetic or mocked. No database migration was applied, no live channel was collected, no paid AI request, join or commercial message was made. This report distinguishes UI/contract checks from live integration acceptance.

## Implemented surfaces

Sources, bounded text/CSV import preview, account/channel chooser, explicit validation/scan/recovery/manual material import, source processing settings and CSV/XLSX export; advertisement feed with review/evidence/costs; candidate detail, strong-identity deduplication, human review and existing CRM linking. Inbox AI Leads uses a real candidate queue without a fake chat. `LEAD_QUALIFICATION` and lead notifications remain disabled for this stage.

[Architecture, endpoints, limits, costs, grants and rollout](../../plans/telegram-lead-discovery.md). [Owned file manifest](changed-files.txt) identifies this stage within the existing multi-stage uncommitted worktree.

## Verification results

[Final command evidence](verification.txt) is recorded alongside this report; red inherited gates are retained, not suppressed. Unit/API fixtures validate observable state and errors; they do not replace two-connection PostgreSQL race tests.

| Gate | Result |
| --- | --- |
| Prisma validate / generate | Passed; migration not applied |
| Shared typecheck / build | Passed |
| Focused API tests | Combined27 suites /254 tests passed; includes Discovery, AI, transport, runtime, cache, retention and CRM integration |
| Focused web core / permission / cache / Inbox | 74 passed |
| Shared Select and affected consumer regressions | 70 passed |
| Web typecheck / production build | Passed |
| Scoped API/frontend lint / i18n / diff | Passed |
| Full web test baseline comparison | 352 passed / 96 failed files; 1,748 passed / 32 failed tests, plus two existing icon mock errors; zero newly failing test names relative to Prompt №6 |
| Full web lint | Existing 142 errors / 168 warnings |
| Full API tests | Incomplete: process exited139 before summary, with13 failing files already reported; not a passing suite |
| Architecture policy | 16/16 tests; normal22 inherited source violations, strict28; no new violations |
| API typecheck / build | Failed on exactly the five baseline errors: System Bot branding49/56/57 and Telegram Accounts855/877; no new production errors |

The shared primitives allowance was lowered from 1,737 to 1,505 after extracting the existing Select; no threshold was raised. MTProto adapter and runtime were reduced through cohesive neutral helper extraction. New feature files remain below warning/hard limits; monitor is above the advisory 400-line target but below 500.

## Backend regression matrix

- Source normalization/duplicates, CSV quoted multiline/header roundtrip, private invite rejection, explicit own-channel override, immutable channel IDs, workspace/account isolation and grants with wrong source/account/channel/reference/expiry.
- Idempotent hash/status ingestion, no unchanged writes, new/edited/deleted materials, interrupted batches, stale checkpoint/recovery/history/live ordering, source reconfiguration during RPC, quota failure and no implicit AI.
- Strict advertisement/mutual/organic/UNKNOWN schemas, malformed output, role/evidence grounding, missing contact, literal channel destination protection, Instagram profile constraints and content/version deduplication after interrupted paid attempts.
- Existing gateway budget exhaustion, provider timeout and UNKNOWN holds remain visible; current permissions and source eligibility are checked before each paid stage.
- Same strong identity across sources; similar names remain different; aliases after manual merge; preserved review decisions, ambiguous CRM identities, all confirmed contacts, DNC and no peer/conversation/send creation.
- Continuous coverage versus source age/history, unresolved/UNKNOWN material, recent edit of an old post, stale compact ad time, gap/recovery ordering and deleted/access-lost original links.
- Event-only idle behavior, disabled flag does no registry/event work, 1,000-source registry, 1,000-item queue, 100-item batches, 20-source recovery bound, no repeated quota/revocation DB work and no infinite retry.
- Cold entity cache strict-ID public hint and bounded private dialog warmup; channel mismatch rejected before message fetch; limited concurrency and timeout capacity retained until actual SDK settlement.
- Evidence expiry and compact acquisition retention; account removal and CRM merge foreign-key compatibility; CSV/XLSX formula protection and 1,000-source export.

The full API run (`pnpm --filter api test -- --runInBand`) exited139 without a Jest total. Reported failures include existing Telegram import/channel/network fixtures, System Bot, bot billing, consumer Finance import rates, account locale, CRM dialog batch writer (missing workspace-settings mock) and CRM sales summary (older expected shape). Those implementation/test files are unchanged from this stage's exact baseline. The focused integration suite exercises the actual changed CRM runtime/merge/removal paths separately. No full-suite success or absence of further failures is claimed.

Final read-only integration review found no remaining P1/P2 blockers and independently passed14 focused suites /111 tests. This overlaps the combined suite; counts are not additive. It verified the source row lock, stale-material guards, both coverage-gap commit orders, paid-attempt deduplication, identity checks and content-change retention renewal.

No classifier accuracy claim is made from synthetic response fixtures. Paid model evaluation and approved labeled corpus acceptance are separate rollout work.

## Browser QA and screenshots

[Machine-readable browser report](browser-report.json) records checks at 320, 360, 390, 768, 1024 and 1440 px, no horizontal overflow, source/import/candidate modals, manual merge selection and Inbox candidate queue. All Discovery APIs were intercepted. Browser console errors: zero. Provider, Telegram-send and join calls: zero. Opening Sources performs no account enumeration or Analyze call.

- [Sources desktop 1440](screenshots/sources-1440.png)
- [Sources 1024](screenshots/sources-1024.png)
- [Sources 768](screenshots/sources-768.png)
- [Sources mobile 390](screenshots/sources-390.png)
- [Sources mobile 360](screenshots/sources-360.png)
- [Sources mobile 320](screenshots/sources-320.png)
- [Add source 320](screenshots/add-source-320.png)
- [Import preview 320](screenshots/import-preview-320.png)
- [Advertisement feed 320](screenshots/feed-320.png)
- [Candidate desktop 1440](screenshots/candidate-1440.png)
- [Candidate mobile 320](screenshots/candidate-320.png)
- [Inbox candidates 390](screenshots/inbox-candidates-390.png)

The integrator visually inspected desktop Sources and mobile Candidate screenshots. The browser was closed. QA reused an already-running localhost server; no task-owned dev server was started and the user's existing server was left running.

## Manual staging acceptance

1. Keep the feature flag false. Apply prerequisites and the reviewed additive migration only on staging. Verify foreign keys reject cross-workspace references and allow account removal/client merge through their supported services.
2. With empty grants, confirm permitted users can create paused registry metadata but cannot ingest, scan, recover or analyze; unauthorized viewers cannot enumerate accounts/private channels. Switch workspace and ensure no prior text/candidate cache appears.
3. Add one reviewed expiring source/account/channel grant. Choose an existing live account and explicitly validate a permitted channel. Verify no new runtime/session or channel join. Exercise a cold entity cache (warm known-ID metadata via the account catalog before revalidating paused sources), known channel username change, inaccessible/private source and own-channel rejection/override.
4. Import a small source list twice. Inspect preview and row errors. Import permitted synthetic ad, mutual-promotion, organic, unknown, missing-contact and unrelated channel-link materials. Repeat unchanged import: no new observation or AI call.
5. Explicitly Analyze a few materials with a bounded test budget. Inspect Operations AI Usage by the two Lead categories. Exhaust the budget, timeout the mocked/staging provider and interrupt result persistence; UNKNOWN and receipts must remain visible, without hidden retries.
6. Confirm a business contact, reject another candidate, merge exact reviewed duplicates, link/create a CRM client. Open that client in existing Clients. Confirm no Telegram conversation or outbound message was created and DNC blocks incompatible linking.
7. With two DB connections, delay history/recovery and then persist a newer edit/delete or change source configuration. Release the RPC result: newer material/origin must survive. Delay a coverage gap write behind a successful recovery and test a new disconnect during a delayed recovery; the newer proof or gap must win correctly.
8. Inspect 30-day coverage with pending/UNKNOWN rows, old publications edited today and disconnected sources. `NO_ADS_30D` must never come from source age or a one-time scan. A known left/unsubscribed live source must pause/reset coverage.
9. Run export with cells beginning with formula/control/whitespace prefixes, inspect CSV and XLSX as values. Verify bounded output/truncation. Check direct filters and pagination return the same derived status shown on cards.
10. Expire raw evidence on staging, run the existing bounded cleanup and verify text disappears while linked compact acquisition/source references remain. Reconcile existing AI retention independently; verify capacity before expanding the cohort.
11. At all six viewport widths inspect loading/error/empty/denied states, keyboard Select/listbox navigation, focus inside nested modals, review controls and long contacts. Verify no page-open Analyze calls, idle refetch timer or evidence persistence to browser storage.
12. Disable flag/remove grants and restart: no Discovery listener, registry work or AI. Existing CRM, follow-up, notification, Finance and Support paths must remain available.

## Operational acceptance limits

There is no new periodic idle work, but existing live-account lease renewal and event traffic are real costs. The single-process defensive limits do not constitute a distributed SaaS admission guarantee. Retention is globally bounded at 20,000 deletions/table/day and existing AI cleanup at 20,000/day: sustained multi-workspace maxima exceed cleanup capacity. A small reviewed pilot, staging query plans, resource measurements and aggregate quota/retention review are prerequisites for wider rollout. See the plan's 10/50/100/1,000-source and 0/100/1,000/10,000-post estimates.
