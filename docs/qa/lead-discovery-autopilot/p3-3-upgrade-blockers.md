# P3.3 — upgrade blockers

Verdict: BLOCKED. Production was accessed only by read-only queries. No production migrations, dump, branch, session export, Railway restart, Telegram request or paid AI call occurred.

## Historical checksums

### `20260920150000_add_managed_post_auto_deletion`

Recorded SHA-256 `e225f54e141c75efdd8dbc801964d65d307350a25d412d193c4b9c5faaa8a53b` exactly matches the first six lines plus the terminating newline of the current file: two `TelegramManagedPost` columns and the `(status, deleteAt)` index. Current and only reachable Git version (introduced in commit `d30697e9a8653a90277e162654855e47afc26722`) hashes to `bc9e11627a4e0efb2ca2269ad2f7ed521bd8050e71dbab68b3660db63a21979c`: the rest of the file adds two data backfills from ad-sale placements and cross-promotion JSON. Therefore the recorded migration did not contain those appended statements. This does not prove those updates were never executed by some other process.

At inspection, catalog types/nullability and the named index match those six SQL lines. Read-only evaluation of the current file's backfill predicates found 8 distinct managed posts with an ad-sale snapshot but missing hours and 10 distinct posts with a valid cross-promotion duration but missing hours; overlap was not checked. These are eligible under the predicates, not proof of history or authorization to update. The two backfills are unrelated to the nine pending Lead Discovery migrations, but their existing business-data impact requires a separately reviewed decision. Do not run either in this preflight.

### `20260929230000_channel_public_url_and_cross_promotion_confirmation`

Recorded SHA-256 is `fbecb9b593fd527d9efe1442d5befc0af0965568a52a4ed02ed1ccd67797eae0`; current and only reachable Git version introduced in `1e20daf2cb506bb79e74cec2bd3c0aa93af9bb55` hashes to `c176e8f6c0f063722e653def5aea63f1d55b81954e2f84084cedd3724791eb19`. Neither current LF nor CRLF variants or simple prefixes matched the recorded hash. The originally applied SQL is not recoverable from available Git history, and the precise edit cannot be asserted. The database currently contains nullable `TelegramChannel.publicInviteLinkId` (text) and `CrossPromotionPlan.botPublicationConfirmedAt` (timestamp without time zone), matching current SQL; this does not prove what else the original migration did or that there is no other drift.

Both migrations were applied before their only reachable commit. The `db:deploy:safe` guard checks the baseline checksum, not these historical checksums; a synthetic local rehearsal with their recorded checksums did not block the nine pending migrations. This does not validate the missing SQL or prove actual Neon schema safety. Do not rewrite either historical SQL file or migration records. Recover a trusted deployment artifact / backup of the exact applied SQL if available, and review any missing data changes separately.

## Concurrent pairing regression

The earlier failure database contained a previous unpaired A→B `target-vp` within the seven-day window. In the failing interleaving, B→A post 402 paired with that valid earlier post; the new A→B post 401 therefore remained AD. Pairing takes the workspace-scoped transaction advisory lock, validates a live claim and source bindings, and commits both directional pair writes atomically. The observed result was not a partial read or evidence of failed lock/fencing: the fixture had more than one valid counterpart and the winner depended on transaction order.

The integration fixture now removes only its earlier *unpaired* `target-ad` and `target-vp` promotion evidence after those cases have already been asserted, so the concurrent 401/402 case starts with exactly one eligible opposite post. Existing pair and all original assertions remain. Thirty sequential executions on 30 freshly cloned local migrated PostgreSQL 17 databases: 30 passed, 0 failed; each runs A→B and B→A concurrently and asserts both directional read results, unique pair rows and zero added AI calls. This is bounded local mock evidence, not proof of deployed cross-instance scheduling. Logs are in the temporary directory recorded by `/tmp/lead-p33-repeat-dir`.

Focused lead/Gateway/CRM Copilot suite: 35 passed, 430 tests passed, 5 DB-gated suites skipped in that command. API build and environment-contract tests passed.

## Railway and Neon access

The database explicitly referenced by the local API configuration was read-only queried; it is Neon PostgreSQL 18.6 `neondb`/`public`. That alone does not prove it is the currently deployed Railway datasource. An active `telegram-crm-runtime` lease was observed; its random ownerId was `597c2dc2-d326-4304-89e2-e84ea3a19790` at the time, but there is no mapping to a Railway deployment or process and no independent live-handle confirmation. Lease ownership is transient.

No available Neon or Railway connector, Railway CLI or authorized branch creation mechanism was found. Repository `railway.json` states `pnpm --filter api run db:deploy:safe` as pre-deploy; actual Railway pre-deploy, deployment SHA, datasource, replica count and lease owner instance remain unverified. No branch or dump has been created. A Neon branch/restore could contain production encrypted sessions; creating or copying one must not be treated as allowed by this task and requires an explicit decision on credentials, isolation, sanitization and retention.

## Procedure for a separately approved isolated copy

Prerequisites: an operator confirms actual Railway deployment/environment and database identifiers; an approved protected Neon branch or protected copy is provisioned without moving Telegram sessions outside its authorized boundary, with all API/Telegram workers disabled and outbound Telegram/AI network access blocked. PostgreSQL 18-compatible tooling is required. Record copy provenance and confirm its endpoint is different from production through the provider control plane. A full branch may contain encrypted sessions; do not create one until its treatment is specifically approved. Never start CRM runtime on the copy or decrypt/export sessions. Do not dump the working database without separate authorization.

Use an isolated checkout of the reviewed candidate revision with no inherited `.env`. Set `DATABASE_URL` to the approved copy using its protected environment; do not print it. From `apps/api`, the operations below are on **that copy only**, after explicitly verifying provider branch identity:

```sh
pnpm exec prisma migrate status
pnpm run db:deploy:safe
pnpm exec prisma migrate status
node scripts/prisma-reconcile-baseline.mjs --verify-schema
pnpm run db:deploy:safe
```

Capture the pre/post migration lists, checksums, errors and drift output without connection strings. Before and after migration collect row counts and stable non-secret field checks for the Business workspace, sources, observations, CRM conversations and AI operations/budget buckets. Do not select encrypted sessions, API hashes, message content or personal fields. Check the nine expected migration records, source defaults/trigger definitions, unique indexes and all new FK constraints through PostgreSQL catalogs. Verify 90-day observation identity and no deletion, ledger status and reservation totals, then test the previous application revision against the migrated copy with CRM runtime and AI disabled. Run the 30-run concurrent test in a separate synthetic database, not against the copied data. Do not interpret a successful migration as proof of application compatibility.

Do not authorize production migrations until the protected-copy rehearsal, unresolved second checksum origin, historical backfill decision, actual Railway identity and single-owner handoff have been assessed. Roll back application only after compatibility testing; retain additive schema, ledger reservations and UNKNOWN/durable records. Restoring a database is a separately approved destructive operation and must account for writes since backup.
