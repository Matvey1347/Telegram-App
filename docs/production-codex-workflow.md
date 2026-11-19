# Codex production workflow

Local development continues to use `DATABASE_URL` from `.env` and the Docker
database on `localhost:5433` (`pnpm dev:nexeloq`). The advertising recovery workflow is a
one-shot client of the authenticated production API. It never reads a database
URL, starts NestJS, loads workers, or runs Prisma migrations.

## Production Read

Provide `PRODUCTION_API_URL` (HTTPS production API origin) and
`PRODUCTION_API_TOKEN` through the protected shell environment; do not paste
tokens into commands or chat. Inspect a deal and its placements, publication
state, channel identifiers and Telegram links:

```sh
pnpm production:ads read --sale-id '<deal-id>'
```

The command is GET-only and prints a limited operational summary. It does not
search across arbitrary tables; use the API's existing scoped deal read.

## Production Execute

First preview exactly one placement. The default is dry-run:

```sh
pnpm production:ads recover --sale-id '<deal-id>' --placement-id '<placement-id>'
```

Review the deal, channel, current status and scheduled time. To publish, invoke
the command again with the exact IDs and confirmation phrase:

```sh
pnpm production:ads recover --sale-id '<deal-id>' --placement-id '<placement-id>' \
  --execute --confirm 'PUBLISH SALE <deal-id> PLACEMENT <placement-id>'
```

This makes one call to the existing ad-sale publish endpoint, which delegates
to the canonical managed-post publication service and Telegram integration.
The tool rereads the deal and reports the placement DB status, Telegram message
IDs/URLs and any error. A network error is an uncertain outcome: reread the
deal before any retry. If Telegram publication evidence already exists, the
tool never sends it again. For an acknowledged publication with a stale deal
placement, preview prints a separate `RECONCILE` confirmation. Execution first
verifies the message through Telegram managed-post identity reconciliation,
then syncs the confirmed placement status and deletion deadline in the database.
Partial or uncertain send evidence is blocked for manual investigation.

```sh
pnpm production:ads recover --sale-id '<deal-id>' --placement-id '<placement-id>' \
  --execute --confirm 'RECONCILE SALE <deal-id> PLACEMENT <placement-id>'
```

No database schema changes or production migrations are part of this workflow.
Do not start the ordinary local API with production configuration. Use only the
scoped request-only localhost recovery host below when testing current recovery code. Keep the production
token in the protected environment and rotate/revoke it through the normal
credential process.


## Localhost channel recovery against production

Use this development-only host to test current frontend, rescheduler, publisher,
claims and Prisma orchestration against production without booting AppModule,
cron tasks, bot polling, CRM, migrations or unrelated workers. Normal local
startup must continue using the local database.

```sh
pnpm production:recovery --channel-id '<channel-id>' --workspace-id '<workspace-id>' --env-file '/private/path/.env'
```

The private ignored environment file supplies DATABASE_URL_PRODUCTION,
JWT_SECRET and BOT_TOKEN_ENCRYPTION_KEY plus existing media storage settings.
Do not put their values in commands. The launcher checks channel membership in a
read-only transaction and creates a two-hour owner session in memory. It never
rewrites the ordinary DATABASE_URL file. API4003, web gateway3003 and Next3004
bind loopback; alternate ports use --api-port/--web-port. Open the printed
localhost /__recovery/start URL: credentials never appear in that URL or terminal
output. Private startup logs live in ignored .codex/tmp with mode0600. Close the
tab and stop the command with Ctrl+C after QA; its own child processes stop.
The browser token expires after two hours and is scoped by the local host to the
selected workspace/channel. This is an operator tool for trusted local machines.

Only the selected channel's plan, snapshot and reschedule stream execute
locally. Other authenticated GET requests relay to production for the real UI
read models; all unrelated writes are rejected. The actual existing reschedule
button and its batch contract are used, rather than a substitute test button.

MTProto remains with its cloud session owner: never reuse the cloud StringSession
from a local physical connection or stop the publication runtime to test locally.
A narrow authenticated recovery-transport endpoint resolves credentials in the
cloud and supports queue/history/profile reads and claimed native delete/send.
Only account IDs and rendered post payload cross HTTPS; no Telegram session or
API hash crosses it. The bridge must be deployed once before first use. Local
rescheduler/publisher edits after that require only a local restart, not a deploy.

Each mutation requires the exact live ordinary-post claim and stored schedule,
excludes advertising/VP/batches, and checks stored media/IDs. Server transport is
cancelled by request disconnect, claim expiry or60 seconds. No mutation request
is retried automatically. Lost acknowledgements remain uncertain and retain the
local orchestrator's claim for reconciliation; waiting timeout is not proof of
non-delivery. A positive alternate-admin snapshot can identify exact old native entries for
claimed recreation through the priority account; its omissions never prove the
original sender has no schedule. Native recreation uses a combined transport
operation that prepares existing Telegram media before cancelling old IDs and
persists accepted new IDs before replying. The additive native-recovery table
retains one latest generation per post; unknown outcomes cannot replay.

Runtime cost: explicit button only, no new idle polling, recurring jobs, durable
telemetry or retention table. One HTTPS hop per actual Telegram operation, one
queue read per sender/session and shared bounded publication history. At100
channels work scales with100 explicit operations, not a background fan-out;
unchanged schedules cause no claim/media/write work. Existing cloud connection
pool and Railway service are reused. No new always-on Railway service is added.

Manual QA: record ordinary posts plus ad/VP/batch rows and external native
messages before clicking; open the scoped localhost page, click reschedule,
observe terminal counts/errors, reread DB and Telegram and compare IDs, instants,
content/media plus every protected schedule. Test repeat preservation, missing
schedule repair, partial/ambiguous rejection and lost-response no-replay through
regression tests. Verify deployed version separately before saying the production
button is fixed. Never infer production readiness from mocked tests alone.
