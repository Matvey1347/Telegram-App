# AI Lead Qualification QA and handoff

Local work dated2026-11-01 Europe/Warsaw. [Architecture, scoring, contracts, costs, migrations and rollout](../../plans/ai-lead-qualification.md). No production migration, real Telegram collection, paid model invocation, outreach or final release was executed. All model/Telegram responses used in tests/browser QA are mocks. Do not treat these tests as a measured model-quality benchmark.

## Gates and evidence

[Final command evidence](verification.txt) and [exact owned-file manifest](changed-files.txt) are recorded beside this report. Existing multi-stage uncommitted work was preserved; only the Prompt№8 delta is attributed here.

| Check | Result |
| --- | --- |
| API focused tests | 33 suites /422 tests passed |
| Frontend qualification / CRM / cache / Inbox | 7 files,82 tests passed |
| AI Usage candidate-history integration | 15 frontend tests and11 API read-model tests passed; overlapping existing regression counts are not additive |
| Offline evaluation | 60 distinct synthetic scenarios; strict schema, grounded evidence, scores and commercial-text guards |
| Benchmark harness | 4 safety tests passed, including mocked localhost only; temporary server closed |
| Prisma validate / generate | Passed; additive migration not applied; existing unrelated SetNull/required-field warning remains |
| Shared typecheck / build | Passed |
| API typecheck / build | Five inherited errors in System Bot branding49/56/57 and Telegram Accounts855/877; no masking |
| Web typecheck / build | Passed, including final AI Usage filter delta |
| Scoped lint / i18n / diff | Passed |
| Full web | 354 passed/95 failed files;1,764 passed/30 failed tests; no new failing names versus Prompt№7. Two old CRM contact-modal failures were fixed by completing its icons test mock while adding the lazy acquisition regression. |
| Full web lint | Existing failures remain; 142 errors/168 warnings |
| Full API | Attempted; existing development connection-drain test invokes process.exit before a complete Jest total. A zero shell exit is not full-suite success. Outside-slice failures are retained in the log. |
| Architecture | 16/16 policy tests;22 normal/28 strict inherited violations, unchanged from preflight; no raised allowance |

## Coverage and independent review

The actual context service is tested with confirmed contacts whose evidence is a full sentence; canonical/raw Telegram spelling, replaced username, destination role, source/grant denial, own-channel gate, DNC, foreign workspace, current linked-client ownership, selected product limits, price/channel fact changes and stable semantic fingerprints. An unrelated source checkpoint update must not stale an otherwise current qualification.

Application tests cover explicit qualification, fresh reuse without Gateway/writes, claim ownership/date identity, budget admission versus paid uncertainty, provider/result interruptions, changed source/price/context, high-risk separate acknowledgement and current human decision. Draft lifecycle includes candidate-scoped SALES_FIRST_DRAFT, explicit Save/Approve/edit/reapproval/no-op, revoked qualification, replacement qualification, expiry, financial assertion guards and freshness-checked Copy. Actual Gateway admission validation is exercised with realistic candidate IDs so the83/85-character business namespaces cannot regress beyond the100-character limit.

Prior Discovery, CRM linker/merge, Copilot send/policy, AI budget/accounting/UNKNOWN, response cache and Scheduled Tasks regressions remain part of the combined focused run. Source-qualified metrics count current human-qualified records under current eligibility rather than a raw AI recommendation. Queue filters run before cursor pagination and align semantic evidence/product/policy freshness with detail projections.

The main integrator fixed shared contracts first; Grace mapped reuse, Parnas/Knuth audited structure/cost, Linus and Ada owned separate implementation files, and Turing reviewed integration read-only. Turing final read-only review cleared the current action paths and independently passed8 suites /135 tests (overlapping subset). No reviewer made live provider, Telegram or database calls.

## Browser QA and artifacts

[Browser report](browser-report.json):24 checks across320/360/390/768/1024/1440px;20 screenshots; no horizontal overflow, console errors, provider/send/join calls. All application APIs were intercepted. Checks include explicit qualify→manager decision→draft→Save→Approve→Copy, high-risk acknowledgement, stale/UNKNOWN/denied state, bulk confirmation, mobile focus/scroll and Inbox reuse. Sources/feed remain accessible; no candidate opens a synthetic chat.

