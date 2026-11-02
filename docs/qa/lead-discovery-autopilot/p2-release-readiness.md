# P2 release readiness — 2026-11-01

Verdict: NOT READY for limited staging pilot. This is not a production readiness assessment.

## Migration verification

PostgreSQL 17, disposable local instance. Direct `prisma migrate deploy` on a genuinely empty database fails at historical migration `20260814000001_enable_finance_for_business_workspace`: it assumes a particular workspace exists and violates a foreign key. That tracked historical migration was not edited. After inserting a synthetic workspace with that ID and marking the failed isolated attempt rolled back, direct deploy applied the remaining migrations; migrate status reported all 206 up to date, schema verification passed and repeat deploy was a no-op. This recovery is not equivalent to an unattended clean install.

The repository's `db:deploy:safe` baseline reconciliation succeeded on another empty database, marking historical pre-baseline migrations including the workspace-specific one as applied and deploying later migrations. Schema verification passed, status reported 206 up to date and repeat deploy was a no-op. This is a squashed baseline path, not execution of every historical SQL migration. Two new, untracked migrations had FK names inconsistent with Prisma's schema and were corrected; they must not be substituted for already deployed migration files without first verifying deployment history.

For upgrade verification, a separate database was created from the HEAD baseline and its migrations, then populated with a synthetic workspace, Lead Source and observation. Applying the nine local Lead Discovery and AI result migrations with `migrate deploy` preserved the observation and schema verification passed. This does not simulate a production-sized copy or real CRM records. PostgreSQL catalogs show 17 foreign keys across the relevant tables and the expected primary, unique and other indexes; exercised migration-backed integration tests additionally cover unique constraints and claim transactions.

## Full API test failures — baseline comparison

A clean `git archive HEAD` checkout, sharing the same installed node_modules, was run against the 13 suites that failed in the original full run. All 23 failing test names matched exactly. Thus they predate the current uncommitted changes in this environment; their underlying product impact is not established. The shared dependencies mean this is a source baseline comparison, not a fully hermetic dependency baseline. No evidence links these failures to Lead Discovery or this change; none has been proven safe in a real pilot. Investigate any relevant end-to-end dependency before enabling it.

| Suite | Observed failure mechanism / disputed contract | Count |
|---|---|---:|
| Finance ledger | stale/current and historical exchange-rate expectations differ | 2 |
| Telegram unified import | changed-field description differs from fixture expectation | 1 |
| Telegram channels characterization | mocked Prisma lacks `$queryRaw` in missing-revision path | 1 |
| Telegram channel networks | aggregate/detail, pagination and batched source query expectations differ | 3 |
| System Bot forwarded content parser | multiline formatting and literal-markup round trips differ | 2 |
| Managed post scheduling identity | fixture lacks `telegramManagedPost.updateMany`, including expected error paths | 4 |
| Bot billing | fixture lacks aggregate API; runtime filtering expectation differs | 3 |
| System Bot Finance | account/category choice and interaction-slot rejection expectations differ | 2 |
| System Bot post flow groups | selected-channel default group payload differs | 1 |
| Finance import rates | workspace argument expectation differs | 1 |
| System Bot posts routing | route arguments differ | 1 |
| Account locale | persistence promise rejects instead of returning expected locale | 1 |
| System Bot handler layout | expected reply keyboard is absent in mock call | 1 |

These descriptions identify the immediate failing seam; they do not claim a root cause beyond test output. They are not fixed as unrelated global failures. The System Bot and channel cases warrant specific regression validation if the staging workflow relies on them; the rest do not individually block a narrowly isolated pilot absent a demonstrated dependency.

## Operational notes and reproducibility

Mock load: one source, 1,000 synthetic observations over 20 pages, 12,738 ms, 17,659 Prisma query events including 502 harness status reads (17,157 after subtracting those reads), 103 mock provider calls, 898 SAFE_SKIP, 102 NEEDS_AI, all 1,000 queue rows COMPLETED. The synthetic sample has many duplicate creatives; the provider-call count includes both classification and extraction, not one call per NEEDS_AI. Relation sizes including indexes: queue 1,253,376 bytes; auto config 32,768; candidates 131,072; history jobs 65,536; observations 1,982,464. These are local PostgreSQL measurements, not Neon or Railway capacity figures; harness/transaction queries remain in the count. The load test is `lead-load.integration.spec.ts`, gated by `LEAD_LOAD_TEST_DATABASE_URL` and must target a disposable migrated DB.

