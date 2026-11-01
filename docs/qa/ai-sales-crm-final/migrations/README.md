# Disposable PostgreSQL migration validation

Executed locally on2026-11-01 using PostgreSQL17. No production/staging database URL or data was used. A fresh private `/tmp` cluster listened only on its owned Unix socket (`listen_addresses=''`). The script supplied its own local URL through an isolated generated Prisma config, stopped PostgreSQL in `finally`, and removed the owned cluster data. [Machine report](report.json), [ordered inventory](inventory.json).

Reproduce:

```sh
node --test scripts/verify-crm-migrations.test.mjs
node scripts/verify-crm-migrations.mjs --audit-only
node scripts/verify-crm-migrations.mjs --disposable-local
```

The current script expects PostgreSQL17 binaries at `/opt/homebrew/opt/postgresql@17/bin`. It refuses external URL/config CLI arguments. `--audit-only` reads repository SQL only. The disposable run currently returns exit1 because the clean chain genuinely fails; this is not a successful overall migration gate.

## Actual results

| Check | Result | Evidence |
| --- | --- | --- |
| Empty database, full196 migrations | FAILED | [clean-deploy.log](clean-deploy.log) |
| Squashed baseline in separate forward database | PASSED | [forward-bootstrap.log](forward-bootstrap.log) |
| Explicit synthetic historical Workspace precondition | PASSED | [forward-synthetic-fixture.log](forward-synthetic-fixture.log) |
| Existing predecessor chain through20261028100000 | PASSED | [forward-baseline.log](forward-baseline.log) |
| Synthetic prior account/client/legacy OTHER contact | PASSED | [SQL](representative-fixture.sql), [result](representative-fixture.log) |
| Nine new stage migrations in existing-schema forward order | PASSED | [forward-deploy.log](forward-deploy.log) |
| Final database→current Prisma schema drift | PASSED: no difference | [forward-drift.log](forward-drift.log) |
| Actual index catalog | PASSED | [forward-catalog.log](forward-catalog.log) |
| Composite FK/unique/partial indexes/cascade/data preservation | PASSED | [probes](constraint-probes.sql), [result](constraint-probes.log) |
| Actual production/staging snapshot compatibility | NOT EXECUTED | Synthetic fixtures are not production data |
| PostgreSQL shutdown | PASSED | [stop.log](stop.log), report `clusterStopped=true` |

The clean-chain failure is historical migration `20260814000001_enable_finance_for_business_workspace`, SQLSTATE23503: it inserts Finance access for a hardcoded Workspace not present in an empty database. No migration was edited, resolved, marked applied or bypassed on a real database. The separate representative test explicitly creates a synthetic Workspace matching that documented historical precondition before resuming; it does **not** turn the empty-chain result into PASS. Existing account/client/contact fixtures are synthetic, have no working credentials, and cannot contact Telegram; account sync/send remain disabled.

The probes demonstrate real PostgreSQL rejection of a cross-workspace account receipt, duplicate operation and duplicate pending target; they verify both SQL-owned partial indexes, preserve an existing OTHER Instagram method without automatic promotion, and verify account deletion cascades compact receipts/tombstones. Probe writes run in a transaction and roll back. No performance or production-concurrency claim follows from this small dataset.

## New-stage order and review

1. `20261031080000_crm_notification_preferences`: enum additions precede no typed writes in this file; opt-in defaults are safe. Adds constant-default preference fields, no mass outreach.
2. `20261031110000_crm_sales_workflow`: additive manual status; bounded sale history index; SQL-owned partial reminder expression index. Existing index drop/create needs maintenance lock review.
3. `20261031150000_internal_ai_infrastructure`: workspace/category config, operation, budget and usage tables; workspace FKs, request uniqueness, status/expiry/time indexes and nonnegative accounting checks.
4. `20261031180000_crm_ai_sales_copilot`: draft domain receipt and conversation/account/workspace relationships plus retention/request indexes.
5. `20261101010000_telegram_lead_discovery`: workspace/source/account/candidate composite FKs, observation source/external-message uniqueness, review/expiry/source indexes. Source deletion/retention semantics remain application concerns.
6. `20261101100000_ai_lead_qualification`: qualification and first-draft receipts with workspace/candidate composite FKs and expiry/context indexes; pending child records must be protected before candidate cascade cleanup (stage11 code fixes this).
7. `20261101120000_crm_instagram_contact_type`: separate enum commit.
8. `20261101120100_crm_instagram_manual_contacts`: typed contact identity fields, compact manual dates, receipt uniqueness and SQL-owned partial retention index; no automatic OTHER promotion.
9. `20261101130000_telegram_chat_actions`: deletion state, unread snapshot fields, compact operation receipt/account-workspace FK, pending-target partial index, account-scoped deletion identity and numeric message index.

Prisma's no-difference result does not inspect every unsupported SQL-owned check/partial index; actual PostgreSQL catalog/probes provide the additional evidence. All nine migrations ran separately through Prisma so the Instagram enum addition committed before later typed use.

Production caveats: this local run does not measure locks/index build duration on populated production tables, actual existing-data conflicts, restore time, replica routing, Neon p95/BUFFERS or actual migration history state. Normal CREATE INDEX/ALTER TABLE can acquire locks. A separately authorized sanitized production-like snapshot and backup/restore rehearsal are required before rollout. Never insert the synthetic historical Workspace into production just to force a clean migration; fix/document historical bootstrap policy separately. Roll back application feature flags first, preserve additive safety/UNKNOWN/accounting data, and review any destructive rollback independently.