The integrator visually inspected desktop details and approved mobile offer. This is synthetic Chromium QA, not physical iOS/Android keyboard acceptance. The browser was closed. An existing localhost server was reused and left untouched; no task-owned dev server was started. The harness's isolated mock HTTP server is closed in test cleanup.

Screenshots:

- [approved-offer-1440](screenshots/approved-offer-1440.png)
- [approved-offer-320](screenshots/approved-offer-320.png)
- [bulk-review-320](screenshots/bulk-review-320.png)
- [denied-320](screenshots/denied-320.png)
- [details-1024](screenshots/details-1024.png)
- [details-1440](screenshots/details-1440.png)
- [details-320](screenshots/details-320.png)
- [details-360](screenshots/details-360.png)
- [details-390](screenshots/details-390.png)
- [details-768](screenshots/details-768.png)
- [inbox-390](screenshots/inbox-390.png)
- [queue-1024](screenshots/queue-1024.png)
- [queue-1440](screenshots/queue-1440.png)
- [queue-320](screenshots/queue-320.png)
- [queue-360](screenshots/queue-360.png)
- [queue-390](screenshots/queue-390.png)
- [queue-768](screenshots/queue-768.png)
- [risk-review-320](screenshots/risk-review-320.png)
- [stale-320](screenshots/stale-320.png)
- [unknown-cost-320](screenshots/unknown-cost-320.png)

## Offline and optional staging benchmark

Dataset: [60 synthetic scenarios](evaluation-scenarios.json). It includes psychologist/course/education/blog/club, repeated/multi-source advertisers, agency/destination/unknown contact, three languages/tones, suspicious investment promises and benign “no guarantees”, irrelevant goods, unknown/mixed price, DNC/rejected/expired/changed material, changed price, injection, timeout/budget/UNKNOWN, duplicates, CRM collision, role ownership and edit/reapproval. Deterministic mocks check schemas, literal citations, policy factors, insufficient evidence and pricing guards. Service tests separately check actual authorization/lifecycle boundaries. Human evaluation must assess false positives/negatives, factuality, contact correctness, relevance, useful personalization, naturalness, repeated opening patterns, price correctness and absence of unauthorized outreach.

Offline, no credentials/network:

```sh
node scripts/ai-lead-qualification-benchmark.mjs
node --test scripts/ai-lead-qualification-benchmark.test.mjs
pnpm --filter api test -- --runInBand lead-qualification-evaluation
```

Live is voluntary and requires a migrated staging build, approved synthetic/permitted seeded candidate IDs, current confirmed contacts/source grants, selected real products and explicit budgets/spend authorization. Prepare a private JSON mapping with `syntheticDataApproved:true`, matching `workspaceId`, and `cases` keyed by scenario IDs. Each case supplies `candidateId` and at most five `productIds`. Draft evaluation additionally requires an independently reviewed human-qualified fixture and `humanQualified:true`; the harness never approves candidates for you.

Configure backend-only shell variables `CRM_LEAD_BENCHMARK_BASE_URL`, `CRM_LEAD_BENCHMARK_TOKEN`, `CRM_LEAD_BENCHMARK_WORKSPACE_ID` and `CRM_LEAD_BENCHMARK_ALLOW_PAID=APPROVED_SYNTHETIC_STAGING_AND_PAID_CALLS`. Only local or explicitly staging-labelled HTTPS origins are accepted; redirects are rejected. Start with one case:

```sh
node scripts/ai-lead-qualification-benchmark.mjs --live --stage qualification --mapping /private/seeded-candidates.json --output /private/qualification-report.json --limit 1
```

Run `--stage draft` separately only for independently human-qualified candidates. Calls are serial, bounded1..60, with no retries, fallback model, automatic follow-on draft, approval, CRM creation or send. UNKNOWN/FAILED/unpriced outcomes stop the run. Reports are private0600 and `modelQualityApproved` stays false. Score the rubric manually; no live invocation was performed for this delivery.

## Manual staging acceptance

