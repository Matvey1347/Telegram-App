# Local development database

Nexeloq development uses the Docker PostgreSQL 18 container on `localhost:5433`.
The older `telegram_system_postgres_data` volume is intentionally left in place;
the new container has its own `telegram_system_postgres18_data` volume.

The ignored root `.env` keeps the production connection as
`DATABASE_URL_PRODUCTION`; `DATABASE_URL` points to Docker. Do not copy the
production URL into `DATABASE_URL` for ordinary development. The local web app
shows a `LOCAL DATABASE` badge and uses the local API on port 4000.

To start the database and app:

```sh
pnpm db:up
pnpm dev:nexeloq
```

To deliberately replace the local database with a fresh full production
snapshot, set `ALLOW_PRODUCTION_SNAPSHOT=YES` for the command:

```sh
ALLOW_PRODUCTION_SNAPSHOT=YES pnpm db:snapshot:refresh
```

This uses PostgreSQL 18 `pg_dump`/`pg_restore`, drops/recreates local objects,
and does not write to production. It will replace local-only data. Production
credentials must be stored only in the ignored `.env` file. Never commit that
file or the resulting database contents.

Schema changes are developed against the Docker database and committed as
Prisma migrations. Production migrations run only in Railway's deployment
pre-deploy step (`pnpm db:deploy:safe`); local commands must not target
`DATABASE_URL_PRODUCTION`.

## AI expense synchronization and release gate

Railway cannot read the developer machine's database. Run this **locally** before
releasing changes or replacing the Docker database:

```sh
pnpm ai:sync                 # dry-run; no writes
pnpm ai:sync --execute       # transfer real LOCAL_UNSYNCED receipts
pnpm ai:sync:check           # fails if any unsynced receipt remains
pnpm release:check          # AI check, then existing changed-file checks
pnpm hooks:install          # install on each checkout
```

The installed pre-push hook blocks pushes to main/master/production when the AI
check fails. It is installed in this checkout; Git hooks are not copied by clone.
Server deployment does not perform local synchronization. Credentials stay in
ignored `.env`: DATABASE_URL remains local; DATABASE_URL_PRODUCTION is used only
by the one-shot sync client. Neither API host nor background workers are started.

The same workspace ID is accepted only after verifying workspace name and a
common owner's email. For different IDs, provide AI_SYNC_WORKSPACE_MAP_FILE as a
path to a JSON object mapping local workspace IDs to production workspace IDs;
the same ownership check applies. No workspace, user, channel or settings records
are copied. The existing workspace/operationId unique identity deduplicates the
receipt; production receives a fresh operation row ID.

Production receipt, daily counters and original UTC day/month budget deltas commit
together under the existing workspace AI lock. Only then does the local
transaction move the receipt and its daily source counters to LOCAL_SYNCED.
Failed acknowledgement can be retried. Conflicting receipts fail closed. UNKNOWN
receipts transfer their reserve, not invented spending; local reconciliation
marks them LOCAL_UNSYNCED again, and the next transfer replaces the production
UNKNOWN rollup/reserve with the confirmed receipt. If production already
reconciled it differently, resolve that explicit conflict using provider evidence.

Snapshot now requires a successful read-only AI check. It holds the exclusive
local AI admission lock through restore; new local admissions use a shared lock,
so they cannot start paid requests between the check and replacement. Existing
RUNNING receipts block snapshot. This requires local API processes to use the
updated admission code; stop/restart older dev processes before snapshot.

Local-origin financial receipts and their daily counters/budgets are retained
for durable deduplication instead of being deleted after 90 days. Exact existing
PRODUCTION receipts recognized by sync are pinned against operation expiry.
Generated outputs are not copied. This is an explicit financial retention cost:
at 100 imported receipts/day, up to 36,500 receipts/year plus bounded daily
counters and budget periods; no timer, polling or server process is added.

### Verified real transfer on 2026-11-17

One existing local UNKNOWN receipt was transferred; no synthetic production
expense was created. LOCAL_UNSYNCED count changed 1 → 0. Confirmed production
operation cost stayed $0.063096750000 and daily known cost stayed $1.512826350000;
their historical difference predates this transfer. Workspace DAY budget reserves
changed $0 → $0.010500000000. The next execute transferred zero rows and left all
amounts unchanged; ai:sync:check passed. The unknown charge still needs normal
provider reconciliation; reserve is not represented as actual cost.

Manual QA: run dry-run, execute, repeat execute and check; compare pending counts,
known costs and reserves. Test failed local acknowledgement in isolated local
PostgreSQL schemas. Do not create synthetic production costs and do not refresh
a real local snapshot merely to exercise the guard.