Queue admission limits pending work to 5,000 per source and 50,000 per workspace and uses reconciliation for overflow. Historical/completed records and UNKNOWN operations have different retention semantics; these limits are not a cap on all persisted rows. Executor lease is 15 minutes. Startup/recovery and event-driven bounded wakeups exist; no new polling loop was added. At 100 channels the workspace-wide limit, query volume and retention need a separate real staging measurement; the single-source result must not be extrapolated to hosted capacity. AI retention processes bounded batches of 20,000; unresolved receipts require reconciliation. Idle and Neon sleep impact was not measured on the deployed platform.

Mock integration exercises duplicate suppression, one UNKNOWN among independent posts, grants/budget, history pagination, restart and reciprocal evidence; durable result integration exercises crash/replay, budget and reconciliation; isolated claim integration uses two clients. Mock tests do not prove real MTProto, actual provider network failure semantics, frontend browser behavior, or deployed two-instance behavior. No outbound messaging or paid AI was invoked by these tests.

## Staging checklist

1. Provision an isolated staging database, staging application and a dedicated permitted Telegram account/channel. Verify migration history first; use the documented baseline reconciliation only when its prerequisites apply. Confirm status and drift before starting services.
2. Set `INTERNAL_LEAD_DISCOVERY_ENABLED=true` and narrowly scoped `INTERNAL_LEAD_DISCOVERY_GRANTS` for the test workspace, source binding and account. A grant is a JSON array item with `workspaceId`, `sourceKey`, `accountId`, canonical `channelId`, `reference` (`policy:` or `consent:` prefix), boolean `ingest` and `ai`, and an unexpired UTC `expiresAt`; add `allowOwnChannel: true` only if needed. Validate against `lead-policy.service.ts` and use minimum privileges. Configure workspace role permissions and explicit category and workspace limits. Leave `INTERNAL_AI_ENABLED=false` until an explicitly approved paid-AI test; the integration tests inject mock providers in code and this is not a configuration switch for a live mock provider.
3. Connect the dedicated Telegram account, validate the allowed source, then open its history panel and start analysis. Inspect pages, queue and candidates, source links and evidence. Test new-message ingestion, pause/resume, restart, revoke grant, and budget exhaustion with controlled adapters. Record operation IDs and verify no automatic sends and no unrelated CRM changes. Repeat fencing with two staging API instances.
4. Run browser acceptance with an isolated authenticated staging user. History progress currently reports collection, not analysis-queue completion; the completed-history panel does not expose pause for an executor still running. The manual refresh now invalidates candidate cache, but those limitations and real browser flow require verification before pilot.

For immediate stop, use the source autopilot pause endpoint (`POST sources/:id/autopilot/pause` under the controller's API prefix) or disable the feature and restart the isolated deployment; revoke the relevant grants and disable AI where appropriate. A request already dispatched can still complete and incur cost. Preserve UNKNOWN operations, receipts and durable results for reconciliation; do not retry or delete them to force progress. Roll back application code only after checking compatibility with the additive schema; do not blindly roll back migrations or drop tables. Production deployment and paid calls require separate authorization.

The clean-migration test also exposed a real AI reconciliation defect: negative rollup upsert violates PostgreSQL checks before conflict handling. It was fixed by updating the existing row inside the same locked transaction; migration-backed durable-AI and focused ledger tests pass. A separate stale-binding test was corrected to change a binding field, because the deployed trigger deliberately ignores direct revision increments.

Final complete API rerun: 520 suites passed, 13 failed, 5 skipped; 3,522 tests passed, 23 failed, 7 skipped. The 23 failure names exactly match the archived HEAD baseline. One earlier concurrent full rerun exited 139 without a summary; the separate rerun completed. Focused AI, CRM Copilot and lead tests: 35 suites, 430 tests passed; 5 database-gated suites skipped in that command and were run separately as described. Migrated PostgreSQL tests: executor, pipeline and durable AI each passed; claim tests passed 3/3 on the test's separate minimal schema. Executor test left asynchronous handles, so explicit `--forceExit` was used on reruns. API build, web typecheck and focused UI lint passed; focused history panel tests 7/7 passed. Whole-web lint failed with 142 errors and 168 warnings; no baseline comparison was performed for that result.

Priority: P0 clean raw migration sequence fails; decide and implement an approved forward-compatible baseline/deployment solution before requiring unattended clean deployment. P1 actual isolated staging/Telegram/browser acceptance and two-instance deployed behavior remain unverified; queue progress and pause after history completion are not exposed in the panel. P1 the full suite and whole-web lint are not green; confirm whether release policy permits the evidenced pre-existing API failures and investigate web lint. P2 validate hosted costs, latency, idle behavior, overflow and retention under 100-channel staging load. The sample is not evidence of production capacity.