1. Keep flags off; apply prerequisite CRM/AI/Discovery migrations and reviewed `20261101100000_ai_lead_qualification` only to staging. Verify composite workspace FKs and that conversation drafts still require a real conversation/contact.
2. Configure a small approved source cohort, qualification flag, selected products, provider/test model and explicit category budgets. Open candidates with view-only, analyze, review, own-only and any roles. Another workspace/client-owner history must be denied; leads-only roles retain access to unlinked candidates.
3. Confirm literal business contacts from current evidence. Test full quote versus generic old quote after username replacement, agency clients, destination channels, exact duplicate identities and DNC/rejected rediscovery. No automatic second client or conversation may be created.
4. Explicitly Qualify. Inspect separate factors/risk/insufficient evidence and current sources/products. Double-click/replay and verify one operation; change the context under the request and confirm stale/uncertain handling. A budget/disabled admission failure that never reached a provider must not become an irreversible paid-uncertainty hold.
5. Approve a qualification manually. High risk needs a distinct meaningful note/acknowledgement. Replace/revoke the qualification and ensure older approved text cannot still be copied; a new current decision can be explicitly reapproved without automatic AI.
6. Generate a first draft separately in NATURAL/CONSULTATIVE/DIRECT and UK/RU/EN/AUTO. Check specificity, no flattery/familiarity, factual channel fit, no invented audience/price/package total. Missing real catalog facts must yield insufficient evidence. Inspect actual output personally.
7. Type without saving: no HTTP write. Save, approve, repeat unchanged actions, edit and reapprove. Try wrong revision/author, expired draft, unsupported financial assertion, revoked source/permission, changed contact/product price/channel metadata and DNC immediately before Copy. Copy must re-read authoritative permission/freshness, without sending.
8. Link/create a client through the canonical reviewed CRM linker, then open its lazy acquisition section. Purchase context must be proven linked/authorized. A real conversation, when independently created through supported transport, remains subject to ordinary CRM/Copilot guards; no candidate-transfer/send shortcut exists.
9. Use SQL concurrency tests with two staging connections: delayed claim/provider/result persistence, concurrent approval/rejection/contact change and new observation/source/product mutation. Verify read-only staleness and paid claim replay. Inspect plans for derived queue filters/analytics at expected candidate/evidence volumes.
10. Inspect AI Usage Classification/Extraction/Qualification categories and candidate-first-offer history filter; it must return only candidate SALES_FIRST_DRAFT receipts with known/unknown costs and preserve workspace/date/cursor rules. Aggregate scope is explicitly unchanged by the local history filter. No copied prompt/response enters telemetry.
11. Exercise all workflow/high-priority filters, pagination, bounded bulk confirmation, loading/error/empty/denied/UNKNOWN/stale states, keyboard focus and six viewport widths. Test physical mobile keyboards separately. No page-open provider request, polling or textarea persistence may occur.
12. Expire settled artifacts, run the existing daily bounded cleanup and verify removal without deleting/refunding AI holds. Review the capacity limits below; disable flags/category/grants and restart to verify rollback leaves existing CRM/Discovery/manual chat intact.

## Known limitations and runtime acceptance

Queue summaries/source metrics can temporarily remain optimistic when an unlinked candidate newly matches a CRM/DNC identity. Current detail/actions block DNC or ambiguity before AI, approval or Copy; collection projections intentionally avoid an identity lookup per row.

API build remains blocked by five unrelated errors; migration/real DB plans/concurrency, provider quality and physical devices were not verified. Retained UNKNOWN/GENERATING business claims cannot be self-service retried/discarded in this stage; ledger reconciliation settles financial reservations but does not reconstruct missing output or clear domain claims. A future explicit receipt-checked recovery action is required. Linked parent candidates may retain such claims indefinitely within per-candidate/author caps; do not present the seven-day TTL as an unconditional deletion guarantee.

Candidate drafts authorize Copy/Open externally only, not an internal Telegram send. A future real-conversation transfer needs current identity/ownership/transport/source checks and renewed conversation approval. Reserved AI lead notifications remain disabled until candidate-specific visibility, delivery recheck, grouping and deep-link handling are added through Operations Notifications.

No new recurring worker/poll/handle exists. Two bounded artifact cleanup queries run during the existing daily maintenance wake even when empty. Existing runtime leases and user-triggered reads still have real costs. The plan records exact logical call budgets and0/50/500/2,000-candidate estimates. At2,000 candidates with both stages,4,000 additional AI operations/day consume20% of global20k cleanup capacity before other features/workspaces. Derived SQL predicates and retained evidence scanning need staging EXPLAIN; few roundtrips are not a guarantee of few scanned rows or low billing.
