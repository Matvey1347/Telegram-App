# Codex production workflow

Local development continues to use `DATABASE_URL` from `.env` and the Docker
database on `localhost:5433` (`pnpm dev:nexeloq`). The production workflow is a
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
Do not start the local API with production configuration. Keep the production
token in the protected environment and rotate/revoke it through the normal
credential process.
