# Prisma baseline rollout

The migration history was squashed into
`000000000000_squashed_migrations` using Prisma 7.8's official production
squashing workflow. Existing application tables and legacy
`_prisma_migrations` rows are intentionally left unchanged. The one-time
transition only records the new baseline with `prisma migrate resolve`.

## Production rollout

1. Freeze schema and migration changes during the rollout.
2. On the release immediately before the squash, run the old safe deployment
   and confirm all 108 legacy migrations are successful. The squash release
   refuses unresolved, missing, or unknown history.
   Production may also contain the historical
   `20260531183000_add_telegram_user_accounts` alias; it has the same checksum
   as its renamed `20260531143000` migration and is accepted but not required.
3. Take and verify a production database backup.
4. Deploy the squash release once with
   `PRISMA_BASELINE_RECONCILE=1 pnpm db:deploy:safe`.
   In Railway, set `PRISMA_BASELINE_RECONCILE=1` for that deployment; the
   repository's pre-deploy command runs the safe migration workflow before the
   new application replica starts.
5. Confirm `prisma migrate status` reports the database is up to date, then
   remove `PRISMA_BASELINE_RECONCILE` from the deployment environment.

If schema verification fails, stop the rollout. Do not bypass the guard or
edit `_prisma_migrations` manually; first reconcile the database to
`schema.prisma` through a reviewed forward repair/hotfix, then retry the
baseline rollout.

The guard script takes an advisory lock, verifies the exact legacy migration
name set, verifies the unsupported partial unique index through PostgreSQL
catalogs, and then invokes the official
`prisma migrate resolve --applied` command. It never runs baseline SQL on an
existing installation and never changes application rows. Once the baseline is
recorded, pending forward migrations are allowed to run before the live schema
is compared with `schema.prisma`; otherwise every legitimate pending migration
would look like drift. `db:deploy:safe` performs that exact schema verification
after `migrate deploy` and fails the deployment if any drift remains.

If the removed `20260813120000_managed_post_inline_buttons` migration is the
only unfinished legacy record, the guard repairs its four nullable columns
idempotently, verifies the complete schema, and marks that exact record
finished before reconciling. This narrow recovery exists because the original
migration directory is no longer present after squashing; any other unfinished
migration remains a hard failure.

Fresh databases do not require the flag: `pnpm db:deploy:safe` detects the
missing migration table and applies the baseline normally.

PostgreSQL truncates identifiers longer than 63 bytes. The Prisma schema maps
all surviving long legacy index and constraint names to their actual stored
names, so both a fresh baseline and a reconciled database expose the same
catalog identifiers. Any supported schema drift is a hard failure.

## Historical data operations

The removed migration chain contained one-time backfills for legacy finance,
advertising, analytics, managed-post, Greeter, and scheduled-task rows. They
are intentionally absent from the fresh baseline: a new empty database has no
legacy rows to transform. Initial application data remains the responsibility
of explicit provisioning/seed code, not migration SQL. Although
`prisma/seed.ts` exists, Prisma 7 currently reports that no seed command is
configured; the baseline therefore does not claim to provision product data.

The baseline manually preserves the partial unique index on
`TelegramManagedPost(workspaceId, telegramChannelId, remoteImportKey) WHERE
remoteImportKey IS NOT NULL`. The audit found no persistent extensions,
functions, triggers, views, materialized views, generated columns, expression
indexes, or specialized index methods in the removed history.
